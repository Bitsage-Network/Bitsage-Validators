//! Rental Storage Layer
//!
//! Provides persistent storage for rental sessions, GPU listings, escrow balances,
//! billing records, and validator earnings. Bridges the database layer with
//! the rental domain types.

use std::sync::Arc;
use chrono::{DateTime, Utc};
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use crate::db::{
    Database, DbError,
    models::{DbRentalSession, DbMarketplaceGpu, DbEscrowBalance, DbBillingRecord, DbValidatorEarnings},
    repository::{RentalRepository, MarketplaceGpuRepository, EscrowRepository, BillingRecordRepository, ValidatorEarningsRepository},
};

use super::types::{
    RentalSession, RentalStatus, GpuAllocation, MigProfile,
    SshAccessInfo, SshMethod, JupyterAccessInfo,
    MarketplaceGpu, GpuAvailability, GpuBackend,
    EscrowBalance, BillingRecord, ValidatorEarnings,
};

/// Persistent storage for rental operations
pub struct RentalStorage {
    db: Arc<Database>,
}

impl RentalStorage {
    /// Create a new storage instance
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    // ========================================================================
    // Rental Sessions
    // ========================================================================

    /// Save a rental session to the database
    pub async fn save_rental(&self, session: &RentalSession) -> Result<(), DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_session = session_to_db(session);
        repo.create(&db_session).await
    }

    /// Update an existing rental session
    pub async fn update_rental(&self, session: &RentalSession) -> Result<(), DbError> {
        let repo = RentalRepository::new(&self.db);
        repo.update_status(
            &session.id,
            &status_to_string(&session.status),
            session.error.as_deref(),
        ).await?;

        // Update billing info separately
        repo.update_billing(&session.id, session.total_spent as i64).await
    }

    /// Get a rental session by ID
    pub async fn get_rental(&self, id: Uuid) -> Result<Option<RentalSession>, DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_session = repo.find_by_id(&id).await?;
        Ok(db_session.map(|s| db_to_session(&s)))
    }

    /// Get all active rental sessions
    pub async fn get_active_rentals(&self) -> Result<Vec<RentalSession>, DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_sessions = repo.find_active().await?;
        Ok(db_sessions.iter().map(db_to_session).collect())
    }

    /// Get expired rental sessions
    pub async fn get_expired_rentals(&self) -> Result<Vec<RentalSession>, DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_sessions = repo.find_expired().await?;
        Ok(db_sessions.iter().map(db_to_session).collect())
    }

    /// Get rentals for a tenant
    pub async fn get_tenant_rentals(&self, wallet: &str) -> Result<Vec<RentalSession>, DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_sessions = repo.find_by_tenant(wallet).await?;
        Ok(db_sessions.iter().map(db_to_session).collect())
    }

    /// Get rentals for a validator
    pub async fn get_validator_rentals(&self, wallet: &str) -> Result<Vec<RentalSession>, DbError> {
        let repo = RentalRepository::new(&self.db);
        let db_sessions = repo.find_by_validator(wallet).await?;
        Ok(db_sessions.iter().map(db_to_session).collect())
    }

    /// Update rental status
    pub async fn update_rental_status(&self, id: Uuid, status: RentalStatus, error: Option<&str>) -> Result<(), DbError> {
        let repo = RentalRepository::new(&self.db);
        repo.update_status(&id, &status_to_string(&status), error).await
    }

    /// Update rental billing info
    pub async fn update_rental_billing(&self, id: Uuid, total_spent: u64, last_billed_at: DateTime<Utc>) -> Result<(), DbError> {
        let repo = RentalRepository::new(&self.db);
        repo.update_billing(&id, total_spent as i64).await
    }

    // ========================================================================
    // Marketplace GPUs
    // ========================================================================

    /// Save or update a GPU listing
    pub async fn save_gpu(&self, gpu: &MarketplaceGpu) -> Result<(), DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        let db_gpu = gpu_to_db(gpu);
        repo.upsert(&db_gpu).await
    }

    /// Get a GPU by ID
    pub async fn get_gpu(&self, id: &str) -> Result<Option<MarketplaceGpu>, DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        let db_gpu = repo.find_by_id(id).await?;
        Ok(db_gpu.map(|g| db_to_gpu(&g)))
    }

    /// Get all GPU listings
    pub async fn get_all_gpus(&self) -> Result<Vec<MarketplaceGpu>, DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        let db_gpus = repo.find_all().await?;
        Ok(db_gpus.iter().map(db_to_gpu).collect())
    }

    /// Get available GPU listings
    pub async fn get_available_gpus(&self) -> Result<Vec<MarketplaceGpu>, DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        let db_gpus = repo.find_available().await?;
        Ok(db_gpus.iter().map(db_to_gpu).collect())
    }

    /// Update GPU availability
    pub async fn update_gpu_availability(&self, id: &str, availability: &GpuAvailability) -> Result<(), DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        let (status, data) = availability_to_db(availability);
        repo.update_availability(id, &status, data.as_deref()).await
    }

    /// Increment GPU rental count
    pub async fn increment_gpu_rentals(&self, id: &str) -> Result<(), DbError> {
        let repo = MarketplaceGpuRepository::new(&self.db);
        repo.increment_rentals(id).await
    }

    // ========================================================================
    // Escrow Balances
    // ========================================================================

    /// Get or create escrow balance for a wallet
    pub async fn get_escrow_balance(&self, wallet: &str) -> Result<EscrowBalance, DbError> {
        let repo = EscrowRepository::new(&self.db);
        let db_balance = repo.get_or_create(wallet).await?;
        Ok(db_to_escrow(&db_balance))
    }

    /// Deposit funds to escrow
    pub async fn deposit_escrow(&self, wallet: &str, amount: u64) -> Result<EscrowBalance, DbError> {
        let repo = EscrowRepository::new(&self.db);
        let db_balance = repo.deposit(wallet, amount as i64).await?;
        Ok(db_to_escrow(&db_balance))
    }

    /// Reserve funds from escrow
    pub async fn reserve_escrow(&self, wallet: &str, amount: u64) -> Result<bool, DbError> {
        let repo = EscrowRepository::new(&self.db);
        repo.reserve(wallet, amount as i64).await
    }

    /// Charge funds from reserved escrow
    pub async fn charge_escrow(&self, wallet: &str, amount: u64) -> Result<bool, DbError> {
        let repo = EscrowRepository::new(&self.db);
        repo.charge(wallet, amount as i64).await
    }

    /// Release reserved funds back to available
    pub async fn release_escrow(&self, wallet: &str, amount: u64) -> Result<bool, DbError> {
        let repo = EscrowRepository::new(&self.db);
        repo.release(wallet, amount as i64).await
    }

    // ========================================================================
    // Billing Records
    // ========================================================================

    /// Save a billing record
    pub async fn save_billing_record(&self, record: &BillingRecord, tenant: &str, validator: &str) -> Result<(), DbError> {
        let repo = BillingRecordRepository::new(&self.db);
        let db_record = billing_to_db(record, tenant, validator);
        repo.create(&db_record).await
    }

    /// Get billing records for a rental
    pub async fn get_rental_billing(&self, rental_id: Uuid) -> Result<Vec<BillingRecord>, DbError> {
        let repo = BillingRecordRepository::new(&self.db);
        let db_records = repo.find_by_rental(&rental_id).await?;
        Ok(db_records.iter().map(db_to_billing).collect())
    }

    // ========================================================================
    // Validator Earnings
    // ========================================================================

    /// Get validator earnings
    pub async fn get_validator_earnings(&self, wallet: &str) -> Result<ValidatorEarnings, DbError> {
        let repo = ValidatorEarningsRepository::new(&self.db);
        let db_earnings = repo.get_or_create(wallet).await?;
        Ok(db_to_earnings(&db_earnings))
    }

    /// Add earnings to a validator
    pub async fn add_validator_earnings(&self, wallet: &str, amount: u64) -> Result<ValidatorEarnings, DbError> {
        let repo = ValidatorEarningsRepository::new(&self.db);
        let db_earnings = repo.add_earnings(wallet, amount as i64).await?;
        Ok(db_to_earnings(&db_earnings))
    }

    /// Record a withdrawal
    pub async fn record_withdrawal(&self, wallet: &str, amount: u64) -> Result<bool, DbError> {
        let repo = ValidatorEarningsRepository::new(&self.db);
        repo.record_withdrawal(wallet, amount as i64).await
    }

    /// Update active rental count for validator
    pub async fn update_validator_active_rentals(&self, wallet: &str, delta: i32) -> Result<(), DbError> {
        let repo = ValidatorEarningsRepository::new(&self.db);
        repo.update_active_rentals(wallet, delta).await
    }
}

