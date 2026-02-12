"use client";

/**
 * Proof Generation Progress Component
 *
 * Visual progress indicator for STWO proof generation with phase tracking.
 * Shows detailed breakdown of proof stages with time estimates.
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Lock,
  Cpu,
  Layers,
  Search,
  CheckCircle2,
  Loader2,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Proof generation phases
const PROOF_PHASES = [
  {
    id: "connecting",
    name: "Connecting",
    description: "Connecting to prover network",
    icon: Zap,
    estimatedMs: 500,
  },
  {
    id: "encrypting",
    name: "Encrypting Witness",
    description: "Securing private inputs with TEE encryption",
    icon: Lock,
    estimatedMs: 1000,
  },
  {
    id: "loading",
    name: "Loading Circuit",
    description: "Fetching proving key from CDN",
    icon: Cpu,
    estimatedMs: 2000,
  },
  {
    id: "witness",
    name: "Processing Witness",
    description: "Building execution trace",
    icon: Layers,
    estimatedMs: 1500,
  },
  {
    id: "commit",
    name: "Commitment Phase",
    description: "Computing polynomial commitments",
    icon: Shield,
    estimatedMs: 3000,
  },
  {
    id: "fri",
    name: "FRI Protocol",
    description: "Generating low-degree proof",
    icon: Layers,
    estimatedMs: 5000,
  },
  {
    id: "query",
    name: "Query Phase",
    description: "Sampling verification points",
    icon: Search,
    estimatedMs: 2000,
  },
  {
    id: "finalizing",
    name: "Finalizing",
    description: "Assembling proof data",
    icon: CheckCircle2,
    estimatedMs: 1000,
  },
] as const;

type ProofPhase = (typeof PROOF_PHASES)[number]["id"] | "done";

interface ProofProgressProps {
  /** Current phase of proof generation */
  phase: ProofPhase;
  /** Progress within current phase (0-100) */
  progress: number;
  /** Optional FRI round information */
  friRound?: number;
  friFoldings?: number;
  /** Proof mode (TEE, GPU, WASM) */
  mode?: "tee" | "gpu" | "wasm";
  /** Whether proof generation is complete */
  isComplete?: boolean;
  /** Error message if failed */
  error?: string | null;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function ProofProgress({
  phase,
  progress,
  friRound,
  friFoldings,
  mode = "tee",
  isComplete = false,
  error = null,
  compact = false,
  className,
}: ProofProgressProps) {
  // Calculate overall progress
  const { overallProgress, estimatedTimeRemaining, currentPhaseIndex } =
    useMemo(() => {
      if (isComplete || phase === "done") {
        return { overallProgress: 100, estimatedTimeRemaining: 0, currentPhaseIndex: PROOF_PHASES.length };
      }

      const idx = PROOF_PHASES.findIndex((p) => p.id === phase);
      if (idx === -1) {
        return { overallProgress: 0, estimatedTimeRemaining: 15000, currentPhaseIndex: 0 };
      }

      // Calculate progress across all phases
      const totalPhases = PROOF_PHASES.length;
      const phaseProgress = (idx + progress / 100) / totalPhases;
      const overall = Math.floor(phaseProgress * 100);

      // Estimate remaining time
      const remainingPhases = PROOF_PHASES.slice(idx);
      const currentPhaseRemaining =
        (remainingPhases[0]?.estimatedMs || 0) * (1 - progress / 100);
      const futurePhaseTime = remainingPhases
        .slice(1)
        .reduce((sum, p) => sum + p.estimatedMs, 0);
      const remaining = Math.floor(currentPhaseRemaining + futurePhaseTime);

      return {
        overallProgress: overall,
        estimatedTimeRemaining: remaining,
        currentPhaseIndex: idx,
      };
    }, [phase, progress, isComplete]);

  // Format time remaining
  const timeDisplay = useMemo(() => {
    if (isComplete) return "Complete";
    if (error) return "Failed";

    const seconds = Math.ceil(estimatedTimeRemaining / 1000);
    if (seconds <= 0) return "Finishing...";
    if (seconds < 60) return `~${seconds}s remaining`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes}m remaining`;
  }, [estimatedTimeRemaining, isComplete, error]);

  // Mode badge
  const modeBadge = useMemo(() => {
    switch (mode) {
      case "tee":
        return { label: "TEE", color: "bg-purple-500/20 text-purple-400" };
      case "gpu":
        return { label: "GPU", color: "bg-green-500/20 text-green-400" };
      case "wasm":
        return { label: "WASM", color: "bg-blue-500/20 text-blue-400" };
    }
  }, [mode]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="relative h-2 flex-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              error
                ? "bg-red-500"
                : isComplete
                ? "bg-green-500"
                : "bg-gradient-to-r from-purple-500 to-blue-500"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
          {!isComplete && !error && (
            <motion.div
              className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
              style={{ width: `${overallProgress}%` }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-sm text-gray-400 min-w-[80px] text-right">
          {overallProgress}%
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.02] p-6",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Shield className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {isComplete
                ? "Proof Generated"
                : error
                ? "Proof Failed"
                : "Generating ZK Proof"}
            </h3>
            <p className="text-sm text-gray-400">
              {isComplete
                ? "Your privacy proof is ready"
                : error
                ? error
                : "Proving your transaction privately"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-1 rounded text-xs font-medium",
              modeBadge.color
            )}
          >
            {modeBadge.label}
          </span>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{timeDisplay}</span>
          </div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-400">Overall Progress</span>
          <span className="text-sm font-medium text-white">
            {overallProgress}%
          </span>
        </div>
        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full relative overflow-hidden",
              error
                ? "bg-red-500"
                : isComplete
                ? "bg-green-500"
                : "bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {!isComplete && !error && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.div>
        </div>
      </div>

      {/* Phase Steps */}
      <div className="space-y-1">
        {PROOF_PHASES.map((p, idx) => {
          const isActive = currentPhaseIndex === idx;
          const isCompleted = idx < currentPhaseIndex || isComplete;
          const isFuture = idx > currentPhaseIndex;
          const Icon = p.icon;

          return (
            <motion.div
              key={p.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                isActive && "bg-white/5",
                isCompleted && "opacity-60"
              )}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  isCompleted
                    ? "bg-green-500/20"
                    : isActive
                    ? "bg-purple-500/20"
                    : "bg-white/5"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                ) : (
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isFuture ? "text-gray-600" : "text-gray-400"
                    )}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCompleted
                        ? "text-gray-400"
                        : isActive
                        ? "text-white"
                        : "text-gray-500"
                    )}
                  >
                    {p.name}
                  </span>
                  {isActive && (
                    <span className="text-xs text-purple-400">
                      {progress}%
                    </span>
                  )}
                </div>
                {isActive && (
                  <p className="text-xs text-gray-500 truncate">
                    {p.description}
                    {p.id === "fri" && friRound !== undefined && (
                      <span className="ml-1">
                        (Round {friRound}/{friFoldings || 12})
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Phase progress bar (for active phase) */}
              {isActive && (
                <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-purple-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Success/Error Message */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <span className="text-sm text-green-400">
                Proof verified and ready for submission
              </span>
            </div>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact inline version
export function ProofProgressInline({
  progress,
  phase,
  className,
}: {
  progress: number;
  phase: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
      <span className="text-sm text-gray-400">{phase}</span>
      <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-purple-500 rounded-full"
          animate={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{progress}%</span>
    </div>
  );
}
