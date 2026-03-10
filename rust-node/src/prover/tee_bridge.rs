//! TEE Bridge
//!
//! Communication layer between coordinator and TEE enclaves.

use std::collections::HashMap;
use std::sync::Arc;

use rand::Rng;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::types::*;

/// Generate a random byte array of length N
fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    rand::thread_rng().fill(&mut bytes[..]);
    bytes
}

/// TEE bridge for enclave communication
pub struct TeeBridge {
    enclaves: RwLock<HashMap<String, EnclaveConnection>>,
    pending_proofs: RwLock<HashMap<Uuid, PendingTeeProof>>,
}

/// Connection to a TEE enclave
#[derive(Debug, Clone)]
pub struct EnclaveConnection {
    pub id: String,
    pub address: String,
    pub tee_type: TeeType,
    pub public_key: String,
    pub measurement: String,
    pub last_attestation: i64,
    pub is_healthy: bool,
}

/// Pending TEE proof request
#[derive(Debug, Clone)]
pub struct PendingTeeProof {
    pub request_id: Uuid,
    pub circuit: CircuitType,
    pub enclave_id: String,
    pub encrypted_witness: EncryptedWitness,
    pub status: TeeProofStatus,
    pub started_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeeProofStatus {
    Pending,
    DecryptingWitness,
    GeneratingProof,
    Completed,
    Failed,
}

impl TeeBridge {
    pub fn new() -> Self {
        Self {
            enclaves: RwLock::new(HashMap::new()),
            pending_proofs: RwLock::new(HashMap::new()),
        }
    }

    /// Register an enclave
    pub async fn register_enclave(&self, enclave: EnclaveConnection) {
        let mut enclaves = self.enclaves.write().await;
        enclaves.insert(enclave.id.clone(), enclave);
    }

    /// Get available enclaves
    pub async fn get_available_enclaves(&self) -> Vec<EnclaveConnection> {
        let enclaves = self.enclaves.read().await;
        enclaves
            .values()
            .filter(|e| e.is_healthy)
            .cloned()
            .collect()
    }

    /// Request fresh attestation from an enclave
    ///
    /// In production, this requires the TEE enclave to be reachable over its secure channel.
    /// In dev mode, returns a mock attestation for testing.
    pub async fn request_attestation(&self, enclave_id: &str) -> Result<TeeAttestation, BridgeError> {
        let enclaves = self.enclaves.read().await;
        let enclave = enclaves
            .get(enclave_id)
            .ok_or_else(|| BridgeError::EnclaveNotFound(enclave_id.to_string()))?;

        let is_production = std::env::var("PRODUCTION").is_ok()
            || std::env::var("BITSAGE_PRODUCTION").is_ok();

        if is_production {
            // Production: the enclave must provide its own attestation via WebSocket registration.
            // We return the stored attestation data rather than generating mocks.
            if enclave.public_key.is_empty() || enclave.measurement.is_empty() {
                return Err(BridgeError::AttestationFailed(
                    "Enclave has no attestation data — real TEE hardware must provide quote via registration".into()
                ));
            }

            // Reject stale attestations (older than 10 minutes)
            let age_secs = chrono::Utc::now().timestamp() - enclave.last_attestation;
            if age_secs > 600 {
                return Err(BridgeError::AttestationFailed(
                    format!("Attestation is stale ({} seconds old, max 600) — enclave must re-attest", age_secs)
                ));
            }

            tracing::info!(
                enclave_id = %enclave_id,
                attestation_age_secs = age_secs,
                "Returning stored attestation from registered enclave"
            );

            Ok(TeeAttestation {
                tee_type: format!("{:?}", enclave.tee_type).to_lowercase(),
                quote: String::new(), // Worker provides full quote via separate channel
                enclave_pub_key: enclave.public_key.clone(),
                measurement: enclave.measurement.clone(),
                signature: String::new(),
                timestamp: enclave.last_attestation,
            })
        } else {
            // Dev mode: generate mock attestation for testing
            tracing::warn!(enclave_id = %enclave_id, "DEV MODE: Generating mock attestation");

            Ok(TeeAttestation {
                tee_type: format!("{:?}", enclave.tee_type).to_lowercase(),
                quote: generate_mock_quote(&enclave.measurement),
                enclave_pub_key: enclave.public_key.clone(),
                measurement: enclave.measurement.clone(),
                signature: generate_mock_signature(),
                timestamp: chrono::Utc::now().timestamp(),
            })
        }
    }

