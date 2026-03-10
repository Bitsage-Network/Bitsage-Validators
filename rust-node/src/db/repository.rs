//! Database Repository
//!
//! Data access layer with CRUD operations for all entities.

use chrono::{DateTime, Utc};
use uuid::Uuid;
use tracing::{info, debug, error};

use super::{Database, DbError};
use super::models::*;

/// Repository for worker operations
pub struct WorkerRepository<'a> {
    db: &'a Database,
}

impl<'a> WorkerRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn upsert(&self, worker: &DbWorker) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO workers (id, owner_wallet, gpu_model, gpu_backend, vram_gb, capacity, status, active_workload, last_heartbeat, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        owner_wallet = excluded.owner_wallet,
                        gpu_model = excluded.gpu_model,
                        gpu_backend = excluded.gpu_backend,
                        vram_gb = excluded.vram_gb,
                        capacity = excluded.capacity,
                        status = excluded.status,
                        active_workload = excluded.active_workload,
                        last_heartbeat = excluded.last_heartbeat,
                        updated_at = excluded.updated_at
                "#)
                .bind(&worker.id)
                .bind(&worker.owner_wallet)
                .bind(&worker.gpu_model)
                .bind(&worker.gpu_backend)
                .bind(&worker.vram_gb)
                .bind(&worker.capacity)
                .bind(&worker.status)
                .bind(&worker.active_workload)
                .bind(&worker.last_heartbeat)
                .bind(&worker.created_at)
                .bind(&worker.updated_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO workers (id, owner_wallet, gpu_model, gpu_backend, vram_gb, capacity, status, active_workload, last_heartbeat, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT(id) DO UPDATE SET
                        owner_wallet = EXCLUDED.owner_wallet,
                        gpu_model = EXCLUDED.gpu_model,
                        gpu_backend = EXCLUDED.gpu_backend,
                        vram_gb = EXCLUDED.vram_gb,
                        capacity = EXCLUDED.capacity,
                        status = EXCLUDED.status,
                        active_workload = EXCLUDED.active_workload,
                        last_heartbeat = EXCLUDED.last_heartbeat,
                        updated_at = EXCLUDED.updated_at
                "#)
                .bind(&worker.id)
                .bind(&worker.owner_wallet)
                .bind(&worker.gpu_model)
                .bind(&worker.gpu_backend)
                .bind(&worker.vram_gb)
                .bind(&worker.capacity)
                .bind(&worker.status)
                .bind(&worker.active_workload)
                .bind(&worker.last_heartbeat)
                .bind(&worker.created_at)
                .bind(&worker.updated_at)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<DbWorker>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE id = ?")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE id = $1")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_owner(&self, wallet: &str) -> Result<Vec<DbWorker>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE owner_wallet = ? LIMIT 1000")
                    .bind(wallet)
                    .fetch_all(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE owner_wallet = $1 LIMIT 1000")
                    .bind(wallet)
                    .fetch_all(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_online(&self) -> Result<Vec<DbWorker>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE status = 'online' LIMIT 10000")
                    .fetch_all(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbWorker>("SELECT * FROM workers WHERE status = 'online' LIMIT 10000")
                    .fetch_all(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn update_status(&self, id: &str, status: &str, active_workload: Option<&str>) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("UPDATE workers SET status = ?, active_workload = ?, updated_at = ? WHERE id = ?")
                    .bind(status)
                    .bind(active_workload)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("UPDATE workers SET status = $1, active_workload = $2, updated_at = $3 WHERE id = $4")
                    .bind(status)
                    .bind(active_workload)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn update_heartbeat(&self, id: &str) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("UPDATE workers SET last_heartbeat = ?, updated_at = ? WHERE id = ?")
                    .bind(now)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("UPDATE workers SET last_heartbeat = $1, updated_at = $2 WHERE id = $3")
                    .bind(now)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("DELETE FROM workers WHERE id = ?")
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("DELETE FROM workers WHERE id = $1")
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }
}

/// Repository for deployment operations
pub struct DeploymentRepository<'a> {
    db: &'a Database,
}

impl<'a> DeploymentRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, deployment: &DbDeployment) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO deployments (id, workload_id, worker_id, owner_wallet, status, container_id, progress_phase, progress_percent, error_message, created_at, updated_at, ready_at, stopped_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&deployment.id)
                .bind(&deployment.workload_id)
                .bind(&deployment.worker_id)
                .bind(&deployment.owner_wallet)
                .bind(&deployment.status)
                .bind(&deployment.container_id)
                .bind(&deployment.progress_phase)
                .bind(&deployment.progress_percent)
                .bind(&deployment.error_message)
                .bind(&deployment.created_at)
                .bind(&deployment.updated_at)
                .bind(&deployment.ready_at)
                .bind(&deployment.stopped_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO deployments (id, workload_id, worker_id, owner_wallet, status, container_id, progress_phase, progress_percent, error_message, created_at, updated_at, ready_at, stopped_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                "#)
                .bind(&deployment.id)
                .bind(&deployment.workload_id)
                .bind(&deployment.worker_id)
                .bind(&deployment.owner_wallet)
                .bind(&deployment.status)
                .bind(&deployment.container_id)
                .bind(&deployment.progress_phase)
                .bind(&deployment.progress_percent)
                .bind(&deployment.error_message)
                .bind(&deployment.created_at)
                .bind(&deployment.updated_at)
                .bind(&deployment.ready_at)
                .bind(&deployment.stopped_at)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_id(&self, id: &Uuid) -> Result<Option<DbDeployment>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbDeployment>("SELECT * FROM deployments WHERE id = ?")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbDeployment>("SELECT * FROM deployments WHERE id = $1")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_owner(&self, wallet: &str) -> Result<Vec<DbDeployment>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE owner_wallet = ? ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE owner_wallet = $1 ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    /// Find all non-terminal deployments (for recovery after coordinator restart)
    pub async fn find_active(&self) -> Result<Vec<DbDeployment>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE status NOT IN ('stopped', 'failed') ORDER BY created_at DESC LIMIT 10000"
                )
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE status NOT IN ('stopped', 'failed') ORDER BY created_at DESC LIMIT 10000"
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_active_by_worker(&self, worker_id: &str) -> Result<Vec<DbDeployment>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE worker_id = ? AND status NOT IN ('stopped', 'failed')"
                )
                .bind(worker_id)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbDeployment>(
                    "SELECT * FROM deployments WHERE worker_id = $1 AND status NOT IN ('stopped', 'failed')"
                )
                .bind(worker_id)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn update_status(
        &self,
        id: &Uuid,
        status: &str,
        progress_phase: Option<&str>,
        progress_percent: Option<i32>,
        error_message: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE deployments SET status = ?, progress_phase = ?, progress_percent = ?, error_message = ?, updated_at = ?, ready_at = CASE WHEN ? = 'ready' THEN ? ELSE ready_at END WHERE id = ?"
                )
                .bind(status)
                .bind(progress_phase)
                .bind(progress_percent)
                .bind(error_message)
                .bind(now)
                .bind(status)
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE deployments SET status = $1, progress_phase = $2, progress_percent = $3, error_message = $4, updated_at = $5, ready_at = CASE WHEN $6 = 'ready' THEN $7 ELSE ready_at END WHERE id = $8"
                )
                .bind(status)
                .bind(progress_phase)
                .bind(progress_percent)
                .bind(error_message)
                .bind(now)
                .bind(status)
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }
}

