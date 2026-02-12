"use client";

/**
 * Feature-Specific Notification Hooks
 *
 * Provides specialized notification methods for different features:
 * - Jobs (submission, completion, failure)
 * - Proofs (generation, verification)
 * - Transactions (pending, confirmed, failed)
 * - GPU (health alerts, failures)
 * - Governance (proposals, votes)
 */

import { useCallback } from "react";
import { useNotifications } from "./NotificationProvider";

// ============================================
// Job Notifications
// ============================================

export function useJobNotifications() {
  const { notify, update, dismiss } = useNotifications();

  const notifyJobSubmitted = useCallback(
    (jobId: string, jobName: string) => {
      return notify({
        type: "loading",
        category: "job",
        title: "Job Submitted",
        message: `${jobName} is being processed...`,
        duration: 0, // Persistent until updated
        progress: 0,
      });
    },
    [notify]
  );

  const notifyJobProgress = useCallback(
    (notificationId: string, progress: number, stage?: string) => {
      update(notificationId, {
        progress,
        message: stage ? `${stage} (${progress}%)` : `Processing... ${progress}%`,
      });
    },
    [update]
  );

  const notifyJobCompleted = useCallback(
    (notificationId: string, jobName: string, reward?: string) => {
      update(notificationId, {
        type: "success",
        title: "Job Completed",
        message: reward
          ? `${jobName} completed! Earned ${reward} SAGE`
          : `${jobName} completed successfully`,
        progress: 100,
        duration: 5000,
      });

      // Auto-dismiss after duration
      setTimeout(() => dismiss(notificationId), 5000);
    },
    [update, dismiss]
  );

  const notifyJobFailed = useCallback(
    (
      notificationId: string | null,
      jobName: string,
      error: string,
      onRetry?: () => void
    ) => {
      const id = notificationId || crypto.randomUUID();

      if (notificationId) {
        update(notificationId, {
          type: "error",
          title: "Job Failed",
          message: `${jobName}: ${error}`,
          progress: undefined,
          duration: 0, // Persistent for errors
          actions: onRetry
            ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
            : undefined,
        });
      } else {
        return notify({
          type: "error",
          category: "job",
          title: "Job Failed",
          message: `${jobName}: ${error}`,
          duration: 0,
          actions: onRetry
            ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
            : undefined,
        });
      }
    },
    [notify, update]
  );

  const notifyJobQueued = useCallback(
    (position: number, estimatedWait: string) => {
      return notify({
        type: "info",
        category: "job",
        title: "Job Queued",
        message: `Position ${position} in queue. Estimated wait: ${estimatedWait}`,
        duration: 8000,
      });
    },
    [notify]
  );

  return {
    notifyJobSubmitted,
    notifyJobProgress,
    notifyJobCompleted,
    notifyJobFailed,
    notifyJobQueued,
  };
}

// ============================================
// Proof Notifications
// ============================================

export function useProofNotifications() {
  const { notify, update, dismiss } = useNotifications();

  const notifyProofGenerating = useCallback(
    (proofType: string) => {
      return notify({
        type: "loading",
        category: "proof",
        title: "Generating Proof",
        message: `${proofType} proof generation in progress...`,
        duration: 0,
        progress: 0,
      });
    },
    [notify]
  );

  const notifyProofPhase = useCallback(
    (
      notificationId: string,
      phase: string,
      progress: number,
      estimatedTime?: string
    ) => {
      update(notificationId, {
        progress,
        message: estimatedTime
          ? `${phase} (${progress}%) - ~${estimatedTime} remaining`
          : `${phase} (${progress}%)`,
      });
    },
    [update]
  );

  const notifyProofComplete = useCallback(
    (notificationId: string, proofType: string, proofHash?: string) => {
      update(notificationId, {
        type: "success",
        title: "Proof Generated",
        message: proofHash
          ? `${proofType} proof ready: ${proofHash.slice(0, 12)}...`
          : `${proofType} proof generated successfully`,
        progress: 100,
        duration: 5000,
      });

      setTimeout(() => dismiss(notificationId), 5000);
    },
    [update, dismiss]
  );

  const notifyProofVerified = useCallback(
    (txHash: string, explorerUrl: string) => {
      return notify({
        type: "success",
        category: "proof",
        title: "Proof Verified On-Chain",
        message: "Your proof has been verified by the contract",
        txHash,
        explorerUrl,
        duration: 8000,
      });
    },
    [notify]
  );

  const notifyProofFailed = useCallback(
    (notificationId: string | null, error: string, onRetry?: () => void) => {
      const updateOrNotify = notificationId
        ? () =>
            update(notificationId, {
              type: "error",
              title: "Proof Generation Failed",
              message: error,
              progress: undefined,
              duration: 0,
              actions: onRetry
                ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
                : undefined,
            })
        : () =>
            notify({
              type: "error",
              category: "proof",
              title: "Proof Generation Failed",
              message: error,
              duration: 0,
              actions: onRetry
                ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
                : undefined,
            });

      updateOrNotify();
    },
    [notify, update]
  );

  return {
    notifyProofGenerating,
    notifyProofPhase,
    notifyProofComplete,
    notifyProofVerified,
    notifyProofFailed,
  };
}

