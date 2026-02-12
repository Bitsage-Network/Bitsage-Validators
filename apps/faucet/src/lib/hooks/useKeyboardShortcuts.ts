"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type ShortcutCallback = () => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  callback: ShortcutCallback;
  description: string;
  when?: "always" | "noInput";
}

// Global shortcuts configuration
const GLOBAL_SHORTCUTS: Omit<ShortcutConfig, "callback">[] = [
  { key: "d", ctrl: true, description: "Go to Dashboard", when: "noInput" },
  { key: "j", ctrl: true, description: "Go to Jobs", when: "noInput" },
  { key: "e", ctrl: true, description: "Go to Earnings", when: "noInput" },
  { key: "s", ctrl: true, shift: true, description: "Go to Stake", when: "noInput" },
  { key: "g", ctrl: true, description: "Go to Governance", when: "noInput" },
  { key: "t", ctrl: true, description: "Go to Trade", when: "noInput" },
  { key: "w", ctrl: true, description: "Go to Wallet", when: "noInput" },
  { key: "?", shift: true, description: "Show keyboard shortcuts", when: "noInput" },
  { key: "Escape", description: "Close modals/dialogs", when: "always" },
  { key: "/", description: "Focus search", when: "noInput" },
];

/**
 * Hook to register and manage keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field
      const target = event.target as HTMLElement;
      const isInput = target.tagName === "INPUT" ||
                      target.tagName === "TEXTAREA" ||
                      target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        // Skip shortcuts that shouldn't fire in input fields
        if (shortcut.when === "noInput" && isInput) continue;

        // Check key match
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        // Check modifiers
        if (shortcut.ctrl && !event.ctrlKey && !event.metaKey) continue;
        if (shortcut.shift && !event.shiftKey) continue;
        if (shortcut.alt && !event.altKey) continue;
        if (shortcut.meta && !event.metaKey) continue;

        // All conditions met, execute callback
        event.preventDefault();
        shortcut.callback();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Hook for global navigation shortcuts
 */
export function useGlobalShortcuts(onShowHelp?: () => void) {
  const router = useRouter();

  const shortcuts: ShortcutConfig[] = [
    { key: "d", ctrl: true, description: "Dashboard", when: "noInput", callback: () => router.push("/dashboard") },
    { key: "j", ctrl: true, description: "Jobs", when: "noInput", callback: () => router.push("/jobs") },
    { key: "e", ctrl: true, description: "Earnings", when: "noInput", callback: () => router.push("/earnings") },
    { key: "s", ctrl: true, shift: true, description: "Stake", when: "noInput", callback: () => router.push("/stake") },
    { key: "g", ctrl: true, description: "Governance", when: "noInput", callback: () => router.push("/governance") },
    { key: "t", ctrl: true, description: "Trade", when: "noInput", callback: () => router.push("/trade") },
    { key: "w", ctrl: true, description: "Wallet", when: "noInput", callback: () => router.push("/wallet") },
  ];

  if (onShowHelp) {
    shortcuts.push({
      key: "?",
      shift: true,
      description: "Show help",
      when: "noInput",
      callback: onShowHelp,
    });
  }

  useKeyboardShortcuts(shortcuts);
}

/**
 * Hook for search input focus
 */
export function useSearchShortcut(inputRef: React.RefObject<HTMLInputElement>) {
  useKeyboardShortcuts([
    {
      key: "/",
      description: "Focus search",
      when: "noInput",
      callback: () => {
        inputRef.current?.focus();
      },
    },
  ]);
}

/**
 * Hook for escape key to close modals
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useKeyboardShortcuts(
    enabled
      ? [
          {
            key: "Escape",
            description: "Close",
            when: "always",
            callback: onEscape,
          },
        ]
      : []
  );
}

/**
 * Get formatted shortcut string for display
 */
export function formatShortcut(shortcut: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  if (shortcut.ctrl) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  if (shortcut.alt) parts.push(isMac ? "⌥" : "Alt");
  if (shortcut.meta) parts.push(isMac ? "⌘" : "Win");

  // Format special keys
  let key = shortcut.key;
  if (key === "Escape") key = "Esc";
  if (key === "ArrowUp") key = "↑";
  if (key === "ArrowDown") key = "↓";
  if (key === "ArrowLeft") key = "←";
  if (key === "ArrowRight") key = "→";
  if (key === " ") key = "Space";

  parts.push(key.toUpperCase());

  return parts.join(isMac ? "" : "+");
}

/**
 * Get list of all available shortcuts for help modal
 */
export function getShortcutsList(): { category: string; shortcuts: { keys: string; description: string }[] }[] {
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const ctrl = isMac ? "⌘" : "Ctrl+";

  return [
    {
      category: "Navigation",
      shortcuts: [
        { keys: `${ctrl}D`, description: "Go to Dashboard" },
        { keys: `${ctrl}J`, description: "Go to Jobs" },
        { keys: `${ctrl}E`, description: "Go to Earnings" },
        { keys: `${ctrl}${isMac ? "⇧" : "Shift+"}S`, description: "Go to Stake" },
        { keys: `${ctrl}G`, description: "Go to Governance" },
        { keys: `${ctrl}T`, description: "Go to Trade" },
        { keys: `${ctrl}W`, description: "Go to Wallet" },
      ],
    },
    {
      category: "Actions",
      shortcuts: [
        { keys: "/", description: "Focus search" },
        { keys: "Esc", description: "Close modal/dialog" },
        { keys: "?", description: "Show keyboard shortcuts" },
      ],
    },
  ];
}
