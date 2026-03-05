//! Rental API Handlers
//!
//! REST API handlers for the GPU rental marketplace.

use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tracing::{info, error};

use super::{
    RentalState, RentalSession, RentalStatus, RentalTemplate,
    MarketplaceGpu, MarketplaceFilters, GpuAvailability,
    StartRentalRequest, StartRentalResponse, ExtendRentalRequest,
    EscrowBalance, BillingRecord, ValidatorEarnings,
};
use super::session_manager::RentalError;
use super::validation;

/// App state type alias
type AppState = Arc<super::super::AppState>;

// ============================================================================
// Templates API
// ============================================================================

/// List all available rental templates
#[axum::debug_handler]
pub async fn list_templates() -> Json<Vec<RentalTemplate>> {
    Json(RentalTemplate::defaults())
}

/// Get a specific template by ID
#[axum::debug_handler]
pub async fn get_template(
    Path(template_id): Path<String>,
) -> Result<Json<RentalTemplate>, (StatusCode, String)> {
    RentalTemplate::defaults()
        .into_iter()
        .find(|t| t.id == template_id)
        .map(Json)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Template '{}' not found", template_id)))
}

// ============================================================================
// Marketplace API
// ============================================================================

/// List available GPUs on the marketplace
#[axum::debug_handler]
pub async fn list_available_gpus(
    State(state): State<AppState>,
    Query(filters): Query<MarketplaceFilters>,
) -> Json<Vec<MarketplaceGpu>> {
    let listings = state.rentals.get_marketplace_listings(&filters).await;
    Json(listings)
}

/// Register a GPU on the marketplace (for validators)
#[axum::debug_handler]
pub async fn register_gpu(
    State(state): State<AppState>,
    Json(gpu): Json<MarketplaceGpu>,
) -> Result<Json<MarketplaceGpu>, (StatusCode, String)> {
    // Validate input
    validation::validate_register_gpu(
        &gpu.id,
        &gpu.validator_wallet,
        gpu.rate_sage_per_hour,
        gpu.vram_gb,
    ).map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    info!(gpu_id = %gpu.id, validator = %gpu.validator_wallet, "Registering GPU on marketplace");

    state.rentals.register_gpu(gpu.clone()).await;

    Ok(Json(gpu))
}

/// Update GPU availability
#[axum::debug_handler]
pub async fn update_gpu_availability(
    State(state): State<AppState>,
    Path(gpu_id): Path<String>,
    Json(availability): Json<GpuAvailability>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.rentals.update_gpu_availability(&gpu_id, availability).await;
    Ok(StatusCode::OK)
}

// ============================================================================
// Rental Session API
// ============================================================================

/// Start a new rental
#[axum::debug_handler]
pub async fn start_rental(
    State(state): State<AppState>,
    Json(request): Json<StartRentalRequest>,
) -> Result<Json<StartRentalResponse>, (StatusCode, String)> {
    // Validate input
    validation::validate_start_rental(
        &request.tenant_wallet,
        &request.template_id,
        &request.gpu_id,
        request.duration_hours as u64,
        request.ssh_public_key.as_deref(),
    ).map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    info!(
        template = %request.template_id,
        gpu = %request.gpu_id,
        tenant = %request.tenant_wallet,
        hours = request.duration_hours,
        "Starting rental"
    );

    // Get template
    let template = RentalState::get_template(&request.template_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Template '{}' not found", request.template_id)))?;

    // Get GPU
    let listings = state.rentals.get_marketplace_listings(&MarketplaceFilters::default()).await;
    let gpu = listings.iter()
        .find(|g| g.id == request.gpu_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("GPU '{}' not found", request.gpu_id)))?;

    // Check availability
    match &gpu.availability {
        GpuAvailability::InUse { .. } | GpuAvailability::Offline => {
            return Err((StatusCode::CONFLICT, "GPU is not available".to_string()));
        }
        _ => {}
    }

    // Check VRAM requirements
    if gpu.vram_gb < template.min_vram_gb {
        return Err((StatusCode::BAD_REQUEST, format!(
            "GPU has {}GB VRAM, template requires {}GB",
            gpu.vram_gb, template.min_vram_gb
        )));
    }

    // Start the rental
    let response = state.rentals.sessions.start_rental(
        request,
        &template,
        gpu,
        &state.rentals.containers,
        &state.rentals.gpus,
        &state.rentals.network,
        &state.rentals.access,
        &state.rentals.billing,
    ).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update GPU availability
    state.rentals.update_gpu_availability(&gpu.id, GpuAvailability::InUse {
        available_in_minutes: Some(response.rental.expires_at.signed_duration_since(chrono::Utc::now()).num_minutes() as u32),
    }).await;

    Ok(Json(response))
}