// ============================================
// Transaction Notifications
// ============================================

export function useTransactionNotifications() {
  const { notify, update, dismiss } = useNotifications();

  const notifyTransactionPending = useCallback(
    (action: string, txHash?: string, explorerUrl?: string) => {
      return notify({
        type: "loading",
        category: "transaction",
        title: "Transaction Pending",
        message: `${action} is being confirmed...`,
        txHash,
        explorerUrl,
        duration: 0,
      });
    },
    [notify]
  );

  const notifyTransactionConfirmed = useCallback(
    (
      notificationId: string,
      action: string,
      txHash: string,
      explorerUrl: string
    ) => {
      update(notificationId, {
        type: "success",
        title: "Transaction Confirmed",
        message: `${action} completed successfully`,
        txHash,
        explorerUrl,
        duration: 6000,
      });

      setTimeout(() => dismiss(notificationId), 6000);
    },
    [update, dismiss]
  );

  const notifyTransactionFailed = useCallback(
    (
      notificationId: string | null,
      action: string,
      error: string,
      onRetry?: () => void
    ) => {
      if (notificationId) {
        update(notificationId, {
          type: "error",
          title: "Transaction Failed",
          message: `${action}: ${error}`,
          duration: 0,
          actions: onRetry
            ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
            : undefined,
        });
      } else {
        return notify({
          type: "error",
          category: "transaction",
          title: "Transaction Failed",
          message: `${action}: ${error}`,
          duration: 0,
          actions: onRetry
            ? [{ label: "Retry", onClick: onRetry, variant: "primary" }]
            : undefined,
        });
      }
    },
    [notify, update]
  );

  const notifyTransactionRejected = useCallback(
    (action: string) => {
      return notify({
        type: "warning",
        category: "transaction",
        title: "Transaction Rejected",
        message: `${action} was rejected by your wallet`,
        duration: 5000,
      });
    },
    [notify]
  );

  return {
    notifyTransactionPending,
    notifyTransactionConfirmed,
    notifyTransactionFailed,
    notifyTransactionRejected,
  };
}

// ============================================
// GPU Health Notifications
// ============================================

export function useGPUNotifications() {
  const { notify, dismiss } = useNotifications();

  const notifyGPUHealthy = useCallback(
    (gpuName: string, gpuCount: number) => {
      return notify({
        type: "success",
        category: "gpu",
        title: "GPU Status: Healthy",
        message: `${gpuCount}x ${gpuName} operating normally`,
        duration: 5000,
      });
    },
    [notify]
  );

  const notifyGPUWarning = useCallback(
    (
      gpuId: number,
      issue: string,
      details: string,
      onViewDetails?: () => void
    ) => {
      return notify({
        type: "warning",
        category: "gpu",
        title: `GPU ${gpuId}: ${issue}`,
        message: details,
        duration: 0, // Persistent for warnings
        actions: onViewDetails
          ? [{ label: "View Details", onClick: onViewDetails, variant: "secondary" }]
          : undefined,
      });
    },
    [notify]
  );

  const notifyGPUCritical = useCallback(
    (
      gpuId: number,
      issue: string,
      recommendation: string,
      onTakeAction?: () => void
    ) => {
      return notify({
        type: "error",
        category: "gpu",
        title: `GPU ${gpuId}: Critical - ${issue}`,
        message: recommendation,
        duration: 0,
        dismissible: false,
        actions: onTakeAction
          ? [
              { label: "Take Action", onClick: onTakeAction, variant: "danger" },
              {
                label: "Dismiss",
                onClick: () => {}, // Will be handled by notification system
                variant: "secondary",
              },
            ]
          : undefined,
      });
    },
    [notify]
  );

  const notifyGPUTemperature = useCallback(
    (gpuId: number, temperature: number, threshold: number) => {
      if (temperature >= threshold) {
        return notify({
          type: "warning",
          category: "gpu",
          title: `GPU ${gpuId}: High Temperature`,
          message: `Current: ${temperature}°C (threshold: ${threshold}°C). Consider reducing workload.`,
          duration: 0,
        });
      }
    },
    [notify]
  );

  const notifyGPUMemoryLow = useCallback(
    (gpuId: number, usedGB: number, totalGB: number) => {
      const percentUsed = Math.round((usedGB / totalGB) * 100);
      if (percentUsed >= 90) {
        return notify({
          type: "warning",
          category: "gpu",
          title: `GPU ${gpuId}: Low Memory`,
          message: `${usedGB.toFixed(1)}/${totalGB.toFixed(1)} GB used (${percentUsed}%)`,
          duration: 0,
        });
      }
    },
    [notify]
  );

  return {
    notifyGPUHealthy,
    notifyGPUWarning,
    notifyGPUCritical,
    notifyGPUTemperature,
    notifyGPUMemoryLow,
  };
}