/// Repository for marketplace GPU operations
pub struct MarketplaceGpuRepository<'a> {
    db: &'a Database,
}

impl<'a> MarketplaceGpuRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn upsert(&self, gpu: &DbMarketplaceGpu) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO marketplace_gpus (
                        id, validator_wallet, gpu_model, vram_gb, gpu_backend, mig_capable,
                        availability, availability_data, rate_sage_per_hour, uptime_percent,
                        total_rentals, rating, region, supported_templates, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        validator_wallet = excluded.validator_wallet,
                        gpu_model = excluded.gpu_model,
                        vram_gb = excluded.vram_gb,
                        gpu_backend = excluded.gpu_backend,
                        mig_capable = excluded.mig_capable,
                        availability = excluded.availability,
                        availability_data = excluded.availability_data,
                        rate_sage_per_hour = excluded.rate_sage_per_hour,
                        uptime_percent = excluded.uptime_percent,
                        total_rentals = excluded.total_rentals,
                        rating = excluded.rating,
                        region = excluded.region,
                        supported_templates = excluded.supported_templates,
                        updated_at = excluded.updated_at
                "#)
                .bind(&gpu.id)
                .bind(&gpu.validator_wallet)
                .bind(&gpu.gpu_model)
                .bind(&gpu.vram_gb)
                .bind(&gpu.gpu_backend)
                .bind(&gpu.mig_capable)
                .bind(&gpu.availability)
                .bind(&gpu.availability_data)
                .bind(&gpu.rate_sage_per_hour)
                .bind(&gpu.uptime_percent)
                .bind(&gpu.total_rentals)
                .bind(&gpu.rating)
                .bind(&gpu.region)
                .bind(&gpu.supported_templates)
                .bind(&gpu.created_at)
                .bind(&gpu.updated_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO marketplace_gpus (
                        id, validator_wallet, gpu_model, vram_gb, gpu_backend, mig_capable,
                        availability, availability_data, rate_sage_per_hour, uptime_percent,
                        total_rentals, rating, region, supported_templates, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    ON CONFLICT(id) DO UPDATE SET
                        validator_wallet = EXCLUDED.validator_wallet,
                        gpu_model = EXCLUDED.gpu_model,
                        vram_gb = EXCLUDED.vram_gb,
                        gpu_backend = EXCLUDED.gpu_backend,
                        mig_capable = EXCLUDED.mig_capable,
                        availability = EXCLUDED.availability,
                        availability_data = EXCLUDED.availability_data,
                        rate_sage_per_hour = EXCLUDED.rate_sage_per_hour,
                        uptime_percent = EXCLUDED.uptime_percent,
                        total_rentals = EXCLUDED.total_rentals,
                        rating = EXCLUDED.rating,
                        region = EXCLUDED.region,
                        supported_templates = EXCLUDED.supported_templates,
                        updated_at = EXCLUDED.updated_at
                "#)
                .bind(&gpu.id)
                .bind(&gpu.validator_wallet)
                .bind(&gpu.gpu_model)
                .bind(&gpu.vram_gb)
                .bind(&gpu.gpu_backend)
                .bind(&gpu.mig_capable)
                .bind(&gpu.availability)
                .bind(&gpu.availability_data)
                .bind(&gpu.rate_sage_per_hour)
                .bind(&gpu.uptime_percent)
                .bind(&gpu.total_rentals)
                .bind(&gpu.rating)
                .bind(&gpu.region)
                .bind(&gpu.supported_templates)
                .bind(&gpu.created_at)
                .bind(&gpu.updated_at)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<DbMarketplaceGpu>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>("SELECT * FROM marketplace_gpus WHERE id = ?")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>("SELECT * FROM marketplace_gpus WHERE id = $1")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_all(&self) -> Result<Vec<DbMarketplaceGpu>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>("SELECT * FROM marketplace_gpus ORDER BY rate_sage_per_hour ASC LIMIT 5000")
                    .fetch_all(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>("SELECT * FROM marketplace_gpus ORDER BY rate_sage_per_hour ASC LIMIT 5000")
                    .fetch_all(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_available(&self) -> Result<Vec<DbMarketplaceGpu>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>(
                    "SELECT * FROM marketplace_gpus WHERE availability IN ('available', 'partially_available') ORDER BY rate_sage_per_hour ASC LIMIT 5000"
                )
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>(
                    "SELECT * FROM marketplace_gpus WHERE availability IN ('available', 'partially_available') ORDER BY rate_sage_per_hour ASC LIMIT 5000"
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_validator(&self, wallet: &str) -> Result<Vec<DbMarketplaceGpu>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>(
                    "SELECT * FROM marketplace_gpus WHERE validator_wallet = ? LIMIT 1000"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbMarketplaceGpu>(
                    "SELECT * FROM marketplace_gpus WHERE validator_wallet = $1 LIMIT 1000"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn update_availability(&self, id: &str, availability: &str, availability_data: Option<&str>) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE marketplace_gpus SET availability = ?, availability_data = ?, updated_at = ? WHERE id = ?"
                )
                .bind(availability)
                .bind(availability_data)
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE marketplace_gpus SET availability = $1, availability_data = $2, updated_at = $3 WHERE id = $4"
                )
                .bind(availability)
                .bind(availability_data)
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn increment_rentals(&self, id: &str) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE marketplace_gpus SET total_rentals = total_rentals + 1, updated_at = ? WHERE id = ?"
                )
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE marketplace_gpus SET total_rentals = total_rentals + 1, updated_at = $1 WHERE id = $2"
                )
                .bind(now)
                .bind(id)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("DELETE FROM marketplace_gpus WHERE id = ?")
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("DELETE FROM marketplace_gpus WHERE id = $1")
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }
}

/// Repository for rental operations
pub struct RentalRepository<'a> {
    db: &'a Database,
}

