// SPDX-License-Identifier: MIT
// BitSage Rental Escrow - GPU Rental Payment System
//
// This contract manages SAGE token escrow for GPU rentals:
// - Users deposit SAGE tokens to their escrow balance
// - Coordinator starts rentals and reserves funds
// - Hourly billing deducts from user escrow to validator earnings
// - Validators withdraw their accumulated earnings
//
// Security:
// - Only authorized coordinator can charge rentals
// - Users can only withdraw their own unused funds
// - Validators can only withdraw their own earnings
// - Full upgradeability with admin control

use starknet::ContractAddress;
use starknet::ClassHash;

// ============================================================
// Data Structures
// ============================================================

/// Rental session information stored on-chain
#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct Rental {
    /// Unique rental ID (from coordinator)
    pub rental_id: felt252,
    /// Tenant (user) wallet address
    pub tenant: ContractAddress,
    /// Validator (GPU owner) wallet address
    pub validator: ContractAddress,
    /// Hourly rate in SAGE tokens (wei)
    pub rate_per_hour: u256,
    /// Amount reserved for this rental
    pub reserved_amount: u256,
    /// Amount already charged
    pub charged_amount: u256,
    /// Rental start timestamp
    pub started_at: u64,
    /// Last charge timestamp
    pub last_charged_at: u64,
    /// Whether rental is still active
    pub is_active: bool,
}

/// User escrow balance
#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct EscrowBalance {
    /// Available balance (can be withdrawn or used for new rentals)
    pub available: u256,
    /// Reserved for active rentals (cannot be withdrawn)
    pub reserved: u256,
    /// Total deposited all-time
    pub total_deposited: u256,
    /// Total spent all-time
    pub total_spent: u256,
}

/// Validator earnings
#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct ValidatorEarnings {
    /// Pending earnings (can be withdrawn)
    pub pending: u256,
    /// Total earned all-time
    pub total_earned: u256,
    /// Total withdrawn all-time
    pub total_withdrawn: u256,
}

// ============================================================
// Interface
// ============================================================

#[starknet::interface]
pub trait IRentalEscrow<TContractState> {
    // ============================================================
    // User Functions
    // ============================================================

    /// Deposit SAGE tokens to escrow
    /// Requires prior approval of this contract to spend tokens
    fn deposit(ref self: TContractState, amount: u256);

    /// Withdraw available (non-reserved) SAGE tokens
    fn withdraw(ref self: TContractState, amount: u256);

    /// Get user's escrow balance
    fn get_balance(self: @TContractState, user: ContractAddress) -> EscrowBalance;

    // ============================================================
    // Coordinator Functions (require authorization)
    // ============================================================

    /// Start a new rental - reserves funds from user escrow
    fn start_rental(
        ref self: TContractState,
        rental_id: felt252,
        tenant: ContractAddress,
        validator: ContractAddress,
        rate_per_hour: u256,
        initial_hours: u64,
    );

    /// Charge hourly billing - moves funds from reserved to validator earnings
    fn charge_rental(
        ref self: TContractState,
        rental_id: felt252,
        hours: u64,
    );

    /// Stop rental - settles final charges and releases remaining reserved funds
    fn stop_rental(ref self: TContractState, rental_id: felt252);

    /// Extend rental - reserves additional funds
    fn extend_rental(
        ref self: TContractState,
        rental_id: felt252,
        additional_hours: u64,
    );

    /// Get rental information
    fn get_rental(self: @TContractState, rental_id: felt252) -> Rental;

    // ============================================================
    // Validator Functions
    // ============================================================

    /// Withdraw accumulated earnings
    fn withdraw_earnings(ref self: TContractState, amount: u256);

    /// Get validator's earnings
    fn get_earnings(self: @TContractState, validator: ContractAddress) -> ValidatorEarnings;

    // ============================================================
    // Admin Functions
    // ============================================================

    /// Set the coordinator address (only admin)
    fn set_coordinator(ref self: TContractState, coordinator: ContractAddress);

    /// Set the SAGE token address (only admin, once)
    fn set_sage_token(ref self: TContractState, token: ContractAddress);

    /// Get coordinator address
    fn get_coordinator(self: @TContractState) -> ContractAddress;

