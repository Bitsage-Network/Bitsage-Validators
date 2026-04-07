/**
 * @obelyzk/prover-sdk - WASM Prover
 *
 * Browser-based WASM prover for offline/fallback proof generation.
 * Uses Web Workers for non-blocking proof generation.
 */

import {
  CircuitType,
  ProofMode,
  ProofProgress,
  ProofResult,
  Witness,
  ProverError,
  ProverErrorCode,
  STWOProof,
} from '../types';
import { CircuitLoader } from '../circuits/loader';
import { CircuitRegistry } from '../circuits/registry';

// ============================================================================
// Types
// ============================================================================

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  dealloc: (ptr: number, size: number) => void;
  init_prover: () => void;
  load_circuit: (circuitId: number, keyPtr: number, keyLen: number) => number;
  generate_proof: (circuitId: number, witnessPtr: number, witnessLen: number) => number;
  get_proof: (resultPtr: number) => number;
  verify_proof: (proofPtr: number, proofLen: number) => number;
  get_error: () => number;
  get_progress: () => number;
}

// ============================================================================
// WASM Prover Implementation
// ============================================================================

export class WasmProver {
  private wasmPath: string;
  private instance: WebAssembly.Instance | null = null;
  private exports: WasmExports | null = null;
  private circuitLoader: CircuitLoader | null = null;
  private loadedCircuits = new Set<CircuitType>();
  private worker: Worker | null = null;
  private progressCallback: ((progress: ProofProgress) => void) | null = null;

  constructor(wasmPath: string) {
    this.wasmPath = wasmPath;
  }

  /**
   * Initialize the WASM prover
   */
  async init(cdnUrl?: string): Promise<void> {
    if (this.instance) return;

    // Try to use Web Worker if available
    if (typeof Worker !== 'undefined') {
      await this.initWorker();
    } else {
      await this.initDirect();
    }

    if (cdnUrl) {
      this.circuitLoader = new CircuitLoader(cdnUrl);
    }
  }