impl<'a> RentalRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, rental: &DbRentalSession) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO rental_sessions (
                        id, tenant_wallet, validator_wallet, template_id, gpu_id, container_id,
                        status, rate_sage_per_hour, total_spent, started_at, expires_at, last_billed_at,
                        ssh_host, ssh_port, ssh_username, ssh_method, jupyter_url, jupyter_token,
                        api_endpoint, error_message, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&rental.id)
                .bind(&rental.tenant_wallet)
                .bind(&rental.validator_wallet)
                .bind(&rental.template_id)
                .bind(&rental.gpu_id)
                .bind(&rental.container_id)
                .bind(&rental.status)
                .bind(&rental.rate_sage_per_hour)
                .bind(&rental.total_spent)
                .bind(&rental.started_at)
                .bind(&rental.expires_at)
                .bind(&rental.last_billed_at)
                .bind(&rental.ssh_host)
                .bind(&rental.ssh_port)
                .bind(&rental.ssh_username)
                .bind(&rental.ssh_method)
                .bind(&rental.jupyter_url)
                .bind(&rental.jupyter_token)
                .bind(&rental.api_endpoint)
                .bind(&rental.error_message)
                .bind(&rental.created_at)
                .bind(&rental.updated_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO rental_sessions (
                        id, tenant_wallet, validator_wallet, template_id, gpu_id, container_id,
                        status, rate_sage_per_hour, total_spent, started_at, expires_at, last_billed_at,
                        ssh_host, ssh_port, ssh_username, ssh_method, jupyter_url, jupyter_token,
                        api_endpoint, error_message, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                "#)
                .bind(&rental.id)
                .bind(&rental.tenant_wallet)
                .bind(&rental.validator_wallet)
                .bind(&rental.template_id)
                .bind(&rental.gpu_id)
                .bind(&rental.container_id)
                .bind(&rental.status)
                .bind(&rental.rate_sage_per_hour)
                .bind(&rental.total_spent)
                .bind(&rental.started_at)
                .bind(&rental.expires_at)
                .bind(&rental.last_billed_at)
                .bind(&rental.ssh_host)
                .bind(&rental.ssh_port)
                .bind(&rental.ssh_username)
                .bind(&rental.ssh_method)
                .bind(&rental.jupyter_url)
                .bind(&rental.jupyter_token)
                .bind(&rental.api_endpoint)
                .bind(&rental.error_message)
                .bind(&rental.created_at)
                .bind(&rental.updated_at)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_id(&self, id: &Uuid) -> Result<Option<DbRentalSession>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbRentalSession>("SELECT * FROM rental_sessions WHERE id = ?")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbRentalSession>("SELECT * FROM rental_sessions WHERE id = $1")
                    .bind(id)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn find_active(&self) -> Result<Vec<DbRentalSession>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE status IN ('running', 'suspended') LIMIT 10000"
                )
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE status IN ('running', 'suspended') LIMIT 10000"
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_expired(&self) -> Result<Vec<DbRentalSession>, DbError> {
        let now = Utc::now();
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE status = 'running' AND expires_at <= ?"
                )
                .bind(now)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE status = 'running' AND expires_at <= $1"
                )
                .bind(now)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn update_status(&self, id: &Uuid, status: &str, error: Option<&str>) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("UPDATE rental_sessions SET status = ?, error_message = ?, updated_at = ? WHERE id = ?")
                    .bind(status)
                    .bind(error)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("UPDATE rental_sessions SET status = $1, error_message = $2, updated_at = $3 WHERE id = $4")
                    .bind(status)
                    .bind(error)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn update_billing(&self, id: &Uuid, total_spent: i64) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query("UPDATE rental_sessions SET total_spent = ?, last_billed_at = ?, updated_at = ? WHERE id = ?")
                    .bind(total_spent)
                    .bind(now)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query("UPDATE rental_sessions SET total_spent = $1, last_billed_at = $2, updated_at = $3 WHERE id = $4")
                    .bind(total_spent)
                    .bind(now)
                    .bind(now)
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_tenant(&self, wallet: &str) -> Result<Vec<DbRentalSession>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE tenant_wallet = ? ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE tenant_wallet = $1 ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_validator(&self, wallet: &str) -> Result<Vec<DbRentalSession>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE validator_wallet = ? ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbRentalSession>(
                    "SELECT * FROM rental_sessions WHERE validator_wallet = $1 ORDER BY created_at DESC LIMIT 500"
                )
                .bind(wallet)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }
}

