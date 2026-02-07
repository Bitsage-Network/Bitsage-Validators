"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  DollarSign,
  Globe,
  Hash,
  Shield,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BarChart3,
  Coins,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatAddress } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState, InlineEmptyState } from "@/components/ui/EmptyState";
import { useAccount } from "@starknet-react/core";
import {
  useEarningsPageData,
  useEarningsSummary,
  useEarningsHistory,
} from "@/lib/hooks";
import type {
  EarningsLeaderboardEntry,
  PaymentRecord,
  EarningsChartPoint,
} from "@/lib/api/client";

function formatSageString(amount: string | null | undefined): string {
  if (!amount || amount === "0") return "0.00";
  try {
    const num = parseFloat(amount) / 1e18;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    if (num >= 1) return num.toFixed(2);
    if (num >= 0.001) return num.toFixed(4);
    return num.toExponential(2);
  } catch {
    return "0.00";
  }
}

export default function EarningsPage() {
  const { address } = useAccount();

  // Composite hook — networkStats, workerEarnings, leaderboard, chartData
  const {
    networkStats,
    workerEarnings,
    leaderboard,
    chartData,
    isLoading: loadingPageData,
  } = useEarningsPageData(address);

  // Detailed personal breakdown
  const { data: earningsSummary, isLoading: loadingSummary } = useEarningsSummary(address);

  // Paginated payment history
  const [historyPage, setHistoryPage] = useState(1);
  const { data: earningsHistoryData, isLoading: loadingHistory } = useEarningsHistory(address, {
    page: historyPage,
    limit: 10,
  });

  // Chart period toggle
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d">("7d");

  // Filter chart data by period
  const filteredChartData = useMemo(() => {
    if (!chartData?.data) return [];
    if (chartPeriod === "7d") return chartData.data.slice(-7);
    return chartData.data;
  }, [chartData, chartPeriod]);

  const chartMaxAmount = useMemo(() => {
    if (filteredChartData.length === 0) return 1;
    return Math.max(
      ...filteredChartData.map((d: EarningsChartPoint) => parseFloat(d.amount) / 1e18),
      0.01
    );
  }, [filteredChartData]);

  const chartTotal = useMemo(() => {
    return filteredChartData.reduce(
      (sum: number, d: EarningsChartPoint) => sum + parseFloat(d.amount) / 1e18,
      0
    );
  }, [filteredChartData]);

  const historyTotalPages = earningsHistoryData
    ? Math.ceil(earningsHistoryData.total / (earningsHistoryData.limit || 10))
    : 1;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Earnings</h1>
            {workerEarnings && (
              <span className="badge bg-emerald-500/20 text-emerald-400 text-xs">
                #{workerEarnings.rank} &middot; Top {workerEarnings.percentile.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1">Track your validation rewards and earnings history</p>
        </div>
      </div>

      {/* Personal Earnings Cards (3-col grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnimatePresence mode="wait">
          {loadingSummary || !address ? (
            !address ? (
              <div className="col-span-full glass-card p-6">
                <div className="flex items-center gap-3 text-gray-400">
                  <Coins className="w-5 h-5" />
                  <span>Connect your wallet to view earnings</span>
                </div>
              </div>
            ) : (
              <>
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={`earning-skeleton-${i}`} />
                ))}
              </>
            )
          ) : (
            <>
              <motion.div
                key="total-earned"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-lime-400" />
                  <span className="text-sm text-gray-400">Total Earned</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {formatSageString(earningsSummary?.total_earnings)}{" "}
                  <span className="text-sm text-gray-400">SAGE</span>
                </p>
              </motion.div>

              <motion.div
                key="pending"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span className="text-sm text-gray-400">Pending</span>
                </div>
                <p className="text-2xl font-bold text-amber-400">
                  {formatSageString(earningsSummary?.pending_earnings)}{" "}
                  <span className="text-sm text-gray-500">SAGE</span>
                </p>
              </motion.div>

              <motion.div
                key="claimed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-gray-400">Claimed</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {formatSageString(earningsSummary?.claimed_earnings)}{" "}
                  <span className="text-sm text-gray-400">SAGE</span>
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Period Breakdown (3-col, smaller cards) */}
      {earningsSummary && address && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-4"
          >
            <p className="text-xs text-gray-500 mb-1">Last 24h</p>
            <p className="text-lg font-bold text-white">
              {formatSageString(earningsSummary.earnings_24h)}{" "}
              <span className="text-xs text-gray-400">SAGE</span>
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card p-4"
          >
            <p className="text-xs text-gray-500 mb-1">Last 7d</p>
            <p className="text-lg font-bold text-white">
              {formatSageString(earningsSummary.earnings_7d)}{" "}
              <span className="text-xs text-gray-400">SAGE</span>
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-4"
          >
            <p className="text-xs text-gray-500 mb-1">Last 30d</p>
            <p className="text-lg font-bold text-white">
              {formatSageString(earningsSummary.earnings_30d)}{" "}
              <span className="text-xs text-gray-400">SAGE</span>
            </p>
          </motion.div>
        </div>
      )}

      {/* Earnings Chart (full-width card) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">Earnings Chart</h3>
            {chartTotal > 0 && (
              <p className="text-sm text-gray-400 mt-1">
                Total: {chartTotal.toFixed(2)} SAGE ({chartPeriod})
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setChartPeriod(period)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  chartPeriod === period
                    ? "bg-emerald-600 text-white"
                    : "bg-surface-elevated text-gray-400 hover:text-white"
                )}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {filteredChartData.length > 0 ? (
          <div className="h-48 flex items-end gap-1 sm:gap-2">
            {filteredChartData.map((point: EarningsChartPoint, idx: number) => {
              const amount = parseFloat(point.amount) / 1e18;
              const heightPct = (amount / chartMaxAmount) * 100;
              const date = new Date(point.date);
              const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPct}%` }}
                    transition={{ delay: idx * 0.03, duration: 0.4 }}
                    className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-sm min-h-[2px] cursor-pointer hover:from-emerald-500 hover:to-emerald-300"
                    title={`${label}: ${amount.toFixed(2)} SAGE (${point.count} jobs)`}
                  />
                  {(chartPeriod === "7d" || idx % 5 === 0 || idx === filteredChartData.length - 1) && (
                    <span className="text-[10px] text-gray-500 truncate max-w-full">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">No earnings data yet</p>
          </div>
        )}
      </motion.div>

      {/* Network Stats (4-col grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AnimatePresence mode="wait">
          {loadingPageData ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={`net-skeleton-${i}`} />
              ))}
            </>
          ) : (
            <>
              <motion.div
                key="total-distributed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 sm:p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-gray-400">Total Distributed</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatSageString(networkStats?.total_distributed)}{" "}
                  <span className="text-xs text-gray-400">SAGE</span>
                </p>
              </motion.div>

              <motion.div
                key="total-payments"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="glass-card p-4 sm:p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs text-gray-400">Total Payments</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {(networkStats?.total_payments || 0).toLocaleString()}
                </p>
              </motion.div>

              <motion.div
                key="avg-payment"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-4 sm:p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs text-gray-400">Avg Payment</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {formatSageString(networkStats?.avg_payment_amount)}{" "}
                  <span className="text-xs text-gray-400">SAGE</span>
                </p>
              </motion.div>

              <motion.div
                key="24h-volume"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-4 sm:p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-lime-400" />
                  <span className="text-xs text-gray-400">24h Volume</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">
                  {formatSageString(networkStats?.volume_last_24h)}{" "}
                  <span className="text-xs text-gray-500">SAGE</span>
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Earnings Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Earnings Leaderboard
        </h3>

        {loadingPageData ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={`lb-skeleton-${i}`}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/50 border border-surface-border"
              >
                <div className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-lg" />
                  <div>
                    <div className="skeleton-text w-24 mb-1" />
                    <div className="skeleton-text w-16" style={{ height: "10px" }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="skeleton-text w-20 mb-1 ml-auto" />
                  <div className="skeleton-text w-12 ml-auto" style={{ height: "10px" }} />
                </div>
              </div>
            ))}
          </div>
        ) : leaderboard && leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left p-3 text-xs font-medium text-gray-400">#</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-400">Address</th>
                  <th className="text-right p-3 text-xs font-medium text-gray-400">Total Earned</th>
                  <th className="text-right p-3 text-xs font-medium text-gray-400 hidden sm:table-cell">Jobs</th>
                  <th className="text-right p-3 text-xs font-medium text-gray-400 hidden md:table-cell">Avg/Job</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry: EarningsLeaderboardEntry) => {
                  const isCurrentUser = address && entry.address.toLowerCase() === address.toLowerCase();
                  return (
                    <tr
                      key={entry.address}
                      className={cn(
                        "border-b border-surface-border/50 transition-colors",
                        isCurrentUser
                          ? "bg-lime-500/5 hover:bg-lime-500/10"
                          : "hover:bg-surface-elevated/50"
                      )}
                    >
                      <td className="p-3">
                        <span className={cn(
                          "inline-flex w-7 h-7 rounded-lg items-center justify-center font-bold text-xs",
                          entry.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                          entry.rank === 2 ? "bg-gray-400/20 text-gray-300" :
                          entry.rank === 3 ? "bg-orange-600/20 text-orange-400" :
                          "bg-surface-elevated text-gray-500"
                        )}>
                          {entry.rank}
                        </span>
                      </td>
                      <td className="p-3">
                        <a
                          href={`https://sepolia.starkscan.co/contract/${entry.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-mono text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          {formatAddress(entry.address)}
                          {isCurrentUser && <span className="text-xs text-lime-400">(You)</span>}
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-medium text-white">
                          {formatSageString(entry.total_earnings)} SAGE
                        </span>
                      </td>
                      <td className="p-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-gray-400">{entry.jobs_completed}</span>
                      </td>
                      <td className="p-3 text-right hidden md:table-cell">
                        <span className="text-sm text-gray-400">
                          {formatSageString(entry.avg_earning_per_job)} SAGE
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <InlineEmptyState
            icon={TrendingUp}
            message="No earners on the leaderboard yet"
          />
        )}
      </motion.div>

      {/* Payment History (table with pagination) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card"
      >
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Payment History</h3>
          {earningsHistoryData && earningsHistoryData.total > 0 && (
            <span className="text-xs text-gray-400">
              Page {earningsHistoryData.page} of {historyTotalPages}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {loadingHistory ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={`hist-skeleton-${i}`} className="flex items-center gap-4 p-3 border-b border-surface-border/30">
                  <div className="skeleton-circle w-8 h-8 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="skeleton-text w-32 mb-2" />
                    <div className="skeleton-text w-20" style={{ height: "12px" }} />
                  </div>
                  <div className="skeleton-text w-16 ml-auto" />
                </div>
              ))}
            </div>
          ) : earningsHistoryData?.payments && earningsHistoryData.payments.length > 0 ? (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400">Payment ID</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400 hidden sm:table-cell">Job ID</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400">Amount</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400 hidden md:table-cell">Type</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-medium text-gray-400 hidden lg:table-cell">Token</th>
                    <th className="text-center p-3 sm:p-4 text-xs font-medium text-gray-400 hidden md:table-cell">Privacy</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400 hidden sm:table-cell">Date</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-medium text-gray-400 hidden lg:table-cell">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {earningsHistoryData.payments.map((payment: PaymentRecord) => (
                    <tr
                      key={payment.id}
                      className="border-b border-surface-border/50 hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="p-3 sm:p-4">
                        <span className="text-sm font-mono text-white">
                          {payment.id.length > 10 ? `${payment.id.slice(0, 6)}...${payment.id.slice(-4)}` : payment.id}
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 hidden sm:table-cell">
                        <span className="text-sm font-mono text-gray-400">
                          {payment.job_id.length > 10 ? `${payment.job_id.slice(0, 6)}...${payment.job_id.slice(-4)}` : payment.job_id}
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 text-right">
                        <span className="text-sm font-medium text-emerald-400">
                          +{formatSageString(payment.amount)} SAGE
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 hidden md:table-cell">
                        <span className="text-sm text-gray-300 capitalize">
                          {payment.payment_type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 hidden lg:table-cell">
                        <span className="text-sm text-gray-400">{payment.token}</span>
                      </td>
                      <td className="p-3 sm:p-4 text-center hidden md:table-cell">
                        {payment.privacy_enabled ? (
                          <Shield className="w-4 h-4 text-violet-400 inline-block" />
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="p-3 sm:p-4 text-right hidden sm:table-cell">
                        <span className="text-sm text-gray-400">
                          {new Date(payment.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                        {payment.tx_hash ? (
                          <a
                            href={`https://sepolia.starkscan.co/tx/${payment.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-emerald-400 hover:underline flex items-center gap-1 justify-end"
                          >
                            {payment.tx_hash.slice(0, 6)}...{payment.tx_hash.slice(-4)}
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t border-surface-border">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="btn-secondary flex items-center gap-1 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {earningsHistoryData.page} of {historyTotalPages}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={historyPage >= historyTotalPages}
                  className="btn-secondary flex items-center gap-1 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Coins}
              title="No Payment Records Yet"
              description="Complete jobs to start earning SAGE rewards. Your payment history will appear here."
              action={{
                label: "View Jobs",
                href: "/jobs",
              }}
              compact
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
