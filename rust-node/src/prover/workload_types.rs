//! Workload Types
//!
//! Types for workload deployment and management.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Workload Definitions
// ============================================================================

/// Category of workload
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkloadCategory {
    Ai,
    Compute,
    Infra,
    Creative,
}

/// A deployable workload definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workload {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: WorkloadCategory,
    pub min_vram_gb: u32,
    pub tags: Vec<String>,
    pub verified: bool,
    /// Docker image or model identifier
    pub image: String,
    /// Default configuration
    pub default_config: serde_json::Value,
}

/// Get all built-in workloads
pub fn get_builtin_workloads() -> Vec<Workload> {
    vec![
        Workload {
            id: "qwen-2.5".to_string(),
            name: "Qwen 2.5".to_string(),
            description: "Advanced reasoning LLM with 32K context".to_string(),
            category: WorkloadCategory::Ai,
            min_vram_gb: 8,
            tags: vec!["LLM".to_string(), "Reasoning".to_string(), "32K Context".to_string()],
            verified: true,
            image: "bitsage/qwen-2.5:latest".to_string(),
            default_config: serde_json::json!({
                "max_tokens": 4096,
                "temperature": 0.7
            }),
        },
        Workload {
            id: "llama-3.2".to_string(),
            name: "Llama 3.2".to_string(),
            description: "Meta's open-source multimodal foundation model".to_string(),
            category: WorkloadCategory::Ai,
            min_vram_gb: 16,
            tags: vec!["LLM".to_string(), "Multimodal".to_string(), "Open Source".to_string()],
            verified: true,
            image: "bitsage/llama-3.2:latest".to_string(),
            default_config: serde_json::json!({
                "max_tokens": 8192,
                "temperature": 0.7
            }),
        },
        Workload {
            id: "stwo-prover".to_string(),
            name: "STWO Prover".to_string(),
            description: "GPU-accelerated STARK prover for ZK proofs".to_string(),
            category: WorkloadCategory::Compute,
            min_vram_gb: 8,
            tags: vec!["ZK".to_string(), "STARK".to_string(), "GPU".to_string()],
            verified: true,
            image: "bitsage/stwo-prover:latest".to_string(),
            default_config: serde_json::json!({
                "security_bits": 128,
                "blowup_factor": 2
            }),
        },
        Workload {
            id: "comfyui".to_string(),
            name: "ComfyUI".to_string(),
            description: "Modular image generation workflow engine".to_string(),
            category: WorkloadCategory::Creative,
            min_vram_gb: 12,
            tags: vec!["Image Gen".to_string(), "Workflow".to_string(), "Modular".to_string()],
            verified: true,
            image: "bitsage/comfyui:latest".to_string(),
            default_config: serde_json::json!({
                "default_model": "sdxl"
            }),
        },
        Workload {
            id: "starknet-node".to_string(),
            name: "Starknet Full Node".to_string(),
            description: "Run a full Starknet network node".to_string(),
            category: WorkloadCategory::Infra,
            min_vram_gb: 4,
            tags: vec!["Node".to_string(), "Starknet".to_string(), "Infrastructure".to_string()],
            verified: true,
            image: "bitsage/starknet-node:latest".to_string(),
            default_config: serde_json::json!({
                "network": "mainnet",
                "sync_mode": "full"
            }),
        },
        Workload {
            id: "sdxl".to_string(),
            name: "Stable Diffusion XL".to_string(),
            description: "State-of-the-art image generation model".to_string(),
            category: WorkloadCategory::Creative,
            min_vram_gb: 12,
            tags: vec!["Image Gen".to_string(), "SDXL".to_string(), "High Quality".to_string()],
            verified: true,
            image: "bitsage/sdxl:latest".to_string(),
            default_config: serde_json::json!({
                "steps": 30,
                "guidance_scale": 7.5
            }),
        },
        Workload {
            id: "whisper-large".to_string(),
            name: "Whisper Large".to_string(),
            description: "OpenAI's speech recognition model".to_string(),
            category: WorkloadCategory::Ai,
            min_vram_gb: 10,
            tags: vec!["Speech".to_string(), "Transcription".to_string(), "Multilingual".to_string()],
            verified: true,
            image: "bitsage/whisper-large:latest".to_string(),
            default_config: serde_json::json!({
                "language": "auto",
                "task": "transcribe"
            }),
        },
        Workload {
            id: "cairo-vm".to_string(),
            name: "Cairo VM".to_string(),
            description: "Execute Cairo programs for Starknet".to_string(),
            category: WorkloadCategory::Compute,
            min_vram_gb: 4,
            tags: vec!["Cairo".to_string(), "VM".to_string(), "Starknet".to_string()],
            verified: true,
            image: "bitsage/cairo-vm:latest".to_string(),
            default_config: serde_json::json!({
                "trace_enabled": true
            }),
        },
    ]
}

