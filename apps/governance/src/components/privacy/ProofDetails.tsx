"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Key,
  Hash,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Fingerprint,
  GitBranch,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProofDetailsProps {
  // Pedersen commitment
  commitment: string;
  // ElGamal ciphertext C2 (encrypted amount)
  amountCommitment: { x: string; y: string };
  // Proving time in ms
  provingTimeMs: number;
  // Merkle leaf index
  leafIndex: number;
  // Transaction hash
  txHash: string;
  // Amount (for display)
  amount: number;
  // Asset symbol
  symbol?: string;
  className?: string;
}

export function ProofDetails({
  commitment,
  amountCommitment,
  provingTimeMs,
  leafIndex,
  txHash,
  amount,
  symbol = "SAGE",
  className,
}: ProofDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const truncateHash = (hash: string, start = 10, end = 8) => {
    if (hash.length <= start + end) return hash;
    return `${hash.slice(0, start)}...${hash.slice(-end)}`;
  };

  return (
    <div className={cn("rounded-xl border border-brand-500/30 overflow-hidden", className)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 bg-gradient-to-r from-brand-600/10 to-purple-600/10 hover:from-brand-600/20 hover:to-purple-600/20 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-brand-400" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-white flex items-center gap-2">
                ZK Proof Details
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  Verified
                </span>
              </h3>
              <p className="text-sm text-gray-400">
                Proved in <span className="text-brand-400 font-mono">{provingTimeMs}ms</span> •
                Leaf #{leafIndex}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {isExpanded ? "Hide" : "Show"} proof
            </span>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 bg-gray-900/50 border-t border-brand-500/20">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-surface-elevated/50 text-center">
                  <Clock className="w-4 h-4 text-brand-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">{provingTimeMs}ms</p>
                  <p className="text-xs text-gray-500">Proving Time</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-elevated/50 text-center">
                  <GitBranch className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">#{leafIndex}</p>
                  <p className="text-xs text-gray-500">Merkle Leaf</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-elevated/50 text-center">
                  <Zap className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-white">{amount}</p>
                  <p className="text-xs text-gray-500">{symbol}</p>
                </div>
              </div>

              {/* Pedersen Commitment */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-medium text-gray-300">Pedersen Commitment</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">
                    H(s ‖ n ‖ a ‖ id)
                  </span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-elevated font-mono text-sm">
                  <code className="text-brand-400 flex-1 break-all">{commitment}</code>
                  <button
                    onClick={() => copyToClipboard(commitment, "commitment")}
                    className="p-1.5 rounded hover:bg-surface-border transition-colors flex-shrink-0"
                  >
                    {copiedField === "commitment" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 pl-1">
                  Binding commitment: secret ‖ nullifier_seed ‖ amount ‖ asset_id
                </p>
              </div>

              {/* ElGamal Ciphertext */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-gray-300">ElGamal Encryption (C₂)</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    a·H + r·PK
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-surface-elevated">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">x-coordinate</span>
                      <button
                        onClick={() => copyToClipboard(amountCommitment.x, "c2x")}
                        className="p-1 rounded hover:bg-surface-border transition-colors"
                      >
                        {copiedField === "c2x" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <code className="text-purple-400 font-mono text-xs break-all">
                      {amountCommitment.x}
                    </code>
                  </div>
                  <div className="p-3 rounded-lg bg-surface-elevated">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">y-coordinate</span>
                      <button
                        onClick={() => copyToClipboard(amountCommitment.y, "c2y")}
                        className="p-1 rounded hover:bg-surface-border transition-colors"
                      >
                        {copiedField === "c2y" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <code className="text-purple-400 font-mono text-xs break-all">
                      {amountCommitment.y}
                    </code>
                  </div>
                </div>
                <p className="text-xs text-gray-500 pl-1">
                  Homomorphic encryption: amount encrypted with your public key
                </p>
              </div>

              {/* Cryptographic Properties */}
              <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-brand-500/10 border border-emerald-500/20">
                <div className="flex items-start gap-2">
                  <Fingerprint className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-400">Cryptographic Guarantees</p>
                    <ul className="mt-2 space-y-1 text-xs text-gray-400">
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span><strong className="text-gray-300">Binding:</strong> Commitment cannot be opened to different value</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span><strong className="text-gray-300">Hiding:</strong> Amount hidden from observers</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span><strong className="text-gray-300">Homomorphic:</strong> Supports encrypted arithmetic</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span><strong className="text-gray-300">Nullifiable:</strong> Can prove spend without revealing note</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Transaction Link */}
              <div className="flex items-center justify-between pt-2 border-t border-surface-border">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Cpu className="w-4 h-4" />
                  <span>Client-side ZK proving (no trusted setup)</span>
                </div>
                <a
                  href={`https://sepolia.starkscan.co/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300 transition-colors"
                >
                  View on Starkscan
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Mini version for transaction lists
interface ProofBadgeProps {
  provingTimeMs: number;
  leafIndex: number;
  onClick?: () => void;
  className?: string;
}

export function ProofBadge({ provingTimeMs, leafIndex, onClick, className }: ProofBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20",
        "transition-colors text-sm",
        className
      )}
    >
      <Shield className="w-3.5 h-3.5 text-brand-400" />
      <span className="text-brand-400 font-mono">{provingTimeMs}ms</span>
      <span className="text-gray-500">•</span>
      <span className="text-gray-400">Leaf #{leafIndex}</span>
    </button>
  );
}