/// Repository for escrow balance operations
pub struct EscrowRepository<'a> {
    db: &'a Database,
}

impl<'a> EscrowRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn get_or_create(&self, wallet: &str) -> Result<DbEscrowBalance, DbError> {
        let existing = self.find_by_wallet(wallet).await?;
        if let Some(balance) = existing {
            return Ok(balance);
        }

        let now = Utc::now();
        let balance = DbEscrowBalance {
            wallet: wallet.to_string(),
            total_deposited: 0,
            total_spent: 0,
            available: 0,
            reserved: 0,
            created_at: now,
            updated_at: now,
        };

        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO escrow_balances (wallet, total_deposited, total_spent, available, reserved, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&balance.wallet)
                .bind(&balance.total_deposited)
                .bind(&balance.total_spent)
                .bind(&balance.available)
                .bind(&balance.reserved)
                .bind(&balance.created_at)
                .bind(&balance.updated_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO escrow_balances (wallet, total_deposited, total_spent, available, reserved, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#)
                .bind(&balance.wallet)
                .bind(&balance.total_deposited)
                .bind(&balance.total_spent)
                .bind(&balance.available)
                .bind(&balance.reserved)
                .bind(&balance.created_at)
                .bind(&balance.updated_at)
                .execute(pool)
                .await?;
            }
        }

        Ok(balance)
    }

    pub async fn find_by_wallet(&self, wallet: &str) -> Result<Option<DbEscrowBalance>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbEscrowBalance>("SELECT * FROM escrow_balances WHERE wallet = ?")
                    .bind(wallet)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbEscrowBalance>("SELECT * FROM escrow_balances WHERE wallet = $1")
                    .bind(wallet)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn deposit(&self, wallet: &str, amount: i64) -> Result<DbEscrowBalance, DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO escrow_balances (wallet, total_deposited, total_spent, available, reserved, created_at, updated_at)
                    VALUES (?, ?, 0, ?, 0, ?, ?)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_deposited = escrow_balances.total_deposited + ?,
                        available = escrow_balances.available + ?,
                        updated_at = ?
                "#)
                .bind(wallet)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO escrow_balances (wallet, total_deposited, total_spent, available, reserved, created_at, updated_at)
                    VALUES ($1, $2, 0, $3, 0, $4, $5)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_deposited = escrow_balances.total_deposited + $6,
                        available = escrow_balances.available + $7,
                        updated_at = $8
                "#)
                .bind(wallet)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }

        self.get_or_create(wallet).await
    }

    pub async fn reserve(&self, wallet: &str, amount: i64) -> Result<bool, DbError> {
        let now = Utc::now();
        let rows_affected = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET available = available - ?, reserved = reserved + ?, updated_at = ? WHERE wallet = ? AND available >= ?"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET available = available - $1, reserved = reserved + $2, updated_at = $3 WHERE wallet = $4 AND available >= $5"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
        };

        Ok(rows_affected > 0)
    }

    pub async fn charge(&self, wallet: &str, amount: i64) -> Result<bool, DbError> {
        let now = Utc::now();
        let rows_affected = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET reserved = reserved - ?, total_spent = total_spent + ?, updated_at = ? WHERE wallet = ? AND reserved >= ?"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET reserved = reserved - $1, total_spent = total_spent + $2, updated_at = $3 WHERE wallet = $4 AND reserved >= $5"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
        };

        Ok(rows_affected > 0)
    }

    pub async fn release(&self, wallet: &str, amount: i64) -> Result<bool, DbError> {
        let now = Utc::now();
        let rows_affected = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET reserved = reserved - ?, available = available + ?, updated_at = ? WHERE wallet = ? AND reserved >= ?"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE escrow_balances SET reserved = reserved - $1, available = available + $2, updated_at = $3 WHERE wallet = $4 AND reserved >= $5"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
        };

        Ok(rows_affected > 0)
    }
}

