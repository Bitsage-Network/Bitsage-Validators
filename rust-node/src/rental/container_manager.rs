//! Container Manager
//!
//! Manages Docker containers for rental sessions using the bollard Docker API.
//! Supports both standard Docker and Kata Containers for enhanced isolation.

use std::collections::HashMap;
use std::sync::Arc;
use bollard::Docker;
use bollard::container::{
    Config, CreateContainerOptions, StartContainerOptions, StopContainerOptions,
    RemoveContainerOptions, LogsOptions, LogOutput, InspectContainerOptions,
};
use bollard::network::{CreateNetworkOptions, ConnectNetworkOptions};
use bollard::models::{
    HostConfig, PortBinding, DeviceRequest, Mount, MountTypeEnum,
    EndpointSettings,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use futures_util::StreamExt;
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use super::types::{
    RentalTemplate, GpuAllocation,
    ContainerConfig, NetworkConfig,
};

/// Manages container lifecycle using Docker API
pub struct ContainerManager {
    /// Docker client (None if Docker is unavailable)
    docker: Option<Arc<Docker>>,
    /// Container runtime type
    runtime: ContainerRuntime,
    /// Active containers
    containers: RwLock<HashMap<String, ContainerInfo>>,
    /// Network configurations per rental
    networks: RwLock<HashMap<Uuid, NetworkConfig>>,
    /// Allocated ports (to avoid conflicts)
    allocated_ports: RwLock<Vec<u16>>,
    /// Whether Docker is available
    docker_available: bool,
}

/// Container runtime type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerRuntime {
    /// Standard Docker
    Docker,
    /// Kata Containers (VM-level isolation)
    Kata,
}

/// Container information
#[derive(Debug, Clone)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub rental_id: Uuid,
    pub image: String,
    pub status: ContainerStatus,
    pub ports: Vec<(u16, u16)>, // (container_port, host_port)
    pub gpu_devices: Vec<String>,
    pub network: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerStatus {
    Creating,
    Running,
    Stopping,
    Stopped,
    Failed,
}

impl ContainerManager {
    /// Create a new container manager
    ///
    /// Attempts to connect to Docker daemon. If unavailable, the manager will
    /// gracefully degrade and return errors for container operations.
    pub fn new() -> Self {
        // Connect to Docker daemon
        let (docker, docker_available) = match Docker::connect_with_local_defaults() {
            Ok(d) => {
                info!("Connected to Docker daemon");
                (Some(Arc::new(d)), true)
            }
            Err(e) => {
                warn!(
                    error = %e,
                    "Failed to connect to Docker daemon. Container operations will be unavailable."
                );
                (None, false)
            }
        };

        // Detect if Kata is available, otherwise use Docker
        let runtime = if docker_available && Self::is_kata_available() {
            info!("Kata Containers available, using VM-level isolation");
            ContainerRuntime::Kata
        } else if docker_available {
            info!("Using standard Docker runtime");
            ContainerRuntime::Docker
        } else {
            info!("No container runtime available");
            ContainerRuntime::Docker
        };

        Self {
            docker,
            runtime,
            containers: RwLock::new(HashMap::new()),
            networks: RwLock::new(HashMap::new()),
            allocated_ports: RwLock::new(Vec::new()),
            docker_available,
        }
    }

    /// Create with a custom Docker client (for testing)
    pub fn with_docker(docker: Docker) -> Self {
        Self {
            docker: Some(Arc::new(docker)),
            runtime: ContainerRuntime::Docker,
            containers: RwLock::new(HashMap::new()),
            networks: RwLock::new(HashMap::new()),
            allocated_ports: RwLock::new(Vec::new()),
            docker_available: true,
        }
    }

    /// Check if Docker is available
    pub fn is_docker_available(&self) -> bool {
        self.docker_available
    }

    /// Get Docker client, returning an error if unavailable
    fn get_docker(&self) -> Result<&Docker, ContainerError> {
        self.docker.as_ref()
            .map(|d| d.as_ref())
            .ok_or_else(|| ContainerError::RuntimeError(
                "Docker daemon is not available. Please ensure Docker is running.".to_string()
            ))
    }

