'use client';

/**
 * DeploymentProgressModal Component
 *
 * Modal dialog showing real-time workload deployment progress.
 * Displays:
 * - Progress bar with percentage
 * - Status messages for each phase
 * - Download progress (bytes) when applicable
 * - Error display with retry option
 */

import React from 'react';
import { WorkloadDeployment, DeploymentStatus } from '@/lib/api/client';

interface DeploymentProgressModalProps {
  deployment: WorkloadDeployment;
  workloadName: string;
  isOpen: boolean;
  onClose: () => void;
  onStop: () => void;
  isStopDisabled?: boolean;
}

const STATUS_LABELS: Record<DeploymentStatus, string> = {
  queued: 'Queued',
  downloading_model: 'Downloading Model',
  loading_model: 'Loading Model',
  initializing: 'Initializing',
  ready: 'Ready',
  failed: 'Failed',
  stopping: 'Stopping',
  stopped: 'Stopped',
};

const STATUS_MESSAGES: Record<DeploymentStatus, string> = {
  queued: 'Waiting in queue...',
  downloading_model: 'Downloading model files...',
  loading_model: 'Loading model into GPU memory...',
  initializing: 'Initializing runtime environment...',
  ready: 'Workload is ready and accepting requests!',
  failed: 'Deployment failed. Please check the error and try again.',
  stopping: 'Stopping workload...',
  stopped: 'Workload has been stopped.',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getStatusIcon(status: DeploymentStatus) {
  switch (status) {
    case 'ready':
      return (
        <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'stopped':
      return (
        <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
  }
}

export function DeploymentProgressModal({
  deployment,
  workloadName,
  isOpen,
  onClose,
  onStop,
  isStopDisabled = false,
}: DeploymentProgressModalProps) {
  if (!isOpen) return null;

  const { status, progress, error } = deployment;
  const isComplete = status === 'ready' || status === 'failed' || status === 'stopped';
  const isError = status === 'failed';
  const isSuccess = status === 'ready';

  // Calculate progress percentage
  const progressPercent = progress?.percent ?? (isComplete ? 100 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isComplete ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Deploying {workloadName}
            </h3>
            {isComplete && (
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Status Icon */}
          <div className="flex justify-center mb-6">
            <div className={`p-4 rounded-full ${
              isSuccess ? 'bg-green-500/20' :
              isError ? 'bg-red-500/20' :
              'bg-blue-500/20'
            }`}>
              {getStatusIcon(status)}
            </div>
          </div>

          {/* Status Label */}
          <div className="text-center mb-4">
            <p className={`text-lg font-medium ${
              isSuccess ? 'text-green-400' :
              isError ? 'text-red-400' :
              'text-blue-400'
            }`}>
              {STATUS_LABELS[status]}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              {progress?.message || STATUS_MESSAGES[status]}
            </p>
          </div>

          {/* Progress Bar */}
          {!isComplete && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>{progress?.phase || 'Processing'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Download Progress */}
          {status === 'downloading_model' && progress?.bytes_total && (
            <div className="text-center text-sm text-zinc-500 mb-4">
              {formatBytes(progress.bytes_downloaded || 0)} / {formatBytes(progress.bytes_total)}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3 text-center">
              <p className="text-sm text-green-400">
                Your workload is now running and ready to process jobs!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
          {!isComplete && (
            <button
              onClick={onStop}
              disabled={isStopDisabled}
              className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel Deployment
            </button>
          )}
          {isComplete && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              {isSuccess ? 'Done' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeploymentProgressModal;
