/**
 * BitSage WebSocket Hook
 *
 * Provides real-time event streaming from the rust-node coordinator.
 * Connects to the WebSocket endpoints and provides typed event handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Event Types (matching rust-node/src/api/websocket.rs)
// ============================================================================

export interface JobUpdateEvent {
  job_id: string;
  status: string;
  progress?: number;
  worker_id?: string;
  result_hash?: string;
  error?: string;
  timestamp: number;
}

export interface WorkerUpdateEvent {
  worker_id: string;
  status: string;
  gpu_utilization?: number;
  memory_used_mb?: number;
  jobs_active: number;
  timestamp: number;
}

export interface NetworkStatsEvent {
  total_workers: number;
  active_workers: number;
  total_jobs: number;
  jobs_in_progress: number;
  jobs_completed_24h: number;
  network_tps: number;
  timestamp: number;
}

export interface ProofVerifiedEvent {
  job_id: string;
  proof_hash: string;
  verifier: string;
  is_valid: boolean;
  gas_used: number;
  timestamp: number;
}

export interface OrderWsEvent {
  order_id: string;
  maker_address: string;
  pair_id: number;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface OrderUpdateWsEvent {
  order_id: string;
  status: 'filled' | 'partial' | 'cancelled';
  filled_amount?: string;
  remaining_amount?: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface TradeWsEvent {
  trade_id: string;
  pair_id: number;
  maker_address: string;
  taker_address: string;
  price: string;
  amount: string;
  side: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface StakingWsEvent {
  worker_address: string;
  event_type: 'stake' | 'unstake' | 'slashed';
  amount: string;
  gpu_tier?: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface ProposalWsEvent {
  proposal_id: string;
  proposer_address: string;
  proposal_type: string;
  title?: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface VoteWsEvent {
  proposal_id: string;
  voter_address: string;
  support: number; // 0 = against, 1 = for, 2 = abstain
  voting_power: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface PrivacyWsEvent {
  event_type: 'transfer_initiated' | 'transfer_completed' | 'deposit' | 'withdrawal';
  nullifier?: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface FaucetWsEvent {
  claimer_address: string;
  amount: string;
  tx_hash: string;
  block_number: number;
  timestamp: number;
}

export interface HeartbeatEvent {
  timestamp: number;
}

// Discriminated union of all WebSocket events
export type WsEvent =
  | { type: 'JobUpdate'; data: JobUpdateEvent }
  | { type: 'WorkerUpdate'; data: WorkerUpdateEvent }
  | { type: 'NetworkStats'; data: NetworkStatsEvent }
  | { type: 'ProofVerified'; data: ProofVerifiedEvent }
  | { type: 'OrderPlaced'; data: OrderWsEvent }
  | { type: 'OrderUpdated'; data: OrderUpdateWsEvent }
  | { type: 'TradeExecuted'; data: TradeWsEvent }
  | { type: 'StakingEvent'; data: StakingWsEvent }
  | { type: 'ProposalCreated'; data: ProposalWsEvent }
  | { type: 'VoteCast'; data: VoteWsEvent }
  | { type: 'PrivacyEvent'; data: PrivacyWsEvent }
  | { type: 'FaucetClaim'; data: FaucetWsEvent }
  | { type: 'Heartbeat'; data: HeartbeatEvent }
  | { type: 'Error'; data: { message: string } }
  | { type: 'Subscribed'; data: { channels: string[] } };

// ============================================================================
// WebSocket Endpoints
// ============================================================================

export type WsEndpoint =
  | '/ws'           // All events
  | '/ws/jobs'      // Job updates only
  | '/ws/workers'   // Worker status + network stats
  | '/ws/trading'   // Orders + trades
  | '/ws/staking'   // Staking events
  | '/ws/governance'// Proposals + votes
  | '/ws/privacy'   // Private transfers
  | '/ws/proofs';   // Proof verifications

export interface WsQueryParams {
  address?: string;
  pair_id?: number;
  proposal_id?: string;
}

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketState {
  isConnected: boolean;
  connectionState: ConnectionState;
  lastHeartbeat: number | null;
  error: string | null;
}

// ============================================================================
// Hook Options
// ============================================================================

export interface UseWebSocketOptions {
  endpoint?: WsEndpoint;
  params?: WsQueryParams;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  onEvent?: (event: WsEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8090/ws';
const DEFAULT_RECONNECT_ATTEMPTS = 5; // Reduced from 10 - fail faster for better UX
const DEFAULT_RECONNECT_DELAY = 2000; // Start at 2 seconds
const MAX_RECONNECT_DELAY = 30000; // 30 second max
const INITIAL_CONNECTION_DELAY = 800; // Delay before first connection (allows React Strict Mode to settle)

// Check if demo mode is enabled (skip WebSocket connections)
const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Suppress console errors for expected transient WebSocket failures
const SUPPRESS_INITIAL_ERRORS = true;

/**
 * Calculate exponential backoff with jitter
 * @param attempt - Current attempt number (1-based)
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay with exponential backoff and random jitter
 */
