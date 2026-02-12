"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw, Clock } from "lucide-react";
import { useSafeWebSocketStatus } from "@/lib/providers/WebSocketProvider";
import { useOfflineDetection } from "@/lib/hooks/useOfflineDetection";
import { retryQueue, processRetryQueue } from "@/lib/api/client";

interface ConnectionStatusProps {
  showOnlyWhenDisconnected?: boolean;
  className?: string;
}

export function ConnectionStatus({
  showOnlyWhenDisconnected = true,
  className,
}: ConnectionStatusProps) {
  const { isConnected, connectionState, statusText } = useSafeWebSocketStatus();
  const { isOnline, wasOffline } = useOfflineDetection();
  const [dismissed, setDismissed] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // Poll retry queue size
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueSize(retryQueue.size);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-retry when connection is restored
  useEffect(() => {
    if (wasOffline && isOnline && queueSize > 0) {
      handleRetry();
    }
  }, [wasOffline, isOnline, queueSize]);

  // Reset dismissed state when connection changes
  useEffect(() => {
    if (connectionState === "connected" && isOnline) {
      setDismissed(false);
    }
  }, [connectionState, isOnline]);

  // Determine if banner should show
  useEffect(() => {
    if (dismissed) {
      setShowBanner(false);
      return;
    }

    if (showOnlyWhenDisconnected) {
      // Show banner when not online or not connected
      setShowBanner(!isOnline || connectionState !== "connected" || queueSize > 0);
    } else {
      // Always show
      setShowBanner(true);
    }
  }, [connectionState, isOnline, queueSize, showOnlyWhenDisconnected, dismissed]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await processRetryQueue();
      // Refresh the page if still issues
      if (!isOnline) {
        window.location.reload();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const getIcon = () => {
    // Offline takes priority
    if (!isOnline) {
      return <WifiOff className="w-4 h-4 text-red-400" />;
    }

    // Show retry queue icon if processing
    if (queueSize > 0) {
      return <Clock className="w-4 h-4 text-yellow-400" />;
    }

    switch (connectionState) {
      case "connected":
        return <Wifi className="w-4 h-4 text-emerald-400" />;
      case "connecting":
        return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case "disconnected":
      default:
        return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getBannerStyles = () => {
    // Offline takes priority
    if (!isOnline) {
      return "bg-red-500/10 border-red-500/30 text-red-400";
    }

    // Retry queue processing
    if (queueSize > 0) {
      return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
    }

    switch (connectionState) {
      case "connected":
        return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
      case "connecting":
        return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
      case "error":
        return "bg-red-500/10 border-red-500/30 text-red-400";
      case "disconnected":
      default:
        return "bg-gray-500/10 border-gray-500/30 text-gray-400";
    }
  };

  const getStatusMessage = () => {
    if (!isOnline) {
      return queueSize > 0
        ? `No internet connection (${queueSize} requests queued)`
        : "No internet connection";
    }

    if (queueSize > 0) {
      return `Retrying ${queueSize} request${queueSize === 1 ? '' : 's'}...`;
    }

    return statusText;
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "fixed top-16 left-1/2 -translate-x-1/2 z-40",
            "px-4 py-2 rounded-full border backdrop-blur-sm shadow-lg",
            getBannerStyles(),
            className
          )}
        >
          <div className="flex items-center gap-3">
            {getIcon()}
            <span className="text-sm font-medium">{getStatusMessage()}</span>

            {/* Show retry button for offline or errors */}
            {(!isOnline || connectionState === "error" || connectionState === "disconnected" || queueSize > 0) && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-xs",
                  !isOnline
                    ? "bg-red-500/20 hover:bg-red-500/30"
                    : queueSize > 0
                    ? "bg-yellow-500/20 hover:bg-yellow-500/30"
                    : "bg-gray-500/20 hover:bg-gray-500/30",
                  isRetrying && "opacity-50 cursor-not-allowed"
                )}
              >
                <RefreshCw className={cn("w-3 h-3", isRetrying && "animate-spin")} />
                {isRetrying ? "Retrying..." : queueSize > 0 ? "Retry Now" : "Retry"}
              </button>
            )}

            {/* Dismiss button */}
            {(!isOnline || connectionState === "error" || connectionState === "disconnected") && (
              <button
                onClick={() => setDismissed(true)}
                className="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Inline connection status indicator for headers/sidebars
 */
export function ConnectionStatusBadge({ className }: { className?: string }) {
  const { isConnected, connectionState } = useSafeWebSocketStatus();
  const { isOnline } = useOfflineDetection();

  // Browser offline takes priority
  if (!isOnline) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded-full",
          "bg-red-500/20 text-red-400 text-xs",
          className
        )}
      >
        <WifiOff className="w-3 h-3" />
        Offline
      </span>
    );
  }

  if (connectionState === "connected") {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded-full",
          "bg-emerald-500/20 text-emerald-400 text-xs",
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live
      </span>
    );
  }

  if (connectionState === "connecting") {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded-full",
          "bg-yellow-500/20 text-yellow-400 text-xs",
          className
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Connecting
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full",
        "bg-gray-500/20 text-gray-400 text-xs",
        className
      )}
    >
      <WifiOff className="w-3 h-3" />
      Disconnected
    </span>
  );
}
