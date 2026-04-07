-- Add CHECK constraints on financial fields via triggers (SQLite)
-- SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we use BEFORE triggers.
-- Migration: 003_financial_check_constraints

-- Validator earnings: prevent negative values on INSERT
CREATE TRIGGER IF NOT EXISTS trg_validator_earnings_insert_check
BEFORE INSERT ON validator_earnings
FOR EACH ROW
WHEN NEW.total_earned < 0 OR NEW.pending_withdrawal < 0 OR NEW.total_withdrawn < 0
BEGIN
    SELECT RAISE(ABORT, 'Validator earnings fields must be non-negative');
END;

-- Validator earnings: prevent negative values on UPDATE
CREATE TRIGGER IF NOT EXISTS trg_validator_earnings_update_check
BEFORE UPDATE ON validator_earnings
FOR EACH ROW
WHEN NEW.total_earned < 0 OR NEW.pending_withdrawal < 0 OR NEW.total_withdrawn < 0
BEGIN
    SELECT RAISE(ABORT, 'Validator earnings fields must be non-negative');
END;

-- Escrow balances: prevent negative balance/deposited/spent on INSERT
CREATE TRIGGER IF NOT EXISTS trg_escrow_balances_insert_check
BEFORE INSERT ON escrow_balances
FOR EACH ROW
WHEN NEW.balance < 0 OR NEW.total_deposited < 0 OR NEW.total_spent < 0
BEGIN
    SELECT RAISE(ABORT, 'Escrow balance fields must be non-negative');
END;

-- Escrow balances: prevent negative balance/deposited/spent on UPDATE
CREATE TRIGGER IF NOT EXISTS trg_escrow_balances_update_check
BEFORE UPDATE ON escrow_balances
FOR EACH ROW
WHEN NEW.balance < 0 OR NEW.total_deposited < 0 OR NEW.total_spent < 0
BEGIN
    SELECT RAISE(ABORT, 'Escrow balance fields must be non-negative');
END;

-- Rental sessions: prevent negative total_spent on INSERT/UPDATE
CREATE TRIGGER IF NOT EXISTS trg_rental_sessions_insert_check
BEFORE INSERT ON rental_sessions
FOR EACH ROW
WHEN NEW.total_spent < 0
BEGIN
    SELECT RAISE(ABORT, 'Rental total_spent must be non-negative');
END;

CREATE TRIGGER IF NOT EXISTS trg_rental_sessions_update_check
BEFORE UPDATE ON rental_sessions
FOR EACH ROW
WHEN NEW.total_spent < 0
BEGIN
    SELECT RAISE(ABORT, 'Rental total_spent must be non-negative');
END;
