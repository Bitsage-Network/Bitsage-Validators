//! BitSage TEE Prover
//!
//! Trusted Execution Environment prover for privacy-preserving proof generation.
//!
//! # Architecture
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────────────────────┐
//! │                         BitSage TEE Prover                                │
//! ├──────────────────────────────────────────────────────────────────────────┤
//! │                                                                           │
//! │   ┌─────────────────────────────────────────────────────────────────┐    │
//! │   │                    UNTRUSTED HOST                                │    │
//! │   │   - TeeWorker service                                           │    │
//! │   │   - WebSocket connection to coordinator                         │    │
//! │   │   - Encrypted witness routing                                   │    │
//! │   └─────────────────────────────────────────────────────────────────┘    │
//! │                              ↓ ECALL                                      │
//! │   ┌─────────────────────────────────────────────────────────────────┐    │
//! │   │                    TRUSTED ENCLAVE                               │    │
//! │   │   ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │    │
//! │   │   │  ECDH Decrypt   │  │  STWO Prover    │  │  Attestation  │  │    │
//! │   │   │  (witness)      │  │  (ZK proofs)    │  │  (TDX/SGX)    │  │    │
//! │   │   └─────────────────┘  └─────────────────┘  └───────────────┘  │    │
//! │   └─────────────────────────────────────────────────────────────────┘    │
//! │                                                                           │
//! │   TEE Types Supported:                                                   │
//! │   - Intel TDX (Trust Domain Extensions) - H100 native                    │
//! │   - Intel SGX (Software Guard Extensions)                                │
//! │   - AMD SEV-SNP (Secure Encrypted Virtualization)                        │
//! │                                                                           │
//! └──────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Security Model
//!
//! 1. Client encrypts witness using enclave's public key (ECDH + AES-GCM)
//! 2. Encrypted witness is sent to coordinator, then to TEE worker
//! 3. TEE decrypts witness INSIDE the enclave (plaintext never leaves)
//! 4. STWO proof is generated with decrypted witness
//! 5. Attestation proves the proof was generated in genuine TEE
//! 6. Proof + attestation returned (witness never exposed to host)

pub mod worker;

pub use worker::{
    TeeWorker,
    TeeWorkerConfig,
    TeeWorkerMetrics,
    TeeType,
    Attestation,
    AttestedProof,
    EncryptedWitness,
    TeeProofJob,
    run_tee_worker,
};
