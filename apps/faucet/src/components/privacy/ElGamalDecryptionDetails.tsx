"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Unlock,
  Key,
  Calculator,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Shield,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecryptedNote, DecryptionProof } from "@/lib/hooks/usePrivacyKeys";

// Format bigint point coordinate for display (truncated)
function formatPoint(n: bigint, maxLen: number = 16): string {
  const hex = n.toString(16);
  if (hex.length <= maxLen) return `0x${hex}`;
  return `0x${hex.slice(0, maxLen / 2)}...${hex.slice(-maxLen / 2)}`;
}

// Format amount from bigint (assuming 18 decimals)
function formatAmount(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 14n;
  return `${whole}.${decimal.toString().padStart(4, "0")}`;
}

interface DecryptionStepProps {
  step: number;
  title: string;
  description: string;
  formula?: string;
  result?: string;
  isActive?: boolean;
  isComplete?: boolean;
}

function DecryptionStep({
  step,
  title,
  description,
  formula,
  result,
  isActive,
  isComplete,
}: DecryptionStepProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-all",
        isActive
          ? "bg-brand-500/10 border-brand-500/40"
          : isComplete
          ? "bg-green-500/10 border-green-500/30"
          : "bg-surface-elevated/50 border-surface-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
            isActive
              ? "bg-brand-500 text-white"
              : isComplete
              ? "bg-green-500 text-white"
              : "bg-surface-border text-gray-400"
          )}
        >
          {isComplete ? <CheckCircle className="w-4 h-4" /> : step}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white mb-1">{title}</h4>
          <p className="text-xs text-gray-400 mb-2">{description}</p>
          {formula && (
            <div className="p-2 rounded-lg bg-black/30 font-mono text-xs text-brand-400 overflow-x-auto">
              {formula}
            </div>
          )}
          {result && (
            <div className="mt-2 p-2 rounded-lg bg-surface-elevated text-xs font-mono text-green-400 break-all">
              = {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ElGamalDecryptionDetailsProps {
  decryptedNotes: DecryptedNote[];
  totalBalance: bigint;
  publicKey: { x: bigint; y: bigint };
  className?: string;
}

export function ElGamalDecryptionDetails({
  decryptedNotes,
  totalBalance,
  publicKey,
  className,
}: ElGamalDecryptionDetailsProps) {
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with verified status */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-brand-500/10 border border-green-500/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Unlock className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              ElGamal Decryption Verified
              <CheckCircle className="w-4 h-4 text-green-400" />
            </h3>
            <p className="text-sm text-gray-400">
              {decryptedNotes.length} note{decryptedNotes.length !== 1 ? "s" : ""} decrypted
              cryptographically
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{formatAmount(totalBalance)}</p>
          <p className="text-sm text-gray-400">SAGE (revealed)</p>
        </div>
      </div>

      {/* Public Key Info */}
      <div className="p-3 rounded-xl bg-surface-elevated/50 border border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-brand-400" />
            <span className="text-sm text-gray-400">Your Privacy Public Key</span>
          </div>
          <button
            onClick={() => copyToClipboard(`0x${publicKey.x.toString(16)}`, "pubkey")}
            className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
          >
            {copiedField === "pubkey" ? (
              <>
                <CheckCircle className="w-3 h-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="mt-1 font-mono text-xs text-gray-300 break-all">
          {formatPoint(publicKey.x, 32)}
        </p>
      </div>

      {/* Show/Hide Math Toggle */}
      <button
        onClick={() => setShowMath(!showMath)}
        className="w-full p-3 rounded-xl bg-surface-elevated/50 border border-surface-border hover:border-brand-500/40 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-brand-400" />
          <span className="text-sm text-white">
            {showMath ? "Hide" : "Show"} Cryptographic Proof Details
          </span>
        </div>
        {showMath ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Decryption Math Overview */}
      <AnimatePresence>
        {showMath && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-surface-card border border-surface-border space-y-4">
              <h4 className="font-medium text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-400" />
                ElGamal Homomorphic Decryption
              </h4>

              <div className="space-y-3">
                <DecryptionStep
                  step={1}
                  title="Ciphertext Components"
                  description="Your encrypted balance is stored as two curve points"
                  formula="C = (C1, C2) where C1 = r·G and C2 = m·H + r·PK"
                  isComplete
                />

                <DecryptionStep
                  step={2}
                  title="Shared Secret Computation"
                  description="Using your private key sk derived from wallet signature"
                  formula="S = sk · C1 = sk · r · G"
                  isComplete
                />

                <DecryptionStep
                  step={3}
                  title="Decryption Formula"
                  description="Subtract shared secret from encrypted amount"
                  formula="m·H = C2 - S = (m·H + r·PK) - sk·r·G = m·H"
                  result="m·H (point on curve representing amount)"
                  isComplete
                />

                <DecryptionStep
                  step={4}
                  title="Discrete Log Recovery"
                  description="Baby-step giant-step algorithm to recover plaintext m"
                  formula="Find m such that m·H = decrypted_point"
                  result={`m = ${totalBalance.toString()} wei (${formatAmount(totalBalance)} SAGE)`}
                  isComplete
                />
              </div>

              <div className="p-3 rounded-lg bg-brand-500/10 border border-brand-500/20">
                <p className="text-xs text-brand-400">
                  <strong>Why ElGamal?</strong> ElGamal encryption on the Stark curve provides:
                  <br />• <strong>Homomorphic addition</strong> - balances can be aggregated without decryption
                  <br />• <strong>No trusted setup</strong> - unlike Groth16 SNARKs
                  <br />• <strong>Receiver privacy</strong> - only you can decrypt with your wallet signature
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Individual Note Proofs */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Decrypted Notes ({decryptedNotes.length})
        </h4>

        {decryptedNotes.map((dn) => (
          <div
            key={dn.note.commitment}
            className="rounded-xl bg-surface-elevated/50 border border-surface-border overflow-hidden"
          >
            <button
              onClick={() =>
                setExpandedNote(
                  expandedNote === dn.note.commitment ? null : dn.note.commitment
                )
              }
              className="w-full p-3 flex items-center justify-between hover:bg-surface-elevated/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-brand-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white">
                    {formatAmount(dn.decryptedAmount)} SAGE
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {dn.note.commitment.slice(0, 10)}...{dn.note.commitment.slice(-8)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                  Verified
                </span>
                {expandedNote === dn.note.commitment ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>

            <AnimatePresence>
              {expandedNote === dn.note.commitment && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 border-t border-surface-border space-y-3">
                    {/* C1 - Ephemeral Key */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400">C1 (Ephemeral Public Key r·G)</p>
                      <div className="p-2 rounded bg-black/30 font-mono text-[10px] text-gray-300 break-all">
                        x: {formatPoint(dn.proof.c1.x, 40)}
                        <br />
                        y: {formatPoint(dn.proof.c1.y, 40)}
                      </div>
                    </div>

                    {/* C2 - Encrypted Amount */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400">C2 (Encrypted Amount m·H + r·PK)</p>
                      <div className="p-2 rounded bg-black/30 font-mono text-[10px] text-gray-300 break-all">
                        x: {formatPoint(dn.proof.c2.x, 40)}
                        <br />
                        y: {formatPoint(dn.proof.c2.y, 40)}
                      </div>
                    </div>

                    {/* Shared Secret */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400">Shared Secret (sk·C1)</p>
                      <div className="p-2 rounded bg-black/30 font-mono text-[10px] text-gray-300 break-all">
                        x: {formatPoint(dn.proof.sharedSecret.x, 40)}
                        <br />
                        y: {formatPoint(dn.proof.sharedSecret.y, 40)}
                      </div>
                    </div>

                    {/* Decrypted Point */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400">Decrypted Point (m·H = C2 - sk·C1)</p>
                      <div className="p-2 rounded bg-green-500/10 border border-green-500/20 font-mono text-[10px] text-green-400 break-all">
                        x: {formatPoint(dn.proof.decryptedPoint.x, 40)}
                        <br />
                        y: {formatPoint(dn.proof.decryptedPoint.y, 40)}
                      </div>
                    </div>

                    {/* Recovered Amount */}
                    <div className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-between">
                      <span className="text-xs text-brand-400">Recovered Amount (discrete log)</span>
                      <span className="font-mono text-sm text-white font-bold">
                        {formatAmount(dn.decryptedAmount)} SAGE
                      </span>
                    </div>

                    {/* Timestamp */}
                    <p className="text-[10px] text-gray-500">
                      Decrypted at: {new Date(dn.proof.timestamp).toLocaleString()}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ElGamalDecryptionDetails;