/// Get a workload by ID
pub fn get_workload_by_id(id: &str) -> Option<Workload> {
    get_builtin_workloads().into_iter().find(|w| w.id == id)
}

// ============================================================================
// Deployment Types
// ============================================================================

/// Status of a workload deployment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    /// Deployment is queued
    Queued,
    /// Downloading model/image
    DownloadingModel,
    /// Loading model into GPU memory
    LoadingModel,
    /// Initializing runtime
    Initializing,
    /// Workload is ready and accepting requests
    Ready,
    /// Deployment failed
    Failed,
    /// Workload is stopping
    Stopping,
    /// Workload has been stopped
    Stopped,
}

/// Progress information for deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentProgress {
    pub phase: DeploymentStatus,
    pub progress_pct: u8,
    pub message: String,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub estimated_time_ms: Option<u64>,
}

/// A workload deployment instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadDeployment {
    pub id: Uuid,
    pub workload_id: String,
    pub worker_id: String,
    pub owner_address: String,
    pub status: DeploymentStatus,
    pub progress: Option<DeploymentProgress>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub ready_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error: Option<String>,
}

impl WorkloadDeployment {
    pub fn new(workload_id: String, worker_id: String, owner_address: String) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4(),
            workload_id,
            worker_id,
            owner_address,
            status: DeploymentStatus::Queued,
            progress: None,
            created_at: now,
            updated_at: now,
            ready_at: None,
            error: None,
        }
    }

    pub fn update_status(&mut self, status: DeploymentStatus, progress: Option<DeploymentProgress>, error: Option<String>) {
        self.status = status;
        self.progress = progress;
        self.error = error;
        self.updated_at = chrono::Utc::now();

        if status == DeploymentStatus::Ready {
            self.ready_at = Some(chrono::Utc::now());
        }
    }
}

// ============================================================================
// Request/Response Types
// ============================================================================

/// Request to deploy a workload
#[derive(Debug, Clone, Deserialize)]
pub struct WorkloadDeployRequest {
    pub workload_id: String,
    pub owner_address: String,
    pub worker_id: Option<String>,
    pub config: Option<serde_json::Value>,
}

/// Response from deploying a workload
#[derive(Debug, Clone, Serialize)]
pub struct WorkloadDeployResponse {
    pub deployment_id: Uuid,
    pub worker_id: String,
    pub workload_id: String,
    pub status: DeploymentStatus,
    pub estimated_ready_time_ms: u64,
}

/// List of workloads response
#[derive(Debug, Clone, Serialize)]
pub struct WorkloadsResponse {
    pub workloads: Vec<Workload>,
}

/// List of deployments response
#[derive(Debug, Clone, Serialize)]
pub struct DeploymentsResponse {
    pub deployments: Vec<WorkloadDeployment>,
}

// ============================================================================
// WebSocket Messages
// ============================================================================

/// Command to deploy a workload (Coordinator -> Worker)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadDeployCommand {
    pub deployment_id: Uuid,
    pub workload_id: String,
    pub workload: Workload,
    pub config: serde_json::Value,
}

/// Workload status update (Worker -> Coordinator)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadStatusUpdate {
    pub deployment_id: Uuid,
    pub status: DeploymentStatus,
    pub progress: Option<DeploymentProgress>,
    pub error: Option<String>,
}

/// Command to stop a workload (Coordinator -> Worker)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadStopCommand {
    pub deployment_id: Uuid,
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Estimate deployment time based on workload
pub fn estimate_deployment_time(workload_id: &str) -> u64 {
    match workload_id {
        "qwen-2.5" => 30_000,      // 30 seconds
        "llama-3.2" => 60_000,     // 60 seconds
        "stwo-prover" => 10_000,   // 10 seconds
        "comfyui" => 45_000,       // 45 seconds
        "starknet-node" => 20_000, // 20 seconds
        "sdxl" => 45_000,          // 45 seconds
        "whisper-large" => 30_000, // 30 seconds
        "cairo-vm" => 10_000,      // 10 seconds
        _ => 30_000,               // Default 30 seconds
    }
}
