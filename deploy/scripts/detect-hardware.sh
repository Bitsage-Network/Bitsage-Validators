#!/bin/bash
# BitSage Hardware Detection Script
# Detects GPU and TEE capabilities for validator configuration

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              BitSage Hardware Detection                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Output format
OUTPUT_JSON=false
if [[ "$1" == "--json" ]]; then
    OUTPUT_JSON=true
fi

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

# Detect CPU
detect_cpu() {
    local os=$(detect_os)

    if [[ "$os" == "macos" ]]; then
        local brand=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Unknown")
        local cores=$(sysctl -n hw.ncpu 2>/dev/null || echo "0")
    else
        local brand=$(cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2 | xargs || echo "Unknown")
        local cores=$(nproc 2>/dev/null || echo "0")
    fi

    echo "$brand|$cores"
}

# Detect Memory
detect_memory() {
    local os=$(detect_os)

    if [[ "$os" == "macos" ]]; then
        local mem_bytes=$(sysctl -n hw.memsize 2>/dev/null || echo "0")
        local mem_gb=$((mem_bytes / 1024 / 1024 / 1024))
    else
        local mem_gb=$(free -g | awk '/^Mem:/{print $2}')
    fi

    echo "$mem_gb"
}

# Detect NVIDIA GPU
detect_nvidia_gpu() {
    if ! command -v nvidia-smi &> /dev/null; then
        echo ""
        return
    fi

    local gpu_info=$(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null || echo "")
    echo "$gpu_info"
}

# Detect AMD GPU
detect_amd_gpu() {
    if ! command -v rocm-smi &> /dev/null; then
        echo ""
        return
    fi

    local gpu_info=$(rocm-smi --showproductname 2>/dev/null || echo "")
    echo "$gpu_info"
}

# Detect Apple Silicon GPU
detect_apple_gpu() {
    local os=$(detect_os)

    if [[ "$os" != "macos" ]]; then
        echo ""
        return
    fi

    local chip=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip:" | head -1 | cut -d: -f2 | xargs || echo "")

    if [[ "$chip" == *"Apple"* ]]; then
        # Get unified memory as approximate GPU VRAM
        local mem_gb=$(detect_memory)
        echo "$chip|$mem_gb"
    else
        echo ""
    fi
}

# Determine GPU tier based on VRAM
determine_tier() {
    local vram_gb=$1

    if (( vram_gb >= 48 )); then
        echo "4|Enterprise"
    elif (( vram_gb >= 24 )); then
        echo "3|Datacenter"
    elif (( vram_gb >= 12 )); then
        echo "2|Professional"
    elif (( vram_gb >= 8 )); then
        echo "1|Prosumer"
    else
        echo "0|Consumer"
    fi
}

# Detect TEE support
detect_tee() {
    local tee_type=""

    # Intel SGX
    if [ -e /dev/sgx_enclave ] || [ -e /dev/isgx ]; then
        tee_type="SGX"
    fi

    # Intel TDX
    if [ -e /sys/module/kvm_intel/parameters/tdx ]; then
        if [ "$(cat /sys/module/kvm_intel/parameters/tdx 2>/dev/null)" == "Y" ]; then
            tee_type="${tee_type:+$tee_type,}TDX"
        fi
    fi

    # AMD SEV
    if [ -e /sys/module/ccp ]; then
        if dmesg 2>/dev/null | grep -qi "SEV supported"; then
            tee_type="${tee_type:+$tee_type,}SEV"
        fi
    fi

    echo "$tee_type"
}

# Main detection
main() {
    local os=$(detect_os)
    local cpu_info=$(detect_cpu)
    local cpu_brand=$(echo "$cpu_info" | cut -d'|' -f1)
    local cpu_cores=$(echo "$cpu_info" | cut -d'|' -f2)
    local memory_gb=$(detect_memory)

    # Detect GPU
    local gpu_type=""
    local gpu_name=""
    local gpu_vram=0
    local gpu_driver=""

    local nvidia=$(detect_nvidia_gpu)
    if [ -n "$nvidia" ]; then
        gpu_type="CUDA"
        gpu_name=$(echo "$nvidia" | cut -d',' -f1 | xargs)
        gpu_vram=$(echo "$nvidia" | cut -d',' -f2 | grep -oE '[0-9]+' | head -1)
        gpu_vram=$((gpu_vram / 1024))  # Convert MB to GB
        gpu_driver=$(echo "$nvidia" | cut -d',' -f3 | xargs)
    else
        local apple=$(detect_apple_gpu)
        if [ -n "$apple" ]; then
            gpu_type="Metal"
            gpu_name=$(echo "$apple" | cut -d'|' -f1)
            gpu_vram=$(echo "$apple" | cut -d'|' -f2)
        fi
    fi

    # Determine tier
    local tier_info=$(determine_tier "${gpu_vram:-0}")
    local tier_num=$(echo "$tier_info" | cut -d'|' -f1)
    local tier_name=$(echo "$tier_info" | cut -d'|' -f2)

    # Detect TEE
    local tee=$(detect_tee)

    if $OUTPUT_JSON; then
        cat << EOF
{
  "os": "$os",
  "cpu": {
    "brand": "$cpu_brand",
    "cores": $cpu_cores
  },
  "memory_gb": $memory_gb,
  "gpu": {
    "detected": $([ -n "$gpu_type" ] && echo "true" || echo "false"),
    "type": "$gpu_type",
    "name": "$gpu_name",
    "vram_gb": ${gpu_vram:-0},
    "driver": "$gpu_driver",
    "tier": $tier_num,
    "tier_name": "$tier_name"
  },
  "tee": {
    "available": $([ -n "$tee" ] && echo "true" || echo "false"),
    "types": "$tee"
  }
}
EOF
    else
        echo -e "${YELLOW}System Information:${NC}"
        echo "  OS: $os"
        echo "  CPU: $cpu_brand ($cpu_cores cores)"
        echo "  Memory: ${memory_gb}GB"
        echo ""

        echo -e "${YELLOW}GPU Information:${NC}"
        if [ -n "$gpu_type" ]; then
            echo -e "  ${GREEN}✓ GPU Detected${NC}"
            echo "  Type: $gpu_type"
            echo "  Name: $gpu_name"
            echo "  VRAM: ${gpu_vram}GB"
            [ -n "$gpu_driver" ] && echo "  Driver: $gpu_driver"
            echo "  Tier: $tier_num ($tier_name)"
        else
            echo -e "  ${YELLOW}⚠ No GPU detected${NC}"
        fi
        echo ""

        echo -e "${YELLOW}TEE Information:${NC}"
        if [ -n "$tee" ]; then
            echo -e "  ${GREEN}✓ TEE Available: $tee${NC}"
        else
            echo -e "  ${YELLOW}⚠ No TEE support detected${NC}"
        fi
        echo ""

        echo -e "${BLUE}Recommended Configuration:${NC}"
        echo "  GPU_TIER=$tier_num"
        echo "  GPU_VRAM=${gpu_vram:-0}"
        echo "  GPU_TYPE=${gpu_type:-CPU}"
        [ -n "$tee" ] && echo "  TEE_TYPE=$tee"
    fi
}

main "$@"
