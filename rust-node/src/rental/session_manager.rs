//! Rental Session Manager
//!
//! Handles the lifecycle of rental sessions:
//! - Starting new rentals
//! - Stopping rentals
//! - Extending rental duration
//! - Session state transitions

use std::sync::Arc;
use chrono::{DateTime, Duration, Utc};
use tokio::sync::RwLock;
use uuid::Uuid;
use tracing::{info, warn, error};

use super::types::{
    RentalSession, RentalStatus, RentalTemplate, GpuAllocation,
    StartRentalRequest, StartRentalResponse,
    SshAccessInfo, JupyterAccessInfo,
    MarketplaceGpu,
};
use super::{ContainerManager, GpuManager, NetworkManager, AccessProvisioner, BillingEngine};

/// Manages rental session lifecycle
pub struct RentalSessionManager {
    /// Active sessions (in-memory cache, synced with persistent storage)
    sessions: RwLock<std::collections::HashMap<Uuid, SessionContext>>,
}

/// Internal session context with additional metadata
#[derive(Debug)]
struct SessionContext {
    session: RentalSession,
    billing_task: Option<tokio::task::JoinHandle<()>>,
}

impl RentalSessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(std::collections::HashMap::new()),
        }
    }

    /// Start a new rental session
    ///
    /// This is the main entry point for creating a rental. It:
    /// 1. Validates the request
    /// 2. Allocates GPU resources
    /// 3. Creates isolated network
    /// 4. Provisions the container
    /// 5. Sets up SSH/Jupyter access
    /// 6. Starts billing
    pub async fn start_rental(
        &self,
        request: StartRentalRequest,
        template: &RentalTemplate,
        gpu: &MarketplaceGpu,
        containers: &ContainerManager,
        gpus: &GpuManager,
        network: &NetworkManager,
        access: &AccessProvisioner,
        billing: &BillingEngine,
    ) -> Result<StartRentalResponse, RentalError> {
        let rental_id = Uuid::new_v4();
        let now = Utc::now();

        info!(
            rental_id = %rental_id,
            template = %template.id,
            gpu = %gpu.id,
            tenant = %request.tenant_wallet,
            "Starting new rental"
        );

        // Calculate required escrow
        let required_escrow = template.base_rate_sage_per_hour * request.duration_hours as u64;

        // Verify escrow balance
        let balance = billing.get_escrow_balance(&request.tenant_wallet).await?;
        if balance.available < required_escrow {
            return Err(RentalError::InsufficientFunds {
                required: required_escrow,
                available: balance.available,
            });
        }

        // Allocate GPU
        let gpu_allocation = gpus.allocate_gpu(&gpu.id, template.min_vram_gb).await?;

        // Create isolated network for tenant
        let _rental_network = match network.create_network(rental_id).await {
            Ok(n) => {
                info!(
                    rental_id = %rental_id,
                    network = %n.network_name,
                    subnet = %n.subnet,
                    isolation = n.isolation_active,
                    "Created isolated network for rental"
                );
                Some(n)
            }
            Err(e) => {
                warn!(
                    rental_id = %rental_id,
                    error = %e,
                    "Failed to create isolated network, continuing without network isolation"
                );
                None
            }
        };

        // Create initial session
        let mut session = RentalSession {
            id: rental_id,
            tenant_wallet: request.tenant_wallet.clone(),
            validator_wallet: gpu.validator_wallet.clone(),
            template_id: template.id.clone(),
            container_id: None,
            gpu_id: Some(gpu.id.clone()),
            gpu_allocation: gpu_allocation.clone(),
            status: RentalStatus::Provisioning,
            started_at: now,
            expires_at: now + Duration::hours(request.duration_hours as i64),
            rate_sage_per_hour: template.base_rate_sage_per_hour,
            total_spent: 0,
            ssh_access: None,
            jupyter_access: None,
            api_endpoint: None,
            last_billed_at: now,
            error: None,
        };

        // Store initial session
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(rental_id, SessionContext {
                session: session.clone(),
                billing_task: None,
            });
        }

        // Reserve funds in escrow
        billing.reserve_funds(
            &request.tenant_wallet,
            rental_id,
            required_escrow,
        ).await?;

        // Provision container
        let container_id = match containers.create_container(rental_id, template, &gpu_allocation).await {
            Ok(id) => id,
            Err(e) => {
                error!(rental_id = %rental_id, error = %e, "Failed to create container");
                self.fail_rental(rental_id, format!("Container creation failed: {}", e)).await;
                billing.release_funds(&request.tenant_wallet, rental_id).await?;
                return Err(RentalError::ContainerError(e.to_string()));
            }
        };

        session.container_id = Some(container_id.clone());

        // Start container
        if let Err(e) = containers.start_container(&container_id).await {
            error!(rental_id = %rental_id, error = %e, "Failed to start container");
            self.fail_rental(rental_id, format!("Container start failed: {}", e)).await;
            containers.remove_container(&container_id).await.ok();
            billing.release_funds(&request.tenant_wallet, rental_id).await?;
            return Err(RentalError::ContainerError(e.to_string()));
        }

        // Provision SSH access
        let ssh_access = if template.ssh_enabled {
            match access.provision_ssh(&container_id, request.ssh_public_key.as_deref()).await {
                Ok(ssh) => Some(ssh),
                Err(e) => {
                    warn!(rental_id = %rental_id, error = %e, "SSH provisioning failed, continuing without SSH");
                    None
                }
            }
        } else {
            None
        };

        session.ssh_access = ssh_access;

        // Provision Jupyter access
        let jupyter_access = if template.jupyter_enabled {
            match access.provision_jupyter(&container_id, rental_id).await {
                Ok(jupyter) => Some(jupyter),
                Err(e) => {
                    warn!(rental_id = %rental_id, error = %e, "Jupyter provisioning failed, continuing without Jupyter");
                    None
                }
            }
        } else {
            None
        };

        session.jupyter_access = jupyter_access;

        // Mark as running
        session.status = RentalStatus::Running;

        // Update session
        {
            let mut sessions = self.sessions.write().await;
            if let Some(ctx) = sessions.get_mut(&rental_id) {
                ctx.session = session.clone();
            }
        }

        info!(
            rental_id = %rental_id,
            container_id = %container_id,
            "Rental started successfully"
        );

        // Get escrow contract address from billing engine
        let escrow_contract = billing.escrow_contract_address().to_string();

        Ok(StartRentalResponse {
            rental: session,
            required_escrow,
            escrow_contract,
        })
    }

    /// Stop a rental session
    pub async fn stop_rental(
        &self,
        rental_id: Uuid,
        containers: &ContainerManager,
        gpus: &GpuManager,
        network: &NetworkManager,
        billing: &BillingEngine,
    ) -> Result<RentalSession, RentalError> {
        let session = {
            let sessions = self.sessions.read().await;
            sessions.get(&rental_id)
                .map(|ctx| ctx.session.clone())
                .ok_or(RentalError::NotFound(rental_id))?
        };

        if session.status.is_terminal() {
            return Err(RentalError::AlreadyStopped(rental_id));
        }

        info!(rental_id = %rental_id, "Stopping rental");

        // Update status
        self.update_status(rental_id, RentalStatus::Stopping).await;

        // Stop and remove container
        if let Some(container_id) = &session.container_id {
            if let Err(e) = containers.stop_container(container_id).await {
                warn!(rental_id = %rental_id, error = %e, "Error stopping container");
            }
            if let Err(e) = containers.remove_container(container_id).await {
                warn!(rental_id = %rental_id, error = %e, "Error removing container");
            }
        }

        // Cleanup network isolation
        if let Err(e) = network.delete_network(rental_id).await {
            warn!(rental_id = %rental_id, error = %e, "Error deleting network");
        } else {
            info!(rental_id = %rental_id, "Cleaned up network isolation");
        }

        // Release GPU
        gpus.release_gpu(&session.gpu_allocation).await?;

        // Final billing settlement
        let final_amount = billing.settle_rental(&session).await?;

        // Update session
        let mut final_session = session.clone();
        final_session.status = RentalStatus::Stopped;
        final_session.total_spent += final_amount;

        {
            let mut sessions = self.sessions.write().await;
            if let Some(ctx) = sessions.get_mut(&rental_id) {
                // Cancel billing task if running
                if let Some(task) = ctx.billing_task.take() {
                    task.abort();
                }
                ctx.session = final_session.clone();
            }
        }

        info!(rental_id = %rental_id, total_spent = final_session.total_spent, "Rental stopped");

        Ok(final_session)
    }

    /// Extend a rental by adding more time
    pub async fn extend_rental(
        &self,
        rental_id: Uuid,
        additional_hours: u32,
        billing: &BillingEngine,
    ) -> Result<RentalSession, RentalError> {
        let session = {
            let sessions = self.sessions.read().await;
            sessions.get(&rental_id)
                .map(|ctx| ctx.session.clone())
                .ok_or(RentalError::NotFound(rental_id))?
        };

        if !session.status.is_active() {
            return Err(RentalError::NotActive(rental_id));
        }

        // Calculate additional cost
        let additional_cost = session.rate_sage_per_hour * additional_hours as u64;

        // Verify and reserve additional funds
        let balance = billing.get_escrow_balance(&session.tenant_wallet).await?;
        if balance.available < additional_cost {
            return Err(RentalError::InsufficientFunds {
                required: additional_cost,
                available: balance.available,
            });
        }

        billing.reserve_funds(&session.tenant_wallet, rental_id, additional_cost).await?;

        // Update expiration
        let new_expires_at = session.expires_at + Duration::hours(additional_hours as i64);

        {
            let mut sessions = self.sessions.write().await;
            if let Some(ctx) = sessions.get_mut(&rental_id) {
                ctx.session.expires_at = new_expires_at;
            }
        }

        info!(
            rental_id = %rental_id,
            additional_hours = additional_hours,
            new_expires = %new_expires_at,
            "Rental extended"
        );

        let sessions = self.sessions.read().await;
        Ok(sessions.get(&rental_id).unwrap().session.clone())
    }

    /// Get rental by ID
    pub async fn get_rental(&self, rental_id: Uuid) -> Option<RentalSession> {
        let sessions = self.sessions.read().await;
        sessions.get(&rental_id).map(|ctx| ctx.session.clone())
    }

    /// Get all rentals for a tenant
    pub async fn get_tenant_rentals(&self, wallet: &str) -> Vec<RentalSession> {
        let sessions = self.sessions.read().await;
        sessions.values()
            .filter(|ctx| ctx.session.tenant_wallet == wallet)
            .map(|ctx| ctx.session.clone())
            .collect()
    }

    /// Get all rentals for a validator
    pub async fn get_validator_rentals(&self, wallet: &str) -> Vec<RentalSession> {
        let sessions = self.sessions.read().await;
        sessions.values()
            .filter(|ctx| ctx.session.validator_wallet == wallet)
            .map(|ctx| ctx.session.clone())
            .collect()
    }

    /// Get all active rental sessions (Running or Suspended)
    pub async fn get_all_active_sessions(&self) -> Vec<RentalSession> {
        let sessions = self.sessions.read().await;
        sessions.values()
            .filter(|ctx| ctx.session.status.is_active())
            .map(|ctx| ctx.session.clone())
            .collect()
    }

    /// Update rental status
    async fn update_status(&self, rental_id: Uuid, status: RentalStatus) {
        let mut sessions = self.sessions.write().await;
        if let Some(ctx) = sessions.get_mut(&rental_id) {
            ctx.session.status = status;
        }
    }

    /// Update last billed timestamp after successful billing
    pub async fn update_last_billed(&self, rental_id: Uuid, billed_at: DateTime<Utc>) {
        let mut sessions = self.sessions.write().await;
        if let Some(ctx) = sessions.get_mut(&rental_id) {
            ctx.session.last_billed_at = billed_at;
        }
    }

    /// Update total spent for a rental
    pub async fn update_total_spent(&self, rental_id: Uuid, amount: u64) {
        let mut sessions = self.sessions.write().await;
        if let Some(ctx) = sessions.get_mut(&rental_id) {
            ctx.session.total_spent += amount;
        }
    }

    /// Mark a rental as failed
    async fn fail_rental(&self, rental_id: Uuid, error: String) {
        let mut sessions = self.sessions.write().await;
        if let Some(ctx) = sessions.get_mut(&rental_id) {
            ctx.session.status = RentalStatus::Failed;
            ctx.session.error = Some(error);
        }
    }

    /// Suspend a rental (e.g., due to insufficient funds)
    pub async fn suspend_rental(&self, rental_id: Uuid, reason: &str) -> Result<(), RentalError> {
        let mut sessions = self.sessions.write().await;
        if let Some(ctx) = sessions.get_mut(&rental_id) {
            if ctx.session.status.is_terminal() {
                return Err(RentalError::AlreadyStopped(rental_id));
            }
            ctx.session.status = RentalStatus::Suspended;
            ctx.session.error = Some(format!("Suspended: {}", reason));
            info!(rental_id = %rental_id, reason = %reason, "Rental suspended");
            Ok(())
        } else {
            Err(RentalError::NotFound(rental_id))
        }
    }

    /// Resume a suspended rental (after funds are deposited)
    pub async fn resume_rental(
        &self,
        rental_id: Uuid,
        containers: &ContainerManager,
    ) -> Result<RentalSession, RentalError> {
        let session = {
            let sessions = self.sessions.read().await;
            sessions.get(&rental_id)
                .map(|ctx| ctx.session.clone())
                .ok_or(RentalError::NotFound(rental_id))?
        };

        if session.status != RentalStatus::Suspended {
            return Err(RentalError::NotActive(rental_id));
        }

        // Restart the container
        if let Some(container_id) = &session.container_id {
            containers.start_container(container_id).await
                .map_err(|e| RentalError::ContainerError(e.to_string()))?;
        }

        // Update status
        {
            let mut sessions = self.sessions.write().await;
            if let Some(ctx) = sessions.get_mut(&rental_id) {
                ctx.session.status = RentalStatus::Running;
                ctx.session.error = None;
            }
        }

        info!(rental_id = %rental_id, "Rental resumed");

        let sessions = self.sessions.read().await;
        Ok(sessions.get(&rental_id).unwrap().session.clone())
    }

    /// Check for expired rentals and handle them
    pub async fn check_expirations(
        &self,
        containers: &ContainerManager,
        gpus: &GpuManager,
        network: &NetworkManager,
        billing: &BillingEngine,
    ) {
        let now = Utc::now();
        let expired_ids: Vec<Uuid> = {
            let sessions = self.sessions.read().await;
            sessions.iter()
                .filter(|(_, ctx)| {
                    ctx.session.status == RentalStatus::Running &&
                    ctx.session.expires_at <= now
                })
                .map(|(id, _)| *id)
                .collect()
        };

        for rental_id in expired_ids {
            info!(rental_id = %rental_id, "Rental expired, stopping");
            if let Err(e) = self.stop_rental(rental_id, containers, gpus, network, billing).await {
                error!(rental_id = %rental_id, error = %e, "Failed to stop expired rental");
            }
        }
    }
}

impl Default for RentalSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur during rental operations
#[derive(Debug, thiserror::Error)]
pub enum RentalError {
    #[error("Rental not found: {0}")]
    NotFound(Uuid),

    #[error("Rental already stopped: {0}")]
    AlreadyStopped(Uuid),

    #[error("Rental not active: {0}")]
    NotActive(Uuid),

    #[error("Insufficient funds: required {required}, available {available}")]
    InsufficientFunds { required: u64, available: u64 },

    #[error("GPU allocation error: {0}")]
    GpuError(String),

    #[error("Container error: {0}")]
    ContainerError(String),

    #[error("Billing error: {0}")]
    BillingError(String),

    #[error("Access provisioning error: {0}")]
    AccessError(String),

    #[error("Template not found: {0}")]
    TemplateNotFound(String),

    #[error("GPU not available: {0}")]
    GpuNotAvailable(String),
}

impl From<super::gpu_manager::GpuError> for RentalError {
    fn from(e: super::gpu_manager::GpuError) -> Self {
        RentalError::GpuError(e.to_string())
    }
}

impl From<super::billing_engine::BillingError> for RentalError {
    fn from(e: super::billing_engine::BillingError) -> Self {
        RentalError::BillingError(e.to_string())
    }
}
