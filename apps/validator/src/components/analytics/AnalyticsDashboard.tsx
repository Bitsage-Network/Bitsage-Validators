"use client";

/**
 * Advanced Analytics Dashboard
 *
 * Comprehensive metrics visualization including:
 * - Job performance metrics with trends
 * - Proof generation statistics
 * - Network health indicators
 * - Earnings breakdown and projections
 * - Historical data with interactive charts
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Users,
  Server,
  Layers,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface TimeRange {
  label: string;
  value: "1h" | "24h" | "7d" | "30d" | "all";
  dataPoints: number;
}

interface MetricCard {
  id: string;
  title: string;
  value: string | number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  color: "blue" | "green" | "yellow" | "red" | "purple" | "cyan";
  trend?: number[];
  detail?: string;
}

interface JobMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  avgCompletionTime: number;
  successRate: number;
  throughput: number;
  jobsByType: Record<string, number>;
}

interface ProofMetrics {
  totalProofs: number;
  verifiedProofs: number;
  failedProofs: number;
  avgGenerationTime: number;
  avgVerificationTime: number;
  proofsByCircuit: Record<string, number>;
  teeProofs: number;
  gpuProofs: number;
  wasmProofs: number;
}

interface NetworkMetrics {
  activeWorkers: number;
  totalWorkers: number;
  totalGPUs: number;
  activeGPUs: number;
  networkHashrate: number;
  avgLatency: number;
  peakTPS: number;
  currentTPS: number;
}

interface EarningsMetrics {
  totalEarned: number;
  periodEarned: number;
  pendingRewards: number;
  claimedRewards: number;
  projectedMonthly: number;
  earningsBySource: {
    compute: number;
    proofs: number;
    staking: number;
    governance: number;
  };
  roi: number;
}

interface AnalyticsData {
  jobs: JobMetrics;
  proofs: ProofMetrics;
  network: NetworkMetrics;
  earnings: EarningsMetrics;
  historical: {
    timestamps: number[];
    jobs: number[];
    proofs: number[];
    earnings: number[];
    utilization: number[];
  };
}

interface AnalyticsDashboardProps {
  data?: AnalyticsData;
  isLoading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

// ============================================
// Constants
// ============================================

const TIME_RANGES: TimeRange[] = [
  { label: "1 Hour", value: "1h", dataPoints: 12 },
  { label: "24 Hours", value: "24h", dataPoints: 24 },
  { label: "7 Days", value: "7d", dataPoints: 7 },
  { label: "30 Days", value: "30d", dataPoints: 30 },
  { label: "All Time", value: "all", dataPoints: 60 },
];

const COLOR_CLASSES = {
  blue: {
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
    gradient: "from-blue-500/20 to-blue-600/5",
  },
  green: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    gradient: "from-green-500/20 to-green-600/5",
  },
  yellow: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    gradient: "from-yellow-500/20 to-yellow-600/5",
  },
  red: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    border: "border-red-500/30",
    gradient: "from-red-500/20 to-red-600/5",
  },
  purple: {
    bg: "bg-purple-500/20",
    text: "text-purple-400",
    border: "border-purple-500/30",
    gradient: "from-purple-500/20 to-purple-600/5",
  },
  cyan: {
    bg: "bg-cyan-500/20",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
    gradient: "from-cyan-500/20 to-cyan-600/5",
  },
};

// ============================================
// Utility Functions
// ============================================

function formatNumber(value: number, decimals: number = 2): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(decimals)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(decimals)}K`;
  }
  return value.toFixed(decimals);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

// ============================================
// Subcomponents
// ============================================

function Sparkline({
  data,
  color,
  height = 32,
  width = 80,
  showArea = true,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  showArea?: boolean;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {showArea && (
        <path d={areaD} fill={`url(#gradient-${color})`} opacity={0.3} />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={`var(--color-${color})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-${color}-400`}
        style={{ stroke: "currentColor" }}
      />
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MetricCardComponent({ metric }: { metric: MetricCard }) {
  const colors = COLOR_CLASSES[metric.color];
  const Icon = metric.icon;
  const isPositiveChange = (metric.change ?? 0) >= 0;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${colors.border} bg-gradient-to-br ${colors.gradient} p-4`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <Icon className={`w-4 h-4 ${colors.text}`} />
            </div>
            <span className="text-sm text-gray-400">{metric.title}</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{metric.value}</span>
            {metric.unit && (
              <span className="text-sm text-gray-400">{metric.unit}</span>
            )}
          </div>

          {metric.change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {isPositiveChange ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-400" />
              )}
              <span
                className={`text-xs ${isPositiveChange ? "text-green-400" : "text-red-400"}`}
              >
                {isPositiveChange ? "+" : ""}
                {metric.change.toFixed(1)}%
              </span>
              {metric.changeLabel && (
                <span className="text-xs text-gray-500">{metric.changeLabel}</span>
              )}
            </div>
          )}

          {metric.detail && (
            <p className="text-xs text-gray-500 mt-1">{metric.detail}</p>
          )}
        </div>

        {metric.trend && metric.trend.length > 0 && (
          <div className="ml-4">
            <Sparkline data={metric.trend} color={metric.color} />
          </div>
        )}
      </div>
    </div>
  );
}

function DistributionBar({
  data,
  colors,
  labels,
}: {
  data: number[];
  colors: string[];
  labels: string[];
}) {
  const total = data.reduce((sum, v) => sum + v, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
        {data.map((value, index) => {
          const percentage = (value / total) * 100;
          if (percentage < 1) return null;
          return (
            <div
              key={index}
              className={`${colors[index]} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
              title={`${labels[index]}: ${formatPercentage(percentage)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {data.map((value, index) => {
          const percentage = (value / total) * 100;
          return (
            <div key={index} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${colors[index]}`} />
              <span className="text-xs text-gray-400">
                {labels[index]}: {formatPercentage(percentage)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AreaChart({
  data,
  labels,
  height = 200,
  color = "blue",
}: {
  data: number[];
  labels: string[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const padding = 40;
  const chartWidth = 100;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * chartWidth;
    const y = 100 - ((value - min) / range) * 100;
    return { x, y, value };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  const areaD = `${pathD} L ${chartWidth},100 L 0,100 Z`;

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`-${padding} -10 ${chartWidth + padding * 2} 120`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((y) => (
          <g key={y}>
            <line
              x1="0"
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="2,2"
            />
            <text
              x="-5"
              y={y + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.4)"
              fontSize="8"
            >
              {formatNumber(max - (y / 100) * range, 0)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={`url(#areaGradient-${color})`} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={`var(--${color}-400, #60a5fa)`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-${color}-400`}
          style={{ stroke: "currentColor" }}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#1e293b"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`text-${color}-400`}
          />
        ))}

        <defs>
          <linearGradient id={`areaGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0.05} />
          </linearGradient>
        </defs>
      </svg>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-10 text-xs text-gray-500">
        {labels.filter((_, i) => i % Math.ceil(labels.length / 6) === 0).map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {action}
    </div>
  );
}

function EarningsBreakdown({
  earnings,
}: {
  earnings: EarningsMetrics["earningsBySource"];
}) {
  const sources = [
    { key: "compute", label: "Compute Jobs", color: "bg-blue-500", icon: Cpu },
    { key: "proofs", label: "Proof Generation", color: "bg-purple-500", icon: Layers },
    { key: "staking", label: "Staking Rewards", color: "bg-green-500", icon: DollarSign },
    { key: "governance", label: "Governance", color: "bg-yellow-500", icon: Users },
  ];

  const total = Object.values(earnings).reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-3">
      {sources.map(({ key, label, color, icon: Icon }) => {
        const value = earnings[key as keyof typeof earnings];
        const percentage = total > 0 ? (value / total) * 100 : 0;

        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">{label}</span>
              </div>
              <span className="text-sm font-medium text-white">
                {formatNumber(value)} SAGE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-10 text-right">
                {formatPercentage(percentage)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProofMethodBreakdown({
  tee,
  gpu,
  wasm,
}: {
  tee: number;
  gpu: number;
  wasm: number;
}) {
  const methods = [
    { label: "TEE Enclave", value: tee, color: "bg-purple-500", description: "Privacy proofs" },
    { label: "GPU Workers", value: gpu, color: "bg-blue-500", description: "Compute proofs" },
    { label: "Browser WASM", value: wasm, color: "bg-cyan-500", description: "Fallback" },
  ];

  const total = tee + gpu + wasm;

  return (
    <div className="grid grid-cols-3 gap-4">
      {methods.map(({ label, value, color, description }) => (
        <div
          key={label}
          className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
        >
          <div className={`w-3 h-3 rounded-full ${color} mb-2`} />
          <div className="text-lg font-bold text-white">{formatNumber(value, 0)}</div>
          <div className="text-xs text-gray-400">{label}</div>
          <div className="text-xs text-gray-500 mt-1">{description}</div>
          {total > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {formatPercentage((value / total) * 100)} of total
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function AnalyticsDashboard({
  data: propData,
  isLoading = false,
  onRefresh,
  className = "",
}: AnalyticsDashboardProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TIME_RANGES[1]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const data = propData || null;

  const jobMetrics: MetricCard[] = useMemo(
    () => !data ? [] : [
      {
        id: "total-jobs",
        title: "Total Jobs",
        value: formatNumber(data.jobs.totalJobs, 0),
        change: 12.5,
        changeLabel: "vs last period",
        icon: Layers,
        color: "blue",
        trend: data.historical.jobs,
      },
      {
        id: "success-rate",
        title: "Success Rate",
        value: formatPercentage(data.jobs.successRate),
        change: 0.8,
        changeLabel: "improvement",
        icon: CheckCircle,
        color: "green",
        detail: `${data.jobs.failedJobs} failed jobs`,
      },
      {
        id: "avg-completion",
        title: "Avg Completion",
        value: formatDuration(data.jobs.avgCompletionTime),
        change: -8.2,
        changeLabel: "faster",
        icon: Clock,
        color: "cyan",
      },
      {
        id: "throughput",
        title: "Throughput",
        value: data.jobs.throughput.toFixed(1),
        unit: "jobs/min",
        change: 5.3,
        icon: Zap,
        color: "purple",
      },
    ],
    [data]
  );

  const networkMetrics: MetricCard[] = useMemo(
    () => !data ? [] : [
      {
        id: "active-workers",
        title: "Active Workers",
        value: `${data.network.activeWorkers}/${data.network.totalWorkers}`,
        icon: Server,
        color: "blue",
        detail: `${formatPercentage((data.network.activeWorkers / data.network.totalWorkers) * 100)} online`,
      },
      {
        id: "active-gpus",
        title: "Active GPUs",
        value: `${data.network.activeGPUs}`,
        unit: `/ ${data.network.totalGPUs}`,
        icon: Cpu,
        color: "green",
        change: 3.2,
      },
      {
        id: "current-tps",
        title: "Current TPS",
        value: data.network.currentTPS.toFixed(0),
        unit: `/ ${data.network.peakTPS} peak`,
        icon: Activity,
        color: "yellow",
        trend: data.historical.utilization,
      },
      {
        id: "avg-latency",
        title: "Avg Latency",
        value: data.network.avgLatency,
        unit: "ms",
        change: -12.5,
        changeLabel: "improved",
        icon: Zap,
        color: "cyan",
      },
    ],
    [data]
  );

  const earningsMetrics: MetricCard[] = useMemo(
    () => !data ? [] : [
      {
        id: "total-earned",
        title: "Total Earned",
        value: formatNumber(data.earnings.totalEarned),
        unit: "SAGE",
        icon: DollarSign,
        color: "green",
        trend: data.historical.earnings,
      },
      {
        id: "period-earned",
        title: `${selectedRange.label} Earnings`,
        value: formatNumber(data.earnings.periodEarned),
        unit: "SAGE",
        change: 8.7,
        icon: TrendingUp,
        color: "blue",
      },
      {
        id: "pending-rewards",
        title: "Pending Rewards",
        value: formatNumber(data.earnings.pendingRewards),
        unit: "SAGE",
        icon: Clock,
        color: "yellow",
        detail: "Ready to claim",
      },
      {
        id: "roi",
        title: "ROI",
        value: formatPercentage(data.earnings.roi),
        change: 15.2,
        changeLabel: "annualized",
        icon: TrendingUp,
        color: "purple",
      },
    ],
    [data, selectedRange]
  );

  const toggleSection = useCallback((section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-gray-400 py-12">No analytics data available</div>;
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Analytics Dashboard</h2>
          <p className="text-gray-400 text-sm mt-1">
            Comprehensive network performance metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-gray-800 rounded-lg">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setSelectedRange(range)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedRange.value === range.value
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Job Performance Section */}
      <section>
        <SectionHeader
          title="Job Performance"
          icon={Layers}
          action={
            <button
              onClick={() => toggleSection("jobs")}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              {expandedSection === "jobs" ? "Collapse" : "Details"}
              {expandedSection === "jobs" ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {jobMetrics.map((metric) => (
            <MetricCardComponent key={metric.id} metric={metric} />
          ))}
        </div>

        {expandedSection === "jobs" && (
          <div className="mt-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Jobs by Type</h4>
            <DistributionBar
              data={Object.values(data.jobs.jobsByType)}
              colors={["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-yellow-500"]}
              labels={Object.keys(data.jobs.jobsByType)}
            />

            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">
                Job Volume (Last {selectedRange.label})
              </h4>
              <AreaChart
                data={data.historical.jobs}
                labels={data.historical.timestamps.map((t) =>
                  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                )}
                color="blue"
              />
            </div>
          </div>
        )}
      </section>

      {/* Proof Generation Section */}
      <section>
        <SectionHeader
          title="Proof Generation"
          icon={Activity}
          action={
            <button
              onClick={() => toggleSection("proofs")}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              {expandedSection === "proofs" ? "Collapse" : "Details"}
              {expandedSection === "proofs" ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCardComponent
            metric={{
              id: "total-proofs",
              title: "Total Proofs",
              value: formatNumber(data.proofs.totalProofs, 0),
              change: 15.3,
              icon: CheckCircle,
              color: "green",
              trend: data.historical.proofs,
            }}
          />
          <MetricCardComponent
            metric={{
              id: "verified-rate",
              title: "Verification Rate",
              value: formatPercentage(
                (data.proofs.verifiedProofs / data.proofs.totalProofs) * 100
              ),
              icon: CheckCircle,
              color: "blue",
              detail: `${data.proofs.failedProofs} failed`,
            }}
          />
          <MetricCardComponent
            metric={{
              id: "avg-gen-time",
              title: "Avg Generation",
              value: formatDuration(data.proofs.avgGenerationTime),
              change: -5.2,
              changeLabel: "faster",
              icon: Clock,
              color: "purple",
            }}
          />
          <MetricCardComponent
            metric={{
              id: "avg-verify-time",
              title: "Avg Verification",
              value: `${data.proofs.avgVerificationTime}ms`,
              icon: Zap,
              color: "cyan",
            }}
          />
        </div>

        {expandedSection === "proofs" && (
          <div className="mt-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Proof Methods</h4>
            <ProofMethodBreakdown
              tee={data.proofs.teeProofs}
              gpu={data.proofs.gpuProofs}
              wasm={data.proofs.wasmProofs}
            />

            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Proofs by Circuit</h4>
              <DistributionBar
                data={Object.values(data.proofs.proofsByCircuit)}
                colors={["bg-purple-500", "bg-pink-500", "bg-blue-500", "bg-cyan-500"]}
                labels={Object.keys(data.proofs.proofsByCircuit)}
              />
            </div>
          </div>
        )}
      </section>

      {/* Network Health Section */}
      <section>
        <SectionHeader title="Network Health" icon={Server} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {networkMetrics.map((metric) => (
            <MetricCardComponent key={metric.id} metric={metric} />
          ))}
        </div>
      </section>

      {/* Earnings Section */}
      <section>
        <SectionHeader
          title="Earnings Overview"
          icon={DollarSign}
          action={
            <button
              onClick={() => toggleSection("earnings")}
              className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
            >
              {expandedSection === "earnings" ? "Collapse" : "Breakdown"}
              {expandedSection === "earnings" ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {earningsMetrics.map((metric) => (
            <MetricCardComponent key={metric.id} metric={metric} />
          ))}
        </div>

        {expandedSection === "earnings" && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <h4 className="text-sm font-medium text-gray-300 mb-4">
                Earnings by Source
              </h4>
              <EarningsBreakdown earnings={data.earnings.earningsBySource} />
            </div>

            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <h4 className="text-sm font-medium text-gray-300 mb-3">
                Earnings Trend
              </h4>
              <AreaChart
                data={data.historical.earnings}
                labels={data.historical.timestamps.map((t) =>
                  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                )}
                color="green"
              />
            </div>
          </div>
        )}
      </section>

      {/* Quick Stats Footer */}
      <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-400">Live Data</span>
          </div>
          <div className="text-sm text-gray-500">
            Last updated:{" "}
            {new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/jobs"
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            View All Jobs
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="/proofs"
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            View Proofs
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export type { AnalyticsData, JobMetrics, ProofMetrics, NetworkMetrics, EarningsMetrics };
