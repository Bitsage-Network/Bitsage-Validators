"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Copy,
  Check,
  Activity,
  Zap,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  FileJson,
  Timer,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAccount } from "@starknet-react/core";
import { useProofsPageData, useEarningsSummary } from "@/lib/hooks/useApiData";
import { useRealtimeProofVerifications } from "@/lib/providers/WebSocketProvider";
import {
  CIRCUIT_REGISTRY,
  getCircuit,
  getCircuitColor,
  getCircuitIcon,
  formatFriParams,
  type CircuitId,
  type CircuitDefinition,
} from "@/lib/proofs/circuitRegistry";
import type { LiveProof, HistoricalProof, ProofPhase } from "@/types/proofs";

// Tab configuration
type TabType = "live" | "history";

// Proof status configuration
const proofStatusConfig: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: typeof CheckCircle2;
}> = {
  verified: {
    label: "Verified",
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    color: "text-orange-400",
    bg: "bg-orange-500/20",
    icon: Clock,
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    bg: "bg-red-500/20",
    icon: XCircle,
  },
  generating: {
    label: "Generating",
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    icon: Activity,
  },
};

// Circuit type configuration - derived from registry with fallback for legacy types
const circuitTypeConfig: Record<string, {
  label: string;
  color: string;
  description: string;
  friParams?: string;
  securityBits?: number;
  estimatedTimeMs?: number;
  proofSizeBytes?: number;
  mode?: string;
}> = {
  // Map from registry
  ...Object.fromEntries(
    Object.values(CIRCUIT_REGISTRY).map((circuit) => [
      circuit.id,
      {
        label: circuit.name,
        color: getCircuitColor(circuit.id).text,
        description: circuit.description,
        friParams: formatFriParams(circuit.friParams),
        securityBits: circuit.securityBits,
        estimatedTimeMs: circuit.estimatedTimeMs,
        proofSizeBytes: circuit.proofSizeBytes,
        mode: circuit.recommendedMode,
      },
    ])
  ),
  // Legacy mappings for backwards compatibility
  stwo_fibonacci: {
    label: "STWO Fibonacci",
    color: "text-purple-400",
    description: "Fibonacci sequence proof",
    securityBits: 128,
  },
  stwo_ml_inference: {
    label: "ML Inference",
    color: "text-cyan-400",
    description: "Machine learning verification",
    securityBits: 128,
  },
  stwo_etl: {
    label: "ETL Pipeline",
    color: "text-orange-400",
    description: "Data transformation proof",
    securityBits: 128,
  },
  tee_attestation: {
    label: "TEE Attestation",
    color: "text-emerald-400",
    description: "Trusted execution proof",
    securityBits: 128,
  },
};

// Phase names for STWO proof generation
const PROOF_PHASES = [
  { name: "Trace Generation", key: "trace" },
  { name: "Trace Commitment", key: "commit" },
  { name: "Constraint Evaluation", key: "constraints" },
  { name: "Composition Commitment", key: "composition" },
  { name: "FRI Protocol", key: "fri" },
  { name: "Query Phase", key: "query" },
];

