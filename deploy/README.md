# BitSage Validator Node Deployment

Complete deployment package for running GPU/TEE validator nodes on the BitSage network with privacy-preserving proof generation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BitSage Validator Node Stack                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        Docker Compose Stack                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │ │
│  │  │  coordinator │  │  gpu-worker  │  │  tee-worker  │  │  dashboard │  │ │
│  │  │  (Rust node) │  │ (STWO/CUDA)  │  │ (SGX/TDX)    │  │  (Next.js) │  │ │
│  │  │  Port: 3030  │  │  GPU proofs  │  │ Privacy TEE  │  │  Port:3000 │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────────┘  │ │
│  │         │                 │                 │                          │ │
│  │         │    WebSocket Job Distribution     │                          │ │
│  │         └─────────────────┼─────────────────┘                          │ │
│  │                           │                                            │ │
│  │  ┌────────────────────────┴────────────────────────────────────────┐   │ │
│  │  │                      Shared Volumes                              │   │ │
│  │  │  /data/proofs  │  /data/circuits  │  /data/attestations         │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│  ┌─────────────────────────────────┼──────────────────────────────────────┐ │
│  │                         Starknet (Sepolia)                              │ │
│  │  VALIDATOR_REGISTRY │ JOB_MANAGER │ SAGE_TOKEN │ PRIVACY_POOLS         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### STWO GPU Prover
- CUDA/Metal accelerated proof generation
- NTT, FRI, and Merkle tree acceleration
- Batch proof processing for throughput
- Support for RTX 3090, RTX 4090, A100, H100

### TEE Privacy Proofs
- Intel TDX (H100 native Confidential Computing)
- Intel SGX (Software Guard Extensions)
- AMD SEV-SNP (Secure Encrypted Virtualization)
- Hardware attestation with cryptographic proofs

### Privacy Pools
- Private deposits and withdrawals
- Confidential token swaps
- Association Set Providers (ASP) for compliance
- Zero-knowledge Merkle membership proofs

## Prerequisites

### Required
- Docker 24.0+
- Docker Compose 2.20+
- 16GB+ RAM
- 100GB+ SSD storage

### For GPU Workers (CUDA)
- NVIDIA GPU with 8GB+ VRAM
- NVIDIA Driver 525.0+
- NVIDIA Container Toolkit
- Supported: RTX 3090, RTX 4090, A100, H100

### For GPU Workers (Metal)
- macOS 13.0+ (Ventura)
- Apple Silicon (M1/M2/M3) or AMD GPU

### For TEE Workers
- Intel TDX: H100 with TDX enabled, Intel 4th/5th Gen Xeon
- Intel SGX: 6th Gen Intel Core or later with SGX enabled
- AMD SEV: EPYC 7xx3 or later with SEV-SNP enabled

## Quick Start

### 1. Clone and Setup

```bash
cd deploy
./scripts/setup.sh
```

The setup wizard will:
- Check prerequisites
- Detect your GPU/TEE hardware
- Configure environment variables
- Build Docker images

### 2. Configure Wallet

Edit `.env` with your validator credentials:

```bash
VALIDATOR_ADDRESS=0x...    # Your Starknet wallet address
VALIDATOR_PRIVATE_KEY=...  # Private key (keep secure!)
```

### 3. Start Services

```bash
# Start GPU worker (default)
./scripts/start.sh

# Start with TEE worker (for H100/TDX)
./scripts/start.sh --tee

# Start everything (GPU + TEE + monitoring)
./scripts/start.sh --full
```

### 4. Verify Health

```bash
./scripts/health-check.sh
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| coordinator | 3030 | Proof routing and worker orchestration |
| gpu-worker | 3040 | STWO CUDA-accelerated prover |
| tee-worker | 3041 | Privacy proofs with TEE attestation |
| dashboard | 3000 | Web UI for validator management |
| prometheus | 9090 | Metrics collection (optional) |
| grafana | 3001 | Metrics visualization (optional) |

## Docker Compose Profiles

```bash
# Core services only (coordinator + gpu-worker + dashboard)
docker compose up -d

# Include TEE worker
docker compose --profile tee up -d

# Include second GPU worker (multi-GPU)
docker compose --profile multi-gpu up -d

# Include monitoring stack
docker compose --profile monitoring up -d