    /// Check if Kata Containers is available
    fn is_kata_available() -> bool {
        std::process::Command::new("kata-runtime")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Get the Docker client (returns error if unavailable)
    pub fn docker(&self) -> Result<&Docker, ContainerError> {
        self.get_docker()
    }

    /// Create a container for a rental
    pub async fn create_container(
        &self,
        rental_id: Uuid,
        template: &RentalTemplate,
        gpu_allocation: &GpuAllocation,
    ) -> Result<String, ContainerError> {
        // Use first 8 chars of UUID for container name
        let container_name = format!("rental-{}", &rental_id.to_string()[..8]);

        info!(
            container = %container_name,
            template = %template.id,
            rental_id = %rental_id,
            "Creating container"
        );

        // Build container config
        let config = self.build_container_config(template, gpu_allocation, &container_name)?;

        // Create network for isolation
        let network_name = format!("rental-net-{}", &rental_id.to_string()[..8]);
        self.create_network(&network_name).await?;

        // Build Docker container configuration
        let docker_config = self.build_docker_config(&config, &network_name).await?;

        // Create the container
        let create_options = CreateContainerOptions {
            name: &container_name,
            platform: None,
        };

        let docker = self.get_docker()?;
        let response = docker
            .create_container(Some(create_options), docker_config)
            .await
            .map_err(|e| ContainerError::CreateFailed(e.to_string()))?;

        let container_id = response.id;

        // Track container
        let mut containers = self.containers.write().await;
        containers.insert(container_id.clone(), ContainerInfo {
            id: container_id.clone(),
            name: container_name.clone(),
            rental_id,
            image: config.image.clone(),
            status: ContainerStatus::Creating,
            ports: config.port_mappings.clone(),
            gpu_devices: config.gpu_devices.clone(),
            network: network_name.clone(),
        });

        // Store network config
        let mut networks = self.networks.write().await;
        networks.insert(rental_id, NetworkConfig {
            name: network_name.clone(),
            subnet: "172.28.0.0/16".to_string(),
            gateway: "172.28.0.1".to_string(),
            container_ip: "172.28.0.2".to_string(),
        });

        info!(container = %container_id, name = %container_name, "Container created");
        Ok(container_id)
    }

    /// Build container configuration from template
    fn build_container_config(
        &self,
        template: &RentalTemplate,
        gpu_allocation: &GpuAllocation,
        container_name: &str,
    ) -> Result<ContainerConfig, ContainerError> {
        let gpu_devices = match gpu_allocation {
            GpuAllocation::Exclusive { gpu_uuid, .. } => {
                vec![gpu_uuid.clone()]
            }
            GpuAllocation::Mig { gi_id, ci_id, .. } => {
                vec![format!("MIG-{}/{}", gi_id, ci_id)]
            }
        };

        // Validate GPU device IDs to prevent injection via Docker device_ids.
        // Valid formats: "GPU-<hex-uuid>" or "MIG-<hex-uuid>/<gi>/<ci>" or bare hex UUID.
        for dev in &gpu_devices {
            let valid = dev.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '/' || c == '_');
            if !valid || dev.contains("..") || dev.is_empty() || dev.len() > 128 {
                return Err(ContainerError::CreateFailed(
                    format!("Invalid GPU device ID: {}", dev)
                ));
            }
        }

        let vram_gb = match gpu_allocation {
            GpuAllocation::Exclusive { vram_gb, .. } => *vram_gb,
            GpuAllocation::Mig { vram_gb, .. } => *vram_gb,
        };

        // Calculate memory limit (GPU VRAM + system overhead)
        let memory_limit = (vram_gb as u64 * 2 + 8) * 1024 * 1024 * 1024;

        // Build port mappings
        let mut port_mappings = Vec::new();

        if template.ssh_enabled {
            let ssh_host_port = self.allocate_port_sync();
            port_mappings.push((22, ssh_host_port));
        }

        if template.jupyter_enabled {
            let jupyter_host_port = self.allocate_port_sync();
            port_mappings.push((8888, jupyter_host_port));
        }

        for port in &template.extra_ports {
            let host_port = self.allocate_port_sync();
            port_mappings.push((*port, host_port));
        }

        // Environment variables
        let mut env_vars: Vec<(String, String)> = template.env_vars.clone();
        env_vars.push(("NVIDIA_VISIBLE_DEVICES".to_string(), gpu_devices.join(",")));
        env_vars.push(("NVIDIA_DRIVER_CAPABILITIES".to_string(), "compute,utility,graphics".to_string()));

        Ok(ContainerConfig {
            image: template.docker_image.clone(),
            name: container_name.to_string(),
            gpu_devices,
            memory_limit,
            cpu_quota: 4.0,
            port_mappings,
            env_vars,
            volumes: vec![
                (format!("/data/rentals/{}/workspace", container_name), "/workspace".to_string()),
            ],
            network: format!("rental-net-{}", &container_name[7..]),
            use_kata: matches!(self.runtime, ContainerRuntime::Kata),
        })
    }

