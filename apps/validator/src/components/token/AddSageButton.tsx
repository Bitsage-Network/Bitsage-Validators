"use client";

/**
 * Add SAGE Token to Wallet Button
 *
 * Allows users to easily add the SAGE token to their Braavos/ArgentX wallet
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Wallet,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  X,
  Coins,
} from "lucide-react";
import {
  addSageTokenToWallet,
  copyTokenAddress,
  getTokenExplorerUrl,
  SAGE_TOKEN_INFO,
} from "@/lib/utils/addTokenToWallet";
import { cn } from "@/lib/utils";

interface AddSageButtonProps {
  network?: "sepolia" | "devnet" | "mainnet";
  variant?: "default" | "compact" | "icon";
  className?: string;
}

export function AddSageButton({
  network = "sepolia",
  variant = "default",
  className,
}: AddSageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const tokenInfo = SAGE_TOKEN_INFO[network];
  const explorerUrl = getTokenExplorerUrl(network);

  const handleAddToWallet = async () => {
    setIsAdding(true);
    setResult(null);

    const res = await addSageTokenToWallet(network);
    setResult(res);
    setIsAdding(false);

    if (res.success) {
      // Auto-close modal after success
      setTimeout(() => {
        setIsOpen(false);
        setResult(null);
      }, 2000);
    }
  };

  const handleCopy = async () => {
    const success = await copyTokenAddress(network);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Render the button based on variant
  const renderButton = () => {
    // Compact variant - just a small button
    if (variant === "compact") {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm",
            "bg-emerald-500/20 text-emerald-400 rounded-lg",
            "hover:bg-emerald-500/30 transition-colors",
            className
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Add SAGE
        </button>
      );
    }

    // Icon variant - just an icon button
    if (variant === "icon") {
      return (
        <button
          onClick={() => setIsOpen(true)}
          title="Add SAGE token to wallet"
          className={cn(
            "p-2 rounded-lg bg-surface-elevated hover:bg-surface-border transition-colors",
            className
          )}
        >
          <Coins className="w-4 h-4 text-emerald-400" />
        </button>
      );
    }

    // Default variant
    return (
      <motion.button
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5",
          "bg-gradient-to-r from-emerald-600/20 to-accent-purple/20",
          "border border-emerald-500/30 rounded-xl",
          "hover:border-emerald-500/50 transition-all",
          "text-white font-medium",
          className
        )}
      >
        <Coins className="w-5 h-5 text-emerald-400" />
        Add SAGE to Wallet
      </motion.button>
    );
  };

  return (
    <>
      {renderButton()}

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !isAdding && setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-surface-border bg-surface-elevated/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <Coins className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Add SAGE Token</h3>
                      <p className="text-xs text-gray-500">
                        {network === "sepolia" ? "Sepolia Testnet" : network}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    disabled={isAdding}
                    className="p-2 hover:bg-surface-elevated rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Token Info */}
                <div className="p-4 bg-surface-elevated rounded-xl border border-surface-border">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <span className="text-emerald-400 font-bold">S</span>
                    </div>
                    <div>
                      <p className="font-semibold text-white">{tokenInfo.name}</p>
                      <p className="text-sm text-gray-400">{tokenInfo.symbol}</p>
                    </div>
                  </div>

                  {/* Contract Address */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Contract Address</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-gray-300 bg-surface-dark px-3 py-2 rounded-lg font-mono truncate">
                        {tokenInfo.address}
                      </code>
                      <button
                        onClick={handleCopy}
                        className="p-2 hover:bg-surface-dark rounded-lg transition-colors"
                        title="Copy address"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Decimals */}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Decimals</span>
                    <span className="text-white">{tokenInfo.decimals}</span>
                  </div>
                </div>

                {/* Result Message */}
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-3 rounded-lg flex items-start gap-2",
                      result.success
                        ? "bg-emerald-500/20 border border-emerald-500/30"
                        : "bg-yellow-500/10 border border-yellow-500/30"
                    )}
                  >
                    {result.success ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-emerald-300">
                          SAGE token added to your wallet!
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-yellow-300 whitespace-pre-line">
                          {result.error}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <motion.button
                    onClick={handleAddToWallet}
                    disabled={isAdding || !tokenInfo.address}
                    whileHover={{ scale: isAdding ? 1 : 1.02 }}
                    whileTap={{ scale: isAdding ? 1 : 0.98 }}
                    className={cn(
                      "w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2",
                      "bg-emerald-600 hover:bg-emerald-500 text-white transition-colors",
                      "disabled:bg-surface-elevated disabled:text-gray-500 disabled:cursor-not-allowed"
                    )}
                  >
                    {isAdding ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Wallet className="w-5 h-5" />
                        </motion.div>
                        Adding to Wallet...
                      </>
                    ) : (
                      <>
                        <Wallet className="w-5 h-5" />
                        Add to Wallet
                      </>
                    )}
                  </motion.button>

                  {explorerUrl && (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl font-medium flex items-center justify-center gap-2
                               bg-surface-elevated hover:bg-surface-border text-gray-300 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on Explorer
                    </a>
                  )}
                </div>

                {/* Manual Instructions */}
                <div className="text-xs text-gray-500 text-center">
                  <p>
                    Can't add automatically? Open your wallet → Settings → Add Token
                    → Paste the contract address above
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
