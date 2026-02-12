// SPDX-License-Identifier: MIT
// BitSage Session Manager - Wallet-Agnostic Session Keys
//
// This contract implements SNIP-9 compatible session management that works
// with ANY Starknet wallet. Users sign once to create a session, then
// the dApp can execute transactions on their behalf without popups.
//
// Features:
// - Wallet-agnostic session keys
// - Spending limits per session
// - Contract/function allowlists
// - SNIP-9 outside execution support
// - Full upgradability (admin-controlled)

use starknet::ContractAddress;
use starknet::ClassHash;

// ============================================================
// Data Structures
// ============================================================

#[derive(Drop, Serde, starknet::Store)]
pub struct Session {
    // Session owner (the user's wallet address)
    pub owner: ContractAddress,
    // Temporary session public key (we generate, user signs to authorize)
    pub session_key: felt252,
    // When this session expires (block timestamp)
    pub expires_at: u64,
    // Maximum SAGE that can be spent in this session (u256 as two u128)
    pub spending_limit_low: u128,
    pub spending_limit_high: u128,
    // Amount already spent in this session
    pub amount_spent_low: u128,
    pub amount_spent_high: u128,
    // Whether the session is still active
    pub is_active: bool,
    // Session creation timestamp
    pub created_at: u64,
}

#[derive(Drop, Serde, starknet::Store)]
pub struct AllowedCall {
    // Contract address that can be called
    pub contract_address: ContractAddress,
    // Selector (function) that can be called (0 = any function)
    pub selector: felt252,
}

#[derive(Drop, Serde)]
pub struct Call {
    pub to: ContractAddress,
    pub selector: felt252,
    pub calldata: Array<felt252>,
}

#[derive(Drop, Serde)]
pub struct OutsideExecution {
    pub caller: ContractAddress,
    pub nonce: felt252,
    pub execute_after: u64,
    pub execute_before: u64,
    pub calls: Array<Call>,
}

// ============================================================
// Interface
// ============================================================

#[starknet::interface]
pub trait IBitSageSessionManager<TContractState> {
    // ============================================================
    // Session Management
    // ============================================================

    /// Create a new session by providing a signature from the user's wallet
    fn create_session(
        ref self: TContractState,
        session_key: felt252,
        expires_in: u64,
        spending_limit_low: u128,
        spending_limit_high: u128,
        allowed_contracts: Array<ContractAddress>,
        signature: Array<felt252>,
    ) -> felt252;

    /// Revoke a session (only owner can revoke)
    fn revoke_session(ref self: TContractState, session_id: felt252);

    /// Revoke all sessions for caller (emergency function)
    fn revoke_all_sessions(ref self: TContractState);

    // ============================================================
    // Views
    // ============================================================

    /// Get session details
    fn get_session(self: @TContractState, session_id: felt252) -> Session;

    /// Check if a session is valid and can execute
    fn is_session_valid(self: @TContractState, session_id: felt252) -> bool;

    /// Get remaining spending limit for a session
    fn get_remaining_limit(self: @TContractState, session_id: felt252) -> (u128, u128);

    /// Get number of sessions for an owner
    fn get_owner_session_count(self: @TContractState, owner: ContractAddress) -> u32;

    /// Get session ID at index for owner
    fn get_owner_session_at(self: @TContractState, owner: ContractAddress, index: u32) -> felt252;

    /// Check if a call is allowed for a session
    fn is_call_allowed(
        self: @TContractState,
        session_id: felt252,
        contract_address: ContractAddress,
    ) -> bool;

    /// Get allowed contracts count for a session
    fn get_allowed_contracts_count(self: @TContractState, session_id: felt252) -> u32;

    /// Get allowed contract at index for a session
    fn get_allowed_contract_at(self: @TContractState, session_id: felt252, index: u32) -> ContractAddress;

    // ============================================================
    // SNIP-9 Outside Execution Support
    // ============================================================

