//! Database Models
//!
//! Domain models that map to database tables.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// GPU Worker registered with the coordinator
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbWorker {
    pub id: String,
    pub owner_wallet: Option<String>,
    pub gpu_model: Option<String>,
    pub gpu_backend: String,
    pub vram_gb: Option<i32>,
    pub capacity: i32,
    pub status: String, // online, offline, busy
    pub active_workload: Option<String>,
    pub last_heartbeat: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Workload deployment record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbDeployment {
    pub id: Uuid,
    pub workload_id: String,
    pub worker_id: String,
    pub owner_wallet: String,
    pub status: String, // queued, initializing, downloading, ready, failed, stopped
    pub container_id: Option<String>,
    pub progress_phase: Option<String>,
    pub progress_percent: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub ready_at: Option<DateTime<Utc>>,
    pub stopped_at: Option<DateTime<Utc>>,
}

/// GPU Marketplace listing
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbMarketplaceGpu {
    pub id: String,
    pub validator_wallet: String,
    pub gpu_model: String,
    pub vram_gb: i32,
    pub gpu_backend: String,
    pub mig_capable: bool,
    pub availability: String, // available, partially_available, in_use, reserved, offline
    pub availability_data: Option<String>, // JSON for complex availability states
    pub rate_sage_per_hour: i64,
    pub uptime_percent: f64,
    pub total_rentals: i32,
    pub rating: f64,
    pub region: Option<String>,
    pub supported_templates: String, // JSON array
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Rental session record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbRentalSession {
    pub id: Uuid,
    pub tenant_wallet: String,
    pub validator_wallet: String,
    pub template_id: String,
    pub gpu_id: String,
    pub container_id: Option<String>,
    pub status: String, // pending_escrow, provisioning, running, suspended, stopping, stopped, failed, expired
    pub rate_sage_per_hour: i64,
    pub total_spent: i64,
    pub started_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub last_billed_at: DateTime<Utc>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<i32>,
    pub ssh_username: Option<String>,
    pub ssh_method: Option<String>,
    pub ssh_key_fingerprint: Option<String>,
    pub ssh_tailscale_name: Option<String>,
    pub jupyter_url: Option<String>,
    pub jupyter_token: Option<String>,
    pub jupyter_expires_at: Option<DateTime<Utc>>,
    pub api_endpoint: Option<String>,
    pub gpu_allocation: Option<String>, // JSON serialized GpuAllocation
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Escrow balance for a wallet
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbEscrowBalance {
    pub wallet: String,
    pub total_deposited: i64,
    pub total_spent: i64,
    pub available: i64,
    pub reserved: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Billing record for rental charges
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbBillingRecord {
    pub id: Uuid,
    pub rental_id: Uuid,
    pub tenant_wallet: String,
    pub validator_wallet: String,
    pub amount: i64,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub tx_hash: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Validator earnings
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbValidatorEarnings {
    pub wallet: String,
    pub total_earned: i64,
    pub total_withdrawn: i64,
    pub available: i64,
    pub active_rentals: i32,
    pub last_earned_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Proof job record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbProofJob {
    pub id: Uuid,
    pub circuit_type: String,
    pub mode: String,
    pub status: String, // pending, proving, completed, failed
    pub worker_id: Option<String>,
    pub requester_wallet: Option<String>,
    pub proof_data: Option<String>, // JSON serialized proof
    pub public_inputs: Option<String>, // JSON
    pub generation_time_ms: Option<i64>,
    pub error_message: Option<String>,
    pub deadline: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbAuditLog {
    pub id: Uuid,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub actor_wallet: Option<String>,
    pub actor_ip: Option<String>,
    pub details: Option<String>, // JSON
    pub created_at: DateTime<Utc>,
}

/// API key for service authentication
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbApiKey {
    pub id: Uuid,
    pub name: String,
    pub key_hash: String, // Argon2 hashed
    pub wallet: String,
    pub permissions: String, // JSON array of permissions
    pub rate_limit: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}
