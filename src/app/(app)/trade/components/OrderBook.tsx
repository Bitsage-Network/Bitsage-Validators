"use client";

/**
 * OrderBook Component - Pure On-Chain (Trustless)
 *
 * Fetches full orderbook depth directly from the Starknet OTC Orderbook contract.
 * Uses get_orderbook_depth for aggregated price levels with amounts.
 */

import { useMemo, useState } from "react";
import { Loader2, Wifi, Radio, ShieldCheck, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOTCOrderbookDepth, useOTCLastTrade } from "@/lib/contracts";
import { useTradingWebSocket } from "@/lib/hooks/useWebSocket";
import { usePragmaPrice } from "@/lib/hooks/usePragmaOracle";

interface TradingPair {
  id: string;
  base: string;
  quote: string;
  decimals: { base: number; quote: number };
}

interface OrderBookProps {
  pairId: string;
  pair: TradingPair;
  onOrderClick?: (price: string, amount: string, side: 'buy' | 'sell') => void;
}

interface OrderLevel {
  price: string;
  priceUsd: string;
  amount: string;
  total: string;
  totalUsd: string;
  percentage: number;
}

// Map pair ID strings to numeric IDs used by the contract
const PAIR_ID_MAP: Record<string, number> = {
  "SAGE_STRK": 1,
  "SAGE_USDC": 0,
  "SAGE_ETH": 2,
  "STRK_USDC": 3,
};

