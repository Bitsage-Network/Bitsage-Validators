/**
 * @bitsage/prover-sdk
 *
 * Unified STWO Prover SDK for BitSage Network
 *
 * Supports multiple proof generation backends:
 * - CLIENT_WASM: Browser-based WASM prover (offline/fallback)
 * - WORKER_GPU: GPU-accelerated workers on validator network
 * - TEE_ASSISTED: TEE enclaves for privacy proofs
 *
 * @example
 * ```typescript
 * import { ProverClient, CircuitType, ProofMode } from '@bitsage/prover-sdk';
 *
 * const client = new ProverClient({
 *   coordinatorUrl: 'https://coordinator.bitsage.network',
 * });
 *
 * await client.init();
 *
 * const proof = await client.prove(
 *   CircuitType.PRIVACY_WITHDRAW,
 *   {
 *     publicInputs: { nullifier, merkleRoot, recipient },
 *     privateInputs: { nullifierSecret, blinding, value },
 *   },
 *   {
 *     mode: ProofMode.TEE_ASSISTED,
 *     onProgress: (p) => console.log(`${p.phase}: ${p.progress}%`),
 *   }
 * );
 *
 * const txHash = await client.submitOnChain(proof);
 * ```
 */

// Core types
export {
  // Enums
  ProofMode,
  CircuitType,
  ProverErrorCode,

  // Types
  type CircuitConfig,
  type PublicInputs,
  type PrivateInputs,
  type Witness,
  type ProofPhase,
  type ProofProgress,
  type STWOProof,
  type ProofResult,
  type TEEAttestation,
  type EncryptedWitness,
  type ProverClientConfig,
  type ProofRequest,
  type ProofResponse,
  type WSMessage,
  type WSMessageType,
  type OnChainSubmission,
  type ProverCapabilities,

  // Error class
  ProverError,
} from './types';

// Client
export {
  ProverClient,
  getProverClient,
  createProverClient,
} from './client';

// Circuits
export {
  CircuitRegistry,
  CircuitLoader,
  isPrivacyCircuit,
  isComputeCircuit,
  isLightweightCircuit,
} from './circuits';

// Provers (for advanced use cases)
export {
  WasmProver,
  TEEProxy,
  WorkerProxy,
} from './provers';

// Crypto utilities
export {
  encryptWitnessForTEE,
  bytesToHex,
  hexToBytes,
  sha256,
} from './crypto';

// React hooks (re-exported for convenience)
export {
  useProver,
  usePrivacyProver,
  useComputeProver,
  useOfflineProver,
  useProverClient,
  ProverProvider,
} from './hooks';

// ============================================================================
// Constants
// ============================================================================

/** SDK version */
export const VERSION = '0.1.0';

/** Default coordinator URL (Sepolia testnet) */
export const DEFAULT_COORDINATOR_URL = 'https://coordinator.bitsage.network';

/** STWO verifier contract address (Sepolia) */
export const STWO_VERIFIER_ADDRESS = '0x52963fe2f1d2d2545cbe18b8230b739c8861ae726dc7b6f0202cc17a369bd7d';

/** Privacy pools contract address (Sepolia) */
export const PRIVACY_POOLS_ADDRESS = '0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7';
