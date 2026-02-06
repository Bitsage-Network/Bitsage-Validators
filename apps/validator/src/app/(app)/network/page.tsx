"use client";

import { useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import {
  Globe,
  Server,
  Cpu,
  Activity,
  TrendingUp,
  Users,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  useNetworkStats,
  useNetworkStatsStream,
  useLeaderboard,
  useNetworkWorkers,
  useWebSocketConnection,
} from "@/lib/providers/BitSageSDKProvider";
import { useNetworkPageData } from "@/lib/hooks/useApiData";
import { DataSourceIndicator, DataSourceBanner, type DataSourceType } from "@/components/common/DataSourceIndicator";
import type { NetworkStatsBase, WorkerData, LeaderboardWorker, TopValidator } from "@/types/network";

// GPU type colors for distribution chart
const gpuColors: Record<string, string> = {
  "H100": "bg-emerald-500",
  "A100": "bg-purple-500",
  "RTX 4090": "bg-emerald-500",
  "RTX 3090": "bg-orange-500",
  "RTX 3080": "bg-cyan-500",
  "Other": "bg-gray-500",
};

export default function NetworkPage() {
  const { address } = useAccount();
  const [dismissedBanner, setDismissedBanner] = useState(false);

  // WebSocket connection status
  const { isConnected: wsConnected } = useWebSocketConnection();

  // Fetch network stats from SDK
  const {
    data: networkStats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useNetworkStats();

  // Subscribe to real-time network stats updates
  const { stats: streamedStats } = useNetworkStatsStream();

  // Fetch top validators/workers
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
  } = useLeaderboard();

  // Fetch all network workers for GPU distribution
  const { data: workersData } = useNetworkWorkers();

  // Database-backed historical data
  const {
    chartData: networkChartData,
    growthMetrics,
    refetch: refetchHistoricalData,
  } = useNetworkPageData();

  // Determine data source status
  const dataSource: DataSourceType = useMemo(() => {
    if (!address) return "fallback";
    if (statsError) return "fallback";
    if (wsConnected && streamedStats) return "live";
    if (networkStats) return "cached";
    return "fallback";
  }, [address, statsError, wsConnected, streamedStats, networkStats]);

  const isUsingMockData = !networkStats && !streamedStats;

  // Use streamed stats if available, otherwise use fetched stats
  const stats = useMemo(() => {
    // Handle both direct stats and SDK event format (which may have data nested)
    const rawStats = streamedStats || networkStats;
    if (!rawStats) return null;

    // Unwrap if SDK event format with nested data
    const raw = rawStats as unknown as Record<string, unknown>;
    const baseStats: NetworkStatsBase = (raw.data as NetworkStatsBase) ?? (raw as unknown as NetworkStatsBase);

    return {
      totalValidators: baseStats.total_workers ?? baseStats.totalWorkers ?? baseStats.totalValidators ?? 0,
      activeValidators: baseStats.active_workers ?? baseStats.activeWorkers ?? baseStats.activeValidators ?? 0,
      totalGPUs: baseStats.total_gpus ?? baseStats.totalGPUs ?? 0,
      totalStaked: Number(baseStats.total_staked ?? baseStats.totalStaked ?? 0).toLocaleString(),
      jobsProcessed24h: Number(baseStats.jobs_completed_24h ?? baseStats.jobsLast24h ?? baseStats.jobsProcessed24h ?? 0),
      avgResponseTime: (baseStats.avg_response_time ?? baseStats.avgResponseTime)
        ? `${Number(baseStats.avg_response_time ?? baseStats.avgResponseTime).toFixed(1)}s`
        : "—",
      networkUptime: baseStats.uptime ? `${(Number(baseStats.uptime) * 100).toFixed(2)}%` : "\u2014",
      currentEpoch: baseStats.currentEpoch ?? baseStats.epoch ?? 0,
      jobSuccessRate: (baseStats.success_rate ?? baseStats.successRate)
        ? `${(Number(baseStats.success_rate ?? baseStats.successRate) * 100).toFixed(1)}%`
        : "\u2014",
      teeAttestationRate: (baseStats.tee_attestation_rate ?? baseStats.teeAttestationRate)
        ? `${(Number(baseStats.tee_attestation_rate ?? baseStats.teeAttestationRate) * 100).toFixed(1)}%`
        : "\u2014",
    };
  }, [networkStats, streamedStats]);

  // Calculate GPU distribution from workers data
  const gpuDistribution = useMemo(() => {
    const rawWorkers = workersData as WorkerData[] | { workers?: WorkerData[] } | undefined;
    const workers: WorkerData[] | undefined = Array.isArray(rawWorkers)
      ? rawWorkers
      : (rawWorkers as { workers?: WorkerData[] })?.workers;
    if (!workers || !Array.isArray(workers)) return [];

    const gpuCounts: Record<string, number> = {};
    let total = 0;

    workers.forEach((worker: WorkerData) => {
      const gpuType = worker.gpuModel || worker.gpu || worker.gpu_model || worker.gpu_type || "Other";
      const gpuCount = worker.gpuCount || worker.gpu_count || 1;
      gpuCounts[gpuType] = (gpuCounts[gpuType] || 0) + gpuCount;
      total += gpuCount;
    });

    return Object.entries(gpuCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        color: gpuColors[type] || gpuColors["Other"],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [workersData]);

  // Get recent epochs from network stats - no fake data fallback
  const recentEpochs = useMemo(() => {
    const epochs = (networkStats as { recentEpochs?: Array<{ number: number; validatorCount: number; jobCount: number }> })?.recentEpochs;
    if (!epochs || !Array.isArray(epochs) || epochs.length === 0) {
      return [];
    }
    return epochs.slice(0, 4).map((epoch, i: number) => ({
      epoch: epoch.number,
      validators: epoch.validatorCount,
      jobs: epoch.jobCount,
      time: `${(i + 1) * 12}s ago`,
    }));
  }, [networkStats]);

  // Format leaderboard data
  const topValidators = useMemo(() => {
    const rawLeaderboard = leaderboardData as LeaderboardWorker[] | { workers?: LeaderboardWorker[] } | undefined;
    const workers: LeaderboardWorker[] | undefined = Array.isArray(rawLeaderboard)
      ? rawLeaderboard
      : (rawLeaderboard as { workers?: LeaderboardWorker[] })?.workers;
    if (!workers || !Array.isArray(workers)) return [];
    return workers.slice(0, 5).map((worker: LeaderboardWorker, idx: number): TopValidator => {
      const addr = worker.address || worker.worker_address || worker.id || "";
      const gpuCount = worker.gpuCount || worker.gpu_count || 0;
      const staked = worker.stakedAmount ?? worker.staked_amount ?? 0;
      const reputation = worker.reputationScore ?? worker.reputation_score ?? 0;
      return {
        rank: idx + 1,
        address: addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—",
        fullAddress: addr,
        gpus: gpuCount,
        staked: Number(staked).toLocaleString(),
        uptime: worker.uptime ? `${(worker.uptime * 100).toFixed(1)}%` : "—",
        reputation: Number(reputation),
      };
    });
  }, [leaderboardData]);

  // Loading state
  if (statsLoading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading network stats...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (statsError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-gray-400">Failed to load network stats</p>
          <button
            onClick={() => refetchStats()}
            className="mt-4 btn-secondary flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Demo/Fallback Banner */}
      {!dismissedBanner && dataSource !== "live" && (
        <DataSourceBanner
          source={dataSource}
          message={
            dataSource === "fallback"
              ? "Unable to connect to network API. Showing cached data."
              : undefined
          }
          onDismiss={() => setDismissedBanner(true)}
          onAction={() => refetchStats()}
          actionLabel="Retry"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Network Overview</h1>
            <DataSourceIndicator source={dataSource} size="md" />
          </div>
          <p className="text-gray-400 mt-1">
            {dataSource === "live"
              ? "Real-time status of the BitSage validator network"
              : "Network status (cached data)"}
          </p>
        </div>
        <button
          onClick={() => refetchStats()}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", statsLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Network Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/20">
            <Globe className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Network Status</h2>
              <span className="badge badge-success">Healthy</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              All systems operational • Epoch {stats?.currentEpoch || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Uptime</p>
            <p className="text-2xl font-bold text-emerald-400">
              {stats?.networkUptime || "—"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-gray-400">Validators</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {stats?.activeValidators || 0}
            <span className="text-sm text-gray-500 font-normal">/{stats?.totalValidators || 0}</span>
          </p>
          <p className="text-sm text-emerald-400 mt-1">Active now</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-gray-400">Total GPUs</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {(stats?.totalGPUs || 0).toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">Connected to network</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-gray-400">Total Staked</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats?.totalStaked || "0"}</p>
          <p className="text-sm text-gray-500 mt-1">SAGE tokens</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-gray-400">Jobs (24h)</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {(stats?.jobsProcessed24h || 0).toLocaleString()}
          </p>
          <p className="text-sm text-emerald-400 mt-1">Processed successfully</p>
        </motion.div>
      </div>

      {/* Historical Network Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Network Activity (7 Days)
          </h3>
          {growthMetrics && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <TrendingUp className={cn(
                  "w-4 h-4",
                  growthMetrics.workers_growth_7d >= 0 ? "text-emerald-400" : "text-red-400"
                )} />
                <span className={growthMetrics.workers_growth_7d >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {growthMetrics.workers_growth_7d >= 0 ? "+" : ""}{growthMetrics.workers_growth_7d.toFixed(1)}% workers
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className={cn(
                  "w-4 h-4",
                  growthMetrics.jobs_growth_7d >= 0 ? "text-emerald-400" : "text-red-400"
                )} />
                <span className={growthMetrics.jobs_growth_7d >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {growthMetrics.jobs_growth_7d >= 0 ? "+" : ""}{growthMetrics.jobs_growth_7d.toFixed(1)}% jobs
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Simple Chart Visualization */}
        <div className="h-48 flex items-end gap-1">
          {networkChartData.length > 0 ? (
            networkChartData.map((point, idx) => {
              const maxJobs = Math.max(...networkChartData.map(p => p.jobs));
              const height = maxJobs > 0 ? (point.jobs / maxJobs) * 100 : 0;
              const date = new Date(point.timestamp * 1000);
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                >
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(height, 2)}%` }}
                    transition={{ delay: 0.5 + idx * 0.02, duration: 0.5 }}
                    className={cn(
                      "w-full rounded-t-sm transition-colors",
                      isToday ? "bg-emerald-500" : "bg-emerald-500/50",
                      "group-hover:bg-emerald-400"
                    )}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                    <div className="glass-card p-2 text-xs whitespace-nowrap">
                      <p className="text-white font-medium">{point.jobs.toLocaleString()} jobs</p>
                      <p className="text-gray-400">{point.workers} workers</p>
                      <p className="text-gray-500">{date.toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            // Placeholder bars when no data - deterministic heights
            Array.from({ length: 28 }).map((_, idx) => {
              // Generate deterministic heights using a simple pattern
              const deterministicHeights = [45, 62, 38, 71, 55, 48, 65, 42, 58, 74, 51, 67, 44, 60, 53, 69, 47, 63, 56, 72, 49, 64, 41, 68, 52, 66, 43, 70];
              return (
                <div key={idx} className="flex-1">
                  <div
                    className="bg-surface-elevated rounded-t-sm animate-pulse"
                    style={{ height: `${deterministicHeights[idx]}%` }}
                  />
                </div>
              );
            })
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>7 days ago</span>
          <span>Today</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GPU Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            GPU Distribution
          </h3>
          <div className="space-y-4">
            {gpuDistribution.length === 0 ? (
              <p className="text-gray-500 text-sm">No GPU data available</p>
            ) : (
              gpuDistribution.map((gpu, idx) => (
                <div key={gpu.type}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-white">{gpu.type}</span>
                    <span className="text-gray-400">
                      {gpu.count} ({gpu.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${gpu.percentage}%` }}
                      transition={{ delay: 0.5 + idx * 0.1, duration: 0.5 }}
                      className={cn("h-full rounded-full", gpu.color)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Recent Epochs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            Recent Epochs
          </h3>
          {recentEpochs.length > 0 ? (
            <div className="space-y-3">
              {recentEpochs.map((block) => (
                <div
                  key={block.epoch}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface-elevated"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium">Epoch {block.epoch}</p>
                      <p className="text-xs text-gray-500">{block.time}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">{block.jobs} jobs</p>
                    <p className="text-xs text-gray-500">{block.validators} validators</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">No epoch data available</p>
              <p className="text-gray-500 text-xs mt-1">Epoch data will appear as the network processes jobs</p>
            </div>
          )}
        </motion.div>

        {/* Network Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Performance
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface-elevated">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Avg Response Time</span>
                <span className="text-emerald-400 font-medium">
                  {stats?.avgResponseTime || "—"}
                </span>
              </div>
              <div className="h-2 bg-surface-dark rounded-full overflow-hidden">
                <div className="h-full w-[15%] bg-emerald-500 rounded-full" />
              </div>
              <p className="text-xs text-gray-500 mt-1">Target: &lt;5s</p>
            </div>

            <div className="p-4 rounded-xl bg-surface-elevated">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Job Success Rate</span>
                <span className="text-emerald-400 font-medium">
                  {stats?.jobSuccessRate || "—"}
                </span>
              </div>
              <div className="h-2 bg-surface-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: stats?.jobSuccessRate?.replace("%", "") || "0",
                  }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-elevated">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">TEE Attestation</span>
                <span className="text-emerald-400 font-medium">
                  {stats?.teeAttestationRate || "—"}
                </span>
              </div>
              <div className="h-2 bg-surface-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{
                    width: stats?.teeAttestationRate?.replace("%", "") || "0",
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Of validators with TEE</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Top Validators */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="glass-card"
      >
        <div className="p-6 border-b border-surface-border">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Top Validators
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-4 text-sm font-medium text-gray-400">Rank</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Validator</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">GPUs</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Staked</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Uptime</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Reputation</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : topValidators.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    No validators found
                  </td>
                </tr>
              ) : (
                topValidators.map((validator: TopValidator, idx: number) => (
                  <tr
                    key={validator.fullAddress || idx}
                    className="border-b border-surface-border/50 hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="p-4">
                      <span
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          idx === 0
                            ? "bg-yellow-500/20 text-yellow-400"
                            : idx === 1
                              ? "bg-gray-400/20 text-gray-300"
                              : idx === 2
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-surface-elevated text-gray-400"
                        )}
                      >
                        {validator.rank}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-mono">{validator.address}</span>
                    </td>
                    <td className="p-4 text-white">{validator.gpus}</td>
                    <td className="p-4 text-white">{validator.staked} SAGE</td>
                    <td className="p-4 text-emerald-400">{validator.uptime}</td>
                    <td className="p-4">
                      <span className="badge badge-success">{validator.reputation}%</span>
                    </td>
                    <td className="p-4">
                      {validator.fullAddress && (
                        <a
                          href={`https://sepolia.starkscan.co/contract/${validator.fullAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
