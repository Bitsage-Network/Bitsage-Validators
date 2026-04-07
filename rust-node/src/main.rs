//! BitSage Coordinator Node
//!
//! Production-grade coordinator for the BitSage Network.
//! Handles:
//! - Proof routing (GPU workers, TEE enclaves, or WASM fallback)
//! - WebSocket streaming for real-time progress updates
//! - Worker pool management and load balancing
//! - GPU rental marketplace
//! - SAGE token billing and escrow

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    middleware as axum_mw,
    routing::{get, post},
    Json, Router,
};
use tokio::sync::RwLock;
use tokio::signal;
use tower_http::cors::{Any, AllowOrigin, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tracing::{info, warn, error, debug};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod contracts;
mod db;
mod middleware;
mod prover;
mod rental;

use config::CONFIG;
use prover::{ProofRouter, WorkerPool, ProofState, WorkerChannelManager};
use prover::workload_handlers::DeploymentState;
use rental::RentalState;
use middleware::metrics::{MetricsLayer, track_request_metrics, HealthStatus, BusinessMetrics};
use middleware::rate_limit::RateLimitLayer;
use middleware::auth::AuthState;

/// Application state shared across handlers
pub struct AppState {
    pub router: ProofRouter,
    pub workers: WorkerPool,
    pub proofs: RwLock<ProofState>,
    pub deployments: DeploymentState,
    pub rentals: RentalState,
    /// Channels for bidirectional worker communication
    pub worker_channels: WorkerChannelManager,
    /// Database connection (optional - for gradual migration)
    pub db: Option<db::Database>,
    /// Authentication state
    pub auth: AuthState,
    /// Application start time
    pub started_at: Instant,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file
    let _ = dotenvy::dotenv();

    // Initialize tracing with JSON format in production
    let is_production = std::env::var("PRODUCTION").is_ok()
        || std::env::var("BITSAGE_PRODUCTION").is_ok();

    if is_production {
        tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bitsage_coordinator=info,tower_http=info".into()))
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "bitsage_coordinator=debug,tower_http=debug".into()))
            .with(tracing_subscriber::fmt::layer())
            .init();
    }

    info!("Starting BitSage Coordinator Node v{}", env!("CARGO_PKG_VERSION"));
    info!("Environment: {}", if is_production { "production" } else { "development" });

    // Initialize database (optional)
    let db = match db::Database::connect().await {
        Ok(db) => {
            if CONFIG.database.run_migrations {
                if let Err(e) = db.run_migrations().await {
                    error!("Failed to run migrations: {}", e);
                    // Continue without database in dev mode
                    if is_production {
                        return Err(e);
                    }
                }
            }
            Some(db)
        }
        Err(e) => {
            warn!("Database connection failed: {} - running without persistence", e);
            if is_production {
                return Err(e);
            }
            None
        }
    };

    // Initialize metrics
    let metrics = if CONFIG.metrics.enabled {
        Some(MetricsLayer::new())
    } else {
        None
    };

    // Initialize rate limiter
    let rate_limiter = RateLimitLayer::new();

    // Initialize rental state
    let mut rentals = RentalState::new();

    // Take the suspension receiver before moving to Arc
    let suspension_rx = rentals.take_suspension_receiver();

    // Initialize application state
    let state = Arc::new(AppState {
        router: ProofRouter::new(),
        workers: WorkerPool::new(),
        proofs: RwLock::new(ProofState::new()),
        deployments: match &db {
            Some(database) => DeploymentState::with_db(database.clone()),
            None => DeploymentState::new(),
        },
        rentals,
        worker_channels: WorkerChannelManager::new(),
        db,
        auth: AuthState::new(),
        started_at: Instant::now(),
    });

    // Recover deployment state from DB (if available)
    state.deployments.load_from_db().await;

    // Initialize GPU manager
    if let Err(e) = state.rentals.gpus.initialize().await {
        warn!("GPU manager initialization failed: {} - rental GPUs may not be detected", e);
    } else {
        info!("GPU manager initialized successfully");
    }

    // Spawn background tasks (including suspension handler)
    spawn_background_tasks(state.clone(), suspension_rx);

    // Build router with middleware
    let app = build_router(state.clone(), metrics.clone(), rate_limiter);

    // Start metrics server on separate port if enabled
    if let Some(ref m) = metrics {
        let metrics_handle = m.handle();
        tokio::spawn(async move {
            let metrics_app = Router::new()
                .route(&CONFIG.metrics.path, get(move || async move {
                    metrics_handle.render()
                }));

            let addr = SocketAddr::from(([0, 0, 0, 0], CONFIG.metrics.port));
            info!("Metrics server listening on {}", addr);

            match tokio::net::TcpListener::bind(addr).await {
                Ok(listener) => {
                    if let Err(e) = axum::serve(listener, metrics_app).await {
                        tracing::error!(error = %e, "Metrics server exited with error");
                    }
                }
                Err(e) => {
                    tracing::error!(error = %e, addr = %addr, "Failed to bind metrics server — metrics unavailable");
                }
            }
        });
    }

    // Bind main server
    let addr = CONFIG.socket_addr();
    info!("Main server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Serve with graceful shutdown
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shutdown complete");
    Ok(())
}

