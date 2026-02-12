//! Circuit Registry
//!
//! Registry of supported circuits and their configurations.

use std::collections::HashMap;

use super::types::*;
use super::router::CircuitConfig;
use crate::contracts::contracts;

/// Circuit registry
pub struct CircuitRegistry {
    circuits: HashMap<CircuitType, CircuitConfig>,
}

impl CircuitRegistry {
    pub fn new() -> Self {
        let mut circuits = HashMap::new();

        // Get contract addresses from centralized config
        let addrs = contracts();

        // Compute proofs
        circuits.insert(CircuitType::AiInference, CircuitConfig {
            id: CircuitType::AiInference,
            name: "AI Inference".to_string(),
            default_mode: ProofMode::WorkerGpu,
            verifier_address: addrs.stwo_verifier.clone(),
            estimated_time_ms: 5000,
            proving_key_size: 52_428_800, // 50MB
        });

        circuits.insert(CircuitType::DataPipeline, CircuitConfig {
            id: CircuitType::DataPipeline,
            name: "Data Pipeline".to_string(),
            default_mode: ProofMode::WorkerGpu,
            verifier_address: addrs.stwo_verifier.clone(),
            estimated_time_ms: 4000,
            proving_key_size: 41_943_040, // 40MB
        });

        circuits.insert(CircuitType::MlTraining, CircuitConfig {
            id: CircuitType::MlTraining,
            name: "ML Training".to_string(),
            default_mode: ProofMode::WorkerGpu,
            verifier_address: addrs.stwo_verifier.clone(),
            estimated_time_ms: 15000,
            proving_key_size: 104_857_600, // 100MB
        });

        circuits.insert(CircuitType::GenericCompute, CircuitConfig {
            id: CircuitType::GenericCompute,
            name: "Generic Compute".to_string(),
            default_mode: ProofMode::WorkerGpu,
            verifier_address: addrs.stwo_verifier.clone(),
            estimated_time_ms: 3000,
            proving_key_size: 31_457_280, // 30MB
        });

        // Privacy proofs
        circuits.insert(CircuitType::PrivacyWithdraw, CircuitConfig {
            id: CircuitType::PrivacyWithdraw,
            name: "Privacy Withdraw".to_string(),
            default_mode: ProofMode::TeeAssisted,
            verifier_address: addrs.privacy_pools.clone(),
            estimated_time_ms: 3000,
            proving_key_size: 20_971_520, // 20MB
        });

        circuits.insert(CircuitType::PrivacyTransfer, CircuitConfig {
            id: CircuitType::PrivacyTransfer,
            name: "Privacy Transfer".to_string(),
            default_mode: ProofMode::TeeAssisted,
            verifier_address: addrs.privacy_router.clone(),
            estimated_time_ms: 4000,
            proving_key_size: 26_214_400, // 25MB
        });

        circuits.insert(CircuitType::ConfidentialSwap, CircuitConfig {
            id: CircuitType::ConfidentialSwap,
            name: "Confidential Swap".to_string(),
            default_mode: ProofMode::TeeAssisted,
            verifier_address: addrs.confidential_swap.clone(),
            estimated_time_ms: 5000,
            proving_key_size: 31_457_280, // 30MB
        });

        // Lightweight proofs
        circuits.insert(CircuitType::MerkleMembership, CircuitConfig {
            id: CircuitType::MerkleMembership,
            name: "Merkle Membership".to_string(),
            default_mode: ProofMode::ClientWasm,
            verifier_address: addrs.privacy_pools.clone(),
            estimated_time_ms: 5000,
            proving_key_size: 10_485_760, // 10MB
        });

        circuits.insert(CircuitType::RangeProof, CircuitConfig {
            id: CircuitType::RangeProof,
            name: "Range Proof".to_string(),
            default_mode: ProofMode::ClientWasm,
            verifier_address: addrs.privacy_router.clone(),
            estimated_time_ms: 3000,
            proving_key_size: 5_242_880, // 5MB
        });

        Self { circuits }
    }

    /// Get circuit configuration
    pub fn get(&self, circuit: CircuitType) -> Option<CircuitConfig> {
        self.circuits.get(&circuit).cloned()
    }

    /// Check if circuit is supported
    pub fn supports_circuit(&self, circuit: CircuitType) -> bool {
        self.circuits.contains_key(&circuit)
    }

    /// Get all supported circuits
    pub fn supported_circuits(&self) -> Vec<CircuitType> {
        self.circuits.keys().copied().collect()
    }

    /// Get circuits by mode
    pub fn circuits_by_mode(&self, mode: ProofMode) -> Vec<CircuitType> {
        self.circuits
            .iter()
            .filter(|(_, config)| config.default_mode == mode)
            .map(|(id, _)| *id)
            .collect()
    }

    /// Get total proving key size for a set of circuits
    pub fn total_proving_key_size(&self, circuits: &[CircuitType]) -> u64 {
        circuits
            .iter()
            .filter_map(|c| self.circuits.get(c))
            .map(|c| c.proving_key_size)
            .sum()
    }

    /// Get CDN path for proving key
    pub fn proving_key_path(&self, circuit: CircuitType, cdn_base: &str) -> Option<String> {
        self.circuits.get(&circuit).map(|config| {
            let name = config.name.to_lowercase().replace(' ', "-");
            format!("{}/{}/proving-key.bin", cdn_base, name)
        })
    }
}

impl Default for CircuitRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_initialization() {
        let registry = CircuitRegistry::new();

        assert!(registry.supports_circuit(CircuitType::AiInference));
        assert!(registry.supports_circuit(CircuitType::PrivacyWithdraw));
        assert!(registry.supports_circuit(CircuitType::MerkleMembership));
    }

    #[test]
    fn test_circuits_by_mode() {
        let registry = CircuitRegistry::new();

        let gpu_circuits = registry.circuits_by_mode(ProofMode::WorkerGpu);
        assert!(gpu_circuits.contains(&CircuitType::AiInference));
        assert!(!gpu_circuits.contains(&CircuitType::PrivacyWithdraw));

        let tee_circuits = registry.circuits_by_mode(ProofMode::TeeAssisted);
        assert!(tee_circuits.contains(&CircuitType::PrivacyWithdraw));
        assert!(!tee_circuits.contains(&CircuitType::AiInference));
    }
}
