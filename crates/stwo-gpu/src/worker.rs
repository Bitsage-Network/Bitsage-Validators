//! GPU Worker Service
//!
//! Standalone service that:
//! 1. Registers with the coordinator
//! 2. Receives proof jobs via WebSocket
//! 3. Executes STWO GPU proofs
//! 4. Returns results to coordinator
//! 5. Handles workload deployments (Docker containers)

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tokio::time::interval;
use tokio::process::Command;
use tracing::{debug, error, info, warn};

use crate::prover::{GpuProver, ProverConfig};
use crate::types::{Circuit, Proof, Witness};
use crate::{GpuBackend, GpuError};

/// Worker configuration
#[derive(Debug, Clone)]
pub struct WorkerConfig {
    pub worker_id: String,
    pub coordinator_url: String,
    pub ws_url: String,
    pub gpu_backend: GpuBackend,
    pub max_concurrent_jobs: usize,
    pub heartbeat_interval_secs: u64,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        // Allow configuration via environment variables for production deployments
        let coordinator_host = std::env::var("COORDINATOR_HOST")
            .unwrap_or_else(|_| "localhost".to_string());
        let coordinator_port = std::env::var("COORDINATOR_PORT")
            .unwrap_or_else(|_| "3030".to_string());

        let coordinator_url = std::env::var("COORDINATOR_URL")
            .unwrap_or_else(|_| format!("http://{}:{}", coordinator_host, coordinator_port));

        let ws_url = std::env::var("COORDINATOR_WS_URL")
            .unwrap_or_else(|_| format!("ws://{}:{}/ws/worker", coordinator_host, coordinator_port));

        Self {
            worker_id: std::env::var("WORKER_ID")
                .unwrap_or_else(|_| format!("gpu-worker-{}", uuid::Uuid::new_v4())),
            coordinator_url,
            ws_url,
            gpu_backend: GpuBackend::detect(),
            max_concurrent_jobs: std::env::var("MAX_CONCURRENT_JOBS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4),
            heartbeat_interval_secs: std::env::var("HEARTBEAT_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
        }
    }
}

/// Job received from coordinator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofJob {
    pub job_id: String,
    pub circuit_id: u32,
    pub circuit_type: String,
    pub witness: serde_json::Value,
    pub deadline: i64,
    pub priority: u32,
}

/// Job result to send back
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResult {
    pub job_id: String,
    pub worker_id: String,
    pub status: JobStatus,
    pub proof: Option<serde_json::Value>,
    pub error: Option<String>,
    pub generation_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

// ============================================================================
// Workload Deployment Types
// ============================================================================

/// Workload deployment command from coordinator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadDeployCommand {
    pub deployment_id: String,
    pub workload_id: String,
    pub workload_name: String,
    pub image: String,
    pub config: serde_json::Value,
}

/// Workload stop command from coordinator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkloadStopCommand {
    pub deployment_id: String,
}

/// Status of a deployed workload
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    Queued,
    Initializing,
    Pulling,
    Starting,
    Ready,
    Stopping,
    Stopped,
    Failed,
}

/// Progress information for deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentProgress {
    pub phase: String,
    pub percent: u8,
    pub message: Option<String>,
}

/// Active workload state
#[derive(Debug, Clone)]
pub struct ActiveWorkload {
    pub deployment_id: String,
    pub workload_id: String,
    pub workload_name: String,
    pub image: String,
    pub container_id: Option<String>,
    pub status: DeploymentStatus,
    pub started_at: Instant,
}

/// Worker metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerMetrics {
    pub worker_id: String,
    pub gpu_backend: String,
    pub current_load: u32,
    pub capacity: u32,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub avg_proof_time_ms: u64,
    pub gpu_memory_used_mb: u64,
    pub gpu_memory_total_mb: u64,
    pub gpu_utilization_pct: u32,
    pub uptime_secs: u64,
}

