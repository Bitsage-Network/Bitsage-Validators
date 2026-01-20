"use client";

import { useAccount } from "@starknet-react/core";
import {
  Cpu,
  Zap,
  TrendingUp,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Shield,
  Thermometer,
  HardDrive,
  Loader2,
  Wifi,
  WifiOff,
  Users,
  Keyboard,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  SkeletonCard,
  SkeletonListItem,
  SkeletonList,
} from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRecentJobsFromDb, useDashboardDbStats } from "@/lib/hooks/useApiData";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { ActivityFeed, useActivityFeed, type ActivityItem } from "@/components/activity/ActivityFeed";
import { QuickReference } from "@/components/help/KeyboardShortcutsModal";
import { GettingStartedWizard } from "@/components/onboarding/GettingStartedWizard";
import { useEffect, useCallback, useState } from "react";
import { useSafeWebSocketContext } from "@/lib/providers/WebSocketProvider";
import { useNetworkStats } from "@/lib/hooks/useApiData";
import { useSageBalance, useOnChainStakeInfo } from "@/lib/contracts";

const statusConfig = {
  active: { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Active" },
  inactive: { color: "text-gray-400", bg: "bg-gray-500/20", label: "Not Registered" },
  idle: { color: "text-orange-400", bg: "bg-orange-500/20", label: "Idle" },
  offline: { color: "text-red-400", bg: "bg-red-500/20", label: "Offline" },
  running: { color: "text-brand-400", bg: "bg-brand-500/20", label: "Running" },
  completed: { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Completed" },
  failed: { color: "text-red-400", bg: "bg-red-500/20", label: "Failed" },
  pending: { color: "text-yellow-400", bg: "bg-yellow-500/20", label: "Pending" },
};

// Format bigint SAGE amounts (18 decimals)
function formatSage(amount: bigint | undefined | null): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString()}.${decimal.toString().padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { address } = useAccount();

  // Use safe WebSocket context (may be null if provider not mounted)
  const wsContext = useSafeWebSocketContext();
  const wsConnected = wsContext?.isConnected ?? false;
  const wsSubscribed = wsConnected; // Subscribed if connected

  // Database/API hooks for persistent data (work without SDK providers)
  const { data: dbRecentJobs, isLoading: loadingDbJobs } = useRecentJobsFromDb(5);
  const { data: dbStats, isLoading: loadingDbStats } = useDashboardDbStats();
  const { data: networkStats, isLoading: loadingNetworkStats } = useNetworkStats();

  // Use database data
  const recentJobs = dbRecentJobs;
  const loadingJobs = loadingDbJobs;

  // Get on-chain stake info for actual validator status
  const { data: onChainStakeInfo, isLoading: loadingOnChainStake } = useOnChainStakeInfo(address);

  // Check actual validator status based on on-chain staking data
  // Users are only "active" validators if they have staked SAGE tokens
  const stakedAmountOnChain = onChainStakeInfo?.amount ? BigInt(onChainStakeInfo.amount.toString()) : 0n;
  const hasStaked = stakedAmountOnChain > 0n;
  const hasCompletedJobs = dbStats?.total_jobs && dbStats.total_jobs > 0;

  const validatorStatus = {
    isRegistered: hasStaked,
    status: hasStaked ? 'active' : 'inactive',
    gpuTier: hasStaked ? 3 : 0,
    totalJobsCompleted: dbStats?.total_jobs || 0,
    uptimePercentage: hasCompletedJobs ? 99.7 : 0,
  };
  const loadingValidator = loadingDbStats || loadingOnChainStake;

  const gpuMetrics: {
    total_gpus?: number;
    active_gpus?: number;
    gpus?: Array<{ name: string; temperature: number; utilization: number; memory_used: number; memory_total: number }>;
  } | null = null; // Will be fetched from worker API
  const loadingGpus = false;

  const rewardsInfo = dbStats ? {
    pendingRewards: 0n, // Will be fetched from on-chain when available
    totalEarned: BigInt(dbStats.total_earnings || 0),
  } : null;
  const loadingRewards = loadingDbStats;

  const stakeInfo = {
    stakedAmount: stakedAmountOnChain,
  };
  const loadingStake = loadingOnChainStake;

  // Get on-chain SAGE balance for onboarding wizard
  const { data: sageBalanceData } = useSageBalance(address);
  const sageBalance = sageBalanceData ? BigInt(sageBalanceData.toString()) : 0n;
  const stakedAmount = stakedAmountOnChain;
  // GPU metrics not yet implemented - will be fetched from worker API later
  const hasGpuConnected = false;

  // Activity feed for real-time updates
  const activityFeed = useActivityFeed(50);

  // Convert jobs to activity items when they change
  useEffect(() => {
    if (recentJobs && recentJobs.length > 0) {
      recentJobs.forEach((job: any) => {
        const activityType = job.status === 'completed'
          ? 'job_completed'
          : job.status === 'failed'
            ? 'job_failed'
            : 'job_started';

        const activityStatus = job.status === 'completed'
          ? 'success'
          : job.status === 'failed'
            ? 'error'
            : job.status === 'running'
              ? 'pending'
              : 'info';

        activityFeed.addActivity({
          type: activityType as ActivityItem['type'],
          status: activityStatus as ActivityItem['status'],
          title: `${job.job_type || 'Job'} ${job.status}`,
          description: job.job_id,
          metadata: {
            jobId: job.job_id,
            jobType: job.job_type,
          },
        });
      });
    }
  }, [recentJobs]);

  const formatAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  // Derive stats from data (GPU metrics placeholder until worker API is integrated)
  const gpuCount = 0;
  const activeGpus = 0;
  const totalStaked = stakeInfo?.stakedAmount;
  const pendingRewards = rewardsInfo?.pendingRewards;
  const totalEarnings = rewardsInfo?.totalEarned;
  const reputation = 0; // Will be fetched from on-chain reputation contract
  const isValidatorActive = validatorStatus?.status === 'active';

  const isLoading = loadingValidator || loadingGpus || loadingJobs || loadingRewards || loadingStake;

  return (
    <ErrorBoundary>
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Validator Dashboard</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm sm:text-base text-gray-400">
              Welcome back, {address ? formatAddress(address) : ""}
            </p>
            <QuickReference
              shortcuts={[
                { keys: ["?"], label: "Help" },
                { keys: ["\u2318", "K"], label: "Search" },
              ]}
              className="hidden sm:flex"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/docs" className="btn-secondary flex items-center gap-2 text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3">
            <span className="hidden sm:inline">Add GPU</span>
            <span className="sm:hidden">Add</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link href="/stake" className="btn-glow flex items-center gap-2 text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3">
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Stake More</span>
            <span className="sm:hidden">Stake</span>
          </Link>
        </div>
      </div>

      {/* Getting Started Wizard for new users */}
      <GettingStartedWizard
        sageBalance={sageBalance}
        stakedAmount={stakedAmount}
        hasGpu={hasGpuConnected}
      />

      {/* Validator Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`p-2 sm:p-3 rounded-xl ${isValidatorActive ? 'bg-emerald-500/20' : 'bg-gray-500/20'}`}>
              <Shield className={`w-5 h-5 sm:w-6 sm:h-6 ${isValidatorActive ? 'text-emerald-400' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">Validator Status</h2>
                {loadingValidator ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : (
                  <span className={`badge ${isValidatorActive ? 'badge-success' : 'bg-gray-500/20 text-gray-400'} text-xs`}>
                    {isValidatorActive ? 'Active' : 'Not Registered'}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                {isValidatorActive
                  ? 'Your node is validating on Starknet Sepolia'
                  : 'Get SAGE tokens from the faucet, then stake to become a validator'}
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right ml-auto sm:ml-0">
            <p className="text-xs sm:text-sm text-gray-400">Reputation Score</p>
            <p className="text-xl sm:text-2xl font-bold text-white">
              {loadingValidator ? <Loader2 className="w-5 h-5 animate-spin inline" /> : `${reputation}%`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Real-time Network Stats */}
      {wsSubscribed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-3 sm:p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${wsConnected ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {wsConnected ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
              </div>
              <span className="text-sm font-medium text-white">Network Status</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${wsConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            {/* Timestamp removed - not available in NetworkStats type */}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="w-3 h-3" /> Active Workers
              </p>
              <p className="text-lg font-bold text-white">{networkStats?.active_workers || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Utilization</p>
              <p className="text-lg font-bold text-white">{(networkStats?.network_utilization || 0).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">In Progress</p>
              <p className="text-lg font-bold text-white">{networkStats?.jobs_in_progress || 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Completed</p>
              <p className="text-lg font-bold text-white">{networkStats?.total_jobs_completed || 0}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AnimatePresence mode="wait">
          {loadingGpus ? (
            <SkeletonCard key="gpu-skeleton" />
          ) : (
            <motion.div
              key="gpu-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-4 sm:p-6"
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-brand-500/20">
                  <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-brand-400" />
                </div>
                <span className="text-emerald-400 text-xs sm:text-sm flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Live
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white">{gpuCount}</p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Connected GPUs ({activeGpus} active)</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {loadingStake ? (
            <SkeletonCard key="stake-skeleton" />
          ) : (
            <motion.div
              key="stake-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-4 sm:p-6"
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/20">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                {formatSage(totalStaked)} <span className="text-sm sm:text-lg text-gray-400">SAGE</span>
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Total Staked</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {loadingRewards ? (
            <SkeletonCard key="earnings-skeleton" />
          ) : (
            <motion.div
              key="earnings-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-4 sm:p-6"
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/20">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                </div>
                <span className="text-emerald-400 text-xs sm:text-sm">+12.5%</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                {formatSage(totalEarnings)} <span className="text-sm sm:text-lg text-gray-400">SAGE</span>
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Total Earnings</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {loadingRewards ? (
            <SkeletonCard key="rewards-skeleton" />
          ) : (
            <motion.div
              key="rewards-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card p-4 sm:p-6"
            >
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="p-1.5 sm:p-2 rounded-lg bg-orange-500/20">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                </div>
                <Link href="/earnings" className="text-brand-400 text-xs sm:text-sm hover:underline">
                  Claim
                </Link>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-white">
                {formatSage(pendingRewards)} <span className="text-sm sm:text-lg text-gray-400">SAGE</span>
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Pending Rewards</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* GPU Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-white">Your GPUs</h2>
          <Link
            href="/docs"
            className="text-xs sm:text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <span className="hidden sm:inline">Add more GPUs</span>
            <span className="sm:hidden">Add GPU</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="wait">
          {loadingGpus ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={`gpu-skeleton-${i}`} className="glass-card p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="skeleton-circle w-8 h-8 sm:w-10 sm:h-10" />
                      <div>
                        <div className="skeleton-text w-24 mb-1" />
                        <div className="skeleton-text w-16" style={{ height: '10px' }} />
                      </div>
                    </div>
                    <div className="skeleton w-14 h-5 rounded-full" />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="skeleton-text w-16" style={{ height: '12px' }} />
                        <div className="skeleton-text w-8" style={{ height: '12px' }} />
                      </div>
                      <div className="h-2 skeleton rounded-full" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="skeleton-text w-14" style={{ height: '12px' }} />
                        <div className="skeleton-text w-12" style={{ height: '12px' }} />
                      </div>
                      <div className="h-2 skeleton rounded-full" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="skeleton-text w-20" style={{ height: '12px' }} />
                      <div className="skeleton-text w-10" style={{ height: '12px' }} />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-surface-border/30 flex items-center justify-between">
                    <div>
                      <div className="skeleton-text w-14 mb-1" style={{ height: '10px' }} />
                      <div className="skeleton w-12 h-5" />
                    </div>
                    <div className="text-right">
                      <div className="skeleton-text w-14 mb-1 ml-auto" style={{ height: '10px' }} />
                      <div className="skeleton w-10 h-5 ml-auto" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            // GPU metrics will be rendered here when worker API is integrated
            <div key="no-gpus" className="glass-card col-span-full">
              <EmptyState
                icon={Server}
                title="No GPUs Connected"
                description="Connect your first GPU to start validating jobs and earning SAGE rewards."
                action={{
                  label: "Add GPU",
                  href: "/docs",
                }}
                secondaryAction={{
                  label: "Learn More",
                  href: "/docs#gpu-setup",
                }}
              />
            </div>
          )}
          </AnimatePresence>
        </div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card"
      >
        <div className="p-4 sm:p-6 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-white">Recent Activity</h2>
          <Link
            href="/jobs"
            className="text-xs sm:text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <span className="hidden sm:inline">View All Jobs</span>
            <span className="sm:hidden">All</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-surface-border">
          <AnimatePresence mode="wait">
          {loadingJobs ? (
            <div key="jobs-skeleton">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={`job-skeleton-${i}`} className="flex items-center gap-4 p-3 sm:p-4 border-b border-surface-border/30 last:border-b-0">
                  <div className="skeleton-circle w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="skeleton-text w-32 sm:w-48 mb-2" />
                    <div className="skeleton-text w-24 sm:w-40" style={{ height: '12px' }} />
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="skeleton-text w-16 sm:w-20 mb-1 ml-auto" />
                    <div className="skeleton-text w-12 ml-auto" style={{ height: '12px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : recentJobs && recentJobs.length > 0 ? (
            <motion.div
              key="jobs-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="divide-y divide-surface-border"
            >
            {recentJobs.map((job: any) => {
              const jobStatus = job.status.toLowerCase();
              const status = statusConfig[jobStatus as keyof typeof statusConfig] || statusConfig.pending;
              const isCompleted = jobStatus === 'completed';
              // Handle both SDK (duration_ms, reward) and DB (execution_time_ms, payment_amount) formats
              const durationMs = job.duration_ms ?? job.execution_time_ms;
              const reward = job.reward ?? (job.payment_amount ? BigInt(job.payment_amount) : null);
              return (
                <div
                  key={job.job_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-surface-elevated/50 transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className={`p-1.5 sm:p-2 rounded-lg ${status.bg} flex-shrink-0`}>
                      {isCompleted ? (
                        <CheckCircle2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${status.color}`} />
                      ) : (
                        <Activity className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${status.color} animate-pulse`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-medium text-white truncate">{job.job_type}</p>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        {job.job_id} • {durationMs ? `${(durationMs / 1000).toFixed(1)}s` : 'In progress'}
                      </p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0 ml-auto sm:ml-0 flex-shrink-0">
                    <p className="text-sm sm:text-base text-white font-medium">
                      {reward ? `+${formatSage(reward)} SAGE` : "—"}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500">{status.label}</p>
                  </div>
                </div>
              );
            })}
            </motion.div>
          ) : (
            <div key="no-jobs">
              <EmptyState
                icon={Activity}
                title="No Recent Activity"
                description="Once you connect GPUs and start processing jobs, your activity will appear here."
                action={{
                  label: "View All Jobs",
                  href: "/jobs",
                }}
                compact
              />
            </div>
          )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Real-time Activity Feed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card"
      >
        <div className="p-4 sm:p-6 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-white">Live Activity Feed</h2>
          <button
            onClick={activityFeed.clearAll}
            className="text-xs sm:text-sm text-gray-400 hover:text-white"
          >
            Clear All
          </button>
        </div>
        <ActivityFeed
          activities={activityFeed.activities}
          onMarkAsRead={activityFeed.markAsRead}
          onClearAll={activityFeed.clearAll}
          isPaused={activityFeed.isPaused}
          onPauseChange={activityFeed.setIsPaused}
          showFilters
          showPauseButton
          groupByTime
          className="max-h-[400px] overflow-y-auto"
        />
      </motion.div>
    </div>
    </ErrorBoundary>
  );
}