export function OrderBook({ pairId, pair, onOrderClick }: OrderBookProps) {
  const [precision, setPrecision] = useState(4);
  const numericPairId = PAIR_ID_MAP[pairId] ?? 1;

  // Pure on-chain data using get_orderbook_depth for full depth
  const { data: depthData, isLoading, isFetching } = useOTCOrderbookDepth(numericPairId, 15);
  const { data: lastTradeData } = useOTCLastTrade(numericPairId);

  // WebSocket for real-time trade notifications
  const { isConnected: wsConnected } = useTradingWebSocket(numericPairId, {});

  // Fetch STRK/USD price from Pragma Oracle for USD conversion
  // Fallback to ~$0.084 if oracle not available (Jan 2026 approximate rate)
  const { data: strkUsdPrice, isLoading: priceLoading } = usePragmaPrice('STRK_USD');
  const strkToUsd = strkUsdPrice?.price && strkUsdPrice.price > 0 ? strkUsdPrice.price : 0.084;

  const isRefetching = isFetching && !isLoading;

  // Parse u256 values from contract
  const parseU256 = (val: unknown): bigint => {
    if (!val) return 0n;
    if (typeof val === 'bigint') return val;
    if (val && typeof val === 'object' && 'low' in val) {
      return BigInt((val as { low: bigint }).low);
    }
    if (typeof val === 'number' || typeof val === 'string') {
      return BigInt(val);
    }
    return 0n;
  };

  // Transform on-chain depth data to display format
  // Cairo returns (Array<(u256, u256, u32)>, Array<(u256, u256, u32)>)
  // starknet-react may parse this as [[bids], [asks]] or raw flat array
  const orderBook = useMemo(() => {
    const bids: OrderLevel[] = [];
    const asks: OrderLevel[] = [];

    if (!depthData) {
      return { asks, bids, spread: "0.0000", lastPrice: "—" };
    }

    // Helper to parse u256 from various formats
    const parseU256Value = (val: unknown): bigint => {
      if (!val) return 0n;
      if (typeof val === "bigint") return val;
      if (typeof val === "number") return BigInt(val);
      if (typeof val === "string") return BigInt(val);
      // Handle {low, high} format
      if (val && typeof val === "object" && "low" in val) {
        const obj = val as { low: unknown; high?: unknown };
        const low = BigInt(obj.low?.toString() || "0");
        const high = BigInt(obj.high?.toString() || "0");
        return low + (high << 128n);
      }
      return 0n;
    };

    // Helper to parse a price level tuple
    const parseTuple = (tuple: unknown): { price: bigint; amount: bigint; count: number } => {
      if (Array.isArray(tuple)) {
        return {
          price: parseU256Value(tuple[0]),
          amount: parseU256Value(tuple[1]),
          count: Number(tuple[2] || 0),
        };
      }
      if (tuple && typeof tuple === "object") {
        const t = tuple as Record<string, unknown>;
        return {
          price: parseU256Value(t.price ?? t[0] ?? t["0"]),
          amount: parseU256Value(t.amount ?? t[1] ?? t["1"]),
          count: Number(t.count ?? t[2] ?? t["2"] ?? 0),
        };
      }
      return { price: 0n, amount: 0n, count: 0 };
    };

    let parsedBids: { price: bigint; amount: bigint; count: number }[] = [];
    let parsedAsks: { price: bigint; amount: bigint; count: number }[] = [];

    // starknet-react returns tuple as object {0: [...], 1: [...]}
    const data = depthData as Record<string | number, unknown>;

    // Format: {0: bids_array, 1: asks_array} from starknet-react tuple parsing
    if (data && typeof data === "object" && "0" in data && "1" in data) {
      const bidsRaw = data[0] as unknown[];
      const asksRaw = data[1] as unknown[];

      if (Array.isArray(bidsRaw)) {
        for (const level of bidsRaw) {
          parsedBids.push(parseTuple(level));
        }
      }
      if (Array.isArray(asksRaw)) {
        for (const level of asksRaw) {
          parsedAsks.push(parseTuple(level));
        }
      }
    }
    // Fallback: actual array format
    else if (Array.isArray(depthData)) {
      // Format: [[bids], [asks]]
      if (depthData.length === 2 && Array.isArray(depthData[0]) && Array.isArray(depthData[1])) {
        const bidsRaw = depthData[0] as unknown[];
        const asksRaw = depthData[1] as unknown[];
        for (const level of bidsRaw) {
          parsedBids.push(parseTuple(level));
        }
        for (const level of asksRaw) {
          parsedAsks.push(parseTuple(level));
        }
      }
    }

    // Find max amounts for percentage calculation
    let maxBidAmount = 0n;
    let maxAskAmount = 0n;

    for (const { amount } of parsedBids) {
      if (amount > maxBidAmount) maxBidAmount = amount;
    }
    for (const { amount } of parsedAsks) {
      if (amount > maxAskAmount) maxAskAmount = amount;
    }

    // Convert bids to display format (sorted by price descending - highest first)
    for (const { price, amount } of parsedBids) {
      if (price > 0n) {
        const priceNum = Number(price) / 1e18;
        const amountNum = Number(amount) / 1e18;
        const totalStrk = priceNum * amountNum;
        // Calculate USD values using STRK/USD oracle price
        const priceUsdNum = priceNum * strkToUsd;
        const totalUsdNum = totalStrk * strkToUsd;
        bids.push({
          price: priceNum.toFixed(precision),
          priceUsd: strkToUsd > 0 ? `$${priceUsdNum.toFixed(4)}` : '',
          amount: amountNum.toFixed(2),
          total: totalStrk.toFixed(2),
          totalUsd: strkToUsd > 0 ? `$${totalUsdNum.toFixed(2)}` : '',
          percentage: maxBidAmount > 0n ? Number((amount * 100n) / maxBidAmount) : 100,
        });
      }
    }

    // Convert asks to display format (sorted by price ascending - lowest first)
    for (const { price, amount } of parsedAsks) {
      if (price > 0n) {
        const priceNum = Number(price) / 1e18;
        const amountNum = Number(amount) / 1e18;
        const totalStrk = priceNum * amountNum;
        // Calculate USD values using STRK/USD oracle price
        const priceUsdNum = priceNum * strkToUsd;
        const totalUsdNum = totalStrk * strkToUsd;
        asks.push({
          price: priceNum.toFixed(precision),
          priceUsd: strkToUsd > 0 ? `$${priceUsdNum.toFixed(4)}` : '',
          amount: amountNum.toFixed(2),
          total: totalStrk.toFixed(2),
          totalUsd: strkToUsd > 0 ? `$${totalUsdNum.toFixed(2)}` : '',
          percentage: maxAskAmount > 0n ? Number((amount * 100n) / maxAskAmount) : 100,
        });
      }
    }

    // Calculate spread from best bid/ask
    let spread = "0.0000";
    if (bids.length > 0 && asks.length > 0) {
      const bestBid = parseFloat(bids[0].price);
      const bestAsk = parseFloat(asks[0].price);
      spread = (bestAsk - bestBid).toFixed(precision);
    }

    // Get last trade price for reference
    let lastPrice = "—";
    if (lastTradeData) {
      const data = lastTradeData as [unknown, unknown, unknown] | { 0?: unknown };
      const priceVal = Array.isArray(data) ? parseU256(data[0]) : parseU256((data as { 0?: unknown })[0]);
      if (priceVal > 0n) {
        lastPrice = (Number(priceVal) / 1e18).toFixed(precision);
      }
    }

    // Calculate last price in USD
    let lastPriceUsd = "";
    if (lastPrice !== "—" && strkToUsd > 0) {
      const lastPriceNum = parseFloat(lastPrice);
      lastPriceUsd = `$${(lastPriceNum * strkToUsd).toFixed(4)}`;
    }

    return { asks, bids, spread, lastPrice, lastPriceUsd, strkUsdRate: strkToUsd };
  }, [depthData, lastTradeData, precision, strkToUsd]);

  if (isLoading) {
    return (
      <div className="glass-card p-6 h-full min-h-[400px] lg:h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          <span className="text-xs text-gray-500">Loading from Starknet...</span>
        </div>
      </div>
    );
  }

  const hasOrders = orderBook.bids.length > 0 || orderBook.asks.length > 0;

  return (
    <div className="glass-card overflow-hidden h-full min-h-[400px] lg:h-[500px] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Order Book</h3>
            {/* Trustless indicator */}
            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
              <ShieldCheck className="w-3 h-3" />
              Trustless
            </span>
            {/* Live data indicator */}
            {isRefetching && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
              </span>
            )}
            {/* WebSocket live indicator */}
            {wsConnected && (
              <span className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded animate-pulse">
                <Radio className="w-3 h-3" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {[2, 4, 6].map((p) => (
              <button
                key={p}
                onClick={() => setPrecision(p)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  precision === p
                    ? "bg-brand-600 text-white"
                    : "bg-surface-elevated text-gray-400 hover:text-white"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs text-gray-500 border-b border-surface-border/50">
        <div className="flex items-center gap-1">
          Price ({pair.quote})
          {orderBook.strkUsdRate > 0 && (
            <span className="text-emerald-500/70 flex items-center">
              <DollarSign className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="text-right">Amount ({pair.base})</div>
        <div className="text-right">Total</div>
      </div>

      {/* Order Book Content */}
      <div className="flex-1 overflow-y-auto">
        {!hasOrders ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Wifi className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No orders on-chain</p>
            <p className="text-xs mt-1">Be the first to place an order!</p>
          </div>
        ) : (
          <>
            {/* Asks (Sell Orders) - Red */}
            <div className="flex flex-col-reverse">
              {orderBook.asks.map((level, i) => (
                <div
                  key={`ask-${i}`}
                  onClick={() => onOrderClick?.(level.price, level.amount, 'buy')}
                  className="relative grid grid-cols-3 gap-2 px-4 py-2 text-sm hover:bg-red-500/20 cursor-pointer group transition-colors"
                  title={`Click to buy at ${level.price} STRK ${level.priceUsd ? `(${level.priceUsd})` : ''}`}
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-red-500/10 group-hover:bg-red-500/20 transition-colors"
                    style={{ width: `${level.percentage}%` }}
                  />
                  <div className="relative font-mono">
                    <span className="text-red-400">{level.price}</span>
                    {level.priceUsd && (
                      <span className="text-red-400/50 text-xs ml-1">{level.priceUsd}</span>
                    )}
                  </div>
                  <div className="relative text-right text-gray-500 font-mono">{level.amount}</div>
                  <div className="relative text-right font-mono">
                    <span className="text-gray-600">{level.total}</span>
                    {level.totalUsd && (
                      <span className="text-gray-600/50 text-xs ml-1">{level.totalUsd}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Spread & Last Price */}
            <div className="px-4 py-3 bg-surface-elevated/50 border-y border-surface-border/50">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-gray-500 text-xs">Last Price</span>
                    <div className="text-white font-mono font-semibold">
                      {orderBook.lastPrice}
                      {orderBook.lastPriceUsd && (
                        <span className="text-emerald-400/70 text-xs ml-1.5">{orderBook.lastPriceUsd}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-gray-500 text-xs">Spread</span>
                  <div className="text-white font-mono">{orderBook.spread}</div>
                  {orderBook.strkUsdRate > 0 && (
                    <div className="text-xs text-gray-600">
                      STRK = ${orderBook.strkUsdRate.toFixed(3)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bids (Buy Orders) - Green */}
            {orderBook.bids.map((level, i) => (
              <div
                key={`bid-${i}`}
                onClick={() => onOrderClick?.(level.price, level.amount, 'sell')}
                className="relative grid grid-cols-3 gap-2 px-4 py-2 text-sm hover:bg-emerald-500/20 cursor-pointer group transition-colors"
                title={`Click to sell at ${level.price} STRK ${level.priceUsd ? `(${level.priceUsd})` : ''}`}
              >
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors"
                  style={{ width: `${level.percentage}%` }}
                />
                <div className="relative font-mono">
                  <span className="text-emerald-400">{level.price}</span>
                  {level.priceUsd && (
                    <span className="text-emerald-400/50 text-xs ml-1">{level.priceUsd}</span>
                  )}
                </div>
                <div className="relative text-right text-gray-500 font-mono">{level.amount}</div>
                <div className="relative text-right font-mono">
                  <span className="text-gray-600">{level.total}</span>
                  {level.totalUsd && (
                    <span className="text-gray-600/50 text-xs ml-1">{level.totalUsd}</span>
                  )}
                </div>
              </div>
            ))}

            {/* Full depth indicator with USD info */}
            <div className="px-4 py-3 text-center text-xs text-gray-600 border-t border-surface-border/30">
              {orderBook.strkUsdRate > 0 ? (
                <span>On-chain orderbook • USD prices via Pragma Oracle</span>
              ) : (
                <span>Full orderbook depth from on-chain</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
