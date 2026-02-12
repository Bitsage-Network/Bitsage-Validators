//! Network Manager
//!
//! Provides network isolation for rental containers using Docker networks
//! and iptables rules. Ensures tenants cannot access each other's containers
//! while allowing outbound internet access.
//!
//! # Architecture
//!
//! ```text
//! Internet
//!     |
//! [Host Bridge]
//!     |
//!     ├── rental-net-abc123 (172.30.0.0/24)
//!     │   └── Container A (172.30.0.2)
//!     │
//!     ├── rental-net-def456 (172.30.1.0/24)
//!     │   └── Container B (172.30.1.2)
//!     │
//!     └── rental-net-ghi789 (172.30.2.0/24)
//!         └── Container C (172.30.2.2)
//!
//! iptables rules prevent:
//! - Container A <-> Container B traffic
//! - Container A <-> Container C traffic
//! - Container B <-> Container C traffic
//! ```

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

use bollard::Docker;
use bollard::network::{CreateNetworkOptions, InspectNetworkOptions, ListNetworksOptions};
use bollard::models::{Ipam, IpamConfig};
use thiserror::Error;
use tokio::process::Command;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use super::types::NetworkConfig;

/// Network isolation manager for multi-tenant GPU rentals
pub struct NetworkManager {
    /// Docker client
    docker: Option<Arc<Docker>>,
    /// Active networks by rental ID
    networks: RwLock<HashMap<Uuid, RentalNetwork>>,
    /// Next subnet index for allocation
    next_subnet: AtomicU8,
    /// Base subnet (172.30.x.0/24 where x is allocated)
    base_subnet: String,
    /// Whether Docker is available
    docker_available: bool,
    /// Whether iptables is available
    iptables_available: bool,
    /// Chain name for rental isolation rules
    chain_name: String,
}

/// Information about a rental's network
#[derive(Debug, Clone)]
pub struct RentalNetwork {
    /// Rental ID
    pub rental_id: Uuid,
    /// Docker network name
    pub network_name: String,
    /// Docker network ID
    pub network_id: String,
    /// Allocated subnet (e.g., "172.30.5.0/24")
    pub subnet: String,
    /// Gateway IP (e.g., "172.30.5.1")
    pub gateway: String,
    /// Container IP (e.g., "172.30.5.2")
    pub container_ip: String,
    /// Subnet index (the 'x' in 172.30.x.0)
    pub subnet_index: u8,
    /// Whether iptables rules are active
    pub isolation_active: bool,
}

#[derive(Debug, Error)]
pub enum NetworkError {
    #[error("Docker not available: {0}")]
    DockerUnavailable(String),

    #[error("Failed to create network: {0}")]
    CreateFailed(String),

    #[error("Failed to delete network: {0}")]
    DeleteFailed(String),

    #[error("Network not found: {0}")]
    NotFound(String),

    #[error("iptables command failed: {0}")]
    IptablesError(String),

    #[error("Subnet exhausted: no more subnets available")]
    SubnetExhausted,

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

impl NetworkManager {
    /// Create a new network manager
    pub fn new() -> Self {
        let (docker, docker_available) = match Docker::connect_with_local_defaults() {
            Ok(d) => {
                info!("NetworkManager: Connected to Docker daemon");
                (Some(Arc::new(d)), true)
            }
            Err(e) => {
                warn!(error = %e, "NetworkManager: Docker unavailable, network operations will fail");
                (None, false)
            }
        };

        let iptables_available = Self::check_iptables_available();
        if iptables_available {
            info!("NetworkManager: iptables available for network isolation");
        } else {
            warn!("NetworkManager: iptables not available, using Docker network isolation only");
        }

        Self {
            docker,
            networks: RwLock::new(HashMap::new()),
            next_subnet: AtomicU8::new(0),
            base_subnet: "172.30".to_string(),
            docker_available,
            iptables_available,
            chain_name: "BITSAGE_RENTAL_ISOLATION".to_string(),
        }
    }

