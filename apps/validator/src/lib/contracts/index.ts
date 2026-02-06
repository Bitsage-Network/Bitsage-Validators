// Contract client for BitSage Network
// Provides hooks and utilities for interacting with deployed contracts

import { useContract, useReadContract, useSendTransaction } from "@starknet-react/core";
import type { Abi, Call } from "starknet";
import { CONTRACTS } from "./addresses";

// Import ABIs
import SAGETokenAbi from "./abis/SAGEToken.json";
import ProverStakingAbi from "./abis/ProverStaking.json";
import FaucetAbi from "./abis/Faucet.json";
import ValidatorRegistryAbi from "./abis/ValidatorRegistry.json";
import PrivacyRouterAbi from "./abis/PrivacyRouter.json";
import OTCOrderbookAbi from "./abis/OTCOrderbook.json";
import PrivacyPoolsAbi from "./abis/PrivacyPools.json";
import JobManagerAbi from "./abis/JobManager.json";

// Type the ABIs
const ABIS = {
  sageToken: SAGETokenAbi as Abi,
  proverStaking: ProverStakingAbi as Abi,
  faucet: FaucetAbi as Abi,
  validatorRegistry: ValidatorRegistryAbi as Abi,
  privacyRouter: PrivacyRouterAbi as Abi,
  otcOrderbook: OTCOrderbookAbi as Abi,
  privacyPools: PrivacyPoolsAbi as Abi,
  jobManager: JobManagerAbi as Abi,
} as const;

// Network type
export type NetworkType = "devnet" | "sepolia" | "mainnet";

// Get current network contracts (default to sepolia)
export function getContractAddresses(network: NetworkType = "sepolia") {
  return CONTRACTS[network];
}

// ============================================
// SAGE Token Hooks
// ============================================

export function useSageTokenContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.SAGE_TOKEN,
    abi: ABIS.sageToken,
  });
}

export function useSageBalance(address: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.SAGE_TOKEN,
    abi: ABIS.sageToken,
    functionName: "balance_of",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

export function useSageAllowance(
  owner: string | undefined,
  spender: string,
  network: NetworkType = "sepolia"
) {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.SAGE_TOKEN,
    abi: ABIS.sageToken,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    enabled: !!owner,
  });
}

// ============================================
// Staking Hooks
// ============================================

export function useStakingContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.STAKING,
    abi: ABIS.proverStaking,
  });
}

export function useOnChainStakeInfo(workerAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.STAKING,
    abi: ABIS.proverStaking,
    functionName: "get_stake_info",
    args: workerAddress ? [workerAddress] : undefined,
    enabled: !!workerAddress,
  });
}

export function useOnChainStakingConfig(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.STAKING,
    abi: ABIS.proverStaking,
    functionName: "get_staking_config",
    args: [],
  });
}

export function useOnChainMinStake(gpuTier: number, hasTee: boolean, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.STAKING,
    abi: ABIS.proverStaking,
    functionName: "get_min_stake",
    args: [gpuTier, hasTee ? 1 : 0],
  });
}

// ============================================
// Faucet Hooks
// ============================================

export function useFaucetContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
  });
}

export function useCanClaim(userAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
    functionName: "can_claim",
    args: userAddress ? [userAddress] : undefined,
    enabled: !!userAddress,
  });
}

export function useTimeUntilClaim(userAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
    functionName: "time_until_claim",
    args: userAddress ? [userAddress] : undefined,
    enabled: !!userAddress,
  });
}

export function useClaimInfo(userAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
    functionName: "get_claim_info",
    args: userAddress ? [userAddress] : undefined,
    enabled: !!userAddress,
  });
}

export function useFaucetConfig(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
    functionName: "get_config",
    args: [],
  });
}

export function useFaucetStats(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.FAUCET,
    abi: ABIS.faucet,
    functionName: "get_stats",
    args: [],
  });
}

// ============================================
// Validator Registry Hooks
// ============================================

export function useValidatorRegistryContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
  });
}

export function useIsValidator(address: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "is_registered",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

export function useValidatorInfo(address: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "get_validator",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

export function useValidatorCount(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "get_validator_count",
    args: [],
  });
}

export function useValidatorStats(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "get_stats",
    args: [],
  });
}

export function useIsActiveValidator(address: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "is_active_validator",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

export function useActiveValidators(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "get_active_validators",
    args: [],
  });
}

export function useCurrentEpoch(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.VALIDATOR_REGISTRY,
    abi: ABIS.validatorRegistry,
    functionName: "get_current_epoch",
    args: [],
  });
}

// ============================================
// Privacy Router Hooks
// ============================================

export function usePrivacyRouterContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.PRIVACY_ROUTER,
    abi: ABIS.privacyRouter,
  });
}

export function useOnChainPrivateAccount(address: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_ROUTER,
    abi: ABIS.privacyRouter,
    functionName: "get_private_account",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

export function useOnChainEncryptedBalance(
  address: string | undefined,
  tokenId: bigint = 0n, // SAGE token ID
  network: NetworkType = "sepolia"
) {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_ROUTER,
    abi: ABIS.privacyRouter,
    functionName: "get_encrypted_balance",
    args: address ? [address, { low: tokenId, high: 0n }] : undefined,
    enabled: !!address,
  });
}