/// Build the main router with all routes and middleware
fn build_router(
    state: Arc<AppState>,
    metrics: Option<MetricsLayer>,
    rate_limiter: RateLimitLayer,
) -> Router {
    let api_routes = Router::new()
        // Health check
        .route("/health", get(health_check))

        // Prover API
        .route("/api/v1/prover/capabilities", get(prover::handlers::get_capabilities))
        .route("/api/v1/prover/prove", post(prover::handlers::submit_proof))
        .route("/api/v1/prover/status/:request_id", get(prover::handlers::get_proof_status))
        .route("/api/v1/prover/submit", post(prover::handlers::submit_on_chain))

        // TEE API
        .route("/api/v1/tee/attestation", get(prover::handlers::get_tee_attestation))
        .route("/api/v1/tee/prove", post(prover::handlers::submit_tee_proof))
        .route("/api/v1/tee/status/:request_id", get(prover::handlers::get_tee_status))

        // GPU Metrics (dashboard)
        .route("/api/v1/gpu/metrics", get(prover::handlers::get_gpu_metrics))

        // Worker API - Listing
        .route("/api/v1/workers/gpu", get(prover::handlers::list_gpu_workers))
        .route("/api/v1/workers/tee", get(prover::handlers::list_tee_workers))
        .route("/api/v1/workers/stats", get(prover::handlers::get_network_stats))
        .route("/api/v1/workers/:worker_id/metrics", get(prover::handlers::get_worker_metrics))

        // Worker API - Job Management
        .route("/api/v1/workers/submit", post(prover::handlers::submit_worker_job))
        .route("/api/v1/workers/job/:job_id", get(prover::handlers::get_job_status))
        .route("/api/v1/workers/job/:job_id/cancel", post(prover::handlers::cancel_job))
        .route("/api/v1/workers/job/:job_id/result", post(prover::handlers::submit_job_result))

        // Worker Registration API
        .route("/api/v1/workers/gpu/register", post(prover::handlers::register_gpu_worker))
        .route("/api/v1/workers/tee/register", post(prover::handlers::register_tee_worker))
        .route("/api/v1/workers/heartbeat", post(prover::handlers::worker_heartbeat))
        .route("/api/v1/workers/deregister", post(prover::handlers::deregister_worker))

        // Workload Deployment API
        .route("/api/v1/workloads", get(prover::workload_handlers::list_workloads))
        .route("/api/v1/workloads/my-workers", get(prover::workload_handlers::get_my_workers))
        .route("/api/v1/workloads/deployments", get(prover::workload_handlers::get_my_deployments))
        .route("/api/v1/workloads/deploy", post(prover::workload_handlers::deploy_workload))
        .route("/api/v1/workloads/deployments/:deployment_id", get(prover::workload_handlers::get_deployment_status))
        .route("/api/v1/workloads/deployments/:deployment_id/stop", post(prover::workload_handlers::stop_workload))
        .route("/api/v1/workloads/status", post(prover::workload_handlers::update_workload_status))
        .route("/api/v1/workloads/:workload_id", get(prover::workload_handlers::get_workload))

        // GPU Rental Marketplace API
        .route("/api/v1/rentals/templates", get(rental::handlers::list_templates))
        .route("/api/v1/rentals/templates/:template_id", get(rental::handlers::get_template))
        .route("/api/v1/rentals/gpus/available", get(rental::handlers::list_available_gpus))
        .route("/api/v1/rentals/gpus/register", post(rental::handlers::register_gpu))
        .route("/api/v1/rentals/gpus/:gpu_id/availability", post(rental::handlers::update_gpu_availability))
        .route("/api/v1/rentals/stats", get(rental::handlers::get_marketplace_stats))
        .route("/api/v1/rentals", post(rental::handlers::start_rental))
        .route("/api/v1/rentals/user", get(rental::handlers::get_user_rentals))
        .route("/api/v1/rentals/:rental_id", get(rental::handlers::get_rental))
        .route("/api/v1/rentals/:rental_id/extend", post(rental::handlers::extend_rental))
        .route("/api/v1/rentals/:rental_id/stop", post(rental::handlers::stop_rental))
        .route("/api/v1/rentals/:rental_id/ssh", get(rental::handlers::get_ssh_credentials))
        .route("/api/v1/rentals/:rental_id/jupyter", get(rental::handlers::get_jupyter_access))
        .route("/api/v1/rentals/:rental_id/logs", get(rental::handlers::get_container_logs))
        .route("/api/v1/rentals/:rental_id/billing", get(rental::handlers::get_rental_billing))

        // Billing API
        .route("/api/v1/billing/escrow", get(rental::handlers::get_escrow_balance))
        .route("/api/v1/billing/escrow/deposit", post(rental::handlers::deposit_escrow))
        .route("/api/v1/billing/earnings", get(rental::handlers::get_validator_earnings))
        .route("/api/v1/billing/earnings/withdraw", post(rental::handlers::withdraw_earnings))

        // On-Chain Escrow API
        .route("/api/v1/escrow/status", get(rental::handlers::get_escrow_status))
        .route("/api/v1/escrow/stats", get(rental::handlers::get_contract_stats))
        .route("/api/v1/escrow/sync/balance", get(rental::handlers::sync_escrow_balance))
        .route("/api/v1/escrow/sync/earnings", get(rental::handlers::sync_validator_earnings))
        .route("/api/v1/rentals/:rental_id/on-chain", get(rental::handlers::get_rental_on_chain))

        // WebSocket endpoints
        .route("/ws/prover", get(prover::websocket_handler))
        .route("/ws/worker", get(prover::worker_websocket_handler))

        .with_state(state);

    // Apply middleware stack
    let app = if metrics.is_some() {
        api_routes.layer(axum_mw::from_fn(track_request_metrics))
    } else {
        api_routes
    };

    // Apply rate limiting to sensitive endpoints
    let rate_limited_app = if std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok() {
        app.layer(axum_mw::from_fn_with_state(rate_limiter, middleware::rate_limit::rate_limit_middleware))
    } else {
        app
    };

    // Apply layers in reverse order (outermost first)
    rate_limited_app
        .layer({
            let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
            if is_production {
                // Production: restrict CORS to known origins
                let origins = std::env::var("CORS_ALLOWED_ORIGINS")
                    .unwrap_or_else(|_| "https://bitsage.network,https://obelysk.bitsage.network,https://app.bitsage.network".to_string());
                let allowed: Vec<_> = origins.split(',')
                    .filter_map(|s| s.trim().parse().ok())
                    .collect();
                tracing::info!(origins = %origins, "CORS: restricting to configured origins");
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(allowed))
                    .allow_methods(Any)
                    .allow_headers(Any)
            } else {
                // Development: allow all origins
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any)
            }
        })
        .layer(axum::extract::DefaultBodyLimit::max(CONFIG.server.max_body_size))
        .layer(TimeoutLayer::new(Duration::from_secs(CONFIG.server.request_timeout_secs)))
        .layer(TraceLayer::new_for_http())
}

