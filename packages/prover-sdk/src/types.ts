/**
 * @bitsage/prover-sdk - Core Types
 *
 * Defines the unified type system for STWO proof generation across:
 * - Browser WASM (fallback)
 * - GPU Workers (compute proofs)
 * - TEE Enclaves (privacy proofs)
 */

// ============================================================================
// Proof Mode - How the proof will be generated
// ============================================================================

export enum ProofMode {
  /** Browser-based WASM prover (slowest, but works offline) */
  CLIENT_WASM = 'client_wasm',

  /** GPU worker on validator network (fast, for compute proofs) */
  WORKER_GPU = 'worker_gpu',

  /** TEE enclave for privacy proofs (secret witness protection) */
  TEE_ASSISTED = 'tee_assisted',

  /** Auto-select based on circuit type */
  AUTO = 'auto',
}

// ============================================================================
// Circuit Types - What kind of proof to generate
// ============================================================================

export enum CircuitType {
  // === Compute Proofs (WORKER_GPU mode) ===
  /** AI/ML inference verification */
  AI_INFERENCE = 0x01,
  /** Data pipeline integrity */
  DATA_PIPELINE = 0x02,
  /** ML training verification */
  ML_TRAINING = 0x03,
  /** Generic compute task */
  GENERIC_COMPUTE = 0x04,

  // === Privacy Proofs (TEE_ASSISTED mode) ===
  /** Privacy pool withdrawal */
  PRIVACY_WITHDRAW = 0x10,
  /** Private token transfer */
  PRIVACY_TRANSFER = 0x11,
  /** Confidential swap */
  CONFIDENTIAL_SWAP = 0x12,

  // === Lightweight Proofs (CLIENT_WASM mode) ===
  /** Merkle tree membership */
  MERKLE_MEMBERSHIP = 0x13,
  /** Range proof (value in bounds) */
  RANGE_PROOF = 0x14,
}

/** Circuit metadata for routing and configuration */
export interface CircuitConfig {
  id: CircuitType;
  name: string;
  /** Recommended proof mode for this circuit */
  defaultMode: ProofMode;
  /** On-chain verifier contract address (Starknet) */
  verifierAddress: string;
  /** Estimated proof generation time in ms (varies by mode) */
  estimatedTimeMs: {
    [ProofMode.CLIENT_WASM]?: number;
    [ProofMode.WORKER_GPU]?: number;
    [ProofMode.TEE_ASSISTED]?: number;
  };
  /** Size of proving key in bytes (for CDN cache) */
  provingKeySize: number;
}

// ============================================================================
// Witness Types - Input data for proof generation
// ============================================================================

/** Public inputs visible to verifier and on-chain */
export type PublicInputs = Record<string, bigint | string | number>;

/** Private inputs only known to prover (or encrypted to TEE) */
export type PrivateInputs = Record<string, bigint | string | number>;

/** Combined witness for proof generation */
export interface Witness {
  publicInputs: PublicInputs;
  privateInputs?: PrivateInputs;
}

// ============================================================================
// Proof Generation Progress
// ============================================================================

export type ProofPhase =
  | 'connecting'     // Connecting to prover service
  | 'loading'        // Loading circuit/proving key
  | 'encrypting'     // Encrypting witness for TEE
  | 'witness'        // Processing witness
  | 'commit'         // Commitment phase (FRI)
  | 'fri'            // FRI folding rounds
  | 'query'          // Query phase
  | 'finalizing'     // Assembling proof
  | 'done';          // Complete

export interface ProofProgress {
  phase: ProofPhase;
  /** 0-100 progress within current phase */
  progress: number;
  /** Overall progress 0-100 */
  overallProgress: number;
  /** Estimated time remaining in ms */
  estimatedTimeMs?: number;
  /** Current FRI round (if in fri phase) */
  friRound?: number;
  /** Total FRI rounds */
  friFoldings?: number;
}

// ============================================================================
// Proof Result
// ============================================================================

export interface STWOProof {
  /** Commitment to trace polynomials */
  commitment: string;
  /** FRI proof data */
  fri: {
    /** Merkle roots for each FRI layer */
    layerCommitments: string[];
    /** Query responses */
    queries: string[][];
  };
  /** Final polynomial coefficients */
  finalPoly: string[];
  /** Public inputs (for verification) */
  publicInputs: string[];
}

export interface ProofResult {
  /** Unique proof ID */
  id: string;
  /** Circuit that was proven */
  circuit: CircuitType;
  /** The STWO proof data */
  proof: STWOProof;
  /** Public inputs used */
  publicInputs: PublicInputs;
  /** How the proof was generated */
  mode: ProofMode;
  /** Timestamp of generation */
  timestamp: number;
  /** Time taken to generate (ms) */
  generationTimeMs: number;
  /** Remote attestation (if TEE mode) */
  attestation?: TEEAttestation;
}

