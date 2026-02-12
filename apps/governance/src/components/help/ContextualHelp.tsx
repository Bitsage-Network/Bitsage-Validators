"use client";

/**
 * Contextual Help System
 *
 * Components for in-context help and documentation:
 * - Tooltip: Simple hover tooltips
 * - Popover: Rich content popovers
 * - HelpIcon: Info icon with tooltip
 * - InfoBanner: Contextual information banners
 * - GlossaryTerm: Terms with definitions
 * - LearnMore: Links to documentation
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  HelpCircle,
  Info,
  ExternalLink,
  X,
  BookOpen,
  Lightbulb,
  AlertCircle,
  ChevronRight,
  Video,
} from "lucide-react";

// ============================================
// Types
// ============================================

type TooltipPosition = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipPosition;
  align?: TooltipAlign;
  delay?: number;
  maxWidth?: number;
  className?: string;
  disabled?: boolean;
}

interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipPosition;
  align?: TooltipAlign;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  closeOnClickOutside?: boolean;
  className?: string;
}

interface HelpIconProps {
  content: React.ReactNode;
  position?: TooltipPosition;
  size?: "sm" | "md" | "lg";
  variant?: "info" | "help" | "warning";
  className?: string;
}

interface InfoBannerProps {
  title?: string;
  children: React.ReactNode;
  variant?: "info" | "tip" | "warning" | "learn";
  dismissible?: boolean;
  onDismiss?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

interface GlossaryTermProps {
  term: string;
  definition: string;
  learnMoreUrl?: string;
  className?: string;
}

interface LearnMoreProps {
  href: string;
  text?: string;
  external?: boolean;
  variant?: "link" | "button" | "card";
  icon?: React.ReactNode;
  description?: string;
  className?: string;
}

// ============================================
// Position Calculations
// ============================================

function getPositionStyles(
  position: TooltipPosition,
  align: TooltipAlign,
  triggerRect: DOMRect,
  contentRect: DOMRect,
  offset = 8
): React.CSSProperties {
  const styles: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
  };

  // Vertical positioning
  switch (position) {
    case "top":
      styles.bottom = window.innerHeight - triggerRect.top + offset;
      break;
    case "bottom":
      styles.top = triggerRect.bottom + offset;
      break;
    case "left":
      styles.right = window.innerWidth - triggerRect.left + offset;
      break;
    case "right":
      styles.left = triggerRect.right + offset;
      break;
  }

  // Horizontal alignment
  if (position === "top" || position === "bottom") {
    switch (align) {
      case "start":
        styles.left = triggerRect.left;
        break;
      case "center":
        styles.left = triggerRect.left + triggerRect.width / 2;
        styles.transform = "translateX(-50%)";
        break;
      case "end":
        styles.right = window.innerWidth - triggerRect.right;
        break;
    }
  } else {
    switch (align) {
      case "start":
        styles.top = triggerRect.top;
        break;
      case "center":
        styles.top = triggerRect.top + triggerRect.height / 2;
        styles.transform = "translateY(-50%)";
        break;
      case "end":
        styles.bottom = window.innerHeight - triggerRect.bottom;
        break;
    }
  }

  return styles;
}

// ============================================
// Tooltip Component
// ============================================

export function Tooltip({
  content,
  children,
  position = "top",
  align = "center",
  delay = 200,
  maxWidth = 250,
  className = "",
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [styles, setStyles] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const showTooltip = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (isVisible && triggerRef.current && contentRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();
      setStyles(getPositionStyles(position, align, triggerRect, contentRect));
    }
  }, [isVisible, position, align]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="inline-flex"
      >
        {children}
      </div>

      {isVisible && (
        <div
          ref={contentRef}
          style={{ ...styles, maxWidth }}
          className={`px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-sm text-gray-200 ${className}`}
          role="tooltip"
        >
          {content}
          {/* Arrow */}
          <div
            className={`absolute w-2 h-2 bg-gray-800 border-gray-700 transform rotate-45 ${
              position === "top"
                ? "bottom-[-5px] border-r border-b"
                : position === "bottom"
                  ? "top-[-5px] border-l border-t"
                  : position === "left"
                    ? "right-[-5px] border-r border-t"
                    : "left-[-5px] border-l border-b"
            } ${
              align === "start"
                ? position === "top" || position === "bottom"
                  ? "left-4"
                  : "top-4"
                : align === "end"
                  ? position === "top" || position === "bottom"
                    ? "right-4"
                    : "bottom-4"
                  : position === "top" || position === "bottom"
                    ? "left-1/2 -translate-x-1/2"
                    : "top-1/2 -translate-y-1/2"
            }`}
          />
        </div>
      )}
    </>
  );
}

// ============================================
// Popover Component
// ============================================

export function Popover({
  trigger,
  children,
  position = "bottom",
  align = "start",
  open: controlledOpen,
  onOpenChange,
  closeOnClickOutside = true,
  className = "",
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [styles, setStyles] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (isOpen && triggerRef.current && contentRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();
      setStyles(getPositionStyles(position, align, triggerRect, contentRect, 12));
    }
  }, [isOpen, position, align]);

  useEffect(() => {
    if (!closeOnClickOutside || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeOnClickOutside, setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, setIsOpen]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          ref={contentRef}
          style={styles}
          className={`bg-gray-900 border border-gray-800 rounded-xl shadow-2xl ${className}`}
        >
          {children}
        </div>
      )}
    </>
  );
}

// ============================================
// HelpIcon Component
// ============================================

const iconSizes = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

const iconVariants = {
  info: { icon: Info, color: "text-blue-400" },
  help: { icon: HelpCircle, color: "text-gray-400" },
  warning: { icon: AlertCircle, color: "text-yellow-400" },
};

