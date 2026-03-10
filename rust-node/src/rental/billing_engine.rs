//! Billing Engine
//!
//! Handles billing for GPU rentals:
//! - Escrow balance management
//! - Hourly billing cycles
//! - Settlement with validators
//! - Integration with on-chain escrow contract
//! - Rental suspension when funds depleted

use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Duration, Utc};
use tokio::sync::{RwLock, mpsc};
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use super::types::{
    RentalSession, EscrowBalance, BillingRecord, ValidatorEarnings,
};
use super::escrow_client::{EscrowClient, EscrowConfig, EscrowClientError};
use crate::contracts::contracts;

/// Event emitted when a rental needs to be suspended due to insufficient funds
#[derive(Debug, Clone)]
pub struct SuspensionEvent {
    pub rental_id: Uuid,
    pub tenant_wallet: String,
    pub reason: SuspensionReason,
    pub outstanding_amount: u64,
    pub timestamp: DateTime<Utc>,
}

/// Reason for rental suspension
#[derive(Debug, Clone)]
pub enum SuspensionReason {
    /// Escrow balance depleted
    InsufficientFunds { required: u64, available: u64 },
    /// Billing failed multiple times
    BillingFailure { attempts: u32, last_error: String },
    /// Manual suspension requested
    Manual { reason: String },
}

impl std::fmt::Display for SuspensionReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InsufficientFunds { required, available } => {
                write!(f, "Insufficient funds: required {} SAGE, available {}", required, available)
            }
            Self::BillingFailure { attempts, last_error } => {
                write!(f, "Billing failed after {} attempts: {}", attempts, last_error)
            }
            Self::Manual { reason } => {
                write!(f, "Manual suspension: {}", reason)
            }
        }
    }
}

/// Billing engine for rental payments
pub struct BillingEngine {
    /// User escrow balances (local cache)
    balances: RwLock<HashMap<String, EscrowBalance>>,
    /// Validator earnings (local cache)
    earnings: RwLock<HashMap<String, ValidatorEarnings>>,
    /// Billing records
    records: RwLock<Vec<BillingRecord>>,
    /// Reserved funds per rental
    reservations: RwLock<HashMap<Uuid, ReservationInfo>>,
    /// Escrow contract address
    escrow_contract: String,
    /// On-chain escrow client
    escrow_client: Option<Arc<EscrowClient>>,
    /// Whether to sync with on-chain state
    on_chain_enabled: bool,
    /// Channel for suspension events
    suspension_tx: Option<mpsc::Sender<SuspensionEvent>>,
    /// Failed billing attempts per rental
    billing_failures: RwLock<HashMap<Uuid, u32>>,
}

#[derive(Debug, Clone)]
struct ReservationInfo {
    wallet: String,
    amount: u64,
    rental_id: Uuid,
    created_at: DateTime<Utc>,
}

/// Maximum billing failures before suspension
const MAX_BILLING_FAILURES: u32 = 3;

impl BillingEngine {
    /// Create a new billing engine
    pub fn new() -> Self {
        // Use centralized contracts config
        let addrs = contracts();
        let escrow_contract = std::env::var("RENTAL_ESCROW_CONTRACT")
            .unwrap_or_else(|_| addrs.rental_escrow.clone());

        // Try to initialize the escrow client
        let (escrow_client, on_chain_enabled) = match EscrowClient::new(EscrowConfig::default()) {
            Ok(client) => {
                info!(contract = %escrow_contract, "Escrow client initialized with on-chain support");
                (Some(Arc::new(client)), true)
            }
            Err(e) => {
                warn!(error = %e, "Failed to initialize escrow client, running in offline mode");
                (None, false)
            }
        };

        Self {
            balances: RwLock::new(HashMap::new()),
            earnings: RwLock::new(HashMap::new()),
            records: RwLock::new(Vec::new()),
            reservations: RwLock::new(HashMap::new()),
            escrow_contract,
            escrow_client,
            on_chain_enabled,
            suspension_tx: None,
            billing_failures: RwLock::new(HashMap::new()),
        }
    }

    /// Create a billing engine with suspension event channel
    ///
    /// Returns the engine and a receiver for suspension events.
    /// The caller should spawn a task to handle suspension events.
    pub fn with_suspension_channel() -> (Self, mpsc::Receiver<SuspensionEvent>) {
        let (tx, rx) = mpsc::channel(100);
        let mut engine = Self::new();
        engine.suspension_tx = Some(tx);
        (engine, rx)
    }

