"use client";

import { useState, useMemo, useCallback } from "react";
import {
  TrendingUp,
  Download,
  Calendar,
  Coins,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  BarChart3,
  Eye,
  EyeOff,
  Shield,
  Lock,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  SkeletonCard,
  SkeletonTableRow,
} from "@/components/ui/Skeleton";
import { EmptyState, InlineEmptyState } from "@/components/ui/EmptyState";
import { PrivacyBalanceCard, PrivacyOption } from "@/components/privacy/PrivacyToggle";
import { useSafeObelyskWallet } from "@/lib/obelysk/ObelyskWalletContext";
import { useAccount } from "@starknet-react/core";
import {
  useRewardsInfo,
  useRewardsHistory,
  useClaimRewards,
} from "@/lib/providers/BitSageSDKProvider";
import { useNetworkEarningsStats, useEarningsLeaderboard, useWorkerEarnings, useEarningsChart } from "@/lib/hooks/useApiData";
import { EarningsBreakdown, EarningsChart, EarningsDataPoint } from "./components/EarningsChart";
import { usePrivacyPool } from "@/lib/hooks/usePrivacyPool";
import { PRIVACY_DENOMINATIONS, type PrivacyDenomination } from "@/lib/crypto";
import { usePrivacyKeys } from "@/lib/hooks/usePrivacyKeys";
import { useDataSource } from "@/lib/hooks/useDataSource";
import { DataSourceIndicator, DataSourceBanner } from "@/components/common/DataSourceIndicator";

