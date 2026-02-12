//! TEE Worker Service
//!
//! Trusted Execution Environment worker for privacy-preserving proofs.
//! Supports:
//! - Intel SGX (Software Guard Extensions)
//! - Intel TDX (Trust Domain Extensions) - H100 native
//! - AMD SEV (Secure Encrypted Virtualization)
//!
//! # Security Model
//!
//! 1. Encrypted witness arrives from client
//! 2. TEE decrypts witness inside secure enclave
//! 3. STWO proof generated with decrypted data
//! 4. Attestation proves genuine TEE execution
//! 5. Proof + attestation returned (witness never exposed)

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{debug, error, info, warn};

/// TEE type detection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TeeType {
    /// Intel SGX (older machines)
    Sgx,
    /// Intel TDX (H100, newer datacenter)
    Tdx,
    /// AMD SEV-SNP
    Sev,
    /// Simulation mode for development
    Simulated,
}

impl TeeType {
    /// Detect available TEE hardware
    pub fn detect() -> Self {
        // Check for TDX (preferred for H100)
        if Self::tdx_available() {
            return Self::Tdx;
        }

        // Check for SGX
        if Self::sgx_available() {
            return Self::Sgx;
        }

        // Check for AMD SEV
        if Self::sev_available() {
            return Self::Sev;
        }

        // Fallback to simulation
        warn!("No TEE hardware detected, using simulation mode");
        Self::Simulated
    }

    fn tdx_available() -> bool {
        // Check for TDX support
        #[cfg(target_os = "linux")]
        {
            use std::path::Path;
            // TDX is available if the module is loaded
            if Path::new("/sys/module/kvm_intel/parameters/tdx").exists() {
                if let Ok(content) = std::fs::read_to_string("/sys/module/kvm_intel/parameters/tdx") {
                    return content.trim() == "Y";
                }
            }
            // Also check for TDX device
            Path::new("/dev/tdx_guest").exists()
        }
        #[cfg(not(target_os = "linux"))]
        false
    }

    fn sgx_available() -> bool {
        #[cfg(target_os = "linux")]
        {
            use std::path::Path;
            Path::new("/dev/sgx_enclave").exists() || Path::new("/dev/isgx").exists()
        }
        #[cfg(not(target_os = "linux"))]
        false
    }

    fn sev_available() -> bool {
        #[cfg(target_os = "linux")]
        {
            use std::path::Path;
            Path::new("/dev/sev-guest").exists() || Path::new("/sys/module/ccp").exists()
        }
        #[cfg(not(target_os = "linux"))]
        false
    }
}

/// Worker configuration
#[derive(Debug, Clone)]
pub struct TeeWorkerConfig {
    pub worker_id: String,
    pub coordinator_url: String,
    pub ws_url: String,
    pub tee_type: TeeType,
    pub max_concurrent_jobs: usize,
    pub heartbeat_interval_secs: u64,
    /// Attestation refresh interval (5 minutes recommended)
    pub attestation_refresh_secs: u64,
}

impl Default for TeeWorkerConfig {
    fn default() -> Self {
        Self {
            worker_id: format!("tee-worker-{}", uuid::Uuid::new_v4()),
            coordinator_url: "http://localhost:3030".to_string(),
            ws_url: "ws://localhost:3030/ws/worker".to_string(),
            tee_type: TeeType::detect(),
            max_concurrent_jobs: 2, // TEE typically has lower throughput
            heartbeat_interval_secs: 30,
            attestation_refresh_secs: 300,
        }
    }
}

/// Encrypted witness from client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedWitness {
    /// Ephemeral public key from client (for ECDH)
    pub ephemeral_pubkey: String,
    /// AES-GCM encrypted witness data
    pub ciphertext: String,
    /// GCM nonce
    pub nonce: String,
    /// Optional tag (if not appended to ciphertext)
    pub tag: Option<String>,
}

/// Privacy proof job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeProofJob {
    pub job_id: String,
    pub circuit_id: u32,
    pub circuit_type: String,
    pub encrypted_witness: EncryptedWitness,
    pub compliance_level: u8,
    pub deadline: i64,
}

/// Attestation data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attestation {
    pub tee_type: TeeType,
    /// Platform quote (SGX/TDX/SEV format)
    pub quote: String,
    /// Enclave public key
    pub enclave_pubkey: String,
    /// Measurement (MRENCLAVE/MRTD/measurement)
    pub measurement: String,
    /// Signature over user data
    pub signature: String,
    /// Timestamp of attestation
    pub timestamp: i64,
}

