"use client";

/**
 * Transaction Confirmation Modal
 *
 * Comprehensive transaction review before submission:
 * - Transaction details summary
 * - Fee breakdown with gas estimation
 * - Network congestion indicator
 * - Security warnings
 * - Multi-step transaction support
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  DollarSign,
  Fuel,
  Info,
  Loader2,
  Shield,
  Zap,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Wallet,
  ArrowUpRight,
} from "lucide-react";

// ============================================
// Types
// ============================================

type TransactionType =
  | "send"
  | "stake"
  | "unstake"
  | "swap"
  | "approve"
  | "deposit"
  | "withdraw"
  | "vote"
  | "claim"
  | "custom";

type NetworkCongestion = "low" | "medium" | "high";

interface TransactionStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
  txHash?: string;
}

interface FeeBreakdown {
  gasLimit: bigint;
  gasPrice: bigint;
  gasFee: number;
  gasFeeUSD: number;
  networkFee?: number;
  protocolFee?: number;
  totalFee: number;
  totalFeeUSD: number;
}

interface TransactionDetails {
  type: TransactionType;
  title: string;
  description?: string;
  from: string;
  to?: string;
  amount?: string;
  tokenSymbol?: string;
  tokenIcon?: React.ReactNode;
  contractAddress?: string;
  functionName?: string;
  steps?: TransactionStep[];
  warnings?: string[];
  metadata?: Record<string, string | number>;
}

interface TransactionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  transaction: TransactionDetails;
  fees?: FeeBreakdown;
  isLoading?: boolean;
  isSubmitting?: boolean;
  error?: string;
  networkCongestion?: NetworkCongestion;
  estimatedTime?: number;
  className?: string;
}

// ============================================
// Constants
// ============================================

const TRANSACTION_ICONS: Record<TransactionType, React.ElementType> = {
  send: ArrowUpRight,
  stake: Shield,
  unstake: Shield,
  swap: ArrowRight,
  approve: CheckCircle,
  deposit: ArrowRight,
  withdraw: ArrowRight,
  vote: CheckCircle,
  claim: DollarSign,
  custom: Zap,
};

const CONGESTION_CONFIG: Record<NetworkCongestion, { label: string; color: string; bgColor: string }> = {
  low: { label: "Low", color: "text-green-400", bgColor: "bg-green-500/20" },
  medium: { label: "Medium", color: "text-yellow-400", bgColor: "bg-yellow-500/20" },
  high: { label: "High", color: "text-red-400", bgColor: "bg-red-500/20" },
};

// ============================================
// Utility Functions
// ============================================

function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

function formatNumber(value: number, decimals = 4): string {
  if (value < 0.0001 && value > 0) return "<0.0001";
  return value.toFixed(decimals);
}

function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.floor(seconds / 60)}m`;
  return `~${Math.floor(seconds / 3600)}h`;
}

// ============================================
// Subcomponents
// ============================================

function AddressDisplay({
  label,
  address,
  isContract = false,
}: {
  label: string;
  address: string;
  isContract?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-white">{formatAddress(address)}</span>
        {isContract && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
            Contract
          </span>
        )}
        <button
          onClick={handleCopy}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function FeeRow({
  label,
  value,
  valueUSD,
  tooltip,
}: {
  label: string;
  value: string;
  valueUSD?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-400">{label}</span>
        {tooltip && (
          <div className="relative group">
            <Info className="w-3.5 h-3.5 text-gray-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 rounded text-xs text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <div className="text-right">
        <span className="text-sm text-white">{value}</span>
        {valueUSD && <span className="text-xs text-gray-500 ml-1">({valueUSD})</span>}
      </div>
    </div>
  );
}

function NetworkStatus({
  congestion,
  estimatedTime,
}: {
  congestion: NetworkCongestion;
  estimatedTime?: number;
}) {
  const config = CONGESTION_CONFIG[congestion];

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Fuel className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300">Network Congestion</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 text-xs rounded ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        {estimatedTime && (
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {formatTime(estimatedTime)}
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ steps }: { steps: TransactionStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step.status === "completed"
                  ? "bg-green-500/20 text-green-400"
                  : step.status === "active"
                    ? "bg-blue-500/20 text-blue-400"
                    : step.status === "failed"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-gray-700 text-gray-400"
              }`}
            >
              {step.status === "completed" ? (
                <Check className="w-3.5 h-3.5" />
              ) : step.status === "active" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                index + 1
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-0.5 h-6 ${
                  step.status === "completed" ? "bg-green-500/50" : "bg-gray-700"
                }`}
              />
            )}
          </div>
          <div className="flex-1 pt-0.5">
            <p
              className={`text-sm font-medium ${
                step.status === "completed"
                  ? "text-green-400"
                  : step.status === "active"
                    ? "text-white"
                    : step.status === "failed"
                      ? "text-red-400"
                      : "text-gray-400"
              }`}
            >
              {step.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
            {step.txHash && (
              <a
                href={`https://starkscan.co/tx/${step.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"
              >
                View transaction
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function WarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <p key={index} className="text-sm text-yellow-400">
              {warning}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function TransactionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  transaction,
  fees,
  isLoading = false,
  isSubmitting = false,
  error,
  networkCongestion = "low",
  estimatedTime,
  className = "",
}: TransactionConfirmModalProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const TypeIcon = TRANSACTION_ICONS[transaction.type];

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (err) {
      // Error handling is done via the error prop
    }
  };

  const hasMultipleSteps = transaction.steps && transaction.steps.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md mx-4 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <TypeIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{transaction.title}</h2>
              {transaction.description && (
                <p className="text-sm text-gray-400">{transaction.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Multi-step Progress */}
          {hasMultipleSteps && transaction.steps && (
            <StepIndicator steps={transaction.steps} />
          )}

          {/* Amount Display */}
          {transaction.amount && (
            <div className="p-4 bg-gray-800/50 rounded-xl text-center">
              <p className="text-sm text-gray-400 mb-1">Amount</p>
              <div className="flex items-center justify-center gap-2">
                {transaction.tokenIcon}
                <span className="text-2xl font-bold text-white">
                  {transaction.amount}
                </span>
                {transaction.tokenSymbol && (
                  <span className="text-lg text-gray-400">{transaction.tokenSymbol}</span>
                )}
              </div>
            </div>
          )}

          {/* Addresses */}
          <div className="space-y-1 divide-y divide-gray-800">
            <AddressDisplay label="From" address={transaction.from} />
            {transaction.to && (
              <AddressDisplay
                label="To"
                address={transaction.to}
                isContract={!!transaction.contractAddress}
              />
            )}
          </div>

          {/* Warnings */}
          {transaction.warnings && transaction.warnings.length > 0 && (
            <WarningBanner warnings={transaction.warnings} />
          )}

          {/* Network Status */}
          <NetworkStatus congestion={networkCongestion} estimatedTime={estimatedTime} />

          {/* Fee Breakdown */}
          {fees && (
            <div className="p-3 bg-gray-800/30 rounded-lg">
              <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="flex items-center justify-between w-full"
              >
                <span className="text-sm font-medium text-gray-300">
                  Estimated Fees
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">
                    {formatNumber(fees.totalFee)} SAGE
                  </span>
                  <span className="text-xs text-gray-500">
                    ({formatUSD(fees.totalFeeUSD)})
                  </span>
                  {detailsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {detailsExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                  <FeeRow
                    label="Gas Fee"
                    value={`${formatNumber(fees.gasFee)} SAGE`}
                    valueUSD={formatUSD(fees.gasFeeUSD)}
                    tooltip="Fee paid to network validators"
                  />
                  {fees.networkFee !== undefined && fees.networkFee > 0 && (
                    <FeeRow
                      label="Network Fee"
                      value={`${formatNumber(fees.networkFee)} SAGE`}
                      tooltip="L1 data availability fee"
                    />
                  )}
                  {fees.protocolFee !== undefined && fees.protocolFee > 0 && (
                    <FeeRow
                      label="Protocol Fee"
                      value={`${formatNumber(fees.protocolFee)} SAGE`}
                      tooltip="Fee for using the protocol"
                    />
                  )}
                  <div className="pt-2 mt-2 border-t border-gray-700">
                    <FeeRow
                      label="Total"
                      value={`${formatNumber(fees.totalFee)} SAGE`}
                      valueUSD={formatUSD(fees.totalFeeUSD)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {transaction.metadata && Object.keys(transaction.metadata).length > 0 && (
            <div className="space-y-1 text-sm">
              {Object.entries(transaction.metadata).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <span className="text-gray-400">{key}</span>
                  <span className="text-white">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 space-y-3">
          {/* Security Notice */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Shield className="w-3.5 h-3.5" />
            <span>
              Review all details before confirming. Transactions cannot be reversed.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading || isSubmitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirming...
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Confirm
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// useTransactionConfirm Hook
// ============================================

interface UseTransactionConfirmOptions {
  onSuccess?: (txHash: string) => void;
  onError?: (error: Error) => void;
}

export function useTransactionConfirm(options: UseTransactionConfirmOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null);
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (tx: TransactionDetails, feeData?: FeeBreakdown) => {
    setTransaction(tx);
    setFees(feeData ?? null);
    setError(null);
    setIsOpen(true);
  };

  const close = () => {
    if (!isSubmitting) {
      setIsOpen(false);
      setTransaction(null);
      setFees(null);
      setError(null);
    }
  };

  const confirm = async (executor: () => Promise<string>) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const txHash = await executor();
      options.onSuccess?.(txHash);
      close();
      return txHash;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Transaction failed");
      setError(error.message);
      options.onError?.(error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isOpen,
    transaction,
    fees,
    isSubmitting,
    error,
    open,
    close,
    confirm,
    setFees,
    setError,
  };
}

export type {
  TransactionType,
  TransactionDetails,
  FeeBreakdown,
  TransactionStep,
  NetworkCongestion,
  TransactionConfirmModalProps,
};
