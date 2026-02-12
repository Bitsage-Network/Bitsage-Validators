"use client";

/**
 * Data Source Indicator
 *
 * Shows users when data is live vs mock/demo/fallback.
 * Used for transparency about data quality throughout the app.
 */

import React from "react";
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  Database,
  Cloud,
  CloudOff,
  RefreshCw,
  Info,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export type DataSourceType =
  | "live"      // Real-time from WebSocket/API
  | "cached"    // From local cache
  | "mock"      // Mock/placeholder data
  | "demo"      // Demo mode (no wallet connected)
  | "fallback"  // API failed, using fallback
  | "offline"   // No connection
  | "preview";  // Feature preview (coming soon)

interface DataSourceIndicatorProps {
  source: DataSourceType;
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  onRefresh?: () => void;
  lastUpdated?: Date;
}

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_CONFIG: Record<DataSourceType, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  live: {
    icon: Wifi,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
    label: "Live",
    description: "Real-time data from network",
  },
  cached: {
    icon: Database,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    label: "Cached",
    description: "Data from local cache",
  },
  mock: {
    icon: FlaskConical,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    label: "Sample",
    description: "Sample data for preview",
  },
  demo: {
    icon: FlaskConical,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    label: "Demo",
    description: "Demo mode - connect wallet for real data",
  },
  fallback: {
    icon: AlertTriangle,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    label: "Fallback",
    description: "Using fallback data - API unavailable",
  },
  offline: {
    icon: WifiOff,
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    label: "Offline",
    description: "No connection to network",
  },
  preview: {
    icon: FlaskConical,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    label: "Preview",
    description: "Feature preview - coming soon",
  },
};

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-xs px-2 py-1 gap-1.5",
  lg: "text-sm px-3 py-1.5 gap-2",
};

const ICON_SIZES = {
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

// ============================================================================
// Component
// ============================================================================

export function DataSourceIndicator({
  source,
  label,
  showLabel = true,
  size = "sm",
  className = "",
  onRefresh,
  lastUpdated,
}: DataSourceIndicatorProps) {
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  return (
    <div
      className={`
        inline-flex items-center rounded-full font-medium
        ${SIZE_CLASSES[size]}
        ${config.bgColor}
        ${config.color}
        ${className}
      `}
      title={`${config.description}${lastUpdated ? ` • Updated ${formatTimeAgo(lastUpdated)}` : ""}`}
    >
      <Icon className={`${ICON_SIZES[size]} ${source === "live" ? "animate-pulse" : ""}`} />
      {showLabel && (
        <span>{label || config.label}</span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-1 hover:opacity-80 transition-opacity"
          title="Refresh data"
        >
          <RefreshCw className={ICON_SIZES[size]} />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Banner Variant
// ============================================================================

interface DataSourceBannerProps {
  source: DataSourceType;
  message?: string;
  onDismiss?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

export function DataSourceBanner({
  source,
  message,
  onDismiss,
  onAction,
  actionLabel,
  className = "",
}: DataSourceBannerProps) {
  const config = SOURCE_CONFIG[source];
  const Icon = config.icon;

  // Don't show banner for live data
  if (source === "live") return null;

  return (
    <div
      className={`
        flex items-center justify-between gap-4 px-4 py-3 rounded-lg
        ${config.bgColor} border border-${config.color.replace("text-", "")}/30
        ${className}
      `}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${config.color}`} />
        <div>
          <p className={`text-sm font-medium ${config.color}`}>
            {config.label} Mode
          </p>
          <p className="text-xs text-gray-400">
            {message || config.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            className={`
              text-xs font-medium px-3 py-1.5 rounded-lg
              ${config.bgColor} ${config.color}
              hover:opacity-80 transition-opacity
              border border-current
            `}
          >
            {actionLabel}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-white p-1"
            title="Dismiss"
          >
            <span className="sr-only">Dismiss</span>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Inline Status
// ============================================================================

interface DataStatusInlineProps {
  isLive: boolean;
  isMock?: boolean;
  isDemo?: boolean;
  lastUpdated?: Date;
  className?: string;
}

export function DataStatusInline({
  isLive,
  isMock,
  isDemo,
  lastUpdated,
  className = "",
}: DataStatusInlineProps) {
  const source: DataSourceType = isDemo
    ? "demo"
    : isMock
      ? "mock"
      : isLive
        ? "live"
        : "fallback";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <DataSourceIndicator source={source} size="sm" />
      {lastUpdated && isLive && (
        <span className="text-xs text-gray-500">
          Updated {formatTimeAgo(lastUpdated)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Connection Status Dot
// ============================================================================

interface ConnectionDotProps {
  isConnected: boolean;
  isLive?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ConnectionDot({
  isConnected,
  isLive = false,
  size = "sm",
  className = "",
}: ConnectionDotProps) {
  const dotSizes = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  return (
    <span
      className={`
        inline-block rounded-full
        ${dotSizes[size]}
        ${isConnected
          ? isLive
            ? "bg-emerald-400 animate-pulse"
            : "bg-emerald-400"
          : "bg-gray-500"
        }
        ${className}
      `}
      title={isConnected ? (isLive ? "Live" : "Connected") : "Disconnected"}
    />
  );
}

// ============================================================================
// Helper
// ============================================================================

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export type { DataSourceIndicatorProps, DataSourceBannerProps };
