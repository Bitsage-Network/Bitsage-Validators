//! Rental Marketplace Types
//!
//! Core types for the GPU rental marketplace, including rental sessions,
//! templates, GPU allocation, and access credentials.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Rental Session
// ============================================================================

/// A rental session represents a user renting GPU compute time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RentalSession {
    /// Unique session identifier
    pub id: Uuid,
    /// Wallet address of the tenant (renter)
    pub tenant_wallet: String,
    /// Wallet address of the validator (GPU owner)
    pub validator_wallet: String,
    /// Template ID being used
    pub template_id: String,
    /// Docker container ID
    pub container_id: Option<String>,
    /// GPU ID from marketplace
    pub gpu_id: Option<String>,
    /// GPU allocation details
    pub gpu_allocation: GpuAllocation,
    /// Current status
    pub status: RentalStatus,
    /// When the rental started
    pub started_at: DateTime<Utc>,
    /// When the rental expires (based on escrow balance)
    pub expires_at: DateTime<Utc>,
    /// Rate in SAGE tokens per hour (in smallest units)
    pub rate_sage_per_hour: u64,
    /// Total SAGE spent so far
    pub total_spent: u64,
    /// SSH access credentials
    pub ssh_access: Option<SshAccessInfo>,
    /// Jupyter access credentials
    pub jupyter_access: Option<JupyterAccessInfo>,
    /// API endpoint if applicable
    pub api_endpoint: Option<String>,
    /// Last billing timestamp
    pub last_billed_at: DateTime<Utc>,
    /// Error message if failed
    pub error: Option<String>,
}

/// Rental session status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RentalStatus {
    /// Waiting for escrow deposit
    PendingEscrow,
    /// Provisioning container and GPU
    Provisioning,
    /// Container running, ready to use
    Running,
    /// Rental is suspended (insufficient funds)
    Suspended,
    /// User requested stop, cleaning up
    Stopping,
    /// Rental has ended normally
    Stopped,
    /// Failed to provision or runtime error
    Failed,
    /// Expired due to insufficient funds
    Expired,
}

impl RentalStatus {
    /// Check if the rental is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Stopped | Self::Failed | Self::Expired)
    }

    /// Check if the rental is active (container running)
    pub fn is_active(&self) -> bool {
        matches!(self, Self::Running | Self::Suspended)
    }
}

// ============================================================================
// GPU Allocation
// ============================================================================

/// How the GPU is allocated to the rental
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GpuAllocation {
    /// Exclusive access to entire GPU (consumer GPUs: RTX 4090, 3090)
    Exclusive {
        gpu_uuid: String,
        gpu_model: String,
        vram_gb: u32,
    },
    /// MIG (Multi-Instance GPU) partition (datacenter GPUs: H100, A100)
    Mig {
        gpu_index: u32,
        gi_id: u32,  // GPU Instance ID
        ci_id: u32,  // Compute Instance ID
        profile: MigProfile,
        vram_gb: u32,
    },
}

/// MIG partition profiles
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigProfile {
    /// 1 GPU slice (1/7 of H100)
    Mig1g5gb,
    /// 2 GPU slices (2/7)
    Mig2g10gb,
    /// 3 GPU slices (3/7)
    Mig3g20gb,
    /// 4 GPU slices (4/7)
    Mig4g40gb,
    /// 7 GPU slices (full)
    Mig7g80gb,
}

impl MigProfile {
    /// Get approximate VRAM for this profile
    pub fn vram_gb(&self) -> u32 {
        match self {
            Self::Mig1g5gb => 5,
            Self::Mig2g10gb => 10,
            Self::Mig3g20gb => 20,
            Self::Mig4g40gb => 40,
            Self::Mig7g80gb => 80,
        }
    }
}

// ============================================================================
// Rental Templates
// ============================================================================

