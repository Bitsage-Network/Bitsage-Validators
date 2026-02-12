#!/bin/bash
# BitSage Validator Node Start Script
# Starts all validator services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Starting BitSage Validator Node                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check .env exists
if [ ! -f "$DEPLOY_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Run ./scripts/setup.sh first"
    exit 1
fi

# Load environment
set -a
source "$DEPLOY_DIR/.env"
set +a

# Parse arguments
PROFILE=""
DETACHED="-d"
SERVICES=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --monitoring)
            PROFILE="--profile monitoring"
            shift
            ;;
        --foreground|-f)
            DETACHED=""
            shift
            ;;
        --no-gpu)
            SERVICES="coordinator dashboard"
            shift
            ;;
        *)
            SERVICES="$SERVICES $1"
            shift
            ;;
    esac
done

cd "$DEPLOY_DIR"

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker compose $PROFILE up $DETACHED $SERVICES

if [ -n "$DETACHED" ]; then
    echo ""
    echo -e "${GREEN}Services started in background${NC}"
    echo ""
    echo "View logs: docker compose logs -f"
    echo "Stop:      ./scripts/stop.sh"
    echo "Status:    ./scripts/health-check.sh"
    echo ""
    echo "Dashboard: http://localhost:${DASHBOARD_PORT:-3000}"
    echo "API:       http://localhost:${COORDINATOR_PORT:-3030}"
fi
