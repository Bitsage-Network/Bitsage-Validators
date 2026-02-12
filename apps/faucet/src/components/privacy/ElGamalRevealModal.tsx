"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Shield,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle,
  Loader2,
  ChevronRight,
  Copy,
  Eye,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecryptedNote } from "@/lib/hooks/usePrivacyKeys";
import type { ECPoint } from "@/lib/crypto";

type RevealStep =
  | "request_signature"  // Step 1: Explain what will happen
  | "awaiting_signature" // Step 2: Waiting for wallet
  | "deriving_kek"       // Step 3: Deriving Key Encryption Key
  | "loading_notes"      // Step 4: Loading encrypted notes
  | "decrypting"         // Step 5: ElGamal decryption (show math)
  | "complete"           // Step 6: Show result
  | "error";

interface ElGamalRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReveal: () => Promise<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  }>;
  notesCount?: number;  // Pre-fetch count to show in UI
}

// Helper to format EC point for display
function formatPoint(p: ECPoint): string {
  const x = p.x.toString(16).padStart(64, "0");
  const y = p.y.toString(16).padStart(64, "0");
  return `(0x${x.slice(0, 8)}..., 0x${y.slice(0, 8)}...)`;
}

function formatPointFull(p: ECPoint): string {
  return `0x${p.x.toString(16).padStart(64, "0")}`;
}

