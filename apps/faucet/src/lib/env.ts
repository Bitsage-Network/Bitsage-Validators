/**
 * Environment Variable Validation
 *
 * Validates required environment variables at startup and provides
 * typed access to configuration values.
 *
 * NOTE: Next.js statically replaces process.env.NEXT_PUBLIC_* at build time.
 * Dynamic access like process.env[variable] does NOT work on the client.
 * We must use explicit static access for all environment variables.
 */

// Static access to all NEXT_PUBLIC environment variables
// Next.js inlines these at build time
const ENV_VALUES = {
  NEXT_PUBLIC_STARKNET_NETWORK: process.env.NEXT_PUBLIC_STARKNET_NETWORK,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_SAGE_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_SAGE_TOKEN_ADDRESS,
  NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS: process.env.NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS,
  NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS: process.env.NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS,
  NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS: process.env.NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS,
  NEXT_PUBLIC_FAUCET_ADDRESS: process.env.NEXT_PUBLIC_FAUCET_ADDRESS,
  NEXT_PUBLIC_DEVNET_SAGE_TOKEN: process.env.NEXT_PUBLIC_DEVNET_SAGE_TOKEN,
  NEXT_PUBLIC_DEVNET_MOCK_USDC: process.env.NEXT_PUBLIC_DEVNET_MOCK_USDC,
  NEXT_PUBLIC_DEVNET_MOCK_STRK: process.env.NEXT_PUBLIC_DEVNET_MOCK_STRK,
  NEXT_PUBLIC_DEVNET_MOCK_WBTC: process.env.NEXT_PUBLIC_DEVNET_MOCK_WBTC,
  NEXT_PUBLIC_DEVNET_OTC_ORDERBOOK: process.env.NEXT_PUBLIC_DEVNET_OTC_ORDERBOOK,
  NEXT_PUBLIC_DEVNET_PRIVACY_POOLS: process.env.NEXT_PUBLIC_DEVNET_PRIVACY_POOLS,
  NEXT_PUBLIC_DEVNET_CONFIDENTIAL_SWAP: process.env.NEXT_PUBLIC_DEVNET_CONFIDENTIAL_SWAP,
  NEXT_PUBLIC_DEVNET_FAUCET: process.env.NEXT_PUBLIC_DEVNET_FAUCET,
} as const;

// Helper to get env value (uses pre-loaded static values)
function getEnv(key: keyof typeof ENV_VALUES): string | undefined {
  return ENV_VALUES[key];
}

// Required environment variables
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_STARKNET_NETWORK',
  'NEXT_PUBLIC_RPC_URL',
] as const;

// Optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  NEXT_PUBLIC_API_URL: 'http://localhost:3030',
  NEXT_PUBLIC_WS_URL: 'ws://localhost:3030/ws/prover',
} as const;

// Contract address environment variables - required for production, optional for devnet
const CONTRACT_ENV_VARS = [
  'NEXT_PUBLIC_SAGE_TOKEN_ADDRESS',
  'NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS',
  'NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS',
  'NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS',
  'NEXT_PUBLIC_FAUCET_ADDRESS',
] as const;

// Devnet-specific contract addresses
const DEVNET_CONTRACT_ENV_VARS = [
  'NEXT_PUBLIC_DEVNET_SAGE_TOKEN',
  'NEXT_PUBLIC_DEVNET_MOCK_USDC',
  'NEXT_PUBLIC_DEVNET_MOCK_STRK',
  'NEXT_PUBLIC_DEVNET_MOCK_WBTC',
  'NEXT_PUBLIC_DEVNET_OTC_ORDERBOOK',
  'NEXT_PUBLIC_DEVNET_PRIVACY_POOLS',
  'NEXT_PUBLIC_DEVNET_CONFIDENTIAL_SWAP',
  'NEXT_PUBLIC_DEVNET_FAUCET',
] as const;

type StarknetNetwork = 'devnet' | 'sepolia' | 'mainnet' | 'local';

interface EnvConfig {
  // Network configuration
  network: StarknetNetwork;
  rpcUrl: string;
  apiUrl: string;
  wsUrl: string;

  // Contract addresses (depend on network)
  contracts: {
    sageToken: string;
    otcOrderbook: string;
    privacyPools: string;
    confidentialSwap: string;
    faucet: string;
  };

  // Feature flags
  isDevnet: boolean;
  isProduction: boolean;
}

class EnvValidationError extends Error {
  constructor(
    message: string,
    public missingVars: string[]
  ) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates that all required environment variables are set
 */
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const network = getEnv('NEXT_PUBLIC_STARKNET_NETWORK') as StarknetNetwork | undefined;

