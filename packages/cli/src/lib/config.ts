/**
 * Configuration Management
 *
 * Handles reading/writing the BitSage config file (~/.bitsage/config.yaml)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import YAML from "yaml";

export interface GPUConfig {
  autoDetect: boolean;
  tier: number;
  vramGb: number;
  type: "cuda" | "metal" | "cpu";
  devices: string[];
}

export interface WalletConfig {
  address: string;
  keystorePath?: string;
  privateKey?: string; // Only used for initial setup, prefer keystore
}

export interface ValidatorConfig {
  operatorAddress: string;
  commissionBps: number;
  attestationHash: string;
}

export interface ServicesConfig {
  coordinator: {
    port: number;
    workers: number;
  };
  dashboard: {
    port: number;
    enabled: boolean;
  };
}

export interface TEEConfig {
  enabled: boolean;
  type: "sgx" | "tdx" | "sev" | null;
}

export interface BitSageConfig {
  network: "sepolia" | "mainnet" | "devnet";
  rpcUrl: string;
  wsUrl: string;
  wallet: WalletConfig;
  validator: ValidatorConfig;
  gpu: GPUConfig;
  tee: TEEConfig;
  services: ServicesConfig;
}

const DEFAULT_CONFIG: BitSageConfig = {
  network: "sepolia",
  rpcUrl: "https://starknet-sepolia.public.blastapi.io",
  wsUrl: "wss://starknet-sepolia.public.blastapi.io",
  wallet: {
    address: "",
    keystorePath: "",
  },
  validator: {
    operatorAddress: "",
    commissionBps: 500,
    attestationHash: "0",
  },
  gpu: {
    autoDetect: true,
    tier: 0,
    vramGb: 0,
    type: "cpu",
    devices: ["0"],
  },
  tee: {
    enabled: false,
    type: null,
  },
  services: {
    coordinator: {
      port: 3030,
      workers: 4,
    },
    dashboard: {
      port: 3000,
      enabled: true,
    },
  },
};

export const CONFIG_DIR = path.join(os.homedir(), ".bitsage");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.yaml");
export const KEYSTORE_PATH = path.join(CONFIG_DIR, "keystore.json");

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load config from file
 */
export function loadConfig(): BitSageConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    const loaded = YAML.parse(content) as Partial<BitSageConfig>;
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch (error) {
    console.warn("Failed to load config, using defaults");
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to file
 */
export function saveConfig(config: BitSageConfig): void {
  ensureConfigDir();

  // Don't save private key in plain text
  const sanitized = { ...config };
  if (sanitized.wallet.privateKey) {
    delete sanitized.wallet.privateKey;
  }

  const content = YAML.stringify(sanitized);
  fs.writeFileSync(CONFIG_PATH, content, { mode: 0o600 });
}

/**
 * Update specific config values
 */
export function updateConfig(updates: Partial<BitSageConfig>): BitSageConfig {
  const current = loadConfig();
  const merged = deepMerge(
    current as unknown as Record<string, unknown>,
    updates as unknown as Record<string, unknown>
  ) as unknown as BitSageConfig;
  saveConfig(merged);
  return merged;
}

/**
 * Get contract addresses for network
 */
export function getContractAddresses(network: string): Record<string, string> {
  const addresses: Record<string, Record<string, string>> = {
    sepolia: {
      SAGE_TOKEN: "0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850",
      VALIDATOR_REGISTRY: "0x431a8b6afb9b6f3ffa2fa9e58519b64dbe9eb53c6ac8fb69d3dcb8b9b92f5d9",
      FAUCET: "0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3",
      JOB_MANAGER: "0x355b8c5e9dd3310a3c361559b53cfcfdc20b2bf7d5bd87a84a83389b8cbb8d3",
      STAKING: "0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b",
    },
    mainnet: {
      // Mainnet addresses will be added later
      SAGE_TOKEN: "",
      VALIDATOR_REGISTRY: "",
      FAUCET: "",
      JOB_MANAGER: "",
      STAKING: "",
    },
  };

  return addresses[network] || addresses.sepolia;
}

/**
 * Deep merge objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === "object" &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(
          (target[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}