function calculateBackoff(attempt: number, baseDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt, capped at MAX_RECONNECT_DELAY
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
  // Add jitter: random value between 0 and 30% of the delay
  const jitter = Math.random() * exponentialDelay * 0.3;
  return Math.floor(exponentialDelay + jitter);
}

// ============================================================================
// Main Hook
// ============================================================================

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    endpoint = '/ws',
    params = {},
    autoConnect = true,
    reconnectAttempts = DEFAULT_RECONNECT_ATTEMPTS,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    onEvent,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    connectionState: 'disconnected',
    lastHeartbeat: null,
    error: null,
  });

  const [events, setEvents] = useState<WsEvent[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const userDisconnectRef = useRef(false); // Track user-initiated disconnects
  const mountedRef = useRef(false); // Track if mounted
  const connectingRef = useRef(false); // Prevent multiple simultaneous connections

  // Store callbacks in refs to avoid dependency changes
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onEvent, onConnect, onDisconnect, onError]);

  // Build WebSocket URL with query params
  const buildWsUrl = useCallback(() => {
    const baseUrl = DEFAULT_WS_URL.replace(/\/ws.*$/, '') + endpoint;
    const searchParams = new URLSearchParams();

    if (params.address) searchParams.set('address', params.address);
    if (params.pair_id !== undefined) searchParams.set('pair_id', params.pair_id.toString());
    if (params.proposal_id) searchParams.set('proposal_id', params.proposal_id);

    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [endpoint, params.address, params.pair_id, params.proposal_id]);

  // Handle incoming message
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const wsEvent = JSON.parse(event.data) as WsEvent;

      // Update last heartbeat
      if (wsEvent.type === 'Heartbeat') {
        setState(prev => ({ ...prev, lastHeartbeat: wsEvent.data.timestamp }));
      }

      // Add to events list (keep last 100)
      setEvents(prev => [wsEvent, ...prev.slice(0, 99)]);

      // Call event handler via ref
      onEventRef.current?.(wsEvent);
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (typeof window === 'undefined') return; // SSR guard
    if (IS_DEMO_MODE) return; // Skip connection in demo mode
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return; // Prevent multiple connection attempts

    connectingRef.current = true;
    userDisconnectRef.current = false; // Reset user disconnect flag on connect
    setState(prev => ({ ...prev, connectionState: 'connecting', error: null }));

    try {
      const url = buildWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        connectingRef.current = false;
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionState: 'connected',
          error: null,
        }));
        reconnectCountRef.current = 0;
        setIsRetrying(false);
        onConnectRef.current?.();
      };

      ws.onclose = () => {
        connectingRef.current = false;
        wsRef.current = null;

        setState(prev => ({
          ...prev,
          isConnected: false,
          connectionState: 'disconnected',
        }));
        onDisconnectRef.current?.();

        // Only attempt reconnection if not user-initiated disconnect and still mounted
        if (!userDisconnectRef.current && mountedRef.current && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current += 1;
          setIsRetrying(true);

          // Calculate exponential backoff with jitter
          const delay = calculateBackoff(reconnectCountRef.current, reconnectDelay);
          console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectCountRef.current}/${reconnectAttempts})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !userDisconnectRef.current) {
              connect();
            }
          }, delay);
        } else if (reconnectCountRef.current >= reconnectAttempts) {
          setIsRetrying(false);
          setState(prev => ({
            ...prev,
            connectionState: 'error',
            error: 'Max reconnection attempts reached',
          }));
        }
      };

      ws.onerror = () => {
        // Don't set error state here - onclose will handle it
        // This prevents double state updates that cause infinite loops
        connectingRef.current = false;
        // Only report errors after initial connection attempts (suppress transient startup errors)
        if (!SUPPRESS_INITIAL_ERRORS || reconnectCountRef.current > 1) {
          onErrorRef.current?.('WebSocket connection error');
        }
      };

      ws.onmessage = handleMessage;
    } catch (err) {
      connectingRef.current = false;
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setState(prev => ({
        ...prev,
        connectionState: 'error',
        error: errorMessage,
      }));
      onErrorRef.current?.(errorMessage);
    }
  }, [buildWsUrl, handleMessage, reconnectAttempts, reconnectDelay]);

  // Disconnect from WebSocket (user-initiated or cleanup)
  const disconnect = useCallback(() => {
    userDisconnectRef.current = true; // Mark as user-initiated
    connectingRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsRetrying(false);
    if (wsRef.current) {
      // Clear handlers to prevent any callbacks after disconnect
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      // Only close if OPEN (not CONNECTING - that causes "closed before established" warning)
      // CONNECTING sockets will be cleaned up by the browser when handlers are cleared
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  // Manual retry function (resets attempt count and tries again)
  const retry = useCallback(() => {
    userDisconnectRef.current = false;
    reconnectCountRef.current = 0;
    connectingRef.current = false;
    setIsRetrying(true);

    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Connect with a small delay
    setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, 100);
  }, [connect]);

  // Auto-connect on mount (run only once)
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      // Delay initial connection to allow page to fully load
      // This prevents race conditions with other components initializing
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, INITIAL_CONNECTION_DELAY);

      return () => {
        clearTimeout(timer);
        mountedRef.current = false;
        disconnect();
      };
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]); // Only depend on autoConnect, not connect/disconnect

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    ...state,
    events,
    isRetrying,
    reconnectAttempt: reconnectCountRef.current,
    maxReconnectAttempts: reconnectAttempts,
    connect,
    disconnect,
    retry,
    clearEvents,
  };
}

