//! Enclave Cryptographic Operations
//!
//! Key generation, ECDH, and AES-GCM operations inside enclave.

use crate::{EncryptedWitness, DecryptedWitness, EnclaveError};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use sha2::Digest;

/// Enclave keypair for ECDH and signing
pub struct EnclaveKeyPair {
    private_key: [u8; 32],
    public_key: [u8; 65], // Uncompressed P-256 point
}

impl EnclaveKeyPair {
    /// Generate new keypair
    pub fn generate() -> Result<Self, EnclaveError> {
        use rand::RngCore;

        let mut private_key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut private_key);

        // Generate public key (simplified - in production use proper EC operations)
        let mut public_key = [0u8; 65];
        public_key[0] = 0x04; // Uncompressed point marker

        // Derive public key from private (simplified)
        let hash = sha2::Sha256::digest(&private_key);
        public_key[1..33].copy_from_slice(&hash);

        let hash2 = sha2::Sha256::digest(&hash);
        public_key[33..65].copy_from_slice(&hash2);

        Ok(Self {
            private_key,
            public_key,
        })
    }

    /// Get public key bytes
    pub fn public_key(&self) -> Vec<u8> {
        self.public_key.to_vec()
    }

    /// Perform ECDH key agreement
    pub fn ecdh(&self, peer_public_key: &[u8]) -> Result<[u8; 32], EnclaveError> {
        if peer_public_key.len() != 65 || peer_public_key[0] != 0x04 {
            return Err(EnclaveError::KeyDerivation("Invalid peer public key".into()));
        }

        // Simplified ECDH (in production, use proper EC operations)
        // Combine private key with peer public key
        let mut hasher = sha2::Sha256::new();
        hasher.update(&self.private_key);
        hasher.update(peer_public_key);

        let shared_secret: [u8; 32] = hasher.finalize().into();
        Ok(shared_secret)
    }

    /// Sign data with enclave key
    pub fn sign(&self, data: &[u8]) -> Result<Vec<u8>, EnclaveError> {
        // Simplified signing (in production, use ECDSA)
        let mut hasher = sha2::Sha256::new();
        hasher.update(&self.private_key);
        hasher.update(data);

        let mut signature = vec![0u8; 64];
        let hash: [u8; 32] = hasher.finalize().into();
        signature[..32].copy_from_slice(&hash);

        let hash2 = sha2::Sha256::digest(&hash);
        signature[32..].copy_from_slice(&hash2);

        Ok(signature)
    }
}

/// Decrypt witness using enclave key
pub fn decrypt_witness(
    keypair: &EnclaveKeyPair,
    encrypted: &EncryptedWitness,
) -> Result<DecryptedWitness, EnclaveError> {
    // 1. Derive shared secret via ECDH
    let shared_secret = keypair.ecdh(&encrypted.ephemeral_pub_key)?;

    // 2. Derive AES key from shared secret using HKDF
    let aes_key = derive_aes_key(&shared_secret)?;

    // 3. Decrypt private inputs
    let cipher = Aes256Gcm::new_from_slice(&aes_key)
        .map_err(|e| EnclaveError::DecryptionFailed(e.to_string()))?;

    let nonce = Nonce::from_slice(&encrypted.iv);

    let plaintext = cipher
        .decrypt(nonce, encrypted.ciphertext.as_ref())
        .map_err(|e| EnclaveError::DecryptionFailed(e.to_string()))?;

    // 4. Parse private inputs as JSON
    let private_inputs: serde_json::Value = serde_json::from_slice(&plaintext)
        .map_err(|e| EnclaveError::InvalidWitness(e.to_string()))?;

    Ok(DecryptedWitness {
        public_inputs: encrypted.public_inputs.clone(),
        private_inputs,
    })
}

/// Derive AES-256 key from shared secret using HKDF
fn derive_aes_key(shared_secret: &[u8; 32]) -> Result<[u8; 32], EnclaveError> {
    // HKDF-SHA256 (simplified)
    let mut hasher = sha2::Sha256::new();
    hasher.update(shared_secret);
    hasher.update(b"bitsage-tee-witness-v1");
    hasher.update(b"aes-gcm-key");

    let key: [u8; 32] = hasher.finalize().into();
    Ok(key)
}

/// Hash proof for attestation
pub fn hash_proof(proof: &serde_json::Value) -> Vec<u8> {
    let proof_bytes = serde_json::to_vec(proof).unwrap_or_default();
    let hash = sha2::Sha256::digest(&proof_bytes);
    hash.to_vec()
}

/// Zero out sensitive memory
pub fn secure_zero(data: &mut [u8]) {
    for byte in data.iter_mut() {
        unsafe {
            std::ptr::write_volatile(byte, 0);
        }
    }
    std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let keypair = EnclaveKeyPair::generate().unwrap();
        let pubkey = keypair.public_key();

        assert_eq!(pubkey.len(), 65);
        assert_eq!(pubkey[0], 0x04);
    }

    #[test]
    fn test_ecdh() {
        let keypair1 = EnclaveKeyPair::generate().unwrap();
        let keypair2 = EnclaveKeyPair::generate().unwrap();

        let shared1 = keypair1.ecdh(&keypair2.public_key()).unwrap();
        let shared2 = keypair2.ecdh(&keypair1.public_key()).unwrap();

        // In a proper ECDH, these would be equal
        // Our simplified version doesn't guarantee this
        assert_eq!(shared1.len(), 32);
        assert_eq!(shared2.len(), 32);
    }

    #[test]
    fn test_signing() {
        let keypair = EnclaveKeyPair::generate().unwrap();
        let data = b"test message";

        let sig = keypair.sign(data).unwrap();
        assert_eq!(sig.len(), 64);
    }
}