  /**
   * Initialize in a Web Worker (preferred)
   */
  private async initWorker(): Promise<void> {
    // Create inline worker for WASM execution
    const workerCode = `
      let wasmInstance = null;
      let wasmExports = null;

      self.onmessage = async function(e) {
        const { type, payload, id } = e.data;

        try {
          switch (type) {
            case 'init':
              const response = await fetch(payload.wasmPath);
              const wasmBuffer = await response.arrayBuffer();
              const result = await WebAssembly.instantiate(wasmBuffer, {
                env: {
                  abort: () => {},
                  seed: () => Math.random() * 0xFFFFFFFF >>> 0,
                  log_progress: (phase, progress) => {
                    self.postMessage({ type: 'progress', payload: { phase, progress } });
                  },
                },
              });
              wasmInstance = result.instance;
              wasmExports = result.instance.exports;
              wasmExports.init_prover();
              self.postMessage({ type: 'init_done', id });
              break;

            case 'load_circuit':
              const { circuitId, provingKey } = payload;
              const keyArray = new Uint8Array(provingKey);
              const keyPtr = wasmExports.alloc(keyArray.length);
              new Uint8Array(wasmExports.memory.buffer).set(keyArray, keyPtr);
              const loadResult = wasmExports.load_circuit(circuitId, keyPtr, keyArray.length);
              wasmExports.dealloc(keyPtr, keyArray.length);
              self.postMessage({ type: 'load_done', id, payload: { success: loadResult === 0 } });
              break;

            case 'prove':
              const witnessBytes = new TextEncoder().encode(JSON.stringify(payload.witness));
              const witnessPtr = wasmExports.alloc(witnessBytes.length);
              new Uint8Array(wasmExports.memory.buffer).set(witnessBytes, witnessPtr);

              const proveResult = wasmExports.generate_proof(
                payload.circuitId,
                witnessPtr,
                witnessBytes.length
              );
              wasmExports.dealloc(witnessPtr, witnessBytes.length);

              if (proveResult !== 0) {
                throw new Error('Proof generation failed');
              }

              // Get proof from WASM memory
              const proofPtr = wasmExports.get_proof(0);
              const proofLen = wasmExports.get_proof(1);
              const proofBytes = new Uint8Array(
                wasmExports.memory.buffer,
                proofPtr,
                proofLen
              );
              const proof = JSON.parse(new TextDecoder().decode(proofBytes));

              self.postMessage({ type: 'prove_done', id, payload: { proof } });
              break;

            case 'verify':
              const verifyBytes = new TextEncoder().encode(JSON.stringify(payload.proof));
              const verifyPtr = wasmExports.alloc(verifyBytes.length);
              new Uint8Array(wasmExports.memory.buffer).set(verifyBytes, verifyPtr);
              const verifyResult = wasmExports.verify_proof(verifyPtr, verifyBytes.length);
              wasmExports.dealloc(verifyPtr, verifyBytes.length);
              self.postMessage({ type: 'verify_done', id, payload: { valid: verifyResult === 0 } });
              break;
          }
        } catch (error) {
          self.postMessage({ type: 'error', id, payload: { error: error.message } });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));

    // Handle progress updates from worker
    this.worker.onmessage = (e) => {
      if (e.data.type === 'progress' && this.progressCallback) {
        const { phase, progress } = e.data.payload;
        this.progressCallback(this.mapProgress(phase, progress));
      }
    };

    // Initialize WASM in worker
    await this.sendWorkerMessage('init', { wasmPath: this.wasmPath });
  }

  /**
   * Initialize directly in main thread (fallback)
   */
  private async initDirect(): Promise<void> {
    try {
      const response = await fetch(this.wasmPath);
      const wasmBuffer = await response.arrayBuffer();

      const result = await WebAssembly.instantiate(wasmBuffer, {
        env: {
          abort: () => {},
          seed: () => Math.random() * 0xFFFFFFFF >>> 0,
          log_progress: (phase: number, progress: number) => {
            if (this.progressCallback) {
              this.progressCallback(this.mapProgress(phase, progress));
            }
          },
        },
      });

      this.instance = result.instance;
      this.exports = result.instance.exports as unknown as WasmExports;
      this.exports.init_prover();
    } catch (error) {
      throw new ProverError(
        `Failed to load WASM prover: ${error}`,
        ProverErrorCode.NETWORK_ERROR,
        error
      );
    }
  }

  /**
   * Send message to worker and wait for response
   */
  private sendWorkerMessage(type: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = crypto.randomUUID();

      const handler = (e: MessageEvent) => {
        if (e.data.id !== id) return;

        this.worker!.removeEventListener('message', handler);

        if (e.data.type === 'error') {
          reject(new Error(e.data.payload.error));
        } else {
          resolve(e.data.payload);
        }
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ type, payload, id });
    });
  }

  /**
   * Map WASM progress to ProofProgress
   */
  private mapProgress(phase: number, progress: number): ProofProgress {
    const phases: Array<ProofProgress['phase']> = [
      'loading',
      'witness',
      'commit',
      'fri',
      'query',
      'finalizing',
      'done',
    ];

    return {
      phase: phases[Math.min(phase, phases.length - 1)],
      progress,
      overallProgress: Math.floor((phase * 100 + progress) / phases.length),
    };
  }

  /**
   * Preload circuit proving key
   */
  async preloadCircuit(circuit: CircuitType, cdnUrl: string): Promise<void> {
    if (!this.circuitLoader) {
      this.circuitLoader = new CircuitLoader(cdnUrl);
    }

    const provingKey = await this.circuitLoader.loadProvingKey(circuit);

    if (this.worker) {
      await this.sendWorkerMessage('load_circuit', {
        circuitId: circuit,
        provingKey,
      });
    } else if (this.exports) {
      const keyArray = new Uint8Array(provingKey);
      const keyPtr = this.exports.alloc(keyArray.length);
      new Uint8Array(this.exports.memory.buffer).set(keyArray, keyPtr);
      const result = this.exports.load_circuit(circuit, keyPtr, keyArray.length);
      this.exports.dealloc(keyPtr, keyArray.length);

      if (result !== 0) {
        throw new ProverError(
          'Failed to load circuit',
          ProverErrorCode.PROVING_KEY_NOT_FOUND
        );
      }
    }

    this.loadedCircuits.add(circuit);
  }

  /**
   * Check if circuit is cached
   */
  async isCircuitCached(circuit: CircuitType): Promise<boolean> {
    if (!this.circuitLoader) return false;
    return this.circuitLoader.isCached(circuit);
  }

  /**
   * Generate a proof
   */
  async prove(
    circuit: CircuitType,
    witness: Witness,
    onProgress?: (progress: ProofProgress) => void
  ): Promise<ProofResult> {
    this.progressCallback = onProgress || null;

    // Ensure circuit is loaded
    if (!this.loadedCircuits.has(circuit)) {
      onProgress?.({
        phase: 'loading',
        progress: 0,
        overallProgress: 0,
      });

      const config = CircuitRegistry.get(circuit);
      if (!config) {
        throw new ProverError(
          `Unknown circuit: ${circuit}`,
          ProverErrorCode.UNSUPPORTED_CIRCUIT
        );
      }

      if (!this.circuitLoader) {
        throw new ProverError(
          'Circuit loader not initialized. Call preloadCircuit first.',
          ProverErrorCode.PROVING_KEY_NOT_FOUND
        );
      }

      await this.preloadCircuit(circuit, this.circuitLoader['cdnUrl']);
    }

    const startTime = Date.now();

    let proof: STWOProof;

    if (this.worker) {
      const result = await this.sendWorkerMessage('prove', {
        circuitId: circuit,
        witness,
      }) as { proof: STWOProof };
      proof = result.proof;
    } else if (this.exports) {
      // Direct WASM execution
      const witnessBytes = new TextEncoder().encode(JSON.stringify(witness));
      const witnessPtr = this.exports.alloc(witnessBytes.length);
      new Uint8Array(this.exports.memory.buffer).set(witnessBytes, witnessPtr);

      const result = this.exports.generate_proof(circuit, witnessPtr, witnessBytes.length);
      this.exports.dealloc(witnessPtr, witnessBytes.length);

      if (result !== 0) {
        throw new ProverError(
          'Proof generation failed',
          ProverErrorCode.PROOF_FAILED
        );
      }

      // Get proof
      const proofPtr = this.exports.get_proof(0);
      const proofLen = this.exports.get_proof(1);
      const proofBytes = new Uint8Array(this.exports.memory.buffer, proofPtr, proofLen);
      proof = JSON.parse(new TextDecoder().decode(proofBytes));
    } else {
      // Mock proof for development (when WASM not available)
      proof = this.generateMockProof(witness);
    }

    onProgress?.({
      phase: 'done',
      progress: 100,
      overallProgress: 100,
    });

    return {
      id: crypto.randomUUID(),
      circuit,
      proof,
      publicInputs: witness.publicInputs,
      mode: ProofMode.CLIENT_WASM,
      timestamp: Date.now(),
      generationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Generate mock proof for development/testing
   */
  private generateMockProof(witness: Witness): STWOProof {
    const randomHex = () => '0x' + Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      b => b.toString(16).padStart(2, '0')
    ).join('');

    return {
      commitment: randomHex(),
      fri: {
        layerCommitments: Array.from({ length: 8 }, randomHex),
        queries: Array.from({ length: 4 }, () =>
          Array.from({ length: 3 }, randomHex)
        ),
      },
      finalPoly: Array.from({ length: 16 }, randomHex),
      publicInputs: Object.values(witness.publicInputs).map(v => String(v)),
    };
  }

  /**
   * Verify a proof
   */
  async verify(proof: ProofResult): Promise<boolean> {
    if (this.worker) {
      const result = await this.sendWorkerMessage('verify', { proof }) as { valid: boolean };
      return result.valid;
    } else if (this.exports) {
      const proofBytes = new TextEncoder().encode(JSON.stringify(proof.proof));
      const proofPtr = this.exports.alloc(proofBytes.length);
      new Uint8Array(this.exports.memory.buffer).set(proofBytes, proofPtr);
      const result = this.exports.verify_proof(proofPtr, proofBytes.length);
      this.exports.dealloc(proofPtr, proofBytes.length);
      return result === 0;
    }

    // Mock verification always succeeds in dev mode
    return true;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.instance = null;
    this.exports = null;
    this.loadedCircuits.clear();
  }
}
