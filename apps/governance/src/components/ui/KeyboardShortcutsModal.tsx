"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { getShortcutsList, useEscapeKey } from "@/lib/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  useEscapeKey(onClose, isOpen);

  const shortcuts = getShortcutsList();

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

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg"
          >
            <div className="glass-card p-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-surface-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-brand-500/20">
                    <Keyboard className="w-5 h-5 text-brand-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-surface-elevated transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
                {shortcuts.map((category) => (
                  <div key={category.category}>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                      {category.category}
                    </h3>
                    <div className="space-y-2">
                      {category.shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.description}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-elevated/50 transition-colors"
                        >
                          <span className="text-sm text-gray-300">{shortcut.description}</span>
                          <kbd className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated border border-surface-border text-xs font-mono text-gray-400">
                            {shortcut.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-surface-border bg-surface-elevated/30">
                <p className="text-xs text-gray-500 text-center">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-gray-400 font-mono">?</kbd> anytime to show this dialog
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Small keyboard hint displayed in the UI
 */
export function KeyboardHint({ keys, className }: { keys: string; className?: string }) {
  return (
    <kbd className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-elevated border border-surface-border text-xs font-mono text-gray-500 ${className || ""}`}>
      {keys}
    </kbd>
  );
}