    /// Set the suspension event sender
    pub fn set_suspension_sender(&mut self, tx: mpsc::Sender<SuspensionEvent>) {
        self.suspension_tx = Some(tx);
    }

    /// Emit a suspension event
    async fn emit_suspension(&self, event: SuspensionEvent) {
        if let Some(tx) = &self.suspension_tx {
            if let Err(e) = tx.send(event.clone()).await {
                error!(
                    rental_id = %event.rental_id,
                    error = %e,
                    "Failed to send suspension event"
                );
            } else {
                warn!(
                    rental_id = %event.rental_id,
                    tenant = %event.tenant_wallet,
                    "Suspension event emitted"
                );
            }
        } else {
            // No channel configured, just log
            error!(
                rental_id = %event.rental_id,
                tenant = %event.tenant_wallet,
                reason = ?event.reason,
                "SUSPENSION REQUIRED but no handler configured"
            );
        }
    }

    /// Record a billing failure and check if suspension is needed
    async fn record_billing_failure(&self, rental_id: Uuid, error: &str) -> bool {
        let mut failures = self.billing_failures.write().await;
        let count = failures.entry(rental_id).or_insert(0);
        *count += 1;

        if *count >= MAX_BILLING_FAILURES {
            warn!(
                rental_id = %rental_id,
                attempts = *count,
                "Max billing failures reached, suspension required"
            );
            true
        } else {
            debug!(
                rental_id = %rental_id,
                attempts = *count,
                max = MAX_BILLING_FAILURES,
                "Billing failure recorded"
            );
            false
        }
    }

    /// Clear billing failures for a rental (called on successful billing)
    async fn clear_billing_failures(&self, rental_id: Uuid) {
        let mut failures = self.billing_failures.write().await;
        failures.remove(&rental_id);
    }

    /// Create a billing engine with a specific escrow client
    pub fn with_escrow_client(escrow_client: Arc<EscrowClient>) -> Self {
        let escrow_contract = format!("{:#x}", escrow_client.contract_address());

        Self {
            balances: RwLock::new(HashMap::new()),
            earnings: RwLock::new(HashMap::new()),
            records: RwLock::new(Vec::new()),
            reservations: RwLock::new(HashMap::new()),
            escrow_contract,
            escrow_client: Some(escrow_client),
            on_chain_enabled: true,
            suspension_tx: None,
            billing_failures: RwLock::new(HashMap::new()),
        }
    }

    /// Get the escrow client (if available)
    pub fn escrow_client(&self) -> Option<&Arc<EscrowClient>> {
        self.escrow_client.as_ref()
    }

    /// Check if on-chain operations are enabled
    pub fn is_on_chain_enabled(&self) -> bool {
        self.on_chain_enabled
    }

    /// Get escrow balance for a wallet
    ///
    /// If on-chain is enabled, fetches from the contract and updates local cache.
    /// Otherwise, returns cached balance.
    pub async fn get_escrow_balance(&self, wallet: &str) -> Result<EscrowBalance, BillingError> {
        // Try to fetch from on-chain first
        if let Some(client) = &self.escrow_client {
            if let Ok(user_felt) = EscrowClient::address_to_felt(wallet) {
                match client.get_balance(user_felt).await {
                    Ok(on_chain) => {
                        let balance = EscrowBalance {
                            wallet: wallet.to_string(),
                            total_deposited: on_chain.total_deposited as u64,
                            total_spent: on_chain.total_spent as u64,
                            available: on_chain.available as u64,
                            reserved: on_chain.reserved as u64,
                            updated_at: Utc::now(),
                        };

                        // Update local cache
                        let mut balances = self.balances.write().await;
                        balances.insert(wallet.to_string(), balance.clone());

                        return Ok(balance);
                    }
                    Err(e) => {
                        debug!(wallet = %wallet, error = %e, "Failed to fetch on-chain balance, using cache");
                    }
                }
            }
        }

        // Fallback to local cache
        let balances = self.balances.read().await;
        if let Some(balance) = balances.get(wallet) {
            Ok(balance.clone())
        } else {
            // Return zero balance for new wallets
            Ok(EscrowBalance {
                wallet: wallet.to_string(),
                total_deposited: 0,
                total_spent: 0,
                available: 0,
                reserved: 0,
                updated_at: Utc::now(),
            })
        }
    }

    /// Sync balance from on-chain state
    pub async fn sync_balance(&self, wallet: &str) -> Result<EscrowBalance, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        let user_felt = EscrowClient::address_to_felt(wallet)
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let on_chain = client.get_balance(user_felt).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let balance = EscrowBalance {
            wallet: wallet.to_string(),
            total_deposited: on_chain.total_deposited as u64,
            total_spent: on_chain.total_spent as u64,
            available: on_chain.available as u64,
            reserved: on_chain.reserved as u64,
            updated_at: Utc::now(),
        };

