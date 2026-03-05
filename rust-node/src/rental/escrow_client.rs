//! Starknet Escrow Client
//!
//! Client for interacting with the RentalEscrow Cairo contract on Starknet.
//! Handles all on-chain operations for the GPU rental marketplace.

use std::sync::Arc;
use starknet::{
    accounts::{Account, ExecutionEncoding, SingleOwnerAccount, Call},
    core::{
        types::{BlockId, BlockTag, FunctionCall, FieldElement, MaybePendingTransactionReceipt, ExecutionResult},
        utils::get_selector_from_name,
    },
    providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider},
    signers::{LocalWallet, SigningKey},
};
use tracing::{debug, info, warn};
use url::Url;
use uuid::Uuid;

use crate::contracts::contracts;

// Type alias for compatibility
type Felt = FieldElement;

/// Pre-computed function selectors for the escrow contract
/// These are computed once at initialization to avoid runtime panics
#[derive(Debug, Clone)]
struct Selectors {
    get_balance: Felt,
    get_rental: Felt,
    get_earnings: Felt,
    get_version: Felt,
    is_paused: Felt,
    get_stats: Felt,
    start_rental: Felt,
    charge_rental: Felt,
    stop_rental: Felt,
    extend_rental: Felt,
    deposited_event: Felt,
    earnings_withdrawn_event: Felt,
}

impl Selectors {
    /// Initialize all selectors, returning an error if any fail
    fn new() -> Result<Self, EscrowClientError> {
        Ok(Self {
            get_balance: Self::get_selector("get_balance")?,
            get_rental: Self::get_selector("get_rental")?,
            get_earnings: Self::get_selector("get_earnings")?,
            get_version: Self::get_selector("get_version")?,
            is_paused: Self::get_selector("is_paused")?,
            get_stats: Self::get_selector("get_stats")?,
            start_rental: Self::get_selector("start_rental")?,
            charge_rental: Self::get_selector("charge_rental")?,
            stop_rental: Self::get_selector("stop_rental")?,
            extend_rental: Self::get_selector("extend_rental")?,
            deposited_event: Self::get_selector("Deposited")?,
            earnings_withdrawn_event: Self::get_selector("EarningsWithdrawn")?,
        })
    }

    fn get_selector(name: &str) -> Result<Felt, EscrowClientError> {
        get_selector_from_name(name)
            .map_err(|e| EscrowClientError::Configuration(
                format!("Failed to compute selector for '{}': {}", name, e)
            ))
    }
}

/// Escrow contract configuration
#[derive(Debug, Clone)]
pub struct EscrowConfig {
    /// RPC endpoint URL
    pub rpc_url: String,
    /// Escrow contract address
    pub contract_address: Felt,
    /// Coordinator private key (for signing transactions)
    pub coordinator_private_key: Option<Felt>,
    /// Coordinator address
    pub coordinator_address: Option<Felt>,
    /// Chain ID
    pub chain_id: Felt,
}

impl Default for EscrowConfig {
    fn default() -> Self {
        // Use centralized contracts config for defaults
        let contract_addrs = contracts();

        let raw_addr = std::env::var("RENTAL_ESCROW_CONTRACT")
            .unwrap_or_else(|_| contract_addrs.rental_escrow.clone());

        let contract_address = match FieldElement::from_hex_be(&raw_addr) {
            Ok(addr) if addr != FieldElement::ZERO => addr,
            Ok(_) => {
                tracing::error!("RENTAL_ESCROW_CONTRACT resolved to zero address — escrow will not function");
                FieldElement::ZERO
            }
            Err(e) => {
                tracing::error!(
                    address = %raw_addr,
                    error = %e,
                    "Failed to parse RENTAL_ESCROW_CONTRACT — escrow will not function"
                );
                FieldElement::ZERO
            }
        };

        // In production, refuse to start with zero escrow contract
        let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
        if is_production && contract_address == FieldElement::ZERO {
            tracing::error!("FATAL: RENTAL_ESCROW_CONTRACT is zero in production — all escrow operations will fail. Set a valid contract address.");
        }

        Self {
            rpc_url: std::env::var("STARKNET_RPC")
                .unwrap_or_else(|_| "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/demo".to_string()),
            contract_address,
            coordinator_private_key: std::env::var("COORDINATOR_PRIVATE_KEY")
                .ok()
                .and_then(|s| FieldElement::from_hex_be(&s).ok()),
            coordinator_address: std::env::var("COORDINATOR_ADDRESS")
                .ok()
                .and_then(|s| FieldElement::from_hex_be(&s).ok()),
            chain_id: std::env::var("STARKNET_CHAIN_ID")
                .ok()
                .and_then(|s| FieldElement::from_hex_be(&s).ok())
                .unwrap_or_else(|| FieldElement::from_hex_be("0x534e5f5345504f4c4941").unwrap()), // SN_SEPOLIA
        }
    }
}

