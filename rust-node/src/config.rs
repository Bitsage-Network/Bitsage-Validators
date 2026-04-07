//! Configuration Management
//!
//! Production-grade configuration with environment variables, defaults, and validation.

use serde::Deserialize;
use std::net::SocketAddr;
use std::path::PathBuf;
use once_cell::sync::Lazy;
use tracing::info;

/// Global configuration instance
pub static CONFIG: Lazy<Config> = Lazy::new(|| {
    Config::from_env().expect("Failed to load configuration")
});

/// Main configuration struct
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Server configuration
    pub server: ServerConfig,
    /// Database configuration
    pub database: DatabaseConfig,
    /// Authentication configuration
    pub auth: AuthConfig,
    /// Rental marketplace configuration
    pub rental: RentalConfig,
    /// Worker configuration
    pub worker: WorkerConfig,
    /// Starknet configuration
    pub starknet: StarknetConfig,
    /// Metrics configuration
    pub metrics: MetricsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    /// Server bind address
    #[serde(default = "default_host")]
    pub host: String,
    /// Server port
    #[serde(default = "default_port")]
    pub port: u16,
    /// Request timeout in seconds
    #[serde(default = "default_request_timeout")]
    pub request_timeout_secs: u64,
    /// Maximum request body size in bytes
    #[serde(default = "default_max_body_size")]
    pub max_body_size: usize,
    /// Enable TLS
    #[serde(default)]
    pub tls_enabled: bool,
    /// TLS certificate path
    pub tls_cert_path: Option<PathBuf>,
    /// TLS key path
    pub tls_key_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    /// Database URL (sqlite:// or postgres://)
    #[serde(default = "default_database_url")]
    pub url: String,
    /// Maximum connection pool size
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    /// Minimum connection pool size
    #[serde(default = "default_min_connections")]
    pub min_connections: u32,
    /// Connection timeout in seconds
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_secs: u64,
    /// Run migrations on startup
    #[serde(default = "default_true")]
    pub run_migrations: bool,
}

#[derive(Clone, Deserialize)]
pub struct AuthConfig {
    /// JWT secret key (must be set in production)
    #[serde(default = "default_jwt_secret")]
    pub jwt_secret: String,
    /// JWT token expiry in hours
    #[serde(default = "default_token_expiry")]
    pub token_expiry_hours: u64,
    /// API key for worker authentication
    pub worker_api_key: Option<String>,
    /// Enable wallet-based authentication
    #[serde(default = "default_true")]
    pub wallet_auth_enabled: bool,
    /// Rate limit: requests per minute per IP
    #[serde(default = "default_rate_limit")]
    pub rate_limit_per_minute: u32,
    /// Rate limit: burst size
    #[serde(default = "default_burst_size")]
    pub rate_limit_burst: u32,
}

