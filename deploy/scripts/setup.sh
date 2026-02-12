#!/bin/bash
# BitSage Validator Node Setup Script
# Initializes the environment for running a validator node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DEPLOY_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║             BitSage Validator Node Setup                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    # Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        echo "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker installed${NC}"

    # Docker Compose
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker Compose installed${NC}"

    # NVIDIA Docker Runtime (optional)
    if docker info 2>/dev/null | grep -q "nvidia"; then
        echo -e "${GREEN}✓ NVIDIA Container Runtime available${NC}"
        GPU_AVAILABLE=true
    else
        echo -e "${YELLOW}⚠ NVIDIA Container Runtime not found${NC}"
        echo "  GPU acceleration will not be available"
        GPU_AVAILABLE=false
    fi

    echo ""
}

# Detect hardware
detect_hardware() {
    echo -e "${YELLOW}Detecting hardware...${NC}"

    # CPU
    if [[ "$OSTYPE" == "darwin"* ]]; then
        CPU_INFO=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
        CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "Unknown")
    else
        CPU_INFO=$(cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2 | xargs || echo "Unknown")
        CORES=$(nproc 2>/dev/null || echo "Unknown")
    fi
    echo -e "${GREEN}✓ CPU: ${CPU_INFO} (${CORES} cores)${NC}"

    # Memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        MEM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024 ))
    else
        MEM_GB=$(free -g | awk '/^Mem:/{print $2}')
    fi
    echo -e "${GREEN}✓ Memory: ${MEM_GB}GB${NC}"

    # GPU
    if command -v nvidia-smi &> /dev/null; then
        GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "Unknown")
        echo -e "${GREEN}✓ GPU: ${GPU_INFO}${NC}"
        GPU_DETECTED=true
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        GPU_INFO=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1 | cut -d: -f2 | xargs || echo "Unknown")
        echo -e "${GREEN}✓ GPU: ${GPU_INFO} (Metal)${NC}"
        GPU_DETECTED=true
    else
        echo -e "${YELLOW}⚠ No GPU detected${NC}"
        GPU_DETECTED=false
    fi

    echo ""
}

# Setup environment
setup_environment() {
    echo -e "${YELLOW}Setting up environment...${NC}"

    ENV_FILE="$DEPLOY_DIR/.env"

    if [ -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}⚠ .env file already exists${NC}"
        read -p "Overwrite? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Keeping existing .env file"
            return
        fi
    fi

    cp "$DEPLOY_DIR/.env.template" "$ENV_FILE"

    # Prompt for required values
    echo ""
    echo -e "${BLUE}Enter your validator configuration:${NC}"
    echo ""

    read -p "Validator Address (0x...): " VALIDATOR_ADDRESS
    read -sp "Validator Private Key: " VALIDATOR_PRIVATE_KEY
    echo ""

    # Update .env file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^VALIDATOR_ADDRESS=.*/VALIDATOR_ADDRESS=$VALIDATOR_ADDRESS/" "$ENV_FILE"
        sed -i '' "s/^VALIDATOR_PRIVATE_KEY=.*/VALIDATOR_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY/" "$ENV_FILE"
    else
        sed -i "s/^VALIDATOR_ADDRESS=.*/VALIDATOR_ADDRESS=$VALIDATOR_ADDRESS/" "$ENV_FILE"
        sed -i "s/^VALIDATOR_PRIVATE_KEY=.*/VALIDATOR_PRIVATE_KEY=$VALIDATOR_PRIVATE_KEY/" "$ENV_FILE"
    fi

    echo -e "${GREEN}✓ Environment configured${NC}"
    echo ""
}

# Create config directory
setup_config() {
    echo -e "${YELLOW}Creating configuration files...${NC}"

    CONFIG_DIR="$DEPLOY_DIR/config"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$CONFIG_DIR/grafana/provisioning/datasources"
    mkdir -p "$CONFIG_DIR/grafana/provisioning/dashboards"

    # Prometheus config
    cat > "$CONFIG_DIR/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'coordinator'
    static_configs:
      - targets: ['coordinator:3030']
    metrics_path: /metrics

  - job_name: 'gpu-worker'
    static_configs:
      - targets: ['gpu-worker:3040']
    metrics_path: /metrics
EOF

    # Grafana datasource
    cat > "$CONFIG_DIR/grafana/provisioning/datasources/prometheus.yml" << 'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

    echo -e "${GREEN}✓ Configuration files created${NC}"
    echo ""
}

# Build images
build_images() {
    echo -e "${YELLOW}Building Docker images...${NC}"
    echo "This may take several minutes..."
    echo ""

    cd "$DEPLOY_DIR"

    # Build coordinator
    echo -e "${BLUE}Building coordinator...${NC}"
    docker compose build coordinator

    # Build dashboard
    echo -e "${BLUE}Building dashboard...${NC}"
    docker compose build dashboard

    # Build GPU worker if GPU available
    if [ "$GPU_AVAILABLE" = true ]; then
        echo -e "${BLUE}Building GPU worker...${NC}"
        docker compose build gpu-worker
    fi

    echo -e "${GREEN}✓ Images built successfully${NC}"
    echo ""
}

# Summary
print_summary() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Setup Complete!                           ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "  1. Review your configuration:"
    echo "     ${BLUE}cat $DEPLOY_DIR/.env${NC}"
    echo ""
    echo "  2. Start the validator node:"
    echo "     ${BLUE}$SCRIPT_DIR/start.sh${NC}"
    echo ""
    echo "  3. Check status:"
    echo "     ${BLUE}$SCRIPT_DIR/health-check.sh${NC}"
    echo ""
    echo "  4. View dashboard:"
    echo "     ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo "  5. For monitoring (optional):"
    echo "     ${BLUE}docker compose --profile monitoring up -d${NC}"
    echo ""
}

# Main
main() {
    check_prerequisites
    detect_hardware
    setup_environment
    setup_config
    build_images
    print_summary
}

main "$@"
