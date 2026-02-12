//! STWO GPU Prover
//!
//! GPU-accelerated STWO prover with CUDA and Metal backends.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                     STWO GPU Prover                         │
//! ├─────────────────────────────────────────────────────────────┤
//! │                                                              │
//! │  ┌──────────────────┐  ┌──────────────────┐                 │
//! │  │   GpuProver API  │  │  CircuitLoader   │                 │
//! │  │   - prove()      │  │  - load_circuit()│                 │
//! │  │   - verify()     │  │  - cache_key()   │                 │
//! │  └────────┬─────────┘  └──────────────────┘                 │
//! │           │                                                  │
//! │           ▼                                                  │
//! │  ┌──────────────────────────────────────────────────────┐   │
//! │  │                  Backend Abstraction                  │   │
//! │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
//! │  │  │    CUDA     │  │    Metal    │  │   Vulkan    │  │   │
//! │  │  │  (NVIDIA)   │  │   (Apple)   │  │  (future)   │  │   │
//! │  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
//! │  └──────────────────────────────────────────────────────┘   │
//! │                                                              │
//! │  Accelerated Operations:                                     │
//! │  - NTT (Number Theoretic Transform)                         │
//! │  - FRI folding                                               │
//! │  - Merkle tree hashing                                       │
//! │  - Polynomial evaluation                                     │
//! │                                                              │
//! └─────────────────────────────────────────────────────────────┘
//! ```

pub mod prover;
pub mod backends;
pub mod worker;
mod types;
mod fri;
mod ntt;

pub use prover::{GpuProver, ProverConfig};
pub use types::*;
pub use worker::{GpuWorker, WorkerConfig, WorkerMetrics, run_worker};

/// GPU backend selection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuBackend {
    /// NVIDIA CUDA
    Cuda,
    /// Apple Metal
    Metal,
    /// Cross-platform Vulkan (future)
    Vulkan,
    /// CPU fallback
    Cpu,
}

impl GpuBackend {
    /// Detect best available backend
    pub fn detect() -> Self {
        #[cfg(feature = "cuda")]
        if Self::cuda_available() {
            return Self::Cuda;
        }

        #[cfg(feature = "metal")]
        if Self::metal_available() {
            return Self::Metal;
        }

        Self::Cpu
    }

    #[cfg(feature = "cuda")]
    fn cuda_available() -> bool {
        // Check for CUDA devices
        unsafe {
            let mut count: i32 = 0;
            // cuda_runtime_sys::cudaGetDeviceCount(&mut count) == 0 && count > 0
            false // Placeholder until CUDA bindings are set up
        }
    }

    #[cfg(not(feature = "cuda"))]
    fn cuda_available() -> bool {
        false
    }

    #[cfg(feature = "metal")]
    fn metal_available() -> bool {
        // Check for Metal-capable device
        true // Metal is always available on macOS
    }

    #[cfg(not(feature = "metal"))]
    fn metal_available() -> bool {
        false
    }
}

/// Initialize the GPU prover subsystem
pub fn init() -> Result<(), GpuError> {
    let backend = GpuBackend::detect();
    tracing::info!(?backend, "Initialized GPU prover backend");
    Ok(())
}

/// GPU-related errors
#[derive(Debug, thiserror::Error)]
pub enum GpuError {
    #[error("No GPU backend available")]
    NoBackend,

    #[error("GPU device error: {0}")]
    DeviceError(String),

    #[error("Kernel launch error: {0}")]
    KernelError(String),

    #[error("Memory allocation error: {0}")]
    MemoryError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Prover error: {0}")]
    ProverError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backend_detection() {
        let backend = GpuBackend::detect();
        println!("Detected backend: {:?}", backend);
    }
}
