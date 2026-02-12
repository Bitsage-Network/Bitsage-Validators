#!/bin/bash
# Deploy RentalEscrow Contract
#
# Prerequisites:
# - Starknet Foundry (sncast) installed
# - Account keystore configured in snfoundry.toml
# - SAGE token already deployed
#
# Usage:
#   ./scripts/deploy_escrow.sh [network]
#
# Networks: sepolia, mainnet

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default to sepolia
NETWORK="${1:-sepolia}"

# Load environment variables
ENV_FILE="$PROJECT_DIR/.env.$NETWORK"
if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
else
    log_warn "No $ENV_FILE found. Using defaults."
fi

# Required variables
ADMIN_ADDRESS="${ADMIN_ADDRESS:-}"
SAGE_TOKEN_ADDRESS="${SAGE_TOKEN_ADDRESS:-}"
COORDINATOR_ADDRESS="${COORDINATOR_ADDRESS:-}"
ACCOUNT_NAME="${ACCOUNT_NAME:-bitsage}"

# Validate required inputs
if [[ -z "$ADMIN_ADDRESS" ]]; then
    log_error "ADMIN_ADDRESS not set"
    exit 1
fi

if [[ -z "$SAGE_TOKEN_ADDRESS" ]]; then
    log_error "SAGE_TOKEN_ADDRESS not set"
    exit 1
fi

if [[ -z "$COORDINATOR_ADDRESS" ]]; then
    # Use admin as coordinator if not set
    COORDINATOR_ADDRESS="$ADMIN_ADDRESS"
    log_warn "COORDINATOR_ADDRESS not set, using ADMIN_ADDRESS"
fi

cd "$PROJECT_DIR"

# Build contracts
log_info "Building contracts..."
scarb build

# Declare contract
log_info "Declaring RentalEscrow contract..."
DECLARE_OUTPUT=$(sncast --account "$ACCOUNT_NAME" \
    declare \
    --contract-name RentalEscrow \
    2>&1)

# Extract class hash from output
CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE "0x[a-fA-F0-9]{64}" | head -1)

if [[ -z "$CLASS_HASH" ]]; then
    # Check if already declared
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        log_warn "Contract already declared, extracting existing class hash..."
        CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE "0x[a-fA-F0-9]{64}" | head -1)
    else
        log_error "Failed to declare contract:"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
fi

log_info "Class hash: $CLASS_HASH"

# Deploy contract
log_info "Deploying RentalEscrow..."
DEPLOY_OUTPUT=$(sncast --account "$ACCOUNT_NAME" \
    deploy \
    --class-hash "$CLASS_HASH" \
    --constructor-calldata "$ADMIN_ADDRESS" "$SAGE_TOKEN_ADDRESS" "$COORDINATOR_ADDRESS" \
    2>&1)

# Extract contract address
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "contract_address: 0x[a-fA-F0-9]{64}" | head -1 | cut -d' ' -f2)

if [[ -z "$CONTRACT_ADDRESS" ]]; then
    log_error "Failed to deploy contract:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

log_info "Contract deployed!"
echo ""
echo "============================================"
echo "RentalEscrow Deployment Summary"
echo "============================================"
echo "Network:          $NETWORK"
echo "Class Hash:       $CLASS_HASH"
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Admin:            $ADMIN_ADDRESS"
echo "SAGE Token:       $SAGE_TOKEN_ADDRESS"
echo "Coordinator:      $COORDINATOR_ADDRESS"
echo "============================================"
echo ""

# Save deployment info
DEPLOYMENTS_FILE="$PROJECT_DIR/deployments.$NETWORK.json"
cat > "$DEPLOYMENTS_FILE" << EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "contracts": {
    "RentalEscrow": {
      "class_hash": "$CLASS_HASH",
      "address": "$CONTRACT_ADDRESS",
      "constructor_args": {
        "admin": "$ADMIN_ADDRESS",
        "sage_token": "$SAGE_TOKEN_ADDRESS",
        "coordinator": "$COORDINATOR_ADDRESS"
      }
    }
  }
}
EOF

log_info "Deployment info saved to $DEPLOYMENTS_FILE"

# Verify deployment
log_info "Verifying deployment..."
sncast --account "$ACCOUNT_NAME" \
    call \
    --contract-address "$CONTRACT_ADDRESS" \
    --function "get_version" \
    2>&1 || log_warn "Verification call failed (may need RPC sync)"

echo ""
log_info "Deployment complete!"
