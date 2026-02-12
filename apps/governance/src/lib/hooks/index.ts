/**
 * Hooks Index
 *
 * Central export point for all custom React hooks.
 * Import hooks from this file for cleaner imports:
 *
 * import { useProofs, useWebSocket, useQuoteBalance } from '@/lib/hooks';
 *
 * Note: Some hooks have overlapping names. For the most up-to-date WebSocket
 * implementation, use the hooks from './useWebSocket' directly.
 */

// WebSocket hooks (real-time updates) - preferred WebSocket implementation
// These take priority over legacy WebSocket hooks in useApiData
export * from './useWebSocket';

// Proofs hooks (STWO proof data)
export * from './useProofs';

// Trading hooks (quote token balances)
export * from './useQuoteBalance';

// Trading pair configuration (centralized pair info with decimals)
export * from './useTradingPairs';

// On-chain data hooks (contract reads)
export * from './useOnChainData';

// Governance hooks (proposals, voting)
export * from './useGovernance';

// Oracle hooks (price feeds)
export * from './usePragmaOracle';

// Transaction history hooks
export * from './useTransactionHistory';

// Privacy hooks (Obelysk)
export * from './usePrivacyKeys';
export * from './usePrivacyPool';
export * from './useConfidentialSwap';
// Explicit exports from useConfidentialTransfer to avoid AssetId collision
export {
  useConfidentialTransfer,
  ASSET_IDS as CONFIDENTIAL_TRANSFER_ASSET_IDS,
  type AssetId as ConfidentialTransferAssetId,
  type ConfidentialTransferState,
  type TransferProof,
  type UseConfidentialTransferReturn,
} from './useConfidentialTransfer';

// Workload deployment hooks
export * from './useWorkloadDeployment';

// Re-export commonly used hooks from useApiData
// (Note: useWebSocket from useApiData is deprecated, use ./useWebSocket instead)
export {
  // Network & Stats
  useNetworkStats,
  useDashboardData,
  useDashboardDbStats,
  useDashboardWithDb,
  useApiHealth,

  // Jobs
  useJobs,
  useJobsFromDb,
  useJobStatus,
  useSubmitJob,
  useCancelJob,
  useJobsPageData,
  useJobTimeline,
  useJobFromDb,
  useJobDetailFromDb,
  useRecentJobsFromDb,
  useJobsChartData,
  useJobDbAnalytics,

  // Proofs (API version)
  useProofs as useApiProofs,
  useProof,
  useProofsFromDb,
  useProofFromDb,
  useProofDbStats,
  useProofDetail,
  useProofsPageData,

  // Earnings
  useEarningsSummary,
  useEarningsHistory,
  useEarningsChart,
  useNetworkEarningsStats,
  useWorkerEarnings,
  useEarningsLeaderboard,
  useEarningsPageData,

  // Trading
  useTradingPairs,
  useOrderBook,
  useUserOrders,
  useTradeHistory,
  useMarketStats,
  useTWAP,
  useTradingWithWebSocket,

  // Governance
  useProposals,
  useProposal,
  useProposalVotes,
  useVotingPower,
  useDelegations,
  useGovernanceStats,
  useCouncilMembers,
  useGovernanceDashboard,
  useGovernanceWithWebSocket,

  // Staking
  useStakeInfo,
  useClaimRewards,
  useStakingDbStats,
  useStakingHistoryDb,
  useStakingLeaderboard,
  useStakingPageData,

  // Faucet
  useFaucetStatus,
  useFaucetConfig,
  useClaimFaucet,
  useFaucetClaimHistory,

  // Privacy & Stealth
  usePrivacyAccount,
  usePrivateBalance,
  usePrivacyPools,
  usePrivacyStats,
  usePrivacyNetworkGraph,
  useStealthMetaAddress,
  useStealthPayments,
  useScanStealthPayments,
  useClaimStealthPayments,
  useStealthPageData,

  // Wallet
  useWalletActivity,
  useWalletWithWebSocket,
  useWalletDbTransactions,
  useWalletDbSummary,
  useWalletPageData,
  useTransferHistory,
  useRecentTransfers,
  useSavedContacts,
  useMultiAssetBalances,
  useSendPageData,

  // Network
  useNetworkStatsHistory,
  useNetworkStatsChart,
  useNetworkGrowthMetrics,
  useNetworkPageData,

  // Validator & GPU
  useValidatorStatus,
  useGPUMetrics,

  // Price
  useSagePrice,
  useTokenPrice,
  useTokenPrices,
  useSageUsdValue,
} from './useApiData';