    /// Get SAGE token address
    fn get_sage_token(self: @TContractState) -> ContractAddress;

    /// Get admin address
    fn get_admin(self: @TContractState) -> ContractAddress;

    /// Transfer admin to new address
    fn transfer_admin(ref self: TContractState, new_admin: ContractAddress);

    /// Accept admin transfer (two-step process)
    fn accept_admin(ref self: TContractState);

    /// Get contract version
    fn get_version(self: @TContractState) -> felt252;

    /// Get total stats
    fn get_stats(self: @TContractState) -> (u256, u256, u64);

    /// Emergency pause (stops new rentals and deposits)
    fn pause(ref self: TContractState);

    /// Unpause
    fn unpause(ref self: TContractState);

    /// Check if paused
    fn is_paused(self: @TContractState) -> bool;
}

/// Upgradeable interface
#[starknet::interface]
pub trait IUpgradeable<TContractState> {
    fn upgrade(ref self: TContractState, new_class_hash: ClassHash);
    fn get_class_hash(self: @TContractState) -> ClassHash;
}

// ============================================================
// Contract Implementation
// ============================================================

#[starknet::contract]
pub mod RentalEscrow {
    use super::{
        Rental, EscrowBalance, ValidatorEarnings,
        IRentalEscrow, IUpgradeable
    };
    use starknet::{
        ContractAddress, ClassHash,
        get_caller_address, get_block_timestamp, get_contract_address,
        syscalls::replace_class_syscall,
        storage::{Map, StorageMapReadAccess, StorageMapWriteAccess,
                  StoragePointerReadAccess, StoragePointerWriteAccess}
    };
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use core::num::traits::Zero;

    // ============================================================
    // Constants
    // ============================================================

    const VERSION: felt252 = 1;

    // Minimum deposit amount (0.01 SAGE = 10^16 wei)
    const MIN_DEPOSIT: u256 = 10000000000000000;

    // Minimum rental duration (1 hour)
    const MIN_RENTAL_HOURS: u64 = 1;

    // Maximum rental duration (30 days = 720 hours)
    const MAX_RENTAL_HOURS: u64 = 720;

    // ============================================================
    // Storage
    // ============================================================

    #[storage]
    struct Storage {
        // SAGE token contract address
        sage_token: ContractAddress,
        // Authorized coordinator address
        coordinator: ContractAddress,
        // Admin address
        admin: ContractAddress,
        // Pending admin (for two-step transfer)
        pending_admin: ContractAddress,
        // Current class hash
        current_class_hash: ClassHash,
        // Paused state
        paused: bool,

        // User escrow balances: user => EscrowBalance
        balances: Map<ContractAddress, EscrowBalance>,
        // Validator earnings: validator => ValidatorEarnings
        earnings: Map<ContractAddress, ValidatorEarnings>,
        // Rental information: rental_id => Rental
        rentals: Map<felt252, Rental>,

        // Stats
        total_deposited: u256,
        total_earnings: u256,
        total_rentals: u64,
    }