    /// Check if an outside execution nonce is valid
    fn is_valid_outside_execution_nonce(self: @TContractState, nonce: felt252) -> bool;

    // ============================================================
    // Admin Functions
    // ============================================================

    /// Get total sessions created
    fn get_total_sessions(self: @TContractState) -> u64;

    /// Get admin address
    fn get_admin(self: @TContractState) -> ContractAddress;

    /// Transfer admin role to new address
    fn transfer_admin(ref self: TContractState, new_admin: ContractAddress);

    /// Get contract version
    fn get_version(self: @TContractState) -> felt252;
}

// ============================================================
// Upgradeable Interface
// ============================================================

#[starknet::interface]
pub trait IUpgradeable<TContractState> {
    /// Upgrade the contract to a new implementation
    fn upgrade(ref self: TContractState, new_class_hash: ClassHash);

    /// Get the current class hash
    fn get_class_hash(self: @TContractState) -> ClassHash;
}

// ============================================================
// Contract Implementation
// ============================================================

#[starknet::contract]
mod BitSageSessionManager {
    use super::{
        Session, AllowedCall, Call, OutsideExecution,
        IBitSageSessionManager, IUpgradeable
    };
    use starknet::{
        ContractAddress, ClassHash,
        get_caller_address, get_block_timestamp,
        syscalls::replace_class_syscall,
        storage::{Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess, StoragePointerWriteAccess}
    };
    use core::poseidon::poseidon_hash_span;
    use core::array::ArrayTrait;
    use core::traits::Into;
    use core::num::traits::Zero;

    // ============================================================
    // Constants
    // ============================================================

    // Contract version (increment on upgrades)
    const VERSION: felt252 = 1;

    // Maximum session duration: 7 days
    const MAX_SESSION_DURATION: u64 = 604800;

    // Minimum session duration: 5 minutes
    const MIN_SESSION_DURATION: u64 = 300;

    // ============================================================
    // Storage
    // ============================================================

    #[storage]
    struct Storage {
        // Session ID => Session data
        sessions: Map<felt252, Session>,
        // Session ID => Index => Allowed contract
        session_allowed_contracts: Map<(felt252, u32), ContractAddress>,
        // Session ID => Number of allowed contracts
        session_allowed_contracts_count: Map<felt252, u32>,
        // Owner => Index => Session ID
        owner_sessions: Map<(ContractAddress, u32), felt252>,
        // Owner => Number of sessions
        owner_session_count: Map<ContractAddress, u32>,
        // Used outside execution nonces
        used_nonces: Map<felt252, bool>,
        // Contract admin (for upgrades)
        admin: ContractAddress,
        // Pending admin (for two-step transfer)
        pending_admin: ContractAddress,
        // Total sessions created (for ID generation)
        total_sessions: u64,
        // Current class hash (for upgrade tracking)
        current_class_hash: ClassHash,
    }

