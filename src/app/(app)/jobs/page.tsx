"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Briefcase,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Cpu,
  Clock,
  Zap,
  Shield,
  Database,
  Brain,
  BarChart3,
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  Plus,
  RefreshCw,
  Trash2,
  Archive,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTableRow,
} from "@/components/ui/Skeleton";
import { NoResultsState } from "@/components/ui/EmptyState";
import { useJobsPageData, useJobsFromDb, useJobTimeline } from "@/lib/hooks/useApiData";
import { bulkRetryJobs, bulkArchiveJobs, bulkDeleteJobs } from "@/lib/api/client";
import { useToast } from "@/lib/providers/ToastProvider";
import { JobSubmissionModal } from "@/components/jobs/JobSubmissionModal";
import { useJobsWebSocket, JobUpdateEvent } from "@/lib/hooks/useWebSocket";
import { useRealtimeJobUpdates } from "@/lib/providers/WebSocketProvider";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { ExportButton } from "@/components/export/ExportButton";
import { AdvancedFilterPanel, useFilters, type FilterConfig } from "@/components/filter/AdvancedFilterPanel";
import { DateRangePicker, useDateRange } from "@/components/date/DateRangePicker";
import { BulkActionsToolbar, useBulkSelection, CommonActions, type BulkAction } from "@/components/actions/BulkActionsToolbar";
import { QuickReference } from "@/components/help/KeyboardShortcutsModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExportTemplates } from "@/lib/export/dataExport";

// Job type configuration
const jobTypeConfig = {
  ai_inference: { 
    icon: Brain, 
    label: "AI Inference", 
    color: "text-purple-400", 
    bg: "bg-purple-500/20" 
  },
  zk_proof: { 
    icon: Shield, 
    label: "ZK Proof", 
    color: "text-brand-400", 
    bg: "bg-brand-500/20" 
  },
  data_pipeline: { 
    icon: Database, 
    label: "Data Pipeline", 
    color: "text-cyan-400", 
    bg: "bg-cyan-500/20" 
  },
  ml_training: { 
    icon: Cpu, 
    label: "ML Training", 
    color: "text-orange-400", 
    bg: "bg-orange-500/20" 
  },
  rendering: { 
    icon: BarChart3, 
    label: "Rendering", 
    color: "text-pink-400", 
    bg: "bg-pink-500/20" 
  },
};

const statusConfig: Record<string, { 
  icon: typeof CheckCircle2; 
  label: string; 
  color: string; 
  bg: string;
  animate?: boolean;
}> = {
  completed: { 
    icon: CheckCircle2, 
    label: "Completed", 
    color: "text-emerald-400", 
    bg: "bg-emerald-500/20" 
  },
  running: { 
    icon: Loader2, 
    label: "Running", 
    color: "text-brand-400", 
    bg: "bg-brand-500/20",
    animate: true 
  },
  failed: { 
    icon: XCircle, 
    label: "Failed", 
    color: "text-red-400", 
    bg: "bg-red-500/20" 
  },
  pending: { 
    icon: Clock, 
    label: "Pending", 
    color: "text-orange-400", 
    bg: "bg-orange-500/20" 
  },
};

// Format bigint SAGE amounts (18 decimals)
function formatSage(amount: bigint | undefined | null): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 16n;
  return `${whole.toLocaleString()}.${decimal.toString().padStart(2, "0")}`;
}

// Format string SAGE amounts (from database)
function formatSageString(amount: string): string {
  if (!amount || amount === "0") return "0.00";
  try {
    const num = parseFloat(amount) / 1e18;
    if (num >= 1) return num.toFixed(2);
    if (num >= 0.001) return num.toFixed(4);
    return num.toExponential(2);
  } catch {
    return "0.00";
  }
}

// Format duration from milliseconds
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

// Default chart data (fallback)
const defaultChartData = [
  { day: "Mon", jobs: 18, earnings: 15.5 },
  { day: "Tue", jobs: 24, earnings: 22.3 },
  { day: "Wed", jobs: 12, earnings: 10.8 },
  { day: "Thu", jobs: 32, earnings: 28.5 },
  { day: "Fri", jobs: 28, earnings: 25.2 },
  { day: "Sat", jobs: 15, earnings: 12.4 },
  { day: "Sun", jobs: 22, earnings: 18.9 },
];