/// Repository for billing records
pub struct BillingRecordRepository<'a> {
    db: &'a Database,
}

impl<'a> BillingRecordRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, record: &DbBillingRecord) -> Result<(), DbError> {
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO billing_records (id, rental_id, tenant_wallet, validator_wallet, amount, period_start, period_end, tx_hash, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&record.id)
                .bind(&record.rental_id)
                .bind(&record.tenant_wallet)
                .bind(&record.validator_wallet)
                .bind(&record.amount)
                .bind(&record.period_start)
                .bind(&record.period_end)
                .bind(&record.tx_hash)
                .bind(&record.created_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO billing_records (id, rental_id, tenant_wallet, validator_wallet, amount, period_start, period_end, tx_hash, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#)
                .bind(&record.id)
                .bind(&record.rental_id)
                .bind(&record.tenant_wallet)
                .bind(&record.validator_wallet)
                .bind(&record.amount)
                .bind(&record.period_start)
                .bind(&record.period_end)
                .bind(&record.tx_hash)
                .bind(&record.created_at)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn find_by_rental(&self, rental_id: &Uuid) -> Result<Vec<DbBillingRecord>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE rental_id = ? ORDER BY created_at DESC LIMIT 10000"
                )
                .bind(rental_id)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE rental_id = $1 ORDER BY created_at DESC LIMIT 10000"
                )
                .bind(rental_id)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_tenant(&self, wallet: &str, limit: i64) -> Result<Vec<DbBillingRecord>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE tenant_wallet = ? ORDER BY created_at DESC LIMIT ?"
                )
                .bind(wallet)
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE tenant_wallet = $1 ORDER BY created_at DESC LIMIT $2"
                )
                .bind(wallet)
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }

    pub async fn find_by_validator(&self, wallet: &str, limit: i64) -> Result<Vec<DbBillingRecord>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE validator_wallet = ? ORDER BY created_at DESC LIMIT ?"
                )
                .bind(wallet)
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbBillingRecord>(
                    "SELECT * FROM billing_records WHERE validator_wallet = $1 ORDER BY created_at DESC LIMIT $2"
                )
                .bind(wallet)
                .bind(limit)
                .fetch_all(pool)
                .await?
            }
        };
        Ok(result)
    }
}

