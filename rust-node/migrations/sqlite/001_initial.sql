-- BitSage Coordinator Database Schema (SQLite)
-- Initial migration: Core tables

-- Workers table
CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    owner_wallet TEXT,
    gpu_model TEXT,
    gpu_backend TEXT NOT NULL DEFAULT 'cuda',
    vram_gb INTEGER,
    capacity INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'offline',
    active_workload TEXT,
    last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workers_owner ON workers(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

-- Deployments table
CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    workload_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    owner_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    container_id TEXT,
    progress_phase TEXT,
    progress_percent INTEGER,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_at DATETIME,
    stopped_at DATETIME,
    FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE INDEX IF NOT EXISTS idx_deployments_owner ON deployments(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_deployments_worker ON deployments(worker_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

-- Marketplace GPU listings
CREATE TABLE IF NOT EXISTS marketplace_gpus (
    id TEXT PRIMARY KEY,
    validator_wallet TEXT NOT NULL,
    gpu_model TEXT NOT NULL,
    vram_gb INTEGER NOT NULL,
    gpu_backend TEXT NOT NULL DEFAULT 'cuda',
    mig_capable INTEGER NOT NULL DEFAULT 0,
    availability TEXT NOT NULL DEFAULT 'available',
    rate_sage_per_hour INTEGER NOT NULL,
    uptime_percent REAL NOT NULL DEFAULT 100.0,
    total_rentals INTEGER NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 5.0,
    region TEXT,
    supported_templates TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketplace_validator ON marketplace_gpus(validator_wallet);
CREATE INDEX IF NOT EXISTS idx_marketplace_availability ON marketplace_gpus(availability);

-- Rental sessions
CREATE TABLE IF NOT EXISTS rental_sessions (
    id TEXT PRIMARY KEY,
    tenant_wallet TEXT NOT NULL,
    validator_wallet TEXT NOT NULL,
    template_id TEXT NOT NULL,
    gpu_id TEXT NOT NULL,
    container_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending_escrow',
    rate_sage_per_hour INTEGER NOT NULL,
    total_spent INTEGER NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    last_billed_at DATETIME NOT NULL,
    ssh_host TEXT,
    ssh_port INTEGER,
    ssh_username TEXT,
    ssh_method TEXT,
    jupyter_url TEXT,
    jupyter_token TEXT,
    api_endpoint TEXT,
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gpu_id) REFERENCES marketplace_gpus(id)
);

CREATE INDEX IF NOT EXISTS idx_rentals_tenant ON rental_sessions(tenant_wallet);
CREATE INDEX IF NOT EXISTS idx_rentals_validator ON rental_sessions(validator_wallet);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rental_sessions(status);

-- Escrow balances
CREATE TABLE IF NOT EXISTS escrow_balances (
    wallet TEXT PRIMARY KEY,
    total_deposited INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Billing records
CREATE TABLE IF NOT EXISTS billing_records (
    id TEXT PRIMARY KEY,
    rental_id TEXT NOT NULL,
    tenant_wallet TEXT NOT NULL,
    validator_wallet TEXT NOT NULL,
    amount INTEGER NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    tx_hash TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rental_id) REFERENCES rental_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_rental ON billing_records(rental_id);
CREATE INDEX IF NOT EXISTS idx_billing_tenant ON billing_records(tenant_wallet);
CREATE INDEX IF NOT EXISTS idx_billing_validator ON billing_records(validator_wallet);

-- Validator earnings
CREATE TABLE IF NOT EXISTS validator_earnings (
    wallet TEXT PRIMARY KEY,
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_withdrawn INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,
    active_rentals INTEGER NOT NULL DEFAULT 0,
    last_earned_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Proof jobs
CREATE TABLE IF NOT EXISTS proof_jobs (
    id TEXT PRIMARY KEY,
    circuit_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    worker_id TEXT,
    requester_wallet TEXT,
    proof_data TEXT,
    public_inputs TEXT,
    generation_time_ms INTEGER,
    error_message TEXT,
    deadline DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON proof_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON proof_jobs(worker_id);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor_wallet TEXT,
    actor_ip TEXT,
    details TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    wallet TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT '[]',
    rate_limit INTEGER,
    expires_at DATETIME,
    last_used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_apikeys_wallet ON api_keys(wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
