"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Wifi,
  WifiOff,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info" | "connection";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const toastConfig: Record<ToastType, {
  icon: typeof CheckCircle2;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  success: {
    icon: CheckCircle2,
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-500/30",
  },
  error: {
    icon: XCircle,
    bgClass: "bg-red-500/10",
    textClass: "text-red-400",
    borderClass: "border-red-500/30",
  },
  warning: {
    icon: AlertTriangle,
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-400",
    borderClass: "border-orange-500/30",
  },
  info: {
    icon: Info,
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-400",
    borderClass: "border-blue-500/30",
  },
  connection: {
    icon: WifiOff,
    bgClass: "bg-gray-500/10",
    textClass: "text-gray-400",
    borderClass: "border-gray-500/30",
  },
};

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const config = toastConfig[toast.type];
  const IconComponent = toast.type === "connection" && toast.title.includes("Connected")
    ? Wifi
    : config.icon;

  const handleDismiss = useCallback(() => {
    onDismiss(toast.id);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "glass-card p-3 border-l-4 shadow-lg",
        "w-full sm:w-80",
        config.bgClass,
        config.borderClass
      )}
    >
      <div className="flex items-start gap-3">
        <IconComponent className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.textClass)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{toast.title}</p>
          {toast.message && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{toast.message}</p>
          )}
        </div>
        {toast.dismissible !== false && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-surface-elevated/50 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 hover:text-gray-300" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position?: "top-right" | "top-center" | "bottom-right" | "bottom-center";
}

const positionClasses: Record<NonNullable<ToastContainerProps["position"]>, string> = {
  "top-right": "top-4 right-4 left-4 sm:left-auto sm:top-20",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-4 right-4 left-4 sm:left-auto",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
};

export function ToastContainer({
  toasts,
  onDismiss,
  position = "top-right",
}: ToastContainerProps) {
  return (
    <div
      className={cn(
        "fixed z-50 space-y-2 pointer-events-none",
        "sm:max-w-sm",
        positionClasses[position]
      )}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