/// Repository for validator earnings
pub struct ValidatorEarningsRepository<'a> {
    db: &'a Database,
}

impl<'a> ValidatorEarningsRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn get_or_create(&self, wallet: &str) -> Result<DbValidatorEarnings, DbError> {
        let existing = self.find_by_wallet(wallet).await?;
        if let Some(earnings) = existing {
            return Ok(earnings);
        }

        let now = Utc::now();
        let earnings = DbValidatorEarnings {
            wallet: wallet.to_string(),
            total_earned: 0,
            total_withdrawn: 0,
            available: 0,
            active_rentals: 0,
            last_earned_at: None,
            created_at: now,
            updated_at: now,
        };

        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, last_earned_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&earnings.wallet)
                .bind(&earnings.total_earned)
                .bind(&earnings.total_withdrawn)
                .bind(&earnings.available)
                .bind(&earnings.active_rentals)
                .bind(&earnings.last_earned_at)
                .bind(&earnings.created_at)
                .bind(&earnings.updated_at)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, last_earned_at, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#)
                .bind(&earnings.wallet)
                .bind(&earnings.total_earned)
                .bind(&earnings.total_withdrawn)
                .bind(&earnings.available)
                .bind(&earnings.active_rentals)
                .bind(&earnings.last_earned_at)
                .bind(&earnings.created_at)
                .bind(&earnings.updated_at)
                .execute(pool)
                .await?;
            }
        }

        Ok(earnings)
    }

    pub async fn find_by_wallet(&self, wallet: &str) -> Result<Option<DbValidatorEarnings>, DbError> {
        let result = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query_as::<_, DbValidatorEarnings>("SELECT * FROM validator_earnings WHERE wallet = ?")
                    .bind(wallet)
                    .fetch_optional(pool)
                    .await?
            }
            Database::Postgres(pool) => {
                sqlx::query_as::<_, DbValidatorEarnings>("SELECT * FROM validator_earnings WHERE wallet = $1")
                    .bind(wallet)
                    .fetch_optional(pool)
                    .await?
            }
        };
        Ok(result)
    }

    pub async fn add_earnings(&self, wallet: &str, amount: i64) -> Result<DbValidatorEarnings, DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, last_earned_at, created_at, updated_at)
                    VALUES (?, ?, 0, ?, 0, ?, ?, ?)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_earned = validator_earnings.total_earned + ?,
                        available = validator_earnings.available + ?,
                        last_earned_at = ?,
                        updated_at = ?
                "#)
                .bind(wallet)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .bind(now)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, last_earned_at, created_at, updated_at)
                    VALUES ($1, $2, 0, $3, 0, $4, $5, $6)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_earned = validator_earnings.total_earned + $7,
                        available = validator_earnings.available + $8,
                        last_earned_at = $9,
                        updated_at = $10
                "#)
                .bind(wallet)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .bind(now)
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }

        self.get_or_create(wallet).await
    }

    pub async fn record_withdrawal(&self, wallet: &str, amount: i64) -> Result<bool, DbError> {
        let now = Utc::now();
        let rows_affected = match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE validator_earnings SET available = available - ?, total_withdrawn = total_withdrawn + ?, updated_at = ? WHERE wallet = ? AND available >= ?"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE validator_earnings SET available = available - $1, total_withdrawn = total_withdrawn + $2, updated_at = $3 WHERE wallet = $4 AND available >= $5"
                )
                .bind(amount)
                .bind(amount)
                .bind(now)
                .bind(wallet)
                .bind(amount)
                .execute(pool)
                .await?
                .rows_affected()
            }
        };

        Ok(rows_affected > 0)
    }

    pub async fn update_active_rentals(&self, wallet: &str, delta: i32) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(
                    "UPDATE validator_earnings SET active_rentals = MAX(0, active_rentals + ?), updated_at = ? WHERE wallet = ?"
                )
                .bind(delta)
                .bind(now)
                .bind(wallet)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(
                    "UPDATE validator_earnings SET active_rentals = GREATEST(0, active_rentals + $1), updated_at = $2 WHERE wallet = $3"
                )
                .bind(delta)
                .bind(now)
                .bind(wallet)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn sync_from_chain(&self, wallet: &str, available: i64, total_earned: i64, total_withdrawn: i64) -> Result<(), DbError> {
        let now = Utc::now();
        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 0, ?, ?)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_earned = ?,
                        total_withdrawn = ?,
                        available = ?,
                        updated_at = ?
                "#)
                .bind(wallet)
                .bind(total_earned)
                .bind(total_withdrawn)
                .bind(available)
                .bind(now)
                .bind(now)
                .bind(total_earned)
                .bind(total_withdrawn)
                .bind(available)
                .bind(now)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO validator_earnings (wallet, total_earned, total_withdrawn, available, active_rentals, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, 0, $5, $6)
                    ON CONFLICT(wallet) DO UPDATE SET
                        total_earned = $7,
                        total_withdrawn = $8,
                        available = $9,
                        updated_at = $10
                "#)
                .bind(wallet)
                .bind(total_earned)
                .bind(total_withdrawn)
                .bind(available)
                .bind(now)
                .bind(now)
                .bind(total_earned)
                .bind(total_withdrawn)
                .bind(available)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }
}