/// Pre-configured rental environment template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RentalTemplate {
    /// Template ID (e.g., "llama-3.2-dev")
    pub id: String,
    /// Display name
    pub name: String,
    /// Description
    pub description: String,
    /// Category
    pub category: TemplateCategory,
    /// Docker image to use
    pub docker_image: String,
    /// Minimum VRAM required (GB)
    pub min_vram_gb: u32,
    /// Recommended VRAM (GB)
    pub recommended_vram_gb: u32,
    /// Base hourly rate in SAGE (can be multiplied by GPU tier)
    pub base_rate_sage_per_hour: u64,
    /// Pre-installed packages/tools
    pub features: Vec<String>,
    /// Tags for filtering
    pub tags: Vec<String>,
    /// Whether Jupyter is enabled
    pub jupyter_enabled: bool,
    /// Whether SSH is enabled
    pub ssh_enabled: bool,
    /// Exposed ports (besides SSH 22 and Jupyter 8888)
    pub extra_ports: Vec<u16>,
    /// Environment variables to set
    pub env_vars: Vec<(String, String)>,
    /// GPU memory reserved for system (MB)
    pub gpu_memory_reserved_mb: u32,
}

/// Template category
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TemplateCategory {
    /// LLM/ML development
    AiMl,
    /// Image/video generation
    Creative,
    /// ZK proof development
    ZkCrypto,
    /// General purpose compute
    Compute,
    /// Blockchain nodes/infrastructure
    Infrastructure,
}

// ============================================================================
// Access Credentials
// ============================================================================

/// SSH access information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshAccessInfo {
    /// Connection method
    pub method: SshMethod,
    /// SSH hostname or IP
    pub host: String,
    /// SSH port
    pub port: u16,
    /// Username
    pub username: String,
    /// Private key (PEM format) - only shown once at creation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    /// Public key fingerprint
    pub key_fingerprint: String,
    /// Tailscale machine name (if using Tailscale)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tailscale_name: Option<String>,
}

/// SSH connection method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshMethod {
    /// Direct SSH connection
    Direct,
    /// SSH via Tailscale mesh
    Tailscale,
    /// SSH through jumpbox
    Jumpbox,
}

/// Jupyter access information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JupyterAccessInfo {
    /// Jupyter URL
    pub url: String,
    /// Access token
    pub token: String,
    /// Token expiration time
    pub expires_at: DateTime<Utc>,
}

// ============================================================================
// Marketplace Listings
// ============================================================================

/// A GPU listed on the marketplace by a validator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceGpu {
    /// Unique GPU ID
    pub id: String,
    /// Validator wallet address
    pub validator_wallet: String,
    /// GPU model name
    pub gpu_model: String,
    /// Total VRAM (GB)
    pub vram_gb: u32,
    /// GPU backend
    pub backend: GpuBackend,
    /// Whether this is MIG-capable
    pub mig_capable: bool,
    /// Current availability
    pub availability: GpuAvailability,
    /// Hourly rate in SAGE (set by validator)
    pub rate_sage_per_hour: u64,
    /// Validator's uptime percentage (last 30 days)
    pub uptime_percent: f32,
    /// Total rentals completed
    pub total_rentals: u32,
    /// Average rating (1-5)
    pub rating: f32,
    /// Geographic region (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// Supported templates
    pub supported_templates: Vec<String>,
}

/// GPU backend type (matches prover types)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuBackend {
    Cuda,
    Metal,
    Vulkan,
}

/// GPU availability status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GpuAvailability {
    /// Fully available
    Available,
    /// Partially available (MIG with some slices free)
    PartiallyAvailable {
        available_vram_gb: u32,
        total_vram_gb: u32,
    },
    /// Currently in use
    InUse {
        #[serde(skip_serializing_if = "Option::is_none")]
        available_in_minutes: Option<u32>,
    },
    /// Reserved for suspended rental (can resume within time limit)
    Reserved {
        rental_id: Uuid,
        reserved_until: DateTime<Utc>,
    },
    /// Offline/maintenance
    Offline,
}

// ============================================================================
// Billing
// ============================================================================

/// User's escrow balance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscrowBalance {
    /// User's wallet address
    pub wallet: String,
    /// Total deposited SAGE (smallest units)
    pub total_deposited: u64,
    /// Total spent on rentals
    pub total_spent: u64,
    /// Available balance
    pub available: u64,
    /// Amount currently reserved for active rentals
    pub reserved: u64,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

/// Billing record for a rental session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingRecord {
    /// Record ID
    pub id: Uuid,
    /// Rental session ID
    pub rental_id: Uuid,
    /// Amount charged (SAGE smallest units)
    pub amount: u64,
    /// Billing period start
    pub period_start: DateTime<Utc>,
    /// Billing period end
    pub period_end: DateTime<Utc>,
    /// On-chain transaction hash (if settled)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    /// Created at
    pub created_at: DateTime<Utc>,
}