export function useIsPrivacyAccountRegistered(
  address: string | undefined,
  network: NetworkType = "sepolia"
) {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_ROUTER,
    abi: ABIS.privacyRouter,
    functionName: "is_registered",
    args: address ? [address] : undefined,
    enabled: !!address,
  });
}

// ============================================
// OTC Orderbook Hooks
// ============================================

export function useOTCOrderbookContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
  });
}

export function useOTCConfig(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_config",
    args: [],
  });
}

export function useOTCPairInfo(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_pair_info",
    args: [pairId],
  });
}

// Get best bid for a trading pair
export function useOTCBestBid(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_best_bid",
    args: [pairId],
  });
}

// Get best ask for a trading pair
export function useOTCBestAsk(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_best_ask",
    args: [pairId],
  });
}

// Combined hook to get orderbook (best bid + best ask)
export function useOTCOrderBook(pairId: number, network: NetworkType = "sepolia") {
  const { data: bestBid, isLoading: bidLoading, error: bidError } = useOTCBestBid(pairId, network);
  const { data: bestAsk, isLoading: askLoading, error: askError } = useOTCBestAsk(pairId, network);

  return {
    data: bestBid || bestAsk ? { bids: bestBid ? [bestBid] : [], asks: bestAsk ? [bestAsk] : [] } : null,
    isLoading: bidLoading || askLoading,
    error: bidError || askError,
  };
}

export function useOTCOrder(orderId: bigint, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_order",
    args: [{ low: orderId, high: 0n }],
    enabled: !!orderId,
  });
}

export function useOTCUserOrders(userAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_user_orders",
    args: userAddress ? [userAddress] : undefined,
    enabled: !!userAddress,
  });
}

/**
 * Get recent trades - NOTE: Contract only stores last trade, not history
 * This hook is kept for backwards compatibility but returns empty array
 * Use useOTCLastTrade for the most recent trade
 * @deprecated Use useOTCLastTrade instead
 */
export function useOTCRecentTrades(pairId: number, _limit: number = 20, _network: NetworkType = "sepolia") {
  // Contract doesn't have get_recent_trades - return empty data
  // Real-time trades come from WebSocket instead
  return {
    data: [] as never[],
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {}, // No-op since there's no real data to refetch
  };
}

/**
 * Get the last executed trade for a pair
 * Returns (price: u256, timestamp: u64)
 */
export function useOTCLastTrade(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_last_trade",
    args: [pairId],
  });
}

export function useOTCMarketStats(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_market_stats",
    args: [pairId],
  });
}

// ============================================
// Trustless Orderbook Hooks (Pure On-Chain)
// ============================================

/**
 * Get total order count from contract
 */
export function useOTCOrderCount(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_order_count",
    args: [],
  });
}

/**
 * Get total trade count from contract
 */
export function useOTCTradeCount(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_trade_count",
    args: [],
  });
}

/**
 * Get aggregated orderbook depth from chain
 * Returns (bids, asks) where each is Array<(price, total_amount, order_count)>
 */
export function useOTCOrderbookDepth(pairId: number, maxLevels: number = 15, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_orderbook_depth",
    args: [pairId, maxLevels],
    refetchInterval: 3000, // Refresh every 3 seconds for real-time data
  });
}

/**
 * Get active orders for a trading pair (paginated)
 */
export function useOTCActiveOrders(pairId: number, offset: number = 0, limit: number = 50, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_active_orders",
    args: [pairId, offset, limit],
  });
}

/**
 * Get trade history from chain (paginated, newest first)
 */
export function useOTCTradeHistory(pairId: number, offset: number = 0, limit: number = 20, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_trade_history",
    args: [pairId, offset, limit],
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

/**
 * Get orders at a specific price level
 */
export function useOTCOrdersAtPrice(
  pairId: number,
  side: 0 | 1, // 0 = Buy, 1 = Sell
  price: bigint,
  limit: number = 20,
  network: NetworkType = "sepolia"
) {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_orders_at_price",
    args: [pairId, side, { low: price, high: 0n }, limit],
    enabled: !!price,
  });
}

/**
 * Get 24h stats from chain
 * Returns (volume, high, low, last_price)
 */
export function useOTC24hStats(pairId: number, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.OTC_ORDERBOOK,
    abi: ABIS.otcOrderbook,
    functionName: "get_24h_stats",
    args: [pairId],
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

// ============================================
// Privacy Pools Hooks
// ============================================

export function usePrivacyPoolsContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
  });
}

export function usePrivacyPoolsIsInitialized(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "is_initialized",
    args: [],
  });
}

export function usePrivacyPoolsGlobalRoot(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "get_global_deposit_root",
    args: [],
  });
}

export function usePrivacyPoolsTokenInfo(tokenAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "get_token_pool_info",
    args: tokenAddress ? [tokenAddress] : undefined,
    enabled: !!tokenAddress,
  });
}

