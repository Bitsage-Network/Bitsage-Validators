/**
 * Proofs Hook
 *
 * Provides proof data from the backend API with WebSocket real-time updates.
 * Displays STWO proof metadata including verification status.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from '@starknet-react/core';
import { useProofsWebSocket, ProofVerifiedEvent } from './useWebSocket';

// ============================================================================
// Types
// ============================================================================

export interface ProofMetadata {
  id: string;
  jobId: string;
  workerId: string;
  proofHash: string;
  isValid: boolean | null;
  verificationTimeMs: number | null;
  verifiedAt: Date | null;
  verifierAddress: string | null;
  txHash: string | null;
  blockNumber: number | null;
  createdAt: Date;
  // STWO-specific metadata
  proofSize?: number;
  generationTimeMs?: number;
  circuitType?: 'AIInference' | 'DataPipeline' | 'MLTraining' | 'ZKProof' | 'Rendering';
  securityBits?: number;
  friConfig?: {
    numQueries: number;
    blowupFactor: number;
    foldingFactor: number;
  };
}

export interface ProofStats {
  totalProofs: number;
  validProofs: number;
  invalidProofs: number;
  pendingProofs: number;
  avgVerificationTime: number;
  avgProofSize: number;
}

export interface UseProofsResult {
  proofs: ProofMetadata[];
  stats: ProofStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  // Pagination
  hasMore: boolean;
  loadMore: () => void;
  // WebSocket
  isLive: boolean;
  recentVerifications: ProofVerifiedEvent[];
}

// ============================================================================
// API Client
// ============================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3030';

async function fetchProofs(params: {
  workerId?: string;
  jobId?: string;
  page?: number;
  limit?: number;
}): Promise<{ proofs: ProofMetadata[]; hasMore: boolean }> {
  const searchParams = new URLSearchParams();
  if (params.workerId) searchParams.set('worker', params.workerId);
  if (params.jobId) searchParams.set('job_id', params.jobId);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const url = `${API_BASE}/api/proofs?${searchParams.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch proofs: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      proofs: (data.proofs || []).map(transformProof),
      hasMore: data.has_more || false,
    };
  } catch (error) {
    console.error('Error fetching proofs:', error);
    throw error;
  }
}

async function fetchProofStats(): Promise<ProofStats> {
  const url = `${API_BASE}/api/proofs/stats`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch proof stats: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching proof stats:', error);
    // Return default stats on error
    return {
      totalProofs: 0,
      validProofs: 0,
      invalidProofs: 0,
      pendingProofs: 0,
      avgVerificationTime: 0,
      avgProofSize: 0,
    };
  }
}

// Transform API response to ProofMetadata
function transformProof(data: Record<string, unknown>): ProofMetadata {
  return {
    id: data.id as string || '',
    jobId: data.job_id as string || '',
    workerId: data.worker_id as string || '',
    proofHash: data.proof_hash as string || '',
    isValid: data.is_valid as boolean | null,
    verificationTimeMs: data.verification_time_ms as number | null,
    verifiedAt: data.verified_at ? new Date(data.verified_at as string) : null,
    verifierAddress: data.verifier_address as string | null,
    txHash: data.tx_hash as string | null,
    blockNumber: data.block_number as number | null,
    createdAt: new Date(data.created_at as string || Date.now()),
    // STWO metadata
    proofSize: data.proof_size as number | undefined,
    generationTimeMs: data.generation_time_ms as number | undefined,
    circuitType: data.circuit_type as ProofMetadata['circuitType'],
    securityBits: data.security_bits as number | undefined,
    friConfig: data.fri_config as ProofMetadata['friConfig'],
  };
}

// ============================================================================
// Main Hook
// ============================================================================

export function useProofs(options: {
  workerId?: string;
  jobId?: string;
  limit?: number;
} = {}): UseProofsResult {
  const { limit = 20 } = options;

  const [proofs, setProofs] = useState<ProofMetadata[]>([]);
  const [stats, setStats] = useState<ProofStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // WebSocket for real-time updates
  const { isConnected, proofVerifications } = useProofsWebSocket();

  // Fetch proofs from API
  const fetchData = useCallback(async (append = false) => {
    if (!append) {
      setIsLoading(true);
    }

    try {
      const [proofsResult, statsResult] = await Promise.all([
        fetchProofs({
          workerId: options.workerId,
          jobId: options.jobId,
          page: append ? page : 1,
          limit,
        }),
        !append ? fetchProofStats() : Promise.resolve(null),
      ]);

      if (append) {
        setProofs(prev => [...prev, ...proofsResult.proofs]);
      } else {
        setProofs(proofsResult.proofs);
      }

      setHasMore(proofsResult.hasMore);

      if (statsResult) {
        setStats(statsResult);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch proofs'));
    } finally {
      setIsLoading(false);
    }
  }, [options.workerId, options.jobId, page, limit]);

  // Initial fetch
  useEffect(() => {
    fetchData(false);
  }, [options.workerId, options.jobId]);

  // Handle WebSocket proof verifications - update proof status in real-time
  useEffect(() => {
    if (proofVerifications.length === 0) return;

    const latestVerification = proofVerifications[0];

    setProofs(prev => prev.map(proof => {
      if (proof.jobId === latestVerification.job_id) {
        return {
          ...proof,
          isValid: latestVerification.is_valid,
          verifiedAt: new Date(latestVerification.timestamp * 1000),
          verifierAddress: latestVerification.verifier,
          proofHash: latestVerification.proof_hash,
        };
      }
      return proof;
    }));
  }, [proofVerifications]);

  // Refetch function
  const refetch = useCallback(() => {
    setPage(1);
    fetchData(false);
  }, [fetchData]);

  // Load more for pagination
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      setPage(prev => prev + 1);
      fetchData(true);
    }
  }, [hasMore, isLoading, fetchData]);

  return {
    proofs,
    stats,
    isLoading,
    error,
    refetch,
    hasMore,
    loadMore,
    isLive: isConnected,
    recentVerifications: proofVerifications,
  };
}

// ============================================================================
// Worker Proofs Hook
// ============================================================================

export function useWorkerProofs(workerId?: string) {
  const { address } = useAccount();
  const targetWorkerId = workerId || address;

  return useProofs({ workerId: targetWorkerId });
}

// ============================================================================
// Job Proof Hook
// ============================================================================

export function useJobProof(jobId: string) {
  const result = useProofs({ jobId, limit: 1 });

  return {
    ...result,
    proof: result.proofs[0] || null,
  };
}

// ============================================================================
// Proof Stats Hook
// ============================================================================

export function useProofStats() {
  const [stats, setStats] = useState<ProofStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await fetchProofStats();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();

    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return { stats, isLoading, error };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

export function formatProofSize(bytes?: number): string {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatGenerationTime(ms?: number): string {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function getCircuitTypeLabel(type?: ProofMetadata['circuitType']): string {
  const labels: Record<NonNullable<ProofMetadata['circuitType']>, string> = {
    AIInference: 'AI Inference',
    DataPipeline: 'Data Pipeline',
    MLTraining: 'ML Training',
    ZKProof: 'ZK Proof',
    Rendering: 'Rendering',
  };
  return type ? labels[type] : 'Unknown';
}

export function getCircuitTypeColor(type?: ProofMetadata['circuitType']): string {
  const colors: Record<NonNullable<ProofMetadata['circuitType']>, string> = {
    AIInference: 'text-purple-400 bg-purple-500/20',
    DataPipeline: 'text-cyan-400 bg-cyan-500/20',
    MLTraining: 'text-orange-400 bg-orange-500/20',
    ZKProof: 'text-brand-400 bg-brand-500/20',
    Rendering: 'text-pink-400 bg-pink-500/20',
  };
  return type ? colors[type] : 'text-gray-400 bg-gray-500/20';
}

export function getVerificationStatusColor(isValid: boolean | null): string {
  if (isValid === null) return 'text-yellow-400 bg-yellow-500/20';
  return isValid ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20';
}

export function getVerificationStatusLabel(isValid: boolean | null): string {
  if (isValid === null) return 'Pending';
  return isValid ? 'Verified' : 'Invalid';
}
