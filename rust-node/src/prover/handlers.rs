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
    match state.router.route_with_channels(
        &request,
        &state.workers,
        &state.proofs,
        Some(&state.worker_channels),
    ).await {
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
    State(state): State<Arc<AppState>>,
    Json(request): Json<OnChainSubmitRequest>,
) -> Json<ApiResponse<OnChainSubmitResponse>> {
    tracing::info!(
        proof_id = %request.proof.id,
        verifier = %request.verifier_address,
        "On-chain proof submission requested"
    );

    // Check if on-chain escrow is available
    let escrow = match state.rentals.billing.escrow_client() {
        Some(client) if state.rentals.billing.is_on_chain_enabled() => client.clone(),
        _ => {
            tracing::warn!("On-chain escrow not available — proof verified off-chain only");
            return ApiResponse::err(
                "On-chain escrow not configured. Set STARKNET_RPC, COORDINATOR_PRIVATE_KEY, \
                 and COORDINATOR_ADDRESS to enable on-chain proof submission."
            );
        }
    };

    // Verify proof exists in our state
    {
        let proofs = state.proofs.read().await;
        if proofs.get_completed(&request.proof.id).is_none() {
            return ApiResponse::err("Proof not found or not yet completed");
        }
    }

    // Submit the proof verification transaction on-chain
    // The verifier contract validates the STWO proof and emits an event
    match escrow.submit_proof_verification(
        &request.verifier_address,
        &request.proof,
        &request.calldata,
    ).await {
        Ok(tx_hash) => {
            tracing::info!(
                proof_id = %request.proof.id,
                tx_hash = %tx_hash,
                "Proof submitted on-chain"
            );
            ApiResponse::ok(OnChainSubmitResponse {
                tx_hash,
                status: "submitted".to_string(),
            })
        }
        Err(e) => {
            tracing::error!(
                proof_id = %request.proof.id,
                error = %e,
                "On-chain proof submission failed"
            );
            ApiResponse::err(format!("On-chain submission failed: {}", e))
        }
    }
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
        // Generate attestation (mock in dev, requires real TEE in production)
        let quote = match generate_mock_quote() {
            Some(q) => q,
            None => return ApiResponse::err("TEE attestation requires real hardware in production"),
        };
        let pub_key = match generate_mock_pubkey() {
            Some(k) => k,
            None => return ApiResponse::err("TEE key generation requires real hardware in production"),
        };

        let attestation = TeeAttestation {
            tee_type: format!("{:?}", enclave.tee_type).to_lowercase(),
            quote,
            enclave_pub_key: pub_key,
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

    match state.router.route_with_channels(
        &proof_request,
        &state.workers,
        &state.proofs,
        Some(&state.worker_channels),
    ).await {
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

    match state.router.route_with_channels(
        &proof_request,
        &state.workers,
        &state.proofs,
        Some(&state.worker_channels),
    ).await {
        Ok(request_id) => {
            // Get assigned worker from ProofState
            let proofs = state.proofs.read().await;
            let worker_id = proofs.get_pending(&request_id)
                .and_then(|j| j.worker_id.clone());

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
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<Uuid>,
) -> Json<ApiResponse<CancelResponse>> {
    tracing::info!(job_id = %job_id, "Cancelling job");

    let mut proofs = state.proofs.write().await;

    // Check if job exists in pending state
    if proofs.get_pending(&job_id).is_some() {
        // Remove from pending and mark as cancelled with empty proof
        let circuit = proofs.get_pending(&job_id).unwrap().circuit.clone();
        let cancelled_result = ProofResult {
            id: job_id,
            circuit,
            proof: STWOProof {
                commitment: String::new(),
                fri: FriProof {
                    layer_commitments: vec![],
                    queries: vec![],
                },
                final_poly: vec![],
                public_inputs: vec![],
            },
            public_inputs: serde_json::Value::Null,
            mode: ProofMode::WorkerGpu,
            timestamp: chrono::Utc::now().timestamp(),
            generation_time_ms: 0,
            attestation: None,
        };
        proofs.complete(job_id, cancelled_result);
        tracing::info!(job_id = %job_id, "Job cancelled successfully");
        ApiResponse::ok(CancelResponse { cancelled: true })
    } else if proofs.get_completed(&job_id).is_some() {
        // Job already completed
        tracing::warn!(job_id = %job_id, "Cannot cancel — job already completed");
        ApiResponse::err("Job already completed")
    } else {
        // Job not found
        tracing::warn!(job_id = %job_id, "Cannot cancel — job not found");
        ApiResponse::err("Job not found")
    }
}

#[derive(Serialize)]
pub struct CancelResponse {
    pub cancelled: bool,
}

/// GET /api/v1/gpu/metrics — all GPU worker metrics for dashboard
pub async fn get_gpu_metrics(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<serde_json::Value>> {
    let gpu_workers = state.workers.get_available_gpu_workers().await;
    let all_workers = if gpu_workers.is_empty() {
        // Also include inactive workers
        state.workers.get_all_gpu_workers().await
    } else {
        gpu_workers
    };

    let metrics: Vec<serde_json::Value> = all_workers
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let vram_total_mb = w.vram_gb.unwrap_or(0) as u64 * 1024;
            let vram_used_mb = (w.current_load as u64 * vram_total_mb) / 100;
            serde_json::json!({
                "id": i,
                "name": w.gpu_model.clone().unwrap_or_else(|| "Unknown GPU".to_string()),
                "temperature": 0,
                "temperatureMax": 95,
                "utilization": w.current_load,
                "memoryUsed": vram_used_mb,
                "memoryTotal": vram_total_mb,
                "powerDraw": 0,
                "powerLimit": 700,
                "fanSpeed": 0,
                "clockSpeed": 0,
                "clockSpeedMax": 2100,
                "computeMode": "Default",
                "driverVersion": "N/A",
                "cudaCores": 16896
            })
        })
        .collect();

    Json(metrics)
}

/// GET /api/v1/workers/:worker_id/metrics
pub async fn get_worker_metrics(
    State(state): State<Arc<AppState>>,
    Path(worker_id): Path<String>,
) -> Json<ApiResponse<WorkerMetrics>> {
    // Try to get real metrics from registered worker
    let gpu_workers = state.workers.get_available_gpu_workers().await;
    if let Some(worker) = gpu_workers.iter().find(|w| w.id == worker_id) {
        let vram_total = worker.vram_gb.unwrap_or(0) as u64 * 1024 * 1024 * 1024;
        let vram_used = (worker.current_load as u64 * vram_total) / 100;
        return ApiResponse::ok(WorkerMetrics {
            gpu_utilization: worker.current_load as f32 / 100.0,
            memory_used: vram_used,
            memory_total: vram_total,
            temperature: 0.0, // Not tracked in GpuWorker — requires GPU metrics endpoint
            proofs_per_hour: 0, // Computed from job completion rate, not tracked per-worker
        });
    }

    // Worker not found — return zeros instead of fake data
    tracing::warn!(worker_id = %worker_id, "Worker not found for metrics request");
    ApiResponse::ok(WorkerMetrics {
        gpu_utilization: 0.0,
        memory_used: 0,
        memory_total: 0,
        temperature: 0.0,
        proofs_per_hour: 0,
    })
}

/// GET /api/v1/workers/stats
pub async fn get_network_stats(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<NetworkStats>> {
    let gpu_workers = state.workers.get_available_gpu_workers().await;
    let tee_enclaves = state.workers.get_available_tee_enclaves().await;

    // Calculate real aggregate stats from registered workers
    let total_gpu_memory_gb: f64 = gpu_workers.iter()
        .filter_map(|w| w.vram_gb)
        .map(|v| v as f64)
        .sum();

    // Get real proof stats from ProofState
    let proofs = state.proofs.read().await;
    let completed_count = proofs.completed_count() as u64;
    let pending_count = proofs.pending_count();
    drop(proofs);

    // active_workers = workers with jobs assigned or current_load > 0
    let active_workers = gpu_workers.iter()
        .filter(|w| w.current_load > 0 || w.active_workload.is_some())
        .count() as u32;

    ApiResponse::ok(NetworkStats {
        total_workers: (gpu_workers.len() + tee_enclaves.len()) as u32,
        active_workers: active_workers + pending_count as u32,
        total_gpu_memory_gb,
        proofs_last_hour: completed_count, // Total completed proofs (approximate for now)
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

    // Update worker status and heartbeat timestamp
    state.workers.update_worker_status(
        &request.worker_id,
        request.current_load,
        request.is_healthy,
    ).await;
    state.workers.update_heartbeat(&request.worker_id).await;

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
            let generation_time_ms = request.generation_time_ms.unwrap_or(0);
            let circuit = request.circuit;

            let result = ProofResult {
                id: job_id,
                circuit,
                proof,
                public_inputs: request.public_inputs.unwrap_or(serde_json::Value::Null),
                mode: if request.attestation.is_some() {
                    ProofMode::TeeAssisted
                } else {
                    ProofMode::WorkerGpu
                },
                timestamp: chrono::Utc::now().timestamp(),
                generation_time_ms,
                attestation: request.attestation,
            };

            let mut proofs = state.proofs.write().await;
            proofs.complete(job_id, result);
            drop(proofs);

            // Credit SAGE earnings to the worker's validator
            if let Some(gpu_worker) = state.workers.get_gpu_worker(&request.worker_id).await {
                if let Some(ref owner) = gpu_worker.owner_address {
                    let reward_sage = crate::prover::streaming::calculate_proof_reward_for_billing(circuit, generation_time_ms);
                    state.rentals.billing.credit_proof_earnings(
                        owner,
                        reward_sage,
                        job_id,
                    ).await;

                    // Persist earnings to database
                    if let Some(db) = state.db.as_ref() {
                        let repo = db.validator_earnings();
                        if let Err(e) = repo.add_earnings(owner, reward_sage as i64).await {
                            tracing::error!(
                                validator = %owner,
                                amount = reward_sage,
                                error = %e,
                                "Failed to persist proof earnings to DB (REST)"
                            );
                        }
                    }

                    tracing::info!(
                        job_id = %job_id,
                        worker_id = %request.worker_id,
                        validator = %owner,
                        reward_sage = reward_sage,
                        "Credited SAGE proof reward to validator (REST)"
                    );
                }
            }
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
    // For SGX: Verify with Intel Attestation Service (IAS) or DCAP
    // For TDX: Verify with DCAP
    // For SEV: Verify with AMD attestation

    let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true"
        || std::env::var("NODE_ENV").unwrap_or_default() == "production";

    if is_production {
        tracing::error!(
            tee_type = ?tee_type,
            "TEE attestation verification not implemented — rejecting in production"
        );
        return false;
    }

    // Dev mode: accept any non-empty quote
    tracing::warn!(
        tee_type = ?tee_type,
        quote_len = quote.len(),
        "DEV MODE: Skipping real attestation verification"
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

fn generate_mock_quote() -> Option<String> {
    let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true"
        || std::env::var("NODE_ENV").unwrap_or_default() == "production";

    if is_production {
        tracing::error!("generate_mock_quote called in production — TEE hardware required");
        return None;
    }

    // SGX quote structure (simplified) — dev only
    let header = [0x02, 0x00]; // Version 2
    let body = random_bytes::<128>();
    let mut quote = Vec::with_capacity(130);
    quote.extend_from_slice(&header);
    quote.extend_from_slice(&body);
    Some(format!("0x{}", hex::encode(quote)))
}

fn generate_mock_pubkey() -> Option<String> {
    let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true"
        || std::env::var("NODE_ENV").unwrap_or_default() == "production";

    if is_production {
        tracing::error!("generate_mock_pubkey called in production — TEE hardware required");
        return None;
    }

    // P-256 uncompressed public key (65 bytes: 0x04 + X + Y) — dev only
    let mut pubkey = vec![0x04];
    pubkey.extend_from_slice(&random_bytes::<64>());
    Some(format!("0x{}", hex::encode(pubkey)))
}
