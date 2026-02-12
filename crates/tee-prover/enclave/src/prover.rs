//! Enclave STWO Prover
//!
//! Proof generation inside the TEE enclave.

use crate::{DecryptedWitness, EnclaveError};

/// STWO prover running inside enclave
pub struct EnclaveProver {
    /// Loaded circuits
    circuits: std::collections::HashMap<u32, CircuitState>,
}

struct CircuitState {
    proving_key: Vec<u8>,
    is_loaded: bool,
}

impl EnclaveProver {
    pub fn new() -> Self {
        Self {
            circuits: std::collections::HashMap::new(),
        }
    }

    /// Load circuit proving key
    pub fn load_circuit(&mut self, circuit_id: u32, proving_key: Vec<u8>) -> Result<(), EnclaveError> {
        self.circuits.insert(circuit_id, CircuitState {
            proving_key,
            is_loaded: true,
        });
        Ok(())
    }

    /// Generate proof for witness
    pub fn prove(
        &self,
        circuit_id: u32,
        witness: &DecryptedWitness,
    ) -> Result<serde_json::Value, EnclaveError> {
        // In production, this would:
        // 1. Use the circuit's proving key
        // 2. Execute STWO prover on the witness
        // 3. Return the proof

        // For now, generate a mock proof structure
        let proof = self.generate_mock_proof(circuit_id, witness)?;

        Ok(proof)
    }

    /// Generate mock proof for development
    fn generate_mock_proof(
        &self,
        circuit_id: u32,
        witness: &DecryptedWitness,
    ) -> Result<serde_json::Value, EnclaveError> {
        use rand::RngCore;

        let mut rng = rand::thread_rng();

        // Generate random commitment
        let mut commitment = [0u8; 32];
        rng.fill_bytes(&mut commitment);

        // Generate FRI layer commitments
        let mut layer_commitments = Vec::with_capacity(8);
        for _ in 0..8 {
            let mut layer = [0u8; 32];
            rng.fill_bytes(&mut layer);
            layer_commitments.push(hex::encode(layer));
        }

        // Generate queries
        let mut queries = Vec::with_capacity(4);
        for _ in 0..4 {
            let mut query = Vec::with_capacity(3);
            for _ in 0..3 {
                let mut q = [0u8; 32];
                rng.fill_bytes(&mut q);
                query.push(hex::encode(q));
            }
            queries.push(query);
        }

        // Generate final polynomial
        let mut final_poly = Vec::with_capacity(16);
        for _ in 0..16 {
            let mut coeff = [0u8; 8];
            rng.fill_bytes(&mut coeff);
            final_poly.push(hex::encode(coeff));
        }

        // Extract public inputs
        let public_inputs: Vec<String> = match &witness.public_inputs {
            serde_json::Value::Object(map) => {
                map.values()
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .collect()
            }
            _ => vec![],
        };

        Ok(serde_json::json!({
            "circuit_id": circuit_id,
            "commitment": format!("0x{}", hex::encode(commitment)),
            "fri": {
                "layer_commitments": layer_commitments.iter()
                    .map(|c| format!("0x{}", c))
                    .collect::<Vec<_>>(),
                "queries": queries.iter()
                    .map(|q| q.iter().map(|v| format!("0x{}", v)).collect::<Vec<_>>())
                    .collect::<Vec<_>>(),
            },
            "final_poly": final_poly.iter()
                .map(|c| format!("0x{}", c))
                .collect::<Vec<_>>(),
            "public_inputs": public_inputs,
        }))
    }
}

impl Default for EnclaveProver {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_proof_generation() {
        let prover = EnclaveProver::new();

        let witness = DecryptedWitness {
            public_inputs: serde_json::json!({
                "nullifier": "0x123",
                "root": "0x456"
            }),
            private_inputs: serde_json::json!({
                "secret": "0x789"
            }),
        };

        let proof = prover.prove(0x10, &witness).expect("Prove failed");

        assert!(proof.get("commitment").is_some());
        assert!(proof.get("fri").is_some());
    }
}