/// Get rental status
#[axum::debug_handler]
pub async fn get_rental(
    State(state): State<AppState>,
    Path(rental_id): Path<Uuid>,
) -> Result<Json<RentalSession>, (StatusCode, String)> {
    state.rentals.get_rental(rental_id).await
        .map(Json)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Rental '{}' not found", rental_id)))
}

/// Get all rentals for a user
#[axum::debug_handler]
pub async fn get_user_rentals(
    State(state): State<AppState>,
    Query(params): Query<UserRentalsQuery>,
) -> Result<Json<Vec<RentalSession>>, (StatusCode, String)> {
    // Validate wallet address
    validation::validate_wallet_address(&params.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let rentals = state.rentals.get_user_rentals(&params.wallet).await;
    Ok(Json(rentals))
}

#[derive(Debug, Deserialize)]
pub struct UserRentalsQuery {
    wallet: String,
}

/// Extend a rental (owner-only)
#[axum::debug_handler]
pub async fn extend_rental(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(rental_id): Path<Uuid>,
    Json(request): Json<ExtendRentalRequest>,
) -> Result<Json<RentalSession>, (StatusCode, String)> {
    // Verify ownership before allowing extend
    let rental = state.rentals.get_rental(rental_id).await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Rental not found".to_string()))?;
    let requester = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if requester.is_empty() || requester != rental.tenant_wallet {
        return Err((StatusCode::NOT_FOUND, "Rental not found".to_string()));
    }

    // Validate input
    validation::validate_extend_rental(request.additional_hours as u64)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    info!(rental_id = %rental_id, hours = request.additional_hours, "Extending rental");

    let session = state.rentals.sessions.extend_rental(
        rental_id,
        request.additional_hours,
        &state.rentals.billing,
    ).await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(session))
}

/// Stop a rental (owner-only)
#[axum::debug_handler]
pub async fn stop_rental(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(rental_id): Path<Uuid>,
) -> Result<Json<RentalSession>, (StatusCode, String)> {
    // Verify ownership before allowing stop
    let rental = state.rentals.get_rental(rental_id).await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Rental not found".to_string()))?;
    let requester = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if requester.is_empty() || requester != rental.tenant_wallet {
        return Err((StatusCode::NOT_FOUND, "Rental not found".to_string()));
    }

    info!(rental_id = %rental_id, "Stopping rental");

    let session = state.rentals.sessions.stop_rental(
        rental_id,
        &state.rentals.containers,
        &state.rentals.gpus,
        &state.rentals.network,
        &state.rentals.billing,
    ).await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Update GPU availability
    if let Some(gpu_id) = match &session.gpu_allocation {
        super::GpuAllocation::Exclusive { gpu_uuid, .. } => Some(gpu_uuid.clone()),
        super::GpuAllocation::Mig { .. } => None, // MIG partitions stay allocated
    } {
        state.rentals.update_gpu_availability(&gpu_id, GpuAvailability::Available).await;
    }

    Ok(Json(session))
}

