"use client";

/**
 * Reconnecting WebSocket with Exponential Backoff
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Jitter to prevent thundering herd
 * - Connection state management
 * - Message queue for offline messages
 * - Heartbeat/ping-pong for connection health
 * - Event-driven architecture
 * - Configurable retry limits
 */

// ============================================
// Types
// ============================================

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting" | "failed";

interface ReconnectingWebSocketOptions {
  url: string;
  protocols?: string | string[];
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  messageQueueSize?: number;
  autoReconnect?: boolean;
  debug?: boolean;
}

interface ConnectionStats {
  connectAttempts: number;
  successfulConnections: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  totalUptime: number;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
}

type EventType = "open" | "close" | "error" | "message" | "reconnecting" | "stateChange";

interface WebSocketEvent {
  type: EventType;
  timestamp: number;
  data?: unknown;
  state?: ConnectionState;
  previousState?: ConnectionState;
  attempt?: number;
  delay?: number;
  error?: Error;
  code?: number;
  reason?: string;
  maxRetries?: number;
}

type EventHandler = (event: WebSocketEvent) => void;

// ============================================
// ReconnectingWebSocket Class
// ============================================

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private options: Required<ReconnectingWebSocketOptions>;
  private state: ConnectionState = "disconnected";
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: string[] = [];
  private eventHandlers: Map<EventType, Set<EventHandler>> = new Map();
  private stats: ConnectionStats = {
    connectAttempts: 0,
    successfulConnections: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    totalUptime: 0,
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
  };
  private uptimeStart: number | null = null;
  private isIntentionallyClosed = false;

  constructor(options: ReconnectingWebSocketOptions) {
    this.options = {
      url: options.url,
      protocols: options.protocols ?? [],
      maxRetries: options.maxRetries ?? 10,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitterFactor: options.jitterFactor ?? 0.3,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      heartbeatTimeout: options.heartbeatTimeout ?? 10000,
      messageQueueSize: options.messageQueueSize ?? 100,
      autoReconnect: options.autoReconnect ?? true,
      debug: options.debug ?? false,
    };

    // Initialize event handler sets
    const eventTypes: EventType[] = ["open", "close", "error", "message", "reconnecting", "stateChange"];
    eventTypes.forEach((type) => this.eventHandlers.set(type, new Set()));
  }

  // ============================================
  // Public API
  // ============================================

  connect(): void {
    if (this.state === "connecting" || this.state === "connected") {
      this.log("Already connecting or connected");
      return;
    }

    this.isIntentionallyClosed = false;
    this.attemptConnection();
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.cleanup();
    this.updateState("disconnected");
    this.log("Intentionally disconnected");
  }

  send(data: string | ArrayBuffer | Blob): boolean {
    if (this.state !== "connected" || !this.ws) {
      // Queue message if not connected
      if (typeof data === "string") {
        if (this.messageQueue.length < this.options.messageQueueSize) {
          this.messageQueue.push(data);
          this.log(`Message queued (${this.messageQueue.length} in queue)`);
        } else {
          this.log("Message queue full, dropping message");
        }
      }
      return false;
    }

    try {
      this.ws.send(data);
      this.stats.messagesSent++;
      if (typeof data === "string") {
        this.stats.bytesSent += data.length;
      } else if (data instanceof ArrayBuffer) {
        this.stats.bytesSent += data.byteLength;
      }
      return true;
    } catch (error) {
      this.log("Send error:", error);
      return false;
    }
  }

  sendJSON(data: unknown): boolean {
    return this.send(JSON.stringify(data));
  }

  on(event: EventType, handler: EventHandler): () => void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
    return () => this.off(event, handler);
  }

  off(event: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  getStats(): ConnectionStats {
    // Update uptime if currently connected
    if (this.state === "connected" && this.uptimeStart) {
      return {
        ...this.stats,
        totalUptime: this.stats.totalUptime + (Date.now() - this.uptimeStart),
      };
    }
    return { ...this.stats };
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }

  clearMessageQueue(): void {
    this.messageQueue = [];
    this.log("Message queue cleared");
  }

  forceReconnect(): void {
    this.log("Force reconnect requested");
    this.retryCount = 0;
    this.cleanup();
    this.attemptConnection();
  }

  // ============================================
  // Private Methods
  // ============================================

  private attemptConnection(): void {
    this.stats.connectAttempts++;
    this.updateState("connecting");
    this.log(`Connection attempt ${this.retryCount + 1}/${this.options.maxRetries + 1}`);

    try {
      this.ws = new WebSocket(this.options.url, this.options.protocols);
      this.setupEventHandlers();
    } catch (error) {
      this.log("WebSocket construction error:", error);
      this.handleConnectionFailure(error as Error);
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.log("Connection opened");
      this.retryCount = 0;
      this.stats.successfulConnections++;
      this.stats.lastConnectedAt = Date.now();
      this.uptimeStart = Date.now();
      this.updateState("connected");
      this.startHeartbeat();
      this.flushMessageQueue();
      this.emit("open", {});
    };

    this.ws.onclose = (event) => {
      this.log(`Connection closed: code=${event.code}, reason=${event.reason}`);
      this.updateUptime();
      this.stats.lastDisconnectedAt = Date.now();
      this.stopHeartbeat();
      this.emit("close", { code: event.code, reason: event.reason });

      if (!this.isIntentionallyClosed && this.options.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.updateState("disconnected");
      }
    };

    this.ws.onerror = (event) => {
      this.log("WebSocket error:", event);
      this.emit("error", { error: new Error("WebSocket error") });
    };

    this.ws.onmessage = (event) => {
      this.stats.messagesReceived++;
      if (typeof event.data === "string") {
        this.stats.bytesReceived += event.data.length;
      }

      // Reset heartbeat timeout on any message (pong or data)
      this.resetHeartbeatTimeout();

      // Check if it's a pong response
      if (event.data === "pong" || event.data === '{"type":"pong"}') {
        this.log("Pong received");
        return;
      }

      this.emit("message", { data: event.data });
    };
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= this.options.maxRetries) {
      this.log("Max retries reached");
      this.updateState("failed");
      return;
    }

    const delay = this.calculateBackoff();
    this.retryCount++;
    this.updateState("reconnecting");

    this.emit("reconnecting", {
      attempt: this.retryCount,
      delay,
      maxRetries: this.options.maxRetries,
    });

    this.log(`Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.options.maxRetries})`);

    this.retryTimer = setTimeout(() => {
      this.attemptConnection();
    }, delay);
  }

  private calculateBackoff(): number {
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.options.initialDelay * Math.pow(this.options.backoffMultiplier, this.retryCount),
      this.options.maxDelay
    );

    // Add jitter (random factor to prevent thundering herd)
    const jitter = exponentialDelay * this.options.jitterFactor * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  private handleConnectionFailure(error: Error): void {
    this.emit("error", { error });
    if (this.options.autoReconnect) {
      this.scheduleReconnect();
    } else {
      this.updateState("failed");
    }
  }

  private startHeartbeat(): void {
    if (this.options.heartbeatInterval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.state === "connected" && this.ws) {
        this.log("Sending heartbeat ping");
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
          this.setHeartbeatTimeout();
        } catch (error) {
          this.log("Heartbeat send error:", error);
        }
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private setHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.log("Heartbeat timeout - connection may be dead");
      if (this.ws) {
        this.ws.close(4000, "Heartbeat timeout");
      }
    }, this.options.heartbeatTimeout);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      this.clearHeartbeatTimeout();
    }
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    this.log(`Flushing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((message) => {
      this.send(message);
    });
  }

  private updateState(newState: ConnectionState): void {
    if (this.state === newState) return;

    const previousState = this.state;
    this.state = newState;
    this.log(`State: ${previousState} -> ${newState}`);
    this.emit("stateChange", { state: newState, previousState });
  }

  private updateUptime(): void {
    if (this.uptimeStart) {
      this.stats.totalUptime += Date.now() - this.uptimeStart;
      this.uptimeStart = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "Client disconnect");
      }

      this.ws = null;
    }

    this.updateUptime();
  }

  private emit(type: EventType, data: Omit<WebSocketEvent, "type" | "timestamp">): void {
    const event: WebSocketEvent = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in ${type} handler:`, error);
        }
      });
    }
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[ReconnectingWS]`, ...args);
    }
  }
}

// ============================================
// React Hook
// ============================================

import { useState, useEffect, useRef, useCallback } from "react";

interface UseReconnectingWebSocketOptions extends Omit<ReconnectingWebSocketOptions, "url"> {
  url: string | null;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onReconnecting?: (attempt: number, delay: number) => void;
  onStateChange?: (state: ConnectionState, previousState?: ConnectionState) => void;
}

interface UseReconnectingWebSocketResult {
  state: ConnectionState;
  send: (data: string | ArrayBuffer | Blob) => boolean;
  sendJSON: (data: unknown) => boolean;
  connect: () => void;
  disconnect: () => void;
  forceReconnect: () => void;
  stats: ConnectionStats;
  retryCount: number;
  queuedMessageCount: number;
}

export function useReconnectingWebSocket(
  options: UseReconnectingWebSocketOptions
): UseReconnectingWebSocketResult {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    onReconnecting,
    onStateChange,
    ...wsOptions
  } = options;

  const [state, setState] = useState<ConnectionState>("disconnected");
  const [stats, setStats] = useState<ConnectionStats>({
    connectAttempts: 0,
    successfulConnections: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    totalUptime: 0,
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
  });
  const [retryCount, setRetryCount] = useState(0);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);

  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  // Stable callback refs
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const onReconnectingRef = useRef(onReconnecting);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
    onReconnectingRef.current = onReconnecting;
    onStateChangeRef.current = onStateChange;
  });

  useEffect(() => {
    if (!url) return;

    const ws = new ReconnectingWebSocket({ url, ...wsOptions });
    wsRef.current = ws;

    ws.on("open", () => {
      onOpenRef.current?.();
      setStats(ws.getStats());
    });

    ws.on("close", () => {
      onCloseRef.current?.();
      setStats(ws.getStats());
    });

    ws.on("error", (event) => {
      onErrorRef.current?.(event.error as Error);
    });

    ws.on("message", (event) => {
      onMessageRef.current?.(event.data);
      setStats(ws.getStats());
    });

    ws.on("reconnecting", (event) => {
      onReconnectingRef.current?.(event.attempt as number, event.delay as number);
      setRetryCount(event.attempt as number);
    });

    ws.on("stateChange", (event) => {
      setState(event.state as ConnectionState);
      onStateChangeRef.current?.(event.state as ConnectionState, event.data as ConnectionState);
      setQueuedMessageCount(ws.getQueuedMessageCount());
    });

    ws.connect();

    // Periodic stats update
    const statsInterval = setInterval(() => {
      if (wsRef.current) {
        setStats(wsRef.current.getStats());
        setQueuedMessageCount(wsRef.current.getQueuedMessageCount());
      }
    }, 5000);

    return () => {
      clearInterval(statsInterval);
      ws.disconnect();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    if (wsRef.current) {
      const result = wsRef.current.send(data);
      setQueuedMessageCount(wsRef.current.getQueuedMessageCount());
      return result;
    }
    return false;
  }, []);

  const sendJSON = useCallback((data: unknown) => {
    if (wsRef.current) {
      const result = wsRef.current.sendJSON(data);
      setQueuedMessageCount(wsRef.current.getQueuedMessageCount());
      return result;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    wsRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
  }, []);

  const forceReconnect = useCallback(() => {
    wsRef.current?.forceReconnect();
  }, []);

  return {
    state,
    send,
    sendJSON,
    connect,
    disconnect,
    forceReconnect,
    stats,
    retryCount,
    queuedMessageCount,
  };
}

export type { ConnectionState, ConnectionStats, ReconnectingWebSocketOptions, WebSocketEvent };
