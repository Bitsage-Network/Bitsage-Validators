"use client";

import { useState, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets,
  Coins,
  Cpu,
  Check,
  ChevronRight,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: typeof Droplets;
  href: string;
  actionLabel: string;
  checkComplete: () => boolean;
}

interface GettingStartedWizardProps {
  sageBalance?: bigint;
  stakedAmount?: bigint;
  hasGpu?: boolean;
  onDismiss?: () => void;
}

export function GettingStartedWizard({
  sageBalance = 0n,
  stakedAmount = 0n,
  hasGpu = false,
  onDismiss,
}: GettingStartedWizardProps) {
  const { address } = useAccount();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check localStorage for dismissal
  useEffect(() => {
    setMounted(true);
    if (address) {
      const key = `bitsage_wizard_dismissed_${address}`;
      const wasDismissed = localStorage.getItem(key);
      if (wasDismissed === "true") {
        setDismissed(true);
      }
    }
  }, [address]);

  const handleDismiss = () => {
    if (address) {
      localStorage.setItem(`bitsage_wizard_dismissed_${address}`, "true");
    }
    setDismissed(true);
    onDismiss?.();
  };

  // Define the steps
  const hasTokens = sageBalance > 0n;
  const hasStaked = stakedAmount > 0n;

  const steps: Step[] = [
    {
      id: "faucet",
      title: "Get SAGE Tokens",
      description: "Claim free testnet tokens from the faucet",
      icon: Droplets,
      href: "/faucet",
      actionLabel: "Go to Faucet",
      checkComplete: () => hasTokens,
    },
    {
      id: "stake",
      title: "Stake Tokens",
      description: "Stake SAGE to become a validator",
      icon: Coins,
      href: "/stake",
      actionLabel: "Stake Now",
      checkComplete: () => hasStaked,
    },
    {
      id: "gpu",
      title: "Connect GPU",
      description: "Add your GPU to start validating jobs",
      icon: Cpu,
      href: "/docs",
      actionLabel: "Setup Guide",
      checkComplete: () => hasGpu,
    },
  ];

  // Calculate progress
  const completedSteps = steps.filter((s) => s.checkComplete()).length;
  const allComplete = completedSteps === steps.length;
  const currentStepIndex = steps.findIndex((s) => !s.checkComplete());
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  // Don't show if dismissed or all complete
  if (!mounted || dismissed || allComplete) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card p-4 sm:p-6 mb-6 border-brand-500/30 bg-gradient-to-r from-brand-600/10 to-accent-purple/10"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-500/20">
            <Sparkles className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Getting Started</h3>
            <p className="text-sm text-gray-400">
              Complete these steps to start validating
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
          <span>Progress</span>
          <span>{completedSteps} of {steps.length} complete</span>
        </div>
        <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completedSteps / steps.length) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-brand-500 to-accent-purple rounded-full"
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isComplete = step.checkComplete();
          const isCurrent = index === currentStepIndex;
          const isLocked = index > currentStepIndex && currentStepIndex >= 0;

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all",
                isComplete
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : isCurrent
                  ? "bg-brand-500/10 border border-brand-500/30"
                  : "bg-surface-elevated/50 border border-surface-border opacity-60"
              )}
            >
              {/* Step Icon */}
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isComplete
                    ? "bg-emerald-500/20"
                    : isCurrent
                    ? "bg-brand-500/20"
                    : "bg-surface-card"
                )}
              >
                {isComplete ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <step.icon
                    className={cn(
                      "w-4 h-4",
                      isCurrent ? "text-brand-400" : "text-gray-500"
                    )}
                  />
                )}
              </div>

              {/* Step Info */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isComplete
                      ? "text-emerald-400"
                      : isCurrent
                      ? "text-white"
                      : "text-gray-500"
                  )}
                >
                  {step.title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {step.description}
                </p>
              </div>

              {/* Action */}
              {isComplete ? (
                <span className="text-xs text-emerald-400 font-medium">
                  Done
                </span>
              ) : isCurrent ? (
                <Link
                  href={step.href}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
                >
                  {step.actionLabel}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              ) : (
                <span className="text-xs text-gray-600">Locked</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Hint for current step */}
      {currentStep && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 p-3 rounded-lg bg-surface-elevated/50 border border-surface-border"
        >
          <p className="text-xs text-gray-400">
            <span className="text-brand-400 font-medium">Tip:</span>{" "}
            {currentStep.id === "faucet" && (
              <>
                Visit the faucet and enable "Direct On-Chain Claim" to get 20 SAGE tokens instantly.
              </>
            )}
            {currentStep.id === "stake" && (
              <>
                You need at least 1,000 SAGE to stake. Stake more for higher rewards and tier benefits.
              </>
            )}
            {currentStep.id === "gpu" && (
              <>
                Follow the CLI setup guide to connect your GPU and start earning SAGE for validating jobs.
              </>
            )}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