export function usePrivacyPoolsASPInfo(aspId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "get_asp_info",
    args: aspId ? [aspId] : undefined,
    enabled: !!aspId,
  });
}

export function usePrivacyPoolsUserDeposits(userAddress: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "get_user_deposits",
    args: userAddress ? [userAddress] : undefined,
    enabled: !!userAddress,
  });
}

export function usePrivacyPoolsPoolStats(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.PRIVACY_POOLS,
    abi: ABIS.privacyPools,
    functionName: "get_pool_stats",
    args: [],
  });
}

// ============================================
// Job Manager Hooks
// ============================================

export function useJobManagerContract(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
  });
}

export function useJobDetails(jobId: bigint | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_job_details",
    args: jobId !== undefined ? [{ value: { low: jobId, high: 0n } }] : undefined,
    enabled: jobId !== undefined,
  });
}

export function useJobState(jobId: bigint | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_job_state",
    args: jobId !== undefined ? [{ value: { low: jobId, high: 0n } }] : undefined,
    enabled: jobId !== undefined,
  });
}

export function useTotalJobs(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_total_jobs",
    args: [],
  });
}

export function useActiveJobs(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_active_jobs",
    args: [],
  });
}

export function useCompletedJobs(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_completed_jobs",
    args: [],
  });
}

export function useWorkerStats(workerId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_worker_stats",
    args: workerId ? [{ value: workerId }] : undefined,
    enabled: !!workerId,
  });
}

export function useIsWorkerActive(workerId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "is_worker_active",
    args: workerId ? [{ value: workerId }] : undefined,
    enabled: !!workerId,
  });
}

export function usePlatformConfig(network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);
  return useReadContract({
    address: addresses.JOB_MANAGER,
    abi: ABIS.jobManager,
    functionName: "get_platform_config",
    args: [],
  });
}

// ============================================
// Transaction Builders
// ============================================

/**
 * Build a claim faucet transaction
 */
export function buildClaimFaucetCall(network: NetworkType = "sepolia"): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.FAUCET,
    entrypoint: "claim",
    calldata: [],
  };
}

/**
 * Build a stake transaction
 * @param amount Amount in wei (u256)
 * @param gpuTier GPU tier (0-4)
 * @param hasTee Whether the worker has TEE support
 */
export function buildStakeCall(
  amount: bigint,
  gpuTier: number,
  hasTee: boolean,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.STAKING,
    entrypoint: "stake",
    calldata: [
      amount.toString(), // low
      "0", // high
      gpuTier.toString(),
      hasTee ? "1" : "0",
    ],
  };
}

/**
 * Build an unstake transaction
 * @param amount Amount in wei (u256)
 */
export function buildUnstakeCall(amount: bigint, network: NetworkType = "sepolia"): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.STAKING,
    entrypoint: "unstake",
    calldata: [amount.toString(), "0"],
  };
}

/**
 * Build a token approve transaction
 * @param spender Address to approve
 * @param amount Amount in wei (u256)
 */
export function buildApproveCall(
  spender: string,
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.SAGE_TOKEN,
    entrypoint: "approve",
    calldata: [spender, amount.toString(), "0"],
  };
}

/**
 * Build a register validator transaction
 * @param operator Address of the operator (usually same as caller)
 * @param commissionBps Commission in basis points (e.g., 500 = 5%)
 * @param attestationHash Proof of node identity (can be 0 for testnet)
 */
export function buildRegisterValidatorCall(
  operator: string,
  commissionBps: number = 500, // Default 5%
  attestationHash: string = "0", // Default no attestation for testnet
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.VALIDATOR_REGISTRY,
    entrypoint: "register",
    calldata: [operator, commissionBps.toString(), attestationHash],
  };
}

/**
 * Build an exit validator transaction
 */
export function buildExitValidatorCall(network: NetworkType = "sepolia"): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.VALIDATOR_REGISTRY,
    entrypoint: "exit",
    calldata: [],
  };
}

/**
 * Build an update validator transaction
 * @param commissionBps New commission in basis points
 * @param attestationHash New attestation hash
 */
export function buildUpdateValidatorCall(
  commissionBps: number,
  attestationHash: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.VALIDATOR_REGISTRY,
    entrypoint: "update_validator",
    calldata: [commissionBps.toString(), attestationHash],
  };
}

/**
 * Build an add stake transaction for validator
 * @param amount Amount in wei (u256) to add to stake
 */
export function buildAddValidatorStakeCall(
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.VALIDATOR_REGISTRY,
    entrypoint: "add_stake",
    calldata: [amount.toString(), "0"], // u256 low, high
  };
}

/**
 * Build a remove stake transaction for validator
 * @param amount Amount in wei (u256) to remove from stake
 */
export function buildRemoveValidatorStakeCall(
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.VALIDATOR_REGISTRY,
    entrypoint: "remove_stake",
    calldata: [amount.toString(), "0"], // u256 low, high
  };
}