/// Attested proof result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestedProof {
    pub job_id: String,
    pub proof: serde_json::Value,
    pub attestation: Attestation,
    pub generation_time_ms: u64,
}

/// TEE Worker metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeWorkerMetrics {
    pub worker_id: String,
    pub tee_type: String,
    pub current_load: u32,
    pub capacity: u32,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub avg_proof_time_ms: u64,
    pub last_attestation: i64,
    pub attestation_valid: bool,
    pub uptime_secs: u64,
}

/// Enclave keypair (sealed in TEE)
struct EnclaveKeypair {
    private_key: [u8; 32],
    public_key: [u8; 65], // Uncompressed P-256
}

impl EnclaveKeypair {
    fn generate() -> Self {
        use sha2::{Digest, Sha256};

        // In production: use hardware RNG inside enclave
        // This is simplified for demonstration
        let mut hasher = Sha256::new();
        hasher.update(b"bitsage-enclave-keygen");
        hasher.update(&std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
            .to_le_bytes());
        let seed: [u8; 32] = hasher.finalize().into();

        // Derive public key (simplified - production uses real EC)
        let mut pubkey = [0u8; 65];
        pubkey[0] = 0x04; // Uncompressed
        pubkey[1..33].copy_from_slice(&seed);

        Self {
            private_key: seed,
            public_key: pubkey,
        }
    }

    fn public_key_hex(&self) -> String {
        hex::encode(&self.public_key)
    }
}

/// TEE Worker state
struct TeeWorkerState {
    config: TeeWorkerConfig,
    keypair: EnclaveKeypair,
    current_attestation: Option<Attestation>,
    current_jobs: usize,
    jobs_completed: u64,
    jobs_failed: u64,
    total_proof_time_ms: u64,
    start_time: Instant,
}

/// TEE Worker Service
pub struct TeeWorker {
    state: Arc<RwLock<TeeWorkerState>>,
}

impl TeeWorker {
    /// Create new TEE worker
    pub fn new(config: TeeWorkerConfig) -> Self {
        let keypair = EnclaveKeypair::generate();

        let state = Arc::new(RwLock::new(TeeWorkerState {
            config,
            keypair,
            current_attestation: None,
            current_jobs: 0,
            jobs_completed: 0,
            jobs_failed: 0,
            total_proof_time_ms: 0,
            start_time: Instant::now(),
        }));

        Self { state }
    }

    /// Start the TEE worker
    pub async fn start(&self) -> anyhow::Result<()> {
        let config = self.state.read().await.config.clone();

        info!(
            worker_id = %config.worker_id,
            tee_type = ?config.tee_type,
            "Starting TEE worker"
        );

        // Generate initial attestation
        self.refresh_attestation().await?;

        // Register with coordinator
        self.register().await?;

        // Start attestation refresh task
        let state = self.state.clone();
        let refresh_interval = config.attestation_refresh_secs;
        tokio::spawn(async move {
            Self::attestation_refresh_loop(state, refresh_interval).await;
        });

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

    /// Generate fresh attestation
    async fn refresh_attestation(&self) -> anyhow::Result<()> {
        let mut state = self.state.write().await;

        let attestation = Self::generate_attestation(
            state.config.tee_type,
            &state.keypair,
            &state.config.worker_id,
        )?;

        info!(
            tee_type = ?state.config.tee_type,
            "Generated fresh TEE attestation"
        );

        state.current_attestation = Some(attestation);
        Ok(())
    }

    /// Generate TEE attestation
    fn generate_attestation(
        tee_type: TeeType,
        keypair: &EnclaveKeypair,
        worker_id: &str,
    ) -> anyhow::Result<Attestation> {
        use sha2::{Digest, Sha256};

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;

        // Generate quote based on TEE type
        let (quote, measurement) = match tee_type {
            TeeType::Tdx => Self::generate_tdx_quote(keypair, worker_id)?,
            TeeType::Sgx => Self::generate_sgx_quote(keypair, worker_id)?,
            TeeType::Sev => Self::generate_sev_quote(keypair, worker_id)?,
            TeeType::Simulated => Self::generate_simulated_quote(keypair, worker_id)?,
        };

        // Sign the quote with enclave key
        let mut hasher = Sha256::new();
        hasher.update(&keypair.private_key);
        hasher.update(quote.as_bytes());
        let signature = hex::encode(hasher.finalize());

        Ok(Attestation {
            tee_type,
            quote,
            enclave_pubkey: keypair.public_key_hex(),
            measurement,
            signature,
            timestamp,
        })
    }

    /// Generate TDX quote (H100 native)
    fn generate_tdx_quote(
        keypair: &EnclaveKeypair,
        worker_id: &str,
    ) -> anyhow::Result<(String, String)> {
        use sha2::{Digest, Sha256};

        // In production: use TDX TDCALL to generate TDREPORT
        // then get TDQUOTE from QGS (Quote Generation Service)

        let mut hasher = Sha256::new();
        hasher.update(b"TDX-QUOTE-V4");
        hasher.update(&keypair.public_key);
        hasher.update(worker_id.as_bytes());

        let measurement = hex::encode(hasher.finalize());

        // Simulated TDX quote structure
        let quote = format!(
            "TDX1-{}-{}-{}",
            hex::encode(&keypair.public_key[..16]),
            measurement[..32].to_string(),
            chrono::Utc::now().timestamp()
        );

        Ok((quote, measurement))
    }

    /// Generate SGX quote
    fn generate_sgx_quote(
        keypair: &EnclaveKeypair,
        worker_id: &str,
    ) -> anyhow::Result<(String, String)> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(b"SGX-MRENCLAVE");
        hasher.update(&keypair.public_key);
        hasher.update(worker_id.as_bytes());

        let measurement = hex::encode(hasher.finalize());

        let quote = format!(
            "SGX2-{}-{}",
            measurement[..32].to_string(),
            chrono::Utc::now().timestamp()
        );

        Ok((quote, measurement))
    }

