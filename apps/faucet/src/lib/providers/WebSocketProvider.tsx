'use client';

/**
 * BitSage WebSocket Provider
 *
 * Provides app-wide WebSocket connectivity with real-time event streaming.
 * Manages connection lifecycle and distributes events to subscribed components.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import {
  useWebSocket,
  WsEvent,
  ConnectionState,
  JobUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
  OrderWsEvent,
  TradeWsEvent,
  StakingWsEvent,
  ProposalWsEvent,
  VoteWsEvent,
} from '@/lib/hooks/useWebSocket';

// ============================================================================
// Types
// ============================================================================

export interface WebSocketContextValue {
  // Connection state
  isConnected: boolean;
  connectionState: ConnectionState;
  lastHeartbeat: number | null;
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;

  // Latest events by type
  latestJobUpdate: JobUpdateEvent | null;
  latestNetworkStats: NetworkStatsEvent | null;
  latestProofVerified: ProofVerifiedEvent | null;
  latestOrder: OrderWsEvent | null;
  latestTrade: TradeWsEvent | null;
  latestStakingEvent: StakingWsEvent | null;
  latestProposal: ProposalWsEvent | null;
  latestVote: VoteWsEvent | null;

  // Event history
  recentEvents: WsEvent[];

  // Subscription management
  subscribe: (eventType: string, callback: (event: WsEvent) => void) => () => void;
}

// ============================================================================
// Context
// ============================================================================

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface WebSocketProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export function WebSocketProvider({
  children,
  autoConnect = true,
}: WebSocketProviderProps) {
  // Subscription registry
  const [subscribers, setSubscribers] = useState<
    Map<string, Set<(event: WsEvent) => void>>
  >(new Map());

  // Latest events by type
  const [latestJobUpdate, setLatestJobUpdate] = useState<JobUpdateEvent | null>(null);
  const [latestNetworkStats, setLatestNetworkStats] = useState<NetworkStatsEvent | null>(null);
  const [latestProofVerified, setLatestProofVerified] = useState<ProofVerifiedEvent | null>(null);
  const [latestOrder, setLatestOrder] = useState<OrderWsEvent | null>(null);
  const [latestTrade, setLatestTrade] = useState<TradeWsEvent | null>(null);
  const [latestStakingEvent, setLatestStakingEvent] = useState<StakingWsEvent | null>(null);
  const [latestProposal, setLatestProposal] = useState<ProposalWsEvent | null>(null);
  const [latestVote, setLatestVote] = useState<VoteWsEvent | null>(null);

  // Handle incoming events
  const handleEvent = useCallback(
    (event: WsEvent) => {
      // Update latest event by type
      switch (event.type) {
        case 'JobUpdate':
          setLatestJobUpdate(event.data);
          break;
        case 'NetworkStats':
          setLatestNetworkStats(event.data);
          break;
        case 'ProofVerified':
          setLatestProofVerified(event.data);
          break;
        case 'OrderPlaced':
          setLatestOrder(event.data);
          break;
        case 'TradeExecuted':
          setLatestTrade(event.data);
          break;
        case 'StakingEvent':
          setLatestStakingEvent(event.data);
          break;
        case 'ProposalCreated':
          setLatestProposal(event.data);
          break;
        case 'VoteCast':
          setLatestVote(event.data);
          break;
      }

      // Notify subscribers
      const typeSubscribers = subscribers.get(event.type);
      if (typeSubscribers) {
        typeSubscribers.forEach((callback) => callback(event));
      }

      // Also notify 'all' subscribers
      const allSubscribers = subscribers.get('all');
      if (allSubscribers) {
        allSubscribers.forEach((callback) => callback(event));
      }
    },
    [subscribers]
  );

  // Initialize WebSocket connection
  const ws = useWebSocket({
    endpoint: '/ws',
    autoConnect,
    onEvent: handleEvent,
  });

  // Subscribe to specific event types
  const subscribe = useCallback(
    (eventType: string, callback: (event: WsEvent) => void) => {
      setSubscribers((prev) => {
        const next = new Map(prev);
        if (!next.has(eventType)) {
          next.set(eventType, new Set());
        }
        next.get(eventType)!.add(callback);
        return next;
      });

      // Return unsubscribe function
      return () => {
        setSubscribers((prev) => {
          const next = new Map(prev);
          const typeSet = next.get(eventType);
          if (typeSet) {
            typeSet.delete(callback);
            if (typeSet.size === 0) {
              next.delete(eventType);
            }
          }
          return next;
        });
      };
    },
    []
  );

  // Context value
  const value = useMemo<WebSocketContextValue>(
    () => ({
      isConnected: ws.isConnected,
      connectionState: ws.connectionState,
      lastHeartbeat: ws.lastHeartbeat,
      error: ws.error,
      connect: ws.connect,
      disconnect: ws.disconnect,
      latestJobUpdate,
      latestNetworkStats,
      latestProofVerified,
      latestOrder,
      latestTrade,
      latestStakingEvent,
      latestProposal,
      latestVote,
      recentEvents: ws.events,
      subscribe,
    }),
    [
      ws.isConnected,
      ws.connectionState,
      ws.lastHeartbeat,
      ws.error,
      ws.connect,
      ws.disconnect,
      ws.events,
      latestJobUpdate,
      latestNetworkStats,
      latestProofVerified,
      latestOrder,
      latestTrade,
      latestStakingEvent,
      latestProposal,
      latestVote,
      subscribe,
    ]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the WebSocket context
 */
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

