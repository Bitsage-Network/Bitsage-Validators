"use client";

/**
 * Proof Generation Phase Visualizer
 *
 * Visual representation of STWO proof generation phases:
 * - Loading: Circuit and proving key loading
 * - Witness: Witness computation/preparation
 * - Commit: Polynomial commitment generation
 * - FRI: Fast Reed-Solomon Interactive Oracle Proofs
 * - Query: Query phase and proof finalization
 * - Done: Proof complete and verified
 *
 * Features:
 * - Animated phase transitions
 * - Time estimates per phase
 * - Detailed phase descriptions
 * - Error handling with recovery hints
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  FileCode,
  Calculator,
  Layers,
  Zap,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  Cpu,
  Shield,
  Terminal,
} from "lucide-react";

// ============================================
// Types
// ============================================

type ProofPhase = "idle" | "loading" | "witness" | "commit" | "fri" | "query" | "done" | "error";
type ProofMode = "client_wasm" | "worker_gpu" | "tee_assisted";
type CircuitType = "PRIVACY_WITHDRAW" | "PRIVACY_TRANSFER" | "AI_INFERENCE" | "GENERIC_COMPUTE" | "RANGE_PROOF" | "MERKLE_MEMBERSHIP";

interface PhaseInfo {
  phase: ProofPhase;
  label: string;
  description: string;
  icon: React.ElementType;
  estimatedMs: number;
  color: string;
}

interface ProofProgress {
  phase: ProofPhase;
  progress: number;
  phaseProgress: number;
  estimatedTimeMs: number;
  elapsedMs: number;
  circuitType?: CircuitType;
  mode?: ProofMode;
  error?: string;
  metadata?: {
    constraintCount?: number;
    witnessSize?: number;
    commitmentCount?: number;
    friLayers?: number;
    queryCount?: number;
  };
}

interface ProofPhaseVisualizerProps {
  progress: ProofProgress;
  showDetails?: boolean;
  compact?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
}

// ============================================
// Constants
// ============================================

const PHASES: PhaseInfo[] = [
  {
    phase: "loading",
    label: "Loading",
    description: "Loading circuit definition and proving keys from CDN cache",
    icon: FileCode,
    estimatedMs: 2000,
    color: "blue",
  },
  {
    phase: "witness",
    label: "Witness",
    description: "Computing witness values from inputs and secret data",
    icon: Calculator,
    estimatedMs: 1500,
    color: "purple",
  },
  {
    phase: "commit",
    label: "Commitment",
    description: "Generating polynomial commitments using Circle STARKs",
    icon: Layers,
    estimatedMs: 3000,
    color: "cyan",
  },
  {
    phase: "fri",
    label: "FRI",
    description: "Fast Reed-Solomon Interactive Oracle Proof computation",
    icon: Zap,
    estimatedMs: 4000,
    color: "yellow",
  },
  {
    phase: "query",
    label: "Query",
    description: "Generating query responses and finalizing proof",
    icon: Search,
    estimatedMs: 1500,
    color: "green",
  },
];

const MODE_INFO: Record<ProofMode, { label: string; icon: React.ElementType; color: string }> = {
  client_wasm: { label: "Browser WASM", icon: Terminal, color: "cyan" },
  worker_gpu: { label: "GPU Worker", icon: Cpu, color: "blue" },
  tee_assisted: { label: "TEE Enclave", icon: Shield, color: "purple" },
};

const CIRCUIT_INFO: Record<CircuitType, { label: string; avgTime: number }> = {
  PRIVACY_WITHDRAW: { label: "Privacy Withdraw", avgTime: 12000 },
  PRIVACY_TRANSFER: { label: "Private Transfer", avgTime: 15000 },
  AI_INFERENCE: { label: "AI Inference", avgTime: 8000 },
  GENERIC_COMPUTE: { label: "Generic Compute", avgTime: 10000 },
  RANGE_PROOF: { label: "Range Proof", avgTime: 5000 },
  MERKLE_MEMBERSHIP: { label: "Merkle Proof", avgTime: 6000 },
};

// ============================================
// Utility Functions
// ============================================

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function getPhaseIndex(phase: ProofPhase): number {
  const index = PHASES.findIndex((p) => p.phase === phase);
  return index >= 0 ? index : -1;
}

function getOverallProgress(phase: ProofPhase, phaseProgress: number): number {
  const phaseIndex = getPhaseIndex(phase);
  if (phaseIndex < 0) return phase === "done" ? 100 : 0;

  const phaseWeight = 100 / PHASES.length;
  return phaseIndex * phaseWeight + (phaseProgress / 100) * phaseWeight;
}

// ============================================
// Subcomponents
// ============================================

function PhaseIndicator({
  phaseInfo,
  status,
  isCurrent,
  progress,
}: {
  phaseInfo: PhaseInfo;
  status: "pending" | "active" | "completed" | "error";
  isCurrent: boolean;
  progress: number;
}) {
  const Icon = phaseInfo.icon;

  const statusClasses = {
    pending: "bg-gray-800 border-gray-700 text-gray-500",
    active: `bg-${phaseInfo.color}-500/20 border-${phaseInfo.color}-500/50 text-${phaseInfo.color}-400`,
    completed: "bg-green-500/20 border-green-500/50 text-green-400",
    error: "bg-red-500/20 border-red-500/50 text-red-400",
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${statusClasses[status]}`}
      >
        {status === "active" && (
          <svg
            className="absolute inset-0 w-full h-full -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${progress} 100`}
              className="opacity-50"
            />
          </svg>
        )}
        {status === "active" ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : status === "completed" ? (
          <CheckCircle className="w-5 h-5" />
        ) : status === "error" ? (
          <XCircle className="w-5 h-5" />
        ) : (
          <Icon className="w-5 h-5" />
        )}
      </div>
      <span
        className={`text-xs mt-1.5 transition-colors ${
          isCurrent ? "text-white font-medium" : "text-gray-500"
        }`}
      >
        {phaseInfo.label}
      </span>
    </div>
  );
}

function PhaseConnector({
  status,
}: {
  status: "pending" | "active" | "completed";
}) {
  return (
    <div className="flex-1 h-0.5 mx-2 relative overflow-hidden">
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          status === "completed"
            ? "bg-green-500/50"
            : status === "active"
              ? "bg-gradient-to-r from-blue-500/50 to-gray-700"
              : "bg-gray-700"
        }`}
      />
      {status === "active" && (
        <div className="absolute inset-0 bg-blue-500/50 animate-pulse" />
      )}
    </div>
  );
}

function PhaseDetails({
  phaseInfo,
  progress,
  metadata,
}: {
  phaseInfo: PhaseInfo;
  progress: ProofProgress;
  metadata?: ProofProgress["metadata"];
}) {
  const details: { label: string; value: string }[] = [];

  switch (phaseInfo.phase) {
    case "loading":
      details.push({ label: "Circuit", value: progress.circuitType || "Unknown" });
      if (metadata?.constraintCount) {
        details.push({ label: "Constraints", value: metadata.constraintCount.toLocaleString() });
      }
      break;
    case "witness":
      if (metadata?.witnessSize) {
        details.push({ label: "Witness Size", value: `${metadata.witnessSize.toLocaleString()} elements` });
      }
      break;
    case "commit":
      if (metadata?.commitmentCount) {
        details.push({ label: "Commitments", value: metadata.commitmentCount.toString() });
      }
      break;
    case "fri":
      if (metadata?.friLayers) {
        details.push({ label: "FRI Layers", value: metadata.friLayers.toString() });
      }
      break;
    case "query":
      if (metadata?.queryCount) {
        details.push({ label: "Queries", value: metadata.queryCount.toString() });
      }
      break;
  }

  if (details.length === 0) return null;

  return (
    <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Phase Details</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {details.map(({ label, value }) => (
          <div key={label} className="text-sm">
            <span className="text-gray-500">{label}:</span>{" "}
            <span className="text-gray-300">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorDisplay({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  const errorHints: Record<string, string> = {
    "out of memory": "Try reducing batch size or closing other applications",
    timeout: "Network may be congested. Retry with longer timeout.",
    "invalid witness": "Input data may be incorrect. Verify your inputs.",
    "tee attestation": "TEE enclave verification failed. Try a different worker.",
    "circuit not found": "Circuit not available. Check if proving keys are loaded.",
  };

  const hint = Object.entries(errorHints).find(([key]) =>
    error.toLowerCase().includes(key)
  )?.[1];

  return (
    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-red-400">Proof Generation Failed</h4>
          <p className="text-sm text-gray-400 mt-1">{error}</p>
          {hint && (
            <p className="text-sm text-gray-500 mt-2">
              <span className="text-gray-400">Hint:</span> {hint}
            </p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-sm text-red-400 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Proof Generation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactView({
  progress,
  currentPhase,
}: {
  progress: ProofProgress;
  currentPhase: PhaseInfo | null;
}) {
  const overallProgress = getOverallProgress(progress.phase, progress.phaseProgress);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentPhase ? (
            <>
              <currentPhase.icon className={`w-4 h-4 text-${currentPhase.color}-400`} />
              <span className="text-sm text-gray-300">{currentPhase.label}</span>
            </>
          ) : progress.phase === "done" ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Complete</span>
            </>
          ) : progress.phase === "error" ? (
            <>
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-400">Failed</span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Idle</span>
            </>
          )}
        </div>
        <span className="text-sm text-gray-400">
          {progress.phase === "done" ? (
            formatTime(progress.elapsedMs)
          ) : progress.estimatedTimeMs > 0 ? (
            `~${formatTime(progress.estimatedTimeMs - progress.elapsedMs)} remaining`
          ) : null}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            progress.phase === "error"
              ? "bg-red-500"
              : progress.phase === "done"
                ? "bg-green-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${overallProgress}%` }}
        />
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ProofPhaseVisualizer({
  progress,
  showDetails = true,
  compact = false,
  onRetry,
  onCancel,
  className = "",
}: ProofPhaseVisualizerProps) {
  const [expanded, setExpanded] = useState(false);

  const currentPhaseIndex = getPhaseIndex(progress.phase);
  const currentPhaseInfo = PHASES[currentPhaseIndex] ?? null;
  const overallProgress = getOverallProgress(progress.phase, progress.phaseProgress);

  const modeInfo = progress.mode ? MODE_INFO[progress.mode] : null;
  const circuitInfo = progress.circuitType ? CIRCUIT_INFO[progress.circuitType] : null;

  if (compact) {
    return (
      <div className={className}>
        <CompactView progress={progress} currentPhase={currentPhaseInfo} />
      </div>
    );
  }

  return (
    <div
      className={`p-4 bg-gray-900/50 border border-gray-800 rounded-xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Proof Generation</h3>
          {modeInfo && (
            <div
              className={`flex items-center gap-1.5 px-2 py-1 bg-${modeInfo.color}-500/20 border border-${modeInfo.color}-500/30 rounded-lg`}
            >
              <modeInfo.icon className={`w-3.5 h-3.5 text-${modeInfo.color}-400`} />
              <span className={`text-xs text-${modeInfo.color}-400`}>
                {modeInfo.label}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {progress.phase !== "idle" && progress.phase !== "done" && progress.phase !== "error" && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4" />
              <span>{formatTime(progress.elapsedMs)}</span>
              {progress.estimatedTimeMs > 0 && (
                <span className="text-gray-500">
                  / ~{formatTime(progress.estimatedTimeMs)}
                </span>
              )}
            </div>
          )}

          {showDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Circuit Info */}
      {circuitInfo && (
        <div className="mb-4 p-2 bg-gray-800/50 rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-400">Circuit: {circuitInfo.label}</span>
          <span className="text-sm text-gray-500">
            Avg time: {formatTime(circuitInfo.avgTime)}
          </span>
        </div>
      )}

      {/* Phase Timeline */}
      <div className="flex items-center justify-between mb-4">
        {PHASES.map((phaseInfo, index) => {
          let status: "pending" | "active" | "completed" | "error";
          if (progress.phase === "error" && index === currentPhaseIndex) {
            status = "error";
          } else if (index < currentPhaseIndex || progress.phase === "done") {
            status = "completed";
          } else if (index === currentPhaseIndex) {
            status = "active";
          } else {
            status = "pending";
          }

          return (
            <React.Fragment key={phaseInfo.phase}>
              <PhaseIndicator
                phaseInfo={phaseInfo}
                status={status}
                isCurrent={index === currentPhaseIndex}
                progress={index === currentPhaseIndex ? progress.phaseProgress : 0}
              />
              {index < PHASES.length - 1 && (
                <PhaseConnector
                  status={
                    index < currentPhaseIndex || progress.phase === "done"
                      ? "completed"
                      : index === currentPhaseIndex
                        ? "active"
                        : "pending"
                  }
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">Overall Progress</span>
          <span className="text-gray-300">{Math.round(overallProgress)}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              progress.phase === "error"
                ? "bg-red-500"
                : progress.phase === "done"
                  ? "bg-green-500"
                  : "bg-gradient-to-r from-blue-500 to-purple-500"
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Error Display */}
      {progress.phase === "error" && progress.error && (
        <ErrorDisplay error={progress.error} onRetry={onRetry} />
      )}

      {/* Done State */}
      {progress.phase === "done" && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <h4 className="text-sm font-medium text-green-400">
                Proof Generated Successfully
              </h4>
              <p className="text-sm text-gray-400 mt-0.5">
                Completed in {formatTime(progress.elapsedMs)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {expanded && currentPhaseInfo && progress.phase !== "done" && progress.phase !== "error" && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-start gap-3">
            <currentPhaseInfo.icon
              className={`w-5 h-5 text-${currentPhaseInfo.color}-400 mt-0.5`}
            />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-white">{currentPhaseInfo.label}</h4>
              <p className="text-sm text-gray-400 mt-1">{currentPhaseInfo.description}</p>
              <PhaseDetails
                phaseInfo={currentPhaseInfo}
                progress={progress}
                metadata={progress.metadata}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {onCancel && progress.phase !== "idle" && progress.phase !== "done" && progress.phase !== "error" && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <button
            onClick={onCancel}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            Cancel proof generation
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Hook for Managing Proof Progress
// ============================================

export function useProofProgress() {
  const [progress, setProgress] = useState<ProofProgress>({
    phase: "idle",
    progress: 0,
    phaseProgress: 0,
    estimatedTimeMs: 0,
    elapsedMs: 0,
  });

  const startProof = useCallback(
    (circuitType: CircuitType, mode: ProofMode) => {
      const circuitInfo = CIRCUIT_INFO[circuitType];
      setProgress({
        phase: "loading",
        progress: 0,
        phaseProgress: 0,
        estimatedTimeMs: circuitInfo?.avgTime ?? 10000,
        elapsedMs: 0,
        circuitType,
        mode,
      });
    },
    []
  );

  const updatePhase = useCallback(
    (phase: ProofPhase, phaseProgress: number = 0, metadata?: ProofProgress["metadata"]) => {
      setProgress((prev) => ({
        ...prev,
        phase,
        phaseProgress,
        progress: getOverallProgress(phase, phaseProgress),
        metadata: { ...prev.metadata, ...metadata },
      }));
    },
    []
  );

  const setError = useCallback((error: string) => {
    setProgress((prev) => ({
      ...prev,
      phase: "error",
      error,
    }));
  }, []);

  const complete = useCallback((elapsedMs: number) => {
    setProgress((prev) => ({
      ...prev,
      phase: "done",
      progress: 100,
      phaseProgress: 100,
      elapsedMs,
    }));
  }, []);

  const reset = useCallback(() => {
    setProgress({
      phase: "idle",
      progress: 0,
      phaseProgress: 0,
      estimatedTimeMs: 0,
      elapsedMs: 0,
    });
  }, []);

  return {
    progress,
    startProof,
    updatePhase,
    setError,
    complete,
    reset,
  };
}

export type { ProofPhase, ProofMode, CircuitType, ProofProgress };
