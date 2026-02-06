/**
 * Custom hooks for API data fetching with TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getConfig } from '@/lib/env';
import {
  getValidatorStatus,
  getGPUMetrics,
  getWorkerUptime,
  getWorkerStatus,
  getJobs,
  getJobStatus,
  getProofs,
  getProof,
  getNetworkStats,
  getFaucetStatus,
  getFaucetConfig,
  getFaucetClaimHistory,
  claimFaucet,
  FaucetClaimHistoryItem,
  getStakeInfo,
  claimRewards,
  submitJob,
  cancelJob,
  wsClient,
  WebSocketMessage,
  ValidatorStatus,
  GPUMetrics,
  JobInfo,
  ProofInfo,
  NetworkStats,
  FaucetStatus,
  FaucetConfig,
  // Trading API
  getTradingPairs,
  getOrderBook,
  getUserOrders,
  getTradeHistory,
  getMarketStats,
  getTWAP,
  TradingPair,
  OrderBookResponse,
  Order,
  Trade,
  MarketStats,
  TWAPData,
  // Governance API
  getProposals,
  getProposal,
  getProposalVotes,
  getVotingPower,
  getDelegations,
  getGovernanceStats,
  getCouncilMembers,
  Proposal,
  VoteRecord,
  VotingPower,
  GovernanceStats,
  CouncilMember,
  // Privacy API
  getPrivacyAccount,
  getPrivateBalance,
  getPrivacyPools,
  getPrivacyStats,
  getTransferHistory,
  PrivacyAccount,
  PrivacyPoolInfo,
  PrivacyStats,
  TransferRecord,
  // Stealth Address API
  getStealthMetaAddress,
  getStealthPayments,
  scanStealthPayments,
  claimStealthPayments,
  StealthPayment,
  StealthPaymentsResponse,
  StealthScanResponse,
  StealthClaimResponse,
  StealthMetaAddress,
  // Earnings API
  getEarningsSummary,
  getEarningsHistory,
  getEarningsChart,
  getWalletActivity,
  EarningsSummary,
  EarningsHistoryResponse,
  EarningsChartResponse,
  WalletActivity,
  // Jobs API
  getJobsChartData,
  getJobDbAnalytics,
  getRecentJobsFromDb,
  getDashboardStatsFromDb,
  JobDbAnalytics,
  DashboardDbStats,
  // WebSocket factories
  createTradingWsClient,
  createGovernanceWsClient,
  createPrivacyWsClient,
  createStakingWsClient,
  TradingWsMessage,
  GovernanceWsMessage,
  PrivacyWsMessage,
  StakingWsMessage,
  // Price Feed API
  getSagePrice,
  getTokenPrice,
  getTokenPrices,
  TokenPrice,
  TokenPricesResponse,
  // Network Graph API
  getPrivacyNetworkGraph,
  NetworkGraphNode,
  NetworkGraphEdge,
  NetworkGraphResponse,
} from '../api/client';

// ============================================================================
// Validator Hooks
// ============================================================================

export function useValidatorStatus() {
  return useQuery({
    queryKey: ['validatorStatus'],
    queryFn: async () => {
      const response = await getValidatorStatus();
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });
}

export function useGPUMetrics() {
  return useQuery({
    queryKey: ['gpuMetrics'],
    queryFn: async () => {
      const response = await getGPUMetrics();
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds for real-time GPU stats
    staleTime: 3000,
  });
}

export function useWorkerUptime(address: string | undefined, periodHours?: number) {
  return useQuery({
    queryKey: ['workerUptime', address, periodHours],
    queryFn: async () => {
      const response = await getWorkerUptime(address!, periodHours);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useWorkerStatus(address: string | undefined) {
  return useQuery({
    queryKey: ['workerStatus', address],
    queryFn: async () => {
      const response = await getWorkerStatus(address!);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

// ============================================================================
// Price Feed Hooks
// ============================================================================

/**
 * Hook for SAGE token price with automatic fallback
 * Returns price data with source indicator ('pragma', 'coingecko', 'internal', or 'fallback')
 */
export function useSagePrice() {
  return useQuery({
    queryKey: ['sagePrice'],
    queryFn: getSagePrice,
    refetchInterval: 60000, // Refresh every 60 seconds
    staleTime: 30000, // Consider stale after 30 seconds
    retry: 2,
    // Don't throw on error - fallback is handled in getSagePrice
  });
}

/**
 * Hook for any token price
 */
export function useTokenPrice(symbol: string) {
  return useQuery({
    queryKey: ['tokenPrice', symbol],
    queryFn: async () => {
      const response = await getTokenPrice(symbol);
      return response.data;
    },
    enabled: !!symbol,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 2,
  });
}

/**
 * Hook for multiple token prices
 */
