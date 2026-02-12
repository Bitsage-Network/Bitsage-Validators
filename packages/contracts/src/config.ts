// Token decimals
export const SAGE_DECIMALS = 18;

// Faucet configuration - Testnet settings (updated 2025-12-31)
// 20 SAGE per claim, 24 hour cooldown
// Faucet balance: ~11,000 SAGE (supports ~550 claims)
export const FAUCET_CONFIG = {
  // Base amounts (testnet - generous for testing)
  baseAmount: "20", // 20 SAGE per request
  socialTaskReward: "10", // 10 SAGE per social task (optional)

  // Cooldowns
  cooldown: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  socialTaskCooldown: 7 * 24 * 60 * 60 * 1000, // 7 days for social tasks

  // Anti-bot protection
  maxRequestsPerIP: 5, // Max 5 requests per IP per day
  requireHumanVerification: true, // CAPTCHA/proof-of-humanity required

  // Faucet contract info
  contractAddress: "0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3",
  maxDripAmount: 100, // Max possible drip (contract limit)
};

// Staking configuration
export const STAKING_CONFIG = {
  minStake: "100", // Minimum 100 SAGE
  lockPeriod: 7 * 24 * 60 * 60, // 7 days in seconds
  tiers: [
    { name: "Bronze", min: 100, max: 999, apr: 18 },
    { name: "Silver", min: 1000, max: 4999, apr: 21 },
    { name: "Gold", min: 5000, max: 24999, apr: 24 },
    { name: "Diamond", min: 25000, max: Infinity, apr: 30 },
  ],
};

// Network configuration
export const NETWORK_CONFIG = {
  devnet: {
    chainId: "0x534e5f5345504f4c4941", // Uses Sepolia chain ID for compatibility
    name: "Local Devnet",
    rpcUrl: "http://localhost:5050",
    explorerUrl: "", // No explorer for local devnet
  },
  sepolia: {
    chainId: "0x534e5f5345504f4c4941", // SN_SEPOLIA
    name: "Starknet Sepolia",
    rpcUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo",
    explorerUrl: "https://sepolia.starkscan.co",
  },
  mainnet: {
    chainId: "0x534e5f4d41494e", // SN_MAIN
    name: "Starknet Mainnet",
    rpcUrl: "https://starknet-mainnet.public.blastapi.io",
    explorerUrl: "https://starkscan.co",
  },
};

// External links
export const EXTERNAL_LINKS = {
  starkgate: "https://starkgate.starknet.io",
  avnu: "https://app.avnu.fi",
  starkscan: "https://sepolia.starkscan.co",
  docs: "https://docs.bitsage.network",
  discord: "https://discord.gg/bitsage",
  twitter: "https://twitter.com/bitsage",
  github: "https://github.com/bitsage-network",
};

// App URLs for cross-app linking
export const APP_URLS = {
  validator: "https://validator.bitsage.network",
  obelysk: "https://obelysk.bitsage.network",
  governance: "https://governance.bitsage.network",
  faucet: "https://faucet.bitsage.network",
};

// Cookie configuration for shared session
export const SESSION_CONFIG = {
  cookieDomain: ".bitsage.network",
  cookieName: "wallet-verified",
  sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
};
