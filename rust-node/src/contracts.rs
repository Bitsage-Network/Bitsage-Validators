//! Centralized Contract Addresses
//!
//! All deployed contract addresses for BitSage on Starknet Sepolia.
//! These can be overridden via environment variables.

use std::env;

/// Contract addresses for the BitSage protocol on Starknet Sepolia
#[derive(Debug, Clone)]
pub struct ContractAddresses {
    // Core tokens
    pub sage_token: String,

    // Rental & Billing
    pub rental_escrow: String,
    pub metered_billing: String,
    pub fee_manager: String,

    // Staking & Registry
    pub prover_staking: String,
    pub worker_staking: String,
    pub validator_registry: String,
    pub obelysk_prover_registry: String,

    // Privacy
    pub privacy_router: String,
    pub privacy_pools: String,
    pub confidential_swap: String,
    pub mixing_router: String,
    pub steganographic_router: String,

    // Verification
    pub stwo_verifier: String,
    pub proof_verifier: String,
    pub fraud_proof: String,
    pub optimistic_tee: String,

    // Payments
    pub payment_router: String,
    pub proof_gated_payment: String,
    pub escrow: String,
    pub collateral: String,

    // Jobs & Compute
    pub job_manager: String,
    pub cdc_pool: String,

    // Governance & Treasury
    pub governance_treasury: String,
    pub treasury_timelock: String,
    pub burn_manager: String,

    // Vesting
    pub reward_vesting: String,
    pub linear_vesting: String,
    pub milestone_vesting: String,

    // Misc
    pub faucet: String,
    pub reputation_manager: String,
    pub gamification: String,
    pub oracle_wrapper: String,
    pub dynamic_pricing: String,
    pub address_registry: String,
    pub referral_system: String,
    pub otc_orderbook: String,
    pub worker_privacy_helper: String,
}

