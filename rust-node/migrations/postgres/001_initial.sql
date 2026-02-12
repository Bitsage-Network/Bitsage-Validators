-- BitSage Coordinator Database Schema (PostgreSQL)
-- Migration: 001_initial

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Workers
-- =============================================================================
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_type VARCHAR(20) NOT NULL CHECK (worker_type IN ('gpu', 'tee', 'wasm')),
    address VARCHAR(255) NOT NULL,
    gpu_model VARCHAR(100),
    vram_gb INTEGER,
    tee_type VARCHAR(50),
    owner_wallet VARCHAR(66),
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'maintenance')),
    capabilities JSONB NOT NULL DEFAULT '{}',
    current_workload UUID,
    last_heartbeat TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_type ON workers(worker_type);
CREATE INDEX idx_workers_owner ON workers(owner_wallet);
CREATE INDEX idx_workers_gpu_model ON workers(gpu_model);

-- =============================================================================
-- Deployments
-- =============================================================================
CREATE TABLE IF NOT EXISTS deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id VARCHAR(100) NOT NULL,
    worker_id UUID NOT NULL REFERENCES workers(id),
    tenant_wallet VARCHAR(66) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'running', 'stopping', 'stopped', 'failed', 'timeout')),
    container_id VARCHAR(100),
    config JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployments_worker ON deployments(worker_id);
CREATE INDEX idx_deployments_tenant ON deployments(tenant_wallet);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_started ON deployments(started_at);

-- =============================================================================
-- Marketplace GPUs
-- =============================================================================
CREATE TABLE IF NOT EXISTS marketplace_gpus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    owner_wallet VARCHAR(66) NOT NULL,
    gpu_model VARCHAR(100) NOT NULL,
    vram_gb INTEGER NOT NULL,
    availability VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'in_use', 'offline', 'maintenance')),
    rate_sage_per_hour BIGINT NOT NULL,
    supported_templates TEXT[] NOT NULL DEFAULT '{}',
    current_rental_id UUID,
    available_in_minutes INTEGER,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gpus_owner ON marketplace_gpus(owner_wallet);
CREATE INDEX idx_gpus_availability ON marketplace_gpus(availability);
CREATE INDEX idx_gpus_model ON marketplace_gpus(gpu_model);
CREATE INDEX idx_gpus_rate ON marketplace_gpus(rate_sage_per_hour);

-- =============================================================================
-- Rental Sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS rental_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_wallet VARCHAR(66) NOT NULL,
    gpu_id UUID NOT NULL REFERENCES marketplace_gpus(id),
    template_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioning', 'running', 'expired', 'stopped', 'failed')),
    container_id VARCHAR(100),
    ssh_host VARCHAR(255),
    ssh_port INTEGER,
    ssh_username VARCHAR(50),
    ssh_password VARCHAR(100),
    jupyter_url VARCHAR(255),
    jupyter_token VARCHAR(100),
    api_endpoint VARCHAR(255),
    api_key VARCHAR(100),
    rate_sage_per_hour BIGINT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ,
    total_billed_sage BIGINT NOT NULL DEFAULT 0,
    last_billed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rentals_tenant ON rental_sessions(tenant_wallet);
CREATE INDEX idx_rentals_gpu ON rental_sessions(gpu_id);
CREATE INDEX idx_rentals_status ON rental_sessions(status);
CREATE INDEX idx_rentals_expires ON rental_sessions(expires_at);

-- =============================================================================
-- Escrow Balances
-- =============================================================================
CREATE TABLE IF NOT EXISTS escrow_balances (
    wallet_address VARCHAR(66) PRIMARY KEY,
    balance_sage BIGINT NOT NULL DEFAULT 0 CHECK (balance_sage >= 0),
    total_deposited_sage BIGINT NOT NULL DEFAULT 0,
    total_spent_sage BIGINT NOT NULL DEFAULT 0,
    last_deposit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Billing Records
-- =============================================================================
CREATE TABLE IF NOT EXISTS billing_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rental_id UUID NOT NULL REFERENCES rental_sessions(id),
    tenant_wallet VARCHAR(66) NOT NULL,
    validator_wallet VARCHAR(66) NOT NULL,
    amount_sage BIGINT NOT NULL,
    billing_type VARCHAR(20) NOT NULL CHECK (billing_type IN ('hourly', 'final', 'refund')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_rental ON billing_records(rental_id);
CREATE INDEX idx_billing_tenant ON billing_records(tenant_wallet);
CREATE INDEX idx_billing_validator ON billing_records(validator_wallet);
CREATE INDEX idx_billing_created ON billing_records(created_at);

-- =============================================================================
-- Validator Earnings
-- =============================================================================
CREATE TABLE IF NOT EXISTS validator_earnings (
    wallet_address VARCHAR(66) PRIMARY KEY,
    total_earned_sage BIGINT NOT NULL DEFAULT 0,
    pending_withdrawal_sage BIGINT NOT NULL DEFAULT 0,
    total_withdrawn_sage BIGINT NOT NULL DEFAULT 0,
    last_earning_at TIMESTAMPTZ,
    last_withdrawal_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Proof Jobs
-- =============================================================================
CREATE TABLE IF NOT EXISTS proof_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circuit_type VARCHAR(50) NOT NULL,
    worker_id UUID REFERENCES workers(id),
    requester_wallet VARCHAR(66) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'proving', 'completed', 'failed', 'timeout')),
    input_hash VARCHAR(66) NOT NULL,
    proof_data BYTEA,
    public_inputs JSONB,
    execution_time_ms INTEGER,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proofs_circuit ON proof_jobs(circuit_type);
CREATE INDEX idx_proofs_worker ON proof_jobs(worker_id);
CREATE INDEX idx_proofs_requester ON proof_jobs(requester_wallet);
CREATE INDEX idx_proofs_status ON proof_jobs(status);
CREATE INDEX idx_proofs_submitted ON proof_jobs(submitted_at);

-- =============================================================================
-- Audit Logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    actor_wallet VARCHAR(66),
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_actor ON audit_logs(actor_wallet);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =============================================================================
-- API Keys (for programmatic access)
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(66) NOT NULL,
    key_hash VARCHAR(128) NOT NULL,
    name VARCHAR(100) NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_apikeys_wallet ON api_keys(wallet_address);
CREATE INDEX idx_apikeys_hash ON api_keys(key_hash);

-- =============================================================================
-- Triggers for updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workers_updated_at
    BEFORE UPDATE ON workers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deployments_updated_at
    BEFORE UPDATE ON deployments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketplace_gpus_updated_at
    BEFORE UPDATE ON marketplace_gpus
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rental_sessions_updated_at
    BEFORE UPDATE ON rental_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_balances_updated_at
    BEFORE UPDATE ON escrow_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validator_earnings_updated_at
    BEFORE UPDATE ON validator_earnings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