/// Health check endpoint
async fn health_check(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Json<HealthStatus> {
    let uptime = state.started_at.elapsed().as_secs();
    let db_ok = if let Some(db) = state.db.as_ref() {
        db.health_check().await
    } else {
        false
    };
    let workers_count = state.workers.total_workers().await;

    Json(HealthStatus::healthy(uptime, db_ok, workers_count))
}

/// Spawn a supervised background task that logs panics and restarts with exponential backoff.
/// `task_fn` is a closure that returns a new future on each restart (so captured state is cloned).
fn spawn_supervised<F, Fut>(name: &'static str, task_fn: F)
where
    F: Fn() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        let mut restart_count: u32 = 0;
        loop {
            let handle = tokio::spawn(task_fn());
            match handle.await {
                Ok(()) => {
                    // Normal exit — task completed (should not happen for infinite loops)
                    error!(task = name, "Background task exited — not restarting");
                    break;
                }
                Err(e) if e.is_panic() => {
                    restart_count = restart_count.saturating_add(1);
                    let backoff = std::cmp::min(5 * restart_count as u64, 60);
                    error!(
                        task = name,
                        restart_count = restart_count,
                        backoff_secs = backoff,
                        "Background task panicked — restarting"
                    );
                    tokio::time::sleep(Duration::from_secs(backoff)).await;
                }
                Err(e) => {
                    // Cancelled — shutdown in progress
                    info!(task = name, error = %e, "Background task cancelled");
                    break;
                }
            }
        }
    });
}

