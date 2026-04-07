//! Workload Handlers
//!
//! REST API handlers for workload deployment and management.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::AppState;
use crate::middleware::auth::wallet_auth;
use super::handlers::ApiResponse;
use super::workload_types::*;
use super::streaming::WorkerWsMessage;

/// Extract and verify the wallet address from request headers.
/// In production with wallet_auth enabled, requires signature verification.
/// In dev mode, trusts the X-Wallet-Address header directly.
fn extract_verified_wallet(headers: &HeaderMap, request_path: &str) -> Result<String, String> {
    let wallet = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "X-Wallet-Address header required".to_string())?;

    if wallet_auth::is_enforced() {
        wallet_auth::verify_wallet_header(headers, request_path)
            .map_err(|e| format!("Wallet signature verification failed: {}", e))
    } else {
        Ok(wallet.to_string())
    }
}

// ============================================================================
// Deployment State
// ============================================================================

/// State for tracking workload deployments.
/// Uses in-memory HashMap for fast reads with write-through to DB when available.
pub struct DeploymentState {
    deployments: RwLock<HashMap<Uuid, WorkloadDeployment>>,
    /// Map from worker_id to active deployment_id
    worker_deployments: RwLock<HashMap<String, Uuid>>,
    /// Optional DB handle for persistence (survives coordinator restart)
    db: Option<crate::db::Database>,
}

impl DeploymentState {
    pub fn new() -> Self {
        Self {
            deployments: RwLock::new(HashMap::new()),
            worker_deployments: RwLock::new(HashMap::new()),
            db: None,
        }
    }

    /// Create with DB persistence
    pub fn with_db(db: crate::db::Database) -> Self {
        Self {
            deployments: RwLock::new(HashMap::new()),
            worker_deployments: RwLock::new(HashMap::new()),
            db: Some(db),
        }
    }

    /// Load active deployments from DB on startup (recovery after restart)
    pub async fn load_from_db(&self) {
        if let Some(ref db) = self.db {
            let repo = crate::db::repository::DeploymentRepository::new(db);
            // Load non-terminal deployments and mark them as failed (coordinator restarted)
            match repo.find_active().await {
                Ok(db_deployments) => {
                    let mut deployments = self.deployments.write().await;
                    let mut worker_deps = self.worker_deployments.write().await;

                    for db_dep in db_deployments {
                        // Mark in-progress deployments as failed — the worker state is unknown after restart
                        let status = if ["queued", "initializing", "downloading_model", "loading_model"].contains(&db_dep.status.as_str()) {
                            tracing::warn!(
                                deployment_id = %db_dep.id,
                                workload = %db_dep.workload_id,
                                prev_status = %db_dep.status,
                                "Marking in-progress deployment as failed after coordinator restart"
                            );
                            DeploymentStatus::Failed
                        } else if db_dep.status == "ready" {
                            DeploymentStatus::Ready
                        } else {
                            continue; // Skip already-terminal states
                        };

                        let mut deployment = WorkloadDeployment::new(
                            db_dep.workload_id,
                            db_dep.worker_id.clone(),
                            db_dep.owner_wallet,
                        );
                        deployment.id = db_dep.id;
                        deployment.status = status.clone();
                        deployment.created_at = db_dep.created_at;
                        deployment.updated_at = chrono::Utc::now();
                        if status == DeploymentStatus::Failed {
                            deployment.error = Some("Coordinator restarted — deployment state lost".to_string());
                        }

                        worker_deps.insert(db_dep.worker_id, deployment.id);
                        deployments.insert(deployment.id, deployment);
                    }

                    tracing::info!(count = deployments.len(), "Loaded deployments from DB");
                }
                Err(e) => {
                    tracing::error!(error = %e, "Failed to load deployments from DB — starting fresh");
                }
            }
        }
    }

    /// Persist a deployment to DB (fire-and-forget, don't block on DB errors)
    fn persist_to_db(&self, deployment: &WorkloadDeployment) {
        if let Some(ref db) = self.db {
            let repo = crate::db::repository::DeploymentRepository::new(db);
            let db_dep = crate::db::models::DbDeployment {
                id: deployment.id,
                workload_id: deployment.workload_id.clone(),
                worker_id: deployment.worker_id.clone(),
                owner_wallet: deployment.owner_address.clone(),
                status: format!("{:?}", deployment.status).to_lowercase(),
                container_id: None,
                progress_phase: deployment.progress.as_ref().map(|p| format!("{:?}", p.phase).to_lowercase()),
                progress_percent: deployment.progress.as_ref().map(|p| p.percent as i32),
                error_message: deployment.error.clone(),
                created_at: deployment.created_at,
                updated_at: deployment.updated_at,
                ready_at: deployment.ready_at,
                stopped_at: None,
            };
            // Spawn fire-and-forget — DB persistence should not block the hot path
            let db_clone = db.clone();
            tokio::spawn(async move {
                let repo = crate::db::repository::DeploymentRepository::new(&db_clone);
                if let Err(e) = repo.create(&db_dep).await {
                    tracing::warn!(deployment_id = %db_dep.id, error = %e, "Failed to persist deployment to DB");
                }
            });
        }
    }

