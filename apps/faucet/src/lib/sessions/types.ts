/**
 * BitSage Session Management - Type Definitions
 *
 * Wallet-agnostic session keys for seamless dApp interactions.
 * Works with ANY Starknet wallet (Argent, Braavos, Cartridge, etc.)
 */

import { Call } from 'starknet';

// Session configuration for creating new sessions
export interface SessionConfig {
  // Duration in seconds (5 min to 7 days)
  expiresIn: number;
  // Maximum SAGE that can be spent in this session
  spendingLimit: bigint;
  // Specific contracts/functions allowed (empty = all allowed)
  allowedCalls: AllowedCall[];
}

// Allowed call permission
export interface AllowedCall {
  // Contract address that can be called
  contractAddress: string;
  // Selector (function) that can be called (0 = any function)
  selector?: string;
}

// Active session data from contract
export interface Session {
  // Session ID (Poseidon hash)
  sessionId: string;
  // Session owner (user's wallet address)
  owner: string;
  // Session public key
  sessionKey: string;
  // Expiration timestamp (Unix seconds)
  expiresAt: number;
  // Maximum spending limit in wei
  spendingLimit: bigint;
  // Amount already spent in wei
  amountSpent: bigint;
  // Whether session is still active
  isActive: boolean;
  // Creation timestamp
  createdAt: number;
  // Allowed calls for this session
  allowedCalls: AllowedCall[];
}

// Session keypair (temporary, generated per session)
export interface SessionKeyPair {
  // Public key (stored on-chain)
  publicKey: string;
  // Private key (stored locally, never leaves device)
  privateKey: string;
}

// Session execution result
export interface SessionExecutionResult {
  // Transaction hash
  transactionHash: string;
  // Whether execution was successful
  success: boolean;
  // Actual results from each call
  results: string[][];
  // Amount spent in this execution
  amountSpent: bigint;
}

// SNIP-9 Outside Execution parameters
export interface OutsideExecution {
  // Authorized caller (or ANY_CALLER)
  caller: string;
  // Unique nonce for this execution
  nonce: string;
  // Earliest execution time (Unix timestamp)
  executeAfter: number;
  // Latest execution time (Unix timestamp)
  executeBefore: number;
  // Calls to execute
  calls: Call[];
}

// Session creation event
export interface SessionCreatedEvent {
  sessionId: string;
  owner: string;
  sessionKey: string;
  expiresAt: number;
  spendingLimit: bigint;
  transactionHash: string;
}

// Session revoked event
export interface SessionRevokedEvent {
  sessionId: string;
  owner: string;
  transactionHash: string;
}

// Session execution event
export interface SessionExecutedEvent {
  sessionId: string;
  callsCount: number;
  amountSpent: bigint;
  transactionHash: string;
}

// Session manager state
export interface SessionManagerState {
  // Currently active session (if any)
  activeSession: Session | null;
  // All sessions for current user
  sessions: Session[];
  // Loading state
  isLoading: boolean;
  // Error state
  error: string | null;
}

// Session storage (IndexedDB schema)
export interface StoredSession {
  sessionId: string;
  owner: string;
  // Encrypted private key (AES-GCM with wallet-derived KEK)
  encryptedPrivateKey: string;
  // IV for AES-GCM
  iv: string;
  // Salt for key derivation
  salt: string;
  publicKey: string;
  expiresAt: number;
  createdAt: number;
  chainId: string;
}

// Constants
export const SESSION_CONSTANTS = {
  // Min/max session duration (seconds)
  MIN_DURATION: 300, // 5 minutes
  MAX_DURATION: 604800, // 7 days

  // Default durations
  DURATION_1_HOUR: 3600,
  DURATION_24_HOURS: 86400,
  DURATION_7_DAYS: 604800,

  // SNIP-12 type hash (computed from type definition)
  SESSION_TYPE_HASH: '0x1a2b3c4d5e6f7890',

  // Any caller constant for SNIP-9
  ANY_CALLER: '0x414e595f43414c4c4552',

  // Storage keys
  STORAGE_KEY: 'bitsage_sessions',

  // Contract selectors (keccak256 of function names)
  SELECTORS: {
    CREATE_SESSION: '0x2fa5e6b13d927e3f0c3f0c8e0f0d0e0a',
    REVOKE_SESSION: '0x3e8b7c9d0a1f2e3d4c5b6a79',
    EXECUTE_WITH_SESSION: '0x4d9c8b0a1e2f3d4c5b6a7980',
    GET_SESSION: '0x5e0d9c8b0a1f2e3d4c5b6a',
    IS_SESSION_VALID: '0x6f1e0d9c8b0a2f3e4d5c6b',
  },
} as const;

// Session permission presets
export const SESSION_PRESETS = {
  // Trading only - can interact with OTC and swap contracts
  TRADING: {
    name: 'Trading',
    description: 'Place orders, swap tokens, cancel orders',
    duration: SESSION_CONSTANTS.DURATION_24_HOURS,
    spendingLimit: 1000n * 10n ** 18n, // 1000 SAGE
  },

  // Privacy pools - deposit/withdraw from privacy pools
  PRIVACY: {
    name: 'Privacy',
    description: 'Interact with privacy pools',
    duration: SESSION_CONSTANTS.DURATION_1_HOUR,
    spendingLimit: 10000n * 10n ** 18n, // 10000 SAGE
  },

  // Validator operations - staking, claiming
  VALIDATOR: {
    name: 'Validator',
    description: 'Stake, unstake, claim rewards',
    duration: SESSION_CONSTANTS.DURATION_7_DAYS,
    spendingLimit: 100000n * 10n ** 18n, // 100000 SAGE
  },

  // Limited - short duration, low limit for testing
  LIMITED: {
    name: 'Limited',
    description: 'Quick test session',
    duration: SESSION_CONSTANTS.MIN_DURATION,
    spendingLimit: 10n * 10n ** 18n, // 10 SAGE
  },
} as const;
