/**
 * Validator Registration Hook
 *
 * Manages the complete validator registration flow:
 * 1. GPU hardware detection
 * 2. Stake requirement checking
 * 3. On-chain validator registration
 * 4. Status monitoring
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import {
  getContractAddresses,
  buildRegisterValidatorMulticall,
  buildAddValidatorStakeCall,
  buildExitValidatorCall,
  buildApproveCall,
  useValidatorInfo,
  useIsActiveValidator,
  useValidatorStats,
  useSageBalance,
} from "@/lib/contracts";

// Minimum stake requirement (1000 SAGE in wei)
const MIN_STAKE_AMOUNT = 1000n * 10n ** 18n;

// GPU tier definitions based on VRAM
export const GPU_TIERS = {
  0: { name: "Consumer", minVRAM: 4, description: "4-8GB VRAM (GTX 1070, RTX 2060)" },
  1: { name: "Prosumer", minVRAM: 8, description: "8-12GB VRAM (RTX 3070, RTX 3080)" },
  2: { name: "Professional", minVRAM: 12, description: "12-24GB VRAM (RTX 3090, RTX 4090)" },
  3: { name: "Datacenter", minVRAM: 24, description: "24-48GB VRAM (A100, H100)" },
  4: { name: "Enterprise", minVRAM: 48, description: "48GB+ VRAM (Multi-GPU, H100 NVL)" },
} as const;

export type GPUTier = keyof typeof GPU_TIERS;

export interface GPUInfo {
  detected: boolean;
  vendor: string;
  renderer: string;
  estimatedVRAM: number; // in GB
  tier: GPUTier;
  hasTEE: boolean;
  unmaskedVendor?: string;
  unmaskedRenderer?: string;
}

export interface ValidatorStatus {
  isRegistered: boolean;
  isActive: boolean;
  totalStake: bigint;
  selfStake: bigint;
  computeWeight: bigint;
  commissionBps: number;
  blocksProduced: number;
  proofsVerified: number;
  status: "Pending" | "Active" | "Jailed" | "Tombstoned" | "Exited" | "Unknown";
}

export interface NetworkStats {
  totalValidators: number;
  activeValidators: number;
  jailedValidators: number;
  totalStake: bigint;
  totalComputeWeight: bigint;
  currentEpoch: number;
}

export interface UseValidatorRegistrationResult {
  // GPU Info
  gpuInfo: GPUInfo | null;
  isDetectingGPU: boolean;
  detectGPU: () => Promise<void>;

  // Validator Status
  validatorStatus: ValidatorStatus | null;
  isLoadingStatus: boolean;

  // Network Stats
  networkStats: NetworkStats | null;

  // Balance
  sageBalance: bigint;
  hasEnoughBalance: boolean;

  // Registration
  isRegistering: boolean;
  registrationError: string | null;
  register: (options: {
    stakeAmount: bigint;
    commissionBps?: number;
    attestationHash?: string;
  }) => Promise<{ txHash: string }>;

  // Stake Management
  isStaking: boolean;
  addStake: (amount: bigint) => Promise<{ txHash: string }>;

  // Exit
  isExiting: boolean;
  exitValidator: () => Promise<{ txHash: string }>;

  // Transaction state
  txHash: string | null;
}

/**
 * Detect GPU capabilities using WebGL
 */
async function detectGPUCapabilities(): Promise<GPUInfo> {
  const defaultInfo: GPUInfo = {
    detected: false,
    vendor: "Unknown",
    renderer: "Unknown",
    estimatedVRAM: 0,
    tier: 0,
    hasTEE: false,
  };

  try {
    // Create a temporary canvas for WebGL detection
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

    if (!gl) {
      return defaultInfo;
    }

    // Get basic vendor/renderer info
    const vendor = gl.getParameter(gl.VENDOR);
    const renderer = gl.getParameter(gl.RENDERER);

    // Try to get unmasked vendor/renderer (more detailed)
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    let unmaskedVendor = vendor;
    let unmaskedRenderer = renderer;

    if (debugInfo) {
      unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }

    // Estimate VRAM based on renderer string
    const estimatedVRAM = estimateVRAM(unmaskedRenderer);
    const tier = determineTier(estimatedVRAM);

    // Check for TEE support (simplified - would need actual TEE detection)
    const hasTEE = checkTEESupport();

    return {
      detected: true,
      vendor,
      renderer,
      unmaskedVendor,
      unmaskedRenderer,
      estimatedVRAM,
      tier,
      hasTEE,
    };
  } catch (error) {
    console.error("GPU detection error:", error);
    return defaultInfo;
  }
}

/**
 * Estimate VRAM based on GPU model name
 */
