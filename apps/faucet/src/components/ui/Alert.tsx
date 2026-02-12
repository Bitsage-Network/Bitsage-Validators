"use client";

import { ReactNode, useState, useEffect, forwardRef, HTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  ChevronRight,
  ExternalLink,
  Bell,
  Megaphone,
  Rocket,
  Sparkles,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type AlertVariant = "info" | "success" | "warning" | "error";
type AlertSize = "sm" | "md" | "lg";

interface AlertAction {
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}

// ============================================================================
// Alert Component
// ============================================================================

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  size?: AlertSize;
  title?: string;
  icon?: ReactNode | false;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: AlertAction;
  children: ReactNode;
}

const variantConfig = {
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    iconBg: "bg-blue-500/20",
    icon: Info,
  },
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    iconBg: "bg-emerald-500/20",
    icon: CheckCircle,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    iconBg: "bg-amber-500/20",
    icon: AlertTriangle,
  },
  error: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    iconBg: "bg-red-500/20",
    icon: AlertCircle,
  },
};

const sizeConfig = {
  sm: {
    padding: "px-3 py-2",
    iconSize: "w-4 h-4",
    iconPadding: "p-1",
    textSize: "text-sm",
    gap: "gap-2",
  },
  md: {
    padding: "px-4 py-3",
    iconSize: "w-5 h-5",
    iconPadding: "p-1.5",
    textSize: "text-sm",
    gap: "gap-3",
  },
  lg: {
    padding: "px-5 py-4",
    iconSize: "w-6 h-6",
    iconPadding: "p-2",
    textSize: "text-base",
    gap: "gap-4",
  },
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      variant = "info",
      size = "md",
      title,
      icon,
      dismissible = false,
      onDismiss,
      action,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const variantStyles = variantConfig[variant];
    const sizeStyles = sizeConfig[size];
    const IconComponent = variantStyles.icon;

    const renderIcon = () => {
      if (icon === false) return null;
      if (icon) return icon;
      return <IconComponent className={sizeStyles.iconSize} />;
    };

    const renderAction = () => {
      if (!action) return null;

      const actionClasses = cn(
        "inline-flex items-center gap-1 font-medium transition-colors",
        sizeStyles.textSize,
        variantStyles.text,
        "hover:underline"
      );

      if (action.href) {
        if (action.external) {
          return (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className={actionClasses}
            >
              {action.label}
              <ExternalLink className="w-3 h-3" />
            </a>
          );
        }
        return (
          <Link href={action.href} className={actionClasses}>
            {action.label}
            <ChevronRight className="w-3 h-3" />
          </Link>
        );
      }

      return (
        <button onClick={action.onClick} className={actionClasses}>
          {action.label}
          <ChevronRight className="w-3 h-3" />
        </button>
      );
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border",
          variantStyles.bg,
          variantStyles.border,
          sizeStyles.padding,
          className
        )}
        role="alert"
        {...props}
      >
        <div className={cn("flex", sizeStyles.gap)}>
          {renderIcon() && (
            <div
              className={cn(
                "rounded-lg flex-shrink-0",
                sizeStyles.iconPadding,
                variantStyles.iconBg,
                variantStyles.text
              )}
            >
              {renderIcon()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {title && (
              <h4 className={cn("font-medium mb-1", variantStyles.text)}>
                {title}
              </h4>
            )}
            <div className={cn("text-gray-300", sizeStyles.textSize)}>
              {children}
            </div>
            {action && <div className="mt-2">{renderAction()}</div>}
          </div>

          {dismissible && (
            <button
              onClick={onDismiss}
              className="flex-shrink-0 text-gray-500 hover:text-white transition-colors p-1 -mr-1"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

Alert.displayName = "Alert";

// ============================================================================
// Banner Component (Full-width announcements)
// ============================================================================

interface BannerProps {
  variant?: AlertVariant | "brand" | "announcement";
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: AlertAction;
  sticky?: boolean;
  children: ReactNode;
  className?: string;
}

const bannerVariantConfig = {
  ...variantConfig,
  brand: {
    bg: "bg-gradient-to-r from-brand-600 to-brand-500",
    border: "border-brand-400/30",
    text: "text-white",
    iconBg: "bg-white/20",
    icon: Sparkles,
  },
  announcement: {
    bg: "bg-gradient-to-r from-purple-600 to-pink-500",
    border: "border-purple-400/30",
    text: "text-white",
    iconBg: "bg-white/20",
    icon: Megaphone,
  },
};

export function Banner({
  variant = "info",
  icon,
  dismissible = true,
  onDismiss,
  action,
  sticky = false,
  children,
  className,
}: BannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = bannerVariantConfig[variant];
  const IconComponent = config.icon;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  const renderAction = () => {
    if (!action) return null;

    const buttonClasses = cn(
      "inline-flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition-colors",
      variant === "brand" || variant === "announcement"
        ? "bg-white/20 hover:bg-white/30 text-white"
        : `${config.iconBg} ${config.text} hover:opacity-80`
    );

    if (action.href) {
      if (action.external) {
        return (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses}
          >
            {action.label}
            <ExternalLink className="w-3 h-3" />
          </a>
        );
      }
      return (
        <Link href={action.href} className={buttonClasses}>
          {action.label}
          <ChevronRight className="w-3 h-3" />
        </Link>
      );
    }

    return (
      <button onClick={action.onClick} className={buttonClasses}>
        {action.label}
      </button>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={cn(
          "overflow-hidden",
          sticky && "sticky top-0 z-50",
          className
        )}
      >
        <div
          className={cn(
            "px-4 py-3",
            config.bg,
            variant !== "brand" && variant !== "announcement" && `border-b ${config.border}`
          )}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("p-1 rounded-lg flex-shrink-0", config.iconBg, config.text)}>
                {icon ? icon : <IconComponent className="w-4 h-4" />}
              </div>
              <p
                className={cn(
                  "text-sm truncate",
                  variant === "brand" || variant === "announcement"
                    ? "text-white"
                    : "text-gray-300"
                )}
              >
                {children}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {renderAction()}
              {dismissible && (
                <button
                  onClick={handleDismiss}
                  className={cn(
                    "p-1 rounded-lg transition-colors",
                    variant === "brand" || variant === "announcement"
                      ? "hover:bg-white/20 text-white/80 hover:text-white"
                      : "hover:bg-white/5 text-gray-500 hover:text-white"
                  )}
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// Inline Alert (for form validation, etc.)
// ============================================================================

interface InlineAlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

export function InlineAlert({
  variant = "error",
  children,
  className,
}: InlineAlertProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  return (
    <div className={cn("flex items-center gap-2", config.text, className)}>
      <IconComponent className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm">{children}</span>
    </div>
  );
}

// ============================================================================
// Callout (Documentation-style alert)
// ============================================================================

interface CalloutProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Callout({
  variant = "info",
  title,
  children,
  className,
}: CalloutProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  return (
    <div
      className={cn(
        "rounded-xl border-l-4 p-4",
        config.bg,
        variant === "info" && "border-l-blue-500",
        variant === "success" && "border-l-emerald-500",
        variant === "warning" && "border-l-amber-500",
        variant === "error" && "border-l-red-500",
        className
      )}
    >
      <div className="flex gap-3">
        <IconComponent className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.text)} />
        <div>
          {title && (
            <h4 className={cn("font-medium mb-1", config.text)}>{title}</h4>
          )}
          <div className="text-gray-300 text-sm prose-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Toast-style Notification (for temporary alerts)
// ============================================================================

interface NotificationAlertProps {
  variant?: AlertVariant;
  title: string;
  message?: string;
  duration?: number;
  onClose?: () => void;
  action?: AlertAction;
  className?: string;
}

export function NotificationAlert({
  variant = "info",
  title,
  message,
  duration = 5000,
  onClose,
  action,
  className,
}: NotificationAlertProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  useEffect(() => {
    if (duration <= 0) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        setIsVisible(false);
        onClose?.();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={cn(
        "relative w-80 rounded-xl border overflow-hidden",
        "bg-surface-card border-surface-border shadow-2xl",
        className
      )}
    >
      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-surface-border">
          <motion.div
            className={cn("h-full", config.bg.replace("/10", ""))}
            initial={{ width: "100%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.05 }}
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex gap-3">
          <div className={cn("p-1.5 rounded-lg", config.iconBg, config.text)}>
            <IconComponent className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-white text-sm">{title}</h4>
            {message && (
              <p className="text-gray-400 text-sm mt-0.5">{message}</p>
            )}
            {action && (
              <button
                onClick={action.onClick}
                className={cn(
                  "text-sm font-medium mt-2 hover:underline",
                  config.text
                )}
              >
                {action.label}
              </button>
            )}
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// System Status Alert
// ============================================================================

interface SystemStatusProps {
  status: "operational" | "degraded" | "outage" | "maintenance";
  message?: string;
  href?: string;
  className?: string;
}

const systemStatusConfig = {
  operational: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    label: "All Systems Operational",
  },
  degraded: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    dot: "bg-amber-500",
    label: "Degraded Performance",
  },
  outage: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    dot: "bg-red-500",
    label: "System Outage",
  },
  maintenance: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-500",
    label: "Scheduled Maintenance",
  },
};

export function SystemStatus({
  status,
  message,
  href,
  className,
}: SystemStatusProps) {
  const config = systemStatusConfig[status];

  const content = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-xl border",
        config.bg,
        config.border,
        href && "cursor-pointer hover:opacity-80 transition-opacity",
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            config.dot
          )}
        />
        <span
          className={cn("relative inline-flex rounded-full h-2 w-2", config.dot)}
        />
      </span>
      <span className={cn("text-sm font-medium", config.text)}>
        {message || config.label}
      </span>
      {href && <ExternalLink className={cn("w-3 h-3 ml-auto", config.text)} />}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

// ============================================================================
// Feature Announcement
// ============================================================================

interface FeatureAnnouncementProps {
  title: string;
  description: string;
  icon?: ReactNode;
  image?: string;
  action?: AlertAction;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function FeatureAnnouncement({
  title,
  description,
  icon,
  image,
  action,
  dismissible = true,
  onDismiss,
  className,
}: FeatureAnnouncementProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "relative rounded-xl overflow-hidden",
        "bg-gradient-to-br from-brand-500/20 to-purple-500/20",
        "border border-brand-500/30",
        className
      )}
    >
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-col sm:flex-row">
        {image && (
          <div className="sm:w-1/3 h-32 sm:h-auto">
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 p-5">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400">
                {icon}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 text-xs font-medium">
                  New
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-gray-400 text-sm mt-1">{description}</p>

              {action && (
                <div className="mt-4">
                  {action.href ? (
                    <Link
                      href={action.href}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
                    >
                      {action.label}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <button
                      onClick={action.onClick}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
                    >
                      {action.label}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
