//! STWO GPU Worker Binary
//!
//! Standalone GPU worker service for BitSage network.
//!
//! Usage:
//!   stwo-gpu-worker [OPTIONS]
//!
//! Options:
//!   --coordinator-url <URL>  Coordinator URL (default: http://localhost:3030)
//!   --worker-id <ID>         Worker identifier (default: auto-generated)
//!   --max-jobs <N>           Max concurrent jobs (default: 4)

use std::env;

use stwo_gpu::{run_worker, GpuBackend, WorkerConfig};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "stwo_gpu=info,stwo_gpu_worker=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Parse configuration from environment
    let config = WorkerConfig {
        worker_id: env::var("WORKER_ID")
            .unwrap_or_else(|_| format!("gpu-worker-{}", uuid::Uuid::new_v4())),
        coordinator_url: env::var("COORDINATOR_URL")
            .unwrap_or_else(|_| "http://coordinator:3030".to_string()),
        ws_url: env::var("WS_URL")
            .unwrap_or_else(|_| "ws://coordinator:3030".to_string()),
        gpu_backend: detect_backend(),
        max_concurrent_jobs: env::var("MAX_CONCURRENT_JOBS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(4),
        heartbeat_interval_secs: env::var("HEARTBEAT_INTERVAL")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(30),
    };

    // Log GPU info
    log_gpu_info(&config);

    info!(
        worker_id = %config.worker_id,
        coordinator = %config.coordinator_url,
        backend = ?config.gpu_backend,
        max_jobs = config.max_concurrent_jobs,
        "Starting STWO GPU Worker"
    );

    // Run the worker
    run_worker(config).await?;

    Ok(())
}

/// Detect GPU backend based on environment and available hardware
fn detect_backend() -> GpuBackend {
    // Check for forced backend via environment
    if let Ok(backend) = env::var("GPU_BACKEND") {
        match backend.to_lowercase().as_str() {
            "cuda" => return GpuBackend::Cuda,
            "metal" => return GpuBackend::Metal,
            "vulkan" => return GpuBackend::Vulkan,
            "cpu" => return GpuBackend::Cpu,
            _ => {}
        }
    }

    // Auto-detect
    GpuBackend::detect()
}

/// Log GPU hardware information
fn log_gpu_info(config: &WorkerConfig) {
    info!("╔══════════════════════════════════════════════════════════════╗");
    info!("║              STWO GPU Worker for BitSage Network             ║");
    info!("╚══════════════════════════════════════════════════════════════╝");
    info!("");

    match config.gpu_backend {
        GpuBackend::Cuda => {
            info!("GPU Backend: NVIDIA CUDA");
            // Try to get CUDA device info
            #[cfg(feature = "cuda")]
            {
                // TODO: Query CUDA device properties
                info!("  CUDA device detection available");
            }
            #[cfg(not(feature = "cuda"))]
            {
                info!("  Note: CUDA feature not compiled, using CPU fallback");
            }
        }
        GpuBackend::Metal => {
            info!("GPU Backend: Apple Metal");
            #[cfg(target_os = "macos")]
            {
                info!("  Metal acceleration enabled for macOS");
            }
        }
        GpuBackend::Vulkan => {
            info!("GPU Backend: Vulkan (experimental)");
        }
        GpuBackend::Cpu => {
            info!("GPU Backend: CPU (fallback mode)");
            info!("  No GPU acceleration available - proofs will be slower");
        }
    }

    info!("");
    info!("Worker ID:        {}", config.worker_id);
    info!("Coordinator:      {}", config.coordinator_url);
    info!("Max Concurrent:   {} jobs", config.max_concurrent_jobs);
    info!("");
}
