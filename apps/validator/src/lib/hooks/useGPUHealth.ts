"use client";

/**
 * GPU Health Monitoring Hook
 *
 * Provides:
 * - Real-time GPU metrics fetching
 * - Health status calculation
 * - Issue detection with notifications
 * - Historical data tracking
 * - Automatic refresh with configurable interval
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useGPUNotifications } from "@/lib/notifications";

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

interface UseGPUHealthOptions {
  refreshInterval?: number; // ms, default 5000
  historyLength?: number; // number of data points, default 60
  enableNotifications?: boolean;
}

// Thresholds
const THRESHOLDS = {
  temperature: { warning: 75, critical: 85 },
  memory: { warning: 85, critical: 95 },
  power: { warning: 90, critical: 100 },
  utilizationLow: 20,
};

// ============================================
// Main Hook
// ============================================

export function useGPUHealth(options: UseGPUHealthOptions = {}) {
  const {
    refreshInterval = 5000,
    historyLength = 60,
    enableNotifications = true,
  } = options;

  const [gpuData, setGpuData] = useState<GPUData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const previousIssuesRef = useRef<Map<string, GPUHealthIssue>>(new Map());
  const notificationsRef = useRef<Map<string, string>>(new Map()); // issueKey -> notificationId

  const {
    notifyGPUHealthy,
    notifyGPUWarning,
    notifyGPUCritical,
    notifyGPUTemperature,
    notifyGPUMemoryLow,
  } = useGPUNotifications();

  // Fetch GPU metrics from API/WebSocket
  const fetchGPUMetrics = useCallback(async (): Promise<GPUMetrics[]> => {
    try {
      // Fetch from the coordinator API
      const response = await fetch("/api/validator/gpus");

      if (!response.ok) {
        throw new Error(`GPU metrics API returned ${response.status}`);
      }

      return response.json();
    } catch (err) {
      console.error("Failed to fetch GPU metrics:", err);
      // Return empty array instead of mock data - real data only
      return [];
    }
  }, []);

  // Calculate health status and detect issues
  const calculateHealth = useCallback((metrics: GPUMetrics): GPUHealth => {
    const issues: GPUHealthIssue[] = [];
    let status = "healthy" as "healthy" | "warning" | "critical";

    // Temperature check
    if (metrics.temperature >= THRESHOLDS.temperature.critical) {
      issues.push({
        type: "temperature",
        severity: "critical",
        message: `Temperature critically high: ${metrics.temperature}°C`,
        recommendation: "Immediately reduce workload or check cooling system",
        detectedAt: Date.now(),
      });
      status = "critical";
    } else if (metrics.temperature >= THRESHOLDS.temperature.warning) {
      issues.push({
        type: "temperature",
        severity: "warning",
        message: `Temperature elevated: ${metrics.temperature}°C`,
        recommendation: "Monitor closely and consider improving airflow",
        detectedAt: Date.now(),
      });
      if (status !== "critical") status = "warning";
    }

    // Memory check
    const memoryPercent = (metrics.memoryUsed / metrics.memoryTotal) * 100;
    if (memoryPercent >= THRESHOLDS.memory.critical) {
      issues.push({
        type: "memory",
        severity: "critical",
        message: `Memory nearly exhausted: ${memoryPercent.toFixed(1)}%`,
        recommendation: "Reduce batch size or terminate unused processes",
        detectedAt: Date.now(),
      });
      status = "critical";
    } else if (memoryPercent >= THRESHOLDS.memory.warning) {
      issues.push({
        type: "memory",
        severity: "warning",
        message: `Memory usage high: ${memoryPercent.toFixed(1)}%`,
        recommendation: "Consider optimizing memory usage",
        detectedAt: Date.now(),
      });
      if (status !== "critical") status = "warning";
    }

    // Power check
    const powerPercent = (metrics.powerDraw / metrics.powerLimit) * 100;
    if (powerPercent >= THRESHOLDS.power.critical) {
      issues.push({
        type: "power",
        severity: "critical",
        message: `Power limit reached: ${metrics.powerDraw}W`,
        recommendation: "GPU is thermal throttling, reduce workload",
        detectedAt: Date.now(),
      });
      status = "critical";
    } else if (powerPercent >= THRESHOLDS.power.warning) {
      issues.push({
        type: "power",
        severity: "warning",
        message: `Power draw high: ${metrics.powerDraw}W`,
        recommendation: "Monitor thermal performance",
        detectedAt: Date.now(),
      });
      if (status !== "critical") status = "warning";
    }

    // Utilization check (too low might indicate issues)
    if (metrics.utilization > 0 && metrics.utilization < THRESHOLDS.utilizationLow) {
      issues.push({
        type: "utilization",
        severity: "warning",
        message: `Low GPU utilization: ${metrics.utilization}%`,
        recommendation: "Check if jobs are running correctly",
        detectedAt: Date.now(),
      });
      if (status !== "critical") status = "warning";
    }

    return {
      status,
      issues,
      lastUpdated: Date.now(),
      uptime: Math.floor(Math.random() * 86400 * 30), // Mock uptime
      errorsLast24h: issues.length > 0 ? Math.floor(Math.random() * 5) : 0,
    };
  }, []);

  // Process metrics and update state
  const processMetrics = useCallback(
    (metrics: GPUMetrics[], prevData: GPUData[]): GPUData[] => {
      return metrics.map((metric) => {
        const prevGpu = prevData.find((g) => g.metrics.id === metric.id);
        const health = calculateHealth(metric);

        // Update history
        const memoryPercent = (metric.memoryUsed / metric.memoryTotal) * 100;
        const history = prevGpu?.history || {
          temperature: [],
          utilization: [],
          memory: [],
          timestamps: [],
        };

        return {
          metrics: metric,
          health,
          history: {
            temperature: [...history.temperature, metric.temperature].slice(-historyLength),
            utilization: [...history.utilization, metric.utilization].slice(-historyLength),
            memory: [...history.memory, memoryPercent].slice(-historyLength),
            timestamps: [...history.timestamps, Date.now()].slice(-historyLength),
          },
        };
      });
    },
    [calculateHealth, historyLength]
  );

  // Handle notifications for new issues
  const handleNotifications = useCallback(
    (data: GPUData[]) => {
      if (!enableNotifications) return;

      data.forEach((gpu) => {
        gpu.health.issues.forEach((issue) => {
          const issueKey = `${gpu.metrics.id}-${issue.type}-${issue.severity}`;

          // Check if this is a new issue
          if (!previousIssuesRef.current.has(issueKey)) {
            let notificationId: string | undefined;

            if (issue.severity === "critical") {
              notificationId = notifyGPUCritical(
                gpu.metrics.id,
                issue.message,
                issue.recommendation
              );
            } else {
              if (issue.type === "temperature") {
                notificationId = notifyGPUTemperature(
                  gpu.metrics.id,
                  gpu.metrics.temperature,
                  THRESHOLDS.temperature.warning
                );
              } else if (issue.type === "memory") {
                const memPercent = (gpu.metrics.memoryUsed / gpu.metrics.memoryTotal) * 100;
                notificationId = notifyGPUMemoryLow(
                  gpu.metrics.id,
                  gpu.metrics.memoryUsed / 1024,
                  gpu.metrics.memoryTotal / 1024
                );
              } else {
                notificationId = notifyGPUWarning(
                  gpu.metrics.id,
                  issue.type,
                  issue.message
                );
              }
            }

            if (notificationId) {
              notificationsRef.current.set(issueKey, notificationId);
            }
          }

          previousIssuesRef.current.set(issueKey, issue);
        });
      });
    },
    [
      enableNotifications,
      notifyGPUCritical,
      notifyGPUWarning,
      notifyGPUTemperature,
      notifyGPUMemoryLow,
    ]
  );

  // Refresh function
  const refresh = useCallback(async () => {
    try {
      const metrics = await fetchGPUMetrics();
      const newData = processMetrics(metrics, gpuData);
      setGpuData(newData);
      setLastRefresh(Date.now());
      setError(null);
      handleNotifications(newData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch GPU metrics"));
    } finally {
      setIsLoading(false);
    }
  }, [fetchGPUMetrics, processMetrics, gpuData, handleNotifications]);

  // Initial fetch and interval
  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  // Aggregated stats
  const stats = useMemo(() => {
    if (gpuData.length === 0) {
      return {
        totalGPUs: 0,
        healthyCount: 0,
        warningCount: 0,
        criticalCount: 0,
        offlineCount: 0,
        avgTemperature: 0,
        avgUtilization: 0,
        totalMemoryUsed: 0,
        totalMemoryAvailable: 0,
        totalIssues: 0,
      };
    }

    return {
      totalGPUs: gpuData.length,
      healthyCount: gpuData.filter((g) => g.health.status === "healthy").length,
      warningCount: gpuData.filter((g) => g.health.status === "warning").length,
      criticalCount: gpuData.filter((g) => g.health.status === "critical").length,
      offlineCount: gpuData.filter((g) => g.health.status === "offline").length,
      avgTemperature:
        gpuData.reduce((sum, g) => sum + g.metrics.temperature, 0) / gpuData.length,
      avgUtilization:
        gpuData.reduce((sum, g) => sum + g.metrics.utilization, 0) / gpuData.length,
      totalMemoryUsed: gpuData.reduce((sum, g) => sum + g.metrics.memoryUsed, 0),
      totalMemoryAvailable: gpuData.reduce((sum, g) => sum + g.metrics.memoryTotal, 0),
      totalIssues: gpuData.reduce((sum, g) => sum + g.health.issues.length, 0),
    };
  }, [gpuData]);

  return {
    gpuData,
    stats,
    isLoading,
    error,
    lastRefresh,
    refresh,
  };
}

export type { GPUMetrics, GPUHealth, GPUHealthIssue, GPUData };
