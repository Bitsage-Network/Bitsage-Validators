"use client";

/**
 * Responsive Trading Layout
 *
 * Provides mobile-friendly layouts for trading interfaces.
 * Includes collapsible panels, swipeable tabs, and adaptive sizing.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  ChevronUp,
  ChevronDown,
  BookOpen,
  PlusCircle,
  History,
  List,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile Trading Tabs
 * Swipeable tab navigation for mobile devices
 */
interface MobileTradingTabsProps {
  tabs: {
    id: string;
    label: string;
    icon: React.ReactNode;
    content: React.ReactNode;
  }[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function MobileTradingTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: MobileTradingTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [startX, setStartX] = useState(0);

  const currentIndex = tabs.findIndex(t => t.id === activeTab);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 50;
      if (info.offset.x < -threshold && currentIndex < tabs.length - 1) {
        onTabChange(tabs[currentIndex + 1].id);
      } else if (info.offset.x > threshold && currentIndex > 0) {
        onTabChange(tabs[currentIndex - 1].id);
      }
    },
    [currentIndex, tabs, onTabChange]
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Tab Bar */}
      <div className="flex border-b border-surface-border bg-surface-card sticky top-0 z-10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "text-brand-400 border-b-2 border-brand-400 bg-brand-500/5"
                : "text-gray-500 hover:text-white"
            )}
          >
            {tab.icon}
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content with swipe */}
      <motion.div
        ref={containerRef}
        className="flex-1 overflow-hidden touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {tabs.find(t => t.id === activeTab)?.content}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Swipe indicator dots */}
      <div className="flex items-center justify-center gap-1.5 py-2 bg-surface-card border-t border-surface-border">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              activeTab === tab.id
                ? "bg-brand-400 w-4"
                : "bg-gray-600 hover:bg-gray-500"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Collapsible Trading Panel
 * For mobile bottom sheets or collapsible sections
 */
interface CollapsiblePanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  expandedHeight?: string;
  collapsedHeight?: string;
  className?: string;
}

