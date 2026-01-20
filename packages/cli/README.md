# BitSage CLI

Command-line interface for managing BitSage validator nodes.

## Installation

```bash
# From the CLI package directory
npm install
npm run build

# Link globally (optional)
npm link

# Or run directly
npx bitsage <command>
```

## Commands

### Setup

```bash
# Interactive setup wizard
bitsage init

# Setup with specific network
bitsage init --network sepolia
```

### Faucet (Testnet Only)

```bash
# Claim testnet SAGE tokens
bitsage faucet
```

### Registration

```bash
# Register as validator with default settings
bitsage register

# Register with custom stake and commission
bitsage register --stake 2000 --commission 300
```

### Stake Management

```bash
# View stake info
bitsage stake info

# Add stake
bitsage stake add 500

# Remove stake
bitsage stake remove 200
```

### Services

```bash
# Start all services
bitsage start

# Start without GPU worker
bitsage start --no-gpu

# Start with monitoring (Prometheus + Grafana)
bitsage start --monitoring

# Start in foreground (see logs)
bitsage start --foreground

# Stop all services
bitsage stop

# Stop and remove data volumes
bitsage stop --volumes
```

### Status & Health

```bash
# Show node status
bitsage status

# Status as JSON
bitsage status --json

# Health check
bitsage health

# Verbose health check
bitsage health --verbose
```

### GPU Management

```bash
# Detect GPU
bitsage gpu detect

# Detect GPU (JSON output)
bitsage gpu detect --json

# Manually set GPU configuration
bitsage gpu set --tier 3 --vram 24 --type cuda
```

### Logs

```bash
# View all logs
bitsage logs

# Follow logs
bitsage logs -f

# View specific service
bitsage logs coordinator
bitsage logs gpu-worker
bitsage logs dashboard
```

## Configuration

The CLI stores configuration in `~/.bitsage/config.yaml`:

```yaml
network: sepolia
rpcUrl: https://starknet-sepolia.public.blastapi.io
wsUrl: wss://starknet-sepolia.public.blastapi.io

wallet:
  address: "0x..."
  keystorePath: ~/.bitsage/keystore.json

validator:
  operatorAddress: "0x..."
  commissionBps: 500
  attestationHash: "0"

gpu:
  autoDetect: true
  tier: 3
  vramGb: 24
  type: cuda
  devices: ["0"]

tee:
  enabled: false
  type: null

services:
  coordinator:
    port: 3030
    workers: 4
  dashboard:
    port: 3000
    enabled: true
```

## Environment Variables

Set `VALIDATOR_PRIVATE_KEY` to skip interactive prompts:

```bash
export VALIDATOR_PRIVATE_KEY=0x...
bitsage register
```

## GPU Tiers

| Tier | Name         | VRAM     | Example GPUs           |
|------|--------------|----------|------------------------|
| 0    | Consumer     | 4-8GB    | GTX 1070, RTX 2060     |
| 1    | Prosumer     | 8-12GB   | RTX 3070, RTX 3080     |
| 2    | Professional | 12-24GB  | RTX 3090, RTX 4090     |
| 3    | Datacenter   | 24-48GB  | A100, L40              |
| 4    | Enterprise   | 48GB+    | H100, Multi-GPU        |

## Quick Start

```bash
# 1. Initialize
bitsage init

# 2. Claim testnet tokens
bitsage faucet

# 3. Register as validator
bitsage register

# 4. Start services
bitsage start

# 5. Check status
bitsage status
```

## Development

```bash
# Run in development mode
npm run dev -- <command>

# Build
npm run build

# Clean
npm run clean
```
