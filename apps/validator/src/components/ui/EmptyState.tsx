"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
  compact?: boolean;
}

/**
 * Reusable empty state component with consistent styling and animations
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-12 px-6",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
        className={cn(
          "rounded-2xl mb-4 flex items-center justify-center",
          "bg-gradient-to-br from-surface-elevated to-surface-card",
          "border border-surface-border/50",
          compact ? "w-12 h-12 p-3" : "w-16 h-16 p-4"
        )}
      >
        <Icon className={cn(
          "text-gray-500",
          compact ? "w-6 h-6" : "w-8 h-8"
        )} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className={cn(
          "font-semibold text-white mb-2",
          compact ? "text-sm" : "text-base"
        )}
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "text-gray-400 max-w-sm",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {description}
      </motion.p>

      {(action || secondaryAction) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3 mt-5"
        >
          {action && (
            action.href ? (
              <Link
                href={action.href}
                className="btn-glow text-sm px-4 py-2 flex items-center gap-2"
              >
                {action.label}
              </Link>
            ) : (
              <button
                onClick={action.onClick}
                className="btn-glow text-sm px-4 py-2 flex items-center gap-2"
              >
                {action.label}
              </button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="btn-secondary text-sm px-4 py-2 flex items-center gap-2"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                onClick={secondaryAction.onClick}
                className="btn-secondary text-sm px-4 py-2 flex items-center gap-2"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * Inline empty state for tables and lists
 */
export function InlineEmptyState({
  icon: Icon,
  message,
  className,
}: {
  icon: LucideIcon;
  message: string;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-center gap-3 py-8 px-4 text-gray-400",
      className
    )}>
      <Icon className="w-5 h-5" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

/**
 * Empty state for filtered/search results
 */
export function NoResultsState({
  query,
  onClear,
  className,
}: {
  query?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-surface-elevated flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-white mb-2">
        No results found
      </h3>

      <p className="text-sm text-gray-400 max-w-sm">
        {query
          ? `We couldn't find any matches for "${query}". Try adjusting your search or filters.`
          : "No items match your current filters. Try adjusting your criteria."
        }
      </p>

      {onClear && (
        <button
          onClick={onClear}
          className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Clear filters
        </button>
      )}
    </motion.div>
  );
}

/**
 * Error state for failed data loads
 */
export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-white mb-2">
        {title}
      </h3>

      <p className="text-sm text-gray-400 max-w-sm mb-4">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary text-sm px-4 py-2"
        >
          Try again
        </button>
      )}
    </motion.div>
  );
}

/**
 * Coming soon state for features in development
 */
export function ComingSoonState({
  title,
  description = "This feature is coming soon. Stay tuned!",
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-white mb-2">
        {title}
      </h3>

      <p className="text-sm text-gray-400 max-w-sm">
        {description}
      </p>

      <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        In Development
      </div>
    </motion.div>
  );
}