// Format bigint SAGE amounts (18 decimals)
function formatSage(amount: bigint | undefined | null): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString()}.${decimal.toString().padStart(2, "0")}`;
}

// Format timestamp to readable date
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Map reward type to display label
function getRewardTypeLabel(type: "mining" | "staking" | "bonus"): string {
  switch (type) {
    case "mining":
      return "Job Completion";
    case "staking":
      return "Staking Reward";
    case "bonus":
      return "Bonus Reward";
    default:
      return "Reward";
  }
}

// Format string SAGE amounts (from database)
function formatSageString(amount: string): string {
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

export default function EarningsPage() {
  const { address } = useAccount();
  const [timeFilter, setTimeFilter] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [claimPrivately, setClaimPrivately] = useState(false);
  const obelyskWallet = useSafeObelyskWallet();
  const balance = obelyskWallet?.balance ?? { public: "0", private: "0", pending: "0" };

  // SDK hooks for rewards data
  const { data: rewardsInfo, isLoading: loadingRewards, refetch: refetchRewards } = useRewardsInfo();

  // Data source detection
  const dataSource = useDataSource({ hasError: !rewardsInfo && !loadingRewards });
  const periodMap = { "24h": "day", "7d": "week", "30d": "month", all: "all" } as const;
  const { data: rewardsHistory, isLoading: loadingHistory } = useRewardsHistory(periodMap[timeFilter]);
  const { claim: claimRewards, isLoading: claiming } = useClaimRewards();

  // Database-backed earnings hooks
  const { data: networkStats, isLoading: loadingNetworkStats } = useNetworkEarningsStats();
  const { data: workerEarnings, isLoading: loadingWorkerEarnings } = useWorkerEarnings(address);
  const { data: leaderboard, isLoading: loadingLeaderboard } = useEarningsLeaderboard({ limit: 10 });
  // Database-backed chart data
  const periodChartMap: Record<string, string> = { "24h": "7d", "7d": "7d", "30d": "30d", all: "90d" };
  const { data: dbChartData, isLoading: loadingDbChart } = useEarningsChart(address, periodChartMap[timeFilter]);

  // Privacy pool hooks
  const {
    deposit: privacyDeposit,
    withdraw: privacyWithdraw,
    depositState,
    withdrawState,
    availableDenominations,
    isKeysDerived,
    derivePrivacyKeys,
  } = usePrivacyPool();
  const { getSpendableNotes } = usePrivacyKeys();
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  // Derive earnings data from SDK
  const totalEarnings = rewardsInfo?.total_earned;
  const pendingRewards = rewardsInfo?.claimable_rewards;
  const claimedRewards = rewardsInfo?.total_claimed;

  // Calculate period total from history entries
  const periodTotal = useMemo(() => {
    if (!rewardsHistory || rewardsHistory.length === 0) return 0n;
    return rewardsHistory.reduce((sum, entry) => sum + entry.amount, 0n);
  }, [rewardsHistory]);

  // Generate chart data from database or fallback to SDK history
  const chartData = useMemo(() => {
    // Priority 1: Use database-backed chart data
    if (dbChartData?.data && dbChartData.data.length > 0) {
      return dbChartData.data.map((point: any) => {
        const date = new Date(point.date);
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return {
          day: dayNames[date.getDay()],
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: parseFloat(point.amount) / 1e18,
          count: point.count,
        };
      }).slice(-7); // Last 7 days for chart
    }

    // Fallback to SDK history
    if (!rewardsHistory || rewardsHistory.length === 0) {
      // Default empty chart
      return [
        { day: "Mon", amount: 0 },
        { day: "Tue", amount: 0 },
        { day: "Wed", amount: 0 },
        { day: "Thu", amount: 0 },
        { day: "Fri", amount: 0 },
        { day: "Sat", amount: 0 },
        { day: "Sun", amount: 0 },
      ];
    }

    // Group entries by day of week
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dailyTotals = new Map<string, bigint>();
    dayNames.forEach((d) => dailyTotals.set(d, 0n));

    rewardsHistory.forEach((entry) => {
      const date = new Date(entry.timestamp * 1000);
      const dayName = dayNames[date.getDay()];
      const current = dailyTotals.get(dayName) || 0n;
      dailyTotals.set(dayName, current + entry.amount);
    });

    // Convert to chart format (amount in whole SAGE)
    return dayNames.slice(1).concat(dayNames[0]).map((day) => ({
      day,
      amount: Number((dailyTotals.get(day) || 0n) / 10n ** 18n),
    }));
  }, [dbChartData, rewardsHistory]);

  const maxAmount = Math.max(...chartData.map((d) => d.amount), 1);

  // Transform chart data to EarningsChart format
  const earningsChartData: EarningsDataPoint[] = useMemo(() => {
    if (dbChartData?.data && dbChartData.data.length > 0) {
      return dbChartData.data.map((point: { date: string; amount: string; breakdown?: { job_completion?: string; stake_reward?: string; referral?: string } }) => ({
        date: point.date,
        label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: parseFloat(point.amount) / 1e18,
        breakdown: point.breakdown ? {
          jobCompletion: parseFloat(point.breakdown.job_completion || '0') / 1e18,
          stakeReward: parseFloat(point.breakdown.stake_reward || '0') / 1e18,
          referral: parseFloat(point.breakdown.referral || '0') / 1e18,
        } : undefined,
      }));
    }
    // Return empty array when no data - show empty state instead of mock data
    return [];
  }, [dbChartData]);

  // Calculate earnings breakdown from network stats or worker earnings
  const earningsBreakdown = useMemo(() => {
    if (networkStats?.by_type && networkStats.by_type.length > 0) {
      const getTypeAmount = (type: string) => {
        const found = networkStats.by_type.find((t) => t.payment_type === type);
        return found ? parseFloat(found.total) / 1e18 : 0;
      };
      return {
        jobCompletion: getTypeAmount('job_completion'),
        stakeReward: getTypeAmount('stake_reward'),
        referral: getTypeAmount('referral'),
      };
    }
    // Fallback to aggregated chart data
    const totals = earningsChartData.reduce(
      (acc, point) => {
        if (point.breakdown) {
          acc.jobCompletion += point.breakdown.jobCompletion;
          acc.stakeReward += point.breakdown.stakeReward;
          acc.referral += point.breakdown.referral;
        }
        return acc;
      },
      { jobCompletion: 0, stakeReward: 0, referral: 0 }
    );
    return totals;
  }, [networkStats, earningsChartData]);

  const totalBreakdownAmount = earningsBreakdown.jobCompletion + earningsBreakdown.stakeReward + earningsBreakdown.referral;

  // Convert arbitrary amount to fixed denominations for privacy preservation
  const amountToDenominations = useCallback((amountStr: string): PrivacyDenomination[] => {
    const numAmount = parseFloat(amountStr) || 0;
    const denominations: PrivacyDenomination[] = [];
    let remaining = numAmount;

    // Greedy algorithm: use largest denominations first
    const sortedDenoms = [...PRIVACY_DENOMINATIONS].sort((a, b) => b - a);
    for (const denom of sortedDenoms) {
      while (remaining >= denom) {
        denominations.push(denom);
        remaining -= denom;
        remaining = Math.round(remaining * 1000) / 1000; // Avoid floating point issues
      }
    }
    return denominations;
  }, []);

  const handleWrap = useCallback(async (amountStr: string) => {
    const denominations = amountToDenominations(amountStr);
    if (denominations.length === 0) {
      setPrivacyError("Amount too small. Minimum is 0.1 SAGE.");
      return;
    }

    try {
      setPrivacyError(null);

      // Ensure privacy keys are derived before depositing
      if (!isKeysDerived) {
        await derivePrivacyKeys();
      }

      // Deposit each denomination to privacy pool
      for (const denom of denominations) {
        await privacyDeposit(denom);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to wrap tokens";
      setPrivacyError(errorMessage);
      throw error;
    }
  }, [amountToDenominations, privacyDeposit, isKeysDerived, derivePrivacyKeys]);

  const handleUnwrap = useCallback(async (amountStr: string) => {
    const targetAmount = parseFloat(amountStr) || 0;
    if (targetAmount <= 0) {
      setPrivacyError("Invalid amount");
      return;
    }

    try {
      setPrivacyError(null);

      // Ensure privacy keys are derived before withdrawing
      if (!isKeysDerived) {
        await derivePrivacyKeys();
      }

      // Get spendable notes from local storage
      const notes = await getSpendableNotes();
      if (!notes || notes.length === 0) {
        setPrivacyError("No private balance available to unwrap");
        return;
      }

      // Select notes to cover the target amount
      // Sort by denomination descending for efficiency
      const sortedNotes = [...notes].sort((a, b) => b.denomination - a.denomination);
      let remaining = targetAmount;
      const notesToSpend = [];

      for (const note of sortedNotes) {
        if (remaining <= 0) break;
        notesToSpend.push(note);
        remaining -= note.denomination;
      }

      if (remaining > 0) {
        setPrivacyError(`Insufficient private balance. Have ${notes.reduce((s, n) => s + n.denomination, 0)} SAGE`);
        return;
      }

      // Withdraw each note
      for (const note of notesToSpend) {
        await privacyWithdraw(note);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to unwrap tokens";
      setPrivacyError(errorMessage);
      throw error;
    }
  }, [getSpendableNotes, privacyWithdraw, isKeysDerived, derivePrivacyKeys]);

  const handleClaimAll = async () => {
    if (!pendingRewards || pendingRewards === 0n) return;
    try {
      await claimRewards();
      refetchRewards();
    } catch (err) {
      console.error("Claim failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Demo Mode Banner */}
      {dataSource.isDemoMode && (
        <DataSourceBanner
          source="demo"
          message="You're viewing sample earnings data. Connect your wallet to see real rewards."
          actionLabel="Connect Wallet"
          onAction={() => window.location.href = "/connect"}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Earnings</h1>
            <DataSourceIndicator source={dataSource.source} size="sm" />
          </div>
          <p className="text-gray-400 mt-1">Track your validation rewards</p>
        </div>
        <button
          onClick={handleClaimAll}
          disabled={claiming || !pendingRewards || pendingRewards === 0n}
          className={cn(
            "btn-glow flex items-center gap-2",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            claimPrivately && "bg-gradient-to-r from-emerald-600 to-accent-purple"
          )}
        >
          {claiming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : claimPrivately ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Coins className="w-4 h-4" />
          )}
          {claiming ? "Claiming..." : `Claim ${claimPrivately ? "Privately" : "All"} (${formatSage(pendingRewards)} SAGE)`}
        </button>
      </div>

      {/* Privacy Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Privacy Balances */}
        <div className="lg:col-span-2">
          <PrivacyBalanceCard
            publicBalance={balance.public}
            privateBalance={balance.private}
            onWrap={handleWrap}
            onUnwrap={handleUnwrap}
          />
        </div>

        {/* Claim Options */}
        <div className="space-y-4">
          <PrivacyOption
            label="Claim Rewards Privately"
            description="Receive earnings to private balance"
            enabled={claimPrivately}
            onToggle={setClaimPrivately}
          />
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-white">Privacy Status</span>
            </div>
            <p className="text-xs text-gray-400">
              {claimPrivately 
                ? "New rewards will be encrypted and added to your private balance."
                : "Rewards will be claimed to your public balance (visible on-chain)."
              }
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatePresence mode="wait">
          {loadingRewards ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={`stat-skeleton-${i}`} className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="skeleton-circle w-5 h-5" />
                    <div className="skeleton-text w-24" style={{ height: '14px' }} />
                  </div>
                  <div className="skeleton h-8 w-32 mb-2" />
                  <div className="skeleton-text w-16" style={{ height: '10px' }} />
                </div>
              ))}
            </>
          ) : (
            <>
              <motion.div
                key="total-earnings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-gray-400">Total Earnings</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatSage(totalEarnings)} <span className="text-sm text-gray-400">SAGE</span></p>
                <p className="text-xs text-gray-500 mt-1">All time</p>
              </motion.div>

              <motion.div
                key="pending"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-orange-400" />
                  <span className="text-sm text-gray-400">Pending</span>
                </div>
                <p className="text-2xl font-bold text-orange-400">{formatSage(pendingRewards)} <span className="text-sm text-gray-500">SAGE</span></p>
                <p className="text-xs text-gray-500 mt-1">Ready to claim</p>
              </motion.div>

              <motion.div
                key="period-total"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-gray-400">Period Total</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatSage(periodTotal)} <span className="text-sm text-gray-400">SAGE</span></p>
                <p className="text-xs text-gray-500 mt-1">{timeFilter === "all" ? "All time" : `Last ${timeFilter}`}</p>
              </motion.div>

              <motion.div
                key="total-claimed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-gray-400">Total Claimed</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatSage(claimedRewards)} <span className="text-sm text-gray-400">SAGE</span></p>
                <p className="text-xs text-gray-500 mt-1">Lifetime claimed</p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Earnings Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Earnings Overview</h3>
          <div className="flex gap-2">
            {(["24h", "7d", "30d", "all"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  timeFilter === filter
                    ? "bg-emerald-600 text-white"
                    : "bg-surface-elevated text-gray-400 hover:text-white"
                )}
              >
                {filter === "all" ? "All" : filter.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div className="h-40 flex items-end gap-4">
          {chartData.map((data, idx) => (
            <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
              <div className="text-xs text-gray-500">{data.amount}</div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(data.amount / maxAmount) * 100}%` }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg min-h-[4px]"
              />
              <span className="text-xs text-gray-500">{data.day}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Enhanced Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Detailed Earnings Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="lg:col-span-2"
        >
          <EarningsChart
            data={earningsChartData}
            period={timeFilter === '24h' ? '7d' : timeFilter === 'all' ? '90d' : timeFilter}
            isLoading={loadingDbChart}
          />
        </motion.div>

        {/* Earnings Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <EarningsBreakdown
            breakdown={earningsBreakdown}
            total={totalBreakdownAmount}
          />
        </motion.div>
      </div>

      {/* Earnings History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card"
      >
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Earnings History</h3>
          <button
            onClick={() => {
              if (!rewardsHistory || rewardsHistory.length === 0) return;
              const csv = [
                "Type,Amount,Date,Transaction",
                ...rewardsHistory.map((e) =>
                  `${e.type},${formatSage(e.amount)},${formatDate(e.timestamp)},${e.tx_hash || ""}`
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `earnings-${timeFilter}.csv`;
              a.click();
            }}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left p-4 text-sm font-medium text-gray-400">Type</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Amount</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">Date</th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={`history-skeleton-${i}`} className="border-b border-surface-border/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="skeleton-circle w-9 h-9" />
                          <div className="skeleton-text w-24" />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="skeleton-text w-20" />
                      </td>
                      <td className="p-4">
                        <div className="skeleton w-16 h-5 rounded-full" />
                      </td>
                      <td className="p-4">
                        <div className="skeleton-text w-20" />
                      </td>
                      <td className="p-4 text-right">
                        <div className="skeleton-text w-24 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : rewardsHistory && rewardsHistory.length > 0 ? (
                rewardsHistory.map((entry, idx) => (
                  <motion.tr
                    key={`${entry.timestamp}-${idx}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-b border-surface-border/50 hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/20">
                          <Coins className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-white">{getRewardTypeLabel(entry.type)}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-medium">+{formatSage(entry.amount)} SAGE</span>
                    </td>
                    <td className="p-4">
                      {entry.tx_hash ? (
                        <span className="badge badge-success flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" />
                          Claimed
                        </span>
                      ) : (
                        <span className="badge badge-warning flex items-center gap-1 w-fit">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-400">{formatDate(entry.timestamp)}</td>
                    <td className="p-4 text-right">
                      {entry.tx_hash ? (
                        <a
                          href={`https://sepolia.starkscan.co/tx/${entry.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline text-sm flex items-center gap-1 justify-end"
                        >
                          {entry.tx_hash.slice(0, 8)}...{entry.tx_hash.slice(-6)} <ArrowUpRight className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Coins}
                      title="No Earnings Yet"
                      description={`No earnings history for ${timeFilter === 'all' ? 'all time' : `the last ${timeFilter}`}. Complete jobs to start earning SAGE rewards.`}
                      action={{
                        label: "View Jobs",
                        href: "/jobs",
                      }}
                      compact
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Network Stats & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Network Earnings Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Network Earnings
          </h3>

          {loadingNetworkStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={`network-stat-${i}`} className="p-4 rounded-lg bg-surface-elevated/50 border border-surface-border">
                    <div className="skeleton-text w-20 mb-2" style={{ height: '10px' }} />
                    <div className="skeleton h-6 w-24" />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="skeleton-text w-24 mb-2" style={{ height: '12px' }} />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={`type-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-surface-card">
                      <div className="skeleton-text w-20" style={{ height: '12px' }} />
                      <div className="skeleton-text w-16" style={{ height: '12px' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : networkStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-surface-elevated/50 border border-surface-border">
                  <p className="text-xs text-gray-500 mb-1">Total Distributed</p>
                  <p className="text-lg font-bold text-white">
                    {formatSageString(networkStats.total_distributed)} <span className="text-xs text-gray-400">SAGE</span>
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-surface-elevated/50 border border-surface-border">
                  <p className="text-xs text-gray-500 mb-1">24h Volume</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {formatSageString(networkStats.volume_last_24h)} <span className="text-xs text-gray-500">SAGE</span>
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-surface-elevated/50 border border-surface-border">
                  <p className="text-xs text-gray-500 mb-1">Total Payments</p>
                  <p className="text-lg font-bold text-white">{networkStats.total_payments.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-lg bg-surface-elevated/50 border border-surface-border">
                  <p className="text-xs text-gray-500 mb-1">Avg Payment</p>
                  <p className="text-lg font-bold text-white">
                    {formatSageString(networkStats.avg_payment_amount)} <span className="text-xs text-gray-400">SAGE</span>
                  </p>
                </div>
              </div>

              {networkStats.by_type && networkStats.by_type.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-400 mb-2">Earnings by Type</p>
                  <div className="space-y-2">
                    {networkStats.by_type.map((item) => (
                      <div key={item.payment_type} className="flex items-center justify-between p-2 rounded-lg bg-surface-card">
                        <span className="text-sm text-gray-300 capitalize">{item.payment_type.replace('_', ' ')}</span>
                        <span className="text-sm font-medium text-white">{formatSageString(item.total)} SAGE</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <InlineEmptyState
              icon={BarChart3}
              message="Network stats not available"
            />
          )}
        </motion.div>

        {/* Earnings Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            Top Earners
          </h3>

          {loadingLeaderboard ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={`leaderboard-skeleton-${i}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/50 border border-surface-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="skeleton w-8 h-8 rounded-lg" />
                    <div>
                      <div className="skeleton-text w-24 mb-1" />
                      <div className="skeleton-text w-16" style={{ height: '10px' }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="skeleton-text w-20 mb-1 ml-auto" />
                    <div className="skeleton-text w-12 ml-auto" style={{ height: '10px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            <div className="space-y-3">
              {leaderboard.map((entry, idx) => {
                const isCurrentUser = address && entry.address.toLowerCase() === address.toLowerCase();
                return (
                  <div
                    key={entry.address}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      isCurrentUser
                        ? "bg-emerald-600/10 border-emerald-500/30"
                        : "bg-surface-elevated/50 border-surface-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                        idx === 0 ? "bg-yellow-500/20 text-yellow-400" :
                        idx === 1 ? "bg-gray-400/20 text-gray-300" :
                        idx === 2 ? "bg-orange-600/20 text-orange-400" :
                        "bg-surface-elevated text-gray-500"
                      )}>
                        #{entry.rank}
                      </div>
                      <div>
                        <p className="text-sm font-mono text-white">
                          {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                          {isCurrentUser && <span className="ml-2 text-xs text-emerald-400">(You)</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {entry.jobs_completed} jobs completed
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-emerald-400">
                        +{formatSageString(entry.total_earnings)} SAGE
                      </p>
                      <p className="text-xs text-gray-500">
                        ~{formatSageString(entry.avg_earning_per_job)}/job
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <InlineEmptyState
              icon={TrendingUp}
              message="No earners on the leaderboard yet"
            />
          )}

          {/* User's position if not in top 10 */}
          {workerEarnings && address && !leaderboard?.some(e => e.address.toLowerCase() === address.toLowerCase()) && (
            <div className="mt-4 pt-4 border-t border-surface-border">
              <p className="text-xs text-gray-500 mb-2">Your Position</p>
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-600/10 border border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-emerald-500/20 text-emerald-400">
                    #{workerEarnings.rank}
                  </div>
                  <div>
                    <p className="text-sm font-mono text-white">
                      {address.slice(0, 6)}...{address.slice(-4)}
                      <span className="ml-2 text-xs text-emerald-400">(You)</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Top {workerEarnings.percentile.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-emerald-400">
                    +{formatSageString(workerEarnings.total_earnings)} SAGE
                  </p>
                  <p className="text-xs text-gray-500">
                    {workerEarnings.jobs_completed} jobs
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
