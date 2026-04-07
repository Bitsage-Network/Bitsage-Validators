//! WebSocket Streaming
//!
//! Real-time proof progress streaming over WebSocket.
//! Includes bidirectional worker communication via WorkerChannelManager.
//! Integrates with rental marketplace for GPU auto-registration.

use std::sync::Arc;
use std::collections::HashMap;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::{IntoResponse, Response},
    http::{HeaderMap, StatusCode},
};
use futures_util::{SinkExt, StreamExt, stream::SplitSink};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, RwLock};
use uuid::Uuid;

use crate::AppState;
use crate::rental;
use super::types::*;

// ============================================================================
// WebSocket Messages
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    /// Subscribe to proof updates
    Subscribe { request_id: Uuid },

    /// Unsubscribe from proof updates
    Unsubscribe { request_id: Uuid },

    /// Progress update
    Progress {
        request_id: Uuid,
        payload: ProofProgress,
    },

    /// Proof completed
    Completed {
        request_id: Uuid,
        payload: ProofResult,
    },

    /// Error occurred
    Error {
        request_id: Uuid,
        payload: ErrorPayload,
    },

    /// Acknowledgment
    Ack { request_id: Uuid },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub error: String,
}

// ============================================================================
// WebSocket Handler
// ============================================================================

/// Maximum WebSocket message size (1 MB) — prevents memory exhaustion from oversized messages
const MAX_WS_MESSAGE_SIZE: usize = 1024 * 1024;

/// Upgrade HTTP to WebSocket (client proof subscriptions)
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> Response {
    // Validate Origin header (CSRF prevention)
    if let Err(resp) = validate_ws_origin(&headers) {
        return resp;
    }

    ws.max_message_size(MAX_WS_MESSAGE_SIZE)
        .on_upgrade(move |socket| handle_socket(socket, state))
}

/// Handle WebSocket connection
async fn handle_socket(socket: WebSocket, _state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Create channel for sending updates to this connection
    let (tx, mut rx) = broadcast::channel::<WsMessage>(100);

    // Spawn task to forward broadcast messages to WebSocket
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap();
            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    // Track subscriptions — cap to prevent a single connection from subscribing to everything
    const MAX_SUBSCRIPTIONS_PER_CONN: usize = 20;
    let mut subscriptions = std::collections::HashSet::new();

    // Handle incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    match ws_msg {
                        WsMessage::Subscribe { request_id } => {
                            if subscriptions.len() >= MAX_SUBSCRIPTIONS_PER_CONN {
                                tracing::warn!("Client hit subscription limit ({}) — rejecting", MAX_SUBSCRIPTIONS_PER_CONN);
                                continue;
                            }
                            subscriptions.insert(request_id);
                            tracing::debug!(%request_id, "Client subscribed to proof updates");

                            // Send acknowledgment
                            let ack = WsMessage::Ack { request_id };
                            let _ = tx.send(ack);
                        }
                        WsMessage::Unsubscribe { request_id } => {
                            subscriptions.remove(&request_id);
                            tracing::debug!(%request_id, "Client unsubscribed from proof updates");
                        }
                        _ => {}
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Clean up
    send_task.abort();
    tracing::debug!("WebSocket connection closed");
}

// ============================================================================
// Progress Broadcasting
// ============================================================================

/// Broadcast manager for proof progress updates
pub struct ProgressBroadcaster {
    senders: tokio::sync::RwLock<std::collections::HashMap<Uuid, broadcast::Sender<WsMessage>>>,
}