    /// Create with custom Docker client (for testing)
    pub fn with_docker(docker: Docker) -> Self {
        Self {
            docker: Some(Arc::new(docker)),
            networks: RwLock::new(HashMap::new()),
            next_subnet: AtomicU8::new(0),
            base_subnet: "172.30".to_string(),
            docker_available: true,
            iptables_available: Self::check_iptables_available(),
            chain_name: "BITSAGE_RENTAL_ISOLATION".to_string(),
        }
    }

    /// Check if Docker is available
    pub fn is_docker_available(&self) -> bool {
        self.docker_available
    }

    /// Check if iptables isolation is available
    pub fn is_iptables_available(&self) -> bool {
        self.iptables_available
    }

    /// Get Docker client
    fn get_docker(&self) -> Result<&Docker, NetworkError> {
        self.docker.as_ref()
            .map(|d| d.as_ref())
            .ok_or_else(|| NetworkError::DockerUnavailable(
                "Docker daemon is not available".to_string()
            ))
    }

    /// Check if iptables is available on the system
    fn check_iptables_available() -> bool {
        std::process::Command::new("iptables")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Initialize the iptables chain for rental isolation
    pub async fn initialize_iptables_chain(&self) -> Result<(), NetworkError> {
        if !self.iptables_available {
            debug!("Skipping iptables initialization (not available)");
            return Ok(());
        }

        // Create custom chain if it doesn't exist
        let check_chain = Command::new("iptables")
            .args(["-n", "-L", &self.chain_name])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false);

        if !check_chain {
            // Create the chain
            let create_result = Command::new("iptables")
                .args(["-N", &self.chain_name])
                .output()
                .await
                .map_err(|e| NetworkError::IptablesError(e.to_string()))?;

            if !create_result.status.success() {
                let stderr = String::from_utf8_lossy(&create_result.stderr);
                // Ignore "chain already exists" error
                if !stderr.contains("already exists") {
                    return Err(NetworkError::IptablesError(stderr.to_string()));
                }
            }

            // Jump to our chain from FORWARD chain
            let _ = Command::new("iptables")
                .args(["-I", "FORWARD", "-j", &self.chain_name])
                .output()
                .await;

            info!(chain = %self.chain_name, "Created iptables chain for rental isolation");
        }

        Ok(())
    }

