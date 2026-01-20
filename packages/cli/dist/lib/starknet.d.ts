/**
 * Starknet Integration
 *
 * Handles wallet operations and contract interactions
 */
import { Account, RpcProvider } from "starknet";
export interface StarknetClient {
    provider: RpcProvider;
    account: Account | null;
    addresses: Record<string, string>;
}
/**
 * Initialize Starknet client
 */
export declare function initStarknet(privateKey?: string): StarknetClient;
/**
 * Get SAGE token balance
 */
export declare function getSageBalance(client: StarknetClient, address: string): Promise<bigint>;
/**
 * Claim from faucet
 */
export declare function claimFromFaucet(client: StarknetClient): Promise<string>;
/**
 * Register as validator
 */
export declare function registerValidator(client: StarknetClient, stakeAmount: bigint, commissionBps?: number, attestationHash?: string): Promise<string>;
/**
 * Add stake to validator
 */
export declare function addStake(client: StarknetClient, amount: bigint): Promise<string>;
/**
 * Remove stake from validator
 */
export declare function removeStake(client: StarknetClient, amount: bigint): Promise<string>;
/**
 * Get validator info
 */
export declare function getValidatorInfo(client: StarknetClient, address: string): Promise<Record<string, unknown> | null>;
/**
 * Check if address is active validator
 */
export declare function isActiveValidator(client: StarknetClient, address: string): Promise<boolean>;
/**
 * Get network stats
 */
export declare function getNetworkStats(client: StarknetClient): Promise<Record<string, unknown> | null>;
/**
 * Wait for transaction confirmation
 */
export declare function waitForTransaction(client: StarknetClient, txHash: string): Promise<boolean>;
//# sourceMappingURL=starknet.d.ts.map