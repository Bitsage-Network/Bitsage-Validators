-- Add CHECK constraints on financial fields to prevent negative balances
-- Migration: 003_financial_check_constraints

-- Validator earnings: all balances must be non-negative
ALTER TABLE validator_earnings
    ADD CONSTRAINT chk_total_earned_nonneg CHECK (total_earned_sage >= 0),
    ADD CONSTRAINT chk_pending_withdrawal_nonneg CHECK (pending_withdrawal_sage >= 0),
    ADD CONSTRAINT chk_total_withdrawn_nonneg CHECK (total_withdrawn_sage >= 0);

-- Escrow: deposited and spent must be non-negative (balance_sage already has CHECK)
ALTER TABLE escrow_balances
    ADD CONSTRAINT chk_total_deposited_nonneg CHECK (total_deposited_sage >= 0),
    ADD CONSTRAINT chk_total_spent_nonneg CHECK (total_spent_sage >= 0);

-- Rental sessions: billed amount must be non-negative
ALTER TABLE rental_sessions
    ADD CONSTRAINT chk_total_billed_nonneg CHECK (total_billed_sage >= 0);

-- Marketplace GPUs: rate must be positive
ALTER TABLE marketplace_gpus
    ADD CONSTRAINT chk_rate_positive CHECK (rate_sage_per_hour > 0);
