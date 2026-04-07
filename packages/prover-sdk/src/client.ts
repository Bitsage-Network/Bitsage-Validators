/**
 * @obelyzk/prover-sdk - ProverClient
 *
 * Unified client for STWO proof generation across multiple backends:
 * - Browser WASM (fallback, offline)
 * - GPU Workers (compute proofs via validator network)
 * - TEE Enclaves (privacy proofs with secret witness protection)
 */

import {
  CircuitType,
  ProofMode,
  ProofProgress,
  ProofResult,
  ProverClientConfig,
  ProverCapabilities,
  Witness,
  EncryptedWitness,
  ProofRequest,
  ProofResponse,
  ProverError,
  ProverErrorCode,
  WSMessage,
} from './types';
import { CircuitRegistry } from './circuits/registry';
import { WasmProver } from './provers/wasm';
import { TEEProxy } from './provers/tee-proxy';
import { WorkerProxy } from './provers/worker-proxy';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<ProverClientConfig> = {
  defaultMode: ProofMode.AUTO,
  timeout: 5 * 60 * 1000, // 5 minutes
  provingKeyCdnUrl: 'https://cdn.bitsage.network/proving-keys',
};

// ============================================================================
// ProverClient
// ============================================================================

export class ProverClient {
  private config: Required<ProverClientConfig>;
  private wasmProver: WasmProver | null = null;
  private teeProxy: TEEProxy | null = null;
  private workerProxy: WorkerProxy | null = null;
  private capabilities: ProverCapabilities | null = null;
  private wsConnection: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (result: ProofResult) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: ProofProgress) => void;
  }>();

  constructor(config: ProverClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      wasmPath: config.wasmPath || '/wasm/stwo-prover.wasm',
    } as Required<ProverClientConfig>;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the prover client and discover coordinator capabilities
   */
  async init(): Promise<void> {
    // Fetch coordinator capabilities
    await this.fetchCapabilities();

    // Initialize backends based on capabilities
    if (this.capabilities?.modes.includes(ProofMode.CLIENT_WASM)) {
      this.wasmProver = new WasmProver(this.config.wasmPath);
    }

    if (this.capabilities?.modes.includes(ProofMode.TEE_ASSISTED)) {
      this.teeProxy = new TEEProxy(this.config.coordinatorUrl, this.config.apiKey);
    }

    if (this.capabilities?.modes.includes(ProofMode.WORKER_GPU)) {
      this.workerProxy = new WorkerProxy(this.config.coordinatorUrl, this.config.apiKey);
    }

    // Establish WebSocket connection for real-time updates
    await this.connectWebSocket();
  }

  /**
   * Fetch coordinator capabilities
   */
  private async fetchCapabilities(): Promise<void> {
    try {
      const response = await fetch(`${this.config.coordinatorUrl}/api/v1/prover/capabilities`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      // Handle ApiResponse wrapper: { success: true, data: {...} }
      this.capabilities = apiResponse.data ?? apiResponse;
    } catch (error) {
      // Fallback to local WASM if coordinator unavailable
      console.warn('Coordinator unavailable, falling back to WASM mode');
      this.capabilities = {
        circuits: Object.values(CircuitType).filter(v => typeof v === 'number') as CircuitType[],
        modes: [ProofMode.CLIENT_WASM],
        gpuBackends: [],
        teeTypes: [],
        maxConcurrent: 1,
        version: '0.1.0-wasm-only',
      };
    }
  }

  /**
   * Connect WebSocket for real-time proof progress
   */
  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.config.coordinatorUrl.replace('http', 'ws') + '/ws/prover';

    try {
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onmessage = (event) => {
        const message: WSMessage = JSON.parse(event.data);
        this.handleWSMessage(message);
      };

      this.wsConnection.onerror = (error) => {
        console.warn('WebSocket error:', error);
      };

      this.wsConnection.onclose = () => {
        // Attempt reconnection after delay
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        if (!this.wsConnection) return reject(new Error('No WebSocket'));
        this.wsConnection.onopen = () => resolve();
        setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
      });
    } catch (error) {
      console.warn('WebSocket connection failed, using polling fallback');
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWSMessage(message: WSMessage): void {
    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) return;

    switch (message.type) {
      case 'progress':
        if (pending.onProgress) {
          pending.onProgress(message.payload as ProofProgress);
        }
        break;

      case 'completed':
        pending.resolve(message.payload as ProofResult);
        this.pendingRequests.delete(message.requestId);
        break;

      case 'error':
        pending.reject(new ProverError(
          (message.payload as { error: string }).error,
          ProverErrorCode.PROOF_FAILED
        ));
        this.pendingRequests.delete(message.requestId);
        break;
    }
  }

  // ==========================================================================
  // Core Proof Generation
  // ==========================================================================

  /**
   * Generate a proof for the given circuit and witness
   */
  async prove(
    circuit: CircuitType,
    witness: Witness,
    options?: {
      mode?: ProofMode;
      onProgress?: (progress: ProofProgress) => void;
      deadline?: number;
    }
  ): Promise<ProofResult> {
    const mode = options?.mode ?? this.selectMode(circuit);
    const deadline = options?.deadline ?? Date.now() + this.config.timeout;

    // Validate circuit is supported
    if (!this.capabilities?.circuits.includes(circuit)) {
      throw new ProverError(
        `Circuit ${CircuitType[circuit]} not supported`,
        ProverErrorCode.UNSUPPORTED_CIRCUIT
      );
    }

    // Route to appropriate backend
    switch (mode) {
      case ProofMode.CLIENT_WASM:
        return this.proveWasm(circuit, witness, options?.onProgress);

      case ProofMode.TEE_ASSISTED:
        return this.proveTEE(circuit, witness, deadline, options?.onProgress);

      case ProofMode.WORKER_GPU:
        return this.proveGPU(circuit, witness, deadline, options?.onProgress);

      case ProofMode.AUTO:
        return this.prove(circuit, witness, {
          ...options,
          mode: this.selectMode(circuit),
        });

      default:
        throw new ProverError(
          `Unknown proof mode: ${mode}`,
          ProverErrorCode.MODE_UNAVAILABLE
        );
    }
  }

  /**
   * Select optimal proof mode based on circuit type
   */
  private selectMode(circuit: CircuitType): ProofMode {
    const config = CircuitRegistry.get(circuit);
    if (!config) {
      return ProofMode.CLIENT_WASM; // Fallback
    }

    // Check if preferred mode is available
    const preferredMode = config.defaultMode;
    if (this.capabilities?.modes.includes(preferredMode)) {
      return preferredMode;
    }

    // Fallback chain: TEE → GPU → WASM
    if (this.capabilities?.modes.includes(ProofMode.TEE_ASSISTED)) {
      return ProofMode.TEE_ASSISTED;
    }
    if (this.capabilities?.modes.includes(ProofMode.WORKER_GPU)) {
      return ProofMode.WORKER_GPU;
    }

    return ProofMode.CLIENT_WASM;
  }

  // ==========================================================================
  // Backend Implementations
  // ==========================================================================

  /**
   * Generate proof using browser WASM
   */
  private async proveWasm(
    circuit: CircuitType,
    witness: Witness,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    if (!this.wasmProver) {
      this.wasmProver = new WasmProver(this.config.wasmPath);
    }

    return this.wasmProver.prove(circuit, witness, onProgress);
  }

  /**
   * Generate proof using TEE enclave (for privacy proofs)
   */
  private async proveTEE(
    circuit: CircuitType,
    witness: Witness,
    deadline: number,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    if (!this.teeProxy) {
      throw new ProverError(
        'TEE proxy not initialized',
        ProverErrorCode.MODE_UNAVAILABLE
      );
    }

    // Encrypt witness for TEE transport
    onProgress?.({
      phase: 'encrypting',
      progress: 0,
      overallProgress: 5,
    });

    const encryptedWitness = await this.teeProxy.encryptWitness(witness);

    onProgress?.({
      phase: 'encrypting',
      progress: 100,
      overallProgress: 10,
    });

    // Submit to TEE and wait for result
    const requestId = crypto.randomUUID();
    const request: ProofRequest = {
      requestId,
      circuit,
      mode: ProofMode.TEE_ASSISTED,
      witness: encryptedWitness,
      deadline,
    };

    return this.submitAndWait(request, onProgress);
  }

  /**
   * Generate proof using GPU worker
   */
  private async proveGPU(
    circuit: CircuitType,
    witness: Witness,
    deadline: number,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    if (!this.workerProxy) {
      throw new ProverError(
        'GPU worker proxy not initialized',
        ProverErrorCode.MODE_UNAVAILABLE
      );
    }

    const requestId = crypto.randomUUID();
    const request: ProofRequest = {
      requestId,
      circuit,
      mode: ProofMode.WORKER_GPU,
      witness,
      deadline,
    };

    return this.submitAndWait(request, onProgress);
  }

  /**
   * Submit proof request and wait for result via WebSocket
   */
  private async submitAndWait(
    request: ProofRequest,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    // Submit request
    const response = await fetch(`${this.config.coordinatorUrl}/api/v1/prover/prove`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ProverError(
        error.message || 'Proof submission failed',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    // Subscribe to WebSocket updates
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify({
        type: 'subscribe',
        requestId: request.requestId,
      }));
    }

    // Wait for completion
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.requestId, {
        resolve,
        reject,
        onProgress,
      });

      // Timeout handler
      const timeout = request.deadline - Date.now();
      setTimeout(() => {
        if (this.pendingRequests.has(request.requestId)) {
          this.pendingRequests.delete(request.requestId);
          reject(new ProverError('Proof generation timeout', ProverErrorCode.TIMEOUT));
        }
      }, timeout);
    });
  }

  // ==========================================================================
  // Verification & On-Chain Submission
  // ==========================================================================

  /**
   * Verify a proof locally (client-side)
   */
  async verify(proof: ProofResult): Promise<boolean> {
    // For now, delegate to WASM verifier
    if (!this.wasmProver) {
      this.wasmProver = new WasmProver(this.config.wasmPath);
    }

    return this.wasmProver.verify(proof);
  }

  /**
   * Submit proof to on-chain verifier
   */
  async submitOnChain(
    proof: ProofResult,
    options?: {
      /** Starknet account for transaction */
      account?: unknown; // StarknetAccount type
      /** Additional calldata for verifier */
      calldata?: bigint[];
    }
  ): Promise<{ txHash: string }> {
    const circuitConfig = CircuitRegistry.get(proof.circuit);
    if (!circuitConfig) {
      throw new ProverError(
        `Unknown circuit: ${proof.circuit}`,
        ProverErrorCode.UNSUPPORTED_CIRCUIT
      );
    }

    // Build verification call
    const call = this.buildVerifyCall(proof, circuitConfig.verifierAddress, options?.calldata);

    // Submit via coordinator or direct (if account provided)
    const response = await fetch(`${this.config.coordinatorUrl}/api/v1/prover/submit`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        proof,
        verifierAddress: circuitConfig.verifierAddress,
        calldata: options?.calldata,
      }),
    });

    if (!response.ok) {
      throw new ProverError(
        'On-chain submission failed',
        ProverErrorCode.VERIFICATION_FAILED
      );
    }

    const result = await response.json();
    return { txHash: result.txHash };
  }

  /**
   * Build Starknet call for proof verification
   */
  private buildVerifyCall(
    proof: ProofResult,
    verifierAddress: string,
    additionalCalldata?: bigint[]
  ): { contractAddress: string; entrypoint: string; calldata: string[] } {
    // Serialize proof for on-chain verification
    const proofCalldata = this.serializeProof(proof);

    return {
      contractAddress: verifierAddress,
      entrypoint: 'verify_proof',
      calldata: [
        ...proofCalldata,
        ...(additionalCalldata?.map(v => v.toString()) ?? []),
      ],
    };
  }

  /**
   * Serialize STWO proof to felt252 array
   */
  private serializeProof(proof: ProofResult): string[] {
    const data: string[] = [];

    // Commitment
    data.push(proof.proof.commitment);

    // FRI layer commitments
    data.push(proof.proof.fri.layerCommitments.length.toString());
    data.push(...proof.proof.fri.layerCommitments);

    // Queries (flattened)
    data.push(proof.proof.fri.queries.length.toString());
    for (const query of proof.proof.fri.queries) {
      data.push(query.length.toString());
      data.push(...query);
    }

    // Final polynomial
    data.push(proof.proof.finalPoly.length.toString());
    data.push(...proof.proof.finalPoly);

    // Public inputs
    data.push(proof.proof.publicInputs.length.toString());
    data.push(...proof.proof.publicInputs);

    return data;
  }

  // ==========================================================================
  // Preloading & Caching
  // ==========================================================================

  /**
   * Preload circuit proving key for faster proof generation
   */
  async preloadCircuit(circuit: CircuitType): Promise<void> {
    if (!this.wasmProver) {
      this.wasmProver = new WasmProver(this.config.wasmPath);
    }

    await this.wasmProver.preloadCircuit(circuit, this.config.provingKeyCdnUrl);
  }

  /**
   * Check if proving key is cached
   */
  async isCircuitCached(circuit: CircuitType): Promise<boolean> {
    if (!this.wasmProver) {
      return false;
    }

    return this.wasmProver.isCircuitCached(circuit);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get coordinator capabilities
   */
  getCapabilities(): ProverCapabilities | null {
    return this.capabilities;
  }

  /**
   * Get current WebSocket connection state
   */
  isConnected(): boolean {
    return this.wsConnection?.readyState === WebSocket.OPEN;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.wsConnection?.close();
    this.pendingRequests.clear();
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

let defaultClient: ProverClient | null = null;

/**
 * Get or create the default ProverClient instance
 */
export function getProverClient(config?: ProverClientConfig): ProverClient {
  if (!defaultClient && config) {
    defaultClient = new ProverClient(config);
  }

  if (!defaultClient) {
    throw new Error('ProverClient not initialized. Call getProverClient with config first.');
  }

  return defaultClient;
}

/**
 * Create a new ProverClient instance
 */
export function createProverClient(config: ProverClientConfig): ProverClient {
  return new ProverClient(config);
}