impl ProgressBroadcaster {
    pub fn new() -> Self {
        Self {
            senders: tokio::sync::RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Subscribe to updates for a proof request
    pub async fn subscribe(&self, request_id: Uuid) -> broadcast::Receiver<WsMessage> {
        let mut senders = self.senders.write().await;

        if let Some(sender) = senders.get(&request_id) {
            sender.subscribe()
        } else {
            let (tx, rx) = broadcast::channel(100);
            senders.insert(request_id, tx);
            rx
        }
    }

    /// Send progress update
    pub async fn send_progress(&self, request_id: Uuid, progress: ProofProgress) {
        let senders = self.senders.read().await;

        if let Some(sender) = senders.get(&request_id) {
            let msg = WsMessage::Progress {
                request_id,
                payload: progress,
            };
            let _ = sender.send(msg);
        }
    }

    /// Send completion
    pub async fn send_completed(&self, request_id: Uuid, result: ProofResult) {
        let senders = self.senders.read().await;

        if let Some(sender) = senders.get(&request_id) {
            let msg = WsMessage::Completed {
                request_id,
                payload: result,
            };
            let _ = sender.send(msg);
        }

        // Clean up subscription
        drop(senders);
        self.senders.write().await.remove(&request_id);
    }

    /// Send error
    pub async fn send_error(&self, request_id: Uuid, error: String) {
        let senders = self.senders.read().await;

        if let Some(sender) = senders.get(&request_id) {
            let msg = WsMessage::Error {
                request_id,
                payload: ErrorPayload { error },
            };
            let _ = sender.send(msg);
        }

        // Clean up subscription
        drop(senders);
        self.senders.write().await.remove(&request_id);
    }

    /// Check if request has subscribers
    pub async fn has_subscribers(&self, request_id: &Uuid) -> bool {
        let senders = self.senders.read().await;

        if let Some(sender) = senders.get(request_id) {
            sender.receiver_count() > 0
        } else {
            false
        }
    }
}

impl Default for ProgressBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Worker Channel Manager - Bidirectional Worker Communication
// ============================================================================

/// Manages WebSocket channels to connected workers for bidirectional communication.
/// This allows the coordinator to send commands (deployments, jobs) to workers.
pub struct WorkerChannelManager {
    /// Map of worker_id -> channel sender
    /// We use mpsc channels because the WebSocket sender isn't Send/Sync
    channels: RwLock<HashMap<String, mpsc::Sender<WorkerWsMessage>>>,
}

impl WorkerChannelManager {
    pub fn new() -> Self {
        Self {
            channels: RwLock::new(HashMap::new()),
        }
    }

    /// Register a worker's channel when they connect
    pub async fn register(&self, worker_id: String, sender: mpsc::Sender<WorkerWsMessage>) {
        let mut channels = self.channels.write().await;
        tracing::info!(worker_id = %worker_id, "Registering worker channel for bidirectional communication");
        channels.insert(worker_id, sender);
    }

    /// Unregister a worker's channel when they disconnect
    pub async fn unregister(&self, worker_id: &str) {
        let mut channels = self.channels.write().await;
        if channels.remove(worker_id).is_some() {
            tracing::info!(worker_id = %worker_id, "Unregistered worker channel");
        }
    }

    /// Send a message to a specific worker
    pub async fn send_to_worker(&self, worker_id: &str, message: WorkerWsMessage) -> Result<(), WorkerChannelError> {
        let channels = self.channels.read().await;

        if let Some(sender) = channels.get(worker_id) {
            sender.send(message).await
                .map_err(|_| WorkerChannelError::SendFailed(worker_id.to_string()))?;
            Ok(())
        } else {
            Err(WorkerChannelError::WorkerNotConnected(worker_id.to_string()))
        }
    }

    /// Send a workload deployment command to a worker
    pub async fn send_deployment(&self, worker_id: &str, deployment_id: Uuid, workload_id: String, workload_name: String, image: String, config: serde_json::Value) -> Result<(), WorkerChannelError> {
        let message = WorkerWsMessage::WorkloadDeploy {
            deployment_id,
            workload_id,
            workload_name,
            image,
            config,
        };

        tracing::info!(
            worker_id = %worker_id,
            deployment_id = %deployment_id,
            "Sending deployment command to worker"
        );

        self.send_to_worker(worker_id, message).await
    }

    /// Send a workload stop command to a worker
    pub async fn send_stop(&self, worker_id: &str, deployment_id: Uuid) -> Result<(), WorkerChannelError> {
        let message = WorkerWsMessage::WorkloadStop { deployment_id };

        tracing::info!(
            worker_id = %worker_id,
            deployment_id = %deployment_id,
            "Sending stop command to worker"
        );

        self.send_to_worker(worker_id, message).await
    }

    /// Send a job assignment to a worker
    pub async fn send_job(&self, worker_id: &str, job_id: Uuid, circuit: CircuitType, witness_url: String, deadline: i64) -> Result<(), WorkerChannelError> {
        let message = WorkerWsMessage::JobAssignment {
            job_id,
            circuit,
            witness_url,
            deadline,
        };

        tracing::info!(
            worker_id = %worker_id,
            job_id = %job_id,
            "Sending job assignment to worker"
        );

        self.send_to_worker(worker_id, message).await
    }

    /// Check if a worker is connected
    pub async fn is_connected(&self, worker_id: &str) -> bool {
        let channels = self.channels.read().await;
        channels.contains_key(worker_id)
    }

    /// Get list of connected worker IDs
    pub async fn connected_workers(&self) -> Vec<String> {
        let channels = self.channels.read().await;
        channels.keys().cloned().collect()
    }

    /// Get count of connected workers
    pub async fn connection_count(&self) -> usize {
        let channels = self.channels.read().await;
        channels.len()
    }

    /// Send a rental start command to a worker
    pub async fn send_rental_start(
        &self,
        worker_id: &str,
        rental_id: Uuid,
        template_id: String,
        image: String,
        ssh_public_key: Option<String>,
        config: serde_json::Value,
    ) -> Result<(), WorkerChannelError> {
        let message = WorkerWsMessage::RentalStart {
            rental_id,
            template_id,
            image,
            ssh_public_key,
            config,
        };

        tracing::info!(
            worker_id = %worker_id,
            rental_id = %rental_id,
            "Sending rental start command to worker"
        );

        self.send_to_worker(worker_id, message).await
    }

    /// Send a rental stop command to a worker
    pub async fn send_rental_stop(&self, worker_id: &str, rental_id: Uuid) -> Result<(), WorkerChannelError> {
        let message = WorkerWsMessage::RentalStop { rental_id };

        tracing::info!(
            worker_id = %worker_id,
            rental_id = %rental_id,
            "Sending rental stop command to worker"
        );

        self.send_to_worker(worker_id, message).await
    }
}

impl Default for WorkerChannelManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur when communicating with workers
#[derive(Debug, thiserror::Error)]
pub enum WorkerChannelError {
    #[error("Worker not connected: {0}")]
    WorkerNotConnected(String),

    #[error("Failed to send message to worker: {0}")]
    SendFailed(String),
}

// ============================================================================
// Worker WebSocket Handler
// ============================================================================

/// Worker WebSocket messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerWsMessage {
    /// Worker registration
    Register {
        worker_id: String,
        worker_type: String,
        capabilities: WorkerCapabilities,
    },

    /// Heartbeat from worker
    Heartbeat {
        worker_id: String,
        current_load: u32,
        is_healthy: bool,
    },

    /// Job assignment from coordinator
    JobAssignment {
        job_id: Uuid,
        circuit: super::types::CircuitType,
        witness_url: String,
        deadline: i64,
    },

    /// Job progress from worker
    JobProgress {
        job_id: Uuid,
        phase: super::types::ProofPhase,
        progress: u8,
    },

    /// Job completion from worker
    JobComplete {
        job_id: Uuid,
        success: bool,
        proof: Option<super::types::STWOProof>,
        error: Option<String>,
        generation_time_ms: u64,
    },

    /// Job cancellation
    JobCancel {
        job_id: Uuid,
    },

    /// Acknowledgment
    Ack {
        message_id: String,
    },

    /// Error
    Error {
        message: String,
    },

    // =========================================================================
    // Workload Deployment Messages
    // =========================================================================

    /// Workload deployment command (Coordinator -> Worker)
    WorkloadDeploy {
        deployment_id: Uuid,
        workload_id: String,
        workload_name: String,
        image: String,
        config: serde_json::Value,
    },

    /// Workload status update (Worker -> Coordinator)
    WorkloadStatus {
        deployment_id: Uuid,
        status: super::workload_types::DeploymentStatus,
        progress: Option<super::workload_types::DeploymentProgress>,
        error: Option<String>,
    },

    /// Stop workload command (Coordinator -> Worker)
    WorkloadStop {
        deployment_id: Uuid,
    },

    // =========================================================================
    // Rental Session Messages
    // =========================================================================

    /// Start rental session command (Coordinator -> Worker)
    RentalStart {
        rental_id: Uuid,
        template_id: String,
        image: String,
        ssh_public_key: Option<String>,
        config: serde_json::Value,
    },

    /// Rental status update (Worker -> Coordinator)
    RentalStatus {
        rental_id: Uuid,
        status: String, // provisioning, running, stopping, stopped, failed
        container_id: Option<String>,
        ssh_port: Option<u16>,
        jupyter_port: Option<u16>,
        api_port: Option<u16>,
        error: Option<String>,
    },

    /// Stop rental command (Coordinator -> Worker)
    RentalStop {
        rental_id: Uuid,
    },

    /// Update GPU availability for marketplace
    GpuAvailabilityUpdate {
        gpu_id: String,
        availability: String, // available, in_use, offline
        current_workload: Option<String>,
        available_in_minutes: Option<u32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerCapabilities {
    pub gpu_backend: Option<String>,
    pub tee_type: Option<String>,
    pub max_concurrent_jobs: u32,
    pub supported_circuits: Vec<String>,
    /// GPU model name (e.g., "NVIDIA RTX 4090")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_model: Option<String>,
    /// VRAM in GB
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_gb: Option<u32>,
    /// Wallet address of the validator who owns this worker
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_address: Option<String>,
}

/// Allowed WebSocket Origin domains (production)
const ALLOWED_WS_ORIGINS: &[&str] = &[
    "https://bitsage.network",
    "https://obelysk.bitsage.network",
    "https://app.bitsage.network",
];

/// Validate the Origin header on WebSocket upgrade requests (CSRF prevention).
/// Returns Ok(()) if allowed, Err(Response) if rejected.
fn validate_ws_origin(headers: &HeaderMap) -> Result<(), Response> {
    let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
    if !is_production {
        return Ok(());
    }

    let origin = match headers.get("origin").and_then(|v| v.to_str().ok()) {
        Some(o) => o,
        None => {
            // No Origin header — allow for non-browser clients (workers, CLI)
            return Ok(());
        }
    };

    // Check configured origins, falling back to the built-in list
    let allowed_env = std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_default();
    let extra: Vec<&str> = allowed_env.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

    if ALLOWED_WS_ORIGINS.iter().any(|a| *a == origin)
        || extra.iter().any(|a| *a == origin)
    {
        return Ok(());
    }

    tracing::warn!(origin = %origin, "WebSocket upgrade rejected: origin not allowed");
    Err((StatusCode::FORBIDDEN, "Origin not allowed").into_response())
}

/// WebSocket handler for workers (requires API key via X-API-Key header in production)
pub async fn worker_websocket_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<Arc<crate::AppState>>,
) -> Response {
    // Validate Origin header (CSRF prevention)
    if let Err(resp) = validate_ws_origin(&headers) {
        return resp;
    }

    // Validate worker API key from header (NOT query string — avoids leaking key in logs/URLs)
    let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
    if is_production {
        let api_key = match headers.get("X-API-Key").and_then(|v| v.to_str().ok()) {
            Some(k) => k,
            None => {
                tracing::warn!("Worker WebSocket connection rejected: missing X-API-Key header");
                return (StatusCode::UNAUTHORIZED, "Missing X-API-Key header").into_response();
            }
        };
        if !state.auth.validate_worker_api_key(api_key) {
            tracing::warn!("Worker WebSocket connection rejected: invalid API key");
            return (StatusCode::FORBIDDEN, "Invalid API key").into_response();
        }
    }

    ws.max_message_size(MAX_WS_MESSAGE_SIZE)
        .on_upgrade(move |socket| handle_worker_socket(socket, state))
}

/// Handle worker WebSocket connection with bidirectional communication
async fn handle_worker_socket(socket: WebSocket, state: Arc<crate::AppState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Create channel for coordinator -> worker messages
    let (outbound_tx, mut outbound_rx) = mpsc::channel::<WorkerWsMessage>(100);

    let mut worker_id: Option<String> = None;

    // Spawn task to forward outbound messages to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = outbound_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!(error = %e, "Failed to serialize outbound message");
                    continue;
                }
            };
            if ws_sender.send(Message::Text(json)).await.is_err() {
                tracing::debug!("WebSocket send failed, closing connection");
                break;
            }
        }
    });

    // We need a separate sender for the registration ack since the main sender is moved
    let ack_tx = outbound_tx.clone();

    // Handle incoming messages from worker
    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(ws_msg) = serde_json::from_str::<WorkerWsMessage>(&text) {
                    match ws_msg {
                        WorkerWsMessage::Register {
                            worker_id: id,
                            worker_type,
                            capabilities,
                        } => {
                            // Prevent re-registration on same connection (identity swap attack)
                            if let Some(ref existing_id) = worker_id {
                                tracing::warn!(
                                    existing_id = %existing_id,
                                    new_id = %id,
                                    "Worker attempted re-registration on same connection — rejecting"
                                );
                                let err = WorkerWsMessage::Error {
                                    message: "Already registered on this connection. Reconnect to change identity.".to_string(),
                                };
                                let _ = ack_tx.send(err).await;
                                continue;
                            }

                            worker_id = Some(id.clone());
                            tracing::info!(
                                worker_id = %id,
                                worker_type = %worker_type,
                                "Worker connected via WebSocket"
                            );

                            // Register worker based on type
                            if worker_type == "gpu" {
                                let gpu_backend = match capabilities.gpu_backend.as_deref() {
                                    Some("cuda") => super::types::GpuBackend::Cuda,
                                    Some("metal") => super::types::GpuBackend::Metal,
                                    _ => super::types::GpuBackend::Cuda,
                                };

                                let worker = super::types::GpuWorker {
                                    id: id.clone(),
                                    address: format!("ws://{}", id),
                                    gpu_backend,
                                    capacity: capabilities.max_concurrent_jobs,
                                    current_load: 0,
                                    latency_ms: 0,
                                    gpu_model: capabilities.gpu_model.clone(),
                                    vram_gb: capabilities.vram_gb,
                                    owner_address: capabilities.owner_address.clone(),
                                    active_workload: None,
                                };
                                state.workers.register_gpu_worker(worker).await;

                                // Auto-register GPU on the rental marketplace if owner info is provided
                                if let Some(owner_wallet) = &capabilities.owner_address {
                                    if let (Some(gpu_model), Some(vram_gb)) = (&capabilities.gpu_model, capabilities.vram_gb) {
                                        let rental_gpu = rental::MarketplaceGpu {
                                            id: id.clone(),
                                            validator_wallet: owner_wallet.clone(),
                                            gpu_model: gpu_model.clone(),
                                            vram_gb,
                                            backend: match gpu_backend {
                                                super::types::GpuBackend::Cuda => rental::GpuBackend::Cuda,
                                                super::types::GpuBackend::Metal => rental::GpuBackend::Metal,
                                                super::types::GpuBackend::Vulkan => rental::GpuBackend::Vulkan,
                                            },
                                            mig_capable: gpu_model.contains("H100") || gpu_model.contains("A100"),
                                            availability: rental::GpuAvailability::Available,
                                            rate_sage_per_hour: calculate_default_rate(vram_gb),
                                            uptime_percent: 100.0,
                                            total_rentals: 0,
                                            rating: 5.0,
                                            region: None,
                                            supported_templates: get_supported_templates(vram_gb),
                                        };

                                        state.rentals.register_gpu(rental_gpu).await;
                                        tracing::info!(
                                            worker_id = %id,
                                            gpu_model = %gpu_model,
                                            vram_gb = vram_gb,
                                            validator = %owner_wallet,
                                            "Auto-registered GPU on rental marketplace"
                                        );
                                    }
                                }
                            } else if worker_type == "tee" {
                                let enclave = super::types::TeeEnclave {
                                    id: id.clone(),
                                    address: format!("ws://{}", id),
                                    tee_type: match capabilities.tee_type.as_deref() {
                                        Some("tdx") => super::types::TeeType::Tdx,
                                        Some("sgx") => super::types::TeeType::Sgx,
                                        Some("sev") => super::types::TeeType::Sev,
                                        _ => super::types::TeeType::Sgx,
                                    },
                                    measurement: String::new(),
                                    is_healthy: true,
                                    last_attestation: chrono::Utc::now().timestamp(),
                                };
                                state.workers.register_tee_enclave(enclave).await;
                            }

                            // Register the channel for bidirectional communication
                            state.worker_channels.register(id.clone(), outbound_tx.clone()).await;

                            // Send acknowledgment
                            let ack = WorkerWsMessage::Ack {
                                message_id: id,
                            };
                            let _ = ack_tx.send(ack).await;
                        }

                        WorkerWsMessage::Heartbeat {
                            worker_id: id,
                            current_load,
                            is_healthy,
                        } => {
                            // Verify the heartbeat is from the registered worker on this connection
                            if let Some(ref registered_id) = worker_id {
                                if &id != registered_id {
                                    tracing::warn!(
                                        claimed_id = %id,
                                        registered_id = %registered_id,
                                        "Worker sent heartbeat with mismatched ID — ignoring (possible impersonation)"
                                    );
                                    continue;
                                }
                            } else {
                                tracing::warn!(
                                    claimed_id = %id,
                                    "Heartbeat received before registration — ignoring"
                                );
                                continue;
                            }

                            tracing::debug!(
                                worker_id = %id,
                                current_load = %current_load,
                                "Worker heartbeat received"
                            );
                            state.workers.update_worker_status(&id, current_load, is_healthy).await;
                        }

                        WorkerWsMessage::JobProgress {
                            job_id,
                            phase,
                            progress,
                        } => {
                            // Clamp progress to valid range
                            let progress = progress.min(100);

                            // Verify this worker is assigned to the job
                            let authorized = {
                                let proofs = state.proofs.read().await;
                                if let Some(job) = proofs.get_pending(&job_id) {
                                    job.worker_id.as_ref() == worker_id.as_ref()
                                } else {
                                    false
                                }
                            };

                            if !authorized {
                                tracing::warn!(
                                    job_id = %job_id,
                                    sender = ?worker_id,
                                    "JobProgress from worker not assigned to this job — ignoring"
                                );
                                continue;
                            }

                            tracing::debug!(
                                job_id = %job_id,
                                phase = ?phase,
                                progress = %progress,
                                "Job progress update"
                            );

                            // Update proof state with progress
                            {
                                let mut proofs = state.proofs.write().await;
                                if let Some(job) = proofs.get_pending_mut(&job_id) {
                                    job.progress = Some(super::types::ProofProgress {
                                        phase,
                                        progress,
                                        overall_progress: progress,
                                        estimated_time_ms: None,
                                        fri_round: None,
                                        fri_foldings: None,
                                    });
                                    job.status = super::types::ProofJobStatus::Proving;
                                }
                            }
                        }

                        WorkerWsMessage::JobComplete {
                            job_id,
                            success,
                            proof,
                            error,
                            generation_time_ms,
                        } => {
                            // Look up the original job to get the correct circuit type and worker info
                            let (circuit, completed_worker_id) = {
                                let proofs = state.proofs.read().await;
                                if let Some(job) = proofs.get_pending(&job_id) {
                                    // Verify sender is the assigned worker
                                    if job.worker_id.as_ref() != worker_id.as_ref() {
                                        tracing::warn!(
                                            job_id = %job_id,
                                            sender = ?worker_id,
                                            assigned = ?job.worker_id,
                                            "JobComplete from worker not assigned to this job — ignoring"
                                        );
                                        continue;
                                    }
                                    (job.circuit, job.worker_id.clone())
                                } else {
                                    tracing::warn!(
                                        job_id = %job_id,
                                        "JobComplete for unknown/already-completed job — ignoring"
                                    );
                                    continue;
                                }
                            };

                            tracing::info!(
                                job_id = %job_id,
                                success = %success,
                                generation_time_ms = %generation_time_ms,
                                circuit = ?circuit,
                                worker = ?completed_worker_id,
                                "Job completed"
                            );

                            if success {
                                if let Some(proof) = proof {
                                    let result = super::types::ProofResult {
                                        id: job_id,
                                        circuit,
                                        proof,
                                        public_inputs: serde_json::Value::Null,
                                        mode: super::types::ProofMode::WorkerGpu,
                                        timestamp: chrono::Utc::now().timestamp(),
                                        generation_time_ms,
                                        attestation: None,
                                    };

                                    let mut proofs = state.proofs.write().await;
                                    proofs.complete(job_id, result);

                                    // Credit SAGE earnings to the worker's validator
                                    if let Some(ref wid) = completed_worker_id {
                                        if let Some(gpu_worker) = state.workers.get_gpu_worker(wid).await {
                                            if let Some(ref owner) = gpu_worker.owner_address {
                                                // Calculate reward based on circuit complexity and time
                                                let reward_sage = calculate_proof_reward(circuit, generation_time_ms);
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
                                                            "Failed to persist proof earnings to DB"
                                                        );
                                                    }
                                                }

                                                tracing::info!(
                                                    job_id = %job_id,
                                                    validator = %owner,
                                                    reward_sage = reward_sage,
                                                    "Credited SAGE proof reward to validator"
                                                );
                                            }
                                        }
                                    }
                                }
                            } else {
                                tracing::error!(
                                    job_id = %job_id,
                                    error = ?error,
                                    "Job failed"
                                );
                            }
                        }

                        WorkerWsMessage::WorkloadStatus {
                            deployment_id,
                            status,
                            progress,
                            error,
                        } => {
                            tracing::info!(
                                deployment_id = %deployment_id,
                                status = ?status,
                                "Workload status update from worker"
                            );

                            // Update deployment status via the deployments state
                            state.deployments.update_status(
                                &deployment_id,
                                status.clone(),
                                progress,
                                error.clone(),
                            ).await;

                            // If ready, update worker's active workload confirmation
                            if status == super::workload_types::DeploymentStatus::Ready {
                                if let Some(deployment) = state.deployments.get(&deployment_id).await {
                                    tracing::info!(
                                        deployment_id = %deployment_id,
                                        workload = %deployment.workload_id,
                                        "Workload is ready on worker"
                                    );
                                }
                            }

                            // If failed or stopped, clear worker's active workload
                            if matches!(
                                status,
                                super::workload_types::DeploymentStatus::Failed
                                    | super::workload_types::DeploymentStatus::Stopped
                            ) {
                                if let Some(deployment) = state.deployments.get(&deployment_id).await {
                                    state.workers.set_worker_active_workload(
                                        &deployment.worker_id,
                                        None,
                                    ).await;
                                }
                            }
                        }

                        _ => {}
                    }
                }
            }
            Message::Close(_) => {
                if let Some(id) = &worker_id {
                    tracing::info!(worker_id = %id, "Worker disconnected");

                    // Clean up deployments - mark active ones as failed
                    let affected = state.deployments.handle_worker_disconnect(id).await;
                    if !affected.is_empty() {
                        tracing::warn!(
                            worker_id = %id,
                            affected_count = affected.len(),
                            "Marked {} deployments as failed due to worker disconnect",
                            affected.len()
                        );
                    }

                    // Clear worker's active workload
                    state.workers.set_worker_active_workload(id, None).await;

                    // Update GPU availability on rental marketplace to Offline
                    state.rentals.update_gpu_availability(id, rental::GpuAvailability::Offline).await;

                    // Deregister worker and channel
                    state.workers.deregister_worker(id).await;
                    state.worker_channels.unregister(id).await;
                }
                break;
            }
            _ => {}
        }
    }

    // Clean up on disconnect
    send_task.abort();
    if let Some(id) = &worker_id {
        // Clean up deployments - mark active ones as failed
        let affected = state.deployments.handle_worker_disconnect(id).await;
        if !affected.is_empty() {
            tracing::warn!(
                worker_id = %id,
                affected_count = affected.len(),
                "Marked {} deployments as failed due to worker disconnect (cleanup)",
                affected.len()
            );
        }

        // Clear worker's active workload
        state.workers.set_worker_active_workload(id, None).await;

        // Update GPU availability on rental marketplace to Offline
        state.rentals.update_gpu_availability(id, rental::GpuAvailability::Offline).await;

        // Deregister worker and channel
        state.workers.deregister_worker(id).await;
        state.worker_channels.unregister(id).await;
    }
    tracing::debug!("Worker WebSocket connection closed");
}

