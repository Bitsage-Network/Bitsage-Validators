// Centralized trading pairs configuration
// Provides pair info with proper decimal handling

import { useMemo } from "react";
import { getAssetBySymbol, type Asset } from "@/lib/contracts/assets";

export interface TradingPair {
  id: string;                    // e.g., "SAGE_STRK"
  pairId: number;                // On-chain pair ID
  base: Asset;                   // Base asset (SAGE)
  quote: Asset;                  // Quote asset (STRK, USDC, ETH)
  minOrderSize: bigint;          // Minimum order size in base units
  tickSize: bigint;              // Minimum price increment in quote units
  makerFeeBps: number;           // Maker fee in basis points
  takerFeeBps: number;           // Taker fee in basis points
  isActive: boolean;             // Whether pair is tradeable
}

// Trading pair configurations
// IMPORTANT: pairId must match on-chain OTC orderbook pair IDs
const TRADING_PAIR_CONFIGS: Omit<TradingPair, "base" | "quote">[] = [
  {
    id: "SAGE_STRK",
    pairId: 1,                   // Active on sepolia with real STRK
    minOrderSize: 1000000000000000000n, // 1 SAGE
    tickSize: 100000000000000n,  // 0.0001 STRK
    makerFeeBps: 10,             // 0.1%
    takerFeeBps: 30,             // 0.3%
    isActive: true,
  },
  {
    id: "SAGE_USDC",
    pairId: 2,
    minOrderSize: 1000000000000000000n, // 1 SAGE
    tickSize: 1000n,              // 0.001 USDC (6 decimals)
    makerFeeBps: 10,
    takerFeeBps: 30,
    isActive: false,             // Not yet deployed
  },
  {
    id: "SAGE_ETH",
    pairId: 3,
    minOrderSize: 1000000000000000000n, // 1 SAGE
    tickSize: 1000000000000n,     // 0.000001 ETH
    makerFeeBps: 10,
    takerFeeBps: 30,
    isActive: false,             // Not yet deployed
  },
  {
    id: "STRK_USDC",
    pairId: 4,
    minOrderSize: 1000000000000000000n, // 1 STRK
    tickSize: 1000n,              // 0.001 USDC
    makerFeeBps: 10,
    takerFeeBps: 30,
    isActive: false,             // Not yet deployed
  },
];

// Build full trading pairs with asset info
function buildTradingPairs(): Map<string, TradingPair> {
  const pairs = new Map<string, TradingPair>();

  for (const config of TRADING_PAIR_CONFIGS) {
    const [baseSymbol, quoteSymbol] = config.id.split("_");
    const base = getAssetBySymbol(baseSymbol);
    const quote = getAssetBySymbol(quoteSymbol);

    if (!base || !quote) {
      console.warn(`Missing asset for pair ${config.id}: base=${baseSymbol}, quote=${quoteSymbol}`);
      continue;
    }

    pairs.set(config.id, {
      ...config,
      base,
      quote,
    });
  }

  return pairs;
}

// Singleton map of trading pairs
let tradingPairsMap: Map<string, TradingPair> | null = null;

function getTradingPairs(): Map<string, TradingPair> {
  if (!tradingPairsMap) {
    tradingPairsMap = buildTradingPairs();
  }
  return tradingPairsMap;
}

// Get pair by ID string (e.g., "SAGE_STRK")
export function getTradingPairById(id: string): TradingPair | undefined {
  return getTradingPairs().get(id);
}

// Get pair by on-chain pair ID
export function getTradingPairByPairId(pairId: number): TradingPair | undefined {
  const pairs = getTradingPairs();
  for (const pair of pairs.values()) {
    if (pair.pairId === pairId) {
      return pair;
    }
  }
  return undefined;
}

// Get all active trading pairs
export function getActiveTradingPairs(): TradingPair[] {
  return Array.from(getTradingPairs().values()).filter((p) => p.isActive);
}

// Get all trading pairs
export function getAllTradingPairs(): TradingPair[] {
  return Array.from(getTradingPairs().values());
}

// Map pair ID string to on-chain numeric ID
export function getPairNumericId(pairId: string): number {
  const pair = getTradingPairById(pairId);
  return pair?.pairId ?? 0;
}

// Hook to get trading pair info
export function useTradingPair(pairId: string) {
  return useMemo(() => getTradingPairById(pairId), [pairId]);
}

// Hook to get all active pairs
export function useActiveTradingPairs() {
  return useMemo(() => getActiveTradingPairs(), []);
}