function estimateVRAM(renderer: string): number {
  const rendererLower = renderer.toLowerCase();

  // NVIDIA high-end
  if (rendererLower.includes("h100")) return 80;
  if (rendererLower.includes("a100")) return 40;
  if (rendererLower.includes("4090")) return 24;
  if (rendererLower.includes("4080")) return 16;
  if (rendererLower.includes("4070 ti")) return 12;
  if (rendererLower.includes("4070")) return 12;
  if (rendererLower.includes("3090")) return 24;
  if (rendererLower.includes("3080 ti")) return 12;
  if (rendererLower.includes("3080")) return 10;
  if (rendererLower.includes("3070 ti")) return 8;
  if (rendererLower.includes("3070")) return 8;
  if (rendererLower.includes("3060 ti")) return 8;
  if (rendererLower.includes("3060")) return 12;

  // NVIDIA mid-range
  if (rendererLower.includes("2080 ti")) return 11;
  if (rendererLower.includes("2080 super")) return 8;
  if (rendererLower.includes("2080")) return 8;
  if (rendererLower.includes("2070")) return 8;
  if (rendererLower.includes("2060")) return 6;
  if (rendererLower.includes("1080 ti")) return 11;
  if (rendererLower.includes("1080")) return 8;
  if (rendererLower.includes("1070")) return 8;

  // AMD
  if (rendererLower.includes("rx 7900")) return 24;
  if (rendererLower.includes("rx 7800")) return 16;
  if (rendererLower.includes("rx 6900")) return 16;
  if (rendererLower.includes("rx 6800")) return 16;
  if (rendererLower.includes("rx 6700")) return 12;

  // Apple Silicon
  if (rendererLower.includes("apple m3 max")) return 40;
  if (rendererLower.includes("apple m3 pro")) return 18;
  if (rendererLower.includes("apple m2 max")) return 32;
  if (rendererLower.includes("apple m2 pro")) return 16;
  if (rendererLower.includes("apple m1 max")) return 32;
  if (rendererLower.includes("apple m1 pro")) return 16;
  if (rendererLower.includes("apple")) return 8;

  // Default for unknown
  return 4;
}

/**
 * Determine GPU tier based on VRAM
 */
function determineTier(vram: number): GPUTier {
  if (vram >= 48) return 4;
  if (vram >= 24) return 3;
  if (vram >= 12) return 2;
  if (vram >= 8) return 1;
  return 0;
}

/**
 * Check for TEE support (simplified)
 */
function checkTEESupport(): boolean {
  // In a real implementation, this would check for:
  // - Intel SGX support
  // - AMD SEV support
  // - ARM TrustZone
  // For now, we return false as browser can't detect this
  return false;
}

/**
 * Parse validator info from contract response
 */
function parseValidatorInfo(data: unknown): ValidatorStatus | null {
  if (!data || typeof data !== "object") return null;

  const info = data as Record<string, unknown>;

  // Parse status enum
  let status: ValidatorStatus["status"] = "Unknown";
  const statusValue = info.status as { variant?: Record<string, unknown> } | undefined;
  if (statusValue?.variant) {
    if ("Pending" in statusValue.variant) status = "Pending";
    else if ("Active" in statusValue.variant) status = "Active";
    else if ("Jailed" in statusValue.variant) status = "Jailed";
    else if ("Tombstoned" in statusValue.variant) status = "Tombstoned";
    else if ("Exited" in statusValue.variant) status = "Exited";
  }

  const totalStake = info.total_stake as { low?: bigint; high?: bigint } | undefined;
  const selfStake = info.self_stake as { low?: bigint; high?: bigint } | undefined;
  const computeWeight = info.compute_weight as { low?: bigint; high?: bigint } | undefined;

  return {
    isRegistered: true,
    isActive: status === "Active",
    totalStake: BigInt(totalStake?.low || 0) + (BigInt(totalStake?.high || 0) << 128n),
    selfStake: BigInt(selfStake?.low || 0) + (BigInt(selfStake?.high || 0) << 128n),
    computeWeight: BigInt(computeWeight?.low || 0) + (BigInt(computeWeight?.high || 0) << 128n),
    commissionBps: Number(info.commission_bps || 0),
    blocksProduced: Number(info.blocks_produced || 0),
    proofsVerified: Number(info.proofs_verified || 0),
    status,
  };
}

/**
 * Parse network stats from contract response
 */
function parseNetworkStats(data: unknown): NetworkStats | null {
  if (!data || typeof data !== "object") return null;

  const stats = data as Record<string, unknown>;
  const totalStake = stats.total_stake as { low?: bigint; high?: bigint } | undefined;
  const totalComputeWeight = stats.total_compute_weight as { low?: bigint; high?: bigint } | undefined;

  return {
    totalValidators: Number(stats.total_registered || 0),
    activeValidators: Number(stats.active_count || 0),
    jailedValidators: Number(stats.jailed_count || 0),
    totalStake: BigInt(totalStake?.low || 0) + (BigInt(totalStake?.high || 0) << 128n),
    totalComputeWeight: BigInt(totalComputeWeight?.low || 0) + (BigInt(totalComputeWeight?.high || 0) << 128n),
    currentEpoch: Number(stats.current_epoch || 0),
  };
}

