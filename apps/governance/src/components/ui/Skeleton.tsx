"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton component with shimmer animation
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton", className)} />;
}

/**
 * Skeleton for stat cards (used in dashboard, earnings, etc.)
 */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("glass-card p-5", className)}>
      <div className="flex items-center gap-3 mb-3">
        <div className="skeleton-circle w-10 h-10" />
        <div className="skeleton-text w-24" />
      </div>
      <div className="skeleton h-8 w-32 mb-2" />
      <div className="skeleton-text w-20" />
    </div>
  );
}

/**
 * Skeleton for text content with configurable lines
 */
interface SkeletonTextProps extends SkeletonProps {
  lines?: number;
}

export function SkeletonText({ lines = 1, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton-text",
            // Make last line shorter for natural look
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for table rows
 */
interface SkeletonTableRowProps extends SkeletonProps {
  columns?: number;
}

export function SkeletonTableRow({ columns = 5, className }: SkeletonTableRowProps) {
  return (
    <tr className={cn("border-b border-surface-border/30", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <div className={cn(
            "skeleton-text",
            i === 0 ? "w-32" : i === columns - 1 ? "w-16" : "w-24"
          )} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton for multiple table rows
 */
interface SkeletonTableProps extends SkeletonProps {
  rows?: number;
  columns?: number;
}

export function SkeletonTable({ rows = 5, columns = 5, className }: SkeletonTableProps) {
  return (
    <tbody className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </tbody>
  );
}

/**
 * Skeleton for charts/graphs
 */
export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={cn("glass-card p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="skeleton-text w-32" />
        <div className="flex gap-2">
          <div className="skeleton w-16 h-6 rounded-lg" />
          <div className="skeleton w-16 h-6 rounded-lg" />
        </div>
      </div>
      {/* Chart area */}
      <div className="h-64 flex items-end gap-2 px-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 skeleton rounded-t"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between mt-4 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-text w-8" />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for avatar/profile pictures
 */
interface SkeletonAvatarProps extends SkeletonProps {
  size?: "sm" | "md" | "lg";
}

export function SkeletonAvatar({ size = "md", className }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-16 h-16",
  };

  return <div className={cn("skeleton-circle", sizeClasses[size], className)} />;
}

/**
 * Skeleton for list items (activity feed, history, etc.)
 */
export function SkeletonListItem({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 p-4 border-b border-surface-border/30", className)}>
      <div className="skeleton-circle w-10 h-10" />
      <div className="flex-1 space-y-2">
        <div className="skeleton-text w-48" />
        <div className="skeleton-text w-32" />
      </div>
      <div className="skeleton-text w-16" />
    </div>
  );
}

/**
 * Skeleton for multiple list items
 */
interface SkeletonListProps extends SkeletonProps {
  items?: number;
}

export function SkeletonList({ items = 5, className }: SkeletonListProps) {
  return (
    <div className={className}>
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for stat grid (4 cards in a row)
 */
export function SkeletonStatGrid({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for dashboard page
 */
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <SkeletonStatGrid />

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart/Main content */}
        <div className="lg:col-span-2">
          <SkeletonChart />
        </div>

        {/* Activity/Side panel */}
        <div className="glass-card">
          <div className="p-4 border-b border-surface-border">
            <div className="skeleton-text w-32" />
          </div>
          <SkeletonList items={5} />
        </div>
      </div>
    </div>
  );
}