/**
 * Build approve + register validator multicall
 * Approves SAGE tokens for staking and registers as validator in one transaction
 */
export function buildRegisterValidatorMulticall(
  operator: string,
  stakeAmount: bigint,
  commissionBps: number = 500,
  attestationHash: string = "0",
  network: NetworkType = "sepolia"
): Call[] {
  const addresses = getContractAddresses(network);
  return [
    // First approve SAGE tokens to validator registry
    {
      contractAddress: addresses.SAGE_TOKEN,
      entrypoint: "approve",
      calldata: [addresses.VALIDATOR_REGISTRY, stakeAmount.toString(), "0"],
    },
    // Then register as validator
    buildRegisterValidatorCall(operator, commissionBps, attestationHash, network),
    // Then add stake
    buildAddValidatorStakeCall(stakeAmount, network),
  ];
}

/**
 * Build a register privacy account transaction
 * @param publicKeyX X coordinate of ElGamal public key
 * @param publicKeyY Y coordinate of ElGamal public key
 */
export function buildRegisterPrivacyAccountCall(
  publicKeyX: string,
  publicKeyY: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_ROUTER,
    entrypoint: "register_account",
    calldata: [publicKeyX, publicKeyY], // ECPoint { x, y }
  };
}

/**
 * Build a ragequit (emergency withdrawal) transaction
 * This allows withdrawing entire private balance to public in emergencies
 * @param amount Amount to withdraw
 * @param proof ZK proof of ownership (simplified for testnet)
 */
export function buildRagequitCall(
  amount: bigint,
  proof: string[] = ["0", "0"], // Placeholder proof for testnet
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_ROUTER,
    entrypoint: "ragequit",
    calldata: [amount.toString(), "0", ...proof],
  };
}

/**
 * Build a deposit to private balance transaction
 * @param amount Amount to deposit (u256)
 * @param encryptedAmount ElGamal encrypted amount (c1_x, c1_y, c2_x, c2_y)
 * @param proof Encryption proof (commitment_x, commitment_y, challenge, response, range_proof_hash)
 */
export function buildPrivateDepositCall(
  amount: bigint,
  encryptedAmount: { c1_x: string; c1_y: string; c2_x: string; c2_y: string },
  proof: { commitment_x: string; commitment_y: string; challenge: string; response: string; range_proof_hash: string },
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_ROUTER,
    entrypoint: "deposit",
    calldata: [
      amount.toString(), "0", // u256 low, high
      encryptedAmount.c1_x, encryptedAmount.c1_y, encryptedAmount.c2_x, encryptedAmount.c2_y,
      proof.commitment_x, proof.commitment_y, proof.challenge, proof.response, proof.range_proof_hash,
    ],
  };
}

/**
 * Build a withdraw from private balance transaction
 * @param amount Amount to withdraw (u256)
 * @param encryptedDelta Encrypted new balance delta
 * @param proof Encryption proof
 */
export function buildPrivateWithdrawCall(
  amount: bigint,
  encryptedDelta: { c1_x: string; c1_y: string; c2_x: string; c2_y: string },
  proof: { commitment_x: string; commitment_y: string; challenge: string; response: string; range_proof_hash: string },
  nullifier: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_ROUTER,
    entrypoint: "withdraw",
    calldata: [
      amount.toString(), "0",
      encryptedDelta.c1_x, encryptedDelta.c1_y, encryptedDelta.c2_x, encryptedDelta.c2_y,
      proof.commitment_x, proof.commitment_y, proof.challenge, proof.response, proof.range_proof_hash,
      nullifier,
    ],
  };
}

/**
 * Private transfer input types
 */
export interface PrivateTransferInput {
  sender: string;
  receiver: string;
  encryptedAmount: { c1_x: string; c1_y: string; c2_x: string; c2_y: string };
  senderDelta: { c1_x: string; c1_y: string; c2_x: string; c2_y: string };
  senderProof: { commitment_x: string; commitment_y: string; challenge: string; response: string; range_proof_hash: string };
  receiverProof: { commitment_x: string; commitment_y: string; challenge: string; response: string; range_proof_hash: string };
  balanceProof: string;
  nullifier: string;
}

/**
 * Build a private transfer transaction
 * @param transfer The private transfer data including proofs
 */
export function buildPrivateTransferCall(
  transfer: PrivateTransferInput,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_ROUTER,
    entrypoint: "private_transfer",
    calldata: [
      // PrivateTransfer struct
      transfer.sender,
      transfer.receiver,
      // encrypted_amount
      transfer.encryptedAmount.c1_x, transfer.encryptedAmount.c1_y,
      transfer.encryptedAmount.c2_x, transfer.encryptedAmount.c2_y,
      // sender_delta
      transfer.senderDelta.c1_x, transfer.senderDelta.c1_y,
      transfer.senderDelta.c2_x, transfer.senderDelta.c2_y,
      // TransferProof: sender_proof
      transfer.senderProof.commitment_x, transfer.senderProof.commitment_y,
      transfer.senderProof.challenge, transfer.senderProof.response, transfer.senderProof.range_proof_hash,
      // TransferProof: receiver_proof
      transfer.receiverProof.commitment_x, transfer.receiverProof.commitment_y,
      transfer.receiverProof.challenge, transfer.receiverProof.response, transfer.receiverProof.range_proof_hash,
      // balance_proof
      transfer.balanceProof,
      // nullifier
      transfer.nullifier,
    ],
  };
}