    /// Submit proof request to enclave
    pub async fn submit_proof(
        &self,
        request_id: Uuid,
        circuit: CircuitType,
        encrypted_witness: EncryptedWitness,
    ) -> Result<String, BridgeError> {
        // Find available enclave
        let enclaves = self.get_available_enclaves().await;
        let enclave = enclaves
            .into_iter()
            .max_by_key(|e| e.last_attestation)
            .ok_or(BridgeError::NoEnclavesAvailable)?;

        // Create pending proof
        let pending = PendingTeeProof {
            request_id,
            circuit,
            enclave_id: enclave.id.clone(),
            encrypted_witness,
            status: TeeProofStatus::Pending,
            started_at: chrono::Utc::now().timestamp(),
        };

        self.pending_proofs.write().await.insert(request_id, pending);

        // In production, this would:
        // 1. Establish secure channel to enclave
        // 2. Forward encrypted witness
        // 3. Wait for enclave to decrypt + generate proof
        // 4. Return proof with attestation

        tracing::info!(
            request_id = %request_id,
            enclave_id = %enclave.id,
            ?circuit,
            "Submitted proof request to TEE enclave"
        );

        Ok(enclave.id)
    }

    /// Get proof status
    pub async fn get_proof_status(&self, request_id: Uuid) -> Option<TeeProofStatus> {
        let pending = self.pending_proofs.read().await;
        pending.get(&request_id).map(|p| p.status)
    }

    /// Update proof status (called by enclave)
    pub async fn update_proof_status(&self, request_id: Uuid, status: TeeProofStatus) {
        let mut pending = self.pending_proofs.write().await;
        if let Some(proof) = pending.get_mut(&request_id) {
            proof.status = status;
        }
    }

    /// Complete proof (called when enclave returns result)
    pub async fn complete_proof(&self, request_id: Uuid) -> Option<PendingTeeProof> {
        self.pending_proofs.write().await.remove(&request_id)
    }

    /// Health check all enclaves
    pub async fn health_check(&self) {
        let mut enclaves = self.enclaves.write().await;

        for enclave in enclaves.values_mut() {
            // In production, this would ping the enclave
            // For now, just check attestation freshness
            let age = chrono::Utc::now().timestamp() - enclave.last_attestation;
            enclave.is_healthy = age < 300; // 5 minutes
        }
    }
}

impl Default for TeeBridge {
    fn default() -> Self {
        Self::new()
    }
}

/// Bridge errors
#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("Enclave not found: {0}")]
    EnclaveNotFound(String),

    #[error("No TEE enclaves available")]
    NoEnclavesAvailable,

    #[error("Attestation failed: {0}")]
    AttestationFailed(String),

    #[error("Proof generation failed: {0}")]
    ProofFailed(String),

    #[error("Communication error: {0}")]
    Communication(String),
}

// Mock helpers
fn generate_mock_quote(measurement: &str) -> String {
    let mut quote = vec![0x02, 0x00]; // SGX quote version
    quote.extend_from_slice(&hex::decode(measurement.trim_start_matches("0x")).unwrap_or_default());
    quote.extend_from_slice(&random_bytes::<64>());
    format!("0x{}", hex::encode(quote))
}

fn generate_mock_signature() -> String {
    format!("0x{}", hex::encode(random_bytes::<64>()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_enclave_registration() {
        let bridge = TeeBridge::new();

        // Generate random bytes for test data
        let mut public_key_bytes = [0u8; 64];
        let mut measurement_bytes = [0u8; 32];
        rand::Rng::fill(&mut rand::thread_rng(), &mut public_key_bytes);
        rand::Rng::fill(&mut rand::thread_rng(), &mut measurement_bytes);

        let enclave = EnclaveConnection {
            id: "enclave-1".to_string(),
            address: "localhost:8443".to_string(),
            tee_type: TeeType::Sgx,
            public_key: "0x04".to_string() + &hex::encode(public_key_bytes),
            measurement: "0x".to_string() + &hex::encode(measurement_bytes),
            last_attestation: chrono::Utc::now().timestamp(),
            is_healthy: true,
        };

        bridge.register_enclave(enclave.clone()).await;

        let available = bridge.get_available_enclaves().await;
        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "enclave-1");
    }
}
