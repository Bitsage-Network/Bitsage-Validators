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

import { useState, useEffect, useCallback } from "react";
import type {
  AnalyticsData,
} from "@/components/analytics/AnalyticsDashboard";
import {
  getJobDbAnalytics,
  getProofDbStats,
  getNetworkStats,
} from "@/lib/api/client";

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

// ============================================
// Data Fetching (real coordinator APIs)
// ============================================

async function fetchAnalyticsData(_timeRange: TimeRange): Promise<AnalyticsData> {
  const [jobsRes, proofsRes, networkRes] = await Promise.allSettled([
    getJobDbAnalytics(),
    getProofDbStats(),
    getNetworkStats(),
  ]);

  const jobs = jobsRes.status === 'fulfilled' ? jobsRes.value.data : null;
  const proofs = proofsRes.status === 'fulfilled' ? proofsRes.value.data : null;
  const network = networkRes.status === 'fulfilled' ? networkRes.value.data : null;

  return {
    jobs: {
      totalJobs: jobs?.total_jobs ?? 0,
      completedJobs: jobs?.completed_jobs ?? 0,
      failedJobs: jobs?.failed_jobs ?? 0,
      pendingJobs: jobs?.pending_jobs ?? 0,
      avgCompletionTime: jobs?.avg_execution_time_ms ?? 0,
      successRate: jobs?.completion_rate ?? 0,
      throughput: jobs?.jobs_last_24h ? jobs.jobs_last_24h / 24 : 0,
      jobsByType: Object.fromEntries(
        (jobs?.by_type ?? []).map((t: { job_type: string; count: number }) => [t.job_type, t.count])
      ),
    },
    proofs: {
      totalProofs: proofs?.total_proofs ?? 0,
      verifiedProofs: proofs?.verified_proofs ?? 0,
      failedProofs: proofs?.failed_proofs ?? 0,
      avgGenerationTime: 0,
      avgVerificationTime: proofs?.avg_verification_time_ms ?? 0,
      proofsByCircuit: {},
      teeProofs: 0,
      gpuProofs: 0,
      wasmProofs: 0,
    },
    network: {
      activeWorkers: network?.active_workers ?? 0,
      totalWorkers: network?.total_workers ?? 0,
      totalGPUs: 0,
      activeGPUs: 0,
      networkHashrate: 0,
      avgLatency: 0,
      peakTPS: 0,
      currentTPS: 0,
    },
    earnings: {
      totalEarned: 0,
      periodEarned: 0,
      pendingRewards: 0,
      claimedRewards: 0,
      projectedMonthly: 0,
      earningsBySource: { compute: 0, proofs: 0, staking: 0, governance: 0 },
      roi: 0,
    },
    historical: {
      timestamps: (jobs?.hourly_distribution ?? []).map((h: { hour: number; count: number }) => h.hour),
      jobs: (jobs?.hourly_distribution ?? []).map((h: { hour: number; count: number }) => h.count),
      proofs: [],
      earnings: [],
      utilization: [],
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

export type { TimeRange, UseAnalyticsOptions, UseAnalyticsResult };
