"use client";

/**
 * Keyboard Shortcuts Help Modal
 *
 * Displays all available keyboard shortcuts organized by category:
 * - Triggered by pressing "?" key
 * - Categorized shortcuts (Navigation, Actions, Tables, etc.)
 * - Platform-aware key display (Mac vs Windows)
 * - Search/filter shortcuts
 * - Closable with Escape or clicking outside
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Keyboard,
  Search,
  Navigation,
  MousePointer,
  Table,
  FileText,
  Settings,
  Command,
  ArrowRight,
} from "lucide-react";
import { useEscapeKey } from "@/lib/hooks/useKeyboardShortcuts";

// ============================================
// Types
// ============================================

interface ShortcutItem {
  keys: string[];
  description: string;
  context?: string;
}

interface ShortcutCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  shortcuts: ShortcutItem[];
}

interface FilteredShortcutCategory extends ShortcutCategory {
  filteredShortcuts?: ShortcutItem[];
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Platform Detection
// ============================================

function usePlatform(): "mac" | "windows" | "linux" {
  const [platform, setPlatform] = useState<"mac" | "windows" | "linux">("windows");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
      setPlatform("mac");
    } else if (userAgent.includes("linux")) {
      setPlatform("linux");
    } else {
      setPlatform("windows");
    }
  }, []);

  return platform;
}

// ============================================
// Key Symbols
// ============================================

function getKeySymbols(platform: "mac" | "windows" | "linux") {
  if (platform === "mac") {
    return {
      ctrl: "\u2318", // Command
      alt: "\u2325",  // Option
      shift: "\u21E7", // Shift
      enter: "\u21A9", // Return
      backspace: "\u232B", // Delete
      tab: "\u21E5",  // Tab
      escape: "esc",
      up: "\u2191",
      down: "\u2193",
      left: "\u2190",
      right: "\u2192",
      space: "space",
    };
  }
  return {
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    enter: "Enter",
    backspace: "Backspace",
    tab: "Tab",
    escape: "Esc",
    up: "\u2191",
    down: "\u2193",
    left: "\u2190",
    right: "\u2192",
    space: "Space",
  };
}

// ============================================
// Shortcut Data
// ============================================

function getShortcuts(platform: "mac" | "windows" | "linux"): ShortcutCategory[] {
  const k = getKeySymbols(platform);

  return [
    {
      id: "navigation",
      name: "Navigation",
      icon: Navigation,
      shortcuts: [
        { keys: [k.ctrl, "D"], description: "Go to Dashboard" },
        { keys: [k.ctrl, "J"], description: "Go to Jobs" },
        { keys: [k.ctrl, "E"], description: "Go to Earnings" },
        { keys: [k.ctrl, k.shift, "S"], description: "Go to Stake" },
        { keys: [k.ctrl, "G"], description: "Go to Governance" },
        { keys: [k.ctrl, "T"], description: "Go to Trade" },
        { keys: [k.ctrl, "W"], description: "Go to Wallet" },
        { keys: [k.ctrl, "P"], description: "Go to Privacy Pool" },
      ],
    },
    {
      id: "actions",
      name: "General Actions",
      icon: MousePointer,
      shortcuts: [
        { keys: ["/"], description: "Focus search input" },
        { keys: ["?"], description: "Show this help modal" },
        { keys: [k.escape], description: "Close modal / Cancel action" },
        { keys: [k.ctrl, "K"], description: "Open command palette" },
        { keys: [k.ctrl, "Z"], description: "Undo last action" },
        { keys: [k.ctrl, k.shift, "Z"], description: "Redo last action" },
      ],
    },
    {
      id: "tables",
      name: "Tables & Lists",
      icon: Table,
      shortcuts: [
        { keys: [k.up], description: "Move selection up" },
        { keys: [k.down], description: "Move selection down" },
        { keys: [k.space], description: "Toggle row selection" },
        { keys: [k.ctrl, "A"], description: "Select all rows" },
        { keys: [k.enter], description: "Open selected item" },
        { keys: ["J"], description: "Next item", context: "List navigation" },
        { keys: ["K"], description: "Previous item", context: "List navigation" },
      ],
    },
    {
      id: "bulk",
      name: "Bulk Actions",
      icon: FileText,
      shortcuts: [
        { keys: ["D"], description: "Delete selected items", context: "When items selected" },
        { keys: ["E"], description: "Export selected items", context: "When items selected" },
        { keys: ["R"], description: "Retry selected jobs", context: "When jobs selected" },
        { keys: ["A"], description: "Archive selected", context: "When items selected" },
        { keys: [k.escape], description: "Clear selection" },
      ],
    },
    {
      id: "forms",
      name: "Forms & Inputs",
      icon: Settings,
      shortcuts: [
        { keys: [k.tab], description: "Move to next field" },
        { keys: [k.shift, k.tab], description: "Move to previous field" },
        { keys: [k.enter], description: "Submit form" },
        { keys: [k.escape], description: "Cancel / Close form" },
        { keys: [k.ctrl, k.enter], description: "Submit with confirmation" },
      ],
    },
    {
      id: "transactions",
      name: "Transactions",
      icon: ArrowRight,
      shortcuts: [
        { keys: [k.ctrl, k.enter], description: "Confirm transaction" },
        { keys: [k.escape], description: "Cancel transaction" },
        { keys: ["M"], description: "Toggle MAX amount", context: "Amount input" },
        { keys: [k.ctrl, "C"], description: "Copy transaction hash", context: "After transaction" },
      ],
    },
  ];
}

// ============================================
// Key Component
// ============================================

interface KeyProps {
  children: React.ReactNode;
  variant?: "default" | "modifier" | "special";
}

function Key({ children, variant = "default" }: KeyProps) {
  const variantClasses = {
    default: "bg-gray-700 border-gray-600 text-gray-200",
    modifier: "bg-gray-800 border-gray-700 text-gray-300",
    special: "bg-gray-700/50 border-gray-600/50 text-gray-400",
  };

  return (
    <kbd
      className={`
        inline-flex items-center justify-center min-w-[24px] h-6 px-1.5
        text-xs font-medium rounded border shadow-sm
        ${variantClasses[variant]}
      `}
    >
      {children}
    </kbd>
  );
}

// ============================================
// Shortcut Row Component
// ============================================

interface ShortcutRowProps {
  shortcut: ShortcutItem;
  searchQuery?: string;
}

function ShortcutRow({ shortcut, searchQuery }: ShortcutRowProps) {
  // Highlight matching text
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-blue-500/30 text-white rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-800/50 transition-colors group">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-gray-200">
          {highlightText(shortcut.description)}
        </span>
        {shortcut.context && (
          <span className="text-xs text-gray-500">{shortcut.context}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <React.Fragment key={i}>
            <Key variant={key.length > 1 ? "modifier" : "default"}>{key}</Key>
            {i < shortcut.keys.length - 1 && (
              <span className="text-gray-600 text-xs">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Category Section Component
// ============================================

interface CategorySectionProps {
  category: ShortcutCategory;
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery?: string;
  filteredShortcuts?: ShortcutItem[];
}

function CategorySection({
  category,
  isExpanded,
  onToggle,
  searchQuery,
  filteredShortcuts,
}: CategorySectionProps) {
  const Icon = category.icon;
  const shortcuts = filteredShortcuts || category.shortcuts;

  if (shortcuts.length === 0) return null;

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
          <span className="font-medium text-white">{category.name}</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {shortcuts.length}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-2 bg-gray-900/30 border-t border-gray-800 space-y-1">
          {shortcuts.map((shortcut, i) => (
            <ShortcutRow key={i} shortcut={shortcut} searchQuery={searchQuery} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const platform = usePlatform();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["navigation", "actions"]));

  // Get shortcuts for current platform
  const shortcuts = useMemo(() => getShortcuts(platform), [platform]);

  // Filter shortcuts based on search
  const filteredCategories: FilteredShortcutCategory[] = useMemo(() => {
    if (!searchQuery.trim()) return shortcuts;

    const query = searchQuery.toLowerCase();
    return shortcuts.map((category) => ({
      ...category,
      filteredShortcuts: category.shortcuts.filter(
        (s) =>
          s.description.toLowerCase().includes(query) ||
          s.keys.join(" ").toLowerCase().includes(query) ||
          s.context?.toLowerCase().includes(query)
      ),
    })).filter((c) => c.filteredShortcuts.length > 0);
  }, [shortcuts, searchQuery]);

  // Toggle category expansion
  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  // Expand all when searching
  useEffect(() => {
    if (searchQuery) {
      setExpandedCategories(new Set(shortcuts.map((c) => c.id)));
    }
  }, [searchQuery, shortcuts]);

  // Handle escape key
  useEscapeKey(onClose, isOpen);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      const input = document.getElementById("shortcut-search");
      setTimeout(() => input?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalShortcuts = shortcuts.reduce((acc, c) => acc + c.shortcuts.length, 0);
  const filteredCount = filteredCategories.reduce(
    (acc, c) => acc + (c.filteredShortcuts?.length || c.shortcuts.length),
    0
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] mx-4 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Keyboard className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Keyboard Shortcuts</h2>
              <p className="text-sm text-gray-400">
                {totalShortcuts} shortcuts available
                {platform === "mac" ? " for Mac" : platform === "linux" ? " for Linux" : " for Windows"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              id="shortcut-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-sm text-gray-500">
              Showing {filteredCount} of {totalShortcuts} shortcuts
            </p>
          )}
        </div>

        {/* Shortcuts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                isExpanded={expandedCategories.has(category.id)}
                onToggle={() => toggleCategory(category.id)}
                searchQuery={searchQuery}
                filteredShortcuts={"filteredShortcuts" in category ? category.filteredShortcuts : undefined}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Search className="w-12 h-12 mb-4 text-gray-600" />
              <p className="text-lg font-medium">No shortcuts found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/50">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Command className="w-4 h-4" />
              <span>
                {platform === "mac" ? "Use \u2318 for Command" : "Use Ctrl for shortcuts"}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                Press <Key>?</Key> to toggle this modal
              </span>
              <span className="flex items-center gap-1">
                <Key>{platform === "mac" ? "esc" : "Esc"}</Key> to close
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Hook to manage modal state
// ============================================

export function useKeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Listen for "?" key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input field
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" ||
                      target.tagName === "TEXTAREA" ||
                      target.isContentEditable;

      if (isInput) return;

      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return { isOpen, open, close, toggle };
}

// ============================================
// Quick Reference Component (Inline)
// ============================================

interface QuickReferenceProps {
  shortcuts: { keys: string[]; label: string }[];
  className?: string;
}

export function QuickReference({ shortcuts, className = "" }: QuickReferenceProps) {
  return (
    <div className={`flex items-center gap-4 text-xs text-gray-500 ${className}`}>
      {shortcuts.map((shortcut, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span>{shortcut.label}:</span>
          <div className="flex items-center gap-0.5">
            {shortcut.keys.map((key, j) => (
              <Key key={j} variant="special">{key}</Key>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Floating Help Button
// ============================================

interface FloatingHelpButtonProps {
  onClick: () => void;
  className?: string;
}

export function FloatingHelpButton({ onClick, className = "" }: FloatingHelpButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-6 right-6 z-40
        flex items-center justify-center w-12 h-12
        bg-gray-800 hover:bg-gray-700 border border-gray-700
        text-gray-400 hover:text-white
        rounded-full shadow-lg
        transition-all hover:scale-105
        ${className}
      `}
      title="Keyboard shortcuts (?)"
    >
      <Keyboard className="w-5 h-5" />
    </button>
  );
}

export type { ShortcutItem, ShortcutCategory, KeyboardShortcutsModalProps };