/// Spawn background tasks with panic supervision
fn spawn_background_tasks(
    state: Arc<AppState>,
    suspension_rx: Option<tokio::sync::mpsc::Receiver<rental::SuspensionEvent>>,
) {
    // Task: Check for stuck deployments
    {
        let cleanup_state = state.clone();
        spawn_supervised("deployment-cleanup", move || {
            let s = cleanup_state.clone();
            async move {
                let timeout_secs: i64 = CONFIG.worker.deployment_timeout_secs as i64;
                let check_interval = Duration::from_secs(60);

                loop {
                    tokio::time::sleep(check_interval).await;

                    let stuck = s.deployments.get_stuck_deployments(timeout_secs).await;

                    for deployment in stuck {
                        warn!(
                            deployment_id = %deployment.id,
                            workload = %deployment.workload_id,
                            worker = %deployment.worker_id,
                            status = ?deployment.status,
                            "Timing out stuck deployment"
                        );

                        s.deployments.timeout_deployment(&deployment.id).await;
                        s.workers.set_worker_active_workload(&deployment.worker_id, None).await;
                    }
                }
            }
        });
    }

    // Task: Periodic GPU state refresh (keeps cache in sync with hardware)
    {
        let gpu_refresh_state = state.clone();
        spawn_supervised("gpu-refresh", move || {
            let s = gpu_refresh_state.clone();
            async move {
                let interval = Duration::from_secs(300);
                loop {
                    tokio::time::sleep(interval).await;
                    if let Err(e) = s.rentals.gpus.refresh().await {
                        warn!(error = %e, "GPU state refresh failed");
                    }
                }
            }
        });
    }

    // Task: Hourly rental billing and expiration checks
    {
        let billing_state = state.clone();
        spawn_supervised("billing-expiration", move || {
            let s = billing_state.clone();
            async move {
                let billing_interval = Duration::from_secs(CONFIG.rental.billing_interval_secs);
                let expiration_interval = Duration::from_secs(CONFIG.rental.expiration_check_interval_secs);

                let mut last_billing = Instant::now();

                loop {
                    tokio::time::sleep(expiration_interval).await;

                    // Check for expired rentals
                    s.rentals.sessions.check_expirations(
                        &s.rentals.containers,
                        &s.rentals.gpus,
                        &s.rentals.network,
                        &s.rentals.billing,
                    ).await;

                    // Container liveness check: detect crashed containers and suspend billing
                    let active_sessions = s.rentals.sessions.get_all_active_sessions().await;
                    for session in &active_sessions {
                        if let Some(ref container_id) = session.container_id {
                            match s.rentals.containers.is_container_running(container_id).await {
                                Ok(false) => {
                                    warn!(
                                        rental_id = %session.id,
                                        container_id = %container_id,
                                        "Container crashed — suspending rental to stop billing"
                                    );
                                    if let Err(e) = s.rentals.sessions.suspend_rental(
                                        session.id,
                                        "Container stopped unexpectedly — billing paused"
                                    ).await {
                                        error!(rental_id = %session.id, error = %e, "Failed to suspend crashed rental");
                                    }
                                }
                                Err(e) => {
                                    debug!(container_id = %container_id, error = %e, "Container inspect failed (may have been removed)");
                                }
                                Ok(true) => {} // Still running, all good
                            }
                        }
                    }

                    // Process billing periodically
                    if last_billing.elapsed() >= billing_interval {
                        last_billing = Instant::now();

                        if let Err(e) = s.rentals.billing.process_hourly_billing(
                            &s.rentals.sessions,
                        ).await {
                            error!(error = %e, "Failed to process hourly billing");
                        }
                    }
                }
            }
        });
    }

    // Task: Update business metrics
    {
        let metrics_state = state.clone();
        spawn_supervised("metrics-update", move || {
            let s = metrics_state.clone();
            async move {
                let interval = Duration::from_secs(30);

                loop {
                    tokio::time::sleep(interval).await;

                    // Update worker metrics
                    let workers = s.workers.total_workers().await;
                    BusinessMetrics::set_active_workers(workers);

                    // Update WebSocket metrics
                    let ws_workers = s.worker_channels.connection_count().await;
                    BusinessMetrics::set_websocket_connections(0, ws_workers);
                }
            }
        });
    }

    // Task: Rate limiter cleanup
    {
        let rate_limiter = RateLimitLayer::new();
        spawn_supervised("rate-limit-cleanup", move || {
            let rl = rate_limiter.clone();
            async move {
                let interval = Duration::from_secs(300);

                loop {
                    tokio::time::sleep(interval).await;
                    rl.cleanup().await;
                }
            }
        });
    }

    // Task: Worker heartbeat timeout check
    {
        let heartbeat_state = state.clone();
        spawn_supervised("heartbeat-check", move || {
            let s = heartbeat_state.clone();
            async move {
                let timeout_secs = CONFIG.worker.heartbeat_timeout_secs;
                let check_interval = Duration::from_secs(30);

                loop {
                    tokio::time::sleep(check_interval).await;

                    // Mark workers offline if no heartbeat within timeout
                    let stale_count = s.workers.mark_stale_workers_offline(timeout_secs).await;
                    if stale_count > 0 {
                        tracing::warn!(count = stale_count, timeout_secs = timeout_secs, "Marked stale workers offline");
                    }
                }
            }
        });
    }

    // Task: Expire overdue proof jobs
    {
        let expiry_state = state.clone();
        spawn_supervised("job-expiry", move || {
            let s = expiry_state.clone();
            async move {
                let check_interval = Duration::from_secs(15);

                loop {
                    tokio::time::sleep(check_interval).await;

                    let expired = {
                        let mut proofs = s.proofs.write().await;
                        proofs.expire_overdue_jobs()
                    };

                    for (job_id, worker_id) in &expired {
                        tracing::warn!(
                            job_id = %job_id,
                            worker_id = ?worker_id,
                            "Expired overdue proof job"
                        );
                    }
                }
            }
        });
    }

    // Task: Auto-settle validator earnings on-chain (every 5 minutes)
    {
        let settlement_state = state.clone();
        spawn_supervised("auto-settlement", move || {
            let s = settlement_state.clone();
            async move {
                let interval = Duration::from_secs(300);
                let min_settlement_sage: u64 = 50;

                loop {
                    tokio::time::sleep(interval).await;

                    // Only attempt if on-chain escrow is configured
                    if !s.rentals.billing.is_on_chain_enabled() {
                        continue;
                    }

                    let settleable = s.rentals.billing
                        .get_settleable_validators(min_settlement_sage).await;

                    if settleable.is_empty() {
                        continue;
                    }

                    info!(
                        count = settleable.len(),
                        "Auto-settlement: found validators with pending earnings"
                    );

                    for (wallet, amount) in &settleable {
                        if let Some(escrow) = s.rentals.billing.escrow_client() {
                            match escrow.submit_earnings_settlement(wallet, *amount).await {
                                Ok(tx_hash) => {
                                    s.rentals.billing
                                        .mark_earnings_settled(wallet, *amount).await;

                                    // Persist settlement to DB
                                    if let Some(db) = s.db.as_ref() {
                                        let repo = db.validator_earnings();
                                        if let Err(e) = repo.add_earnings(wallet, -(*amount as i64)).await {
                                            error!(validator = %wallet, error = %e, "Failed to update DB after settlement");
                                        }
                                    }

                                    info!(
                                        validator = %wallet,
                                        amount = amount,
                                        tx_hash = %tx_hash,
                                        "Auto-settled validator earnings on-chain"
                                    );
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        validator = %wallet,
                                        amount = amount,
                                        error = %e,
                                        "Failed to auto-settle earnings (will retry next cycle)"
                                    );
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    // Task: Handle rental suspensions (insufficient funds, billing failures)
    // Note: This task uses an mpsc Receiver which is not Clone, so it can't use spawn_supervised.
    // If it panics, the channel closes and the error is logged.
    if let Some(mut rx) = suspension_rx {
        let suspension_state = state.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                warn!(
                    rental_id = %event.rental_id,
                    tenant = %event.tenant_wallet,
                    reason = ?event.reason,
                    outstanding = event.outstanding_amount,
                    "Processing rental suspension"
                );

                // 1. Update rental status to suspended
                if let Err(e) = suspension_state.rentals.sessions.suspend_rental(
                    event.rental_id,
                    &event.reason.to_string(),
                ).await {
                    error!(
                        rental_id = %event.rental_id,
                        error = %e,
                        "Failed to update rental status to suspended"
                    );
                    continue;
                }

                // 2. Stop the container (but don't delete - allow resume)
                if let Some(rental) = suspension_state.rentals.sessions.get_rental(event.rental_id).await {
                    if let Some(container_id) = &rental.container_id {
                        if let Err(e) = suspension_state.rentals.containers.stop_container(container_id).await {
                            error!(
                                rental_id = %event.rental_id,
                                container_id = %container_id,
                                error = %e,
                                "Failed to stop container during suspension"
                            );
                        }
                    }

                    // 3. Mark GPU as available (but reserved for resume)
                    if let Some(gpu_id) = &rental.gpu_id {
                        suspension_state.rentals.update_gpu_availability(
                            gpu_id,
                            rental::GpuAvailability::Reserved {
                                rental_id: event.rental_id,
                                reserved_until: chrono::Utc::now() + chrono::Duration::hours(1),
                            },
                        ).await;
                    }
                }

                info!(
                    rental_id = %event.rental_id,
                    "Rental suspended successfully - awaiting funds or manual resume"
                );
            }

            // Channel closed — sender was dropped. This should not happen during normal operation.
            error!("Suspension channel closed unexpectedly — rental suspensions will no longer be processed. This is a bug.");
        });
    } else {
        warn!("No suspension channel available — rental suspensions will not be processed");
    }
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, initiating graceful shutdown...");
        }
        _ = terminate => {
            info!("Received SIGTERM, initiating graceful shutdown...");
        }
    }

    // Give active connections time to complete
    info!("Waiting for active connections to complete...");
    tokio::time::sleep(Duration::from_secs(5)).await;
}