// ============================================================================
// Rental Marketplace Helper Functions
// ============================================================================

/// Calculate SAGE reward for a completed proof (public alias for REST handlers)
pub fn calculate_proof_reward_for_billing(circuit: super::types::CircuitType, generation_time_ms: u64) -> u64 {
    calculate_proof_reward(circuit, generation_time_ms)
}

/// Calculate SAGE reward for a completed proof based on circuit type and generation time
fn calculate_proof_reward(circuit: super::types::CircuitType, generation_time_ms: u64) -> u64 {
    use super::types::CircuitType;

    // Base reward in SAGE (smallest unit) per circuit type
    let base_reward: u64 = match circuit {
        CircuitType::AiInference => 10,
        CircuitType::DataPipeline => 8,
        CircuitType::MlTraining => 25,
        CircuitType::GenericCompute => 5,
        CircuitType::PrivacyWithdraw => 8,
        CircuitType::PrivacyTransfer => 10,
        CircuitType::ConfidentialSwap => 12,
        CircuitType::MerkleMembership => 3,
        CircuitType::RangeProof => 3,
    };

    // Time multiplier: longer proofs get slightly more (capped at 3x)
    let time_secs = (generation_time_ms / 1000).max(1);
    let time_multiplier = (time_secs as f64 / 5.0).min(3.0).max(1.0);

    (base_reward as f64 * time_multiplier) as u64
}

