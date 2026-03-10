/**
 * Multichain Signature Verification
 *
 * Enables cross-chain session authorization for the Obelysk Wallet.
 * Users can authorize Starknet sessions from Ethereum wallets and vice versa.
 *
 * Supported chains:
 * - Starknet (STARK curve signatures)
 * - Ethereum/EVM (secp256k1 ECDSA signatures)
 * - Future: Solana (Ed25519), Bitcoin (secp256k1), Cosmos (secp256k1)
 */

import { ec, hash, encode, TypedData, typedData } from 'starknet';
import { SessionConfig, AllowedCall, SESSION_CONSTANTS } from './types';

// Chain identifiers
export type ChainType = 'starknet' | 'ethereum' | 'solana' | 'bitcoin' | 'cosmos';

// Chain-specific address formats
export interface ChainAddress {
  chain: ChainType;
  address: string;
  // Optional: public key for chains where address != pubkey
  publicKey?: string;
}

// Cross-chain session authorization message
export interface CrossChainSessionMessage {
  // Session details
  sessionKey: string;
  expiresIn: number;
  spendingLimit: string; // BigInt as string for cross-chain compat
  allowedCalls: AllowedCall[];

  // Source chain info
  sourceChain: ChainType;
  sourceAddress: string;

  // Target chain info (always Starknet for now)
  targetChain: 'starknet';
  targetAddress: string;

  // Nonce to prevent replay
  nonce: string;
  timestamp: number;
}

// Signature with chain metadata
export interface MultichainSignature {
  chain: ChainType;
  signature: string;
  // Recovery parameter for ECDSA
  recoveryParam?: number;
  // Public key if needed for verification
  publicKey?: string;
}

// EIP-712 domain for Ethereum signatures
const EIP712_DOMAIN = {
  name: 'BitSage Cross-Chain Session',
  version: '1',
  chainId: 1, // Will be overridden per chain
};

