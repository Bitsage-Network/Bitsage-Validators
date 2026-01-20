// Trading pairs configuration
export const TRADING_PAIRS = [
  { id: "SAGE_STRK", base: "SAGE", quote: "STRK", decimals: { base: 18, quote: 18 } },
  { id: "SAGE_USDC", base: "SAGE", quote: "USDC", decimals: { base: 18, quote: 6 } },
  { id: "SAGE_ETH", base: "SAGE", quote: "ETH", decimals: { base: 18, quote: 18 } },
  { id: "STRK_USDC", base: "STRK", quote: "USDC", decimals: { base: 18, quote: 6 } },
];

export type TradingPair = typeof TRADING_PAIRS[number];