/// Calculate default SAGE rate per hour based on VRAM
fn calculate_default_rate(vram_gb: u32) -> u64 {
    // Base rate tiers by VRAM (in SAGE tokens, smallest unit)
    match vram_gb {
        0..=8 => 25,      // Entry-level (RTX 3060, etc.)
        9..=12 => 35,     // Mid-range (RTX 3080, etc.)
        13..=24 => 50,    // High-end (RTX 4090, etc.)
        25..=48 => 80,    // Professional (A100 40GB, etc.)
        _ => 120,         // Datacenter (A100 80GB, H100, etc.)
    }
}

/// Get list of supported templates based on VRAM
fn get_supported_templates(vram_gb: u32) -> Vec<String> {
    let mut templates = Vec::new();

    // Base templates that work on any GPU
    if vram_gb >= 8 {
        templates.push("stwo-prover-dev".to_string());
        templates.push("whisper-transcribe".to_string());
        templates.push("jupyter-ml".to_string());
    }

    // Mid-tier templates
    if vram_gb >= 12 {
        templates.push("comfyui-studio".to_string());
    }

    // High-end templates
    if vram_gb >= 24 {
        templates.push("llama-3.2-dev".to_string());
    }

    templates
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_progress_broadcaster() {
        let broadcaster = ProgressBroadcaster::new();
        let request_id = Uuid::new_v4();

        let mut rx = broadcaster.subscribe(request_id).await;

        // Send progress
        let progress = ProofProgress {
            phase: ProofPhase::Fri,
            progress: 50,
            overall_progress: 75,
            estimated_time_ms: Some(2000),
            fri_round: Some(3),
            fri_foldings: Some(8),
        };

        broadcaster.send_progress(request_id, progress.clone()).await;

        // Receive
        let msg = rx.recv().await.unwrap();
        match msg {
            WsMessage::Progress { request_id: id, payload } => {
                assert_eq!(id, request_id);
                assert_eq!(payload.progress, 50);
            }
            _ => panic!("Expected progress message"),
        }
    }
}
