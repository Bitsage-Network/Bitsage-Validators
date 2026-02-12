"use client";

import { useState, useRef, useEffect, ReactNode, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Info, HelpCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type TooltipPosition = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  align?: TooltipAlign;
  delay?: number;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

// ============================================================================
// Tooltip Component
// ============================================================================

export function Tooltip({
  content,
  children,
  position = "top",
  align = "center",
  delay = 200,
  disabled = false,
  className,
  contentClassName,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 8;

    let top = 0;
    let left = 0;

    // Vertical position
    switch (position) {
      case "top":
        top = triggerRect.top - tooltipRect.height - padding;
        break;
      case "bottom":
        top = triggerRect.bottom + padding;
        break;
      case "left":
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        break;
      case "right":
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        break;
    }

    // Horizontal position
    switch (position) {
      case "top":
      case "bottom":
        switch (align) {
          case "start":
            left = triggerRect.left;
            break;
          case "center":
            left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
            break;
          case "end":
            left = triggerRect.right - tooltipRect.width;
            break;
        }
        break;
      case "left":
        left = triggerRect.left - tooltipRect.width - padding;
        break;
      case "right":
        left = triggerRect.right + padding;
        break;
    }

    // Keep tooltip in viewport
    const viewportPadding = 10;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));

    setCoords({ top, left });
  }, [position, align]);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition, true);
      window.addEventListener("resize", calculatePosition);
      return () => {
        window.removeEventListener("scroll", calculatePosition, true);
        window.removeEventListener("resize", calculatePosition);
      };
    }
  }, [isVisible, calculatePosition]);

  const handleMouseEnter = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const handleFocus = () => {
    if (disabled) return;
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  const getAnimationProps = () => {
    const animations = {
      top: { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 } },
      bottom: { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 } },
      left: { initial: { opacity: 0, x: 4 }, animate: { opacity: 1, x: 0 } },
      right: { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 } },
    };
    return animations[position];
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn("inline-flex", className)}
      >
        {children}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <motion.div
                ref={tooltipRef}
                {...getAnimationProps()}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "fixed z-[9999] px-3 py-2 rounded-lg",
                  "bg-gray-900 border border-surface-border shadow-xl",
                  "text-sm text-white max-w-xs",
                  contentClassName
                )}
                style={{
                  top: coords.top,
                  left: coords.left,
                }}
              >
                {content}

                {/* Arrow */}
                <div
                  className={cn(
                    "absolute w-2 h-2 bg-gray-900 border-surface-border rotate-45",
                    position === "top" && "bottom-[-5px] border-b border-r",
                    position === "bottom" && "top-[-5px] border-t border-l",
                    position === "left" && "right-[-5px] border-t border-r",
                    position === "right" && "left-[-5px] border-b border-l",
                    (position === "top" || position === "bottom") && align === "start" && "left-3",
                    (position === "top" || position === "bottom") && align === "center" && "left-1/2 -translate-x-1/2",
                    (position === "top" || position === "bottom") && align === "end" && "right-3",
                    (position === "left" || position === "right") && "top-1/2 -translate-y-1/2"
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

// ============================================================================
// Info Tooltip (with icon)
// ============================================================================

interface InfoTooltipProps {
  content: ReactNode;
  position?: TooltipPosition;
  size?: "sm" | "md";
  variant?: "info" | "help" | "warning";
  className?: string;
}

export function InfoTooltip({
  content,
  position = "top",
  size = "sm",
  variant = "info",
  className,
}: InfoTooltipProps) {
  const icons = {
    info: Info,
    help: HelpCircle,
    warning: AlertCircle,
  };

  const colors = {
    info: "text-gray-500 hover:text-gray-300",
    help: "text-brand-400 hover:text-brand-300",
    warning: "text-orange-400 hover:text-orange-300",
  };

  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  const Icon = icons[variant];

  return (
    <Tooltip content={content} position={position}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center transition-colors",
          colors[variant],
          className
        )}
      >
        <Icon className={sizes[size]} />
      </button>
    </Tooltip>
  );
}

// ============================================================================
// Label with Tooltip
// ============================================================================

interface LabelWithTooltipProps {
  label: string;
  tooltip: ReactNode;
  required?: boolean;
  className?: string;
}

export function LabelWithTooltip({
  label,
  tooltip,
  required,
  className,
}: LabelWithTooltipProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="text-sm font-medium text-gray-300">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      <InfoTooltip content={tooltip} />
    </div>
  );
}

// ============================================================================
// Hover Card (Rich tooltip)
// ============================================================================

