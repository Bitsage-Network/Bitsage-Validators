//! HTTP Handlers for Prover API
//!
//! REST endpoints for proof submission, status, and worker management.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;
use super::types::*;

/// Generate a random byte array of length N
fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    rand::thread_rng().fill(&mut bytes[..]);
    bytes
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Json<Self> {
        Json(Self {
            success: true,
            data: Some(data),
            error: None,
        })
    }

    pub fn err(message: impl Into<String>) -> Json<Self> {
        Json(Self {
            success: false,
            data: None,
            error: Some(message.into()),
        })
    }
}

// ============================================================================
// Prover API
// ============================================================================

/// GET /api/v1/prover/capabilities
pub async fn get_capabilities(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<ProverCapabilities>> {
    let caps = state.router.get_capabilities();
    ApiResponse::ok(caps)
}

/// POST /api/v1/prover/prove
pub async fn submit_proof(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProofRequest>,
) -> Result<Json<ApiResponse<ProofSubmitResponse>>, StatusCode> {
    match state.router.route(&request, &state.workers, &state.proofs).await {
        Ok(request_id) => Ok(ApiResponse::ok(ProofSubmitResponse {
            request_id,
            status: ProofJobStatus::Pending,
            estimated_time_ms: estimate_proof_time(&request.circuit),
        })),
        Err(e) => Ok(ApiResponse::err(e.to_string())),
    }
}

#[derive(Serialize)]
pub struct ProofSubmitResponse {
    pub request_id: Uuid,
    pub status: ProofJobStatus,
    pub estimated_time_ms: u64,
}

/// GET /api/v1/prover/status/:request_id
pub async fn get_proof_status(
    State(state): State<Arc<AppState>>,
    Path(request_id): Path<Uuid>,
) -> Json<ApiResponse<ProofStatusResponse>> {
    let proofs = state.proofs.read().await;

    // Check completed first
    if let Some(result) = proofs.get_completed(&request_id) {
        return ApiResponse::ok(ProofStatusResponse {
            request_id,
            status: ProofJobStatus::Completed,
            progress: None,
            result: Some(result.clone()),
            error: None,
        });
    }

    // Check pending
    if let Some(job) = proofs.get_pending(&request_id) {
        return ApiResponse::ok(ProofStatusResponse {
            request_id,
            status: job.status,
            progress: job.progress.clone(),
            result: None,
            error: None,
        });
    }

    ApiResponse::err("Request not found")
}

#[derive(Serialize)]
pub struct ProofStatusResponse {
    pub request_id: Uuid,
    pub status: ProofJobStatus,
    pub progress: Option<ProofProgress>,
    pub result: Option<ProofResult>,
    pub error: Option<String>,
}

/// POST /api/v1/prover/submit
pub async fn submit_on_chain(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<OnChainSubmitRequest>,
) -> Json<ApiResponse<OnChainSubmitResponse>> {
    // TODO: Submit proof to Starknet verifier contract
    tracing::info!(
        proof_id = %request.proof.id,
        verifier = %request.verifier_address,
        "Submitting proof on-chain"
    );

    // Mock response for now
    ApiResponse::ok(OnChainSubmitResponse {
        tx_hash: format!("0x{:064x}", rand::random::<u128>()),
        status: "pending".to_string(),
    })
}

#[derive(Deserialize)]
pub struct OnChainSubmitRequest {
    pub proof: ProofResult,
    pub verifier_address: String,
    #[serde(default)]
    pub calldata: Vec<String>,
}

#[derive(Serialize)]
pub struct OnChainSubmitResponse {
    pub tx_hash: String,
    pub status: String,
}

// ============================================================================
// TEE API
// ============================================================================

/// GET /api/v1/tee/attestation
pub async fn get_tee_attestation(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<TeeAttestationResponse>> {
    let enclaves = state.workers.get_available_tee_enclaves().await;

    if let Some(enclave) = enclaves.first() {
        // Generate fresh attestation
        let attestation = TeeAttestation {
            tee_type: format!("{:?}", enclave.tee_type).to_lowercase(),
            quote: generate_mock_quote(),
            enclave_pub_key: generate_mock_pubkey(),
            measurement: enclave.measurement.clone(),
            signature: "0x".to_string() + &hex::encode(random_bytes::<64>()),
            timestamp: chrono::Utc::now().timestamp(),
        };

        return ApiResponse::ok(TeeAttestationResponse { attestation });
    }

    ApiResponse::err("No TEE enclaves available")
}

#[derive(Serialize)]
pub struct TeeAttestationResponse {
    pub attestation: TeeAttestation,
}

/// POST /api/v1/tee/prove
pub async fn submit_tee_proof(
    State(state): State<Arc<AppState>>,
    Json(request): Json<TeeProofRequest>,
) -> Json<ApiResponse<ProofSubmitResponse>> {
    let proof_request = ProofRequest {
        request_id: Uuid::new_v4(),
        circuit: request.circuit,
        mode: ProofMode::TeeAssisted,
        witness: serde_json::to_value(&request.encrypted_witness).unwrap(),
        deadline: request.deadline,
        client_pub_key: None,
    };

    match state.router.route(&proof_request, &state.workers, &state.proofs).await {
        Ok(request_id) => ApiResponse::ok(ProofSubmitResponse {
            request_id,
            status: ProofJobStatus::Pending,
            estimated_time_ms: estimate_proof_time(&request.circuit),
        }),
        Err(e) => ApiResponse::err(e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct TeeProofRequest {
    pub circuit: CircuitType,
    pub encrypted_witness: EncryptedWitness,
    pub deadline: i64,
}

/// GET /api/v1/tee/status/:request_id
pub async fn get_tee_status(
    State(state): State<Arc<AppState>>,
    Path(request_id): Path<Uuid>,
) -> Json<ApiResponse<ProofStatusResponse>> {
    // Reuse the standard proof status handler
    get_proof_status(State(state), Path(request_id)).await
}

// ============================================================================
// Worker API
// ============================================================================

/// GET /api/v1/workers/gpu
pub async fn list_gpu_workers(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<WorkersResponse>> {
    let workers = state.workers.get_available_gpu_workers().await;
    ApiResponse::ok(WorkersResponse { workers })
}

#[derive(Serialize)]
pub struct WorkersResponse {
    pub workers: Vec<GpuWorker>,
}

/// POST /api/v1/workers/submit
pub async fn submit_worker_job(
    State(state): State<Arc<AppState>>,
    Json(request): Json<WorkerJobRequest>,
) -> Json<ApiResponse<WorkerJobResponse>> {
    let proof_request = ProofRequest {
        request_id: Uuid::new_v4(),
        circuit: request.circuit,
        mode: ProofMode::WorkerGpu,
        witness: request.witness,
        deadline: request.deadline,
        client_pub_key: None,
    };

    match state.router.route(&proof_request, &state.workers, &state.proofs).await {
        Ok(request_id) => {
            // Get assigned worker
            let workers = state.workers.get_available_gpu_workers().await;
            let worker_id = workers.first().map(|w| w.id.clone());

            ApiResponse::ok(WorkerJobResponse {
                job_id: request_id,
                worker_id,
                estimated_time_ms: estimate_proof_time(&request.circuit),
            })
        }
        Err(e) => ApiResponse::err(e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct WorkerJobRequest {
    pub circuit: CircuitType,
    pub witness: serde_json::Value,
    pub deadline: i64,
    #[serde(default)]
    pub preferred_worker_id: Option<String>,
}

#[derive(Serialize)]
pub struct WorkerJobResponse {
    pub job_id: Uuid,
    pub worker_id: Option<String>,
    pub estimated_time_ms: u64,
}

/// GET /api/v1/workers/job/:job_id
pub async fn get_job_status(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<Uuid>,
) -> Json<ApiResponse<ProofStatusResponse>> {
    get_proof_status(State(state), Path(job_id)).await
}

/// POST /api/v1/workers/job/:job_id/cancel
pub async fn cancel_job(
    State(_state): State<Arc<AppState>>,
    Path(job_id): Path<Uuid>,
) -> Json<ApiResponse<CancelResponse>> {
    // TODO: Actually cancel the job
    tracing::info!(job_id = %job_id, "Cancelling job");
    ApiResponse::ok(CancelResponse { cancelled: true })
}

#[derive(Serialize)]
pub struct CancelResponse {
    pub cancelled: bool,
}

/// GET /api/v1/workers/:worker_id/metrics
pub async fn get_worker_metrics(
    State(_state): State<Arc<AppState>>,
    Path(worker_id): Path<String>,
) -> Json<ApiResponse<WorkerMetrics>> {
    // Mock metrics for now
    ApiResponse::ok(WorkerMetrics {
        gpu_utilization: 0.65,
        memory_used: 8_000_000_000,
        memory_total: 16_000_000_000,
        temperature: 72.0,
        proofs_per_hour: 120,
    })
}

/// GET /api/v1/workers/stats
pub async fn get_network_stats(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<NetworkStats>> {
    let gpu_workers = state.workers.get_available_gpu_workers().await;
    let tee_enclaves = state.workers.get_available_tee_enclaves().await;

    ApiResponse::ok(NetworkStats {
        total_workers: (gpu_workers.len() + tee_enclaves.len()) as u32,
        active_workers: gpu_workers.iter().filter(|w| w.current_load > 0).count() as u32,
        total_gpu_memory_gb: 64.0, // Mock
        proofs_last_hour: 500,     // Mock
        average_proof_time_ms: 4500,
    })
}

// ============================================================================
// Worker Registration API
// ============================================================================

/// POST /api/v1/workers/gpu/register
/// GPU workers call this to register with the coordinator
pub async fn register_gpu_worker(
    State(state): State<Arc<AppState>>,
    Json(request): Json<GpuWorkerRegistration>,
) -> Json<ApiResponse<WorkerRegistrationResponse>> {
    tracing::info!(
        worker_id = %request.worker_id,
        gpu_backend = ?request.gpu_backend,
        capacity = %request.capacity,
        "GPU worker registering"
    );

    let worker = GpuWorker {
        id: request.worker_id.clone(),
        address: request.address.clone(),
        gpu_backend: request.gpu_backend,
        capacity: request.capacity,
        current_load: 0,
        latency_ms: 0,
        gpu_model: request.gpu_model.clone(),
        vram_gb: request.vram_gb,
        owner_address: request.owner_address.clone(),
        active_workload: None,
    };

    state.workers.register_gpu_worker(worker).await;

    ApiResponse::ok(WorkerRegistrationResponse {
        worker_id: request.worker_id,
        accepted: true,
        ws_url: "/ws/worker".to_string(),
        heartbeat_interval_ms: 30000,
    })
}

#[derive(Debug, Deserialize)]
pub struct GpuWorkerRegistration {
    pub worker_id: String,
    pub address: String,
    pub gpu_backend: GpuBackend,
    pub capacity: u32,
    #[serde(default)]
    pub gpu_model: Option<String>,
    #[serde(default)]
    pub vram_gb: Option<u32>,
    /// Wallet address of the validator who owns this worker
    #[serde(default)]
    pub owner_address: Option<String>,
}

/// POST /api/v1/workers/tee/register
/// TEE workers call this to register with the coordinator
pub async fn register_tee_worker(
    State(state): State<Arc<AppState>>,
    Json(request): Json<TeeWorkerRegistration>,
) -> Json<ApiResponse<WorkerRegistrationResponse>> {
    tracing::info!(
        worker_id = %request.worker_id,
        tee_type = ?request.tee_type,
        "TEE worker registering"
    );

    // Verify the attestation quote
    let attestation_valid = verify_attestation(&request.attestation_quote, &request.tee_type);

    if !attestation_valid {
        return ApiResponse::err("Invalid attestation quote");
    }

    let enclave = TeeEnclave {
        id: request.worker_id.clone(),
        address: request.address.clone(),
        tee_type: request.tee_type,
        measurement: request.measurement.clone(),
        is_healthy: true,
        last_attestation: chrono::Utc::now().timestamp(),
    };

    state.workers.register_tee_enclave(enclave).await;

    ApiResponse::ok(WorkerRegistrationResponse {
        worker_id: request.worker_id,
        accepted: true,
        ws_url: "/ws/worker".to_string(),
        heartbeat_interval_ms: 30000,
    })
}

#[derive(Debug, Deserialize)]
pub struct TeeWorkerRegistration {
    pub worker_id: String,
    pub address: String,
    pub tee_type: TeeType,
    pub measurement: String,
    pub attestation_quote: String,
    pub enclave_pub_key: String,
}

#[derive(Debug, Serialize)]
pub struct WorkerRegistrationResponse {
    pub worker_id: String,
    pub accepted: bool,
    pub ws_url: String,
    pub heartbeat_interval_ms: u32,
}

/// POST /api/v1/workers/heartbeat
/// Workers call this to send heartbeat and update their status
pub async fn worker_heartbeat(
    State(state): State<Arc<AppState>>,
    Json(request): Json<WorkerHeartbeat>,
) -> Json<ApiResponse<HeartbeatResponse>> {
    tracing::debug!(
        worker_id = %request.worker_id,
        current_load = %request.current_load,
        "Worker heartbeat"
    );

    // Update worker status
    state.workers.update_worker_status(
        &request.worker_id,
        request.current_load,
        request.is_healthy,
    ).await;

    // Check for pending jobs that need to be assigned
    let pending_job = state.workers.get_pending_job_for_worker(&request.worker_id).await;

    ApiResponse::ok(HeartbeatResponse {
        acknowledged: true,
        pending_job,
        server_time: chrono::Utc::now().timestamp(),
    })
}

#[derive(Debug, Deserialize)]
pub struct WorkerHeartbeat {
    pub worker_id: String,
    pub worker_type: WorkerType,
    pub current_load: u32,
    pub is_healthy: bool,
    #[serde(default)]
    pub metrics: Option<WorkerMetrics>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkerType {
    Gpu,
    Tee,
}

#[derive(Debug, Serialize)]
pub struct HeartbeatResponse {
    pub acknowledged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_job: Option<PendingJobInfo>,
    pub server_time: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingJobInfo {
    pub job_id: Uuid,
    pub circuit: CircuitType,
    pub witness_url: String,
    pub deadline: i64,
}

/// POST /api/v1/workers/job/:job_id/result
/// Workers call this to submit proof results
pub async fn submit_job_result(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<Uuid>,
    Json(request): Json<JobResultSubmission>,
) -> Json<ApiResponse<JobResultResponse>> {
    tracing::info!(
        job_id = %job_id,
        worker_id = %request.worker_id,
        success = %request.success,
        "Worker submitting job result"
    );

    if request.success {
        if let Some(proof) = request.proof {
            let result = ProofResult {
                id: job_id,
                circuit: request.circuit,
                proof,
                public_inputs: request.public_inputs.unwrap_or(serde_json::Value::Null),
                mode: if request.attestation.is_some() {
                    ProofMode::TeeAssisted
                } else {
                    ProofMode::WorkerGpu
                },
                timestamp: chrono::Utc::now().timestamp(),
                generation_time_ms: request.generation_time_ms.unwrap_or(0),
                attestation: request.attestation,
            };

            let mut proofs = state.proofs.write().await;
            proofs.complete(job_id, result);
        }
    }

    ApiResponse::ok(JobResultResponse {
        accepted: true,
        job_id,
    })
}

#[derive(Debug, Deserialize)]
pub struct JobResultSubmission {
    pub worker_id: String,
    pub circuit: CircuitType,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof: Option<STWOProof>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_inputs: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_time_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attestation: Option<TeeAttestation>,
}

#[derive(Debug, Serialize)]
pub struct JobResultResponse {
    pub accepted: bool,
    pub job_id: Uuid,
}

/// POST /api/v1/workers/deregister
/// Workers call this when shutting down
pub async fn deregister_worker(
    State(state): State<Arc<AppState>>,
    Json(request): Json<WorkerDeregistration>,
) -> Json<ApiResponse<DeregistrationResponse>> {
    tracing::info!(
        worker_id = %request.worker_id,
        "Worker deregistering"
    );

    state.workers.deregister_worker(&request.worker_id).await;

    ApiResponse::ok(DeregistrationResponse {
        acknowledged: true,
    })
}

#[derive(Debug, Deserialize)]
pub struct WorkerDeregistration {
    pub worker_id: String,
    pub worker_type: WorkerType,
}

#[derive(Debug, Serialize)]
pub struct DeregistrationResponse {
    pub acknowledged: bool,
}

/// GET /api/v1/workers/tee
/// List available TEE enclaves
pub async fn list_tee_workers(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<TeeWorkersResponse>> {
    let enclaves = state.workers.get_available_tee_enclaves().await;
    ApiResponse::ok(TeeWorkersResponse { enclaves })
}

#[derive(Serialize)]
pub struct TeeWorkersResponse {
    pub enclaves: Vec<TeeEnclave>,
}

// ============================================================================
// Helpers
// ============================================================================

/// Verify TEE attestation quote
fn verify_attestation(quote: &str, tee_type: &TeeType) -> bool {
    // TODO: Implement real attestation verification
    // For SGX: Verify with Intel Attestation Service
    // For TDX: Verify with DCAP
    // For SEV: Verify with AMD attestation

    // For now, accept any non-empty quote
    tracing::debug!(
        tee_type = ?tee_type,
        quote_len = quote.len(),
        "Verifying attestation quote"
    );

    !quote.is_empty()
}

fn estimate_proof_time(circuit: &CircuitType) -> u64 {
    match circuit {
        CircuitType::AiInference => 5000,
        CircuitType::DataPipeline => 4000,
        CircuitType::MlTraining => 15000,
        CircuitType::GenericCompute => 3000,
        CircuitType::PrivacyWithdraw => 3000,
        CircuitType::PrivacyTransfer => 4000,
        CircuitType::ConfidentialSwap => 5000,
        CircuitType::MerkleMembership => 5000,
        CircuitType::RangeProof => 3000,
    }
}

fn generate_mock_quote() -> String {
    // SGX quote structure (simplified)
    let header = [0x02, 0x00]; // Version 2
    let body = random_bytes::<128>();
    let mut quote = Vec::with_capacity(130);
    quote.extend_from_slice(&header);
    quote.extend_from_slice(&body);
    format!("0x{}", hex::encode(quote))
}

fn generate_mock_pubkey() -> String {
    // P-256 uncompressed public key (65 bytes: 0x04 + X + Y)
    let mut pubkey = vec![0x04];
    pubkey.extend_from_slice(&random_bytes::<64>());
    format!("0x{}", hex::encode(pubkey))
}
