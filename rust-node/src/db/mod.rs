//! Database Module
//!
//! Production-grade persistence layer using SQLx with support for
//! SQLite (development) and PostgreSQL (production).

pub mod models;
pub mod repository;

use sqlx::{Pool, Sqlite, Postgres};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, error};

use crate::config::CONFIG;

/// Database connection pool
#[derive(Clone)]
pub enum Database {
    Sqlite(Pool<Sqlite>),
    Postgres(Pool<Postgres>),
}

impl Database {
    /// Connect to the database using configuration
    pub async fn connect() -> anyhow::Result<Self> {
        let url = &CONFIG.database.url;

        if url.starts_with("postgres://") || url.starts_with("postgresql://") {
            info!("Connecting to PostgreSQL database...");
            let pool = PgPoolOptions::new()
                .max_connections(CONFIG.database.max_connections)
                .min_connections(CONFIG.database.min_connections)
                .acquire_timeout(Duration::from_secs(CONFIG.database.connect_timeout_secs))
                .connect(url)
                .await?;

            info!("PostgreSQL connection established");
            Ok(Database::Postgres(pool))
        } else if url.starts_with("sqlite://") {
            info!("Connecting to SQLite database...");

            // Ensure data directory exists for SQLite
            if let Some(path) = url.strip_prefix("sqlite://") {
                if let Some(dir) = std::path::Path::new(path.split('?').next().unwrap_or(path)).parent() {
                    if !dir.exists() {
                        std::fs::create_dir_all(dir)?;
                    }
                }
            }

            let pool = SqlitePoolOptions::new()
                .max_connections(CONFIG.database.max_connections)
                .min_connections(CONFIG.database.min_connections)
                .acquire_timeout(Duration::from_secs(CONFIG.database.connect_timeout_secs))
                .connect(url)
                .await?;

            info!("SQLite connection established");
            Ok(Database::Sqlite(pool))
        } else {
            anyhow::bail!("Unsupported database URL: {}", url);
        }
    }

    /// Run database migrations
    pub async fn run_migrations(&self) -> anyhow::Result<()> {
        info!("Running database migrations...");

        match self {
            Database::Sqlite(pool) => {
                sqlx::migrate!("./migrations/sqlite")
                    .run(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::migrate!("./migrations/postgres")
                    .run(pool)
                    .await?;
            }
        }

        info!("Migrations completed successfully");
        Ok(())
    }

    /// Check database health
    pub async fn health_check(&self) -> bool {
        match self {
            Database::Sqlite(pool) => {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .is_ok()
            }
            Database::Postgres(pool) => {
                sqlx::query("SELECT 1")
                    .fetch_one(pool)
                    .await
                    .is_ok()
            }
        }
    }
}

impl Database {
    /// Get a validator earnings repository
    pub fn validator_earnings(&self) -> repository::ValidatorEarningsRepository<'_> {
        repository::ValidatorEarningsRepository::new(self)
    }
}

/// Database error types
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Database connection error: {0}")]
    Connection(#[from] sqlx::Error),

    #[error("Record not found: {0}")]
    NotFound(String),

    #[error("Duplicate record: {0}")]
    Duplicate(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Transaction failed: {0}")]
    TransactionFailed(String),
}
