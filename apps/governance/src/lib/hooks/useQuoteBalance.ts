/**
 * Quote Token Balance Hook
 *
 * Provides real balances for quote tokens used in trading pairs:
 * - ETH (native Starknet ETH)
 * - STRK (Starknet token)
 * - USDC (bridged USDC)
 */

import { useMemo } from 'react';
import { useAccount, useBalance, useReadContract } from '@starknet-react/core';
import { Abi } from 'starknet';

// ============================================================================
// Token Addresses (Starknet Sepolia)
// ============================================================================

export const QUOTE_TOKEN_ADDRESSES = {
  // Native ETH on Starknet Sepolia
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  // STRK token on Sepolia
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  // USDC on Sepolia (bridged)
  USDC: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
} as const;

export type QuoteToken = keyof typeof QUOTE_TOKEN_ADDRESSES;

// ============================================================================
// ERC20 ABI (minimal for balanceOf)
// ============================================================================

const ERC20_ABI: Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'core::starknet::contract_address::ContractAddress' }],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'core::integer::u8' }],
    state_mutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ type: 'core::felt252' }],
    state_mutability: 'view',
  },
];

// ============================================================================
// Token Decimals
// ============================================================================

export const TOKEN_DECIMALS: Record<QuoteToken, number> = {
  ETH: 18,
  STRK: 18,
  USDC: 6,
};

// ============================================================================
// Types
// ============================================================================

export interface QuoteBalanceResult {
  balance: bigint;
  balanceFormatted: string;
  balanceNumber: number;
  decimals: number;
  symbol: QuoteToken;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface AllQuoteBalancesResult {
  ETH: QuoteBalanceResult;
  STRK: QuoteBalanceResult;
  USDC: QuoteBalanceResult;
  isLoading: boolean;
  totalUsdValue?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function formatBalance(balance: bigint, decimals: number, maxDecimals: number = 4): string {
  if (balance === 0n) return '0.00';

  const divisor = 10n ** BigInt(decimals);
  const wholePart = balance / divisor;
  const fractionalPart = balance % divisor;

  // Pad fractional part
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, maxDecimals);

  // Remove trailing zeros
  const trimmedFractional = fractionalStr.replace(/0+$/, '') || '0';

  return `${wholePart.toLocaleString()}.${trimmedFractional.padEnd(2, '0')}`;
}

function balanceToNumber(balance: bigint, decimals: number): number {
  return Number(balance) / (10 ** decimals);
}

// ============================================================================
// Individual Token Balance Hook
// ============================================================================

export function useQuoteBalance(
  token: QuoteToken,
  address?: string
): QuoteBalanceResult {
  const { address: connectedAddress } = useAccount();
  const targetAddress = address || connectedAddress;
  const tokenAddress = QUOTE_TOKEN_ADDRESSES[token];
  const decimals = TOKEN_DECIMALS[token];

  const { data, isLoading, error, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: targetAddress ? [targetAddress] : undefined,
    watch: true,
  });

  return useMemo(() => {
    // Parse U256 from contract response (low, high)
    let balance = 0n;
    if (data) {
      if (typeof data === 'bigint') {
        balance = data;
      } else if (Array.isArray(data) && data.length >= 1) {
        // U256 = low + high * 2^128
        const low = BigInt(data[0] || 0);
        const high = BigInt(data[1] || 0);
        balance = low + (high << 128n);
      } else if (typeof data === 'object' && data !== null) {
        const d = data as { low?: bigint | string; high?: bigint | string };
        const low = BigInt(d.low || 0);
        const high = BigInt(d.high || 0);
        balance = low + (high << 128n);
      }
    }

    return {
      balance,
      balanceFormatted: formatBalance(balance, decimals),
      balanceNumber: balanceToNumber(balance, decimals),
      decimals,
      symbol: token,
      isLoading,
      error: error as Error | null,
      refetch,
    };
  }, [data, decimals, token, isLoading, error, refetch]);
}

// ============================================================================
// All Quote Balances Hook
// ============================================================================

export function useAllQuoteBalances(address?: string): AllQuoteBalancesResult {
  const eth = useQuoteBalance('ETH', address);
  const strk = useQuoteBalance('STRK', address);
  const usdc = useQuoteBalance('USDC', address);

  const isLoading = eth.isLoading || strk.isLoading || usdc.isLoading;

  return {
    ETH: eth,
    STRK: strk,
    USDC: usdc,
    isLoading,
  };
}

// ============================================================================
// Quote Balance for Trading Pair
// ============================================================================

export function useQuoteBalanceForPair(
  pairId: string,
  address?: string
): QuoteBalanceResult {
  // Determine quote token from pair ID
  const quoteToken = useMemo((): QuoteToken => {
    if (pairId.includes('USDC')) return 'USDC';
    if (pairId.includes('ETH')) return 'ETH';
    if (pairId.includes('STRK')) return 'STRK';
    return 'USDC'; // Default
  }, [pairId]);

  return useQuoteBalance(quoteToken, address);
}

// ============================================================================
// Native ETH Balance Hook (using useBalance from starknet-react)
// ============================================================================

export function useNativeEthBalance(address?: string): QuoteBalanceResult {
  const { address: connectedAddress } = useAccount();
  const targetAddress = address || connectedAddress;

  const { data, isLoading, error, refetch } = useBalance({
    address: targetAddress as `0x${string}`,
    token: QUOTE_TOKEN_ADDRESSES.ETH as `0x${string}`,
    watch: true,
  });

  return useMemo(() => {
    const balance = data?.value || 0n;

    return {
      balance,
      balanceFormatted: formatBalance(balance, 18),
      balanceNumber: balanceToNumber(balance, 18),
      decimals: 18,
      symbol: 'ETH' as QuoteToken,
      isLoading,
      error: error as Error | null,
      refetch,
    };
  }, [data, isLoading, error, refetch]);
}

// ============================================================================
// Export token info for UI
// ============================================================================

export const QUOTE_TOKEN_INFO: Record<QuoteToken, {
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
}> = {
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    icon: '/tokens/eth.svg',
  },
  STRK: {
    name: 'Starknet Token',
    symbol: 'STRK',
    decimals: 18,
    icon: '/tokens/strk.svg',
  },
  USDC: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    icon: '/tokens/usdc.svg',
  },
};
