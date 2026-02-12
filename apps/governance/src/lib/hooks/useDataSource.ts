/**
 * Data Source Detection Hook
 *
 * Provides unified data source information for UI components.
 * Detects demo mode, WebSocket connection status, and data freshness.
 */

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { useSafeWebSocketStatus } from "@/lib/providers/WebSocketProvider";
import type { DataSourceType } from "@/components/common/DataSourceIndicator";

interface DataSourceInfo {
  /** Current data source type */
  source: DataSourceType;
  /** Whether in demo mode (no wallet connected, viewing sample data) */
  isDemoMode: boolean;
  /** Whether WebSocket is connected for live updates */
  isLive: boolean;
  /** Whether data might be stale/cached */
  isCached: boolean;
  /** Human-readable description */
  description: string;
}

/**
 * Hook to detect the current data source for UI display
 */
export function useDataSource(options?: {
  /** Override source when API returns isMock flag */
  isMock?: boolean;
  /** Override source when there's an error */
  hasError?: boolean;
  /** Whether data was fetched recently */
  isLoading?: boolean;
}): DataSourceInfo {
  const { address } = useAccount();
  const { isConnected: wsConnected } = useSafeWebSocketStatus();
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Check for demo mode on mount
  useEffect(() => {
    setIsDemoMode(localStorage.getItem("bitsage_demo_mode") === "true");
  }, []);

  return useMemo(() => {
    // Demo mode takes precedence
    if (isDemoMode || !address) {
      return {
        source: "demo" as DataSourceType,
        isDemoMode: true,
        isLive: false,
        isCached: false,
        description: "Demo mode - connect wallet for real data",
      };
    }

    // API returned mock data flag
    if (options?.isMock) {
      return {
        source: "mock" as DataSourceType,
        isDemoMode: false,
        isLive: false,
        isCached: false,
        description: "Sample data - API returned mock data",
      };
    }

    // API error - using fallback
    if (options?.hasError) {
      return {
        source: "fallback" as DataSourceType,
        isDemoMode: false,
        isLive: false,
        isCached: true,
        description: "Using fallback data - API unavailable",
      };
    }

    // WebSocket connected - live data
    if (wsConnected) {
      return {
        source: "live" as DataSourceType,
        isDemoMode: false,
        isLive: true,
        isCached: false,
        description: "Live data from network",
      };
    }

    // Fallback to cached
    return {
      source: "cached" as DataSourceType,
      isDemoMode: false,
      isLive: false,
      isCached: true,
      description: "Cached data - WebSocket disconnected",
    };
  }, [address, isDemoMode, wsConnected, options?.isMock, options?.hasError]);
}

/**
 * Simple hook to check if in demo mode
 */
export function useDemoMode(): boolean {
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    setIsDemoMode(localStorage.getItem("bitsage_demo_mode") === "true");

    // Listen for storage changes (in case demo mode is toggled in another tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "bitsage_demo_mode") {
        setIsDemoMode(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return isDemoMode;
}

/**
 * Hook to exit demo mode
 */
export function useExitDemoMode(): () => void {
  return () => {
    localStorage.removeItem("bitsage_demo_mode");
    window.location.href = "/connect";
  };
}