/// Validator earnings summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorEarnings {
    /// Validator wallet address
    pub wallet: String,
    /// Total earned from rentals (SAGE)
    pub total_earned: u64,
    /// Total withdrawn
    pub total_withdrawn: u64,
    /// Available to withdraw
    pub available: u64,
    /// Active rentals generating revenue
    pub active_rentals: u32,
    /// Last earning timestamp
    pub last_earned_at: Option<DateTime<Utc>>,
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/// Request to start a new rental
#[derive(Debug, Clone, Deserialize)]
pub struct StartRentalRequest {
    /// Template to use
    pub template_id: String,
    /// GPU ID to rent
    pub gpu_id: String,
    /// Initial rental duration in hours
    pub duration_hours: u32,
    /// Tenant wallet address
    pub tenant_wallet: String,
    /// SSH public key to inject (optional - will generate if not provided)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_public_key: Option<String>,
}

/// Response after starting a rental
#[derive(Debug, Clone, Serialize)]
pub struct StartRentalResponse {
    /// Rental session details
    pub rental: RentalSession,
    /// Required escrow amount (SAGE)
    pub required_escrow: u64,
    /// Escrow contract address
    pub escrow_contract: String,
}

/// Request to extend a rental
#[derive(Debug, Clone, Deserialize)]
pub struct ExtendRentalRequest {
    /// Additional hours to add
    pub additional_hours: u32,
}

/// Marketplace query filters
#[derive(Debug, Clone, Default, Deserialize)]
pub struct MarketplaceFilters {
    /// Filter by template compatibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    /// Minimum VRAM required
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_vram_gb: Option<u32>,
    /// Maximum hourly rate
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_rate: Option<u64>,
    /// Filter by GPU backend
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<GpuBackend>,
    /// Only show available GPUs
    #[serde(default = "default_true")]
    pub available_only: bool,
    /// Sort by (rate, vram, rating, uptime)
    #[serde(default)]
    pub sort_by: SortBy,
}

fn default_true() -> bool {
    true
}

/// Sort options for marketplace
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortBy {
    #[default]
    Rate,
    Vram,
    Rating,
    Uptime,
}

// ============================================================================
// Container Configuration
// ============================================================================

/// Container runtime configuration
#[derive(Debug, Clone)]
pub struct ContainerConfig {
    /// Docker image
    pub image: String,
    /// Container name
    pub name: String,
    /// GPU devices to attach
    pub gpu_devices: Vec<String>,
    /// Memory limit (bytes)
    pub memory_limit: u64,
    /// CPU quota (1.0 = 1 CPU)
    pub cpu_quota: f64,
    /// Port mappings (container:host)
    pub port_mappings: Vec<(u16, u16)>,
    /// Environment variables
    pub env_vars: Vec<(String, String)>,
    /// Volume mounts
    pub volumes: Vec<(String, String)>,
    /// Network name
    pub network: String,
    /// Whether to use Kata Containers
    pub use_kata: bool,
}

/// Network configuration for rental isolation
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    /// Network name
    pub name: String,
    /// Subnet CIDR
    pub subnet: String,
    /// Gateway IP
    pub gateway: String,
    /// Container IP
    pub container_ip: String,
}

// ============================================================================
// Default Templates
// ============================================================================

