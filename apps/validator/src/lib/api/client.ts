/**
 * BitSage API Client
 *
 * Centralized API client for communicating with the BitSage Network coordinator.
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { retryQueue } from './retryQueue';
import { getConfig } from '@/lib/env';

// Re-export retryQueue for components that need direct access
export { retryQueue };

// API configuration from centralized env config
const API_BASE_URL = getConfig().apiUrl;
const WS_URL = getConfig().wsUrl;

// Debug logging - no-op to keep callers working without console output
const debugLog = (_message: string, ..._args: unknown[]) => {};

// Create axios instance with defaults
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth and logging
apiClient.interceptors.request.use(
  (config) => {
    // Add wallet address to headers if available (for authenticated requests)
    const walletAddress = typeof window !== 'undefined'
      ? localStorage.getItem('wallet_address')
      : null;

    if (walletAddress) {
      config.headers['X-Wallet-Address'] = walletAddress;
    }

    debugLog(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const message = (error.response?.data as { error?: string })?.error || error.message;

    // Check if error is due to network/offline issue
    const isNetworkError = !error.response && (
      error.message === 'Network Error' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      !navigator.onLine
    );

    // Only queue GET and safe idempotent requests when offline
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(
      error.config?.method?.toUpperCase() || ''
    );

    if (isNetworkError && isSafeMethod && error.config) {
      // Queue the request for retry when back online
      return new Promise((resolve, reject) => {
        const requestId = retryQueue.enqueue(error.config!, resolve, reject);
        debugLog(`[API] Request queued (${requestId}): ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
      });
    }

    // Handle specific error codes (silent — errors propagated via rejection)
    if (status === 401) {
      // Unauthorized — could redirect to login
    } else if (status === 429) {
      // Rate limited — caller should handle retry
    }

    return Promise.reject(error);
  }
);

// Function to process retry queue when back online
export async function processRetryQueue() {
  if (retryQueue.size > 0) {
    debugLog(`[API] Processing retry queue (${retryQueue.size} requests)`);
    await retryQueue.processQueue((config) => apiClient.request(config));
    debugLog('[API] Retry queue processed');
  }
}

// Listen for online event to process queue
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    debugLog('[API] Connection restored, processing retry queue');
    processRetryQueue();
  });
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ValidatorStatus {
  is_active: boolean;
  staked_amount: string;
  total_earnings: string;
  pending_rewards: string;
  jobs_completed: number;
  jobs_in_progress: number;
  reputation: number;
}

export interface GPUMetrics {
  id: string;
  name: string;
  model: string;
  vram: number;
  temperature: number;
  utilization: number;
  power_draw: number;
  memory_used: number;
  memory_total: number;
  status: 'active' | 'idle' | 'offline';
  current_job?: string;
}

export interface JobInfo {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  worker_id?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  proof_hash?: string;
  earnings?: string;
  gpu_used?: string;
  duration_secs?: number;
  error?: string;
}

export interface JobsResponse {
  jobs: JobInfo[];
  total: number;
  page: number;
  per_page: number;
}

export interface ProofInfo {
  id: string;
  job_id: string;
  status: 'generating' | 'verifying' | 'verified' | 'failed';
  proof_hash: string;
  verification_tx?: string;
  created_at: string;
  verified_at?: string;
  proof_size_bytes: number;
  generation_time_ms: number;
  fri_layers: number;
  circuit_type: string;
}

export interface NetworkStats {
  total_workers: number;
  active_workers: number;
  total_jobs_completed: number;
  jobs_in_progress: number;
  total_proofs_verified: number;
  average_proof_time_ms: number;
  network_utilization: number;
  total_staked: string;
}

export interface FaucetStatus {
  can_claim: boolean;
  time_until_next_claim_secs: number;
  claim_amount: string;
  claim_amount_formatted: string;
  total_claimed: string;
  total_claimed_formatted: string;
}

export interface FaucetClaimResponse {
  success: boolean;
  amount: string;
  amount_formatted: string;
  transaction_hash: string;
  message: string;
}

export interface FaucetConfig {
  enabled: boolean;
  claim_amount: string;
  claim_amount_formatted: string;
  cooldown_secs: number;
  cooldown_formatted: string;
  network: string;
}

export interface FaucetClaimHistoryItem {
  id: string;
  amount: string;
  amount_formatted: string;
  claim_type: string;
  claimed_at: number;
  tx_hash: string;
}

export interface FaucetClaimHistoryResponse {
  claims: FaucetClaimHistoryItem[];
  total_claims: number;
  total_claimed: string;
  total_claimed_formatted: string;
}

export interface StakingInfo {
  staked_amount: string;
  stake_tier: string;
  pending_rewards: string;
  lock_end_timestamp?: number;
  can_unstake: boolean;
}

export interface RewardsInfo {
  pending: string;
  claimed_total: string;
  last_claim_timestamp?: number;
  estimated_daily: string;
}

// ============================================================================
// Price Feed API Types
// ============================================================================

export interface TokenPrice {
  token: string;
  symbol: string;
  price_usd: number;
  price_change_24h: number;
  price_change_pct_24h: number;
  volume_24h: number;
  market_cap?: number;
  last_updated: string;
  source: 'pragma' | 'coingecko' | 'internal' | 'fallback';
}

export interface TokenPricesResponse {
  prices: TokenPrice[];
  timestamp: string;
}

// ============================================================================
// Trading/OTC API Types
// ============================================================================

export interface TradingPair {
  id: string;
  base: string;
  quote: string;
  base_address: string;
  quote_address: string;
  min_order_size: string;
  tick_size: string;
  is_active: boolean;
}

export interface OrderLevel {
  price: string;
  amount: string;
  total: string;
  order_count: number;
}

export interface OrderBookResponse {
  pair_id: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  spread: string;
  mid_price: string;
  last_updated: string;
}

export interface Order {
  id: string;
  pair_id: string;
  trader: string;
  side: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  price: string;
  amount: string;
  filled_amount: string;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  pair_id: string;
  maker_order_id: string;
  taker_order_id: string;
  maker: string;
  taker: string;
  price: string;
  amount: string;
  side: 'buy' | 'sell';
  fee: string;
  executed_at: string;
  tx_hash: string;
}

export interface MarketStats {
  pair_id: string;
  last_price: string;
  price_change_24h: string;
  price_change_pct: number;
  high_24h: string;
  low_24h: string;
  volume_24h: string;
  volume_quote_24h: string;
  trade_count_24h: number;
  open_price: string;
}

export interface TWAPData {
  pair_id: string;
  interval: string;
  twap_price: string;
  data_points: { timestamp: string; price: string }[];
}

// ============================================================================
// Governance API Types
// ============================================================================

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: 'pending' | 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled';
  votes_for: string;
  votes_against: string;
  quorum: string;
  start_time: number;
  end_time: number;
  category: string;
  actions?: ProposalAction[];
  created_at: string;
  executed_at?: string;
}

export interface ProposalAction {
  target: string;
  selector: string;
  calldata: string[];
  description: string;
}

export interface VoteRecord {
  proposal_id: string;
  voter: string;
  support: boolean;
  weight: string;
  reason?: string;
  voted_at: string;
  tx_hash: string;
}

export interface VotingPower {
  address: string;
  balance: string;
  delegated_to_me: string;
  delegated_away: string;
  total_voting_power: string;
  delegate?: string;
}

export interface DelegationInfo {
  delegator: string;
  delegate: string;
  amount: string;
  delegated_at: string;
}

export interface GovernanceStats {
  total_proposals: number;
  active_proposals: number;
  passed_proposals: number;
  rejected_proposals: number;
  total_votes_cast: number;
  total_voting_power: string;
  participation_rate: number;
}

export interface CouncilMember {
  address: string;
  name: string;
  role: string;
  voting_power: string;
  proposals_created: number;
  votes_cast: number;
  joined_at: string;
}

// ============================================================================
// Privacy API Types
// ============================================================================

export interface PrivacyAccount {
  address: string;
  is_registered: boolean;
  public_key_x?: string;
  public_key_y?: string;
  encrypted_balance?: string;
  pending_deposits: number;
  pending_withdrawals: number;
  created_at?: string;
}

export interface PrivacyPoolInfo {
  pool_id: string;
  token_address: string;
  token_symbol: string;
  total_deposits: string;
  total_depositors: number;
  merkle_root: string;
  anonymity_set_size: number;
}

export interface PrivacyStats {
  total_private_deposits: string;
  total_private_withdrawals: string;
  total_private_transfers: number;
  active_privacy_accounts: number;
  total_pools: number;
  average_anonymity_set: number;
  largest_anonymity_set: number;
  total_stealth_addresses: number;
  total_worker_payments: number;
}

// ============================================================================
// Privacy Network Graph Types
// ============================================================================

export interface NetworkGraphNode {
  id: string;
  type: 'you' | 'pool' | 'validator' | 'client';
  label: string;
  x: number;
  y: number;
  // Type-specific data
  balance?: string;
  tvl?: string;
  validators?: number;
  earnings?: string;
  uptime?: string;
  jobs?: number;
  spent?: string;
  isPrivate?: boolean;
}

export interface NetworkGraphEdge {
  from: string;
  to: string;
  type: 'stake' | 'delegation' | 'payment' | 'job' | 'ownership';
  amount: string;
  isPrivate: boolean;
  isYourActivity: boolean;
}

export interface NetworkGraphResponse {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
  your_node_id: string;
  last_updated: string;
  is_mock?: boolean;
}

// ============================================================================
// Stealth Address API Types
// ============================================================================

export interface StealthPayment {
  id: string;
  stealth_address: string;
  token: string;
  token_symbol: string;
  amount: string;
  amount_formatted: string;
  sender_ephemeral_key: string;
  view_tag: string;
  block_number: number;
  tx_hash: string;
  claimed: boolean;
  claimed_at?: number;
  timestamp: number;
}

export interface StealthPaymentsResponse {
  payments: StealthPayment[];
  total: number;
  unclaimed_count: number;
  total_unclaimed_value: string;
}

export interface StealthScanRequest {
  viewing_key?: string;
  time_range: string;  // '1h', '24h', '7d', '30d', 'all'
}

export interface StealthScanResponse {
  payments: StealthPayment[];
  scanned_blocks: number;
  new_payments_found: number;
}

export interface StealthClaimRequest {
  payment_ids: string[];
}

export interface StealthClaimResponse {
  success: boolean;
  claimed_count: number;
  total_claimed: string;
  tx_hash: string;
}

export interface StealthMetaAddress {
  spending_pub_key: string;
  viewing_pub_key: string;
  meta_address: string;
}

// ============================================================================
// Earnings API Types
// ============================================================================

export interface PaymentRecord {
  id: string;
  job_id: string;
  worker_address: string;
  amount: string;
  payment_type: string;
  token: string;
  privacy_enabled: boolean;
  created_at: string;
  tx_hash?: string;
  block_number?: number;
}

export interface EarningsHistoryResponse {
  payments: PaymentRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface EarningsByType {
  payment_type: string;
  total: string;
  count: number;
}

export interface EarningsByToken {
  token: string;
  total: string;
  count: number;
}

export interface EarningsSummary {
  total_earnings: string;
  pending_earnings: string;
  claimed_earnings: string;
  earnings_24h: string;
  earnings_7d: string;
  earnings_30d: string;
  by_type: EarningsByType[];
  by_token: EarningsByToken[];
  rank?: number;
  percentile?: number;
}

export interface EarningsChartPoint {
  date: string;
  amount: string;
  count: number;
}

export interface EarningsChartResponse {
  data: EarningsChartPoint[];
  period: string;
  total: string;
}

// ============================================================================
// Transfer History Types
// ============================================================================

export interface TransferRecord {
  id: string;
  transfer_type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
  token: string;
  token_symbol: string;
  amount: string;
  amount_formatted: string;
  counterparty?: string;
  status: string;
  timestamp: number;
  nullifier?: string;
  tx_hash?: string;
}

// ============================================================================
// Send Page Types
// ============================================================================

export interface RecentTransfer {
  id: string;
  to: string;
  amount: string;
  status: 'completed' | 'pending' | 'failed';
  time: string;
  timestamp: number;
  is_private: boolean;
  tx_hash: string | null;
  token_symbol: string;
}

export interface RecentTransfersResponse {
  transfers: RecentTransfer[];
  total: number;
}

export interface SavedContact {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface SavedContactsResponse {
  contacts: SavedContact[];
}

export interface MultiAssetBalance {
  asset_id: string;
  symbol: string;
  public_balance: string;
  private_balance: string;
}

export interface MultiAssetBalancesResponse {
  balances: MultiAssetBalance[];
}

// Get recent outgoing transfers for an address
export const getRecentTransfers = (address: string, params?: {
  limit?: number;
}) => apiClient.get<RecentTransfersResponse>(`/api/wallet/${address}/transfers/recent`, { params });

// Get saved contacts for an address (stored in local DB or localStorage)
export const getSavedContacts = (address: string) =>
  apiClient.get<SavedContactsResponse>(`/api/wallet/${address}/contacts`);

// Save a new contact
export const saveContact = (address: string, data: { name: string; contact_address: string }) =>
  apiClient.post<SavedContact>(`/api/wallet/${address}/contacts`, data);

// Delete a saved contact
export const deleteContact = (address: string, contactId: string) =>
  apiClient.delete(`/api/wallet/${address}/contacts/${contactId}`);

// Get multi-asset balances
export const getMultiAssetBalances = (address: string) =>
  apiClient.get<MultiAssetBalancesResponse>(`/api/wallet/${address}/balances`);

// Combined wallet activity (earnings + transfers)
export interface WalletActivity {
  id: string;
  type: 'send' | 'receive' | 'stake' | 'unstake' | 'gpu_earning' | 'rollover' | 'deposit' | 'withdraw';
  amount: string;
  recipient?: string;
  recipientName?: string;
  timestamp: number;
  isPrivate: boolean;
  status: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
}

// ============================================================================
// API Functions
// ============================================================================

// Health & Stats
export const getHealth = () => apiClient.get('/health');
export const getStats = () => apiClient.get<NetworkStats>('/api/stats');
export const getNetworkStats = () => apiClient.get<NetworkStats>('/api/network/stats');

// Validator
export const getValidatorStatus = () => apiClient.get<ValidatorStatus>('/api/validator/status');
export const getGPUMetrics = () => apiClient.get<GPUMetrics[]>('/api/validator/gpus');
export const getRewards = () => apiClient.get<RewardsInfo>('/api/validator/rewards');

// Jobs
export const getJobs = (params?: {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}) => apiClient.get<JobsResponse>('/api/jobs', { params });

export const getJobStatus = (jobId: string) => apiClient.get<JobInfo>(`/api/jobs/${jobId}`);

// ============================================================================
// Database-backed API Types (DEV 1)
// ============================================================================

// Job from database
export interface JobDbRecord {
  id: string;
  job_id: string;
  client_address: string;
  worker_address: string | null;
  job_type: string;
  status: string;
  priority: number;
  payment_amount: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  execution_time_ms: number | null;
  result_hash: string | null;
  error_message: string | null;
  tx_hash: string | null;
  block_number: number | null;
}

export interface JobDbListResponse {
  jobs: JobDbRecord[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// Job Analytics from Database (with chart data)
export interface JobDbAnalytics {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  pending_jobs: number;
  avg_execution_time_ms: number | null;
  total_payment_amount: string;
  jobs_last_24h: number;
  jobs_last_7d: number;
  completion_rate: number;
  by_status: Array<{ status: string; count: number }>;
  by_type: Array<{ job_type: string; count: number }>;
  hourly_distribution: Array<{ hour: number; count: number }>;
}

// Proof from database
export interface ProofDbRecord {
  id: string;
  job_id: string;
  worker_id: string;
  proof_hash: string;
  // STWO Prover metadata
  proof_type: string | null;
  circuit_type: string | null;
  proof_size_bytes: number | null;
  generation_time_ms: number | null;
  security_bits: number | null;
  // Verification data
  is_valid: boolean | null;
  verification_time_ms: number | null;
  verified_at: string | null;
  verifier_address: string | null;
  tx_hash: string | null;
  block_number: number | null;
}

export interface ProofDbListResponse {
  proofs: ProofDbRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ProofDbStats {
  total_proofs: number;
  verified_proofs: number;
  pending_proofs: number;
  failed_proofs: number;
  avg_verification_time_ms: number | null;
  verification_rate: number;
  proofs_last_24h: number;
}

// ============================================================================
// Proof Detail Types (for /proofs/[id] page)
// ============================================================================

export interface ProofGpuInfo {
  id: string;
  name: string;
  memory: string;
}

export interface ProofDataInfo {
  hash: string;
  encrypted_hash?: { L: string; R: string };
  data_type: string;
  shape: string;
  description: string;
  preview?: {
    top_predictions?: Array<{ class: string; confidence: number }>;
    metrics?: Record<string, string | number>;
  };
}

export interface ProofCircuitStats {
  constraint_count: number;
  trace_length: string;
  trace_rows: number;
  field_size: string;
  blowup_factor: number;
  num_queries: number;
  fri_layers: number;
  security_bits: number;
}

export interface ProofComponents {
  first_layer_commitment: string | null;
  fri_commitments: string[];
  trace_commitments: string[];
  last_layer_degree: number | null;
  query_responses: number;
}

export interface ProofVerificationInfo {
  verifier_contract: string;
  verification_gas: number | null;
  verification_time: string | null;
  channel_state: string;
}

export interface ProofTeeAttestation {
  enclave_id: string;
  mr_enclave: string;
  mr_signer: string;
  report_data: string;
  timestamp: number;
}

export interface ProofExecutionPhase {
  name: string;
  duration: number;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface ProofDetail {
  id: string;
  job_id: string;
  circuit_type: string;
  circuit_label: string;
  status: 'verified' | 'generating' | 'pending' | 'failed';
  gpu: ProofGpuInfo;
  generated_at: number;
  verified_at: number | null;
  duration: string;
  duration_ms: number;
  verified_on_chain: boolean;
  tx_hash: string | null;
  block_number: number | null;
  proof_size: string;
  proof_size_bytes: number;
  client: string;
  reward: string;
  is_private: boolean;
  progress?: number;
  current_phase?: string;
  input: ProofDataInfo;
  output: ProofDataInfo;
  circuit: ProofCircuitStats;
  proof_components: ProofComponents;
  verification: ProofVerificationInfo;
  tee_attestation: ProofTeeAttestation | null;
  execution_phases: ProofExecutionPhase[];
}

// Staking from database
export interface StakingDbStats {
  total_stakers: number;
  total_staked: string;
  avg_stake_amount: string;
  active_stakers: number;
  stakes_last_24h: number;
  unstakes_last_24h: number;
  by_tier: Array<{ tier: string; count: number; total_staked: string }>;
}

export interface StakingEventRecord {
  id: string;
  worker_id: string;
  event_type: string;
  amount: string;
  gpu_tier: string | null;
  has_tee: boolean | null;
  reason: string | null;
  created_at: string;
  tx_hash: string;
  block_number: number;
}

export interface StakingHistoryResponse {
  events: StakingEventRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface StakingLeaderboardEntry {
  rank: number;
  address: string;
  staked_amount: string;
  reputation_score: number;
  jobs_completed: number;
  total_earnings: string;
}

// Earnings from database
export interface NetworkEarningsStats {
  total_distributed: string;
  total_payments: number;
  avg_payment_amount: string;
  payments_last_24h: number;
  volume_last_24h: string;
  by_type: Array<{ payment_type: string; count: number; total: string }>;
}

export interface WorkerEarningsRecord {
  total_earnings: string;
  pending_earnings: string;
  claimed_earnings: string;
  jobs_completed: number;
  avg_earning_per_job: string;
  rank: number;
  percentile: number;
}

export interface EarningsLeaderboardEntry {
  rank: number;
  address: string;
  total_earnings: string;
  jobs_completed: number;
  avg_earning_per_job: string;
}

// ============================================================================
// Database-backed API Functions (DEV 1)
// ============================================================================

// Jobs from Database
export const getJobsFromDb = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  client?: string;
  worker?: string;
  job_type?: string;
}) => apiClient.get<JobDbListResponse>('/api/jobs/db', { params });

export const getJobFromDb = (jobId: string) =>
  apiClient.get<JobDbRecord>(`/api/jobs/db/${jobId}`);

// Job Timeline Event
export interface JobTimelineEvent {
  event_type: string;
  timestamp: string;
  details: Record<string, any>;
  tx_hash?: string;
}

// Job Detail with Timeline
export interface JobDbDetailResponse {
  job: JobDbRecord;
  timeline: JobTimelineEvent[];
  proof?: {
    proof_hash: string;
    proof_type?: string;
    is_valid?: boolean;
    verification_time_ms?: number;
    verified_at?: string;
  };
}

export const getJobDetailFromDb = (jobId: string) =>
  apiClient.get<JobDbDetailResponse>(`/api/jobs/db/${jobId}`);

export const getJobTimelineFromDb = (jobId: string) =>
  apiClient.get<JobTimelineEvent[]>(`/api/jobs/db/${jobId}/timeline`);

export const getJobDbAnalytics = () =>
  apiClient.get<JobDbAnalytics>('/api/jobs/db/analytics');

export const getRecentJobsFromDb = (limit: number = 5) =>
  apiClient.get<{ jobs: JobDbRecord[] }>('/api/jobs/db/recent', { params: { limit } });

// Dashboard Stats from Database
export interface DashboardDbStats {
  total_jobs: number;
  completed_jobs: number;
  active_jobs: number;
  total_workers: number;
  active_workers: number;
  total_earnings: string;
  earnings_24h: string;
  avg_job_time_ms: number;
  success_rate: number;
}

export const getDashboardStatsFromDb = () =>
  apiClient.get<DashboardDbStats>('/api/dashboard/stats');

// Proofs from Database
export const getProofsFromDb = (params?: {
  page?: number;
  limit?: number;
  worker_id?: string;
  job_id?: string;
  is_valid?: boolean;
}) => apiClient.get<ProofDbListResponse>('/api/proofs', { params });

export const getProofFromDb = (proofId: string) =>
  apiClient.get<ProofDbRecord>(`/api/proofs/${proofId}`);

export const getProofDbStats = () =>
  apiClient.get<ProofDbStats>('/api/proofs/stats');

// Get detailed proof information (for /proofs/[id] page)
export const getProofDetail = (proofId: string) =>
  apiClient.get<ProofDetail>(`/api/proofs/${proofId}/detail`);

// Staking from Database
export const getStakingDbStats = () =>
  apiClient.get<StakingDbStats>('/api/staking/db/stats');

export const getStakingHistory = (address: string, params?: {
  page?: number;
  limit?: number;
  event_type?: string;
}) => apiClient.get<StakingHistoryResponse>(`/api/staking/db/history/${address}`, { params });

export const getStakingLeaderboard = (params?: {
  limit?: number;
  offset?: number;
}) => apiClient.get<{ leaderboard: StakingLeaderboardEntry[] }>('/api/staking/db/leaderboard', { params });

// Earnings from Database
export const getNetworkEarningsStats = () =>
  apiClient.get<NetworkEarningsStats>('/api/earnings/network/stats');

export const getWorkerEarnings = (address: string) =>
  apiClient.get<WorkerEarningsRecord>(`/api/earnings/worker/${address}`);

export const getEarningsLeaderboard = (params?: {
  limit?: number;
  offset?: number;
}) => apiClient.get<{ leaderboard: EarningsLeaderboardEntry[] }>('/api/earnings/leaderboard', { params });

// Generate chart data from hourly distribution (7 days)
export const getJobsChartData = async (): Promise<Array<{ day: string; jobs: number; earnings: number }>> => {
  try {
    const response = await getJobDbAnalytics();
    const analytics = response.data;

    // Map hourly distribution to daily (group by 24h periods)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const chartData: Array<{ day: string; jobs: number; earnings: number }> = [];

    // Use jobs_last_7d and distribute across days
    const avgJobsPerDay = analytics.jobs_last_7d / 7;

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = days[date.getDay()];

      // Distribute hourly counts across days with some variance
      const hourOffset = i * 24;
      let dayJobs = 0;
      for (let h = 0; h < 24; h++) {
        const hourData = analytics.hourly_distribution.find(hd => hd.hour === ((hourOffset + h) % 24));
        dayJobs += hourData?.count || Math.floor(avgJobsPerDay / 24);
      }

      // Estimate earnings based on job count
      const avgEarningsPerJob = parseFloat(analytics.total_payment_amount || "0") /
        (analytics.completed_jobs || 1) / 1e18;

      chartData.push({
        day: dayName,
        jobs: dayJobs,
        earnings: dayJobs * avgEarningsPerJob,
      });
    }

    return chartData;
  } catch {
    // Return empty data when API is unavailable
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      return { day: days[date.getDay()], jobs: 0, earnings: 0 };
    });
  }
};
export const getJobResult = (jobId: string) => apiClient.get(`/api/jobs/${jobId}/result`);
export const cancelJob = (jobId: string) => apiClient.post(`/api/jobs/${jobId}/cancel`);
export const retryJob = (jobId: string) => apiClient.post(`/api/jobs/${jobId}/retry`);
export const archiveJob = (jobId: string) => apiClient.post(`/api/jobs/${jobId}/archive`);
export const deleteJob = (jobId: string) => apiClient.delete(`/api/jobs/${jobId}`);

// Bulk job operations
export const bulkRetryJobs = (jobIds: string[]) =>
  apiClient.post<{ success: string[]; failed: string[] }>('/api/jobs/bulk/retry', { job_ids: jobIds });
export const bulkArchiveJobs = (jobIds: string[]) =>
  apiClient.post<{ success: string[]; failed: string[] }>('/api/jobs/bulk/archive', { job_ids: jobIds });
export const bulkDeleteJobs = (jobIds: string[]) =>
  apiClient.post<{ success: string[]; failed: string[] }>('/api/jobs/bulk/delete', { job_ids: jobIds });

export const submitJob = (data: {
  job_type: string;
  input_data: string;
  max_cost_sage?: number;
  priority?: number;
  require_tee?: boolean;
}) => apiClient.post<{ job_id: string; status: string; estimated_cost: string }>('/api/submit', data);

// Proofs
export const getProofs = (params?: {
  page?: number;
  per_page?: number;
  status?: string;
}) => apiClient.get<{ proofs: ProofInfo[]; total: number }>('/api/proofs', { params });

export const getProof = (proofId: string) => apiClient.get<ProofInfo>(`/api/proofs/${proofId}`);
export const verifyProof = (proofHash: string) => apiClient.post(`/api/proofs/${proofHash}/verify`);

// Faucet
export const getFaucetStatus = (address: string) =>
  apiClient.get<FaucetStatus>(`/api/faucet/status/${address}`);

export const claimFaucet = (address: string, captchaToken?: string) =>
  apiClient.post<FaucetClaimResponse>('/api/faucet/claim', {
    address,
    captcha_token: captchaToken
  });

export const getFaucetConfig = () => apiClient.get<FaucetConfig>('/api/faucet/config');

export const getFaucetClaimHistory = (address: string, params?: {
  limit?: number;
  offset?: number;
}) => apiClient.get<FaucetClaimHistoryResponse>(`/api/faucet/history/${address}`, { params });

// Staking
export const getStakeInfo = (address: string) =>
  apiClient.get<StakingInfo>(`/api/staking/${address}`);

export const stake = (amount: string) =>
  apiClient.post<{ transaction_hash: string }>('/api/staking/stake', { amount });

export const unstake = (amount: string) =>
  apiClient.post<{ transaction_hash: string }>('/api/staking/unstake', { amount });

export const claimRewards = () =>
  apiClient.post<{ amount: string; transaction_hash: string }>('/api/staking/claim');

// ============================================================================
// Price Feed API Functions
// ============================================================================

// Get price for a specific token (e.g., 'SAGE', 'STRK', 'ETH')
export const getTokenPrice = (symbol: string) =>
  apiClient.get<TokenPrice>(`/api/prices/${symbol.toLowerCase()}`);

// Get prices for multiple tokens
export const getTokenPrices = (symbols?: string[]) =>
  apiClient.get<TokenPricesResponse>('/api/prices', {
    params: symbols ? { symbols: symbols.join(',') } : undefined,
  });

// Get SAGE/USD price specifically (convenience function with fallback)
export const getSagePrice = async (): Promise<TokenPrice> => {
  try {
    const response = await getTokenPrice('SAGE');
    return response.data;
  } catch {
    return {
      token: 'SAGE',
      symbol: 'SAGE',
      price_usd: 0,
      price_change_24h: 0,
      price_change_pct_24h: 0,
      volume_24h: 0,
      last_updated: new Date().toISOString(),
      source: 'fallback' as const,
    };
  }
};

// Workers
export const getWorkers = () => apiClient.get<{ workers: GPUMetrics[] }>('/api/workers');
export const getWorker = (workerId: string) => apiClient.get(`/api/workers/${workerId}`);

// ============================================================================
// Trading/OTC API Functions
// ============================================================================

// Get all trading pairs
export const getTradingPairs = () =>
  apiClient.get<{ pairs: TradingPair[] }>('/api/trading/pairs');

// Get orderbook for a pair
export const getOrderBook = (pairId: string) =>
  apiClient.get<OrderBookResponse>(`/api/trading/orderbook/${pairId}`);

// Get user's orders
// API returns Order[] directly, not { orders: [...] }
export const getUserOrders = (address: string, params?: { status?: string }) =>
  apiClient.get<Order[]>('/api/trading/orders', {
    params: { address, ...params },
  });

// Get trade history for a pair
// API returns Trade[] directly, not { trades: [...] }
export const getTradeHistory = (pairId: string, params?: { limit?: number }) =>
  apiClient.get<Trade[]>(`/api/trading/trades/${pairId}`, { params });

// Get 24h market stats
export const getMarketStats = (pairId: string) =>
  apiClient.get<MarketStats>(`/api/trading/stats/${pairId}/24h`);

// Get TWAP data
export const getTWAP = (pairId: string, interval?: string) =>
  apiClient.get<TWAPData>(`/api/trading/stats/${pairId}/twap`, {
    params: { interval },
  });

// ============================================================================
// Governance API Functions
// ============================================================================

// Get all proposals
export const getProposals = (params?: {
  status?: string;
  category?: string;
  page?: number;
  per_page?: number;
}) =>
  apiClient.get<{ proposals: Proposal[]; total: number }>('/api/governance/proposals', {
    params,
  });

// Get single proposal
export const getProposal = (proposalId: string) =>
  apiClient.get<Proposal>(`/api/governance/proposals/${proposalId}`);

// Get votes for a proposal
export const getProposalVotes = (proposalId: string, params?: { page?: number }) =>
  apiClient.get<{ votes: VoteRecord[]; total: number }>(
    `/api/governance/proposals/${proposalId}/votes`,
    { params }
  );

// Get voting power for an address
export const getVotingPower = (address: string) =>
  apiClient.get<VotingPower>(`/api/governance/voting-power/${address}`);

// Get delegations for an address
export const getDelegations = (address: string) =>
  apiClient.get<{ delegations: DelegationInfo[] }>(`/api/governance/delegations/${address}`);

// Get governance stats
export const getGovernanceStats = () =>
  apiClient.get<GovernanceStats>('/api/governance/stats');

// Get council members
export const getCouncilMembers = () =>
  apiClient.get<{ members: CouncilMember[] }>('/api/governance/council');

// ============================================================================
// Privacy API Functions
// ============================================================================

// Get privacy account info
export const getPrivacyAccount = (address: string) =>
  apiClient.get<PrivacyAccount>(`/api/privacy/account/${address}`);

// Get private balance
export const getPrivateBalance = (address: string, token?: string) =>
  apiClient.get<{ balance: string; token: string }>(`/api/privacy/balance/${address}`, {
    params: { token },
  });

// Get privacy pools
export const getPrivacyPools = () =>
  apiClient.get<{ pools: PrivacyPoolInfo[] }>('/api/privacy/pools');

// Get pool stats
export const getPrivacyPoolStats = (poolId: string) =>
  apiClient.get<PrivacyPoolInfo>(`/api/privacy/pools/${poolId}`);

// Get overall privacy stats
export const getPrivacyStats = () =>
  apiClient.get<PrivacyStats>('/api/privacy/stats');

// Get ASP membership proof for a commitment in an association set
// Returns null if the endpoint doesn't exist yet (graceful fallback)
export const getASPMembershipProof = async (
  setId: string,
  commitment: string
): Promise<{ proof: string[]; root: string; leaf_index: number } | null> => {
  try {
    const response = await apiClient.get<{ proof: string[]; root: string; leaf_index: number }>(
      `/api/privacy/asp/${setId}/proof/${commitment}`
    );
    return response.data;
  } catch {
    return null;
  }
};

// Get privacy network graph for visualization
export const getPrivacyNetworkGraph = (address: string) =>
  apiClient.get<NetworkGraphResponse>(`/api/privacy/network/${address}`);

// Get transfer history (privacy transfers)
export const getTransferHistory = (address: string, params?: {
  limit?: number;
  offset?: number;
  transfer_type?: string;
}) => apiClient.get<TransferRecord[]>(`/api/privacy/transfers/${address}`, { params });

// ============================================================================
// Stealth Address API Functions
// ============================================================================

// Get stealth meta-address for an address
export const getStealthMetaAddress = (address: string) =>
  apiClient.get<StealthMetaAddress>(`/api/privacy/stealth/${address}`);

// Get all stealth payments for an address
export const getStealthPayments = (address: string, params?: {
  status?: 'all' | 'unclaimed' | 'claimed';
  limit?: number;
  offset?: number;
}) => apiClient.get<StealthPaymentsResponse>(`/api/privacy/stealth/${address}/payments`, { params });

// Scan for new stealth payments
export const scanStealthPayments = (address: string, data: StealthScanRequest) =>
  apiClient.post<StealthScanResponse>(`/api/privacy/stealth/scan`, {
    address,
    ...data,
  });

// Claim stealth payments
export const claimStealthPayments = (address: string, data: StealthClaimRequest) =>
  apiClient.post<StealthClaimResponse>(`/api/privacy/stealth/claim`, {
    address,
    ...data,
  });

// Generate a new stealth address for receiving
export const generateStealthAddress = (address: string) =>
  apiClient.post<{ stealth_address: string; ephemeral_key: string }>(`/api/privacy/stealth/generate`, {
    address,
  });

// ============================================================================
// Earnings API Functions
// ============================================================================

// Get earnings summary
export const getEarningsSummary = (address: string) =>
  apiClient.get<EarningsSummary>(`/api/earnings/${address}/summary`);

// Get earnings history (paginated)
export const getEarningsHistory = (address: string, params?: {
  payment_type?: string;
  token?: string;
  period?: string;
  page?: number;
  limit?: number;
}) => apiClient.get<EarningsHistoryResponse>(`/api/earnings/${address}/history`, { params });

// Get earnings chart data
export const getEarningsChart = (address: string, params?: {
  period?: string; // 7d, 30d, 90d
}) => apiClient.get<EarningsChartResponse>(`/api/earnings/${address}/chart`, { params });

// Get earnings breakdown by type
export const getEarningsBreakdown = (address: string) =>
  apiClient.get<EarningsByType[]>(`/api/earnings/${address}/breakdown`);

// Get combined wallet activity (transfers + earnings)
export const getWalletActivity = async (address: string, limit = 20): Promise<WalletActivity[]> => {
  // Fetch both transfer history and earnings in parallel
  const [transfersRes, earningsRes] = await Promise.allSettled([
    getTransferHistory(address, { limit }),
    getEarningsHistory(address, { limit }),
  ]);

  const activities: WalletActivity[] = [];

  // Process transfer records
  if (transfersRes.status === 'fulfilled') {
    const transfers = transfersRes.value.data;
    for (const t of transfers) {
      let type: WalletActivity['type'] = 'send';
      if (t.transfer_type === 'deposit') type = 'deposit';
      else if (t.transfer_type === 'withdraw') type = 'withdraw';
      else if (t.transfer_type === 'transfer_in') type = 'receive';
      else if (t.transfer_type === 'transfer_out') type = 'send';

      activities.push({
        id: `transfer_${t.id}`,
        type,
        amount: t.transfer_type.includes('out') || t.transfer_type === 'withdraw'
          ? `-${t.amount_formatted}` : `+${t.amount_formatted}`,
        recipient: t.counterparty,
        timestamp: t.timestamp * 1000,
        isPrivate: true, // Privacy transfers are always private
        status: t.status === 'completed' ? 'confirmed' : t.status === 'pending' ? 'pending' : 'failed',
        txHash: t.tx_hash,
      });
    }
  }

  // Process earnings/payments
  if (earningsRes.status === 'fulfilled') {
    const payments = earningsRes.value.data.payments;
    for (const p of payments) {
      const type: WalletActivity['type'] =
        p.payment_type === 'gpu_job' ? 'gpu_earning' :
        p.payment_type === 'stake_reward' ? 'receive' :
        p.payment_type === 'rollover' ? 'rollover' : 'receive';

      const amountFormatted = (parseFloat(p.amount) / 1e18).toFixed(4);
      activities.push({
        id: `earning_${p.id}`,
        type,
        amount: `+${amountFormatted}`,
        recipientName: p.payment_type === 'gpu_job' ? `Job #${p.job_id}` : undefined,
        timestamp: new Date(p.created_at).getTime(),
        isPrivate: p.privacy_enabled,
        status: 'confirmed',
        txHash: p.tx_hash,
      });
    }
  }

  // Sort by timestamp descending
  activities.sort((a, b) => b.timestamp - a.timestamp);

  return activities.slice(0, limit);
};

// ============================================================================
// WebSocket Client
// ============================================================================

// Legacy message types (for backward compatibility)
export interface WebSocketMessage {
  type: 'job_update' | 'proof_update' | 'worker_status' | 'network_stats';
  data: Record<string, unknown>;
  timestamp: string;
}

// New indexed event types from DEV 1's WebSocket integration
export type WsEventType =
  | 'job_update'
  | 'proof_update'
  | 'worker_status'
  | 'network_stats'
  | 'staking_event'
  | 'order_placed'
  | 'order_updated'
  | 'trade_executed'
  | 'proposal_created'
  | 'vote_cast'
  | 'privacy_event'
  | 'faucet_claim'
  | 'indexed_event';

export interface IndexedWebSocketMessage {
  type: WsEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// Trading-specific WebSocket events
export interface TradingWsMessage {
  type: 'order_placed' | 'order_updated' | 'trade_executed';
  data: {
    pair_id?: string;
    order_id?: string;
    trader?: string;
    side?: 'buy' | 'sell';
    price?: string;
    amount?: string;
    status?: string;
    maker?: string;
    taker?: string;
    tx_hash?: string;
  };
  timestamp: string;
}

// Governance-specific WebSocket events
export interface GovernanceWsMessage {
  type: 'proposal_created' | 'vote_cast';
  data: {
    proposal_id?: string;
    proposer?: string;
    voter?: string;
    support?: boolean;
    weight?: string;
    title?: string;
  };
  timestamp: string;
}

// Privacy-specific WebSocket events
export interface PrivacyWsMessage {
  type: 'privacy_event';
  data: {
    event_type: 'deposit' | 'withdraw' | 'transfer_initiated' | 'transfer_completed';
    address?: string;
    amount?: string;
    commitment?: string;
    nullifier?: string;
  };
  timestamp: string;
}

// Staking-specific WebSocket events
export interface StakingWsMessage {
  type: 'staking_event';
  data: {
    event_type: 'stake' | 'unstake' | 'slash' | 'reward_claim';
    staker?: string;
    amount?: string;
    validator?: string;
  };
  timestamp: string;
}

export type WebSocketCallback = (message: WebSocketMessage) => void;
export type IndexedWsCallback = (message: IndexedWebSocketMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private callbacks: Set<WebSocketCallback> = new Set();

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      debugLog('[WS] Already connected');
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        debugLog('[WS] Connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.callbacks.forEach(callback => callback(message));
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      this.ws.onclose = () => {
        debugLog('[WS] Disconnected');
        this.tryReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (error) {
      console.error('[WS] Failed to connect:', error);
      this.tryReconnect();
    }
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      debugLog(`[WS] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      console.error('[WS] Max reconnection attempts reached');
    }
  }

  subscribe(callback: WebSocketCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton WebSocket client (legacy)
export const wsClient = new WebSocketClient();

// ============================================================================
// Specialized WebSocket Clients (DEV 1's new endpoints)
// ============================================================================

type WsEndpoint = 'trading' | 'staking' | 'governance' | 'privacy' | 'proofs';

interface WsConnectionOptions {
  endpoint: WsEndpoint;
  filters?: {
    address?: string;
    pair_id?: string;
    proposal_id?: string;
  };
}

class SpecializedWebSocketClient<T extends IndexedWebSocketMessage> {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private callbacks: Set<(message: T) => void> = new Set();
  private options: WsConnectionOptions;
  private shouldReconnect = true;

  constructor(options: WsConnectionOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Build URL with query parameters for filtering
      let url = `${WS_URL.replace('/ws', '')}/ws/${this.options.endpoint}`;
      const params = new URLSearchParams();

      if (this.options.filters?.address) {
        params.set('address', this.options.filters.address);
      }
      if (this.options.filters?.pair_id) {
        params.set('pair_id', this.options.filters.pair_id);
      }
      if (this.options.filters?.proposal_id) {
        params.set('proposal_id', this.options.filters.proposal_id);
      }

      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        debugLog(`[WS:${this.options.endpoint}] Connected`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: T = JSON.parse(event.data);
          this.callbacks.forEach(callback => callback(message));
        } catch (error) {
          console.error(`[WS:${this.options.endpoint}] Failed to parse:`, error);
        }
      };

      this.ws.onclose = () => {
        debugLog(`[WS:${this.options.endpoint}] Disconnected`);
        if (this.shouldReconnect) {
          this.tryReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error(`[WS:${this.options.endpoint}] Error:`, error);
      };
    } catch (error) {
      console.error(`[WS:${this.options.endpoint}] Failed to connect:`, error);
      if (this.shouldReconnect) {
        this.tryReconnect();
      }
    }
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  subscribe(callback: (message: T) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  updateFilters(filters: WsConnectionOptions['filters']): void {
    this.options.filters = filters;
    if (this.ws) {
      this.disconnect();
      this.shouldReconnect = true;
      this.connect();
    }
  }
}

// Factory functions for specialized WebSocket clients
export function createTradingWsClient(pairId?: string, address?: string) {
  return new SpecializedWebSocketClient<TradingWsMessage>({
    endpoint: 'trading',
    filters: { pair_id: pairId, address },
  });
}

export function createGovernanceWsClient(proposalId?: string, address?: string) {
  return new SpecializedWebSocketClient<GovernanceWsMessage>({
    endpoint: 'governance',
    filters: { proposal_id: proposalId, address },
  });
}

export function createPrivacyWsClient(address?: string) {
  return new SpecializedWebSocketClient<PrivacyWsMessage>({
    endpoint: 'privacy',
    filters: { address },
  });
}

export function createStakingWsClient(address?: string) {
  return new SpecializedWebSocketClient<StakingWsMessage>({
    endpoint: 'staking',
    filters: { address },
  });
}

export function createProofsWsClient() {
  return new SpecializedWebSocketClient<IndexedWebSocketMessage>({
    endpoint: 'proofs',
  });
}

// ============================================================================
// Wallet Database API (Combined Transaction History)
// ============================================================================

export interface WalletDbTransaction {
  id: string;
  tx_type: string;  // payment, private_transfer_in, private_transfer_out
  direction: 'in' | 'out';
  amount: string;
  amount_formatted: string;
  token: string;
  token_symbol: string;
  counterparty?: string;
  status: string;
  is_private: boolean;
  timestamp: number;
  tx_hash?: string;
  block_number?: number;
}

export interface WalletDbTransactionsResponse {
  transactions: WalletDbTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface WalletDbSummary {
  address: string;
  total_transactions: number;
  total_sent: string;
  total_received: string;
  transactions_24h: number;
  transactions_7d: number;
}

// Get wallet transactions from database (combines payments + private transfers)
export const getWalletDbTransactions = (address: string, params?: {
  tx_type?: string;  // all, transfer, private_transfer, deposit, withdrawal, payment
  period?: string;   // 7d, 30d, 90d, all
  page?: number;
  limit?: number;
}) => apiClient.get<WalletDbTransactionsResponse>(`/api/wallet/${address}/transactions`, { params });

// Get wallet summary from database
export const getWalletDbSummary = (address: string) =>
  apiClient.get<WalletDbSummary>(`/api/wallet/${address}/summary`);

// ============================================================================
// Network Database API (Historical Stats & Charts)
// ============================================================================

export interface NetworkStatsSnapshot {
  id: string;
  total_workers: number;
  active_workers: number;
  total_jobs: number;
  jobs_24h: number;
  total_staked: string;
  total_volume_24h?: string;
  avg_job_time_ms?: number;
  network_utilization?: number;
  snapshot_at: number;
}

export interface NetworkStatsHistoryResponse {
  snapshots: NetworkStatsSnapshot[];
  period: string;
  latest?: NetworkStatsSnapshot;
}

export interface NetworkChartPoint {
  timestamp: number;
  workers: number;
  jobs: number;
  staked: number;
  utilization: number;
}

export interface NetworkChartResponse {
  data: NetworkChartPoint[];
  period: string;
}

export interface NetworkGrowthMetrics {
  workers_growth_24h: number;
  workers_growth_7d: number;
  jobs_growth_24h: number;
  jobs_growth_7d: number;
  staked_growth_24h: number;
  staked_growth_7d: number;
}

// Get network stats history from database
export const getNetworkStatsHistory = (params?: {
  period?: string;  // 1h, 24h, 7d, 30d
  limit?: number;
}) => apiClient.get<NetworkStatsHistoryResponse>('/api/network/stats/history', { params });

// Get network stats chart data
export const getNetworkStatsChart = (params?: {
  period?: string;  // 1h, 24h, 7d, 30d
}) => apiClient.get<NetworkChartResponse>('/api/network/stats/chart', { params });

// Get network growth metrics
export const getNetworkGrowthMetrics = () =>
  apiClient.get<NetworkGrowthMetrics>('/api/network/growth');

// ============================================================================
// Workload Deployment API Types
// ============================================================================

export type WorkloadCategory = 'ai_inference' | 'zk_prover' | 'creative' | 'blockchain';

export interface Workload {
  id: string;
  name: string;
  description: string;
  category: WorkloadCategory;
  min_vram_gb: number;
  tags: string[];
  verified: boolean;
  image: string;
  default_config: Record<string, unknown>;
}

export interface WorkloadsResponse {
  workloads: Workload[];
}

export type DeploymentStatus =
  | 'queued'
  | 'downloading_model'
  | 'loading_model'
  | 'initializing'
  | 'ready'
  | 'failed'
  | 'stopping'
  | 'stopped';

export interface DeploymentProgress {
  phase: string;
  percent: number;
  message: string;
  bytes_downloaded?: number;
  bytes_total?: number;
}

export interface WorkloadDeployment {
  id: string;
  workload_id: string;
  worker_id: string;
  owner_address: string;
  status: DeploymentStatus;
  progress: DeploymentProgress | null;
  created_at: number;
  ready_at: number | null;
  error: string | null;
}

export interface DeploymentsResponse {
  deployments: WorkloadDeployment[];
}

export interface MyWorker {
  id: string;
  address: string;
  gpu_backend: 'cuda' | 'metal' | 'vulkan';
  capacity: number;
  current_load: number;
  latency_ms: number;
  gpu_model: string | null;
  vram_gb: number | null;
  owner_address: string | null;
  active_workload: string | null;
}

export interface MyWorkersResponse {
  workers: MyWorker[];
}

export interface WorkloadDeployRequest {
  workload_id: string;
  owner_address: string;
  worker_id?: string;
  config?: Record<string, unknown>;
}

export interface WorkloadDeployResponse {
  deployment_id: string;
  worker_id: string;
  workload_id: string;
  status: DeploymentStatus;
  estimated_ready_time_ms: number;
}

export interface StopWorkloadResponse {
  stopped: boolean;
  deployment_id: string;
}

// ============================================================================
// Workload Deployment API Functions
// ============================================================================

// Get all available workloads
export const getWorkloads = () =>
  apiClient.get<WorkloadsResponse>('/api/workloads');

// Get a specific workload by ID
export const getWorkload = (workloadId: string) =>
  apiClient.get<Workload>(`/api/workloads/${workloadId}`);

// Get GPU workers owned by the current wallet
export const getMyWorkers = () =>
  apiClient.get<MyWorkersResponse>('/api/workloads/my-workers');

// Get all deployments for the current wallet
export const getMyDeployments = () =>
  apiClient.get<DeploymentsResponse>('/api/workloads/deployments');

// Deploy a workload to a worker
export const deployWorkload = (data: WorkloadDeployRequest) =>
  apiClient.post<WorkloadDeployResponse>('/api/workloads/deploy', data);

// Get deployment status
export const getDeploymentStatus = (deploymentId: string) =>
  apiClient.get<WorkloadDeployment>(`/api/workloads/deployments/${deploymentId}`);

// Stop a deployed workload
export const stopWorkload = (deploymentId: string) =>
  apiClient.post<StopWorkloadResponse>(`/api/workloads/deployments/${deploymentId}/stop`);

// ============================================================================
// Utility Functions
// ============================================================================

export function formatSageAmount(wei: string | number): string {
  const sage = Number(wei) / 1e18;
  if (sage >= 1) {
    return `${sage.toFixed(2)} SAGE`;
  } else if (sage >= 0.001) {
    return `${sage.toFixed(4)} SAGE`;
  } else {
    return `${wei} wei`;
  }
}

export function formatDuration(secs: number): string {
  if (secs >= 86400) {
    const days = Math.floor(secs / 86400);
    return `${days} day${days === 1 ? '' : 's'}`;
  } else if (secs >= 3600) {
    const hours = Math.floor(secs / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  } else if (secs >= 60) {
    const mins = Math.floor(secs / 60);
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  } else {
    return `${secs} second${secs === 1 ? '' : 's'}`;
  }
}

export { API_BASE_URL, WS_URL };