// ============================================================================
// TEE Attestation
// ============================================================================

export interface TEEAttestation {
  /** Attestation type (sgx, tdx, sev) */
  type: 'sgx' | 'tdx' | 'sev';
  /** Quote/report from TEE */
  quote: string;
  /** Public key of enclave (for ECDH) */
  enclavePubKey: string;
  /** Measurement/MRENCLAVE */
  measurement: string;
  /** Signature over proof hash */
  signature: string;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// Encrypted Witness (for TEE transport)
// ============================================================================

export interface EncryptedWitness {
  /** AES-GCM encrypted private inputs */
  ciphertext: string;
  /** Initialization vector */
  iv: string;
  /** ECDH ephemeral public key (client side) */
  ephemeralPubKey: string;
  /** Target enclave public key used */
  enclavePubKey: string;
  /** Public inputs (not encrypted) */
  publicInputs: PublicInputs;
}

// ============================================================================
// Prover Client Configuration
// ============================================================================

export interface ProverClientConfig {
  /** Coordinator URL for proof routing */
  coordinatorUrl: string;
  /** Default proof mode */
  defaultMode?: ProofMode;
  /** API key for authenticated requests */
  apiKey?: string;
  /** Timeout for proof generation (ms) */
  timeout?: number;
  /** Path to WASM prover binary (for CLIENT_WASM mode) */
  wasmPath?: string;
  /** CDN URL for proving keys */
  provingKeyCdnUrl?: string;
}

// ============================================================================
// Proof Request/Response (Coordinator Protocol)
// ============================================================================

export interface ProofRequest {
  /** Request ID (client-generated UUID) */
  requestId: string;
  /** Circuit to prove */
  circuit: CircuitType;
  /** Proof mode to use */
  mode: ProofMode;
  /** Witness data (encrypted if TEE mode) */
  witness: Witness | EncryptedWitness;
  /** Deadline timestamp */
  deadline: number;
  /** Client public key for result encryption (optional) */
  clientPubKey?: string;
}

export interface ProofResponse {
  /** Original request ID */
  requestId: string;
  /** Status of the request */
  status: 'pending' | 'proving' | 'completed' | 'failed';
  /** Proof result (if completed) */
  result?: ProofResult;
  /** Error message (if failed) */
  error?: string;
  /** Current progress (if proving) */
  progress?: ProofProgress;
}

// ============================================================================
// WebSocket Messages (Real-time streaming)
// ============================================================================

export type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'progress'
  | 'completed'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  requestId: string;
  payload: ProofProgress | ProofResult | { error: string };
}

// ============================================================================
// On-Chain Submission
// ============================================================================

export interface OnChainSubmission {
  /** Transaction hash */
  txHash: string;
  /** Block number (when confirmed) */
  blockNumber?: number;
  /** Verifier contract address */
  verifierAddress: string;
  /** Gas used */
  gasUsed?: bigint;
}

// ============================================================================
// Prover Capabilities (from coordinator)
// ============================================================================

export interface ProverCapabilities {
  /** Supported circuits */
  circuits: CircuitType[];
  /** Supported modes */
  modes: ProofMode[];
  /** GPU backends available */
  gpuBackends: ('cuda' | 'metal' | 'vulkan')[];
  /** TEE types available */
  teeTypes: ('sgx' | 'tdx' | 'sev')[];
  /** Maximum concurrent proofs */
  maxConcurrent: number;
  /** Version info */
  version: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class ProverError extends Error {
  constructor(
    message: string,
    public code: ProverErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ProverError';
  }
}

export enum ProverErrorCode {
  /** Network/connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Proof generation failed */
  PROOF_FAILED = 'PROOF_FAILED',
  /** Invalid witness format */
  INVALID_WITNESS = 'INVALID_WITNESS',
  /** Circuit not supported */
  UNSUPPORTED_CIRCUIT = 'UNSUPPORTED_CIRCUIT',
  /** Mode not available */
  MODE_UNAVAILABLE = 'MODE_UNAVAILABLE',
  /** Timeout exceeded */
  TIMEOUT = 'TIMEOUT',
  /** TEE attestation failed */
  ATTESTATION_FAILED = 'ATTESTATION_FAILED',
  /** On-chain verification failed */
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  /** Proving key not found */
  PROVING_KEY_NOT_FOUND = 'PROVING_KEY_NOT_FOUND',
}