const JOBS_PER_PAGE = 10;

// Sorting types
type SortColumn = "job_id" | "created_at" | "status" | "duration" | null;
type SortDirection = "asc" | "desc";

// Filter configuration for jobs
const jobFilterConfig: FilterConfig[] = [
  {
    key: "status",
    label: "Status",
    type: "multiselect",
    options: [
      { value: "completed", label: "Completed" },
      { value: "running", label: "Running" },
      { value: "pending", label: "Pending" },
      { value: "failed", label: "Failed" },
    ],
  },
  {
    key: "job_type",
    label: "Job Type",
    type: "multiselect",
    options: [
      { value: "ai_inference", label: "AI Inference" },
      { value: "zk_proof", label: "ZK Proof" },
      { value: "data_pipeline", label: "Data Pipeline" },
      { value: "ml_training", label: "ML Training" },
      { value: "rendering", label: "Rendering" },
    ],
  },
  {
    key: "duration",
    label: "Duration",
    type: "range",
    min: 0,
    max: 3600000,
    step: 60000,
  },
];

// Bulk actions for jobs
const jobBulkActions: BulkAction[] = [
  {
    ...CommonActions.retry,
    label: "Retry",
    icon: RefreshCw,
  },
  {
    ...CommonActions.export,
    label: "Export",
    icon: Download,
  },
  {
    ...CommonActions.archive,
    label: "Archive",
    icon: Archive,
  },
  {
    ...CommonActions.delete,
    label: "Delete",
    icon: Trash2,
    variant: "danger",
    requiresConfirmation: true,
    confirmationMessage: "Are you sure you want to delete these jobs? This action cannot be undone.",
  },
];

// Export columns for jobs
const jobExportColumns = [
  { key: "job_id" as const, header: "Job ID" },
  { key: "status" as const, header: "Status" },
  { key: "job_type" as const, header: "Job Type" },
  { key: "worker_id" as const, header: "Worker ID" },
  { key: "created_at" as const, header: "Created At", format: (v: string) => new Date(v).toISOString() },
  { key: "completed_at" as const, header: "Completed At", format: (v: string | null) => v ? new Date(v).toISOString() : "" },
  { key: "execution_time_ms" as const, header: "Duration (ms)" },
  { key: "payment_amount" as const, header: "Payment" },
];

