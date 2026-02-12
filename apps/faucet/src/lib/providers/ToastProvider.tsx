"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { ToastContainer, type Toast, type ToastType } from "@/components/ui/Toast";

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  // Convenience methods
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000; // 5 seconds

interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
  position?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
}

export function ToastProvider({
  children,
  maxToasts = 5,
  position = "top-right",
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Clear the timeout if exists
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const duration = toast.duration ?? DEFAULT_DURATION;

      setToasts((prev) => {
        // Remove oldest if at max
        const newToasts = prev.length >= maxToasts ? prev.slice(1) : prev;
        return [...newToasts, { ...toast, id }];
      });

      // Auto-dismiss if duration > 0
      if (duration > 0) {
        const timeout = setTimeout(() => {
          removeToast(id);
        }, duration);
        timeoutRefs.current.set(id, timeout);
      }

      return id;
    },
    [maxToasts, removeToast]
  );

  const clearToasts = useCallback(() => {
    // Clear all timeouts
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current.clear();
    setToasts([]);
  }, []);

  // Convenience methods
  const createToastMethod = useCallback(
    (type: ToastType) => (title: string, message?: string) => {
      return addToast({ type, title, message });
    },
    [addToast]
  );

  const success = useCallback(
    (title: string, message?: string) => createToastMethod("success")(title, message),
    [createToastMethod]
  );

  const error = useCallback(
    (title: string, message?: string) => createToastMethod("error")(title, message),
    [createToastMethod]
  );

  const warning = useCallback(
    (title: string, message?: string) => createToastMethod("warning")(title, message),
    [createToastMethod]
  );

  const info = useCallback(
    (title: string, message?: string) => createToastMethod("info")(title, message),
    [createToastMethod]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        clearToasts,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} position={position} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
