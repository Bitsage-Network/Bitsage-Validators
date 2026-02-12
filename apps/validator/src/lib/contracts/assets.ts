// Multi-asset configuration for BitSage Network
// Supports SAGE, USDC, STRK, wBTC, ETH
// Environment-aware: devnet, sepolia, mainnet

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
  color: string;
  contractAddress?: string;
  isNative?: boolean;
  coingeckoId?: string;
  isMock?: boolean; // True for devnet mock tokens
}

export type NetworkType = "devnet" | "sepolia" | "mainnet";

// Detect current network from environment
export function getCurrentNetwork(): NetworkType {
  const network = process.env.NEXT_PUBLIC_STARKNET_NETWORK;
  if (network === "mainnet") return "mainnet";
  if (network === "devnet" || network === "local") return "devnet";
  return "sepolia"; // Default to sepolia testnet
}

// =============================================================================
// Contract Addresses by Network
// =============================================================================

// Devnet addresses - populated after running deploy_phased_devnet.sh
// These will be updated automatically by the deployment script
const DEVNET_ADDRESSES = {
  // Core tokens - read from deployment output or env
  SAGE: process.env.NEXT_PUBLIC_DEVNET_SAGE_TOKEN || "0x0",
  USDC: process.env.NEXT_PUBLIC_DEVNET_MOCK_USDC || "0x0",
  STRK: process.env.NEXT_PUBLIC_DEVNET_MOCK_STRK || "0x0",
  wBTC: process.env.NEXT_PUBLIC_DEVNET_MOCK_WBTC || "0x0",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH is same on all networks

  // Trading contracts
  OTC_ORDERBOOK: process.env.NEXT_PUBLIC_DEVNET_OTC_ORDERBOOK || "0x0",
  PRIVACY_POOLS: process.env.NEXT_PUBLIC_DEVNET_PRIVACY_POOLS || "0x0",
  CONFIDENTIAL_SWAP: process.env.NEXT_PUBLIC_DEVNET_CONFIDENTIAL_SWAP || "0x0",
  FAUCET: process.env.NEXT_PUBLIC_DEVNET_FAUCET || "0x0",
};

// Starknet Sepolia testnet addresses
const SEPOLIA_ADDRESSES = {
  SAGE: process.env.NEXT_PUBLIC_SAGE_TOKEN_ADDRESS || "0x0",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  wBTC: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",

  // Trading contracts - TBD for sepolia
  OTC_ORDERBOOK: process.env.NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS || "0x0",
  PRIVACY_POOLS: process.env.NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS || "0x0",
  CONFIDENTIAL_SWAP: process.env.NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS || "0x0",
  FAUCET: process.env.NEXT_PUBLIC_FAUCET_ADDRESS || "0x0",
};

// Starknet Mainnet addresses
const MAINNET_ADDRESSES = {
  SAGE: process.env.NEXT_PUBLIC_MAINNET_SAGE_TOKEN || "0x0", // TBD - not deployed yet
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // Official USDC
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // Official STRK
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // Official ETH
  wBTC: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // Official wBTC

  // Trading contracts - TBD for mainnet
  OTC_ORDERBOOK: "0x0",
  PRIVACY_POOLS: "0x0",
  CONFIDENTIAL_SWAP: "0x0",
  FAUCET: "0x0", // No faucet on mainnet
};

// Get addresses for current network
function getAddresses() {
  const network = getCurrentNetwork();
  switch (network) {
    case "devnet":
      return DEVNET_ADDRESSES;
    case "mainnet":
      return MAINNET_ADDRESSES;
    default:
      return SEPOLIA_ADDRESSES;
  }
}

// =============================================================================
// Asset Definitions
// =============================================================================

function createAssets(): Asset[] {
  const addresses = getAddresses();
  const network = getCurrentNetwork();
  const isDevnet = network === "devnet";

  return [
    {
      id: "SAGE",
      name: "SAGE Token",
      symbol: "SAGE",
      decimals: 18,
      icon: "",
      color: "#8B5CF6", // purple-500
      contractAddress: addresses.SAGE,
      coingeckoId: "sage-token",
    },
    {
      id: "USDC",
      name: isDevnet ? "Mock USDC" : "USD Coin",
      symbol: "USDC",
      decimals: 6,
      icon: "",
      color: "#2775CA", // USDC blue
      contractAddress: addresses.USDC,
      coingeckoId: isDevnet ? undefined : "usd-coin",
      isMock: isDevnet,
    },
    {
      id: "STRK",
      name: isDevnet ? "Mock STRK" : "Starknet Token",
      symbol: "STRK",
      decimals: 18,
      icon: "",
      color: "#FF6B4A", // Starknet orange
      contractAddress: addresses.STRK,
      coingeckoId: isDevnet ? undefined : "starknet",
      isMock: isDevnet,
    },
    {
      id: "ETH",
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      icon: "",
      color: "#627EEA", // ETH purple
      contractAddress: addresses.ETH,
      isNative: true,
      coingeckoId: "ethereum",
    },
    {
      id: "wBTC",
      name: isDevnet ? "Mock wBTC" : "Wrapped Bitcoin",
      symbol: "wBTC",
      decimals: 8,
      icon: "",
      color: "#F7931A", // Bitcoin orange
      contractAddress: addresses.wBTC,
      coingeckoId: isDevnet ? undefined : "wrapped-bitcoin",
      isMock: isDevnet,
    },
  ];
}

