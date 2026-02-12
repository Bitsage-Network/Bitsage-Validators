//! BitSage TEE Worker Binary
//!
//! Trusted Execution Environment worker for privacy-preserving proofs.
//! Supports Intel TDX (H100), SGX, and AMD SEV.
//!
//! Usage:
//!   tee-worker [OPTIONS]
//!
//! Environment Variables:
//!   COORDINATOR_URL     - Coordinator URL (default: http://localhost:3030)
//!   WORKER_ID           - Worker identifier (default: auto-generated)
//!   TEE_TYPE            - Force TEE type: tdx, sgx, sev, simulated
//!   MAX_CONCURRENT_JOBS - Max concurrent jobs (default: 2)

use std::env;

use tee_prover::worker::{run_tee_worker, TeeType, TeeWorkerConfig};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tee_prover=info,tee_worker=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Parse configuration
    let config = TeeWorkerConfig {
        worker_id: env::var("WORKER_ID")
            .unwrap_or_else(|_| format!("tee-worker-{}", uuid::Uuid::new_v4())),
        coordinator_url: env::var("COORDINATOR_URL")
            .unwrap_or_else(|_| "http://coordinator:3030".to_string()),
        ws_url: env::var("WS_URL")
            .unwrap_or_else(|_| "ws://coordinator:3030".to_string()),
        tee_type: detect_tee_type(),
        max_concurrent_jobs: env::var("MAX_CONCURRENT_JOBS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(2),
        heartbeat_interval_secs: env::var("HEARTBEAT_INTERVAL")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(30),
        attestation_refresh_secs: env::var("ATTESTATION_REFRESH")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(300),
    };

    // Log TEE info
    log_tee_info(&config);

    info!(
        worker_id = %config.worker_id,
        coordinator = %config.coordinator_url,
        tee_type = ?config.tee_type,
        "Starting BitSage TEE Worker"
    );

    // Run the worker
    run_tee_worker(config).await?;

    Ok(())
}

/// Detect TEE type from environment or hardware
fn detect_tee_type() -> TeeType {
    // Check for forced TEE type
    if let Ok(tee) = env::var("TEE_TYPE") {
        match tee.to_lowercase().as_str() {
            "tdx" => return TeeType::Tdx,
            "sgx" => return TeeType::Sgx,
            "sev" => return TeeType::Sev,
            "simulated" | "sim" => return TeeType::Simulated,
            _ => {}
        }
    }

    // Auto-detect
    TeeType::detect()
}

/// Log TEE hardware information
fn log_tee_info(config: &TeeWorkerConfig) {
    info!("╔══════════════════════════════════════════════════════════════╗");
    info!("║           BitSage TEE Worker - Confidential Computing        ║");
    info!("╚══════════════════════════════════════════════════════════════╝");
    info!("");

    match config.tee_type {
        TeeType::Tdx => {
            info!("TEE Type: Intel TDX (Trust Domain Extensions)");
            info!("  ✓ Native H100 Confidential Computing support");
            info!("  ✓ Hardware-level memory encryption");
            info!("  ✓ TD attestation via Intel Trust Authority");
        }
        TeeType::Sgx => {
            info!("TEE Type: Intel SGX (Software Guard Extensions)");
            info!("  ✓ Enclave-based isolation");
            info!("  ✓ Remote attestation via IAS/DCAP");
        }
        TeeType::Sev => {
            info!("TEE Type: AMD SEV-SNP");
            info!("  ✓ Secure Encrypted Virtualization");
            info!("  ✓ AMD Key Distribution Service attestation");
        }
        TeeType::Simulated => {
            info!("TEE Type: SIMULATED (Development Mode)");
            info!("  ⚠ NOT SECURE - For testing only!");
            info!("  ⚠ Witness data is not protected");
        }
    }

    info!("");
    info!("Worker Configuration:");
    info!("  Worker ID:           {}", config.worker_id);
    info!("  Coordinator:         {}", config.coordinator_url);
    info!("  Max Concurrent Jobs: {}", config.max_concurrent_jobs);
    info!("  Attestation Refresh: {}s", config.attestation_refresh_secs);
    info!("");

    // Security warning for non-production
    if config.tee_type == TeeType::Simulated {
        info!("╔══════════════════════════════════════════════════════════════╗");
        info!("║  ⚠  SECURITY WARNING: Running in simulation mode!            ║");
        info!("║      Private witness data is NOT protected.                  ║");
        info!("║      Do NOT use for real privacy-sensitive operations.       ║");
        info!("╚══════════════════════════════════════════════════════════════╝");
        info!("");
    }
}