// ============================================================================
// Specialized Hooks for Specific Event Types
// ============================================================================

/**
 * Hook for trading events (orders + trades)
 */
export function useTradingWebSocket(pairId?: number, options: Omit<UseWebSocketOptions, 'endpoint' | 'params'> = {}) {
  const [orderBook, setOrderBook] = useState<{
    bids: OrderWsEvent[];
    asks: OrderWsEvent[];
  }>({ bids: [], asks: [] });
  const [recentTrades, setRecentTrades] = useState<TradeWsEvent[]>([]);

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'OrderPlaced') {
      const order = event.data;
      setOrderBook(prev => ({
        bids: order.side === 'buy' ? [order, ...prev.bids] : prev.bids,
        asks: order.side === 'sell' ? [order, ...prev.asks] : prev.asks,
      }));
    } else if (event.type === 'OrderUpdated') {
      // Remove filled/cancelled orders from book
      if (event.data.status === 'filled' || event.data.status === 'cancelled') {
        setOrderBook(prev => ({
          bids: prev.bids.filter(o => o.order_id !== event.data.order_id),
          asks: prev.asks.filter(o => o.order_id !== event.data.order_id),
        }));
      }
    } else if (event.type === 'TradeExecuted') {
      setRecentTrades(prev => [event.data, ...prev.slice(0, 49)]);
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/trading',
    params: pairId !== undefined ? { pair_id: pairId } : {},
    onEvent: handleEvent,
  });

  return {
    ...ws,
    orderBook,
    recentTrades,
  };
}

