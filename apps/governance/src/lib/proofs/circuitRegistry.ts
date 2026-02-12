/**
 * STWO Circuit Registry
 *
 * Defines all supported proof circuits with their parameters.
 * Used for proof generation, verification, and display.
 */

// ============================================================================
// Types
// ============================================================================

export type CircuitId =
  | 'ai_inference'
  | 'data_pipeline'
  | 'ml_training'
  | 'generic_compute'
  | 'privacy_withdraw'
  | 'privacy_transfer'
  | 'confidential_swap'
  | 'merkle_membership'
  | 'range_proof';

export type ProofMode = 'gpu_worker' | 'tee_assisted' | 'client_wasm';

export interface FriParameters {
  /** Number of FRI queries for soundness */
  numQueries: number;
  /** Blowup factor (rate parameter) */
  blowupFactor: number;
  /** Folding factor per round */
  foldingFactor: number;
  /** Last layer degree bound */
  lastLayerDegBound: number;
}

export interface CircuitDefinition {
  /** Unique circuit identifier */
  id: CircuitId;
  /** Human-readable name */
  name: string;
  /** Description of what this circuit proves */
  description: string;
  /** On-chain circuit type ID (matches contract) */
  onChainId: number;
  /** Recommended proof mode */
  recommendedMode: ProofMode;
  /** Whether witness contains secrets requiring TEE */
  hasSecretWitness: boolean;
  /** Estimated proof generation time (ms) */
  estimatedTimeMs: number;
  /** Approximate proof size (bytes) */
  proofSizeBytes: number;
  /** Security level in bits */
  securityBits: number;
  /** FRI parameters for STWO */
  friParams: FriParameters;
  /** Verifier contract address on Starknet */
  verifierAddress: string;
  /** Proving key CDN path */
  provingKeyPath: string;
  /** Verification key hash */
  vkHash: string;
}

// ============================================================================
// Circuit Definitions
// ============================================================================

/**
 * Standard FRI parameters for different security levels
 */
const FRI_PARAMS = {
  /** 96-bit security - fast proofs */
  fast: {
    numQueries: 27,
    blowupFactor: 4,
    foldingFactor: 4,
    lastLayerDegBound: 64,
  } satisfies FriParameters,

  /** 128-bit security - standard */
  standard: {
    numQueries: 42,
    blowupFactor: 4,
    foldingFactor: 4,
    lastLayerDegBound: 64,
  } satisfies FriParameters,

  /** 128-bit security with higher blowup - more robust */
  robust: {
    numQueries: 30,
    blowupFactor: 8,
    foldingFactor: 4,
    lastLayerDegBound: 32,
  } satisfies FriParameters,
};

/**
 * Contract addresses on Starknet Sepolia
 */
const VERIFIER_ADDRESSES = {
  stwo: process.env.NEXT_PUBLIC_STWO_VERIFIER || '0x52963fe2a4bf5c4f6bb06a70f4bb33e7f2a00a0d60c4c431e1cad4a94ac54a3',
  privacyPools: process.env.NEXT_PUBLIC_PRIVACY_POOLS || '0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7',
  privacyRouter: process.env.NEXT_PUBLIC_PRIVACY_ROUTER || '0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53',
  confidentialSwap: process.env.NEXT_PUBLIC_CONFIDENTIAL_SWAP || '0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af',
};

/**
 * Full circuit registry
 */