export function CollapsiblePanel({
  title,
  icon,
  children,
  defaultExpanded = false,
  expandedHeight = "auto",
  collapsedHeight = "56px",
  className,
}: CollapsiblePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className={cn(
        "glass-card overflow-hidden transition-all duration-300",
        className
      )}
      style={{
        height: isExpanded ? expandedHeight : collapsedHeight,
        minHeight: collapsedHeight,
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 border-b border-surface-border hover:bg-surface-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-white">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mobile Bottom Sheet
 * Draggable bottom sheet for order forms
 */
interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  snapPoints?: number[]; // Percentages of screen height
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [0.5, 0.9],
}: MobileBottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(0);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.velocity.y > 500 || info.offset.y > 100) {
        if (currentSnap === 0) {
          onClose();
        } else {
          setCurrentSnap(Math.max(0, currentSnap - 1));
        }
      } else if (info.velocity.y < -500 || info.offset.y < -100) {
        setCurrentSnap(Math.min(snapPoints.length - 1, currentSnap + 1));
      }
    },
    [currentSnap, snapPoints.length, onClose]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: `${(1 - snapPoints[currentSnap]) * 100}%` }}
        exit={{ y: "100%" }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.1, bottom: 0.3 }}
        onDragEnd={handleDragEnd}
        className="fixed inset-x-0 bottom-0 z-50 bg-[#0a0a0f] rounded-t-3xl border-t border-white/10"
        style={{ height: `${snapPoints[snapPoints.length - 1] * 100}%` }}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-12 h-1.5 rounded-full bg-gray-600" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between border-b border-surface-border">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={() => setCurrentSnap(currentSnap === 0 ? 1 : 0)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            {currentSnap === 0 ? (
              <Maximize2 className="h-5 w-5 text-gray-400" />
            ) : (
              <Minimize2 className="h-5 w-5 text-gray-400" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </motion.div>
    </>
  );
}

/**
 * Responsive Trading Grid
 * Adaptive grid layout for trading components
 */
interface ResponsiveTradingGridProps {
  orderBook: React.ReactNode;
  placeOrder: React.ReactNode;
  tradeHistory: React.ReactNode;
  myOrders?: React.ReactNode;
  className?: string;
}

export function ResponsiveTradingGrid({
  orderBook,
  placeOrder,
  tradeHistory,
  myOrders,
  className,
}: ResponsiveTradingGridProps) {
  const [mobileTab, setMobileTab] = useState("order");

  const mobileTabs = [
    { id: "orderbook", label: "Book", icon: <BookOpen className="h-4 w-4" />, content: orderBook },
    { id: "order", label: "Trade", icon: <PlusCircle className="h-4 w-4" />, content: placeOrder },
    { id: "history", label: "History", icon: <History className="h-4 w-4" />, content: tradeHistory },
    ...(myOrders ? [{ id: "orders", label: "Orders", icon: <List className="h-4 w-4" />, content: myOrders }] : []),
  ];

  return (
    <div className={className}>
      {/* Desktop Layout */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-6 min-h-[520px]">
        <div className="lg:col-span-4">{orderBook}</div>
        <div className="lg:col-span-4">{placeOrder}</div>
        <div className="lg:col-span-4">{tradeHistory}</div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden h-[calc(100vh-200px)] min-h-[500px]">
        <MobileTradingTabs
          tabs={mobileTabs}
          activeTab={mobileTab}
          onTabChange={setMobileTab}
        />
      </div>
    </div>
  );
}

/**
 * Mobile Order Book Summary
 * Compact orderbook display for mobile
 */
interface MobileOrderBookSummaryProps {
  bestBid: string;
  bestAsk: string;
  spread: string;
  lastPrice: string;
  priceChange: number;
  onExpand: () => void;
  className?: string;
}

export function MobileOrderBookSummary({
  bestBid,
  bestAsk,
  spread,
  lastPrice,
  priceChange,
  onExpand,
  className,
}: MobileOrderBookSummaryProps) {
  return (
    <button
      onClick={onExpand}
      className={cn(
        "w-full p-3 rounded-lg bg-surface-card border border-surface-border",
        "flex items-center justify-between",
        "active:bg-surface-elevated transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <div className="text-left">
          <p className="text-xs text-gray-500">Best Bid</p>
          <p className="text-sm font-medium text-emerald-400">{bestBid}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-gray-500">Best Ask</p>
          <p className="text-sm font-medium text-red-400">{bestAsk}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-gray-500">Spread</p>
          <p className="text-sm font-medium text-gray-300">{spread}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-lg font-bold text-white">{lastPrice}</p>
          <p
            className={cn(
              "text-xs font-medium",
              priceChange >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {priceChange >= 0 ? "+" : ""}
            {priceChange.toFixed(2)}%
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-gray-400" />
      </div>
    </button>
  );
}

/**
 * Responsive Container
 * Utility component for responsive heights
 */
interface ResponsiveContainerProps {
  children: React.ReactNode;
  mobileHeight?: string;
  tabletHeight?: string;
  desktopHeight?: string;
  className?: string;
}

export function ResponsiveContainer({
  children,
  mobileHeight = "calc(100vh - 180px)",
  tabletHeight = "500px",
  desktopHeight = "500px",
  className,
}: ResponsiveContainerProps) {
  return (
    <div
      className={cn(
        "overflow-hidden",
        className
      )}
      style={{
        // Use CSS custom properties for responsive heights
        ["--mobile-height" as string]: mobileHeight,
        ["--tablet-height" as string]: tabletHeight,
        ["--desktop-height" as string]: desktopHeight,
      }}
    >
      <style jsx>{`
        div {
          height: var(--mobile-height);
        }
        @media (min-width: 768px) {
          div {
            height: var(--tablet-height);
          }
        }
        @media (min-width: 1024px) {
          div {
            height: var(--desktop-height);
          }
        }
      `}</style>
      {children}
    </div>
  );
}

/**
 * Touch-Friendly Input
 * Larger touch targets for mobile trading inputs
 */
interface TouchFriendlyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
}

export function TouchFriendlyInput({
  label,
  value,
  onChange,
  suffix,
  placeholder = "0.00",
  type = "text",
  className,
}: TouchFriendlyInputProps) {
  return (
    <div className={className}>
      <label className="block text-sm text-gray-400 mb-2">{label}</label>
      <div className="relative">
        <input
          type={type}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full px-4 py-4 md:py-3 rounded-xl",
            "bg-surface-elevated border border-surface-border",
            "text-white text-lg md:text-base font-medium",
            "placeholder:text-gray-600",
            "focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50",
            "transition-colors",
            suffix && "pr-16"
          )}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Quick Amount Buttons
 * Touch-friendly percentage buttons for amount selection
 */
interface QuickAmountButtonsProps {
  values: number[];
  selectedValue: number;
  onSelect: (value: number) => void;
  className?: string;
}

export function QuickAmountButtons({
  values,
  selectedValue,
  onSelect,
  className,
}: QuickAmountButtonsProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      {values.map((value) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={cn(
            "flex-1 py-3 md:py-2 rounded-lg text-sm font-medium transition-colors",
            selectedValue === value
              ? "bg-brand-600 text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white active:bg-surface-border"
          )}
        >
          {value}%
        </button>
      ))}
    </div>
  );
}