/**
 * Build a public token transfer transaction (standard ERC20)
 * @param to Recipient address
 * @param amount Amount to transfer (u256)
 */
export function buildPublicTransferCall(
  to: string,
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.SAGE_TOKEN,
    entrypoint: "transfer",
    calldata: [to, amount.toString(), "0"],
  };
}

/**
 * Build approve + deposit multicall for private balance
 */
export function buildApproveAndDepositMulticall(
  amount: bigint,
  encryptedAmount: { c1_x: string; c1_y: string; c2_x: string; c2_y: string },
  proof: { commitment_x: string; commitment_y: string; challenge: string; response: string; range_proof_hash: string },
  network: NetworkType = "sepolia"
): Call[] {
  const addresses = getContractAddresses(network);
  return [
    buildApproveCall(addresses.PRIVACY_ROUTER, amount, network),
    buildPrivateDepositCall(amount, encryptedAmount, proof, network),
  ];
}

// ============================================
// Governance Transaction Builders
// ============================================

/**
 * Build a vote on proposal transaction
 * @param proposalId ID of the proposal to vote on
 * @param support true = vote FOR, false = vote AGAINST
 */
export function buildVoteCall(
  proposalId: string | number,
  support: boolean,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "vote",
    calldata: [
      proposalId.toString(),
      support ? "1" : "0", // 1 = FOR, 0 = AGAINST
    ],
  };
}

/**
 * Build a delegate voting power transaction
 * @param delegatee Address to delegate voting power to
 */
export function buildDelegateCall(
  delegatee: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "delegate",
    calldata: [delegatee],
  };
}

/**
 * Build a create proposal transaction
 * @param title Proposal title
 * @param description Proposal description
 * @param actions Array of proposed actions (target, selector, calldata)
 */
export function buildCreateProposalCall(
  title: string,
  description: string,
  category: string,
  actions: Array<{ target: string; selector: string; calldata: string[] }>,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  // Encode title and description as felt252 (simplified - real impl would use string encoding)
  const titleFelt = "0x" + Buffer.from(title.slice(0, 31)).toString("hex").padEnd(62, "0");
  const descFelt = "0x" + Buffer.from(description.slice(0, 31)).toString("hex").padEnd(62, "0");
  const categoryFelt = "0x" + Buffer.from(category.slice(0, 31)).toString("hex").padEnd(62, "0");

  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "create_proposal",
    calldata: [
      titleFelt,
      descFelt,
      categoryFelt,
      actions.length.toString(),
      ...actions.flatMap(a => [a.target, a.selector, a.calldata.length.toString(), ...a.calldata]),
    ],
  };
}

// Proposal type enum values for contract calls
export const PROPOSAL_TYPES = {
  Treasury: 0,
  Upgrade: 1,
  Parameter: 2,
  Emergency: 3,
} as const;

export type ProposalTypeKey = keyof typeof PROPOSAL_TYPES;

/**
 * Build a create proposal transaction (matches Cairo contract)
 * @param title Short title (max 31 chars for felt252)
 * @param description Description (max 31 chars for felt252)
 * @param target Target contract address for execution
 * @param value Amount of SAGE for treasury proposals
 * @param calldata Encoded calldata for execution
 * @param proposalType Type of proposal (Treasury, Upgrade, Parameter, Emergency)
 */
export function buildProposeCall(
  title: string,
  description: string,
  target: string,
  value: bigint,
  calldata: string,
  proposalType: ProposalTypeKey,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  // Convert strings to felt252 (max 31 chars)
  const titleFelt = "0x" + Buffer.from(title.slice(0, 31)).toString("hex").padEnd(62, "0");
  const descFelt = "0x" + Buffer.from(description.slice(0, 31)).toString("hex").padEnd(62, "0");
  const calldataFelt = calldata || "0x0";

  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "propose",
    calldata: [
      titleFelt,
      descFelt,
      target || addresses.GOVERNANCE_TREASURY, // default to self
      value.toString(), "0", // u256
      calldataFelt,
      PROPOSAL_TYPES[proposalType].toString(),
    ],
  };
}

/**
 * Build an execute proposal transaction
 * @param proposalId ID of the proposal to execute
 */
export function buildExecuteProposalCall(
  proposalId: string | number,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "execute_proposal",
    calldata: [proposalId.toString(), "0"], // u256
  };
}

/**
 * Build a cancel proposal transaction
 * @param proposalId ID of the proposal to cancel
 */
export function buildCancelProposalCall(
  proposalId: string | number,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.GOVERNANCE_TREASURY,
    entrypoint: "cancel_proposal",
    calldata: [proposalId.toString(), "0"], // u256
  };
}

