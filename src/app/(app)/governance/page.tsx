"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Vote,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Users,
  Zap,
  AlertCircle,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import { useGovernanceWithWebSocket } from "@/lib/hooks/useApiData";
import type { Proposal as APIProposal } from "@/lib/api/client";
import { buildVoteCall } from "@/lib/contracts";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import {
  useGovernanceContext,
  useVotingPower,
  useHasVoted,
  type OnChainProposal,
  type VoteValidationResult,
} from "@/lib/hooks/useGovernance";

// Proposal status types
type ProposalStatus = "active" | "passed" | "rejected" | "pending" | "executed" | "cancelled";

// Internal proposal interface for display
interface DisplayProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  quorum: number;
  startTime: number;
  endTime: number;
  category: string;
}

// Transform API proposal to display format
function transformProposal(p: APIProposal): DisplayProposal {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    proposer: p.proposer.slice(0, 6) + "..." + p.proposer.slice(-4),
    status: p.status as ProposalStatus,
    votesFor: parseInt(p.votes_for) || 0,
    votesAgainst: parseInt(p.votes_against) || 0,
    quorum: parseInt(p.quorum) || 2000000,
    startTime: p.start_time * 1000, // Convert to ms
    endTime: p.end_time * 1000,
    category: p.category || "General",
  };
}

// Transform on-chain proposal to display format
function transformOnChainProposal(p: OnChainProposal): DisplayProposal {
  const proposalTypeToCategory: Record<string, string> = {
    Treasury: "Economics",
    Upgrade: "Technical",
    Parameter: "Governance",
    Emergency: "General",
  };

  return {
    id: p.id,
    title: p.title || `Proposal #${p.id}`,
    description: p.description || "On-chain proposal",
    proposer: p.proposer ? p.proposer.slice(0, 6) + "..." + p.proposer.slice(-4) : "Unknown",
    status: p.status as ProposalStatus,
    votesFor: Number(p.votesFor / BigInt(1e18)),
    votesAgainst: Number(p.votesAgainst / BigInt(1e18)),
    quorum: 10000, // 10,000 SAGE default quorum
    startTime: p.startTime.getTime(),
    endTime: p.endTime.getTime(),
    category: proposalTypeToCategory[p.proposalType] || "General",
  };
}

// No fallback mock data - show empty state when no proposals exist

const statusConfig: Record<ProposalStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "text-brand-400", bg: "bg-brand-500/20", icon: Vote },
  passed: { label: "Passed", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle },
  pending: { label: "Pending", color: "text-orange-400", bg: "bg-orange-500/20", icon: Clock },
  executed: { label: "Executed", color: "text-purple-400", bg: "bg-purple-500/20", icon: Zap },
  cancelled: { label: "Cancelled", color: "text-gray-400", bg: "bg-gray-500/20", icon: XCircle },
};

const categoryColors: Record<string, string> = {
  Economics: "text-yellow-400 bg-yellow-500/20",
  Privacy: "text-purple-400 bg-purple-500/20",
  Governance: "text-blue-400 bg-blue-500/20",
  Technical: "text-cyan-400 bg-cyan-500/20",
  General: "text-gray-400 bg-gray-500/20",
};

