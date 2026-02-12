//! Proof Router
//!
//! Routes proof requests to the appropriate backend based on circuit type and mode.

use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::*;
use super::{CircuitRegistry, WorkerPool, ProofState};

/// Proof router for dispatching to workers/enclaves
pub struct ProofRouter {
    registry: CircuitRegistry,
}

impl ProofRouter {
    pub fn new() -> Self {
        Self {
            registry: CircuitRegistry::new(),
        }
    }

    /// Route a proof request to the appropriate backend
    pub async fn route(
        &self,
        request: &ProofRequest,
        workers: &WorkerPool,
        state: &RwLock<ProofState>,
    ) -> Result<Uuid, RouterError> {
        let mode = if request.mode == ProofMode::Auto {
            request.circuit.default_mode()
        } else {
            request.mode
        };

        // Validate circuit is supported
        if !self.registry.supports_circuit(request.circuit) {
            return Err(RouterError::UnsupportedCircuit(request.circuit));
        }

        // Create job
        let job = ProofJob {
            request_id: request.request_id,
            circuit: request.circuit,
            mode,
            status: ProofJobStatus::Pending,
            progress: None,
            worker_id: None,
            started_at: chrono::Utc::now().timestamp(),
            deadline: request.deadline,
        };

        // Add to state
        {
            let mut state = state.write().await;
            state.add_pending(job.clone());
        }

        // Route based on mode
        match mode {
            ProofMode::WorkerGpu => {
                self.route_to_gpu(request, workers, state).await?;
            }
            ProofMode::TeeAssisted => {
                self.route_to_tee(request, workers, state).await?;
            }
            ProofMode::ClientWasm => {
                // Client handles WASM proofs locally
                return Err(RouterError::ClientSideOnly);
            }
            ProofMode::Auto => unreachable!("Auto mode should be resolved above"),
        }

        Ok(request.request_id)
    }

    /// Route to GPU worker
    async fn route_to_gpu(
        &self,
        request: &ProofRequest,
        workers: &WorkerPool,
        _state: &RwLock<ProofState>,
    ) -> Result<(), RouterError> {
        let available = workers.get_available_gpu_workers().await;

        if available.is_empty() {
            return Err(RouterError::NoWorkersAvailable);
        }

        // Select best worker (lowest load, then lowest latency)
        let worker = available.iter()
            .min_by(|a, b| {
                let load_a = a.current_load as f32 / a.capacity as f32;
                let load_b = b.current_load as f32 / b.capacity as f32;
                load_a.partial_cmp(&load_b)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| a.latency_ms.cmp(&b.latency_ms))
            })
            .ok_or(RouterError::NoWorkersAvailable)?;

        tracing::info!(
            request_id = %request.request_id,
            worker_id = %worker.id,
            circuit = ?request.circuit,
            "Routing proof to GPU worker"
        );

        // TODO: Actually dispatch to worker via gRPC/HTTP
        // For now, just log the routing decision

        Ok(())
    }

    /// Route to TEE enclave
    async fn route_to_tee(
        &self,
        request: &ProofRequest,
        workers: &WorkerPool,
        _state: &RwLock<ProofState>,
    ) -> Result<(), RouterError> {
        let available = workers.get_available_tee_enclaves().await;

        if available.is_empty() {
            return Err(RouterError::NoEnclavesAvailable);
        }

        // Select healthy enclave with most recent attestation
        let enclave = available.iter()
            .max_by_key(|e| e.last_attestation)
            .ok_or(RouterError::NoEnclavesAvailable)?;

        tracing::info!(
            request_id = %request.request_id,
            enclave_id = %enclave.id,
            circuit = ?request.circuit,
            "Routing privacy proof to TEE enclave"
        );

        // TODO: Actually dispatch to enclave
        // 1. Verify the encrypted witness is properly formatted
        // 2. Forward to enclave over secure channel
        // 3. Track job progress

        Ok(())
    }

    /// Get circuit configuration
    pub fn get_circuit_config(&self, circuit: CircuitType) -> Option<CircuitConfig> {
        self.registry.get(circuit)
    }

    /// Get capabilities
    pub fn get_capabilities(&self) -> ProverCapabilities {
        ProverCapabilities {
            circuits: self.registry.supported_circuits(),
            modes: vec![
                ProofMode::ClientWasm,
                ProofMode::WorkerGpu,
                ProofMode::TeeAssisted,
            ],
            gpu_backends: vec![GpuBackend::Cuda, GpuBackend::Metal],
            tee_types: vec![TeeType::Sgx, TeeType::Tdx],
            max_concurrent: 100,
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

impl Default for ProofRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Circuit configuration
#[derive(Debug, Clone)]
pub struct CircuitConfig {
    pub id: CircuitType,
    pub name: String,
    pub default_mode: ProofMode,
    pub verifier_address: String,
    pub estimated_time_ms: u64,
    pub proving_key_size: u64,
}

/// Router errors
#[derive(Debug, thiserror::Error)]
pub enum RouterError {
    #[error("Unsupported circuit: {0:?}")]
    UnsupportedCircuit(CircuitType),

    #[error("No GPU workers available")]
    NoWorkersAvailable,

    #[error("No TEE enclaves available")]
    NoEnclavesAvailable,

    #[error("Client-side proof mode - not routed")]
    ClientSideOnly,

    #[error("Request timeout")]
    Timeout,

    #[error("Internal error: {0}")]
    Internal(String),
}