/**
 * Safe version that returns null/defaults when outside provider
 * Use this in components that may render before WebSocketProvider is mounted
 */
export function useSafeWebSocketContext(): WebSocketContextValue | null {
  const context = useContext(WebSocketContext);
  return context;
}

/**
 * Safe version of useWebSocketStatus that works outside provider
 */
export function useSafeWebSocketStatus() {
  const context = useContext(WebSocketContext);

  // Default values when outside provider
  if (!context) {
    return {
      isConnected: false,
      connectionState: 'disconnected' as const,
      statusText: 'Not Connected',
      statusColor: 'text-gray-400',
      lastHeartbeat: null,
      timeSinceHeartbeat: null,
      isStale: false,
    };
  }

  const { isConnected, connectionState, lastHeartbeat, error } = context;

  const statusText = (() => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return error || 'Connection Error';
    }
  })();

  const statusColor = (() => {
    switch (connectionState) {
      case 'connected':
        return 'text-emerald-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'disconnected':
        return 'text-gray-400';
      case 'error':
        return 'text-red-400';
    }
  })();

  const timeSinceHeartbeat = lastHeartbeat
    ? Math.floor(Date.now() / 1000) - lastHeartbeat
    : null;

  return {
    isConnected,
    connectionState,
    statusText,
    statusColor,
    lastHeartbeat,
    timeSinceHeartbeat,
    isStale: timeSinceHeartbeat !== null && timeSinceHeartbeat > 60,
  };
}

/**
 * Subscribe to specific event types
 * Safe to use outside WebSocketProvider - no-ops when context unavailable
 */
export function useWebSocketSubscription(
  eventType: string,
  callback: (event: WsEvent) => void
) {
  const context = useContext(WebSocketContext);

  useEffect(() => {
    if (!context) return;
    const unsubscribe = context.subscribe(eventType, callback);
    return unsubscribe;
  }, [context, eventType, callback]);
}

/**
 * Hook for WebSocket connection status indicator
 * NOTE: Use useSafeWebSocketStatus when outside WebSocketProvider
 */