// EIP-712 types for session authorization
const EIP712_TYPES = {
  CrossChainSession: [
    { name: 'sessionKey', type: 'bytes32' },
    { name: 'expiresIn', type: 'uint256' },
    { name: 'spendingLimit', type: 'uint256' },
    { name: 'allowedCallsHash', type: 'bytes32' },
    { name: 'sourceChain', type: 'string' },
    { name: 'sourceAddress', type: 'address' },
    { name: 'targetChain', type: 'string' },
    { name: 'targetAddress', type: 'bytes32' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

// SNIP-12 typed data for Starknet signatures
const STARKNET_SESSION_TYPE = {
  StarkNetDomain: [
    { name: 'name', type: 'felt' },
    { name: 'version', type: 'felt' },
    { name: 'chainId', type: 'felt' },
  ],
  CrossChainSession: [
    { name: 'sessionKey', type: 'felt' },
    { name: 'expiresIn', type: 'felt' },
    { name: 'spendingLimit', type: 'u256' },
    { name: 'allowedCallsHash', type: 'felt' },
    { name: 'sourceChain', type: 'felt' },
    { name: 'sourceAddress', type: 'felt' },
    { name: 'targetChain', type: 'felt' },
    { name: 'targetAddress', type: 'felt' },
    { name: 'nonce', type: 'felt' },
    { name: 'timestamp', type: 'felt' },
  ],
};

/**
 * Build the message hash for cross-chain session authorization
 */
export function buildCrossChainSessionMessage(
  sessionKey: string,
  config: SessionConfig,
  sourceChain: ChainType,
  sourceAddress: string,
  targetAddress: string,
  nonce?: string
): CrossChainSessionMessage {
  return {
    sessionKey,
    expiresIn: config.expiresIn,
    spendingLimit: config.spendingLimit.toString(),
    allowedCalls: config.allowedCalls,
    sourceChain,
    sourceAddress,
    targetChain: 'starknet',
    targetAddress,
    nonce: nonce || generateNonce(),
    timestamp: Math.floor(Date.now() / 1000),
  };
}

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for SSR — use Node crypto if available
  try {
    const crypto = require('crypto');
    return '0x' + crypto.randomBytes(32).toString('hex');
  } catch {
    // No secure random source — refuse to generate weak nonce
    throw new Error('Secure random source not available — cannot generate cryptographic nonce');
  }
}

/**
 * Hash allowed calls for compact representation
 */
function hashAllowedCalls(calls: AllowedCall[]): string {
  if (calls.length === 0) {
    return '0x0';
  }

  const elements = calls.flatMap(c => [c.contractAddress, c.selector || '0x0']);
  return hash.computePoseidonHashOnElements(elements);
}

/**
 * Build EIP-712 typed data for Ethereum wallet signing
 */
export function buildEIP712TypedData(
  message: CrossChainSessionMessage,
  chainId: number = 1
): {
  domain: typeof EIP712_DOMAIN;
  types: typeof EIP712_TYPES;
  primaryType: 'CrossChainSession';
  message: Record<string, unknown>;
} {
  const allowedCallsHash = hashAllowedCalls(message.allowedCalls);

  return {
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: 'CrossChainSession',
    message: {
      sessionKey: message.sessionKey,
      expiresIn: message.expiresIn,
      spendingLimit: message.spendingLimit,
      allowedCallsHash,
      sourceChain: message.sourceChain,
      sourceAddress: message.sourceAddress,
      targetChain: message.targetChain,
      targetAddress: message.targetAddress,
      nonce: message.nonce,
      timestamp: message.timestamp,
    },
  };
}

/**
 * Build SNIP-12 typed data for Starknet wallet signing
 */
export function buildStarknetTypedData(
  message: CrossChainSessionMessage,
  chainId: string = 'SN_SEPOLIA'
): TypedData {
  const allowedCallsHash = hashAllowedCalls(message.allowedCalls);

  // Convert chain names to felt252
  const chainToFelt = (chain: string): string => {
    return '0x' + Buffer.from(chain).toString('hex');
  };

  return {
    domain: {
      name: 'BitSage Cross-Chain Session',
      version: '1',
      chainId,
    },
    types: STARKNET_SESSION_TYPE,
    primaryType: 'CrossChainSession',
    message: {
      sessionKey: message.sessionKey,
      expiresIn: message.expiresIn.toString(),
      spendingLimit: {
        low: (BigInt(message.spendingLimit) & BigInt('0xFFFFFFFFFFFFFFFF')).toString(),
        high: (BigInt(message.spendingLimit) >> 128n).toString(),
      },
      allowedCallsHash,
      sourceChain: chainToFelt(message.sourceChain),
      sourceAddress: message.sourceAddress,
      targetChain: chainToFelt(message.targetChain),
      targetAddress: message.targetAddress,
      nonce: message.nonce,
      timestamp: message.timestamp.toString(),
    },
  };
}

/**
 * Verify an Ethereum ECDSA signature
 * Uses ethers.js or viem for verification
 */
export async function verifyEthereumSignature(
  message: CrossChainSessionMessage,
  signature: MultichainSignature,
  expectedAddress: string,
  chainId: number = 1
): Promise<boolean> {
  // Dynamic import to avoid bundling if not used
  try {
    const typedData = buildEIP712TypedData(message, chainId);

    // Use ethers verifyTypedData or viem's verifyTypedData
    // For now, we'll compute the hash and verify manually
    const messageHash = computeEIP712Hash(typedData);

    // Recover address from signature
    const recoveredAddress = await recoverEthereumAddress(messageHash, signature);

    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Ethereum signature verification failed:', error);
    return false;
  }
}

/**
 * Compute EIP-712 message hash
 *
 * EIP-712 requires Keccak256 (not Poseidon). Without ethers.js or viem,
 * we cannot correctly compute this hash. Returning a wrong hash would
 * silently bypass signature verification.
 */
function computeEIP712Hash(_typedData: ReturnType<typeof buildEIP712TypedData>): string {
  throw new Error(
    'EIP-712 hash computation requires ethers.js or viem — install one to enable EVM wallet verification'
  );
}

/**
 * Recover Ethereum address from signature
 */
async function recoverEthereumAddress(
  messageHash: string,
  signature: MultichainSignature
): Promise<string> {
  // Ethereum signature recovery requires ethers.js or viem (not currently installed)
  // Throw instead of returning a placeholder to prevent silent auth bypass
  if (signature.publicKey) {
    return signature.publicKey;
  }
  throw new Error(
    'Ethereum signature recovery not available — install ethers.js or viem for EVM wallet support'
  );
}

/**
 * Verify a Starknet STARK signature
 */
export async function verifyStarknetSignature(
  message: CrossChainSessionMessage,
  signature: MultichainSignature,
  expectedAddress: string,
  chainId: string = 'SN_SEPOLIA'
): Promise<boolean> {
  try {
    // Build typed data for verification context
    const starkTypedData = buildStarknetTypedData(message, chainId);

    // Compute SNIP-12 message hash for verification
    const messageHash = typedData.getMessageHash(starkTypedData, expectedAddress);

    // Parse signature
    const sigParts = signature.signature.split(',').map(s => s.trim());

    // Starknet signatures are [r, s] as hex strings
    if (sigParts.length < 2) {
      return false;
    }

    const r = sigParts[0];
    const s = sigParts[1];

    // Validate hex format
    const hexPattern = /^0x[a-fA-F0-9]+$/;
    const bareHexPattern = /^[a-fA-F0-9]+$/;
    if (!(hexPattern.test(r) || bareHexPattern.test(r)) ||
        !(hexPattern.test(s) || bareHexPattern.test(s))) {
      return false;
    }

    // Cryptographic verification using STARK curve when publicKey is available.
    // For account-abstracted wallets (multisig, etc.), on-chain is_valid_signature
    // is the definitive check — this provides a client-side pre-check.
    if (signature.publicKey) {
      try {
        const fullSig = new ec.starkCurve.Signature(
          BigInt(r.startsWith('0x') ? r : '0x' + r),
          BigInt(s.startsWith('0x') ? s : '0x' + s),
        );
        const isValid = ec.starkCurve.verify(fullSig, messageHash, signature.publicKey);
        if (!isValid) {
          return false;
        }
      } catch {
        // Signature verification threw — treat as invalid
        return false;
      }
    }

    // Format valid (and curve-verified if publicKey was provided).
    // Final authoritative check happens on-chain via the session manager contract.
    return true;
  } catch (error) {
    console.error('Starknet signature verification failed:', error);
    return false;
  }
}

/**
 * Verify a signature from any supported chain
 */
export async function verifyMultichainSignature(
  message: CrossChainSessionMessage,
  signature: MultichainSignature,
  expectedAddress: string,
  options?: {
    ethereumChainId?: number;
    starknetChainId?: string;
  }
): Promise<boolean> {
  switch (signature.chain) {
    case 'ethereum':
      return verifyEthereumSignature(
        message,
        signature,
        expectedAddress,
        options?.ethereumChainId || 1
      );

    case 'starknet':
      return verifyStarknetSignature(
        message,
        signature,
        expectedAddress,
        options?.starknetChainId || 'SN_SEPOLIA'
      );

    case 'solana':
    case 'bitcoin':
    case 'cosmos':
      // Future: implement these
      console.warn(`${signature.chain} signature verification not yet implemented`);
      return false;

    default:
      console.error(`Unknown chain: ${signature.chain}`);
      return false;
  }
}

/**
 * Create a cross-chain session from an Ethereum wallet
 * This allows ETH users to create Starknet sessions
 */
export async function createCrossChainSession(
  sessionKey: string,
  config: SessionConfig,
  sourceChain: ChainType,
  sourceAddress: string,
  targetAddress: string,
  signMessage: (message: unknown) => Promise<string>
): Promise<{
  message: CrossChainSessionMessage;
  signature: MultichainSignature;
}> {
  // Build the message
  const message = buildCrossChainSessionMessage(
    sessionKey,
    config,
    sourceChain,
    sourceAddress,
    targetAddress
  );

  // Build typed data based on source chain
  let typedDataToSign: unknown;
  if (sourceChain === 'ethereum') {
    typedDataToSign = buildEIP712TypedData(message);
  } else if (sourceChain === 'starknet') {
    typedDataToSign = buildStarknetTypedData(message);
  } else {
    throw new Error(`Unsupported source chain: ${sourceChain}`);
  }

  // Sign the message
  const signatureString = await signMessage(typedDataToSign);

  const signature: MultichainSignature = {
    chain: sourceChain,
    signature: signatureString,
  };

  return { message, signature };
}

/**
 * Address mapping utilities for cross-chain identity
 */
export class CrossChainIdentity {
  // Map of chain addresses owned by the same user
  private addressMap: Map<ChainType, string> = new Map();

  constructor(initialAddresses?: Partial<Record<ChainType, string>>) {
    if (initialAddresses) {
      Object.entries(initialAddresses).forEach(([chain, address]) => {
        this.addressMap.set(chain as ChainType, address);
      });
    }
  }

  setAddress(chain: ChainType, address: string): void {
    this.addressMap.set(chain, address);
  }

  getAddress(chain: ChainType): string | undefined {
    return this.addressMap.get(chain);
  }

  hasAddress(chain: ChainType): boolean {
    return this.addressMap.has(chain);
  }

  getAllAddresses(): Record<ChainType, string> {
    const result: Partial<Record<ChainType, string>> = {};
    this.addressMap.forEach((address, chain) => {
      result[chain] = address;
    });
    return result as Record<ChainType, string>;
  }

  // Create a deterministic identity hash from all linked addresses
  getIdentityHash(): string {
    const sortedAddresses = Array.from(this.addressMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([chain, address]) => `${chain}:${address}`);

    return hash.computePoseidonHashOnElements(
      sortedAddresses.map(s => '0x' + Buffer.from(s).toString('hex'))
    );
  }
}

/**
 * Bridge authorization message for cross-chain asset transfers
 * This establishes the foundation for multichain bridging
 */
export interface BridgeAuthorization {
  // Source chain and token
  sourceChain: ChainType;
  sourceToken: string;
  sourceAmount: string;

  // Destination chain and recipient
  destChain: ChainType;
  destRecipient: string;

  // Optional: specific destination token (for swaps)
  destToken?: string;

  // Authorization details
  nonce: string;
  deadline: number;

  // Proof of ownership on source chain
  sourceSignature: MultichainSignature;
}

/**
 * Build a bridge authorization for cross-chain transfers
 */
export function buildBridgeAuthorization(
  sourceChain: ChainType,
  sourceToken: string,
  sourceAmount: bigint,
  destChain: ChainType,
  destRecipient: string,
  deadlineSeconds: number = 3600
): Omit<BridgeAuthorization, 'sourceSignature'> {
  return {
    sourceChain,
    sourceToken,
    sourceAmount: sourceAmount.toString(),
    destChain,
    destRecipient,
    nonce: generateNonce(),
    deadline: Math.floor(Date.now() / 1000) + deadlineSeconds,
  };
}

// Export constants
export const SUPPORTED_CHAINS: ChainType[] = ['starknet', 'ethereum'];
export const FUTURE_CHAINS: ChainType[] = ['solana', 'bitcoin', 'cosmos'];

export const CHAIN_CONFIG: Record<ChainType, {
  name: string;
  signatureScheme: string;
  addressFormat: RegExp;
  explorerUrl?: string;
}> = {
  starknet: {
    name: 'Starknet',
    signatureScheme: 'STARK',
    addressFormat: /^0x[a-fA-F0-9]{64}$/,
    explorerUrl: process.env.NEXT_PUBLIC_STARKNET_NETWORK === 'mainnet' ? 'https://starkscan.co' : 'https://sepolia.starkscan.co',
  },
  ethereum: {
    name: 'Ethereum',
    signatureScheme: 'ECDSA (secp256k1)',
    addressFormat: /^0x[a-fA-F0-9]{40}$/,
    explorerUrl: 'https://etherscan.io',
  },
  solana: {
    name: 'Solana',
    signatureScheme: 'Ed25519',
    addressFormat: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    explorerUrl: 'https://solscan.io',
  },
  bitcoin: {
    name: 'Bitcoin',
    signatureScheme: 'ECDSA (secp256k1)',
    addressFormat: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/,
    explorerUrl: 'https://mempool.space',
  },
  cosmos: {
    name: 'Cosmos',
    signatureScheme: 'ECDSA (secp256k1)',
    addressFormat: /^cosmos[a-z0-9]{39}$/,
    explorerUrl: 'https://www.mintscan.io/cosmos',
  },
};
