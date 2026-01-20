"use client";

import { ReactNode, forwardRef, HTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import Link from "next/link";
import { ChevronRight, ExternalLink, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Base Card
// ============================================================================

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined" | "glass" | "gradient";
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", padding = "md", hover = false, className, children, ...props }, ref) => {
    const variants = {
      default: "bg-surface-card border border-surface-border",
      elevated: "bg-surface-elevated border border-surface-border shadow-lg",
      outlined: "bg-transparent border-2 border-surface-border",
      glass: "glass-card",
      gradient: "bg-gradient-to-br from-surface-card to-surface-elevated border border-surface-border",
    };

    const paddings = {
      none: "",
      sm: "p-3",
      md: "p-4 sm:p-6",
      lg: "p-6 sm:p-8",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl transition-all duration-200",
          variants[variant],
          paddings[padding],
          hover && "hover:border-brand-500/50 hover:shadow-lg hover:shadow-brand-500/5",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

// ============================================================================
// Interactive Card (with motion)
// ============================================================================

interface InteractiveCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: "default" | "elevated" | "glass";
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

export const InteractiveCard = forwardRef<HTMLDivElement, InteractiveCardProps>(
  ({ variant = "default", padding = "md", className, children, ...props }, ref) => {
    const variants = {
      default: "bg-surface-card border border-surface-border",
      elevated: "bg-surface-elevated border border-surface-border",
      glass: "glass-card",
    };

    const paddings = {
      none: "",
      sm: "p-3",
      md: "p-4 sm:p-6",
      lg: "p-6 sm:p-8",
    };

    return (
      <motion.div
        ref={ref}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={cn(
          "rounded-xl cursor-pointer transition-colors duration-200",
          variants[variant],
          paddings[padding],
          "hover:border-brand-500/50 hover:shadow-lg hover:shadow-brand-500/10",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

InteractiveCard.displayName = "InteractiveCard";

// ============================================================================
// Link Card
// ============================================================================

interface LinkCardProps {
  href: string;
  external?: boolean;
  variant?: "default" | "elevated" | "glass";
  padding?: "none" | "sm" | "md" | "lg";
  showArrow?: boolean;
  children: ReactNode;
  className?: string;
}

export function LinkCard({
  href,
  external = false,
  variant = "default",
  padding = "md",
  showArrow = true,
  children,
  className,
}: LinkCardProps) {
  const variants = {
    default: "bg-surface-card border border-surface-border",
    elevated: "bg-surface-elevated border border-surface-border",
    glass: "glass-card",
  };

  const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4 sm:p-6",
    lg: "p-6 sm:p-8",
  };

  const content = (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        "rounded-xl transition-all duration-200 group",
        variants[variant],
        paddings[padding],
        "hover:border-brand-500/50 hover:shadow-lg",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">{children}</div>
        {showArrow && (
          <div className="ml-4 text-gray-500 group-hover:text-brand-400 transition-colors">
            {external ? (
              <ExternalLink className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return <Link href={href}>{content}</Link>;
}

// ============================================================================
// Stat Card
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    period?: string;
  };
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  icon,
  trend,
  loading = false,
  className,
}: StatCardProps) {
  const trendColors = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-gray-400",
  };

  const determinedTrend = trend || (change?.value && change.value > 0 ? "up" : change?.value && change.value < 0 ? "down" : "neutral");

  return (
    <Card variant="glass" className={cn("relative overflow-hidden", className)}>
      {/* Background glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-400">{title}</p>
            {loading ? (
              <div className="skeleton h-8 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-white mt-1">{value}</p>
            )}
          </div>
          {icon && (
            <div className="p-2 rounded-lg bg-brand-500/20 text-brand-400">
              {icon}
            </div>
          )}
        </div>

        {change && !loading && (
          <div className="flex items-center gap-1 mt-3">
            <span className={cn("text-sm font-medium", trendColors[determinedTrend])}>
              {change.value > 0 ? "+" : ""}{change.value}%
            </span>
            {change.period && (
              <span className="text-xs text-gray-500">{change.period}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Feature Card
// ============================================================================

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  variant?: "default" | "highlighted";
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  action,
  variant = "default",
  className,
}: FeatureCardProps) {
  const isHighlighted = variant === "highlighted";

  return (
    <Card
      variant="glass"
      hover
      className={cn(
        "relative overflow-hidden group",
        isHighlighted && "border-brand-500/50",
        className
      )}
    >
      {/* Gradient background for highlighted */}
      {isHighlighted && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent" />
      )}

      <div className="relative">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
            isHighlighted ? "bg-brand-500 text-white" : "bg-brand-500/20 text-brand-400"
          )}
        >
          {icon}
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">{description}</p>

        {action && (
          action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
              {action.label}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
              {action.label}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          )
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Info Card
// ============================================================================

interface InfoCardProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function InfoCard({
  variant = "info",
  title,
  children,
  icon,
  dismissible = false,
  onDismiss,
  className,
}: InfoCardProps) {
  const variantStyles = {
    info: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
      icon: "bg-blue-500/20",
    },
    success: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      icon: "bg-emerald-500/20",
    },
    warning: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-400",
      icon: "bg-orange-500/20",
    },
    error: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      icon: "bg-red-500/20",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        styles.bg,
        styles.border,
        className
      )}
    >
      <div className="flex gap-3">
        {icon && (
          <div className={cn("p-2 rounded-lg h-fit", styles.icon, styles.text)}>
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={cn("font-medium mb-1", styles.text)}>{title}</h4>
          )}
          <div className="text-sm text-gray-300">{children}</div>
        </div>
        {dismissible && (
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-white transition-colors"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Card Grid
// ============================================================================

interface CardGridProps {
  columns?: 1 | 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}

export function CardGrid({
  columns = 3,
  gap = "md",
  children,
  className,
}: CardGridProps) {
  const columnClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const gapClasses = {
    sm: "gap-3",
    md: "gap-4 sm:gap-6",
    lg: "gap-6 sm:gap-8",
  };

  return (
    <div className={cn("grid", columnClasses[columns], gapClasses[gap], className)}>
      {children}
    </div>
  );
}

// ============================================================================
// Card Header/Body/Footer
// ============================================================================

interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardSectionProps) {
  return (
    <div className={cn("pb-4 border-b border-surface-border", className)}>
      {children}
    </div>
  );
}

export function CardBody({ children, className }: CardSectionProps) {
  return <div className={cn("py-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSectionProps) {
  return (
    <div className={cn("pt-4 border-t border-surface-border", className)}>
      {children}
    </div>
  );
}

// ============================================================================
// Metric Card (compact stat)
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  subValue,
  icon,
  loading = false,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl",
        "bg-surface-elevated/50 border border-surface-border/50",
        className
      )}
    >
      {icon && (
        <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        {loading ? (
          <div className="skeleton h-5 w-16 mt-0.5" />
        ) : (
          <p className="text-base font-semibold text-white truncate">{value}</p>
        )}
        {subValue && (
          <p className="text-xs text-gray-400 truncate">{subValue}</p>
        )}
      </div>
    </div>
  );
}