// Format price for display using quote decimals
export function formatPrice(price: bigint | string | number, pair: TradingPair): string {
  const numPrice = typeof price === "bigint"
    ? Number(price) / Math.pow(10, pair.quote.decimals)
    : typeof price === "string"
    ? parseFloat(price) / Math.pow(10, pair.quote.decimals)
    : price / Math.pow(10, pair.quote.decimals);

  // Show more precision for small values
  if (numPrice < 0.0001 && numPrice > 0) {
    return numPrice.toFixed(8);
  }
  if (numPrice < 1) {
    return numPrice.toFixed(6);
  }
  return numPrice.toFixed(4);
}

// Format amount for display using base decimals
export function formatAmount(amount: bigint | string | number, pair: TradingPair): string {
  const numAmount = typeof amount === "bigint"
    ? Number(amount) / Math.pow(10, pair.base.decimals)
    : typeof amount === "string"
    ? parseFloat(amount) / Math.pow(10, pair.base.decimals)
    : amount / Math.pow(10, pair.base.decimals);

  if (numAmount >= 1000000) {
    return `${(numAmount / 1000000).toFixed(2)}M`;
  }
  if (numAmount >= 1000) {
    return `${(numAmount / 1000).toFixed(2)}K`;
  }
  return numAmount.toFixed(2);
}

// Parse price string to bigint using quote decimals
export function parsePrice(priceStr: string, pair: TradingPair): bigint {
  const cleanPrice = priceStr.replace(/,/g, "").trim();
  if (!cleanPrice || cleanPrice === ".") return 0n;

  const numPrice = parseFloat(cleanPrice);
  if (isNaN(numPrice) || !isFinite(numPrice) || numPrice < 0) return 0n;

  // Use string manipulation for precision
  const [intPart, decPart = ""] = cleanPrice.split(".");
  const paddedDecimal = decPart.padEnd(pair.quote.decimals, "0").slice(0, pair.quote.decimals);
  const fullAmount = intPart + paddedDecimal;

  try {
    return BigInt(fullAmount);
  } catch {
    return 0n;
  }
}

// Parse amount string to bigint using base decimals
export function parseAmount(amountStr: string, pair: TradingPair): bigint {
  const cleanAmount = amountStr.replace(/,/g, "").trim();
  if (!cleanAmount || cleanAmount === ".") return 0n;

  const numAmount = parseFloat(cleanAmount);
  if (isNaN(numAmount) || !isFinite(numAmount) || numAmount < 0) return 0n;

  const [intPart, decPart = ""] = cleanAmount.split(".");
  const paddedDecimal = decPart.padEnd(pair.base.decimals, "0").slice(0, pair.base.decimals);
  const fullAmount = intPart + paddedDecimal;

  try {
    return BigInt(fullAmount);
  } catch {
    return 0n;
  }
}

// Calculate total in quote token (price * amount)
export function calculateTotal(priceWei: bigint, amountWei: bigint, pair: TradingPair): bigint {
  if (priceWei === 0n || amountWei === 0n) return 0n;
  // total = (price * amount) / 10^base_decimals
  return (priceWei * amountWei) / BigInt(10 ** pair.base.decimals);
}

// Calculate fee in quote token
export function calculateFee(totalWei: bigint, feeBps: number): bigint {
  return (totalWei * BigInt(feeBps)) / 10000n;
}

// Validate price is multiple of tick size
export function isValidTickSize(priceWei: bigint, pair: TradingPair): boolean {
  if (priceWei === 0n) return false;
  return priceWei % pair.tickSize === 0n;
}

// Validate amount meets minimum order size
export function isValidOrderSize(amountWei: bigint, pair: TradingPair): boolean {
  return amountWei >= pair.minOrderSize;
}

// Get estimated market price (for market orders)
// Returns a conservative price estimate to ensure sufficient approval
export function getEstimatedMarketPrice(pair: TradingPair): bigint {
  // Use 2x the typical best_ask to provide buffer for slippage and price movement
  // The PlaceOrder component adds another 50% buffer on top of this
  if (pair.id === "SAGE_STRK") {
    return 200000000000000000n; // 0.20 STRK (18 decimals) - 2x the 0.10 best_ask
  }
  if (pair.id === "SAGE_USDC") {
    return 200000n; // 0.20 USDC (6 decimals)
  }
  if (pair.id === "SAGE_ETH") {
    return 100000000000000n; // 0.0001 ETH
  }
  return 0n;
}