        // Update local cache
        let mut balances = self.balances.write().await;
        balances.insert(wallet.to_string(), balance.clone());

        info!(wallet = %wallet, available = balance.available, "Balance synced from on-chain");

        Ok(balance)
    }

    /// Sync validator earnings from on-chain state
    pub async fn sync_earnings(&self, validator_wallet: &str) -> Result<ValidatorEarnings, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        let validator_felt = EscrowClient::address_to_felt(validator_wallet)
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let on_chain = client.get_earnings(validator_felt).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let earnings = ValidatorEarnings {
            wallet: validator_wallet.to_string(),
            total_earned: on_chain.total_earned as u64,
            total_withdrawn: on_chain.total_withdrawn as u64,
            available: on_chain.pending as u64,
            active_rentals: 0, // Not tracked on-chain
            last_earned_at: Some(Utc::now()),
        };

        // Update local cache
        let mut earnings_cache = self.earnings.write().await;
        earnings_cache.insert(validator_wallet.to_string(), earnings.clone());

        info!(validator = %validator_wallet, pending = earnings.available, "Earnings synced from on-chain");

        Ok(earnings)
    }

    /// Deposit SAGE to escrow
    ///
    /// In production, this would verify an on-chain transaction.
    /// For now, it directly updates the balance.
    pub async fn deposit(
        &self,
        wallet: &str,
        amount: u64,
        tx_hash: Option<String>,
    ) -> Result<EscrowBalance, BillingError> {
        if amount == 0 {
            return Err(BillingError::InvalidAmount("Amount must be > 0".to_string()));
        }

        // In production: verify tx_hash on-chain
        if let Some(ref hash) = tx_hash {
            self.verify_deposit_tx(hash, wallet, amount).await?;
        }

        let mut balances = self.balances.write().await;
        let balance = balances.entry(wallet.to_string()).or_insert_with(|| EscrowBalance {
            wallet: wallet.to_string(),
            total_deposited: 0,
            total_spent: 0,
            available: 0,
            reserved: 0,
            updated_at: Utc::now(),
        });

        balance.total_deposited = balance.total_deposited.checked_add(amount)
            .ok_or_else(|| BillingError::InvalidAmount("Deposit would overflow total_deposited".to_string()))?;
        balance.available = balance.available.checked_add(amount)
            .ok_or_else(|| BillingError::InvalidAmount("Deposit would overflow available balance".to_string()))?;
        balance.updated_at = Utc::now();

        info!(
            wallet = %wallet,
            amount = amount,
            new_balance = balance.available,
            "Deposit recorded"
        );

        Ok(balance.clone())
    }

    /// Verify a deposit transaction on-chain
    ///
    /// Checks that the transaction:
    /// 1. Actually succeeded on-chain
    /// 2. Emitted a Deposited event from the escrow contract
    /// 3. The event matches the expected user and amount
    async fn verify_deposit_tx(&self, tx_hash: &str, wallet: &str, amount: u64) -> Result<(), BillingError> {
        let client = match &self.escrow_client {
            Some(c) => c,
            None => {
                warn!(tx_hash = %tx_hash, "Escrow client not available, skipping verification");
                return Ok(());
            }
        };

        let user_felt = EscrowClient::address_to_felt(wallet)
            .map_err(|e| BillingError::VerificationFailed(format!("Invalid wallet address: {}", e)))?;

        match client.verify_deposit(tx_hash, user_felt, amount as u128).await {
            Ok(verified) => {
                info!(
                    tx_hash = %tx_hash,
                    wallet = %wallet,
                    verified_amount = verified.amount,
                    new_balance = verified.new_balance,
                    "Deposit verified on-chain"
                );
                Ok(())
            }
            Err(super::escrow_client::EscrowClientError::RpcError(e)) => {
                // RPC errors might be transient, log but allow (with warning)
                warn!(
                    tx_hash = %tx_hash,
                    error = %e,
                    "RPC error during verification, allowing deposit with warning"
                );
                Ok(())
            }
            Err(e) => {
                error!(tx_hash = %tx_hash, wallet = %wallet, error = %e, "Deposit verification failed");
                Err(BillingError::VerificationFailed(e.to_string()))
            }
        }
    }

    /// Reserve funds for a rental
    pub async fn reserve_funds(
        &self,
        wallet: &str,
        rental_id: Uuid,
        amount: u64,
    ) -> Result<(), BillingError> {
        let mut balances = self.balances.write().await;
        let balance = balances.get_mut(wallet)
            .ok_or_else(|| BillingError::InsufficientFunds {
                required: amount,
                available: 0,
            })?;

        if balance.available < amount {
            return Err(BillingError::InsufficientFunds {
                required: amount,
                available: balance.available,
            });
        }

        balance.available -= amount;
        balance.reserved = balance.reserved.saturating_add(amount);
        balance.updated_at = Utc::now();

        // Track reservation
        let mut reservations = self.reservations.write().await;
        reservations.insert(rental_id, ReservationInfo {
            wallet: wallet.to_string(),
            amount,
            rental_id,
            created_at: Utc::now(),
        });

        info!(
            wallet = %wallet,
            rental_id = %rental_id,
            amount = amount,
            "Funds reserved"
        );

        Ok(())
    }

    /// Release reserved funds (e.g., on rental cancellation)
    pub async fn release_funds(&self, wallet: &str, rental_id: Uuid) -> Result<u64, BillingError> {
        let reservation = {
            let mut reservations = self.reservations.write().await;
            reservations.remove(&rental_id)
        };

        if let Some(info) = reservation {
            let mut balances = self.balances.write().await;
            if let Some(balance) = balances.get_mut(&info.wallet) {
                balance.available = balance.available.saturating_add(info.amount);
                balance.reserved = balance.reserved.saturating_sub(info.amount);
                balance.updated_at = Utc::now();

                info!(
                    wallet = %wallet,
                    rental_id = %rental_id,
                    amount = info.amount,
                    "Funds released"
                );

                return Ok(info.amount);
            }
        }

        Ok(0)
    }

    /// Charge for a billing period
    ///
    /// Called periodically (e.g., every hour) to bill active rentals.
    pub async fn charge_rental(
        &self,
        rental: &RentalSession,
        hours: f64,
    ) -> Result<BillingRecord, BillingError> {
        // Guard against negative or absurdly large hours values
        if hours <= 0.0 || hours > 744.0 {
            return Err(BillingError::InvalidAmount(
                format!("Invalid billing hours: {} (must be 0 < hours <= 744)", hours),
            ));
        }

        // Use checked arithmetic to prevent overflow
        let amount = {
            let raw = (rental.rate_sage_per_hour as f64) * hours;
            if raw < 0.0 || raw > u64::MAX as f64 {
                return Err(BillingError::InvalidAmount(
                    format!("Billing amount overflow: rate={} hours={}", rental.rate_sage_per_hour, hours),
                ));
            }
            raw as u64
        };

        if amount == 0 {
            return Err(BillingError::InvalidAmount("Charge amount is 0".to_string()));
        }

        // Deduct from reserved funds
        {
            let mut reservations = self.reservations.write().await;
            if let Some(reservation) = reservations.get_mut(&rental.id) {
                if reservation.amount < amount {
                    return Err(BillingError::InsufficientFunds {
                        required: amount,
                        available: reservation.amount,
                    });
                }
                reservation.amount -= amount;
            } else {
                return Err(BillingError::NoReservation(rental.id));
            }
        }

        // Update tenant balance
        {
            let mut balances = self.balances.write().await;
            if let Some(balance) = balances.get_mut(&rental.tenant_wallet) {
                balance.reserved = balance.reserved.saturating_sub(amount);
                balance.total_spent = balance.total_spent.saturating_add(amount);
                balance.updated_at = Utc::now();
            }
        }

        // Credit validator earnings
        {
            let mut earnings = self.earnings.write().await;
            let validator = earnings.entry(rental.validator_wallet.clone()).or_insert_with(|| {
                ValidatorEarnings {
                    wallet: rental.validator_wallet.clone(),
                    total_earned: 0,
                    total_withdrawn: 0,
                    available: 0,
                    active_rentals: 0,
                    last_earned_at: None,
                }
            });
            validator.total_earned = validator.total_earned.saturating_add(amount);
            validator.available = validator.available.saturating_add(amount);
            validator.last_earned_at = Some(Utc::now());
        }

        // Create billing record
        let record = BillingRecord {
            id: Uuid::new_v4(),
            rental_id: rental.id,
            amount,
            period_start: rental.last_billed_at,
            period_end: Utc::now(),
            tx_hash: None, // Will be set when settled on-chain
            created_at: Utc::now(),
        };

        // Store record
        {
            let mut records = self.records.write().await;
            records.push(record.clone());
        }

        info!(
            rental_id = %rental.id,
            amount = amount,
            tenant = %rental.tenant_wallet,
            validator = %rental.validator_wallet,
            "Rental charged"
        );

        Ok(record)
    }

    /// Settle a rental (final billing on stop)
    pub async fn settle_rental(&self, rental: &RentalSession) -> Result<u64, BillingError> {
        // Calculate time since last billing
        let now = Utc::now();
        let duration = now.signed_duration_since(rental.last_billed_at);
        let hours = duration.num_minutes() as f64 / 60.0;

        if hours <= 0.0 {
            return Ok(0);
        }

        // Cap at 744 hours (31 days) to prevent overflow from clock skew
        let hours = hours.min(744.0);
        let raw = (rental.rate_sage_per_hour as f64) * hours;
        let amount = if raw < 0.0 || raw > u64::MAX as f64 {
            return Err(BillingError::InvalidAmount(
                format!("Settlement amount overflow: rate={} hours={}", rental.rate_sage_per_hour, hours),
            ));
        } else {
            raw as u64
        };

        // Release remaining reservation
        let reservation = {
            let mut reservations = self.reservations.write().await;
            reservations.remove(&rental.id)
        };

        if let Some(info) = reservation {
            // Charge the amount owed
            let charge = amount.min(info.amount);

            // Update tenant balance
            {
                let mut balances = self.balances.write().await;
                if let Some(balance) = balances.get_mut(&rental.tenant_wallet) {
                    // Refund unused reservation
                    let refund = info.amount.saturating_sub(charge);
                    balance.available = balance.available.saturating_add(refund);
                    balance.reserved = balance.reserved.saturating_sub(info.amount);
                    balance.total_spent = balance.total_spent.saturating_add(charge);
                    balance.updated_at = Utc::now();
                }
            }

            // Credit validator
            if charge > 0 {
                let mut earnings = self.earnings.write().await;
                if let Some(validator) = earnings.get_mut(&rental.validator_wallet) {
                    validator.total_earned = validator.total_earned.saturating_add(charge);
                    validator.available = validator.available.saturating_add(charge);
                    validator.last_earned_at = Some(now);
                    validator.active_rentals = validator.active_rentals.saturating_sub(1);
                }

                // Create final billing record
                let record = BillingRecord {
                    id: Uuid::new_v4(),
                    rental_id: rental.id,
                    amount: charge,
                    period_start: rental.last_billed_at,
                    period_end: now,
                    tx_hash: None,
                    created_at: now,
                };

                let mut records = self.records.write().await;
                records.push(record);
            }

            info!(
                rental_id = %rental.id,
                final_charge = amount,
                refund = info.amount.saturating_sub(amount),
                "Rental settled"
            );

            return Ok(amount);
        }

        Ok(0)
    }

    /// Get validator earnings
    pub async fn get_validator_earnings(&self, wallet: &str) -> ValidatorEarnings {
        let earnings = self.earnings.read().await;
        earnings.get(wallet).cloned().unwrap_or_else(|| ValidatorEarnings {
            wallet: wallet.to_string(),
            total_earned: 0,
            total_withdrawn: 0,
            available: 0,
            active_rentals: 0,
            last_earned_at: None,
        })
    }

    /// Verify a validator withdrawal transaction
    ///
    /// Validators call `withdraw_earnings()` directly on the escrow contract.
    /// This method verifies that the withdrawal transaction succeeded and syncs
    /// the local earnings cache from on-chain state.
    ///
    /// Returns the verified withdrawal amount.
    pub async fn verify_withdrawal(&self, wallet: &str, tx_hash: &str) -> Result<u64, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        let validator_felt = EscrowClient::address_to_felt(wallet)
            .map_err(|e| BillingError::OnChainError(format!("Invalid wallet: {}", e)))?;

        // Verify the withdrawal transaction on-chain
        let verified = client.verify_withdrawal(tx_hash, validator_felt).await
            .map_err(|e| BillingError::VerificationFailed(e.to_string()))?;

        // Sync earnings from on-chain to update local cache
        self.sync_earnings(wallet).await?;

        info!(
            wallet = %wallet,
            tx_hash = %tx_hash,
            amount = verified.amount,
            remaining = verified.remaining,
            "Validator withdrawal verified and synced"
        );

        Ok(verified.amount as u64)
    }

    /// Withdraw validator earnings (legacy method - now just syncs from chain)
    ///
    /// Note: Validators should call `withdraw_earnings()` directly on the escrow contract.
    /// This method checks local balance but actual withdrawals happen on-chain.
    ///
    /// For proper withdrawal flow:
    /// 1. Validator calls contract's `withdraw_earnings(amount)` directly
    /// 2. Validator submits tx_hash to `verify_withdrawal()` on this API
    /// 3. System syncs and updates local cache
    pub async fn withdraw_earnings(&self, wallet: &str, amount: u64) -> Result<String, BillingError> {
        // Check local earnings first
        let earnings = self.earnings.read().await;
        let validator = earnings.get(wallet)
            .ok_or_else(|| BillingError::NoEarnings(wallet.to_string()))?;

        if validator.available < amount {
            return Err(BillingError::InsufficientFunds {
                required: amount,
                available: validator.available,
            });
        }
        drop(earnings);

        // Inform the caller they need to interact with the contract directly
        // This returns an instruction message, not a real tx_hash
        warn!(
            wallet = %wallet,
            amount = amount,
            "Withdrawal requested - validator must call contract directly"
        );

        // Return the escrow contract address so client knows where to send tx
        Ok(format!(
            "PENDING:call_contract:{}:withdraw_earnings:{}",
            self.escrow_contract,
            amount
        ))
    }

    /// Credit SAGE earnings to a validator for completing a proof job
    pub async fn credit_proof_earnings(&self, validator_wallet: &str, amount: u64, job_id: Uuid) {
        let mut earnings = self.earnings.write().await;
        let validator = earnings.entry(validator_wallet.to_string()).or_insert_with(|| {
            ValidatorEarnings {
                wallet: validator_wallet.to_string(),
                total_earned: 0,
                total_withdrawn: 0,
                available: 0,
                active_rentals: 0,
                last_earned_at: None,
            }
        });
        validator.total_earned = validator.total_earned.saturating_add(amount);
        validator.available = validator.available.saturating_add(amount);
        validator.last_earned_at = Some(Utc::now());

        info!(
            validator = %validator_wallet,
            amount = amount,
            job_id = %job_id,
            total_earned = validator.total_earned,
            "Credited proof reward to validator"
        );
    }

    /// Force sync earnings from on-chain and update local state
    pub async fn refresh_validator_earnings(&self, wallet: &str) -> Result<ValidatorEarnings, BillingError> {
        self.sync_earnings(wallet).await
    }

    /// Get validators with available earnings above a threshold (for auto-settlement)
    pub async fn get_settleable_validators(&self, min_amount: u64) -> Vec<(String, u64)> {
        let earnings = self.earnings.read().await;
        earnings.iter()
            .filter(|(_, v)| v.available >= min_amount)
            .map(|(wallet, v)| (wallet.clone(), v.available))
            .collect()
    }

    /// Mark earnings as settled (deduct from available after on-chain settlement)
    pub async fn mark_earnings_settled(&self, wallet: &str, amount: u64) {
        let mut earnings = self.earnings.write().await;
        if let Some(validator) = earnings.get_mut(wallet) {
            validator.available = validator.available.saturating_sub(amount);
            validator.total_withdrawn = validator.total_withdrawn.saturating_add(amount);
            info!(
                validator = %wallet,
                amount = amount,
                remaining = validator.available,
                "Marked earnings as settled"
            );
        }
    }

    /// Get billing records for a rental
    pub async fn get_rental_billing(&self, rental_id: Uuid) -> Vec<BillingRecord> {
        let records = self.records.read().await;
        records.iter()
            .filter(|r| r.rental_id == rental_id)
            .cloned()
            .collect()
    }

    /// Get billing records for a user
    pub async fn get_user_billing_history(&self, wallet: &str) -> Vec<BillingRecord> {
        // In production, this would filter by tenant wallet
        // For now, return all records
        let records = self.records.read().await;
        records.clone()
    }

    /// Start the billing loop for active rentals
    ///
    /// This runs in the background and charges rentals hourly.
    pub async fn start_billing_loop(self: Arc<Self>, rentals: Arc<RwLock<HashMap<Uuid, RentalSession>>>) {
        info!("Starting billing loop");

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await; // 1 hour

            let active_rentals: Vec<RentalSession> = {
                let rentals = rentals.read().await;
                rentals.values()
                    .filter(|r| r.status.is_active())
                    .cloned()
                    .collect()
            };

            for mut rental in active_rentals {
                match self.charge_rental(&rental, 1.0).await {
                    Ok(record) => {
                        debug!(rental_id = %rental.id, amount = record.amount, "Hourly charge applied");
                        // Update last_billed_at
                        rental.last_billed_at = Utc::now();
                    }
                    Err(BillingError::InsufficientFunds { .. }) => {
                        warn!(rental_id = %rental.id, "Insufficient funds, rental may be suspended");
                        // In production: emit event to suspend rental
                    }
                    Err(e) => {
                        error!(rental_id = %rental.id, error = %e, "Billing error");
                    }
                }
            }
        }
    }

    /// Get the escrow contract address
    pub fn escrow_contract_address(&self) -> &str {
        &self.escrow_contract
    }

    /// Check if a user has sufficient balance for a rental
    pub async fn check_balance(&self, wallet: &str, required: u64) -> Result<bool, BillingError> {
        let balance = self.get_escrow_balance(wallet).await?;
        Ok(balance.available >= required)
    }

    /// Process hourly billing for all active rentals
    ///
    /// Called by the background billing task. This method:
    /// 1. Gets all active rentals from the session manager
    /// 2. For each rental, calculates time since last billing
    /// 3. Charges proportionally based on time elapsed
    pub async fn process_hourly_billing(
        &self,
        session_manager: &super::session_manager::RentalSessionManager,
    ) -> Result<(), BillingError> {
        // Get all active sessions from the session manager
        let active_sessions = session_manager.get_all_active_sessions().await;

        if active_sessions.is_empty() {
            debug!("No active rentals to bill");
            return Ok(());
        }

        info!(count = active_sessions.len(), "Processing hourly billing for active rentals");

        let now = Utc::now();

        for rental in active_sessions {
            // Skip suspended rentals — they should not be billed (container is stopped)
            if rental.status == super::types::RentalStatus::Suspended {
                debug!(rental_id = %rental.id, "Skipping billing for suspended rental");
                continue;
            }

            // Calculate hours since last billing
            let duration = now.signed_duration_since(rental.last_billed_at);
            let hours = duration.num_minutes() as f64 / 60.0;

            // Only charge if at least 5 minutes have passed
            if hours < 0.0833 {
                continue;
            }

            match self.charge_rental(&rental, hours).await {
                Ok(record) => {
                    // Update last_billed_at on the session
                    session_manager.update_last_billed(rental.id, now).await;
                    session_manager.update_total_spent(rental.id, record.amount).await;

                    // Clear any previous billing failures on success
                    self.clear_billing_failures(rental.id).await;
                    debug!(
                        rental_id = %rental.id,
                        amount = record.amount,
                        hours = hours,
                        "Billing charge applied"
                    );
                }
                Err(BillingError::NoReservation(id)) => {
                    // Expected race: rental was stopped/settled between snapshot and charge.
                    // Not an error — the reservation was removed by settle_rental().
                    debug!(
                        rental_id = %id,
                        "Skipping billing — reservation already released (rental likely stopped)"
                    );
                }
                Err(BillingError::InsufficientFunds { required, available }) => {
                    warn!(
                        rental_id = %rental.id,
                        required = required,
                        available = available,
                        "Insufficient funds for rental billing - suspending rental"
                    );

                    // Emit suspension event
                    self.emit_suspension(SuspensionEvent {
                        rental_id: rental.id,
                        tenant_wallet: rental.tenant_wallet.clone(),
                        reason: SuspensionReason::InsufficientFunds { required, available },
                        outstanding_amount: required.saturating_sub(available),
                        timestamp: Utc::now(),
                    }).await;
                }
                Err(e) => {
                    error!(rental_id = %rental.id, error = %e, "Billing error");

                    // Track billing failures
                    let should_suspend = self.record_billing_failure(
                        rental.id,
                        &e.to_string()
                    ).await;

                    if should_suspend {
                        let failures = {
                            let f = self.billing_failures.read().await;
                            *f.get(&rental.id).unwrap_or(&0)
                        };

                        self.emit_suspension(SuspensionEvent {
                            rental_id: rental.id,
                            tenant_wallet: rental.tenant_wallet.clone(),
                            reason: SuspensionReason::BillingFailure {
                                attempts: failures,
                                last_error: e.to_string(),
                            },
                            outstanding_amount: 0,
                            timestamp: Utc::now(),
                        }).await;
                    }
                }
            }
        }

        Ok(())
    }

    // ===== On-Chain Operations =====

    /// Start a rental on-chain
    ///
    /// Calls the escrow contract to start a rental with reserved funds.
    pub async fn start_rental_on_chain(
        &self,
        rental: &RentalSession,
        initial_hours: u64,
    ) -> Result<String, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        if !client.has_account() {
            return Err(BillingError::OnChainError("No account configured for transactions".to_string()));
        }

        let rental_id = EscrowClient::uuid_to_felt(rental.id);
        let tenant = EscrowClient::address_to_felt(&rental.tenant_wallet)
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;
        let validator = EscrowClient::address_to_felt(&rental.validator_wallet)
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let tx_hash = client.start_rental(
            rental_id,
            tenant,
            validator,
            rental.rate_sage_per_hour as u128,
            initial_hours,
        ).await.map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let tx_hash_hex = format!("{:#x}", tx_hash);

        info!(
            rental_id = %rental.id,
            tx_hash = %tx_hash_hex,
            initial_hours = initial_hours,
            "Rental started on-chain"
        );

        Ok(tx_hash_hex)
    }

    /// Charge a rental on-chain
    ///
    /// Calls the escrow contract to charge for rental hours.
    pub async fn charge_rental_on_chain(
        &self,
        rental: &RentalSession,
        hours: u64,
    ) -> Result<String, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        if !client.has_account() {
            return Err(BillingError::OnChainError("No account configured for transactions".to_string()));
        }

        let rental_id = EscrowClient::uuid_to_felt(rental.id);

        let tx_hash = client.charge_rental(rental_id, hours).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let tx_hash_hex = format!("{:#x}", tx_hash);

        debug!(
            rental_id = %rental.id,
            hours = hours,
            tx_hash = %tx_hash_hex,
            "Rental charged on-chain"
        );

        Ok(tx_hash_hex)
    }

    /// Stop a rental on-chain
    ///
    /// Calls the escrow contract to stop a rental and settle funds.
    pub async fn stop_rental_on_chain(
        &self,
        rental: &RentalSession,
    ) -> Result<String, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        if !client.has_account() {
            return Err(BillingError::OnChainError("No account configured for transactions".to_string()));
        }

        let rental_id = EscrowClient::uuid_to_felt(rental.id);

        let tx_hash = client.stop_rental(rental_id).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let tx_hash_hex = format!("{:#x}", tx_hash);

        info!(
            rental_id = %rental.id,
            tx_hash = %tx_hash_hex,
            "Rental stopped on-chain"
        );

        Ok(tx_hash_hex)
    }

    /// Extend a rental on-chain
    ///
    /// Calls the escrow contract to extend a rental with additional hours.
    pub async fn extend_rental_on_chain(
        &self,
        rental: &RentalSession,
        additional_hours: u64,
    ) -> Result<String, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        if !client.has_account() {
            return Err(BillingError::OnChainError("No account configured for transactions".to_string()));
        }

        let rental_id = EscrowClient::uuid_to_felt(rental.id);

        let tx_hash = client.extend_rental(rental_id, additional_hours).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))?;

        let tx_hash_hex = format!("{:#x}", tx_hash);

        info!(
            rental_id = %rental.id,
            additional_hours = additional_hours,
            tx_hash = %tx_hash_hex,
            "Rental extended on-chain"
        );

        Ok(tx_hash_hex)
    }

    /// Get rental info from on-chain
    pub async fn get_rental_on_chain(
        &self,
        rental_id: Uuid,
    ) -> Result<super::escrow_client::OnChainRental, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        let rental_felt = EscrowClient::uuid_to_felt(rental_id);

        client.get_rental(rental_felt).await
            .map_err(|e| BillingError::OnChainError(e.to_string()))
    }

    /// Get contract stats
    pub async fn get_contract_stats(&self) -> Result<(u128, u128, u64), BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        client.get_stats().await
            .map_err(|e| BillingError::OnChainError(e.to_string()))
    }

    /// Check if contract is paused
    pub async fn is_contract_paused(&self) -> Result<bool, BillingError> {
        let client = self.escrow_client.as_ref()
            .ok_or_else(|| BillingError::OnChainError("Escrow client not available".to_string()))?;

        client.is_paused().await
            .map_err(|e| BillingError::OnChainError(e.to_string()))
    }
}

impl Default for BillingEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Billing-related errors
#[derive(Debug, thiserror::Error)]
pub enum BillingError {
    #[error("Insufficient funds: required {required}, available {available}")]
    InsufficientFunds { required: u64, available: u64 },

    #[error("Invalid amount: {0}")]
    InvalidAmount(String),

    #[error("No reservation found for rental: {0}")]
    NoReservation(Uuid),

    #[error("No earnings for wallet: {0}")]
    NoEarnings(String),

    #[error("Transaction verification failed: {0}")]
    VerificationFailed(String),

    #[error("On-chain error: {0}")]
    OnChainError(String),
}
