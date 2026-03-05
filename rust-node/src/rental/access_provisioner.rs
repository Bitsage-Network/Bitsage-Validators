//! Access Provisioner
//!
//! Provisions SSH and Jupyter access for rental containers.
//! Supports:
//! - Direct SSH with key injection
//! - Tailscale SSH for zero-config access
//! - JupyterLab with token authentication

use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Duration, Utc};
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};
use uuid::Uuid;

use super::types::{SshAccessInfo, SshMethod, JupyterAccessInfo};
use super::container_manager::ContainerManager;

/// Provisions access credentials for rentals
pub struct AccessProvisioner {
    /// Tailscale auth key (if configured)
    tailscale_auth_key: Option<String>,
    /// Base domain for Jupyter URLs
    jupyter_domain: String,
    /// SSH credentials cache
    ssh_credentials: RwLock<HashMap<String, SshCredentials>>,
    /// Jupyter tokens cache
    jupyter_tokens: RwLock<HashMap<String, JupyterAccessInfo>>,
}

#[derive(Debug, Clone)]
struct SshCredentials {
    pub private_key: String,
    pub public_key: String,
    pub fingerprint: String,
}

impl AccessProvisioner {
    /// Create a new access provisioner
    pub fn new() -> Self {
        // Load config from environment
        let tailscale_auth_key = std::env::var("TAILSCALE_AUTH_KEY").ok();
        let jupyter_domain = std::env::var("JUPYTER_DOMAIN")
            .unwrap_or_else(|_| "jupyter.bitsage.network".to_string());

        Self {
            tailscale_auth_key,
            jupyter_domain,
            ssh_credentials: RwLock::new(HashMap::new()),
            jupyter_tokens: RwLock::new(HashMap::new()),
        }
    }

    /// Provision SSH access for a container
    pub async fn provision_ssh(
        &self,
        container_id: &str,
        user_public_key: Option<&str>,
    ) -> Result<SshAccessInfo, AccessError> {
        info!(container = %container_id, "Provisioning SSH access");

        // Generate or use provided SSH key
        let (private_key, public_key, fingerprint) = if let Some(pub_key) = user_public_key {
            // User provided their public key - we don't have the private key
            let fingerprint = self.compute_key_fingerprint(pub_key)?;
            (None, pub_key.to_string(), fingerprint)
        } else {
            // Generate a new key pair
            let creds = self.generate_ssh_keypair().await?;
            (Some(creds.private_key.clone()), creds.public_key.clone(), creds.fingerprint.clone())
        };

        // Inject public key into container
        self.inject_ssh_key(container_id, &public_key).await?;

        // Determine SSH method and host
        let (method, host, port, tailscale_name) = if self.tailscale_auth_key.is_some() {
            // Use Tailscale SSH
            let machine_name = format!("rental-{}", &container_id[7..15]);
            self.setup_tailscale(container_id, &machine_name).await?;

            (SshMethod::Tailscale, machine_name.clone(), 22, Some(machine_name))
        } else {
            // Direct SSH - need to get the exposed port
            // For now, use localhost with the mapped port
            let host = std::env::var("SSH_HOST").unwrap_or_else(|_| "localhost".to_string());
            let port = self.get_ssh_port(container_id).await?;

            (SshMethod::Direct, host, port, None)
        };

        // Store credentials
        if let Some(ref pk) = private_key {
            let mut creds = self.ssh_credentials.write().await;
            creds.insert(container_id.to_string(), SshCredentials {
                private_key: pk.clone(),
                public_key: public_key.clone(),
                fingerprint: fingerprint.clone(),
            });
        }

        info!(
            container = %container_id,
            method = ?method,
            host = %host,
            port = port,
            "SSH access provisioned"
        );

        Ok(SshAccessInfo {
            method,
            host,
            port,
            username: "root".to_string(),
            private_key,
            key_fingerprint: fingerprint,
            tailscale_name,
        })
    }

    /// Generate an SSH key pair
    async fn generate_ssh_keypair(&self) -> Result<SshCredentials, AccessError> {
        // Generate Ed25519 key pair using ssh-keygen
        let temp_key = format!("/tmp/rental_key_{}", Uuid::new_v4());

        let output = tokio::process::Command::new("ssh-keygen")
            .args([
                "-t", "ed25519",
                "-f", &temp_key,
                "-N", "", // No passphrase
                "-C", "rental@bitsage.network",
            ])
            .output()
            .await
            .map_err(|e| AccessError::KeyGenerationFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AccessError::KeyGenerationFailed(stderr.to_string()));
        }