    /// Build Docker API container configuration
    async fn build_docker_config(
        &self,
        config: &ContainerConfig,
        network_name: &str,
    ) -> Result<Config<String>, ContainerError> {
        // Build port bindings
        let mut port_bindings: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
        let mut exposed_ports: HashMap<String, HashMap<(), ()>> = HashMap::new();

        for (container_port, host_port) in &config.port_mappings {
            let port_key = format!("{}/tcp", container_port);
            exposed_ports.insert(port_key.clone(), HashMap::new());
            port_bindings.insert(port_key, Some(vec![PortBinding {
                host_ip: Some("0.0.0.0".to_string()),
                host_port: Some(host_port.to_string()),
            }]));
        }

        // Build mounts
        let mounts: Vec<Mount> = config.volumes.iter().map(|(host, container)| {
            Mount {
                target: Some(container.clone()),
                source: Some(host.clone()),
                typ: Some(MountTypeEnum::BIND),
                read_only: Some(false),
                ..Default::default()
            }
        }).collect();

        // Build device requests for GPU
        let device_requests = if !config.gpu_devices.is_empty() {
            Some(vec![DeviceRequest {
                driver: Some("nvidia".to_string()),
                count: Some(-1), // All GPUs specified by NVIDIA_VISIBLE_DEVICES
                device_ids: Some(config.gpu_devices.clone()),
                capabilities: Some(vec![vec!["gpu".to_string(), "compute".to_string(), "utility".to_string()]]),
                options: None,
            }])
        } else {
            None
        };

        // Build environment variables
        let env: Vec<String> = config.env_vars.iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        // Host configuration
        let host_config = HostConfig {
            port_bindings: Some(port_bindings),
            mounts: Some(mounts),
            memory: Some(config.memory_limit as i64),
            memory_swap: Some(config.memory_limit as i64), // No swap (equal to memory = swap disabled)
            nano_cpus: Some((config.cpu_quota * 1_000_000_000.0) as i64),
            pids_limit: Some(4096), // Prevent fork bombs
            device_requests,
            runtime: if config.use_kata { Some("kata".to_string()) } else { None },
            restart_policy: Some(bollard::models::RestartPolicy {
                name: Some(bollard::models::RestartPolicyNameEnum::UNLESS_STOPPED),
                maximum_retry_count: None,
            }),
            ..Default::default()
        };

        // Network configuration
        let mut endpoints_config: HashMap<String, EndpointSettings> = HashMap::new();
        endpoints_config.insert(network_name.to_string(), EndpointSettings {
            ..Default::default()
        });

        Ok(Config {
            image: Some(config.image.clone()),
            hostname: Some(config.name.clone()),
            env: Some(env),
            exposed_ports: Some(exposed_ports),
            host_config: Some(host_config),
            networking_config: Some(bollard::container::NetworkingConfig {
                endpoints_config,
            }),
            working_dir: Some("/workspace".to_string()),
            ..Default::default()
        })
    }

    /// Allocate a random high port, checking both system availability and tracked allocations.
    /// Uses blocking lock — only call from sync context within an async runtime.
    fn allocate_port_sync(&self) -> u16 {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let mut attempts = 0;
        loop {
            let port: u16 = rng.gen_range(30000..60000);
            attempts += 1;
            if attempts > 200 {
                error!("Failed to allocate port after 200 attempts");
                return port; // Fallback — unlikely in practice
            }
            // Check if port is already allocated to another rental
            if let Ok(allocated) = self.allocated_ports.try_read() {
                if allocated.contains(&port) {
                    continue;
                }
            }
            // Check if port is bindable on the system
            if std::net::TcpListener::bind(("0.0.0.0", port)).is_ok() {
                // Track the allocation
                if let Ok(mut allocated) = self.allocated_ports.try_write() {
                    allocated.push(port);
                }
                return port;
            }
        }
    }

    /// Start a container
    pub async fn start_container(&self, container_id: &str) -> Result<(), ContainerError> {
        info!(container = %container_id, "Starting container");

        let docker = self.get_docker()?;
        docker
            .start_container(container_id, None::<StartContainerOptions<String>>)
            .await
            .map_err(|e| ContainerError::StartFailed(e.to_string()))?;

        // Update status
        let mut containers = self.containers.write().await;
        if let Some(info) = containers.get_mut(container_id) {
            info.status = ContainerStatus::Running;
        }

        info!(container = %container_id, "Container started");
        Ok(())
    }

