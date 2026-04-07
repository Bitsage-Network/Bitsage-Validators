//! GPU Rental Marketplace Module
//!
//! Provides infrastructure for renting GPU compute time with pre-configured
//! environments. Similar to Runpod/Vast.ai but integrated with BitSage and
//! SAGE token billing.
//!
//! # Architecture
//!
//! ```text
//! User Request -> SessionManager -> ContainerManager + GpuManager
//!                      |                     |
//!              BillingEngine         AccessProvisioner
//!                      |                     |
//!              Starknet Escrow        SSH/Jupyter
//! ```
//!
//! # Features
//!
//! - Pre-configured templates (Llama Dev, ComfyUI, STWO Prover, etc.)
//! - SSH + Jupyter + API access to rental containers
//! - GPU isolation (MIG for datacenter, exclusive for consumer GPUs)
//! - SAGE token billing with on-chain escrow
//! - Automatic billing and expiration

pub mod types;
pub mod session_manager;
pub mod container_manager;
pub mod gpu_manager;
pub mod network_manager;
pub mod access_provisioner;
pub mod billing_engine;
pub mod escrow_client;
pub mod handlers;
pub mod validation;
pub mod storage;

#[cfg(test)]
mod tests;

// Re-export commonly used types
pub use types::{
    RentalSession, RentalStatus, RentalTemplate, TemplateCategory,
    GpuAllocation, MigProfile,
    SshAccessInfo, SshMethod, JupyterAccessInfo,
    MarketplaceGpu, GpuAvailability, GpuBackend,
    EscrowBalance, BillingRecord, ValidatorEarnings,
    StartRentalRequest, StartRentalResponse, ExtendRentalRequest,
    MarketplaceFilters, SortBy,
    ContainerConfig, NetworkConfig,
};

pub use session_manager::RentalSessionManager;
pub use container_manager::ContainerManager;
pub use gpu_manager::GpuManager;
pub use access_provisioner::AccessProvisioner;
pub use billing_engine::{BillingEngine, SuspensionEvent, SuspensionReason};
pub use escrow_client::{EscrowClient, EscrowConfig, EscrowClientError, OnChainBalance, OnChainRental, OnChainEarnings};
pub use storage::RentalStorage;
pub use network_manager::{NetworkManager, NetworkError, RentalNetwork, IsolationStatus};

use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};

use crate::db::Database;

/// Rental marketplace state
pub struct RentalState {
    /// Session manager for rental lifecycle
    pub sessions: RentalSessionManager,
    /// Container manager for Docker/Kata
    pub containers: ContainerManager,
    /// GPU allocation manager
    pub gpus: GpuManager,
    /// Network manager for tenant isolation
    pub network: NetworkManager,
    /// Access provisioner for SSH/Jupyter
    pub access: AccessProvisioner,
    /// Billing engine (with integrated escrow client)
    pub billing: BillingEngine,
    /// On-chain escrow client (shared reference)
    pub escrow: Option<Arc<EscrowClient>>,
    /// Suspension event receiver (for handling rental suspensions)
    pub suspension_rx: Option<mpsc::Receiver<SuspensionEvent>>,
    /// Persistent storage (optional, for database-backed mode)
    pub storage: Option<Arc<RentalStorage>>,
    /// All rental sessions (in-memory cache)
    rentals: RwLock<std::collections::HashMap<uuid::Uuid, RentalSession>>,
    /// GPU listings (in-memory cache)
    listings: RwLock<std::collections::HashMap<String, MarketplaceGpu>>,
}

impl RentalState {
    /// Create a new rental state with suspension channel
    pub fn new() -> Self {
        // Initialize escrow client
        let escrow = match EscrowClient::new(EscrowConfig::default()) {
            Ok(client) => Some(Arc::new(client)),
            Err(e) => {
                tracing::warn!(error = %e, "Failed to initialize escrow client");
                None
            }
        };

        // Create billing engine with suspension channel
        let (mut billing, suspension_rx) = BillingEngine::with_suspension_channel();

        // If escrow client is available, set it on the billing engine
        if let Some(ref client) = escrow {
            // Re-create with escrow client (the suspension channel is already set)
            let (tx, rx) = mpsc::channel(100);
            billing = BillingEngine::with_escrow_client(client.clone());
            billing.set_suspension_sender(tx);

            Self {
                sessions: RentalSessionManager::new(),
                containers: ContainerManager::new(),
                gpus: GpuManager::new(),
                network: NetworkManager::new(),
                access: AccessProvisioner::new(),
                billing,
                escrow,
                suspension_rx: Some(rx),
                storage: None,
                rentals: RwLock::new(std::collections::HashMap::new()),
                listings: RwLock::new(std::collections::HashMap::new()),
            }
        } else {
            Self {
                sessions: RentalSessionManager::new(),
                containers: ContainerManager::new(),
                gpus: GpuManager::new(),
                network: NetworkManager::new(),
                access: AccessProvisioner::new(),
                billing,
                escrow,
                suspension_rx: Some(suspension_rx),
                storage: None,
                rentals: RwLock::new(std::collections::HashMap::new()),
                listings: RwLock::new(std::collections::HashMap::new()),
            }
        }
    }

