/**
 * Proofs Page Type Definitions
 *
 * Proper TypeScript interfaces to replace `any` types
 */

export interface ProofPhase {
  name: string;
  status: "pending" | "running" | "complete" | "failed";
  duration?: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Live proof type - compatible with both SDK and REST API formats
 */
export interface LiveProof {
  // ID can come in different formats
  proofId?: string;
  id?: string;
  jobId?: string;

  // Circuit info
  circuitType?: string;
  proofType?: string;

  // Status (flexible for various status strings)
  status?: string;
  currentPhase?: string;

  // Timing
  startedAt?: number | null;
  estimatedDuration?: number | null;

  // Progress
  progress?: number | null;

  // Phases (flexible structure)
  phases?: Array<{
    name: string;
    status: string;
    duration?: string | number;
    startedAt?: number;
    completedAt?: number;
  }>;

  // Stats (flexible structure for different formats)
  stats?: {
    totalDuration?: number | string;
    witnessGenMs?: number | string;
    provingMs?: number | string;
    verificationMs?: number | string;
    constraintCount?: number | string;
    traceLength?: number | string;
    fieldSize?: number | string;
    memoryUsed?: number | string;
    gpuUtilization?: number | string | null;
    [key: string]: number | string | null | undefined;
  };

  // Worker info
  worker?: string;
  workerId?: string;
  gpu?: string;
}

/**
 * Historical proof type - compatible with both SDK and REST API formats
 */
export interface HistoricalProof {
  // ID can come in different formats
  proofId?: string;
  id?: string;
  jobId?: string;

  // Circuit info
  circuitType?: string;
  proofType?: string;

  // Status (flexible to handle various status strings)
  status: string;

  // Duration (various formats)
  duration?: number | string;
  durationMs?: number;
  generationTimeMs?: number;

  // Rewards
  reward?: number | string;
  rewards?: number | string;

  // Timestamps (various formats)
  submittedAt?: number;
  generatedAt?: number;
  verifiedAt?: number;

  // Worker info
  worker?: string;
  workerId?: string;
  gpu?: string;

  // On-chain verification
  verifiedOnChain?: boolean;
  onchainVerified?: boolean;

  // Error handling
  errorMessage?: string | null;

  // Transaction info
  txHash?: string | null;
  tx_hash?: string | null;

  // Additional fields from SDK
  proofSize?: string | number | null;
  proof_size?: string | number | null;
  client?: string | null;
  clientId?: string | null;
  securityBits?: number | string | null;
  security_bits?: number | string | null;

  // Stats object (same as LiveProof)
  stats?: {
    totalDuration?: number | string;
    witnessGenMs?: number | string;
    provingMs?: number | string;
    verificationMs?: number | string;
    constraintCount?: number | string;
    traceLength?: number | string;
    fieldSize?: number | string;
    memoryUsed?: number | string;
    gpuUtilization?: number | string | null;
    [key: string]: number | string | null | undefined;
  };
}

export interface ProofStats {
  totalProofs: number;
  verifiedProofs: number;
  avgDuration: number;
  totalRewards: string;
}
