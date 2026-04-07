"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import {
  Coins,
  Lock,
  Unlock,
  TrendingUp,
  Clock,
  Shield,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
  Wallet,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getExplorerUrl } from "@/lib/contracts/addresses";
import { PrivacyBalanceCard, PrivacyOption } from "@/components/privacy/PrivacyToggle";
import { useSafeObelyskWallet } from "@/lib/obelysk/ObelyskWalletContext";
import Link from "next/link";
import {
  useMyStaking,
  useStakingConfig,
  useSDKMounted,
} from "@/lib/providers/BitSageSDKProvider";
import { useStakingHistoryDb, useStakingLeaderboard } from "@/lib/hooks/useApiData";
import { useStakingWebSocket } from "@/lib/hooks/useWebSocket";
import {
  buildStakeCall,
  buildUnstakeCall,
  buildApproveCall,
  getContractAddresses,
  useOnChainStakeInfo,
  useSageBalance,
} from "@/lib/contracts";
import { usePrivacyPool } from "@/lib/hooks/usePrivacyPool";
import { PRIVACY_DENOMINATIONS, type PrivacyDenomination } from "@/lib/crypto";
import { usePrivacyKeys } from "@/lib/hooks/usePrivacyKeys";
import { TransactionConfirmModal } from "@/components/ui/ConfirmationModal";

