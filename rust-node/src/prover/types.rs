//! Prover Types
//!
//! Core types for proof routing and worker management.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Proof generation mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofMode {
    ClientWasm,
    WorkerGpu,
    TeeAssisted,
    Auto,
}

/// Circuit type identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(u8)]
pub enum CircuitType {
    // Compute proofs
    AiInference = 0x01,
    DataPipeline = 0x02,
    MlTraining = 0x03,
    GenericCompute = 0x04,

    // Privacy proofs
    PrivacyWithdraw = 0x10,
    PrivacyTransfer = 0x11,
    ConfidentialSwap = 0x12,

    // Lightweight proofs
    MerkleMembership = 0x13,
    RangeProof = 0x14,
}

impl CircuitType {
    /// Get the default proof mode for this circuit
    pub fn default_mode(&self) -> ProofMode {
        match self {
            Self::AiInference | Self::DataPipeline | Self::MlTraining | Self::GenericCompute => {
                ProofMode::WorkerGpu
            }
            Self::PrivacyWithdraw | Self::PrivacyTransfer | Self::ConfidentialSwap => {
                ProofMode::TeeAssisted
            }
            Self::MerkleMembership | Self::RangeProof => ProofMode::ClientWasm,
        }
    }

    /// Check if this is a privacy circuit requiring TEE
    pub fn is_privacy_circuit(&self) -> bool {
        matches!(
            self,
            Self::PrivacyWithdraw | Self::PrivacyTransfer | Self::ConfidentialSwap
        )
    }
}

/// Proof generation progress phase
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofPhase {
    Connecting,
    Loading,
    Encrypting,
    Witness,
    Commit,
    Fri,
    Query,
    Finalizing,
    Done,
}

/// Proof progress update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofProgress {
    pub phase: ProofPhase,
    pub progress: u8,
    pub overall_progress: u8,
    pub estimated_time_ms: Option<u64>,
    pub fri_round: Option<u32>,
    pub fri_foldings: Option<u32>,
}

/// Witness data (public + encrypted private)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Witness {
    pub public_inputs: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_inputs: Option<serde_json::Value>,
}

/// Encrypted witness for TEE transport
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedWitness {
    pub ciphertext: String,
    pub iv: String,
    pub ephemeral_pub_key: String,
    pub enclave_pub_key: String,
    pub public_inputs: serde_json::Value,
}

/// Proof request from client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRequest {
    pub request_id: Uuid,
    pub circuit: CircuitType,
    pub mode: ProofMode,
    pub witness: serde_json::Value, // Either Witness or EncryptedWitness
    pub deadline: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_pub_key: Option<String>,
}

/// STWO proof data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct STWOProof {
    pub commitment: String,
    pub fri: FriProof,
    pub final_poly: Vec<String>,
    pub public_inputs: Vec<String>,
}

/// FRI proof component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriProof {
    pub layer_commitments: Vec<String>,
    pub queries: Vec<Vec<String>>,
}

/// TEE attestation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeAttestation {
    #[serde(rename = "type")]
    pub tee_type: String, // "sgx", "tdx", "sev"
    pub quote: String,
    pub enclave_pub_key: String,
    pub measurement: String,
    pub signature: String,
    pub timestamp: i64,
}

/// Proof result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofResult {
    pub id: Uuid,
    pub circuit: CircuitType,
    pub proof: STWOProof,
    pub public_inputs: serde_json::Value,
    pub mode: ProofMode,
    pub timestamp: i64,
    pub generation_time_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attestation: Option<TeeAttestation>,
}

/// Proof job tracking
#[derive(Debug, Clone)]
pub struct ProofJob {
    pub request_id: Uuid,
    pub circuit: CircuitType,
    pub mode: ProofMode,
    pub status: ProofJobStatus,
    pub progress: Option<ProofProgress>,
    pub worker_id: Option<String>,
    pub started_at: i64,
    pub deadline: i64,
}

/// Job status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofJobStatus {
    Pending,
    Proving,
    Completed,
    Failed,
}

/// GPU worker info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuWorker {
    pub id: String,
    pub address: String,
    pub gpu_backend: GpuBackend,
    pub capacity: u32,
    pub current_load: u32,
    pub latency_ms: u32,
    /// GPU model name (e.g., "NVIDIA RTX 4090")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_model: Option<String>,
    /// VRAM in GB
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_gb: Option<u32>,
    /// Wallet address of the validator who owns this worker
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_address: Option<String>,
    /// Currently deployed workload ID (e.g., "qwen-2.5")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_workload: Option<String>,
}

/// GPU backend type
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuBackend {
    Cuda,
    Metal,
    Vulkan,
}

/// TEE enclave info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeEnclave {
    pub id: String,
    pub address: String,
    pub tee_type: TeeType,
    pub measurement: String,
    pub is_healthy: bool,
    pub last_attestation: i64,
}

/// TEE type
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TeeType {
    Sgx,
    Tdx,
    Sev,
    /// Simulation mode for development (not secure!)
    Simulated,
}

/// Prover capabilities response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProverCapabilities {
    pub circuits: Vec<CircuitType>,
    pub modes: Vec<ProofMode>,
    pub gpu_backends: Vec<GpuBackend>,
    pub tee_types: Vec<TeeType>,
    pub max_concurrent: u32,
    pub version: String,
}

/// Network statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStats {
    pub total_workers: u32,
    pub active_workers: u32,
    pub total_gpu_memory_gb: f64,
    pub proofs_last_hour: u64,
    pub average_proof_time_ms: u64,
}

/// Worker metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerMetrics {
    pub gpu_utilization: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub temperature: f32,
    pub proofs_per_hour: u32,
}