/**
 * Hook for job events
 */
export function useJobsWebSocket(options: Omit<UseWebSocketOptions, 'endpoint'> = {}) {
  const [jobUpdates, setJobUpdates] = useState<Map<string, JobUpdateEvent>>(new Map());

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'JobUpdate') {
      setJobUpdates(prev => {
        const next = new Map(prev);
        next.set(event.data.job_id, event.data);
        return next;
      });
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/jobs',
    onEvent: handleEvent,
  });

  return {
    ...ws,
    jobUpdates,
    getJobStatus: (jobId: string) => jobUpdates.get(jobId),
  };
}

/**
 * Hook for proof verification events
 */
export function useProofsWebSocket(options: Omit<UseWebSocketOptions, 'endpoint'> = {}) {
  const [proofVerifications, setProofVerifications] = useState<ProofVerifiedEvent[]>([]);

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'ProofVerified') {
      setProofVerifications(prev => [event.data, ...prev.slice(0, 99)]);
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/proofs',
    onEvent: handleEvent,
  });

  return {
    ...ws,
    proofVerifications,
  };
}

/**
 * Hook for governance events
 */
export function useGovernanceWebSocket(proposalId?: string, options: Omit<UseWebSocketOptions, 'endpoint' | 'params'> = {}) {
  const [proposals, setProposals] = useState<ProposalWsEvent[]>([]);
  const [votes, setVotes] = useState<VoteWsEvent[]>([]);

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'ProposalCreated') {
      setProposals(prev => [event.data, ...prev]);
    } else if (event.type === 'VoteCast') {
      setVotes(prev => [event.data, ...prev.slice(0, 99)]);
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/governance',
    params: proposalId ? { proposal_id: proposalId } : {},
    onEvent: handleEvent,
  });

  return {
    ...ws,
    proposals,
    votes,
  };
}

/**
 * Hook for staking events
 */
export function useStakingWebSocket(address?: string, options: Omit<UseWebSocketOptions, 'endpoint' | 'params'> = {}) {
  const [stakingEvents, setStakingEvents] = useState<StakingWsEvent[]>([]);

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'StakingEvent') {
      setStakingEvents(prev => [event.data, ...prev.slice(0, 99)]);
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/staking',
    params: address ? { address } : {},
    onEvent: handleEvent,
  });

  return {
    ...ws,
    stakingEvents,
  };
}

/**
 * Hook for network stats
 */
export function useNetworkStatsWebSocket(options: Omit<UseWebSocketOptions, 'endpoint'> = {}) {
  const [networkStats, setNetworkStats] = useState<NetworkStatsEvent | null>(null);
  const [workerUpdates, setWorkerUpdates] = useState<Map<string, WorkerUpdateEvent>>(new Map());

  const handleEvent = useCallback((event: WsEvent) => {
    if (event.type === 'NetworkStats') {
      setNetworkStats(event.data);
    } else if (event.type === 'WorkerUpdate') {
      setWorkerUpdates(prev => {
        const next = new Map(prev);
        next.set(event.data.worker_id, event.data);
        return next;
      });
    }
    options.onEvent?.(event);
  }, [options]);

  const ws = useWebSocket({
    ...options,
    endpoint: '/ws/workers',
    onEvent: handleEvent,
  });

  return {
    ...ws,
    networkStats,
    workerUpdates,
    getWorkerStatus: (workerId: string) => workerUpdates.get(workerId),
  };
}
