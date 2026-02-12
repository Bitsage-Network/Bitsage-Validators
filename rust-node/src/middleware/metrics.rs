//! Metrics Middleware
//!
//! Prometheus metrics for observability.

use axum::{
    body::Body,
    extract::MatchedPath,
    http::Request,
    middleware::Next,
    response::Response,
};
use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::{Matcher, PrometheusBuilder, PrometheusHandle};
use std::time::Instant;
use tracing::info;

use crate::config::CONFIG;

/// Metrics layer for request tracking
#[derive(Clone)]
pub struct MetricsLayer {
    handle: PrometheusHandle,
}

impl MetricsLayer {
    /// Initialize metrics and return the layer
    pub fn new() -> Self {
        let builder = PrometheusBuilder::new();

        // Configure histogram buckets for latency
        let builder = builder
            .set_buckets_for_metric(
                Matcher::Full("http_request_duration_seconds".to_string()),
                &[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            )
            .expect("Failed to configure histogram buckets");

        let handle = builder
            .install_recorder()
            .expect("Failed to install Prometheus recorder");

        // Initialize counters
        counter!("http_requests_total", "method" => "GET", "path" => "/", "status" => "200").absolute(0);

        info!(port = CONFIG.metrics.port, "Metrics initialized");

        Self { handle }
    }

    /// Get the Prometheus handle for scraping
    pub fn handle(&self) -> PrometheusHandle {
        self.handle.clone()
    }

    /// Render metrics output
    pub fn render(&self) -> String {
        self.handle.render()
    }
}

impl Default for MetricsLayer {
    fn default() -> Self {
        Self::new()
    }
}

/// Track request metrics (axum 0.7 compatible)
pub async fn track_request_metrics(request: Request<Body>, next: Next) -> Response {
    let start = Instant::now();
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    let method = request.method().to_string();

    // Run the request
    let response = next.run(request).await;

    let duration = start.elapsed().as_secs_f64();
    let status = response.status().as_u16().to_string();

    // Record metrics
    counter!("http_requests_total", "method" => method.clone(), "path" => path.clone(), "status" => status.clone()).increment(1);
    histogram!("http_request_duration_seconds", "method" => method, "path" => path, "status" => status).record(duration);

    response
}

/// Business metrics
pub struct BusinessMetrics;

impl BusinessMetrics {
    /// Track active workers
    pub fn set_active_workers(count: usize) {
        gauge!("bitsage_active_workers").set(count as f64);
    }

    /// Track active rentals
    pub fn set_active_rentals(count: usize) {
        gauge!("bitsage_active_rentals").set(count as f64);
    }

    /// Track active deployments
    pub fn set_active_deployments(count: usize) {
        gauge!("bitsage_active_deployments").set(count as f64);
    }

    /// Track proof generation
    pub fn record_proof_generation(circuit_type: &str, duration_ms: u64, success: bool) {
        let status = if success { "success" } else { "failure" };
        counter!("bitsage_proofs_total", "circuit" => circuit_type.to_string(), "status" => status).increment(1);
        if success {
            histogram!("bitsage_proof_duration_seconds", "circuit" => circuit_type.to_string())
                .record(duration_ms as f64 / 1000.0);
        }
    }

    /// Track workload deployment
    pub fn record_deployment(workload_type: &str, success: bool) {
        let status = if success { "success" } else { "failure" };
        counter!("bitsage_deployments_total", "workload" => workload_type.to_string(), "status" => status).increment(1);
    }

    /// Track rental billing
    pub fn record_billing(amount_sage: u64) {
        counter!("bitsage_billing_total_sage").increment(amount_sage);
    }

    /// Track escrow deposits
    pub fn record_deposit(amount_sage: u64) {
        counter!("bitsage_deposits_total_sage").increment(amount_sage);
    }

    /// Track WebSocket connections
    pub fn set_websocket_connections(client: usize, worker: usize) {
        gauge!("bitsage_websocket_clients").set(client as f64);
        gauge!("bitsage_websocket_workers").set(worker as f64);
    }

    /// Track GPU availability
    pub fn set_gpu_availability(available: usize, in_use: usize, offline: usize) {
        gauge!("bitsage_gpus_available").set(available as f64);
        gauge!("bitsage_gpus_in_use").set(in_use as f64);
        gauge!("bitsage_gpus_offline").set(offline as f64);
    }

    /// Track database pool stats
    pub fn set_db_pool_stats(active: usize, idle: usize, size: usize) {
        gauge!("bitsage_db_connections_active").set(active as f64);
        gauge!("bitsage_db_connections_idle").set(idle as f64);
        gauge!("bitsage_db_connections_size").set(size as f64);
    }
}

/// Health check response
#[derive(serde::Serialize)]
pub struct HealthStatus {
    pub status: &'static str,
    pub version: &'static str,
    pub uptime_seconds: u64,
    pub database: HealthComponent,
    pub workers: HealthComponent,
}

#[derive(serde::Serialize)]
pub struct HealthComponent {
    pub status: &'static str,
    pub message: Option<String>,
}

impl HealthStatus {
    pub fn healthy(uptime: u64, db_ok: bool, workers_count: usize) -> Self {
        Self {
            status: if db_ok { "healthy" } else { "degraded" },
            version: env!("CARGO_PKG_VERSION"),
            uptime_seconds: uptime,
            database: HealthComponent {
                status: if db_ok { "up" } else { "down" },
                message: None,
            },
            workers: HealthComponent {
                status: if workers_count > 0 { "up" } else { "degraded" },
                message: Some(format!("{} workers connected", workers_count)),
            },
        }
    }
}
