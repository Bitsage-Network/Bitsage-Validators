/**
 * On-Chain Transaction History Hook
 *
 * Fetches real Transfer events from the SAGE Token contract on Starknet.
 * Uses the Starknet RPC to query events for a given address.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { getContractAddresses, NetworkType } from '../contracts';
import { hash, num } from 'starknet';

// ============================================================================
// Types
// ============================================================================

export type TransactionType = 'send' | 'receive' | 'approve' | 'stake' | 'unstake' | 'claim' | 'swap';

export interface OnChainTransaction {
  id: string;
  txHash: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: bigint;
  amountFormatted: string;
  token: string;
  timestamp: Date;
  blockNumber: number;
  status: 'confirmed';
}

export interface TransactionHistoryResult {
  transactions: OnChainTransaction[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
}

// ============================================================================
// Constants
// ============================================================================

// Event selector for Transfer(from, to, value)
// keccak256("Transfer") in Starknet format
const TRANSFER_EVENT_KEY = hash.getSelectorFromName('Transfer');

// Pagination
const PAGE_SIZE = 20;

// ============================================================================
// Helpers
// ============================================================================

function parseU256(low: string | bigint, high?: string | bigint): bigint {
  const lowBn = BigInt(low || 0);
  const highBn = BigInt(high || 0);
  return lowBn + (highBn << 128n);
}

function formatAmount(amount: bigint, decimals: number = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 4);
  return `${wholePart.toLocaleString()}.${fractionalStr}`;
}

function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================================
// Hook
// ============================================================================

export function useTransactionHistory(
  address?: string,
  network: NetworkType = 'sepolia',
  options: { pageSize?: number } = {}
): TransactionHistoryResult {
  const { address: connectedAddress } = useAccount();
  const { provider } = useProvider();
  const targetAddress = address || connectedAddress;

  const [transactions, setTransactions] = useState<OnChainTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const addresses = getContractAddresses(network);
  const sageTokenAddress = addresses.SAGE_TOKEN;
  const pageSize = options.pageSize || PAGE_SIZE;

  const fetchEvents = useCallback(async (append: boolean = false) => {
    if (!targetAddress || !provider || !sageTokenAddress) {
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      // Use Starknet RPC to fetch events
      // We need to query events where the address is either sender or receiver
      const eventsResponse = await (provider as unknown as {
        getEvents: (filter: {
          from_block?: { block_number: number } | 'latest' | 'pending';
          to_block?: { block_number: number } | 'latest' | 'pending';
          address?: string;
          keys?: string[][];
          chunk_size: number;
          continuation_token?: string;
        }) => Promise<{
          events: Array<{
            from_address: string;
            keys: string[];
            data: string[];
            block_number: number;
            transaction_hash: string;
            block_hash?: string;
          }>;
          continuation_token?: string;
        }>;
      }).getEvents({
        from_block: { block_number: 0 },
        to_block: 'latest',
        address: sageTokenAddress,
        keys: [[TRANSFER_EVENT_KEY]],
        chunk_size: pageSize * 2, // Fetch more to filter
        continuation_token: append ? continuationToken : undefined,
      });

      const newTransactions: OnChainTransaction[] = [];

      for (const event of eventsResponse.events) {
        // Parse Transfer event data
        // data: [from, to, value_low, value_high]
        if (event.data.length < 4) continue;

        const from = num.toHex(event.data[0]);
        const to = num.toHex(event.data[1]);
        const valueLow = event.data[2];
        const valueHigh = event.data[3];

        // Check if this transaction involves the target address
        const targetHex = num.toHex(targetAddress);
        const isFromTarget = from.toLowerCase() === targetHex.toLowerCase();
        const isToTarget = to.toLowerCase() === targetHex.toLowerCase();

        if (!isFromTarget && !isToTarget) continue;

        const amount = parseU256(valueLow, valueHigh);
        const type: TransactionType = isFromTarget ? 'send' : 'receive';

        newTransactions.push({
          id: `${event.transaction_hash}-${event.block_number}`,
          txHash: event.transaction_hash,
          type,
          from,
          to,
          amount,
          amountFormatted: formatAmount(amount),
          token: 'SAGE',
          timestamp: new Date(), // Block timestamp not available directly
          blockNumber: event.block_number,
          status: 'confirmed',
        });
      }

      // Sort by block number descending (most recent first)
      newTransactions.sort((a, b) => b.blockNumber - a.blockNumber);

      // Limit to page size
      const limitedTransactions = newTransactions.slice(0, pageSize);

      if (append) {
        setTransactions(prev => [...prev, ...limitedTransactions]);
      } else {
        setTransactions(limitedTransactions);
      }

      setContinuationToken(eventsResponse.continuation_token);
      setHasMore(!!eventsResponse.continuation_token && newTransactions.length >= pageSize);

    } catch (err) {
      console.error('Error fetching transaction history:', err);
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
    } finally {
      setIsLoading(false);
    }
  }, [targetAddress, provider, sageTokenAddress, pageSize, continuationToken]);

  // Initial fetch when address changes
  useEffect(() => {
    if (targetAddress) {
      fetchEvents(false);
    }
  }, [targetAddress, sageTokenAddress]);

  const refetch = useCallback(() => {
    setContinuationToken(undefined);
    setHasMore(true);
    fetchEvents(false);
  }, [fetchEvents]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchEvents(true);
    }
  }, [fetchEvents, hasMore, isLoading]);

  return {
    transactions,
    isLoading,
    isError,
    error,
    refetch,
    hasMore,
    loadMore,
  };
}

/**
 * Hook to get transaction count for an address
 */
