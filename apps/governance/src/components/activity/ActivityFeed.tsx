"use client";

/**
 * Real-Time Activity Feed Component
 *
 * Live activity stream with:
 * - Real-time updates
 * - Activity categorization
 * - Filtering by type
 * - Expandable details
 * - Time-based grouping
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Zap,
  DollarSign,
  Server,
  Shield,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter,
  Pause,
  Play,
  Bell,
  BellOff,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";

// ============================================
// Types
// ============================================

type ActivityType =
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "proof_generated"
  | "proof_verified"
  | "proof_failed"
  | "stake_added"
  | "stake_removed"
  | "reward_claimed"
  | "transaction_sent"
  | "transaction_received"
  | "gpu_online"
  | "gpu_offline"
  | "gpu_warning"
  | "vote_cast"
  | "proposal_created"
  | "system_alert"
  | "custom";

type ActivityStatus = "success" | "warning" | "error" | "info" | "pending";

interface ActivityItem {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  description?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  link?: string;
  read?: boolean;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
  showFilters?: boolean;
  showPauseButton?: boolean;
  isPaused?: boolean;
  onPauseChange?: (paused: boolean) => void;
  onActivityClick?: (activity: ActivityItem) => void;
  onMarkAsRead?: (activityId: string) => void;
  onClearAll?: () => void;
  groupByTime?: boolean;
  autoScroll?: boolean;
  className?: string;
}

// ============================================
// Constants
// ============================================

const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
}> = {
  job_started: { icon: Play, color: "text-blue-400", bgColor: "bg-blue-500/20", label: "Job" },
  job_completed: { icon: CheckCircle, color: "text-green-400", bgColor: "bg-green-500/20", label: "Job" },
  job_failed: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-500/20", label: "Job" },
  proof_generated: { icon: Shield, color: "text-purple-400", bgColor: "bg-purple-500/20", label: "Proof" },
  proof_verified: { icon: CheckCircle, color: "text-green-400", bgColor: "bg-green-500/20", label: "Proof" },
  proof_failed: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-500/20", label: "Proof" },
  stake_added: { icon: ArrowUpRight, color: "text-green-400", bgColor: "bg-green-500/20", label: "Stake" },
  stake_removed: { icon: ArrowDownRight, color: "text-orange-400", bgColor: "bg-orange-500/20", label: "Stake" },
  reward_claimed: { icon: DollarSign, color: "text-yellow-400", bgColor: "bg-yellow-500/20", label: "Reward" },
  transaction_sent: { icon: ArrowUpRight, color: "text-blue-400", bgColor: "bg-blue-500/20", label: "Transaction" },
  transaction_received: { icon: ArrowDownRight, color: "text-green-400", bgColor: "bg-green-500/20", label: "Transaction" },
  gpu_online: { icon: Cpu, color: "text-green-400", bgColor: "bg-green-500/20", label: "GPU" },
  gpu_offline: { icon: Cpu, color: "text-red-400", bgColor: "bg-red-500/20", label: "GPU" },
  gpu_warning: { icon: AlertTriangle, color: "text-yellow-400", bgColor: "bg-yellow-500/20", label: "GPU" },
  vote_cast: { icon: CheckCircle, color: "text-purple-400", bgColor: "bg-purple-500/20", label: "Governance" },
  proposal_created: { icon: Info, color: "text-blue-400", bgColor: "bg-blue-500/20", label: "Governance" },
  system_alert: { icon: AlertTriangle, color: "text-red-400", bgColor: "bg-red-500/20", label: "System" },
  custom: { icon: Activity, color: "text-gray-400", bgColor: "bg-gray-500/20", label: "Activity" },
};

const ACTIVITY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "jobs", label: "Jobs", types: ["job_started", "job_completed", "job_failed"] },
  { id: "proofs", label: "Proofs", types: ["proof_generated", "proof_verified", "proof_failed"] },
  { id: "staking", label: "Staking", types: ["stake_added", "stake_removed", "reward_claimed"] },
  { id: "transactions", label: "Transactions", types: ["transaction_sent", "transaction_received"] },
  { id: "gpu", label: "GPUs", types: ["gpu_online", "gpu_offline", "gpu_warning"] },
  { id: "governance", label: "Governance", types: ["vote_cast", "proposal_created"] },
  { id: "system", label: "System", types: ["system_alert"] },
];

// ============================================
// Utility Functions
// ============================================

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getTimeGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Older";
}

// ============================================
// Activity Item Component
// ============================================

interface ActivityItemProps {
  activity: ActivityItem;
  onClick?: () => void;
  onMarkAsRead?: () => void;
  showCategory?: boolean;
}

function ActivityItemComponent({
  activity,
  onClick,
  onMarkAsRead,
  showCategory = true,
}: ActivityItemProps) {
  const [expanded, setExpanded] = useState(false);
  const config = ACTIVITY_CONFIG[activity.type];
  const Icon = config.icon;

  const hasDetails = activity.metadata && Object.keys(activity.metadata).length > 0;

  return (
    <div
      className={`
        relative p-3 rounded-lg transition-colors cursor-pointer
        ${activity.read ? "bg-transparent" : "bg-gray-800/30"}
        hover:bg-gray-800/50
      `}
      onClick={onClick}
    >
      {/* Unread indicator */}
      {!activity.read && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r" />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-4 h-4 ${config.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {showCategory && (
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  {config.label}
                </span>
              )}
              <h4 className="text-sm font-medium text-white truncate">
                {activity.title}
              </h4>
              {activity.description && (
                <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                  {activity.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-500">
                {formatTimeAgo(activity.timestamp)}
              </span>
              {hasDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="p-1 text-gray-500 hover:text-white rounded"
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

          {/* Expanded Details */}
          {expanded && activity.metadata && (
            <div className="mt-3 p-2 bg-gray-800/50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(activity.metadata).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-gray-500">{key}:</span>{" "}
                    <span className="text-gray-300">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link */}
          {activity.link && (
            <a
              href={activity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
              onClick={(e) => e.stopPropagation()}
            >
              View details
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ActivityFeed({
  activities,
  maxItems = 50,
  showFilters = true,
  showPauseButton = true,
  isPaused = false,
  onPauseChange,
  onActivityClick,
  onMarkAsRead,
  onClearAll,
  groupByTime = true,
  autoScroll = false,
  className = "",
}: ActivityFeedProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Filter activities
  const filteredActivities = useMemo(() => {
    let filtered = activities;

    if (selectedCategory !== "all") {
      const category = ACTIVITY_CATEGORIES.find((c) => c.id === selectedCategory);
      if (category?.types) {
        filtered = filtered.filter((a) => category.types!.includes(a.type));
      }
    }

    return filtered.slice(0, maxItems);
  }, [activities, selectedCategory, maxItems]);

  // Group activities by time
  const groupedActivities = useMemo(() => {
    if (!groupByTime) return { ungrouped: filteredActivities };

    const groups: Record<string, ActivityItem[]> = {};
    filteredActivities.forEach((activity) => {
      const group = getTimeGroup(activity.timestamp);
      if (!groups[group]) groups[group] = [];
      groups[group].push(activity);
    });

    return groups;
  }, [filteredActivities, groupByTime]);

  // Auto-scroll to bottom on new activity
  useEffect(() => {
    if (autoScroll && !isPaused && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [activities.length, autoScroll, isPaused]);

  const unreadCount = activities.filter((a) => !a.read).length;

  return (
    <div className={`bg-gray-900/50 border border-gray-800 rounded-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-white">Activity</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Pause Button */}
          {showPauseButton && (
            <button
              onClick={() => onPauseChange?.(!isPaused)}
              className={`p-2 rounded-lg transition-colors ${
                isPaused
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title={isPaused ? "Resume live updates" : "Pause live updates"}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {/* Filter Button */}
          {showFilters && (
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`p-2 rounded-lg transition-colors ${
                selectedCategory !== "all"
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title="Filter activities"
            >
              <Filter className="w-4 h-4" />
            </button>
          )}

          {/* Clear All */}
          {onClearAll && activities.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      {showFilters && isFilterOpen && (
        <div className="flex items-center gap-1 p-2 border-b border-gray-800 overflow-x-auto">
          {ACTIVITY_CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      {/* Paused Banner */}
      {isPaused && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
          <Pause className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-400">Live updates paused</span>
        </div>
      )}

      {/* Activity List */}
      <div
        ref={feedRef}
        className="max-h-96 overflow-y-auto"
      >
        {filteredActivities.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No activities yet</p>
          </div>
        ) : groupByTime ? (
          Object.entries(groupedActivities).map(([group, items]) => (
            <div key={group}>
              <div className="sticky top-0 px-4 py-2 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {group}
                </span>
              </div>
              <div className="p-2 space-y-1">
                {items.map((activity) => (
                  <ActivityItemComponent
                    key={activity.id}
                    activity={activity}
                    onClick={() => onActivityClick?.(activity)}
                    onMarkAsRead={() => onMarkAsRead?.(activity.id)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="p-2 space-y-1">
            {filteredActivities.map((activity) => (
              <ActivityItemComponent
                key={activity.id}
                activity={activity}
                onClick={() => onActivityClick?.(activity)}
                onMarkAsRead={() => onMarkAsRead?.(activity.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// useActivityFeed Hook
// ============================================

export function useActivityFeed(maxItems = 100) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  const addActivity = useCallback(
    (activity: Omit<ActivityItem, "id" | "timestamp" | "read">) => {
      if (isPaused) return;

      const newActivity: ActivityItem = {
        ...activity,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        read: false,
      };

      setActivities((prev) => [newActivity, ...prev].slice(0, maxItems));
    },
    [isPaused, maxItems]
  );

  const markAsRead = useCallback((id: string) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setActivities((prev) => prev.map((a) => ({ ...a, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setActivities([]);
  }, []);

  return {
    activities,
    addActivity,
    markAsRead,
    markAllAsRead,
    clearAll,
    isPaused,
    setIsPaused,
  };
}

export type { ActivityType, ActivityStatus, ActivityItem, ActivityFeedProps };
