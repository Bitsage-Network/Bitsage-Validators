"use client";

/**
 * Transaction Fee Estimator Component
 *
 * Provides detailed fee estimation for privacy operations with:
 * - Gas fee estimation based on network conditions
 * - Proof generation fee breakdown
 * - Privacy pool specific fees
 * - Total cost in multiple currencies
 * - Fee comparison (privacy vs public)
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  Zap,
  Shield,
  Clock,
  TrendingUp,
  TrendingDown,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Fuel,
  Cpu,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Types
// ============================================

type OperationType =
  | "deposit"
  | "withdraw"
  | "transfer"
  | "swap"
  | "ragequit";

interface FeeBreakdown {
  gasEstimate: bigint;
  gasPriceGwei: number;
  gasFeeSAGE: number;
  gasFeeUSD: number;
  proofGenerationFee: number;
  proverNetworkFee: number;
  privacyPoolFee: number;
  totalFeeSAGE: number;
  totalFeeUSD: number;
  estimatedTime: number; // seconds
}

interface NetworkConditions {
  congestionLevel: "low" | "medium" | "high";
  averageGasPrice: number;
  fastGasPrice: number;
  slowGasPrice: number;
  blockTime: number;
  pendingTxCount: number;
}

interface FeeEstimatorProps {
  operationType: OperationType;
  amount?: bigint;
  proofMode?: "tee" | "gpu" | "wasm";
  onFeeCalculated?: (fees: FeeBreakdown) => void;
  showComparison?: boolean;
  compact?: boolean;
  className?: string;
}

// Fee constants (configurable)
const FEE_CONFIG = {
  // Base gas estimates for different operations
  gasEstimates: {
    deposit: 150000n,
    withdraw: 350000n,
    transfer: 280000n,
    swap: 400000n,
    ragequit: 200000n,
  },
  // Proof generation fees per proof type (in SAGE)
  proofFees: {
    tee: 0.05,
    gpu: 0.03,
    wasm: 0.01,
  },
  // Network fees (percentage of amount)
  networkFees: {
    prover: 0.001, // 0.1%
    privacyPool: 0.0005, // 0.05%
  },
  // Price assumptions (would come from oracle in production)
  prices: {
    SAGE_USD: 1.25,
    ETH_USD: 3500,
    GWEI_ETH: 1e-9,
  },
};

// Operation labels and icons
const OPERATION_CONFIG = {
  deposit: {
    label: "Privacy Deposit",
    icon: Lock,
    description: "Shield assets in the privacy pool",
  },
  withdraw: {
    label: "Private Withdrawal",
    icon: Shield,
    description: "Withdraw with ZK proof verification",
  },
  transfer: {
    label: "Private Transfer",
    icon: Zap,
    description: "Transfer between privacy notes",
  },
  swap: {
    label: "Confidential Swap",
    icon: TrendingUp,
    description: "Swap with encrypted amounts",
  },
  ragequit: {
    label: "Emergency Exit",
    icon: AlertTriangle,
    description: "Reveal deposit for emergency withdrawal",
  },
};

// ============================================
// Main Component
// ============================================

export function TransactionFeeEstimator({
  operationType,
  amount = 0n,
  proofMode = "tee",
  onFeeCalculated,
  showComparison = true,
  compact = false,
  className,
}: FeeEstimatorProps) {
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [networkConditions, setNetworkConditions] = useState<NetworkConditions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [gasSpeed, setGasSpeed] = useState<"slow" | "average" | "fast">("average");

  const operationConfig = OPERATION_CONFIG[operationType];
  const OperationIcon = operationConfig.icon;

  // Fetch network conditions
  const fetchNetworkConditions = useCallback(async () => {
    // In production, this would fetch from the Starknet RPC or oracle
    // Mock data for development
    const conditions: NetworkConditions = {
      congestionLevel: Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low",
      averageGasPrice: 25 + Math.random() * 20,
      fastGasPrice: 40 + Math.random() * 30,
      slowGasPrice: 15 + Math.random() * 10,
      blockTime: 3,
      pendingTxCount: Math.floor(Math.random() * 500),
    };
    setNetworkConditions(conditions);
    return conditions;
  }, []);

  // Calculate fees
  const calculateFees = useCallback(
    async (conditions: NetworkConditions): Promise<FeeBreakdown> => {
      const gasEstimate = FEE_CONFIG.gasEstimates[operationType];
      const gasPrice =
        gasSpeed === "fast"
          ? conditions.fastGasPrice
          : gasSpeed === "slow"
          ? conditions.slowGasPrice
          : conditions.averageGasPrice;

      // Calculate gas fee
      const gasFeeGwei = Number(gasEstimate) * gasPrice;
      const gasFeeETH = gasFeeGwei * FEE_CONFIG.prices.GWEI_ETH;
      const gasFeeUSD = gasFeeETH * FEE_CONFIG.prices.ETH_USD;
      const gasFeeSAGE = gasFeeUSD / FEE_CONFIG.prices.SAGE_USD;

      // Proof generation fee
      const proofGenerationFee = FEE_CONFIG.proofFees[proofMode];

      // Network fees (based on amount)
      const amountSAGE = Number(amount) / 1e18;
      const proverNetworkFee = amountSAGE * FEE_CONFIG.networkFees.prover;
      const privacyPoolFee = amountSAGE * FEE_CONFIG.networkFees.privacyPool;

      // Total fees
      const totalFeeSAGE = gasFeeSAGE + proofGenerationFee + proverNetworkFee + privacyPoolFee;
      const totalFeeUSD = totalFeeSAGE * FEE_CONFIG.prices.SAGE_USD;

      // Estimated time based on congestion and gas speed
      const baseTime =
        gasSpeed === "fast" ? 15 : gasSpeed === "slow" ? 60 : 30;
      const congestionMultiplier =
        conditions.congestionLevel === "high"
          ? 2
          : conditions.congestionLevel === "medium"
          ? 1.5
          : 1;
      const estimatedTime = Math.ceil(baseTime * congestionMultiplier);

      return {
        gasEstimate,
        gasPriceGwei: gasPrice,
        gasFeeSAGE,
        gasFeeUSD,
        proofGenerationFee,
        proverNetworkFee,
        privacyPoolFee,
        totalFeeSAGE,
        totalFeeUSD,
        estimatedTime,
      };
    },
    [operationType, proofMode, amount, gasSpeed]
  );

  // Refresh fees
  const refreshFees = useCallback(async () => {
    setIsLoading(true);
    try {
      const conditions = await fetchNetworkConditions();
      const fees = await calculateFees(conditions);
      setFeeBreakdown(fees);
      onFeeCalculated?.(fees);
    } catch (error) {
      console.error("Failed to calculate fees:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchNetworkConditions, calculateFees, onFeeCalculated]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    refreshFees();
    const interval = setInterval(refreshFees, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [refreshFees]);

  // Public transaction fee comparison
  const publicFeeComparison = useMemo(() => {
    if (!feeBreakdown) return null;

    // Public transactions don't have proof or privacy fees
    const publicGasEstimate = FEE_CONFIG.gasEstimates[operationType] / 2n; // Simpler public tx
    const publicGasFee = (feeBreakdown.gasFeeSAGE * Number(publicGasEstimate)) / Number(FEE_CONFIG.gasEstimates[operationType]);

    return {
      publicFeeSAGE: publicGasFee,
      privacyPremium: feeBreakdown.totalFeeSAGE - publicGasFee,
      privacyPremiumPercent: ((feeBreakdown.totalFeeSAGE - publicGasFee) / publicGasFee) * 100,
    };
  }, [feeBreakdown, operationType]);

  if (compact) {
    return (
      <CompactFeeDisplay
        fees={feeBreakdown}
        isLoading={isLoading}
        onRefresh={refreshFees}
        className={className}
      />
    );
  }

  return (
    <div className={cn("glass-card overflow-hidden", className)}>
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <DollarSign className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="font-medium text-white">Transaction Fees</p>
            <p className="text-sm text-gray-400">{operationConfig.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {feeBreakdown && (
            <div className="text-right">
              <p className="font-bold text-white">
                {feeBreakdown.totalFeeSAGE.toFixed(4)} SAGE
              </p>
              <p className="text-sm text-gray-400">
                ≈ ${feeBreakdown.totalFeeUSD.toFixed(2)}
              </p>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              refreshFees();
            }}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <RefreshCw
              className={cn("h-4 w-4 text-gray-400", isLoading && "animate-spin")}
            />
          </button>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/5"
          >
            <div className="p-4 space-y-4">
              {/* Network Status */}
              {networkConditions && (
                <NetworkStatusBadge conditions={networkConditions} />
              )}

              {/* Gas Speed Selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-400">Transaction Speed</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["slow", "average", "fast"] as const).map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setGasSpeed(speed)}
                      className={cn(
                        "p-3 rounded-lg border text-sm transition-all",
                        gasSpeed === speed
                          ? "bg-brand-500/20 border-brand-500 text-white"
                          : "border-surface-border text-gray-400 hover:border-gray-500"
                      )}
                    >
                      <p className="font-medium capitalize">{speed}</p>
                      <p className="text-xs text-gray-500">
                        {speed === "slow" && "~1 min"}
                        {speed === "average" && "~30 sec"}
                        {speed === "fast" && "~15 sec"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee Breakdown */}
              {feeBreakdown && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-400">Fee Breakdown</p>
                  <div className="space-y-2">
                    <FeeRow
                      icon={Fuel}
                      label="Gas Fee"
                      value={feeBreakdown.gasFeeSAGE}
                      sublabel={`${feeBreakdown.gasPriceGwei.toFixed(1)} Gwei`}
                    />
                    <FeeRow
                      icon={Cpu}
                      label={`Proof Generation (${proofMode.toUpperCase()})`}
                      value={feeBreakdown.proofGenerationFee}
                    />
                    <FeeRow
                      icon={Zap}
                      label="Prover Network Fee"
                      value={feeBreakdown.proverNetworkFee}
                      sublabel="0.1% of amount"
                    />
                    <FeeRow
                      icon={Lock}
                      label="Privacy Pool Fee"
                      value={feeBreakdown.privacyPoolFee}
                      sublabel="0.05% of amount"
                    />

                    <div className="border-t border-white/5 pt-2 mt-2">
                      <FeeRow
                        icon={DollarSign}
                        label="Total"
                        value={feeBreakdown.totalFeeSAGE}
                        isTotal
                        usdValue={feeBreakdown.totalFeeUSD}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Estimated Time */}
              {feeBreakdown && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Estimated Time</span>
                  </div>
                  <span className="text-sm font-medium text-white">
                    ~{feeBreakdown.estimatedTime} seconds
                  </span>
                </div>
              )}

              {/* Privacy Premium Comparison */}
              {showComparison && publicFeeComparison && (
                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-purple-300">
                        Privacy Premium
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        This privacy transaction costs{" "}
                        <span className="text-white font-medium">
                          {publicFeeComparison.privacyPremium.toFixed(4)} SAGE
                        </span>{" "}
                        more than a public transaction (
                        {publicFeeComparison.privacyPremiumPercent.toFixed(0)}% premium).
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <div>
                          <span className="text-gray-500">Public: </span>
                          <span className="text-gray-300">
                            {publicFeeComparison.publicFeeSAGE.toFixed(4)} SAGE
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Private: </span>
                          <span className="text-purple-300 font-medium">
                            {feeBreakdown?.totalFeeSAGE.toFixed(4)} SAGE
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

interface FeeRowProps {
  icon: React.ElementType;
  label: string;
  value: number;
  sublabel?: string;
  isTotal?: boolean;
  usdValue?: number;
}

function FeeRow({ icon: Icon, label, value, sublabel, isTotal, usdValue }: FeeRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1",
        isTotal && "font-medium"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", isTotal ? "text-white" : "text-gray-500")} />
        <span className={cn("text-sm", isTotal ? "text-white" : "text-gray-300")}>
          {label}
        </span>
        {sublabel && <span className="text-xs text-gray-500">({sublabel})</span>}
      </div>
      <div className="text-right">
        <span className={cn("text-sm", isTotal ? "text-white" : "text-gray-300")}>
          {value.toFixed(4)} SAGE
        </span>
        {usdValue !== undefined && (
          <span className="text-xs text-gray-500 ml-2">≈ ${usdValue.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}

function NetworkStatusBadge({ conditions }: { conditions: NetworkConditions }) {
  const config = {
    low: { color: "text-green-400", bg: "bg-green-500/20", label: "Low Congestion" },
    medium: { color: "text-yellow-400", bg: "bg-yellow-500/20", label: "Medium Congestion" },
    high: { color: "text-red-400", bg: "bg-red-500/20", label: "High Congestion" },
  };

  const status = config[conditions.congestionLevel];

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
      <div className="flex items-center gap-2">
        <Zap className={cn("h-4 w-4", status.color)} />
        <span className="text-sm text-gray-400">Network Status</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", status.bg, status.color)}>
          {status.label}
        </span>
        <span className="text-sm text-gray-400">
          {conditions.pendingTxCount} pending
        </span>
      </div>
    </div>
  );
}

interface CompactFeeDisplayProps {
  fees: FeeBreakdown | null;
  isLoading: boolean;
  onRefresh: () => void;
  className?: string;
}

function CompactFeeDisplay({
  fees,
  isLoading,
  onRefresh,
  className,
}: CompactFeeDisplayProps) {
  if (isLoading || !fees) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-gray-400", className)}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Estimating fees...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-white font-medium">
          {fees.totalFeeSAGE.toFixed(4)} SAGE
        </span>
        <span className="text-xs text-gray-500">
          (${fees.totalFeeUSD.toFixed(2)})
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3 w-3" />
        <span>~{fees.estimatedTime}s</span>
      </div>
      <button
        onClick={onRefresh}
        className="p-1 rounded hover:bg-white/5 transition-colors"
      >
        <RefreshCw className="h-3 w-3 text-gray-400" />
      </button>
    </div>
  );
}

export type { FeeBreakdown, NetworkConditions, OperationType };