    /// Stop a container
    pub async fn stop_container(&self, container_id: &str) -> Result<(), ContainerError> {
        info!(container = %container_id, "Stopping container");

        // Update status first
        {
            let mut containers = self.containers.write().await;
            if let Some(info) = containers.get_mut(container_id) {
                info.status = ContainerStatus::Stopping;
            }
        }

        let options = StopContainerOptions { t: 30 };
        let docker = self.get_docker()?;
        docker
            .stop_container(container_id, Some(options))
            .await
            .map_err(|e| {
                // Ignore "container already stopped" errors
                if e.to_string().contains("is not running") {
                    return ContainerError::StopFailed("Container already stopped".to_string());
                }
                ContainerError::StopFailed(e.to_string())
            })?;

        // Update status
        let mut containers = self.containers.write().await;
        if let Some(info) = containers.get_mut(container_id) {
            info.status = ContainerStatus::Stopped;
        }

        info!(container = %container_id, "Container stopped");
        Ok(())
    }

    /// Remove a container and cleanup resources
    pub async fn remove_container(&self, container_id: &str) -> Result<(), ContainerError> {
        info!(container = %container_id, "Removing container");

        // Get container info before removal
        let container_info = {
            let containers = self.containers.read().await;
            containers.get(container_id).cloned()
        };

        // Remove container
        let options = RemoveContainerOptions {
            force: true,
            v: true, // Remove volumes
            ..Default::default()
        };

        let docker = self.get_docker()?;
        docker
            .remove_container(container_id, Some(options))
            .await
            .map_err(|e| ContainerError::RuntimeError(e.to_string()))?;

        // Cleanup network
        if let Some(info) = &container_info {
            self.remove_network(&info.network).await.ok();

            // Release allocated ports
            let mut allocated = self.allocated_ports.write().await;
            for (_, host_port) in &info.ports {
                allocated.retain(|p| p != host_port);
            }

            // Clean up workspace
            let workspace_path = format!("/data/rentals/{}/workspace", info.name);
            tokio::fs::remove_dir_all(&workspace_path).await.ok();
        }

        // Remove from tracking
        let mut containers = self.containers.write().await;
        containers.remove(container_id);

        info!(container = %container_id, "Container removed");
        Ok(())
    }

    /// Create an isolated network for a rental
    async fn create_network(&self, name: &str) -> Result<(), ContainerError> {
        debug!(network = %name, "Creating network");

        // Production: internal network (no outbound internet) unless explicitly allowed
        let is_production = std::env::var("PRODUCTION").is_ok() || std::env::var("BITSAGE_PRODUCTION").is_ok();
        let allow_outbound = std::env::var("RENTAL_ALLOW_OUTBOUND").is_ok();
        let internal = is_production && !allow_outbound;

        if internal {
            info!(network = %name, "Creating internal network (no outbound internet)");
        }

        let options = CreateNetworkOptions {
            name: name.to_string(),
            driver: "bridge".to_string(),
            internal,
            ..Default::default()
        };

        let docker = self.get_docker()?;
        match docker.create_network(options).await {
            Ok(_) => {
                debug!(network = %name, "Network created");
                Ok(())
            }
            Err(e) => {
                // Ignore if network already exists
                if e.to_string().contains("already exists") {
                    debug!(network = %name, "Network already exists");
                    Ok(())
                } else {
                    Err(ContainerError::NetworkError(e.to_string()))
                }
            }
        }
    }

    /// Remove a network
    async fn remove_network(&self, name: &str) -> Result<(), ContainerError> {
        debug!(network = %name, "Removing network");

        let docker = self.get_docker()?;
        docker
            .remove_network(name)
            .await
            .map_err(|e| ContainerError::NetworkError(e.to_string()))?;

        Ok(())
    }

    /// Get container port mapping
    pub async fn get_port_mapping(&self, container_id: &str, container_port: u16) -> Option<u16> {
        let containers = self.containers.read().await;
        containers.get(container_id)
            .and_then(|info| {
                info.ports.iter()
                    .find(|(c, _)| *c == container_port)
                    .map(|(_, h)| *h)
            })
    }

    /// Get container info
    pub async fn get_container_info(&self, container_id: &str) -> Option<ContainerInfo> {
        let containers = self.containers.read().await;
        containers.get(container_id).cloned()
    }

