#!/bin/bash
# Upgrade RentalEscrow Contract
#
# This script upgrades an existing RentalEscrow deployment to a new version.
#
# Prerequisites:
# - Starknet Foundry (sncast) installed
# - Admin account keystore configured
# - Existing deployment
#
# Usage:
#   ./scripts/upgrade_escrow.sh [network]
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

cd "$PROJECT_DIR"

# Load deployment info
DEPLOYMENTS_FILE="$PROJECT_DIR/deployments.$NETWORK.json"
if [[ ! -f "$DEPLOYMENTS_FILE" ]]; then
    log_error "No deployment found at $DEPLOYMENTS_FILE"
    log_error "Run deploy_escrow.sh first"
    exit 1
fi

# Extract current contract address
CONTRACT_ADDRESS=$(cat "$DEPLOYMENTS_FILE" | grep -oE '"address": "0x[a-fA-F0-9]{64}"' | head -1 | cut -d'"' -f4)
OLD_CLASS_HASH=$(cat "$DEPLOYMENTS_FILE" | grep -oE '"class_hash": "0x[a-fA-F0-9]{64}"' | head -1 | cut -d'"' -f4)

if [[ -z "$CONTRACT_ADDRESS" ]]; then
    log_error "Could not find contract address in deployment file"
    exit 1
fi

log_info "Upgrading RentalEscrow at $CONTRACT_ADDRESS"
log_info "Current class hash: $OLD_CLASS_HASH"

# Load environment variables
ENV_FILE="$PROJECT_DIR/.env.$NETWORK"
if [[ -f "$ENV_FILE" ]]; then
    source "$ENV_FILE"
fi

ACCOUNT_NAME="${ACCOUNT_NAME:-bitsage}"

# Build contracts
log_info "Building contracts..."
scarb build

# Declare new contract version
log_info "Declaring new RentalEscrow contract..."
DECLARE_OUTPUT=$(sncast --account "$ACCOUNT_NAME" \
    declare \
    --contract-name RentalEscrow \
    2>&1)

# Extract class hash
NEW_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE "0x[a-fA-F0-9]{64}" | head -1)

if [[ -z "$NEW_CLASS_HASH" ]]; then
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        log_warn "New version already declared"
        NEW_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE "0x[a-fA-F0-9]{64}" | head -1)
    else
        log_error "Failed to declare contract:"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
fi

if [[ "$NEW_CLASS_HASH" == "$OLD_CLASS_HASH" ]]; then
    log_warn "New class hash is the same as current. No upgrade needed."
    exit 0
fi

log_info "New class hash: $NEW_CLASS_HASH"

# Get current version before upgrade
log_info "Current contract version:"
sncast --account "$ACCOUNT_NAME" \
    call \
    --contract-address "$CONTRACT_ADDRESS" \
    --function "get_version" \
    2>&1 || true

# Confirm upgrade
echo ""
read -p "Proceed with upgrade? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Upgrade cancelled"
    exit 0
fi

# Execute upgrade
log_info "Executing upgrade..."
UPGRADE_OUTPUT=$(sncast --account "$ACCOUNT_NAME" \
    invoke \
    --contract-address "$CONTRACT_ADDRESS" \
    --function "upgrade" \
    --calldata "$NEW_CLASS_HASH" \
    2>&1)

TX_HASH=$(echo "$UPGRADE_OUTPUT" | grep -oE "transaction_hash: 0x[a-fA-F0-9]{64}" | cut -d' ' -f2)

if [[ -z "$TX_HASH" ]]; then
    log_error "Upgrade transaction failed:"
    echo "$UPGRADE_OUTPUT"
    exit 1
fi

log_info "Upgrade transaction submitted: $TX_HASH"

# Wait for transaction
log_info "Waiting for transaction confirmation..."
sleep 5

# Verify new version
log_info "Verifying upgrade..."
sncast --account "$ACCOUNT_NAME" \
    call \
    --contract-address "$CONTRACT_ADDRESS" \
    --function "get_version" \
    2>&1 || log_warn "Verification call failed"

# Update deployment file
log_info "Updating deployment file..."
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$DEPLOYMENTS_FILE" << EOF
{
  "network": "$NETWORK",
  "timestamp": "$TIMESTAMP",
  "contracts": {
    "RentalEscrow": {
      "class_hash": "$NEW_CLASS_HASH",
      "address": "$CONTRACT_ADDRESS",
      "previous_class_hash": "$OLD_CLASS_HASH",
      "upgrade_tx": "$TX_HASH"
    }
  }
}
EOF

echo ""
echo "============================================"
echo "RentalEscrow Upgrade Summary"
echo "============================================"
echo "Network:           $NETWORK"
echo "Contract Address:  $CONTRACT_ADDRESS"
echo "Old Class Hash:    $OLD_CLASS_HASH"
echo "New Class Hash:    $NEW_CLASS_HASH"
echo "Transaction:       $TX_HASH"
echo "============================================"
echo ""
log_info "Upgrade complete!"