    /// Create an isolated network for a rental
    pub async fn create_network(&self, rental_id: Uuid) -> Result<RentalNetwork, NetworkError> {
        let docker = self.get_docker()?;

        // Allocate subnet index
        let subnet_index = self.allocate_subnet_index()?;
        let subnet = format!("{}.{}.0/24", self.base_subnet, subnet_index);
        let gateway = format!("{}.{}.1", self.base_subnet, subnet_index);
        let container_ip = format!("{}.{}.2", self.base_subnet, subnet_index);

        let network_name = format!("rental-net-{}", &rental_id.to_string()[..8]);

        info!(
            rental_id = %rental_id,
            network = %network_name,
            subnet = %subnet,
            "Creating isolated network"
        );

        // Configure IPAM for custom subnet
        let ipam_config = IpamConfig {
            subnet: Some(subnet.clone()),
            gateway: Some(gateway.clone()),
            ip_range: None,
            auxiliary_addresses: None,
        };

        let ipam = Ipam {
            driver: Some("default".to_string()),
            config: Some(vec![ipam_config]),
            options: None,
        };

        // Create Docker network with isolation options
        let create_options = CreateNetworkOptions {
            name: network_name.clone(),
            driver: "bridge".to_string(),
            internal: false, // Allow outbound internet
            enable_ipv6: false,
            ipam,
            options: {
                let mut opts = HashMap::new();
                // Enable inter-container communication within the same network
                opts.insert("com.docker.network.bridge.enable_icc".to_string(), "true".to_string());
                // Enable IP masquerading for outbound traffic
                opts.insert("com.docker.network.bridge.enable_ip_masquerade".to_string(), "true".to_string());
                // Isolate this network's bridge
                opts.insert("com.docker.network.bridge.host_binding_ipv4".to_string(), "0.0.0.0".to_string());
                opts
            },
            labels: {
                let mut labels = HashMap::new();
                labels.insert("bitsage.rental_id".to_string(), rental_id.to_string());
                labels.insert("bitsage.type".to_string(), "rental-network".to_string());
                labels
            },
            ..Default::default()
        };

        let response = docker
            .create_network(create_options)
            .await
            .map_err(|e| {
                // Release the subnet index if network creation fails
                self.release_subnet_index(subnet_index);
                NetworkError::CreateFailed(e.to_string())
            })?;

        let network_id = response.id.unwrap_or_else(|| network_name.clone());

        // Apply iptables isolation rules
        let isolation_active = self.apply_isolation_rules(rental_id, &subnet, subnet_index).await.is_ok();

        let rental_network = RentalNetwork {
            rental_id,
            network_name: network_name.clone(),
            network_id,
            subnet,
            gateway,
            container_ip,
            subnet_index,
            isolation_active,
        };

        // Store network info
        let mut networks = self.networks.write().await;
        networks.insert(rental_id, rental_network.clone());

        info!(
            rental_id = %rental_id,
            network = %network_name,
            isolation = %isolation_active,
            "Network created successfully"
        );

        Ok(rental_network)
    }

    /// Allocate a unique subnet index
    fn allocate_subnet_index(&self) -> Result<u8, NetworkError> {
        let index = self.next_subnet.fetch_add(1, Ordering::SeqCst);
        if index >= 250 {
            // Reset to allow reuse (simple approach - production should track in-use)
            self.next_subnet.store(0, Ordering::SeqCst);
            return Err(NetworkError::SubnetExhausted);
        }
        Ok(index)
    }

    /// Release a subnet index (for reuse after deletion)
    fn release_subnet_index(&self, _index: u8) {
        // In a production system, track released indexes for reuse
        // For now, we just let them cycle
    }

    /// Apply iptables rules to isolate this rental from others
    async fn apply_isolation_rules(
        &self,
        rental_id: Uuid,
        subnet: &str,
        subnet_index: u8,
    ) -> Result<(), NetworkError> {
        if !self.iptables_available {
            debug!(rental_id = %rental_id, "Skipping iptables rules (not available)");
            return Ok(());
        }

        // Initialize chain if needed
        self.initialize_iptables_chain().await?;

        // Rule: Block traffic from this subnet to other rental subnets (172.30.x.0/24)
        // But allow traffic to the internet and host services

        // Block traffic to other rental subnets
        for other_index in 0..=255u8 {
            if other_index == subnet_index {
                continue; // Don't block traffic to self
            }

            let other_subnet = format!("{}.{}.0/24", self.base_subnet, other_index);

            // Add rule to block this subnet -> other rental subnet
            let result = Command::new("iptables")
                .args([
                    "-A", &self.chain_name,
                    "-s", subnet,
                    "-d", &other_subnet,
                    "-j", "DROP",
                    "-m", "comment",
                    "--comment", &format!("rental-{}", &rental_id.to_string()[..8]),
                ])
                .output()
                .await;

            if let Err(e) = result {
                warn!(
                    rental_id = %rental_id,
                    error = %e,
                    "Failed to add iptables rule for subnet isolation"
                );
            }
        }

        // Allow established connections (for return traffic)
        let _ = Command::new("iptables")
            .args([
                "-A", &self.chain_name,
                "-s", subnet,
                "-m", "state",
                "--state", "ESTABLISHED,RELATED",
                "-j", "ACCEPT",
                "-m", "comment",
                "--comment", &format!("rental-{}-established", &rental_id.to_string()[..8]),
            ])
            .output()
            .await;

        // Allow outbound to internet (non-RFC1918)
        let _ = Command::new("iptables")
            .args([
                "-A", &self.chain_name,
                "-s", subnet,
                "!", "-d", "10.0.0.0/8",
                "!", "-d", "172.16.0.0/12",
                "!", "-d", "192.168.0.0/16",
                "-j", "ACCEPT",
                "-m", "comment",
                "--comment", &format!("rental-{}-internet", &rental_id.to_string()[..8]),
            ])
            .output()
            .await;

        info!(
            rental_id = %rental_id,
            subnet = %subnet,
            "Applied iptables isolation rules"
        );

        Ok(())
    }

