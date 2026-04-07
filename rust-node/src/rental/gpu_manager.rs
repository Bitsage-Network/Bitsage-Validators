//! GPU Manager
//!
//! Handles GPU resource allocation for rentals.
//! Supports:
//! - Exclusive GPU allocation (consumer GPUs: RTX 4090, 3090)
//! - MIG (Multi-Instance GPU) allocation (datacenter GPUs: H100, A100)
//!
//! # MIG Architecture
//!
//! MIG partitions a GPU into isolated instances with dedicated:
//! - Compute cores (SMs)
//! - Memory (with hardware-level isolation)
//! - L2 cache
//!
//! Hierarchy: GPU -> GPU Instance (GI) -> Compute Instance (CI)
//!
//! H100 MIG Profiles:
//! - 1g.10gb: 1/7 of GPU (Profile ID 19)
//! - 2g.20gb: 2/7 of GPU (Profile ID 14)
//! - 3g.40gb: 3/7 of GPU (Profile ID 9)
//! - 7g.80gb: Full GPU  (Profile ID 0)
//!
//! A100 MIG Profiles:
//! - 1g.5gb:  1/7 of GPU (Profile ID 19)
//! - 2g.10gb: 2/7 of GPU (Profile ID 14)
//! - 3g.20gb: 3/7 of GPU (Profile ID 9)
//! - 4g.40gb: 4/7 of GPU (Profile ID 5)
//! - 7g.80gb: Full GPU  (Profile ID 0)

use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn, error, debug};

/// Timeout for nvidia-smi commands (driver hangs are common with faulty GPUs)
const NVIDIA_SMI_TIMEOUT: Duration = Duration::from_secs(15);

use super::types::{GpuAllocation, MigProfile, GpuBackend};

/// Manages GPU allocation for rentals
pub struct GpuManager {
    /// Known GPUs on this node
    gpus: RwLock<HashMap<String, GpuInfo>>,
    /// Active allocations
    allocations: RwLock<HashMap<String, AllocationInfo>>,
}

/// Information about a GPU
#[derive(Debug, Clone)]
pub struct GpuInfo {
    /// GPU UUID
    pub uuid: String,
    /// GPU index (0, 1, 2, ...)
    pub index: u32,
    /// GPU model name
    pub model: String,
    /// GPU model family (H100, A100, Consumer)
    pub family: GpuModelFamily,
    /// Total VRAM in GB
    pub vram_gb: u32,
    /// GPU backend
    pub backend: GpuBackend,
    /// Whether MIG is supported
    pub mig_capable: bool,
    /// Whether MIG is currently enabled
    pub mig_enabled: bool,
    /// Current MIG instances (if MIG enabled)
    pub mig_instances: Vec<MigInstance>,
    /// Whether the GPU is fully allocated
    pub fully_allocated: bool,
    /// Available VRAM for new MIG instances (GB)
    pub available_mig_vram_gb: u32,
}

/// MIG instance information
#[derive(Debug, Clone)]
pub struct MigInstance {
    /// GPU Instance ID
    pub gi_id: u32,
    /// Compute Instance ID
    pub ci_id: u32,
    /// Profile
    pub profile: MigProfile,
    /// MIG device UUID (for container passthrough)
    pub mig_device_uuid: Option<String>,
    /// Whether this instance is allocated
    pub allocated: bool,
    /// Rental ID if allocated
    pub rental_id: Option<uuid::Uuid>,
}

/// GPU model family (for MIG profile differences)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuModelFamily {
    /// NVIDIA H100 (Hopper)
    H100,
    /// NVIDIA A100 (Ampere)
    A100,
    /// Consumer GPU (RTX series, no MIG support)
    Consumer,
    /// Unknown datacenter GPU
    Other,
}

impl GpuModelFamily {
    /// Detect GPU family from model name
    pub fn from_model_name(model: &str) -> Self {
        let model_upper = model.to_uppercase();
        if model_upper.contains("H100") {
            Self::H100
        } else if model_upper.contains("A100") {
            Self::A100
        } else if model_upper.contains("RTX") || model_upper.contains("GTX") {
            Self::Consumer
        } else {
            Self::Other
        }
    }

    /// Get available MIG profiles for this GPU family
    pub fn available_profiles(&self) -> Vec<MigProfile> {
        match self {
            Self::H100 => vec![
                MigProfile::Mig1g5gb,  // Actually 1g.10gb on H100
                MigProfile::Mig2g10gb, // Actually 2g.20gb on H100
                MigProfile::Mig3g20gb, // Actually 3g.40gb on H100
                MigProfile::Mig7g80gb,
            ],
            Self::A100 => vec![
                MigProfile::Mig1g5gb,
                MigProfile::Mig2g10gb,
                MigProfile::Mig3g20gb,
                MigProfile::Mig4g40gb,
                MigProfile::Mig7g80gb,
            ],
            _ => vec![],
        }
    }

    /// Check if MIG is supported
    pub fn supports_mig(&self) -> bool {
        matches!(self, Self::H100 | Self::A100)
    }
}

/// Allocation tracking
#[derive(Debug, Clone)]
struct AllocationInfo {
    gpu_uuid: String,
    allocation: GpuAllocation,
    rental_id: Option<uuid::Uuid>,
}