    /// Execute a command in a container
    pub async fn exec_in_container(&self, container_id: &str, cmd: &[&str]) -> Result<String, ContainerError> {
        let docker = self.get_docker()?;

        let exec_options = CreateExecOptions {
            cmd: Some(cmd.iter().map(|s| s.to_string()).collect()),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            ..Default::default()
        };

        let exec = docker
            .create_exec(container_id, exec_options)
            .await
            .map_err(|e| ContainerError::ExecFailed(e.to_string()))?;

        let start_result = docker
            .start_exec(&exec.id, None)
            .await
            .map_err(|e| ContainerError::ExecFailed(e.to_string()))?;

        let mut output = String::new();
        if let StartExecResults::Attached { output: mut stream, .. } = start_result {
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(LogOutput::StdOut { message }) => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    Ok(LogOutput::StdErr { message }) => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    _ => {}
                }
            }
        }

        Ok(output)
    }

    /// Get container logs
    pub async fn get_logs(&self, container_id: &str, lines: u32) -> Result<String, ContainerError> {
        let docker = self.get_docker()?;

        let options = LogsOptions::<String> {
            stdout: true,
            stderr: true,
            tail: lines.to_string(),
            ..Default::default()
        };

        let mut logs_stream = docker.logs(container_id, Some(options));
        let mut output = String::new();

        while let Some(log) = logs_stream.next().await {
            match log {
                Ok(LogOutput::StdOut { message }) => {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
                Ok(LogOutput::StdErr { message }) => {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
                Ok(LogOutput::Console { message }) => {
                    output.push_str(&String::from_utf8_lossy(&message));
                }
                Err(e) => {
                    warn!(error = %e, "Error reading logs");
                }
                _ => {}
            }
        }

        Ok(output)
    }

    /// Check if container is running
    pub async fn is_container_running(&self, container_id: &str) -> Result<bool, ContainerError> {
        let docker = self.get_docker()?;
        let inspect = docker
            .inspect_container(container_id, None::<InspectContainerOptions>)
            .await
            .map_err(|e| ContainerError::NotFound(e.to_string()))?;

        Ok(inspect.state
            .and_then(|s| s.running)
            .unwrap_or(false))
    }

    /// List all managed containers
    pub async fn list_containers(&self) -> Vec<ContainerInfo> {
        let containers = self.containers.read().await;
        containers.values().cloned().collect()
    }

    /// Get container stats (CPU, memory usage)
    pub async fn get_container_stats(&self, container_id: &str) -> Result<ContainerStats, ContainerError> {
        let docker = self.get_docker()?;
        let mut stats_stream = docker.stats(container_id, Some(bollard::container::StatsOptions {
            stream: false,
            one_shot: true,
        }));

        if let Some(Ok(stats)) = stats_stream.next().await {
            let cpu = &stats.cpu_stats;
            let precpu = &stats.precpu_stats;

            let cpu_delta = cpu.cpu_usage.total_usage.saturating_sub(
                precpu.cpu_usage.total_usage
            );
            let system_delta = cpu.system_cpu_usage.unwrap_or(0).saturating_sub(
                precpu.system_cpu_usage.unwrap_or(0)
            );
            let cpu_percent = if system_delta > 0 && cpu.online_cpus.unwrap_or(1) > 0 {
                (cpu_delta as f64 / system_delta as f64) * cpu.online_cpus.unwrap_or(1) as f64 * 100.0
            } else {
                0.0
            };

            let mem = &stats.memory_stats;
            let memory_used = mem.usage.unwrap_or(0);
            let memory_limit = mem.limit.unwrap_or(0);

            Ok(ContainerStats {
                cpu_percent,
                memory_used,
                memory_limit,
                memory_percent: if memory_limit > 0 {
                    (memory_used as f64 / memory_limit as f64) * 100.0
                } else {
                    0.0
                },
            })
        } else {
            Err(ContainerError::RuntimeError("Failed to get stats".to_string()))
        }
    }
}

impl Default for ContainerManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Container resource statistics
#[derive(Debug, Clone)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_used: u64,
    pub memory_limit: u64,
    pub memory_percent: f64,
}

/// Container-related errors
#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("Container creation failed: {0}")]
    CreateFailed(String),

    #[error("Container start failed: {0}")]
    StartFailed(String),

    #[error("Container stop failed: {0}")]
    StopFailed(String),

    #[error("Command execution failed: {0}")]
    ExecFailed(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Runtime error: {0}")]
    RuntimeError(String),

    #[error("Container not found: {0}")]
    NotFound(String),

    #[error("Image not found: {0}")]
    ImageNotFound(String),
}
