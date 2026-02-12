//! Proving Key Cache
//!
//! CDN-backed cache for circuit proving keys.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::fs;
use tokio::sync::RwLock;

use super::types::CircuitType;

/// Cached proving key
#[derive(Debug, Clone)]
pub struct CachedKey {
    pub circuit: CircuitType,
    pub version: String,
    pub data: Arc<Vec<u8>>,
    pub size: usize,
    pub cached_at: i64,
}

/// Proving key cache
pub struct ProvingKeyCache {
    cdn_url: String,
    cache_dir: PathBuf,
    keys: RwLock<HashMap<CircuitType, CachedKey>>,
    version: String,
}

impl ProvingKeyCache {
    pub fn new(cdn_url: String, cache_dir: PathBuf, version: String) -> Self {
        Self {
            cdn_url,
            cache_dir,
            keys: RwLock::new(HashMap::new()),
            version,
        }
    }

    /// Load proving key from cache or CDN
    pub async fn load(&self, circuit: CircuitType) -> Result<Arc<Vec<u8>>, CacheError> {
        // Check memory cache
        {
            let keys = self.keys.read().await;
            if let Some(cached) = keys.get(&circuit) {
                if cached.version == self.version {
                    return Ok(cached.data.clone());
                }
            }
        }

        // Check disk cache
        let disk_path = self.disk_path(circuit);
        if disk_path.exists() {
            let data = fs::read(&disk_path).await
                .map_err(|e| CacheError::Io(e.to_string()))?;

            let cached = CachedKey {
                circuit,
                version: self.version.clone(),
                data: Arc::new(data),
                size: 0,
                cached_at: chrono::Utc::now().timestamp(),
            };

            let size = cached.data.len();
            let data = cached.data.clone();

            let mut keys = self.keys.write().await;
            keys.insert(circuit, CachedKey { size, ..cached });

            return Ok(data);
        }

        // Fetch from CDN
        let url = self.cdn_path(circuit);
        tracing::info!(%url, ?circuit, "Fetching proving key from CDN");

        let response = reqwest::get(&url).await
            .map_err(|e| CacheError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(CacheError::NotFound(circuit));
        }

        let data = response.bytes().await
            .map_err(|e| CacheError::Network(e.to_string()))?;

        // Save to disk
        if let Some(parent) = disk_path.parent() {
            fs::create_dir_all(parent).await
                .map_err(|e| CacheError::Io(e.to_string()))?;
        }

        fs::write(&disk_path, &data).await
            .map_err(|e| CacheError::Io(e.to_string()))?;

        // Cache in memory
        let cached = CachedKey {
            circuit,
            version: self.version.clone(),
            data: Arc::new(data.to_vec()),
            size: data.len(),
            cached_at: chrono::Utc::now().timestamp(),
        };

        let data = cached.data.clone();
        self.keys.write().await.insert(circuit, cached);

        Ok(data)
    }

    /// Check if proving key is cached
    pub async fn is_cached(&self, circuit: CircuitType) -> bool {
        let keys = self.keys.read().await;
        if keys.contains_key(&circuit) {
            return true;
        }

        self.disk_path(circuit).exists()
    }

    /// Get cache status for all circuits
    pub async fn cache_status(&self) -> HashMap<CircuitType, bool> {
        let keys = self.keys.read().await;
        let mut status = HashMap::new();

        for circuit in all_circuits() {
            let cached = keys.contains_key(&circuit) || self.disk_path(circuit).exists();
            status.insert(circuit, cached);
        }

        status
    }

    /// Preload multiple circuits
    pub async fn preload(&self, circuits: &[CircuitType]) -> Result<(), CacheError> {
        for circuit in circuits {
            self.load(*circuit).await?;
        }
        Ok(())
    }

    /// Clear cache for a circuit
    pub async fn clear(&self, circuit: CircuitType) -> Result<(), CacheError> {
        self.keys.write().await.remove(&circuit);

        let disk_path = self.disk_path(circuit);
        if disk_path.exists() {
            fs::remove_file(disk_path).await
                .map_err(|e| CacheError::Io(e.to_string()))?;
        }

        Ok(())
    }

    /// Clear all cached keys
    pub async fn clear_all(&self) -> Result<(), CacheError> {
        self.keys.write().await.clear();

        if self.cache_dir.exists() {
            fs::remove_dir_all(&self.cache_dir).await
                .map_err(|e| CacheError::Io(e.to_string()))?;
        }

        Ok(())
    }

    /// Get total cache size
    pub async fn total_size(&self) -> usize {
        let keys = self.keys.read().await;
        keys.values().map(|k| k.size).sum()
    }

    fn disk_path(&self, circuit: CircuitType) -> PathBuf {
        let name = circuit_name(circuit);
        self.cache_dir.join(format!("{}/proving-key-{}.bin", name, self.version))
    }

    fn cdn_path(&self, circuit: CircuitType) -> String {
        let name = circuit_name(circuit);
        format!("{}/{}/proving-key.bin", self.cdn_url, name)
    }
}

/// Cache errors
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("Proving key not found for circuit {0:?}")]
    NotFound(CircuitType),

    #[error("Network error: {0}")]
    Network(String),

    #[error("I/O error: {0}")]
    Io(String),
}

fn circuit_name(circuit: CircuitType) -> &'static str {
    match circuit {
        CircuitType::AiInference => "ai-inference",
        CircuitType::DataPipeline => "data-pipeline",
        CircuitType::MlTraining => "ml-training",
        CircuitType::GenericCompute => "generic-compute",
        CircuitType::PrivacyWithdraw => "privacy-withdraw",
        CircuitType::PrivacyTransfer => "privacy-transfer",
        CircuitType::ConfidentialSwap => "confidential-swap",
        CircuitType::MerkleMembership => "merkle-membership",
        CircuitType::RangeProof => "range-proof",
    }
}

fn all_circuits() -> Vec<CircuitType> {
    vec![
        CircuitType::AiInference,
        CircuitType::DataPipeline,
        CircuitType::MlTraining,
        CircuitType::GenericCompute,
        CircuitType::PrivacyWithdraw,
        CircuitType::PrivacyTransfer,
        CircuitType::ConfidentialSwap,
        CircuitType::MerkleMembership,
        CircuitType::RangeProof,
    ]
}