// ============================================
// OTC Orderbook Transaction Builders
// ============================================

/**
 * Build a place limit order transaction
 * @param pairId Trading pair ID (0 = SAGE/USDC, 1 = SAGE/STRK, etc.)
 * @param side 0 = Buy, 1 = Sell
 * @param price Price in quote token (u256)
 * @param amount Amount in base token (u256)
 * @param expiresIn Order expiry time in seconds (default: 1 day = 86400)
 */
export function buildPlaceLimitOrderCall(
  pairId: number,
  side: 0 | 1, // 0 = Buy, 1 = Sell
  price: bigint,
  amount: bigint,
  expiresIn: number = 86400, // Default 1 day
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.OTC_ORDERBOOK,
    entrypoint: "place_limit_order",
    calldata: [
      pairId.toString(),
      side.toString(),
      price.toString(), "0", // u256
      amount.toString(), "0", // u256
      expiresIn.toString(), // u64 expires_in
    ],
  };
}

/**
 * Build a cancel order transaction
 * @param orderId Order ID to cancel
 */
export function buildCancelOrderCall(
  orderId: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.OTC_ORDERBOOK,
    entrypoint: "cancel_order",
    calldata: [orderId.toString(), "0"],
  };
}

/**
 * Build a market order transaction
 * @param pairId Trading pair ID
 * @param side 0 = Buy, 1 = Sell
 * @param amount Amount in base token (u256)
 */
export function buildPlaceMarketOrderCall(
  pairId: number,
  side: 0 | 1, // 0 = Buy, 1 = Sell
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.OTC_ORDERBOOK,
    entrypoint: "place_market_order",
    calldata: [
      pairId.toString(),
      side.toString(),
      amount.toString(), "0", // u256
    ],
  };
}

/**
 * Build a market buy order (convenience wrapper)
 * @param pairId Trading pair ID
 * @param amount Amount to spend in quote token
 */
export function buildMarketBuyCall(
  pairId: number,
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  return buildPlaceMarketOrderCall(pairId, 0, amount, network);
}

/**
 * Build a market sell order (convenience wrapper)
 * @param pairId Trading pair ID
 * @param amount Amount to sell in base token
 */
export function buildMarketSellCall(
  pairId: number,
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  return buildPlaceMarketOrderCall(pairId, 1, amount, network);
}

// ============================================
// Privacy Pools Transaction Builders
// ============================================

/**
 * Build a deposit to privacy pool transaction
 * @param tokenAddress Token to deposit
 * @param amount Amount to deposit
 * @param commitment Pedersen commitment for the deposit
 */
export function buildPrivacyPoolDepositCall(
  tokenAddress: string,
  amount: bigint,
  commitment: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_POOLS,
    entrypoint: "deposit",
    calldata: [tokenAddress, amount.toString(), "0", commitment],
  };
}

/**
 * Build a withdraw from privacy pool transaction
 * @param tokenAddress Token to withdraw
 * @param amount Amount to withdraw
 * @param nullifier Nullifier to prevent double-spending
 * @param proof ZK proof of valid withdrawal
 */
export function buildPrivacyPoolWithdrawCall(
  tokenAddress: string,
  amount: bigint,
  nullifier: string,
  proof: string[],
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.PRIVACY_POOLS,
    entrypoint: "withdraw",
    calldata: [tokenAddress, amount.toString(), "0", nullifier, ...proof],
  };
}

/**
 * Build an initiate ragequit transaction (emergency withdrawal from privacy pool)
 * Matches contract entrypoint: initiate_pp_ragequit(proof: PPRagequitProof)
 *
 * @param proof PPRagequitProof containing deposit commitment, merkle proof,
 *              exclusion proofs, depositor signature, amount, and recipient
 */
export function buildInitiateRagequitCall(
  proof: {
    deposit_commitment: string;
    global_tree_proof: LeanIMTProof;
    exclusion_proofs: ExclusionProofData[];
    excluded_set_ids: string[];
    depositor_signature: [string, string];
    amount: { low: string; high: string };
    recipient: string;
  },
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  // Serialize PPRagequitProof manually to match Cairo ABI layout
  const calldata: string[] = [
    // deposit_commitment: felt252
    proof.deposit_commitment,
    // global_tree_proof: LeanIMTProof
    proof.global_tree_proof.siblings.length.toString(),
    ...proof.global_tree_proof.siblings,
    proof.global_tree_proof.pathIndices.length.toString(),
    ...proof.global_tree_proof.pathIndices.map(b => b ? "1" : "0"),
    proof.global_tree_proof.leaf,
    proof.global_tree_proof.root,
    proof.global_tree_proof.treeSize.toString(),
    // exclusion_proofs: Array<ExclusionProofData>
    proof.exclusion_proofs.length.toString(),
    ...proof.exclusion_proofs.flatMap(ep => [
      ep.nonMembershipProof.siblings.length.toString(),
      ...ep.nonMembershipProof.siblings,
      ep.nonMembershipProof.pathIndices.length.toString(),
      ...ep.nonMembershipProof.pathIndices.map(b => b ? "1" : "0"),
      ep.nonMembershipProof.leaf,
      ep.nonMembershipProof.root,
      ep.nonMembershipProof.treeSize.toString(),
      ep.boundaryLeft,
      ep.boundaryRight,
    ]),
    // excluded_set_ids: Array<felt252>
    proof.excluded_set_ids.length.toString(),
    ...proof.excluded_set_ids,
    // depositor_signature: (felt252, felt252)
    proof.depositor_signature[0],
    proof.depositor_signature[1],
    // amount: u256 { low, high }
    proof.amount.low,
    proof.amount.high,
    // recipient: ContractAddress
    proof.recipient,
  ];

  return {
    contractAddress: addresses.PRIVACY_POOLS,
    entrypoint: "initiate_pp_ragequit",
    calldata,
  };
}

