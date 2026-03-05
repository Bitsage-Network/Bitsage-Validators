// Contract addresses for BitSage Network
// Deployed to Starknet Sepolia - Last updated 2025-12-31
// ALL 37 CONTRACTS DEPLOYED WITH CORRECT OWNER
// Owner/Deployer: 0x0759a4374389b0e3cfcc59d49310b6bc75bb12bbf8ce550eb5c2f026918bb344

export const CONTRACTS = {
  // Local Devnet - For development and testing
  // NOTE: These addresses change on every devnet restart (state is not persisted)
  // Last deployed: 2025-12-30
  devnet: {
    // Core Token
    SAGE_TOKEN: "0x049877d762b2cf79f808b59b5fbdc872c9c02a4a11a593412823b1f1d507e874",

    // Staking & Validation
    STAKING: "0x0605ca31565dc2993180032b98d45c9443a19f22bbbac7e8cff754d99c559ac5", // ProverStaking
    WORKER_STAKING: "0x0", // Not deployed yet
    VALIDATOR_REGISTRY: "0x02dbffc7e794142344eaa69914a8070fe2ea90c67fd39fd773f6c657faf5e433",

    // Jobs & Workers
    JOB_MANAGER: "0x0", // Not deployed yet
    CDC_POOL: "0x0", // Not deployed yet
    REPUTATION: "0x0", // Not deployed yet

    // Payments
    PAYMENT_ROUTER: "0x0",
    PROOF_GATED_PAYMENT: "0x0",
    METERED_BILLING: "0x0",
    ESCROW: "0x0",
    FEE_MANAGER: "0x0",

    // Proofs & Verification
    PROOF_VERIFIER: "0x0",
    STWO_VERIFIER: "0x0",
    OPTIMISTIC_TEE: "0x0",
    FRAUD_PROOF: "0x0",

    // Privacy (Obelysk) - Not deployed yet
    PRIVACY_ROUTER: "0x0",
    PROVER_REGISTRY: "0x0",
    WORKER_PRIVACY: "0x0",

    // Utility
    FAUCET: "0x02b4a1ea9b1fc310fa4e8bf5b18c0bb893f6b6a1a365ddf2d1eaf36d68bf4b5d",
    GAMIFICATION: "0x0",
    COLLATERAL: "0x0",

    // Governance & Treasury
    GOVERNANCE_TREASURY: "0x0",
    TREASURY_TIMELOCK: "0x0",
    BURN_MANAGER: "0x0",

    // Vesting
    REWARD_VESTING: "0x0",
    LINEAR_VESTING: "0x0",
    MILESTONE_VESTING: "0x0",

    // Oracle
    ORACLE_WRAPPER: "0x0",

    // NEW contracts (added 2025-12-31)
    OTC_ORDERBOOK: "0x0",
    PRIVACY_POOLS: "0x0",
    CONFIDENTIAL_SWAP: "0x0",
    MIXING_ROUTER: "0x0",
    STEGANOGRAPHIC_ROUTER: "0x0",
    REFERRAL_SYSTEM: "0x0",
    ADDRESS_REGISTRY: "0x0",
    DYNAMIC_PRICING: "0x0",

    // Session Management (Wallet-Agnostic AA)
    SESSION_MANAGER: "0x0",
  },

  // Sepolia Testnet - ALL 37 CONTRACTS DEPLOYED
  // Redeployed 2025-12-31 with correct owner
  // Owner: 0x0759a4374389b0e3cfcc59d49310b6bc75bb12bbf8ce550eb5c2f026918bb344
  sepolia: {
    // Core Token
    SAGE_TOKEN: "0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850",

    // Staking & Validation
    STAKING: "0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b", // ProverStaking
    WORKER_STAKING: "0x28caa5962266f2bf9320607da6466145489fed9dae8e346473ba1e847437613",
    VALIDATOR_REGISTRY: "0x431a8b6afb9b6f3ffa2fa9e58519b64dbe9eb53c6ac8fb69d3dcb8b9b92f5d9",

    // Jobs & Workers
    JOB_MANAGER: "0x355b8c5e9dd3310a3c361559b53cfcfdc20b2bf7d5bd87a84a83389b8cbb8d3",
    CDC_POOL: "0x1f978cad424f87a6cea8aa27cbcbba10b9a50d41e296ae07e1c635392a2339",
    REPUTATION: "0x4ef80990256fb016381f57c340a306e37376c1de70fa11147a4f1fc57a834de",

    // Payments
    PAYMENT_ROUTER: "0x6a0639e673febf90b6a6e7d3743c81f96b39a3037b60429d479c62c5d20d41",
    PROOF_GATED_PAYMENT: "0x7e74d191b1cca7cac00adc03bc64eaa6236b81001f50c61d1d70ec4bfde8af0",
    METERED_BILLING: "0x1adb19d21f28f56ae9a8852d19f2e2af728764846d30002da8782d571ae01b2",
    ESCROW: "0x7d7b5aa04b8eec7676568c8b55acd5682b8f7cb051f69c1876f0e5a6d8edfd4",
    FEE_MANAGER: "0x74344374490948307360e6a8376d656190773115a4fca4d049366cea7edde39",

    // Proofs & Verification
    PROOF_VERIFIER: "0x17ada59ab642b53e6620ef2026f21eb3f2d1a338d6e85cb61d5bcd8dfbebc8b",
    STWO_VERIFIER: "0x52963fe2f1d2d2545cbe18b8230b739c8861ae726dc7b6f0202cc17a369bd7d",
    OPTIMISTIC_TEE: "0x4238502196d7dab552e2af5d15219c8227c9f4dc69f0df1fa2ca9f8cb29eb33",
    FRAUD_PROOF: "0x5d5bc1565e4df7c61c811b0c494f1345fc0f964e154e57e829c727990116b50",

    // Privacy (Obelysk)
    PRIVACY_ROUTER: "0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53",
    PROVER_REGISTRY: "0x34a02ecafacfa81be6d23ad5b5e061e92c2b8884cfb388f95b57122a492b3e9",
    WORKER_PRIVACY: "0x1ce38bdbf4b036a31f9313282783b1d1f19cc3942512029e17bb817a87953c",

    // Utility
    FAUCET: "0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3",
    GAMIFICATION: "0x3beb685db6a20804ee0939948cee05c42de655b6b78a93e1e773447ce981cde",
    COLLATERAL: "0x4f5405d65d93afb71743e5ac20e4d9ef2667f256f08e61de734992ebd58603",

    // Governance & Treasury
    GOVERNANCE_TREASURY: "0xdf4c3ced8c8eafe33532965fe29081e6f94fb7d54bc976721985c647a7ef92",
    TREASURY_TIMELOCK: "0x4cc9603d7e72469de22aa84d9ac20ddcbaa7309d7eb091f75cd7f7a9e087947",
    BURN_MANAGER: "0x69eb2419e6eee4ed8a9031f2371f0d9682b91f7c5fb6e0823c48b6c725d6a4",

    // Vesting
    REWARD_VESTING: "0x52e086edb779dbe2a9bb2989be63e8847a791cb1628ad5b81e73d6c6f448016",
    LINEAR_VESTING: "0xc0e5f7a55aca4656f3cc76c7e9db0982ada98cd52a71c2062335b3cdc89d35",
    MILESTONE_VESTING: "0xdfd25e74636e4000c6410dc097b008461989b66322cbeb703159e5a99ba16a",

    // Oracle
    ORACLE_WRAPPER: "0x4d86bb472cb462a45d68a705a798b5e419359a5758d84b24af4bbe5441b6e5a",

    // OTC Trading
    OTC_ORDERBOOK: "0x7b2b59d93764ccf1ea85edca2720c37bba7742d05a2791175982eaa59cedef0",

    // Privacy (Additional)
    PRIVACY_POOLS: "0xd85ad03dcd91a075bef0f4226149cb7e43da795d2c1d33e3227c68bfbb78a7",
    CONFIDENTIAL_SWAP: "0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af",
    MIXING_ROUTER: "0x4a4e05233271f5203791321f2ba92b2de73ad051f788e7b605f204b5a43b8d1",
    STEGANOGRAPHIC_ROUTER: "0x47ab97833df3f77d807a4699ca0f0245d533a4d9e0664f809a04cee3ec720dc",

    // Growth
    REFERRAL_SYSTEM: "0x1d400338a38fca24e67c113bcecac4875ec1b85a00b14e4e541ed224fee59e4",

    // Registry
    ADDRESS_REGISTRY: "0x78f99c76731eb0d8d7a6102855772d8560bff91a1f71b59ff0571dfa7ee54c6",
    DYNAMIC_PRICING: "0x28881df510544345d29e12701b6b6366441219364849a43d3443f37583bc0df",

    // Session Management (Wallet-Agnostic AA)
    // Redeployed 2025-12-31 with upgradability
    // Class hash: 0x05e7b97b3eb3045c07c27993d20a1be6b11e0d86f9f0fce320523ce1d342324b
    SESSION_MANAGER: "0x058aac71e4ac202c6d89bce205eca6669c4d2c4d37d67a87e72cf435a077601e",
  },
  // Mainnet - Not yet deployed
  mainnet: {
    SAGE_TOKEN: "0x0",
    STAKING: "0x0",
    WORKER_STAKING: "0x0",
    VALIDATOR_REGISTRY: "0x0",
    JOB_MANAGER: "0x0",
    CDC_POOL: "0x0",
    REPUTATION: "0x0",
    PAYMENT_ROUTER: "0x0",
    PROOF_GATED_PAYMENT: "0x0",
    METERED_BILLING: "0x0",
    ESCROW: "0x0",
    FEE_MANAGER: "0x0",
    PROOF_VERIFIER: "0x0",
    STWO_VERIFIER: "0x0",
    OPTIMISTIC_TEE: "0x0",
    FRAUD_PROOF: "0x0",
    PRIVACY_ROUTER: "0x0",
    PROVER_REGISTRY: "0x0",
    WORKER_PRIVACY: "0x0",
    FAUCET: "0x0",
    GAMIFICATION: "0x0",
    COLLATERAL: "0x0",
    GOVERNANCE_TREASURY: "0x0",
    TREASURY_TIMELOCK: "0x0",
    BURN_MANAGER: "0x0",
    REWARD_VESTING: "0x0",
    LINEAR_VESTING: "0x0",
    MILESTONE_VESTING: "0x0",
    ORACLE_WRAPPER: "0x0",
    // NEW contracts (added 2025-12-31)
    OTC_ORDERBOOK: "0x0",
    PRIVACY_POOLS: "0x0",
    CONFIDENTIAL_SWAP: "0x0",
    MIXING_ROUTER: "0x0",
    STEGANOGRAPHIC_ROUTER: "0x0",
    REFERRAL_SYSTEM: "0x0",
    ADDRESS_REGISTRY: "0x0",
    DYNAMIC_PRICING: "0x0",

    // Session Management (Wallet-Agnostic AA)
    SESSION_MANAGER: "0x0",
  },
} as const;

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
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo",
    explorerUrl: "https://sepolia.starkscan.co",
  },
  mainnet: {
    chainId: "0x534e5f4d41494e", // SN_MAIN
    name: "Starknet Mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/demo",
    explorerUrl: "https://starkscan.co",
  },
};

// Current network from env
export const CURRENT_NETWORK = (process.env.NEXT_PUBLIC_STARKNET_NETWORK || "sepolia") as keyof typeof NETWORK_CONFIG;

// Get explorer URL for current network
export function getExplorerUrl(path?: string): string {
  const base = NETWORK_CONFIG[CURRENT_NETWORK]?.explorerUrl || NETWORK_CONFIG.sepolia.explorerUrl;
  return path ? `${base}/${path}` : base;
}

// External links
export const EXTERNAL_LINKS = {
  starkgate: "https://starkgate.starknet.io",
  avnu: "https://app.avnu.fi",
  starkscan: NETWORK_CONFIG[CURRENT_NETWORK]?.explorerUrl || NETWORK_CONFIG.sepolia.explorerUrl,
  docs: "https://docs.bitsage.network",
  discord: "https://discord.gg/bitsage",
  twitter: "https://twitter.com/bitsage",
  github: "https://github.com/bitsage-network",
};