/// Worker state
struct WorkerState {
    config: WorkerConfig,
    prover: GpuProver,
    current_jobs: usize,
    jobs_completed: u64,
    jobs_failed: u64,
    total_proof_time_ms: u64,
    start_time: Instant,
    /// Active workload deployments (deployment_id -> ActiveWorkload)
    active_workloads: HashMap<String, ActiveWorkload>,
}

/// GPU Worker Service
pub struct GpuWorker {
    state: Arc<RwLock<WorkerState>>,
    job_tx: mpsc::Sender<ProofJob>,
    result_rx: mpsc::Receiver<JobResult>,
    /// Channel to send messages back to coordinator via WebSocket
    ws_outbound_tx: Option<mpsc::Sender<String>>,
}

impl GpuWorker {
    /// Create a new GPU worker
    pub fn new(config: WorkerConfig) -> Result<Self, GpuError> {
        let prover_config = ProverConfig {
            backend: config.gpu_backend,
            max_batch_size: 1024,
            log_blowup: 4,
            num_fri_layers: 12,
            num_queries: 128,
        };

        let prover = GpuProver::new(prover_config)?;

        let state = Arc::new(RwLock::new(WorkerState {
            config: config.clone(),
            prover,
            current_jobs: 0,
            jobs_completed: 0,
            jobs_failed: 0,
            total_proof_time_ms: 0,
            start_time: Instant::now(),
            active_workloads: HashMap::new(),
        }));

        let (job_tx, job_rx) = mpsc::channel(config.max_concurrent_jobs * 2);
        let (result_tx, result_rx) = mpsc::channel(config.max_concurrent_jobs * 2);

        // Spawn job processor
        let state_clone = state.clone();
        tokio::spawn(async move {
            Self::job_processor(state_clone, job_rx, result_tx).await;
        });

        Ok(Self {
            state,
            job_tx,
            result_rx,
            ws_outbound_tx: None,
        })
    }

    /// Start the worker service
    pub async fn start(&mut self) -> Result<(), GpuError> {
        let config = self.state.read().await.config.clone();

        info!(
            worker_id = %config.worker_id,
            coordinator = %config.coordinator_url,
            backend = ?config.gpu_backend,
            "Starting GPU worker"
        );

        // Register with coordinator
        self.register().await?;

        // Start heartbeat task
        let state = self.state.clone();
        let coordinator_url = config.coordinator_url.clone();
        let heartbeat_interval = config.heartbeat_interval_secs;
        tokio::spawn(async move {
            Self::heartbeat_loop(state, coordinator_url, heartbeat_interval).await;
        });

        // Connect to WebSocket for jobs
        self.connect_ws().await?;

        Ok(())
    }

    /// Register worker with coordinator
    async fn register(&self) -> Result<(), GpuError> {
        let state = self.state.read().await;
        let _metrics = self.get_metrics_internal(&state);

        // Worker's own address - configurable for when workers run on different hosts
        let worker_host = std::env::var("WORKER_HOST")
            .unwrap_or_else(|_| "localhost".to_string());
        let worker_port = std::env::var("WORKER_PORT")
            .unwrap_or_else(|_| "3040".to_string());
        let worker_address = std::env::var("WORKER_ADDRESS")
            .unwrap_or_else(|_| format!("http://{}:{}", worker_host, worker_port));

        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/api/v1/workers/gpu/register", state.config.coordinator_url))
            .json(&serde_json::json!({
                "worker_id": state.config.worker_id,
                "address": worker_address,
                "gpu_backend": format!("{:?}", state.config.gpu_backend).to_lowercase(),
                "capacity": state.config.max_concurrent_jobs,
                "gpu_model": Self::detect_gpu_model(),
                "vram_gb": Self::get_gpu_memory_total() / 1024,
                "owner_address": std::env::var("OWNER_ADDRESS").ok(),
            }))
            .send()
            .await
            .map_err(|e| GpuError::DeviceError(format!("Registration failed: {}", e)))?;

        if response.status().is_success() {
            info!(address = %worker_address, "Successfully registered with coordinator");
            Ok(())
        } else {
            let error = response.text().await.unwrap_or_default();
            Err(GpuError::DeviceError(format!("Registration rejected: {}", error)))
        }
    }