interface HoverCardProps {
  trigger: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  className?: string;
}

export function HoverCard({
  trigger,
  children,
  position = "bottom",
  delay = 300,
  className,
}: HoverCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !cardRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const padding = 12;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = triggerRect.top - cardRect.height - padding;
        left = triggerRect.left + (triggerRect.width - cardRect.width) / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + padding;
        left = triggerRect.left + (triggerRect.width - cardRect.width) / 2;
        break;
      case "left":
        top = triggerRect.top + (triggerRect.height - cardRect.height) / 2;
        left = triggerRect.left - cardRect.width - padding;
        break;
      case "right":
        top = triggerRect.top + (triggerRect.height - cardRect.height) / 2;
        left = triggerRect.right + padding;
        break;
    }

    // Keep in viewport
    const viewportPadding = 16;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - cardRect.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardRect.height - viewportPadding));

    setCoords({ top, left });
  }, [position]);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition, true);
      window.addEventListener("resize", calculatePosition);
      return () => {
        window.removeEventListener("scroll", calculatePosition, true);
        window.removeEventListener("resize", calculatePosition);
      };
    }
  }, [isVisible, calculatePosition]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex"
      >
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <motion.div
                ref={cardRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onMouseEnter={() => {
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                  }
                  setIsVisible(true);
                }}
                onMouseLeave={handleMouseLeave}
                className={cn(
                  "fixed z-[9999] p-4 rounded-xl",
                  "bg-surface-card border border-surface-border shadow-2xl",
                  "min-w-[200px] max-w-[320px]",
                  className
                )}
                style={{
                  top: coords.top,
                  left: coords.left,
                }}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

// ============================================================================
// Shortcut Tooltip (for showing keyboard shortcuts)
// ============================================================================

interface ShortcutTooltipProps {
  label: string;
  shortcut: string;
  children: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

export function ShortcutTooltip({
  label,
  shortcut,
  children,
  position = "top",
  className,
}: ShortcutTooltipProps) {
  const formatShortcut = (key: string) => {
    return key
      .split("+")
      .map((k) => {
        switch (k.toLowerCase()) {
          case "ctrl":
            return "⌃";
          case "cmd":
          case "meta":
            return "⌘";
          case "alt":
          case "option":
            return "⌥";
          case "shift":
            return "⇧";
          default:
            return k.toUpperCase();
        }
      })
      .join("");
  };

  return (
    <Tooltip
      position={position}
      content={
        <div className="flex items-center gap-3">
          <span>{label}</span>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-gray-400 text-xs font-mono border border-surface-border">
            {formatShortcut(shortcut)}
          </kbd>
        </div>
      }
      className={className}
    >
      {children}
    </Tooltip>
  );
}

// ============================================================================
// Popover (Click-triggered tooltip-like component)
// ============================================================================

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  align?: TooltipAlign;
  className?: string;
  contentClassName?: string;
}

export function Popover({
  trigger,
  children,
  position = "bottom",
  align = "center",
  className,
  contentClassName,
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const padding = 8;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = triggerRect.top - popoverRect.height - padding;
        break;
      case "bottom":
        top = triggerRect.bottom + padding;
        break;
      case "left":
        top = triggerRect.top;
        left = triggerRect.left - popoverRect.width - padding;
        break;
      case "right":
        top = triggerRect.top;
        left = triggerRect.right + padding;
        break;
    }

    if (position === "top" || position === "bottom") {
      switch (align) {
        case "start":
          left = triggerRect.left;
          break;
        case "center":
          left = triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
          break;
        case "end":
          left = triggerRect.right - popoverRect.width;
          break;
      }
    }

    // Keep in viewport
    const viewportPadding = 16;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - popoverRect.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - popoverRect.height - viewportPadding));

    setCoords({ top, left });
  }, [position, align]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition, true);
      window.addEventListener("resize", calculatePosition);

      // Close on outside click
      const handleClickOutside = (e: MouseEvent) => {
        if (
          popoverRef.current &&
          !popoverRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);

      // Close on escape
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("keydown", handleEscape);

      return () => {
        window.removeEventListener("scroll", calculatePosition, true);
        window.removeEventListener("resize", calculatePosition);
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, calculatePosition]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn("inline-flex cursor-pointer", className)}
      >
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "fixed z-[9999] p-4 rounded-xl",
                  "bg-surface-card border border-surface-border shadow-2xl",
                  contentClassName
                )}
                style={{
                  top: coords.top,
                  left: coords.left,
                }}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
