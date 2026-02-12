-- Add gpu_allocation JSON field to rental_sessions
-- This stores the full GPU allocation details (Exclusive or MIG)

ALTER TABLE rental_sessions ADD COLUMN gpu_allocation TEXT;

-- Add availability_data for complex availability states (JSON)
ALTER TABLE marketplace_gpus ADD COLUMN availability_data TEXT;

-- Add SSH key fingerprint and Tailscale name
ALTER TABLE rental_sessions ADD COLUMN ssh_key_fingerprint TEXT;
ALTER TABLE rental_sessions ADD COLUMN ssh_tailscale_name TEXT;

-- Add Jupyter token expiration
ALTER TABLE rental_sessions ADD COLUMN jupyter_expires_at DATETIME;
