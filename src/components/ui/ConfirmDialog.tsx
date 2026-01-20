/**
 * Confirmation Dialog Component
 *
 * Reusable confirmation dialog for risky operations
 */

"use client";

import { useState, ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  requiresTyping?: string; // e.g., "DELETE" or "CONFIRM"
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  requiresTyping,
  children,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const canConfirm = requiresTyping
    ? typedValue.toUpperCase() === requiresTyping.toUpperCase()
    : true;

  const handleConfirm = async () => {
    if (!canConfirm) return;

    setIsConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTypedValue("");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setTypedValue("");
  };

  const variantConfig = {
    danger: {
      icon: "bg-red-500/20 text-red-400",
      button: "bg-red-500 hover:bg-red-600 text-white",
      border: "border-red-500/30",
    },
    warning: {
      icon: "bg-yellow-500/20 text-yellow-400",
      button: "bg-yellow-500 hover:bg-yellow-600 text-black",
      border: "border-yellow-500/30",
    },
    info: {
      icon: "bg-blue-500/20 text-blue-400",
      button: "bg-brand-500 hover:bg-brand-600 text-white",
      border: "border-brand-500/30",
    },
  }[variant];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className={cn(
                "glass-card max-w-md w-full border-2",
                variantConfig.border
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between p-6 pb-4">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                      variantConfig.icon
                    )}
                  >
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {title}
                    </h3>
                    <div className="text-sm text-gray-400">{description}</div>
                  </div>
                </div>
                <button
                  onClick={handleCancel}
                  className="text-gray-500 hover:text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Custom Content */}
              {children && <div className="px-6 pb-4">{children}</div>}

              {/* Typing Confirmation */}
              {requiresTyping && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-gray-400 mb-2">
                    Type <span className="font-mono font-bold text-white">{requiresTyping}</span> to confirm
                  </p>
                  <input
                    type="text"
                    value={typedValue}
                    onChange={(e) => setTypedValue(e.target.value)}
                    placeholder={requiresTyping}
                    className="w-full bg-surface-elevated border border-surface-border rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                    autoFocus
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-border/50">
                <button
                  onClick={handleCancel}
                  disabled={isConfirming}
                  className="btn-secondary"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm || isConfirming}
                  className={cn(
                    "px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    variantConfig.button
                  )}
                >
                  {isConfirming ? "Processing..." : confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for managing confirm dialog state
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);

  const confirm = (action: () => void | Promise<void>) => {
    setPendingAction(() => action);
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setPendingAction(null);
  };

  return {
    open,
    setOpen,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