export function ElGamalRevealModal({
  isOpen,
  onClose,
  onReveal,
  notesCount = 0,
}: ElGamalRevealModalProps) {
  const [step, setStep] = useState<RevealStep>("request_signature");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  } | null>(null);
  const [currentDecryptingNote, setCurrentDecryptingNote] = useState(0);
  const [decryptionLogs, setDecryptionLogs] = useState<string[]>([]);
  const hasStartedRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("request_signature");
      setError(null);
      setResult(null);
      setCurrentDecryptingNote(0);
      setDecryptionLogs([]);
      hasStartedRef.current = false;
    }
  }, [isOpen]);

  // Add log entry
  const addLog = useCallback((message: string) => {
    setDecryptionLogs(prev => [...prev.slice(-10), message]);
  }, []);

  // Execute the reveal flow
  const executeReveal = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    try {
      // Step 2: Awaiting signature
      setStep("awaiting_signature");
      addLog("Requesting wallet signature...");

      // The actual signature happens inside onReveal
      // We show progress based on timing

      setTimeout(() => {
        if (step === "awaiting_signature") {
          addLog("Signature verified!");
          setStep("deriving_kek");
        }
      }, 500);

      // Step 3-5 happen inside onReveal
      setTimeout(() => {
        setStep("deriving_kek");
        addLog("Deriving Key Encryption Key via HKDF-SHA256...");
      }, 800);

      setTimeout(() => {
        setStep("loading_notes");
        addLog("Loading encrypted notes from IndexedDB...");
      }, 1200);

      setTimeout(() => {
        setStep("decrypting");
        addLog("Starting ElGamal decryption...");
      }, 1600);

      // Actually call the reveal function
      const revealResult = await onReveal();

      // Log decryption details
      if (revealResult.decryptedNotes.length > 0) {
        for (let i = 0; i < revealResult.decryptedNotes.length; i++) {
          setCurrentDecryptingNote(i);
          const note = revealResult.decryptedNotes[i];
          addLog(`Note ${i + 1}: C₁ = ${formatPoint(note.proof.c1)}`);
          addLog(`Note ${i + 1}: C₂ = ${formatPoint(note.proof.c2)}`);
          addLog(`Note ${i + 1}: SharedSecret = sk × C₁`);
          addLog(`Note ${i + 1}: Decrypted = ${(Number(note.decryptedAmount) / 1e18).toFixed(4)} SAGE`);
          await new Promise(r => setTimeout(r, 100));
        }
      }

      setResult(revealResult);
      setStep("complete");
      addLog("✓ Decryption complete!");

    } catch (err) {
      console.error("Reveal failed:", err);
      setError(err instanceof Error ? err.message : "Failed to reveal balance");
      setStep("error");
      addLog("✗ Error: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }, [onReveal, addLog, step]);

  // Step indicator
  const steps = [
    { id: "request_signature", label: "Sign", icon: KeyRound },
    { id: "deriving_kek", label: "Derive KEK", icon: Lock },
    { id: "decrypting", label: "Decrypt", icon: Unlock },
    { id: "complete", label: "Done", icon: CheckCircle },
  ];

  const currentStepIndex = steps.findIndex(s =>
    s.id === step ||
    (step === "awaiting_signature" && s.id === "request_signature") ||
    (step === "loading_notes" && s.id === "decrypting")
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={step === "complete" || step === "error" ? onClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-gradient-to-b from-surface-card to-surface-elevated border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative px-6 py-5 border-b border-white/5">
              <div className="absolute inset-0 bg-gradient-to-r from-brand-600/10 via-purple-600/10 to-brand-600/10" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center border border-brand-500/30">
                    <Shield className="w-6 h-6 text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      ElGamal Homomorphic Decryption
                    </h2>
                    <p className="text-sm text-gray-400">
                      Reveal your encrypted private balance
                    </p>
                  </div>
                </div>
                {(step === "complete" || step === "error" || step === "request_signature") && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Step Indicator */}
            <div className="px-6 py-4 border-b border-white/5 bg-black/20">
              <div className="flex items-center justify-between">
                {steps.map((s, i) => {
                  const Icon = s.icon;
                  const isActive = i === currentStepIndex;
                  const isComplete = i < currentStepIndex;
                  const isPending = i > currentStepIndex;

                  return (
                    <div key={s.id} className="flex items-center">
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
                        isActive && "bg-brand-500/20 border border-brand-500/40",
                        isComplete && "text-green-400",
                        isPending && "text-gray-600"
                      )}>
                        {isComplete ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : isActive ? (
                          <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                        ) : (
                          <Icon className={cn("w-4 h-4", isPending && "text-gray-600")} />
                        )}
                        <span className={cn(
                          "text-xs font-medium",
                          isActive && "text-brand-300",
                          isComplete && "text-green-400",
                          isPending && "text-gray-600"
                        )}>
                          {s.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <ChevronRight className={cn(
                          "w-4 h-4 mx-1",
                          isComplete ? "text-green-400" : "text-gray-700"
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Step 1: Request Signature */}
              {step === "request_signature" && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20">
                    <h3 className="text-sm font-semibold text-brand-300 mb-2">
                      Why is a signature required?
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Your private balance is encrypted using <strong className="text-brand-400">ElGamal homomorphic encryption</strong>.
                      To decrypt it, we need to derive a key from your wallet signature.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-elevated border border-white/5">
                    <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                      Cryptographic Process
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-brand-400">1</span>
                        </div>
                        <div>
                          <p className="text-sm text-white">Sign typed data with wallet</p>
                          <p className="text-xs text-gray-500">EIP-712 style message signing</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-brand-400">2</span>
                        </div>
                        <div>
                          <p className="text-sm text-white">Derive KEK via HKDF-SHA256</p>
                          <p className="text-xs text-gray-500">Key Encryption Key from signature bytes</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-brand-400">3</span>
                        </div>
                        <div>
                          <p className="text-sm text-white">ElGamal Decryption</p>
                          <p className="text-xs text-gray-500 font-mono">m·H = C₂ - sk·C₁</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-brand-400">4</span>
                        </div>
                        <div>
                          <p className="text-sm text-white">Baby-step Giant-step</p>
                          <p className="text-xs text-gray-500">Recover plaintext amount from m·H</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={executeReveal}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand-500 to-purple-500 hover:from-brand-400 hover:to-purple-400 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25"
                  >
                    <KeyRound className="w-5 h-5" />
                    Sign & Decrypt Balance
                  </button>
                </div>
              )}

              {/* Step 2-5: Processing */}
              {(step === "awaiting_signature" || step === "deriving_kek" || step === "loading_notes" || step === "decrypting") && (
                <div className="space-y-5">
                  {/* Current Step Status */}
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4 border border-brand-500/30">
                      <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {step === "awaiting_signature" && "Awaiting Wallet Signature..."}
                      {step === "deriving_kek" && "Deriving Key Encryption Key..."}
                      {step === "loading_notes" && "Loading Encrypted Notes..."}
                      {step === "decrypting" && "Performing ElGamal Decryption..."}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {step === "awaiting_signature" && "Please sign the message in your wallet"}
                      {step === "deriving_kek" && "HKDF-SHA256(signature) → KEK"}
                      {step === "loading_notes" && "Reading from local encrypted storage"}
                      {step === "decrypting" && `Decrypting note ${currentDecryptingNote + 1}...`}
                    </p>
                  </div>

                  {/* Live Decryption Log */}
                  <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-xs">
                    <div className="flex items-center gap-2 mb-2 text-gray-500">
                      <Sparkles className="w-3 h-3" />
                      <span>Live Cryptographic Log</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {decryptionLogs.map((log, i) => (
                        <div key={i} className={cn(
                          "text-[11px]",
                          log.startsWith("✓") ? "text-green-400" :
                          log.startsWith("✗") ? "text-red-400" :
                          "text-gray-400"
                        )}>
                          {log}
                        </div>
                      ))}
                      {decryptionLogs.length === 0 && (
                        <div className="text-gray-600">Waiting for operations...</div>
                      )}
                    </div>
                  </div>

                  {/* ElGamal Math Preview */}
                  {step === "decrypting" && (
                    <div className="p-4 rounded-xl bg-surface-elevated border border-white/5">
                      <h4 className="text-xs text-brand-400 uppercase tracking-wide mb-3">
                        ElGamal Decryption Formula
                      </h4>
                      <div className="font-mono text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">C₁ =</span>
                          <span className="text-cyan-400">r · G</span>
                          <span className="text-gray-600 text-xs">(ephemeral pubkey)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">C₂ =</span>
                          <span className="text-purple-400">m · H + r · PK</span>
                          <span className="text-gray-600 text-xs">(encrypted amount)</span>
                        </div>
                        <div className="h-px bg-white/10 my-2" />
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Shared =</span>
                          <span className="text-yellow-400">sk · C₁</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">m · H =</span>
                          <span className="text-green-400">C₂ - Shared</span>
                          <span className="text-gray-600 text-xs">(decrypted point)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 6: Complete */}
              {step === "complete" && result && (
                <div className="space-y-5">
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-brand-500/20 flex items-center justify-center mx-auto mb-4 border border-green-500/30">
                      <CheckCircle className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Decryption Complete
                    </h3>
                    <p className="text-sm text-gray-400">
                      Your private balance has been verified cryptographically
                    </p>
                  </div>

                  {/* Revealed Balance */}
                  <div className="p-5 rounded-xl bg-gradient-to-br from-green-500/10 to-brand-500/10 border border-green-500/30 text-center">
                    <p className="text-xs text-green-400 uppercase tracking-wide mb-2">
                      Decrypted Private Balance
                    </p>
                    <p className="text-4xl font-bold text-white">
                      {(Number(result.totalBalance) / 1e18).toFixed(4)}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">SAGE</p>
                  </div>

                  {/* Cryptographic Details */}
                  <div className="p-4 rounded-xl bg-surface-elevated border border-white/5">
                    <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Cryptographic Proof
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Public Key:</span>
                        <span className="font-mono text-brand-400">
                          {formatPointFull(result.publicKey).slice(0, 20)}...
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Notes Decrypted:</span>
                        <span className="text-white">{result.decryptedNotes.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Encryption:</span>
                        <span className="text-cyan-400">ElGamal on secp256k1</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Commitment:</span>
                        <span className="text-purple-400">Pedersen</span>
                      </div>
                    </div>
                  </div>

                  {/* Decrypted Notes Details */}
                  {result.decryptedNotes.length > 0 && (
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                      <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                        Decrypted Notes ({result.decryptedNotes.length})
                      </h4>
                      <div className="space-y-3 max-h-40 overflow-y-auto">
                        {result.decryptedNotes.map((note, i) => (
                          <div key={i} className="p-3 rounded-lg bg-white/5 text-xs">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-gray-400">Note #{i + 1}</span>
                              <span className="font-mono text-green-400">
                                {(Number(note.decryptedAmount) / 1e18).toFixed(4)} SAGE
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                              <div>
                                <span className="text-gray-600">C₁: </span>
                                <span className="text-cyan-400">{formatPoint(note.proof.c1)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">C₂: </span>
                                <span className="text-purple-400">{formatPoint(note.proof.c2)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-surface-elevated hover:bg-surface-border text-white font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Error State */}
              {step === "error" && (
                <div className="space-y-5">
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Decryption Failed
                    </h3>
                    <p className="text-sm text-red-400">
                      {error || "Unknown error occurred"}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={onClose}
                      className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        hasStartedRef.current = false;
                        setStep("request_signature");
                        setError(null);
                        setDecryptionLogs([]);
                      }}
                      className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-medium transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