export function useValidatorRegistration(): UseValidatorRegistrationResult {
  const { address } = useAccount();
  const { sendAsync } = useSendTransaction({});
  const addresses = getContractAddresses("sepolia");

  // State
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [isDetectingGPU, setIsDetectingGPU] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Contract reads
  const { data: validatorData, isLoading: isLoadingValidator } = useValidatorInfo(address);
  const { data: isActiveData } = useIsActiveValidator(address);
  const { data: statsData } = useValidatorStats();
  const { data: balanceData } = useSageBalance(address);

  // Parse validator status
  const validatorStatus = useMemo(() => {
    if (!validatorData) {
      return {
        isRegistered: false,
        isActive: false,
        totalStake: 0n,
        selfStake: 0n,
        computeWeight: 0n,
        commissionBps: 0,
        blocksProduced: 0,
        proofsVerified: 0,
        status: "Unknown" as const,
      };
    }
    return parseValidatorInfo(validatorData);
  }, [validatorData]);

  // Parse network stats
  const networkStats = useMemo(() => {
    return parseNetworkStats(statsData);
  }, [statsData]);

  // Parse balance
  const sageBalance = useMemo(() => {
    if (!balanceData) return 0n;
    const balance = balanceData as { low?: bigint; high?: bigint } | bigint;
    if (typeof balance === "bigint") return balance;
    return BigInt(balance.low || 0) + (BigInt(balance.high || 0) << 128n);
  }, [balanceData]);

  const hasEnoughBalance = sageBalance >= MIN_STAKE_AMOUNT;

  /**
   * Detect GPU capabilities
   */
  const detectGPU = useCallback(async () => {
    setIsDetectingGPU(true);
    try {
      const info = await detectGPUCapabilities();
      setGpuInfo(info);
    } catch (error) {
      console.error("GPU detection failed:", error);
    } finally {
      setIsDetectingGPU(false);
    }
  }, []);

  // Auto-detect GPU on mount
  useEffect(() => {
    if (!gpuInfo && typeof window !== "undefined") {
      detectGPU();
    }
  }, [gpuInfo, detectGPU]);

  /**
   * Register as validator
   */
  const register = useCallback(
    async (options: {
      stakeAmount: bigint;
      commissionBps?: number;
      attestationHash?: string;
    }): Promise<{ txHash: string }> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      if (options.stakeAmount < MIN_STAKE_AMOUNT) {
        throw new Error(`Minimum stake is ${MIN_STAKE_AMOUNT / 10n ** 18n} SAGE`);
      }

      if (sageBalance < options.stakeAmount) {
        throw new Error("Insufficient SAGE balance");
      }

      setIsRegistering(true);
      setRegistrationError(null);
      setTxHash(null);

      try {
        const calls = buildRegisterValidatorMulticall(
          address,
          options.stakeAmount,
          options.commissionBps || 500,
          options.attestationHash || "0",
          "sepolia"
        );

        const response = await sendAsync(calls);
        const hash = response.transaction_hash;

        setTxHash(hash);
        return { txHash: hash };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Registration failed";
        setRegistrationError(message);
        throw error;
      } finally {
        setIsRegistering(false);
      }
    },
    [address, sageBalance, sendAsync]
  );

  /**
   * Add more stake
   */
  const addStake = useCallback(
    async (amount: bigint): Promise<{ txHash: string }> => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      setIsStaking(true);
      setRegistrationError(null);
      setTxHash(null);

      try {
        const calls = [
          buildApproveCall(addresses.VALIDATOR_REGISTRY, amount, "sepolia"),
          buildAddValidatorStakeCall(amount, "sepolia"),
        ];

        const response = await sendAsync(calls);
        const hash = response.transaction_hash;

        setTxHash(hash);
        return { txHash: hash };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Staking failed";
        setRegistrationError(message);
        throw error;
      } finally {
        setIsStaking(false);
      }
    },
    [address, addresses.VALIDATOR_REGISTRY, sendAsync]
  );

  /**
   * Exit as validator
   */
  const exitValidator = useCallback(async (): Promise<{ txHash: string }> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }

    setIsExiting(true);
    setRegistrationError(null);
    setTxHash(null);

    try {
      const call = buildExitValidatorCall("sepolia");
      const response = await sendAsync([call]);
      const hash = response.transaction_hash;

      setTxHash(hash);
      return { txHash: hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exit failed";
      setRegistrationError(message);
      throw error;
    } finally {
      setIsExiting(false);
    }
  }, [address, sendAsync]);

  return {
    // GPU Info
    gpuInfo,
    isDetectingGPU,
    detectGPU,

    // Validator Status
    validatorStatus,
    isLoadingStatus: isLoadingValidator,

    // Network Stats
    networkStats,

    // Balance
    sageBalance,
    hasEnoughBalance,

    // Registration
    isRegistering,
    registrationError,
    register,

    // Stake Management
    isStaking,
    addStake,

    // Exit
    isExiting,
    exitValidator,

    // Transaction state
    txHash,
  };
}

