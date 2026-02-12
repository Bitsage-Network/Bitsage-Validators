/**
 * API Retry Queue
 *
 * Queues failed API requests when offline and retries them when connection is restored
 */

import { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface QueuedRequest {
  id: string;
  config: AxiosRequestConfig;
  timestamp: number;
  retryCount: number;
  resolve: (value: AxiosResponse) => void;
  reject: (error: Error) => void;
}

export class RetryQueue {
  private queue: Map<string, QueuedRequest> = new Map();
  private maxQueueSize = 50;
  private maxRetries = 3;
  private isProcessing = false;

  /**
   * Add a request to the retry queue
   */
  enqueue(
    config: AxiosRequestConfig,
    resolve: (value: AxiosResponse) => void,
    reject: (error: Error) => void
  ): string {
    // Generate unique ID
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Check queue size limit
    if (this.queue.size >= this.maxQueueSize) {
      // Remove oldest item
      const firstKey = this.queue.keys().next().value;
      if (firstKey) {
        const oldest = this.queue.get(firstKey);
        if (oldest) {
          oldest.reject(new Error('Queue full, request dropped'));
        }
        this.queue.delete(firstKey);
      }
    }

    // Add to queue
    this.queue.set(id, {
      id,
      config,
      timestamp: Date.now(),
      retryCount: 0,
      resolve,
      reject,
    });

    return id;
  }

  /**
   * Remove a request from the queue
   */
  dequeue(id: string): void {
    this.queue.delete(id);
  }

  /**
   * Get number of queued requests
   */
  get size(): number {
    return this.queue.size;
  }

  /**
   * Clear all queued requests
   */
  clear(): void {
    // Reject all pending requests
    this.queue.forEach((req) => {
      req.reject(new Error('Queue cleared'));
    });
    this.queue.clear();
  }

  /**
   * Process the retry queue
   * Returns a promise that resolves when all retries are complete
   */
  async processQueue(
    retryFn: (config: AxiosRequestConfig) => Promise<AxiosResponse>
  ): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process requests in order (oldest first)
      const requests = Array.from(this.queue.values()).sort(
        (a, b) => a.timestamp - b.timestamp
      );

      for (const req of requests) {
        try {
          // Attempt retry
          const response = await retryFn(req.config);

          // Success - resolve the promise and remove from queue
          req.resolve(response);
          this.queue.delete(req.id);
        } catch (error) {
          // Increment retry count
          req.retryCount++;

          // Check if max retries reached
          if (req.retryCount >= this.maxRetries) {
            req.reject(
              new Error(`Max retries (${this.maxRetries}) reached`)
            );
            this.queue.delete(req.id);
          }
          // Otherwise, keep in queue for next retry attempt
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get all queued request configs (for debugging)
   */
  getQueuedRequests(): Array<{
    id: string;
    url: string;
    method: string;
    retryCount: number;
    timestamp: number;
  }> {
    return Array.from(this.queue.values()).map((req) => ({
      id: req.id,
      url: req.config.url || '',
      method: req.config.method?.toUpperCase() || 'GET',
      retryCount: req.retryCount,
      timestamp: req.timestamp,
    }));
  }
}

// Singleton instance
export const retryQueue = new RetryQueue();