/// Run nvidia-smi with a timeout to prevent hangs from blocking the system.
/// Returns the command output or a timeout error.
async fn nvidia_smi_with_timeout(args: &[&str]) -> Result<std::process::Output, GpuError> {
    let fut = tokio::process::Command::new("nvidia-smi")
        .args(args)
        .output();

    match tokio::time::timeout(NVIDIA_SMI_TIMEOUT, fut).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(GpuError::DetectionFailed(format!("nvidia-smi exec failed: {}", e))),
        Err(_) => Err(GpuError::DetectionFailed(format!(
            "nvidia-smi timed out after {}s (args: {:?}) — GPU driver may be hung",
            NVIDIA_SMI_TIMEOUT.as_secs(),
            args
        ))),
    }
}

impl GpuManager {
    /// Create a new GPU manager
    pub fn new() -> Self {
        Self {
            gpus: RwLock::new(HashMap::new()),
            allocations: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize GPU manager by detecting available GPUs
    pub async fn initialize(&self) -> Result<(), GpuError> {
        info!("Initializing GPU manager");

        // Run nvidia-smi to detect GPUs (with timeout protection)
        let output = nvidia_smi_with_timeout(&["--query-gpu=uuid,index,name,memory.total", "--format=csv,noheader,nounits"]).await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GpuError::DetectionFailed(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut gpus = self.gpus.write().await;

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(", ").collect();
            if parts.len() >= 4 {
                let uuid = parts[0].trim().to_string();
                let index: u32 = match parts[1].trim().parse() {
                    Ok(v) => v,
                    Err(_) => {
                        warn!(line = %line, "Skipping GPU — failed to parse index");
                        continue;
                    }
                };
                let model = parts[2].trim().to_string();
                let vram_mb: u32 = match parts[3].trim().parse() {
                    Ok(v) => v,
                    Err(_) => {
                        warn!(uuid = %uuid, model = %model, "Skipping GPU — failed to parse VRAM");
                        continue;
                    }
                };
                if vram_mb == 0 {
                    warn!(uuid = %uuid, model = %model, "Skipping GPU — reported 0 MB VRAM");
                    continue;
                }
                let vram_gb = vram_mb / 1024;

                // Detect GPU family
                let family = GpuModelFamily::from_model_name(&model);
                let mig_capable = family.supports_mig();
                let mig_enabled = if mig_capable {
                    self.is_mig_enabled(&uuid).await
                } else {
                    false
                };

                let mig_instances = if mig_enabled {
                    self.get_mig_instances(index).await.unwrap_or_default()
                } else {
                    vec![]
                };

                // Calculate available MIG VRAM
                let used_mig_vram: u32 = mig_instances.iter()
                    .map(|i| i.profile.vram_gb())
                    .sum();
                let available_mig_vram_gb = if mig_enabled {
                    vram_gb.saturating_sub(used_mig_vram)
                } else {
                    vram_gb
                };

                info!(
                    uuid = %uuid,
                    model = %model,
                    family = ?family,
                    vram_gb = vram_gb,
                    mig_capable = mig_capable,
                    mig_enabled = mig_enabled,
                    mig_instances = mig_instances.len(),
                    available_mig_vram_gb = available_mig_vram_gb,
                    "Detected GPU"
                );

                gpus.insert(uuid.clone(), GpuInfo {
                    uuid,
                    index,
                    model,
                    family,
                    vram_gb,
                    backend: GpuBackend::Cuda,
                    mig_capable,
                    mig_enabled,
                    mig_instances,
                    fully_allocated: false,
                    available_mig_vram_gb,
                });
            }
        }

        info!(count = gpus.len(), "GPU detection complete");
        Ok(())
    }

    /// Refresh GPU state: re-query nvidia-smi for current MIG instances.
    /// Called periodically to keep the cache in sync with actual hardware state.
    /// Preserves existing allocation tracking.
    pub async fn refresh(&self) -> Result<(), GpuError> {
        debug!("Refreshing GPU state from nvidia-smi");

        // Collect MIG-enabled GPUs that need refresh (read lock only)
        let mig_gpus: Vec<(String, u32)> = {
            let gpus = self.gpus.read().await;
            gpus.values()
                .filter(|g| g.mig_enabled)
                .map(|g| (g.uuid.clone(), g.index))
                .collect()
        };

        // Refresh MIG instances for each GPU (no lock held during nvidia-smi calls)
        for (uuid, index) in mig_gpus {
            if let Ok(instances) = self.get_mig_instances(index).await {
                let mut gpus = self.gpus.write().await;
                if let Some(gpu) = gpus.get_mut(&uuid) {
                    // Preserve allocation state from existing instances
                    let allocated_gis: HashMap<u32, Option<uuid::Uuid>> = gpu.mig_instances.iter()
                        .filter(|i| i.allocated)
                        .map(|i| (i.gi_id, i.rental_id))
                        .collect();

                    let mut refreshed = instances;
                    for inst in &mut refreshed {
                        if let Some(rental_id) = allocated_gis.get(&inst.gi_id) {
                            inst.allocated = true;
                            inst.rental_id = *rental_id;
                        }
                    }

                    let used_vram: u32 = refreshed.iter().map(|i| i.profile.vram_gb()).sum();
                    gpu.mig_instances = refreshed;
                    gpu.available_mig_vram_gb = gpu.vram_gb.saturating_sub(used_vram);
                }
            }
        }

        debug!("GPU state refresh complete");
        Ok(())
    }

    /// Check if MIG is enabled on a GPU
    async fn is_mig_enabled(&self, gpu_uuid: &str) -> bool {
        match nvidia_smi_with_timeout(&["-i", gpu_uuid, "--query-gpu=mig.mode.current", "--format=csv,noheader"]).await {
            Ok(o) if o.status.success() => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                stdout.trim().eq_ignore_ascii_case("enabled")
            }
            _ => false,
        }
    }

    /// Get MIG instances for a GPU
    ///
    /// Parses output from `nvidia-smi mig -lgi` (list GPU instances)
    /// and `nvidia-smi mig -lci` (list compute instances)
    async fn get_mig_instances(&self, gpu_index: u32) -> Result<Vec<MigInstance>, GpuError> {
        // List GPU Instances (with timeout)
        let idx_str = gpu_index.to_string();
        let gi_output = nvidia_smi_with_timeout(&["mig", "-lgi", "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to list GPU instances: {}", e)))?;

        if !gi_output.status.success() {
            // No MIG instances or MIG not enabled
            return Ok(vec![]);
        }

        let gi_stdout = String::from_utf8_lossy(&gi_output.stdout);
        let mut instances = Vec::new();

        // Parse GPU Instance output
        // Example format:
        // +-------------------------------------------------------+
        // | GPU instances:                                        |
        // | GPU   Name             Profile  Instance   Placement  |
        // |                          ID       ID       Start:Size |
        // |=======================================================|
        // |   0  MIG 1g.10gb          19        0          0:1    |
        // |   0  MIG 3g.40gb           9        1          2:4    |
        // +-------------------------------------------------------+

        for line in gi_stdout.lines() {
            let line = line.trim();
            // Skip header lines and separators
            if line.starts_with('+') || line.starts_with('|') && (
                line.contains("GPU instances") ||
                line.contains("Name") ||
                line.contains("ID") ||
                line.contains("===")
            ) {
                continue;
            }

            // Parse instance line: |   0  MIG 1g.10gb          19        0          0:1    |
            if line.starts_with('|') && line.ends_with('|') {
                let content = &line[1..line.len()-1].trim();
                let parts: Vec<&str> = content.split_whitespace().collect();

                // Expected: [gpu_idx, "MIG", profile_name, profile_id, instance_id, placement]
                if parts.len() >= 5 && parts[1] == "MIG" {
                    let profile_name = parts[2];
                    let _profile_id: u32 = match parts[3].parse() {
                        Ok(v) => v,
                        Err(_) => { warn!(line = %line, "Skipping MIG instance — failed to parse profile_id"); continue; }
                    };
                    let gi_id: u32 = match parts[4].parse() {
                        Ok(v) => v,
                        Err(_) => { warn!(line = %line, "Skipping MIG instance — failed to parse GI ID"); continue; }
                    };

                    // Detect profile from name
                    let profile = self.parse_mig_profile_name(profile_name);

                    // Get compute instances for this GPU instance
                    let ci_info = self.get_compute_instances(gpu_index, gi_id).await?;

                    for (ci_id, mig_device_uuid) in ci_info {
                        instances.push(MigInstance {
                            gi_id,
                            ci_id,
                            profile,
                            mig_device_uuid: Some(mig_device_uuid),
                            allocated: false,
                            rental_id: None,
                        });
                    }

                    // If no CI, we have a GI without CI (incomplete)
                    if instances.iter().all(|i| i.gi_id != gi_id) {
                        warn!(
                            gpu_index = gpu_index,
                            gi_id = gi_id,
                            "GPU Instance has no Compute Instance - creating one"
                        );
                        // Could auto-create CI here if needed
                    }
                }
            }
        }

        debug!(
            gpu_index = gpu_index,
            count = instances.len(),
            "Parsed MIG instances"
        );

        Ok(instances)
    }

