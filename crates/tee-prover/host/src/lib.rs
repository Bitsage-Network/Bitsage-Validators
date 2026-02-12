//! TEE Host-Side Management
//!
//! Manages communication between untrusted host and TEE enclave.

use std::sync::Arc;
use tokio::sync::RwLock;

/// TEE host configuration
#[derive(Debug, Clone)]
pub struct HostConfig {
    /// Enclave binary path
    pub enclave_path: String,
    /// Number of enclave instances
    pub num_instances: usize,
    /// Request timeout (ms)
    pub timeout_ms: u64,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            enclave_path: "./enclave.signed.so".to_string(),
            num_instances: 4,
            timeout_ms: 60_000,
        }
    }
}

/// TEE host manager
pub struct TeeHost {
    config: HostConfig,
    instances: RwLock<Vec<EnclaveInstance>>,
}

struct EnclaveInstance {
    id: usize,
    is_busy: bool,
    // In production: actual enclave handle
}

impl TeeHost {
    /// Create new TEE host
    pub fn new(config: HostConfig) -> Self {
        Self {
            config,
            instances: RwLock::new(Vec::new()),
        }
    }

    /// Initialize enclave instances
    pub async fn init(&self) -> Result<(), HostError> {
        let mut instances = self.instances.write().await;

        for i in 0..self.config.num_instances {
            instances.push(EnclaveInstance {
                id: i,
                is_busy: false,
            });
        }

        tracing::info!(
            num_instances = self.config.num_instances,
            "TEE host initialized"
        );

        Ok(())
    }

    /// Submit proof request to enclave
    pub async fn submit_proof(
        &self,
        circuit_id: u32,
        encrypted_witness: Vec<u8>,
    ) -> Result<ProofResult, HostError> {
        // Find available instance
        let instance_id = self.acquire_instance().await?;

        // Submit to enclave (simplified)
        let result = self.run_in_enclave(instance_id, circuit_id, encrypted_witness).await;

        // Release instance
        self.release_instance(instance_id).await;

        result
    }

    /// Acquire an available enclave instance
    async fn acquire_instance(&self) -> Result<usize, HostError> {
        let mut instances = self.instances.write().await;

        for instance in instances.iter_mut() {
            if !instance.is_busy {
                instance.is_busy = true;
                return Ok(instance.id);
            }
        }

        Err(HostError::NoAvailableInstance)
    }

    /// Release enclave instance
    async fn release_instance(&self, id: usize) {
        let mut instances = self.instances.write().await;

        if let Some(instance) = instances.iter_mut().find(|i| i.id == id) {
            instance.is_busy = false;
        }
    }

    /// Run proof generation in enclave
    async fn run_in_enclave(
        &self,
        _instance_id: usize,
        circuit_id: u32,
        _encrypted_witness: Vec<u8>,
    ) -> Result<ProofResult, HostError> {
        // In production, this would:
        // 1. Make ECALL into enclave
        // 2. Wait for proof generation
        // 3. Return result

        // Mock result for now
        Ok(ProofResult {
            proof: serde_json::json!({
                "circuit_id": circuit_id,
                "commitment": "0x1234",
            }),
            attestation: serde_json::json!({
                "type": "simulated",
                "quote": "0x...",
            }),
            generation_time_ms: 2500,
        })
    }

    /// Get enclave public key (for client key exchange)
    pub async fn get_enclave_pubkey(&self) -> Result<Vec<u8>, HostError> {
        // In production, ECALL to get public key
        let mut pubkey = vec![0x04]; // Uncompressed point marker
        pubkey.extend_from_slice(&[0u8; 64]);
        Ok(pubkey)
    }

    /// Get fresh attestation
    pub async fn get_attestation(&self, user_data: &[u8]) -> Result<serde_json::Value, HostError> {
        // In production, ECALL to generate attestation
        Ok(serde_json::json!({
            "type": "simulated",
            "quote": format!("0x{}", hex::encode(user_data)),
            "timestamp": chrono::Utc::now().timestamp(),
        }))
    }
}

/// Proof result from enclave
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProofResult {
    pub proof: serde_json::Value,
    pub attestation: serde_json::Value,
    pub generation_time_ms: u64,
}

/// Host errors
#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("No available enclave instance")]
    NoAvailableInstance,

    #[error("Enclave error: {0}")]
    EnclaveError(String),

    #[error("Timeout")]
    Timeout,

    #[error("Not initialized")]
    NotInitialized,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_host_init() {
        let host = TeeHost::new(HostConfig::default());
        host.init().await.expect("Init failed");

        let pubkey = host.get_enclave_pubkey().await.expect("Get pubkey failed");
        assert_eq!(pubkey.len(), 65);
    }

    #[tokio::test]
    async fn test_submit_proof() {
        let host = TeeHost::new(HostConfig::default());
        host.init().await.expect("Init failed");

        let result = host
            .submit_proof(0x10, vec![1, 2, 3])
            .await
            .expect("Submit failed");

        assert!(result.proof.get("circuit_id").is_some());
    }
}
