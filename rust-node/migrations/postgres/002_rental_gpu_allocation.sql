-- Add gpu_allocation JSON field to rental_sessions
-- This stores the full GPU allocation details (Exclusive or MIG)

ALTER TABLE rental_sessions ADD COLUMN IF NOT EXISTS gpu_allocation JSONB;

-- Add availability_data for complex availability states (JSON)
ALTER TABLE marketplace_gpus ADD COLUMN IF NOT EXISTS availability_data JSONB;

-- Add SSH key fingerprint and Tailscale name
ALTER TABLE rental_sessions ADD COLUMN IF NOT EXISTS ssh_key_fingerprint TEXT;
ALTER TABLE rental_sessions ADD COLUMN IF NOT EXISTS ssh_tailscale_name TEXT;

-- Add Jupyter token expiration
ALTER TABLE rental_sessions ADD COLUMN IF NOT EXISTS jupyter_expires_at TIMESTAMPTZ;
