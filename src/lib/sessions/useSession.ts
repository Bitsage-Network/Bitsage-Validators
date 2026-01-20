/**
 * BitSage Session Hooks
 *
 * React hooks for session management in the Obelysk Wallet.
 * Provides seamless session creation, execution, and management.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { Call } from 'starknet';
import { BitSageSessionManager, createSessionManager } from './sessionManager';
import {
  Session,
  SessionConfig,
  SessionKeyPair,
  SessionManagerState,
  SESSION_CONSTANTS,
  SESSION_PRESETS,
} from './types';
import { getContractAddresses } from '@/lib/contracts';

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined';

// Session manager singleton
let sessionManagerInstance: BitSageSessionManager | null = null;

/**
 * Hook to get the session manager instance
 */
export function useSessionManager() {
  const { provider } = useProvider();
  const contracts = useMemo(() => getContractAddresses(), []);

  const manager = useMemo(() => {
    // SSR guard - only create manager in browser
    if (!isBrowser) return null;
    if (!provider) return null;

    // Create singleton if not exists
    if (!sessionManagerInstance) {
      sessionManagerInstance = createSessionManager(
        provider,
        contracts.SESSION_MANAGER || '0x0', // Will use actual deployed address
        'SN_SEPOLIA'
      );
      // Initialize storage
      sessionManagerInstance.init().catch(console.error);
    }

    return sessionManagerInstance;
  }, [provider, contracts.SESSION_MANAGER]);

  return manager;
}

/**
 * Main session hook - provides full session management
 */
export function useSession() {
  const { address, account, isConnected } = useAccount();
  const manager = useSessionManager();

  const [state, setState] = useState<SessionManagerState>({
    activeSession: null,
    sessions: [],
    isLoading: false,
    error: null,
  });

  // Load sessions on mount and address change
  useEffect(() => {
    if (!manager || !address) {
      setState((prev) => ({
        ...prev,
        activeSession: null,
        sessions: [],
      }));
      return;
    }

    const loadSessions = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const sessions = await manager.getSessions(address);

        // Find the most recent active session
        const active = sessions.find((s) => s.isActive && s.expiresAt > Date.now() / 1000);

        setState({
          activeSession: active || null,
          sessions,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load sessions',
        }));
      }
    };

    loadSessions();
  }, [manager, address]);

  // Create a new session
  const createSession = useCallback(
    async (config: SessionConfig): Promise<{ session: Session; keyPair: SessionKeyPair }> => {
      if (!manager || !account) {
        throw new Error('Session manager or account not available');
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await manager.createSession(account as unknown as import('starknet').Account, config);

        // Update state
        setState((prev) => ({
          ...prev,
          activeSession: result.session,
          sessions: [result.session, ...prev.sessions],
          isLoading: false,
        }));

        return result;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to create session',
        }));
        throw error;
      }
    },
    [manager, account]
  );

  // Create session with preset
  const createSessionWithPreset = useCallback(
    async (
      presetKey: keyof typeof SESSION_PRESETS,
      allowedCalls: { contractAddress: string; selector?: string }[]
    ) => {
      const preset = SESSION_PRESETS[presetKey];
      return createSession({
        expiresIn: preset.duration,
        spendingLimit: preset.spendingLimit,
        allowedCalls,
      });
    },
    [createSession]
  );

  // Execute calls using active session
  const executeWithSession = useCallback(
    async (calls: Call[]) => {
      if (!manager || !account || !state.activeSession) {
        throw new Error('No active session available');
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Get KEK signature for decryption
        const kekSignature = await account.signMessage({
          domain: { name: 'BitSage KEK', version: '1', chainId: 'SN_SEPOLIA' },
          types: { KEK: [{ name: 'purpose', type: 'string' }] },
          primaryType: 'KEK',
          message: { purpose: 'session-key-encryption' },
        });

        const result = await manager.executeWithSession(
          state.activeSession.sessionId,
          calls,
          JSON.stringify(kekSignature)
        );

        setState((prev) => ({ ...prev, isLoading: false }));

        return result;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Execution failed',
        }));
        throw error;
      }
    },
    [manager, account, state.activeSession]
  );

  // Revoke a session
  const revokeSession = useCallback(
    async (sessionId: string) => {
      if (!manager || !account) {
        throw new Error('Session manager or account not available');
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        await manager.revokeSession(account as unknown as import('starknet').Account, sessionId);

        // Update state
        setState((prev) => ({
          ...prev,
          activeSession:
            prev.activeSession?.sessionId === sessionId ? null : prev.activeSession,
          sessions: prev.sessions.filter((s) => s.sessionId !== sessionId),
          isLoading: false,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to revoke session',
        }));
        throw error;
      }
    },
    [manager, account]
  );

  // Revoke all sessions
  const revokeAllSessions = useCallback(async () => {
    if (!manager || !account) {
      throw new Error('Session manager or account not available');
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      for (const session of state.sessions) {
        await manager.revokeSession(account, session.sessionId);
      }

      setState({
        activeSession: null,
        sessions: [],
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to revoke sessions',
      }));
      throw error;
    }
  }, [manager, account, state.sessions]);

  // Check if session is valid
  const isSessionValid = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!manager) return false;
      return manager.isSessionValid(sessionId);
    },
    [manager]
  );

  // Get remaining limit
  const getRemainingLimit = useCallback(
    async (sessionId: string): Promise<bigint> => {
      if (!manager) return 0n;
      return manager.getRemainingLimit(sessionId);
    },
    [manager]
  );

  return {
    // State
    activeSession: state.activeSession,
    sessions: state.sessions,
    isLoading: state.isLoading,
    error: state.error,
    hasActiveSession: !!state.activeSession,

    // Actions
    createSession,
    createSessionWithPreset,
    executeWithSession,
    revokeSession,
    revokeAllSessions,
    isSessionValid,
    getRemainingLimit,

    // Presets for convenience
    presets: SESSION_PRESETS,
    constants: SESSION_CONSTANTS,
  };
}

