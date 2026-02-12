"use client";

/**
 * Safe SDK Hook Wrappers
 *
 * These hooks wrap the SDK hooks and return safe defaults when
 * the SDK providers aren't mounted (e.g., when wallet is disconnected).
 */

import { useState, useEffect } from "react";
import { useAccount } from "@starknet-react/core";

// Default empty values for when SDK isn't available
const DEFAULT_VALIDATOR_STATUS = null;
const DEFAULT_GPU_METRICS = null;
const DEFAULT_RECENT_JOBS = null;
const DEFAULT_REWARDS_INFO = null;
const DEFAULT_STAKE_INFO = null;
const DEFAULT_NETWORK_STATS = null;

interface SafeHookResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Safe validator status hook
 */
export function useSafeValidatorStatus(): SafeHookResult<any> {
  const { isConnected } = useAccount();
  const [result, setResult] = useState<SafeHookResult<any>>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!isConnected) {
      setResult({ data: null, isLoading: false, error: null });
      return;
    }

    // Try to import and use the SDK hook dynamically
    const loadData = async () => {
      try {
        setResult(prev => ({ ...prev, isLoading: true }));
        const { useValidatorStatus } = await import("@/lib/providers/BitSageSDKProvider");
        // Note: This won't work directly as hooks can't be called conditionally
        // This is a placeholder - the real fix needs a different approach
        setResult({ data: null, isLoading: false, error: null });
      } catch (err) {
        setResult({ data: null, isLoading: false, error: err as Error });
      }
    };

    loadData();
  }, [isConnected]);

  return result;
}

/**
 * Safe network stats stream hook
 */
export function useSafeNetworkStatsStream(): { stats: any; isSubscribed: boolean } {
  const { isConnected } = useAccount();

  // When not connected, return safe defaults
  if (!isConnected) {
    return { stats: null, isSubscribed: false };
  }

  // When connected, the actual hook will be used by the SDK
  // This is just a fallback
  return { stats: null, isSubscribed: false };
}

/**
 * Helper to check if SDK providers are available
 */
export function useSDKAvailable(): boolean {
  const { isConnected } = useAccount();
  const wsUrl = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL
    : undefined;

  return !!(isConnected && wsUrl);
}
