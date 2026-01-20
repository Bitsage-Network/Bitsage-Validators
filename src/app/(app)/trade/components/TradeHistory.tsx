"use client";

/**
 * TradeHistory Component - Pure On-Chain (Trustless)
 *
 * Fetches trade history directly from the Starknet OTC Orderbook contract.
 * No backend/database dependency for historical data.
 */

import { useMemo, useRef, useEffect } from "react";
import { Loader2, Info, ShieldCheck, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOTCTradeHistory, useOTCLastTrade } from "@/lib/contracts";
import { useTradingWebSocket } from "@/lib/hooks/useWebSocket";

interface TradingPair {
  id: string;
  base: string;
  quote: string;
  decimals: { base: number; quote: number };
}

interface TradeHistoryProps {
  pairId: string;
  pair: TradingPair;
}

interface Trade {
  id: string;
  price: string;
  amount: string;
  side: "buy" | "sell";
  time: string;
  timestamp: number;
}

// Map pair ID strings to numeric IDs used by the contract
const PAIR_ID_MAP: Record<string, number> = {
  "SAGE_STRK": 1,
  "SAGE_USDC": 0,
  "SAGE_ETH": 2,
  "STRK_USDC": 3,
};

export function TradeHistory({ pairId, pair }: TradeHistoryProps) {
  const numericPairId = PAIR_ID_MAP[pairId] ?? 1;

  // Pure on-chain: get trade history directly from contract
  const {
    data: tradeHistoryData,
    isLoading: historyLoading,
    isFetching
  } = useOTCTradeHistory(numericPairId, 0, 20);
  const isRefetching = isFetching && !historyLoading;

  // Also get last trade for faster initial display
  const { data: lastTradeData } = useOTCLastTrade(numericPairId);

  // WebSocket for real-time trade updates
  const { isConnected: wsConnected, recentTrades: wsTrades } = useTradingWebSocket(numericPairId);

  // Accumulate trades during session
  const accumulatedTradesRef = useRef<Trade[]>([]);

  // Parse last trade from contract
  const lastTrade = useMemo(() => {
    if (!lastTradeData) return null;

    // lastTradeData format: (price: u256, amount: u256, timestamp: u64)
    const data = lastTradeData as [unknown, unknown, unknown] | { 0?: unknown; 1?: unknown; 2?: unknown };

    let price: bigint;
    let amount: bigint;
    let timestamp: number;

    const parseU256 = (val: unknown): bigint => {
      if (typeof val === 'bigint') return val;
      if (val && typeof val === 'object' && 'low' in val) {
        return BigInt((val as { low: bigint }).low);
      }
      if (typeof val === 'number' || typeof val === 'string') {
        return BigInt(val);
      }
      return 0n;
    };

    if (Array.isArray(data)) {
      price = parseU256(data[0]);
      amount = parseU256(data[1]);
      timestamp = Number(data[2] ?? 0);
    } else {
      price = parseU256(data[0]);
      amount = parseU256(data[1]);
      timestamp = Number(data[2] ?? 0);
    }

    if (price === 0n || timestamp === 0) return null;

    const priceFormatted = Number(price) / 1e18;
    const amountFormatted = amount > 0n ? (Number(amount) / 1e18).toFixed(2) : "—";

    return {
      id: `last-trade-${timestamp}`,
      price: priceFormatted.toFixed(6),
      amount: amountFormatted,
      side: "buy" as const,
      time: formatTime(timestamp * 1000),
      timestamp: timestamp * 1000,
    };
  }, [lastTradeData]);

  // Parse on-chain trade history
  const chainTrades = useMemo(() => {
    if (!tradeHistoryData || !Array.isArray(tradeHistoryData)) return [];

    return tradeHistoryData.map((trade: unknown, index: number) => {
      const t = trade as {
        trade_id?: { low?: bigint } | bigint;
        price?: { low?: bigint } | bigint;
        amount?: { low?: bigint } | bigint;
        executed_at?: number | bigint;
        taker?: string;
        maker?: string;
      };

      // Parse trade_id
      const tradeId = typeof t.trade_id === 'bigint'
        ? t.trade_id
        : BigInt((t.trade_id as { low?: bigint })?.low || index);

      // Parse price (18 decimals)
      const priceRaw = typeof t.price === 'bigint'
        ? t.price
        : BigInt((t.price as { low?: bigint })?.low || 0);
      const price = Number(priceRaw) / 1e18;

      // Parse amount (18 decimals)
      const amountRaw = typeof t.amount === 'bigint'
        ? t.amount
        : BigInt((t.amount as { low?: bigint })?.low || 0);
      const amount = Number(amountRaw) / 1e18;

      // Parse timestamp
      const timestamp = typeof t.executed_at === 'bigint'
        ? Number(t.executed_at)
        : Number(t.executed_at || 0);

      return {
        id: `chain-trade-${tradeId.toString()}`,
        price: price.toFixed(6),
        amount: amount.toFixed(2),
        side: "buy" as "buy" | "sell", // Contract doesn't store side
        time: formatTime(timestamp * 1000),
        timestamp: timestamp * 1000,
      };
    }).filter((t: Trade) => t.timestamp > 0);
  }, [tradeHistoryData]);

  // Transform WebSocket trades to display format
  const wsTradesTransformed = useMemo(() => {
    return wsTrades.map((t) => ({
      id: t.trade_id,
      price: parseFloat(t.price).toFixed(6),
      amount: parseFloat(t.amount).toFixed(2),
      side: t.side as "buy" | "sell",
      time: formatTime(t.timestamp * 1000),
      timestamp: t.timestamp * 1000,
    }));
  }, [wsTrades]);

  // Accumulate new WebSocket trades
  useEffect(() => {
    if (wsTradesTransformed.length > 0) {
      const existingIds = new Set(accumulatedTradesRef.current.map((t) => t.id));
      const newTrades = wsTradesTransformed.filter((t) => !existingIds.has(t.id));
      if (newTrades.length > 0) {
        accumulatedTradesRef.current = [...newTrades, ...accumulatedTradesRef.current].slice(0, 50);
      }
    }
  }, [wsTradesTransformed]);

  // Combine: WebSocket trades + on-chain trades + last trade
  const trades = useMemo(() => {
    const seenIds = new Set<string>();
    const seenTimestamps = new Set<number>();
    const allTrades: Trade[] = [];

    // Add WebSocket trades first (most recent real-time data)
    for (const t of accumulatedTradesRef.current) {
      if (!seenIds.has(t.id) && !seenTimestamps.has(t.timestamp)) {
        allTrades.push(t);
        seenIds.add(t.id);
        seenTimestamps.add(t.timestamp);
      }
    }

    // Add on-chain trade history
    for (const t of chainTrades) {
      if (!seenIds.has(t.id) && !seenTimestamps.has(t.timestamp)) {
        allTrades.push(t);
        seenIds.add(t.id);
        seenTimestamps.add(t.timestamp);
      }
    }

    // Add last trade from contract if not already in list
    if (lastTrade && !seenIds.has(lastTrade.id) && !seenTimestamps.has(lastTrade.timestamp)) {
      allTrades.push(lastTrade);
    }

    // Sort by timestamp descending (most recent first)
    return allTrades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }, [chainTrades, lastTrade, wsTradesTransformed]);

  if (historyLoading && !lastTrade) {
    return (
      <div className="glass-card p-6 h-full min-h-[300px] lg:h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          <span className="text-xs text-gray-500">Loading from Starknet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden h-full min-h-[300px] lg:h-[500px] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">Recent Trades</h3>
          {/* Trustless indicator */}
          <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" />
            Trustless
          </span>
          {/* Loading indicator */}
          {isRefetching && (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          )}
        </div>
        {wsConnected && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs animate-pulse">
            <Radio className="w-3 h-3" />
            Live
          </span>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs text-gray-500 border-b border-surface-border/50">
        <div>Price ({pair.quote})</div>
        <div className="text-right">Amount ({pair.base})</div>
        <div className="text-right">Time</div>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2">
            <span>No trades on-chain yet</span>
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Trades will appear here when executed
            </span>
          </div>
        ) : (
          trades.map((trade) => (
            <div
              key={trade.id}
              className="grid grid-cols-3 gap-2 px-4 py-1.5 text-sm hover:bg-surface-elevated/50 transition-colors"
            >
              <div className={cn(
                "font-mono",
                trade.side === "buy" ? "text-emerald-400" : "text-red-400"
              )}>
                {trade.price}
              </div>
              <div className="text-right text-gray-300 font-mono">
                {trade.amount}
              </div>
              <div className="text-right text-gray-500">
                {trade.time}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
