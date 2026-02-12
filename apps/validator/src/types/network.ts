/**
 * Network Page Type Definitions
 *
 * Proper TypeScript interfaces to replace `any` types
 */

/**
 * Network statistics base type - compatible with both SDK (snake_case)
 * and REST API (camelCase) responses
 */
export interface NetworkStatsBase {
  // CamelCase fields (REST API format)
  totalWorkers?: number;
  totalValidators?: number;
  activeWorkers?: number;
  activeValidators?: number;
  totalGPUs?: number;
  totalStaked?: number | bigint;
  jobsLast24h?: number | bigint;
  jobsProcessed24h?: number | bigint;
  avgResponseTime?: number | string;
  uptime?: number;
  currentEpoch?: number;
  epoch?: number;
  successRate?: number;
  teeAttestationRate?: number;

  // Snake_case fields (SDK WebSocket format)
  total_workers?: number;
  active_workers?: number;
  total_gpus?: number;
  total_staked?: number | bigint;
  total_jobs_completed?: number | bigint;
  jobs_completed_24h?: number | bigint;
  jobs_pending?: number;
  total_flops?: string | bigint;
  network_tps?: number;
  avg_response_time?: number | string;
  success_rate?: number;
  tee_attestation_rate?: number;

  // SDK event fields
  type?: string;
  data?: NetworkStatsBase;
  timestamp?: number;
}

/**
 * Worker data type - compatible with both SDK (snake_case)
 * and REST API (camelCase) responses
 */
export interface WorkerData {
  // Address can come in different formats
  address?: string;
  worker_address?: string;
  id?: string;

  // GPU info (camelCase)
  gpuModel?: string;
  gpu?: string;
  gpuCount?: number;

  // GPU info (snake_case)
  gpu_model?: string;
  gpu_type?: string;
  gpu_count?: number;

  // Staking (camelCase)
  stakedAmount?: number | bigint;
  uptime?: number;
  reputationScore?: number;

  // Staking (snake_case)
  staked_amount?: number | bigint;
  reputation_score?: number;
  status?: string;
}

/**
 * Leaderboard worker type - compatible with both SDK (snake_case)
 * and REST API (camelCase) responses
 */
export interface LeaderboardWorker {
  // Address can come in different formats
  address?: string;
  worker_address?: string;
  id?: string;

  // GPU (camelCase)
  gpuCount?: number;

  // GPU (snake_case)
  gpu_count?: number;

  // Staking (camelCase)
  stakedAmount?: number | bigint;
  uptime?: number;
  reputationScore?: number;

  // Staking (snake_case)
  staked_amount?: number | bigint;
  reputation_score?: number;
  rank?: number;
}

export interface TopValidator {
  rank: number;
  address: string;
  fullAddress: string;
  gpus: number;
  staked: string;
  uptime: string;
  reputation: number;
}

export interface GpuDistribution {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

export interface RecentEpoch {
  number: number;
  validatorCount: number;
  jobCount: number;
}

export interface FormattedEpoch {
  epoch: number;
  validators: number;
  jobs: number;
  time: string;
}