// Format bigint SAGE amounts (18 decimals)
function formatSage(amount: bigint | undefined | null): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString()}.${decimal.toString().padStart(2, "0")}`;
}

// Parse SAGE amount string to bigint (18 decimals)
function parseSageAmount(amount: string): bigint {
  const cleaned = amount.replace(/,/g, '');
  const parts = cleaned.split('.');
  const whole = BigInt(parts[0] || '0');
  const decimalStr = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  const decimal = BigInt(decimalStr);
  return whole * 10n ** 18n + decimal;
}

const stakingTiers = [
  { name: "Bronze", min: 100, max: 999, apr: 18, color: "text-orange-400", benefits: ["Basic validation", "Standard rewards"] },
  { name: "Silver", min: 1000, max: 4999, apr: 21, color: "text-gray-300", benefits: ["Priority jobs", "+15% rewards"] },
  { name: "Gold", min: 5000, max: 24999, apr: 24, color: "text-yellow-400", benefits: ["Premium jobs", "+25% rewards", "Early access"] },
  { name: "Diamond", min: 25000, max: Infinity, apr: 30, color: "text-cyan-400", benefits: ["Top-tier jobs", "+40% rewards", "Governance voting", "Network incentives"] },
];

// Default SDK data when SDK not mounted
interface StakingDataState {
  stakeInfo: {
    stake?: { amount?: bigint; gpu_tier?: string };
    pending_rewards?: bigint;
    estimated_apy_bps?: number;
  } | null;
  tier: string | null;
  pendingUnstakes: Array<{ amount: bigint; available_at?: number }>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  stakingConfig: {
    unstake_lockup_secs?: number;
    min_stake_per_tier?: Record<string, bigint>;
  } | null;
  loadingConfig: boolean;
}

const DEFAULT_STAKING_DATA: StakingDataState = {
  stakeInfo: null,
  tier: null,
  pendingUnstakes: [],
  isLoading: false,
  error: null,
  refetch: () => {},
  stakingConfig: null,
  loadingConfig: false,
};

// Hook that safely returns SDK staking data or defaults
function useSafeStakingData(): StakingDataState {
  const sdkMounted = useSDKMounted();

  // These hooks are always called (Rules of Hooks) but their result
  // is only used when SDK is mounted
  // Using try-catch won't work because hooks must be called unconditionally
  // Instead, we check sdkMounted and return defaults if not mounted

  if (!sdkMounted) {
    return DEFAULT_STAKING_DATA;
  }

  // SDK is mounted, safe to use the data
  // But we can't call hooks conditionally, so we need a different approach
  return DEFAULT_STAKING_DATA;
}

// Inner component that uses SDK hooks - only rendered when SDK is mounted
function StakePageWithSDK(props: StakePageInnerProps) {
  const { stakeInfo, tier, pendingUnstakes, isLoading, error, refetch } = useMyStaking();
  const { data: stakingConfig, isLoading: loadingConfig } = useStakingConfig();

  return (
    <StakePageInner
      {...props}
      stakeInfo={stakeInfo}
      workerTier={tier}
      pendingUnstakes={pendingUnstakes || []}
      isLoading={isLoading}
      error={error}
      refetch={refetch}
      stakingConfig={stakingConfig}
      loadingConfig={loadingConfig}
    />
  );
}

interface StakePageInnerProps {
  address: string | undefined;
  balance: { public: string; private: string; pending: string };
  isPrivateRevealed: boolean;
}

interface StakePageInnerPropsWithSDK extends StakePageInnerProps {
  stakeInfo: StakingDataState['stakeInfo'];
  workerTier: string | null;
  pendingUnstakes: Array<{ amount: bigint; available_at?: number }>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  stakingConfig: StakingDataState['stakingConfig'];
  loadingConfig: boolean;
}

// Main inner component that receives all data as props
function StakePageInner({
  address,
  balance,
  isPrivateRevealed,
  stakeInfo,
  workerTier,
  pendingUnstakes,
  isLoading,
  error,
  refetch,
  stakingConfig,
  loadingConfig,
}: StakePageInnerPropsWithSDK) {
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const [stakePrivately, setStakePrivately] = useState(false);
  const [usePrivateBalance, setUsePrivateBalance] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Transaction confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingTx, setPendingTx] = useState<{
    type: 'stake' | 'unstake';
    amount: bigint;
    amountFormatted: string;
  } | null>(null);

  // Toast notifications state
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'stake' | 'unstake' | 'slashed';
    amount: string;
    timestamp: number;
  }>>([]);

  // Database-backed staking history and leaderboard
  const { data: stakingHistory, isLoading: loadingHistory } = useStakingHistoryDb(address, { limit: 10 });
  const { data: leaderboard, isLoading: loadingLeaderboard } = useStakingLeaderboard({ limit: 5 });

  // On-chain contract hooks
  const { data: onChainBalance } = useSageBalance(address);
  const { data: onChainStakeInfo } = useOnChainStakeInfo(address);
  const contracts = getContractAddresses("sepolia");

  // Transaction hook for on-chain staking
  const { send: sendTransaction, isPending: txPending, data: txData } = useSendTransaction({});

  // WebSocket for real-time staking events
  const { stakingEvents, isConnected: wsConnected } = useStakingWebSocket(address);

  // Privacy Pool hook for wrap/unwrap operations
  const {
    deposit: privacyDeposit,
    withdraw: privacyWithdraw,
    isKeysDerived,
    derivePrivacyKeys,
  } = usePrivacyPool();
  const { getSpendableNotes } = usePrivacyKeys();

  // Process staking events into toast notifications
  useEffect(() => {
    if (stakingEvents.length > 0) {
      const latest = stakingEvents[0];
      const notificationId = `${latest.tx_hash}-${Date.now()}`;

      // Check if we already have this notification
      setNotifications(prev => {
        if (prev.some(n => n.id.startsWith(latest.tx_hash))) {
          return prev;
        }

        const notification = {
          id: notificationId,
          type: latest.event_type,
          amount: latest.amount,
          timestamp: Date.now(),
        };

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notificationId));
        }, 5000);

        return [notification, ...prev].slice(0, 3);
      });

      // Refetch staking data when events arrive
      refetch();
    }
  }, [stakingEvents, refetch]);

  // Handle stake transaction
  const handleStake = useCallback(async (amountBigInt: bigint) => {
    if (!address) return;
    setTxError(null);
    setTxHash(null);

    try {
      // First approve the staking contract to spend SAGE tokens
      const approveCall = buildApproveCall(contracts.STAKING, amountBigInt, "sepolia");
      // Then stake (GPU tier 0 = Consumer, TEE = false for now)
      const stakeCall = buildStakeCall(amountBigInt, 0, false, "sepolia");

      // Send both calls atomically
      await sendTransaction([approveCall, stakeCall]);
    } catch (err: unknown) {
      console.error("Stake transaction failed:", err);
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [address, contracts.STAKING, sendTransaction]);

  // Handle unstake transaction
  const handleUnstake = useCallback(async (amountBigInt: bigint) => {
    if (!address) return;
    setTxError(null);
    setTxHash(null);

    try {
      const unstakeCall = buildUnstakeCall(amountBigInt, "sepolia");
      await sendTransaction([unstakeCall]);
    } catch (err: unknown) {
      console.error("Unstake transaction failed:", err);
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [address, sendTransaction]);

  // Derive staking stats from SDK data
  const totalStaked = stakeInfo?.stake?.amount;
  const pendingRewards = stakeInfo?.pending_rewards;
  const estimatedApy = stakeInfo?.estimated_apy_bps ? (stakeInfo.estimated_apy_bps / 100).toFixed(1) : "0";
  const lockPeriodDays = stakingConfig?.unstake_lockup_secs ? Math.ceil(stakingConfig.unstake_lockup_secs / 86400) : 7;
  const lockPeriod = `${lockPeriodDays} days`;
  const minStake = stakingConfig?.min_stake_per_tier?.Consumer || 100n * 10n ** 18n;

  // Find current tier based on staked amount
  const stakedNumber = totalStaked ? Number(totalStaked / 10n ** 18n) : 0;
  const currentTier = stakingTiers.find(
    (tier) => stakedNumber >= tier.min && stakedNumber <= tier.max
  ) || stakingTiers[0];

  // Convert amount to optimal denominations for privacy pool
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
        // Prevent floating point issues
        remaining = Math.round(remaining * 1000) / 1000;
      }
    }

    return denominations;
  }, []);

  // Wrap SAGE into privacy pool (deposit)
  const handleWrap = useCallback(async (amountStr: string) => {
    const denominations = amountToDenominations(amountStr);
    if (denominations.length === 0) {
      setTxError("Amount too small. Minimum is 0.1 SAGE.");
      return;
    }

    try {
      setTxError(null);

      // Ensure privacy keys are derived before depositing
      if (!isKeysDerived) {
        await derivePrivacyKeys();
      }

      // Deposit each denomination as a separate note
      // This preserves privacy by using fixed denominations
      for (const denom of denominations) {
        await privacyDeposit(denom);
      }

      // Add success notification
      setNotifications(prev => [...prev, {
        id: `wrap-${Date.now()}`,
        type: 'stake' as const,
        amount: amountStr,
        timestamp: Date.now(),
      }]);
    } catch (error) {
      setTxError(error instanceof Error ? error.message : "Failed to wrap tokens");
      throw error;
    }
  }, [amountToDenominations, privacyDeposit, isKeysDerived, derivePrivacyKeys]);

  // Unwrap from privacy pool (withdraw)
  const handleUnwrap = useCallback(async (amountStr: string) => {
    const targetAmount = parseFloat(amountStr) || 0;
    if (targetAmount <= 0) {
      setTxError("Invalid amount");
      return;
    }

    try {
      setTxError(null);

      // Ensure privacy keys are derived before withdrawing
      if (!isKeysDerived) {
        await derivePrivacyKeys();
      }

      // Get spendable notes from local storage
      const notes = await getSpendableNotes();
      if (!notes || notes.length === 0) {
        setTxError("No private balance available to unwrap");
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
        setTxError(`Insufficient private balance. Have ${notes.reduce((s, n) => s + n.denomination, 0)} SAGE`);
        return;
      }

      // Withdraw each note
      for (const note of notesToSpend) {
        await privacyWithdraw(note);
      }

      // Add success notification
      setNotifications(prev => [...prev, {
        id: `unwrap-${Date.now()}`,
        type: 'unstake' as const,
        amount: amountStr,
        timestamp: Date.now(),
      }]);
    } catch (error) {
      setTxError(error instanceof Error ? error.message : "Failed to unwrap tokens");
      throw error;
    }
  }, [getSpendableNotes, privacyWithdraw, isKeysDerived, derivePrivacyKeys]);

  // Use balances from Obelysk wallet
  const availableAmount = usePrivateBalance
    ? balance.private
    : balance.public;

  // Toast notification component
  const NotificationToast = ({ notification }: { notification: typeof notifications[0] }) => {
    const config = {
      stake: {
        icon: TrendingUp,
        color: 'emerald',
        message: 'Stake confirmed',
        bgClass: 'bg-emerald-500/10 border-emerald-500/30',
        textClass: 'text-emerald-400',
      },
      unstake: {
        icon: Clock,
        color: 'orange',
        message: 'Unstake initiated',
        bgClass: 'bg-orange-500/10 border-orange-500/30',
        textClass: 'text-orange-400',
      },
      slashed: {
        icon: AlertCircle,
        color: 'red',
        message: 'Slashing occurred',
        bgClass: 'bg-red-500/10 border-red-500/30',
        textClass: 'text-red-400',
      },
    }[notification.type];

    const IconComponent = config.icon;

    return (
      <motion.div
        initial={{ opacity: 0, y: -20, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className={cn("glass-card p-3 border-l-4 w-full sm:w-80", config.bgClass)}
      >
        <div className="flex items-center gap-3">
          <IconComponent className={cn("w-4 h-4", config.textClass)} />
          <div>
            <p className="text-sm font-medium text-white">{config.message}</p>
            <p className="text-xs text-gray-400">{formatSage(BigInt(notification.amount))} SAGE</p>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:top-20 z-50 space-y-2 sm:max-w-sm">
        <AnimatePresence>
          {notifications.map((n) => (
            <NotificationToast key={n.id} notification={n} />
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Stake SAGE</h1>
            {wsConnected && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-gray-400 mt-1">
            Stake SAGE tokens to become a validator and earn rewards
          </p>
        </div>
        <Link
          href="/wallet"
          className="flex items-center gap-2 px-4 py-2 text-sm text-brand-400 hover:text-brand-300 border border-brand-500/30 rounded-xl hover:bg-brand-500/10 transition-colors"
        >
          <Wallet className="w-4 h-4" />
          Obelysk Wallet
        </Link>
      </div>

      {/* Obelysk Wallet Quick View */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Available to Stake</p>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{balance.public} SAGE</span>
                <span className="text-gray-600">|</span>
                <span className="text-brand-400 font-mono text-sm flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  {isPrivateRevealed ? balance.private : "•••••"} private
                </span>
                {parseFloat(balance.pending) > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-orange-400 text-sm flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      +{balance.pending} pending
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Link
            href="/wallet"
            className="text-sm text-brand-400 hover:underline"
          >
            Rollover to Private →
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Staked */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-5 h-5 text-brand-400" />
            <span className="text-sm text-gray-400">Total Staked</span>
          </div>
          <div className="flex items-baseline gap-2">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            ) : (
              <>
                <p className="text-2xl font-bold text-white">{formatSage(totalStaked)}</p>
                <span className="text-sm text-gray-400">SAGE</span>
              </>
            )}
          </div>
          {workerTier && (
            <p className="text-xs text-gray-500 mt-2">
              {workerTier} tier • {stakeInfo?.stake?.gpu_tier || 'Consumer'} GPU
            </p>
          )}
        </motion.div>

        {/* Pending Rewards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-gray-400">Pending Rewards</span>
          </div>
          <div className="flex items-baseline gap-2">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            ) : (
              <>
                <p className="text-2xl font-bold text-emerald-400">{formatSage(pendingRewards)}</p>
                <span className="text-sm text-gray-400">SAGE</span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">Available to claim</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-gray-400">Current APY</span>
          </div>
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          ) : (
            <p className="text-2xl font-bold text-emerald-400">{estimatedApy}%</p>
          )}
          <p className="text-xs text-gray-500 mt-2">{currentTier?.name} tier rewards</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-orange-400" />
            <span className="text-sm text-gray-400">Lock Period</span>
          </div>
          <p className="text-2xl font-bold text-white">{lockPeriod}</p>
          <p className="text-xs text-gray-500 mt-2">Cooldown for unstaking</p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Staking Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* Privacy Balance Card */}
          <PrivacyBalanceCard
            publicBalance={balance.public}
            privateBalance={balance.private}
            onWrap={handleWrap}
            onUnwrap={handleUnwrap}
          />

          {/* Staking Card */}
          <div className="glass-card">
            {/* Tabs */}
            <div className="flex border-b border-surface-border">
              <button
                onClick={() => setActiveTab("stake")}
                className={cn(
                  "flex-1 px-6 py-4 text-sm font-medium transition-colors relative",
                  activeTab === "stake" ? "text-white" : "text-gray-400 hover:text-white"
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  Stake
                </span>
                {activeTab === "stake" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab("unstake")}
                className={cn(
                  "flex-1 px-6 py-4 text-sm font-medium transition-colors relative",
                  activeTab === "unstake" ? "text-white" : "text-gray-400 hover:text-white"
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <Unlock className="w-4 h-4" />
                  Unstake
                </span>
                {activeTab === "unstake" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                  />
                )}
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Privacy Options */}
              {activeTab === "stake" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PrivacyOption
                    label="Use Private Balance"
                    description="Stake from private SAGE"
                    enabled={usePrivateBalance}
                    onToggle={setUsePrivateBalance}
                  />
                  <PrivacyOption
                    label="Stake Privately"
                    description="Hide staked amount on-chain"
                    enabled={stakePrivately}
                    onToggle={setStakePrivately}
                  />
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Amount to {activeTab}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="input-field pr-24 text-xl"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button
                      onClick={() => setAmount(availableAmount.replace(",", ""))}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      MAX
                    </button>
                    <span className="text-gray-400">SAGE</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                  {activeTab === "stake" ? (
                    usePrivateBalance ? (
                      <>
                        <EyeOff className="w-3 h-3 text-brand-400" />
                        <span>Private balance (reveal to see)</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>{balance.public} SAGE available</span>
                      </>
                    )
                  ) : (
                    `Staked: ${formatSage(totalStaked)} SAGE`
                  )}
                </p>
              </div>

              {/* Staking Info */}
              {activeTab === "stake" && (
                <div className={cn(
                  "p-4 rounded-xl border",
                  stakePrivately
                    ? "bg-brand-600/10 border-brand-500/20"
                    : "bg-surface-elevated/50 border-surface-border"
                )}>
                  <div className="flex items-start gap-3">
                    {stakePrivately ? (
                      <Shield className="w-5 h-5 text-brand-400 mt-0.5" />
                    ) : (
                      <Info className="w-5 h-5 text-gray-400 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm text-white mb-1">
                        {stakePrivately ? "Private Staking Enabled" : "Staking Requirements"}
                      </p>
                      {stakePrivately ? (
                        <p className="text-xs text-gray-400">
                          Your staked amount will be encrypted using ElGamal encryption.
                          It will appear as <span className="font-mono text-brand-400">•••••</span> on-chain.
                          Only you can reveal the actual amount.
                        </p>
                      ) : (
                        <ul className="text-xs text-gray-400 space-y-1">
                          <li>• Minimum stake: {formatSage(minStake)} SAGE</li>
                          <li>• Lock period: {lockPeriod}</li>
                          <li>• Must have registered GPU node</li>
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "unstake" && (
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-white mb-1">Unstaking Notice</p>
                      <p className="text-xs text-gray-400">
                        Unstaking will begin a {lockPeriod} cooldown period.
                        During this time, you won't earn rewards on the unstaking amount.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Unstakes */}
              {activeTab === "unstake" && pendingUnstakes && pendingUnstakes.length > 0 && (
                <div className="p-4 rounded-xl bg-surface-elevated/50 border border-surface-border">
                  <p className="text-sm text-white mb-2">Pending Unstakes</p>
                  <div className="space-y-2">
                    {pendingUnstakes.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{formatSage(req.amount)} SAGE</span>
                        <span className="text-orange-400">
                          {req.available_at ? new Date(req.available_at * 1000).toLocaleDateString() : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction Status */}
              {txError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  {txError}
                </div>
              )}
              {txData?.transaction_hash && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400">Transaction submitted!</span>
                    <a
                      href={`${getExplorerUrl('tx')}/${txData.transaction_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">
                    {txData.transaction_hash}
                  </p>
                </div>
              )}

              {/* Submit Button - Shows Confirmation Modal */}
              <button
                disabled={txPending || !amount || !address}
                onClick={() => {
                  if (!amount) return;
                  const amountBigInt = parseSageAmount(amount);
                  // Show confirmation modal instead of executing directly
                  setPendingTx({
                    type: activeTab,
                    amount: amountBigInt,
                    amountFormatted: formatSage(amountBigInt),
                  });
                  setShowConfirmModal(true);
                }}
                className={cn(
                  "w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  stakePrivately && activeTab === "stake"
                    ? "bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-accent-purple/90 text-white"
                    : "btn-glow"
                )}
              >
                {txPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for wallet...</>
                ) : activeTab === "stake" ? (
                  stakePrivately ? (
                    <><EyeOff className="w-4 h-4" /> Stake Privately</>
                  ) : (
                    <><Lock className="w-4 h-4" /> Stake SAGE</>
                  )
                ) : (
                  <><Unlock className="w-4 h-4" /> Begin Unstaking</>
                )}
              </button>

              {!address && (
                <p className="text-xs text-center text-gray-500">
                  Connect your wallet to stake SAGE tokens
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Validator Tiers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6 h-fit"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" />
            Validator Tiers
          </h3>

          <div className="space-y-3">
            {stakingTiers.map((tier) => {
              const isCurrentTier = tier.name === currentTier?.name;
              return (
                <div
                  key={tier.name}
                  className={cn(
                    "p-4 rounded-xl border transition-all",
                    isCurrentTier
                      ? "bg-brand-600/10 border-brand-500/30"
                      : "bg-surface-elevated border-surface-border"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", tier.color)}>{tier.name}</span>
                      {isCurrentTier && (
                        <span className="badge badge-success text-xs">Current</span>
                      )}
                    </div>
                    <span className="text-sm text-emerald-400">{tier.apr}% APR</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {tier.min.toLocaleString()} - {tier.max === Infinity ? "∞" : tier.max.toLocaleString()} SAGE
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {tier.benefits.map((benefit) => (
                      <span
                        key={benefit}
                        className="text-xs px-2 py-0.5 rounded-full bg-surface-card text-gray-400"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Staking History & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staking History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-400" />
            Staking History
          </h3>

          {!address ? (
            <div className="text-center py-8 text-gray-500">
              Connect wallet to view staking history
            </div>
          ) : loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : stakingHistory?.events && stakingHistory.events.length > 0 ? (
            <div className="space-y-3">
              {stakingHistory.events.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/50 border border-surface-border"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      event.event_type === 'stake' ? "bg-emerald-500/20" :
                      event.event_type === 'unstake_initiated' ? "bg-orange-500/20" :
                      event.event_type === 'slashed' ? "bg-red-500/20" : "bg-gray-500/20"
                    )}>
                      {event.event_type === 'stake' ? (
                        <Lock className="w-4 h-4 text-emerald-400" />
                      ) : event.event_type === 'slashed' ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Unlock className="w-4 h-4 text-orange-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white capitalize">
                        {event.event_type.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(event.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-medium",
                      event.event_type === 'stake' ? "text-emerald-400" :
                      event.event_type === 'slashed' ? "text-red-400" : "text-orange-400"
                    )}>
                      {event.event_type === 'stake' ? '+' : '-'}
                      {formatSage(BigInt(event.amount))} SAGE
                    </p>
                    {event.tx_hash && (
                      <a
                        href={`${getExplorerUrl('tx')}/${event.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:underline flex items-center gap-1 justify-end"
                      >
                        View tx <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No staking history yet
            </div>
          )}
        </motion.div>

        {/* Staking Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            Top Stakers
          </h3>

          {loadingLeaderboard ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                        ? "bg-brand-600/10 border-brand-500/30"
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
                          {isCurrentUser && <span className="ml-2 text-xs text-brand-400">(You)</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {entry.jobs_completed} jobs • {entry.reputation_score} rep
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatSage(BigInt(entry.staked_amount))} SAGE
                      </p>
                      <p className="text-xs text-emerald-400">
                        +{formatSage(BigInt(entry.total_earnings))} earned
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No stakers yet
            </div>
          )}
        </motion.div>
      </div>

      {/* Transaction Confirmation Modal */}
      <TransactionConfirmModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setPendingTx(null);
        }}
        onConfirm={async () => {
          if (!pendingTx) return;
          setShowConfirmModal(false);

          if (pendingTx.type === 'stake') {
            await handleStake(pendingTx.amount);
          } else {
            await handleUnstake(pendingTx.amount);
          }

          setPendingTx(null);
          setAmount("");
        }}
        title={pendingTx?.type === 'stake' ? "Confirm Staking" : "Confirm Unstaking"}
        description={
          pendingTx?.type === 'stake'
            ? `You are about to stake ${pendingTx?.amountFormatted || '0'} SAGE tokens. Your tokens will be locked and earn rewards.`
            : `You are about to begin unstaking ${pendingTx?.amountFormatted || '0'} SAGE tokens. There is a ${lockPeriod} lock period before you can withdraw.`
        }
        details={[
          { label: "Amount", value: `${pendingTx?.amountFormatted || '0'} SAGE`, isCurrency: true },
          { label: "Action", value: pendingTx?.type === 'stake' ? "Stake" : "Begin Unstake" },
          { label: pendingTx?.type === 'stake' ? "Est. APY" : "Lock Period", value: pendingTx?.type === 'stake' ? `${estimatedApy}%` : lockPeriod },
          { label: "Network", value: "Starknet Sepolia" },
        ]}
        variant="stake"
        isLoading={txPending}
      />
    </div>
  );
}

// Main page component - routes to SDK or non-SDK version
export default function StakePage() {
  const { address } = useAccount();
  const obelyskWallet = useSafeObelyskWallet();
  const balance = obelyskWallet?.balance ?? { public: "0", private: "0", pending: "0" };
  const isPrivateRevealed = obelyskWallet?.isPrivateRevealed ?? false;
  const sdkMounted = useSDKMounted();

  const baseProps: StakePageInnerProps = {
    address,
    balance,
    isPrivateRevealed,
  };

  // If SDK is mounted, render the version with SDK hooks
  if (sdkMounted) {
    return <StakePageWithSDK {...baseProps} />;
  }

  // Otherwise, render with default values
  return (
    <StakePageInner
      {...baseProps}
      stakeInfo={null}
      workerTier={null}
      pendingUnstakes={[]}
      isLoading={false}
      error={null}
      refetch={() => {}}
      stakingConfig={null}
      loadingConfig={false}
    />
  );
}
