"use client";

import { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, ExternalLink, ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface DataListItem {
  label: string;
  value: ReactNode;
  copyValue?: string;
  href?: string;
  external?: boolean;
  hidden?: boolean;
  mono?: boolean;
  truncate?: boolean;
  labelIcon?: ReactNode;
  valueIcon?: ReactNode;
  helpText?: string;
  badge?: ReactNode;
  action?: ReactNode;
}

interface DataListProps {
  items: DataListItem[];
  variant?: "default" | "striped" | "bordered" | "compact";
  columns?: 1 | 2;
  labelWidth?: "auto" | "sm" | "md" | "lg";
  className?: string;
}

// ============================================================================
// Copy Button
// ============================================================================

function CopyButton({ value, size = "sm" }: { value: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeClasses = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className={cn(sizeClasses, "text-emerald-400")} />
      ) : (
        <Copy className={sizeClasses} />
      )}
    </button>
  );
}

// ============================================================================
// Hidden Value
// ============================================================================

function HiddenValue({
  value,
  copyValue,
}: {
  value: ReactNode;
  copyValue?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <span className={cn(!isVisible && "blur-sm select-none")}>
        {value}
      </span>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
        title={isVisible ? "Hide value" : "Show value"}
      >
        {isVisible ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        )}
      </button>
      {copyValue && <CopyButton value={copyValue} />}
    </div>
  );
}

// ============================================================================
// Data List
// ============================================================================

