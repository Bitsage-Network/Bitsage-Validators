"use client";

/**
 * GPU Health Monitor Component
 *
 * Provides comprehensive GPU health monitoring with:
 * - Real-time metrics (temperature, utilization, memory)
 * - Health status indicators with thresholds
 * - Failure detection and predictive alerts
 * - Historical performance charts
 * - Per-GPU detailed views
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Thermometer,
  HardDrive,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings,
  Bell,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

interface GPUMetrics {
  id: number;
  name: string;
  temperature: number;
  temperatureMax: number;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  powerDraw: number;
  powerLimit: number;
  fanSpeed: number;
  clockSpeed: number;
  clockSpeedMax: number;
  computeMode: string;
  driverVersion: string;
  cudaCores?: number;
  pcieBandwidth?: number;
}

interface GPUHealth {
  status: "healthy" | "warning" | "critical" | "offline";
  issues: GPUHealthIssue[];
  lastUpdated: number;
  uptime: number;
  errorsLast24h: number;
}

interface GPUHealthIssue {
  type: "temperature" | "memory" | "utilization" | "power" | "driver" | "hardware";
  severity: "warning" | "critical";
  message: string;
  recommendation: string;
  detectedAt: number;
}

interface GPUData {
  metrics: GPUMetrics;
  health: GPUHealth;
  history: {
    temperature: number[];
    utilization: number[];
    memory: number[];
    timestamps: number[];
  };
}

// Thresholds for health monitoring
const THRESHOLDS = {
  temperature: { warning: 75, critical: 85 },
  utilization: { low: 20, high: 95 },
  memory: { warning: 85, critical: 95 },
  power: { warning: 90, critical: 100 },
};

// ============================================
// Main Component
// ============================================

interface GPUHealthMonitorProps {
  gpuData: GPUData[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onConfigureAlerts?: () => void;
  compact?: boolean;
  className?: string;
}

export function GPUHealthMonitor({
  gpuData,
  onRefresh,
  isRefreshing = false,
  onConfigureAlerts,
  compact = false,
  className,
}: GPUHealthMonitorProps) {
  const [expandedGPU, setExpandedGPU] = useState<number | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // Aggregate health status
  const overallHealth = useMemo(() => {
    if (gpuData.length === 0) return "offline";
    const statuses = gpuData.map((g) => g.health.status);
    if (statuses.includes("critical")) return "critical";
    if (statuses.includes("warning")) return "warning";
    if (statuses.includes("offline")) return "offline";
    return "healthy";
  }, [gpuData]);

  // Collect all issues
  const allIssues = useMemo(() => {
    return gpuData
      .flatMap((gpu) =>
        gpu.health.issues.map((issue) => ({
          ...issue,
          gpuId: gpu.metrics.id,
          gpuName: gpu.metrics.name,
        }))
      )
      .sort((a, b) => {
        if (a.severity === "critical" && b.severity !== "critical") return -1;
        if (b.severity === "critical" && a.severity !== "critical") return 1;
        return b.detectedAt - a.detectedAt;
      });
  }, [gpuData]);

  if (compact) {
    return (
      <CompactGPUMonitor
        gpuData={gpuData}
        overallHealth={overallHealth}
        issueCount={allIssues.length}
        onExpand={() => {}}
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with Overall Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "p-3 rounded-xl",
              overallHealth === "healthy" && "bg-green-500/20",
              overallHealth === "warning" && "bg-yellow-500/20",
              overallHealth === "critical" && "bg-red-500/20",
              overallHealth === "offline" && "bg-gray-500/20"
            )}
          >
            <Cpu
              className={cn(
                "h-6 w-6",
                overallHealth === "healthy" && "text-green-400",
                overallHealth === "warning" && "text-yellow-400",
                overallHealth === "critical" && "text-red-400",
                overallHealth === "offline" && "text-gray-400"
              )}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">GPU Fleet Health</h3>
            <p className="text-sm text-gray-400">
              {gpuData.length} GPU{gpuData.length !== 1 ? "s" : ""} •{" "}
              <span
                className={cn(
                  overallHealth === "healthy" && "text-green-400",
                  overallHealth === "warning" && "text-yellow-400",
                  overallHealth === "critical" && "text-red-400",
                  overallHealth === "offline" && "text-gray-400"
                )}
              >
                {overallHealth.charAt(0).toUpperCase() + overallHealth.slice(1)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onConfigureAlerts && (
            <button
              onClick={onConfigureAlerts}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Configure alerts"
            >
              <Bell className="h-5 w-5 text-gray-400" />
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-5 w-5 text-gray-400", isRefreshing && "animate-spin")}
              />
            </button>
          )}
        </div>
      </div>

      {/* Active Issues Alert */}
      {allIssues.length > 0 && (
        <GPUIssuesAlert
          issues={allIssues}
          showAll={showAllIssues}
          onToggleShowAll={() => setShowAllIssues(!showAllIssues)}
        />
      )}

      {/* GPU Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gpuData.map((gpu) => (
          <GPUCard
            key={gpu.metrics.id}
            gpu={gpu}
            isExpanded={expandedGPU === gpu.metrics.id}
            onToggleExpand={() =>
              setExpandedGPU(expandedGPU === gpu.metrics.id ? null : gpu.metrics.id)
            }
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// GPU Card Component
// ============================================

interface GPUCardProps {
  gpu: GPUData;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function GPUCard({ gpu, isExpanded, onToggleExpand }: GPUCardProps) {
  const { metrics, health, history } = gpu;

  const memoryPercent = Math.round((metrics.memoryUsed / metrics.memoryTotal) * 100);
  const powerPercent = Math.round((metrics.powerDraw / metrics.powerLimit) * 100);

  return (
    <div
      className={cn(
        "rounded-xl border transition-all overflow-hidden",
        health.status === "healthy" && "border-green-500/20 bg-green-500/5",
        health.status === "warning" && "border-yellow-500/20 bg-yellow-500/5",
        health.status === "critical" && "border-red-500/20 bg-red-500/5",
        health.status === "offline" && "border-gray-500/20 bg-gray-500/5"
      )}
    >
      {/* Card Header */}
      <div
        className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GPUStatusIcon status={health.status} />
            <div>
              <p className="font-medium text-white">GPU {metrics.id}</p>
              <p className="text-sm text-gray-400">{metrics.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Stats */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <MetricBadge
                icon={Thermometer}
                value={`${metrics.temperature}°C`}
                status={getTemperatureStatus(metrics.temperature)}
              />
              <MetricBadge
                icon={Gauge}
                value={`${metrics.utilization}%`}
                status={getUtilizationStatus(metrics.utilization)}
              />
              <MetricBadge
                icon={HardDrive}
                value={`${memoryPercent}%`}
                status={getMemoryStatus(memoryPercent)}
              />
            </div>

            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
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
            className="border-t border-white/10"
          >
            <div className="p-4 space-y-4">
              {/* Metric Bars */}
              <div className="grid grid-cols-2 gap-4">
                <MetricBar
                  label="Temperature"
                  value={metrics.temperature}
                  max={metrics.temperatureMax}
                  unit="°C"
                  thresholds={THRESHOLDS.temperature}
                />
                <MetricBar
                  label="Utilization"
                  value={metrics.utilization}
                  max={100}
                  unit="%"
                  thresholds={{ warning: THRESHOLDS.utilization.high - 5, critical: THRESHOLDS.utilization.high }}
                />
                <MetricBar
                  label="Memory"
                  value={memoryPercent}
                  max={100}
                  unit="%"
                  subtitle={`${(metrics.memoryUsed / 1024).toFixed(1)}/${(metrics.memoryTotal / 1024).toFixed(1)} GB`}
                  thresholds={THRESHOLDS.memory}
                />
                <MetricBar
                  label="Power"
                  value={powerPercent}
                  max={100}
                  unit="%"
                  subtitle={`${metrics.powerDraw}/${metrics.powerLimit}W`}
                  thresholds={THRESHOLDS.power}
                />
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <InfoItem label="Fan Speed" value={`${metrics.fanSpeed}%`} />
                <InfoItem label="Clock" value={`${metrics.clockSpeed}/${metrics.clockSpeedMax} MHz`} />
                <InfoItem label="Driver" value={metrics.driverVersion} />
                <InfoItem label="Uptime" value={formatUptime(health.uptime)} />
              </div>

              {/* Mini Sparkline Charts */}
              <div className="grid grid-cols-3 gap-4">
                <SparklineChart
                  label="Temp History"
                  data={history.temperature}
                  color="#f59e0b"
                />
                <SparklineChart
                  label="Utilization"
                  data={history.utilization}
                  color="#3b82f6"
                />
                <SparklineChart
                  label="Memory"
                  data={history.memory}
                  color="#8b5cf6"
                />
              </div>

              {/* GPU Issues */}
              {health.issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-400">Active Issues</p>
                  {health.issues.map((issue, idx) => (
                    <IssueCard key={idx} issue={issue} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function GPUStatusIcon({ status }: { status: GPUHealth["status"] }) {
  const iconClass = "h-8 w-8";

  switch (status) {
    case "healthy":
      return (
        <div className="p-2 rounded-lg bg-green-500/20">
          <CheckCircle2 className={cn(iconClass, "text-green-400")} />
        </div>
      );
    case "warning":
      return (
        <div className="p-2 rounded-lg bg-yellow-500/20">
          <AlertTriangle className={cn(iconClass, "text-yellow-400")} />
        </div>
      );
    case "critical":
      return (
        <div className="p-2 rounded-lg bg-red-500/20 animate-pulse">
          <XCircle className={cn(iconClass, "text-red-400")} />
        </div>
      );
    case "offline":
      return (
        <div className="p-2 rounded-lg bg-gray-500/20">
          <Cpu className={cn(iconClass, "text-gray-400")} />
        </div>
      );
  }
}

interface MetricBadgeProps {
  icon: React.ElementType;
  value: string;
  status: "good" | "warning" | "critical";
}

function MetricBadge({ icon: Icon, value, status }: MetricBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon
        className={cn(
          "h-4 w-4",
          status === "good" && "text-green-400",
          status === "warning" && "text-yellow-400",
          status === "critical" && "text-red-400"
        )}
      />
      <span
        className={cn(
          status === "good" && "text-green-400",
          status === "warning" && "text-yellow-400",
          status === "critical" && "text-red-400"
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  subtitle?: string;
  thresholds: { warning: number; critical: number };
}

function MetricBar({ label, value, max, unit, subtitle, thresholds }: MetricBarProps) {
  const percent = Math.min((value / max) * 100, 100);
  const status =
    value >= thresholds.critical
      ? "critical"
      : value >= thresholds.warning
      ? "warning"
      : "good";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span
          className={cn(
            "font-medium",
            status === "good" && "text-white",
            status === "warning" && "text-yellow-400",
            status === "critical" && "text-red-400"
          )}
        >
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={cn(
            "h-full rounded-full",
            status === "good" && "bg-green-500",
            status === "warning" && "bg-yellow-500",
            status === "critical" && "bg-red-500"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-white/5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-white font-medium truncate">{value}</p>
    </div>
  );
}

interface SparklineChartProps {
  label: string;
  data: number[];
  color: string;
}

function SparklineChart({ label, data, color }: SparklineChartProps) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <div className="h-12 bg-white/5 rounded-lg p-1">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

interface IssueCardProps {
  issue: GPUHealthIssue;
}

function IssueCard({ issue }: IssueCardProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border",
        issue.severity === "critical"
          ? "bg-red-500/10 border-red-500/30"
          : "bg-yellow-500/10 border-yellow-500/30"
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            "h-4 w-4 flex-shrink-0 mt-0.5",
            issue.severity === "critical" ? "text-red-400" : "text-yellow-400"
          )}
        />
        <div>
          <p
            className={cn(
              "text-sm font-medium",
              issue.severity === "critical" ? "text-red-300" : "text-yellow-300"
            )}
          >
            {issue.message}
          </p>
          <p className="text-xs text-gray-400 mt-1">{issue.recommendation}</p>
        </div>
      </div>
    </div>
  );
}

interface GPUIssuesAlertProps {
  issues: (GPUHealthIssue & { gpuId: number; gpuName: string })[];
  showAll: boolean;
  onToggleShowAll: () => void;
}

function GPUIssuesAlert({ issues, showAll, onToggleShowAll }: GPUIssuesAlertProps) {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const displayIssues = showAll ? issues : issues.slice(0, 3);

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="font-medium text-yellow-300">GPU Health Issues Detected</p>
            <p className="text-sm text-gray-400">
              {criticalCount > 0 && `${criticalCount} critical`}
              {criticalCount > 0 && warningCount > 0 && ", "}
              {warningCount > 0 && `${warningCount} warnings`}
            </p>
          </div>
        </div>
        {issues.length > 3 && (
          <button
            onClick={onToggleShowAll}
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            {showAll ? "Show less" : `Show all (${issues.length})`}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayIssues.map((issue, idx) => (
          <div
            key={idx}
            className={cn(
              "p-2 rounded-lg flex items-center gap-3",
              issue.severity === "critical" ? "bg-red-500/10" : "bg-yellow-500/10"
            )}
          >
            <span className="text-xs text-gray-400 w-16">GPU {issue.gpuId}</span>
            <span
              className={cn(
                "text-sm",
                issue.severity === "critical" ? "text-red-300" : "text-yellow-300"
              )}
            >
              {issue.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CompactGPUMonitorProps {
  gpuData: GPUData[];
  overallHealth: GPUHealth["status"];
  issueCount: number;
  onExpand: () => void;
  className?: string;
}

function CompactGPUMonitor({
  gpuData,
  overallHealth,
  issueCount,
  onExpand,
  className,
}: CompactGPUMonitorProps) {
  return (
    <button
      onClick={onExpand}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all hover:bg-white/5",
        overallHealth === "healthy" && "border-green-500/20",
        overallHealth === "warning" && "border-yellow-500/20",
        overallHealth === "critical" && "border-red-500/20",
        overallHealth === "offline" && "border-gray-500/20",
        className
      )}
    >
      <GPUStatusIcon status={overallHealth} />
      <div className="text-left">
        <p className="text-sm font-medium text-white">
          {gpuData.length} GPU{gpuData.length !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-gray-400">
          {issueCount > 0 ? `${issueCount} issues` : "All healthy"}
        </p>
      </div>
    </button>
  );
}

// ============================================
// Helper Functions
// ============================================

function getTemperatureStatus(temp: number): "good" | "warning" | "critical" {
  if (temp >= THRESHOLDS.temperature.critical) return "critical";
  if (temp >= THRESHOLDS.temperature.warning) return "warning";
  return "good";
}

function getUtilizationStatus(util: number): "good" | "warning" | "critical" {
  if (util >= THRESHOLDS.utilization.high) return "warning";
  if (util < THRESHOLDS.utilization.low) return "warning";
  return "good";
}

function getMemoryStatus(memPercent: number): "good" | "warning" | "critical" {
  if (memPercent >= THRESHOLDS.memory.critical) return "critical";
  if (memPercent >= THRESHOLDS.memory.warning) return "warning";
  return "good";
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