# Full stack (all profiles)
docker compose --profile tee --profile monitoring up -d
```

## GPU Worker

The GPU worker uses STWO with CUDA acceleration for proof generation.

### Proof Types Handled
| Circuit | Description | Avg Time |
|---------|-------------|----------|
| AiInference | AI/ML inference verification | ~5s |
| DataPipeline | Data transformation proofs | ~4s |
| MlTraining | ML training verification | ~15s |
| GenericCompute | General computation proofs | ~3s |

### Configuration

```bash
# GPU Worker settings in .env
GPU_WORKER_ID=gpu-worker-1
GPU_MAX_JOBS=4                    # Concurrent jobs
CUDA_VISIBLE_DEVICES=all          # GPU indices (0,1 for specific GPUs)
GPU_MEMORY_FRACTION=0.9           # VRAM usage (0.0-1.0)
MAX_BATCH_SIZE=1024               # Proof batch size
GPU_BACKEND=cuda                  # cuda, metal, or cpu
```

### Worker Registration Flow

1. Worker starts and connects to coordinator
2. Sends registration request with GPU capabilities
3. Coordinator assigns worker ID and WebSocket URL
4. Worker sends periodic heartbeats (30s interval)
5. Coordinator pushes jobs via WebSocket
6. Worker generates STWO proofs and submits results

## TEE Worker

The TEE worker handles privacy-preserving proofs inside a Trusted Execution Environment.

### Proof Types Handled
| Circuit | Description | Requires TEE |
|---------|-------------|--------------|
| PrivacyWithdraw | Private pool withdrawals | Yes |
| PrivacyTransfer | Confidential transfers | Yes |
| ConfidentialSwap | Private token swaps | Yes |

### TEE Types

| Type | Hardware | Detection |
|------|----------|-----------|
| TDX | H100, Intel 4th/5th Gen Xeon | `/dev/tdx_guest` |
| SGX | Intel 6th Gen+ with SGX | `/dev/sgx_enclave` |
| SEV | AMD EPYC with SEV-SNP | `/sys/module/ccp` |
| Simulated | Any (development only) | Fallback |

### Configuration

```bash
# TEE Worker settings in .env
TEE_WORKER_ID=tee-worker-1
TEE_MAX_JOBS=2                    # Concurrent jobs (TEE is slower)
TEE_TYPE=                         # tdx, sgx, sev, or empty for auto-detect
ATTESTATION_REFRESH=300           # Attestation refresh interval (seconds)
```

### TEE Security Features

1. **Encrypted Witness**: Private inputs encrypted with enclave public key
2. **Hardware Attestation**: TDX/SGX/SEV quote proving enclave identity
3. **Sealed Keys**: Enclave keys bound to hardware and measurement
4. **Memory Encryption**: All enclave memory encrypted by hardware

## Privacy Pools

Privacy pools enable confidential transactions on BitSage.

### Configuration

```bash
# Privacy contract addresses in .env
PRIVACY_POOLS_ADDRESS=0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7
PRIVACY_ROUTER_ADDRESS=0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53
CONFIDENTIAL_SWAP_ADDRESS=0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af
```

### CLI Commands

```bash
# Deposit into privacy pool
bitsage privacy deposit 100 --pool <address>

# Withdraw from privacy pool (generates TEE proof)
bitsage privacy withdraw 50 --recipient <address>

# Check private balance
bitsage privacy balance

# List your privacy notes
bitsage privacy notes

# Confidential swap
bitsage privacy swap ETH SAGE 1.5 --slippage 50
```

## Coordinator API

### Worker Registration Endpoints

```bash
# Register GPU worker
POST /api/v1/workers/gpu/register
{
  "worker_id": "gpu-worker-1",
  "address": "http://worker:3040",
  "gpu_backend": "cuda",
  "capacity": 4,
  "gpu_model": "RTX 4090",
  "vram_gb": 24
}

# Register TEE worker
POST /api/v1/workers/tee/register
{
  "worker_id": "tee-worker-1",
  "address": "http://worker:3041",
  "tee_type": "tdx",
  "measurement": "0x...",
  "attestation_quote": "0x...",
  "enclave_pub_key": "0x..."
}

# Worker heartbeat
POST /api/v1/workers/heartbeat
{
  "worker_id": "gpu-worker-1",
  "worker_type": "gpu",
  "current_load": 2,
  "is_healthy": true,
  "metrics": { ... }
}

# Submit job result
POST /api/v1/workers/job/:job_id/result
{
  "worker_id": "gpu-worker-1",
  "circuit": "ai_inference",
  "success": true,
  "proof": { ... },
  "generation_time_ms": 4500
}
```

### Proof Submission Endpoints

```bash
# Submit GPU proof request
POST /api/v1/prover/prove
{
  "request_id": "uuid",
  "circuit": "ai_inference",
  "mode": "worker_gpu",
  "witness": { ... },
  "deadline": 1704067200
}

# Submit TEE proof request
POST /api/v1/tee/prove
{
  "circuit": "privacy_withdraw",
  "encrypted_witness": {
    "ciphertext": "0x...",
    "iv": "0x...",
    "ephemeral_pub_key": "0x...",
    "enclave_pub_key": "0x...",
    "public_inputs": { ... }
  },
  "deadline": 1704067200
}

# Get proof status
GET /api/v1/prover/status/:request_id
```

## GPU Tiers

| Tier | Name | VRAM | Example GPUs | Proof/Hour |
|------|------|------|--------------|------------|
| 0 | Consumer | 4-8GB | GTX 1070, RTX 2060 | ~200 |
| 1 | Prosumer | 8-12GB | RTX 3070, RTX 3080 | ~400 |
| 2 | Professional | 12-24GB | RTX 3090, RTX 4090 | ~800 |
| 3 | Datacenter | 24-48GB | A100, L40 | ~1500 |
| 4 | Enterprise | 48GB+ | H100, Multi-GPU | ~3000+ |

## Monitoring

Enable the monitoring stack:

```bash
docker compose --profile monitoring up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/bitsage)