    /// Detect GPU model name
    fn detect_gpu_model() -> String {
        // TODO: Use CUDA/Metal APIs to get actual model
        #[cfg(feature = "cuda")]
        {
            // Would use cudaGetDeviceProperties
            "NVIDIA GPU".to_string()
        }
        #[cfg(not(feature = "cuda"))]
        {
            "Unknown GPU".to_string()
        }
    }

    /// Connect to coordinator WebSocket for job streaming with auto-reconnect
    /// Handles both proof jobs AND workload deployment commands
    async fn connect_ws(&mut self) -> Result<(), GpuError> {
        use tokio_tungstenite::{connect_async, tungstenite::Message};
        use futures_util::{SinkExt, StreamExt};

        let state = self.state.read().await;
        let ws_url = format!("{}/ws/worker?id={}",
            state.config.ws_url.replace("http", "ws"),
            state.config.worker_id
        );
        let worker_id = state.config.worker_id.clone();
        let max_concurrent = state.config.max_concurrent_jobs as u32;
        let gpu_model = Self::detect_gpu_model();
        let vram_gb = Self::get_gpu_memory_total() / 1024;
        let owner_address = std::env::var("OWNER_ADDRESS").ok();
        drop(state);

        info!(url = %ws_url, "Connecting to coordinator WebSocket");

        let (ws_stream, _) = connect_async(&ws_url)
            .await
            .map_err(|e| GpuError::DeviceError(format!("WebSocket connection failed: {}", e)))?;

        let (mut write, mut read) = ws_stream.split();

        // Register via WebSocket with full capabilities
        let register_msg = serde_json::json!({
            "type": "register",
            "worker_id": worker_id,
            "worker_type": "gpu",
            "capabilities": {
                "gpu_backend": "cuda",
                "max_concurrent_jobs": max_concurrent,
                "supported_circuits": ["ai_inference", "data_pipeline", "ml_training", "generic_compute"],
                "gpu_model": gpu_model,
                "vram_gb": vram_gb,
                "owner_address": owner_address
            }
        });
        write
            .send(Message::Text(register_msg.to_string()))
            .await
            .map_err(|e| GpuError::DeviceError(format!("Registration failed: {}", e)))?;

        // Create channel for sending messages back to coordinator
        let (ws_tx, mut ws_rx) = mpsc::channel::<String>(100);
        self.ws_outbound_tx = Some(ws_tx.clone());

        let job_tx = self.job_tx.clone();
        let state = self.state.clone();
        let ws_url_clone = ws_url.clone();
        let worker_id_clone = worker_id.clone();

        // Spawn task to handle outbound messages (worker -> coordinator)
        let outbound_state = state.clone();
        let outbound_ws_tx = ws_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = ws_rx.recv().await {
                // This would need the write half, but we'll use HTTP for now
                // or restructure to share the write half
                debug!(msg = %msg, "Outbound message queued (using HTTP fallback)");
            }
        });

        // Handle incoming messages with auto-reconnect
        tokio::spawn(async move {
            let mut reconnect_delay = Duration::from_secs(1);
            let max_reconnect_delay = Duration::from_secs(60);

            loop {
                while let Some(msg) = read.next().await {
                    reconnect_delay = Duration::from_secs(1); // Reset on successful message

                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Ok(ws_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                let msg_type = ws_msg.get("type").and_then(|t| t.as_str());

                                match msg_type {
                                    // Handle proof job assignment
                                    Some("job_assignment") => {
                                        if let Ok(job) = serde_json::from_value::<ProofJob>(ws_msg) {
                                            debug!(job_id = %job.job_id, "Received proof job from WebSocket");
                                            if job_tx.send(job).await.is_err() {
                                                error!("Job channel closed");
                                                return;
                                            }
                                        }
                                    }

                                    // Handle workload deployment command
                                    Some("workload_deploy") => {
                                        info!("Received workload_deploy command");
                                        let deployment_id = ws_msg.get("deployment_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let workload_id = ws_msg.get("workload_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let workload_name = ws_msg.get("workload_name")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let image = ws_msg.get("image")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let config = ws_msg.get("config")
                                            .cloned()
                                            .unwrap_or(serde_json::Value::Null);

                                        info!(
                                            deployment_id = %deployment_id,
                                            workload_id = %workload_id,
                                            image = %image,
                                            "Processing workload deployment"
                                        );

                                        let cmd = WorkloadDeployCommand {
                                            deployment_id,
                                            workload_id,
                                            workload_name,
                                            image,
                                            config,
                                        };

                                        // Spawn deployment task
                                        let deploy_state = state.clone();
                                        let deploy_ws_tx = outbound_ws_tx.clone();
                                        let deploy_worker_id = worker_id_clone.clone();
                                        tokio::spawn(async move {
                                            Self::handle_workload_deploy(
                                                deploy_state,
                                                deploy_ws_tx,
                                                deploy_worker_id,
                                                cmd,
                                            ).await;
                                        });
                                    }

                                    // Handle workload stop command
                                    Some("workload_stop") => {
                                        let deployment_id = ws_msg.get("deployment_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();

                                        info!(deployment_id = %deployment_id, "Received workload_stop command");

                                        let stop_state = state.clone();
                                        let stop_ws_tx = outbound_ws_tx.clone();
                                        let stop_worker_id = worker_id_clone.clone();
                                        tokio::spawn(async move {
                                            Self::handle_workload_stop(
                                                stop_state,
                                                stop_ws_tx,
                                                stop_worker_id,
                                                deployment_id,
                                            ).await;
                                        });
                                    }

                                    // Handle acknowledgment
                                    Some("ack") => {
                                        info!("WebSocket registration acknowledged");
                                    }

                                    _ => {
                                        debug!(msg_type = ?msg_type, "Unknown message type received");
                                    }
                                }
                            }
                        }
                        Ok(Message::Ping(_)) => {
                            debug!("Received ping");
                        }
                        Ok(Message::Close(_)) => {
                            warn!("WebSocket closed by coordinator");
                            break;
                        }
                        Err(e) => {
                            error!(error = %e, "WebSocket error");
                            break;
                        }
                        _ => {}
                    }
                }

                // Attempt to reconnect
                warn!(delay_secs = reconnect_delay.as_secs(), "Attempting WebSocket reconnection");
                tokio::time::sleep(reconnect_delay).await;

                match connect_async(&ws_url_clone).await {
                    Ok((new_stream, _)) => {
                        let (mut new_write, new_read) = new_stream.split();

                        // Re-register with full capabilities
                        let register_msg = serde_json::json!({
                            "type": "register",
                            "worker_id": state.read().await.config.worker_id,
                            "worker_type": "gpu",
                            "capabilities": {
                                "gpu_backend": "cuda",
                                "max_concurrent_jobs": state.read().await.config.max_concurrent_jobs,
                                "supported_circuits": ["ai_inference", "data_pipeline", "ml_training", "generic_compute"],
                                "owner_address": std::env::var("OWNER_ADDRESS").ok()
                            }
                        });
                        if new_write.send(Message::Text(register_msg.to_string())).await.is_ok() {
                            info!("WebSocket reconnected successfully");
                            read = new_read;
                            reconnect_delay = Duration::from_secs(1);
                            continue;
                        }
                    }
                    Err(e) => {
                        error!(error = %e, "WebSocket reconnection failed");
                    }
                }

                // Exponential backoff
                reconnect_delay = std::cmp::min(reconnect_delay * 2, max_reconnect_delay);
            }
        });

        Ok(())
    }

    // =========================================================================
    // Workload Deployment Handlers
    // =========================================================================

    /// Handle workload deployment command
    async fn handle_workload_deploy(
        state: Arc<RwLock<WorkerState>>,
        ws_tx: mpsc::Sender<String>,
        worker_id: String,
        cmd: WorkloadDeployCommand,
    ) {
        let deployment_id = cmd.deployment_id.clone();

        // Track the active workload
        {
            let mut s = state.write().await;
            s.active_workloads.insert(deployment_id.clone(), ActiveWorkload {
                deployment_id: deployment_id.clone(),
                workload_id: cmd.workload_id.clone(),
                workload_name: cmd.workload_name.clone(),
                image: cmd.image.clone(),
                container_id: None,
                status: DeploymentStatus::Initializing,
                started_at: Instant::now(),
            });
        }

        // Send status: Initializing
        Self::send_workload_status(
            &state,
            &worker_id,
            &deployment_id,
            DeploymentStatus::Initializing,
            Some(DeploymentProgress {
                phase: "Initializing".to_string(),
                percent: 0,
                message: Some("Preparing deployment".to_string()),
            }),
            None,
        ).await;

        // Step 1: Pull Docker image
        info!(image = %cmd.image, "Pulling Docker image");
        Self::send_workload_status(
            &state,
            &worker_id,
            &deployment_id,
            DeploymentStatus::Pulling,
            Some(DeploymentProgress {
                phase: "Pulling".to_string(),
                percent: 10,
                message: Some(format!("Pulling image: {}", cmd.image)),
            }),
            None,
        ).await;

        let pull_result = Command::new("docker")
            .args(["pull", &cmd.image])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        match pull_result {
            Ok(output) if output.status.success() => {
                info!(image = %cmd.image, "Image pulled successfully");
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!(image = %cmd.image, error = %stderr, "Failed to pull image");
                Self::send_workload_status(
                    &state,
                    &worker_id,
                    &deployment_id,
                    DeploymentStatus::Failed,
                    None,
                    Some(format!("Failed to pull image: {}", stderr)),
                ).await;
                return;
            }
            Err(e) => {
                error!(error = %e, "Docker pull command failed");
                Self::send_workload_status(
                    &state,
                    &worker_id,
                    &deployment_id,
                    DeploymentStatus::Failed,
                    None,
                    Some(format!("Docker command failed: {}", e)),
                ).await;
                return;
            }
        }

        // Step 2: Start container
        Self::send_workload_status(
            &state,
            &worker_id,
            &deployment_id,
            DeploymentStatus::Starting,
            Some(DeploymentProgress {
                phase: "Starting".to_string(),
                percent: 50,
                message: Some("Starting container".to_string()),
            }),
            None,
        ).await;

        let container_name = format!("bitsage-{}-{}", cmd.workload_id, &deployment_id[..8]);

        // Build docker run command with GPU support
        let run_result = Command::new("docker")
            .args([
                "run",
                "-d",                              // Detached
                "--gpus", "all",                   // GPU access
                "--name", &container_name,
                "--restart", "unless-stopped",
                "-e", &format!("DEPLOYMENT_ID={}", deployment_id),
                "-e", &format!("WORKLOAD_ID={}", cmd.workload_id),
                &cmd.image,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        match run_result {
            Ok(output) if output.status.success() => {
                let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
                info!(
                    container_id = %container_id,
                    container_name = %container_name,
                    "Container started successfully"
                );

                // Update workload state with container ID
                {
                    let mut s = state.write().await;
                    if let Some(workload) = s.active_workloads.get_mut(&deployment_id) {
                        workload.container_id = Some(container_id.clone());
                        workload.status = DeploymentStatus::Ready;
                    }
                }

                Self::send_workload_status(
                    &state,
                    &worker_id,
                    &deployment_id,
                    DeploymentStatus::Ready,
                    Some(DeploymentProgress {
                        phase: "Ready".to_string(),
                        percent: 100,
                        message: Some(format!("Container running: {}", container_name)),
                    }),
                    None,
                ).await;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!(error = %stderr, "Failed to start container");
                Self::send_workload_status(
                    &state,
                    &worker_id,
                    &deployment_id,
                    DeploymentStatus::Failed,
                    None,
                    Some(format!("Failed to start container: {}", stderr)),
                ).await;
            }
            Err(e) => {
                error!(error = %e, "Docker run command failed");
                Self::send_workload_status(
                    &state,
                    &worker_id,
                    &deployment_id,
                    DeploymentStatus::Failed,
                    None,
                    Some(format!("Docker command failed: {}", e)),
                ).await;
            }
        }
    }

    /// Handle workload stop command
    async fn handle_workload_stop(
        state: Arc<RwLock<WorkerState>>,
        ws_tx: mpsc::Sender<String>,
        worker_id: String,
        deployment_id: String,
    ) {
        // Get container ID from active workloads
        let container_id = {
            let s = state.read().await;
            s.active_workloads.get(&deployment_id)
                .and_then(|w| w.container_id.clone())
        };

        Self::send_workload_status(
            &state,
            &worker_id,
            &deployment_id,
            DeploymentStatus::Stopping,
            Some(DeploymentProgress {
                phase: "Stopping".to_string(),
                percent: 50,
                message: Some("Stopping container".to_string()),
            }),
            None,
        ).await;

        if let Some(container_id) = container_id {
            info!(container_id = %container_id, "Stopping container");

            // Stop the container
            let stop_result = Command::new("docker")
                .args(["stop", &container_id])
                .output()
                .await;

            if let Err(e) = stop_result {
                warn!(error = %e, "Failed to stop container");
            }

            // Remove the container
            let rm_result = Command::new("docker")
                .args(["rm", "-f", &container_id])
                .output()
                .await;

            if let Err(e) = rm_result {
                warn!(error = %e, "Failed to remove container");
            }
        }

        // Remove from active workloads
        {
            let mut s = state.write().await;
            s.active_workloads.remove(&deployment_id);
        }

        Self::send_workload_status(
            &state,
            &worker_id,
            &deployment_id,
            DeploymentStatus::Stopped,
            Some(DeploymentProgress {
                phase: "Stopped".to_string(),
                percent: 100,
                message: Some("Container stopped and removed".to_string()),
            }),
            None,
        ).await;

        info!(deployment_id = %deployment_id, "Workload stopped successfully");
    }

    /// Send workload status update to coordinator via HTTP
    /// (WebSocket outbound would require restructuring, using HTTP for reliability)
    async fn send_workload_status(
        state: &Arc<RwLock<WorkerState>>,
        worker_id: &str,
        deployment_id: &str,
        status: DeploymentStatus,
        progress: Option<DeploymentProgress>,
        error: Option<String>,
    ) {
        let coordinator_url = {
            let s = state.read().await;
            s.config.coordinator_url.clone()
        };

        let client = reqwest::Client::new();
        let payload = serde_json::json!({
            "deployment_id": deployment_id,
            "status": status,
            "progress": progress,
            "error": error,
        });

        match client
            .post(format!("{}/api/v1/workloads/status", coordinator_url))
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    debug!(
                        deployment_id = %deployment_id,
                        status = ?status,
                        "Status update sent to coordinator"
                    );
                } else {
                    warn!(
                        deployment_id = %deployment_id,
                        status_code = %response.status(),
                        "Coordinator rejected status update"
                    );
                }
            }
            Err(e) => {
                error!(
                    deployment_id = %deployment_id,
                    error = %e,
                    "Failed to send status update to coordinator"
                );
            }
        }
    }

    /// Job processor loop
    async fn job_processor(
        state: Arc<RwLock<WorkerState>>,
        mut job_rx: mpsc::Receiver<ProofJob>,
        result_tx: mpsc::Sender<JobResult>,
    ) {
        while let Some(job) = job_rx.recv().await {
            let state_clone = state.clone();
            let result_tx_clone = result_tx.clone();

            tokio::spawn(async move {
                let result = Self::process_job(state_clone, job).await;
                if result_tx_clone.send(result).await.is_err() {
                    error!("Result channel closed");
                }
            });
        }
    }

    /// Process a single proof job
    async fn process_job(state: Arc<RwLock<WorkerState>>, job: ProofJob) -> JobResult {
        let start = Instant::now();
        let (worker_id, coordinator_url) = {
            let s = state.read().await;
            (s.config.worker_id.clone(), s.config.coordinator_url.clone())
        };

        info!(
            job_id = %job.job_id,
            circuit_type = %job.circuit_type,
            "Processing proof job"
        );

        // Increment current jobs
        {
            let mut s = state.write().await;
            s.current_jobs += 1;
        }

        // Parse circuit and witness
        let result = Self::execute_proof(&state, &job).await;

        // Update metrics
        let elapsed = start.elapsed().as_millis() as u64;
        {
            let mut s = state.write().await;
            s.current_jobs -= 1;
            s.total_proof_time_ms += elapsed;

            match &result {
                Ok(_) => s.jobs_completed += 1,
                Err(_) => s.jobs_failed += 1,
            }
        }

        let job_result = match result {
            Ok(proof) => {
                info!(
                    job_id = %job.job_id,
                    time_ms = elapsed,
                    "Proof completed successfully"
                );
                JobResult {
                    job_id: job.job_id.clone(),
                    worker_id: worker_id.clone(),
                    status: JobStatus::Completed,
                    proof: Some(serde_json::to_value(proof).unwrap_or_default()),
                    error: None,
                    generation_time_ms: elapsed,
                }
            }
            Err(e) => {
                error!(
                    job_id = %job.job_id,
                    error = %e,
                    "Proof generation failed"
                );
                JobResult {
                    job_id: job.job_id.clone(),
                    worker_id: worker_id.clone(),
                    status: JobStatus::Failed,
                    proof: None,
                    error: Some(e.to_string()),
                    generation_time_ms: elapsed,
                }
            }
        };

        // Submit result to coordinator
        Self::submit_result_to_coordinator(&coordinator_url, &job.job_id, &job_result).await;

        job_result
    }

    /// Submit job result to coordinator
    async fn submit_result_to_coordinator(coordinator_url: &str, job_id: &str, result: &JobResult) {
        let client = reqwest::Client::new();

        let submission = serde_json::json!({
            "worker_id": result.worker_id,
            "circuit": "generic_compute", // TODO: Get from job
            "success": matches!(result.status, JobStatus::Completed),
            "proof": result.proof,
            "error": result.error,
            "generation_time_ms": result.generation_time_ms,
        });

        match client
            .post(format!("{}/api/v1/workers/job/{}/result", coordinator_url, job_id))
            .json(&submission)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    info!(job_id = %job_id, "Result submitted to coordinator");
                } else {
                    warn!(
                        job_id = %job_id,
                        status = %response.status(),
                        "Coordinator rejected result"
                    );
                }
            }
            Err(e) => {
                error!(
                    job_id = %job_id,
                    error = %e,
                    "Failed to submit result to coordinator"
                );
            }
        }
    }

    /// Execute STWO proof generation
    async fn execute_proof(
        state: &Arc<RwLock<WorkerState>>,
        job: &ProofJob,
    ) -> Result<Proof, GpuError> {
        let s = state.read().await;

        // Build circuit based on circuit_type
        // log_size determines trace length (2^log_size)
        let circuit = Circuit {
            log_size: 10, // 2^10 = 1024 rows
            num_columns: 4,
            id: job.circuit_id,
        };

        // Parse witness from JSON
        let witness = Self::parse_witness(&job.witness)?;

        // Generate proof using STWO prover with progress callback
        s.prover.prove(&circuit, &witness, |progress| {
            debug!(
                phase = ?progress.phase,
                progress = progress.progress,
                "Proof progress"
            );
        }).await
    }

    /// Parse witness from JSON
    fn parse_witness(value: &serde_json::Value) -> Result<Witness, GpuError> {
        // Extract public and private inputs from JSON
        let public_inputs = value
            .get("public_inputs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_u64())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec![0; 4]);

        let private_inputs = value
            .get("private_inputs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_u64())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec![0; 8]);

        Ok(Witness {
            public_inputs,
            private_inputs,
        })
    }

    /// Heartbeat loop to update coordinator
    async fn heartbeat_loop(
        state: Arc<RwLock<WorkerState>>,
        coordinator_url: String,
        interval_secs: u64,
    ) {
        let mut interval = interval(Duration::from_secs(interval_secs));

        loop {
            interval.tick().await;

            let s = state.read().await;
            let metrics = WorkerMetrics {
                worker_id: s.config.worker_id.clone(),
                gpu_backend: format!("{:?}", s.config.gpu_backend),
                current_load: s.current_jobs as u32,
                capacity: s.config.max_concurrent_jobs as u32,
                jobs_completed: s.jobs_completed,
                jobs_failed: s.jobs_failed,
                avg_proof_time_ms: if s.jobs_completed > 0 {
                    s.total_proof_time_ms / s.jobs_completed
                } else {
                    0
                },
                gpu_memory_used_mb: Self::get_gpu_memory_used(),
                gpu_memory_total_mb: Self::get_gpu_memory_total(),
                gpu_utilization_pct: Self::get_gpu_utilization(),
                uptime_secs: s.start_time.elapsed().as_secs(),
            };
            drop(s);

            let client = reqwest::Client::new();
            if let Err(e) = client
                .post(format!("{}/api/v1/workers/heartbeat", coordinator_url))
                .json(&metrics)
                .send()
                .await
            {
                warn!(error = %e, "Heartbeat failed");
            }
        }
    }

    /// Get current metrics
    pub async fn get_metrics(&self) -> WorkerMetrics {
        let s = self.state.read().await;
        self.get_metrics_internal(&s)
    }

    fn get_metrics_internal(&self, s: &WorkerState) -> WorkerMetrics {
        WorkerMetrics {
            worker_id: s.config.worker_id.clone(),
            gpu_backend: format!("{:?}", s.config.gpu_backend),
            current_load: s.current_jobs as u32,
            capacity: s.config.max_concurrent_jobs as u32,
            jobs_completed: s.jobs_completed,
            jobs_failed: s.jobs_failed,
            avg_proof_time_ms: if s.jobs_completed > 0 {
                s.total_proof_time_ms / s.jobs_completed
            } else {
                0
            },
            gpu_memory_used_mb: Self::get_gpu_memory_used(),
            gpu_memory_total_mb: Self::get_gpu_memory_total(),
            gpu_utilization_pct: Self::get_gpu_utilization(),
            uptime_secs: s.start_time.elapsed().as_secs(),
        }
    }

    /// Get GPU memory used (platform-specific)
    #[cfg(feature = "cuda")]
    fn get_gpu_memory_used() -> u64 {
        // TODO: Use CUDA API to get memory info
        0
    }

    #[cfg(not(feature = "cuda"))]
    fn get_gpu_memory_used() -> u64 {
        0
    }

    /// Get GPU memory total
    #[cfg(feature = "cuda")]
    fn get_gpu_memory_total() -> u64 {
        // TODO: Use CUDA API
        0
    }

    #[cfg(not(feature = "cuda"))]
    fn get_gpu_memory_total() -> u64 {
        0
    }

    /// Get GPU utilization
    fn get_gpu_utilization() -> u32 {
        // TODO: Platform-specific GPU utilization query
        0
    }
}

/// Main entry point for GPU worker binary
pub async fn run_worker(config: WorkerConfig) -> Result<(), GpuError> {
    let mut worker = GpuWorker::new(config)?;
    worker.start().await?;

    // Keep running until shutdown signal
    tokio::signal::ctrl_c()
        .await
        .map_err(|e| GpuError::DeviceError(format!("Signal handler error: {}", e)))?;

    info!("Shutting down GPU worker");
    Ok(())
}