    /// Remove iptables rules for a rental
    async fn remove_isolation_rules(&self, rental_id: Uuid) -> Result<(), NetworkError> {
        if !self.iptables_available {
            return Ok(());
        }

        let comment_pattern = format!("rental-{}", &rental_id.to_string()[..8]);

        // List rules and find ones matching our comment
        let list_result = Command::new("iptables")
            .args(["-L", &self.chain_name, "-n", "--line-numbers"])
            .output()
            .await
            .map_err(|e| NetworkError::IptablesError(e.to_string()))?;

        let output = String::from_utf8_lossy(&list_result.stdout);

        // Parse line numbers for rules with our comment (delete in reverse order)
        let mut line_numbers: Vec<u32> = Vec::new();
        for line in output.lines() {
            if line.contains(&comment_pattern) {
                if let Some(num_str) = line.split_whitespace().next() {
                    if let Ok(num) = num_str.parse::<u32>() {
                        line_numbers.push(num);
                    }
                }
            }
        }

        // Delete rules in reverse order (to preserve line numbers)
        line_numbers.sort();
        line_numbers.reverse();

        for line_num in line_numbers {
            let _ = Command::new("iptables")
                .args(["-D", &self.chain_name, &line_num.to_string()])
                .output()
                .await;
        }

        debug!(rental_id = %rental_id, "Removed iptables isolation rules");
        Ok(())
    }

    /// Delete a rental's network and cleanup resources
    pub async fn delete_network(&self, rental_id: Uuid) -> Result<(), NetworkError> {
        // Get network info
        let network_info = {
            let networks = self.networks.read().await;
            networks.get(&rental_id).cloned()
        };

        let Some(network) = network_info else {
            return Err(NetworkError::NotFound(rental_id.to_string()));
        };

        info!(
            rental_id = %rental_id,
            network = %network.network_name,
            "Deleting network"
        );

        // Remove iptables rules first
        if network.isolation_active {
            self.remove_isolation_rules(rental_id).await.ok();
        }

        // Delete Docker network
        let docker = self.get_docker()?;
        docker
            .remove_network(&network.network_name)
            .await
            .map_err(|e| NetworkError::DeleteFailed(e.to_string()))?;

        // Release subnet index
        self.release_subnet_index(network.subnet_index);

        // Remove from tracking
        let mut networks = self.networks.write().await;
        networks.remove(&rental_id);

        info!(rental_id = %rental_id, "Network deleted successfully");
        Ok(())
    }

    /// Get network info for a rental
    pub async fn get_network(&self, rental_id: Uuid) -> Option<RentalNetwork> {
        let networks = self.networks.read().await;
        networks.get(&rental_id).cloned()
    }

    /// Get network configuration for a rental (for use with ContainerManager)
    pub async fn get_network_config(&self, rental_id: Uuid) -> Option<NetworkConfig> {
        let networks = self.networks.read().await;
        networks.get(&rental_id).map(|n| NetworkConfig {
            name: n.network_name.clone(),
            subnet: n.subnet.clone(),
            gateway: n.gateway.clone(),
            container_ip: n.container_ip.clone(),
        })
    }