    /// Generate SEV quote
    fn generate_sev_quote(
        keypair: &EnclaveKeypair,
        worker_id: &str,
    ) -> anyhow::Result<(String, String)> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(b"SEV-SNP");
        hasher.update(&keypair.public_key);
        hasher.update(worker_id.as_bytes());

        let measurement = hex::encode(hasher.finalize());

        let quote = format!(
            "SEV-SNP-{}-{}",
            measurement[..32].to_string(),
            chrono::Utc::now().timestamp()
        );

        Ok((quote, measurement))
    }

    /// Generate simulated quote (development only)
    fn generate_simulated_quote(
        keypair: &EnclaveKeypair,
        worker_id: &str,
    ) -> anyhow::Result<(String, String)> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(b"SIMULATED-TEE");
        hasher.update(&keypair.public_key);
        hasher.update(worker_id.as_bytes());

        let measurement = hex::encode(hasher.finalize());

        let quote = format!(
            "SIM-{}-{}",
            measurement[..16].to_string(),
            chrono::Utc::now().timestamp()
        );

        warn!("Using SIMULATED TEE - not secure for production!");

        Ok((quote, measurement))
    }

    /// Register with coordinator
    async fn register(&self) -> anyhow::Result<()> {
        let state = self.state.read().await;
        let attestation = state.current_attestation.as_ref()
            .ok_or_else(|| anyhow::anyhow!("No attestation available"))?;

        // Map TeeType to lowercase string for coordinator
        let tee_type_str = match state.config.tee_type {
            TeeType::Sgx => "sgx",
            TeeType::Tdx => "tdx",
            TeeType::Sev => "sev",
            TeeType::Simulated => "simulated",
        };

        let client = reqwest::Client::new();
        let response = client
            .post(format!("{}/api/v1/workers/tee/register", state.config.coordinator_url))
            .json(&serde_json::json!({
                "worker_id": state.config.worker_id,
                "address": format!("http://localhost:3041"),
                "tee_type": tee_type_str,
                "measurement": attestation.measurement,
                "attestation_quote": attestation.quote,
                "enclave_pub_key": attestation.enclave_pubkey,
            }))
            .send()
            .await?;

        if response.status().is_success() {
            info!("Successfully registered TEE worker with coordinator");
            Ok(())
        } else {
            let error = response.text().await.unwrap_or_default();
            Err(anyhow::anyhow!("Registration rejected: {}", error))
        }
    }

    /// Connect to coordinator WebSocket
    async fn connect_ws(&self) -> anyhow::Result<()> {
        use tokio_tungstenite::{connect_async, tungstenite::Message};
        use futures_util::{SinkExt, StreamExt};

        let state = self.state.read().await;
        let ws_url = format!("{}/ws/worker?id={}&type=tee",
            state.config.ws_url.replace("http", "ws"),
            state.config.worker_id
        );
        let coordinator_url = state.config.coordinator_url.clone();
        let worker_id = state.config.worker_id.clone();
        drop(state);

        info!(url = %ws_url, "Connecting to coordinator WebSocket");

        let (ws_stream, _) = connect_async(&ws_url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Subscribe to TEE jobs
        let subscribe_msg = serde_json::json!({
            "type": "subscribe",
            "worker_type": "tee"
        });
        write.send(Message::Text(subscribe_msg.to_string())).await?;

        let state_clone = self.state.clone();

        // Handle incoming jobs
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(job) = serde_json::from_str::<TeeProofJob>(&text) {
                            debug!(job_id = %job.job_id, "Received TEE proof job");

                            let result = Self::process_job(&state_clone, job).await;

                            // Send result back to coordinator
                            let client = reqwest::Client::new();
                            let _ = client
                                .post(format!("{}/api/v1/tee/result", coordinator_url))
                                .json(&result)
                                .send()
                                .await;
                        }
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
        });

        Ok(())
    }

    /// Process TEE proof job
    async fn process_job(
        state: &Arc<RwLock<TeeWorkerState>>,
        job: TeeProofJob,
    ) -> AttestedProof {
        let start = Instant::now();

        info!(
            job_id = %job.job_id,
            circuit_type = %job.circuit_type,
            compliance = job.compliance_level,
            "Processing TEE proof job"
        );

        // Increment current jobs
        {
            let mut s = state.write().await;
            s.current_jobs += 1;
        }

        // Execute proof inside "enclave"
        let result = Self::execute_tee_proof(state, &job).await;

        // Update metrics
        let elapsed = start.elapsed().as_millis() as u64;
        let (attestation, worker_id) = {
            let mut s = state.write().await;
            s.current_jobs -= 1;
            s.total_proof_time_ms += elapsed;

            match &result {
                Ok(_) => s.jobs_completed += 1,
                Err(_) => s.jobs_failed += 1,
            }

            (
                s.current_attestation.clone().unwrap_or_else(|| Attestation {
                    tee_type: s.config.tee_type,
                    quote: "error".to_string(),
                    enclave_pubkey: s.keypair.public_key_hex(),
                    measurement: "error".to_string(),
                    signature: "error".to_string(),
                    timestamp: 0,
                }),
                s.config.worker_id.clone(),
            )
        };

        match result {
            Ok(proof) => {
                info!(
                    job_id = %job.job_id,
                    time_ms = elapsed,
                    "TEE proof completed"
                );
                AttestedProof {
                    job_id: job.job_id,
                    proof,
                    attestation,
                    generation_time_ms: elapsed,
                }
            }
            Err(e) => {
                error!(
                    job_id = %job.job_id,
                    error = %e,
                    "TEE proof failed"
                );
                AttestedProof {
                    job_id: job.job_id,
                    proof: serde_json::json!({"error": e.to_string()}),
                    attestation,
                    generation_time_ms: elapsed,
                }
            }
        }
    }

    /// Execute proof inside TEE
    async fn execute_tee_proof(
        state: &Arc<RwLock<TeeWorkerState>>,
        job: &TeeProofJob,
    ) -> anyhow::Result<serde_json::Value> {
        let s = state.read().await;

        // Step 1: Decrypt witness inside "enclave"
        let decrypted = Self::decrypt_witness(
            &s.keypair,
            &job.encrypted_witness,
        )?;

        // Step 2: Generate STWO proof
        let proof = Self::generate_proof(
            job.circuit_id,
            &job.circuit_type,
            &decrypted,
            job.compliance_level,
        )?;

        Ok(proof)
    }

    /// Decrypt witness using ECDH
    fn decrypt_witness(
        keypair: &EnclaveKeypair,
        encrypted: &EncryptedWitness,
    ) -> anyhow::Result<serde_json::Value> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };
        use sha2::{Digest, Sha256};

        // Decode client's ephemeral public key
        let client_pubkey = hex::decode(&encrypted.ephemeral_pubkey)?;

        // ECDH to derive shared secret (simplified)
        let mut hasher = Sha256::new();
        hasher.update(&keypair.private_key);
        hasher.update(&client_pubkey);
        let shared_secret: [u8; 32] = hasher.finalize().into();

        // Derive AES key using HKDF (simplified)
        let mut hasher = Sha256::new();
        hasher.update(&shared_secret);
        hasher.update(b"bitsage-tee-witness-v1");
        let aes_key: [u8; 32] = hasher.finalize().into();

        // Decode ciphertext and nonce
        let ciphertext = hex::decode(&encrypted.ciphertext)?;
        let nonce_bytes = hex::decode(&encrypted.nonce)?;

        // Decrypt using AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&aes_key)?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;

        // Parse JSON
        let witness: serde_json::Value = serde_json::from_slice(&plaintext)?;

        info!("Successfully decrypted witness inside TEE");
        Ok(witness)
    }

    /// Generate STWO proof
    fn generate_proof(
        circuit_id: u32,
        circuit_type: &str,
        witness: &serde_json::Value,
        compliance_level: u8,
    ) -> anyhow::Result<serde_json::Value> {
        use sha2::{Digest, Sha256};

        // In production: call actual STWO prover
        // This is a mock proof for demonstration

        let mut hasher = Sha256::new();
        hasher.update(&circuit_id.to_le_bytes());
        hasher.update(circuit_type.as_bytes());
        hasher.update(witness.to_string().as_bytes());
        hasher.update(&[compliance_level]);

        let commitment = hex::encode(hasher.finalize());

        Ok(serde_json::json!({
            "circuit_id": circuit_id,
            "circuit_type": circuit_type,
            "commitment": format!("0x{}", commitment),
            "compliance_level": compliance_level,
            "fri": {
                "layer_commitments": [
                    format!("0x{}", &commitment[..16]),
                    format!("0x{}", &commitment[16..32]),
                ],
                "final_poly": [format!("0x{}", &commitment[..8])],
            },
            "public_inputs": witness.get("public_inputs").cloned()
                .unwrap_or(serde_json::json!([])),
        }))
    }

    /// Attestation refresh loop
    async fn attestation_refresh_loop(
        state: Arc<RwLock<TeeWorkerState>>,
        interval_secs: u64,
    ) {
        let mut interval = interval(Duration::from_secs(interval_secs));

        loop {
            interval.tick().await;

            let mut s = state.write().await;
            if let Ok(attestation) = Self::generate_attestation(
                s.config.tee_type,
                &s.keypair,
                &s.config.worker_id,
            ) {
                s.current_attestation = Some(attestation);
                debug!("Refreshed TEE attestation");
            }
        }
    }

    /// Heartbeat loop
    async fn heartbeat_loop(
        state: Arc<RwLock<TeeWorkerState>>,
        coordinator_url: String,
        interval_secs: u64,
    ) {
        let mut interval = interval(Duration::from_secs(interval_secs));

        loop {
            interval.tick().await;

            let s = state.read().await;
            let metrics = TeeWorkerMetrics {
                worker_id: s.config.worker_id.clone(),
                tee_type: format!("{:?}", s.config.tee_type),
                current_load: s.current_jobs as u32,
                capacity: s.config.max_concurrent_jobs as u32,
                jobs_completed: s.jobs_completed,
                jobs_failed: s.jobs_failed,
                avg_proof_time_ms: if s.jobs_completed > 0 {
                    s.total_proof_time_ms / s.jobs_completed
                } else {
                    0
                },
                last_attestation: s.current_attestation
                    .as_ref()
                    .map(|a| a.timestamp)
                    .unwrap_or(0),
                attestation_valid: s.current_attestation.is_some(),
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
    pub async fn get_metrics(&self) -> TeeWorkerMetrics {
        let s = self.state.read().await;
        TeeWorkerMetrics {
            worker_id: s.config.worker_id.clone(),
            tee_type: format!("{:?}", s.config.tee_type),
            current_load: s.current_jobs as u32,
            capacity: s.config.max_concurrent_jobs as u32,
            jobs_completed: s.jobs_completed,
            jobs_failed: s.jobs_failed,
            avg_proof_time_ms: if s.jobs_completed > 0 {
                s.total_proof_time_ms / s.jobs_completed
            } else {
                0
            },
            last_attestation: s.current_attestation
                .as_ref()
                .map(|a| a.timestamp)
                .unwrap_or(0),
            attestation_valid: s.current_attestation.is_some(),
            uptime_secs: s.start_time.elapsed().as_secs(),
        }
    }

    /// Get enclave public key for clients
    pub async fn get_enclave_pubkey(&self) -> String {
        self.state.read().await.keypair.public_key_hex()
    }

    /// Get current attestation
    pub async fn get_attestation(&self) -> Option<Attestation> {
        self.state.read().await.current_attestation.clone()
    }
}

/// Run TEE worker
pub async fn run_tee_worker(config: TeeWorkerConfig) -> anyhow::Result<()> {
    let worker = TeeWorker::new(config);
    worker.start().await?;

    // Keep running
    tokio::signal::ctrl_c().await?;
    info!("Shutting down TEE worker");
    Ok(())
}
