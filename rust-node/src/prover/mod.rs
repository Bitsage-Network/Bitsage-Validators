//! Prover Module
//!
//! Handles proof routing, worker management, and WebSocket streaming.

mod router;
mod registry;
mod key_cache;
mod streaming;
mod tee_bridge;
mod types;
pub mod workload_types;
pub mod workload_handlers;

pub mod handlers;

pub use router::ProofRouter;
pub use registry::CircuitRegistry;
pub use key_cache::ProvingKeyCache;
pub use streaming::{websocket_handler, worker_websocket_handler, WorkerChannelManager, WorkerChannelError};
pub use types::*;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Worker pool for GPU and TEE provers
pub struct WorkerPool {
    gpu_workers: RwLock<HashMap<String, GpuWorker>>,
    tee_enclaves: RwLock<HashMap<String, TeeEnclave>>,
}

impl WorkerPool {
    pub fn new() -> Self {
        Self {
            gpu_workers: RwLock::new(HashMap::new()),
            tee_enclaves: RwLock::new(HashMap::new()),
        }
    }

    /// Register a GPU worker
    pub async fn register_gpu_worker(&self, worker: GpuWorker) {
        let mut workers = self.gpu_workers.write().await;
        workers.insert(worker.id.clone(), worker);
    }

    /// Get available GPU workers
    pub async fn get_available_gpu_workers(&self) -> Vec<GpuWorker> {
        let workers = self.gpu_workers.read().await;
        workers.values()
            .filter(|w| w.current_load < w.capacity)
            .cloned()
            .collect()
    }

    /// Register a TEE enclave
    pub async fn register_tee_enclave(&self, enclave: TeeEnclave) {
        let mut enclaves = self.tee_enclaves.write().await;
        enclaves.insert(enclave.id.clone(), enclave);
    }

    /// Get available TEE enclaves
    pub async fn get_available_tee_enclaves(&self) -> Vec<TeeEnclave> {
        let enclaves = self.tee_enclaves.read().await;
        enclaves.values()
            .filter(|e| e.is_healthy)
            .cloned()
            .collect()
    }

    /// Update worker status (called from heartbeat)
    pub async fn update_worker_status(&self, worker_id: &str, current_load: u32, is_healthy: bool) {
        // Try GPU workers first
        {
            let mut workers = self.gpu_workers.write().await;
            if let Some(worker) = workers.get_mut(worker_id) {
                worker.current_load = current_load;
                return;
            }
        }

        // Try TEE enclaves
        {
            let mut enclaves = self.tee_enclaves.write().await;
            if let Some(enclave) = enclaves.get_mut(worker_id) {
                enclave.is_healthy = is_healthy;
                enclave.last_attestation = chrono::Utc::now().timestamp();
            }
        }
    }

    /// Get a pending job for a worker (called during heartbeat)
    pub async fn get_pending_job_for_worker(&self, _worker_id: &str) -> Option<handlers::PendingJobInfo> {
        // TODO: Implement job queue and assignment logic
        // For now, return None - jobs will be pushed via WebSocket
        None
    }

    /// Deregister a worker
    pub async fn deregister_worker(&self, worker_id: &str) {
        // Try GPU workers first
        {
            let mut workers = self.gpu_workers.write().await;
            if workers.remove(worker_id).is_some() {
                tracing::info!(worker_id = %worker_id, "GPU worker deregistered");
                return;
            }
        }

        // Try TEE enclaves
        {
            let mut enclaves = self.tee_enclaves.write().await;
            if enclaves.remove(worker_id).is_some() {
                tracing::info!(worker_id = %worker_id, "TEE enclave deregistered");
            }
        }
    }

    /// Get total worker count
    pub async fn total_workers(&self) -> usize {
        let gpu_count = self.gpu_workers.read().await.len();
        let tee_count = self.tee_enclaves.read().await.len();
        gpu_count + tee_count
    }

    /// Get GPU workers owned by a specific wallet address
    pub async fn get_workers_by_owner(&self, owner_address: &str) -> Vec<GpuWorker> {
        let workers = self.gpu_workers.read().await;
        workers.values()
            .filter(|w| {
                w.owner_address.as_ref()
                    .map(|addr| addr == owner_address)
                    .unwrap_or(false)
            })
            .cloned()
            .collect()
    }

    /// Get a specific GPU worker by ID
    pub async fn get_gpu_worker(&self, worker_id: &str) -> Option<GpuWorker> {
        let workers = self.gpu_workers.read().await;
        workers.get(worker_id).cloned()
    }

    /// Update worker's active workload
    pub async fn set_worker_active_workload(&self, worker_id: &str, workload_id: Option<String>) {
        let mut workers = self.gpu_workers.write().await;
        if let Some(worker) = workers.get_mut(worker_id) {
            worker.active_workload = workload_id;
        }
    }

    /// Get all GPU workers
    pub async fn get_all_gpu_workers(&self) -> Vec<GpuWorker> {
        let workers = self.gpu_workers.read().await;
        workers.values().cloned().collect()
    }
}

impl Default for WorkerPool {
    fn default() -> Self {
        Self::new()
    }
}

/// State for tracking in-progress proofs
pub struct ProofState {
    pending: HashMap<Uuid, ProofJob>,
    completed: HashMap<Uuid, ProofResult>,
}

impl ProofState {
    pub fn new() -> Self {
        Self {
            pending: HashMap::new(),
            completed: HashMap::new(),
        }
    }

    pub fn add_pending(&mut self, job: ProofJob) {
        self.pending.insert(job.request_id, job);
    }

    pub fn get_pending(&self, id: &Uuid) -> Option<&ProofJob> {
        self.pending.get(id)
    }

    pub fn complete(&mut self, id: Uuid, result: ProofResult) {
        self.pending.remove(&id);
        self.completed.insert(id, result);
    }

    pub fn get_completed(&self, id: &Uuid) -> Option<&ProofResult> {
        self.completed.get(id)
    }
}

impl Default for ProofState {
    fn default() -> Self {
        Self::new()
    }
}