/// Get SSH credentials for a rental (owner-only)
#[axum::debug_handler]
pub async fn get_ssh_credentials(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(rental_id): Path<Uuid>,
) -> Result<Json<SshCredentialsResponse>, (StatusCode, String)> {
    let rental = state.rentals.get_rental(rental_id).await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Rental not found".to_string()))?;

    // Security: verify the requester is the tenant who owns this rental
    let requester = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if requester.is_empty() || requester != rental.tenant_wallet {
        return Err((StatusCode::NOT_FOUND, "Rental not found".to_string()));
    }

    if !rental.status.is_active() {
        return Err((StatusCode::BAD_REQUEST, "Rental is not active".to_string()));
    }

    let ssh = rental.ssh_access
        .ok_or_else(|| (StatusCode::NOT_FOUND, "SSH access not available".to_string()))?;

    // Build connection string before moving fields
    let connection_host = ssh.tailscale_name.clone().unwrap_or_else(|| ssh.host.clone());
    let connection_string = format!("ssh -p {} {}@{}", ssh.port, "root", connection_host);

    Ok(Json(SshCredentialsResponse {
        method: format!("{:?}", ssh.method).to_lowercase(),
        host: ssh.host,
        port: ssh.port,
        username: ssh.username,
        key_fingerprint: ssh.key_fingerprint,
        tailscale_name: ssh.tailscale_name,
        connection_string,
    }))
}

#[derive(Debug, Serialize)]
pub struct SshCredentialsResponse {
    method: String,
    host: String,
    port: u16,
    username: String,
    key_fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tailscale_name: Option<String>,
    connection_string: String,
}

/// Get Jupyter access for a rental (owner-only)
#[axum::debug_handler]
pub async fn get_jupyter_access(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(rental_id): Path<Uuid>,
) -> Result<Json<JupyterAccessResponse>, (StatusCode, String)> {
    let rental = state.rentals.get_rental(rental_id).await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Rental not found".to_string()))?;

    // Security: verify the requester is the tenant who owns this rental
    let requester = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if requester.is_empty() || requester != rental.tenant_wallet {
        return Err((StatusCode::NOT_FOUND, "Rental not found".to_string()));
    }

    if !rental.status.is_active() {
        return Err((StatusCode::BAD_REQUEST, "Rental is not active".to_string()));
    }

    let jupyter = rental.jupyter_access
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Jupyter access not available".to_string()))?;

    Ok(Json(JupyterAccessResponse {
        url: jupyter.url,
        token: jupyter.token,
        expires_at: jupyter.expires_at.to_rfc3339(),
    }))
}

#[derive(Debug, Serialize)]
pub struct JupyterAccessResponse {
    url: String,
    token: String,
    expires_at: String,
}

// ============================================================================
// Billing API
// ============================================================================

/// Get escrow balance for a wallet
#[axum::debug_handler]
pub async fn get_escrow_balance(
    State(state): State<AppState>,
    Query(params): Query<WalletQuery>,
) -> Result<Json<EscrowBalance>, (StatusCode, String)> {
    // Validate wallet address
    validation::validate_wallet_address(&params.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let balance = state.rentals.billing.get_escrow_balance(&params.wallet).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(balance))
}

#[derive(Debug, Deserialize)]
pub struct WalletQuery {
    wallet: String,
}

/// Deposit SAGE to escrow
#[axum::debug_handler]
pub async fn deposit_escrow(
    State(state): State<AppState>,
    Json(request): Json<DepositRequest>,
) -> Result<Json<EscrowBalance>, (StatusCode, String)> {
    // Validate input
    validation::validate_wallet_address(&request.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    validation::validate_deposit(request.amount)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    info!(wallet = %request.wallet, amount = request.amount, "Processing deposit");

    let balance = state.rentals.billing.deposit(
        &request.wallet,
        request.amount,
        request.tx_hash,
    ).await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(balance))
}

#[derive(Debug, Deserialize)]
pub struct DepositRequest {
    wallet: String,
    amount: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    tx_hash: Option<String>,
}