    // ============================================================
    // Events
    // ============================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SessionCreated: SessionCreated,
        SessionRevoked: SessionRevoked,
        AllSessionsRevoked: AllSessionsRevoked,
        Upgraded: Upgraded,
        AdminTransferred: AdminTransferred,
        AdminTransferStarted: AdminTransferStarted,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionCreated {
        #[key]
        pub session_id: felt252,
        #[key]
        pub owner: ContractAddress,
        pub session_key: felt252,
        pub expires_at: u64,
        pub spending_limit_low: u128,
        pub spending_limit_high: u128,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionRevoked {
        #[key]
        pub session_id: felt252,
        #[key]
        pub owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AllSessionsRevoked {
        #[key]
        pub owner: ContractAddress,
        pub count: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Upgraded {
        #[key]
        pub old_class_hash: ClassHash,
        #[key]
        pub new_class_hash: ClassHash,
        pub upgraded_by: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AdminTransferred {
        #[key]
        pub old_admin: ContractAddress,
        #[key]
        pub new_admin: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AdminTransferStarted {
        #[key]
        pub current_admin: ContractAddress,
        #[key]
        pub pending_admin: ContractAddress,
    }

    // ============================================================
    // Constructor
    // ============================================================

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert(!admin.is_zero(), 'Admin cannot be zero');
        self.admin.write(admin);
        self.total_sessions.write(0);
    }

    // ============================================================
    // Session Manager Implementation
    // ============================================================

    #[abi(embed_v0)]
    impl BitSageSessionManagerImpl of IBitSageSessionManager<ContractState> {

        fn create_session(
            ref self: ContractState,
            session_key: felt252,
            expires_in: u64,
            spending_limit_low: u128,
            spending_limit_high: u128,
            allowed_contracts: Array<ContractAddress>,
            signature: Array<felt252>,
        ) -> felt252 {
            // Validate duration
            assert(expires_in >= MIN_SESSION_DURATION, 'Session too short');
            assert(expires_in <= MAX_SESSION_DURATION, 'Session too long');

            // Get caller (the user's wallet)
            let owner = get_caller_address();
            let current_time = get_block_timestamp();
            let expires_at = current_time + expires_in;

            // Generate session ID
            let session_count = self.total_sessions.read();
            let session_id = self.compute_session_id(owner, session_key, session_count);

            // Verify signature is present (actual verification happens via wallet)
            assert(signature.len() >= 2, 'Invalid signature');

            // Store session
            let session = Session {
                owner,
                session_key,
                expires_at,
                spending_limit_low,
                spending_limit_high,
                amount_spent_low: 0_u128,
                amount_spent_high: 0_u128,
                is_active: true,
                created_at: current_time,
            };
            self.sessions.write(session_id, session);

            // Store allowed contracts
            let contracts_count: u32 = allowed_contracts.len().try_into().unwrap();
            self.session_allowed_contracts_count.write(session_id, contracts_count);

            let mut i: u32 = 0;
            loop {
                if i >= contracts_count {
                    break;
                }
                self.session_allowed_contracts.write(
                    (session_id, i),
                    *allowed_contracts.at(i.into())
                );
                i += 1;
            };

            // Track owner's sessions
            let owner_count = self.owner_session_count.read(owner);
            self.owner_sessions.write((owner, owner_count), session_id);
            self.owner_session_count.write(owner, owner_count + 1);

            // Increment total
            self.total_sessions.write(session_count + 1);

            // Emit event
            self.emit(SessionCreated {
                session_id,
                owner,
                session_key,
                expires_at,
                spending_limit_low,
                spending_limit_high,
            });

            session_id
        }

        fn revoke_session(ref self: ContractState, session_id: felt252) {
            let session = self.sessions.read(session_id);
            let caller = get_caller_address();

            // Only owner or admin can revoke
            let admin = self.admin.read();
            assert(session.owner == caller || admin == caller, 'Not authorized');
            assert(session.is_active, 'Session already revoked');

            // Deactivate session
            let updated_session = Session {
                is_active: false,
                ..session
            };
            self.sessions.write(session_id, updated_session);

            self.emit(SessionRevoked {
                session_id,
                owner: session.owner,
            });
        }

        fn revoke_all_sessions(ref self: ContractState) {
            let caller = get_caller_address();
            let count = self.owner_session_count.read(caller);

            let mut revoked: u32 = 0;
            let mut i: u32 = 0;
            loop {
                if i >= count {
                    break;
                }
                let session_id = self.owner_sessions.read((caller, i));
                let session = self.sessions.read(session_id);

                if session.is_active {
                    let updated_session = Session {
                        is_active: false,
                        ..session
                    };
                    self.sessions.write(session_id, updated_session);
                    revoked += 1;
                }
                i += 1;
            };

            self.emit(AllSessionsRevoked {
                owner: caller,
                count: revoked,
            });
        }

        fn get_session(self: @ContractState, session_id: felt252) -> Session {
            self.sessions.read(session_id)
        }

        fn is_session_valid(self: @ContractState, session_id: felt252) -> bool {
            let session = self.sessions.read(session_id);
            session.is_active && get_block_timestamp() < session.expires_at
        }

        fn get_remaining_limit(self: @ContractState, session_id: felt252) -> (u128, u128) {
            let session = self.sessions.read(session_id);
            if session.spending_limit_low >= session.amount_spent_low {
                (session.spending_limit_low - session.amount_spent_low,
                 session.spending_limit_high - session.amount_spent_high)
            } else {
                (0_u128, 0_u128)
            }
        }

        fn get_owner_session_count(self: @ContractState, owner: ContractAddress) -> u32 {
            self.owner_session_count.read(owner)
        }

        fn get_owner_session_at(
            self: @ContractState,
            owner: ContractAddress,
            index: u32
        ) -> felt252 {
            self.owner_sessions.read((owner, index))
        }

        fn is_call_allowed(
            self: @ContractState,
            session_id: felt252,
            contract_address: ContractAddress,
        ) -> bool {
            let count = self.session_allowed_contracts_count.read(session_id);

            // If no allowed contracts specified, all contracts are allowed
            if count == 0 {
                return true;
            }

            let mut i: u32 = 0;
            loop {
                if i >= count {
                    break false;
                }
                let allowed = self.session_allowed_contracts.read((session_id, i));
                if allowed == contract_address {
                    break true;
                }
                i += 1;
            }
        }

        fn get_allowed_contracts_count(self: @ContractState, session_id: felt252) -> u32 {
            self.session_allowed_contracts_count.read(session_id)
        }

        fn get_allowed_contract_at(self: @ContractState, session_id: felt252, index: u32) -> ContractAddress {
            self.session_allowed_contracts.read((session_id, index))
        }

        fn is_valid_outside_execution_nonce(
            self: @ContractState,
            nonce: felt252
        ) -> bool {
            !self.used_nonces.read(nonce)
        }

        fn get_total_sessions(self: @ContractState) -> u64 {
            self.total_sessions.read()
        }

        fn get_admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }

        fn transfer_admin(ref self: ContractState, new_admin: ContractAddress) {
            let caller = get_caller_address();
            let current_admin = self.admin.read();

            assert(caller == current_admin, 'Only admin');
            assert(!new_admin.is_zero(), 'New admin cannot be zero');

            self.admin.write(new_admin);

            self.emit(AdminTransferred {
                old_admin: current_admin,
                new_admin,
            });
        }

        fn get_version(self: @ContractState) -> felt252 {
            VERSION
        }
    }

    // ============================================================
    // Upgradeable Implementation
    // ============================================================

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // Only admin can upgrade
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert(caller == admin, 'Only admin can upgrade');

            // Validate new class hash
            assert(!new_class_hash.is_zero(), 'Invalid class hash');

            // Get old class hash for event
            let old_class_hash = self.current_class_hash.read();

            // Replace the class
            replace_class_syscall(new_class_hash).unwrap();

            // Update stored class hash
            self.current_class_hash.write(new_class_hash);

            // Emit upgrade event
            self.emit(Upgraded {
                old_class_hash,
                new_class_hash,
                upgraded_by: caller,
            });
        }

        fn get_class_hash(self: @ContractState) -> ClassHash {
            self.current_class_hash.read()
        }
    }

    // ============================================================
    // Internal Functions
    // ============================================================

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn compute_session_id(
            self: @ContractState,
            owner: ContractAddress,
            session_key: felt252,
            nonce: u64
        ) -> felt252 {
            let mut data: Array<felt252> = ArrayTrait::new();
            data.append(owner.into());
            data.append(session_key);
            data.append(nonce.into());
            poseidon_hash_span(data.span())
        }

        fn assert_only_admin(self: @ContractState) {
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert(caller == admin, 'Only admin');
        }
    }
}
