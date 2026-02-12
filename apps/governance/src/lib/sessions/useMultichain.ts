/**
 * Multichain Session Hooks
 *
 * React hooks for cross-chain session authorization.
 * Enables Ethereum users to create Starknet sessions and vice versa.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from '@starknet-react/core';
import {
  ChainType,
  CrossChainSessionMessage,
  MultichainSignature,
  CrossChainIdentity,
  BridgeAuthorization,
  buildCrossChainSessionMessage,
  buildEIP712TypedData,
  buildStarknetTypedData,
  verifyMultichainSignature,
  buildBridgeAuthorization,
  SUPPORTED_CHAINS,
  CHAIN_CONFIG,
} from './multichain';
import { SessionConfig, SESSION_PRESETS } from './types';
import { useSession } from './useSession';

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined';

// Ethereum provider type (simplified)
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

/**
 * Hook to detect and interact with Ethereum wallet
 */
export function useEthereumWallet() {
  const [provider, setProvider] = useState<EthereumProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;

    // Check for injected Ethereum provider
    const ethereum = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (ethereum) {
      setProvider(ethereum);

      // Get current account
      ethereum.request({ method: 'eth_accounts' })
        .then((accounts) => {
          const accts = accounts as string[];
          if (accts.length > 0) {
            setAddress(accts[0]);
            setIsConnected(true);
          }
        })
        .catch(console.error);

      // Get chain ID
      ethereum.request({ method: 'eth_chainId' })
        .then((id) => setChainId(parseInt(id as string, 16)))
        .catch(console.error);

      // Listen for account changes
      const handleAccountsChanged = (accounts: unknown) => {
        const accts = accounts as string[];
        if (accts.length > 0) {
          setAddress(accts[0]);
          setIsConnected(true);
        } else {
          setAddress(null);
          setIsConnected(false);
        }
      };

      // Listen for chain changes
      const handleChainChanged = (id: unknown) => {
        setChainId(parseInt(id as string, 16));
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  // Connect to Ethereum wallet
  const connect = useCallback(async () => {
    if (!provider) {
      throw new Error('No Ethereum wallet detected');
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const accts = accounts as string[];
    if (accts.length > 0) {
      setAddress(accts[0]);
      setIsConnected(true);
      return accts[0];
    }
    throw new Error('No accounts returned');
  }, [provider]);

  // Sign typed data (EIP-712)
  const signTypedData = useCallback(async (typedData: unknown): Promise<string> => {
    if (!provider || !address) {
      throw new Error('Ethereum wallet not connected');
    }

    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [address, JSON.stringify(typedData)],
    });

    return signature as string;
  }, [provider, address]);

  return {
    provider,
    address,
    chainId,
    isConnected,
    connect,
    signTypedData,
    isAvailable: !!provider,
  };
}

/**
 * Hook for managing cross-chain identity
 */
export function useCrossChainIdentity() {
  const { address: starknetAddress } = useAccount();
  const { address: ethereumAddress } = useEthereumWallet();

  const [identity, setIdentity] = useState<CrossChainIdentity | null>(null);

  // Update identity when addresses change
  useEffect(() => {
    const newIdentity = new CrossChainIdentity();

    if (starknetAddress) {
      newIdentity.setAddress('starknet', starknetAddress);
    }
    if (ethereumAddress) {
      newIdentity.setAddress('ethereum', ethereumAddress);
    }

    setIdentity(newIdentity);
  }, [starknetAddress, ethereumAddress]);

  // Link a new chain address
  const linkAddress = useCallback((chain: ChainType, address: string) => {
    if (!identity) return;
    identity.setAddress(chain, address);
    // Trigger re-render with new identity
    setIdentity(new CrossChainIdentity(identity.getAllAddresses()));
  }, [identity]);

  return {
    identity,
    starknetAddress,
    ethereumAddress,
    hasStarknet: !!starknetAddress,
    hasEthereum: !!ethereumAddress,
    linkedChains: identity ? Object.keys(identity.getAllAddresses()) as ChainType[] : [],
    linkAddress,
    identityHash: identity?.getIdentityHash(),
  };
}

/**
 * Hook for creating cross-chain sessions
 */
export function useCrossChainSession() {
  const { account: starknetAccount, address: starknetAddress } = useAccount();
  const ethWallet = useEthereumWallet();
  const { createSession } = useSession();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a session from Ethereum wallet for Starknet
  const createSessionFromEthereum = useCallback(async (
    config: SessionConfig,
    targetStarknetAddress?: string
  ): Promise<{
    message: CrossChainSessionMessage;
    signature: MultichainSignature;
  }> => {
    if (!ethWallet.isConnected || !ethWallet.address) {
      throw new Error('Ethereum wallet not connected');
    }

    const targetAddress = targetStarknetAddress || starknetAddress;
    if (!targetAddress) {
      throw new Error('No target Starknet address specified');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate session key
      const sessionKeyBytes = new Uint8Array(32);
      if (isBrowser) {
        window.crypto.getRandomValues(sessionKeyBytes);
      }
      const sessionKey = '0x' + Array.from(sessionKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Build the message
      const message = buildCrossChainSessionMessage(
        sessionKey,
        config,
        'ethereum',
        ethWallet.address,
        targetAddress
      );

      // Build EIP-712 typed data
      const typedData = buildEIP712TypedData(message, ethWallet.chainId || 1);

      // Sign with Ethereum wallet
      const signatureString = await ethWallet.signTypedData(typedData);

      const signature: MultichainSignature = {
        chain: 'ethereum',
        signature: signatureString,
        publicKey: ethWallet.address,
      };

      setIsLoading(false);
      return { message, signature };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create cross-chain session';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  }, [ethWallet, starknetAddress]);

  // Create a session from Starknet wallet for future cross-chain use
  const createSessionFromStarknet = useCallback(async (
    config: SessionConfig,
    targetChain: ChainType = 'starknet',
    targetAddress?: string
  ): Promise<{
    message: CrossChainSessionMessage;
    signature: MultichainSignature;
  }> => {
    if (!starknetAccount || !starknetAddress) {
      throw new Error('Starknet wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate session key
      const sessionKeyBytes = new Uint8Array(32);
      if (isBrowser) {
        window.crypto.getRandomValues(sessionKeyBytes);
      }
      const sessionKey = '0x' + Array.from(sessionKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Build the message
      const message = buildCrossChainSessionMessage(
        sessionKey,
        config,
        'starknet',
        starknetAddress,
        targetAddress || starknetAddress
      );

      // Build Starknet typed data
      const typedData = buildStarknetTypedData(message);

      // Sign with Starknet wallet
      const signResult = await starknetAccount.signMessage(typedData);
      const signatureString = Array.isArray(signResult)
        ? signResult.join(',')
        : JSON.stringify(signResult);

      const signature: MultichainSignature = {
        chain: 'starknet',
        signature: signatureString,
        publicKey: starknetAddress,
      };

      setIsLoading(false);
      return { message, signature };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create cross-chain session';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  }, [starknetAccount, starknetAddress]);

  // Verify a cross-chain signature
  const verifyCrossChainSignature = useCallback(async (
    message: CrossChainSessionMessage,
    signature: MultichainSignature,
    expectedAddress: string
  ): Promise<boolean> => {
    return verifyMultichainSignature(message, signature, expectedAddress, {
      ethereumChainId: ethWallet.chainId || 1,
      starknetChainId: 'SN_SEPOLIA',
    });
  }, [ethWallet.chainId]);

  return {
    // State
    isLoading,
    error,

    // Session creation
    createSessionFromEthereum,
    createSessionFromStarknet,

    // Verification
    verifyCrossChainSignature,

    // Wallet status
    hasEthereumWallet: ethWallet.isAvailable,
    hasStarknetWallet: !!starknetAccount,
    ethereumConnected: ethWallet.isConnected,
    starknetConnected: !!starknetAddress,

    // Presets
    presets: SESSION_PRESETS,
    supportedChains: SUPPORTED_CHAINS,
    chainConfig: CHAIN_CONFIG,
  };
}

/**
 * Hook for bridge authorization (foundation for cross-chain transfers)
 */
export function useBridgeAuthorization() {
  const ethWallet = useEthereumWallet();
  const { account: starknetAccount, address: starknetAddress } = useAccount();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create bridge authorization from Ethereum to Starknet
  const authorizeFromEthereum = useCallback(async (
    tokenAddress: string,
    amount: bigint,
    starknetRecipient: string
  ): Promise<BridgeAuthorization> => {
    if (!ethWallet.isConnected || !ethWallet.address) {
      throw new Error('Ethereum wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build authorization
      const authData = buildBridgeAuthorization(
        'ethereum',
        tokenAddress,
        amount,
        'starknet',
        starknetRecipient
      );

      // Build EIP-712 for bridge authorization
      const typedData = {
        domain: {
          name: 'BitSage Bridge',
          version: '1',
          chainId: ethWallet.chainId || 1,
        },
        types: {
          BridgeAuthorization: [
            { name: 'sourceChain', type: 'string' },
            { name: 'sourceToken', type: 'address' },
            { name: 'sourceAmount', type: 'uint256' },
            { name: 'destChain', type: 'string' },
            { name: 'destRecipient', type: 'bytes32' },
            { name: 'nonce', type: 'bytes32' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'BridgeAuthorization',
        message: authData,
      };

      // Sign
      const signatureString = await ethWallet.signTypedData(typedData);

      const authorization: BridgeAuthorization = {
        ...authData,
        sourceSignature: {
          chain: 'ethereum',
          signature: signatureString,
          publicKey: ethWallet.address,
        },
      };

      setIsLoading(false);
      return authorization;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to authorize bridge';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  }, [ethWallet]);

  // Create bridge authorization from Starknet to Ethereum
  const authorizeFromStarknet = useCallback(async (
    tokenAddress: string,
    amount: bigint,
    ethereumRecipient: string
  ): Promise<BridgeAuthorization> => {
    if (!starknetAccount || !starknetAddress) {
      throw new Error('Starknet wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build authorization
      const authData = buildBridgeAuthorization(
        'starknet',
        tokenAddress,
        amount,
        'ethereum',
        ethereumRecipient
      );

      // Build Starknet typed data for bridge
      const typedData = {
        domain: {
          name: 'BitSage Bridge',
          version: '1',
          chainId: 'SN_SEPOLIA',
        },
        types: {
          StarkNetDomain: [
            { name: 'name', type: 'felt' },
            { name: 'version', type: 'felt' },
            { name: 'chainId', type: 'felt' },
          ],
          BridgeAuthorization: [
            { name: 'sourceChain', type: 'felt' },
            { name: 'sourceToken', type: 'felt' },
            { name: 'sourceAmount', type: 'u256' },
            { name: 'destChain', type: 'felt' },
            { name: 'destRecipient', type: 'felt' },
            { name: 'nonce', type: 'felt' },
            { name: 'deadline', type: 'felt' },
          ],
        },
        primaryType: 'BridgeAuthorization',
        message: {
          sourceChain: '0x' + Buffer.from('starknet').toString('hex'),
          sourceToken: tokenAddress,
          sourceAmount: {
            low: (amount & BigInt('0xFFFFFFFFFFFFFFFF')).toString(),
            high: (amount >> 128n).toString(),
          },
          destChain: '0x' + Buffer.from('ethereum').toString('hex'),
          destRecipient: ethereumRecipient,
          nonce: authData.nonce,
          deadline: authData.deadline.toString(),
        },
      };

      // Sign
      const signResult = await starknetAccount.signMessage(typedData);
      const signatureString = Array.isArray(signResult)
        ? signResult.join(',')
        : JSON.stringify(signResult);

      const authorization: BridgeAuthorization = {
        ...authData,
        sourceSignature: {
          chain: 'starknet',
          signature: signatureString,
          publicKey: starknetAddress,
        },
      };

      setIsLoading(false);
      return authorization;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to authorize bridge';
      setError(errorMessage);
      setIsLoading(false);
      throw err;
    }
  }, [starknetAccount, starknetAddress]);

  return {
    isLoading,
    error,
    authorizeFromEthereum,
    authorizeFromStarknet,
    supportedChains: SUPPORTED_CHAINS,
  };
}
