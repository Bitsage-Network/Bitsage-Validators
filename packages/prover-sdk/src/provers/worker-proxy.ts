/**
 * @bitsage/prover-sdk - GPU Worker Proxy
 *
 * Proxy for delegating compute proofs to GPU workers in the validator network.
 * Handles job submission, progress tracking, and result retrieval.
 */

import {
  CircuitType,
  ProofMode,
  ProofProgress,
  ProofResult,
  Witness,
  ProverError,
  ProverErrorCode,
  ProofRequest,
  ProofResponse,
} from '../types';

// ============================================================================
// Types
// ============================================================================

interface WorkerInfo {
  id: string;
  address: string;
  gpuBackend: 'cuda' | 'metal' | 'vulkan';
  capacity: number;
  currentLoad: number;
  latencyMs: number;
}

interface JobSubmission {
  jobId: string;
  workerId: string;
  estimatedTimeMs: number;
}

// ============================================================================
// GPU Worker Proxy Implementation
// ============================================================================

export class WorkerProxy {
  private coordinatorUrl: string;
  private apiKey?: string;
  private availableWorkers: WorkerInfo[] = [];
  private lastWorkerRefresh = 0;
  private workerRefreshInterval = 30000; // 30 seconds

  constructor(coordinatorUrl: string, apiKey?: string) {
    this.coordinatorUrl = coordinatorUrl;
    this.apiKey = apiKey;
  }

  // ==========================================================================
  // Worker Discovery
  // ==========================================================================

  /**
   * Refresh list of available GPU workers
   */
  async refreshWorkers(): Promise<WorkerInfo[]> {
    const now = Date.now();
    if (now - this.lastWorkerRefresh < this.workerRefreshInterval && this.availableWorkers.length > 0) {
      return this.availableWorkers;
    }

    try {
      const response = await fetch(`${this.coordinatorUrl}/api/v1/workers/gpu`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch workers: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      // Handle ApiResponse wrapper: { success: true, data: { workers: [...] } }
      const data = apiResponse.data ?? apiResponse;
      this.availableWorkers = data.workers ?? data;
      this.lastWorkerRefresh = now;

      return this.availableWorkers;
    } catch (error) {
      console.warn('Failed to refresh workers:', error);
      return this.availableWorkers;
    }
  }

  /**
   * Select optimal worker for a circuit
   */
  async selectWorker(circuit: CircuitType): Promise<WorkerInfo | null> {
    const workers = await this.refreshWorkers();

    if (workers.length === 0) {
      return null;
    }

    // Sort by: lowest load, then lowest latency
    const sorted = [...workers].sort((a, b) => {
      const loadDiff = (a.currentLoad / a.capacity) - (b.currentLoad / b.capacity);
      if (Math.abs(loadDiff) > 0.1) return loadDiff;
      return a.latencyMs - b.latencyMs;
    });

    // Find worker with capacity
    return sorted.find(w => w.currentLoad < w.capacity) || null;
  }

  // ==========================================================================
  // Job Submission
  // ==========================================================================

  /**
   * Submit proof job to GPU worker
   */
  async submitJob(
    circuit: CircuitType,
    witness: Witness,
    deadline: number
  ): Promise<JobSubmission> {
    // Select optimal worker
    const worker = await this.selectWorker(circuit);
    if (!worker) {
      throw new ProverError(
        'No GPU workers available',
        ProverErrorCode.MODE_UNAVAILABLE
      );
    }

    const request: ProofRequest = {
      requestId: crypto.randomUUID(),
      circuit,
      mode: ProofMode.WORKER_GPU,
      witness,
      deadline,
    };

    const response = await fetch(`${this.coordinatorUrl}/api/v1/workers/submit`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        preferredWorkerId: worker.id,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProverError(
        error.message || 'Job submission failed',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    const result = await response.json();

    return {
      jobId: result.jobId,
      workerId: result.workerId,
      estimatedTimeMs: result.estimatedTimeMs,
    };
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<ProofResponse> {
    const response = await fetch(
      `${this.coordinatorUrl}/api/v1/workers/job/${jobId}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new ProverError(
        'Failed to get job status',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    return response.json();
  }

  /**
   * Poll for job completion
   */
  async waitForCompletion(
    jobId: string,
    deadline: number,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    const pollInterval = 500; // 500ms

    while (Date.now() < deadline) {
      const status = await this.getJobStatus(jobId);

      if (status.progress) {
        onProgress?.(status.progress);
      }

      switch (status.status) {
        case 'completed':
          if (!status.result) {
            throw new ProverError(
              'Job completed but no result',
              ProverErrorCode.PROOF_FAILED
            );
          }
          return status.result;

        case 'failed':
          throw new ProverError(
            status.error || 'GPU proof generation failed',
            ProverErrorCode.PROOF_FAILED
          );

        case 'pending':
        case 'proving':
          // Continue polling
          await this.sleep(pollInterval);
          break;
      }
    }

    throw new ProverError(
      'GPU proof generation timeout',
      ProverErrorCode.TIMEOUT
    );
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.coordinatorUrl}/api/v1/workers/job/${jobId}/cancel`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Worker Metrics
  // ==========================================================================

  /**
   * Get GPU utilization metrics for a worker
   */
  async getWorkerMetrics(workerId: string): Promise<{
    gpuUtilization: number;
    memoryUsed: number;
    memoryTotal: number;
    temperature: number;
    proofsPerHour: number;
  }> {
    const response = await fetch(
      `${this.coordinatorUrl}/api/v1/workers/${workerId}/metrics`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new ProverError(
        'Failed to get worker metrics',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    return response.json();
  }

  /**
   * Get aggregate network statistics
   */
  async getNetworkStats(): Promise<{
    totalWorkers: number;
    activeWorkers: number;
    totalGpuMemoryGb: number;
    proofsLastHour: number;
    averageProofTimeMs: number;
  }> {
    const response = await fetch(
      `${this.coordinatorUrl}/api/v1/workers/stats`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new ProverError(
        'Failed to get network stats',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    return response.json();
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get list of available workers
   */
  getAvailableWorkers(): WorkerInfo[] {
    return [...this.availableWorkers];
  }

  /**
   * Check if any GPU workers are available
   */
  hasAvailableWorkers(): boolean {
    return this.availableWorkers.some(w => w.currentLoad < w.capacity);
  }
}
