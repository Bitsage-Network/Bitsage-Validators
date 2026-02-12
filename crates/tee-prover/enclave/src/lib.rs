//! TEE Enclave Prover
//!
//! Secure enclave implementation for privacy proof generation.
//! Protects secret witness data while generating STWO proofs.
//!
//! # Security Model
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    TEE Enclave Security                      │
//! ├─────────────────────────────────────────────────────────────┤
//! │                                                              │
//! │  UNTRUSTED HOST                │  TRUSTED ENCLAVE           │
//! │  ─────────────────             │  ────────────────          │
//! │                                │                             │
//! │  ┌──────────────┐             │  ┌──────────────┐          │
//! │  │ Encrypted    │────────────>│  │ Decrypt      │          │
//! │  │ Witness      │             │  │ Witness      │          │
//! │  └──────────────┘             │  └──────┬───────┘          │
//! │                                │         │                   │
//! │                                │         ▼                   │
//! │                                │  ┌──────────────┐          │
//! │                                │  │ Generate     │          │
//! │                                │  │ STWO Proof   │          │
//! │                                │  └──────┬───────┘          │
//! │                                │         │                   │
//! │                                │         ▼                   │
//! │  ┌──────────────┐             │  ┌──────────────┐          │
//! │  │ Proof +      │<───────────│  │ Sign with    │          │
//! │  │ Attestation  │             │  │ Enclave Key  │          │
//! │  └──────────────┘             │  └──────────────┘          │
//! │                                │                             │
//! │  Secrets NEVER leave enclave  │  Witness decrypted only    │
//! │                                │  inside enclave            │
//! │                                │                             │
//! └─────────────────────────────────────────────────────────────┘
//! ```

use std::sync::Arc;

mod prover;
mod attestation;
mod crypto;

pub use prover::EnclaveProver;
pub use attestation::{Attestation, AttestationType};
pub use crypto::{EnclaveKeyPair, decrypt_witness};

/// Enclave configuration
#[derive(Debug, Clone)]
pub struct EnclaveConfig {
    /// Enclave measurement (MRENCLAVE for SGX)
    pub measurement: [u8; 32],
    /// Enclave signer (MRSIGNER for SGX)
    pub signer: [u8; 32],
    /// Enclave version
    pub version: u16,
    /// Debug mode (should be false in production)
    pub debug: bool,
}

impl Default for EnclaveConfig {
    fn default() -> Self {
        Self {
            measurement: [0u8; 32],
            signer: [0u8; 32],
            version: 1,
            debug: cfg!(debug_assertions),
        }
    }
}

/// Enclave error types
#[derive(Debug, thiserror::Error)]
pub enum EnclaveError {
    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Proof generation failed: {0}")]
    ProofFailed(String),

    #[error("Attestation failed: {0}")]
    AttestationFailed(String),

    #[error("Invalid witness format: {0}")]
    InvalidWitness(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivation(String),

    #[error("Enclave not initialized")]
    NotInitialized,
}

/// Encrypted witness from client
#[derive(Debug, Clone, serde::Deserialize)]
pub struct EncryptedWitness {
    /// AES-GCM ciphertext
    pub ciphertext: Vec<u8>,
    /// Initialization vector
    pub iv: Vec<u8>,
    /// Client's ephemeral public key
    pub ephemeral_pub_key: Vec<u8>,
    /// Public inputs (not encrypted)
    pub public_inputs: serde_json::Value,
}

/// Decrypted witness (only exists inside enclave)
#[derive(Debug)]
pub struct DecryptedWitness {
    pub public_inputs: serde_json::Value,
    pub private_inputs: serde_json::Value,
}

/// Proof result with attestation
#[derive(Debug, Clone, serde::Serialize)]
pub struct AttestatedProof {
    /// The STWO proof
    pub proof: serde_json::Value,
    /// TEE attestation
    pub attestation: Attestation,
    /// Proof generation time (ms)
    pub generation_time_ms: u64,
}

/// Main enclave entry point
pub struct TeeEnclave {
    config: EnclaveConfig,
    keypair: Option<EnclaveKeyPair>,
    prover: Option<EnclaveProver>,
}

impl TeeEnclave {
    /// Create new enclave
    pub fn new(config: EnclaveConfig) -> Self {
        Self {
            config,
            keypair: None,
            prover: None,
        }
    }

    /// Initialize enclave (called once at startup)
    pub fn init(&mut self) -> Result<(), EnclaveError> {
        // Generate enclave keypair (sealed to enclave)
        self.keypair = Some(EnclaveKeyPair::generate()?);

        // Initialize prover
        self.prover = Some(EnclaveProver::new());

        tracing::info!("TEE enclave initialized");
        Ok(())
    }

    /// Get enclave public key for client key exchange
    pub fn public_key(&self) -> Result<Vec<u8>, EnclaveError> {
        self.keypair
            .as_ref()
            .ok_or(EnclaveError::NotInitialized)
            .map(|kp| kp.public_key())
    }

    /// Generate attestation
    pub fn attest(&self, user_data: &[u8]) -> Result<Attestation, EnclaveError> {
        let keypair = self.keypair.as_ref().ok_or(EnclaveError::NotInitialized)?;

        attestation::generate_attestation(
            &self.config,
            keypair,
            user_data,
        )
    }

    /// Process encrypted witness and generate proof
    pub fn prove(
        &self,
        circuit_id: u32,
        encrypted_witness: EncryptedWitness,
    ) -> Result<AttestatedProof, EnclaveError> {
        let start = std::time::Instant::now();

        let keypair = self.keypair.as_ref().ok_or(EnclaveError::NotInitialized)?;
        let prover = self.prover.as_ref().ok_or(EnclaveError::NotInitialized)?;

        // 1. Decrypt witness inside enclave
        let witness = decrypt_witness(keypair, &encrypted_witness)?;

        // 2. Generate STWO proof
        let proof = prover.prove(circuit_id, &witness)?;

        // 3. Generate attestation over proof
        let proof_hash = crypto::hash_proof(&proof);
        let attestation = self.attest(&proof_hash)?;

        Ok(AttestatedProof {
            proof,
            attestation,
            generation_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    /// Get enclave configuration
    pub fn config(&self) -> &EnclaveConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enclave_init() {
        let mut enclave = TeeEnclave::new(EnclaveConfig::default());
        enclave.init().expect("Init failed");

        let pubkey = enclave.public_key().expect("Get pubkey failed");
        assert!(!pubkey.is_empty());
    }
}
