#!/bin/bash
# BitSage Validator Node Health Check
# Verifies all services are running correctly

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              BitSage Validator Health Check                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Load environment
if [ -f "$DEPLOY_DIR/.env" ]; then
    set -a
    source "$DEPLOY_DIR/.env"
    set +a
fi

COORDINATOR_PORT=${COORDINATOR_PORT:-3030}
DASHBOARD_PORT=${DASHBOARD_PORT:-3000}

cd "$DEPLOY_DIR"

# Check Docker containers
echo -e "${YELLOW}Docker Containers:${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Check coordinator health
echo -e "${YELLOW}Coordinator Health:${NC}"
if curl -sf "http://localhost:$COORDINATOR_PORT/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Coordinator is healthy${NC}"

    # Get capabilities
    echo ""
    echo -e "${BLUE}Prover Capabilities:${NC}"
    curl -s "http://localhost:$COORDINATOR_PORT/api/v1/prover/capabilities" | python3 -m json.tool 2>/dev/null || echo "Unable to parse capabilities"
else
    echo -e "${RED}✗ Coordinator is not responding${NC}"
fi
echo ""

# Check dashboard
echo -e "${YELLOW}Dashboard Health:${NC}"
if curl -sf "http://localhost:$DASHBOARD_PORT" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dashboard is healthy${NC}"
else
    echo -e "${RED}✗ Dashboard is not responding${NC}"
fi
echo ""

# Check GPU worker
echo -e "${YELLOW}GPU Worker Health:${NC}"
GPU_STATUS=$(docker compose ps gpu-worker --format "{{.Status}}" 2>/dev/null || echo "")
if [[ "$GPU_STATUS" == *"Up"* ]]; then
    echo -e "${GREEN}✓ GPU Worker is running${NC}"

    # Get GPU info
    docker exec bitsage-gpu-worker nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || true
else
    echo -e "${YELLOW}⚠ GPU Worker is not running${NC}"
fi
echo ""

# Network stats
echo -e "${YELLOW}Network Stats:${NC}"
STATS=$(curl -s "http://localhost:$COORDINATOR_PORT/api/v1/workers/stats" 2>/dev/null)
if [ -n "$STATS" ]; then
    echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
else
    echo "Unable to fetch network stats"
fi
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Dashboard: http://localhost:$DASHBOARD_PORT"
echo "API:       http://localhost:$COORDINATOR_PORT"
echo "WebSocket: ws://localhost:$COORDINATOR_PORT/ws/prover"
echo ""