export default function JobsPage() {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("7d");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
    variant: "danger" | "warning";
    requiresTyping?: string;
  } | null>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Date range for filtering
  const dateRange = useDateRange();

  // Advanced filters (pass empty initial values)
  const advancedFilters = useFilters({});

  // Database-backed hooks for production data
  const {
    jobs: dbJobs,
    total: totalJobs,
    analytics,
    chartData: apiChartData,
    isLoading,
    refetch
  } = useJobsPageData({
    page: currentPage,
    limit: JOBS_PER_PAGE,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  // WebSocket for real-time job updates
  const { isConnected: wsConnected, jobUpdates } = useJobsWebSocket({
    onEvent: (event) => {
      if (event.type === 'JobUpdate') {
        // Refetch when a job status changes
        refetch();
      }
    }
  });
  const { latestJobUpdate, jobUpdates: realtimeJobUpdates } = useRealtimeJobUpdates();

  // Chart data with fallback and tracking
  const chartData = apiChartData || defaultChartData;
  const isUsingFallbackChart = !apiChartData && !isLoading;

  // Loading states
  const loadingJobs = isLoading;
  const loadingAnalytics = isLoading;
  const loadingChart = isLoading;

  // Map database jobs to display format
  const jobs = useMemo(() => dbJobs.map(job => ({
    job_id: job.job_id,
    status: job.status,
    worker_id: job.worker_address,
    created_at: job.created_at,
    started_at: job.assigned_at,
    completed_at: job.completed_at,
    result_hash: job.result_hash,
    error_message: job.error_message,
    job_type: job.job_type,
    payment_amount: job.payment_amount,
    execution_time_ms: job.execution_time_ms,
  })), [dbJobs]);

  // Bulk selection for multi-select operations
  const bulkSelection = useBulkSelection(jobs, (job) => job.job_id);

  // Handle bulk actions
  const handleBulkAction = useCallback(async (actionId: string) => {
    setBulkActionLoading(actionId);
    const selectedJobs = bulkSelection.selectedItems;
    const jobIds = selectedJobs.map(j => j.job_id);

    try {
      switch (actionId) {
        case "retry": {
          const result = await bulkRetryJobs(jobIds);
          const successCount = result.data.success.length;
          const failCount = result.data.failed.length;
          if (successCount > 0) {
            toast.success("Jobs Retried", `Successfully retried ${successCount} job(s)`);
          }
          if (failCount > 0) {
            toast.warning("Some Retries Failed", `${failCount} job(s) could not be retried`);
          }
          // Refresh jobs list
          refetch();
          break;
        }
        case "export":
          // Export is handled by the ExportButton component
          break;
        case "archive": {
          // Show confirmation dialog before archiving
          setConfirmDialog({
            open: true,
            title: "Archive Jobs?",
            description: `Are you sure you want to archive ${jobIds.length} job(s)? This action can be reversed later.`,
            variant: "warning",
            action: async () => {
              const result = await bulkArchiveJobs(jobIds);
              const successCount = result.data.success.length;
              const failCount = result.data.failed.length;
              if (successCount > 0) {
                toast.success("Jobs Archived", `Successfully archived ${successCount} job(s)`);
              }
              if (failCount > 0) {
                toast.warning("Some Archives Failed", `${failCount} job(s) could not be archived`);
              }
              // Refresh jobs list
              refetch();
              bulkSelection.deselectAll();
            },
          });
          return; // Don't execute immediately
        }
        case "delete": {
          // Show confirmation dialog before deleting
          setConfirmDialog({
            open: true,
            title: "Delete Jobs?",
            description: `This will permanently delete ${jobIds.length} job(s). This action cannot be undone.`,
            variant: "danger",
            requiresTyping: "DELETE",
            action: async () => {
              const result = await bulkDeleteJobs(jobIds);
              const successCount = result.data.success.length;
              const failCount = result.data.failed.length;
              if (successCount > 0) {
                toast.success("Jobs Deleted", `Successfully deleted ${successCount} job(s)`);
              }
              if (failCount > 0) {
                toast.error("Some Deletions Failed", `${failCount} job(s) could not be deleted`);
              }
              // Refresh jobs list
              refetch();
              bulkSelection.deselectAll();
            },
          });
          return; // Don't execute immediately
        }
      }
      bulkSelection.deselectAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operation failed";
      toast.error("Bulk Action Failed", message);
    } finally {
      setBulkActionLoading(null);
    }
  }, [bulkSelection, refetch, toast]);

  // Client-side search filter (status filter is handled server-side)
  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    return jobs.filter(job =>
      job.job_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [jobs, searchQuery]);

  // Sorting handler
  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      // New column, default to descending for dates, ascending for others
      setSortColumn(column);
      setSortDirection(column === "created_at" ? "desc" : "asc");
    }
  }, [sortColumn]);

  // Sort jobs
  const sortedJobs = useMemo(() => {
    if (!sortColumn) return filteredJobs;

    return [...filteredJobs].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "job_id":
          comparison = a.job_id.localeCompare(b.job_id);
          break;
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "status":
          const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3, queued: 4 };
          const aStatus = statusOrder[a.status as keyof typeof statusOrder] ?? 99;
          const bStatus = statusOrder[b.status as keyof typeof statusOrder] ?? 99;
          comparison = aStatus - bStatus;
          break;
        case "duration":
          const aDuration = a.execution_time_ms || 0;
          const bDuration = b.execution_time_ms || 0;
          comparison = aDuration - bDuration;
          break;
        default:
          return 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredJobs, sortColumn, sortDirection]);

  // Server-side pagination - total pages from API
  const totalPages = Math.ceil(totalJobs / JOBS_PER_PAGE);

  // Jobs are already paginated from API, but we sort client-side
  const paginatedJobs = sortedJobs;

  // Reset page when status filter changes (triggers API refetch)
  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const isLoadingPage = loadingJobs || loadingAnalytics || loadingChart;

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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const exportToCSV = () => {
    const headers = ["Job ID", "Status", "Worker ID", "Created At", "Started At", "Completed At", "Result Hash"];
    const rows = filteredJobs.map(job => [
      job.job_id,
      job.status,
      job.worker_id || '',
      new Date(job.created_at).toISOString(),
      job.started_at ? new Date(job.started_at).toISOString() : '',
      job.completed_at ? new Date(job.completed_at).toISOString() : '',
      job.result_hash || '',
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bitsage-jobs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const maxJobs = Math.max(...chartData.map(d => d.jobs));

  return (
    <ErrorBoundary>
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Job History</h1>
            {wsConnected && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm sm:text-base text-gray-400">View all jobs processed by your GPUs</p>
            <QuickReference
              shortcuts={[
                { keys: ["?"], label: "Help" },
                { keys: ["E"], label: "Export" },
                { keys: ["Esc"], label: "Clear" },
              ]}
              className="hidden md:flex"
            />
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="btn-primary flex items-center justify-center gap-2 text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3 flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            Submit Job
          </button>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={cn(
              "btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-4 py-2 sm:px-6 sm:py-3",
              showAdvancedFilters && "bg-brand-600/20 border-brand-500"
            )}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {Object.keys(advancedFilters.filters).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-brand-500 text-white text-xs rounded-full">
                {Object.keys(advancedFilters.filters).length}
              </span>
            )}
          </button>
          <ExportButton
            data={bulkSelection.selectedCount > 0 ? bulkSelection.selectedItems : filteredJobs}
            filename="bitsage-jobs"
            title="BitSage Job History"
            subtitle={`Exported on ${new Date().toLocaleDateString()}`}
            columns={jobExportColumns}
            formats={["csv", "json", "pdf"]}
            size="md"
            variant="secondary"
          />
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <AnimatePresence>
        {showAdvancedFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AdvancedFilterPanel
              filters={jobFilterConfig}
              values={advancedFilters.filters}
              onChange={advancedFilters.setFilters}
              showActiveFilters
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
        <AnimatePresence mode="wait">
          {loadingAnalytics ? (
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={`stat-skeleton-${i}`} className="glass-card p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                    <div className="skeleton-circle w-4 h-4" />
                    <div className="skeleton-text w-16" style={{ height: '12px' }} />
                  </div>
                  <div className="skeleton h-6 sm:h-7 w-16 mt-2" />
                </div>
              ))}
            </>
          ) : (
            <>
              <motion.div
                key="total-jobs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-3 sm:p-4"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs sm:text-sm mb-1">
                  <Briefcase className="w-3 h-3 sm:w-4 sm:h-4" />
                  Total Jobs
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {analytics?.total_jobs || 0}
                </p>
              </motion.div>

              <motion.div
                key="completed-jobs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="glass-card p-3 sm:p-4"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs sm:text-sm mb-1">
                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                  Completed
                </div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-400">
                  {analytics?.completed_jobs || 0}
                </p>
              </motion.div>

              <motion.div
                key="total-earnings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-3 sm:p-4 col-span-2 sm:col-span-1"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs sm:text-sm mb-1">
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                  Total Earnings
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {formatSageString(analytics?.total_payment_amount || "0")} <span className="text-xs sm:text-sm text-gray-400">SAGE</span>
                </p>
              </motion.div>

              <motion.div
                key="avg-duration"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card p-3 sm:p-4"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs sm:text-sm mb-1">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                  Avg Duration
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {formatDuration(analytics?.avg_execution_time_ms || 0)}
                </p>
              </motion.div>

              <motion.div
                key="success-rate"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-3 sm:p-4"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs sm:text-sm mb-1">
                  <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
                  Success Rate
                </div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-400">
                  {`${(analytics?.completion_rate || 0).toFixed(1)}%`}
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Chart */}
      <AnimatePresence mode="wait">
        {loadingChart ? (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="skeleton-text w-32" />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton w-12 h-8 rounded-lg" />
                ))}
              </div>
            </div>
            <div className="h-32 flex items-end gap-3">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="skeleton-text w-6" style={{ height: '10px' }} />
                  <div
                    className="w-full skeleton rounded-t-lg"
                    style={{ height: `${30 + Math.random() * 70}%` }}
                  />
                  <div className="skeleton-text w-8" style={{ height: '10px' }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <motion.div
            key="chart"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">Jobs This Week</h3>
                {isUsingFallbackChart && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                    Sample Data
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {["24h", "7d", "30d", "all"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDateFilter(filter)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm transition-colors",
                      dateFilter === filter
                        ? "bg-brand-600 text-white"
                        : "bg-surface-elevated text-gray-400 hover:text-white"
                    )}
                  >
                    {filter === "all" ? "All" : filter.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-32 flex items-end gap-3">
              {chartData.map((data, idx) => (
                <div key={data.day} className="flex-1 flex flex-col items-center gap-2">
                  <div className="text-xs text-gray-500">{data.jobs}</div>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(data.jobs / maxJobs) * 100}%` }}
                    transition={{ delay: idx * 0.05, duration: 0.5 }}
                    className="w-full bg-gradient-to-t from-brand-600 to-brand-400 rounded-t-lg min-h-[4px]"
                  />
                  <span className="text-xs text-gray-500">{data.day}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-3 sm:p-4"
      >
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-full sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by Job ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 w-full text-sm"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            className="input-field min-w-0 flex-1 sm:min-w-[140px] text-sm"
          >
            <option value="all">All Status</option>
            {Object.entries(statusConfig).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          {/* Sort Dropdown - Mobile friendly */}
          <select
            value={sortColumn ? `${sortColumn}-${sortDirection}` : "created_at-desc"}
            onChange={(e) => {
              const [col, dir] = e.target.value.split("-") as [SortColumn, SortDirection];
              setSortColumn(col);
              setSortDirection(dir);
            }}
            className="input-field min-w-0 flex-1 sm:min-w-[160px] text-sm lg:hidden"
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="status-asc">Status (Active First)</option>
            <option value="status-desc">Status (Completed First)</option>
            <option value="duration-desc">Longest Duration</option>
            <option value="duration-asc">Shortest Duration</option>
            <option value="job_id-asc">Job ID (A-Z)</option>
            <option value="job_id-desc">Job ID (Z-A)</option>
          </select>

          <div className="text-xs sm:text-sm text-gray-400 sm:ml-auto">
            {loadingJobs ? (
              <span className="flex items-center gap-2">
                <div className="skeleton w-16 h-4 inline-block" />
                <span>jobs</span>
              </span>
            ) : (
              `${filteredJobs.length} of ${totalJobs} jobs`
            )}
          </div>
        </div>
      </motion.div>

      {/* Live Updates Toast */}
      <AnimatePresence>
        {latestJobUpdate && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="glass-card p-3 border-l-4 border-emerald-500 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Job {latestJobUpdate.job_id.slice(0, 8)}... status updated
                </p>
                <p className="text-xs text-gray-400">
                  {latestJobUpdate.status} → Progress: {latestJobUpdate.progress}%
                  {latestJobUpdate.worker_id && ` • Worker: ${latestJobUpdate.worker_id.slice(0, 10)}...`}
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-500">Just now</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card overflow-hidden"
      >
        {/* Table Header - Hidden on mobile */}
        <div className="hidden lg:grid grid-cols-13 gap-4 p-4 border-b border-surface-border text-sm font-medium bg-surface-elevated/50">
          {/* Checkbox for select all */}
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={bulkSelection.selectedCount === filteredJobs.length && filteredJobs.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  bulkSelection.selectAll();
                } else {
                  bulkSelection.deselectAll();
                }
              }}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-gray-900"
            />
          </div>

          {/* Job ID - Sortable */}
          <button
            onClick={() => handleSort("job_id")}
            className={cn(
              "col-span-3 flex items-center gap-1 text-left transition-colors hover:text-white",
              sortColumn === "job_id" ? "text-brand-400" : "text-gray-400"
            )}
          >
            Job ID
            {sortColumn === "job_id" ? (
              sortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </button>

          {/* Worker - Not sortable */}
          <div className="col-span-2 text-gray-400">Worker</div>

          {/* Created - Sortable */}
          <button
            onClick={() => handleSort("created_at")}
            className={cn(
              "col-span-2 flex items-center gap-1 text-left transition-colors hover:text-white",
              sortColumn === "created_at" ? "text-brand-400" : "text-gray-400"
            )}
          >
            Created
            {sortColumn === "created_at" ? (
              sortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </button>

          {/* Status - Sortable */}
          <button
            onClick={() => handleSort("status")}
            className={cn(
              "col-span-2 flex items-center gap-1 text-left transition-colors hover:text-white",
              sortColumn === "status" ? "text-brand-400" : "text-gray-400"
            )}
          >
            Status
            {sortColumn === "status" ? (
              sortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </button>

          {/* Duration - Sortable */}
          <button
            onClick={() => handleSort("duration")}
            className={cn(
              "col-span-2 flex items-center gap-1 text-left transition-colors hover:text-white",
              sortColumn === "duration" ? "text-brand-400" : "text-gray-400"
            )}
          >
            Duration
            {sortColumn === "duration" ? (
              sortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </button>

          {/* Result - Not sortable */}
          <div className="col-span-1 text-right text-gray-400">Result</div>
        </div>

        {/* Loading State */}
        {loadingJobs && (
          <div className="divide-y divide-surface-border/50">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div key={`job-row-skeleton-${i}`} className="p-4">
                {/* Desktop skeleton */}
                <div className="hidden lg:grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="skeleton-text w-48" />
                    <div className="skeleton-circle w-4 h-4" />
                  </div>
                  <div className="col-span-2">
                    <div className="skeleton-text w-24" />
                  </div>
                  <div className="col-span-2">
                    <div className="skeleton-text w-16" />
                  </div>
                  <div className="col-span-2">
                    <div className="skeleton w-20 h-6 rounded-full" />
                  </div>
                  <div className="col-span-2">
                    <div className="skeleton-text w-16" />
                  </div>
                  <div className="col-span-1">
                    <div className="skeleton-circle w-5 h-5 ml-auto" />
                  </div>
                </div>
                {/* Mobile skeleton */}
                <div className="lg:hidden">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="skeleton-circle w-8 h-8" />
                      <div>
                        <div className="skeleton-text w-32 mb-1" />
                        <div className="skeleton-text w-16" style={{ height: '10px' }} />
                      </div>
                    </div>
                    <div className="skeleton-circle w-4 h-4" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="skeleton-text w-20" style={{ height: '10px' }} />
                    <div className="skeleton-text w-16" style={{ height: '10px' }} />
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border/30">
                    <div className="skeleton w-16 h-5 rounded-full" />
                    <div className="skeleton-circle w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Job Rows */}
        {!loadingJobs && (
          <div className="divide-y divide-surface-border/50">
            {paginatedJobs.map((job, idx) => {
              const statusKey = job.status.toLowerCase();
              const status = statusConfig[statusKey as keyof typeof statusConfig] || statusConfig.pending;
              const StatusIcon = status?.icon || Clock;
              const isExpanded = expandedJob === job.job_id;
              const duration = job.completed_at && job.started_at
                ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
                : null;

              return (
                <motion.div
                  key={job.job_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  {/* Desktop Table Row - Hidden on mobile */}
                  <div
                    className={cn(
                      "hidden lg:grid grid-cols-13 gap-4 p-4 items-center transition-colors",
                      isExpanded ? "bg-surface-elevated" : "hover:bg-surface-elevated/50",
                      bulkSelection.isSelected(job.job_id) && "bg-brand-500/10"
                    )}
                  >
                    {/* Selection checkbox */}
                    <div className="col-span-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isSelected(job.job_id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          bulkSelection.toggle(job.job_id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-gray-900"
                      />
                    </div>

                    <div
                      className="col-span-3 flex items-center gap-2 cursor-pointer"
                      onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                    >
                      <code className="text-sm text-white font-mono truncate">{job.job_id}</code>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      )}
                    </div>

                    <div className="col-span-2 text-gray-300 text-sm truncate">
                      {job.worker_id || '—'}
                    </div>

                    <div className="col-span-2 text-gray-300 text-sm">
                      {formatTimeAgo(new Date(job.created_at).getTime())}
                    </div>

                    <div className="col-span-2 flex items-center gap-2">
                      <span className={cn(
                        "badge flex items-center gap-1",
                        status?.bg,
                        status?.color
                      )}>
                        <StatusIcon className={cn("w-3 h-3", status?.animate && "animate-spin")} />
                        {status?.label}
                      </span>
                    </div>

                    <div className="col-span-2 text-gray-300 text-sm">
                      {duration ? formatDuration(duration) : '—'}
                    </div>

                    <div className="col-span-1 text-right">
                      {job.result_hash ? (
                        <a
                          href={`/proofs/${job.result_hash}`}
                          className="text-brand-400 hover:text-brand-300 flex items-center gap-1 justify-end text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Shield className="w-3 h-3" />
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                  </div>

                  {/* Mobile Card View - Hidden on desktop */}
                  <div
                    className={cn(
                      "lg:hidden p-3 sm:p-4 transition-colors",
                      isExpanded ? "bg-surface-elevated" : "hover:bg-surface-elevated/50",
                      bulkSelection.isSelected(job.job_id) && "bg-brand-500/10"
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Mobile checkbox */}
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(job.job_id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            bulkSelection.toggle(job.job_id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-gray-900 flex-shrink-0"
                        />
                        <div
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                        >
                          <div className="p-1.5 rounded-lg flex-shrink-0 bg-brand-500/20">
                            <Briefcase className="w-4 h-4 text-brand-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <code className="text-xs text-white font-mono block truncate">{job.job_id}</code>
                            <span className="text-xs text-gray-400 block">{formatTimeAgo(new Date(job.created_at).getTime())}</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Worker:</span>
                        <span className="text-white ml-1 truncate">{job.worker_id?.slice(0, 10) || '—'}...</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <span className="text-white ml-1">{duration ? formatDuration(duration) : '—'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border">
                      <span className={cn(
                        "badge text-[10px] flex items-center gap-1",
                        status?.bg,
                        status?.color
                      )}>
                        <StatusIcon className={cn("w-3 h-3", status?.animate && "animate-spin")} />
                        {status?.label}
                      </span>

                      <div className="flex items-center gap-3">
                        {job.result_hash ? (
                          <a
                            href={`/proofs/${job.result_hash}`}
                            className="text-brand-400 hover:text-brand-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-gray-500 text-sm">—</span>
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
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-2 bg-surface-elevated/50 border-t border-surface-border/50">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Job ID */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Job ID</p>
                              <div className="flex items-center gap-2">
                                <code className="text-xs text-gray-300 font-mono truncate">
                                  {job.job_id.slice(0, 24)}...
                                </code>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(job.job_id, `job-${job.job_id}`);
                                  }}
                                  className="text-gray-500 hover:text-white"
                                >
                                  {copiedHash === `job-${job.job_id}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Worker ID */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Worker ID</p>
                              {job.worker_id ? (
                                <div className="flex items-center gap-2">
                                  <code className="text-xs text-gray-300 font-mono truncate">
                                    {job.worker_id.slice(0, 18)}...
                                  </code>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(job.worker_id || "", `worker-${job.job_id}`);
                                    }}
                                    className="text-gray-500 hover:text-white"
                                  >
                                    {copiedHash === `worker-${job.job_id}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-600">Not assigned</span>
                              )}
                            </div>

                            {/* Created At */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Created</p>
                              <p className="text-xs text-gray-300">
                                {new Date(job.created_at).toLocaleString()}
                              </p>
                            </div>

                            {/* Started At */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Started</p>
                              <p className="text-xs text-gray-300">
                                {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                              </p>
                            </div>

                            {/* Completed At */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Completed</p>
                              <p className="text-xs text-gray-300">
                                {job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}
                              </p>
                            </div>

                            {/* Result Hash */}
                            {job.result_hash && (
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Result Hash</p>
                                <a
                                  href={`/proofs/${job.result_hash}`}
                                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {job.result_hash.slice(0, 16)}...
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            {/* Error Message (if failed) */}
                            {job.status.toLowerCase() === "failed" && job.error_message && (
                              <div className="col-span-2">
                                <p className="text-xs text-gray-500 mb-1">Error</p>
                                <p className="text-xs text-red-400">
                                  {job.error_message}
                                </p>
                              </div>
                            )}

                            {/* Event Timeline */}
                            <div className="col-span-2 mt-2 pt-2 border-t border-surface-border">
                              <JobTimeline jobId={job.job_id} />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loadingJobs && filteredJobs.length === 0 && (
          <NoResultsState
            query={searchQuery || undefined}
            onClear={searchQuery || statusFilter !== 'all' ? () => {
              setSearchQuery("");
              setStatusFilter("all");
            } : undefined}
          />
        )}

        {/* Pagination */}
        {!loadingJobs && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
            <div className="text-sm text-gray-400">
              Showing {((currentPage - 1) * JOBS_PER_PAGE) + 1} - {Math.min(currentPage * JOBS_PER_PAGE, totalJobs)} of {totalJobs} jobs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  currentPage === 1
                    ? "bg-surface-elevated text-gray-600 cursor-not-allowed"
                    : "bg-surface-elevated text-gray-300 hover:bg-surface-card hover:text-white"
                )}
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                        currentPage === pageNum
                          ? "bg-brand-600 text-white"
                          : "bg-surface-elevated text-gray-400 hover:bg-surface-card hover:text-white"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  currentPage === totalPages
                    ? "bg-surface-elevated text-gray-600 cursor-not-allowed"
                    : "bg-surface-elevated text-gray-300 hover:bg-surface-card hover:text-white"
                )}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Job Submission Modal */}
      <JobSubmissionModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSuccess={(jobId, txHash) => {
          // Successfully submitted job - refresh list
          refetch();
        }}
      />

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={bulkSelection.selectedCount}
        totalCount={filteredJobs.length}
        actions={jobBulkActions}
        onAction={handleBulkAction}
        onSelectAll={bulkSelection.selectAll}
        onDeselectAll={bulkSelection.deselectAll}
        isLoading={!!bulkActionLoading}
        loadingAction={bulkActionLoading || undefined}
      />

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmDialog(null);
            }
          }}
          onConfirm={async () => {
            await confirmDialog.action();
            setConfirmDialog(null);
          }}
          title={confirmDialog.title}
          description={confirmDialog.description}
          variant={confirmDialog.variant}
          requiresTyping={confirmDialog.requiresTyping}
          confirmText="Confirm"
          cancelText="Cancel"
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

// ============================================================================
// Job Timeline Component
// ============================================================================

interface TimelineEvent {
  event_type: string;
  timestamp: string;
  details: Record<string, any>;
  tx_hash?: string;
}

function JobTimeline({ jobId }: { jobId: string }) {
  const { data: timeline, isLoading } = useJobTimeline(jobId);

  const getEventIcon = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'jobsubmitted':
      case 'job_submitted':
        return <Plus className="w-3 h-3" />;
      case 'jobassigned':
      case 'job_assigned':
        return <Cpu className="w-3 h-3" />;
      case 'jobcompleted':
      case 'job_completed':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'jobfailed':
      case 'job_failed':
        return <XCircle className="w-3 h-3" />;
      case 'proofverified':
      case 'proof_verified':
        return <Shield className="w-3 h-3" />;
      case 'paymentreleased':
      case 'payment_released':
        return <Zap className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'jobsubmitted':
      case 'job_submitted':
        return 'text-blue-400 bg-blue-500/20';
      case 'jobassigned':
      case 'job_assigned':
        return 'text-purple-400 bg-purple-500/20';
      case 'jobcompleted':
      case 'job_completed':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'jobfailed':
      case 'job_failed':
        return 'text-red-400 bg-red-500/20';
      case 'proofverified':
      case 'proof_verified':
        return 'text-brand-400 bg-brand-500/20';
      case 'paymentreleased':
      case 'payment_released':
        return 'text-yellow-400 bg-yellow-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const formatEventName = (eventType: string) => {
    return eventType
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="skeleton-text w-24" style={{ height: '12px' }} />
        <div className="relative pl-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton-circle w-3 h-3" />
              <div className="skeleton w-20 h-5 rounded" />
              <div className="skeleton-text w-16" style={{ height: '10px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-gray-500 text-xs">
        No timeline events available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 font-medium">Event Timeline</p>
      <div className="relative pl-4">
        {/* Timeline line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-surface-border" />

        {timeline.map((event: TimelineEvent, idx: number) => (
          <div key={idx} className="relative flex items-start gap-3 pb-3">
            {/* Timeline dot */}
            <div className={cn(
              "absolute left-0 w-[10px] h-[10px] rounded-full flex items-center justify-center",
              getEventColor(event.event_type)
            )}>
              <div className="w-2 h-2 rounded-full bg-current" />
            </div>

            <div className="ml-4 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                  getEventColor(event.event_type)
                )}>
                  {getEventIcon(event.event_type)}
                  {formatEventName(event.event_type)}
                </span>
                <span className="text-xs text-gray-600">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {event.tx_hash && (
                <a
                  href={`https://sepolia.voyager.online/tx/${event.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {event.tx_hash.slice(0, 10)}...
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