// ============================================
// Governance Notifications
// ============================================

export function useGovernanceNotifications() {
  const { notify } = useNotifications();

  const notifyNewProposal = useCallback(
    (proposalId: string, title: string, onViewProposal: () => void) => {
      return notify({
        type: "info",
        category: "governance",
        title: "New Proposal",
        message: title,
        duration: 10000,
        actions: [
          { label: "View Proposal", onClick: onViewProposal, variant: "primary" },
        ],
      });
    },
    [notify]
  );

  const notifyVoteSubmitted = useCallback(
    (proposalTitle: string, vote: "for" | "against" | "abstain") => {
      return notify({
        type: "success",
        category: "governance",
        title: "Vote Submitted",
        message: `You voted "${vote}" on: ${proposalTitle}`,
        duration: 5000,
      });
    },
    [notify]
  );

  const notifyProposalEnding = useCallback(
    (proposalTitle: string, hoursRemaining: number, onVoteNow: () => void) => {
      return notify({
        type: "warning",
        category: "governance",
        title: "Proposal Ending Soon",
        message: `"${proposalTitle}" ends in ${hoursRemaining} hours`,
        duration: 0,
        actions: [{ label: "Vote Now", onClick: onVoteNow, variant: "primary" }],
      });
    },
    [notify]
  );

  const notifyProposalPassed = useCallback(
    (proposalTitle: string) => {
      return notify({
        type: "success",
        category: "governance",
        title: "Proposal Passed",
        message: proposalTitle,
        duration: 8000,
      });
    },
    [notify]
  );

  const notifyProposalRejected = useCallback(
    (proposalTitle: string) => {
      return notify({
        type: "info",
        category: "governance",
        title: "Proposal Rejected",
        message: proposalTitle,
        duration: 8000,
      });
    },
    [notify]
  );

  return {
    notifyNewProposal,
    notifyVoteSubmitted,
    notifyProposalEnding,
    notifyProposalPassed,
    notifyProposalRejected,
  };
}

// ============================================
// Wallet Notifications
// ============================================

export function useWalletNotifications() {
  const { notify } = useNotifications();

  const notifyBalanceChange = useCallback(
    (token: string, amount: string, type: "received" | "sent") => {
      return notify({
        type: type === "received" ? "success" : "info",
        category: "wallet",
        title: type === "received" ? "Tokens Received" : "Tokens Sent",
        message: `${amount} ${token}`,
        duration: 5000,
      });
    },
    [notify]
  );

  const notifyStakeRewards = useCallback(
    (amount: string, source: string) => {
      return notify({
        type: "success",
        category: "wallet",
        title: "Rewards Claimed",
        message: `${amount} SAGE from ${source}`,
        duration: 5000,
      });
    },
    [notify]
  );

  const notifyPrivacyNoteCreated = useCallback(
    (denomination: number) => {
      return notify({
        type: "success",
        category: "wallet",
        title: "Privacy Note Created",
        message: `${denomination} SAGE deposited to privacy pool`,
        duration: 5000,
      });
    },
    [notify]
  );

  const notifyPrivacyWithdrawal = useCallback(
    (amount: string, txHash: string, explorerUrl: string) => {
      return notify({
        type: "success",
        category: "wallet",
        title: "Private Withdrawal Complete",
        message: `${amount} SAGE withdrawn from privacy pool`,
        txHash,
        explorerUrl,
        duration: 6000,
      });
    },
    [notify]
  );

  return {
    notifyBalanceChange,
    notifyStakeRewards,
    notifyPrivacyNoteCreated,
    notifyPrivacyWithdrawal,
  };
}