/** @deprecated Use buildInitiateRagequitCall instead */
export const buildPrivacyPoolRagequitCall = buildInitiateRagequitCall;

/**
 * Build a complete ragequit transaction (after waiting period)
 * Matches contract entrypoint: complete_pp_ragequit(request_id: u256)
 *
 * @param requestId The ragequit request ID (u256)
 */
export function buildCompleteRagequitCall(
  requestId: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  const low = (requestId & ((1n << 128n) - 1n)).toString();
  const high = (requestId >> 128n).toString();
  return {
    contractAddress: addresses.PRIVACY_POOLS,
    entrypoint: "complete_pp_ragequit",
    calldata: [low, high],
  };
}

/** @deprecated Use buildCompleteRagequitCall instead */
export function buildExecuteRagequitCall(
  requestId: bigint,
  network: NetworkType = "sepolia"
): Call {
  return buildCompleteRagequitCall(requestId, network);
}

/**
 * LeanIMT Proof structure for contract calls
 */
export interface LeanIMTProof {
  siblings: string[];       // Array of felt252 sibling hashes
  pathIndices: boolean[];   // Path direction at each level
  leaf: string;             // The leaf being proven
  root: string;             // Expected root
  treeSize: number;         // Current tree size
}

/**
 * Exclusion proof data for ragequit (non-membership in an exclusion set)
 * Matches ExclusionProofData struct in PrivacyPools contract ABI
 */
export interface ExclusionProofData {
  nonMembershipProof: LeanIMTProof;
  boundaryLeft: string;     // felt252
  boundaryRight: string;    // felt252
}

/**
 * Ragequit request info from contract
 */
export interface RagequitRequest {
  requestId: bigint;
  commitment: string;
  depositor: string;
  amount: bigint;
  recipient: string;
  initiatedAt: number;
  executableAt: number;
}

/**
 * Association set info (inclusion or exclusion set)
 */
export interface AssociationSetInfo {
  setId: string;
  aspId: string;
  setType: 'Inclusion' | 'Exclusion';
  root: string;
  memberCount: number;
  createdAt: number;
  lastUpdated: number;
}

/**
 * Build a cancel ragequit transaction
 * Cancels a pending ragequit by rejoining an inclusion set
 *
 * @param requestId The ragequit request ID (u256)
 * @param newInclusionSetId The inclusion set to rejoin
 * @param inclusionProof Merkle proof of membership in the new set
 */
export function buildCancelRagequitCall(
  requestId: bigint,
  newInclusionSetId: string,
  inclusionProof: LeanIMTProof,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  // Convert requestId (u256) to two felt252 values (low, high)
  const requestIdLow = (requestId & ((1n << 128n) - 1n)).toString();
  const requestIdHigh = (requestId >> 128n).toString();

  // Build calldata for LeanIMTProof struct
  // Format: [siblings_len, ...siblings, path_indices_len, ...path_indices, leaf, root, tree_size]
  const calldata: string[] = [
    requestIdLow,
    requestIdHigh,
    newInclusionSetId,
    // LeanIMTProof struct
    inclusionProof.siblings.length.toString(),
    ...inclusionProof.siblings,
    inclusionProof.pathIndices.length.toString(),
    ...inclusionProof.pathIndices.map(b => b ? "1" : "0"),
    inclusionProof.leaf,
    inclusionProof.root,
    inclusionProof.treeSize.toString(),
  ];

  return {
    contractAddress: addresses.PRIVACY_POOLS,
    entrypoint: "cancel_pp_ragequit",
    calldata,
  };
}

/**
 * Convert MerkleProof from crypto module to LeanIMTProof for contract
 */
export function merkleProofToLeanIMT(
  proof: { leaf: bigint; leafIndex: number; pathElements: bigint[]; pathIndices: number[]; root: bigint },
  treeSize: number
): LeanIMTProof {
  return {
    siblings: proof.pathElements.map(e => "0x" + e.toString(16)),
    pathIndices: proof.pathIndices.map(i => i === 1),
    leaf: "0x" + proof.leaf.toString(16),
    root: "0x" + proof.root.toString(16),
    treeSize,
  };
}

// ============================================
// Job Manager Transaction Builders
// ============================================

