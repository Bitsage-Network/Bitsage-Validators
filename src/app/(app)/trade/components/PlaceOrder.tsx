"use client";

import { useState, useMemo, useEffect } from "react";
import { Loader2, ArrowDown, Info, Percent, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@starknet-react/core";
import {
  useSageBalance,
  buildPlaceLimitOrderCall,
  buildMarketBuyCall,
  buildMarketSellCall,
  buildApproveCall,
  useBitSageTransaction,
  getContractAddresses,
} from "@/lib/contracts";
import { useQuoteBalanceForPair } from "@/lib/hooks/useQuoteBalance";
import { getAssetBySymbol, parseAssetAmount } from "@/lib/contracts/assets";
import { getTradingPairById, getEstimatedMarketPrice } from "@/lib/hooks/useTradingPairs";
import { useToast } from "@/lib/providers/ToastProvider";
import { usePragmaPrice } from "@/lib/hooks/usePragmaOracle";
import type { Call } from "starknet";

interface TradingPair {
  id: string;
  base: string;
  quote: string;
  decimals: { base: number; quote: number };
}

interface PlaceOrderProps {
  pairId: string;
  pair: TradingPair;
  /** Pre-fill price from orderbook click */
  initialPrice?: string;
  /** Pre-fill amount from orderbook click */
  initialAmount?: string;
  /** Pre-fill side from orderbook click */
  initialSide?: "buy" | "sell";
}

type OrderSide = "buy" | "sell";
type OrderType = "limit" | "market";

// Map pair ID strings to numeric IDs used by the contract
// IMPORTANT: These must match the on-chain pair IDs in the OTC orderbook contract
// pair_id 0 = Mock STRK (deprecated), pair_id 1 = Real STRK (active)
const PAIR_ID_MAP: Record<string, number> = {
  "SAGE_STRK": 1,  // Uses real STRK token on sepolia
  "SAGE_USDC": 2,  // Not yet active
  "SAGE_ETH": 3,   // Not yet active
  "STRK_USDC": 4,  // Not yet active
};

export function PlaceOrder({ pairId, pair, initialPrice, initialAmount, initialSide }: PlaceOrderProps) {
  const { address, isConnected } = useAccount();
  const [side, setSide] = useState<OrderSide>(initialSide || "buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState(initialPrice || "");
  const [amount, setAmount] = useState(initialAmount || "");
  const [sliderValue, setSliderValue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendTransactionAsync } = useBitSageTransaction();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  // Get centralized trading pair config
  const tradingPairConfig = useMemo(() => getTradingPairById(pairId), [pairId]);

  // Fetch STRK/USD price from Pragma Oracle for USD conversion
  // Fallback to ~$0.084 if oracle not available (Jan 2026 approximate rate)
  const { data: strkUsdPrice } = usePragmaPrice('STRK_USD');
  const strkToUsd = strkUsdPrice?.price && strkUsdPrice.price > 0 ? strkUsdPrice.price : 0.084;

  // Get real balance from contract
  const { data: sageBalance } = useSageBalance(address);

  // Get quote token balance (ETH/STRK/USDC)
  const { balanceFormatted: quoteBalance, isLoading: quoteLoading } = useQuoteBalanceForPair(pairId, address);

  // Update form when orderbook order is clicked
  // Cap amount to what user can actually afford
  useEffect(() => {
    if (initialPrice) setPrice(initialPrice);
    if (initialSide) setSide(initialSide);

    if (initialAmount && initialPrice) {
      const clickedAmount = parseFloat(initialAmount) || 0;
      const clickedPrice = parseFloat(initialPrice) || 0;

      // For buy orders, cap amount based on quote balance
      if ((initialSide === 'buy' || !initialSide) && clickedPrice > 0) {
        const quoteBalanceNum = parseFloat(quoteBalance?.replace(/,/g, "") || "0");
        const maxAffordableAmount = quoteBalanceNum / clickedPrice;

        // If user can't afford full amount, cap it (leave 1% buffer for fees)
        if (maxAffordableAmount < clickedAmount && maxAffordableAmount > 0) {
          const cappedAmount = Math.floor(maxAffordableAmount * 0.99 * 100) / 100;
          setAmount(cappedAmount.toFixed(2));
        } else {
          setAmount(initialAmount);
        }
      }
      // For sell orders, cap based on base (SAGE) balance
      else if (initialSide === 'sell') {
        const baseBalanceNum = sageBalance ? Number(sageBalance) / 1e18 : 0;
        if (baseBalanceNum < clickedAmount && baseBalanceNum > 0) {
          const cappedAmount = Math.floor(baseBalanceNum * 0.99 * 100) / 100;
          setAmount(cappedAmount.toFixed(2));
        } else {
          setAmount(initialAmount);
        }
      } else {
        setAmount(initialAmount);
      }
    }
  }, [initialPrice, initialAmount, initialSide, quoteBalance, sageBalance]);

  // Format balances from contract data
  const balances = useMemo(() => {
    const baseBalance = sageBalance ? Number(sageBalance) / 1e18 : 0;
    return {
      base: baseBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      quote: quoteBalance,
    };
  }, [sageBalance, quoteBalance]);

  // Calculate total (use estimated price for market orders)
  const { total, totalUsd, priceUsd } = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const priceNum = parseFloat(price) || 0;

    let totalStrk: number;
    let effectivePrice: number;

    if (orderType === "market" && tradingPairConfig) {
      // Use centralized config for estimated market price
      const estimatedPriceWei = getEstimatedMarketPrice(tradingPairConfig);
      effectivePrice = Number(estimatedPriceWei) / Math.pow(10, tradingPairConfig.quote.decimals);
      totalStrk = effectivePrice * amountNum;
    } else {
      effectivePrice = priceNum;
      totalStrk = priceNum * amountNum;
    }

    // Calculate USD equivalents using STRK/USD rate
    const totalUsdNum = strkToUsd > 0 ? totalStrk * strkToUsd : 0;
    const priceUsdNum = strkToUsd > 0 ? effectivePrice * strkToUsd : 0;

    return {
      total: totalStrk.toFixed(2),
      totalUsd: totalUsdNum > 0 ? `$${totalUsdNum.toFixed(2)}` : '',
      priceUsd: priceUsdNum > 0 ? `$${priceUsdNum.toFixed(4)}` : '',
    };
  }, [price, amount, orderType, tradingPairConfig, strkToUsd]);

  // Handle slider change
  const handleSliderChange = (value: number) => {
    setSliderValue(value);
    // Calculate amount based on percentage of balance
    const balance = side === "buy"
      ? parseFloat(balances.quote.replace(/,/g, ""))
      : parseFloat(balances.base.replace(/,/g, ""));
    const priceNum = parseFloat(price) || 1;

    if (side === "buy" && priceNum > 0) {
      const maxAmount = balance / priceNum;
      setAmount((maxAmount * value / 100).toFixed(2));
    } else {
      setAmount((balance * value / 100).toFixed(2));
    }
  };

  // Handle order submission
  const handleSubmit = async () => {
    if (!isConnected || !address) return;

    // Validate trading pair is active
    if (tradingPairConfig && !tradingPairConfig.isActive) {
      toastError("Trading Pair Inactive", `${pairId} trading is not yet available`);
      return;
    }

    setIsSubmitting(true);
    try {
      const numericPairId = PAIR_ID_MAP[pairId] ?? 0;

      // Get asset info for proper BigInt conversion
      const baseAsset = getAssetBySymbol(pair.base);
      const quoteAsset = getAssetBySymbol(pair.quote);

      if (!baseAsset || !quoteAsset) {
        toastError("Configuration Error", `Asset not found: ${pair.base}/${pair.quote}`);
        return;
      }

      // Use parseAssetAmount for precision-safe conversion
      const priceWei = parseAssetAmount(price || "0", quoteAsset);
      const amountWei = parseAssetAmount(amount || "0", baseAsset);

      // Validate minimum order size
      if (tradingPairConfig && amountWei < tradingPairConfig.minOrderSize) {
        const minAmount = Number(tradingPairConfig.minOrderSize) / Math.pow(10, baseAsset.decimals);
        toastWarning("Order Too Small", `Minimum order size is ${minAmount} ${pair.base}`);
        return;
      }

      // Validate tick size for limit orders
      if (orderType === "limit" && tradingPairConfig && priceWei > 0n) {
        if (priceWei % tradingPairConfig.tickSize !== 0n) {
          const tickSize = Number(tradingPairConfig.tickSize) / Math.pow(10, quoteAsset.decimals);
          toastWarning("Invalid Price", `Price must be a multiple of ${tickSize} ${pair.quote}`);
          return;
        }
      }

      // Get OTC orderbook address for approval
      const addresses = getContractAddresses("sepolia");
      const calls: Call[] = [];

      // First approve the OTC orderbook to spend tokens
      // For sell orders, we need to approve SAGE; for buy orders, approve quote token
      if (side === "sell") {
        // Approve SAGE token for selling
        const approveCall = buildApproveCall(addresses.OTC_ORDERBOOK, amountWei);
        calls.push(approveCall);
      } else {
        // For buy orders, approve quote token (STRK/USDC/ETH)
        let totalCost: bigint;

        if (orderType === "market" && tradingPairConfig) {
          // Use centralized config for estimated market price with slippage buffer
          // Use 0.20 STRK/SAGE as conservative estimate (2x the best_ask of 0.10)
          const estimatedPricePerSage = getEstimatedMarketPrice(tradingPairConfig);
          // Add 50% buffer for slippage and gas
          const priceWithBuffer = (estimatedPricePerSage * 3n) / 2n;
          totalCost = (priceWithBuffer * amountWei) / BigInt(10 ** baseAsset.decimals);
          console.log('[PlaceOrder] Market buy approval calculation:', {
            estimatedPrice: Number(estimatedPricePerSage) / 1e18,
            priceWithBuffer: Number(priceWithBuffer) / 1e18,
            amount: Number(amountWei) / 1e18,
            totalCost: Number(totalCost) / 1e18,
          });
        } else if (orderType === "market") {
          // Fallback for market orders without config - use higher estimate
          const estimatedPricePerSage = parseAssetAmount("0.25", quoteAsset);
          totalCost = (estimatedPricePerSage * amountWei) / BigInt(10 ** baseAsset.decimals);
          console.log('[PlaceOrder] Market buy fallback approval:', {
            estimatedPrice: Number(estimatedPricePerSage) / 1e18,
            amount: Number(amountWei) / 1e18,
            totalCost: Number(totalCost) / 1e18,
          });
        } else {
          // For limit orders, calculate exact cost: price * amount
          totalCost = (priceWei * amountWei) / BigInt(10 ** baseAsset.decimals);
        }

        // Build approve call for quote token
        const quoteTokenAddress = quoteAsset.contractAddress;
        if (quoteTokenAddress && quoteTokenAddress !== "0x0" && totalCost > 0n) {
          const approveQuoteCall: Call = {
            contractAddress: quoteTokenAddress,
            entrypoint: "approve",
            calldata: [addresses.OTC_ORDERBOOK, totalCost.toString(), "0"],
          };
          calls.push(approveQuoteCall);
          console.log('[PlaceOrder] Approve call:', {
            token: quoteTokenAddress.slice(0, 10) + '...',
            amount: totalCost.toString(),
            amountFormatted: Number(totalCost) / 1e18,
          });
        }
      }

      // Build the order transaction
      if (orderType === "limit") {
        const orderCall = buildPlaceLimitOrderCall(
          numericPairId,
          side === "buy" ? 0 : 1,
          priceWei,
          amountWei
        );
        calls.push(orderCall);
      } else {
        // Market order
        const orderCall = side === "buy"
          ? buildMarketBuyCall(numericPairId, amountWei)
          : buildMarketSellCall(numericPairId, amountWei);
        calls.push(orderCall);
      }

      // Send all transactions
      await sendTransactionAsync(calls);

      // Success notification
      const orderTypeLabel = orderType === "limit" ? "Limit" : "Market";
      const sideLabel = side === "buy" ? "Buy" : "Sell";
      toastSuccess(
        "Order Placed",
        `${orderTypeLabel} ${sideLabel} order for ${amount} ${pair.base} submitted`
      );

      // Reset form on success
      setPrice("");
      setAmount("");
      setSliderValue(0);
    } catch (error: unknown) {
      console.error("Failed to place order:", error);

      // Extract error message for user-friendly display
      let errorMessage = "Transaction failed. Please try again.";
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("u256_sub Overflow")) {
          errorMessage = "Insufficient token balance for this order";
        } else if (msg.includes("Trading pair not active")) {
          errorMessage = "This trading pair is not active";
        } else if (msg.includes("No liquidity")) {
          errorMessage = "No liquidity available for market order";
        } else if (msg.includes("tick size")) {
          errorMessage = "Price must be a multiple of the tick size";
        } else if (msg.includes("User rejected") || msg.includes("rejected")) {
          errorMessage = "Transaction was rejected";
        } else {
          errorMessage = msg.slice(0, 100); // Truncate long errors
        }
      }
      toastError("Order Failed", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-card overflow-hidden h-full min-h-[450px] lg:min-h-[520px] flex flex-col">
      {/* Buy/Sell Tabs */}
      <div className="grid grid-cols-2 border-b border-surface-border">
        <button
          onClick={() => setSide("buy")}
          className={cn(
            "py-3 font-medium transition-colors",
            side === "buy"
              ? "bg-emerald-500/20 text-emerald-400 border-b-2 border-emerald-400"
              : "text-gray-400 hover:text-white hover:bg-surface-elevated"
          )}
        >
          Buy {pair.base}
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn(
            "py-3 font-medium transition-colors",
            side === "sell"
              ? "bg-red-500/20 text-red-400 border-b-2 border-red-400"
              : "text-gray-400 hover:text-white hover:bg-surface-elevated"
          )}
        >
          Sell {pair.base}
        </button>
      </div>

      <div className="flex-1 p-4 pb-6 flex flex-col gap-4 overflow-y-auto">
        {/* Order Type Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setOrderType("limit")}
            className={cn(
              "flex-1 py-2 text-sm rounded-lg transition-colors",
              orderType === "limit"
                ? "bg-surface-elevated text-white"
                : "text-gray-500 hover:text-white"
            )}
          >
            Limit
          </button>
          <button
            onClick={() => setOrderType("market")}
            className={cn(
              "flex-1 py-2 text-sm rounded-lg transition-colors",
              orderType === "market"
                ? "bg-surface-elevated text-white"
                : "text-gray-500 hover:text-white"
            )}
          >
            Market
          </button>
        </div>

        {/* Price Input (for limit orders) */}
        {orderType === "limit" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">
                Price ({pair.quote})
              </label>
              {priceUsd && (
                <span className="text-xs text-emerald-400/70 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {priceUsd}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="input-field pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                {pair.quote}
              </span>
            </div>
          </div>
        )}

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">
              Amount ({pair.base})
            </label>
            <span className="text-xs text-gray-500">
              Balance: {side === "sell" ? balances.base : balances.quote} {side === "sell" ? pair.base : pair.quote}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input-field pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {pair.base}
            </span>
          </div>
        </div>

        {/* Percentage Slider */}
        <div>
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={(e) => handleSliderChange(parseInt(e.target.value))}
            className="w-full h-2 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
          <div className="flex justify-between mt-2">
            {[0, 25, 50, 75, 100].map((val) => (
              <button
                key={val}
                onClick={() => handleSliderChange(val)}
                className={cn(
                  "text-xs px-2 py-1 rounded transition-colors",
                  sliderValue === val
                    ? "bg-brand-600 text-white"
                    : "text-gray-500 hover:text-white"
                )}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="p-3 rounded-lg bg-surface-elevated">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {orderType === "market" ? "Est. Total" : "Total"}
            </span>
            <div className="text-right">
              <span className="text-white font-medium">
                {orderType === "market" ? "~" : ""}{total} {pair.quote}
              </span>
              {totalUsd && (
                <span className="text-emerald-400/70 text-xs ml-2">{totalUsd}</span>
              )}
            </div>
          </div>
          {strkToUsd > 0 && (
            <div className="text-right mt-1">
              <span className="text-xs text-gray-600">
                1 STRK = ${strkToUsd.toFixed(3)} (Pragma Oracle)
              </span>
            </div>
          )}
        </div>

        {/* Fee Info */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Info className="w-3 h-3" />
          <span>Trading fee: 0.1% • Maker rebate: 0.02%</span>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!isConnected || isSubmitting || !amount || (orderType === "limit" && !price)}
          className={cn(
            "w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
            side === "buy"
              ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-emerald-600/50"
              : "bg-red-600 hover:bg-red-500 text-white disabled:bg-red-600/50",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !isConnected ? (
            "Connect Wallet"
          ) : (
            `${side === "buy" ? "Buy" : "Sell"} ${pair.base}`
          )}
        </button>
      </div>
    </div>
  );
}