export function useWebSocketStatus() {
  const context = useWebSocketContext();
  const { isConnected, connectionState, lastHeartbeat, error } = context;

  const statusText = useMemo(() => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return error || 'Connection Error';
    }
  }, [connectionState, error]);

  const statusColor = useMemo(() => {
    switch (connectionState) {
      case 'connected':
        return 'text-emerald-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'disconnected':
        return 'text-gray-400';
      case 'error':
        return 'text-red-400';
    }
  }, [connectionState]);

  const timeSinceHeartbeat = useMemo(() => {
    if (!lastHeartbeat) return null;
    const now = Math.floor(Date.now() / 1000);
    return now - lastHeartbeat;
  }, [lastHeartbeat]);

  return {
    isConnected,
    connectionState,
    statusText,
    statusColor,
    lastHeartbeat,
    timeSinceHeartbeat,
    isStale: timeSinceHeartbeat !== null && timeSinceHeartbeat > 60,
  };
}

/**
 * Hook to get real-time job updates
 * Safe to use outside WebSocketProvider - returns safe defaults
 */
export function useRealtimeJobUpdates() {
  const context = useContext(WebSocketContext);
  const [jobUpdates, setJobUpdates] = useState<Map<string, JobUpdateEvent>>(new Map());

  useEffect(() => {
    if (!context) return;
    const unsubscribe = context.subscribe('JobUpdate', (event) => {
      if (event.type === 'JobUpdate') {
        setJobUpdates((prev) => {
          const next = new Map(prev);
          next.set(event.data.job_id, event.data);
          return next;
        });
      }
    });
    return unsubscribe;
  }, [context]);

  // Return safe defaults when outside provider
  if (!context) {
    return {
      latestJobUpdate: null,
      jobUpdates: new Map<string, JobUpdateEvent>(),
      getJobStatus: () => undefined,
    };
  }

  return {
    latestJobUpdate: context.latestJobUpdate,
    jobUpdates,
    getJobStatus: (jobId: string) => jobUpdates.get(jobId),
  };
}

/**
 * Hook to get real-time network stats
 * Safe to use outside WebSocketProvider - returns null
 */
export function useRealtimeNetworkStats() {
  const context = useContext(WebSocketContext);
  return context?.latestNetworkStats ?? null;
}

/**
 * Hook to get real-time order book updates
 * Safe to use outside WebSocketProvider - returns empty arrays
 */
export function useRealtimeOrderBook(pairId?: number) {
  const context = useContext(WebSocketContext);
  const [orders, setOrders] = useState<OrderWsEvent[]>([]);
  const [trades, setTrades] = useState<TradeWsEvent[]>([]);

  useEffect(() => {
    if (!context) return;

    const unsubOrder = context.subscribe('OrderPlaced', (event) => {
      if (event.type === 'OrderPlaced') {
        if (pairId === undefined || event.data.pair_id === pairId) {
          setOrders((prev) => [event.data, ...prev.slice(0, 99)]);
        }
      }
    });

    const unsubTrade = context.subscribe('TradeExecuted', (event) => {
      if (event.type === 'TradeExecuted') {
        if (pairId === undefined || event.data.pair_id === pairId) {
          setTrades((prev) => [event.data, ...prev.slice(0, 99)]);
        }
      }
    });

    return () => {
      unsubOrder();
      unsubTrade();
    };
  }, [context, pairId]);

  return { orders, trades };
}

/**
 * Hook to get real-time proof verifications
 */
export function useRealtimeProofVerifications() {
  const context = useContext(WebSocketContext);
  const [verifications, setVerifications] = useState<ProofVerifiedEvent[]>([]);

  useEffect(() => {
    if (!context) return;
    const unsubscribe = context.subscribe('ProofVerified', (event) => {
      if (event.type === 'ProofVerified') {
        setVerifications((prev) => [event.data, ...prev.slice(0, 99)]);
      }
    });
    return unsubscribe;
  }, [context]);

  // Return safe defaults when outside provider
  if (!context) {
    return {
      latestProofVerified: null,
      verifications: [],
    };
  }

  return {
    latestProofVerified: context.latestProofVerified,
    verifications,
  };
}