    /// Persist a status update to DB
    fn persist_status_update(&self, deployment_id: &Uuid, status: &DeploymentStatus, progress: &Option<DeploymentProgress>, error: &Option<String>) {
        if let Some(ref db) = self.db {
            let id = *deployment_id;
            let status_str = format!("{:?}", status).to_lowercase();
            let phase = progress.as_ref().map(|p| format!("{:?}", p.phase).to_lowercase());
            let percent = progress.as_ref().map(|p| p.percent as i32);
            let err = error.clone();
            let db_clone = db.clone();
            tokio::spawn(async move {
                let repo = crate::db::repository::DeploymentRepository::new(&db_clone);
                if let Err(e) = repo.update_status(&id, &status_str, phase.as_deref(), percent, err.as_deref()).await {
                    tracing::warn!(deployment_id = %id, error = %e, "Failed to persist deployment status to DB");
                }
            });
        }
    }

    pub async fn add(&self, deployment: WorkloadDeployment) {
        self.persist_to_db(&deployment);

        let mut deployments = self.deployments.write().await;
        let mut worker_deps = self.worker_deployments.write().await;

        worker_deps.insert(deployment.worker_id.clone(), deployment.id);
        deployments.insert(deployment.id, deployment);
    }

    pub async fn get(&self, id: &Uuid) -> Option<WorkloadDeployment> {
        let deployments = self.deployments.read().await;
        deployments.get(id).cloned()
    }

    pub async fn get_by_owner(&self, owner_address: &str) -> Vec<WorkloadDeployment> {
        let deployments = self.deployments.read().await;
        deployments.values()
            .filter(|d| d.owner_address == owner_address)
            .cloned()
            .collect()
    }

    pub async fn get_by_worker(&self, worker_id: &str) -> Option<WorkloadDeployment> {
        let worker_deps = self.worker_deployments.read().await;
        if let Some(deployment_id) = worker_deps.get(worker_id) {
            let deployments = self.deployments.read().await;
            return deployments.get(deployment_id).cloned();
        }
        None
    }

    pub async fn update_status(
        &self,
        deployment_id: &Uuid,
        status: DeploymentStatus,
        progress: Option<DeploymentProgress>,
        error: Option<String>,
    ) {
        self.persist_status_update(deployment_id, &status, &progress, &error);

        let mut deployments = self.deployments.write().await;
        if let Some(deployment) = deployments.get_mut(deployment_id) {
            deployment.update_status(status, progress, error);
        }
    }

    pub async fn remove(&self, deployment_id: &Uuid) -> Option<WorkloadDeployment> {
        let mut deployments = self.deployments.write().await;
        let mut worker_deps = self.worker_deployments.write().await;

        if let Some(deployment) = deployments.remove(deployment_id) {
            worker_deps.remove(&deployment.worker_id);
            Some(deployment)
        } else {
            None
        }
    }

    /// Mark all active deployments for a worker as failed due to disconnect
    /// Called when a worker unexpectedly disconnects
    pub async fn handle_worker_disconnect(&self, worker_id: &str) -> Vec<Uuid> {
        let mut deployments = self.deployments.write().await;
        let mut worker_deps = self.worker_deployments.write().await;
        let mut affected_deployments = Vec::new();

        // Find all deployments for this worker
        let deployment_ids: Vec<Uuid> = deployments.values()
            .filter(|d| d.worker_id == worker_id)
            .map(|d| d.id)
            .collect();

        for deployment_id in deployment_ids {
            if let Some(deployment) = deployments.get_mut(&deployment_id) {
                // Only mark as failed if it was in an active state
                let is_active = matches!(
                    deployment.status,
                    DeploymentStatus::Queued |
                    DeploymentStatus::Initializing |
                    DeploymentStatus::DownloadingModel |
                    DeploymentStatus::LoadingModel |
                    DeploymentStatus::Ready
                );

                if is_active {
                    deployment.status = DeploymentStatus::Failed;
                    deployment.error = Some("Worker disconnected unexpectedly".to_string());
                    deployment.updated_at = chrono::Utc::now();
                    affected_deployments.push(deployment_id);

                    tracing::warn!(
                        deployment_id = %deployment_id,
                        worker_id = %worker_id,
                        workload = %deployment.workload_id,
                        "Deployment marked as failed due to worker disconnect"
                    );
                }
            }
        }

        // Clean up worker_deployments mapping
        worker_deps.remove(worker_id);

        affected_deployments
    }