  // Check required vars using static access
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!getEnv(envVar as keyof typeof ENV_VALUES)) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }

  // For production networks, check contract addresses
  if (network === 'sepolia' || network === 'mainnet') {
    for (const envVar of CONTRACT_ENV_VARS) {
      const value = getEnv(envVar as keyof typeof ENV_VALUES);
      if (!value || value === '0x0') {
        errors.push(`Missing or invalid contract address: ${envVar}`);
      }
    }
  }

  // For devnet, check devnet-specific addresses
  if (network === 'devnet' || network === 'local') {
    const devnetErrors: string[] = [];
    for (const envVar of DEVNET_CONTRACT_ENV_VARS) {
      const value = getEnv(envVar as keyof typeof ENV_VALUES);
      if (!value || value === '0x0') {
        devnetErrors.push(envVar);
      }
    }
    // Only warn for devnet, don't fail
    if (devnetErrors.length > 0) {
      console.warn(`[ENV] Devnet contract addresses not set: ${devnetErrors.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Gets the validated environment configuration
 * Throws if required variables are missing
 */
export function getEnvConfig(): EnvConfig {
  const { valid, errors } = validateEnv();

  if (!valid && process.env.NODE_ENV === 'production') {
    throw new EnvValidationError(
      `Environment validation failed:\n${errors.join('\n')}`,
      errors
    );
  }

  // Log warnings in development
  if (!valid && process.env.NODE_ENV === 'development') {
    console.warn('[ENV] Environment validation warnings:', errors);
  }

  const network = (getEnv('NEXT_PUBLIC_STARKNET_NETWORK') || 'sepolia') as StarknetNetwork;
  const isDevnet = network === 'devnet' || network === 'local';

  return {
    network,
    rpcUrl: getEnv('NEXT_PUBLIC_RPC_URL') || 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo',
    apiUrl: getEnv('NEXT_PUBLIC_API_URL') || OPTIONAL_ENV_VARS.NEXT_PUBLIC_API_URL,
    wsUrl: getEnv('NEXT_PUBLIC_WS_URL') || OPTIONAL_ENV_VARS.NEXT_PUBLIC_WS_URL,

    contracts: isDevnet
      ? {
          sageToken: getEnv('NEXT_PUBLIC_DEVNET_SAGE_TOKEN') || '0x0',
          otcOrderbook: getEnv('NEXT_PUBLIC_DEVNET_OTC_ORDERBOOK') || '0x0',
          privacyPools: getEnv('NEXT_PUBLIC_DEVNET_PRIVACY_POOLS') || '0x0',
          confidentialSwap: getEnv('NEXT_PUBLIC_DEVNET_CONFIDENTIAL_SWAP') || '0x0',
          faucet: getEnv('NEXT_PUBLIC_DEVNET_FAUCET') || '0x0',
        }
      : {
          sageToken: getEnv('NEXT_PUBLIC_SAGE_TOKEN_ADDRESS') || '0x0',
          otcOrderbook: getEnv('NEXT_PUBLIC_OTC_ORDERBOOK_ADDRESS') || '0x0',
          privacyPools: getEnv('NEXT_PUBLIC_PRIVACY_POOLS_ADDRESS') || '0x0',
          confidentialSwap: getEnv('NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS') || '0x0',
          faucet: getEnv('NEXT_PUBLIC_FAUCET_ADDRESS') || '0x0',
        },

    isDevnet,
    isProduction: process.env.NODE_ENV === 'production',
  };
}

/**
 * Hook-safe environment config getter
 * Returns config or undefined if validation fails
 */
export function getEnvConfigSafe(): EnvConfig | null {
  try {
    return getEnvConfig();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error('[ENV] Configuration error:', error.missingVars);
    }
    return null;
  }
}

/**
 * Checks if the app is running in a valid environment
 */
export function isEnvValid(): boolean {
  const { valid } = validateEnv();
  return valid;
}

/**
 * Gets a specific environment variable with type safety
 * NOTE: Only works for keys in ENV_VALUES (NEXT_PUBLIC_* vars)
 */
export function getEnvVar<T extends string>(
  key: keyof typeof ENV_VALUES,
  defaultValue?: T
): T | undefined {
  const value = getEnv(key) as T | undefined;
  return value || defaultValue;
}

// Track if we've already logged the config (prevents React Strict Mode double-logging)
let _hasLoggedConfig = false;

/**
 * Logs environment configuration (sanitized for security)
 * Only logs in development mode, only once per session
 */
export function logEnvConfig(): void {
  // Skip logging in production or if already logged
  if (process.env.NODE_ENV === 'production') return;
  if (_hasLoggedConfig) return;
  _hasLoggedConfig = true;

  const config = getEnvConfigSafe();
  if (!config) {
    console.error('[ENV] Failed to load configuration');
    return;
  }

  console.log('[ENV] Configuration loaded:', {
    network: config.network,
    apiUrl: config.apiUrl,
    wsUrl: config.wsUrl,
    rpcUrl: config.rpcUrl.slice(0, 30) + '...',
    isDevnet: config.isDevnet,
    isProduction: config.isProduction,
    contractsConfigured: Object.values(config.contracts).every(
      (addr) => addr && addr !== '0x0'
    ),
  });
}

// Export singleton config
let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = getEnvConfig();
  }
  return _config;
}

// Validate on module load (will log warnings in development)
if (typeof window !== 'undefined') {
  // Client-side: validate and log
  const { valid, errors } = validateEnv();
  if (!valid) {
    console.warn('[ENV] Missing environment variables:', errors);
  }
}