// ============================================================================
// Conversion Functions: Domain -> DB
// ============================================================================

fn session_to_db(session: &RentalSession) -> DbRentalSession {
    DbRentalSession {
        id: session.id,
        tenant_wallet: session.tenant_wallet.clone(),
        validator_wallet: session.validator_wallet.clone(),
        template_id: session.template_id.clone(),
        gpu_id: session.gpu_id.clone().unwrap_or_default(),
        container_id: session.container_id.clone(),
        status: status_to_string(&session.status),
        rate_sage_per_hour: session.rate_sage_per_hour as i64,
        total_spent: session.total_spent as i64,
        started_at: session.started_at,
        expires_at: session.expires_at,
        last_billed_at: session.last_billed_at,
        ssh_host: session.ssh_access.as_ref().map(|s| s.host.clone()),
        ssh_port: session.ssh_access.as_ref().map(|s| s.port as i32),
        ssh_username: session.ssh_access.as_ref().map(|s| s.username.clone()),
        ssh_method: session.ssh_access.as_ref().map(|s| format!("{:?}", s.method).to_lowercase()),
        ssh_key_fingerprint: session.ssh_access.as_ref().map(|s| s.key_fingerprint.clone()),
        ssh_tailscale_name: session.ssh_access.as_ref().and_then(|s| s.tailscale_name.clone()),
        jupyter_url: session.jupyter_access.as_ref().map(|j| j.url.clone()),
        jupyter_token: session.jupyter_access.as_ref().map(|j| j.token.clone()),
        jupyter_expires_at: session.jupyter_access.as_ref().map(|j| j.expires_at),
        api_endpoint: session.api_endpoint.clone(),
        gpu_allocation: Some(serde_json::to_string(&session.gpu_allocation).unwrap_or_default()),
        error_message: session.error.clone(),
        created_at: session.started_at,
        updated_at: Utc::now(),
    }
}