export function useTokenPrices(symbols?: string[]) {
  return useQuery({
    queryKey: ['tokenPrices', symbols],
    queryFn: async () => {
      const response = await getTokenPrices(symbols);
      return response.data;
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 2,
  });
}

/**
 * Convenience hook for USD value calculation with SAGE price
 */
export function useSageUsdValue(amountSage: number | string | undefined) {
  const { data: priceData, isLoading } = useSagePrice();

  const usdValue = useMemo(() => {
    const amount = typeof amountSage === 'string' ? parseFloat(amountSage) : amountSage;
    if (!amount || isNaN(amount) || !priceData) return 0;
    return amount * priceData.price_usd;
  }, [amountSage, priceData]);

  return {
    usdValue,
    formattedUsd: `$${usdValue.toFixed(2)}`,
    pricePerSage: priceData?.price_usd ?? 0,
    priceChange24h: priceData?.price_change_pct_24h ?? 0,
    isLoading,
    isFallback: priceData?.source === 'fallback',
  };
}

// ============================================================================
// Privacy Network Graph Hooks
// ============================================================================

const EMPTY_NETWORK_GRAPH: NetworkGraphResponse = {
  nodes: [],
  edges: [],
  your_node_id: "you",
  last_updated: new Date().toISOString(),
  is_mock: false,
};

/**
 * Hook for privacy network graph visualization
 * Returns network nodes/edges from API, empty graph when wallet not connected
 */
export function usePrivacyNetworkGraph(address: string | undefined) {
  const query = useQuery({
    queryKey: ['privacyNetworkGraph', address],
    queryFn: async () => {
      const response = await getPrivacyNetworkGraph(address!);
      return { ...response.data, is_mock: false };
    },
    enabled: !!address,
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  return {
    nodes: query.data?.nodes ?? EMPTY_NETWORK_GRAPH.nodes,
    edges: query.data?.edges ?? EMPTY_NETWORK_GRAPH.edges,
    yourNodeId: query.data?.your_node_id ?? 'you',
    lastUpdated: query.data?.last_updated,
    isMock: false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// Jobs Hooks
// ============================================================================

export function useJobs(params?: {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['jobs', params],
    queryFn: async () => {
      const response = await getJobs(params);
      return response.data;
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

export function useJobStatus(jobId: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const response = await getJobStatus(jobId);
      return response.data;
    },
    enabled: !!jobId,
    refetchInterval: 5000, // More frequent refresh for active job monitoring
  });
}

export function useSubmitJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      job_type: string;
      input_data: string;
      max_cost_sage?: number;
      priority?: number;
      require_tee?: boolean;
    }) => {
      const response = await submitJob(data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate jobs list to show new job
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const response = await cancelJob(jobId);
      return response.data;
    },
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });
}

// ============================================================================
// Proofs Hooks
// ============================================================================

export function useProofs(params?: {
  page?: number;
  per_page?: number;
  status?: string;
}) {
  return useQuery({
    queryKey: ['proofs', params],
    queryFn: async () => {
      const response = await getProofs(params);
      return response.data;
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useProof(proofId: string) {
  return useQuery({
    queryKey: ['proof', proofId],
    queryFn: async () => {
      const response = await getProof(proofId);
      return response.data;
    },
    enabled: !!proofId,
  });
}

// ============================================================================
// Network Hooks
// ============================================================================

export function useNetworkStats() {
  return useQuery({
    queryKey: ['networkStats'],
    queryFn: async () => {
      const response = await getNetworkStats();
      return response.data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

// ============================================================================
// Faucet Hooks
// ============================================================================

export function useFaucetStatus(address: string | undefined) {
  return useQuery({
    queryKey: ['faucetStatus', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getFaucetStatus(address);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });
}

export function useFaucetConfig() {
  return useQuery({
    queryKey: ['faucetConfig'],
    queryFn: async () => {
      const response = await getFaucetConfig();
      return response.data;
    },
    staleTime: 300000, // 5 minutes - config doesn't change often
  });
}

export function useClaimFaucet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, captchaToken }: { address: string; captchaToken?: string }) => {
      const response = await claimFaucet(address, captchaToken);
      return response.data;
    },
    onSuccess: (_, { address }) => {
      // Invalidate faucet status and claim history to refresh
      queryClient.invalidateQueries({ queryKey: ['faucetStatus', address] });
      queryClient.invalidateQueries({ queryKey: ['faucetClaimHistory', address] });
    },
  });
}

export function useFaucetClaimHistory(address: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['faucetClaimHistory', address, limit],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getFaucetClaimHistory(address, { limit });
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
  });
}

// ============================================================================
// Staking Hooks
// ============================================================================

export function useStakeInfo(address: string | undefined) {
  return useQuery({
    queryKey: ['stakeInfo', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getStakeInfo(address);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 60000,
  });
}

export function useClaimRewards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await claimRewards();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stakeInfo'] });
      queryClient.invalidateQueries({ queryKey: ['validatorStatus'] });
    },
  });
}

// ============================================================================
// WebSocket Hook
// ============================================================================

export function useWebSocket() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket
    wsClient.connect();

    // Subscribe to updates
    const unsubscribe = wsClient.subscribe((message: WebSocketMessage) => {
      switch (message.type) {
        case 'job_update':
          queryClient.invalidateQueries({ queryKey: ['jobs'] });
          if (message.data.job_id) {
            queryClient.invalidateQueries({ queryKey: ['job', message.data.job_id] });
          }
          break;
        case 'proof_update':
          queryClient.invalidateQueries({ queryKey: ['proofs'] });
          if (message.data.proof_id) {
            queryClient.invalidateQueries({ queryKey: ['proof', message.data.proof_id] });
          }
          break;
        case 'worker_status':
          queryClient.invalidateQueries({ queryKey: ['gpuMetrics'] });
          queryClient.invalidateQueries({ queryKey: ['validatorStatus'] });
          break;
        case 'network_stats':
          queryClient.invalidateQueries({ queryKey: ['networkStats'] });
          break;
      }
    });

    // Check connection status
    const checkConnection = setInterval(() => {
      setIsConnected(wsClient.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(checkConnection);
      wsClient.disconnect();
    };
  }, [queryClient]);

  return { isConnected };
}

// ============================================================================
// Combined Dashboard Hook
// ============================================================================

export function useDashboardData() {
  const validatorStatus = useValidatorStatus();
  const gpuMetrics = useGPUMetrics();
  const { isConnected } = useWebSocket();

  return {
    validatorStatus: validatorStatus.data,
    gpuMetrics: gpuMetrics.data,
    isLoading: validatorStatus.isLoading || gpuMetrics.isLoading,
    isError: validatorStatus.isError || gpuMetrics.isError,
    isConnected,
    refetch: () => {
      validatorStatus.refetch();
      gpuMetrics.refetch();
    },
  };
}

