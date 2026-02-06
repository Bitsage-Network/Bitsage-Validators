/**
 * Data Source Detection Hook
 *
 * Provides unified data source information for UI components.
 * Detects WebSocket connection status and data freshness.
 */

import { useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { useSafeWebSocketStatus } from "@/lib/providers/WebSocketProvider";
import type { DataSourceType } from "@/components/common/DataSourceIndicator";

interface DataSourceInfo {
  /** Current data source type */
  source: DataSourceType;
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

  return useMemo(() => {
    // No wallet connected
    if (!address) {
      return {
        source: "fallback" as DataSourceType,
        isLive: false,
        isCached: false,
        description: "Connect wallet for real data",
      };
    }

    // API returned mock data flag
    if (options?.isMock) {
      return {
        source: "mock" as DataSourceType,
        isLive: false,
        isCached: false,
        description: "Sample data - API returned mock data",
      };
    }

    // API error - using fallback
    if (options?.hasError) {
      return {
        source: "fallback" as DataSourceType,
        isLive: false,
        isCached: true,
        description: "Using fallback data - API unavailable",
      };
    }

    // WebSocket connected - live data
    if (wsConnected) {
      return {
        source: "live" as DataSourceType,
        isLive: true,
        isCached: false,
        description: "Live data from network",
      };
    }

    // Fallback to cached
    return {
      source: "cached" as DataSourceType,
      isLive: false,
      isCached: true,
      description: "Cached data - WebSocket disconnected",
    };
  }, [address, wsConnected, options?.isMock, options?.hasError]);
}
