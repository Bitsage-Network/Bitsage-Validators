"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "@starknet-react/core";
import {
  Vote,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Users,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Calendar,
  Loader2,
  History,
  MessageSquare,
  Share2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useProposal, useProposalVotes, useVotingPower } from "@/lib/hooks/useApiData";

type VoteType = "for" | "against" | null;

export default function ProposalDetailPage() {
  const params = useParams();
  const proposalId = params.id as string;
  const { address } = useAccount();

  const [userVote, setUserVote] = useState<VoteType>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "votes">("details");

  // Fetch proposal data from API
  const { data: proposalData, isLoading: loadingProposal, isError: proposalError } = useProposal(proposalId);
  const { data: votesData, isLoading: loadingVotes } = useProposalVotes(proposalId);
  const { data: votingPowerData } = useVotingPower(address);

  // Transform API data to component format with fallback
  const proposal = useMemo(() => {
    if (!proposalData) {
      return {
        id: proposalId,
        title: "Loading...",
        description: "",
        proposer: "0x...",
        status: "pending" as const,
        votesFor: 0,
        votesAgainst: 0,
        quorum: 0,
        startTime: Date.now(),
        endTime: Date.now(),
        category: "",
        createdAt: Date.now(),
        txHash: null,
      };
    }
    return {
      id: proposalData.id || proposalId,
      title: proposalData.title || "Untitled Proposal",
      description: proposalData.description || "",
      proposer: proposalData.proposer || "0x...",
      status: (proposalData.status || "pending") as "active" | "passed" | "rejected" | "pending" | "executed",
      votesFor: Number(proposalData.votes_for || 0),
      votesAgainst: Number(proposalData.votes_against || 0),
      quorum: Number(proposalData.quorum || 0),
      startTime: proposalData.start_time ? proposalData.start_time * 1000 : Date.now(),
      endTime: proposalData.end_time ? proposalData.end_time * 1000 : Date.now(),
      category: proposalData.category || "General",
      createdAt: proposalData.created_at ? new Date(proposalData.created_at).getTime() : Date.now(),
      txHash: null, // tx_hash not in Proposal type
    };
  }, [proposalData, proposalId]);

  // Transform votes data
  const votes = useMemo(() => {
    if (!votesData?.votes) return [];
    return votesData.votes.map((vote: any) => ({
      voter: vote.voter || "0x...",
      amount: Number(vote.weight || 0),
      support: vote.support,
      timestamp: vote.voted_at ? new Date(vote.voted_at).getTime() : Date.now(),
    }));
  }, [votesData]);

  // User's voting power
  const userVotingPower = useMemo(() => {
    if (!votingPowerData) return 0;
    const balance = Number(votingPowerData.balance || 0);
    const delegated = Number(votingPowerData.delegated_to_me || 0);
    return balance + delegated;
  }, [votingPowerData]);

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedValue(value);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const handleVote = async (voteType: VoteType) => {
    if (isVoting || userVote) return;
    setIsVoting(true);
    // Simulate vote transaction
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setUserVote(voteType);
    setIsVoting(false);
  };

  const votePercent = useMemo(() => {
    const total = proposal.votesFor + proposal.votesAgainst;
    if (total === 0) return { for: 50, against: 50 };
    return {
      for: Math.round((proposal.votesFor / total) * 100),
      against: Math.round((proposal.votesAgainst / total) * 100),
    };
  }, [proposal]);

  const quorumPercent = Math.min(
    100,
    Math.round(((proposal.votesFor + proposal.votesAgainst) / proposal.quorum) * 100)
  );

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatTimeRemaining = (endTime: number) => {
    const diff = endTime - Date.now();
    if (diff < 0) return "Ended";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const statusConfig = {
    active: { label: "Active", color: "text-brand-400", bg: "bg-brand-500/20" },
    passed: { label: "Passed", color: "text-emerald-400", bg: "bg-emerald-500/20" },
    rejected: { label: "Rejected", color: "text-red-400", bg: "bg-red-500/20" },
    pending: { label: "Pending", color: "text-orange-400", bg: "bg-orange-500/20" },
    executed: { label: "Executed", color: "text-purple-400", bg: "bg-purple-500/20" },
  };

  const status = statusConfig[proposal.status];

  // Loading state
  if (loadingProposal && !proposalData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading proposal...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (proposalError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-gray-400">Failed to load proposal</p>
          <Link href="/governance" className="mt-4 btn-secondary inline-block">
            Back to Governance
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/governance"
          className="p-2 rounded-lg bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={cn("px-3 py-1 rounded-full text-sm font-medium", status.bg, status.color)}>
              {status.label}
            </span>
            <span className="text-sm text-gray-400">Proposal #{proposal.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{proposal.title}</h1>
        </div>
        <button className="p-2 rounded-lg bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors">
          <Share2 className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-surface-card rounded-xl border border-surface-border w-fit">
            <button
              onClick={() => setActiveTab("details")}
              className={cn(
                "px-5 py-2 rounded-lg font-medium transition-all",
                activeTab === "details"
                  ? "bg-brand-600 text-white"
                  : "text-gray-400 hover:text-white"
              )}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab("votes")}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-all",
                activeTab === "votes"
                  ? "bg-brand-600 text-white"
                  : "text-gray-400 hover:text-white"
              )}
            >
              Votes
              <span className="px-2 py-0.5 rounded-full bg-surface-elevated text-xs">
                {loadingVotes ? "..." : votes.length}
              </span>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "details" ? (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-6"
            >
              <div className="prose prose-invert max-w-none">
                {proposal.description.split("\n").map((paragraph, index) => {
                  if (paragraph.startsWith("## ")) {
                    return (
                      <h2 key={index} className="text-lg font-semibold text-white mt-6 mb-3">
                        {paragraph.replace("## ", "")}
                      </h2>
                    );
                  }
                  if (paragraph.startsWith("- ")) {
                    return (
                      <li key={index} className="text-gray-300 ml-4">
                        {paragraph.replace("- ", "")}
                      </li>
                    );
                  }
                  if (paragraph.match(/^\d+\./)) {
                    return (
                      <li key={index} className="text-gray-300 ml-4 list-decimal">
                        {paragraph.replace(/^\d+\.\s*/, "")}
                      </li>
                    );
                  }
                  if (paragraph.trim()) {
                    return (
                      <p key={index} className="text-gray-300 mb-4">
                        {paragraph}
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="votes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card divide-y divide-surface-border"
            >
              {loadingVotes ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
                  <p className="text-gray-400">Loading votes...</p>
                </div>
              ) : votes.length === 0 ? (
                <div className="p-8 text-center">
                  <Vote className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No votes yet</p>
                </div>
              ) : (
                votes.map((vote, index) => (
                  <div key={index} className="p-4 flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      vote.support ? "bg-emerald-500/20" : "bg-red-500/20"
                    )}>
                      {vote.support ? (
                        <ThumbsUp className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ThumbsDown className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white font-mono text-sm">
                          {vote.voter.length > 16 ? `${vote.voter.slice(0, 8)}...${vote.voter.slice(-6)}` : vote.voter}
                        </span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          vote.support ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {vote.support ? "For" : "Against"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        {formatNumber(vote.amount)} SAGE
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">{formatTimeAgo(vote.timestamp)}</span>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* Proposal Info */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-semibold text-white">Proposal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Proposer</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm text-white font-mono">
                    {proposal.proposer.slice(0, 10)}...{proposal.proposer.slice(-8)}
                  </code>
                  <button
                    onClick={() => handleCopy(proposal.proposer)}
                    className="p-1 rounded hover:bg-surface-elevated transition-colors"
                  >
                    {copiedValue === proposal.proposer ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400">Created</p>
                <p className="text-white mt-1">{formatDate(proposal.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Voting Started</p>
                <p className="text-white mt-1">{formatDate(proposal.startTime)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Voting Ends</p>
                <p className="text-white mt-1">{formatDate(proposal.endTime)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Voting Card */}
          <div className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Cast Your Vote</h3>
              <span className={cn(
                "flex items-center gap-1 text-sm",
                proposal.status === "active" ? "text-emerald-400" : "text-gray-400"
              )}>
                <Clock className="w-4 h-4" />
                {formatTimeRemaining(proposal.endTime)}
              </span>
            </div>

            {userVote ? (
              <div className={cn(
                "p-4 rounded-xl border",
                userVote === "for"
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-red-500/10 border-red-500/30"
              )}>
                <div className="flex items-center gap-3">
                  {userVote === "for" ? (
                    <ThumbsUp className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ThumbsDown className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <p className={cn(
                      "font-medium",
                      userVote === "for" ? "text-emerald-400" : "text-red-400"
                    )}>
                      You voted {userVote === "for" ? "For" : "Against"}
                    </p>
                    <p className="text-sm text-gray-400">Your vote has been recorded</p>
                  </div>
                </div>
              </div>
            ) : proposal.status === "active" ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleVote("for")}
                  disabled={isVoting}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                    isVoting
                      ? "bg-gray-700 border-gray-600 cursor-not-allowed"
                      : "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
                  )}
                >
                  {isVoting ? (
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  ) : (
                    <ThumbsUp className="w-6 h-6 text-emerald-400" />
                  )}
                  <span className="font-medium text-emerald-400">Vote For</span>
                </button>
                <button
                  onClick={() => handleVote("against")}
                  disabled={isVoting}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                    isVoting
                      ? "bg-gray-700 border-gray-600 cursor-not-allowed"
                      : "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                  )}
                >
                  {isVoting ? (
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  ) : (
                    <ThumbsDown className="w-6 h-6 text-red-400" />
                  )}
                  <span className="font-medium text-red-400">Vote Against</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
                <p className="text-gray-400 text-center">Voting has ended</p>
              </div>
            )}

            {/* Vote Progress */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-emerald-400">For ({votePercent.for}%)</span>
                  <span className="text-red-400">Against ({votePercent.against}%)</span>
                </div>
                <div className="h-3 rounded-full bg-surface-elevated overflow-hidden flex">
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

              <div className="flex justify-between text-sm">
                <div>
                  <p className="text-gray-400">For</p>
                  <p className="text-white font-medium">{formatNumber(proposal.votesFor)} SAGE</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400">Against</p>
                  <p className="text-white font-medium">{formatNumber(proposal.votesAgainst)} SAGE</p>
                </div>
              </div>
            </div>

            {/* Quorum */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Quorum</span>
                <span className={quorumPercent >= 100 ? "text-emerald-400" : "text-gray-400"}>
                  {quorumPercent}% ({formatNumber(proposal.votesFor + proposal.votesAgainst)} / {formatNumber(proposal.quorum)})
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    quorumPercent >= 100 ? "bg-emerald-500" : "bg-brand-500"
                  )}
                  style={{ width: `${quorumPercent}%` }}
                />
              </div>
              {quorumPercent < 100 && (
                <p className="text-xs text-gray-500 mt-2">
                  {formatNumber(proposal.quorum - (proposal.votesFor + proposal.votesAgainst))} more SAGE needed for quorum
                </p>
              )}
            </div>
          </div>

          {/* Voting Power Info */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">Your Voting Power</p>
                <p className="text-lg font-bold text-brand-400 mt-1">
                  {address ? formatNumber(userVotingPower) : "—"} SAGE
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {address ? "Based on your token balance and delegations" : "Connect wallet to see voting power"}
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-300">
                  Votes are final and cannot be changed once submitted.
                  Make sure to review the proposal carefully before voting.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