impl ContractAddresses {
    /// Load contract addresses from environment or use Sepolia defaults
    pub fn load() -> Self {
        Self {
            // Core tokens
            sage_token: env::var("SAGE_TOKEN_CONTRACT")
                .unwrap_or_else(|_| "0x04321b7282ae6aa354988eed57f2ff851314af8524de8b1f681a128003cc4ea5".to_string()),

            // Rental & Billing
            rental_escrow: env::var("RENTAL_ESCROW_CONTRACT")
                .unwrap_or_else(|_| "0x02f667f323624695626dcffef7115abfc87f468d10166d6a8d1c5c7a9c7e9d63".to_string()),
            metered_billing: env::var("METERED_BILLING_CONTRACT")
                .unwrap_or_else(|_| "0x058b10cf0a1369fca1a90192d5b58a757a30a93af2ce5c3af0c16001fb57bb4b".to_string()),
            fee_manager: env::var("FEE_MANAGER_CONTRACT")
                .unwrap_or_else(|_| "0x0762a276d38f66b6fe8cf3eb140247624f02bb87e32917dffbad197c73f3fb56".to_string()),

            // Staking & Registry
            prover_staking: env::var("PROVER_STAKING_CONTRACT")
                .unwrap_or_else(|_| "0x0165fe12b09dd5e6b692cbf59f9c3ea0af30a2616f248c150357b07b967039da".to_string()),
            worker_staking: env::var("WORKER_STAKING_CONTRACT")
                .unwrap_or_else(|_| "0x064df40ab00145394de98676d0934e49c0f436c4589d4d35ffa720e45c3de7e7".to_string()),
            validator_registry: env::var("VALIDATOR_REGISTRY_CONTRACT")
                .unwrap_or_else(|_| "0x0252d13615dd74b70c9d653250fe8baa66130f683783c542c582dbc9709ee2cd".to_string()),
            obelysk_prover_registry: env::var("OBELYSK_PROVER_REGISTRY_CONTRACT")
                .unwrap_or_else(|_| "0x005d46ac3e32242c2681a5171551abb773464812b77eec7e52d60ec612e9bf3a".to_string()),

            // Privacy
            privacy_router: env::var("PRIVACY_ROUTER_CONTRACT")
                .unwrap_or_else(|_| "0x0051e114ec3d524f203900c78e5217f23de51e29d6a6ecabb6dc92fb8ccca6e0".to_string()),
            privacy_pools: env::var("PRIVACY_POOLS_CONTRACT")
                .unwrap_or_else(|_| "0x3e6b8684b1b1d55b88bd917b08df820fa3f23c92e19bab168e569bda430ef73".to_string()),
            confidential_swap: env::var("CONFIDENTIAL_SWAP_CONTRACT")
                .unwrap_or_else(|_| "0xf4bfe6593c88fbbc95b30f32347a556db2c1be4a34982d8b3161f9e62a2ef1".to_string()),
            mixing_router: env::var("MIXING_ROUTER_CONTRACT")
                .unwrap_or_else(|_| "0x5de7b4706688b3c7245f855b37d305b7b055504fbc96502656f47eec25366c1".to_string()),
            steganographic_router: env::var("STEGANOGRAPHIC_ROUTER_CONTRACT")
                .unwrap_or_else(|_| "0x110e2ae805a49dc41b0e616c4c6a69de48287094a3798073a1247abd295684".to_string()),

            // Verification
            stwo_verifier: env::var("STWO_VERIFIER_CONTRACT")
                .unwrap_or_else(|_| "0x00555555e154e28a596a59f98f857ec85f6dc7038f8d18dd1a08364d8e76dd47".to_string()),
            proof_verifier: env::var("PROOF_VERIFIER_CONTRACT")
                .unwrap_or_else(|_| "0x06c27c897108f20afbd045e561e465e0843d85e84fe7dfd55f910ee75df6385a".to_string()),
            fraud_proof: env::var("FRAUD_PROOF_CONTRACT")
                .unwrap_or_else(|_| "0x0249179135c4d35f6a199de0fb91a1fbe29d5798e862bc14a108f1da8ec42acf".to_string()),
            optimistic_tee: env::var("OPTIMISTIC_TEE_CONTRACT")
                .unwrap_or_else(|_| "0x04ea542ccad82e75681f438e1667baaeaca5285791dc2449e0f9f3df3e998b49".to_string()),

            // Payments
            payment_router: env::var("PAYMENT_ROUTER_CONTRACT")
                .unwrap_or_else(|_| "0x006bfcc028c9976c18f8e22c2472df36d8d7848e7b55b814a5f15d339b97e1fe".to_string()),
            proof_gated_payment: env::var("PROOF_GATED_PAYMENT_CONTRACT")
                .unwrap_or_else(|_| "0x06f153aff8835202fb3183ddf2edde40b1ca0360cdf20611649f05a16ca04cc7".to_string()),
            escrow: env::var("ESCROW_CONTRACT")
                .unwrap_or_else(|_| "0x045aa77cfaf3a902d879f3a26165922a423f5902c9d1647dbfe0274328930d4f".to_string()),
            collateral: env::var("COLLATERAL_CONTRACT")
                .unwrap_or_else(|_| "0x01384e775b5b19bd8756d5a77c7d9e99a739b35523915a1ad0b4c3c4d0b00f7c".to_string()),

            // Jobs & Compute
            job_manager: env::var("JOB_MANAGER_CONTRACT")
                .unwrap_or_else(|_| "0x0534a8f5cc1399b368b5be211df25e370f4a74d3d5b2d040f9d5b69981b069ed".to_string()),
            cdc_pool: env::var("CDC_POOL_CONTRACT")
                .unwrap_or_else(|_| "0x012c8ab3fad97954eafbf99ab9d76a9c8e85dd0f6b38139d12d3c5e3f14f950b".to_string()),

            // Governance & Treasury
            governance_treasury: env::var("GOVERNANCE_TREASURY_CONTRACT")
                .unwrap_or_else(|_| "0x00f8718089716c532f084326a707678ae1b159386613e86ced48c53fa24c8a3b".to_string()),
            treasury_timelock: env::var("TREASURY_TIMELOCK_CONTRACT")
                .unwrap_or_else(|_| "0x03246a3d6f51c08033a7030f795088f84c67c5ed8f7790405a4e192f0c59ff79".to_string()),
            burn_manager: env::var("BURN_MANAGER_CONTRACT")
                .unwrap_or_else(|_| "0x04d11f83401087bc1813ae4f69ecb4e7c2477829b740d6a5ae900e9e81df1933".to_string()),

            // Vesting
            reward_vesting: env::var("REWARD_VESTING_CONTRACT")
                .unwrap_or_else(|_| "0x07bb26a7d6d97e8292af9bb14244afbaaf2d722140111b8cced185bbde1a026d".to_string()),
            linear_vesting: env::var("LINEAR_VESTING_CONTRACT")
                .unwrap_or_else(|_| "0x06df34218f99b8bd19b0cdec2fcef7ca7bc07218799aed0d72f2078b9a68e6ba".to_string()),
            milestone_vesting: env::var("MILESTONE_VESTING_CONTRACT")
                .unwrap_or_else(|_| "0x04ae08af901c3952bf97252ad888b9138c930da780a66ec3a87b192413e95dd5".to_string()),

            // Misc
            faucet: env::var("FAUCET_CONTRACT")
                .unwrap_or_else(|_| "0x07943ad334da99ab3dd138ff14d2045a7d962f1a426a4dd909fda026f37acf9f".to_string()),
            reputation_manager: env::var("REPUTATION_MANAGER_CONTRACT")
                .unwrap_or_else(|_| "0x019c05a8f648c835e66e98c700b628d14ed4249e5e60e32c7f779d38da90e9d9".to_string()),
            gamification: env::var("GAMIFICATION_CONTRACT")
                .unwrap_or_else(|_| "0x047402be0797cda868f2601f6234f56fa814e51957fa1981989ffcbf471e81e4".to_string()),
            oracle_wrapper: env::var("ORACLE_WRAPPER_CONTRACT")
                .unwrap_or_else(|_| "0x0020ba92a5df4c7719decbc8e43d5475059311b0b8bb2cdd623f5f29d61f0f2d".to_string()),
            dynamic_pricing: env::var("DYNAMIC_PRICING_CONTRACT")
                .unwrap_or_else(|_| "0x3f2893e9c9ed09cbfd007016291823ad2e48f82827f301295efa9b955346be7".to_string()),
            address_registry: env::var("ADDRESS_REGISTRY_CONTRACT")
                .unwrap_or_else(|_| "0x17bb7d13c3cc30318b71d5fdb74569439e963528bfdcf2564e7d31f86ce6dbe".to_string()),
            referral_system: env::var("REFERRAL_SYSTEM_CONTRACT")
                .unwrap_or_else(|_| "0xca4865931c8f9e31b4ad60fec050a6103d2029a719d438f1e2d00608596eb".to_string()),
            otc_orderbook: env::var("OTC_ORDERBOOK_CONTRACT")
                .unwrap_or_else(|_| "0x7dc7794611840bf2682ac9fedbc9e735297f49b3adecac75a912c8a6d058034".to_string()),
            worker_privacy_helper: env::var("WORKER_PRIVACY_HELPER_CONTRACT")
                .unwrap_or_else(|_| "0x06219e1e40b7a07c0a07fa38e4c19b661943d2f410839ddfe5e3bf7376206e47".to_string()),
        }
    }

    /// Get the explorer URL for a contract
    pub fn explorer_url(&self, address: &str) -> String {
        format!("https://sepolia.starkscan.co/contract/{}", address)
    }
}

impl Default for ContractAddresses {
    fn default() -> Self {
        Self::load()
    }
}

/// Global contract addresses singleton
static CONTRACTS: once_cell::sync::Lazy<ContractAddresses> =
    once_cell::sync::Lazy::new(ContractAddresses::load);

/// Get the global contract addresses
pub fn contracts() -> &'static ContractAddresses {
    &CONTRACTS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contract_addresses_load() {
        let contracts = ContractAddresses::load();
        assert!(!contracts.sage_token.is_empty());
        assert!(!contracts.rental_escrow.is_empty());
        assert!(!contracts.stwo_verifier.is_empty());
    }

    #[test]
    fn test_explorer_url() {
        let contracts = ContractAddresses::load();
        let url = contracts.explorer_url(&contracts.sage_token);
        assert!(url.contains("sepolia.starkscan.co"));
    }
}