/// Balance information from the escrow contract
#[derive(Debug, Clone, Default)]
pub struct OnChainBalance {
    pub available: u128,
    pub reserved: u128,
    pub total_deposited: u128,
    pub total_spent: u128,
}

/// Rental information from the escrow contract
#[derive(Debug, Clone)]
pub struct OnChainRental {
    pub rental_id: Felt,
    pub tenant: Felt,
    pub validator: Felt,
    pub rate_per_hour: u128,
    pub reserved_amount: u128,
    pub charged_amount: u128,
    pub started_at: u64,
    pub last_charged_at: u64,
    pub is_active: bool,
}

/// Validator earnings from the escrow contract
#[derive(Debug, Clone, Default)]
pub struct OnChainEarnings {
    pub pending: u128,
    pub total_earned: u128,
    pub total_withdrawn: u128,
}

/// Starknet escrow client
pub struct EscrowClient {
    provider: Arc<JsonRpcClient<HttpTransport>>,
    config: EscrowConfig,
    account: Option<SingleOwnerAccount<Arc<JsonRpcClient<HttpTransport>>, LocalWallet>>,
    /// Pre-computed function selectors
    selectors: Selectors,
}

impl EscrowClient {
    /// Create a new escrow client
    pub fn new(config: EscrowConfig) -> Result<Self, EscrowClientError> {
        // Pre-compute all selectors at initialization
        let selectors = Selectors::new()?;

        let url = Url::parse(&config.rpc_url)
            .map_err(|e| EscrowClientError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        let provider = Arc::new(JsonRpcClient::new(HttpTransport::new(url)));

        // Create account if credentials are provided
        let account = if let (Some(private_key), Some(address)) =
            (config.coordinator_private_key, config.coordinator_address)
        {
            let signer = LocalWallet::from(SigningKey::from_secret_scalar(private_key));
            Some(SingleOwnerAccount::new(
                provider.clone(),
                signer,
                address,
                config.chain_id,
                ExecutionEncoding::New,
            ))
        } else {
            None
        };

        if config.contract_address == FieldElement::ZERO {
            let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true"
                || std::env::var("NODE_ENV").unwrap_or_default() == "production";
            if is_production {
                return Err(EscrowClientError::Configuration(
                    "Escrow contract address is zero — cannot operate in production without a valid contract".into()
                ));
            }
            tracing::warn!("Escrow contract address is zero — escrow operations will fail");
        }

        info!(
            contract = %config.contract_address,
            rpc = %config.rpc_url,
            "Escrow client initialized"
        );

        Ok(Self {
            provider,
            config,
            account,
            selectors,
        })
    }

    /// Get user's escrow balance from the contract
    pub async fn get_balance(&self, user: Felt) -> Result<OnChainBalance, EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.get_balance,
                calldata: vec![user],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        if result.len() < 8 {
            return Err(EscrowClientError::InvalidResponse("Incomplete balance data".to_string()));
        }

        // Parse EscrowBalance struct (u256 values are 2 felts each: low, high)
        Ok(OnChainBalance {
            available: felt_pair_to_u128(&result[0], &result[1]),
            reserved: felt_pair_to_u128(&result[2], &result[3]),
            total_deposited: felt_pair_to_u128(&result[4], &result[5]),
            total_spent: felt_pair_to_u128(&result[6], &result[7]),
        })
    }

    /// Get rental information from the contract
    pub async fn get_rental(&self, rental_id: Felt) -> Result<OnChainRental, EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.get_rental,
                calldata: vec![rental_id],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        if result.len() < 13 {
            return Err(EscrowClientError::InvalidResponse("Incomplete rental data".to_string()));
        }