    /// Create a rental state with database persistence
    pub async fn with_database(db: Arc<Database>) -> Self {
        let storage = Arc::new(RentalStorage::new(db));

        // Initialize escrow client
        let escrow = match EscrowClient::new(EscrowConfig::default()) {
            Ok(client) => Some(Arc::new(client)),
            Err(e) => {
                tracing::warn!(error = %e, "Failed to initialize escrow client");
                None
            }
        };

        let (tx, rx) = mpsc::channel(100);
        let mut billing = if let Some(ref client) = escrow {
            BillingEngine::with_escrow_client(client.clone())
        } else {
            BillingEngine::new()
        };
        billing.set_suspension_sender(tx);

        // Load existing data from database
        let rentals = match storage.get_active_rentals().await {
            Ok(sessions) => {
                let map: std::collections::HashMap<_, _> = sessions.into_iter()
                    .map(|s| (s.id, s))
                    .collect();
                tracing::info!(count = map.len(), "Loaded active rentals from database");
                map
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to load rentals from database");
                std::collections::HashMap::new()
            }
        };

        let listings = match storage.get_all_gpus().await {
            Ok(gpus) => {
                let map: std::collections::HashMap<_, _> = gpus.into_iter()
                    .map(|g| (g.id.clone(), g))
                    .collect();
                tracing::info!(count = map.len(), "Loaded GPU listings from database");
                map
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to load GPU listings from database");
                std::collections::HashMap::new()
            }
        };

        Self {
            sessions: RentalSessionManager::new(),
            containers: ContainerManager::new(),
            gpus: GpuManager::new(),
            network: NetworkManager::new(),
            access: AccessProvisioner::new(),
            billing,
            escrow,
            suspension_rx: Some(rx),
            storage: Some(storage),
            rentals: RwLock::new(rentals),
            listings: RwLock::new(listings),
        }
    }

    /// Take the suspension receiver (can only be called once)
    /// Returns None if already taken or not initialized
    pub fn take_suspension_receiver(&mut self) -> Option<mpsc::Receiver<SuspensionEvent>> {
        self.suspension_rx.take()
    }