/// Get billing history for a rental
#[axum::debug_handler]
pub async fn get_rental_billing(
    State(state): State<AppState>,
    Path(rental_id): Path<Uuid>,
) -> Json<Vec<BillingRecord>> {
    let records = state.rentals.billing.get_rental_billing(rental_id).await;
    Json(records)
}

/// Get validator earnings
#[axum::debug_handler]
pub async fn get_validator_earnings(
    State(state): State<AppState>,
    Query(params): Query<WalletQuery>,
) -> Result<Json<ValidatorEarnings>, (StatusCode, String)> {
    // Validate wallet address
    validation::validate_wallet_address(&params.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let earnings = state.rentals.billing.get_validator_earnings(&params.wallet).await;
    Ok(Json(earnings))
}

/// Withdraw validator earnings
#[axum::debug_handler]
pub async fn withdraw_earnings(
    State(state): State<AppState>,
    Json(request): Json<WithdrawRequest>,
) -> Result<Json<WithdrawResponse>, (StatusCode, String)> {
    // Validate input
    validation::validate_withdrawal(&request.wallet, request.amount)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    info!(wallet = %request.wallet, amount = request.amount, "Processing withdrawal");

    let tx_hash = state.rentals.billing.withdraw_earnings(&request.wallet, request.amount).await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(WithdrawResponse {
        tx_hash,
        amount: request.amount,
    }))
}

#[derive(Debug, Deserialize)]
pub struct WithdrawRequest {
    wallet: String,
    amount: u64,
}

#[derive(Debug, Serialize)]
pub struct WithdrawResponse {
    tx_hash: String,
    amount: u64,
}

// ============================================================================
// Container Management API (internal/admin)
// ============================================================================

/// Get container logs (owner-only — logs may contain secrets)
#[axum::debug_handler]
pub async fn get_container_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(rental_id): Path<Uuid>,
    Query(params): Query<LogsQuery>,
) -> Result<Json<LogsResponse>, (StatusCode, String)> {
    let rental = state.rentals.get_rental(rental_id).await
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Rental not found".to_string()))?;

    // Security: verify the requester is the tenant who owns this rental
    let requester = headers.get("X-Wallet-Address")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if requester.is_empty() || requester != rental.tenant_wallet {
        return Err((StatusCode::NOT_FOUND, "Rental not found".to_string()));
    }

    let container_id = rental.container_id
        .ok_or_else(|| (StatusCode::NOT_FOUND, "No container for this rental".to_string()))?;

    let logs = state.rentals.containers.get_logs(&container_id, params.lines.unwrap_or(100)).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(LogsResponse { logs }))
}

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    lines: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct LogsResponse {
    logs: String,
}

// ============================================================================
// Marketplace Stats
// ============================================================================

/// Get marketplace statistics
#[axum::debug_handler]
pub async fn get_marketplace_stats(
    State(state): State<AppState>,
) -> Json<MarketplaceStats> {
    let listings = state.rentals.get_marketplace_listings(&MarketplaceFilters::default()).await;

    let total_gpus = listings.len();
    let available_gpus = listings.iter()
        .filter(|g| matches!(g.availability, GpuAvailability::Available | GpuAvailability::PartiallyAvailable { .. }))
        .count();
    let total_vram_gb: u32 = listings.iter().map(|g| g.vram_gb).sum();
    let min_rate = listings.iter().map(|g| g.rate_sage_per_hour).min().unwrap_or(0);
    let max_rate = listings.iter().map(|g| g.rate_sage_per_hour).max().unwrap_or(0);

    Json(MarketplaceStats {
        total_gpus,
        available_gpus,
        total_vram_gb,
        min_rate_sage_per_hour: min_rate,
        max_rate_sage_per_hour: max_rate,
        templates_count: RentalTemplate::defaults().len(),
    })
}

#[derive(Debug, Serialize)]
pub struct MarketplaceStats {
    total_gpus: usize,
    available_gpus: usize,
    total_vram_gb: u32,
    min_rate_sage_per_hour: u64,
    max_rate_sage_per_hour: u64,
    templates_count: usize,
}