/// Repository for audit logging
pub struct AuditRepository<'a> {
    db: &'a Database,
}

impl<'a> AuditRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub async fn log(
        &self,
        event_type: &str,
        entity_type: &str,
        entity_id: &str,
        actor_wallet: Option<&str>,
        actor_ip: Option<&str>,
        details: Option<&str>,
    ) -> Result<(), DbError> {
        let id = Uuid::new_v4();
        let now = Utc::now();

        match self.db {
            Database::Sqlite(pool) => {
                sqlx::query(r#"
                    INSERT INTO audit_logs (id, event_type, entity_type, entity_id, actor_wallet, actor_ip, details, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#)
                .bind(&id)
                .bind(event_type)
                .bind(entity_type)
                .bind(entity_id)
                .bind(actor_wallet)
                .bind(actor_ip)
                .bind(details)
                .bind(now)
                .execute(pool)
                .await?;
            }
            Database::Postgres(pool) => {
                sqlx::query(r#"
                    INSERT INTO audit_logs (id, event_type, entity_type, entity_id, actor_wallet, actor_ip, details, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                "#)
                .bind(&id)
                .bind(event_type)
                .bind(entity_type)
                .bind(entity_id)
                .bind(actor_wallet)
                .bind(actor_ip)
                .bind(details)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }

        debug!(event = event_type, entity = entity_type, id = entity_id, "Audit log created");
        Ok(())
    }
}