    /// Create a rental state with a specific escrow configuration
    pub fn with_escrow_config(config: EscrowConfig) -> Self {
        let escrow = match EscrowClient::new(config) {
            Ok(client) => Some(Arc::new(client)),
            Err(e) => {
                tracing::warn!(error = %e, "Failed to initialize escrow client");
                None
            }
        };

        let (tx, rx) = mpsc::channel(100);
        let mut billing = if let Some(ref client) = escrow {
            BillingEngine::with_escrow_client(client.clone())
        } else {
            BillingEngine::new()
        };
        billing.set_suspension_sender(tx);

        Self {
            sessions: RentalSessionManager::new(),
            containers: ContainerManager::new(),
            gpus: GpuManager::new(),
            network: NetworkManager::new(),
            access: AccessProvisioner::new(),
            billing,
            escrow,
            suspension_rx: Some(rx),
            storage: None,
            rentals: RwLock::new(std::collections::HashMap::new()),
            listings: RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Check if persistent storage is enabled
    pub fn is_persistent(&self) -> bool {
        self.storage.is_some()
    }

    /// Check if on-chain operations are enabled
    pub fn is_on_chain_enabled(&self) -> bool {
        self.escrow.is_some() && self.billing.is_on_chain_enabled()
    }

    /// Get the escrow contract address
    pub fn escrow_contract_address(&self) -> &str {
        self.billing.escrow_contract_address()
    }

    /// Get all active rentals for a user
    pub async fn get_user_rentals(&self, wallet: &str) -> Vec<RentalSession> {
        let rentals = self.rentals.read().await;
        rentals.values()
            .filter(|r| r.tenant_wallet == wallet)
            .cloned()
            .collect()
    }

    /// Get a specific rental by ID
    pub async fn get_rental(&self, id: uuid::Uuid) -> Option<RentalSession> {
        let rentals = self.rentals.read().await;
        rentals.get(&id).cloned()
    }

    /// Add or update a rental
    pub async fn upsert_rental(&self, rental: RentalSession) {
        // Persist to database if storage is available
        if let Some(ref storage) = self.storage {
            if let Err(e) = storage.save_rental(&rental).await {
                tracing::warn!(rental_id = %rental.id, error = %e, "Failed to persist rental to database");
            }
        }

        // Update in-memory cache
        let mut rentals = self.rentals.write().await;
        rentals.insert(rental.id, rental);
    }

    /// Remove a rental
    pub async fn remove_rental(&self, id: uuid::Uuid) {
        // Update status to stopped in database
        if let Some(ref storage) = self.storage {
            if let Err(e) = storage.update_rental_status(id, RentalStatus::Stopped, None).await {
                tracing::warn!(rental_id = %id, error = %e, "Failed to update rental status in database");
            }
        }

        // Remove from in-memory cache
        let mut rentals = self.rentals.write().await;
        rentals.remove(&id);
    }

    /// Get all marketplace GPU listings
    pub async fn get_marketplace_listings(&self, filters: &MarketplaceFilters) -> Vec<MarketplaceGpu> {
        let listings = self.listings.read().await;
        let mut result: Vec<_> = listings.values()
            .filter(|gpu| {
                // Apply filters
                if filters.available_only {
                    match &gpu.availability {
                        GpuAvailability::Available | GpuAvailability::PartiallyAvailable { .. } => {}
                        _ => return false,
                    }
                }
                if let Some(min_vram) = filters.min_vram_gb {
                    if gpu.vram_gb < min_vram {
                        return false;
                    }
                }
                if let Some(max_rate) = filters.max_rate {
                    if gpu.rate_sage_per_hour > max_rate {
                        return false;
                    }
                }
                if let Some(backend) = &filters.backend {
                    if gpu.backend != *backend {
                        return false;
                    }
                }
                if let Some(template_id) = &filters.template_id {
                    if !gpu.supported_templates.contains(template_id) {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect();

        // Sort
        match filters.sort_by {
            SortBy::Rate => result.sort_by_key(|g| g.rate_sage_per_hour),
            SortBy::Vram => result.sort_by_key(|g| std::cmp::Reverse(g.vram_gb)),
            SortBy::Rating => result.sort_by(|a, b| b.rating.partial_cmp(&a.rating).unwrap_or(std::cmp::Ordering::Equal)),
            SortBy::Uptime => result.sort_by(|a, b| b.uptime_percent.partial_cmp(&a.uptime_percent).unwrap_or(std::cmp::Ordering::Equal)),
        }

        result
    }

    /// Get a specific GPU by ID
    pub async fn get_gpu(&self, gpu_id: &str) -> Option<MarketplaceGpu> {
        let listings = self.listings.read().await;
        listings.get(gpu_id).cloned()
    }

    /// Register a GPU on the marketplace
    pub async fn register_gpu(&self, gpu: MarketplaceGpu) {
        // Persist to database if storage is available
        if let Some(ref storage) = self.storage {
            if let Err(e) = storage.save_gpu(&gpu).await {
                tracing::warn!(gpu_id = %gpu.id, error = %e, "Failed to persist GPU to database");
            }
        }

        // Update in-memory cache
        let mut listings = self.listings.write().await;
        listings.insert(gpu.id.clone(), gpu);
    }

    /// Update GPU availability
    pub async fn update_gpu_availability(&self, gpu_id: &str, availability: GpuAvailability) {
        // Persist to database if storage is available
        if let Some(ref storage) = self.storage {
            if let Err(e) = storage.update_gpu_availability(gpu_id, &availability).await {
                tracing::warn!(gpu_id = %gpu_id, error = %e, "Failed to update GPU availability in database");
            }
        }

        // Update in-memory cache
        let mut listings = self.listings.write().await;
        if let Some(gpu) = listings.get_mut(gpu_id) {
            gpu.availability = availability;
        }
    }

    /// Get all templates
    pub fn get_templates() -> Vec<RentalTemplate> {
        RentalTemplate::defaults()
    }

    /// Get a specific template by ID
    pub fn get_template(id: &str) -> Option<RentalTemplate> {
        RentalTemplate::defaults().into_iter().find(|t| t.id == id)
    }
}

impl Default for RentalState {
    fn default() -> Self {
        Self::new()
    }
}
