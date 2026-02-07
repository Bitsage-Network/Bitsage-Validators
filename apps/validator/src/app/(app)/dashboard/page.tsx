"use client";

import { useAccount } from "@starknet-react/core";
import {
  Cpu,
  Zap,
  TrendingUp,
  Server,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Shield,
  Thermometer,
  Loader2,
  Wifi,
  WifiOff,
  Users,
  Briefcase,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  SkeletonCard,
} from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useDashboardWithDb } from "@/lib/hooks";
import { useOnChainStakeInfo, useSageBalance } from "@/lib/contracts";
import { GettingStartedWizard } from "@/components/onboarding/GettingStartedWizard";
import { QuickReference } from "@/components/help/KeyboardShortcutsModal";
import { cn, formatAddress, formatDuration } from "@/lib/utils";
import type { GPUMetrics, JobDbRecord } from "@/lib/api/client";

const statusConfig: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  active: { color: "text-emerald-400", bg: "bg-emerald-500/20", dot: "bg-emerald-400", label: "Active" },
  idle: { color: "text-amber-400", bg: "bg-amber-500/20", dot: "bg-amber-400", label: "Idle" },
  offline: { color: "text-red-400", bg: "bg-red-500/20", dot: "bg-red-400", label: "Offline" },
  completed: { color: "text-emerald-400", bg: "bg-emerald-500/20", dot: "bg-emerald-400", label: "Completed" },
  running: { color: "text-amber-400", bg: "bg-amber-500/20", dot: "bg-amber-400", label: "Running" },
  failed: { color: "text-red-400", bg: "bg-red-500/20", dot: "bg-red-400", label: "Failed" },
  cancelled: { color: "text-zinc-400", bg: "bg-zinc-500/20", dot: "bg-zinc-400", label: "Cancelled" },
  pending: { color: "text-yellow-400", bg: "bg-yellow-500/20", dot: "bg-yellow-400", label: "Pending" },
};

function formatSageString(amount: string | null | undefined): string {
  if (!amount || amount === "0") return "0.00";
  try {
    const num = parseFloat(amount) / 1e18;
    if (num >= 1) return num.toFixed(2);
    if (num >= 0.001) return num.toFixed(4);
    return num.toExponential(2);
  } catch {
    return "0.00";
  }
}