/**
 * Hook for quick session-based execution
 * Automatically creates a session if none exists
 */
export function useSessionExecution() {
  const { activeSession, createSessionWithPreset, executeWithSession, isLoading } =
    useSession();

  const execute = useCallback(
    async (
      calls: Call[],
      options?: {
        preset?: keyof typeof SESSION_PRESETS;
        allowedCalls?: { contractAddress: string; selector?: string }[];
        autoCreateSession?: boolean;
      }
    ) => {
      const { preset = 'TRADING', allowedCalls = [], autoCreateSession = true } = options || {};

      // Create session if needed
      if (!activeSession && autoCreateSession) {
        // Auto-create based on the calls being made
        const callAddresses = calls.map((c) => c.contractAddress);
        const autoAllowedCalls =
          allowedCalls.length > 0
            ? allowedCalls
            : [...new Set(callAddresses)].map((addr) => ({ contractAddress: addr }));

        await createSessionWithPreset(preset, autoAllowedCalls);
      }

      if (!activeSession) {
        throw new Error('No session available and auto-create disabled');
      }

      return executeWithSession(calls);
    },
    [activeSession, createSessionWithPreset, executeWithSession]
  );

  return {
    execute,
    hasSession: !!activeSession,
    isLoading,
  };
}

/**
 * Hook for session status display
 */
export function useSessionStatus() {
  const { activeSession, sessions } = useSession();

  const status = useMemo(() => {
    if (!activeSession) {
      return {
        hasSession: false,
        timeRemaining: 0,
        timeRemainingText: 'No active session',
        spendingRemaining: 0n,
        spendingUsed: 0n,
        isExpiringSoon: false,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Math.max(0, activeSession.expiresAt - now);
    const spendingRemaining = activeSession.spendingLimit - activeSession.amountSpent;

    // Format time remaining
    let timeRemainingText: string;
    if (timeRemaining <= 0) {
      timeRemainingText = 'Expired';
    } else if (timeRemaining < 60) {
      timeRemainingText = `${timeRemaining}s`;
    } else if (timeRemaining < 3600) {
      timeRemainingText = `${Math.floor(timeRemaining / 60)}m`;
    } else if (timeRemaining < 86400) {
      timeRemainingText = `${Math.floor(timeRemaining / 3600)}h`;
    } else {
      timeRemainingText = `${Math.floor(timeRemaining / 86400)}d`;
    }

    return {
      hasSession: true,
      timeRemaining,
      timeRemainingText,
      spendingRemaining,
      spendingUsed: activeSession.amountSpent,
      isExpiringSoon: timeRemaining < 300, // 5 minutes
    };
  }, [activeSession]);

  return {
    ...status,
    activeSession,
    totalSessions: sessions.length,
  };
}
