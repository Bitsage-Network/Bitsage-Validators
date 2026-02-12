/**
 * BitSage Session Management
 *
 * Wallet-agnostic session keys for seamless dApp interactions.
 * Supports SNIP-9 outside execution for meta-transactions and
 * works with ANY Starknet wallet (Argent, Braavos, Cartridge, etc.)
 *
 * @example Basic usage
 * ```tsx
 * import { useSession } from '@/lib/sessions';
 *
 * function TradingComponent() {
 *   const { activeSession, createSession, executeWithSession } = useSession();
 *
 *   const handleTrade = async () => {
 *     // Create session if not exists
 *     if (!activeSession) {
 *       await createSession({
 *         expiresIn: 86400, // 24 hours
 *         spendingLimit: 1000n * 10n ** 18n,
 *         allowedCalls: [{ contractAddress: OTC_ORDERBOOK }],
 *       });
 *     }
 *
 *     // Execute without wallet popup!
 *     await executeWithSession([{
 *       contractAddress: OTC_ORDERBOOK,
 *       entrypoint: 'place_order',
 *       calldata: [...],
 *     }]);
 *   };
 * }
 * ```
 *
 * @example Using presets
 * ```tsx
 * const { createSessionWithPreset, presets } = useSession();
 *
 * // Create a trading session
 * await createSessionWithPreset('TRADING', [
 *   { contractAddress: OTC_ORDERBOOK },
 *   { contractAddress: CONFIDENTIAL_SWAP },
 * ]);
 * ```
 *
 * @example Session status
 * ```tsx
 * import { useSessionStatus } from '@/lib/sessions';
 *
 * function SessionIndicator() {
 *   const { hasSession, timeRemainingText, isExpiringSoon } = useSessionStatus();
 *
 *   if (!hasSession) return <span>No session</span>;
 *
 *   return (
 *     <span className={isExpiringSoon ? 'text-yellow-500' : 'text-green-500'}>
 *       Session: {timeRemainingText}
 *     </span>
 *   );
 * }
 * ```
 */

// Types
export type {
  Session,
  SessionConfig,
  SessionKeyPair,
  AllowedCall,
  StoredSession,
  SessionExecutionResult,
  OutsideExecution,
  SessionCreatedEvent,
  SessionRevokedEvent,
  SessionExecutedEvent,
  SessionManagerState,
} from './types';

export { SESSION_CONSTANTS, SESSION_PRESETS } from './types';

// Session Manager
export { BitSageSessionManager, createSessionManager } from './sessionManager';

// React Hooks
export {
  useSession,
  useSessionManager,
  useSessionExecution,
  useSessionStatus,
} from './useSession';

// Multichain Support
export type {
  ChainType,
  ChainAddress,
  CrossChainSessionMessage,
  MultichainSignature,
  BridgeAuthorization,
} from './multichain';

export {
  buildCrossChainSessionMessage,
  buildEIP712TypedData,
  buildStarknetTypedData,
  verifyEthereumSignature,
  verifyStarknetSignature,
  verifyMultichainSignature,
  createCrossChainSession,
  CrossChainIdentity,
  buildBridgeAuthorization,
  SUPPORTED_CHAINS,
  FUTURE_CHAINS,
  CHAIN_CONFIG,
} from './multichain';

export {
  useEthereumWallet,
  useCrossChainIdentity,
  useCrossChainSession,
  useBridgeAuthorization,
} from './useMultichain';