// ============================================================================
// On-Chain API
// ============================================================================

/// Get escrow contract status
#[axum::debug_handler]
pub async fn get_escrow_status(
    State(state): State<AppState>,
) -> Json<EscrowStatusResponse> {
    Json(EscrowStatusResponse {
        on_chain_enabled: state.rentals.is_on_chain_enabled(),
        contract_address: state.rentals.escrow_contract_address().to_string(),
        has_coordinator_account: state.rentals.escrow.as_ref()
            .map(|e| e.has_account())
            .unwrap_or(false),
    })
}

#[derive(Debug, Serialize)]
pub struct EscrowStatusResponse {
    on_chain_enabled: bool,
    contract_address: String,
    has_coordinator_account: bool,
}

/// Sync balance from on-chain
#[axum::debug_handler]
pub async fn sync_escrow_balance(
    State(state): State<AppState>,
    Query(params): Query<WalletQuery>,
) -> Result<Json<EscrowBalance>, (StatusCode, String)> {
    // Validate wallet address
    validation::validate_wallet_address(&params.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    if !state.rentals.is_on_chain_enabled() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "On-chain operations not available".to_string()));
    }

    let balance = state.rentals.billing.sync_balance(&params.wallet).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(balance))
}

/// Sync validator earnings from on-chain
#[axum::debug_handler]
pub async fn sync_validator_earnings(
    State(state): State<AppState>,
    Query(params): Query<WalletQuery>,
) -> Result<Json<ValidatorEarnings>, (StatusCode, String)> {
    // Validate wallet address
    validation::validate_wallet_address(&params.wallet)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    if !state.rentals.is_on_chain_enabled() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "On-chain operations not available".to_string()));
    }

    let earnings = state.rentals.billing.sync_earnings(&params.wallet).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(earnings))
}

/// Get on-chain rental info
#[axum::debug_handler]
pub async fn get_rental_on_chain(
    State(state): State<AppState>,
    Path(rental_id): Path<Uuid>,
) -> Result<Json<OnChainRentalResponse>, (StatusCode, String)> {
    if !state.rentals.is_on_chain_enabled() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "On-chain operations not available".to_string()));
    }

    let rental = state.rentals.billing.get_rental_on_chain(rental_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(OnChainRentalResponse {
        rental_id: format!("{:#x}", rental.rental_id),
        tenant: format!("{:#x}", rental.tenant),
        validator: format!("{:#x}", rental.validator),
        rate_per_hour: rental.rate_per_hour,
        reserved_amount: rental.reserved_amount,
        charged_amount: rental.charged_amount,
        started_at: rental.started_at,
        last_charged_at: rental.last_charged_at,
        is_active: rental.is_active,
    }))
}

#[derive(Debug, Serialize)]
pub struct OnChainRentalResponse {
    rental_id: String,
    tenant: String,
    validator: String,
    rate_per_hour: u128,
    reserved_amount: u128,
    charged_amount: u128,
    started_at: u64,
    last_charged_at: u64,
    is_active: bool,
}

/// Get contract statistics
#[axum::debug_handler]
pub async fn get_contract_stats(
    State(state): State<AppState>,
) -> Result<Json<ContractStatsResponse>, (StatusCode, String)> {
    if !state.rentals.is_on_chain_enabled() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "On-chain operations not available".to_string()));
    }

    let (total_deposited, total_earnings, total_rentals) = state.rentals.billing.get_contract_stats().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let is_paused = state.rentals.billing.is_contract_paused().await
        .unwrap_or(false);

    Ok(Json(ContractStatsResponse {
        total_deposited,
        total_earnings,
        total_rentals,
        is_paused,
    }))
}

#[derive(Debug, Serialize)]
pub struct ContractStatsResponse {
    total_deposited: u128,
    total_earnings: u128,
    total_rentals: u64,
    is_paused: bool,
}