// Custom Debug to prevent jwt_secret and worker_api_key from appearing in logs
impl std::fmt::Debug for AuthConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthConfig")
            .field("jwt_secret", &format!("[REDACTED ({} chars)]", self.jwt_secret.len()))
            .field("token_expiry_hours", &self.token_expiry_hours)
            .field("worker_api_key", &self.worker_api_key.as_ref().map(|k| format!("[REDACTED ({} chars)]", k.len())))
            .field("wallet_auth_enabled", &self.wallet_auth_enabled)
            .field("rate_limit_per_minute", &self.rate_limit_per_minute)
            .field("rate_limit_burst", &self.rate_limit_burst)
            .finish()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RentalConfig {
    /// Billing interval in seconds
    #[serde(default = "default_billing_interval")]
    pub billing_interval_secs: u64,
    /// Expiration check interval in seconds
    #[serde(default = "default_expiration_interval")]
    pub expiration_check_interval_secs: u64,
    /// Minimum rental duration in hours
    #[serde(default = "default_min_rental_hours")]
    pub min_rental_hours: u32,
    /// Maximum rental duration in hours
    #[serde(default = "default_max_rental_hours")]
    pub max_rental_hours: u32,
    /// Escrow contract address on Starknet
    pub escrow_contract: Option<String>,
    /// Jupyter domain for routing
    #[serde(default = "default_jupyter_domain")]
    pub jupyter_domain: String,
    /// SSH access method (direct, tailscale, jumpbox)
    #[serde(default = "default_ssh_method")]
    pub ssh_method: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkerConfig {
    /// Deployment timeout in seconds
    #[serde(default = "default_deployment_timeout")]
    pub deployment_timeout_secs: u64,
    /// Heartbeat timeout in seconds
    #[serde(default = "default_heartbeat_timeout")]
    pub heartbeat_timeout_secs: u64,
    /// Maximum concurrent deployments per worker
    #[serde(default = "default_max_deployments")]
    pub max_concurrent_deployments: u32,
    /// Docker registry for workload images
    #[serde(default = "default_docker_registry")]
    pub docker_registry: String,
}

#[derive(Clone, Deserialize)]
pub struct StarknetConfig {
    /// Starknet RPC URL
    #[serde(default = "default_starknet_rpc")]
    pub rpc_url: String,
    /// Chain ID (mainnet, sepolia, etc.)
    #[serde(default = "default_chain_id")]
    pub chain_id: String,
    /// Coordinator account address
    pub account_address: Option<String>,
    /// Coordinator private key (for signing transactions) — NEVER log this value
    #[serde(skip_serializing)]
    pub private_key: Option<String>,
    /// SAGE token contract address
    pub sage_token_contract: Option<String>,
}

// Custom Debug to prevent private key from appearing in logs
impl std::fmt::Debug for StarknetConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StarknetConfig")
            .field("rpc_url", &self.rpc_url)
            .field("chain_id", &self.chain_id)
            .field("account_address", &self.account_address)
            .field("private_key", &self.private_key.as_ref().map(|_| "[REDACTED]"))
            .field("sage_token_contract", &self.sage_token_contract)
            .finish()
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct MetricsConfig {
    /// Enable Prometheus metrics
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Metrics endpoint port
    #[serde(default = "default_metrics_port")]
    pub port: u16,
    /// Metrics endpoint path
    #[serde(default = "default_metrics_path")]
    pub path: String,
}

// Default value functions
fn default_host() -> String { "0.0.0.0".to_string() }
fn default_port() -> u16 { 3030 }
fn default_request_timeout() -> u64 { 30 }
fn default_max_body_size() -> usize { 10 * 1024 * 1024 } // 10MB
fn default_database_url() -> String { "sqlite://data/bitsage.db?mode=rwc".to_string() }
fn default_max_connections() -> u32 { 10 }
fn default_min_connections() -> u32 { 2 }
fn default_connect_timeout() -> u64 { 10 }
fn default_jwt_secret() -> String {
    // Generate a random secret for development (NOT SECURE for production!)
    use rand::Rng;
    let secret: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    tracing::warn!("Using randomly generated JWT secret - set AUTH_JWT_SECRET in production!");
    secret
}
fn default_token_expiry() -> u64 { 24 }
fn default_rate_limit() -> u32 { 100 }
fn default_burst_size() -> u32 { 20 }
fn default_billing_interval() -> u64 { 300 } // 5 minutes
fn default_expiration_interval() -> u64 { 60 } // 1 minute
fn default_min_rental_hours() -> u32 { 1 }
fn default_max_rental_hours() -> u32 { 720 } // 30 days
fn default_jupyter_domain() -> String { "jupyter.bitsage.network".to_string() }
fn default_ssh_method() -> String { "direct".to_string() }
fn default_deployment_timeout() -> u64 { 300 }
fn default_heartbeat_timeout() -> u64 { 60 }
fn default_max_deployments() -> u32 { 4 }
fn default_docker_registry() -> String { "bitsage".to_string() }
fn default_starknet_rpc() -> String { "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo".to_string() }
fn default_chain_id() -> String { "sepolia".to_string() }
fn default_true() -> bool { true }
fn default_metrics_port() -> u16 { 9090 }
fn default_metrics_path() -> String { "/metrics".to_string() }

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> anyhow::Result<Self> {
        // Load .env file if present
        let _ = dotenvy::dotenv();

        let config = config::Config::builder()
            // Server
            .set_default("server.host", default_host())?
            .set_default("server.port", default_port() as i64)?
            .set_default("server.request_timeout_secs", default_request_timeout() as i64)?
            .set_default("server.max_body_size", default_max_body_size() as i64)?
            .set_default("server.tls_enabled", false)?
            // Database
            .set_default("database.url", default_database_url())?
            .set_default("database.max_connections", default_max_connections() as i64)?
            .set_default("database.min_connections", default_min_connections() as i64)?
            .set_default("database.connect_timeout_secs", default_connect_timeout() as i64)?
            .set_default("database.run_migrations", true)?
            // Auth
            .set_default("auth.token_expiry_hours", default_token_expiry() as i64)?
            .set_default("auth.wallet_auth_enabled", true)?
            .set_default("auth.rate_limit_per_minute", default_rate_limit() as i64)?
            .set_default("auth.rate_limit_burst", default_burst_size() as i64)?
            // Rental
            .set_default("rental.billing_interval_secs", default_billing_interval() as i64)?
            .set_default("rental.expiration_check_interval_secs", default_expiration_interval() as i64)?
            .set_default("rental.min_rental_hours", default_min_rental_hours() as i64)?
            .set_default("rental.max_rental_hours", default_max_rental_hours() as i64)?
            .set_default("rental.jupyter_domain", default_jupyter_domain())?
            .set_default("rental.ssh_method", default_ssh_method())?
            // Worker
            .set_default("worker.deployment_timeout_secs", default_deployment_timeout() as i64)?
            .set_default("worker.heartbeat_timeout_secs", default_heartbeat_timeout() as i64)?
            .set_default("worker.max_concurrent_deployments", default_max_deployments() as i64)?
            .set_default("worker.docker_registry", default_docker_registry())?
            // Starknet
            .set_default("starknet.rpc_url", default_starknet_rpc())?
            .set_default("starknet.chain_id", default_chain_id())?
            // Metrics
            .set_default("metrics.enabled", true)?
            .set_default("metrics.port", default_metrics_port() as i64)?
            .set_default("metrics.path", default_metrics_path())?
            // Load from environment
            .add_source(
                config::Environment::default()
                    .separator("_")
                    .prefix("BITSAGE")
            )
            // Also support non-prefixed env vars for common settings
            .add_source(
                config::Environment::default()
                    .separator("__")
            )
            .build()?;

        let mut cfg: Config = config.try_deserialize()?;

        // Handle JWT secret specially - check AUTH_JWT_SECRET env var
        if let Ok(secret) = std::env::var("AUTH_JWT_SECRET") {
            cfg.auth.jwt_secret = secret;
        } else if cfg.auth.jwt_secret.is_empty() {
            let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
            if is_production {
                anyhow::bail!("AUTH_JWT_SECRET must be set in production (at least 32 characters)");
            }
            cfg.auth.jwt_secret = default_jwt_secret();
        }

        // Handle worker API key
        if let Ok(key) = std::env::var("WORKER_API_KEY") {
            cfg.auth.worker_api_key = Some(key);
        }

        // Validate configuration
        cfg.validate()?;

        info!("Configuration loaded successfully");
        info!("  Server: {}:{}", cfg.server.host, cfg.server.port);
        info!("  Database: {}", if cfg.database.url.contains("postgres") { "PostgreSQL" } else { "SQLite" });
        info!("  Starknet: {} ({})", cfg.starknet.chain_id, cfg.starknet.rpc_url);
        info!("  Metrics: {}", if cfg.metrics.enabled { format!("port {}", cfg.metrics.port) } else { "disabled".to_string() });

        Ok(cfg)
    }

    /// Validate configuration values
    fn validate(&self) -> anyhow::Result<()> {
        // Validate server config
        if self.server.port == 0 {
            anyhow::bail!("Server port cannot be 0");
        }
        if self.server.max_body_size > 100 * 1024 * 1024 {
            anyhow::bail!("max_body_size exceeds 100MB limit");
        }
        if self.server.request_timeout_secs == 0 || self.server.request_timeout_secs > 300 {
            anyhow::bail!("request_timeout_secs must be between 1 and 300");
        }

        // Validate database config
        if self.database.max_connections == 0 {
            anyhow::bail!("database max_connections cannot be 0");
        }

        // Validate rental config
        if self.rental.min_rental_hours == 0 {
            anyhow::bail!("min_rental_hours cannot be 0");
        }
        if self.rental.max_rental_hours < self.rental.min_rental_hours {
            anyhow::bail!("max_rental_hours must be >= min_rental_hours");
        }
        if self.rental.billing_interval_secs < 60 {
            anyhow::bail!("billing_interval_secs must be at least 60 seconds");
        }

        // Validate worker config
        if self.worker.heartbeat_timeout_secs < 10 {
            anyhow::bail!("heartbeat_timeout_secs must be at least 10 seconds");
        }
        if self.worker.deployment_timeout_secs < 30 {
            anyhow::bail!("deployment_timeout_secs must be at least 30 seconds");
        }

        // Validate Starknet RPC URL is a real URL
        if !self.starknet.rpc_url.starts_with("http://") && !self.starknet.rpc_url.starts_with("https://") {
            anyhow::bail!("starknet.rpc_url must be an HTTP(S) URL");
        }

        // Enforce strict settings in production
        let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
        if is_production {
            // Auth
            if self.auth.jwt_secret.len() < 32 {
                anyhow::bail!("JWT secret must be at least 32 characters in production");
            }
            if self.auth.worker_api_key.is_none() {
                anyhow::bail!("WORKER_API_KEY must be set in production");
            }
            if let Some(ref key) = self.auth.worker_api_key {
                if key.len() < 16 {
                    anyhow::bail!("WORKER_API_KEY must be at least 16 characters in production");
                }
            }

            // Starknet
            if self.starknet.rpc_url.contains("sepolia") && self.starknet.chain_id == "mainnet" {
                anyhow::bail!("Starknet RPC URL points to sepolia but chain_id is mainnet — set STARKNET_RPC_URL to a mainnet RPC");
            }
            if self.starknet.chain_id == "mainnet" && self.starknet.rpc_url.contains("demo") {
                anyhow::bail!("Cannot use demo RPC endpoint on mainnet — use a production RPC provider");
            }
            if !self.starknet.rpc_url.starts_with("https://") {
                anyhow::bail!("starknet.rpc_url must use HTTPS in production");
            }
            if self.starknet.account_address.is_none() {
                tracing::warn!("STARKNET_ACCOUNT_ADDRESS not set — on-chain operations will fail");
            }
            if self.starknet.private_key.is_some() {
                tracing::info!("Starknet coordinator private key is configured (on-chain operations enabled)");
            }

            // Database
            if !self.database.url.contains("postgres") {
                tracing::warn!("Production should use PostgreSQL — SQLite is not recommended for production");
            }

            // TLS
            if !self.server.tls_enabled {
                tracing::warn!("TLS is not enabled — connections will not be encrypted!");
            }
        }

        Ok(())
    }

    /// Get socket address for server binding
    pub fn socket_addr(&self) -> SocketAddr {
        format!("{}:{}", self.server.host, self.server.port)
            .parse()
            .expect("Invalid server address")
    }
}

impl Default for Config {
    fn default() -> Self {
        Config::from_env().unwrap_or_else(|e| {
            tracing::error!("Failed to load config: {}", e);
            panic!("Configuration error: {}", e);
        })
    }
}
