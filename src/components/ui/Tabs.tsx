"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

// ============================================================================
// Context
// ============================================================================

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
}

// ============================================================================
// Tabs Root
// ============================================================================

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  const activeTab = value !== undefined ? value : internalValue;

  const setActiveTab = useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ============================================================================
// Tab List
// ============================================================================

interface TabListProps {
  children: ReactNode;
  variant?: "default" | "pills" | "underline" | "segment";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
}

export function TabList({
  children,
  variant = "default",
  size = "md",
  fullWidth = false,
  className,
}: TabListProps) {
  const variantClasses = {
    default: "border-b border-surface-border",
    pills: "bg-surface-elevated p-1 rounded-xl gap-1",
    underline: "border-b border-surface-border",
    segment: "bg-surface-elevated p-1 rounded-xl",
  };

  return (
    <div
      role="tablist"
      className={cn(
        "flex",
        variantClasses[variant],
        fullWidth && "w-full",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Tab Trigger
// ============================================================================

interface TabTriggerProps {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  variant?: "default" | "pills" | "underline" | "segment";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function TabTrigger({
  value,
  children,
  icon,
  badge,
  disabled = false,
  variant = "default",
  size = "md",
  className,
}: TabTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  };

  const getVariantClasses = () => {
    switch (variant) {
      case "pills":
        return cn(
          "rounded-lg transition-all",
          isActive
            ? "bg-brand-600 text-white shadow-lg"
            : "text-gray-400 hover:text-white hover:bg-surface-card"
        );
      case "underline":
        return cn(
          "relative pb-2.5 border-b-2 -mb-px transition-colors",
          isActive
            ? "border-brand-500 text-white"
            : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
        );
      case "segment":
        return cn(
          "flex-1 rounded-lg transition-all text-center",
          isActive
            ? "bg-brand-600 text-white shadow-lg"
            : "text-gray-400 hover:text-white"
        );
      default:
        return cn(
          "relative pb-2 -mb-px transition-colors",
          isActive ? "text-white" : "text-gray-400 hover:text-white"
        );
    }
  };

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={cn(
        "inline-flex items-center gap-2 font-medium",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-0",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizes[size],
        getVariantClasses(),
        className
      )}
    >
      {icon}
      <span>{children}</span>
      {badge}

      {/* Active indicator for default variant */}
      {variant === "default" && isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}

// ============================================================================
// Tab Content
// ============================================================================

interface TabContentProps {
  value: string;
  children: ReactNode;
  forceMount?: boolean;
  className?: string;
}

export function TabContent({
  value,
  children,
  forceMount = false,
  className,
}: TabContentProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive && !forceMount) return null;

  return (
    <motion.div
      role="tabpanel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        !isActive && forceMount && "hidden",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

// ============================================================================
// Simple Tabs Component (All-in-one)
// ============================================================================

interface SimpleTabsProps {
  tabs: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  variant?: "default" | "pills" | "underline" | "segment";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  className?: string;
  tabListClassName?: string;
}

export function SimpleTabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
  variant = "default",
  size = "md",
  fullWidth = false,
  className,
  tabListClassName,
}: SimpleTabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || tabs[0]?.value || "");
  const activeTab = value !== undefined ? value : internalValue;

  const handleChange = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  };

  const variantClasses = {
    default: "border-b border-surface-border",
    pills: "bg-surface-elevated p-1 rounded-xl gap-1",
    underline: "border-b border-surface-border",
    segment: "bg-surface-elevated p-1 rounded-xl",
  };

  const getTabClasses = (isActive: boolean, disabled?: boolean) => {
    const base = cn(
      "inline-flex items-center gap-2 font-medium transition-all",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
      disabled && "opacity-50 cursor-not-allowed",
      sizes[size]
    );

    switch (variant) {
      case "pills":
        return cn(
          base,
          "rounded-lg",
          isActive
            ? "bg-brand-600 text-white shadow-lg"
            : "text-gray-400 hover:text-white hover:bg-surface-card"
        );
      case "underline":
        return cn(
          base,
          "relative pb-2.5 border-b-2 -mb-px",
          isActive
            ? "border-brand-500 text-white"
            : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
        );
      case "segment":
        return cn(
          base,
          "flex-1 rounded-lg justify-center",
          isActive
            ? "bg-brand-600 text-white shadow-lg"
            : "text-gray-400 hover:text-white"
        );
      default:
        return cn(
          base,
          "relative pb-2 -mb-px",
          isActive ? "text-white" : "text-gray-400 hover:text-white"
        );
    }
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        className={cn(
          "flex",
          variantClasses[variant],
          fullWidth && "w-full",
          tabListClassName
        )}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && handleChange(tab.value)}
              className={getTabClasses(isActive, tab.disabled)}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge}

              {/* Active indicator */}
              {variant === "default" && isActive && (
                <motion.div
                  layoutId="simpleActiveTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Vertical Tabs
// ============================================================================

interface VerticalTabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  tabsClassName?: string;
  contentClassName?: string;
}

export function VerticalTabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
  tabsClassName,
  contentClassName,
}: VerticalTabsProps) {
  return (
    <div className={cn("flex gap-6", className)}>
      {/* Tab List */}
      <div className={cn("flex flex-col gap-1 w-48 shrink-0", tabsClassName)}>
        {tabs.map((tab) => {
          const isActive = value === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => !tab.disabled && onValueChange(tab.value)}
              disabled={tab.disabled}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all",
                "text-sm font-medium",
                isActive
                  ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                  : "text-gray-400 hover:text-white hover:bg-surface-elevated",
                tab.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {tab.icon}
              <span className="flex-1">{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className={cn("flex-1", contentClassName)}>{children}</div>
    </div>
  );
}

// ============================================================================
// Tab Badge
// ============================================================================

interface TabBadgeProps {
  count?: number;
  variant?: "default" | "brand" | "success" | "warning" | "error";
  className?: string;
}

export function TabBadge({ count, variant = "default", className }: TabBadgeProps) {
  const variants = {
    default: "bg-surface-card text-gray-400",
    brand: "bg-brand-500/20 text-brand-400",
    success: "bg-emerald-500/20 text-emerald-400",
    warning: "bg-orange-500/20 text-orange-400",
    error: "bg-red-500/20 text-red-400",
  };

  if (count === undefined) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[18px]",
        variants[variant],
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
