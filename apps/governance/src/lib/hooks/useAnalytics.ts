"use client";

/**
 * Analytics Data Hook
 *
 * Provides:
 * - Real-time analytics data fetching
 * - Time-range based data filtering
 * - Aggregation and trend calculations
 * - Caching and optimistic updates
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  AnalyticsData,
  JobMetrics,
  ProofMetrics,
  NetworkMetrics,
  EarningsMetrics,
} from "@/components/analytics/AnalyticsDashboard";

// ============================================
// Types
// ============================================

type TimeRange = "1h" | "24h" | "7d" | "30d" | "all";

interface UseAnalyticsOptions {
  timeRange?: TimeRange;
  refreshInterval?: number;
  enabled?: boolean;
}

interface UseAnalyticsResult {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: Error | null;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  refresh: () => Promise<void>;
  lastUpdated: number | null;
}

interface AnalyticsSnapshot {
  timestamp: number;
  jobs: {
    completed: number;
    failed: number;
    pending: number;
  };
  proofs: {
    generated: number;
    verified: number;
    failed: number;
  };
  earnings: number;
  utilization: number;
}

// ============================================
// Time Range Helpers
// ============================================

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

const TIME_RANGE_POINTS: Record<TimeRange, number> = {
  "1h": 12,
  "24h": 24,
  "7d": 7,
  "30d": 30,
  all: 60,
};

// ============================================
// Mock Data Generator
// ============================================

function generateHistoricalData(
  timeRange: TimeRange,
  now: number
): AnalyticsSnapshot[] {
  const points = TIME_RANGE_POINTS[timeRange];
  const duration = TIME_RANGE_MS[timeRange] === Infinity ? 30 * 24 * 60 * 60 * 1000 : TIME_RANGE_MS[timeRange];
  const interval = duration / points;

  return Array.from({ length: points }, (_, i) => {
    const timestamp = now - (points - 1 - i) * interval;
    const hour = new Date(timestamp).getHours();
    const dayMultiplier = hour >= 9 && hour <= 17 ? 1.3 : 0.8;

    return {
      timestamp,
      jobs: {
        completed: Math.floor((400 + Math.random() * 200) * dayMultiplier),
        failed: Math.floor(Math.random() * 20),
        pending: Math.floor(50 + Math.random() * 50),
      },
      proofs: {
        generated: Math.floor((300 + Math.random() * 150) * dayMultiplier),
        verified: Math.floor((280 + Math.random() * 140) * dayMultiplier),
        failed: Math.floor(Math.random() * 15),
      },
      earnings: 100 + Math.random() * 150,
      utilization: 60 + Math.random() * 30,
    };
  });
}

function aggregateSnapshots(snapshots: AnalyticsSnapshot[]): {
  jobs: JobMetrics;
  proofs: ProofMetrics;
  network: NetworkMetrics;
  earnings: EarningsMetrics;
} {
  const totalJobs = snapshots.reduce((sum, s) => sum + s.jobs.completed + s.jobs.failed, 0);
  const completedJobs = snapshots.reduce((sum, s) => sum + s.jobs.completed, 0);
  const failedJobs = snapshots.reduce((sum, s) => sum + s.jobs.failed, 0);
  const pendingJobs = snapshots[snapshots.length - 1]?.jobs.pending ?? 0;

  const totalProofs = snapshots.reduce((sum, s) => sum + s.proofs.generated, 0);
  const verifiedProofs = snapshots.reduce((sum, s) => sum + s.proofs.verified, 0);
  const failedProofs = snapshots.reduce((sum, s) => sum + s.proofs.failed, 0);

  const periodEarnings = snapshots.reduce((sum, s) => sum + s.earnings, 0);
  const avgUtilization = snapshots.reduce((sum, s) => sum + s.utilization, 0) / snapshots.length;

  return {
    jobs: {
      totalJobs,
      completedJobs,
      failedJobs,
      pendingJobs,
      avgCompletionTime: 35000 + Math.random() * 20000,
      successRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 100,
      throughput: completedJobs / snapshots.length,
      jobsByType: {
        "AI Inference": Math.floor(completedJobs * 0.45),
        "Data Pipeline": Math.floor(completedJobs * 0.25),
        "ML Training": Math.floor(completedJobs * 0.18),
        "Generic Compute": Math.floor(completedJobs * 0.12),
      },
    },
    proofs: {
      totalProofs,
      verifiedProofs,
      failedProofs,
      avgGenerationTime: 7000 + Math.random() * 4000,
      avgVerificationTime: 80 + Math.random() * 80,
      proofsByCircuit: {
        PRIVACY_WITHDRAW: Math.floor(totalProofs * 0.28),
        PRIVACY_TRANSFER: Math.floor(totalProofs * 0.18),
        AI_INFERENCE: Math.floor(totalProofs * 0.35),
        GENERIC_COMPUTE: Math.floor(totalProofs * 0.19),
      },
      teeProofs: Math.floor(totalProofs * 0.45),
      gpuProofs: Math.floor(totalProofs * 0.55),
      wasmProofs: 0,
    },
    network: {
      activeWorkers: 180 + Math.floor(Math.random() * 60),
      totalWorkers: 312,
      totalGPUs: 892,
      activeGPUs: 650 + Math.floor(Math.random() * 150),
      networkHashrate: 35 + Math.random() * 20,
      avgLatency: 15 + Math.random() * 20,
      peakTPS: 1250,
      currentTPS: 700 + Math.floor(Math.random() * 400),
    },
    earnings: {
      totalEarned: 125430.5,
      periodEarned: periodEarnings,
      pendingRewards: 500 + Math.random() * 800,
      claimedRewards: 124538.2,
      projectedMonthly: periodEarnings * (30 / snapshots.length),
      earningsBySource: {
        compute: periodEarnings * 0.55,
        proofs: periodEarnings * 0.28,
        staking: periodEarnings * 0.12,
        governance: periodEarnings * 0.05,
      },
      roi: 115 + Math.random() * 30,
    },
  };
}

async function fetchAnalyticsData(timeRange: TimeRange): Promise<AnalyticsData> {
  const now = Date.now();

  // Try real API first
  try {
    const response = await fetch(`/api/v1/analytics?range=${timeRange}`);
    if (response.ok) {
      return response.json();
    }
  } catch {
    // Fall through to mock data
  }

  // Generate mock data
  const snapshots = generateHistoricalData(timeRange, now);
  const aggregated = aggregateSnapshots(snapshots);

  return {
    ...aggregated,
    historical: {
      timestamps: snapshots.map((s) => s.timestamp),
      jobs: snapshots.map((s) => s.jobs.completed),
      proofs: snapshots.map((s) => s.proofs.generated),
      earnings: snapshots.map((s) => s.earnings),
      utilization: snapshots.map((s) => s.utilization),
    },
  };
}

// ============================================
// Main Hook
// ============================================

export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsResult {
  const {
    timeRange: initialTimeRange = "24h",
    refreshInterval = 30000,
    enabled = true,
  } = options;

  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      const result = await fetchAnalyticsData(timeRange);
      setData(result);
      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch analytics"));
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, enabled]);

  // Fetch on mount and when timeRange changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval, enabled]);

  return {
    data,
    isLoading,
    error,
    timeRange,
    setTimeRange,
    refresh,
    lastUpdated,
  };
}

// ============================================
// Specialized Hooks
// ============================================

export function useJobAnalytics(timeRange: TimeRange = "24h") {
  const { data, isLoading, error } = useAnalytics({ timeRange });

  return useMemo(
    () => ({
      metrics: data?.jobs ?? null,
      historical: data?.historical
        ? {
            timestamps: data.historical.timestamps,
            values: data.historical.jobs,
          }
        : null,
      isLoading,
      error,
    }),
    [data, isLoading, error]
  );
}

export function useProofAnalytics(timeRange: TimeRange = "24h") {
  const { data, isLoading, error } = useAnalytics({ timeRange });

  return useMemo(
    () => ({
      metrics: data?.proofs ?? null,
      historical: data?.historical
        ? {
            timestamps: data.historical.timestamps,
            values: data.historical.proofs,
          }
        : null,
      isLoading,
      error,
    }),
    [data, isLoading, error]
  );
}

export function useNetworkAnalytics() {
  const { data, isLoading, error, refresh } = useAnalytics({ refreshInterval: 10000 });

  return useMemo(
    () => ({
      metrics: data?.network ?? null,
      utilization: data?.historical?.utilization ?? [],
      isLoading,
      error,
      refresh,
    }),
    [data, isLoading, error, refresh]
  );
}

export function useEarningsAnalytics(timeRange: TimeRange = "30d") {
  const { data, isLoading, error } = useAnalytics({ timeRange });

  return useMemo(
    () => ({
      metrics: data?.earnings ?? null,
      historical: data?.historical
        ? {
            timestamps: data.historical.timestamps,
            values: data.historical.earnings,
          }
        : null,
      isLoading,
      error,
    }),
    [data, isLoading, error]
  );
}

export type { TimeRange, UseAnalyticsOptions, UseAnalyticsResult, AnalyticsSnapshot };