export function useTransactionCount(
  address?: string,
  network: NetworkType = 'sepolia'
): { count: number; isLoading: boolean } {
  const { transactions, isLoading } = useTransactionHistory(address, network);

  return useMemo(() => ({
    count: transactions.length,
    isLoading,
  }), [transactions.length, isLoading]);
}

/**
 * Hook to get recent transactions (last N)
 */
export function useRecentTransactions(
  address?: string,
  limit: number = 5,
  network: NetworkType = 'sepolia'
): { transactions: OnChainTransaction[]; isLoading: boolean } {
  const { transactions, isLoading } = useTransactionHistory(address, network, { pageSize: limit });

  return useMemo(() => ({
    transactions: transactions.slice(0, limit),
    isLoading,
  }), [transactions, limit, isLoading]);
}

/**
 * Hook for transactions by type
 */
export function useTransactionsByType(
  type: TransactionType,
  address?: string,
  network: NetworkType = 'sepolia'
): { transactions: OnChainTransaction[]; isLoading: boolean } {
  const { transactions, isLoading } = useTransactionHistory(address, network);

  return useMemo(() => ({
    transactions: transactions.filter(tx => tx.type === type),
    isLoading,
  }), [transactions, type, isLoading]);
}

/**
 * Utility: Format transaction for display
 */
export function formatTransaction(tx: OnChainTransaction): {
  title: string;
  description: string;
  icon: string;
  color: string;
} {
  const icons: Record<TransactionType, string> = {
    send: '↑',
    receive: '↓',
    approve: '✓',
    stake: '🔒',
    unstake: '🔓',
    claim: '💰',
    swap: '↔',
  };

  const colors: Record<TransactionType, string> = {
    send: 'text-red-400',
    receive: 'text-emerald-400',
    approve: 'text-blue-400',
    stake: 'text-purple-400',
    unstake: 'text-orange-400',
    claim: 'text-yellow-400',
    swap: 'text-cyan-400',
  };

  const titles: Record<TransactionType, string> = {
    send: 'Sent',
    receive: 'Received',
    approve: 'Approved',
    stake: 'Staked',
    unstake: 'Unstaked',
    claim: 'Claimed',
    swap: 'Swapped',
  };

  return {
    title: titles[tx.type],
    description: tx.type === 'send'
      ? `To ${shortenAddress(tx.to)}`
      : `From ${shortenAddress(tx.from)}`,
    icon: icons[tx.type],
    color: colors[tx.type],
  };
}