export default function ProofsPage() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>("live");
  const [expandedProof, setExpandedProof] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  // Fetch proofs data from database
  const {
    proofs: dbProofs,
    total: totalProofs,
    stats,
    isLoading,
    isError,
    refetch
  } = useProofsPageData({
    limit: 50,
  });

  // Fetch earnings summary to get total rewards
  const { data: earningsSummary } = useEarningsSummary(address);

  // WebSocket for real-time proof verification updates
  const { latestProofVerified, verifications: realtimeVerifications } = useRealtimeProofVerifications();

  // Refetch when new proof is verified via WebSocket
  useEffect(() => {
    if (latestProofVerified) {
      refetch();
    }
  }, [latestProofVerified, refetch]);

  // Auto-refresh polling for live updates
  useEffect(() => {
    if (!isAutoRefresh) return;

    const interval = setInterval(() => {
      refetch();
    }, 5000); // Poll every 5 seconds when auto-refresh is enabled

    return () => clearInterval(interval);
  }, [isAutoRefresh, refetch]);

  // Separate proofs into live (pending/in-progress) and historical (verified/failed)
  const { liveProofs, historicalProofs } = useMemo(() => {
    if (!dbProofs || dbProofs.length === 0) {
      return { liveProofs: [], historicalProofs: [] };
    }

    const live = dbProofs
      .filter((proof) => proof.is_valid === null) // Pending verification
      .map((proof) => ({
        id: proof.id,
        jobId: proof.job_id,
        circuitType: proof.circuit_type || "generic_compute",
        gpu: proof.worker_id ? `Worker ${proof.worker_id.slice(0, 8)}` : "GPU Worker",
        startedAt: null, // Not available from DB
        estimatedDuration: null, // Not available
        progress: null, // Indeterminate - no fake progress
        currentPhase: "Verifying",
        phases: PROOF_PHASES.map((phase, idx) => ({
          name: phase.name,
          // Show verification phase as in_progress, rest as pending
          status: idx === PROOF_PHASES.length - 1 ? "in_progress" : "pending",
          duration: "—",
        })),
        stats: {
          constraintCount: proof.proof_size_bytes ? `${(proof.proof_size_bytes / 1024).toFixed(1)}KB` : "—",
          traceLength: "—",
          fieldSize: "M31 (ext: QM31)",
          memoryUsed: "—",
          gpuUtilization: null, // Not available
        },
      }));

    // Calculate estimated reward per proof from earnings
    let estimatedReward = "0.00";
    if (earningsSummary && stats?.verified_proofs) {
      const totalValue = parseFloat(earningsSummary.total_earnings || "0") / 1e18;
      const proofCount = stats.verified_proofs || 1;
      estimatedReward = (totalValue / proofCount).toFixed(2);
    }

    const historical = dbProofs
      .filter((proof) => proof.is_valid !== null)
      .map((proof) => ({
        id: proof.id,
        jobId: proof.job_id,
        circuitType: proof.circuit_type || "generic_compute",
        proofType: proof.proof_type || "STWO",
        status: proof.is_valid ? "verified" : "failed",
        gpu: proof.worker_id ? `Worker ${proof.worker_id.slice(0, 8)}` : "GPU Worker",
        generatedAt: proof.verified_at ? new Date(proof.verified_at).getTime() : Date.now(),
        duration: proof.verification_time_ms ? formatDurationFromMs(proof.verification_time_ms) : "—",
        durationMs: proof.verification_time_ms || 0,
        generationTimeMs: proof.generation_time_ms || 0,
        verifiedOnChain: proof.is_valid || false,
        txHash: proof.tx_hash || null,
        proofHash: proof.proof_hash,
        proofSize: proof.proof_size_bytes ? formatBytes(proof.proof_size_bytes) : null,
        proofSizeBytes: proof.proof_size_bytes || 0,
        securityBits: proof.security_bits || 128,
        stats: {
          constraintCount: proof.proof_size_bytes ? estimateConstraints(proof.proof_size_bytes) : "—",
          traceLength: proof.generation_time_ms ? estimateTraceLength(proof.generation_time_ms) : "—",
          fieldSize: "M31 (ext: QM31)",
          securityBits: proof.security_bits || 128,
        },
        client: proof.verifier_address ? `${proof.verifier_address.slice(0, 6)}...${proof.verifier_address.slice(-4)}` : "—",
        reward: proof.is_valid ? estimatedReward : "0.00",
        errorMessage: null,
      }));

    return { liveProofs: live, historicalProofs: historical };
  }, [dbProofs, earningsSummary, stats]);

  // Format earnings to readable format
  const formatRewards = (amount: string | undefined): string => {
    if (!amount) return "0.00";
    const value = parseFloat(amount) / 1e18; // Convert from wei
    return value >= 1000 ? `${(value / 1000).toFixed(2)}k` : value.toFixed(2);
  };

  // Calculate rewards per proof (estimate based on total earnings / verified proofs)
  const rewardPerProof = useMemo(() => {
    if (!earningsSummary || !stats?.verified_proofs) return "0.00";
    const totalValue = parseFloat(earningsSummary.total_earnings || "0") / 1e18;
    const proofCount = stats.verified_proofs || 1;
    const perProof = totalValue / proofCount;
    return perProof.toFixed(2);
  }, [earningsSummary, stats]);

  // Map database stats to UI format
  const proofAnalytics = useMemo(() => {
    const totalRewards = earningsSummary ? formatRewards(earningsSummary.total_earnings) : "0.00";

    if (stats) {
      return {
        totalProofs: stats.total_proofs || 0,
        verifiedProofs: stats.verified_proofs || 0,
        avgDuration: Math.round((stats.avg_verification_time_ms || 0) / 1000),
        totalRewards,
      };
    }
    return {
      totalProofs: totalProofs || 0,
      verifiedProofs: historicalProofs.filter((p: HistoricalProof) => p.status === "verified").length,
      avgDuration: 0,
      totalRewards,
    };
  }, [stats, totalProofs, historicalProofs, earningsSummary]);

  // Alias for compatibility
  const jobsLoading = isLoading;
  const jobsError = isError;
  const analyticsLoading = isLoading;
  const refetchJobs = refetch;

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const downloadProof = async (proofId: string) => {
    // In production, this would fetch the actual proof from the API
    try {
      const response = await fetch(`/api/proofs/${proofId}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${proofId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to download proof:", error);
    }
  };

  // Loading state
  if (jobsLoading && !dbProofs) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading proofs...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (jobsError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <p className="text-gray-400">Failed to load proofs</p>
          <button
            onClick={() => refetchJobs()}
            className="mt-4 btn-secondary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proofs & Validation</h1>
          <p className="text-gray-400 mt-1">Monitor STWO proof generation and verification</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className={cn(
              "btn-secondary flex items-center gap-2",
              isAutoRefresh && "bg-emerald-600/20 border-emerald-500/50"
            )}
          >
            {isAutoRefresh ? (
              <>
                <Pause className="w-4 h-4" />
                Auto-refresh ON
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Auto-refresh OFF
              </>
            )}
          </button>
          <button
            onClick={() => refetchJobs()}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", jobsLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Shield className="w-4 h-4" />
            Total Proofs
          </div>
          <p className="text-2xl font-bold text-white">
            {analyticsLoading ? "—" : proofAnalytics.totalProofs}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <CheckCircle2 className="w-4 h-4" />
            Verified
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {analyticsLoading ? "—" : proofAnalytics.verifiedProofs}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Timer className="w-4 h-4" />
            Avg Generation
          </div>
          <p className="text-2xl font-bold text-white">
            {analyticsLoading ? "—" : `${Math.floor(proofAnalytics.avgDuration / 60)}m ${proofAnalytics.avgDuration % 60}s`}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Zap className="w-4 h-4" />
            Proof Rewards
          </div>
          <p className="text-2xl font-bold text-white">
            {analyticsLoading ? "—" : proofAnalytics.totalRewards} <span className="text-sm text-gray-400">SAGE</span>
          </p>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
            activeTab === "live"
              ? "bg-emerald-600 text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white"
          )}
        >
          <Activity className={cn("w-4 h-4", activeTab === "live" && liveProofs.length > 0 && "animate-pulse")} />
          Live ({liveProofs.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2",
            activeTab === "history"
              ? "bg-emerald-600 text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white"
          )}
        >
          <Clock className="w-4 h-4" />
          History ({historicalProofs.length})
        </button>
      </div>

      {/* Live Proofs Tab */}
      <AnimatePresence mode="wait">
        {activeTab === "live" && (
          <motion.div
            key="live"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {liveProofs.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No proofs currently generating</p>
                <p className="text-sm text-gray-500 mt-1">New proofs will appear here when jobs start</p>
              </div>
            ) : (
              liveProofs.map((proof: LiveProof, idx: number) => {
                const circuitType = proof.circuitType || proof.proofType || "generic_compute";
                const circuitConfig = circuitTypeConfig[circuitType] || circuitTypeConfig.generic_compute;
                const proofStartedAt = proof.startedAt || Date.now();
                const proofEstimatedDuration = proof.estimatedDuration || 60000;
                const elapsed = Date.now() - proofStartedAt;
                const remaining = Math.max(0, proofEstimatedDuration - elapsed);
                const proofProgress = proof.progress ?? null;
                const proofPhases = proof.phases || [];
                const proofStats = proof.stats || {};

                return (
                  <motion.div
                    key={proof.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="glass-card overflow-hidden"
                  >
                    {/* Header */}
                    <div className="p-4 border-b border-surface-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 flex items-center justify-center">
                              <Shield className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Activity className="w-2.5 h-2.5 text-white animate-pulse" />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/proofs/${proof.id}`}
                                className="text-white font-mono font-medium hover:text-emerald-400 transition-colors"
                              >
                                {proof.id}
                              </Link>
                              <span className={cn("text-xs px-2 py-0.5 rounded-full", circuitConfig.color, "bg-white/5")}>
                                {circuitConfig.label}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mt-0.5">
                              Job: {proof.jobId} • {proof.gpu}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Link
                            href={`/proofs/${proof.id}`}
                            className="text-2xl font-bold text-white hover:text-emerald-400 transition-colors"
                          >
                            {proofProgress !== null ? `${Math.round(proofProgress)}%` : "—"}
                          </Link>
                          <p className="text-sm text-gray-400">
                            {proofProgress !== null && remaining > 0
                              ? `~${formatDuration(remaining)} remaining`
                              : "In progress"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-4 py-3 bg-surface-elevated/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Current Phase: <span className="text-white">{proof.currentPhase}</span></span>
                        <span className="text-sm text-gray-500">
                          {proofStartedAt ? `Started ${formatTimeAgo(proofStartedAt)}` : "Awaiting verification"}
                        </span>
                      </div>
                      <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                        {proofProgress !== null ? (
                          <motion.div
                            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${proofProgress}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        ) : (
                          <motion.div
                            className="h-full w-1/3 bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                            animate={{ x: ["0%", "200%", "0%"] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Phases */}
                    <div className="p-4 border-t border-surface-border/50">
                      <p className="text-sm font-medium text-gray-400 mb-3">Proof Generation Phases</p>
                      <div className="flex items-center gap-2">
                        {proofPhases.map((phase, i: number) => (
                          <div key={phase.name} className="flex items-center">
                            <div className="flex flex-col items-center">
                              <div
                                className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                                  phase.status === "completed" && "bg-emerald-500/20 text-emerald-400",
                                  phase.status === "in_progress" && "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50",
                                  phase.status === "pending" && "bg-surface-elevated text-gray-500"
                                )}
                              >
                                {phase.status === "completed" ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : phase.status === "in_progress" ? (
                                  <Activity className="w-4 h-4 animate-pulse" />
                                ) : (
                                  i + 1
                                )}
                              </div>
                              <span className={cn(
                                "text-xs mt-1 max-w-[80px] text-center truncate",
                                phase.status === "in_progress" ? "text-emerald-400" : "text-gray-500"
                              )}>
                                {phase.name}
                              </span>
                              <span className="text-xs text-gray-600">{phase.duration}</span>
                            </div>
                            {i < proofPhases.length - 1 && (
                              <div
                                className={cn(
                                  "h-0.5 w-8 mx-1 mt-[-20px]",
                                  phase.status === "completed" ? "bg-emerald-500/50" : "bg-surface-border"
                                )}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="p-4 bg-surface-elevated/30 border-t border-surface-border/50">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Constraints</p>
                          <p className="text-white font-mono">{proofStats.constraintCount || "—"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Trace Length</p>
                          <p className="text-white font-mono">{proofStats.traceLength || "—"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Field</p>
                          <p className="text-white font-mono">{proofStats.fieldSize || "—"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Memory</p>
                          <p className="text-white font-mono">{proofStats.memoryUsed || "—"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">GPU Usage</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${proofStats.gpuUtilization || 0}%` }}
                              />
                            </div>
                            <span className="text-white font-mono text-xs">{proofStats.gpuUtilization || 0}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card overflow-hidden"
          >
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-surface-border text-sm font-medium text-gray-400 bg-surface-elevated/50">
              <div className="col-span-2">Proof ID</div>
              <div className="col-span-2">Circuit Type</div>
              <div className="col-span-2">GPU</div>
              <div className="col-span-1">Duration</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Reward</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Proof Rows */}
            <div className="divide-y divide-surface-border/50">
              {historicalProofs.length === 0 ? (
                <div className="p-12 text-center">
                  <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No proof history yet</p>
                  <p className="text-sm text-gray-500 mt-1">Completed proofs will appear here</p>
                </div>
              ) : (
                historicalProofs.map((proof: HistoricalProof, idx: number) => {
                  const proofId = proof.id || proof.proofId || proof.jobId || "";
                  const jobId = proof.jobId || proof.id || proofId;
                  const proofTxHash = proof.txHash || proof.tx_hash || "";
                  const circuitType = proof.circuitType || proof.proofType || "generic_compute";
                  const proofSize = proof.proofSize || proof.proof_size || "—";
                  const proofClient = proof.client || proof.clientId || "—";
                  const securityBits = proof.securityBits || proof.security_bits || "128";
                  const generationTimeMs = proof.generationTimeMs || proof.durationMs || 0;
                  const generatedAt = proof.generatedAt || proof.submittedAt || Date.now();
                  const proofStats = proof.stats || {};
                  const statusConf = proofStatusConfig[proof.status];
                  const circuitConf = circuitTypeConfig[circuitType] || circuitTypeConfig.generic_compute;
                  const StatusIcon = statusConf?.icon || Clock;
                  const isExpanded = expandedProof === proofId;

                  return (
                    <motion.div
                      key={proofId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      {/* Main Row */}
                      <div
                        className={cn(
                          "grid grid-cols-12 gap-4 p-4 items-center cursor-pointer transition-colors",
                          isExpanded ? "bg-surface-elevated" : "hover:bg-surface-elevated/50"
                        )}
                        onClick={() => setExpandedProof(isExpanded ? null : proofId)}
                      >
                        <div className="col-span-2 flex items-center gap-2">
                          <Shield className={cn("w-4 h-4", statusConf?.color)} />
                          <Link
                            href={`/proofs/${proofId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-white font-mono hover:text-emerald-400 transition-colors"
                          >
                            {proofId.length > 16 ? `${proofId.slice(0, 16)}...` : proofId}
                          </Link>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>

                        <div className="col-span-2">
                          <span className={cn("text-sm", circuitConf.color)}>{circuitConf.label}</span>
                        </div>

                        <div className="col-span-2 text-gray-300 text-sm">
                          {proof.gpu}
                        </div>

                        <div className="col-span-1 text-gray-300 text-sm">
                          {proof.duration}
                        </div>

                        <div className="col-span-2 flex items-center gap-2">
                          <span className={cn(
                            "badge flex items-center gap-1",
                            statusConf?.bg,
                            statusConf?.color
                          )}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConf?.label}
                          </span>
                          {proof.verifiedOnChain && (
                            <span className="text-xs text-emerald-400">On-chain</span>
                          )}
                        </div>

                        <div className="col-span-2">
                          {proof.reward !== "0.00" ? (
                            <span className="text-emerald-400 font-medium">+{proof.reward} SAGE</span>
                          ) : (
                            <span className="text-red-400">0.00 SAGE</span>
                          )}
                        </div>

                        <div className="col-span-1 flex items-center gap-2 justify-end">
                          {proof.txHash && (
                            <a
                              href={`https://sepolia.starkscan.co/tx/${proof.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {proof.status === "verified" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadProof(proofId);
                              }}
                              className="text-gray-400 hover:text-white"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-2 bg-surface-elevated/50 border-t border-surface-border/50">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Job ID */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Job ID</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {jobId}
                                  </code>
                                </div>

                                {/* Tx Hash */}
                                {proofTxHash && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
                                    <div className="flex items-center gap-2">
                                      <code className="text-xs text-gray-300 font-mono truncate max-w-[150px]">
                                        {proofTxHash.slice(0, 18)}...
                                      </code>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(proofTxHash, `tx-${proofId}`);
                                        }}
                                        className="text-gray-500 hover:text-white"
                                      >
                                        {copiedHash === `tx-${proofId}` ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Proof Size */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Proof Size</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {proofSize}
                                  </code>
                                </div>

                                {/* Client */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Client</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {proofClient}
                                  </code>
                                </div>

                                {/* Constraints */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Constraints</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {proofStats.constraintCount || "—"}
                                  </code>
                                </div>

                                {/* Trace Length */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Trace Length</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {proofStats.traceLength || "—"}
                                  </code>
                                </div>

                                {/* Field Size */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Field</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {proofStats.fieldSize || "—"}
                                  </code>
                                </div>

                                {/* Security Bits */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Security</p>
                                  <code className="text-xs text-gray-300 font-mono">
                                    {securityBits} bits
                                  </code>
                                </div>

                                {/* FRI Parameters */}
                                {circuitConf.friParams && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">FRI Params</p>
                                    <code className="text-xs text-emerald-400 font-mono">
                                      {circuitConf.friParams}
                                    </code>
                                  </div>
                                )}

                                {/* Proof Mode */}
                                {circuitConf.mode && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Mode</p>
                                    <span className={cn(
                                      "text-xs px-2 py-0.5 rounded-full font-medium",
                                      circuitConf.mode === 'gpu_worker' && "bg-purple-500/20 text-purple-400",
                                      circuitConf.mode === 'tee_assisted' && "bg-emerald-500/20 text-emerald-400",
                                      circuitConf.mode === 'client_wasm' && "bg-cyan-500/20 text-cyan-400"
                                    )}>
                                      {circuitConf.mode === 'gpu_worker' ? 'GPU Worker' :
                                       circuitConf.mode === 'tee_assisted' ? 'TEE Assisted' : 'Client WASM'}
                                    </span>
                                  </div>
                                )}

                                {/* Generation Time */}
                                {generationTimeMs > 0 && (
                                  <div>
                                    <p className="text-xs text-gray-500 mb-1">Generation Time</p>
                                    <code className="text-xs text-gray-300 font-mono">
                                      {formatDurationFromMs(generationTimeMs)}
                                    </code>
                                  </div>
                                )}

                                {/* Proof Type */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Proof System</p>
                                  <code className="text-xs text-purple-400 font-mono">
                                    {proof.proofType || "STARK"}
                                  </code>
                                </div>

                                {/* Generated At */}
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">Generated</p>
                                  <p className="text-xs text-gray-300">
                                    {new Date(generatedAt).toLocaleString()} ({formatTimeAgo(generatedAt)})
                                  </p>
                                </div>

                                {/* Error Message (if failed) */}
                                {proof.status === "failed" && proof.errorMessage && (
                                  <div className="col-span-2">
                                    <p className="text-xs text-gray-500 mb-1">Error</p>
                                    <p className="text-xs text-red-400">
                                      {proof.errorMessage}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2 mt-4 pt-4 border-t border-surface-border/50">
                                <Link
                                  href={`/proofs/${proof.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="btn-primary text-sm flex items-center gap-2"
                                >
                                  <Eye className="w-4 h-4" />
                                  View Full Details
                                </Link>
                                {proof.status === "verified" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadProof(proofId);
                                    }}
                                    className="btn-secondary text-sm flex items-center gap-2"
                                  >
                                    <FileJson className="w-4 h-4" />
                                    Download JSON
                                  </button>
                                )}
                                {proofTxHash && (
                                  <a
                                    href={`https://sepolia.starkscan.co/tx/${proofTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary text-sm flex items-center gap-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Starkscan
                                  </a>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper function to format duration from milliseconds
function formatDurationFromMs(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

// Helper function to format bytes to human readable
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

// Estimate constraint count from proof size (rough approximation)
function estimateConstraints(proofSizeBytes: number): string {
  if (!proofSizeBytes) return "—";
  // STWO proofs: roughly 1 constraint per 4 bytes (approximation)
  const estimated = Math.floor(proofSizeBytes / 4);
  if (estimated >= 1_000_000) return `~${(estimated / 1_000_000).toFixed(1)}M`;
  if (estimated >= 1_000) return `~${(estimated / 1_000).toFixed(1)}K`;
  return `~${estimated}`;
}

// Estimate trace length from generation time (rough approximation)
function estimateTraceLength(generationTimeMs: number): string {
  if (!generationTimeMs) return "—";
  // Rough approximation: 1ms per 1000 trace elements
  const estimated = generationTimeMs * 1000;
  if (estimated >= 1_000_000_000) return `2^${Math.floor(Math.log2(estimated))}`;
  if (estimated >= 1_000_000) return `~${(estimated / 1_000_000).toFixed(1)}M`;
  if (estimated >= 1_000) return `~${(estimated / 1_000).toFixed(1)}K`;
  return `~${estimated}`;
}
