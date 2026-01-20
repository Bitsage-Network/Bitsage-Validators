'use client';

/**
 * WorkerStatusBanner Component
 *
 * Displays the status of connected GPU workers for the current wallet.
 * Shows:
 * - GPU model and VRAM when connected
 * - Current workload if running
 * - Setup instructions when no worker connected
 */

import React from 'react';
import { MyWorker } from '@/lib/api/client';

interface WorkerStatusBannerProps {
  workers: MyWorker[];
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export function WorkerStatusBanner({
  workers,
  isLoading,
  error,
  onRefresh,
}: WorkerStatusBannerProps) {
  if (isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-zinc-700 rounded-full" />
          <div className="h-4 w-48 bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <span className="text-red-400">Failed to check worker status</span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 bg-amber-500 rounded-full mt-1 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium">No GPU Worker Connected</p>
            <p className="text-amber-400/70 text-sm mt-1">
              Start your GPU worker with your wallet address to deploy workloads.
            </p>
            <div className="mt-3 bg-black/30 rounded-md p-3 font-mono text-xs text-zinc-400">
              <p className="text-zinc-500 mb-1"># Set your wallet address and start the worker</p>
              <p className="text-green-400">
                OWNER_ADDRESS=&quot;0x...&quot; ./bitsage-worker start
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get the first worker for primary display
  const primaryWorker = workers[0];
  const isRunningWorkload = primaryWorker.active_workload !== null;

  return (
    <div
      className={`border rounded-lg p-4 mb-6 ${
        isRunningWorkload
          ? 'bg-blue-900/20 border-blue-800/50'
          : 'bg-green-900/20 border-green-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              isRunningWorkload ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
            }`}
          />
          <div>
            <span className={isRunningWorkload ? 'text-blue-300' : 'text-green-300'}>
              GPU Worker Connected
            </span>
            <span className="text-zinc-500 mx-2">|</span>
            <span className="text-zinc-400">
              {primaryWorker.gpu_model || 'Unknown GPU'}
            </span>
            {primaryWorker.vram_gb && (
              <>
                <span className="text-zinc-600 mx-2">-</span>
                <span className="text-zinc-500">{primaryWorker.vram_gb}GB VRAM</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRunningWorkload && (
            <span className="text-sm px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
              Running: {primaryWorker.active_workload}
            </span>
          )}
          {workers.length > 1 && (
            <span className="text-sm text-zinc-500">
              +{workers.length - 1} more worker{workers.length > 2 ? 's' : ''}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Refresh worker status"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Multi-worker details */}
      {workers.length > 1 && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-500 mb-2">All Workers:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {workers.map((worker) => (
              <div
                key={worker.id}
                className="flex items-center gap-2 text-sm text-zinc-400 bg-black/20 rounded px-2 py-1"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    worker.active_workload ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                />
                <span className="truncate">
                  {worker.gpu_model || worker.id.slice(0, 8)}
                </span>
                {worker.vram_gb && (
                  <span className="text-zinc-600">{worker.vram_gb}GB</span>
                )}
                {worker.active_workload && (
                  <span className="text-blue-400 text-xs">
                    ({worker.active_workload})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkerStatusBanner;
