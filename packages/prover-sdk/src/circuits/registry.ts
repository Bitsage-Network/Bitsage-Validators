/**
 * @bitsage/prover-sdk - Circuit Registry
 *
 * Registry of all supported circuits with their configurations.
 * Maps circuit types to their metadata, verifier addresses, and timing estimates.
 */

import { CircuitType, CircuitConfig, ProofMode } from '../types';

// ============================================================================
// Verifier Contract Addresses (Sepolia)
// ============================================================================

const VERIFIERS = {
  STWO_VERIFIER: '0x52963fe2f1d2d2545cbe18b8230b739c8861ae726dc7b6f0202cc17a369bd7d',
  PRIVACY_POOLS: '0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7',
  PRIVACY_ROUTER: '0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53',
  CONFIDENTIAL_SWAP: '0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af',
} as const;

// ============================================================================
// Circuit Configurations
// ============================================================================

const CIRCUIT_CONFIGS: Record<CircuitType, CircuitConfig> = {
  // === Compute Proofs (GPU Workers) ===
  [CircuitType.AI_INFERENCE]: {
    id: CircuitType.AI_INFERENCE,
    name: 'AI Inference',
    defaultMode: ProofMode.WORKER_GPU,
    verifierAddress: VERIFIERS.STWO_VERIFIER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 45000,
      [ProofMode.WORKER_GPU]: 5000,
    },
    provingKeySize: 52_428_800, // 50MB
  },

  [CircuitType.DATA_PIPELINE]: {
    id: CircuitType.DATA_PIPELINE,
    name: 'Data Pipeline',
    defaultMode: ProofMode.WORKER_GPU,
    verifierAddress: VERIFIERS.STWO_VERIFIER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 35000,
      [ProofMode.WORKER_GPU]: 4000,
    },
    provingKeySize: 41_943_040, // 40MB
  },

  [CircuitType.ML_TRAINING]: {
    id: CircuitType.ML_TRAINING,
    name: 'ML Training',
    defaultMode: ProofMode.WORKER_GPU,
    verifierAddress: VERIFIERS.STWO_VERIFIER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 120000,
      [ProofMode.WORKER_GPU]: 15000,
    },
    provingKeySize: 104_857_600, // 100MB
  },

  [CircuitType.GENERIC_COMPUTE]: {
    id: CircuitType.GENERIC_COMPUTE,
    name: 'Generic Compute',
    defaultMode: ProofMode.WORKER_GPU,
    verifierAddress: VERIFIERS.STWO_VERIFIER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 25000,
      [ProofMode.WORKER_GPU]: 3000,
    },
    provingKeySize: 31_457_280, // 30MB
  },

  // === Privacy Proofs (TEE Enclaves) ===
  [CircuitType.PRIVACY_WITHDRAW]: {
    id: CircuitType.PRIVACY_WITHDRAW,
    name: 'Privacy Withdraw',
    defaultMode: ProofMode.TEE_ASSISTED,
    verifierAddress: VERIFIERS.PRIVACY_POOLS,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 12000,
      [ProofMode.TEE_ASSISTED]: 3000,
    },
    provingKeySize: 20_971_520, // 20MB
  },

  [CircuitType.PRIVACY_TRANSFER]: {
    id: CircuitType.PRIVACY_TRANSFER,
    name: 'Privacy Transfer',
    defaultMode: ProofMode.TEE_ASSISTED,
    verifierAddress: VERIFIERS.PRIVACY_ROUTER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 15000,
      [ProofMode.TEE_ASSISTED]: 4000,
    },
    provingKeySize: 26_214_400, // 25MB
  },

  [CircuitType.CONFIDENTIAL_SWAP]: {
    id: CircuitType.CONFIDENTIAL_SWAP,
    name: 'Confidential Swap',
    defaultMode: ProofMode.TEE_ASSISTED,
    verifierAddress: VERIFIERS.CONFIDENTIAL_SWAP,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 18000,
      [ProofMode.TEE_ASSISTED]: 5000,
    },
    provingKeySize: 31_457_280, // 30MB
  },

  // === Lightweight Proofs (Client WASM) ===
  [CircuitType.MERKLE_MEMBERSHIP]: {
    id: CircuitType.MERKLE_MEMBERSHIP,
    name: 'Merkle Membership',
    defaultMode: ProofMode.CLIENT_WASM,
    verifierAddress: VERIFIERS.PRIVACY_POOLS,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 5000,
    },
    provingKeySize: 10_485_760, // 10MB
  },

  [CircuitType.RANGE_PROOF]: {
    id: CircuitType.RANGE_PROOF,
    name: 'Range Proof',
    defaultMode: ProofMode.CLIENT_WASM,
    verifierAddress: VERIFIERS.PRIVACY_ROUTER,
    estimatedTimeMs: {
      [ProofMode.CLIENT_WASM]: 3000,
    },
    provingKeySize: 5_242_880, // 5MB
  },
};

