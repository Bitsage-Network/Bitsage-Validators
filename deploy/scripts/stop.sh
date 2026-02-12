#!/bin/bash
# BitSage Validator Node Stop Script
# Stops all validator services

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
echo "║              Stopping BitSage Validator Node                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

cd "$DEPLOY_DIR"

# Parse arguments
REMOVE_VOLUMES=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --volumes|-v)
            REMOVE_VOLUMES="-v"
            echo -e "${YELLOW}Warning: This will remove all data volumes${NC}"
            read -p "Are you sure? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Aborted"
                exit 0
            fi
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Stop all services
echo -e "${YELLOW}Stopping services...${NC}"
docker compose --profile monitoring down $REMOVE_VOLUMES

echo ""
echo -e "${GREEN}All services stopped${NC}"