function formatSage(amount: bigint | undefined | null): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString()}.${decimal.toString().padStart(2, "0")}`;
}

function getUtilColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function getTempColor(temp: number): string {
  if (temp > 90) return "text-red-400 bg-red-500/20";
  if (temp > 70) return "text-amber-400 bg-amber-500/20";
  return "text-emerald-400 bg-emerald-500/20";
}

export default function DashboardPage() {
  const { address } = useAccount();

  // Composite hook — pulls validatorStatus, gpuMetrics, dbStats, recentJobs, isConnected
  const {
    validatorStatus,
    gpuMetrics,
    dbStats,
    recentJobs,
    isLoading,
    isConnected,
    refetch,
  } = useDashboardWithDb();

  // On-chain data
  const { data: onChainStakeInfo, isLoading: loadingOnChainStake } = useOnChainStakeInfo(address);
  const { data: sageBalanceData } = useSageBalance(address);

  const stakedAmountOnChain = onChainStakeInfo?.amount ? BigInt(onChainStakeInfo.amount.toString()) : 0n;
  const sageBalance = sageBalanceData ? BigInt(sageBalanceData.toString()) : 0n;
  const hasGpuConnected = gpuMetrics && gpuMetrics.length > 0;

  // Derive validator active state from API or on-chain
  const isValidatorActive = validatorStatus?.is_active || stakedAmountOnChain > 0n;

  // GPU list (from API)
  const gpuList: GPUMetrics[] = gpuMetrics || [];

  return (
    <ErrorBoundary>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Validator Dashboard</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-lime-400" : "bg-red-400"
                )} />
                <span className={cn(
                  "text-xs",
                  isConnected ? "text-lime-400" : "text-red-400"
                )}>
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
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
            <button
              onClick={() => refetch()}
              className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link href="/docs" className="btn-secondary flex items-center gap-2 text-sm px-4 py-2">
              <span className="hidden sm:inline">Add GPU</span>
              <span className="sm:hidden">Add</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link href="/stake" className="btn-glow flex items-center gap-2 text-sm px-4 py-2">
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Stake More</span>
              <span className="sm:hidden">Stake</span>
            </Link>
          </div>
        </div>

        {/* Getting Started Wizard for new users */}
        <GettingStartedWizard
          sageBalance={sageBalance}
          stakedAmount={stakedAmountOnChain}
          hasGpu={!!hasGpuConnected}
        />

        {/* Validator Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 sm:p-6"
        >
          {!address ? (
            <div className="flex items-center gap-3 text-gray-400">
              <Shield className="w-5 h-5" />
              <span>Connect your wallet to view validator status</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={cn(
                  "p-2 sm:p-3 rounded-xl",
                  isValidatorActive ? "bg-emerald-500/20" : "bg-gray-500/20"
                )}>
                  <Shield className={cn(
                    "w-5 h-5 sm:w-6 sm:h-6",
                    isValidatorActive ? "text-emerald-400" : "text-gray-400"
                  )} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-semibold text-white">Validator Status</h2>
                    {isLoading || loadingOnChainStake ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <span className={cn(
                        "badge text-xs",
                        isValidatorActive ? "badge-success" : "bg-gray-500/20 text-gray-400"
                      )}>
                        {isValidatorActive ? "Active" : "Inactive"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <p className="text-xs text-gray-500">Staked</p>
                      <p className="text-sm font-medium text-white">
                        {validatorStatus ? formatSageString(validatorStatus.staked_amount) : formatSage(stakedAmountOnChain)} SAGE
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Reputation</p>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${validatorStatus?.reputation || 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-white">
                          {validatorStatus?.reputation || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-6 text-left sm:text-right ml-auto sm:ml-0">
                <div>
                  <p className="text-xs text-gray-500">Pending Rewards</p>
                  <p className="text-lg font-bold text-amber-400">
                    {validatorStatus ? formatSageString(validatorStatus.pending_rewards) : "0.00"} <span className="text-xs text-gray-400">SAGE</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Earnings</p>
                  <p className="text-lg font-bold text-white">
                    {validatorStatus ? formatSageString(validatorStatus.total_earnings) : "0.00"} <span className="text-xs text-gray-400">SAGE</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Stats Cards (4-col grid) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={`stat-skeleton-${i}`} />
                ))}
              </>
            ) : (
              <>
                <motion.div
                  key="total-jobs"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="glass-card p-4 sm:p-6"
                >
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-lime-500/20">
                      <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{dbStats?.total_jobs || 0}</p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Total Jobs</p>
                </motion.div>

                <motion.div
                  key="success-rate"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="glass-card p-4 sm:p-6"
                >
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/20">
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {(dbStats?.success_rate || 0).toFixed(1)}%
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Success Rate</p>
                </motion.div>

                <motion.div
                  key="active-jobs"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass-card p-4 sm:p-6"
                >
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/20">
                      <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{dbStats?.active_jobs || 0}</p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Active Jobs</p>
                </motion.div>

                <motion.div
                  key="earnings-24h"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="glass-card p-4 sm:p-6"
                >
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-lime-500/20">
                      <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400" />
                    </div>
                    <Link href="/earnings" className="text-emerald-400 text-xs hover:underline">
                      View
                    </Link>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-white">
                    {formatSageString(dbStats?.earnings_24h || "0")}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1">Earnings 24h (SAGE)</p>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* GPU Hardware */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-white">GPU Hardware</h2>
            <Link
              href="/docs"
              className="text-xs sm:text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <span className="hidden sm:inline">Add more GPUs</span>
              <span className="sm:hidden">Add GPU</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className={cn(
            "grid gap-4",
            gpuList.length === 1 ? "grid-cols-1" :
            gpuList.length === 2 ? "grid-cols-1 md:grid-cols-2" :
            "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          )}>
            {gpuList.length > 0 ? (
              gpuList.map((gpu) => {
                const gpuStatus = statusConfig[gpu.status] || statusConfig.offline;
                return (
                  <motion.div
                    key={gpu.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-4 sm:p-5"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-emerald-500/20">
                          <Cpu className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{gpu.model}</p>
                          <p className="text-xs text-gray-500">{gpu.name}</p>
                        </div>
                      </div>
                      <span className={cn("badge text-xs", gpuStatus.bg, gpuStatus.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full inline-block mr-1", gpuStatus.dot)} />
                        {gpuStatus.label}
                      </span>
                    </div>

                    {/* Utilization */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">Utilization</span>
                          <span className="text-xs font-medium text-white">{gpu.utilization}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", getUtilColor(gpu.utilization))}
                            style={{ width: `${gpu.utilization}%` }}
                          />
                        </div>
                      </div>

                      {/* Temperature */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Thermometer className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-400">Temperature</span>
                        </div>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", getTempColor(gpu.temperature))}>
                          {gpu.temperature}°C
                        </span>
                      </div>

                      {/* VRAM */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">VRAM</span>
                          <span className="text-xs font-medium text-white">
                            {gpu.memory_used.toFixed(1)} / {gpu.memory_total.toFixed(1)} GB
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500 transition-all"
                            style={{ width: `${(gpu.memory_used / gpu.memory_total) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Power Draw */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Power Draw</span>
                        <span className="text-xs font-medium text-white">{gpu.power_draw}W</span>
                      </div>

                      {/* Current Job */}
                      {gpu.current_job && (
                        <div className="mt-2 pt-2 border-t border-surface-border/30">
                          <div className="flex items-center gap-1">
                            <Activity className="w-3 h-3 text-amber-400 animate-pulse" />
                            <span className="text-xs text-gray-400">Running:</span>
                            <span className="text-xs font-mono text-white truncate max-w-[120px]">
                              {gpu.current_job}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="glass-card col-span-full">
                <EmptyState
                  icon={Server}
                  title="No GPUs Registered"
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
          </div>
        </div>

        {/* Recent Jobs Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card"
        >
          <div className="p-4 sm:p-6 border-b border-surface-border flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-white">Recent Jobs</h2>
            <Link
              href="/jobs"
              className="text-xs sm:text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <span className="hidden sm:inline">View All Jobs</span>
              <span className="sm:hidden">All</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`job-skeleton-${i}`} className="flex items-center gap-4 p-3 border-b border-surface-border/30 last:border-b-0">
                    <div className="skeleton-circle w-8 h-8 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="skeleton-text w-32 mb-2" />
                      <div className="skeleton-text w-24" style={{ height: "12px" }} />
                    </div>
                    <div className="flex-shrink-0">
                      <div className="skeleton-text w-16 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentJobs && recentJobs.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400">Job ID</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400">Type</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400">Status</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400 hidden md:table-cell">Worker</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400">Payment</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400 hidden sm:table-cell">Duration</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400 hidden lg:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job: JobDbRecord) => {
                    const jobStatus = job.status.toLowerCase();
                    const status = statusConfig[jobStatus] || statusConfig.pending;
                    return (
                      <tr
                        key={job.id || job.job_id}
                        className="border-b border-surface-border/50 hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="p-3 sm:p-4">
                          <span className="text-sm font-mono text-white truncate max-w-[100px] inline-block">
                            {job.job_id.length > 12 ? `${job.job_id.slice(0, 6)}...${job.job_id.slice(-4)}` : job.job_id}
                          </span>
                        </td>
                        <td className="p-3 sm:p-4">
                          <span className="text-sm text-gray-300">{job.job_type}</span>
                        </td>
                        <td className="p-3 sm:p-4">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-2 h-2 rounded-full", status.dot)} />
                            <span className={cn("text-sm", status.color)}>{status.label}</span>
                          </div>
                        </td>
                        <td className="p-3 sm:p-4 hidden md:table-cell">
                          <span className="text-sm font-mono text-gray-400">
                            {job.worker_address ? formatAddress(job.worker_address) : "—"}
                          </span>
                        </td>
                        <td className="p-3 sm:p-4 text-right">
                          <span className="text-sm font-medium text-white">
                            {job.payment_amount ? `${formatSageString(job.payment_amount)} SAGE` : "—"}
                          </span>
                        </td>
                        <td className="p-3 sm:p-4 text-right hidden sm:table-cell">
                          <span className="text-sm text-gray-400">
                            {job.execution_time_ms ? formatDuration(job.execution_time_ms) : "—"}
                          </span>
                        </td>
                        <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                          <span className="text-sm text-gray-400">
                            {new Date(job.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                icon={Activity}
                title="No Jobs Recorded Yet"
                description="Once you connect GPUs and start processing jobs, they will appear here."
                action={{
                  label: "View All Jobs",
                  href: "/jobs",
                }}
                compact
              />
            )}
          </div>
        </motion.div>
      </div>
    </ErrorBoundary>
  );
}
