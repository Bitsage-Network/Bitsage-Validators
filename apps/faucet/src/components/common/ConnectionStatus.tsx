"use client";

/**
 * WebSocket Connection Status Indicator
 *
 * Visual indicator for real-time connection status:
 * - Animated status indicator
 * - Connection stats display
 * - Retry countdown
 * - Manual reconnect option
 */

import React, { useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import type { ConnectionState, ConnectionStats } from "@/lib/websocket/ReconnectingWebSocket";

// ============================================
// Types
// ============================================

interface ConnectionStatusProps {
  state: ConnectionState;
  stats?: ConnectionStats;
  retryCount?: number;
  maxRetries?: number;
  nextRetryMs?: number;
  queuedMessages?: number;
  onReconnect?: () => void;
  compact?: boolean;
  showStats?: boolean;
  className?: string;
}

// ============================================
// Constants
// ============================================

const STATE_CONFIG: Record<
  ConnectionState,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ElementType;
    animate?: boolean;
  }
> = {
  connected: {
    label: "Connected",
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500/30",
    icon: Wifi,
  },
  connecting: {
    label: "Connecting",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500/30",
    icon: RefreshCw,
    animate: true,
  },
  disconnected: {
    label: "Disconnected",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
    borderColor: "border-gray-500/30",
    icon: WifiOff,
  },
  reconnecting: {
    label: "Reconnecting",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500/30",
    icon: RefreshCw,
    animate: true,
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500/30",
    icon: AlertTriangle,
  },
};

// ============================================
// Utility Functions
// ============================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================
// Subcomponents
// ============================================

function RetryCountdown({
  nextRetryMs,
  retryCount,
  maxRetries,
}: {
  nextRetryMs: number;
  retryCount: number;
  maxRetries: number;
}) {
  const [countdown, setCountdown] = useState(nextRetryMs);

  useEffect(() => {
    setCountdown(nextRetryMs);
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [nextRetryMs]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <Clock className="w-4 h-4 text-yellow-400" />
      <span className="text-gray-400">
        Retry {retryCount}/{maxRetries} in{" "}
        <span className="text-yellow-400 font-mono">{(countdown / 1000).toFixed(1)}s</span>
      </span>
    </div>
  );
}

function StatsDisplay({ stats }: { stats: ConnectionStats }) {
  const uptime = stats.totalUptime;
  const uptimePercent =
    stats.lastConnectedAt && stats.lastDisconnectedAt
      ? (stats.totalUptime / (Date.now() - stats.lastConnectedAt)) * 100
      : stats.lastConnectedAt
        ? 100
        : 0;

  return (
    <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-800">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Uptime</span>
          <span className="text-gray-300">{formatDuration(uptime)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Connections</span>
          <span className="text-gray-300">{stats.successfulConnections}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Messages In</span>
          <span className="text-gray-300">{stats.messagesReceived.toLocaleString()}</span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Attempts</span>
          <span className="text-gray-300">{stats.connectAttempts}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Messages Out</span>
          <span className="text-gray-300">{stats.messagesSent.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Data</span>
          <span className="text-gray-300">
            {formatBytes(stats.bytesReceived + stats.bytesSent)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ConnectionStatus({
  state,
  stats,
  retryCount = 0,
  maxRetries = 10,
  nextRetryMs,
  queuedMessages = 0,
  onReconnect,
  compact = false,
  showStats = false,
  className = "",
}: ConnectionStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        title={`${config.label}${queuedMessages > 0 ? ` (${queuedMessages} queued)` : ""}`}
      >
        <div className="relative">
          <Icon
            className={`w-4 h-4 ${config.color} ${config.animate ? "animate-spin" : ""}`}
          />
          {state === "connected" && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        {queuedMessages > 0 && (
          <span className="text-xs text-yellow-400">{queuedMessages}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border ${config.borderColor} ${config.bgColor} ${className}`}
    >
      <div className="p-3">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Icon
                className={`w-5 h-5 ${config.color} ${config.animate ? "animate-spin" : ""}`}
              />
              {state === "connected" && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <div>
              <span className={`font-medium ${config.color}`}>{config.label}</span>
              {queuedMessages > 0 && (
                <span className="ml-2 text-sm text-yellow-400">
                  ({queuedMessages} queued)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(state === "failed" || state === "disconnected") && onReconnect && (
              <button
                onClick={onReconnect}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="Reconnect"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            {(showStats || stats) && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Retry Countdown */}
        {state === "reconnecting" && nextRetryMs !== undefined && (
          <div className="mt-2">
            <RetryCountdown
              nextRetryMs={nextRetryMs}
              retryCount={retryCount}
              maxRetries={maxRetries}
            />
          </div>
        )}

        {/* Failed State Message */}
        {state === "failed" && (
          <div className="mt-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-400">
              Connection failed after {retryCount} attempts.{" "}
              {onReconnect && (
                <button
                  onClick={onReconnect}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Try again
                </button>
              )}
            </p>
          </div>
        )}

        {/* Expanded Stats */}
        {expanded && stats && <StatsDisplay stats={stats} />}
      </div>
    </div>
  );
}

// ============================================
// Inline Status Badge
// ============================================

export function ConnectionStatusBadge({
  state,
  className = "",
}: {
  state: ConnectionState;
  className?: string;
}) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${config.bgColor} ${config.borderColor} border ${className}`}
    >
      <Icon className={`w-3 h-3 ${config.color} ${config.animate ? "animate-spin" : ""}`} />
      <span className={config.color}>{config.label}</span>
    </div>
  );
}

// ============================================
// Floating Connection Indicator
// ============================================

export function FloatingConnectionIndicator({
  state,
  retryCount,
  maxRetries,
  onReconnect,
}: {
  state: ConnectionState;
  retryCount?: number;
  maxRetries?: number;
  onReconnect?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  // Only show for non-connected states
  useEffect(() => {
    if (state !== "connected") {
      setVisible(true);
    } else {
      // Delay hiding to show "Connected" briefly
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!visible && state === "connected") return null;

  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg border ${config.borderColor} ${config.bgColor} shadow-lg backdrop-blur-sm transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <Icon className={`w-4 h-4 ${config.color} ${config.animate ? "animate-spin" : ""}`} />
      <span className={`text-sm ${config.color}`}>
        {config.label}
        {state === "reconnecting" && retryCount !== undefined && maxRetries !== undefined && (
          <span className="text-gray-400 ml-1">
            ({retryCount}/{maxRetries})
          </span>
        )}
      </span>
      {(state === "failed" || state === "disconnected") && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-2 p-1 text-gray-400 hover:text-white rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export type { ConnectionStatusProps };
