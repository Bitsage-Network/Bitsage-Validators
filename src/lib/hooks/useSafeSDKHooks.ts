"use client";

/**
 * Safe SDK Hook Wrappers
 *
 * These hooks return safe defaults when the SDK providers aren't mounted
 * (e.g., wallet disconnected, demo mode).
 */

import { useAccount } from "@starknet-react/core";

interface SafeHookResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Safe validator status hook — returns null when wallet not connected
 */
export function useSafeValidatorStatus(): SafeHookResult<any> {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return { data: null, isLoading: false, error: null };
  }

  // When connected, SDK providers handle the actual data
  return { data: null, isLoading: false, error: null };
}

/**
 * Safe network stats stream hook
 */
export function useSafeNetworkStatsStream(): { stats: any; isSubscribed: boolean } {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return { stats: null, isSubscribed: false };
  }

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