    /// Get all deployments that are stuck (no update for specified duration)
    pub async fn get_stuck_deployments(&self, timeout_secs: i64) -> Vec<WorkloadDeployment> {
        let deployments = self.deployments.read().await;
        let now = chrono::Utc::now();

        deployments.values()
            .filter(|d| {
                // Check if deployment is in an "in-progress" state
                let is_in_progress = matches!(
                    d.status,
                    DeploymentStatus::Queued |
                    DeploymentStatus::Initializing |
                    DeploymentStatus::DownloadingModel |
                    DeploymentStatus::LoadingModel
                );

                if !is_in_progress {
                    return false;
                }

                // Check if it's been stuck for too long
                let elapsed = now.signed_duration_since(d.updated_at);
                elapsed.num_seconds() > timeout_secs
            })
            .cloned()
            .collect()
    }

    /// Mark a deployment as failed due to timeout
    pub async fn timeout_deployment(&self, deployment_id: &Uuid) {
        let mut deployments = self.deployments.write().await;
        if let Some(deployment) = deployments.get_mut(deployment_id) {
            deployment.status = DeploymentStatus::Failed;
            deployment.error = Some("Deployment timed out - no response from worker".to_string());
            deployment.updated_at = chrono::Utc::now();

            tracing::warn!(
                deployment_id = %deployment_id,
                workload = %deployment.workload_id,
                "Deployment timed out"
            );
        }
    }
}