    /// List all active networks
    pub async fn list_networks(&self) -> Vec<RentalNetwork> {
        let networks = self.networks.read().await;
        networks.values().cloned().collect()
    }

    /// Get number of active networks
    pub async fn active_network_count(&self) -> usize {
        let networks = self.networks.read().await;
        networks.len()
    }

    /// Verify network isolation is working
    pub async fn verify_isolation(&self, rental_id: Uuid) -> Result<IsolationStatus, NetworkError> {
        let network = {
            let networks = self.networks.read().await;
            networks.get(&rental_id).cloned()
        };

        let Some(network) = network else {
            return Err(NetworkError::NotFound(rental_id.to_string()));
        };

        // Check Docker network exists
        let docker = self.get_docker()?;
        let network_info = docker
            .inspect_network(&network.network_name, None::<InspectNetworkOptions<&str>>)
            .await
            .map_err(|e| NetworkError::NotFound(e.to_string()))?;

        let docker_network_exists = network_info.name.is_some();

        // Check iptables rules exist
        let iptables_rules_exist = if self.iptables_available {
            let comment_pattern = format!("rental-{}", &rental_id.to_string()[..8]);
            let result = Command::new("iptables")
                .args(["-L", &self.chain_name, "-n"])
                .output()
                .await
                .ok();

            result.map(|r| String::from_utf8_lossy(&r.stdout).contains(&comment_pattern))
                .unwrap_or(false)
        } else {
            false
        };

        Ok(IsolationStatus {
            rental_id,
            docker_network_exists,
            iptables_rules_exist,
            subnet: network.subnet,
            isolation_active: network.isolation_active && iptables_rules_exist,
        })
    }

    /// Cleanup orphaned networks (networks without active rentals)
    pub async fn cleanup_orphaned_networks(&self) -> Result<Vec<String>, NetworkError> {
        let docker = self.get_docker()?;

        // List all Docker networks with our label
        let mut filters = HashMap::new();
        filters.insert("label".to_string(), vec!["bitsage.type=rental-network".to_string()]);

        let list_options = ListNetworksOptions { filters };
        let all_networks = docker
            .list_networks(Some(list_options))
            .await
            .map_err(|e| NetworkError::CreateFailed(e.to_string()))?;

        let mut cleaned = Vec::new();
        let tracked_networks = self.networks.read().await;

        for network in all_networks {
            let network_name = network.name.unwrap_or_default();

            // Check if this network is tracked
            let is_tracked = tracked_networks.values()
                .any(|n| n.network_name == network_name);

            if !is_tracked {
                // Orphaned network - delete it
                if let Err(e) = docker.remove_network(&network_name).await {
                    warn!(network = %network_name, error = %e, "Failed to cleanup orphaned network");
                } else {
                    info!(network = %network_name, "Cleaned up orphaned network");
                    cleaned.push(network_name);
                }
            }
        }

        Ok(cleaned)
    }

    /// Block specific IPs from a rental network (e.g., known bad actors)
    pub async fn block_ip(&self, rental_id: Uuid, blocked_ip: &str) -> Result<(), NetworkError> {
        if !self.iptables_available {
            return Err(NetworkError::IptablesError("iptables not available".to_string()));
        }

        let network = {
            let networks = self.networks.read().await;
            networks.get(&rental_id).cloned()
        };

        let Some(network) = network else {
            return Err(NetworkError::NotFound(rental_id.to_string()));
        };

        let _ = Command::new("iptables")
            .args([
                "-I", &self.chain_name,
                "-s", &network.subnet,
                "-d", blocked_ip,
                "-j", "DROP",
                "-m", "comment",
                "--comment", &format!("rental-{}-blocked", &rental_id.to_string()[..8]),
            ])
            .output()
            .await
            .map_err(|e| NetworkError::IptablesError(e.to_string()))?;

        info!(rental_id = %rental_id, blocked_ip = %blocked_ip, "Blocked IP for rental");
        Ok(())
    }