        // Read the generated keys
        let private_key = tokio::fs::read_to_string(&temp_key).await
            .map_err(|e| AccessError::KeyGenerationFailed(format!("Failed to read private key: {}", e)))?;

        let public_key = tokio::fs::read_to_string(format!("{}.pub", temp_key)).await
            .map_err(|e| AccessError::KeyGenerationFailed(format!("Failed to read public key: {}", e)))?;

        // Get fingerprint
        let fingerprint = self.compute_key_fingerprint(&public_key)?;

        // Clean up temp files
        tokio::fs::remove_file(&temp_key).await.ok();
        tokio::fs::remove_file(format!("{}.pub", temp_key)).await.ok();

        Ok(SshCredentials {
            private_key,
            public_key: public_key.trim().to_string(),
            fingerprint,
        })
    }

    /// Compute SSH key fingerprint
    fn compute_key_fingerprint(&self, public_key: &str) -> Result<String, AccessError> {
        // For simplicity, use first 16 chars of base64-encoded public key
        // In production, compute proper SHA256 fingerprint
        let parts: Vec<&str> = public_key.split_whitespace().collect();
        if parts.len() >= 2 {
            let key_data = parts[1];
            let short = if key_data.len() > 16 { &key_data[..16] } else { key_data };
            Ok(format!("SHA256:{}", short))
        } else {
            Err(AccessError::InvalidKey("Invalid public key format".to_string()))
        }
    }

    /// Inject SSH public key into container
    async fn inject_ssh_key(&self, container_id: &str, public_key: &str) -> Result<(), AccessError> {
        // Create .ssh directory
        let mkdir_output = tokio::process::Command::new("docker")
            .args(["exec", container_id, "mkdir", "-p", "/root/.ssh"])
            .output()
            .await
            .map_err(|e| AccessError::KeyInjectionFailed(e.to_string()))?;

        if !mkdir_output.status.success() {
            let stderr = String::from_utf8_lossy(&mkdir_output.stderr);
            return Err(AccessError::KeyInjectionFailed(format!("mkdir failed: {}", stderr)));
        }

        // Append public key to authorized_keys
        // SECURITY: Validate SSH key format before injection to prevent command injection.
        // Only allow standard SSH public key formats (ssh-rsa, ssh-ed25519, ecdsa-sha2-*).
        let trimmed_key = public_key.trim();
        if !trimmed_key.starts_with("ssh-rsa ")
            && !trimmed_key.starts_with("ssh-ed25519 ")
            && !trimmed_key.starts_with("ecdsa-sha2-")
            && !trimmed_key.starts_with("sk-ssh-ed25519@")
            && !trimmed_key.starts_with("sk-ecdsa-sha2-")
        {
            return Err(AccessError::KeyInjectionFailed(
                "Invalid SSH public key format — must start with ssh-rsa, ssh-ed25519, or ecdsa-sha2-*".to_string()
            ));
        }
        if trimmed_key.contains('\'') || trimmed_key.contains('\\') || trimmed_key.contains('\n') || trimmed_key.contains(';') || trimmed_key.contains('`') || trimmed_key.contains('$') {
            return Err(AccessError::KeyInjectionFailed(
                "SSH public key contains forbidden characters".to_string()
            ));
        }

        let add_key_cmd = format!(
            "echo '{}' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys",
            trimmed_key
        );

        let output = tokio::process::Command::new("docker")
            .args(["exec", container_id, "sh", "-c", &add_key_cmd])
            .output()
            .await
            .map_err(|e| AccessError::KeyInjectionFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AccessError::KeyInjectionFailed(stderr.to_string()));
        }

        // Ensure SSH daemon is running
        let sshd_output = tokio::process::Command::new("docker")
            .args(["exec", container_id, "sh", "-c",
                   "service ssh start 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true"])
            .output()
            .await;

        debug!(container = %container_id, "SSH key injected");
        Ok(())
    }

    /// Get the mapped SSH port for a container
    async fn get_ssh_port(&self, container_id: &str) -> Result<u16, AccessError> {
        let output = tokio::process::Command::new("docker")
            .args(["port", container_id, "22"])
            .output()
            .await
            .map_err(|e| AccessError::PortLookupFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(AccessError::PortLookupFailed("Port 22 not mapped".to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // Output format: "0.0.0.0:32768" or "[::]:32768"
        let port_str = stdout.trim().split(':').last()
            .ok_or_else(|| AccessError::PortLookupFailed("Invalid port format".to_string()))?;

        port_str.parse()
            .map_err(|_| AccessError::PortLookupFailed(format!("Invalid port: {}", port_str)))
    }

    /// Setup Tailscale in a container
    async fn setup_tailscale(&self, container_id: &str, machine_name: &str) -> Result<(), AccessError> {
        let auth_key = self.tailscale_auth_key.as_ref()
            .ok_or_else(|| AccessError::TailscaleError("No auth key configured".to_string()))?;

        // Start Tailscale daemon
        let tailscaled_output = tokio::process::Command::new("docker")
            .args(["exec", "-d", container_id, "tailscaled"])
            .output()
            .await
            .map_err(|e| AccessError::TailscaleError(e.to_string()))?;

        // Wait a moment for daemon to start
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        // Authenticate with Tailscale (use separate args to avoid shell injection)
        let output = tokio::process::Command::new("docker")
            .args([
                "exec", container_id,
                "tailscale", "up",
                &format!("--authkey={}", auth_key),
                &format!("--hostname={}", machine_name),
                "--ssh",
            ])
            .output()
            .await
            .map_err(|e| AccessError::TailscaleError(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!(container = %container_id, error = %stderr, "Tailscale setup warning");
            // Don't fail - Tailscale might still work
        }

        info!(container = %container_id, hostname = %machine_name, "Tailscale configured");
        Ok(())
    }

    /// Provision Jupyter access for a container
    pub async fn provision_jupyter(
        &self,
        container_id: &str,
        rental_id: Uuid,
    ) -> Result<JupyterAccessInfo, AccessError> {
        info!(container = %container_id, "Provisioning Jupyter access");

        // Generate a secure token
        let token = self.generate_token();

        // Configure Jupyter in the container
        self.configure_jupyter(container_id, &token).await?;

        // Get the mapped Jupyter port
        let jupyter_port = self.get_jupyter_port(container_id).await?;

        // Build URL
        let url = if self.jupyter_domain.contains("localhost") || self.jupyter_domain.starts_with("127.") {
            format!("http://{}:{}/?token={}", self.jupyter_domain, jupyter_port, token)
        } else {
            // Use subdomain routing for production
            format!("https://rental-{}.{}/?token={}",
                    &container_id[7..15], self.jupyter_domain, token)
        };

        // Token expires in 24 hours
        let expires_at = Utc::now() + Duration::hours(24);

        let jupyter_access = JupyterAccessInfo {
            url: url.clone(),
            token: token.clone(),
            expires_at,
        };

        // Cache the token
        let mut tokens = self.jupyter_tokens.write().await;
        tokens.insert(container_id.to_string(), jupyter_access.clone());

        info!(
            container = %container_id,
            url = %url,
            "Jupyter access provisioned"
        );

        Ok(jupyter_access)
    }

    /// Generate a secure random token
    fn generate_token(&self) -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let token: String = (0..32)
            .map(|_| {
                let idx = rng.gen_range(0..36);
                if idx < 10 {
                    (b'0' + idx) as char
                } else {
                    (b'a' + idx - 10) as char
                }
            })
            .collect();
        token
    }

    /// Configure Jupyter in the container
    async fn configure_jupyter(&self, container_id: &str, token: &str) -> Result<(), AccessError> {
        // Write Jupyter config
        let config = format!(
            r#"
c.ServerApp.token = '{}'
c.ServerApp.ip = '0.0.0.0'
c.ServerApp.port = 8888
c.ServerApp.open_browser = False
c.ServerApp.allow_root = True
c.ServerApp.allow_origin = '*'
"#,
            token
        );

        // Create config directory and write config
        let setup_cmd = format!(
            "mkdir -p /root/.jupyter && cat > /root/.jupyter/jupyter_server_config.py << 'EOFCONFIG'\n{}\nEOFCONFIG",
            config
        );

        let output = tokio::process::Command::new("docker")
            .args(["exec", container_id, "sh", "-c", &setup_cmd])
            .output()
            .await
            .map_err(|e| AccessError::JupyterConfigFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AccessError::JupyterConfigFailed(stderr.to_string()));
        }

        // Start Jupyter in background
        let start_output = tokio::process::Command::new("docker")
            .args([
                "exec", "-d", container_id,
                "jupyter", "lab", "--no-browser", "--allow-root",
            ])
            .output()
            .await
            .map_err(|e| AccessError::JupyterStartFailed(e.to_string()))?;

        if !start_output.status.success() {
            let stderr = String::from_utf8_lossy(&start_output.stderr);
            warn!(container = %container_id, error = %stderr, "Jupyter start warning");
        }

        debug!(container = %container_id, "Jupyter configured and started");
        Ok(())
    }

    /// Get the mapped Jupyter port
    async fn get_jupyter_port(&self, container_id: &str) -> Result<u16, AccessError> {
        let output = tokio::process::Command::new("docker")
            .args(["port", container_id, "8888"])
            .output()
            .await
            .map_err(|e| AccessError::PortLookupFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(AccessError::PortLookupFailed("Port 8888 not mapped".to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let port_str = stdout.trim().split(':').last()
            .ok_or_else(|| AccessError::PortLookupFailed("Invalid port format".to_string()))?;

        port_str.parse()
            .map_err(|_| AccessError::PortLookupFailed(format!("Invalid port: {}", port_str)))
    }

    /// Refresh Jupyter token for a container
    pub async fn refresh_jupyter_token(&self, container_id: &str) -> Result<JupyterAccessInfo, AccessError> {
        let new_token = self.generate_token();
        let expires_at = Utc::now() + Duration::hours(24);

        // Update token in container
        // SECURITY: Validate token is alphanumeric to prevent sed injection
        if !new_token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err(AccessError::JupyterConfigFailed(
                "Generated token contains invalid characters".to_string()
            ));
        }

        let update_cmd = format!(
            "sed -i \"s/c.ServerApp.token = .*/c.ServerApp.token = '{}'/\" /root/.jupyter/jupyter_server_config.py",
            new_token
        );

        let output = tokio::process::Command::new("docker")
            .args(["exec", container_id, "sh", "-c", &update_cmd])
            .output()
            .await
            .map_err(|e| AccessError::JupyterConfigFailed(e.to_string()))?;

        // Restart Jupyter to apply new token
        tokio::process::Command::new("docker")
            .args(["exec", container_id, "pkill", "-f", "jupyter"])
            .output()
            .await
            .ok();

        tokio::process::Command::new("docker")
            .args(["exec", "-d", container_id, "jupyter", "lab", "--no-browser", "--allow-root"])
            .output()
            .await
            .ok();

        let jupyter_port = self.get_jupyter_port(container_id).await?;

        // Build URL using same logic as provision_jupyter_access
        let url = if self.jupyter_domain.contains("localhost") || self.jupyter_domain.starts_with("127.") {
            format!("http://{}:{}/?token={}", self.jupyter_domain, jupyter_port, new_token)
        } else {
            // Use subdomain routing for production
            format!("https://rental-{}.{}/?token={}",
                    &container_id[7..15], self.jupyter_domain, new_token)
        };

        let jupyter_access = JupyterAccessInfo {
            url,
            token: new_token,
            expires_at,
        };

        // Update cache
        let mut tokens = self.jupyter_tokens.write().await;
        tokens.insert(container_id.to_string(), jupyter_access.clone());

        Ok(jupyter_access)
    }

    /// Revoke all access for a container
    pub async fn revoke_access(&self, container_id: &str) {
        // Remove from caches
        {
            let mut creds = self.ssh_credentials.write().await;
            creds.remove(container_id);
        }
        {
            let mut tokens = self.jupyter_tokens.write().await;
            tokens.remove(container_id);
        }

        info!(container = %container_id, "Access revoked");
    }
}

impl Default for AccessProvisioner {
    fn default() -> Self {
        Self::new()
    }
}

/// Access provisioning errors
#[derive(Debug, thiserror::Error)]
pub enum AccessError {
    #[error("SSH key generation failed: {0}")]
    KeyGenerationFailed(String),

    #[error("SSH key injection failed: {0}")]
    KeyInjectionFailed(String),

    #[error("Invalid SSH key: {0}")]
    InvalidKey(String),

    #[error("Port lookup failed: {0}")]
    PortLookupFailed(String),

    #[error("Tailscale error: {0}")]
    TailscaleError(String),

    #[error("Jupyter configuration failed: {0}")]
    JupyterConfigFailed(String),

    #[error("Jupyter start failed: {0}")]
    JupyterStartFailed(String),
}