impl RentalTemplate {
    /// Get all default templates
    pub fn defaults() -> Vec<Self> {
        vec![
            Self {
                id: "llama-3.2-dev".to_string(),
                name: "Llama 3.2 Development".to_string(),
                description: "Full LLM development environment with vLLM, Hugging Face Transformers, and common ML tools. Includes Llama 3.2 model weights.".to_string(),
                category: TemplateCategory::AiMl,
                docker_image: "bitsage/rental-llama:latest".to_string(),
                min_vram_gb: 24,
                recommended_vram_gb: 48,
                base_rate_sage_per_hour: 50,
                features: vec![
                    "vLLM inference server".to_string(),
                    "Hugging Face Transformers".to_string(),
                    "PyTorch + CUDA 12.3".to_string(),
                    "Llama 3.2 7B/70B weights".to_string(),
                ],
                tags: vec!["LLM".to_string(), "vLLM".to_string(), "Transformers".to_string()],
                jupyter_enabled: true,
                ssh_enabled: true,
                extra_ports: vec![8000], // vLLM API
                env_vars: vec![],
                gpu_memory_reserved_mb: 512,
            },
            Self {
                id: "comfyui-studio".to_string(),
                name: "ComfyUI Studio".to_string(),
                description: "Complete image generation studio with ComfyUI, Stable Diffusion XL, and popular custom nodes pre-installed.".to_string(),
                category: TemplateCategory::Creative,
                docker_image: "bitsage/rental-comfyui:latest".to_string(),
                min_vram_gb: 12,
                recommended_vram_gb: 24,
                base_rate_sage_per_hour: 30,
                features: vec![
                    "ComfyUI with manager".to_string(),
                    "SDXL 1.0 + Turbo".to_string(),
                    "ControlNet models".to_string(),
                    "Popular custom nodes".to_string(),
                ],
                tags: vec!["Image".to_string(), "SDXL".to_string(), "ComfyUI".to_string()],
                jupyter_enabled: true,
                ssh_enabled: true,
                extra_ports: vec![8188], // ComfyUI
                env_vars: vec![],
                gpu_memory_reserved_mb: 256,
            },
            Self {
                id: "stwo-prover-dev".to_string(),
                name: "STWO Prover Development".to_string(),
                description: "Zero-knowledge proof development environment with STWO prover, Cairo language support, and Starknet tooling.".to_string(),
                category: TemplateCategory::ZkCrypto,
                docker_image: "bitsage/rental-stwo:latest".to_string(),
                min_vram_gb: 8,
                recommended_vram_gb: 16,
                base_rate_sage_per_hour: 40,
                features: vec![
                    "STWO prover (GPU)".to_string(),
                    "Cairo 1.0 compiler".to_string(),
                    "Scarb package manager".to_string(),
                    "Starknet Foundry".to_string(),
                ],
                tags: vec!["ZK".to_string(), "Cairo".to_string(), "Starknet".to_string()],
                jupyter_enabled: true,
                ssh_enabled: true,
                extra_ports: vec![],
                env_vars: vec![],
                gpu_memory_reserved_mb: 256,
            },
            Self {
                id: "whisper-transcribe".to_string(),
                name: "Whisper Transcription".to_string(),
                description: "Audio transcription and translation environment with Whisper Large V3 and supporting tools.".to_string(),
                category: TemplateCategory::AiMl,
                docker_image: "bitsage/rental-whisper:latest".to_string(),
                min_vram_gb: 8,
                recommended_vram_gb: 12,
                base_rate_sage_per_hour: 25,
                features: vec![
                    "Whisper Large V3".to_string(),
                    "faster-whisper (CTranslate2)".to_string(),
                    "Audio processing tools".to_string(),
                    "Batch transcription scripts".to_string(),
                ],
                tags: vec!["Audio".to_string(), "Whisper".to_string(), "Transcription".to_string()],
                jupyter_enabled: true,
                ssh_enabled: true,
                extra_ports: vec![],
                env_vars: vec![],
                gpu_memory_reserved_mb: 256,
            },
            Self {
                id: "jupyter-ml".to_string(),
                name: "Jupyter ML Notebook".to_string(),
                description: "General-purpose ML notebook environment with PyTorch, TensorFlow, and common data science libraries.".to_string(),
                category: TemplateCategory::Compute,
                docker_image: "bitsage/rental-jupyter:latest".to_string(),
                min_vram_gb: 8,
                recommended_vram_gb: 16,
                base_rate_sage_per_hour: 35,
                features: vec![
                    "JupyterLab".to_string(),
                    "PyTorch + TensorFlow".to_string(),
                    "Pandas, NumPy, SciPy".to_string(),
                    "Matplotlib, Plotly".to_string(),
                ],
                tags: vec!["ML".to_string(), "Jupyter".to_string(), "PyTorch".to_string()],
                jupyter_enabled: true,
                ssh_enabled: true,
                extra_ports: vec![],
                env_vars: vec![],
                gpu_memory_reserved_mb: 256,
            },
        ]
    }
}