    /// Get compute instances for a GPU instance
    async fn get_compute_instances(&self, gpu_index: u32, gi_id: u32) -> Result<Vec<(u32, String)>, GpuError> {
        let idx_str = gpu_index.to_string();
        let gi_str = gi_id.to_string();
        let output = nvidia_smi_with_timeout(&["mig", "-lci", "-i", &idx_str, "-gi", &gi_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to list compute instances: {}", e)))?;

        if !output.status.success() {
            return Ok(vec![]);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut compute_instances = Vec::new();

        // Parse compute instance output
        for line in stdout.lines() {
            let line = line.trim();
            if line.starts_with('|') && line.ends_with('|') && !line.contains("===") && !line.contains("Compute") {
                let content = &line[1..line.len()-1].trim();
                let parts: Vec<&str> = content.split_whitespace().collect();

                // Format varies, but CI ID is usually in there
                if parts.len() >= 2 {
                    if let Ok(ci_id) = parts.last().unwrap_or(&"0").parse::<u32>() {
                        // Get MIG device UUID
                        let mig_uuid = self.get_mig_device_uuid(gpu_index, gi_id, ci_id).await
                            .unwrap_or_else(|_| format!("MIG-GPU-{}-GI-{}-CI-{}", gpu_index, gi_id, ci_id));
                        compute_instances.push((ci_id, mig_uuid));
                    }
                }
            }
        }

        Ok(compute_instances)
    }

    /// Get the MIG device UUID for container passthrough
    ///
    /// Uses nvidia-smi to query the specific MIG device UUID needed for
    /// Docker's NVIDIA_VISIBLE_DEVICES environment variable.
    ///
    /// MIG UUID format: MIG-<gpu-uuid>/<gi-id>/<ci-id>
    async fn get_mig_device_uuid(&self, gpu_index: u32, gi_id: u32, ci_id: u32) -> Result<String, GpuError> {
        // Method 1: Try nvidia-smi with query for MIG UUID (newer driver versions)
        let idx_str = gpu_index.to_string();
        let gi_str = gi_id.to_string();
        let output = nvidia_smi_with_timeout(&["mig", "-lci", "-i", &idx_str, "-gi", &gi_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to list compute instances: {}", e)))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            // Parse compute instance output looking for UUID
            // Format varies by driver version, looking for CI with matching ID
            for line in stdout.lines() {
                if line.contains(&format!("CI {}", ci_id)) || line.contains(&format!("  {}  ", ci_id)) {
                    // Found our compute instance, now get the GPU UUID
                    break;
                }
            }
        }

        // Method 2: Get GPU UUID and construct MIG device identifier
        let gpu_uuid = self.get_gpu_uuid(gpu_index).await?;

        // MIG device format for Docker: MIG-<gpu-uuid>/<gi-id>/<ci-id>
        // This format is used with NVIDIA Container Toolkit
        let mig_uuid = format!("MIG-{}/{}/{}", gpu_uuid, gi_id, ci_id);

        debug!(
            gpu_index = gpu_index,
            gi_id = gi_id,
            ci_id = ci_id,
            mig_uuid = %mig_uuid,
            "Constructed MIG device UUID"
        );

        Ok(mig_uuid)
    }

    /// Get GPU UUID from nvidia-smi
    async fn get_gpu_uuid(&self, gpu_index: u32) -> Result<String, GpuError> {
        let idx_str = gpu_index.to_string();
        let output = nvidia_smi_with_timeout(&["--query-gpu=uuid", "--format=csv,noheader,nounits", "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to get GPU UUID: {}", e)))?;

        if !output.status.success() {
            return Err(GpuError::MigError(format!(
                "nvidia-smi failed to get GPU UUID: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let uuid = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if uuid.is_empty() {
            return Err(GpuError::MigError(format!(
                "No UUID returned for GPU index {}",
                gpu_index
            )));
        }

        // Remove "GPU-" prefix if present (nvidia-smi returns "GPU-xxxx...")
        let uuid = uuid.strip_prefix("GPU-").unwrap_or(&uuid).to_string();

        Ok(uuid)
    }

    /// Get MIG device UUID using nvidia-smi -L and matching by device number
    ///
    /// Alternative method that parses the full device listing
    #[allow(dead_code)]
    async fn get_mig_device_uuid_from_listing(&self, gpu_index: u32, gi_id: u32, ci_id: u32) -> Result<String, GpuError> {
        let output = nvidia_smi_with_timeout(&["-L"]).await
            .map_err(|e| GpuError::MigError(format!("Failed to list GPU devices: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Parse output to find our specific GPU and its MIG devices
        // Format:
        // GPU 0: NVIDIA H100 (UUID: GPU-xxxxxxxx-...)
        //   MIG 1g.10gb Device 0: (UUID: MIG-xxxxxxxx-...)
        //   MIG 3g.40gb Device 1: (UUID: MIG-yyyyyyyy-...)
        //
        // The Device number corresponds to the CI within the GPU

        let mut current_gpu: Option<u32> = None;
        let mut mig_device_index = 0u32;

        for line in stdout.lines() {
            // Check if this is a GPU line
            if line.starts_with("GPU") {
                // Parse GPU index: "GPU 0: NVIDIA..."
                if let Some(idx_str) = line.strip_prefix("GPU ") {
                    if let Some(idx_end) = idx_str.find(':') {
                        if let Ok(idx) = idx_str[..idx_end].trim().parse::<u32>() {
                            current_gpu = Some(idx);
                            mig_device_index = 0;
                        }
                    }
                }
            }

            // Check if this is a MIG device line under our target GPU
            if current_gpu == Some(gpu_index) && line.contains("MIG") && line.contains("UUID:") {
                // Parse Device number: "  MIG 1g.10gb Device 0: (UUID: ..."
                let device_num = if let Some(device_pos) = line.find("Device") {
                    let after_device = &line[device_pos + 6..];
                    if let Some(colon_pos) = after_device.find(':') {
                        after_device[..colon_pos].trim().parse::<u32>().ok()
                    } else {
                        None
                    }
                } else {
                    Some(mig_device_index)
                };

                // MIG devices are listed in order of creation
                // We need to match based on the GI/CI combination
                // For simplicity, use the device index as a proxy
                if device_num == Some(ci_id) || mig_device_index == ci_id {
                    // Extract UUID
                    if let Some(uuid_start) = line.find("UUID:") {
                        let uuid_part = &line[uuid_start + 5..];
                        if let Some(uuid_end) = uuid_part.find(')') {
                            let uuid = uuid_part[..uuid_end].trim();
                            return Ok(uuid.to_string());
                        }
                    }
                }

                mig_device_index += 1;
            }
        }

        // Fallback: construct using the standard format
        let gpu_uuid = self.get_gpu_uuid(gpu_index).await?;
        Ok(format!("MIG-{}/{}/{}", gpu_uuid, gi_id, ci_id))
    }

    /// Parse MIG profile name to MigProfile enum
    fn parse_mig_profile_name(&self, name: &str) -> MigProfile {
        let name_lower = name.to_lowercase();
        if name_lower.contains("1g") {
            MigProfile::Mig1g5gb
        } else if name_lower.contains("2g") {
            MigProfile::Mig2g10gb
        } else if name_lower.contains("3g") {
            MigProfile::Mig3g20gb
        } else if name_lower.contains("4g") {
            MigProfile::Mig4g40gb
        } else {
            MigProfile::Mig7g80gb
        }
    }

    /// Allocate GPU for a rental
    pub async fn allocate_gpu(&self, gpu_id: &str, min_vram_gb: u32) -> Result<GpuAllocation, GpuError> {
        // First, check GPU state and prepare for allocation
        let (is_mig_enabled, gpu_index, gpu_uuid_str, available_vram, gpu_vram, gpu_model) = {
            let gpus = self.gpus.read().await;
            let gpu = gpus.get(gpu_id)
                .ok_or_else(|| GpuError::NotFound(gpu_id.to_string()))?;

            if gpu.fully_allocated {
                return Err(GpuError::NotAvailable(gpu_id.to_string()));
            }

            if gpu.vram_gb < min_vram_gb {
                return Err(GpuError::InsufficientVram {
                    required: min_vram_gb,
                    available: gpu.vram_gb,
                });
            }

            (
                gpu.mig_enabled,
                gpu.index,
                gpu.uuid.clone(),
                gpu.available_mig_vram_gb,
                gpu.vram_gb,
                gpu.model.clone(),
            )
        };

        // Determine allocation type
        let allocation = if is_mig_enabled {
            // Try to allocate a MIG instance
            // First try to find an existing unallocated instance
            let existing_allocation = {
                let mut gpus = self.gpus.write().await;
                if let Some(gpu) = gpus.get_mut(&gpu_uuid_str) {
                    let existing = gpu.mig_instances.iter_mut()
                        .find(|i| !i.allocated && i.profile.vram_gb() >= min_vram_gb);

                    if let Some(instance) = existing {
                        instance.allocated = true;
                        Some(GpuAllocation::Mig {
                            gpu_index,
                            gi_id: instance.gi_id,
                            ci_id: instance.ci_id,
                            profile: instance.profile,
                            vram_gb: instance.profile.vram_gb(),
                        })
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            if let Some(allocation) = existing_allocation {
                allocation
            } else {
                // Need to create a new MIG instance
                let profile = self.select_mig_profile(min_vram_gb);
                if profile.vram_gb() > available_vram {
                    return Err(GpuError::InsufficientVram {
                        required: min_vram_gb,
                        available: available_vram,
                    });
                }

                let mig_allocation = self.create_mig_instance_async(
                    gpu_index,
                    &gpu_uuid_str,
                    profile,
                ).await?;

                // Update state after creation
                let mut gpus = self.gpus.write().await;
                if let Some(gpu) = gpus.get_mut(&gpu_uuid_str) {
                    if let GpuAllocation::Mig { gi_id, ci_id, profile, .. } = &mig_allocation {
                        gpu.mig_instances.push(MigInstance {
                            gi_id: *gi_id,
                            ci_id: *ci_id,
                            profile: *profile,
                            mig_device_uuid: None, // Will be populated on next refresh
                            allocated: true,
                            rental_id: None,
                        });
                        gpu.available_mig_vram_gb = gpu.available_mig_vram_gb.saturating_sub(profile.vram_gb());
                    }
                }

                mig_allocation
            }
        } else {
            // Exclusive allocation
            let mut gpus = self.gpus.write().await;
            if let Some(gpu) = gpus.get_mut(&gpu_uuid_str) {
                gpu.fully_allocated = true;
            }

            GpuAllocation::Exclusive {
                gpu_uuid: gpu_uuid_str.clone(),
                gpu_model,
                vram_gb: gpu_vram,
            }
        };

        // Track allocation
        let allocation_id = match &allocation {
            GpuAllocation::Exclusive { gpu_uuid, .. } => gpu_uuid.clone(),
            GpuAllocation::Mig { gi_id, ci_id, .. } => format!("MIG-{}/{}", gi_id, ci_id),
        };

        let mut allocations = self.allocations.write().await;
        allocations.insert(allocation_id.clone(), AllocationInfo {
            gpu_uuid: gpu_uuid_str,
            allocation: allocation.clone(),
            rental_id: None,
        });

        info!(
            gpu_id = %gpu_id,
            allocation_id = %allocation_id,
            "GPU allocated"
        );

        Ok(allocation)
    }

    /// Create a new MIG instance asynchronously using nvidia-smi
    ///
    /// This creates both a GPU Instance (GI) and a Compute Instance (CI).
    /// MIG hierarchy: GPU -> GPU Instance (GI) -> Compute Instance (CI)
    async fn create_mig_instance_async(
        &self,
        gpu_index: u32,
        gpu_uuid: &str,
        profile: MigProfile,
    ) -> Result<GpuAllocation, GpuError> {
        let profile_id = self.get_mig_profile_id(profile);

        info!(
            gpu_index = gpu_index,
            profile = ?profile,
            profile_id = profile_id,
            "Creating MIG instance"
        );

        // Step 1: Create GPU Instance (GI)
        let profile_str = profile_id.to_string();
        let idx_str = gpu_index.to_string();
        let gi_output = nvidia_smi_with_timeout(&["mig", "-cgi", &profile_str, "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to create GPU Instance: {}", e)))?;

        if !gi_output.status.success() {
            let stderr = String::from_utf8_lossy(&gi_output.stderr);
            return Err(GpuError::MigError(format!(
                "nvidia-smi mig -cgi failed: {}",
                stderr
            )));
        }

        // Parse GI ID from output
        // Output: "Successfully created GPU instance ID  X on GPU  Y using profile MIG ..."
        let gi_stdout = String::from_utf8_lossy(&gi_output.stdout);
        let gi_id = self.parse_created_instance_id(&gi_stdout, "GPU instance ID")
            .ok_or_else(|| GpuError::MigError(
                "Failed to parse GPU Instance ID from nvidia-smi output".to_string()
            ))?;

        info!(gpu_index = gpu_index, gi_id = gi_id, "Created GPU Instance");

        // Step 2: Create Compute Instance (CI) on the GPU Instance
        let gi_str = gi_id.to_string();
        let ci_output = nvidia_smi_with_timeout(&["mig", "-cci", "-gi", &gi_str, "-i", &idx_str]).await
            .map_err(|e| {
                // Try to clean up the GI we just created
                let _ = self.destroy_mig_instance_sync(gpu_index, gi_id);
                GpuError::MigError(format!("Failed to create Compute Instance: {}", e))
            })?;

        if !ci_output.status.success() {
            let stderr = String::from_utf8_lossy(&ci_output.stderr);
            // Try to clean up the GI
            if let Err(e) = self.destroy_gpu_instance_async(gpu_index, gi_id).await {
                error!(error = %e, "Failed to cleanup GPU Instance after CI creation failure");
            }
            return Err(GpuError::MigError(format!(
                "nvidia-smi mig -cci failed: {}",
                stderr
            )));
        }

        // Parse CI ID from output
        let ci_stdout = String::from_utf8_lossy(&ci_output.stdout);
        let ci_id = self.parse_created_instance_id(&ci_stdout, "compute instance ID")
            .ok_or_else(|| {
                error!(gpu_index = gpu_index, gi_id = gi_id, output = %ci_stdout, "Failed to parse CI ID — cleaning up GI");
                // CI was created (status was success) but we can't parse its ID — destroy the GI to avoid orphans
                let _ = self.destroy_mig_instance_sync(gpu_index, gi_id);
                GpuError::MigError("Failed to parse Compute Instance ID from nvidia-smi output".to_string())
            })?;

        info!(
            gpu_index = gpu_index,
            gi_id = gi_id,
            ci_id = ci_id,
            profile = ?profile,
            "Created MIG instance successfully"
        );

        Ok(GpuAllocation::Mig {
            gpu_index,
            gi_id,
            ci_id,
            profile,
            vram_gb: profile.vram_gb(),
        })
    }

    /// Parse instance ID from nvidia-smi output
    fn parse_created_instance_id(&self, output: &str, id_type: &str) -> Option<u32> {
        // Look for pattern like "GPU instance ID  0" or "compute instance ID  0"
        for line in output.lines() {
            if line.to_lowercase().contains(&id_type.to_lowercase()) {
                // Find the number after the ID type
                let parts: Vec<&str> = line.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if part.eq_ignore_ascii_case("ID") && i + 1 < parts.len() {
                        if let Ok(id) = parts[i + 1].parse::<u32>() {
                            return Some(id);
                        }
                    }
                }
            }
        }
        None
    }

    /// Destroy a GPU Instance (synchronous helper for cleanup during creation failure)
    fn destroy_mig_instance_sync(&self, gpu_index: u32, gi_id: u32) -> Result<(), GpuError> {
        // Use std::process::Command for synchronous execution during error handling
        let output = std::process::Command::new("nvidia-smi")
            .args([
                "mig", "-dgi",
                "-gi", &gi_id.to_string(),
                "-i", &gpu_index.to_string(),
            ])
            .output()
            .map_err(|e| GpuError::MigError(format!("Failed to destroy GPU Instance: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GpuError::MigError(format!(
                "nvidia-smi mig -dgi failed: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Destroy a GPU Instance asynchronously
    async fn destroy_gpu_instance_async(&self, gpu_index: u32, gi_id: u32) -> Result<(), GpuError> {
        let gi_str = gi_id.to_string();
        let idx_str = gpu_index.to_string();

        // First destroy any compute instances
        let dci_output = nvidia_smi_with_timeout(&["mig", "-dci", "-gi", &gi_str, "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to destroy Compute Instances: {}", e)))?;

        if !dci_output.status.success() {
            warn!(
                gpu_index = gpu_index,
                gi_id = gi_id,
                "Failed to destroy Compute Instances (may not exist)"
            );
        }

        // Then destroy the GPU instance
        let dgi_output = nvidia_smi_with_timeout(&["mig", "-dgi", "-gi", &gi_str, "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to destroy GPU Instance: {}", e)))?;

        if !dgi_output.status.success() {
            let stderr = String::from_utf8_lossy(&dgi_output.stderr);
            return Err(GpuError::MigError(format!(
                "nvidia-smi mig -dgi failed: {}",
                stderr
            )));
        }

        info!(gpu_index = gpu_index, gi_id = gi_id, "Destroyed MIG instance");
        Ok(())
    }

    /// Destroy a MIG allocation (CI + GI)
    pub async fn destroy_mig_allocation(&self, gpu_index: u32, gi_id: u32, ci_id: u32) -> Result<(), GpuError> {
        info!(
            gpu_index = gpu_index,
            gi_id = gi_id,
            ci_id = ci_id,
            "Destroying MIG allocation"
        );

        // Destroy compute instance first
        let ci_str = ci_id.to_string();
        let gi_str = gi_id.to_string();
        let idx_str = gpu_index.to_string();
        let dci_output = nvidia_smi_with_timeout(&["mig", "-dci", "-ci", &ci_str, "-gi", &gi_str, "-i", &idx_str]).await
            .map_err(|e| GpuError::MigError(format!("Failed to destroy Compute Instance: {}", e)))?;

        if !dci_output.status.success() {
            let stderr = String::from_utf8_lossy(&dci_output.stderr);
            warn!(stderr = %stderr, "Failed to destroy Compute Instance");
        }

        // Then destroy GPU instance
        self.destroy_gpu_instance_async(gpu_index, gi_id).await
    }

    /// Get the nvidia-smi profile ID for a MIG profile
    fn get_mig_profile_id(&self, profile: MigProfile) -> u32 {
        // Profile IDs for nvidia-smi mig -cgi command
        // These are the same for H100 and A100
        match profile {
            MigProfile::Mig1g5gb => 19,  // 1g.5gb (A100) / 1g.10gb (H100)
            MigProfile::Mig2g10gb => 14, // 2g.10gb (A100) / 2g.20gb (H100)
            MigProfile::Mig3g20gb => 9,  // 3g.20gb (A100) / 3g.40gb (H100)
            MigProfile::Mig4g40gb => 5,  // 4g.40gb (A100 only, H100 uses different profile)
            MigProfile::Mig7g80gb => 0,  // Full GPU
        }
    }

    /// Select the best MIG profile for the requested VRAM
    fn select_mig_profile(&self, min_vram_gb: u32) -> MigProfile {
        // Select smallest profile that meets VRAM requirement
        if min_vram_gb <= 5 {
            MigProfile::Mig1g5gb
        } else if min_vram_gb <= 10 {
            MigProfile::Mig2g10gb
        } else if min_vram_gb <= 20 {
            MigProfile::Mig3g20gb
        } else if min_vram_gb <= 40 {
            MigProfile::Mig4g40gb
        } else {
            MigProfile::Mig7g80gb
        }
    }

    /// Enable MIG mode on a GPU (requires GPU reset - use with caution)
    pub async fn enable_mig_mode(&self, gpu_uuid: &str) -> Result<(), GpuError> {
        warn!(
            gpu_uuid = %gpu_uuid,
            "Enabling MIG mode - this requires a GPU reset"
        );

        let output = nvidia_smi_with_timeout(&["-i", gpu_uuid, "-mig", "1"]).await
            .map_err(|e| GpuError::MigError(format!("Failed to enable MIG mode: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GpuError::MigError(format!(
                "nvidia-smi -mig 1 failed: {}. Note: A GPU reset may be required.",
                stderr
            )));
        }

        info!(gpu_uuid = %gpu_uuid, "MIG mode enabled (GPU reset may be required)");
        Ok(())
    }

    /// Disable MIG mode on a GPU (requires GPU reset - use with caution)
    pub async fn disable_mig_mode(&self, gpu_uuid: &str) -> Result<(), GpuError> {
        warn!(
            gpu_uuid = %gpu_uuid,
            "Disabling MIG mode - this requires a GPU reset"
        );

        let output = nvidia_smi_with_timeout(&["-i", gpu_uuid, "-mig", "0"]).await
            .map_err(|e| GpuError::MigError(format!("Failed to disable MIG mode: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GpuError::MigError(format!(
                "nvidia-smi -mig 0 failed: {}. Note: A GPU reset may be required.",
                stderr
            )));
        }

        info!(gpu_uuid = %gpu_uuid, "MIG mode disabled (GPU reset may be required)");
        Ok(())
    }

    /// Release a GPU allocation
    pub async fn release_gpu(&self, allocation: &GpuAllocation) -> Result<(), GpuError> {
        let allocation_id = match allocation {
            GpuAllocation::Exclusive { gpu_uuid, .. } => gpu_uuid.clone(),
            GpuAllocation::Mig { gi_id, ci_id, .. } => format!("MIG-{}/{}", gi_id, ci_id),
        };

        // Remove from allocations
        let mut allocations = self.allocations.write().await;
        let allocation_info = allocations.remove(&allocation_id);

        if let Some(info) = allocation_info {
            let mut gpus = self.gpus.write().await;

            if let Some(gpu) = gpus.get_mut(&info.gpu_uuid) {
                match allocation {
                    GpuAllocation::Exclusive { .. } => {
                        gpu.fully_allocated = false;
                    }
                    GpuAllocation::Mig { gpu_index, gi_id, ci_id, profile, .. } => {
                        // Remove the MIG instance from tracking
                        gpu.mig_instances.retain(|i| !(i.gi_id == *gi_id && i.ci_id == *ci_id));
                        // Restore available VRAM
                        gpu.available_mig_vram_gb = gpu.available_mig_vram_gb.saturating_add(profile.vram_gb());

                        // Destroy the actual MIG allocation (CI + GI) on the hardware
                        let gpu_idx = *gpu_index;
                        let gi = *gi_id;
                        let ci = *ci_id;
                        // Drop locks before async nvidia-smi call
                        drop(gpus);
                        drop(allocations);
                        if let Err(e) = self.destroy_mig_allocation(gpu_idx, gi, ci).await {
                            error!(
                                gpu_index = gpu_idx,
                                gi_id = gi,
                                ci_id = ci,
                                error = %e,
                                "Failed to destroy MIG allocation on hardware (resource leak)"
                            );
                        }
                        info!(allocation_id = %allocation_id, "GPU MIG instance released and destroyed");
                        return Ok(());
                    }
                }
            }

            info!(allocation_id = %allocation_id, "GPU released");
        }

        Ok(())
    }

    /// Get all available GPUs
    pub async fn get_available_gpus(&self) -> Vec<GpuInfo> {
        let gpus = self.gpus.read().await;
        gpus.values()
            .filter(|g| !g.fully_allocated)
            .cloned()
            .collect()
    }

    /// Get GPU by ID
    pub async fn get_gpu(&self, gpu_id: &str) -> Option<GpuInfo> {
        let gpus = self.gpus.read().await;
        gpus.get(gpu_id).cloned()
    }

    /// Register a GPU (for validators to register their GPUs)
    pub async fn register_gpu(&self, gpu: GpuInfo) {
        let mut gpus = self.gpus.write().await;
        info!(uuid = %gpu.uuid, model = %gpu.model, "Registering GPU");
        gpus.insert(gpu.uuid.clone(), gpu);
    }

    /// Unregister a GPU
    pub async fn unregister_gpu(&self, gpu_uuid: &str) {
        let mut gpus = self.gpus.write().await;
        if gpus.remove(gpu_uuid).is_some() {
            info!(uuid = %gpu_uuid, "GPU unregistered");
        }
    }

    /// Get GPU utilization metrics
    pub async fn get_gpu_metrics(&self, gpu_uuid: &str) -> Result<GpuMetrics, GpuError> {
        let output = nvidia_smi_with_timeout(&[
            "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits",
            "-i", gpu_uuid,
        ]).await
            .map_err(|e| GpuError::MetricsError(format!("nvidia-smi failed: {}", e)))?;

        if !output.status.success() {
            return Err(GpuError::MetricsError("Failed to get GPU metrics".to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split(", ").collect();

        if parts.len() >= 5 {
            Ok(GpuMetrics {
                gpu_utilization: parts[0].parse().unwrap_or(0.0),
                memory_utilization: parts[1].parse().unwrap_or(0.0),
                memory_used_mb: parts[2].parse().unwrap_or(0),
                memory_total_mb: parts[3].parse().unwrap_or(0),
                temperature_c: parts[4].parse().unwrap_or(0),
            })
        } else {
            Err(GpuError::MetricsError("Invalid nvidia-smi output".to_string()))
        }
    }
}

impl Default for GpuManager {
    fn default() -> Self {
        Self::new()
    }
}

/// GPU utilization metrics
#[derive(Debug, Clone)]
pub struct GpuMetrics {
    /// GPU compute utilization (0-100)
    pub gpu_utilization: f32,
    /// GPU memory utilization (0-100)
    pub memory_utilization: f32,
    /// Memory used in MB
    pub memory_used_mb: u32,
    /// Total memory in MB
    pub memory_total_mb: u32,
    /// GPU temperature in Celsius
    pub temperature_c: u32,
}

/// GPU-related errors
#[derive(Debug, thiserror::Error)]
pub enum GpuError {
    #[error("GPU not found: {0}")]
    NotFound(String),

    #[error("GPU not available: {0}")]
    NotAvailable(String),

    #[error("Insufficient VRAM: required {required}GB, available {available}GB")]
    InsufficientVram { required: u32, available: u32 },

    #[error("GPU detection failed: {0}")]
    DetectionFailed(String),

    #[error("MIG error: {0}")]
    MigError(String),

    #[error("Metrics error: {0}")]
    MetricsError(String),

    #[error("Allocation error: {0}")]
    AllocationError(String),
}