export function HelpIcon({
  content,
  position = "top",
  size = "md",
  variant = "help",
  className = "",
}: HelpIconProps) {
  const { icon: Icon, color } = iconVariants[variant];

  return (
    <Tooltip content={content} position={position}>
      <button
        type="button"
        className={`inline-flex items-center justify-center ${color} hover:opacity-80 transition-opacity cursor-help ${className}`}
        aria-label="Help"
      >
        <Icon className={iconSizes[size]} />
      </button>
    </Tooltip>
  );
}

// ============================================
// InfoBanner Component
// ============================================

const bannerVariants = {
  info: {
    icon: Info,
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    titleColor: "text-blue-400",
  },
  tip: {
    icon: Lightbulb,
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    iconColor: "text-green-400",
    titleColor: "text-green-400",
  },
  warning: {
    icon: AlertCircle,
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    iconColor: "text-yellow-400",
    titleColor: "text-yellow-400",
  },
  learn: {
    icon: BookOpen,
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
    titleColor: "text-purple-400",
  },
};

export function InfoBanner({
  title,
  children,
  variant = "info",
  dismissible = false,
  onDismiss,
  actions,
  className = "",
}: InfoBannerProps) {
  const config = bannerVariants[variant];
  const Icon = config.icon;

  return (
    <div
      className={`p-4 rounded-xl border ${config.bgColor} ${config.borderColor} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-medium mb-1 ${config.titleColor}`}>{title}</h4>
          )}
          <div className="text-sm text-gray-300">{children}</div>
          {actions && <div className="mt-3 flex items-center gap-2">{actions}</div>}
        </div>
        {dismissible && (
          <button
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// GlossaryTerm Component
// ============================================

export function GlossaryTerm({
  term,
  definition,
  learnMoreUrl,
  className = "",
}: GlossaryTermProps) {
  return (
    <Popover
      trigger={
        <span
          className={`border-b border-dashed border-gray-500 cursor-help hover:border-blue-400 hover:text-blue-400 transition-colors ${className}`}
        >
          {term}
        </span>
      }
      position="top"
      align="center"
    >
      <div className="p-4 max-w-xs">
        <h4 className="font-medium text-white mb-2">{term}</h4>
        <p className="text-sm text-gray-400 mb-3">{definition}</p>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Learn more
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </Popover>
  );
}

// ============================================
// LearnMore Component
// ============================================

export function LearnMore({
  href,
  text = "Learn more",
  external = true,
  variant = "link",
  icon,
  description,
  className = "",
}: LearnMoreProps) {
  const linkProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  if (variant === "link") {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors ${className}`}
        {...linkProps}
      >
        {icon || <BookOpen className="w-4 h-4" />}
        {text}
        {external && <ExternalLink className="w-3 h-3" />}
      </a>
    );
  }

  if (variant === "button") {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-sm text-blue-400 transition-colors ${className}`}
        {...linkProps}
      >
        {icon || <BookOpen className="w-4 h-4" />}
        {text}
        {external && <ExternalLink className="w-3 h-3" />}
      </a>
    );
  }

  // Card variant
  return (
    <a
      href={href}
      className={`block p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-colors group ${className}`}
      {...linkProps}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            {icon || <BookOpen className="w-5 h-5 text-blue-400" />}
          </div>
          <div>
            <h4 className="font-medium text-white group-hover:text-blue-400 transition-colors">
              {text}
            </h4>
            {description && (
              <p className="text-sm text-gray-400 mt-1">{description}</p>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors" />
      </div>
    </a>
  );
}

// ============================================
// Feature Highlight Component
// ============================================

interface FeatureHighlightProps {
  title: string;
  description: string;
  features: string[];
  videoUrl?: string;
  docsUrl?: string;
  onDismiss?: () => void;
  className?: string;
}

export function FeatureHighlight({
  title,
  description,
  features,
  videoUrl,
  docsUrl,
  onDismiss,
  className = "",
}: FeatureHighlightProps) {
  return (
    <div
      className={`relative p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl ${className}`}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-500/20 rounded-xl">
          <Lightbulb className="w-6 h-6 text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-gray-400 mb-4">{description}</p>

          <ul className="space-y-2 mb-4">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-gray-300">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
              >
                <Video className="w-4 h-4" />
                Watch Tutorial
              </a>
            )}
            {docsUrl && (
              <LearnMore href={docsUrl} text="Read Documentation" variant="button" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Field Help Component (for forms)
// ============================================

interface FieldHelpProps {
  label: string;
  description: string;
  example?: string;
  learnMoreUrl?: string;
}

export function FieldHelp({ label, description, example, learnMoreUrl }: FieldHelpProps) {
  return (
    <Popover
      trigger={<HelpIcon content="" size="sm" />}
      position="right"
      align="start"
    >
      <div className="p-4 max-w-xs">
        <h4 className="font-medium text-white mb-2">{label}</h4>
        <p className="text-sm text-gray-400 mb-2">{description}</p>
        {example && (
          <div className="p-2 bg-gray-800 rounded-lg mb-2">
            <p className="text-xs text-gray-500 mb-1">Example:</p>
            <code className="text-sm text-blue-400 font-mono">{example}</code>
          </div>
        )}
        {learnMoreUrl && (
          <LearnMore href={learnMoreUrl} variant="link" />
        )}
      </div>
    </Popover>
  );
}

export type {
  TooltipProps,
  PopoverProps,
  HelpIconProps,
  InfoBannerProps,
  GlossaryTermProps,
  LearnMoreProps,
  FeatureHighlightProps,
  FieldHelpProps,
};