### Key Metrics

| Metric | Description |
|--------|-------------|
| `bitsage_proofs_total` | Total proofs generated |
| `bitsage_proof_duration_seconds` | Proof generation time |
| `bitsage_gpu_utilization` | GPU usage percentage |
| `bitsage_gpu_memory_used_bytes` | GPU memory consumption |
| `bitsage_tee_attestations_total` | TEE attestation count |
| `bitsage_workers_active` | Active worker count |

## Troubleshooting

### GPU Not Detected

```bash
# Check NVIDIA runtime
docker info | grep -i nvidia

# Test GPU access
docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### TEE Not Detected

```bash
# Check TDX
ls -la /dev/tdx*

# Check SGX
ls -la /dev/sgx*

# Check SEV
dmesg | grep -i sev

# Enable SGX in BIOS if needed
# Enable TDX in BIOS if needed (H100 specific)
```

### Coordinator Connection Failed

```bash
# Check coordinator logs
docker compose logs coordinator

# Test health endpoint
curl http://localhost:3030/health

# Check worker registration
curl http://localhost:3030/api/v1/workers/gpu

# Restart coordinator
docker compose restart coordinator
```

### Out of GPU Memory

Reduce batch size in `.env`:

```bash
GPU_MEMORY_FRACTION=0.7
MAX_BATCH_SIZE=256
GPU_MAX_JOBS=2
```

### TEE Attestation Failed

```bash
# Check TEE worker logs
docker compose --profile tee logs tee-worker

# Verify attestation endpoint
curl http://localhost:3030/api/v1/tee/attestation

# Check enclave measurement
docker compose --profile tee exec tee-worker cat /data/attestations/latest.json
```

## Directory Structure

```
deploy/
├── docker/
│   ├── Dockerfile.coordinator    # Rust coordinator node
│   ├── Dockerfile.gpu-worker     # STWO CUDA GPU prover
│   ├── Dockerfile.tee-worker     # TEE privacy prover
│   └── Dockerfile.dashboard      # Next.js dashboard
├── scripts/
│   ├── setup.sh                  # Initial setup wizard
│   ├── start.sh                  # Start services
│   ├── stop.sh                   # Stop services
│   ├── health-check.sh           # Verify health
│   └── detect-hardware.sh        # Hardware detection
├── config/
│   ├── prometheus.yml            # Prometheus config
│   └── grafana/                  # Grafana provisioning
├── docker-compose.yml            # Main compose file
├── .env.template                 # Environment template
└── README.md                     # This file
```

## Security Best Practices

1. **Never commit `.env`** - contains private keys
2. **Use keystore files** in production instead of raw private keys
3. **Firewall rules**: Only expose ports 3000/3030 if needed externally
4. **TEE attestation**: Enable for privacy-sensitive operations
5. **Regular updates**: Keep Docker images and dependencies updated
6. **Audit logs**: Enable and monitor coordinator logs

## Network Information

### Sepolia Testnet Contracts

| Contract | Address |
|----------|---------|
| SAGE Token | `0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850` |
| Validator Registry | `0x431a8b6afb9b6f3ffa2fa9e58519b64dbe9eb53c6ac8fb69d3dcb8b9b92f5d9` |
| Job Manager | `0x355b8c5e9dd3310a3c361559b53cfcfdc20b2bf7d5bd87a84a83389b8cbb8d3` |
| Staking | `0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b` |
| Faucet | `0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3` |
| STWO Verifier | `0x52963fe2f1d2d2545cbe18b8230b739c8861ae726dc7b6f0202cc17a369bd7d` |
| Privacy Pools | `0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7` |
| Privacy Router | `0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53` |
| Confidential Swap | `0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af` |

## CLI Reference

The BitSage CLI provides commands for managing your validator node.

### Installation

```bash
cd packages/cli
npm install
npm link
```

### Commands

```bash
# Setup
bitsage init              # Interactive setup wizard
bitsage faucet            # Claim testnet SAGE tokens

# Validator Management
bitsage register          # Register as validator
bitsage stake add 1000    # Add stake
bitsage stake remove 500  # Remove stake
bitsage stake info        # View stake info

# Services
bitsage start             # Start validator services
bitsage stop              # Stop services
bitsage status            # Show node status
bitsage health            # Health check
bitsage logs [service]    # View logs

# GPU
bitsage gpu detect        # Detect GPU hardware
bitsage gpu set --tier 3  # Manual GPU config

# Privacy
bitsage privacy deposit 100        # Deposit to privacy pool
bitsage privacy withdraw 50        # Withdraw from pool
bitsage privacy balance            # Show private balance
bitsage privacy notes              # List privacy notes
bitsage privacy swap ETH SAGE 1.0  # Confidential swap
```

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Full technical documentation available
- Community: Join the validator community for support
