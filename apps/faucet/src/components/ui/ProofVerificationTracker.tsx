"use client";

/**
 * Proof Verification Status Tracker
 *
 * Tracks the lifecycle of ZK proofs from generation to on-chain verification.
 * Provides visual feedback for each stage of the verification process.
 */

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Zap,
  FileCheck,
  Server,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Verification stages
type VerificationStage =
  | "generated"
  | "submitted"
  | "pending"
  | "verifying"
  | "verified"
  | "rejected"
  | "expired";

interface ProofRecord {
  id: string;
  type: "withdraw" | "transfer" | "swap" | "compute";
  circuitType: string;
  stage: VerificationStage;
  createdAt: number;
  submittedAt?: number;
  verifiedAt?: number;
  txHash?: string;
  proofHash: string;
  nullifier?: string;
  error?: string;
  attempts: number;
  explorerUrl?: string;
}

interface ProofVerificationTrackerProps {
  proofs: ProofRecord[];
  onRetry?: (proofId: string) => void;
  onDismiss?: (proofId: string) => void;
  explorerBaseUrl?: string;
  compact?: boolean;
  className?: string;
}

export function ProofVerificationTracker({
  proofs,
  onRetry,
  onDismiss,
  explorerBaseUrl = "https://sepolia.starkscan.co/tx/",
  compact = false,
  className,
}: ProofVerificationTrackerProps) {
  // Group proofs by status
  const { pending, verified, failed } = useMemo(() => {
    return proofs.reduce(
      (acc, proof) => {
        if (proof.stage === "verified") {
          acc.verified.push(proof);
        } else if (proof.stage === "rejected" || proof.stage === "expired") {
          acc.failed.push(proof);
        } else {
          acc.pending.push(proof);
        }
        return acc;
      },
      { pending: [] as ProofRecord[], verified: [] as ProofRecord[], failed: [] as ProofRecord[] }
    );
  }, [proofs]);

  if (proofs.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {pending.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
            <Loader2 className="h-3.5 w-3.5 text-yellow-400 animate-spin" />
            <span className="text-xs font-medium text-yellow-400">
              {pending.length} pending
            </span>
          </div>
        )}
        {verified.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-medium text-green-400">
              {verified.length} verified
            </span>
          </div>
        )}
        {failed.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
            <XCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">
              {failed.length} failed
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Pending Proofs */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Verification ({pending.length})
          </h4>
          <div className="space-y-2">
            {pending.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                onRetry={onRetry}
                onDismiss={onDismiss}
                explorerBaseUrl={explorerBaseUrl}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Verified */}
      {verified.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            Recently Verified ({verified.length})
          </h4>
          <div className="space-y-2">
            {verified.slice(0, 3).map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                onDismiss={onDismiss}
                explorerBaseUrl={explorerBaseUrl}
              />
            ))}
          </div>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Failed ({failed.length})
          </h4>
          <div className="space-y-2">
            {failed.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                onRetry={onRetry}
                onDismiss={onDismiss}
                explorerBaseUrl={explorerBaseUrl}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Proof Card
 */
interface ProofCardProps {
  proof: ProofRecord;
  onRetry?: (proofId: string) => void;
  onDismiss?: (proofId: string) => void;
  explorerBaseUrl: string;
}

function ProofCard({ proof, onRetry, onDismiss, explorerBaseUrl }: ProofCardProps) {
  const stageConfig = getStageConfig(proof.stage);
  const Icon = stageConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "p-4 rounded-xl border transition-all",
        stageConfig.bgColor,
        stageConfig.borderColor
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", stageConfig.iconBg)}>
            {stageConfig.isAnimated ? (
              <Icon className={cn("h-5 w-5", stageConfig.iconColor, "animate-spin")} />
            ) : (
              <Icon className={cn("h-5 w-5", stageConfig.iconColor)} />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white capitalize">
                {proof.type} Proof
              </span>
              <span className="text-xs text-gray-500 font-mono">
                {proof.proofHash.slice(0, 8)}...
              </span>
            </div>

            <p className={cn("text-sm", stageConfig.textColor)}>
              {stageConfig.label}
              {proof.error && (
                <span className="block text-xs text-red-400 mt-1">
                  {proof.error}
                </span>
              )}
            </p>

            {/* Progress bar for pending stages */}
            {(proof.stage === "pending" || proof.stage === "verifying") && (
              <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                  animate={{ width: ["0%", "100%"] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </div>
            )}

            {/* Stage timeline */}
            <ProofTimeline proof={proof} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Explorer link */}
          {proof.txHash && (
            <a
              href={`${explorerBaseUrl}${proof.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="View on explorer"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </a>
          )}

          {/* Retry button */}
          {(proof.stage === "rejected" || proof.stage === "expired") && onRetry && (
            <button
              onClick={() => onRetry(proof.id)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="Retry"
            >
              <RefreshCw className="h-4 w-4 text-gray-400" />
            </button>
          )}

          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={() => onDismiss(proof.id)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              title="Dismiss"
            >
              <XCircle className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Proof Timeline Component
 */
function ProofTimeline({ proof }: { proof: ProofRecord }) {
  const stages: { key: VerificationStage; label: string; icon: React.ElementType }[] = [
    { key: "generated", label: "Generated", icon: FileCheck },
    { key: "submitted", label: "Submitted", icon: Zap },
    { key: "pending", label: "Pending", icon: Clock },
    { key: "verifying", label: "Verifying", icon: Server },
    { key: "verified", label: "Verified", icon: CheckCircle2 },
  ];

  const currentIndex = stages.findIndex(s => s.key === proof.stage);

  return (
    <div className="flex items-center gap-1 mt-2">
      {stages.map((stage, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFuture = idx > currentIndex;
        const Icon = stage.icon;

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                isCompleted && "bg-green-500/20",
                isCurrent && "bg-purple-500/20",
                isFuture && "bg-white/5"
              )}
              title={stage.label}
            >
              <Icon
                className={cn(
                  "h-3 w-3",
                  isCompleted && "text-green-400",
                  isCurrent && "text-purple-400",
                  isFuture && "text-gray-600"
                )}
              />
            </div>
            {idx < stages.length - 1 && (
              <div
                className={cn(
                  "w-4 h-0.5",
                  isCompleted ? "bg-green-500/50" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Stage configuration helper
 */
function getStageConfig(stage: VerificationStage) {
  switch (stage) {
    case "generated":
      return {
        icon: FileCheck,
        label: "Proof generated, awaiting submission",
        iconColor: "text-blue-400",
        iconBg: "bg-blue-500/20",
        bgColor: "bg-blue-500/5",
        borderColor: "border-blue-500/20",
        textColor: "text-blue-300",
        isAnimated: false,
      };
    case "submitted":
      return {
        icon: Zap,
        label: "Transaction submitted",
        iconColor: "text-yellow-400",
        iconBg: "bg-yellow-500/20",
        bgColor: "bg-yellow-500/5",
        borderColor: "border-yellow-500/20",
        textColor: "text-yellow-300",
        isAnimated: false,
      };
    case "pending":
      return {
        icon: Loader2,
        label: "Awaiting on-chain confirmation",
        iconColor: "text-yellow-400",
        iconBg: "bg-yellow-500/20",
        bgColor: "bg-yellow-500/5",
        borderColor: "border-yellow-500/20",
        textColor: "text-yellow-300",
        isAnimated: true,
      };
    case "verifying":
      return {
        icon: Loader2,
        label: "Verifier contract checking proof",
        iconColor: "text-purple-400",
        iconBg: "bg-purple-500/20",
        bgColor: "bg-purple-500/5",
        borderColor: "border-purple-500/20",
        textColor: "text-purple-300",
        isAnimated: true,
      };
    case "verified":
      return {
        icon: CheckCircle2,
        label: "Proof verified on-chain",
        iconColor: "text-green-400",
        iconBg: "bg-green-500/20",
        bgColor: "bg-green-500/5",
        borderColor: "border-green-500/20",
        textColor: "text-green-300",
        isAnimated: false,
      };
    case "rejected":
      return {
        icon: XCircle,
        label: "Proof rejected by verifier",
        iconColor: "text-red-400",
        iconBg: "bg-red-500/20",
        bgColor: "bg-red-500/5",
        borderColor: "border-red-500/20",
        textColor: "text-red-300",
        isAnimated: false,
      };
    case "expired":
      return {
        icon: Clock,
        label: "Proof expired",
        iconColor: "text-gray-400",
        iconBg: "bg-gray-500/20",
        bgColor: "bg-gray-500/5",
        borderColor: "border-gray-500/20",
        textColor: "text-gray-300",
        isAnimated: false,
      };
    default:
      return {
        icon: Shield,
        label: "Unknown status",
        iconColor: "text-gray-400",
        iconBg: "bg-gray-500/20",
        bgColor: "bg-gray-500/5",
        borderColor: "border-gray-500/20",
        textColor: "text-gray-300",
        isAnimated: false,
      };
  }
}

/**
 * Hook for managing proof verification state
 */
export function useProofVerificationState() {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);

  const addProof = (proof: Omit<ProofRecord, "id" | "createdAt" | "attempts">) => {
    const newProof: ProofRecord = {
      ...proof,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      attempts: 0,
    };
    setProofs(prev => [newProof, ...prev]);
    return newProof.id;
  };

  const updateProofStage = (proofId: string, stage: VerificationStage, extra?: Partial<ProofRecord>) => {
    setProofs(prev =>
      prev.map(p =>
        p.id === proofId
          ? {
              ...p,
              stage,
              ...extra,
              ...(stage === "submitted" ? { submittedAt: Date.now() } : {}),
              ...(stage === "verified" ? { verifiedAt: Date.now() } : {}),
            }
          : p
      )
    );
  };

  const retryProof = (proofId: string) => {
    setProofs(prev =>
      prev.map(p =>
        p.id === proofId
          ? { ...p, stage: "generated" as VerificationStage, attempts: p.attempts + 1, error: undefined }
          : p
      )
    );
  };

  const dismissProof = (proofId: string) => {
    setProofs(prev => prev.filter(p => p.id !== proofId));
  };

  const clearVerified = () => {
    setProofs(prev => prev.filter(p => p.stage !== "verified"));
  };

  return {
    proofs,
    addProof,
    updateProofStage,
    retryProof,
    dismissProof,
    clearVerified,
  };
}

/**
 * Proof Status Badge - Compact inline indicator
 */
interface ProofStatusBadgeProps {
  stage: VerificationStage;
  className?: string;
}

export function ProofStatusBadge({ stage, className }: ProofStatusBadgeProps) {
  const config = getStageConfig(stage);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        config.bgColor,
        config.borderColor,
        "border",
        className
      )}
    >
      {config.isAnimated ? (
        <Icon className={cn("h-3 w-3", config.iconColor, "animate-spin")} />
      ) : (
        <Icon className={cn("h-3 w-3", config.iconColor)} />
      )}
      <span className={config.textColor}>{stage}</span>
    </div>
  );
}