fn status_to_string(status: &RentalStatus) -> String {
    match status {
        RentalStatus::PendingEscrow => "pending_escrow",
        RentalStatus::Provisioning => "provisioning",
        RentalStatus::Running => "running",
        RentalStatus::Suspended => "suspended",
        RentalStatus::Stopping => "stopping",
        RentalStatus::Stopped => "stopped",
        RentalStatus::Failed => "failed",
        RentalStatus::Expired => "expired",
    }.to_string()
}

fn gpu_to_db(gpu: &MarketplaceGpu) -> DbMarketplaceGpu {
    let (availability_str, availability_data) = availability_to_db(&gpu.availability);
    DbMarketplaceGpu {
        id: gpu.id.clone(),
        validator_wallet: gpu.validator_wallet.clone(),
        gpu_model: gpu.gpu_model.clone(),
        vram_gb: gpu.vram_gb as i32,
        gpu_backend: format!("{:?}", gpu.backend).to_lowercase(),
        mig_capable: gpu.mig_capable,
        availability: availability_str,
        availability_data,
        rate_sage_per_hour: gpu.rate_sage_per_hour as i64,
        uptime_percent: gpu.uptime_percent as f64,
        total_rentals: gpu.total_rentals as i32,
        rating: gpu.rating as f64,
        region: gpu.region.clone(),
        supported_templates: serde_json::to_string(&gpu.supported_templates).unwrap_or_else(|_| "[]".to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

fn availability_to_db(availability: &GpuAvailability) -> (String, Option<String>) {
    match availability {
        GpuAvailability::Available => ("available".to_string(), None),
        GpuAvailability::PartiallyAvailable { available_vram_gb, total_vram_gb } => {
            let data = serde_json::json!({
                "available_vram_gb": available_vram_gb,
                "total_vram_gb": total_vram_gb,
            });
            ("partially_available".to_string(), Some(data.to_string()))
        }
        GpuAvailability::InUse { available_in_minutes } => {
            let data = serde_json::json!({
                "available_in_minutes": available_in_minutes,
            });
            ("in_use".to_string(), Some(data.to_string()))
        }
        GpuAvailability::Reserved { rental_id, reserved_until } => {
            let data = serde_json::json!({
                "rental_id": rental_id.to_string(),
                "reserved_until": reserved_until.to_rfc3339(),
            });
            ("reserved".to_string(), Some(data.to_string()))
        }
        GpuAvailability::Offline => ("offline".to_string(), None),
    }
}

fn billing_to_db(record: &BillingRecord, tenant: &str, validator: &str) -> DbBillingRecord {
    DbBillingRecord {
        id: record.id,
        rental_id: record.rental_id,
        tenant_wallet: tenant.to_string(),
        validator_wallet: validator.to_string(),
        amount: record.amount as i64,
        period_start: record.period_start,
        period_end: record.period_end,
        tx_hash: record.tx_hash.clone(),
        created_at: record.created_at,
    }
}

// ============================================================================
// Conversion Functions: DB -> Domain
// ============================================================================

fn db_to_session(db: &DbRentalSession) -> RentalSession {
    let ssh_access = if db.ssh_host.is_some() {
        Some(SshAccessInfo {
            method: db.ssh_method.as_ref()
                .map(|m| match m.as_str() {
                    "tailscale" => SshMethod::Tailscale,
                    "jumpbox" => SshMethod::Jumpbox,
                    _ => SshMethod::Direct,
                })
                .unwrap_or(SshMethod::Direct),
            host: db.ssh_host.clone().unwrap_or_default(),
            port: db.ssh_port.unwrap_or(22) as u16,
            username: db.ssh_username.clone().unwrap_or_else(|| "root".to_string()),
            private_key: None, // Never stored
            key_fingerprint: db.ssh_key_fingerprint.clone().unwrap_or_default(),
            tailscale_name: db.ssh_tailscale_name.clone(),
        })
    } else {
        None
    };

    let jupyter_access = if db.jupyter_url.is_some() {
        Some(JupyterAccessInfo {
            url: db.jupyter_url.clone().unwrap_or_default(),
            token: db.jupyter_token.clone().unwrap_or_default(),
            expires_at: db.jupyter_expires_at.unwrap_or(db.expires_at),
        })
    } else {
        None
    };

    let gpu_allocation = db.gpu_allocation.as_ref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(GpuAllocation::Exclusive {
            gpu_uuid: db.gpu_id.clone(),
            gpu_model: "Unknown".to_string(),
            vram_gb: 0,
        });

    RentalSession {
        id: db.id,
        tenant_wallet: db.tenant_wallet.clone(),
        validator_wallet: db.validator_wallet.clone(),
        template_id: db.template_id.clone(),
        container_id: db.container_id.clone(),
        gpu_id: Some(db.gpu_id.clone()),
        gpu_allocation,
        status: string_to_status(&db.status),
        started_at: db.started_at,
        expires_at: db.expires_at,
        rate_sage_per_hour: db.rate_sage_per_hour as u64,
        total_spent: db.total_spent as u64,
        ssh_access,
        jupyter_access,
        api_endpoint: db.api_endpoint.clone(),
        last_billed_at: db.last_billed_at,
        error: db.error_message.clone(),
    }
}

fn string_to_status(s: &str) -> RentalStatus {
    match s {
        "pending_escrow" => RentalStatus::PendingEscrow,
        "provisioning" => RentalStatus::Provisioning,
        "running" => RentalStatus::Running,
        "suspended" => RentalStatus::Suspended,
        "stopping" => RentalStatus::Stopping,
        "stopped" => RentalStatus::Stopped,
        "failed" => RentalStatus::Failed,
        "expired" => RentalStatus::Expired,
        _ => RentalStatus::Failed,
    }
}

fn db_to_gpu(db: &DbMarketplaceGpu) -> MarketplaceGpu {
    let availability = db_to_availability(&db.availability, db.availability_data.as_deref());
    let backend = match db.gpu_backend.as_str() {
        "cuda" => GpuBackend::Cuda,
        "metal" => GpuBackend::Metal,
        "vulkan" => GpuBackend::Vulkan,
        _ => GpuBackend::Cuda,
    };
    let supported_templates: Vec<String> = serde_json::from_str(&db.supported_templates)
        .unwrap_or_default();

    MarketplaceGpu {
        id: db.id.clone(),
        validator_wallet: db.validator_wallet.clone(),
        gpu_model: db.gpu_model.clone(),
        vram_gb: db.vram_gb as u32,
        backend,
        mig_capable: db.mig_capable,
        availability,
        rate_sage_per_hour: db.rate_sage_per_hour as u64,
        uptime_percent: db.uptime_percent as f32,
        total_rentals: db.total_rentals as u32,
        rating: db.rating as f32,
        region: db.region.clone(),
        supported_templates,
    }
}

fn db_to_availability(status: &str, data: Option<&str>) -> GpuAvailability {
    match status {
        "available" => GpuAvailability::Available,
        "partially_available" => {
            if let Some(json) = data {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
                    return GpuAvailability::PartiallyAvailable {
                        available_vram_gb: v["available_vram_gb"].as_u64().unwrap_or(0) as u32,
                        total_vram_gb: v["total_vram_gb"].as_u64().unwrap_or(0) as u32,
                    };
                }
            }
            GpuAvailability::Available
        }
        "in_use" => {
            let available_in_minutes = data.and_then(|json| {
                serde_json::from_str::<serde_json::Value>(json).ok()
            }).and_then(|v| v["available_in_minutes"].as_u64().map(|n| n as u32));
            GpuAvailability::InUse { available_in_minutes }
        }
        "reserved" => {
            if let Some(json) = data {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
                    let rental_id = v["rental_id"].as_str()
                        .and_then(|s| Uuid::parse_str(s).ok())
                        .unwrap_or_else(Uuid::nil);
                    let reserved_until = v["reserved_until"].as_str()
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now);
                    return GpuAvailability::Reserved { rental_id, reserved_until };
                }
            }
            GpuAvailability::Offline
        }
        "offline" => GpuAvailability::Offline,
        _ => GpuAvailability::Offline,
    }
}

fn db_to_escrow(db: &DbEscrowBalance) -> EscrowBalance {
    EscrowBalance {
        wallet: db.wallet.clone(),
        total_deposited: db.total_deposited as u64,
        total_spent: db.total_spent as u64,
        available: db.available as u64,
        reserved: db.reserved as u64,
        updated_at: db.updated_at,
    }
}

fn db_to_billing(db: &DbBillingRecord) -> BillingRecord {
    BillingRecord {
        id: db.id,
        rental_id: db.rental_id,
        amount: db.amount as u64,
        period_start: db.period_start,
        period_end: db.period_end,
        tx_hash: db.tx_hash.clone(),
        created_at: db.created_at,
    }
}

fn db_to_earnings(db: &DbValidatorEarnings) -> ValidatorEarnings {
    ValidatorEarnings {
        wallet: db.wallet.clone(),
        total_earned: db.total_earned as u64,
        total_withdrawn: db.total_withdrawn as u64,
        available: db.available as u64,
        active_rentals: db.active_rentals as u32,
        last_earned_at: db.last_earned_at,
    }
}