        Ok(OnChainRental {
            rental_id: result[0],
            tenant: result[1],
            validator: result[2],
            rate_per_hour: felt_pair_to_u128(&result[3], &result[4]),
            reserved_amount: felt_pair_to_u128(&result[5], &result[6]),
            charged_amount: felt_pair_to_u128(&result[7], &result[8]),
            started_at: result[9].to_string().parse().unwrap_or(0),
            last_charged_at: result[10].to_string().parse().unwrap_or(0),
            is_active: result[11] != Felt::ZERO,
        })
    }

    /// Get validator earnings from the contract
    pub async fn get_earnings(&self, validator: Felt) -> Result<OnChainEarnings, EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.get_earnings,
                calldata: vec![validator],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        if result.len() < 6 {
            return Err(EscrowClientError::InvalidResponse("Incomplete earnings data".to_string()));
        }

        Ok(OnChainEarnings {
            pending: felt_pair_to_u128(&result[0], &result[1]),
            total_earned: felt_pair_to_u128(&result[2], &result[3]),
            total_withdrawn: felt_pair_to_u128(&result[4], &result[5]),
        })
    }

    /// Get contract version
    pub async fn get_version(&self) -> Result<Felt, EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.get_version,
                calldata: vec![],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        result.first()
            .copied()
            .ok_or_else(|| EscrowClientError::InvalidResponse("No version returned".to_string()))
    }

    /// Check if contract is paused
    pub async fn is_paused(&self) -> Result<bool, EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.is_paused,
                calldata: vec![],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        Ok(result.first().map(|f| *f != Felt::ZERO).unwrap_or(false))
    }

    /// Get total stats (total_deposited, total_earnings, total_rentals)
    pub async fn get_stats(&self) -> Result<(u128, u128, u64), EscrowClientError> {
        let result = self.provider.call(
            FunctionCall {
                contract_address: self.config.contract_address,
                entry_point_selector: self.selectors.get_stats,
                calldata: vec![],
            },
            BlockId::Tag(BlockTag::Latest),
        ).await.map_err(|e| EscrowClientError::RpcError(e.to_string()))?;

        if result.len() < 5 {
            return Err(EscrowClientError::InvalidResponse("Incomplete stats data".to_string()));
        }

        Ok((
            felt_pair_to_u128(&result[0], &result[1]),
            felt_pair_to_u128(&result[2], &result[3]),
            result[4].to_string().parse().unwrap_or(0),
        ))
    }

    // ===== Write Operations (require coordinator account) =====

    /// Start a rental on-chain
    pub async fn start_rental(
        &self,
        rental_id: Felt,
        tenant: Felt,
        validator: Felt,
        rate_per_hour: u128,
        initial_hours: u64,
    ) -> Result<Felt, EscrowClientError> {
        let account = self.account.as_ref()
            .ok_or(EscrowClientError::NoAccount)?;

        let (rate_low, rate_high) = u128_to_felt_pair(rate_per_hour);

        let call = Call {
            to: self.config.contract_address,
            selector: self.selectors.start_rental,
            calldata: vec![
                rental_id,
                tenant,
                validator,
                rate_low,
                rate_high,
                Felt::from(initial_hours),
            ],
        };

        let result = account.execute(vec![call])
            .send()
            .await
            .map_err(|e| EscrowClientError::TransactionFailed(e.to_string()))?;

        info!(
            rental_id = %rental_id,
            tx_hash = %result.transaction_hash,
            "Started rental on-chain"
        );

        Ok(result.transaction_hash)
    }

    /// Charge a rental on-chain
    pub async fn charge_rental(
        &self,
        rental_id: Felt,
        hours: u64,
    ) -> Result<Felt, EscrowClientError> {
        let account = self.account.as_ref()
            .ok_or(EscrowClientError::NoAccount)?;

        let call = Call {
            to: self.config.contract_address,
            selector: self.selectors.charge_rental,
            calldata: vec![
                rental_id,
                Felt::from(hours),
            ],
        };

        let result = account.execute(vec![call])
            .send()
            .await
            .map_err(|e| EscrowClientError::TransactionFailed(e.to_string()))?;

        debug!(
            rental_id = %rental_id,
            hours = hours,
            tx_hash = %result.transaction_hash,
            "Charged rental on-chain"
        );

        Ok(result.transaction_hash)
    }

    /// Stop a rental on-chain
    pub async fn stop_rental(&self, rental_id: Felt) -> Result<Felt, EscrowClientError> {
        let account = self.account.as_ref()
            .ok_or(EscrowClientError::NoAccount)?;

        let call = Call {
            to: self.config.contract_address,
            selector: self.selectors.stop_rental,
            calldata: vec![rental_id],
        };

        let result = account.execute(vec![call])
            .send()
            .await
            .map_err(|e| EscrowClientError::TransactionFailed(e.to_string()))?;

        info!(
            rental_id = %rental_id,
            tx_hash = %result.transaction_hash,
            "Stopped rental on-chain"
        );

        Ok(result.transaction_hash)
    }

    /// Extend a rental on-chain
    pub async fn extend_rental(
        &self,
        rental_id: Felt,
        additional_hours: u64,
    ) -> Result<Felt, EscrowClientError> {
        let account = self.account.as_ref()
            .ok_or(EscrowClientError::NoAccount)?;

        let call = Call {
            to: self.config.contract_address,
            selector: self.selectors.extend_rental,
            calldata: vec![
                rental_id,
                Felt::from(additional_hours),
            ],
        };

        let result = account.execute(vec![call])
            .send()
            .await
            .map_err(|e| EscrowClientError::TransactionFailed(e.to_string()))?;

        info!(
            rental_id = %rental_id,
            additional_hours = additional_hours,
            tx_hash = %result.transaction_hash,
            "Extended rental on-chain"
        );

        Ok(result.transaction_hash)
    }

    /// Submit proof verification to the on-chain verifier contract
    ///
    /// Calls the STWO verifier contract to verify a completed proof.
    /// The verifier address and calldata are provided by the caller.
    pub async fn submit_proof_verification(
        &self,
        verifier_address: &str,
        proof: &crate::prover::ProofResult,
        calldata: &[String],
    ) -> Result<String, EscrowClientError> {
        let account = self.account.as_ref()
            .ok_or(EscrowClientError::NoAccount)?;

        let verifier_felt = FieldElement::from_hex_be(verifier_address)
            .map_err(|e| EscrowClientError::InvalidAddress(format!("Verifier address {}: {}", verifier_address, e)))?;

        // Build calldata: commitment, FRI layer commitments, public inputs
        let mut call_data = Vec::new();

        // Add the proof commitment
        let commitment_felt = FieldElement::from_hex_be(&proof.proof.commitment)
            .unwrap_or(FieldElement::ZERO);
        call_data.push(commitment_felt);

        // Add FRI layer commitments count + data
        call_data.push(Felt::from(proof.proof.fri.layer_commitments.len() as u64));
        for lc in &proof.proof.fri.layer_commitments {
            call_data.push(FieldElement::from_hex_be(lc).unwrap_or(FieldElement::ZERO));
        }

        // Add public inputs count + data
        call_data.push(Felt::from(proof.proof.public_inputs.len() as u64));
        for pi in &proof.proof.public_inputs {
            call_data.push(FieldElement::from_hex_be(pi).unwrap_or(FieldElement::ZERO));
        }

        // Add any extra calldata from the request
        for cd in calldata {
            call_data.push(FieldElement::from_hex_be(cd).unwrap_or(FieldElement::ZERO));
        }

        // Use "verify_proof" selector
        let verify_selector = Self::get_selector_static("verify_proof")
            .map_err(|e| EscrowClientError::Configuration(format!("Failed to compute selector: {}", e)))?;

        let call = Call {
            to: verifier_felt,
            selector: verify_selector,
            calldata: call_data,
        };

        let result = account.execute(vec![call])
            .send()
            .await
            .map_err(|e| EscrowClientError::TransactionFailed(e.to_string()))?;

        let tx_hash = format!("0x{:x}", result.transaction_hash);

        info!(
            proof_id = %proof.id,
            verifier = %verifier_address,
            tx_hash = %tx_hash,
            "Proof verification submitted on-chain"
        );

        Ok(tx_hash)
    }

    /// Compute a selector from a function name (static version)
    fn get_selector_static(name: &str) -> Result<Felt, String> {
        use starknet::core::utils::get_selector_from_name;
        get_selector_from_name(name).map_err(|e| format!("Selector error for '{}': {}", name, e))
    }

    /// Convert a UUID to a Felt (rental_id)
    pub fn uuid_to_felt(id: Uuid) -> Felt {
        let bytes = id.as_bytes();
        FieldElement::from_byte_slice_be(bytes).unwrap_or(FieldElement::ZERO)
    }

    /// Convert a hex string address to Felt
    pub fn address_to_felt(address: &str) -> Result<Felt, EscrowClientError> {
        FieldElement::from_hex_be(address)
            .map_err(|e| EscrowClientError::InvalidAddress(format!("{}: {}", address, e)))
    }

    /// Get the contract address
    pub fn contract_address(&self) -> Felt {
        self.config.contract_address
    }

    /// Check if account is configured for write operations
    pub fn has_account(&self) -> bool {
        self.account.is_some()
    }

    /// Get the provider for direct RPC access
    pub fn provider(&self) -> &JsonRpcClient<HttpTransport> {
        &self.provider
    }

    /// Get transaction receipt
    pub async fn get_transaction_receipt(&self, tx_hash: Felt) -> Result<MaybePendingTransactionReceipt, EscrowClientError> {
        self.provider
            .get_transaction_receipt(tx_hash)
            .await
            .map_err(|e| EscrowClientError::RpcError(format!("Failed to get receipt: {}", e)))
    }

    /// Verify a deposit transaction
    ///
    /// Checks that:
    /// 1. Transaction succeeded
    /// 2. Emitted a Deposited event from the escrow contract
    /// 3. Event matches the expected user and amount
    pub async fn verify_deposit(
        &self,
        tx_hash: &str,
        expected_user: Felt,
        expected_amount: u128,
    ) -> Result<VerifiedDeposit, EscrowClientError> {
        let tx_felt = Felt::from_hex_be(tx_hash)
            .map_err(|e| EscrowClientError::InvalidAddress(format!("Invalid tx hash: {}", e)))?;

        let maybe_receipt = self.get_transaction_receipt(tx_felt).await?;

        // Extract receipt from MaybePending wrapper
        let (execution_result, events) = match &maybe_receipt {
            MaybePendingTransactionReceipt::Receipt(receipt) => {
                use starknet::core::types::TransactionReceipt;
                match receipt {
                    TransactionReceipt::Invoke(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::Declare(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::Deploy(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::DeployAccount(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::L1Handler(r) => (&r.execution_result, &r.events),
                }
            }
            MaybePendingTransactionReceipt::PendingReceipt(pending) => {
                use starknet::core::types::PendingTransactionReceipt;
                match pending {
                    PendingTransactionReceipt::Invoke(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::Declare(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::DeployAccount(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::L1Handler(r) => (&r.execution_result, &r.events),
                }
            }
        };

        match execution_result {
            ExecutionResult::Reverted { reason } => {
                return Err(EscrowClientError::TransactionFailed(
                    format!("Transaction reverted: {}", reason)
                ));
            }
            ExecutionResult::Succeeded => {}
        }

        // Deposited event selector = sn_keccak("Deposited")
        // The event has: user (key), amount (data), new_balance (data)
        let deposited_selector = self.selectors.deposited_event;

        for event in events {
            // Check if event is from our escrow contract
            if event.from_address != self.config.contract_address {
                continue;
            }

            // Check if this is a Deposited event (first key is the selector)
            if event.keys.is_empty() || event.keys[0] != deposited_selector {
                continue;
            }

            // Parse the event:
            // keys: [selector, user]
            // data: [amount_low, amount_high, new_balance_low, new_balance_high]
            if event.keys.len() < 2 || event.data.len() < 4 {
                continue;
            }

            let user = event.keys[1];
            let amount = felt_pair_to_u128(&event.data[0], &event.data[1]);
            let new_balance = felt_pair_to_u128(&event.data[2], &event.data[3]);

            // Verify the user matches
            if user != expected_user {
                debug!(
                    found_user = %user,
                    expected = %expected_user,
                    "Deposit event user mismatch"
                );
                continue;
            }

            // Verify the amount matches (with 1% tolerance for gas)
            let min_amount = expected_amount.saturating_sub(expected_amount / 100);
            if amount < min_amount {
                return Err(EscrowClientError::InvalidResponse(format!(
                    "Deposit amount mismatch: expected {}, found {}",
                    expected_amount, amount
                )));
            }

            info!(
                tx_hash = %tx_hash,
                user = %user,
                amount = amount,
                new_balance = new_balance,
                "Deposit verified on-chain"
            );

            return Ok(VerifiedDeposit {
                tx_hash: tx_hash.to_string(),
                user,
                amount,
                new_balance,
            });
        }

        Err(EscrowClientError::InvalidResponse(
            "No matching Deposited event found in transaction".to_string()
        ))
    }

    /// Verify a withdrawal transaction (EarningsWithdrawn event)
    pub async fn verify_withdrawal(
        &self,
        tx_hash: &str,
        expected_validator: Felt,
    ) -> Result<VerifiedWithdrawal, EscrowClientError> {
        let tx_felt = Felt::from_hex_be(tx_hash)
            .map_err(|e| EscrowClientError::InvalidAddress(format!("Invalid tx hash: {}", e)))?;

        let maybe_receipt = self.get_transaction_receipt(tx_felt).await?;

        // Extract receipt from MaybePending wrapper
        let (execution_result, events) = match &maybe_receipt {
            MaybePendingTransactionReceipt::Receipt(receipt) => {
                use starknet::core::types::TransactionReceipt;
                match receipt {
                    TransactionReceipt::Invoke(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::Declare(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::Deploy(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::DeployAccount(r) => (&r.execution_result, &r.events),
                    TransactionReceipt::L1Handler(r) => (&r.execution_result, &r.events),
                }
            }
            MaybePendingTransactionReceipt::PendingReceipt(pending) => {
                use starknet::core::types::PendingTransactionReceipt;
                match pending {
                    PendingTransactionReceipt::Invoke(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::Declare(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::DeployAccount(r) => (&r.execution_result, &r.events),
                    PendingTransactionReceipt::L1Handler(r) => (&r.execution_result, &r.events),
                }
            }
        };

        match execution_result {
            ExecutionResult::Reverted { reason } => {
                return Err(EscrowClientError::TransactionFailed(
                    format!("Transaction reverted: {}", reason)
                ));
            }
            ExecutionResult::Succeeded => {}
        }

        let withdrawn_selector = self.selectors.earnings_withdrawn_event;

        for event in events {
            if event.from_address != self.config.contract_address {
                continue;
            }

            if event.keys.is_empty() || event.keys[0] != withdrawn_selector {
                continue;
            }

            // keys: [selector, validator]
            // data: [amount_low, amount_high, remaining_low, remaining_high]
            if event.keys.len() < 2 || event.data.len() < 4 {
                continue;
            }

            let validator = event.keys[1];
            let amount = felt_pair_to_u128(&event.data[0], &event.data[1]);
            let remaining = felt_pair_to_u128(&event.data[2], &event.data[3]);

            if validator != expected_validator {
                continue;
            }

            info!(
                tx_hash = %tx_hash,
                validator = %validator,
                amount = amount,
                remaining = remaining,
                "Withdrawal verified on-chain"
            );

            return Ok(VerifiedWithdrawal {
                tx_hash: tx_hash.to_string(),
                validator,
                amount,
                remaining,
            });
        }

        Err(EscrowClientError::InvalidResponse(
            "No matching EarningsWithdrawn event found".to_string()
        ))
    }
}

/// Verified deposit information
#[derive(Debug, Clone)]
pub struct VerifiedDeposit {
    pub tx_hash: String,
    pub user: Felt,
    pub amount: u128,
    pub new_balance: u128,
}

/// Verified withdrawal information
#[derive(Debug, Clone)]
pub struct VerifiedWithdrawal {
    pub tx_hash: String,
    pub validator: Felt,
    pub amount: u128,
    pub remaining: u128,
}

/// Convert two Felts (low, high) to u128
fn felt_pair_to_u128(low: &Felt, high: &Felt) -> u128 {
    let low_bytes = low.to_bytes_be();
    let high_bytes = high.to_bytes_be();

    // Take last 16 bytes for u128
    let mut result_bytes = [0u8; 16];
    result_bytes[..8].copy_from_slice(&high_bytes[24..32]);
    result_bytes[8..].copy_from_slice(&low_bytes[24..32]);

    u128::from_be_bytes(result_bytes)
}

/// Convert u128 to two Felts (low, high)
fn u128_to_felt_pair(value: u128) -> (Felt, Felt) {
    let low = Felt::from(value as u64);
    let high = Felt::from((value >> 64) as u64);
    (low, high)
}

/// Escrow client errors
#[derive(Debug, thiserror::Error)]
pub enum EscrowClientError {
    #[error("Configuration error: {0}")]
    Configuration(String),

    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("No account configured for write operations")]
    NoAccount,

    #[error("Transaction failed: {0}")]
    TransactionFailed(String),

    #[error("Invalid address: {0}")]
    InvalidAddress(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u128_conversion() {
        let value: u128 = 1_000_000_000_000_000_000; // 1e18
        let (low, high) = u128_to_felt_pair(value);
        let result = felt_pair_to_u128(&low, &high);
        assert_eq!(value, result);
    }

    #[test]
    fn test_uuid_to_felt() {
        let id = Uuid::new_v4();
        let felt = EscrowClient::uuid_to_felt(id);
        assert_ne!(felt, Felt::ZERO);
    }
}