    /// Rate limit outbound traffic for a rental (anti-abuse)
    pub async fn apply_rate_limit(&self, rental_id: Uuid, mbps: u32) -> Result<(), NetworkError> {
        if !self.iptables_available {
            return Err(NetworkError::IptablesError("iptables not available".to_string()));
        }

        let network = {
            let networks = self.networks.read().await;
            networks.get(&rental_id).cloned()
        };

        let Some(network) = network else {
            return Err(NetworkError::NotFound(rental_id.to_string()));
        };

        // Use tc (traffic control) for rate limiting
        // First, find the bridge interface for this network
        let bridge_name = format!("br-{}", &network.network_id[..12]);

        // Delete existing qdisc
        let _ = Command::new("tc")
            .args(["qdisc", "del", "dev", &bridge_name, "root"])
            .output()
            .await;

        // Add rate limiting
        let rate = format!("{}mbit", mbps);
        let result = Command::new("tc")
            .args([
                "qdisc", "add", "dev", &bridge_name, "root", "tbf",
                "rate", &rate,
                "burst", "32kbit",
                "latency", "400ms",
            ])
            .output()
            .await
            .map_err(|e| NetworkError::IptablesError(e.to_string()))?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            warn!(
                rental_id = %rental_id,
                error = %stderr,
                "Failed to apply rate limit (tc may not be available)"
            );
        } else {
            info!(rental_id = %rental_id, rate_mbps = %mbps, "Applied rate limit");
        }

        Ok(())
    }
}

impl Default for NetworkManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Status of network isolation for a rental
#[derive(Debug, Clone)]
pub struct IsolationStatus {
    pub rental_id: Uuid,
    pub docker_network_exists: bool,
    pub iptables_rules_exist: bool,
    pub subnet: String,
    pub isolation_active: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subnet_calculation() {
        let manager = NetworkManager::new();

        // Test subnet allocation
        let index0 = manager.allocate_subnet_index().unwrap();
        let index1 = manager.allocate_subnet_index().unwrap();

        assert_eq!(index0, 0);
        assert_eq!(index1, 1);

        let subnet0 = format!("{}.{}.0/24", manager.base_subnet, index0);
        let subnet1 = format!("{}.{}.0/24", manager.base_subnet, index1);

        assert_eq!(subnet0, "172.30.0.0/24");
        assert_eq!(subnet1, "172.30.1.0/24");
    }

    #[test]
    fn test_isolation_status_default() {
        let status = IsolationStatus {
            rental_id: Uuid::new_v4(),
            docker_network_exists: true,
            iptables_rules_exist: true,
            subnet: "172.30.5.0/24".to_string(),
            isolation_active: true,
        };

        assert!(status.isolation_active);
        assert!(status.docker_network_exists);
    }

    #[test]
    fn test_rental_network_struct() {
        let rental_id = Uuid::new_v4();
        let network = RentalNetwork {
            rental_id,
            network_name: "rental-net-abc12345".to_string(),
            network_id: "sha256:abc123".to_string(),
            subnet: "172.30.10.0/24".to_string(),
            gateway: "172.30.10.1".to_string(),
            container_ip: "172.30.10.2".to_string(),
            subnet_index: 10,
            isolation_active: true,
        };

        assert_eq!(network.subnet, "172.30.10.0/24");
        assert_eq!(network.gateway, "172.30.10.1");
        assert_eq!(network.container_ip, "172.30.10.2");
    }

    #[tokio::test]
    async fn test_network_manager_creation() {
        let manager = NetworkManager::new();

        // Docker may or may not be available depending on environment
        // Just ensure creation doesn't panic
        let count = manager.active_network_count().await;
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_list_empty_networks() {
        let manager = NetworkManager::new();
        let networks = manager.list_networks().await;
        assert!(networks.is_empty());
    }
}
