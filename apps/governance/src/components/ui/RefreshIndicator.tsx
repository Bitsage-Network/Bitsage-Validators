"use client";

import { useState, useCallback } from "react";
import { RefreshCw, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface RefreshIndicatorProps {
  isRefreshing: boolean;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
  className?: string;
  showLastUpdated?: boolean;
  size?: "sm" | "md";
}

/**
 * Refresh indicator with last updated timestamp
 */
export function RefreshIndicator({
  isRefreshing,
  onRefresh,
  lastUpdated,
  className,
  showLastUpdated = true,
  size = "md",
}: RefreshIndicatorProps) {
  const formatLastUpdated = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 10) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const sizes = {
    sm: "text-xs gap-1.5",
    md: "text-sm gap-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
  };

  return (
    <div className={cn("flex items-center", sizes[size], className)}>
      {showLastUpdated && lastUpdated && (
        <span className="text-gray-500">
          Updated {formatLastUpdated(lastUpdated)}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          "p-1.5 rounded-lg transition-colors",
          "text-gray-400 hover:text-white hover:bg-surface-elevated",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
        title="Refresh data"
      >
        <RefreshCw
          className={cn(
            iconSizes[size],
            isRefreshing && "animate-spin"
          )}
        />
      </button>
    </div>
  );
}

interface AutoRefreshBadgeProps {
  isEnabled: boolean;
  interval?: number; // in seconds
  onToggle?: () => void;
  className?: string;
}

/**
 * Badge showing auto-refresh status
 */
export function AutoRefreshBadge({
  isEnabled,
  interval = 30,
  onToggle,
  className,
}: AutoRefreshBadgeProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors",
        isEnabled
          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          : "bg-surface-elevated text-gray-400 border border-surface-border",
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          isEnabled ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
        )}
      />
      {isEnabled ? `Auto ${interval}s` : "Auto off"}
    </button>
  );
}

interface DataFreshnessProps {
  lastUpdated: Date | null;
  staleThreshold?: number; // in seconds
  className?: string;
}

/**
 * Visual indicator of data freshness
 */
export function DataFreshness({
  lastUpdated,
  staleThreshold = 300, // 5 minutes
  className,
}: DataFreshnessProps) {
  if (!lastUpdated) return null;

  const now = new Date();
  const age = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
  const isFresh = age < 60;
  const isStale = age > staleThreshold;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        isFresh
          ? "text-emerald-400"
          : isStale
          ? "text-orange-400"
          : "text-gray-400",
        className
      )}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          isFresh
            ? "bg-emerald-400"
            : isStale
            ? "bg-orange-400 animate-pulse"
            : "bg-gray-400"
        )}
      />
      {isFresh ? "Live" : isStale ? "Stale data" : "Recent"}
    </div>
  );
}

interface SyncStatusProps {
  isSyncing: boolean;
  isSynced: boolean;
  lastSyncTime?: Date;
  error?: string;
  onSync?: () => void;
  className?: string;
}

/**
 * Full sync status display
 */
export function SyncStatus({
  isSyncing,
  isSynced,
  lastSyncTime,
  error,
  onSync,
  className,
}: SyncStatusProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <AnimatePresence mode="wait">
        {isSyncing ? (
          <motion.div
            key="syncing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-sm text-brand-400"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            Syncing...
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-sm text-red-400"
          >
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Sync failed
          </motion.div>
        ) : isSynced ? (
          <motion.div
            key="synced"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-sm text-emerald-400"
          >
            <CheckCircle className="w-4 h-4" />
            Synced
          </motion.div>
        ) : null}
      </AnimatePresence>

      {lastSyncTime && !isSyncing && (
        <span className="text-xs text-gray-500">
          {new Date(lastSyncTime).toLocaleTimeString()}
        </span>
      )}

      {onSync && !isSyncing && (
        <button
          onClick={onSync}
          className="text-xs text-brand-400 hover:text-brand-300"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
