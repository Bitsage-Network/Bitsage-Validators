/**
 * @obelyzk/prover-sdk - Circuit Loader
 *
 * Handles loading and caching of proving keys from CDN.
 * Uses IndexedDB for persistent caching of large proving key files.
 */

import { CircuitType, ProverError, ProverErrorCode } from '../types';
import { CircuitRegistry } from './registry';

// ============================================================================
// Types
// ============================================================================

interface CachedProvingKey {
  circuit: CircuitType;
  version: string;
  data: ArrayBuffer;
  size: number;
  cachedAt: number;
}

// ============================================================================
// IndexedDB Storage
// ============================================================================

const DB_NAME = 'bitsage-prover-cache';
const DB_VERSION = 1;
const STORE_NAME = 'proving-keys';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'circuit' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Get proving key from IndexedDB cache
 */
async function getCachedKey(circuit: CircuitType): Promise<CachedProvingKey | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(circuit);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.warn('IndexedDB not available:', error);
    return null;
  }
}

/**
 * Store proving key in IndexedDB cache
 */
async function setCachedKey(entry: CachedProvingKey): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to cache proving key:', error);
  }
}

/**
 * Delete proving key from cache
 */
async function deleteCachedKey(circuit: CircuitType): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(circuit);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn('Failed to delete cached key:', error);
  }
}

/**
 * Get total cache size
 */
async function getCacheSize(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const total = (request.result as CachedProvingKey[]).reduce(
          (sum, entry) => sum + entry.size,
          0
        );
        resolve(total);
      };
    });
  } catch {
    return 0;
  }
}

// ============================================================================
// Circuit Loader
// ============================================================================

export class CircuitLoader {
  private cdnUrl: string;
  private version: string;
  private loadingPromises = new Map<CircuitType, Promise<ArrayBuffer>>();

  constructor(cdnUrl: string, version = 'v1') {
    this.cdnUrl = cdnUrl;
    this.version = version;
  }

  /**
   * Load proving key for circuit (with caching)
   */
  async loadProvingKey(
    circuit: CircuitType,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<ArrayBuffer> {
    // Check if already loading
    const existing = this.loadingPromises.get(circuit);
    if (existing) return existing;

    const promise = this.doLoad(circuit, onProgress);
    this.loadingPromises.set(circuit, promise);

    try {
      return await promise;
    } finally {
      this.loadingPromises.delete(circuit);
    }
  }

  private async doLoad(
    circuit: CircuitType,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<ArrayBuffer> {
    // Check cache first
    const cached = await getCachedKey(circuit);
    if (cached && cached.version === this.version) {
      onProgress?.(cached.size, cached.size);
      return cached.data;
    }

    // Fetch from CDN
    const url = CircuitRegistry.getProvingKeyPath(circuit, this.cdnUrl);
    const config = CircuitRegistry.get(circuit);
    const expectedSize = config?.provingKeySize ?? 0;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new ProverError(
          `Failed to fetch proving key: ${response.statusText}`,
          ProverErrorCode.PROVING_KEY_NOT_FOUND
        );
      }

      // Stream response for progress tracking
      const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
      const total = contentLength || expectedSize;

      if (!response.body) {
        // Fallback for browsers without streaming
        const data = await response.arrayBuffer();
        onProgress?.(data.byteLength, data.byteLength);
        await this.cacheKey(circuit, data);
        return data;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;
        onProgress?.(loaded, total);
      }

      // Combine chunks
      const data = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      // Cache for future use
      await this.cacheKey(circuit, data.buffer);

      return data.buffer;
    } catch (error) {
      if (error instanceof ProverError) throw error;

      throw new ProverError(
        `Network error loading proving key: ${error}`,
        ProverErrorCode.NETWORK_ERROR,
        error
      );
    }
  }

  /**
   * Cache proving key
   */
  private async cacheKey(circuit: CircuitType, data: ArrayBuffer): Promise<void> {
    await setCachedKey({
      circuit,
      version: this.version,
      data,
      size: data.byteLength,
      cachedAt: Date.now(),
    });
  }

  /**
   * Check if circuit proving key is cached
   */
  async isCached(circuit: CircuitType): Promise<boolean> {
    const cached = await getCachedKey(circuit);
    return cached !== null && cached.version === this.version;
  }

  /**
   * Get cache status for all circuits
   */
  async getCacheStatus(): Promise<Map<CircuitType, boolean>> {
    const status = new Map<CircuitType, boolean>();

    for (const config of CircuitRegistry.getAll()) {
      status.set(config.id, await this.isCached(config.id));
    }

    return status;
  }

  /**
   * Preload multiple circuits in parallel
   */
  async preloadAll(
    circuits: CircuitType[],
    onProgress?: (circuit: CircuitType, loaded: number, total: number) => void
  ): Promise<void> {
    await Promise.all(
      circuits.map(circuit =>
        this.loadProvingKey(circuit, (loaded, total) => {
          onProgress?.(circuit, loaded, total);
        })
      )
    );
  }

  /**
   * Clear circuit from cache
   */
  async clearCache(circuit: CircuitType): Promise<void> {
    await deleteCachedKey(circuit);
  }

  /**
   * Clear all cached proving keys
   */
  async clearAllCache(): Promise<void> {
    for (const config of CircuitRegistry.getAll()) {
      await deleteCachedKey(config.id);
    }
  }

  /**
   * Get total cache size in bytes
   */
  async getTotalCacheSize(): Promise<number> {
    return getCacheSize();
  }

  /**
   * Format bytes as human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }
}
