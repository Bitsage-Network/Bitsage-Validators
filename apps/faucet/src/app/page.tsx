"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import {
  Droplets,
  Wallet,
  CheckCircle2,
  Loader2,
  ExternalLink,
  AlertCircle,
  Gift,
  Clock,
  Coins,
  Twitter,
  Users,
  Zap,
  Github,
  Star,
  MessageCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { LogoIcon } from "@/components/ui/Logo";
import { AddSageButton } from "@/components/token/AddSageButton";
import { EXTERNAL_LINKS } from "@/lib/contracts/addresses";
import { useFaucetStatus, useFaucetConfig, useClaimFaucet, useFaucetClaimHistory } from "@/lib/hooks/useApiData";
import {
  buildClaimFaucetCall,
  useCanClaim,
  useTimeUntilClaim,
  useClaimInfo,
  useFaucetConfig as useOnChainFaucetConfig,
  useFaucetStats as useOnChainFaucetStats,
  SAGE_DECIMALS,
} from "@/lib/contracts";
import { useNetwork } from "@/lib/contexts/NetworkContext";

// Social task types
type SocialTaskType = "github_follow" | "github_star" | "twitter_follow" | "discord_join";

interface SocialTask {
  id: string;
  title: string;
  description: string;
  reward: string;
  icon: typeof Github;
  link: string;
  verifyType: SocialTaskType;
  repo?: string;
  oneTimeOnly: boolean;
}

// Social tasks for earning extra tokens
const socialTasks: SocialTask[] = [
  {
    id: "github_follow",
    title: "Follow on GitHub",
    description: "Follow Bitsage-Network org",
    reward: "10",
    icon: Github,
    link: "https://github.com/Bitsage-Network",
    verifyType: "github_follow",
    oneTimeOnly: true,
  },
  {
    id: "github_star_stwo",
    title: "Star stwo-gpu",
    description: "Star the STWO GPU accelerator repo",
    reward: "15",
    icon: Star,
    link: "https://github.com/Bitsage-Network/stwo-gpu",
    verifyType: "github_star",
    repo: "Bitsage-Network/stwo-gpu",
    oneTimeOnly: true,
  },
  {
    id: "github_star_rust",
    title: "Star rust-node",
    description: "Star the Rust coordinator node",
    reward: "15",
    icon: Star,
    link: "https://github.com/Bitsage-Network/rust-node",
    verifyType: "github_star",
    repo: "Bitsage-Network/rust-node",
    oneTimeOnly: true,
  },
  {
    id: "github_star_sdk",
    title: "Star bitsage-sdk",
    description: "Star the BitSage SDK",
    reward: "15",
    icon: Star,
    link: "https://github.com/Bitsage-Network/bitsage-sdk",
    verifyType: "github_star",
    repo: "Bitsage-Network/bitsage-sdk",
    oneTimeOnly: true,
  },
  {
    id: "twitter_follow",
    title: "Follow on X",
    description: "Follow @bitsagenetwork",
    reward: "10",
    icon: Twitter,
    link: "https://x.com/bitsagenetwork",
    verifyType: "twitter_follow",
    oneTimeOnly: true,
  },
  {
    id: "discord_join",
    title: "Join Discord",
    description: "Join our community server",
    reward: "10",
    icon: MessageCircle,
    link: "https://discord.gg/3kyAZ2Hk",
    verifyType: "discord_join",
    oneTimeOnly: true,
  },
];

// Social connection status
interface SocialConnections {
  github: { connected: boolean; username?: string };
  twitter: { connected: boolean; username?: string };
  discord: { connected: boolean; username?: string };
}

