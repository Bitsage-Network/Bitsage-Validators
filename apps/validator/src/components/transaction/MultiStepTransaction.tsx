"use client";

/**
 * Multi-Step Transaction Progress Component
 *
 * Handles complex transactions with multiple steps:
 * - Step-by-step progress visualization
 * - Individual step status tracking
 * - Error recovery for failed steps
 * - Transaction hash display
 * - Automatic step progression
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Check,
  X,
  Loader2,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Wallet,
} from "lucide-react";

// ============================================
// Types
// ============================================

type StepStatus = "pending" | "active" | "signing" | "confirming" | "completed" | "failed" | "skipped";

interface TransactionStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  txHash?: string;
  error?: string;
  optional?: boolean;
  estimatedTime?: number;
  metadata?: Record<string, unknown>;
}

interface MultiStepTransactionProps {
  steps: TransactionStep[];
  currentStep: number;
  title?: string;
  description?: string;
  onRetry?: (stepId: string) => void;
  onSkip?: (stepId: string) => void;
  onComplete?: () => void;
  onCancel?: () => void;
  explorerBaseUrl?: string;
  showTimeline?: boolean;
  compact?: boolean;
  className?: string;
}

interface UseMultiStepTransactionOptions {
  steps: Array<{
    id: string;
    label: string;
    description: string;
    execute: () => Promise<string>; // Returns txHash
    optional?: boolean;
    estimatedTime?: number;
  }>;
  onComplete?: () => void;
  onError?: (stepId: string, error: Error) => void;
  autoAdvance?: boolean;
}

// ============================================
// Constants
// ============================================

const STATUS_CONFIG: Record<
  StepStatus,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  pending: {
    icon: Clock,
    color: "text-gray-400",
    bgColor: "bg-gray-800",
    borderColor: "border-gray-700",
    label: "Pending",
  },
  active: {
    icon: ArrowRight,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/50",
    label: "Ready",
  },
  signing: {
    icon: Wallet,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500/50",
    label: "Sign in wallet",
  },
  confirming: {
    icon: Loader2,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/50",
    label: "Confirming",
  },
  completed: {
    icon: Check,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500/50",
    label: "Completed",
  },
  failed: {
    icon: X,
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500/50",
    label: "Failed",
  },
  skipped: {
    icon: ArrowRight,
    color: "text-gray-500",
    bgColor: "bg-gray-800",
    borderColor: "border-gray-700",
    label: "Skipped",
  },
};

// ============================================
// Utility Functions
// ============================================

function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// ============================================
// Step Component
// ============================================

interface StepProps {
  step: TransactionStep;
  index: number;
  isLast: boolean;
  isCurrent: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
  explorerBaseUrl?: string;
  compact?: boolean;
}

function Step({
  step,
  index,
  isLast,
  isCurrent,
  onRetry,
  onSkip,
  explorerBaseUrl,
  compact = false,
}: StepProps) {
  const [expanded, setExpanded] = useState(isCurrent);
  const [copied, setCopied] = useState(false);

  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const isAnimated = step.status === "confirming" || step.status === "signing";

  const handleCopyTxHash = () => {
    if (step.txHash) {
      navigator.clipboard.writeText(step.txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (isCurrent) setExpanded(true);
  }, [isCurrent]);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {/* Step Number/Icon */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${config.borderColor} ${config.bgColor}`}
        >
          {step.status === "completed" || step.status === "failed" ? (
            <Icon className={`w-4 h-4 ${config.color} ${isAnimated ? "animate-spin" : ""}`} />
          ) : (
            <span className={`text-sm font-medium ${config.color}`}>{index + 1}</span>
          )}
        </div>

        {/* Step Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isCurrent ? "text-white" : "text-gray-400"}`}>
            {step.label}
          </p>
          {step.status === "confirming" && (
            <p className="text-xs text-blue-400">Waiting for confirmation...</p>
          )}
          {step.status === "signing" && (
            <p className="text-xs text-yellow-400">Please sign in your wallet</p>
          )}
        </div>

        {/* Connector */}
        {!isLast && (
          <div
            className={`w-8 h-0.5 ${
              step.status === "completed" ? "bg-green-500/50" : "bg-gray-700"
            }`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div
          className={`absolute left-4 top-10 bottom-0 w-0.5 ${
            step.status === "completed" ? "bg-green-500/50" : "bg-gray-700"
          }`}
        />
      )}

      {/* Step Content */}
      <div
        className={`relative p-4 rounded-xl border transition-all ${
          isCurrent
            ? `${config.bgColor} ${config.borderColor}`
            : "bg-gray-900/50 border-gray-800"
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Step Indicator */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${config.borderColor} ${config.bgColor}`}
          >
            <Icon
              className={`w-4 h-4 ${config.color} ${isAnimated ? "animate-spin" : ""}`}
            />
          </div>

          {/* Step Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium ${isCurrent ? "text-white" : "text-gray-400"}`}>
                  {step.label}
                </h4>
                <p className="text-sm text-gray-500 mt-0.5">{step.description}</p>
              </div>

              {/* Status Badge */}
              <span
                className={`px-2 py-1 text-xs rounded-full ${config.bgColor} ${config.color}`}
              >
                {config.label}
              </span>
            </div>

            {/* Expanded Content */}
            {(step.txHash || step.error || step.status === "signing") && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                {/* Signing State */}
                {step.status === "signing" && (
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <Wallet className="w-4 h-4" />
                    <span>Please confirm the transaction in your wallet</span>
                  </div>
                )}

                {/* Confirming State */}
                {step.status === "confirming" && step.txHash && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-blue-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transaction submitted, waiting for confirmation...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Tx:</span>
                      <code className="text-xs text-gray-400 font-mono">
                        {formatAddress(step.txHash, 8)}
                      </code>
                      <button
                        onClick={handleCopyTxHash}
                        className="p-1 text-gray-500 hover:text-white transition-colors"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      {explorerBaseUrl && (
                        <a
                          href={`${explorerBaseUrl}/tx/${step.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Completed State */}
                {step.status === "completed" && step.txHash && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Transaction confirmed</span>
                    {explorerBaseUrl && (
                      <a
                        href={`${explorerBaseUrl}/tx/${step.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        View on explorer
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Error State */}
                {step.status === "failed" && step.error && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{step.error}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {onRetry && (
                        <button
                          onClick={onRetry}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry
                        </button>
                      )}
                      {step.optional && onSkip && (
                        <button
                          onClick={onSkip}
                          className="text-sm text-gray-400 hover:text-white transition-colors"
                        >
                          Skip this step
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function MultiStepTransaction({
  steps,
  currentStep,
  title = "Transaction Progress",
  description,
  onRetry,
  onSkip,
  onComplete,
  onCancel,
  explorerBaseUrl = "https://starkscan.co",
  showTimeline = true,
  compact = false,
  className = "",
}: MultiStepTransactionProps) {
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const failedSteps = steps.filter((s) => s.status === "failed").length;
  const progress = (completedSteps / steps.length) * 100;

  const isComplete = completedSteps === steps.length;
  const hasFailed = failedSteps > 0;

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <span className="text-sm text-gray-400">
            {completedSteps} of {steps.length} steps
          </span>
        </div>
        {description && <p className="text-sm text-gray-400">{description}</p>}

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                hasFailed ? "bg-red-500" : isComplete ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className={`p-4 ${compact ? "space-y-3" : "space-y-4"}`}>
        {steps.map((step, index) => (
          <Step
            key={step.id}
            step={step}
            index={index}
            isLast={index === steps.length - 1}
            isCurrent={index === currentStep}
            onRetry={onRetry ? () => onRetry(step.id) : undefined}
            onSkip={step.optional && onSkip ? () => onSkip(step.id) : undefined}
            explorerBaseUrl={explorerBaseUrl}
            compact={compact}
          />
        ))}
      </div>

      {/* Footer */}
      {(isComplete || hasFailed || onCancel) && (
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          {isComplete ? (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">All steps completed!</span>
            </div>
          ) : hasFailed ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Transaction failed</span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {onCancel && !isComplete && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            )}
            {isComplete && onComplete && (
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// useMultiStepTransaction Hook
// ============================================

export function useMultiStepTransaction(options: UseMultiStepTransactionOptions) {
  const { steps: stepConfigs, onComplete, onError, autoAdvance = true } = options;

  const [steps, setSteps] = useState<TransactionStep[]>(
    stepConfigs.map((config) => ({
      id: config.id,
      label: config.label,
      description: config.description,
      status: "pending",
      optional: config.optional,
      estimatedTime: config.estimatedTime,
    }))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const executorsRef = useRef(stepConfigs.map((c) => c.execute));

  const updateStep = useCallback(
    (stepId: string, update: Partial<TransactionStep>) => {
      setSteps((prev) =>
        prev.map((step) =>
          step.id === stepId ? { ...step, ...update } : step
        )
      );
    },
    []
  );

  const executeStep = useCallback(
    async (stepIndex: number) => {
      const step = steps[stepIndex];
      if (!step) return false;

      const executor = executorsRef.current[stepIndex];

      try {
        // Mark as signing
        updateStep(step.id, { status: "signing" });

        // Execute the transaction
        const txHash = await executor();

        // Mark as confirming
        updateStep(step.id, { status: "confirming", txHash });

        // In a real implementation, you'd wait for confirmation here
        // For now, we'll just mark as completed after a brief delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Mark as completed
        updateStep(step.id, { status: "completed" });

        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Transaction failed");
        updateStep(step.id, { status: "failed", error: err.message });
        onError?.(step.id, err);
        return false;
      }
    },
    [steps, updateStep, onError]
  );

  const start = useCallback(async () => {
    setIsRunning(true);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      updateStep(steps[i].id, { status: "active" });

      const success = await executeStep(i);

      if (!success && !steps[i].optional) {
        setIsRunning(false);
        return;
      }

      if (!success && steps[i].optional) {
        updateStep(steps[i].id, { status: "skipped" });
      }

      if (!autoAdvance && i < steps.length - 1) {
        setIsRunning(false);
        return;
      }
    }

    setIsRunning(false);
    onComplete?.();
  }, [steps, updateStep, executeStep, autoAdvance, onComplete]);

  const retry = useCallback(
    async (stepId: string) => {
      const stepIndex = steps.findIndex((s) => s.id === stepId);
      if (stepIndex === -1) return;

      setCurrentStep(stepIndex);
      setIsRunning(true);

      const success = await executeStep(stepIndex);

      if (success && autoAdvance) {
        // Continue with remaining steps
        for (let i = stepIndex + 1; i < steps.length; i++) {
          setCurrentStep(i);
          updateStep(steps[i].id, { status: "active" });

          const stepSuccess = await executeStep(i);

          if (!stepSuccess && !steps[i].optional) {
            setIsRunning(false);
            return;
          }
        }

        onComplete?.();
      }

      setIsRunning(false);
    },
    [steps, executeStep, updateStep, autoAdvance, onComplete]
  );

  const skip = useCallback(
    (stepId: string) => {
      const stepIndex = steps.findIndex((s) => s.id === stepId);
      if (stepIndex === -1 || !steps[stepIndex].optional) return;

      updateStep(stepId, { status: "skipped" });

      if (stepIndex < steps.length - 1) {
        setCurrentStep(stepIndex + 1);
      }
    },
    [steps, updateStep]
  );

  const reset = useCallback(() => {
    setSteps(
      stepConfigs.map((config) => ({
        id: config.id,
        label: config.label,
        description: config.description,
        status: "pending",
        optional: config.optional,
        estimatedTime: config.estimatedTime,
      }))
    );
    setCurrentStep(0);
    setIsRunning(false);
  }, [stepConfigs]);

  return {
    steps,
    currentStep,
    isRunning,
    start,
    retry,
    skip,
    reset,
  };
}

export type { TransactionStep, StepStatus, MultiStepTransactionProps, UseMultiStepTransactionOptions };
