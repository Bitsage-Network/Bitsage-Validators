-- PostgreSQL initialization script for BitSage
-- This runs on first container startup

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create read-only user for monitoring
CREATE USER bitsage_readonly WITH PASSWORD 'readonly_password_change_me';
GRANT CONNECT ON DATABASE bitsage TO bitsage_readonly;
GRANT USAGE ON SCHEMA public TO bitsage_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bitsage_readonly;

-- Create indexes for performance (run after migrations create tables)
-- These are additional indexes beyond what the migration creates

-- Note: Actual table creation is handled by sqlx migrations
-- This file is for PostgreSQL-specific initialization
