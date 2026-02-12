"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  Coins,
  Vote,
  ArrowLeftRight,
  Wallet,
  Settings,
  FileText,
  Shield,
  Network,
  Zap,
  Plus,
  ExternalLink,
  Command,
  Keyboard,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string[];
  shortcut?: string;
  category: "navigation" | "actions" | "settings" | "external";
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define all available commands
  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      description: "View your validator overview",
      icon: LayoutDashboard,
      action: () => { router.push("/dashboard"); onClose(); },
      keywords: ["home", "overview", "main"],
      shortcut: "⌘D",
      category: "navigation",
    },
    {
      id: "nav-jobs",
      label: "Go to Jobs",
      description: "View job history and analytics",
      icon: Briefcase,
      action: () => { router.push("/jobs"); onClose(); },
      keywords: ["tasks", "work", "history"],
      shortcut: "⌘J",
      category: "navigation",
    },
    {
      id: "nav-earnings",
      label: "Go to Earnings",
      description: "Track your validation rewards",
      icon: TrendingUp,
      action: () => { router.push("/earnings"); onClose(); },
      keywords: ["rewards", "income", "money"],
      shortcut: "⌘E",
      category: "navigation",
    },
    {
      id: "nav-stake",
      label: "Go to Stake",
      description: "Manage your SAGE stake",
      icon: Coins,
      action: () => { router.push("/stake"); onClose(); },
      keywords: ["staking", "delegate"],
      shortcut: "⌘⇧S",
      category: "navigation",
    },
    {
      id: "nav-governance",
      label: "Go to Governance",
      description: "Vote on proposals",
      icon: Vote,
      action: () => { router.push("/governance"); onClose(); },
      keywords: ["voting", "proposals", "dao"],
      shortcut: "⌘G",
      category: "navigation",
    },
    {
      id: "nav-trade",
      label: "Go to Trade",
      description: "Trade SAGE tokens",
      icon: ArrowLeftRight,
      action: () => { router.push("/trade"); onClose(); },
      keywords: ["swap", "exchange", "buy", "sell"],
      shortcut: "⌘T",
      category: "navigation",
    },
    {
      id: "nav-wallet",
      label: "Go to Wallet",
      description: "Manage your wallet",
      icon: Wallet,
      action: () => { router.push("/wallet"); onClose(); },
      keywords: ["balance", "tokens", "assets"],
      shortcut: "⌘W",
      category: "navigation",
    },
    {
      id: "nav-proofs",
      label: "Go to Proofs",
      description: "View proof history",
      icon: Shield,
      action: () => { router.push("/proofs"); onClose(); },
      keywords: ["zk", "verification"],
      category: "navigation",
    },
    {
      id: "nav-network",
      label: "Go to Network",
      description: "Network statistics",
      icon: Network,
      action: () => { router.push("/network"); onClose(); },
      keywords: ["stats", "validators"],
      category: "navigation",
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      description: "Configure your preferences",
      icon: Settings,
      action: () => { router.push("/settings"); onClose(); },
      keywords: ["preferences", "config"],
      category: "navigation",
    },
    {
      id: "nav-docs",
      label: "Go to Documentation",
      description: "Read the docs",
      icon: FileText,
      action: () => { router.push("/docs"); onClose(); },
      keywords: ["help", "guide", "tutorial"],
      category: "navigation",
    },

    // Actions
    {
      id: "action-submit-job",
      label: "Submit New Job",
      description: "Submit a new computation job",
      icon: Plus,
      action: () => { router.push("/jobs?submit=true"); onClose(); },
      keywords: ["create", "new", "add"],
      category: "actions",
    },
    {
      id: "action-claim-rewards",
      label: "Claim Rewards",
      description: "Claim pending SAGE rewards",
      icon: Zap,
      action: () => { router.push("/earnings"); onClose(); },
      keywords: ["collect", "harvest"],
      category: "actions",
    },
    {
      id: "action-stake",
      label: "Stake SAGE",
      description: "Stake tokens to validate",
      icon: Coins,
      action: () => { router.push("/stake"); onClose(); },
      keywords: ["deposit", "lock"],
      category: "actions",
    },
    {
      id: "action-keyboard",
      label: "Keyboard Shortcuts",
      description: "View all shortcuts",
      icon: Keyboard,
      action: () => { onClose(); /* Will trigger shortcuts modal */ },
      shortcut: "?",
      category: "settings",
    },

    // External
    {
      id: "ext-explorer",
      label: "Open Block Explorer",
      description: "View on Starkscan",
      icon: ExternalLink,
      action: () => { window.open("https://sepolia.starkscan.co", "_blank"); onClose(); },
      keywords: ["blockchain", "transactions"],
      category: "external",
    },
    {
      id: "ext-github",
      label: "Open GitHub",
      description: "View source code",
      icon: ExternalLink,
      action: () => { window.open("https://github.com/bitsage", "_blank"); onClose(); },
      keywords: ["code", "repository"],
      category: "external",
    },
  ], [router, onClose]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return commands;

    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd => {
      const matchLabel = cmd.label.toLowerCase().includes(lowerQuery);
      const matchDesc = cmd.description?.toLowerCase().includes(lowerQuery);
      const matchKeywords = cmd.keywords?.some(k => k.toLowerCase().includes(lowerQuery));
      return matchLabel || matchDesc || matchKeywords;
    });
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      navigation: [],
      actions: [],
      settings: [],
      external: [],
    };

    filteredCommands.forEach(cmd => {
      groups[cmd.category].push(cmd);
    });

    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    actions: "Actions",
    settings: "Settings",
    external: "External Links",
  };

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl"
          >
            <div className="glass-card overflow-hidden shadow-2xl border border-surface-border">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
                <Search className="w-5 h-5 text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-gray-500"
                />
                <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated border border-surface-border text-xs text-gray-500">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div
                ref={listRef}
                className="max-h-[50vh] overflow-y-auto py-2"
              >
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <p>No commands found for "{query}"</p>
                  </div>
                ) : (
                  Object.entries(groupedCommands).map(([category, items]) => {
                    if (items.length === 0) return null;

                    return (
                      <div key={category} className="mb-2">
                        <div className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {categoryLabels[category]}
                        </div>
                        {items.map((cmd) => {
                          const currentIndex = globalIndex++;
                          const Icon = cmd.icon;
                          const isSelected = currentIndex === selectedIndex;

                          return (
                            <button
                              key={cmd.id}
                              data-index={currentIndex}
                              onClick={() => cmd.action()}
                              onMouseEnter={() => setSelectedIndex(currentIndex)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                isSelected
                                  ? "bg-brand-600/20 text-white"
                                  : "text-gray-300 hover:bg-surface-elevated"
                              )}
                            >
                              <div className={cn(
                                "p-1.5 rounded-lg",
                                isSelected ? "bg-brand-500/30" : "bg-surface-elevated"
                              )}>
                                <Icon className={cn(
                                  "w-4 h-4",
                                  isSelected ? "text-brand-400" : "text-gray-500"
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{cmd.label}</p>
                                {cmd.description && (
                                  <p className="text-xs text-gray-500 truncate">{cmd.description}</p>
                                )}
                              </div>
                              {cmd.shortcut && (
                                <kbd className="px-2 py-0.5 rounded bg-surface-elevated border border-surface-border text-xs text-gray-500">
                                  {cmd.shortcut}
                                </kbd>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-surface-border bg-surface-elevated/30 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border">↑</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border">↓</kbd>
                    to navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border">↵</kbd>
                    to select
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Command className="w-3 h-3" />
                  <span>K to open</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to open command palette with Cmd+K
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      description: "Open command palette",
      when: "noInput",
      callback: () => setIsOpen(true),
    },
  ]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
