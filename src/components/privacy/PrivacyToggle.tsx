"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowRight,
  Shield,
  Info,
  Loader2,
  X,
  Fingerprint,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ElGamalRevealResult } from "@/lib/obelysk/ObelyskWalletContext";
import { ElGamalDecryptionDetails } from "./ElGamalDecryptionDetails";
import { ElGamalRevealModal } from "./ElGamalRevealModal";

// ============================================================================
// SIGNATURE-BASED REVEAL
// Revealing encrypted values REQUIRES a wallet signature to derive decryption key
// ============================================================================

type RevealState = "hidden" | "prompting" | "signing" | "decrypting" | "revealed" | "error";

// Masked value display - shows ••••• when private, requires signature to reveal
interface PrivateValueProps {
  value: string;
  isPrivate: boolean;
  symbol?: string;
  showReveal?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  // Optional: callback when reveal is requested (for custom signing logic)
  onRevealRequest?: () => Promise<boolean>;
}

export function PrivateValue({
  value,
  isPrivate,
  symbol = "",
  showReveal = true,
  size = "md",
  className,
  onRevealRequest,
}: PrivateValueProps) {
  const [revealState, setRevealState] = useState<RevealState>("hidden");
  const [showSignPrompt, setShowSignPrompt] = useState(false);
  
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
    xl: "text-2xl font-bold",
  };

  const handleRevealClick = useCallback(async () => {
    if (revealState === "revealed") {
      // Already revealed, hide it (no signature needed to hide)
      setRevealState("hidden");
      return;
    }
    
    // Show signature prompt
    setShowSignPrompt(true);
  }, [revealState]);

  const handleSignAndReveal = useCallback(async () => {
    setRevealState("signing");
    setShowSignPrompt(false);
    
    try {
      // If custom reveal handler provided, use it
      if (onRevealRequest) {
        const success = await onRevealRequest();
        if (success) {
          setRevealState("decrypting");
          // Simulate decryption time
          await new Promise(resolve => setTimeout(resolve, 500));
          setRevealState("revealed");
        } else {
          setRevealState("error");
          setTimeout(() => setRevealState("hidden"), 2000);
        }
        return;
      }
      
      // Default: simulate wallet signature request
      // In production, this would use useAccount + signMessage from starknet-react
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate signing delay
      
      setRevealState("decrypting");
      // Simulate ElGamal decryption
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setRevealState("revealed");
    } catch (error) {
      console.error("Failed to sign:", error);
      setRevealState("error");
      setTimeout(() => setRevealState("hidden"), 2000);
    }
  }, [onRevealRequest]);

  const showMasked = isPrivate && revealState !== "revealed";
  const isLoading = revealState === "signing" || revealState === "decrypting";

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn(sizeClasses[size], showMasked ? "text-brand-400 font-mono tracking-wider" : "text-white")}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {revealState === "signing" ? "Sign to decrypt..." : "Decrypting..."}
              </span>
            </span>
          ) : revealState === "error" ? (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3 h-3" />
              Failed
            </span>
          ) : showMasked ? (
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {"•••••••"}
            </span>
          ) : (
            <>
              {value} {symbol && <span className="text-gray-400 text-sm">{symbol}</span>}
            </>
          )}
        </span>
        {isPrivate && showReveal && !isLoading && (
          <button
            onClick={handleRevealClick}
            className="p-1 rounded hover:bg-surface-elevated transition-colors group"
            title={revealState === "revealed" ? "Hide value" : "Reveal value (requires signature)"}
          >
            {revealState === "revealed" ? (
              <EyeOff className="w-4 h-4 text-gray-400 group-hover:text-white" />
            ) : (
              <Eye className="w-4 h-4 text-brand-400 group-hover:text-brand-300" />
            )}
          </button>
        )}
      </div>

      {/* Signature Prompt Modal */}
      <AnimatePresence>
        {showSignPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowSignPrompt(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-card border border-white/10 rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-brand-400" />
                  </div>
                  <h3 className="font-semibold text-white">Signature Required</h3>
                </div>
                <button
                  onClick={() => setShowSignPrompt(false)}
                  className="text-gray-500 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  To reveal your encrypted balance, you need to sign a message with your wallet.
                  This signature is used to derive your decryption key.
                </p>
                
                <div className="p-3 rounded-lg bg-brand-500/10 border border-brand-500/20">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-brand-300">
                      <strong>Why is this needed?</strong>
                      <p className="mt-1 text-brand-400/80">
                        Your private balance is encrypted with ElGamal encryption. 
                        Only your wallet's private key can decrypt it. The signature 
                        proves ownership without exposing your key.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSignPrompt(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSignAndReveal}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-purple-500 text-white font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Fingerprint className="w-4 h-4" />
                    Sign & Reveal
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Encrypted hash display
interface EncryptedHashProps {
  className?: string;
}

export function EncryptedHash({ className }: EncryptedHashProps) {
  return (
    <div className={cn("flex items-center gap-2 font-mono text-xs", className)}>
      <Fingerprint className="w-3 h-3 text-brand-400" />
      <span className="text-brand-400/70">
        0x8a3f...e7b2
      </span>
      <span className="text-gray-600">(encrypted)</span>
    </div>
  );
}

// Privacy Mode Toggle - Main toggle for enabling privacy mode
interface PrivacyModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

export function PrivacyModeToggle({
  enabled,
  onToggle,
  className,
}: PrivacyModeToggleProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
      enabled 
        ? "bg-gradient-to-r from-brand-600/20 to-accent-purple/20 border-brand-500/40" 
        : "bg-surface-elevated/50 border-surface-border hover:border-gray-600",
      className
    )}
    onClick={() => onToggle(!enabled)}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-lg transition-colors",
          enabled ? "bg-brand-500/30" : "bg-surface-elevated"
        )}>
          {enabled ? (
            <EyeOff className="w-5 h-5 text-brand-400" />
          ) : (
            <Eye className="w-5 h-5 text-gray-400" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-white">Privacy Mode</p>
          <p className="text-xs text-gray-500">
            {enabled ? "Transactions encrypted on-chain" : "Standard public transactions"}
          </p>
        </div>
      </div>
      <div className={cn(
        "w-12 h-6 rounded-full transition-colors relative flex-shrink-0",
        enabled ? "bg-brand-600" : "bg-surface-border"
      )}>
        <motion.div
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
          animate={{ left: enabled ? 28 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>
    </div>
  );
}

// Privacy Balance Display with visual masking
interface PrivacyBalanceCardProps {
  publicBalance: string;
  privateBalance: string;
  symbol?: string;
  isRevealed?: boolean;  // External reveal state from context
  onReveal?: () => Promise<{
    totalBalance: bigint;
    decryptedNotes: import("@/lib/hooks/usePrivacyKeys").DecryptedNote[];
    publicKey: import("@/lib/crypto").ECPoint;
  }>;  // Callback to reveal with full result
  onHide?: () => void;  // Callback to hide
  onWrap?: (amount: string) => Promise<void>;
  onUnwrap?: (amount: string) => Promise<void>;
  decryptionResult?: ElGamalRevealResult | null;  // ElGamal decryption proof details
  staleNotesCount?: number;  // Notes not found on current contract
  localNotesBalance?: number;  // Balance from local notes
  onClearStaleNotes?: () => Promise<void>;  // Clear stale notes
  className?: string;
}

export function PrivacyBalanceCard({
  publicBalance,
  privateBalance,
  symbol = "SAGE",
  isRevealed = false,
  onReveal,
  onHide,
  onWrap,
  onUnwrap,
  decryptionResult,
  staleNotesCount = 0,
  localNotesBalance = 0,
  onClearStaleNotes,
  className,
}: PrivacyBalanceCardProps) {
  const [showWrapModal, setShowWrapModal] = useState(false);
  const [wrapDirection, setWrapDirection] = useState<"wrap" | "unwrap">("wrap");
  const [amount, setAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [privateRevealState, setPrivateRevealState] = useState<RevealState>(isRevealed ? "revealed" : "hidden");
  const [showRevealModal, setShowRevealModal] = useState(false);  // New multi-step modal
  const [showDecryptionProof, setShowDecryptionProof] = useState(false);
  const [isClearingStale, setIsClearingStale] = useState(false);

  // Sync local state with external isRevealed prop
  useEffect(() => {
    setPrivateRevealState(isRevealed ? "revealed" : "hidden");
  }, [isRevealed]);

  const handleRevealPrivate = useCallback(async () => {
    if (privateRevealState === "revealed") {
      setPrivateRevealState("hidden");
      onHide?.();
      return;
    }
    // Open the multi-step reveal modal
    setShowRevealModal(true);
  }, [privateRevealState, onHide]);

  // Wrapper for onReveal that returns the result
  const handleRevealWithResult = useCallback(async () => {
    if (!onReveal) {
      throw new Error("onReveal callback not provided");
    }
    const result = await onReveal();
    setPrivateRevealState("revealed");
    return result;
  }, [onReveal]);

  const handleAction = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    
    setIsProcessing(true);
    try {
      if (wrapDirection === "wrap" && onWrap) {
        await onWrap(amount);
      } else if (wrapDirection === "unwrap" && onUnwrap) {
        await onUnwrap(amount);
      }
      setAmount("");
      setShowWrapModal(false);
    } catch (error) {
      console.error("Privacy action failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const openWrapModal = (direction: "wrap" | "unwrap") => {
    setWrapDirection(direction);
    setAmount("");
    setShowWrapModal(true);
  };

  const maxAmount = wrapDirection === "wrap" ? publicBalance : privateBalance;

  return (
    <>
      <div className={cn("glass-card p-5", className)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-400" />
            Your Balances
          </h3>
          <div className="group relative">
            <Info className="w-4 h-4 text-gray-500 cursor-help" />
            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-surface-elevated border border-surface-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <p className="text-xs text-gray-300">
                <strong className="text-white">Public:</strong> Visible on-chain to everyone<br/><br/>
                <strong className="text-brand-400">Private:</strong> Encrypted with ElGamal. Only you can reveal the actual amount.
              </p>
            </div>
          </div>
        </div>

        {/* Stale notes warning - notes from old contract */}
        {staleNotesCount > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-amber-300 font-medium">
                  {staleNotesCount} stale note{staleNotesCount > 1 ? "s" : ""} detected
                </p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Found {localNotesBalance.toFixed(2)} {symbol} in local storage from a previous contract.
                  These notes are no longer valid on-chain.
                </p>
                {onClearStaleNotes && (
                  <button
                    onClick={async () => {
                      setIsClearingStale(true);
                      try {
                        await onClearStaleNotes();
                      } finally {
                        setIsClearingStale(false);
                      }
                    }}
                    disabled={isClearingStale}
                    className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors flex items-center gap-1"
                  >
                    {isClearingStale ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      "Clear stale notes"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Public Balance */}
          <div className="p-4 rounded-xl bg-surface-elevated/50 border border-surface-border">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Public</span>
            </div>
            <p className="text-2xl font-bold text-white mb-1">{publicBalance}</p>
            <p className="text-sm text-gray-500">{symbol}</p>
            <button
              onClick={() => openWrapModal("wrap")}
              className="mt-3 w-full py-2 px-3 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              Make Private
            </button>
          </div>

          {/* Private Balance - with masking */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-brand-600/10 to-accent-purple/10 border border-brand-500/30 relative overflow-hidden">
            {/* Encrypted pattern background */}
            <div className="absolute inset-0 opacity-5">
              <div className="text-[8px] font-mono text-brand-400 leading-tight break-all p-2">
                {Array(20).fill("0x8a3fe7b2c4d1f9a0").join(" ")}
              </div>
            </div>
            
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-brand-400" />
                  <span className="text-xs text-brand-400 uppercase tracking-wide">Private</span>
                </div>
                {privateRevealState !== "signing" && privateRevealState !== "decrypting" && (
                  <button
                    onClick={handleRevealPrivate}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                  >
                    {privateRevealState === "revealed" ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {privateRevealState === "revealed" ? "Hide" : "Reveal"}
                  </button>
                )}
                {(privateRevealState === "signing" || privateRevealState === "decrypting") && (
                  <div className="flex items-center gap-1 text-xs text-brand-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {privateRevealState === "signing" ? "Signing..." : "Decrypting..."}
                  </div>
                )}
              </div>
              
              {privateRevealState === "revealed" ? (
                <>
                  <p className="text-2xl font-bold text-white mb-1">{privateBalance}</p>
                  {/* View decryption proof button */}
                  {decryptionResult && decryptionResult.decryptedNotes.length > 0 && (
                    <button
                      onClick={() => setShowDecryptionProof(true)}
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      View ElGamal Proof
                    </button>
                  )}
                </>
              ) : (
                <div className="mb-1">
                  <p className="text-2xl font-bold text-brand-400 font-mono tracking-widest">•••••••</p>
                  <p className="text-[10px] text-brand-400/50 font-mono mt-1">
                    {privateRevealState === "signing" ? "awaiting signature..." :
                     privateRevealState === "decrypting" ? "decrypting..." : "encrypted"}
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500">{symbol}</p>

              <button
                onClick={() => openWrapModal("unwrap")}
                className="mt-3 w-full py-2 px-3 rounded-lg bg-surface-elevated/80 hover:bg-surface-elevated text-gray-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Unlock className="w-3.5 h-3.5" />
                Make Public
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Wrap/Unwrap Modal */}
      <AnimatePresence>
        {showWrapModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isProcessing && setShowWrapModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-surface-border flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  {wrapDirection === "wrap" ? (
                    <>
                      <Lock className="w-5 h-5 text-brand-400" />
                      Encrypt to Private
                    </>
                  ) : (
                    <>
                      <Unlock className="w-5 h-5 text-gray-400" />
                      Decrypt to Public
                    </>
                  )}
                </h3>
                <button
                  onClick={() => !isProcessing && setShowWrapModal(false)}
                  className="p-2 rounded-lg hover:bg-surface-elevated text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                {/* Visual Flow */}
                <div className="flex items-center justify-center gap-4 py-4">
                  <div className={cn(
                    "p-4 rounded-xl text-center",
                    wrapDirection === "wrap" ? "bg-surface-elevated" : "bg-brand-600/20"
                  )}>
                    {wrapDirection === "wrap" ? (
                      <>
                        <Eye className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                        <span className="text-xs text-gray-400">Visible</span>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-mono text-brand-400 mb-1">•••</div>
                        <span className="text-xs text-brand-400">Encrypted</span>
                      </>
                    )}
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-500" />
                  <div className={cn(
                    "p-4 rounded-xl text-center",
                    wrapDirection === "wrap" ? "bg-brand-600/20" : "bg-surface-elevated"
                  )}>
                    {wrapDirection === "wrap" ? (
                      <>
                        <div className="text-lg font-mono text-brand-400 mb-1">•••</div>
                        <span className="text-xs text-brand-400">Encrypted</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                        <span className="text-xs text-gray-400">Visible</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="input-field w-full pr-20 text-lg"
                      disabled={isProcessing}
                    />
                    <button
                      onClick={() => setAmount(maxAmount.replace(/,/g, ""))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 hover:text-brand-300"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Available: {maxAmount} {symbol}
                  </p>
                </div>

                {/* Info */}
                <div className={cn(
                  "p-3 rounded-lg border",
                  wrapDirection === "wrap" 
                    ? "bg-brand-600/10 border-brand-500/20" 
                    : "bg-surface-elevated/50 border-surface-border"
                )}>
                  <p className="text-xs text-gray-400">
                    {wrapDirection === "wrap" ? (
                      <>
                        <strong className="text-brand-400">🔐 Privacy Protection:</strong> Your balance will be encrypted 
                        using ElGamal encryption. The amount will show as "•••••••" on-chain. Only you can reveal it.
                      </>
                    ) : (
                      <>
                        <strong className="text-white">⚠️ Note:</strong> Decrypting requires generating a ZK proof 
                        to verify ownership. The amount will become publicly visible on-chain.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-surface-border">
                <button
                  onClick={handleAction}
                  disabled={isProcessing || !amount || parseFloat(amount) <= 0}
                  className={cn(
                    "w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                    isProcessing || !amount || parseFloat(amount) <= 0
                      ? "bg-surface-elevated text-gray-500 cursor-not-allowed"
                      : wrapDirection === "wrap"
                        ? "bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-accent-purple/90 text-white"
                        : "bg-surface-elevated hover:bg-surface-border text-white"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {wrapDirection === "wrap" ? "Encrypting..." : "Decrypting..."}
                    </>
                  ) : (
                    <>
                      {wrapDirection === "wrap" ? (
                        <>
                          <Lock className="w-4 h-4" />
                          Encrypt {amount || "0"} {symbol}
                        </>
                      ) : (
                        <>
                          <Unlock className="w-4 h-4" />
                          Decrypt {amount || "0"} {symbol}
                        </>
                      )}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ElGamal Reveal Modal - Multi-step cryptographic reveal flow */}
      <ElGamalRevealModal
        isOpen={showRevealModal}
        onClose={() => setShowRevealModal(false)}
        onReveal={handleRevealWithResult}
      />

      {/* ElGamal Decryption Proof Modal */}
      <AnimatePresence>
        {showDecryptionProof && decryptionResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDecryptionProof(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-card border border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-surface-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-brand-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">ElGamal Decryption Proof</h3>
                    <p className="text-xs text-gray-400">
                      Cryptographic verification of your private balance
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDecryptionProof(false)}
                  className="p-2 rounded-lg hover:bg-surface-elevated text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 p-4">
                <ElGamalDecryptionDetails
                  decryptedNotes={decryptionResult.decryptedNotes}
                  totalBalance={decryptionResult.totalBalance}
                  publicKey={decryptionResult.publicKey}
                />
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-surface-border">
                <button
                  onClick={() => setShowDecryptionProof(false)}
                  className="w-full py-2.5 rounded-lg bg-surface-elevated hover:bg-surface-border text-white font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Simple toggle for claiming/staking privately
interface PrivacyOptionProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

export function PrivacyOption({
  label,
  description,
  enabled,
  onToggle,
  className,
}: PrivacyOptionProps) {
  return (
    <div 
      className={cn(
        "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer",
        enabled 
          ? "bg-gradient-to-r from-brand-600/15 to-accent-purple/15 border-brand-500/40" 
          : "bg-surface-elevated/50 border-surface-border hover:border-gray-600",
        className
      )}
      onClick={() => onToggle(!enabled)}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-lg transition-colors",
          enabled ? "bg-brand-500/30" : "bg-surface-elevated"
        )}>
          {enabled ? (
            <EyeOff className="w-4 h-4 text-brand-400" />
          ) : (
            <Eye className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className={cn(
        "w-11 h-6 rounded-full transition-colors relative flex-shrink-0",
        enabled ? "bg-brand-600" : "bg-surface-border"
      )}>
        <motion.div
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
          animate={{ left: enabled ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>
    </div>
  );
}