export default function FaucetPage() {
  const { address } = useAccount();
  const { network } = useNetwork();
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [verifyingTask, setVerifyingTask] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  // Always use on-chain claiming - direct interaction with Starknet contract
  const useOnChain = true;
  const [socialConnections, setSocialConnections] = useState<SocialConnections>({
    github: { connected: false },
    twitter: { connected: false },
    discord: { connected: false },
  });

  // API hooks (fallback data source)
  const { data: faucetStatus, isLoading: statusLoading, refetch: refetchStatus } = useFaucetStatus(address);
  const { data: faucetConfig } = useFaucetConfig();
  const claimMutation = useClaimFaucet();
  const { data: claimHistory, isLoading: historyLoading } = useFaucetClaimHistory(address, 10);

  // On-chain contract hooks (primary data source)
  const { data: onChainCanClaim, refetch: refetchOnChain } = useCanClaim(address);
  const { data: onChainTimeUntil } = useTimeUntilClaim(address);
  const { data: onChainClaimInfo } = useClaimInfo(address);
  const { data: onChainConfig } = useOnChainFaucetConfig();
  const { data: onChainStats, refetch: refetchStats } = useOnChainFaucetStats();

  // On-chain transaction hook
  const { send: sendTransaction, isPending: txPending, data: txData, error: txError } = useSendTransaction({});

  // Handle direct on-chain claim
  const handleOnChainClaim = useCallback(async () => {
    if (!address) return;
    setSuccess(false);
    setTxHash(null);

    try {
      const claimCall = buildClaimFaucetCall(network);
      await sendTransaction([claimCall]);
    } catch (err) {
      console.error("On-chain claim failed:", err);
    }
  }, [address, sendTransaction, network]);

  // Update txHash when transaction succeeds
  useEffect(() => {
    if (txData?.transaction_hash) {
      setTxHash(txData.transaction_hash);
      setSuccess(true);
      // Refetch status and stats after claim
      setTimeout(() => {
        refetchStatus();
        refetchOnChain();
        refetchStats();
      }, 3000);
    }
  }, [txData, refetchStatus, refetchOnChain, refetchStats]);

  // Load completed tasks from localStorage
  useEffect(() => {
    if (address) {
      const tasks = localStorage.getItem(`faucet_tasks_${address}`);
      if (tasks) {
        setCompletedTasks(JSON.parse(tasks));
      }
    }
  }, [address]);

  // Fetch social connection status
  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const response = await fetch('/api/social/verify');
        if (response.ok) {
          const data = await response.json();
          setSocialConnections(data.connections);
        }
      } catch (error) {
        console.error('Failed to fetch social connections:', error);
      }
    };

    fetchConnections();

    // Check for GitHub connection success from URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('github_connected') === 'true') {
      // Refetch connections after OAuth redirect
      fetchConnections();
      // Clean URL
      window.history.replaceState({}, '', '/faucet');
    }
  }, []);

  // Update countdown timer
  useEffect(() => {
    if (!faucetStatus || faucetStatus.can_claim) {
      setTimeRemaining("");
      return;
    }

    const updateTimer = () => {
      const secs = faucetStatus.time_until_next_claim_secs;
      if (secs <= 0) {
        refetchStatus();
        setTimeRemaining("");
        return;
      }

      const hours = Math.floor(secs / 3600);
      const minutes = Math.floor((secs % 3600) / 60);
      const seconds = secs % 60;
      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(() => {
      updateTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [faucetStatus, refetchStatus]);

  const handleRequestTokens = async () => {
    if (!address || !faucetStatus?.can_claim) return;

    setSuccess(false);
    setTxHash(null);

    try {
      const result = await claimMutation.mutateAsync({ address });
      if (result.success) {
        setTxHash(result.transaction_hash);
        setSuccess(true);
      }
    } catch (err) {
      // Error handled by mutation
    }
  };

  // Verify and complete a social task
  const handleTaskVerify = async (task: SocialTask) => {
    if (completedTasks.includes(task.id) || !address) return;

    setVerifyingTask(task.id);
    setTaskError(null);

    try {
      const response = await fetch('/api/social/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskType: task.verifyType,
          repo: task.repo,
          wallet: address,
        }),
      });

      const result = await response.json();

      if (result.requiresAuth && result.authUrl) {
        // Redirect to OAuth
        window.location.href = result.authUrl;
        return;
      }

      if (result.verified) {
        // Mark task as completed
        const newCompleted = [...completedTasks, task.id];
        setCompletedTasks(newCompleted);
        localStorage.setItem(`faucet_tasks_${address}`, JSON.stringify(newCompleted));
      } else {
        setTaskError(result.message || 'Verification failed');
      }
    } catch (error) {
      setTaskError('Failed to verify task. Please try again.');
    } finally {
      setVerifyingTask(null);
    }
  };

  // Handle clicking task link (open in new tab, then verify)
  const handleTaskClick = (task: SocialTask) => {
    // Open the link in a new tab
    window.open(task.link, '_blank');

    // For GitHub tasks, check if connected first
    if (task.verifyType === 'github_star' || task.verifyType === 'github_follow') {
      if (!socialConnections.github.connected) {
        // Prompt to connect GitHub after they've done the action
        setTimeout(() => {
          if (confirm('To verify your GitHub action, please connect your GitHub account. Connect now?')) {
            window.location.href = `/api/auth/github?wallet=${encodeURIComponent(address || '')}`;
          }
        }, 1000);
        return;
      }
    }
  };

  // Legacy handler for backwards compatibility
  const handleTaskComplete = (taskId: string) => {
    const task = socialTasks.find(t => t.id === taskId);
    if (task) {
      handleTaskVerify(task);
    }
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;

  const isLoading = claimMutation.isPending;
  const error = claimMutation.error?.message;
  const canClaim = faucetStatus?.can_claim && !isLoading;
  const cooldownActive = faucetStatus && !faucetStatus.can_claim;

  // Get claim amount from on-chain config (primary) or fall back to API
  const getOnChainClaimAmount = () => {
    if (!onChainConfig) return null;
    try {
      // onChainConfig is a tuple: [claim_amount, cooldown_period, sage_token]
      const configArray = onChainConfig as any;
      const claimAmountObj = configArray[0] || configArray.claim_amount;
      let claimValue: bigint;

      if (claimAmountObj && typeof claimAmountObj === 'object' && 'low' in claimAmountObj) {
        claimValue = BigInt(claimAmountObj.low) + (BigInt(claimAmountObj.high || 0) << 128n);
      } else if (typeof claimAmountObj === 'bigint') {
        claimValue = claimAmountObj;
      } else if (typeof claimAmountObj === 'string' || typeof claimAmountObj === 'number') {
        claimValue = BigInt(claimAmountObj);
      } else {
        return null;
      }

      // Format to SAGE with decimals
      const divisor = BigInt(10 ** SAGE_DECIMALS);
      const integerPart = Number(claimValue / divisor);
      const decimalPart = Number((claimValue % divisor) / BigInt(10 ** (SAGE_DECIMALS - 2)));
      return `${integerPart}.${decimalPart.toString().padStart(2, '0')} SAGE`;
    } catch {
      return null;
    }
  };

  const claimAmount = getOnChainClaimAmount() || faucetStatus?.claim_amount_formatted || faucetConfig?.claim_amount_formatted || "20 SAGE";

  // Format faucet balance from on-chain stats
  const formatFaucetBalance = () => {
    if (!onChainStats) return null;
    try {
      // onChainStats is a tuple: [total_distributed, unique_claimants, total_claims, balance]
      // Balance is a u256 = { low, high }
      const statsArray = onChainStats as any;
      const balanceObj = statsArray[3] || statsArray.balance;
      let balanceValue: bigint;

      if (balanceObj && typeof balanceObj === 'object' && 'low' in balanceObj) {
        balanceValue = BigInt(balanceObj.low) + (BigInt(balanceObj.high || 0) << 128n);
      } else if (typeof balanceObj === 'bigint') {
        balanceValue = balanceObj;
      } else {
        return null;
      }

      // Format to SAGE with decimals
      const divisor = BigInt(10 ** SAGE_DECIMALS);
      const integerPart = balanceValue / divisor;
      return Number(integerPart).toLocaleString();
    } catch {
      return null;
    }
  };

  // Format total distributed
  const formatTotalDistributed = () => {
    if (!onChainStats) return null;
    try {
      const statsArray = onChainStats as any;
      const totalObj = statsArray[0] || statsArray.total_distributed;
      let totalValue: bigint;

      if (totalObj && typeof totalObj === 'object' && 'low' in totalObj) {
        totalValue = BigInt(totalObj.low) + (BigInt(totalObj.high || 0) << 128n);
      } else if (typeof totalObj === 'bigint') {
        totalValue = totalObj;
      } else {
        return null;
      }

      const divisor = BigInt(10 ** SAGE_DECIMALS);
      const integerPart = totalValue / divisor;
      return Number(integerPart).toLocaleString();
    } catch {
      return null;
    }
  };

  // Format unique claimants
  const formatUniqueClaimants = () => {
    if (!onChainStats) return null;
    try {
      const statsArray = onChainStats as any;
      const claimantsValue = statsArray[1] || statsArray.unique_claimants;
      return Number(claimantsValue).toLocaleString();
    } catch {
      return null;
    }
  };

  const faucetBalance = formatFaucetBalance();
  const totalDistributed = formatTotalDistributed();
  const uniqueClaimants = formatUniqueClaimants();

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring" }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-emerald-500/20 border border-emerald-500/30 mb-4"
        >
          <Droplets className="w-10 h-10 text-emerald-400" />
        </motion.div>
        <h1 className="text-3xl font-bold text-white">Testnet Faucet</h1>
        <p className="text-gray-400 mt-2">
          Get SAGE tokens for testing on Sepolia. Earn more by joining our community!
        </p>
      </div>

      {/* Faucet Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Droplets className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-gray-400">Faucet Balance</span>
          </div>
          <p className="text-xl font-bold text-white">
            {faucetBalance !== null ? `${faucetBalance} SAGE` : "—"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-gray-400">Total Distributed</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {totalDistributed !== null ? `${totalDistributed} SAGE` : "—"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Users className="w-4 h-4 text-accent-cyan" />
            <span className="text-sm text-gray-400">Unique Claimants</span>
          </div>
          <p className="text-xl font-bold text-white">
            {uniqueClaimants !== null ? uniqueClaimants : "—"}
          </p>
        </motion.div>
      </div>

      {/* Main Faucet Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        {/* Header Banner */}
        <div className="p-6 bg-gradient-to-r from-emerald-600/20 to-accent-purple/20 border-b border-surface-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-surface-card/50">
                <LogoIcon className="text-emerald-400" size={32} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">SAGE Token Faucet</h2>
                <p className="text-sm text-gray-400" suppressHydrationWarning>
                  {network === "devnet" ? "Local Devnet" : "Sepolia"} Testnet
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{claimAmount.replace(" SAGE", "")}</p>
              <p className="text-sm text-gray-400">SAGE per request</p>
              <p className="text-xs text-gray-500 mt-1">
                {faucetConfig?.cooldown_formatted || "24 hours"} cooldown
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Connected Wallet */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Receiving Address</label>
            <div className="flex items-center gap-3 p-4 bg-surface-elevated rounded-xl border border-surface-border">
              <Wallet className="w-5 h-5 text-emerald-400" />
              <code className="text-sm text-white font-mono flex-1 truncate">
                {address ? formatAddress(address) : "Connect wallet to continue"}
              </code>
              {address && (
                <a
                  href={`https://sepolia.starkscan.co/contract/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-emerald-400"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Token Amount & Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
              <div className="flex items-center gap-2 mb-2">
                <LogoIcon className="text-emerald-400" size={20} />
                <span className="text-sm text-gray-400">Claim Amount</span>
              </div>
              <p className="text-2xl font-bold text-white">{claimAmount}</p>
            </div>
            {faucetStatus && (
              <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-gray-400">Total Claimed</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {faucetStatus.total_claimed_formatted || "0 SAGE"}
                </p>
              </div>
            )}

            {/* Add SAGE to Wallet */}
            <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Don't see SAGE in your wallet?</p>
                  <p className="text-xs text-gray-500">Add the token to track your balance</p>
                </div>
                <AddSageButton variant="compact" />
              </div>
            </div>
          </div>

          {/* Cooldown Notice */}
          {cooldownActive && timeRemaining && (
            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-sm font-medium text-orange-400">Cooldown Active</p>
                  <p className="text-sm text-gray-400">
                    Next claim available in: <span className="text-white font-mono">{timeRemaining}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Faucet Disabled Notice */}
          {faucetConfig && !faucetConfig.enabled && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-400">Faucet Disabled</p>
                  <p className="text-sm text-gray-400">
                    The faucet is currently disabled. Please check back later.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Request Button */}
          <button
            onClick={handleOnChainClaim}
            disabled={txPending || !address}
            className="btn-glow w-full py-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {txPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Waiting for Wallet...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Claim {claimAmount}
              </>
            )}
          </button>

          <p className="text-xs text-center text-gray-500">
            Claims directly from the Starknet faucet contract. Small gas fee required.
          </p>

          {/* Success Message */}
          {success && txHash && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-emerald-400">Tokens Sent Successfully!</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {claimAmount} have been sent to your wallet.
                  </p>
                  <a
                    href={`https://sepolia.starkscan.co/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-emerald-400 hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    View transaction <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400">Request Failed</p>
                  <p className="text-sm text-gray-400 mt-1">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Bonus Tasks */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-400" />
            Earn More Tokens
          </h3>
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {socialConnections.github.connected && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full flex items-center gap-1">
                <Github className="w-3 h-3" />
                {socialConnections.github.username}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Complete social tasks to earn bonus SAGE tokens. Connect your accounts to verify.
        </p>

        {/* Task Error */}
        {taskError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
            {taskError}
            <button onClick={() => setTaskError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        <div className="space-y-3">
          {socialTasks.map((task) => {
            const isCompleted = completedTasks.includes(task.id);
            const isVerifying = verifyingTask === task.id;
            const needsGitHub = (task.verifyType === 'github_star' || task.verifyType === 'github_follow') && !socialConnections.github.connected;
            const needsTwitter = task.verifyType === 'twitter_follow' && !socialConnections.twitter.connected;
            const needsDiscord = task.verifyType === 'discord_join' && !socialConnections.discord.connected;

            return (
              <div
                key={task.id}
                className={`flex items-center justify-between p-4 rounded-xl bg-surface-elevated border ${
                  isCompleted ? 'border-emerald-500/30' : 'border-surface-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isCompleted ? "bg-emerald-500/20" : "bg-surface-card"}`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <task.icon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-white">{task.title}</p>
                    <p className="text-sm text-gray-500">{task.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-emerald-400">+{task.reward} SAGE</span>

                  {isCompleted ? (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                      Verified
                    </span>
                  ) : isVerifying ? (
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying
                    </span>
                  ) : needsGitHub ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm py-1.5 px-3"
                      >
                        {task.verifyType === 'github_star' ? 'Star' : 'Follow'}
                      </a>
                      <a
                        href={`/api/auth/github?wallet=${encodeURIComponent(address || '')}`}
                        className="btn-glow text-sm py-1.5 px-3 flex items-center gap-1"
                      >
                        <Github className="w-4 h-4" />
                        Connect
                      </a>
                    </div>
                  ) : needsTwitter || needsDiscord ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm py-1.5 px-3"
                      >
                        {task.verifyType === 'twitter_follow' ? 'Follow' : 'Join'}
                      </a>
                      <span className="text-xs text-gray-500">Verify coming soon</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm py-1.5 px-3"
                      >
                        {task.verifyType === 'github_star' ? 'Star' : task.verifyType === 'github_follow' ? 'Follow' : 'Go'}
                      </a>
                      <button
                        onClick={() => handleTaskVerify(task)}
                        disabled={isVerifying}
                        className="btn-glow text-sm py-1.5 px-3"
                      >
                        Verify
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Claim History */}
      {claimHistory && claimHistory.claims.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              Claim History
            </h3>
            <span className="text-sm text-gray-400">
              Total: {claimHistory.total_claimed_formatted}
            </span>
          </div>
          <div className="space-y-2">
            {claimHistory.claims.map((claim) => (
              <div
                key={claim.id}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-surface-border"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{claim.amount_formatted}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(claim.claimed_at * 1000).toLocaleDateString()} at{" "}
                      {new Date(claim.claimed_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <a
                  href={`https://sepolia.starkscan.co/tx/${claim.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-emerald-400"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <h3 className="font-medium text-white mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            Daily Limit
          </h3>
          <p className="text-sm text-gray-400">
            You can request {claimAmount} once every {faucetConfig?.cooldown_formatted || "24 hours"}.
            Complete social tasks above to earn +10 SAGE each (one-time per wallet).
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5"
        >
          <h3 className="font-medium text-white mb-2 flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            Need More?
          </h3>
          <p className="text-sm text-gray-400">
            Complete the social tasks above to earn +10 SAGE each, or join our{" "}
            <a href={EXTERNAL_LINKS.discord} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">
              Discord
            </a>{" "}
            to request additional testnet tokens for development and testing.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