// Job type enum values for contract calls
export const JOB_TYPES = {
  AIInference: 0,
  AITraining: 1,
  ProofGeneration: 2,
  ProofVerification: 3,
  DataPipeline: 4,
  ConfidentialVM: 5,
} as const;

export type JobTypeKey = keyof typeof JOB_TYPES;

// Verification method enum values
export const VERIFICATION_METHODS = {
  None: 0,
  StatisticalSampling: 1,
  ZeroKnowledgeProof: 2,
  ConsensusValidation: 3,
} as const;

export type VerificationMethodKey = keyof typeof VERIFICATION_METHODS;

// Job specification for AI workloads
export interface JobSpecInput {
  jobType: JobTypeKey;
  modelId: bigint;
  inputDataHash: string;
  expectedOutputFormat: string;
  verificationMethod: VerificationMethodKey;
  maxReward: bigint;
  slaDeadline: number; // Unix timestamp
  computeRequirements: string[];
  metadata: string[];
}

// Proof job specific data
export interface ProveJobDataInput {
  circuitId: string;
  publicInputs: string[];
  privateInputsHash: string;
  expectedProofSize: number;
}

/**
 * Build submit AI job transaction
 * Requires prior approval of SAGE tokens to JobManager contract
 */
export function buildSubmitAIJobCall(
  spec: JobSpecInput,
  payment: bigint,
  clientAddress: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  // Build calldata for JobSpec struct
  const calldata = [
    // job_type (enum variant)
    JOB_TYPES[spec.jobType].toString(),
    // model_id (struct with u256)
    spec.modelId.toString(), "0", // low, high
    // input_data_hash (felt252)
    spec.inputDataHash,
    // expected_output_format (felt252)
    spec.expectedOutputFormat,
    // verification_method (enum variant)
    VERIFICATION_METHODS[spec.verificationMethod].toString(),
    // max_reward (u256)
    spec.maxReward.toString(), "0",
    // sla_deadline (u64)
    spec.slaDeadline.toString(),
    // compute_requirements (Array<felt252>)
    spec.computeRequirements.length.toString(),
    ...spec.computeRequirements,
    // metadata (Array<felt252>)
    spec.metadata.length.toString(),
    ...spec.metadata,
    // payment (u256)
    payment.toString(), "0",
    // client (ContractAddress)
    clientAddress,
  ];

  return {
    contractAddress: addresses.JOB_MANAGER,
    entrypoint: "submit_ai_job",
    calldata,
  };
}

/**
 * Build submit proof generation job transaction
 * Requires prior approval of SAGE tokens to JobManager contract
 */
export function buildSubmitProveJobCall(
  data: ProveJobDataInput,
  payment: bigint,
  clientAddress: string,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);

  const calldata = [
    // circuit_id (felt252)
    data.circuitId,
    // public_inputs (Array<felt252>)
    data.publicInputs.length.toString(),
    ...data.publicInputs,
    // private_inputs_hash (felt252)
    data.privateInputsHash,
    // expected_proof_size (u32)
    data.expectedProofSize.toString(),
    // payment (u256)
    payment.toString(), "0",
    // client (ContractAddress)
    clientAddress,
  ];

  return {
    contractAddress: addresses.JOB_MANAGER,
    entrypoint: "submit_prove_job",
    calldata,
  };
}

/**
 * Build approve tokens for job submission
 * Must be called before submitting a job
 */
export function buildApproveForJobCall(
  amount: bigint,
  network: NetworkType = "sepolia"
): Call {
  const addresses = getContractAddresses(network);
  return {
    contractAddress: addresses.SAGE_TOKEN,
    entrypoint: "approve",
    calldata: [addresses.JOB_MANAGER, amount.toString(), "0"],
  };
}

/**
 * Build multicall for job submission (approve + submit in one tx)
 * @returns Array of calls to be submitted as a multicall
 */
export function buildSubmitAIJobMulticall(
  spec: JobSpecInput,
  payment: bigint,
  clientAddress: string,
  network: NetworkType = "sepolia"
): Call[] {
  return [
    buildApproveForJobCall(payment, network),
    buildSubmitAIJobCall(spec, payment, clientAddress, network),
  ];
}

/**
 * Build multicall for proof job submission (approve + submit in one tx)
 */
export function buildSubmitProveJobMulticall(
  data: ProveJobDataInput,
  payment: bigint,
  clientAddress: string,
  network: NetworkType = "sepolia"
): Call[] {
  return [
    buildApproveForJobCall(payment, network),
    buildSubmitProveJobCall(data, payment, clientAddress, network),
  ];
}

// ============================================
// Transaction Hook Wrapper
// ============================================

/**
 * Hook to send a transaction to a BitSage contract
 */
export function useBitSageTransaction() {
  const { send, sendAsync, ...rest } = useSendTransaction({});

  return {
    sendTransaction: send,
    sendTransactionAsync: sendAsync,
    ...rest,
  };
}

// ============================================
// Export ABIs for direct use
// ============================================

export { ABIS };
export * from "./addresses";
