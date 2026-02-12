// Tests for RentalEscrow Contract
use starknet::{ContractAddress, contract_address_const, ClassHash};
use starknet::testing::{set_caller_address, set_contract_address, set_block_timestamp};
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    start_cheat_block_timestamp, stop_cheat_block_timestamp,
    spy_events, EventSpyAssertionsTrait, EventSpyTrait,
};

use bitsage_contracts::rental_escrow::{
    IRentalEscrowDispatcher, IRentalEscrowDispatcherTrait,
    IUpgradeableDispatcher, IUpgradeableDispatcherTrait,
    RentalEscrow,
};

// ============================================================
// Test Helpers
// ============================================================

fn ADMIN() -> ContractAddress {
    contract_address_const::<'admin'>()
}

fn COORDINATOR() -> ContractAddress {
    contract_address_const::<'coordinator'>()
}

fn TENANT() -> ContractAddress {
    contract_address_const::<'tenant'>()
}

fn VALIDATOR() -> ContractAddress {
    contract_address_const::<'validator'>()
}

fn SAGE_TOKEN() -> ContractAddress {
    contract_address_const::<'sage_token'>()
}

fn RENTAL_ID() -> felt252 {
    'rental_001'
}

const ONE_SAGE: u256 = 1000000000000000000; // 1e18
const RATE_PER_HOUR: u256 = 50000000000000000000; // 50 SAGE

fn deploy_escrow() -> ContractAddress {
    let contract = declare("RentalEscrow").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];

    // Constructor args: admin, sage_token, coordinator
    calldata.append(ADMIN().into());
    calldata.append(SAGE_TOKEN().into());
    calldata.append(COORDINATOR().into());

    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

// ============================================================
// Deployment Tests
// ============================================================

#[test]
fn test_deployment() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    assert(escrow.get_admin() == ADMIN(), 'Wrong admin');
    assert(escrow.get_coordinator() == COORDINATOR(), 'Wrong coordinator');
    assert(escrow.get_sage_token() == SAGE_TOKEN(), 'Wrong token');
    assert(escrow.get_version() == 1, 'Wrong version');
    assert(!escrow.is_paused(), 'Should not be paused');
}

#[test]
fn test_get_stats_initial() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let (total_deposited, total_earnings, total_rentals) = escrow.get_stats();

    assert(total_deposited == 0, 'Wrong deposited');
    assert(total_earnings == 0, 'Wrong earnings');
    assert(total_rentals == 0, 'Wrong rentals');
}

// ============================================================
// Admin Tests
// ============================================================

#[test]
fn test_set_coordinator() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let new_coordinator = contract_address_const::<'new_coordinator'>();

    start_cheat_caller_address(escrow_address, ADMIN());
    escrow.set_coordinator(new_coordinator);
    stop_cheat_caller_address(escrow_address);

    assert(escrow.get_coordinator() == new_coordinator, 'Coordinator not updated');
}

#[test]
#[should_panic(expected: ('Only admin',))]
fn test_set_coordinator_unauthorized() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let new_coordinator = contract_address_const::<'new_coordinator'>();

    start_cheat_caller_address(escrow_address, TENANT());
    escrow.set_coordinator(new_coordinator);
}

#[test]
fn test_admin_transfer() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let new_admin = contract_address_const::<'new_admin'>();

    // Start transfer
    start_cheat_caller_address(escrow_address, ADMIN());
    escrow.transfer_admin(new_admin);
    stop_cheat_caller_address(escrow_address);

    // Admin should still be old one
    assert(escrow.get_admin() == ADMIN(), 'Admin changed too early');

    // Accept transfer
    start_cheat_caller_address(escrow_address, new_admin);
    escrow.accept_admin();
    stop_cheat_caller_address(escrow_address);

    assert(escrow.get_admin() == new_admin, 'Admin not transferred');
}

#[test]
#[should_panic(expected: ('Not pending admin',))]
fn test_accept_admin_wrong_caller() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let new_admin = contract_address_const::<'new_admin'>();

    start_cheat_caller_address(escrow_address, ADMIN());
    escrow.transfer_admin(new_admin);
    stop_cheat_caller_address(escrow_address);

    // Try to accept as wrong user
    start_cheat_caller_address(escrow_address, TENANT());
    escrow.accept_admin();
}

#[test]
fn test_pause_unpause() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    start_cheat_caller_address(escrow_address, ADMIN());

    escrow.pause();
    assert(escrow.is_paused(), 'Should be paused');

    escrow.unpause();
    assert(!escrow.is_paused(), 'Should not be paused');

    stop_cheat_caller_address(escrow_address);
}

// ============================================================
// Rental Flow Tests
// ============================================================

#[test]
fn test_get_balance_empty() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let balance = escrow.get_balance(TENANT());

    assert(balance.available == 0, 'Wrong available');
    assert(balance.reserved == 0, 'Wrong reserved');
    assert(balance.total_deposited == 0, 'Wrong deposited');
    assert(balance.total_spent == 0, 'Wrong spent');
}

#[test]
#[should_panic(expected: ('Rental not active',))]
fn test_charge_inactive_rental() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    start_cheat_caller_address(escrow_address, COORDINATOR());
    escrow.charge_rental(RENTAL_ID(), 1);
}

#[test]
#[should_panic(expected: ('Only coordinator',))]
fn test_start_rental_unauthorized() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    start_cheat_caller_address(escrow_address, TENANT());
    escrow.start_rental(RENTAL_ID(), TENANT(), VALIDATOR(), RATE_PER_HOUR, 1);
}

#[test]
fn test_get_rental_nonexistent() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let rental = escrow.get_rental(RENTAL_ID());

    // Should return default/empty rental
    assert(rental.tenant.is_zero(), 'Should be zero');
    assert(!rental.is_active, 'Should not be active');
}

// ============================================================
// Validator Earnings Tests
// ============================================================

#[test]
fn test_get_earnings_empty() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    let earnings = escrow.get_earnings(VALIDATOR());

    assert(earnings.pending == 0, 'Wrong pending');
    assert(earnings.total_earned == 0, 'Wrong earned');
    assert(earnings.total_withdrawn == 0, 'Wrong withdrawn');
}

#[test]
#[should_panic(expected: ('Insufficient earnings',))]
fn test_withdraw_earnings_insufficient() {
    let escrow_address = deploy_escrow();
    let escrow = IRentalEscrowDispatcher { contract_address: escrow_address };

    start_cheat_caller_address(escrow_address, VALIDATOR());
    escrow.withdraw_earnings(ONE_SAGE);
}

// ============================================================
// Upgrade Tests
// ============================================================

#[test]
#[should_panic(expected: ('Only admin',))]
fn test_upgrade_unauthorized() {
    let escrow_address = deploy_escrow();
    let escrow = IUpgradeableDispatcher { contract_address: escrow_address };

    let new_class: ClassHash = 0x123.try_into().unwrap();

    start_cheat_caller_address(escrow_address, TENANT());
    escrow.upgrade(new_class);
}

#[test]
#[should_panic(expected: ('Invalid class hash',))]
fn test_upgrade_zero_class_hash() {
    let escrow_address = deploy_escrow();
    let escrow = IUpgradeableDispatcher { contract_address: escrow_address };

    let zero_class: ClassHash = 0.try_into().unwrap();

    start_cheat_caller_address(escrow_address, ADMIN());
    escrow.upgrade(zero_class);
}
