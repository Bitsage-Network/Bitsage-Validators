"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "brand";
  size?: "sm" | "md" | "lg";
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}

/**
 * Status badge component
 */
export function Badge({
  children,
  variant = "default",
  size = "md",
  className,
  dot = false,
  pulse = false,
}: BadgeProps) {
  const variants = {
    default: "bg-surface-elevated text-gray-300 border-surface-border",
    success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    warning: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    brand: "bg-brand-500/20 text-brand-400 border-brand-500/30",
  };

  const sizes = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  const dotColors = {
    default: "bg-gray-400",
    success: "bg-emerald-400",
    warning: "bg-orange-400",
    error: "bg-red-400",
    info: "bg-blue-400",
    brand: "bg-brand-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColors[variant],
            pulse && "animate-pulse"
          )}
        />
      )}
      {children}
    </span>
  );
}

interface NotificationBadgeProps {
  count?: number;
  max?: number;
  showZero?: boolean;
  variant?: "default" | "error" | "brand";
  size?: "sm" | "md";
  className?: string;
}

/**
 * Notification count badge (for icons, nav items, etc.)
 */
export function NotificationBadge({
  count = 0,
  max = 99,
  showZero = false,
  variant = "error",
  size = "sm",
  className,
}: NotificationBadgeProps) {
  if (!showZero && count === 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  const variants = {
    default: "bg-gray-500 text-white",
    error: "bg-red-500 text-white",
    brand: "bg-brand-500 text-white",
  };

  const sizes = {
    sm: "min-w-[16px] h-4 text-[10px] px-1",
    md: "min-w-[20px] h-5 text-xs px-1.5",
  };

  return (
    <motion.span
      key={count}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "absolute -top-1 -right-1 flex items-center justify-center rounded-full font-bold",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {displayCount}
    </motion.span>
  );
}

interface StatusDotProps {
  status: "online" | "offline" | "busy" | "away" | "active" | "inactive";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

/**
 * Status indicator dot
 */
export function StatusDot({
  status,
  size = "md",
  pulse = false,
  className,
}: StatusDotProps) {
  const colors = {
    online: "bg-emerald-400",
    offline: "bg-gray-500",
    busy: "bg-red-400",
    away: "bg-orange-400",
    active: "bg-emerald-400",
    inactive: "bg-gray-500",
  };

  const sizes = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  const shouldPulse = pulse || status === "online" || status === "active";

  return (
    <span className={cn("relative", className)}>
      <span
        className={cn(
          "rounded-full",
          colors[status],
          sizes[size],
          shouldPulse && "animate-pulse"
        )}
      />
      {shouldPulse && (
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-40 animate-ping",
            colors[status]
          )}
        />
      )}
    </span>
  );
}

interface LiveBadgeProps {
  isLive: boolean;
  label?: string;
  className?: string;
}

/**
 * Live indicator badge
 */
export function LiveBadge({
  isLive,
  label = "Live",
  className,
}: LiveBadgeProps) {
  return (
    <AnimatePresence>
      {isLive && (
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
            "bg-emerald-500/20 text-emerald-400 text-xs font-medium",
            "border border-emerald-500/30",
            className
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

interface CountBadgeProps {
  count: number;
  label?: string;
  variant?: "default" | "success" | "brand";
  className?: string;
}

/**
 * Count badge with label
 */
export function CountBadge({
  count,
  label,
  variant = "default",
  className,
}: CountBadgeProps) {
  const variants = {
    default: "bg-surface-elevated text-gray-300",
    success: "bg-emerald-500/20 text-emerald-400",
    brand: "bg-brand-500/20 text-brand-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
    >
      <span className="font-bold">{count.toLocaleString()}</span>
      {label && <span className="text-gray-500">{label}</span>}
    </span>
  );
}

interface NewBadgeProps {
  className?: string;
}

/**
 * "New" indicator badge
 */
export function NewBadge({ className }: NewBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
        "bg-gradient-to-r from-brand-500 to-accent-purple text-white",
        className
      )}
    >
      New
    </span>
  );
}

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Verified checkmark badge
 */
export function VerifiedBadge({ className, size = "md" }: VerifiedBadgeProps) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "bg-brand-500 text-white",
        sizes[size],
        className
      )}
      title="Verified"
    >
      <svg
        className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}
