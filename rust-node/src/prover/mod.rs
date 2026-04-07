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

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Worker pool for GPU and TEE provers
pub struct WorkerPool {
    gpu_workers: RwLock<HashMap<String, GpuWorker>>,
    tee_enclaves: RwLock<HashMap<String, TeeEnclave>>,
    /// Last heartbeat time per worker ID
    heartbeats: RwLock<HashMap<String, Instant>>,
    /// Pending job queue (FIFO) for pull-based assignment
    job_queue: RwLock<VecDeque<handlers::PendingJobInfo>>,
}

impl WorkerPool {
    pub fn new() -> Self {
        Self {
            gpu_workers: RwLock::new(HashMap::new()),
            tee_enclaves: RwLock::new(HashMap::new()),
            heartbeats: RwLock::new(HashMap::new()),
            job_queue: RwLock::new(VecDeque::new()),
        }
    }

    /// Get current GPU worker count
    pub async fn gpu_worker_count(&self) -> usize {
        self.gpu_workers.read().await.len()
    }

    /// Register a GPU worker
    pub async fn register_gpu_worker(&self, worker: GpuWorker) {
        let id = worker.id.clone();
        let mut workers = self.gpu_workers.write().await;
        workers.insert(id.clone(), worker);
        self.heartbeats.write().await.insert(id, Instant::now());
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

    /// Maximum queued jobs to prevent memory exhaustion
    const MAX_QUEUE_SIZE: usize = 10_000;

    /// Enqueue a job for pull-based worker assignment
    pub async fn enqueue_job(&self, job: handlers::PendingJobInfo) -> Result<(), String> {
        let mut queue = self.job_queue.write().await;
        if queue.len() >= Self::MAX_QUEUE_SIZE {
            return Err(format!("Job queue at capacity ({})", Self::MAX_QUEUE_SIZE));
        }
        tracing::info!(job_id = %job.job_id, queue_len = queue.len(), "Job enqueued for worker assignment");
        queue.push_back(job);
        Ok(())
    }

    /// Get a pending job for a worker (called during heartbeat).
    /// Pops the next non-expired job from the queue and assigns it to the requesting worker.
    pub async fn get_pending_job_for_worker(&self, worker_id: &str) -> Option<handlers::PendingJobInfo> {
        let mut queue = self.job_queue.write().await;
        let now = chrono::Utc::now().timestamp();
        // Skip expired jobs
        while let Some(front) = queue.front() {
            if front.deadline < now {
                let expired = queue.pop_front().unwrap();
                tracing::debug!(job_id = %expired.job_id, "Skipping expired queued job");
                continue;
            }
            break;
        }
        if let Some(job) = queue.pop_front() {
            tracing::info!(
                job_id = %job.job_id,
                worker_id = %worker_id,
                "Assigning queued job to worker"
            );
            Some(job)
        } else {
            None
        }
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

    /// Update heartbeat for a worker
    pub async fn update_heartbeat(&self, worker_id: &str) {
        self.heartbeats.write().await.insert(worker_id.to_string(), Instant::now());
    }

    /// Mark stale workers (no heartbeat within timeout) as offline by removing them.
    /// Returns the number of workers removed.
    pub async fn mark_stale_workers_offline(&self, timeout_secs: u64) -> usize {
        let now = Instant::now();
        let threshold = std::time::Duration::from_secs(timeout_secs);

        // Find stale worker IDs
        let stale_ids: Vec<String> = {
            let heartbeats = self.heartbeats.read().await;
            heartbeats.iter()
                .filter(|(_, last_seen)| now.duration_since(**last_seen) > threshold)
                .map(|(id, _)| id.clone())
                .collect()
        };

        if stale_ids.is_empty() {
            return 0;
        }

        // Remove stale workers
        let mut gpu_workers = self.gpu_workers.write().await;
        let mut tee_enclaves = self.tee_enclaves.write().await;
        let mut heartbeats = self.heartbeats.write().await;

        let mut removed = 0;
        for id in &stale_ids {
            if gpu_workers.remove(id).is_some() {
                removed += 1;
                tracing::info!(worker_id = %id, "Stale GPU worker removed (no heartbeat)");
            }
            if tee_enclaves.remove(id).is_some() {
                removed += 1;
                tracing::info!(worker_id = %id, "Stale TEE enclave removed (no heartbeat)");
            }
            heartbeats.remove(id);
        }
        removed
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

    pub fn get_pending_mut(&mut self, id: &Uuid) -> Option<&mut ProofJob> {
        self.pending.get_mut(id)
    }

    pub fn complete(&mut self, id: Uuid, result: ProofResult) {
        self.pending.remove(&id);
        self.completed.insert(id, result);
    }

    pub fn get_completed(&self, id: &Uuid) -> Option<&ProofResult> {
        self.completed.get(id)
    }

    /// Assign a worker to a pending job
    pub fn assign_worker(&mut self, id: &Uuid, worker_id: &str) {
        if let Some(job) = self.pending.get_mut(id) {
            job.worker_id = Some(worker_id.to_string());
            job.status = ProofJobStatus::Proving;
        }
    }

    /// Get count of completed proofs (for stats)
    pub fn completed_count(&self) -> usize {
        self.completed.len()
    }

    /// Get count of pending proofs (for stats)
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Expire jobs that have exceeded their deadline.
    /// Returns the IDs and worker_ids of expired jobs so the caller can reassign or notify.
    pub fn expire_overdue_jobs(&mut self) -> Vec<(Uuid, Option<String>)> {
        let now = chrono::Utc::now().timestamp();
        let expired: Vec<(Uuid, Option<String>)> = self.pending.iter()
            .filter(|(_, job)| job.deadline > 0 && now > job.deadline && job.status == ProofJobStatus::Proving)
            .map(|(id, job)| (*id, job.worker_id.clone()))
            .collect();

        for (id, _) in &expired {
            if let Some(job) = self.pending.get_mut(id) {
                job.status = ProofJobStatus::Failed;
            }
            self.pending.remove(id);
        }

        expired
    }
}

impl Default for ProofState {
    fn default() -> Self {
        Self::new()
    }
}
