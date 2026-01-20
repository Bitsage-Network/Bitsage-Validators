/**
 * Configuration Management
 *
 * Handles reading/writing the BitSage config file (~/.bitsage/config.yaml)
 */
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
    privateKey?: string;
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
export declare const CONFIG_DIR: string;
export declare const CONFIG_PATH: string;
export declare const KEYSTORE_PATH: string;
/**
 * Ensure config directory exists
 */
export declare function ensureConfigDir(): void;
/**
 * Load config from file
 */
export declare function loadConfig(): BitSageConfig;
/**
 * Save config to file
 */
export declare function saveConfig(config: BitSageConfig): void;
/**
 * Update specific config values
 */
export declare function updateConfig(updates: Partial<BitSageConfig>): BitSageConfig;
/**
 * Get contract addresses for network
 */
export declare function getContractAddresses(network: string): Record<string, string>;
//# sourceMappingURL=config.d.ts.map