export function DataList({
  items,
  variant = "default",
  columns = 1,
  labelWidth = "md",
  className,
}: DataListProps) {
  const labelWidthClasses = {
    auto: "",
    sm: "w-24 flex-shrink-0",
    md: "w-32 flex-shrink-0",
    lg: "w-48 flex-shrink-0",
  };

  const variantClasses = {
    default: "",
    striped: "",
    bordered: "divide-y divide-surface-border",
    compact: "",
  };

  const itemVariantClasses = {
    default: "py-3",
    striped: "py-3",
    bordered: "py-3",
    compact: "py-2",
  };

  const renderValue = (item: DataListItem) => {
    const valueContent = (
      <span
        className={cn(
          "text-white",
          item.mono && "font-mono text-sm",
          item.truncate && "truncate block"
        )}
      >
        {item.value}
      </span>
    );

    if (item.hidden) {
      return (
        <HiddenValue
          value={item.value}
          copyValue={item.copyValue}
        />
      );
    }

    if (item.href) {
      const linkContent = (
        <span className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors">
          {valueContent}
          {item.external && <ExternalLink className="w-3 h-3" />}
        </span>
      );

      if (item.external) {
        return (
          <a href={item.href} target="_blank" rel="noopener noreferrer">
            {linkContent}
          </a>
        );
      }

      return <Link href={item.href}>{linkContent}</Link>;
    }

    if (item.copyValue) {
      return (
        <div className="flex items-center gap-2">
          {valueContent}
          <CopyButton value={item.copyValue} />
        </div>
      );
    }

    return valueContent;
  };

  return (
    <dl
      className={cn(
        columns === 2 && "grid grid-cols-1 md:grid-cols-2 gap-x-8",
        variantClasses[variant],
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "flex items-start gap-4",
            itemVariantClasses[variant],
            variant === "striped" && index % 2 === 1 && "bg-white/[0.02] -mx-4 px-4",
            variant === "bordered" && "border-surface-border"
          )}
        >
          <dt
            className={cn(
              "flex items-center gap-2 text-gray-400 text-sm",
              labelWidthClasses[labelWidth]
            )}
          >
            {item.labelIcon && (
              <span className="text-gray-500 flex-shrink-0">{item.labelIcon}</span>
            )}
            <span>{item.label}</span>
          </dt>
          <dd className="flex-1 min-w-0 flex items-center gap-2">
            {item.valueIcon && (
              <span className="text-gray-400 flex-shrink-0">{item.valueIcon}</span>
            )}
            {renderValue(item)}
            {item.badge && <span className="flex-shrink-0">{item.badge}</span>}
            {item.action && <span className="ml-auto flex-shrink-0">{item.action}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ============================================================================
// Stat List (for stats/metrics)
// ============================================================================

interface StatListItem {
  label: string;
  value: string | number;
  change?: number;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  suffix?: string;
  prefix?: string;
}

interface StatListProps {
  items: StatListItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatList({ items, columns = 3, className }: StatListProps) {
  const columnClasses = {
    2: "grid-cols-2",
    3: "grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  };

  const trendColors = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-gray-400",
  };

  return (
    <div className={cn("grid gap-4", columnClasses[columns], className)}>
      {items.map((item, index) => {
        const trend = item.trend || (item.change !== undefined ? (item.change > 0 ? "up" : item.change < 0 ? "down" : "neutral") : undefined);

        return (
          <div
            key={index}
            className="p-4 rounded-xl bg-surface-elevated/50 border border-surface-border/50"
          >
            <div className="flex items-center gap-2 mb-1">
              {item.icon && <span className="text-gray-500">{item.icon}</span>}
              <span className="text-sm text-gray-400">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">
                {item.prefix}
                {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
                {item.suffix}
              </span>
              {item.change !== undefined && trend && (
                <span className={cn("text-sm font-medium", trendColors[trend])}>
                  {item.change > 0 ? "+" : ""}
                  {item.change}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Key-Value Grid
// ============================================================================

interface KeyValueGridProps {
  items: Record<string, ReactNode>;
  columns?: 2 | 3 | 4;
  labelPosition?: "top" | "left";
  className?: string;
}

export function KeyValueGrid({
  items,
  columns = 2,
  labelPosition = "top",
  className,
}: KeyValueGridProps) {
  const columnClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", columnClasses[columns], className)}>
      {Object.entries(items).map(([key, value]) => (
        <div
          key={key}
          className={cn(
            labelPosition === "left" && "flex items-center gap-4"
          )}
        >
          <dt className="text-sm text-gray-400 mb-1">{key}</dt>
          <dd className="text-white font-medium">{value}</dd>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Property List (expandable sections)
// ============================================================================

interface PropertySection {
  title: string;
  icon?: ReactNode;
  items: DataListItem[];
  defaultExpanded?: boolean;
}

interface PropertyListProps {
  sections: PropertySection[];
  className?: string;
}

export function PropertyList({ sections, className }: PropertyListProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    sections.forEach((section, index) => {
      if (section.defaultExpanded !== false) {
        initial.add(index);
      }
    });
    return initial;
  });

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map((section, index) => {
        const isExpanded = expandedSections.has(index);

        return (
          <div
            key={index}
            className="rounded-xl border border-surface-border overflow-hidden"
          >
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-surface-elevated hover:bg-surface-elevated/80 transition-colors"
            >
              {section.icon && (
                <span className="text-gray-400">{section.icon}</span>
              )}
              <span className="font-medium text-white">{section.title}</span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-gray-500 ml-auto transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 bg-surface-card">
                    <DataList items={section.items} variant="bordered" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Address Display (for blockchain addresses)
// ============================================================================

interface AddressDisplayProps {
  address: string;
  label?: string;
  showFull?: boolean;
  explorerUrl?: string;
  className?: string;
}

export function AddressDisplay({
  address,
  label,
  showFull = false,
  explorerUrl,
  className,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(showFull);

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      {label && <span className="text-gray-400 text-sm">{label}</span>}
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-mono text-sm text-white hover:text-brand-400 transition-colors"
        title={expanded ? "Collapse" : "Expand"}
      >
        {expanded ? address : truncatedAddress}
      </button>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
        title="Copy address"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      {explorerUrl && (
        <a
          href={`${explorerUrl}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          title="View on explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ============================================================================
// Transaction Hash Display
// ============================================================================

interface TxHashDisplayProps {
  hash: string;
  explorerUrl?: string;
  showFull?: boolean;
  className?: string;
}

export function TxHashDisplay({
  hash,
  explorerUrl,
  showFull = false,
  className,
}: TxHashDisplayProps) {
  const [copied, setCopied] = useState(false);

  const truncatedHash = showFull ? hash : `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className="font-mono text-sm text-white">{truncatedHash}</span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
        title="Copy hash"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      {explorerUrl && (
        <a
          href={`${explorerUrl}/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          title="View on explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

// ============================================================================
// Labeled Value
// ============================================================================

interface LabeledValueProps {
  label: string;
  value: ReactNode;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
  className?: string;
}

export function LabeledValue({
  label,
  value,
  size = "md",
  align = "left",
  className,
}: LabeledValueProps) {
  const sizeClasses = {
    sm: { label: "text-xs", value: "text-sm" },
    md: { label: "text-sm", value: "text-base" },
    lg: { label: "text-sm", value: "text-lg" },
  };

  const alignClasses = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <div className={cn(alignClasses[align], className)}>
      <dt className={cn("text-gray-400 mb-0.5", sizeClasses[size].label)}>
        {label}
      </dt>
      <dd className={cn("text-white font-medium", sizeClasses[size].value)}>
        {value}
      </dd>
    </div>
  );
}

// ============================================================================
// Inline Data (for inline display)
// ============================================================================

interface InlineDataProps {
  items: Array<{ label: string; value: ReactNode }>;
  separator?: "dot" | "pipe" | "slash";
  className?: string;
}

export function InlineData({
  items,
  separator = "dot",
  className,
}: InlineDataProps) {
  const separatorMap = {
    dot: "•",
    pipe: "|",
    slash: "/",
  };

  return (
    <div className={cn("flex items-center flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className="text-gray-600 mr-2.5">{separatorMap[separator]}</span>
          )}
          <span className="text-gray-400">{item.label}:</span>
          <span className="text-white">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Comparison Data (before/after)
// ============================================================================

interface ComparisonDataProps {
  label: string;
  before: ReactNode;
  after: ReactNode;
  className?: string;
}

export function ComparisonData({
  label,
  before,
  after,
  className,
}: ComparisonDataProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <span className="text-sm text-gray-400 w-24 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 line-through">{before}</span>
        <ChevronRight className="w-4 h-4 text-gray-600" />
        <span className="text-white font-medium">{after}</span>
      </div>
    </div>
  );
}