// ============================================================================
// Utility Hook for Connection Status
// ============================================================================

export function useApiHealth() {
  const [isOnline, setIsOnline] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${getConfig().apiUrl}/health`);
        setIsOnline(response.ok);
        setLastCheck(new Date());
      } catch {
        setIsOnline(false);
        setLastCheck(new Date());
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return { isOnline, lastCheck };
}

// ============================================================================
// Trading Hooks
// ============================================================================

export function useTradingPairs() {
  return useQuery({
    queryKey: ['tradingPairs'],
    queryFn: async () => {
      const response = await getTradingPairs();
      return response.data.pairs;
    },
    staleTime: 300000, // 5 minutes - pairs don't change often
  });
}

export function useOrderBook(pairId: string) {
  return useQuery({
    queryKey: ['orderBook', pairId],
    queryFn: async () => {
      const response = await getOrderBook(pairId);
      return response.data;
    },
    enabled: !!pairId,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time data
    staleTime: 2000,
  });
}

export function useUserOrders(address: string | undefined, status?: string) {
  return useQuery({
    queryKey: ['userOrders', address, status],
    queryFn: async () => {
      if (!address) return [];
      const response = await getUserOrders(address, { status });
      // API returns array directly, not { orders: [...] }
      const data = response.data as unknown;
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && 'orders' in data && Array.isArray((data as { orders: unknown[] }).orders)) {
        return (data as { orders: unknown[] }).orders;
      }
      return [];
    },
    enabled: !!address,
    refetchInterval: 10000,
  });
}

export function useTradeHistory(pairId: string, limit?: number) {
  return useQuery({
    queryKey: ['tradeHistory', pairId, limit],
    queryFn: async () => {
      const response = await getTradeHistory(pairId, { limit });
      // API returns array directly, not { trades: [...] }
      const data = response.data as unknown;
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && 'trades' in data && Array.isArray((data as { trades: unknown[] }).trades)) {
        return (data as { trades: unknown[] }).trades;
      }
      return [];
    },
    enabled: !!pairId,
    refetchInterval: 10000,
  });
}

export function useMarketStats(pairId: string) {
  return useQuery({
    queryKey: ['marketStats', pairId],
    queryFn: async () => {
      const response = await getMarketStats(pairId);
      return response.data;
    },
    enabled: !!pairId,
    refetchInterval: 30000,
  });
}

export function useTWAP(pairId: string, interval?: string) {
  return useQuery({
    queryKey: ['twap', pairId, interval],
    queryFn: async () => {
      const response = await getTWAP(pairId, interval);
      return response.data;
    },
    enabled: !!pairId,
    refetchInterval: 60000,
  });
}

// ============================================================================
// Governance Hooks
// ============================================================================

export function useProposals(params?: {
  status?: string;
  category?: string;
  page?: number;
  per_page?: number;
}) {
  return useQuery({
    queryKey: ['proposals', params],
    queryFn: async () => {
      const response = await getProposals(params);
      return response.data;
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function useProposal(proposalId: string) {
  return useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: async () => {
      const response = await getProposal(proposalId);
      return response.data;
    },
    enabled: !!proposalId,
    refetchInterval: 15000,
  });
}

export function useProposalVotes(proposalId: string, page?: number) {
  return useQuery({
    queryKey: ['proposalVotes', proposalId, page],
    queryFn: async () => {
      const response = await getProposalVotes(proposalId, { page });
      return response.data;
    },
    enabled: !!proposalId,
    refetchInterval: 30000,
  });
}

export function useVotingPower(address: string | undefined) {
  return useQuery({
    queryKey: ['votingPower', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getVotingPower(address);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 60000,
  });
}

export function useDelegations(address: string | undefined) {
  return useQuery({
    queryKey: ['delegations', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getDelegations(address);
      return response.data.delegations;
    },
    enabled: !!address,
    refetchInterval: 60000,
  });
}

export function useGovernanceStats() {
  return useQuery({
    queryKey: ['governanceStats'],
    queryFn: async () => {
      const response = await getGovernanceStats();
      return response.data;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useCouncilMembers() {
  return useQuery({
    queryKey: ['councilMembers'],
    queryFn: async () => {
      const response = await getCouncilMembers();
      return response.data.members;
    },
    staleTime: 300000, // 5 minutes
  });
}

// Combined hook for governance dashboard
export function useGovernanceDashboard(address?: string) {
  const proposals = useProposals({ status: 'active' });
  const stats = useGovernanceStats();
  const votingPower = useVotingPower(address);

  return {
    proposals: proposals.data?.proposals || [],
    stats: stats.data,
    votingPower: votingPower.data,
    isLoading: proposals.isLoading || stats.isLoading,
    isError: proposals.isError || stats.isError,
    refetch: () => {
      proposals.refetch();
      stats.refetch();
      if (address) votingPower.refetch();
    },
  };
}

// ============================================================================
// Privacy Hooks
// ============================================================================

export function usePrivacyAccount(address: string | undefined) {
  return useQuery({
    queryKey: ['privacyAccount', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getPrivacyAccount(address);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 30000,
  });
}

export function usePrivateBalance(address: string | undefined, token?: string) {
  return useQuery({
    queryKey: ['privateBalance', address, token],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getPrivateBalance(address, token);
      return response.data;
    },
    enabled: !!address,
    refetchInterval: 30000,
  });
}

export function usePrivacyPools() {
  return useQuery({
    queryKey: ['privacyPools'],
    queryFn: async () => {
      const response = await getPrivacyPools();
      return response.data.pools;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function usePrivacyStats() {
  return useQuery({
    queryKey: ['privacyStats'],
    queryFn: async () => {
      const response = await getPrivacyStats();
      return response.data;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

// ============================================================================
// Stealth Address Hooks
// ============================================================================

/**
 * Hook for fetching stealth meta-address (viewing + spending public keys)
 */
export function useStealthMetaAddress(address: string | undefined) {
  return useQuery({
    queryKey: ['stealthMetaAddress', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getStealthMetaAddress(address);
      return response.data;
    },
    enabled: !!address,
    staleTime: 300000, // 5 minutes - meta address doesn't change often
  });
}

/**
 * Hook for fetching stealth payments for an address
 */
export function useStealthPayments(address: string | undefined, params?: {
  status?: 'all' | 'unclaimed' | 'claimed';
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['stealthPayments', address, params],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getStealthPayments(address, params);
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for scanning for new stealth payments
 */
export function useScanStealthPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, timeRange }: { address: string; timeRange: string }) => {
      const response = await scanStealthPayments(address, { time_range: timeRange });
      return response.data;
    },
    onSuccess: (_, { address }) => {
      // Invalidate stealth payments query to refresh list
      queryClient.invalidateQueries({ queryKey: ['stealthPayments', address] });
    },
  });
}

/**
 * Hook for claiming stealth payments
 */
export function useClaimStealthPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, paymentIds }: { address: string; paymentIds: string[] }) => {
      const response = await claimStealthPayments(address, { payment_ids: paymentIds });
      return response.data;
    },
    onSuccess: (_, { address }) => {
      // Invalidate stealth payments and wallet queries
      queryClient.invalidateQueries({ queryKey: ['stealthPayments', address] });
      queryClient.invalidateQueries({ queryKey: ['privateBalance', address] });
      queryClient.invalidateQueries({ queryKey: ['walletActivity', address] });
    },
  });
}

/**
 * Combined hook for stealth addresses page
 */
export function useStealthPageData(address?: string) {
  const metaAddress = useStealthMetaAddress(address);
  const payments = useStealthPayments(address);
  const scanMutation = useScanStealthPayments();
  const claimMutation = useClaimStealthPayments();

  return {
    metaAddress: metaAddress.data,
    payments: payments.data?.payments || [],
    totalPayments: payments.data?.total || 0,
    unclaimedCount: payments.data?.unclaimed_count || 0,
    totalUnclaimedValue: payments.data?.total_unclaimed_value || '0',
    isLoading: metaAddress.isLoading || payments.isLoading,
    isError: metaAddress.isError || payments.isError,
    scan: scanMutation.mutate,
    isScanning: scanMutation.isPending,
    scanResult: scanMutation.data,
    claim: claimMutation.mutate,
    isClaiming: claimMutation.isPending,
    claimResult: claimMutation.data,
    refetch: () => {
      metaAddress.refetch();
      payments.refetch();
    },
  };
}

// ============================================================================
// WebSocket Hooks (Real-time updates from DEV 1's indexer)
// ============================================================================

/**
 * Hook for real-time trading updates via WebSocket
 * Connects to /ws/trading endpoint with optional pair_id filter
 */
export function useWebSocketTrading(pairId?: string, address?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<TradingWsMessage | null>(null);
  const clientRef = useRef<ReturnType<typeof createTradingWsClient> | null>(null);

  useEffect(() => {
    const client = createTradingWsClient(pairId, address);
    clientRef.current = client;

    client.connect();

    const unsubscribe = client.subscribe((message) => {
      setLastMessage(message);

      // Invalidate relevant queries based on event type
      switch (message.type) {
        case 'order_placed':
        case 'order_updated':
          queryClient.invalidateQueries({ queryKey: ['orderBook', pairId] });
          queryClient.invalidateQueries({ queryKey: ['userOrders', address] });
          break;
        case 'trade_executed':
          queryClient.invalidateQueries({ queryKey: ['orderBook', pairId] });
          queryClient.invalidateQueries({ queryKey: ['tradeHistory', pairId] });
          queryClient.invalidateQueries({ queryKey: ['marketStats', pairId] });
          break;
      }
    });

    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(client.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      client.disconnect();
    };
  }, [pairId, address, queryClient]);

  return { isConnected, lastMessage };
}

/**
 * Hook for real-time governance updates via WebSocket
 * Connects to /ws/governance endpoint with optional proposal_id filter
 */
export function useWebSocketGovernance(proposalId?: string, address?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<GovernanceWsMessage | null>(null);
  const clientRef = useRef<ReturnType<typeof createGovernanceWsClient> | null>(null);

  useEffect(() => {
    const client = createGovernanceWsClient(proposalId, address);
    clientRef.current = client;

    client.connect();

    const unsubscribe = client.subscribe((message) => {
      setLastMessage(message);

      // Invalidate relevant queries based on event type
      switch (message.type) {
        case 'proposal_created':
          queryClient.invalidateQueries({ queryKey: ['proposals'] });
          queryClient.invalidateQueries({ queryKey: ['governanceStats'] });
          break;
        case 'vote_cast':
          queryClient.invalidateQueries({ queryKey: ['proposals'] });
          if (message.data.proposal_id) {
            queryClient.invalidateQueries({ queryKey: ['proposal', message.data.proposal_id] });
            queryClient.invalidateQueries({ queryKey: ['proposalVotes', message.data.proposal_id] });
          }
          break;
      }
    });

    const interval = setInterval(() => {
      setIsConnected(client.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      client.disconnect();
    };
  }, [proposalId, address, queryClient]);

  return { isConnected, lastMessage };
}

/**
 * Hook for real-time privacy updates via WebSocket
 * Connects to /ws/privacy endpoint filtered by address
 */
export function useWebSocketPrivacy(address?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<PrivacyWsMessage | null>(null);
  const clientRef = useRef<ReturnType<typeof createPrivacyWsClient> | null>(null);

  useEffect(() => {
    if (!address) return;

    const client = createPrivacyWsClient(address);
    clientRef.current = client;

    client.connect();

    const unsubscribe = client.subscribe((message) => {
      setLastMessage(message);

      // Invalidate privacy-related queries
      queryClient.invalidateQueries({ queryKey: ['privacyAccount', address] });
      queryClient.invalidateQueries({ queryKey: ['privateBalance', address] });
      queryClient.invalidateQueries({ queryKey: ['privacyPools'] });
    });

    const interval = setInterval(() => {
      setIsConnected(client.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      client.disconnect();
    };
  }, [address, queryClient]);

  return { isConnected, lastMessage };
}

/**
 * Hook for real-time staking updates via WebSocket
 * Connects to /ws/staking endpoint filtered by address
 */
export function useWebSocketStaking(address?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<StakingWsMessage | null>(null);
  const clientRef = useRef<ReturnType<typeof createStakingWsClient> | null>(null);

  useEffect(() => {
    if (!address) return;

    const client = createStakingWsClient(address);
    clientRef.current = client;

    client.connect();

    const unsubscribe = client.subscribe((message) => {
      setLastMessage(message);

      // Invalidate staking-related queries
      queryClient.invalidateQueries({ queryKey: ['stakeInfo', address] });
      queryClient.invalidateQueries({ queryKey: ['validatorStatus'] });
    });

    const interval = setInterval(() => {
      setIsConnected(client.isConnected());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      client.disconnect();
    };
  }, [address, queryClient]);

  return { isConnected, lastMessage };
}

/**
 * Combined hook for trading page with real-time updates
 */
export function useTradingWithWebSocket(pairId: string, address?: string) {
  const orderBook = useOrderBook(pairId);
  const marketStats = useMarketStats(pairId);
  const tradeHistory = useTradeHistory(pairId, 20);
  const userOrders = useUserOrders(address);
  const { isConnected, lastMessage } = useWebSocketTrading(pairId, address);

  return {
    orderBook: orderBook.data,
    marketStats: marketStats.data,
    tradeHistory: tradeHistory.data,
    userOrders: userOrders.data,
    isLoading: orderBook.isLoading || marketStats.isLoading,
    isError: orderBook.isError || marketStats.isError,
    wsConnected: isConnected,
    lastWsMessage: lastMessage,
    refetch: () => {
      orderBook.refetch();
      marketStats.refetch();
      tradeHistory.refetch();
      if (address) userOrders.refetch();
    },
  };
}

/**
 * Combined hook for governance page with real-time updates
 */
export function useGovernanceWithWebSocket(address?: string, proposalId?: string) {
  const proposals = useProposals();
  const stats = useGovernanceStats();
  const votingPower = useVotingPower(address);
  const { isConnected, lastMessage } = useWebSocketGovernance(proposalId, address);

  return {
    proposals: proposals.data?.proposals || [],
    stats: stats.data,
    votingPower: votingPower.data,
    isLoading: proposals.isLoading || stats.isLoading,
    isError: proposals.isError || stats.isError,
    wsConnected: isConnected,
    lastWsMessage: lastMessage,
    refetch: () => {
      proposals.refetch();
      stats.refetch();
      if (address) votingPower.refetch();
    },
  };
}

// ============================================================================
// Earnings & Wallet Activity Hooks
// ============================================================================

/**
 * Hook for fetching earnings summary
 */
export function useEarningsSummary(address?: string) {
  return useQuery({
    queryKey: ['earningsSummary', address],
    queryFn: async () => {
      if (!address) return null;
      const response = await getEarningsSummary(address);
      return response.data;
    },
    enabled: !!address,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching earnings history with pagination
 */
export function useEarningsHistory(address?: string, params?: {
  payment_type?: string;
  token?: string;
  period?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['earningsHistory', address, params],
    queryFn: async () => {
      if (!address) return null;
      const response = await getEarningsHistory(address, params);
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
  });
}

/**
 * Hook for fetching earnings chart data
 */
export function useEarningsChart(address?: string, period?: string) {
  return useQuery({
    queryKey: ['earningsChart', address, period],
    queryFn: async () => {
      if (!address) return null;
      const response = await getEarningsChart(address, { period });
      return response.data;
    },
    enabled: !!address,
    staleTime: 60000,
  });
}

/**
 * Hook for fetching transfer history (privacy transfers)
 */
export function useTransferHistory(address?: string, params?: {
  limit?: number;
  offset?: number;
  transfer_type?: string;
}) {
  return useQuery({
    queryKey: ['transferHistory', address, params],
    queryFn: async () => {
      if (!address) return [];
      const response = await getTransferHistory(address, params);
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
  });
}

/**
 * Hook for fetching combined wallet activity (transfers + earnings)
 */
export function useWalletActivity(address?: string, limit = 20) {
  return useQuery({
    queryKey: ['walletActivity', address, limit],
    queryFn: async () => {
      if (!address) return [];
      return await getWalletActivity(address, limit);
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Combined hook for wallet page with real-time updates via privacy WebSocket
 */
export function useWalletWithWebSocket(address?: string) {
  const queryClient = useQueryClient();
  const activity = useWalletActivity(address, 20);
  const earnings = useEarningsSummary(address);
  const transfers = useTransferHistory(address, { limit: 10 });
  const privacyAccount = usePrivacyAccount(address);
  const { isConnected, lastMessage } = useWebSocketPrivacy(address);

  // Invalidate cache on relevant WebSocket events
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'privacy_event') {
        queryClient.invalidateQueries({ queryKey: ['walletActivity', address] });
        queryClient.invalidateQueries({ queryKey: ['transferHistory', address] });
        queryClient.invalidateQueries({ queryKey: ['earningsSummary', address] });
      }
    }
  }, [lastMessage, queryClient, address]);

  return {
    activity: activity.data || [],
    earnings: earnings.data,
    transfers: transfers.data || [],
    privacyAccount: privacyAccount.data,
    isLoading: activity.isLoading || earnings.isLoading,
    isError: activity.isError || earnings.isError,
    wsConnected: isConnected,
    lastWsMessage: lastMessage,
    refetch: () => {
      activity.refetch();
      earnings.refetch();
      transfers.refetch();
      if (address) privacyAccount.refetch();
    },
  };
}

// ============================================================================
// Jobs Analytics Hooks
// ============================================================================

/**
 * Hook for fetching jobs chart data (7-day view)
 */
export function useJobsChartData() {
  return useQuery({
    queryKey: ['jobsChartData'],
    queryFn: async () => {
      return await getJobsChartData();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching detailed job analytics from database
 */
export function useJobDbAnalytics() {
  return useQuery({
    queryKey: ['jobDbAnalytics'],
    queryFn: async () => {
      const response = await getJobDbAnalytics();
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

// ============================================================================
// Database-backed Hooks (DEV 1 Production APIs)
// ============================================================================

import {
  getJobsFromDb,
  getJobFromDb,
  getProofsFromDb,
  getProofFromDb,
  getProofDbStats,
  getProofDetail,
  ProofDetail,
  // Send page
  getRecentTransfers,
  getSavedContacts,
  saveContact,
  getMultiAssetBalances,
  RecentTransfer,
  SavedContact,
  MultiAssetBalance,
  getStakingDbStats,
  getStakingHistory,
  getStakingLeaderboard,
  getNetworkEarningsStats,
  getWorkerEarnings,
  getEarningsLeaderboard,
  getWalletDbTransactions,
  getWalletDbSummary,
  getJobDetailFromDb,
  getJobTimelineFromDb,
  JobDbRecord,
  JobDbListResponse,
  JobTimelineEvent,
  JobDbDetailResponse,
  ProofDbRecord,
  ProofDbListResponse,
  ProofDbStats,
  StakingDbStats,
  StakingHistoryResponse,
  StakingLeaderboardEntry,
  NetworkEarningsStats,
  WorkerEarningsRecord,
  EarningsLeaderboardEntry,
  WalletDbTransaction,
  WalletDbTransactionsResponse,
  WalletDbSummary,
  getNetworkStatsHistory,
  getNetworkStatsChart,
  getNetworkGrowthMetrics,
  NetworkStatsSnapshot,
  NetworkStatsHistoryResponse,
  NetworkChartPoint,
  NetworkChartResponse,
  NetworkGrowthMetrics,
} from '../api/client';

/**
 * Hook for fetching jobs from database with pagination and filters
 */
export function useJobsFromDb(params?: {
  page?: number;
  limit?: number;
  status?: string;
  client?: string;
  worker?: string;
  job_type?: string;
}) {
  return useQuery({
    queryKey: ['jobsDb', params],
    queryFn: async () => {
      const response = await getJobsFromDb(params);
      return response.data;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

/**
 * Hook for fetching a single job from database
 */
export function useJobFromDb(jobId: string) {
  return useQuery({
    queryKey: ['jobDb', jobId],
    queryFn: async () => {
      const response = await getJobFromDb(jobId);
      return response.data;
    },
    enabled: !!jobId,
    staleTime: 10000,
  });
}

/**
 * Hook for fetching job detail with timeline from database
 */
export function useJobDetailFromDb(jobId?: string) {
  return useQuery({
    queryKey: ['jobDetailDb', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const response = await getJobDetailFromDb(jobId);
      return response.data;
    },
    enabled: !!jobId,
    staleTime: 10000,
  });
}

/**
 * Hook for fetching job timeline events
 */
export function useJobTimeline(jobId?: string) {
  return useQuery({
    queryKey: ['jobTimeline', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const response = await getJobTimelineFromDb(jobId);
      return response.data;
    },
    enabled: !!jobId,
    staleTime: 15000,
  });
}

/**
 * Hook for fetching recent jobs from database (for dashboard)
 */
export function useRecentJobsFromDb(limit: number = 5) {
  return useQuery({
    queryKey: ['recentJobsDb', limit],
    queryFn: async () => {
      const response = await getRecentJobsFromDb(limit);
      return response.data.jobs;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

/**
 * Hook for fetching dashboard stats from database
 */
export function useDashboardDbStats() {
  return useQuery({
    queryKey: ['dashboardDbStats'],
    queryFn: async () => {
      const response = await getDashboardStatsFromDb();
      return response.data;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Combined dashboard hook with database integration
 */
export function useDashboardWithDb() {
  const validatorStatus = useValidatorStatus();
  const gpuMetrics = useGPUMetrics();
  const dbStats = useDashboardDbStats();
  const recentJobs = useRecentJobsFromDb(5);
  const { isConnected } = useWebSocket();

  return {
    validatorStatus: validatorStatus.data,
    gpuMetrics: gpuMetrics.data,
    dbStats: dbStats.data,
    recentJobs: recentJobs.data,
    isLoading: validatorStatus.isLoading || gpuMetrics.isLoading || dbStats.isLoading || recentJobs.isLoading,
    isError: validatorStatus.isError || gpuMetrics.isError || dbStats.isError || recentJobs.isError,
    isConnected,
    refetch: () => {
      validatorStatus.refetch();
      gpuMetrics.refetch();
      dbStats.refetch();
      recentJobs.refetch();
    },
  };
}

/**
 * Hook for fetching proofs from database with pagination
 */
export function useProofsFromDb(params?: {
  page?: number;
  limit?: number;
  worker_id?: string;
  job_id?: string;
  is_valid?: boolean;
}) {
  return useQuery({
    queryKey: ['proofsDb', params],
    queryFn: async () => {
      const response = await getProofsFromDb(params);
      return response.data;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

/**
 * Hook for fetching a single proof from database
 */
export function useProofFromDb(proofId: string) {
  return useQuery({
    queryKey: ['proofDb', proofId],
    queryFn: async () => {
      const response = await getProofFromDb(proofId);
      return response.data;
    },
    enabled: !!proofId,
    staleTime: 10000,
  });
}

/**
 * Hook for fetching proof statistics from database
 */
export function useProofDbStats() {
  return useQuery({
    queryKey: ['proofDbStats'],
    queryFn: async () => {
      const response = await getProofDbStats();
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching detailed proof information (for /proofs/[id] page)
 */
export function useProofDetail(proofId: string | undefined) {
  return useQuery({
    queryKey: ['proofDetail', proofId],
    queryFn: async () => {
      if (!proofId) throw new Error('No proof ID provided');
      const response = await getProofDetail(proofId);
      return response.data;
    },
    enabled: !!proofId,
    staleTime: 10000,
    // Refetch every 5 seconds for generating proofs
    refetchInterval: (query) => {
      const data = query.state.data as ProofDetail | undefined;
      return data?.status === 'generating' ? 5000 : false;
    },
  });
}

// ============================================================================
// Send Page Hooks
// ============================================================================

/**
 * Hook for fetching recent outgoing transfers
 */
export function useRecentTransfers(address: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['recentTransfers', address, limit],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getRecentTransfers(address, { limit });
      return response.data.transfers;
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching saved contacts
 */
export function useSavedContacts(address: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['savedContacts', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getSavedContacts(address);
      return response.data.contacts;
    },
    enabled: !!address,
    staleTime: 300000, // 5 minutes - contacts don't change often
  });

  const addContact = useMutation({
    mutationFn: async ({ name, contactAddress }: { name: string; contactAddress: string }) => {
      if (!address) throw new Error('No address provided');
      const response = await saveContact(address, { name, contact_address: contactAddress });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedContacts', address] });
    },
  });

  return {
    contacts: query.data || [],
    isLoading: query.isLoading,
    addContact: addContact.mutate,
    isAddingContact: addContact.isPending,
  };
}

/**
 * Hook for fetching multi-asset balances
 */
export function useMultiAssetBalances(address: string | undefined) {
  return useQuery({
    queryKey: ['multiAssetBalances', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getMultiAssetBalances(address);
      return response.data.balances;
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Combined hook for send page data
 */
export function useSendPageData(address: string | undefined) {
  const recentTransfers = useRecentTransfers(address);
  const { contacts, isLoading: contactsLoading, addContact } = useSavedContacts(address);
  const multiAssetBalances = useMultiAssetBalances(address);

  return {
    recentTransfers: recentTransfers.data || [],
    isLoadingTransfers: recentTransfers.isLoading,
    contacts,
    isLoadingContacts: contactsLoading,
    addContact,
    assetBalances: multiAssetBalances.data || [],
    isLoadingBalances: multiAssetBalances.isLoading,
  };
}

/**
 * Hook for fetching staking statistics from database
 */
export function useStakingDbStats() {
  return useQuery({
    queryKey: ['stakingDbStats'],
    queryFn: async () => {
      const response = await getStakingDbStats();
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching staking history for an address
 */
export function useStakingHistoryDb(address: string | undefined, params?: {
  page?: number;
  limit?: number;
  event_type?: string;
}) {
  return useQuery({
    queryKey: ['stakingHistoryDb', address, params],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getStakingHistory(address, params);
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching staking leaderboard
 */
export function useStakingLeaderboard(params?: {
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['stakingLeaderboard', params],
    queryFn: async () => {
      const response = await getStakingLeaderboard(params);
      return response.data.leaderboard;
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

/**
 * Hook for fetching network-wide earnings statistics
 */
export function useNetworkEarningsStats() {
  return useQuery({
    queryKey: ['networkEarningsStats'],
    queryFn: async () => {
      const response = await getNetworkEarningsStats();
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching worker-specific earnings
 */
export function useWorkerEarnings(address: string | undefined) {
  return useQuery({
    queryKey: ['workerEarnings', address],
    queryFn: async () => {
      if (!address) throw new Error('No address provided');
      const response = await getWorkerEarnings(address);
      return response.data;
    },
    enabled: !!address,
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching earnings leaderboard
 */
export function useEarningsLeaderboard(params?: {
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['earningsLeaderboard', params],
    queryFn: async () => {
      const response = await getEarningsLeaderboard(params);
      return response.data.leaderboard;
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

/**
 * Combined hook for jobs page with database data
 */
export function useJobsPageData(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const jobs = useJobsFromDb(params);
  const analytics = useJobDbAnalytics();
  const chartData = useJobsChartData();

  return {
    jobs: jobs.data?.jobs || [],
    total: jobs.data?.total || 0,
    hasMore: jobs.data?.has_more || false,
    analytics: analytics.data,
    chartData: chartData.data,
    isLoading: jobs.isLoading || analytics.isLoading,
    isError: jobs.isError || analytics.isError,
    refetch: () => {
      jobs.refetch();
      analytics.refetch();
      chartData.refetch();
    },
  };
}

/**
 * Combined hook for proofs page with database data
 */
export function useProofsPageData(params?: {
  page?: number;
  limit?: number;
  worker_id?: string;
}) {
  const proofs = useProofsFromDb(params);
  const stats = useProofDbStats();

  return {
    proofs: proofs.data?.proofs || [],
    total: proofs.data?.total || 0,
    stats: stats.data,
    isLoading: proofs.isLoading || stats.isLoading,
    isError: proofs.isError || stats.isError,
    refetch: () => {
      proofs.refetch();
      stats.refetch();
    },
  };
}

/**
 * Combined hook for staking page with database data and real-time updates
 */
export function useStakingPageData(address?: string) {
  const stats = useStakingDbStats();
  const history = useStakingHistoryDb(address, { limit: 20 });
  const leaderboard = useStakingLeaderboard({ limit: 10 });
  const { isConnected, lastMessage } = useWebSocketStaking(address);

  return {
    stats: stats.data,
    history: history.data?.events || [],
    leaderboard: leaderboard.data || [],
    isLoading: stats.isLoading,
    isError: stats.isError,
    wsConnected: isConnected,
    lastWsMessage: lastMessage,
    refetch: () => {
      stats.refetch();
      if (address) history.refetch();
      leaderboard.refetch();
    },
  };
}

/**
 * Combined hook for earnings page with database data
 */
export function useEarningsPageData(address?: string) {
  const networkStats = useNetworkEarningsStats();
  const workerEarnings = useWorkerEarnings(address);
  const leaderboard = useEarningsLeaderboard({ limit: 10 });
  const chart = useEarningsChart(address, '30d');

  return {
    networkStats: networkStats.data,
    workerEarnings: workerEarnings.data,
    leaderboard: leaderboard.data || [],
    chartData: chart.data,
    isLoading: networkStats.isLoading || (address && workerEarnings.isLoading),
    isError: networkStats.isError,
    refetch: () => {
      networkStats.refetch();
      if (address) workerEarnings.refetch();
      leaderboard.refetch();
      if (address) chart.refetch();
    },
  };
}

// ============================================================================
// Wallet Database Hooks (Combined Transaction History)
// ============================================================================

/**
 * Hook for fetching wallet transactions from database (payments + private transfers)
 */
export function useWalletDbTransactions(address?: string, params?: {
  tx_type?: string;
  period?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['walletDbTransactions', address, params],
    queryFn: async () => {
      if (!address) return { transactions: [], total: 0, page: 1, limit: 50 };
      const response = await getWalletDbTransactions(address, params);
      return response.data;
    },
    enabled: !!address,
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

/**
 * Hook for fetching wallet summary from database
 */
export function useWalletDbSummary(address?: string) {
  return useQuery({
    queryKey: ['walletDbSummary', address],
    queryFn: async () => {
      if (!address) return null;
      const response = await getWalletDbSummary(address);
      return response.data;
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Combined hook for wallet page with database-backed transaction history
 */
export function useWalletPageData(address?: string) {
  const queryClient = useQueryClient();
  const transactions = useWalletDbTransactions(address, { limit: 50 });
  const summary = useWalletDbSummary(address);
  const earnings = useEarningsSummary(address);
  const { isConnected, lastMessage } = useWebSocketPrivacy(address);

  // Invalidate cache on relevant WebSocket events
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'privacy_event') {
        queryClient.invalidateQueries({ queryKey: ['walletDbTransactions', address] });
        queryClient.invalidateQueries({ queryKey: ['walletDbSummary', address] });
        queryClient.invalidateQueries({ queryKey: ['earningsSummary', address] });
      }
    }
  }, [lastMessage, queryClient, address]);

  return {
    transactions: transactions.data?.transactions || [],
    totalTransactions: transactions.data?.total || 0,
    summary: summary.data,
    earnings: earnings.data,
    isLoading: transactions.isLoading || summary.isLoading,
    isError: transactions.isError || summary.isError,
    wsConnected: isConnected,
    lastWsMessage: lastMessage,
    refetch: () => {
      transactions.refetch();
      summary.refetch();
      if (address) earnings.refetch();
    },
  };
}

// ============================================================================
// Network Database Hooks (Historical Stats & Charts)
// ============================================================================

/**
 * Hook for fetching network stats history
 */
export function useNetworkStatsHistory(period: string = '24h', limit: number = 100) {
  return useQuery({
    queryKey: ['networkStatsHistory', period, limit],
    queryFn: async () => {
      const response = await getNetworkStatsHistory({ period, limit });
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });
}

/**
 * Hook for fetching network chart data
 */
export function useNetworkStatsChart(period: string = '7d') {
  return useQuery({
    queryKey: ['networkStatsChart', period],
    queryFn: async () => {
      const response = await getNetworkStatsChart({ period });
      return response.data;
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

/**
 * Hook for fetching network growth metrics
 */
export function useNetworkGrowthMetrics() {
  return useQuery({
    queryKey: ['networkGrowthMetrics'],
    queryFn: async () => {
      const response = await getNetworkGrowthMetrics();
      return response.data;
    },
    staleTime: 300000,  // 5 minutes
    refetchInterval: 300000,
  });
}

/**
 * Combined hook for network page with historical data
 */
export function useNetworkPageData() {
  const chart = useNetworkStatsChart('7d');
  const growth = useNetworkGrowthMetrics();
  const history = useNetworkStatsHistory('24h', 50);

  return {
    chartData: chart.data?.data || [],
    growthMetrics: growth.data,
    recentSnapshots: history.data?.snapshots || [],
    latestSnapshot: history.data?.latest,
    isLoading: chart.isLoading || growth.isLoading,
    isError: chart.isError || growth.isError,
    refetch: () => {
      chart.refetch();
      growth.refetch();
      history.refetch();
    },
  };
}

