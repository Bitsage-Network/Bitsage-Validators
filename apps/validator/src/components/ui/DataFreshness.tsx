"use client";

/**
 * Data Freshness Indicator Component
 *
 * Shows when data was last updated and provides visual feedback
 * on data staleness. Includes LIVE badge for real-time data.
 */

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, Clock, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataFreshnessProps {
  /** Timestamp of last update (ms) */
  lastUpdated: number | null;
  /** Whether data is being fetched */
  isLoading?: boolean;
  /** Whether connected to real-time source */
  isLive?: boolean;
  /** Stale threshold in ms (default 30s) */
  staleThreshold?: number;
  /** Error threshold in ms (default 2min) */
  errorThreshold?: number;
  /** Callback to refresh data */
  onRefresh?: () => void;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

export function DataFreshness({
  lastUpdated,
  isLoading = false,
  isLive = false,
  staleThreshold = 30000,
  errorThreshold = 120000,
  onRefresh,
  compact = false,
  className,
}: DataFreshnessProps) {
  const [now, setNow] = useState(Date.now());

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { status, timeAgo, color } = useMemo(() => {
    if (lastUpdated === null) {
      return {
        status: "unknown" as const,
        timeAgo: "No data",
        color: "text-gray-500",
      };
    }

    const age = now - lastUpdated;

    if (age < staleThreshold) {
      return {
        status: "fresh" as const,
        timeAgo: formatTimeAgo(age),
        color: "text-green-400",
      };
    }

    if (age < errorThreshold) {
      return {
        status: "stale" as const,
        timeAgo: formatTimeAgo(age),
        color: "text-yellow-400",
      };
    }

    return {
      status: "error" as const,
      timeAgo: formatTimeAgo(age),
      color: "text-red-400",
    };
  }, [lastUpdated, now, staleThreshold, errorThreshold]);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {isLive && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[10px] font-bold uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
            </span>
            Live
          </span>
        )}
        <span className={cn("text-xs", color)}>{timeAgo}</span>
        {isLoading && (
          <RefreshCw className="h-3 w-3 text-gray-400 animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        className
      )}
    >
      {/* Live indicator */}
      {isLive ? (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <span className="text-xs font-medium text-green-400">LIVE</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-500/10 border border-gray-500/20">
          <WifiOff className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-400">Polling</span>
        </div>
      )}

      {/* Timestamp */}
      <div className="flex items-center gap-1.5">
        <Clock className={cn("h-3.5 w-3.5", color)} />
        <span className={cn("text-xs", color)}>
          {status === "unknown" ? "No data" : `Updated ${timeAgo}`}
        </span>
      </div>

      {/* Refresh button */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            "p-1 rounded hover:bg-white/5 transition-colors",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 text-gray-400", isLoading && "animate-spin")}
          />
        </button>
      )}
    </div>
  );
}

/**
 * Live Connection Badge
 *
 * Shows WebSocket connection status with visual feedback.
 */
interface LiveBadgeProps {
  isConnected: boolean;
  connectionState?: "connecting" | "connected" | "disconnected" | "error";
  onReconnect?: () => void;
  className?: string;
}

export function LiveBadge({
  isConnected,
  connectionState = isConnected ? "connected" : "disconnected",
  onReconnect,
  className,
}: LiveBadgeProps) {
  const config = useMemo(() => {
    switch (connectionState) {
      case "connecting":
        return {
          icon: Radio,
          label: "Connecting",
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/20",
          textColor: "text-yellow-400",
          pulse: true,
        };
      case "connected":
        return {
          icon: Wifi,
          label: "Live",
          bgColor: "bg-green-500/10",
          borderColor: "border-green-500/20",
          textColor: "text-green-400",
          pulse: true,
        };
      case "error":
        return {
          icon: WifiOff,
          label: "Error",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/20",
          textColor: "text-red-400",
          pulse: false,
        };
      case "disconnected":
      default:
        return {
          icon: WifiOff,
          label: "Offline",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/20",
          textColor: "text-gray-400",
          pulse: false,
        };
    }
  }, [connectionState]);

  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full border",
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              connectionState === "connected" ? "bg-green-400" : "bg-yellow-400"
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            connectionState === "connected"
              ? "bg-green-400"
              : connectionState === "connecting"
              ? "bg-yellow-400"
              : connectionState === "error"
              ? "bg-red-400"
              : "bg-gray-400"
          )}
        />
      </span>
      <span className={cn("text-xs font-medium uppercase", config.textColor)}>
        {config.label}
      </span>
      {!isConnected && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
          title="Reconnect"
        >
          <RefreshCw className={cn("h-3 w-3", config.textColor)} />
        </button>
      )}
    </div>
  );
}

/**
 * Data Status Banner
 *
 * Full-width banner for important data status messages.
 */
interface DataStatusBannerProps {
  type: "live" | "stale" | "error" | "offline";
  message?: string;
  onDismiss?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

export function DataStatusBanner({
  type,
  message,
  onDismiss,
  onAction,
  actionLabel,
  className,
}: DataStatusBannerProps) {
  const config = useMemo(() => {
    switch (type) {
      case "live":
        return {
          icon: Wifi,
          defaultMessage: "Connected to real-time data",
          bgColor: "bg-green-500/10",
          borderColor: "border-green-500/20",
          textColor: "text-green-400",
        };
      case "stale":
        return {
          icon: Clock,
          defaultMessage: "Data may be outdated. Last updated more than 30 seconds ago.",
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/20",
          textColor: "text-yellow-400",
        };
      case "error":
        return {
          icon: WifiOff,
          defaultMessage: "Failed to fetch latest data. Showing cached results.",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/20",
          textColor: "text-red-400",
        };
      case "offline":
        return {
          icon: WifiOff,
          defaultMessage: "You appear to be offline. Some features may be unavailable.",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/20",
          textColor: "text-gray-400",
        };
    }
  }, [type]);

  const Icon = config.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "flex items-center justify-between px-4 py-2 rounded-lg border",
          config.bgColor,
          config.borderColor,
          className
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("h-4 w-4", config.textColor)} />
          <span className={cn("text-sm", config.textColor)}>
            {message || config.defaultMessage}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onAction && actionLabel && (
            <button
              onClick={onAction}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                "bg-white/10 hover:bg-white/20",
                config.textColor
              )}
            >
              {actionLabel}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <span className={cn("text-xs", config.textColor)}>×</span>
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper function
function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