impl Default for DeploymentState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize)]
pub struct MyWorkersResponse {
    pub workers: Vec<super::types::GpuWorker>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StopResponse {
    pub stopped: bool,
    pub deployment_id: Uuid,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/v1/workloads
/// List all available workloads
pub async fn list_workloads() -> Json<ApiResponse<WorkloadsResponse>> {
    let workloads = get_builtin_workloads();
    ApiResponse::ok(WorkloadsResponse { workloads })
}

/// GET /api/v1/workloads/:workload_id
/// Get a specific workload by ID
pub async fn get_workload(
    Path(workload_id): Path<String>,
) -> Json<ApiResponse<Workload>> {
    match get_workload_by_id(&workload_id) {
        Some(workload) => ApiResponse::ok(workload),
        None => ApiResponse::err(format!("Workload '{}' not found", workload_id)),
    }
}

/// GET /api/v1/workloads/my-workers
/// Get GPU workers owned by the requesting wallet
pub async fn get_my_workers(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<ApiResponse<MyWorkersResponse>> {
    let owner_address = match extract_verified_wallet(&headers, "/api/v1/workloads/my-workers") {
        Ok(w) => w,
        Err(e) => return ApiResponse::err(e),
    };

    let workers = state.workers.get_workers_by_owner(&owner_address).await;

    tracing::debug!(
        owner = %owner_address,
        worker_count = %workers.len(),
        "Fetched workers for owner"
    );

    ApiResponse::ok(MyWorkersResponse { workers })
}

/// GET /api/v1/workloads/deployments
/// Get all deployments for the requesting wallet
pub async fn get_my_deployments(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<ApiResponse<DeploymentsResponse>> {
    let owner_address = match extract_verified_wallet(&headers, "/api/v1/workloads/deployments") {
        Ok(w) => w,
        Err(e) => return ApiResponse::err(e),
    };

    let deployments = state.deployments.get_by_owner(&owner_address).await;
    ApiResponse::ok(DeploymentsResponse { deployments })
}

/// POST /api/v1/workloads/deploy
/// Deploy a workload to a worker
pub async fn deploy_workload(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<WorkloadDeployRequest>,
) -> Json<ApiResponse<WorkloadDeployResponse>> {
    // Security: require and verify X-Wallet-Address with signature in production
    let header_wallet = match extract_verified_wallet(&headers, "/api/v1/workloads/deploy") {
        Ok(w) => w,
        Err(e) => return ApiResponse::err(e),
    };

    if header_wallet != request.owner_address {
        tracing::warn!(
            header_wallet = %header_wallet,
            request_owner = %request.owner_address,
            "Deploy request owner mismatch — possible spoofing attempt"
        );
        return ApiResponse::err("X-Wallet-Address header does not match owner_address in request body");
    }

    tracing::info!(
        workload_id = %request.workload_id,
        owner = %request.owner_address,
        "Deploying workload"
    );

    // 1. Validate workload exists (only built-in verified workloads allowed)
    let workload = match get_workload_by_id(&request.workload_id) {
        Some(w) => w,
        None => return ApiResponse::err(format!("Workload '{}' not found", request.workload_id)),
    };

    // Security: only allow images from the configured registry
    let allowed_registry = &crate::config::CONFIG.worker.docker_registry;
    if !workload.image.starts_with(&format!("{}/", allowed_registry)) {
        tracing::warn!(
            image = %workload.image,
            allowed_registry = %allowed_registry,
            "Rejected workload with unauthorized Docker image"
        );
        return ApiResponse::err(format!(
            "Docker image '{}' is not from the allowed registry '{}'",
            workload.image, allowed_registry
        ));
    }

    // 2. Find a suitable worker
    let workers = state.workers.get_workers_by_owner(&request.owner_address).await;

    if workers.is_empty() {
        return ApiResponse::err("No connected workers found for this wallet. Start your GPU worker with OWNER_ADDRESS set.");
    }

    // Select specific worker or first available
    let worker = match &request.worker_id {
        Some(id) => workers.iter().find(|w| &w.id == id),
        None => workers.iter().find(|w| w.active_workload.is_none()),
    };

    let worker = match worker {
        Some(w) => w.clone(),
        None => {
            if request.worker_id.is_some() {
                return ApiResponse::err("Specified worker not found or not owned by this wallet");
            } else {
                return ApiResponse::err("All workers are busy. Stop an existing workload first.");
            }
        }
    };

    // 3. Verify worker is actually connected via WebSocket (not just registered)
    if !state.worker_channels.is_connected(&worker.id).await {
        tracing::warn!(
            worker_id = %worker.id,
            owner = %request.owner_address,
            "Deploy rejected — worker is registered but not connected via WebSocket"
        );
        return ApiResponse::err(format!(
            "Worker '{}' is not connected. Ensure your GPU worker is running and has an active WebSocket connection.",
            worker.id
        ));
    }

    // 4. Validate VRAM requirements
    let worker_vram = worker.vram_gb.unwrap_or(0);
    if worker_vram < workload.min_vram_gb {
        return ApiResponse::err(format!(
            "Insufficient VRAM: {} requires {}GB, worker has {}GB",
            workload.name, workload.min_vram_gb, worker_vram
        ));
    }

    // 5. Check if worker is already running a workload
    if let Some(active) = &worker.active_workload {
        return ApiResponse::err(format!(
            "Worker is already running '{}'. Stop it first.",
            active
        ));
    }

    // 6. Create deployment record
    let deployment = WorkloadDeployment::new(
        request.workload_id.clone(),
        worker.id.clone(),
        request.owner_address.clone(),
    );
    let deployment_id = deployment.id;

    state.deployments.add(deployment).await;

    // 7. Update worker's active workload
    state.workers.set_worker_active_workload(&worker.id, Some(request.workload_id.clone())).await;

    // 8. Send deployment command to worker via WebSocket

    tracing::info!(
        deployment_id = %deployment_id,
        worker_id = %worker.id,
        workload = %workload.name,
        "Deployment created, sending to worker"
    );

    // 9. Send deployment command to worker via WebSocket channel
    // Use digest-pinned image reference in production (prevents tag-based supply chain attacks)
    let deployment_image = workload.deployment_image();
    let send_result = state.worker_channels.send_deployment(
        &worker.id,
        deployment_id,
        request.workload_id.clone(),
        workload.name.clone(),
        deployment_image,
        workload.default_config.clone(),
    ).await;

    match send_result {
        Ok(()) => {
            tracing::info!(
                deployment_id = %deployment_id,
                worker_id = %worker.id,
                "Deployment command sent to worker successfully"
            );
        }
        Err(e) => {
            tracing::error!(
                deployment_id = %deployment_id,
                worker_id = %worker.id,
                error = %e,
                "Failed to send deployment command — worker disconnected between check and send"
            );
            // Clean up: mark deployment as failed, release worker
            state.deployments.update_status(
                &deployment_id,
                DeploymentStatus::Failed,
                None,
                Some("Worker disconnected before deployment could be sent".to_string()),
            ).await;
            state.workers.set_worker_active_workload(&worker.id, None).await;
            return ApiResponse::err("Worker disconnected before deployment could be sent. Please retry.");
        }
    }

    let estimated_time = estimate_deployment_time(&request.workload_id);

    ApiResponse::ok(WorkloadDeployResponse {
        deployment_id,
        worker_id: worker.id,
        workload_id: request.workload_id,
        status: DeploymentStatus::Queued,
        estimated_ready_time_ms: estimated_time,
    })
}

/// GET /api/v1/workloads/deployments/:deployment_id
/// Get deployment status (owner-scoped in production)
pub async fn get_deployment_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(deployment_id): Path<Uuid>,
) -> Json<ApiResponse<WorkloadDeployment>> {
    match state.deployments.get(&deployment_id).await {
        Some(deployment) => {
            // Verify the requester owns the deployment (signature-verified in production)
            let requester = match extract_verified_wallet(&headers, &format!("/api/v1/workloads/deployments/{}", deployment_id)) {
                Ok(w) => w,
                Err(_) => return ApiResponse::err("Deployment not found"),
            };
            if requester != deployment.owner_address {
                return ApiResponse::err("Deployment not found");
            }
            ApiResponse::ok(deployment)
        }
        None => ApiResponse::err("Deployment not found"),
    }
}

/// POST /api/v1/workloads/deployments/:deployment_id/stop
/// Stop a deployed workload
pub async fn stop_workload(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(deployment_id): Path<Uuid>,
) -> Json<ApiResponse<StopResponse>> {
    // Get the deployment
    let deployment = match state.deployments.get(&deployment_id).await {
        Some(d) => d,
        None => return ApiResponse::err("Deployment not found"),
    };

    // Security: require verified wallet to stop a deployment
    let requester = match extract_verified_wallet(&headers, &format!("/api/v1/workloads/deployments/{}/stop", deployment_id)) {
        Ok(w) => w,
        Err(e) => return ApiResponse::err(e),
    };

    if requester != deployment.owner_address {
        tracing::warn!(
            deployment_id = %deployment_id,
            requester = %requester,
            owner = %deployment.owner_address,
            "Stop request from non-owner rejected"
        );
        return ApiResponse::err("You can only stop your own deployments");
    }

    // Update deployment status
    state.deployments.update_status(
        &deployment_id,
        DeploymentStatus::Stopping,
        None,
        None,
    ).await;

    tracing::info!(
        deployment_id = %deployment_id,
        worker_id = %deployment.worker_id,
        "Stopping workload"
    );

    // Send stop command to worker via WebSocket channel
    let send_result = state.worker_channels.send_stop(&deployment.worker_id, deployment_id).await;

    match send_result {
        Ok(()) => {
            tracing::info!(
                deployment_id = %deployment_id,
                worker_id = %deployment.worker_id,
                "Stop command sent to worker successfully"
            );
        }
        Err(e) => {
            tracing::warn!(
                deployment_id = %deployment_id,
                worker_id = %deployment.worker_id,
                error = %e,
                "Failed to send stop command to worker"
            );
        }
    }

    // Clear worker's active workload
    state.workers.set_worker_active_workload(&deployment.worker_id, None).await;

    // Mark as stopped
    state.deployments.update_status(
        &deployment_id,
        DeploymentStatus::Stopped,
        None,
        None,
    ).await;

    ApiResponse::ok(StopResponse {
        stopped: true,
        deployment_id,
    })
}

/// POST /api/v1/workloads/status
/// Worker reports workload status (requires worker API key in production)
pub async fn update_workload_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(update): Json<WorkloadStatusUpdate>,
) -> Json<ApiResponse<()>> {
    // Security: require worker API key in production — this endpoint controls deployment state
    let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
    if is_production {
        let api_key = headers.get("X-API-Key").and_then(|v| v.to_str().ok()).unwrap_or("");
        if !state.auth.validate_worker_api_key(api_key) {
            return ApiResponse::err("Worker API key required for status updates in production");
        }
    }
    state.deployments.update_status(
        &update.deployment_id,
        update.status,
        update.progress,
        update.error,
    ).await;

    // If ready, update worker's active workload confirmation
    if update.status == DeploymentStatus::Ready {
        if let Some(deployment) = state.deployments.get(&update.deployment_id).await {
            tracing::info!(
                deployment_id = %update.deployment_id,
                workload = %deployment.workload_id,
                "Workload is ready"
            );
        }
    }

    // If failed or stopped, clear worker's active workload
    if matches!(update.status, DeploymentStatus::Failed | DeploymentStatus::Stopped) {
        if let Some(deployment) = state.deployments.get(&update.deployment_id).await {
            state.workers.set_worker_active_workload(&deployment.worker_id, None).await;
        }
    }

    ApiResponse::ok(())
}