// ============================================================================
// Circuit Registry API
// ============================================================================

export class CircuitRegistry {
  private static configs = new Map<CircuitType, CircuitConfig>(
    Object.entries(CIRCUIT_CONFIGS).map(([, config]) => [config.id, config])
  );

  /**
   * Get circuit configuration by type
   */
  static get(circuit: CircuitType): CircuitConfig | undefined {
    return this.configs.get(circuit);
  }

  /**
   * Get all circuit configurations
   */
  static getAll(): CircuitConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get circuits by mode
   */
  static getByMode(mode: ProofMode): CircuitConfig[] {
    return this.getAll().filter(c => c.defaultMode === mode);
  }

  /**
   * Get circuit by name (case-insensitive)
   */
  static getByName(name: string): CircuitConfig | undefined {
    return this.getAll().find(c => c.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get total proving key size for a set of circuits
   */
  static getTotalProvingKeySize(circuits: CircuitType[]): number {
    return circuits.reduce((sum, c) => {
      const config = this.get(c);
      return sum + (config?.provingKeySize ?? 0);
    }, 0);
  }

  /**
   * Get estimated proof time for circuit + mode
   */
  static getEstimatedTime(circuit: CircuitType, mode: ProofMode): number | undefined {
    const config = this.get(circuit);
    return config?.estimatedTimeMs[mode];
  }

  /**
   * Check if circuit supports a given mode
   */
  static supportsMode(circuit: CircuitType, mode: ProofMode): boolean {
    const config = this.get(circuit);
    if (!config) return false;

    return config.estimatedTimeMs[mode] !== undefined;
  }

  /**
   * Get CDN path for proving key
   */
  static getProvingKeyPath(circuit: CircuitType, cdnBase: string): string {
    const config = this.get(circuit);
    if (!config) {
      throw new Error(`Unknown circuit: ${circuit}`);
    }

    const circuitName = config.name.toLowerCase().replace(/\s+/g, '-');
    return `${cdnBase}/${circuitName}/proving-key.bin`;
  }

  /**
   * Register a custom circuit (for extensions)
   */
  static register(config: CircuitConfig): void {
    this.configs.set(config.id, config);
  }
}

// ============================================================================
// Circuit Type Guards
// ============================================================================

/**
 * Check if circuit requires privacy (TEE) mode
 */
export function isPrivacyCircuit(circuit: CircuitType): boolean {
  return [
    CircuitType.PRIVACY_WITHDRAW,
    CircuitType.PRIVACY_TRANSFER,
    CircuitType.CONFIDENTIAL_SWAP,
  ].includes(circuit);
}

/**
 * Check if circuit is compute-intensive (GPU preferred)
 */
export function isComputeCircuit(circuit: CircuitType): boolean {
  return [
    CircuitType.AI_INFERENCE,
    CircuitType.DATA_PIPELINE,
    CircuitType.ML_TRAINING,
    CircuitType.GENERIC_COMPUTE,
  ].includes(circuit);
}

/**
 * Check if circuit is lightweight (WASM suitable)
 */
export function isLightweightCircuit(circuit: CircuitType): boolean {
  return [
    CircuitType.MERKLE_MEMBERSHIP,
    CircuitType.RANGE_PROOF,
  ].includes(circuit);
}