export const CIRCUIT_REGISTRY: Record<CircuitId, CircuitDefinition> = {
  // =========================================================================
  // Compute Circuits (GPU Worker)
  // =========================================================================

  ai_inference: {
    id: 'ai_inference',
    name: 'AI Inference',
    description: 'Proves correct execution of neural network inference',
    onChainId: 0x01,
    recommendedMode: 'gpu_worker',
    hasSecretWitness: false,
    estimatedTimeMs: 5000,
    proofSizeBytes: 48_000,
    securityBits: 128,
    friParams: FRI_PARAMS.standard,
    verifierAddress: VERIFIER_ADDRESSES.stwo,
    provingKeyPath: '/keys/ai_inference.pk',
    vkHash: '0x1a2b3c4d5e6f...',
  },

  data_pipeline: {
    id: 'data_pipeline',
    name: 'Data Pipeline',
    description: 'Proves correct data transformation and aggregation',
    onChainId: 0x02,
    recommendedMode: 'gpu_worker',
    hasSecretWitness: false,
    estimatedTimeMs: 4000,
    proofSizeBytes: 32_000,
    securityBits: 128,
    friParams: FRI_PARAMS.standard,
    verifierAddress: VERIFIER_ADDRESSES.stwo,
    provingKeyPath: '/keys/data_pipeline.pk',
    vkHash: '0x2b3c4d5e6f7a...',
  },

  ml_training: {
    id: 'ml_training',
    name: 'ML Training',
    description: 'Proves correct gradient computation and model updates',
    onChainId: 0x03,
    recommendedMode: 'gpu_worker',
    hasSecretWitness: false,
    estimatedTimeMs: 15000,
    proofSizeBytes: 96_000,
    securityBits: 128,
    friParams: FRI_PARAMS.robust,
    verifierAddress: VERIFIER_ADDRESSES.stwo,
    provingKeyPath: '/keys/ml_training.pk',
    vkHash: '0x3c4d5e6f7a8b...',
  },

  generic_compute: {
    id: 'generic_compute',
    name: 'Generic Compute',
    description: 'General purpose computation proof',
    onChainId: 0x04,
    recommendedMode: 'gpu_worker',
    hasSecretWitness: false,
    estimatedTimeMs: 3000,
    proofSizeBytes: 24_000,
    securityBits: 128,
    friParams: FRI_PARAMS.standard,
    verifierAddress: VERIFIER_ADDRESSES.stwo,
    provingKeyPath: '/keys/generic_compute.pk',
    vkHash: '0x4d5e6f7a8b9c...',
  },

  // =========================================================================
  // Privacy Circuits (TEE Assisted - Secret Witness)
  // =========================================================================

  privacy_withdraw: {
    id: 'privacy_withdraw',
    name: 'Privacy Withdraw',
    description: 'Proves ownership of privacy pool note for withdrawal',
    onChainId: 0x10,
    recommendedMode: 'tee_assisted',
    hasSecretWitness: true,
    estimatedTimeMs: 3000,
    proofSizeBytes: 16_000,
    securityBits: 128,
    friParams: FRI_PARAMS.standard,
    verifierAddress: VERIFIER_ADDRESSES.privacyPools,
    provingKeyPath: '/keys/privacy_withdraw.pk',
    vkHash: '0x5e6f7a8b9c0d...',
  },

  privacy_transfer: {
    id: 'privacy_transfer',
    name: 'Privacy Transfer',
    description: 'Proves valid private token transfer between notes',
    onChainId: 0x11,
    recommendedMode: 'tee_assisted',
    hasSecretWitness: true,
    estimatedTimeMs: 4000,
    proofSizeBytes: 20_000,
    securityBits: 128,
    friParams: FRI_PARAMS.standard,
    verifierAddress: VERIFIER_ADDRESSES.privacyRouter,
    provingKeyPath: '/keys/privacy_transfer.pk',
    vkHash: '0x6f7a8b9c0d1e...',
  },

  confidential_swap: {
    id: 'confidential_swap',
    name: 'Confidential Swap',
    description: 'Proves valid confidential token swap',
    onChainId: 0x12,
    recommendedMode: 'tee_assisted',
    hasSecretWitness: true,
    estimatedTimeMs: 5000,
    proofSizeBytes: 24_000,
    securityBits: 128,
    friParams: FRI_PARAMS.robust,
    verifierAddress: VERIFIER_ADDRESSES.confidentialSwap,
    provingKeyPath: '/keys/confidential_swap.pk',
    vkHash: '0x7a8b9c0d1e2f...',
  },

  // =========================================================================
  // Client-Side Circuits (WASM - Public Witness)
  // =========================================================================

  merkle_membership: {
    id: 'merkle_membership',
    name: 'Merkle Membership',
    description: 'Proves leaf membership in Merkle tree',
    onChainId: 0x13,
    recommendedMode: 'client_wasm',
    hasSecretWitness: false,
    estimatedTimeMs: 5000,
    proofSizeBytes: 8_000,
    securityBits: 96,
    friParams: FRI_PARAMS.fast,
    verifierAddress: VERIFIER_ADDRESSES.privacyPools,
    provingKeyPath: '/keys/merkle_membership.pk',
    vkHash: '0x8b9c0d1e2f3a...',
  },

  range_proof: {
    id: 'range_proof',
    name: 'Range Proof',
    description: 'Proves value is within specified range [0, 2^64]',
    onChainId: 0x14,
    recommendedMode: 'client_wasm',
    hasSecretWitness: false,
    estimatedTimeMs: 3000,
    proofSizeBytes: 4_000,
    securityBits: 96,
    friParams: FRI_PARAMS.fast,
    verifierAddress: VERIFIER_ADDRESSES.privacyRouter,
    provingKeyPath: '/keys/range_proof.pk',
    vkHash: '0x9c0d1e2f3a4b...',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get circuit definition by ID
 */
export function getCircuit(id: CircuitId): CircuitDefinition {
  const circuit = CIRCUIT_REGISTRY[id];
  if (!circuit) {
    throw new Error(`Unknown circuit: ${id}`);
  }
  return circuit;
}

/**
 * Get all circuits for a specific mode
 */
export function getCircuitsByMode(mode: ProofMode): CircuitDefinition[] {
  return Object.values(CIRCUIT_REGISTRY).filter(c => c.recommendedMode === mode);
}

/**
 * Get circuits that require TEE (have secret witness)
 */
export function getPrivacyCircuits(): CircuitDefinition[] {
  return Object.values(CIRCUIT_REGISTRY).filter(c => c.hasSecretWitness);
}

/**
 * Get circuits suitable for GPU workers (public witness)
 */
export function getComputeCircuits(): CircuitDefinition[] {
  return Object.values(CIRCUIT_REGISTRY).filter(c => !c.hasSecretWitness);
}

/**
 * Format FRI parameters for display
 */
export function formatFriParams(params: FriParameters): string {
  return `q=${params.numQueries}, ρ=1/${params.blowupFactor}, f=${params.foldingFactor}`;
}

/**
 * Calculate expected soundness error
 */
export function calculateSoundnessError(params: FriParameters): number {
  // Simplified: soundness ≈ (1/blowupFactor)^numQueries
  return Math.pow(1 / params.blowupFactor, params.numQueries);
}

/**
 * Get circuit by on-chain ID
 */
export function getCircuitByOnChainId(onChainId: number): CircuitDefinition | undefined {
  return Object.values(CIRCUIT_REGISTRY).find(c => c.onChainId === onChainId);
}

/**
 * Get display color for circuit type
 */
export function getCircuitColor(id: CircuitId): { text: string; bg: string } {
  const colors: Record<CircuitId, { text: string; bg: string }> = {
    ai_inference: { text: 'text-purple-400', bg: 'bg-purple-500/20' },
    data_pipeline: { text: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    ml_training: { text: 'text-orange-400', bg: 'bg-orange-500/20' },
    generic_compute: { text: 'text-gray-400', bg: 'bg-gray-500/20' },
    privacy_withdraw: { text: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    privacy_transfer: { text: 'text-blue-400', bg: 'bg-blue-500/20' },
    confidential_swap: { text: 'text-pink-400', bg: 'bg-pink-500/20' },
    merkle_membership: { text: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    range_proof: { text: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  };
  return colors[id];
}

/**
 * Get icon name for circuit type (for lucide-react)
 */
export function getCircuitIcon(id: CircuitId): string {
  const icons: Record<CircuitId, string> = {
    ai_inference: 'Brain',
    data_pipeline: 'Database',
    ml_training: 'Cpu',
    generic_compute: 'Calculator',
    privacy_withdraw: 'Unlock',
    privacy_transfer: 'ArrowRightLeft',
    confidential_swap: 'RefreshCcw',
    merkle_membership: 'GitBranch',
    range_proof: 'Ruler',
  };
  return icons[id];
}

// Note: CircuitDefinition and FriParameters are already exported as interfaces above
