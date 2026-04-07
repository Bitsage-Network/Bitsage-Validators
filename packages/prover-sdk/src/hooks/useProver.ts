/**
 * @obelyzk/prover-sdk - useProver React Hook
 *
 * React hook for proof generation with built-in state management,
 * progress tracking, and error handling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CircuitType,
  ProofMode,
  ProofProgress,
  ProofResult,
  Witness,
  ProverError,
  ProverClientConfig,
} from '../types';
import { ProverClient, getProverClient, createProverClient } from '../client';

// ============================================================================
// Types
// ============================================================================

export interface UseProverOptions {
  /** Prover client configuration (if not using global instance) */
  config?: ProverClientConfig;
  /** Use existing global client instance */
  useGlobal?: boolean;
  /** Auto-initialize client on mount */
  autoInit?: boolean;
}

export interface UseProverResult {
  /** Generate a proof */
  prove: (
    circuit: CircuitType,
    witness: Witness,
    options?: { mode?: ProofMode; deadline?: number }
  ) => Promise<ProofResult>;
  /** Verify a proof locally */
  verify: (proof: ProofResult) => Promise<boolean>;
  /** Submit proof to on-chain verifier */
  submitOnChain: (proof: ProofResult) => Promise<{ txHash: string }>;
  /** Preload circuit proving key */
  preloadCircuit: (circuit: CircuitType) => Promise<void>;
  /** Whether proof generation is in progress */
  isProving: boolean;
  /** Current proof generation progress */
  progress: ProofProgress | null;
  /** Last error encountered */
  error: ProverError | null;
  /** Last generated proof */
  lastProof: ProofResult | null;
  /** Whether client is initialized */
  isInitialized: boolean;
  /** Whether client is connected to coordinator */
  isConnected: boolean;
  /** Reset error state */
  resetError: () => void;
  /** Cancel current proof (if possible) */
  cancel: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useProver(options: UseProverOptions = {}): UseProverResult {
  const { config, useGlobal = true, autoInit = true } = options;

  // State
  const [isProving, setIsProving] = useState(false);
  const [progress, setProgress] = useState<ProofProgress | null>(null);
  const [error, setError] = useState<ProverError | null>(null);
  const [lastProof, setLastProof] = useState<ProofResult | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Refs
  const clientRef = useRef<ProverClient | null>(null);
  const cancelledRef = useRef(false);

  // Initialize client
  useEffect(() => {
    if (!autoInit) return;

    const initClient = async () => {
      try {
        if (useGlobal && config) {
          clientRef.current = getProverClient(config);
        } else if (config) {
          clientRef.current = createProverClient(config);
        }

        if (clientRef.current) {
          await clientRef.current.init();
          setIsInitialized(true);
          setIsConnected(clientRef.current.isConnected());
        }
      } catch (err) {
        console.error('Failed to initialize prover client:', err);
        setError(
          err instanceof ProverError
            ? err
            : new ProverError(String(err), 'NETWORK_ERROR' as never)
        );
      }
    };

    initClient();

    return () => {
      if (!useGlobal && clientRef.current) {
        clientRef.current.close();
      }
    };
  }, [config, useGlobal, autoInit]);

  // Monitor connection status
  useEffect(() => {
    if (!clientRef.current) return;

    const interval = setInterval(() => {
      setIsConnected(clientRef.current?.isConnected() ?? false);
    }, 5000);

    return () => clearInterval(interval);
  }, [isInitialized]);

  // Prove function
  const prove = useCallback(
    async (
      circuit: CircuitType,
      witness: Witness,
      options?: { mode?: ProofMode; deadline?: number }
    ): Promise<ProofResult> => {
      if (!clientRef.current) {
        throw new ProverError('Prover client not initialized', 'NETWORK_ERROR' as never);
      }

      cancelledRef.current = false;
      setIsProving(true);
      setProgress(null);
      setError(null);

      try {
        const result = await clientRef.current.prove(circuit, witness, {
          ...options,
          onProgress: (p) => {
            if (!cancelledRef.current) {
              setProgress(p);
            }
          },
        });

        if (cancelledRef.current) {
          throw new ProverError('Proof generation cancelled', 'TIMEOUT' as never);
        }

        setLastProof(result);
        return result;
      } catch (err) {
        const proverError =
          err instanceof ProverError
            ? err
            : new ProverError(String(err), 'PROOF_FAILED' as never);
        setError(proverError);
        throw proverError;
      } finally {
        setIsProving(false);
      }
    },
    []
  );

  // Verify function
  const verify = useCallback(async (proof: ProofResult): Promise<boolean> => {
    if (!clientRef.current) {
      throw new ProverError('Prover client not initialized', 'NETWORK_ERROR' as never);
    }

    return clientRef.current.verify(proof);
  }, []);

  // Submit on-chain function
  const submitOnChain = useCallback(
    async (proof: ProofResult): Promise<{ txHash: string }> => {
      if (!clientRef.current) {
        throw new ProverError('Prover client not initialized', 'NETWORK_ERROR' as never);
      }

      return clientRef.current.submitOnChain(proof);
    },
    []
  );

  // Preload circuit function
  const preloadCircuit = useCallback(async (circuit: CircuitType): Promise<void> => {
    if (!clientRef.current) {
      throw new ProverError('Prover client not initialized', 'NETWORK_ERROR' as never);
    }

    return clientRef.current.preloadCircuit(circuit);
  }, []);

  // Reset error function
  const resetError = useCallback(() => {
    setError(null);
  }, []);

  // Cancel function
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setIsProving(false);
    setProgress(null);
  }, []);

  return {
    prove,
    verify,
    submitOnChain,
    preloadCircuit,
    isProving,
    progress,
    error,
    lastProof,
    isInitialized,
    isConnected,
    resetError,
    cancel,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for privacy pool proofs (TEE-assisted)
 */
export function usePrivacyProver(coordinatorUrl: string) {
  return useProver({
    config: {
      coordinatorUrl,
      defaultMode: ProofMode.TEE_ASSISTED,
    },
  });
}

/**
 * Hook for compute proofs (GPU workers)
 */
export function useComputeProver(coordinatorUrl: string) {
  return useProver({
    config: {
      coordinatorUrl,
      defaultMode: ProofMode.WORKER_GPU,
    },
  });
}

/**
 * Hook for offline/WASM-only proofs
 */
export function useOfflineProver(wasmPath = '/wasm/stwo-prover.wasm') {
  return useProver({
    config: {
      coordinatorUrl: '', // Not used for offline mode
      defaultMode: ProofMode.CLIENT_WASM,
      wasmPath,
    },
  });
}

// ============================================================================
// Context Provider (Optional)
// ============================================================================

import { createContext, useContext } from 'react';

const ProverContext = createContext<ProverClient | null>(null);

export const ProverProvider = ProverContext.Provider;

export function useProverClient(): ProverClient | null {
  return useContext(ProverContext);
}
