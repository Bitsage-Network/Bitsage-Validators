"use client";

import { useState, useCallback } from "react";

interface UseCopyToClipboardOptions {
  successDuration?: number;
  onSuccess?: (text: string) => void;
  onError?: (error: Error) => void;
}

interface CopyToClipboardState {
  copied: boolean;
  error: Error | null;
}

/**
 * Hook for copying text to clipboard with feedback
 */
export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const { successDuration = 2000, onSuccess, onError } = options;
  const [state, setState] = useState<CopyToClipboardState>({
    copied: false,
    error: null,
  });

  const copy = useCallback(
    async (text: string) => {
      if (!navigator?.clipboard) {
        const error = new Error("Clipboard not supported");
        setState({ copied: false, error });
        onError?.(error);
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setState({ copied: true, error: null });
        onSuccess?.(text);

        // Reset after duration
        setTimeout(() => {
          setState((prev) => ({ ...prev, copied: false }));
        }, successDuration);

        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Copy failed");
        setState({ copied: false, error });
        onError?.(error);
        return false;
      }
    },
    [successDuration, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({ copied: false, error: null });
  }, []);

  return {
    ...state,
    copy,
    reset,
  };
}

/**
 * Hook for copying with ID tracking (for multiple copy buttons)
 */
export function useCopyWithId(options: UseCopyToClipboardOptions = {}) {
  const { successDuration = 2000, onSuccess, onError } = options;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, id: string) => {
      if (!navigator?.clipboard) {
        onError?.(new Error("Clipboard not supported"));
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        onSuccess?.(text);

        setTimeout(() => {
          setCopiedId((prev) => (prev === id ? null : prev));
        }, successDuration);

        return true;
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error("Copy failed"));
        return false;
      }
    },
    [successDuration, onSuccess, onError]
  );

  const isCopied = useCallback(
    (id: string) => copiedId === id,
    [copiedId]
  );

  return {
    copiedId,
    copy,
    isCopied,
  };
}
