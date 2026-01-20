"use client";

import { useMemo, useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Activity, BarChart3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketStatsProps {
  pairId: string;
}

// Map pair ID strings to numeric IDs used by the contract
// Must match contract pair IDs: 0=SAGE_USDC, 1=SAGE_STRK, 2=SAGE_ETH, 3=STRK_USDC
const PAIR_ID_MAP: Record<string, number> = {
  "SAGE_USDC": 0,
  "SAGE_STRK": 1,
  "SAGE_ETH": 2,
  "STRK_USDC": 3,
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface MarketData {
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  tradeCount24h: number;
  recentTradeCount: number;
  priceChange: number;
}

// Fetch market stats from API (database) for accurate data
async function fetchMarketData(pairId: number): Promise<MarketData | null> {
  try {
    const DECIMALS = 18;

    // Fetch from API which uses database (more accurate than contract stats)
    const [statsRes, tradesRes] = await Promise.all([
      fetch(`${API_BASE}/api/trading/stats/${pairId}/24h`),
      fetch(`${API_BASE}/api/trading/trades/${pairId}?limit=10`),
    ]);

    const statsData = await statsRes.json();
    const tradesData = await tradesRes.json();

    // Parse API stats (values are in wei)
    const lastPriceRaw = parseFloat(statsData.last_price || "0");
    const high24hRaw = parseFloat(statsData.high_24h || "0");
    const low24hRaw = parseFloat(statsData.low_24h || "0");
    const volume24hRaw = parseFloat(statsData.volume_24h || "0");
    const tradeCount24h = statsData.trade_count_24h || 0;
    const recentTradeCount = Array.isArray(tradesData) ? tradesData.length : 0;

    // Convert from wei
    let lastPrice = lastPriceRaw / (10 ** DECIMALS);
    let high24h = high24hRaw / (10 ** DECIMALS);
    let low24h = low24hRaw / (10 ** DECIMALS);
    const volume24h = volume24hRaw / (10 ** DECIMALS);

    // Calculate price change from actual trade history for accuracy
    let priceChange = 0;
    if (Array.isArray(tradesData) && tradesData.length >= 2) {
      // Get most recent and second most recent trade prices
      const currentPrice = parseFloat(tradesData[0]?.price || "0") / (10 ** DECIMALS);
      const previousPrice = parseFloat(tradesData[1]?.price || "0") / (10 ** DECIMALS);

      if (previousPrice > 0) {
        priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
      }

      // Use trade prices for accurate high/low if contract stats seem wrong
      if (tradesData.length > 0) {
        const tradePrices = tradesData.map((t: { price: string }) =>
          parseFloat(t.price) / (10 ** DECIMALS)
        ).filter((p: number) => p > 0);

        if (tradePrices.length > 0) {
          const actualHigh = Math.max(...tradePrices);
          const actualLow = Math.min(...tradePrices);
          // Use trade-derived values if contract values seem unreasonable
          if (high24h > actualHigh * 10 || high24h === 0) high24h = actualHigh;
          if (low24h === 0 || low24h > actualHigh) low24h = actualLow;
          if (lastPrice === 0) lastPrice = tradePrices[0];
        }
      }
    }

    return { lastPrice, high24h, low24h, volume24h, tradeCount24h, recentTradeCount, priceChange };
  } catch (error) {
    console.error("[MarketStats] Fetch error:", error);
    return null;
  }
}

export function MarketStats({ pairId }: MarketStatsProps) {
  const numericPairId = PAIR_ID_MAP[pairId] ?? 0;

  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      const data = await fetchMarketData(numericPairId);
      if (mounted) {
        setMarketData(data);
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [numericPairId]);

  // Transform fetched data to display format
  const stats = useMemo(() => {
    if (marketData) {
      return {
        lastPrice: marketData.lastPrice.toFixed(4),
        priceChange24h: Math.round(marketData.priceChange * 100) / 100,
        high24h: marketData.high24h.toFixed(4),
        low24h: marketData.low24h.toFixed(4),
        volume24h: marketData.volume24h.toFixed(2),
        trades24h: marketData.tradeCount24h,
        recentTrades: marketData.recentTradeCount,
      };
    }

    // Default empty state
    return {
      lastPrice: "0.0000",
      priceChange24h: 0,
      high24h: "0.0000",
      low24h: "0.0000",
      volume24h: "0",
      trades24h: 0,
      recentTrades: 0,
    };
  }, [marketData]);

  const isPositive = stats.priceChange24h >= 0;

  if (isLoading) {
    return (
      <div className="glass-card p-4 flex-1 flex items-center justify-center min-h-[60px]">
        <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="glass-card p-4 flex-1">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Last Price */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Last Price</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">{stats.lastPrice}</span>
            <span className={cn(
              "flex items-center gap-1 text-sm font-medium",
              isPositive ? "text-emerald-400" : "text-red-400"
            )}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? "+" : ""}{stats.priceChange24h}%
            </span>
          </div>
        </div>

        <div className="h-10 w-px bg-surface-border hidden md:block" />

        {/* 24h High */}
        <div>
          <p className="text-xs text-gray-500 mb-1">24h High</p>
          <span className="text-white font-medium">{stats.high24h}</span>
        </div>

        {/* 24h Low */}
        <div>
          <p className="text-xs text-gray-500 mb-1">24h Low</p>
          <span className="text-white font-medium">{stats.low24h}</span>
        </div>

        <div className="h-10 w-px bg-surface-border hidden md:block" />

        {/* 24h Volume */}
        <div>
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            24h Volume
          </p>
          <span className="text-white font-medium">{stats.volume24h} STRK</span>
        </div>

        {/* Trades */}
        <div>
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Trades
          </p>
          <span className="text-white font-medium">{stats.recentTrades}</span>
        </div>
      </div>
    </div>
  );
}