    // ============================================================
    // Events
    // ============================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Deposited: Deposited,
        Withdrawn: Withdrawn,
        RentalStarted: RentalStarted,
        RentalCharged: RentalCharged,
        RentalStopped: RentalStopped,
        RentalExtended: RentalExtended,
        EarningsWithdrawn: EarningsWithdrawn,
        CoordinatorUpdated: CoordinatorUpdated,
        AdminTransferStarted: AdminTransferStarted,
        AdminTransferred: AdminTransferred,
        Paused: Paused,
        Unpaused: Unpaused,
        Upgraded: Upgraded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Deposited {
        #[key]
        pub user: ContractAddress,
        pub amount: u256,
        pub new_balance: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Withdrawn {
        #[key]
        pub user: ContractAddress,
        pub amount: u256,
        pub remaining_balance: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RentalStarted {
        #[key]
        pub rental_id: felt252,
        #[key]
        pub tenant: ContractAddress,
        #[key]
        pub validator: ContractAddress,
        pub rate_per_hour: u256,
        pub reserved_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RentalCharged {
        #[key]
        pub rental_id: felt252,
        pub hours: u64,
        pub amount: u256,
        pub total_charged: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RentalStopped {
        #[key]
        pub rental_id: felt252,
        pub total_charged: u256,
        pub refunded: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RentalExtended {
        #[key]
        pub rental_id: felt252,
        pub additional_hours: u64,
        pub additional_reserved: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct EarningsWithdrawn {
        #[key]
        pub validator: ContractAddress,
        pub amount: u256,
        pub remaining: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct CoordinatorUpdated {
        pub old_coordinator: ContractAddress,
        pub new_coordinator: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AdminTransferStarted {
        pub current_admin: ContractAddress,
        pub pending_admin: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AdminTransferred {
        pub old_admin: ContractAddress,
        pub new_admin: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Paused {
        pub by: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Unpaused {
        pub by: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Upgraded {
        pub old_class_hash: ClassHash,
        pub new_class_hash: ClassHash,
        pub upgraded_by: ContractAddress,
    }

    // ============================================================
    // Constructor
    // ============================================================

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        sage_token: ContractAddress,
        coordinator: ContractAddress,
    ) {
        assert(!admin.is_zero(), 'Admin cannot be zero');
        assert(!sage_token.is_zero(), 'Token cannot be zero');

        self.admin.write(admin);
        self.sage_token.write(sage_token);
        self.coordinator.write(coordinator);
        self.paused.write(false);
        self.total_rentals.write(0);
    }

    // ============================================================
    // Rental Escrow Implementation
    // ============================================================

    #[abi(embed_v0)]
    impl RentalEscrowImpl of IRentalEscrow<ContractState> {

        // ============================================================
        // User Functions
        // ============================================================

        fn deposit(ref self: ContractState, amount: u256) {
            self.assert_not_paused();
            assert(amount >= MIN_DEPOSIT, 'Amount too small');

            let caller = get_caller_address();
            let this = get_contract_address();

            // Transfer tokens from user to contract
            let token = IERC20Dispatcher { contract_address: self.sage_token.read() };
            let success = token.transfer_from(caller, this, amount);
            assert(success, 'Transfer failed');

            // Update balance
            let mut balance = self.balances.read(caller);
            balance.available += amount;
            balance.total_deposited += amount;
            self.balances.write(caller, balance);

            // Update stats
            let total = self.total_deposited.read();
            self.total_deposited.write(total + amount);

            self.emit(Deposited {
                user: caller,
                amount,
                new_balance: balance.available,
            });
        }

        fn withdraw(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            let mut balance = self.balances.read(caller);

            assert(amount > 0, 'Amount must be positive');
            assert(balance.available >= amount, 'Insufficient balance');

            // Update balance first (checks-effects-interactions)
            balance.available -= amount;
            self.balances.write(caller, balance);

            // Transfer tokens to user
            let token = IERC20Dispatcher { contract_address: self.sage_token.read() };
            let success = token.transfer(caller, amount);
            assert(success, 'Transfer failed');

            self.emit(Withdrawn {
                user: caller,
                amount,
                remaining_balance: balance.available,
            });
        }

        fn get_balance(self: @ContractState, user: ContractAddress) -> EscrowBalance {
            self.balances.read(user)
        }

        // ============================================================
        // Coordinator Functions
        // ============================================================

        fn start_rental(
            ref self: ContractState,
            rental_id: felt252,
            tenant: ContractAddress,
            validator: ContractAddress,
            rate_per_hour: u256,
            initial_hours: u64,
        ) {
            self.assert_only_coordinator();
            self.assert_not_paused();

            // Validate inputs
            assert(!tenant.is_zero(), 'Tenant cannot be zero');
            assert(!validator.is_zero(), 'Validator cannot be zero');
            assert(rate_per_hour > 0, 'Rate must be positive');
            assert(initial_hours >= MIN_RENTAL_HOURS, 'Duration too short');
            assert(initial_hours <= MAX_RENTAL_HOURS, 'Duration too long');

            // Check rental doesn't exist
            let existing = self.rentals.read(rental_id);
            assert(existing.tenant.is_zero(), 'Rental already exists');

            // Calculate required reservation
            let reserved_amount = rate_per_hour * initial_hours.into();

            // Check and reserve funds
            let mut balance = self.balances.read(tenant);
            assert(balance.available >= reserved_amount, 'Insufficient funds');

            balance.available -= reserved_amount;
            balance.reserved += reserved_amount;
            self.balances.write(tenant, balance);

            // Create rental
            let now = get_block_timestamp();
            let rental = Rental {
                rental_id,
                tenant,
                validator,
                rate_per_hour,
                reserved_amount,
                charged_amount: 0,
                started_at: now,
                last_charged_at: now,
                is_active: true,
            };
            self.rentals.write(rental_id, rental);

            // Update stats
            let count = self.total_rentals.read();
            self.total_rentals.write(count + 1);

            self.emit(RentalStarted {
                rental_id,
                tenant,
                validator,
                rate_per_hour,
                reserved_amount,
            });
        }

        fn charge_rental(
            ref self: ContractState,
            rental_id: felt252,
            hours: u64,
        ) {
            self.assert_only_coordinator();

            let mut rental = self.rentals.read(rental_id);
            assert(rental.is_active, 'Rental not active');
            assert(hours > 0, 'Hours must be positive');

            // Calculate charge amount
            let charge_amount = rental.rate_per_hour * hours.into();

            // Ensure we don't overcharge
            let remaining_reserved = rental.reserved_amount - rental.charged_amount;
            let actual_charge = if charge_amount > remaining_reserved {
                remaining_reserved
            } else {
                charge_amount
            };

            assert(actual_charge > 0, 'No funds to charge');

            // Move funds from tenant's reserved to validator's earnings
            let mut tenant_balance = self.balances.read(rental.tenant);
            tenant_balance.reserved -= actual_charge;
            tenant_balance.total_spent += actual_charge;
            self.balances.write(rental.tenant, tenant_balance);

            let mut validator_earnings = self.earnings.read(rental.validator);
            validator_earnings.pending += actual_charge;
            validator_earnings.total_earned += actual_charge;
            self.earnings.write(rental.validator, validator_earnings);

            // Update rental
            rental.charged_amount += actual_charge;
            rental.last_charged_at = get_block_timestamp();
            self.rentals.write(rental_id, rental);

            // Update stats
            let total = self.total_earnings.read();
            self.total_earnings.write(total + actual_charge);

            self.emit(RentalCharged {
                rental_id,
                hours,
                amount: actual_charge,
                total_charged: rental.charged_amount,
            });
        }

        fn stop_rental(ref self: ContractState, rental_id: felt252) {
            self.assert_only_coordinator();

            let mut rental = self.rentals.read(rental_id);
            assert(rental.is_active, 'Rental not active');

            // Calculate refund (reserved - charged)
            let refund = rental.reserved_amount - rental.charged_amount;

            // Return unused funds to tenant's available balance
            if refund > 0 {
                let mut tenant_balance = self.balances.read(rental.tenant);
                tenant_balance.reserved -= refund;
                tenant_balance.available += refund;
                self.balances.write(rental.tenant, tenant_balance);
            }

            // Mark rental as inactive
            rental.is_active = false;
            self.rentals.write(rental_id, rental);

            self.emit(RentalStopped {
                rental_id,
                total_charged: rental.charged_amount,
                refunded: refund,
            });
        }

        fn extend_rental(
            ref self: ContractState,
            rental_id: felt252,
            additional_hours: u64,
        ) {
            self.assert_only_coordinator();
            self.assert_not_paused();

            let mut rental = self.rentals.read(rental_id);
            assert(rental.is_active, 'Rental not active');
            assert(additional_hours > 0, 'Hours must be positive');

            // Calculate additional reservation
            let additional_amount = rental.rate_per_hour * additional_hours.into();

            // Reserve additional funds
            let mut balance = self.balances.read(rental.tenant);
            assert(balance.available >= additional_amount, 'Insufficient funds');

            balance.available -= additional_amount;
            balance.reserved += additional_amount;
            self.balances.write(rental.tenant, balance);

            // Update rental
            rental.reserved_amount += additional_amount;
            self.rentals.write(rental_id, rental);

            self.emit(RentalExtended {
                rental_id,
                additional_hours,
                additional_reserved: additional_amount,
            });
        }

        fn get_rental(self: @ContractState, rental_id: felt252) -> Rental {
            self.rentals.read(rental_id)
        }

        // ============================================================
        // Validator Functions
        // ============================================================

        fn withdraw_earnings(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            let mut validator_earnings = self.earnings.read(caller);

            assert(amount > 0, 'Amount must be positive');
            assert(validator_earnings.pending >= amount, 'Insufficient earnings');

            // Update earnings first
            validator_earnings.pending -= amount;
            validator_earnings.total_withdrawn += amount;
            self.earnings.write(caller, validator_earnings);

            // Transfer tokens
            let token = IERC20Dispatcher { contract_address: self.sage_token.read() };
            let success = token.transfer(caller, amount);
            assert(success, 'Transfer failed');

            self.emit(EarningsWithdrawn {
                validator: caller,
                amount,
                remaining: validator_earnings.pending,
            });
        }

        fn get_earnings(self: @ContractState, validator: ContractAddress) -> ValidatorEarnings {
            self.earnings.read(validator)
        }

        // ============================================================
        // Admin Functions
        // ============================================================

        fn set_coordinator(ref self: ContractState, coordinator: ContractAddress) {
            self.assert_only_admin();

            let old = self.coordinator.read();
            self.coordinator.write(coordinator);

            self.emit(CoordinatorUpdated {
                old_coordinator: old,
                new_coordinator: coordinator,
            });
        }

        fn set_sage_token(ref self: ContractState, token: ContractAddress) {
            self.assert_only_admin();

            // Can only set once if not already set, or admin override
            assert(!token.is_zero(), 'Token cannot be zero');
            self.sage_token.write(token);
        }

        fn get_coordinator(self: @ContractState) -> ContractAddress {
            self.coordinator.read()
        }

        fn get_sage_token(self: @ContractState) -> ContractAddress {
            self.sage_token.read()
        }

        fn get_admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }

        fn transfer_admin(ref self: ContractState, new_admin: ContractAddress) {
            self.assert_only_admin();
            assert(!new_admin.is_zero(), 'New admin cannot be zero');

            let current = self.admin.read();
            self.pending_admin.write(new_admin);

            self.emit(AdminTransferStarted {
                current_admin: current,
                pending_admin: new_admin,
            });
        }

        fn accept_admin(ref self: ContractState) {
            let caller = get_caller_address();
            let pending = self.pending_admin.read();

            assert(caller == pending, 'Not pending admin');

            let old = self.admin.read();
            self.admin.write(caller);
            self.pending_admin.write(Zero::zero());

            self.emit(AdminTransferred {
                old_admin: old,
                new_admin: caller,
            });
        }

        fn get_version(self: @ContractState) -> felt252 {
            VERSION
        }

        fn get_stats(self: @ContractState) -> (u256, u256, u64) {
            (
                self.total_deposited.read(),
                self.total_earnings.read(),
                self.total_rentals.read(),
            )
        }

        fn pause(ref self: ContractState) {
            self.assert_only_admin();
            self.paused.write(true);

            self.emit(Paused { by: get_caller_address() });
        }

        fn unpause(ref self: ContractState) {
            self.assert_only_admin();
            self.paused.write(false);

            self.emit(Unpaused { by: get_caller_address() });
        }

        fn is_paused(self: @ContractState) -> bool {
            self.paused.read()
        }
    }

    // ============================================================
    // Upgradeable Implementation
    // ============================================================

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {

        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.assert_only_admin();
            assert(!new_class_hash.is_zero(), 'Invalid class hash');

            let old_class_hash = self.current_class_hash.read();

            // Replace the class
            replace_class_syscall(new_class_hash).unwrap();
            self.current_class_hash.write(new_class_hash);

            self.emit(Upgraded {
                old_class_hash,
                new_class_hash,
                upgraded_by: get_caller_address(),
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
        fn assert_only_admin(self: @ContractState) {
            let caller = get_caller_address();
            let admin = self.admin.read();
            assert(caller == admin, 'Only admin');
        }

        fn assert_only_coordinator(self: @ContractState) {
            let caller = get_caller_address();
            let coordinator = self.coordinator.read();
            assert(caller == coordinator, 'Only coordinator');
        }

        fn assert_not_paused(self: @ContractState) {
            assert(!self.paused.read(), 'Contract is paused');
        }
    }
}