// Export assets - computed once at module load
export const SUPPORTED_ASSETS: Asset[] = createAssets();

// =============================================================================
// Contract Address Getters
// =============================================================================

export function getContractAddresses() {
  return getAddresses();
}

export function getOTCOrderbookAddress(): string {
  return getAddresses().OTC_ORDERBOOK;
}

export function getPrivacyPoolsAddress(): string {
  return getAddresses().PRIVACY_POOLS;
}

export function getConfidentialSwapAddress(): string {
  return getAddresses().CONFIDENTIAL_SWAP;
}

export function getFaucetAddress(): string {
  return getAddresses().FAUCET;
}

// =============================================================================
// Helper Functions
// =============================================================================

export function getAssetById(id: string): Asset | undefined {
  return SUPPORTED_ASSETS.find((asset) => asset.id === id);
}

export function getAssetBySymbol(symbol: string): Asset | undefined {
  return SUPPORTED_ASSETS.find((asset) => asset.symbol === symbol);
}

export function getAssetByAddress(address: string): Asset | undefined {
  const normalizedAddress = address.toLowerCase();
  return SUPPORTED_ASSETS.find(
    (asset) => asset.contractAddress?.toLowerCase() === normalizedAddress
  );
}

/**
 * Formats a raw asset amount (in smallest units) to a human-readable string
 * @param amount - Raw amount in smallest units (wei for 18 decimal tokens)
 * @param asset - Asset configuration
 * @returns Formatted string with appropriate decimal places
 */
export function formatAssetAmount(amount: string | number | bigint, asset: Asset): string {
  const numAmount = typeof amount === "bigint" ? Number(amount) : Number(amount);

  // Validate input
  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return "0.00";
  }

  if (numAmount < 0) {
    return "0.00";
  }

  const formatted = numAmount / Math.pow(10, asset.decimals);

  // Format based on value size
  if (formatted >= 1000000) {
    return `${(formatted / 1000000).toFixed(2)}M`;
  }
  if (formatted >= 1000) {
    return `${(formatted / 1000).toFixed(2)}K`;
  }
  if (formatted < 0.01 && formatted > 0) {
    return formatted.toFixed(asset.decimals > 6 ? 6 : asset.decimals);
  }
  return formatted.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: asset.decimals > 4 ? 4 : asset.decimals,
  });
}

/**
 * Parses a human-readable amount string to raw asset units (bigint)
 * @param amount - Human-readable amount (e.g., "100.50")
 * @param asset - Asset configuration
 * @returns Amount in smallest units as bigint, or 0n for invalid input
 */
export function parseAssetAmount(amount: string, asset: Asset): bigint {
  if (!amount || typeof amount !== "string") {
    return 0n;
  }

  const cleanAmount = amount.replace(/,/g, "").trim();

  if (cleanAmount === "" || cleanAmount === ".") {
    return 0n;
  }

  const numAmount = parseFloat(cleanAmount);

  // Validate parsed number
  if (isNaN(numAmount) || !isFinite(numAmount) || numAmount < 0) {
    return 0n;
  }

  // Use string manipulation to avoid floating point precision issues
  const [intPart, decPart = ""] = cleanAmount.split(".");
  const paddedDecimal = decPart.padEnd(asset.decimals, "0").slice(0, asset.decimals);
  const fullAmount = intPart + paddedDecimal;

  try {
    return BigInt(fullAmount);
  } catch {
    return 0n;
  }
}

// Default asset for the platform
export const DEFAULT_ASSET = SUPPORTED_ASSETS[0]; // SAGE

// Asset pairs for trading
export const TRADING_PAIRS = [
  { base: "SAGE", quote: "USDC" },
  { base: "SAGE", quote: "STRK" },
  { base: "SAGE", quote: "ETH" },
  { base: "STRK", quote: "USDC" },
  { base: "ETH", quote: "USDC" },
];

// Assets available for privacy pools
export const PRIVACY_POOL_ASSETS = ["SAGE", "USDC", "STRK"];

// Assets available for staking rewards
export const STAKING_REWARD_ASSETS = ["SAGE", "USDC"];

// =============================================================================
// Network Status
// =============================================================================

export function isDevnetMode(): boolean {
  return getCurrentNetwork() === "devnet";
}

export function isMainnetMode(): boolean {
  return getCurrentNetwork() === "mainnet";
}

export function getNetworkDisplayName(): string {
  const network = getCurrentNetwork();
  switch (network) {
    case "devnet":
      return "Devnet (Local)";
    case "mainnet":
      return "Mainnet";
    default:
      return "Sepolia Testnet";
  }
}
