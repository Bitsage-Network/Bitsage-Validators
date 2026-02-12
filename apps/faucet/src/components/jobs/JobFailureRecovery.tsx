"use client";

/**
 * Job Failure Recovery Component
 *
 * Provides comprehensive job failure handling with:
 * - Failed jobs list with error details
 * - Retry functionality (single and bulk)
 * - Error categorization and suggested fixes
 * - Retry history and success rates
 * - Automatic retry options
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  RefreshCw,
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Server,
  Zap,
  Shield,
  HelpCircle,
  Settings,
  PlayCircle,
  Trash2,
  Filter,
  SortDesc,
  ExternalLink,
  Copy,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobNotifications } from "@/lib/notifications";

// ============================================
// Types
// ============================================

interface FailedJob {
  id: string;
  name: string;
  type: "inference" | "training" | "data_pipeline" | "proof_generation" | "other";
  submittedAt: number;
  failedAt: number;
  error: JobError;
  retryCount: number;
  maxRetries: number;
  inputHash: string;
  gpuRequirements?: {
    memory: number;
    compute: string;
  };
  estimatedDuration?: number;
  priority: "low" | "medium" | "high" | "critical";
}

interface JobError {
  code: string;
  category: "gpu" | "memory" | "network" | "timeout" | "validation" | "system" | "unknown";
  message: string;
  details?: string;
  stackTrace?: string;
  suggestion?: string;
  retryable: boolean;
}

interface RetryOptions {
  increaseMemory: boolean;
  reduceBatchSize: boolean;
  useAlternateWorker: boolean;
  delaySeconds: number;
  priority: "same" | "higher";
}

// Error category configurations
const ERROR_CATEGORIES = {
  gpu: {
    icon: Cpu,
    label: "GPU Error",
    color: "text-orange-400",
    bg: "bg-orange-500/20",
    border: "border-orange-500/30",
  },
  memory: {
    icon: Server,
    label: "Memory Error",
    color: "text-red-400",
    bg: "bg-red-500/20",
    border: "border-red-500/30",
  },
  network: {
    icon: Zap,
    label: "Network Error",
    color: "text-yellow-400",
    bg: "bg-yellow-500/20",
    border: "border-yellow-500/30",
  },
  timeout: {
    icon: Clock,
    label: "Timeout",
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    border: "border-purple-500/30",
  },
  validation: {
    icon: Shield,
    label: "Validation Error",
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    border: "border-blue-500/30",
  },
  system: {
    icon: AlertTriangle,
    label: "System Error",
    color: "text-red-400",
    bg: "bg-red-500/20",
    border: "border-red-500/30",
  },
  unknown: {
    icon: HelpCircle,
    label: "Unknown Error",
    color: "text-gray-400",
    bg: "bg-gray-500/20",
    border: "border-gray-500/30",
  },
};

// ============================================
// Main Component
// ============================================

interface JobFailureRecoveryProps {
  failedJobs: FailedJob[];
  onRetry: (jobId: string, options: RetryOptions) => Promise<void>;
  onBulkRetry: (jobIds: string[], options: RetryOptions) => Promise<void>;
  onDismiss: (jobId: string) => void;
  onClearAll: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function JobFailureRecovery({
  failedJobs,
  onRetry,
  onBulkRetry,
  onDismiss,
  onClearAll,
  isRetrying = false,
  className,
}: JobFailureRecoveryProps) {
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [retryOptionsOpen, setRetryOptionsOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"time" | "priority" | "retries">("time");
  const [retryOptions, setRetryOptions] = useState<RetryOptions>({
    increaseMemory: false,
    reduceBatchSize: false,
    useAlternateWorker: true,
    delaySeconds: 0,
    priority: "same",
  });

  const { notifyJobSubmitted, notifyJobCompleted, notifyJobFailed } = useJobNotifications();

  // Filter and sort jobs
  const processedJobs = useMemo(() => {
    let jobs = [...failedJobs];

    // Filter by category
    if (filterCategory) {
      jobs = jobs.filter((j) => j.error.category === filterCategory);
    }

    // Sort
    switch (sortBy) {
      case "time":
        jobs.sort((a, b) => b.failedAt - a.failedAt);
        break;
      case "priority":
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        jobs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        break;
      case "retries":
        jobs.sort((a, b) => b.retryCount - a.retryCount);
        break;
    }

    return jobs;
  }, [failedJobs, filterCategory, sortBy]);

  // Stats
  const stats = useMemo(() => {
    const categoryCount = failedJobs.reduce((acc, job) => {
      acc[job.error.category] = (acc[job.error.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const retryableCount = failedJobs.filter(
      (j) => j.error.retryable && j.retryCount < j.maxRetries
    ).length;

    return {
      total: failedJobs.length,
      retryable: retryableCount,
      categoryCount,
    };
  }, [failedJobs]);

  // Selection handlers
  const toggleSelection = useCallback((jobId: string) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const retryableIds = processedJobs
      .filter((j) => j.error.retryable && j.retryCount < j.maxRetries)
      .map((j) => j.id);
    setSelectedJobs(new Set(retryableIds));
  }, [processedJobs]);

  const clearSelection = useCallback(() => {
    setSelectedJobs(new Set());
  }, []);

  // Retry handlers
  const handleRetry = useCallback(
    async (jobId: string) => {
      const job = failedJobs.find((j) => j.id === jobId);
      if (!job) return;

      const notifId = notifyJobSubmitted(jobId, job.name);
      try {
        await onRetry(jobId, retryOptions);
        notifyJobCompleted(notifId, job.name);
      } catch (error) {
        notifyJobFailed(notifId, job.name, error instanceof Error ? error.message : "Retry failed");
      }
    },
    [failedJobs, onRetry, retryOptions, notifyJobSubmitted, notifyJobCompleted, notifyJobFailed]
  );

  const handleBulkRetry = useCallback(async () => {
    if (selectedJobs.size === 0) return;

    try {
      await onBulkRetry(Array.from(selectedJobs), retryOptions);
      setSelectedJobs(new Set());
    } catch (error) {
      console.error("Bulk retry failed:", error);
    }
  }, [selectedJobs, onBulkRetry, retryOptions]);

  if (failedJobs.length === 0) {
    return (
      <div className={cn("glass-card p-8 text-center", className)}>
        <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Failed Jobs</h3>
        <p className="text-gray-400">All your jobs are running smoothly!</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-500/20">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Failed Jobs</h3>
            <p className="text-sm text-gray-400">
              {stats.total} failed • {stats.retryable} retryable
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filterCategory || ""}
            onChange={(e) => setFilterCategory(e.target.value || null)}
            className="px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border text-sm text-gray-300"
          >
            <option value="">All Categories</option>
            {Object.entries(ERROR_CATEGORIES).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label} ({stats.categoryCount[key] || 0})
              </option>
            ))}
          </select>

          {/* Sort */}
          <button
            onClick={() =>
              setSortBy((prev) =>
                prev === "time" ? "priority" : prev === "priority" ? "retries" : "time"
              )
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border text-sm text-gray-300 hover:text-white"
          >
            <SortDesc className="h-4 w-4" />
            {sortBy === "time" ? "Time" : sortBy === "priority" ? "Priority" : "Retries"}
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedJobs.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-xl bg-brand-500/10 border border-brand-500/30"
        >
          <span className="text-sm text-brand-300">
            {selectedJobs.size} job{selectedJobs.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={handleBulkRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {isRetrying ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Retry Selected
            </button>
          </div>
        </motion.div>
      )}

      {/* Selection Controls */}
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={selectAll}
          className="text-gray-400 hover:text-white transition-colors"
        >
          Select all retryable
        </button>
        <span className="text-gray-600">•</span>
        <button
          onClick={onClearAll}
          className="text-red-400 hover:text-red-300 transition-colors"
        >
          Clear all failed
        </button>
      </div>

      {/* Failed Jobs List */}
      <div className="space-y-3">
        {processedJobs.map((job) => (
          <FailedJobCard
            key={job.id}
            job={job}
            isSelected={selectedJobs.has(job.id)}
            isExpanded={expandedJob === job.id}
            onToggleSelect={() => toggleSelection(job.id)}
            onToggleExpand={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            onRetry={() => handleRetry(job.id)}
            onDismiss={() => onDismiss(job.id)}
            retryOptions={retryOptions}
            onUpdateOptions={setRetryOptions}
            isRetrying={isRetrying}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Failed Job Card Component
// ============================================

interface FailedJobCardProps {
  job: FailedJob;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  retryOptions: RetryOptions;
  onUpdateOptions: (options: RetryOptions) => void;
  isRetrying: boolean;
}

function FailedJobCard({
  job,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onRetry,
  onDismiss,
  retryOptions,
  onUpdateOptions,
  isRetrying,
}: FailedJobCardProps) {
  const [showRetryOptions, setShowRetryOptions] = useState(false);
  const [copied, setCopied] = useState(false);

  const categoryConfig = ERROR_CATEGORIES[job.error.category];
  const CategoryIcon = categoryConfig.icon;
  const canRetry = job.error.retryable && job.retryCount < job.maxRetries;

  const handleCopyError = () => {
    const errorText = `${job.error.code}: ${job.error.message}\n${job.error.details || ""}\n${job.error.stackTrace || ""}`;
    navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border overflow-hidden transition-all",
        isSelected ? "border-brand-500/50 bg-brand-500/5" : "border-surface-border bg-surface-card"
      )}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={onToggleSelect}
            disabled={!canRetry}
            className={cn(
              "w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors",
              canRetry
                ? isSelected
                  ? "bg-brand-500 border-brand-500"
                  : "border-gray-500 hover:border-brand-400"
                : "border-gray-600 opacity-50 cursor-not-allowed"
            )}
          >
            {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
          </button>

          {/* Error Icon */}
          <div className={cn("p-2 rounded-lg flex-shrink-0", categoryConfig.bg)}>
            <CategoryIcon className={cn("h-5 w-5", categoryConfig.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-white truncate">{job.name}</p>
                <p className="text-sm text-gray-400">
                  Failed {formatTimeAgo(job.failedAt)} • {job.retryCount}/{job.maxRetries} retries
                </p>
              </div>
              <PriorityBadge priority={job.priority} />
            </div>

            {/* Error Summary */}
            <div
              className={cn(
                "mt-2 p-2 rounded-lg text-sm",
                categoryConfig.bg,
                categoryConfig.border,
                "border"
              )}
            >
              <div className="flex items-start gap-2">
                <span className={cn("font-mono text-xs", categoryConfig.color)}>
                  {job.error.code}
                </span>
                <span className="text-gray-300 flex-1">{job.error.message}</span>
              </div>
            </div>

            {/* Suggestion */}
            {job.error.suggestion && (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-blue-300">{job.error.suggestion}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isExpanded ? "Hide details" : "Show details"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="Dismiss"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {canRetry && (
              <>
                <button
                  onClick={() => setShowRetryOptions(!showRetryOptions)}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  title="Retry options"
                >
                  <Settings className="h-4 w-4" />
                </button>

                <button
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {isRetrying ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Retry
                </button>
              </>
            )}

            {!canRetry && (
              <span className="text-xs text-red-400 px-2">
                {!job.error.retryable ? "Not retryable" : "Max retries reached"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-4 space-y-4 bg-white/[0.02]">
              {/* Error Details */}
              {job.error.details && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-400">Error Details</p>
                    <button
                      onClick={handleCopyError}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-white"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-black/30 text-xs text-gray-300 overflow-x-auto">
                    {job.error.details}
                  </pre>
                </div>
              )}

              {/* Stack Trace */}
              {job.error.stackTrace && (
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-2">Stack Trace</p>
                  <pre className="p-3 rounded-lg bg-black/30 text-xs text-gray-400 overflow-x-auto max-h-40">
                    {job.error.stackTrace}
                  </pre>
                </div>
              )}

              {/* Job Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <InfoItem label="Job ID" value={job.id.slice(0, 12)} mono />
                <InfoItem label="Type" value={job.type.replace("_", " ")} />
                <InfoItem label="Input Hash" value={job.inputHash.slice(0, 12)} mono />
                <InfoItem label="Submitted" value={formatTimeAgo(job.submittedAt)} />
              </div>

              {/* GPU Requirements */}
              {job.gpuRequirements && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">GPU Requirements:</span>
                  <span className="text-white">
                    {(job.gpuRequirements.memory / 1024).toFixed(1)} GB •{" "}
                    {job.gpuRequirements.compute}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retry Options Panel */}
      <AnimatePresence>
        {showRetryOptions && canRetry && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <RetryOptionsPanel
              options={retryOptions}
              onChange={onUpdateOptions}
              errorCategory={job.error.category}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// Helper Components
// ============================================

function PriorityBadge({ priority }: { priority: FailedJob["priority"] }) {
  const config = {
    critical: { bg: "bg-red-500/20", text: "text-red-400" },
    high: { bg: "bg-orange-500/20", text: "text-orange-400" },
    medium: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
    low: { bg: "bg-gray-500/20", text: "text-gray-400" },
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-medium capitalize",
        config[priority].bg,
        config[priority].text
      )}
    >
      {priority}
    </span>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-white/5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-sm text-white truncate", mono && "font-mono")}>{value}</p>
    </div>
  );
}

interface RetryOptionsPanelProps {
  options: RetryOptions;
  onChange: (options: RetryOptions) => void;
  errorCategory: JobError["category"];
}

function RetryOptionsPanel({ options, onChange, errorCategory }: RetryOptionsPanelProps) {
  return (
    <div className="p-4 space-y-4 bg-white/[0.02]">
      <p className="text-sm font-medium text-gray-400">Retry Options</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Memory increase (for memory errors) */}
        {(errorCategory === "memory" || errorCategory === "gpu") && (
          <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10">
            <input
              type="checkbox"
              checked={options.increaseMemory}
              onChange={(e) => onChange({ ...options, increaseMemory: e.target.checked })}
              className="w-4 h-4 rounded accent-brand-500"
            />
            <div>
              <p className="text-sm text-white">Request more memory</p>
              <p className="text-xs text-gray-400">Increase GPU memory allocation by 20%</p>
            </div>
          </label>
        )}

        {/* Reduce batch size */}
        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10">
          <input
            type="checkbox"
            checked={options.reduceBatchSize}
            onChange={(e) => onChange({ ...options, reduceBatchSize: e.target.checked })}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <div>
            <p className="text-sm text-white">Reduce batch size</p>
            <p className="text-xs text-gray-400">Process smaller chunks to reduce memory</p>
          </div>
        </label>

        {/* Use alternate worker */}
        <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10">
          <input
            type="checkbox"
            checked={options.useAlternateWorker}
            onChange={(e) => onChange({ ...options, useAlternateWorker: e.target.checked })}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <div>
            <p className="text-sm text-white">Use different worker</p>
            <p className="text-xs text-gray-400">Route to a different GPU worker</p>
          </div>
        </label>

        {/* Priority */}
        <div className="p-3 rounded-lg bg-white/5">
          <p className="text-sm text-white mb-2">Priority</p>
          <select
            value={options.priority}
            onChange={(e) =>
              onChange({ ...options, priority: e.target.value as RetryOptions["priority"] })
            }
            className="w-full px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border text-sm text-white"
          >
            <option value="same">Same as original</option>
            <option value="higher">Higher priority</option>
          </select>
        </div>
      </div>

      {/* Delay */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Delay before retry:</span>
        <select
          value={options.delaySeconds}
          onChange={(e) => onChange({ ...options, delaySeconds: parseInt(e.target.value) })}
          className="px-3 py-2 rounded-lg bg-surface-elevated border border-surface-border text-sm text-white"
        >
          <option value={0}>No delay</option>
          <option value={5}>5 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
        </select>
      </div>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export type { FailedJob, JobError, RetryOptions };
