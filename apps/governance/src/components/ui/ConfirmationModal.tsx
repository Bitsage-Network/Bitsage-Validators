"use client";

/**
 * Confirmation Modal Component
 *
 * Generic confirmation dialog for critical operations.
 * Supports multiple variants and customization.
 */

import { Fragment, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Shield,
  Trash2,
  Send,
  Lock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  /** Variant affects styling and icon */
  variant?: "default" | "danger" | "warning" | "privacy";
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Show loading state on confirm */
  isLoading?: boolean;
  /** Require typing confirmation text */
  requireConfirmation?: string;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Additional content */
  children?: React.ReactNode;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  variant = "default",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  requireConfirmation,
  icon,
  children,
}: ConfirmationModalProps) {
  const [confirmInput, setConfirmInput] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  // Reset input when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmInput("");
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (requireConfirmation && confirmInput !== requireConfirmation) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const isConfirmDisabled =
    isLoading ||
    isConfirming ||
    !!(requireConfirmation && confirmInput !== requireConfirmation);

  const variantConfig = {
    default: {
      icon: icon || <CheckCircle2 className="h-6 w-6 text-blue-400" />,
      iconBg: "bg-blue-500/20",
      buttonColor: "bg-blue-600 hover:bg-blue-700",
    },
    danger: {
      icon: icon || <Trash2 className="h-6 w-6 text-red-400" />,
      iconBg: "bg-red-500/20",
      buttonColor: "bg-red-600 hover:bg-red-700",
    },
    warning: {
      icon: icon || <AlertTriangle className="h-6 w-6 text-yellow-400" />,
      iconBg: "bg-yellow-500/20",
      buttonColor: "bg-yellow-600 hover:bg-yellow-700",
    },
    privacy: {
      icon: icon || <Shield className="h-6 w-6 text-purple-400" />,
      iconBg: "bg-purple-500/20",
      buttonColor: "bg-purple-600 hover:bg-purple-700",
    },
  };

  const config = variantConfig[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="p-6 pb-0">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "p-3 rounded-xl",
                      config.iconBg
                    )}
                  >
                    {config.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">
                      {title}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">{description}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {children}

                {/* Confirmation input */}
                {requireConfirmation && (
                  <div className="mt-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      Type <span className="text-white font-mono">{requireConfirmation}</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      placeholder={requireConfirmation}
                      className={cn(
                        "w-full px-4 py-2 rounded-lg",
                        "bg-white/5 border border-white/10",
                        "text-white placeholder-gray-500",
                        "focus:outline-none focus:border-white/20",
                        "font-mono text-sm"
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 p-6 pt-0">
                <button
                  onClick={onClose}
                  disabled={isLoading || isConfirming}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl font-medium text-sm",
                    "bg-white/5 hover:bg-white/10 text-gray-300",
                    "transition-colors disabled:opacity-50"
                  )}
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isConfirmDisabled}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl font-medium text-sm",
                    "text-white transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "flex items-center justify-center gap-2",
                    config.buttonColor
                  )}
                >
                  {(isLoading || isConfirming) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Transaction Confirmation Modal
 *
 * Specialized modal for blockchain transactions.
 */
interface TransactionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  details: {
    label: string;
    value: string;
    isCurrency?: boolean;
    isAddress?: boolean;
  }[];
  estimatedGas?: string;
  isLoading?: boolean;
  variant?: "send" | "swap" | "privacy" | "stake";
}

export function TransactionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  details,
  estimatedGas,
  isLoading = false,
  variant = "send",
}: TransactionConfirmModalProps) {
  const variantConfig = {
    send: { icon: <Send className="h-6 w-6 text-blue-400" />, color: "blue" },
    swap: { icon: <Shield className="h-6 w-6 text-purple-400" />, color: "purple" },
    privacy: { icon: <Lock className="h-6 w-6 text-purple-400" />, color: "purple" },
    stake: { icon: <Shield className="h-6 w-6 text-green-400" />, color: "green" },
  };

  const config = variantConfig[variant];

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={description}
      variant={variant === "privacy" ? "privacy" : "default"}
      confirmText="Confirm Transaction"
      isLoading={isLoading}
      icon={config.icon}
    >
      {/* Transaction Details */}
      <div className="space-y-3">
        {details.map((detail, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
          >
            <span className="text-sm text-gray-400">{detail.label}</span>
            <span
              className={cn(
                "text-sm font-medium",
                detail.isCurrency ? "text-white" : "text-gray-300",
                detail.isAddress && "font-mono text-xs"
              )}
            >
              {detail.isAddress
                ? `${detail.value.slice(0, 8)}...${detail.value.slice(-6)}`
                : detail.value}
            </span>
          </div>
        ))}

        {estimatedGas && (
          <div className="flex items-center justify-between py-2 bg-white/5 rounded-lg px-3">
            <span className="text-xs text-gray-400">Estimated Gas</span>
            <span className="text-xs text-gray-300">{estimatedGas}</span>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}

/**
 * Privacy Operation Warning Modal
 *
 * Warning modal for privacy-sensitive operations.
 */
interface PrivacyWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  operation: "ragequit" | "reveal" | "associate";
  isLoading?: boolean;
}

export function PrivacyWarningModal({
  isOpen,
  onClose,
  onConfirm,
  operation,
  isLoading = false,
}: PrivacyWarningModalProps) {
  const operationConfig = {
    ragequit: {
      title: "Emergency Exit (Ragequit)",
      description:
        "This will publicly link your deposit to your address. Your privacy will be reduced.",
      warning:
        "After ragequit, your transaction history may be traceable. This action cannot be undone.",
      confirmText: "RAGEQUIT",
    },
    reveal: {
      title: "Reveal Transaction",
      description:
        "You are about to reveal private transaction details.",
      warning:
        "This information will be permanently visible. Only do this if required for compliance.",
      confirmText: "REVEAL",
    },
    associate: {
      title: "Join Association Set",
      description:
        "You are joining an association set for compliance purposes.",
      warning:
        "Your address will be associated with this set. This may reduce your privacy level.",
      confirmText: "I UNDERSTAND",
    },
  };

  const config = operationConfig[operation];

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={config.title}
      description={config.description}
      variant="warning"
      confirmText="Proceed"
      isLoading={isLoading}
      requireConfirmation={config.confirmText}
    >
      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200">{config.warning}</p>
        </div>
      </div>
    </ConfirmationModal>
  );
}
