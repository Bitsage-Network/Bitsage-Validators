"use client";

/**
 * Suppress specific console warnings/errors from third-party libraries
 *
 * These messages are from library internals and will be fixed in future versions.
 * We suppress them to keep the console clean during development.
 */

// List of warning/error patterns to suppress
const SUPPRESSED_PATTERNS = [
  // @starknet-react/core uses deprecated WalletAccount constructor
  // This will be fixed when starknet.js updates their API
  '@deprecated Use static method WalletAccount.connect',
  'WalletAccount.connectSilent',
  // SDK WebSocket connection errors during initial startup
  'WebSocket connection to',
  'WebSocket is closed before the connection is established',
  'Auto-connect failed',
  'SdkError',
  'WebSocket error',
];

let isInitialized = false;

export function initializeWarningSuppression() {
  // Only run on client and only once
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Store original console methods
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;

  // Helper to check if message should be suppressed
  const shouldSuppress = (args: unknown[]): boolean => {
    const message = args.map(arg =>
      typeof arg === 'string' ? arg :
      arg instanceof Error ? arg.message :
      String(arg)
    ).join(' ');

    return SUPPRESSED_PATTERNS.some(pattern => message.includes(pattern));
  };

  // Filter warnings
  console.warn = (...args: unknown[]) => {
    if (!shouldSuppress(args)) {
      originalWarn.apply(console, args);
    }
  };

  // The starknet library logs warnings via console.log with a WARN prefix
  console.log = (...args: unknown[]) => {
    if (!shouldSuppress(args)) {
      originalLog.apply(console, args);
    }
  };

  // Filter SDK WebSocket errors
  console.error = (...args: unknown[]) => {
    if (!shouldSuppress(args)) {
      originalError.apply(console, args);
    }
  };
}