export default function GovernancePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [votingProposal, setVotingProposal] = useState<string | null>(null);
  const [voteType, setVoteType] = useState<'for' | 'against' | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  // State for tracking real-time vote updates from WebSocket
  const [liveVoteUpdates, setLiveVoteUpdates] = useState<Map<string, { for: number; against: number }>>(new Map());

  // Get connected wallet
  const { address } = useAccount();

  // Fetch user's voting power from contract
  const { data: userVotingPower, isLoading: votingPowerLoading } = useVotingPower(address);

  // Check if user has voted on the currently selected proposal
  const { hasVoted, isLoading: hasVotedLoading } = useHasVoted(votingProposal || undefined, address);

  // Transaction hook for voting
  const { send: sendVote, isPending: isVotePending } = useSendTransaction({
    calls: votingProposal && voteType
      ? [buildVoteCall(votingProposal, voteType === 'for')]
      : undefined,
  });

  // Validate if user can vote on a proposal
  const canVoteOnProposal = (proposal: DisplayProposal): VoteValidationResult => {
    if (!address) {
      return { canVote: false, reason: 'Connect wallet to vote', isLoading: false };
    }
    if (votingPowerLoading) {
      return { canVote: false, reason: null, isLoading: true };
    }
    if (!userVotingPower || userVotingPower.power === 0n) {
      return { canVote: false, reason: 'No voting power', isLoading: false };
    }
    if (proposal.status !== 'active') {
      return { canVote: false, reason: 'Voting ended', isLoading: false };
    }
    const now = Date.now();
    if (now < proposal.startTime) {
      return { canVote: false, reason: 'Not started', isLoading: false };
    }
    if (now > proposal.endTime) {
      return { canVote: false, reason: 'Ended', isLoading: false };
    }
    return { canVote: true, reason: null, isLoading: false };
  };

  // Handle vote submission with validation
  const handleVote = async (proposalId: string, support: boolean, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent link navigation
    e.stopPropagation();
    setVoteError(null);

    // Check 1: Wallet connected
    if (!address) {
      setVoteError("Please connect your wallet to vote");
      return;
    }

    // Check 2: Voting power exists
    if (!userVotingPower || userVotingPower.power === 0n) {
      setVoteError("You have no voting power. Stake SAGE tokens to vote.");
      return;
    }

    // Set voting state before checking hasVoted (triggers the hook)
    setVotingProposal(proposalId);
    setVoteType(support ? 'for' : 'against');

    // Note: hasVoted check happens via the hook, checked below before send
    // For immediate feedback, we'll proceed and let the contract reject if already voted

    // Build and send the vote transaction
    const voteCall = buildVoteCall(proposalId, support);
    sendVote([voteCall]);
  };

  // Fetch on-chain governance data (primary source)
  const {
    proposals: onChainProposals,
    votingPower: onChainVotingPower,
    isLoading: onChainLoading,
    refetch: refetchOnChain,
  } = useGovernanceContext();

  // Fetch data from API with real-time WebSocket updates (secondary source)
  const {
    proposals: apiProposals,
    stats: statsData,
    votingPower: votingPowerData,
    isLoading: dataLoading,
    isError: proposalsError,
    wsConnected,
    lastWsMessage,
  } = useGovernanceWithWebSocket(address);

  // Process real-time vote updates from WebSocket
  useEffect(() => {
    if (lastWsMessage?.type === 'vote_cast' && lastWsMessage.data) {
      const { proposal_id, support, weight } = lastWsMessage.data;

      if (proposal_id && weight !== undefined) {
        setLiveVoteUpdates(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(proposal_id) || { for: 0, against: 0 };
          const power = Number(weight) / 1e18; // Convert from wei

          newMap.set(proposal_id, {
            for: current.for + (support ? power : 0),
            against: current.against + (!support ? power : 0),
          });

          return newMap;
        });
      }
    }
  }, [lastWsMessage]);

  // Filter by status client-side since we're using combined hook
  const proposalsData = useMemo(() => {
    if (statusFilter === "all") return apiProposals;
    return apiProposals.filter(p => p.status === statusFilter);
  }, [apiProposals, statusFilter]);

  const proposalsLoading = dataLoading || onChainLoading;
  const statsLoading = dataLoading || onChainLoading;

  // Transform proposals: prioritize on-chain, then API, then fallback
  const { proposals, isUsingFallback, dataSource } = useMemo(() => {
    // Priority 1: On-chain proposals
    if (onChainProposals && onChainProposals.length > 0) {
      return {
        proposals: onChainProposals.map(transformOnChainProposal),
        isUsingFallback: false,
        dataSource: 'on-chain' as const,
      };
    }

    // Priority 2: API proposals
    if (proposalsData && proposalsData.length > 0) {
      return {
        proposals: proposalsData.map(transformProposal),
        isUsingFallback: false,
        dataSource: 'api' as const,
      };
    }

    // No fallback to mock data - show empty state when no proposals exist
    return {
      proposals: [],
      isUsingFallback: false,
      dataSource: dataLoading || onChainLoading ? 'loading' as const : 'empty' as const,
    };
  }, [onChainProposals, proposalsData, proposalsError, dataLoading, onChainLoading]);

  // Filter proposals by search
  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      const matchesSearch =
        proposal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proposal.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || proposal.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [proposals, searchQuery, statusFilter]);

  // Stats from on-chain, API, or computed from proposals
  const stats = useMemo(() => {
    // Use on-chain voting power if available
    const votingPowerDisplay = onChainVotingPower?.powerFormatted
      ? `${onChainVotingPower.powerFormatted} SAGE`
      : votingPowerData?.total_voting_power
        ? formatSageAmount(votingPowerData.total_voting_power)
        : "Connect Wallet";

    if (statsData) {
      return {
        totalProposals: statsData.total_proposals,
        activeProposals: statsData.active_proposals,
        passedProposals: statsData.passed_proposals,
        totalVotingPower: votingPowerDisplay,
      };
    }
    // Fallback to computed stats
    return {
      totalProposals: proposals.length,
      activeProposals: proposals.filter((p) => p.status === "active").length,
      passedProposals: proposals.filter((p) => p.status === "passed" || p.status === "executed").length,
      totalVotingPower: votingPowerDisplay,
    };
  }, [statsData, proposals, votingPowerData, onChainVotingPower]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatSageAmount = (wei: string) => {
    const sage = Number(wei) / 1e18;
    if (sage >= 1000000) return `${(sage / 1000000).toFixed(1)}M SAGE`;
    if (sage >= 1000) return `${(sage / 1000).toFixed(1)}K SAGE`;
    return `${sage.toFixed(2)} SAGE`;
  };

  const formatTimeRemaining = (endTime: number) => {
    const diff = endTime - Date.now();
    if (diff < 0) return "Ended";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getVotePercentage = (votesFor: number, votesAgainst: number) => {
    const total = votesFor + votesAgainst;
    if (total === 0) return { for: 50, against: 50 };
    return {
      for: Math.round((votesFor / total) * 100),
      against: Math.round((votesAgainst / total) * 100),
    };
  };

  const isLoading = proposalsLoading || statsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Vote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Governance</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-gray-400 text-sm">
                  Vote on proposals and shape the future of BitSage
                </p>
                {/* WebSocket connection indicator */}
                <div className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                  wsConnected
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-gray-500/20 text-gray-400"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    wsConnected ? "bg-emerald-400 animate-pulse" : "bg-gray-400"
                  )} />
                  {wsConnected ? "Live" : "Offline"}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/governance/create"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-brand-500/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Proposal
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
              <Vote className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Proposals</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : stats.totalProposals}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Active Now</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : stats.activeProposals}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Passed</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : stats.passedProposals}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Your Voting Power</p>
              <p className="text-lg font-bold text-white truncate">
                {stats.totalVotingPower}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search proposals..."
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-surface-card border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface-card border border-surface-border text-white hover:border-brand-500/50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            {statusFilter === "all" ? "All Status" : statusConfig[statusFilter]?.label || statusFilter}
            <ChevronDown className={cn("w-4 h-4 transition-transform", isFilterOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden"
              >
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setIsFilterOpen(false);
                  }}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-surface-elevated transition-colors",
                    statusFilter === "all" ? "text-brand-400" : "text-white"
                  )}
                >
                  All Status
                </button>
                {(Object.keys(statusConfig) as ProposalStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setStatusFilter(status);
                      setIsFilterOpen(false);
                    }}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-surface-elevated transition-colors flex items-center gap-2",
                      statusFilter === status ? "text-brand-400" : "text-white"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", statusConfig[status].bg)} />
                    {statusConfig[status].label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Loading State */}
      {proposalsLoading && (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
        </div>
      )}

      {/* Data Source Indicator */}
      {!proposalsLoading && dataSource === 'on-chain' && (
        <div className="glass-card p-3 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium">On-Chain Data</span>
            <span className="text-xs text-emerald-400/70">
              Proposals loaded directly from GOVERNANCE_TREASURY contract
            </span>
          </div>
        </div>
      )}

      {/* Fallback Data Indicator */}
      {isUsingFallback && !proposalsLoading && (
        <div className="glass-card p-4 border-orange-500/30 bg-orange-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">
                {proposalsError
                  ? "Unable to load live proposals - showing cached examples"
                  : "No proposals found on-chain - showing examples"
                }
              </span>
            </div>
            <button
              onClick={() => {
                refetchOnChain();
                window.location.reload();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Proposals List */}
      {!proposalsLoading && (
        <div className="space-y-4">
          {filteredProposals.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Vote className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              {dataSource === 'empty' && proposals.length === 0 ? (
                <>
                  <p className="text-white font-medium mb-2">No Proposals Yet</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Be the first to create a governance proposal for the SAGE network.
                  </p>
                  <Link
                    href="/governance/create"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Proposal
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-gray-400">No proposals match your filters</p>
                  <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters</p>
                </>
              )}
            </div>
          ) : (
            filteredProposals.map((proposal, index) => {
              const status = statusConfig[proposal.status] || statusConfig.pending;
              const StatusIcon = status.icon;

              // Get live vote updates for this proposal
              const liveUpdate = liveVoteUpdates.get(proposal.id);
              const totalVotesFor = proposal.votesFor + (liveUpdate?.for || 0);
              const totalVotesAgainst = proposal.votesAgainst + (liveUpdate?.against || 0);

              const votePercent = getVotePercentage(totalVotesFor, totalVotesAgainst);
              const quorumPercent = Math.min(100, Math.round(((totalVotesFor + totalVotesAgainst) / proposal.quorum) * 100));

              return (
                <motion.div
                  key={proposal.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link href={`/governance/${proposal.id}`}>
                    <div className="glass-card p-6 hover:border-brand-500/50 transition-all cursor-pointer">
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3 mb-3">
                            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", status.bg, status.color)}>
                              <StatusIcon className="w-3 h-3 inline mr-1" />
                              {status.label}
                            </span>
                            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", categoryColors[proposal.category] || "text-gray-400 bg-gray-500/20")}>
                              {proposal.category}
                            </span>
                          </div>

                          <h3 className="text-lg font-semibold text-white mb-2 line-clamp-1">
                            {proposal.title}
                          </h3>
                          <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                            {proposal.description}
                          </p>

                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>Proposed by {proposal.proposer}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeRemaining(proposal.endTime)}
                            </span>
                          </div>
                        </div>

                        {/* Vote Stats */}
                        <div className="lg:w-64 space-y-3">
                          {/* Vote Bar */}
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-emerald-400">For {votePercent.for}%</span>
                              <span className="text-red-400">Against {votePercent.against}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-surface-elevated overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${votePercent.for}%` }}
                              />
                              <div
                                className="h-full bg-red-500"
                                style={{ width: `${votePercent.against}%` }}
                              />
                            </div>
                          </div>

                          {/* Quorum */}
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-400">Quorum</span>
                              <span className={quorumPercent >= 100 ? "text-emerald-400" : "text-gray-400"}>
                                {quorumPercent}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                              <div
                                className={cn(
                                  "h-full",
                                  quorumPercent >= 100 ? "bg-emerald-500" : "bg-brand-500"
                                )}
                                style={{ width: `${quorumPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Vote Counts - includes live updates */}
                          <div className="flex gap-4 text-xs">
                            <span className="text-gray-400">
                              <span className={cn(
                                "font-medium",
                                liveUpdate?.for ? "text-emerald-300 animate-pulse" : "text-emerald-400"
                              )}>
                                {formatNumber(totalVotesFor)}
                              </span> For
                            </span>
                            <span className="text-gray-400">
                              <span className={cn(
                                "font-medium",
                                liveUpdate?.against ? "text-red-300 animate-pulse" : "text-red-400"
                              )}>
                                {formatNumber(totalVotesAgainst)}
                              </span> Against
                            </span>
                          </div>

                          {/* Vote Buttons - Only for active proposals */}
                          {proposal.status === "active" && (() => {
                            const voteValidation = canVoteOnProposal(proposal);
                            const isVoting = isVotePending && votingProposal === proposal.id;
                            const isDisabled = isVoting || !voteValidation.canVote;

                            return (
                              <div className="space-y-2 pt-2">
                                {/* Validation message */}
                                {!voteValidation.canVote && voteValidation.reason && (
                                  <div className="flex items-center gap-1.5 text-xs text-orange-400">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>{voteValidation.reason}</span>
                                  </div>
                                )}

                                {/* Vote buttons */}
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => handleVote(proposal.id, true, e)}
                                    disabled={isDisabled}
                                    title={!voteValidation.canVote ? voteValidation.reason || undefined : undefined}
                                    className={cn(
                                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                      voteValidation.canVote
                                        ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                                        : "bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed",
                                      isVoting && voteType === 'for' && "opacity-70"
                                    )}
                                  >
                                    {isVoting && voteType === 'for' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ThumbsUp className="w-3.5 h-3.5" />
                                    )}
                                    Vote For
                                  </button>
                                  <button
                                    onClick={(e) => handleVote(proposal.id, false, e)}
                                    disabled={isDisabled}
                                    title={!voteValidation.canVote ? voteValidation.reason || undefined : undefined}
                                    className={cn(
                                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                                      voteValidation.canVote
                                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                                        : "bg-gray-500/10 text-gray-500 border border-gray-500/20 cursor-not-allowed",
                                      isVoting && voteType === 'against' && "opacity-70"
                                    )}
                                  >
                                    {isVoting && voteType === 'against' ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ThumbsDown className="w-3.5 h-3.5" />
                                    )}
                                    Vote Against
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Arrow */}
                        <div className="hidden lg:flex items-center">
                          <ArrowRight className="w-5 h-5 text-gray-500" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Info Banner with User's Voting Power */}
      <div className="glass-card p-4">
        <div className="flex items-start gap-3">
          <Vote className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm text-gray-300">
                  <strong className="text-white">Your Voting Power:</strong>{" "}
                  {votingPowerLoading ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : userVotingPower ? (
                    <span className={cn(
                      "font-semibold",
                      userVotingPower.power > 0n ? "text-brand-400" : "text-gray-500"
                    )}>
                      {userVotingPower.powerFormatted} SAGE
                    </span>
                  ) : (
                    <span className="text-gray-500">Connect wallet to view</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Voting power is determined by your staked SAGE tokens.
                  {userVotingPower?.power === 0n && address && (
                    <Link href="/stake" className="text-brand-400 hover:underline ml-1">
                      Stake tokens to vote →
                    </Link>
                  )}
                </p>
              </div>
              {address && (
                <Link
                  href="/stake"
                  className="text-xs px-3 py-1.5 bg-brand-500/20 text-brand-400 rounded-lg hover:bg-brand-500/30 transition-colors"
                >
                  Manage Stake
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
