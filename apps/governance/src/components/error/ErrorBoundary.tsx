"use client";

/**
 * Comprehensive Error Boundary System
 *
 * Provides:
 * - Generic component error boundary with recovery
 * - API error boundary for data fetching failures
 * - Transaction error boundary for blockchain errors
 * - Customizable error displays with retry actions
 * - Error reporting integration
 */

import React, { Component, ReactNode, useState, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  RefreshCw,
  XCircle,
  Bug,
  Wifi,
  WifiOff,
  Server,
  FileWarning,
  Home,
  ArrowLeft,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

// ============================================
// Types
// ============================================

type ErrorType = "component" | "api" | "transaction" | "network" | "unknown";
type ErrorSeverity = "warning" | "error" | "critical";

interface ErrorInfo {
  type: ErrorType;
  severity: ErrorSeverity;
  title: string;
  message: string;
  code?: string;
  details?: string;
  stack?: string;
  retryable: boolean;
  timestamp: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: ErrorInfo, retry: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
  errorType?: ErrorType;
  showDetails?: boolean;
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorDisplayProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onGoBack?: () => void;
  onGoHome?: () => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

// ============================================
// Error Classification
// ============================================

function classifyError(error: Error): ErrorInfo {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const timestamp = Date.now();

  // Network errors
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("connection") ||
    name.includes("networkerror")
  ) {
    return {
      type: "network",
      severity: "error",
      title: "Network Error",
      message: "Unable to connect to the server. Please check your internet connection.",
      code: "NETWORK_ERROR",
      details: error.message,
      stack: error.stack,
      retryable: true,
      timestamp,
    };
  }

  // API errors
  if (
    message.includes("api") ||
    message.includes("400") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("404") ||
    message.includes("500")
  ) {
    const is4xx = message.includes("400") || message.includes("401") || message.includes("403") || message.includes("404");
    return {
      type: "api",
      severity: is4xx ? "warning" : "error",
      title: "API Error",
      message: is4xx
        ? "The requested resource could not be found or accessed."
        : "The server encountered an error. Please try again later.",
      code: message.match(/\d{3}/)?.[0] || "API_ERROR",
      details: error.message,
      stack: error.stack,
      retryable: !is4xx || message.includes("404"),
      timestamp,
    };
  }

  // Transaction errors
  if (
    message.includes("transaction") ||
    message.includes("revert") ||
    message.includes("gas") ||
    message.includes("nonce") ||
    message.includes("insufficient") ||
    message.includes("rejected")
  ) {
    const isUserRejection = message.includes("rejected") || message.includes("denied");
    return {
      type: "transaction",
      severity: isUserRejection ? "warning" : "error",
      title: isUserRejection ? "Transaction Cancelled" : "Transaction Failed",
      message: isUserRejection
        ? "You cancelled the transaction in your wallet."
        : "The transaction could not be completed. Please check your balance and try again.",
      code: "TX_ERROR",
      details: error.message,
      stack: error.stack,
      retryable: !isUserRejection,
      timestamp,
    };
  }

  // Component/rendering errors
  return {
    type: "component",
    severity: "error",
    title: "Something Went Wrong",
    message: "An unexpected error occurred. Please try refreshing the page.",
    code: "COMPONENT_ERROR",
    details: error.message,
    stack: error.stack,
    retryable: true,
    timestamp,
  };
}

// ============================================
// Error Icons
// ============================================

function getErrorIcon(type: ErrorType, severity: ErrorSeverity) {
  const iconClass = severity === "critical"
    ? "text-red-400"
    : severity === "error"
      ? "text-orange-400"
      : "text-yellow-400";

  switch (type) {
    case "network":
      return <WifiOff className={`w-12 h-12 ${iconClass}`} />;
    case "api":
      return <Server className={`w-12 h-12 ${iconClass}`} />;
    case "transaction":
      return <FileWarning className={`w-12 h-12 ${iconClass}`} />;
    default:
      return <AlertTriangle className={`w-12 h-12 ${iconClass}`} />;
  }
}

// ============================================
// Error Display Component
// ============================================

export function ErrorDisplay({
  error,
  onRetry,
  onGoBack,
  onGoHome,
  showDetails = false,
  compact = false,
  className = "",
}: ErrorDisplayProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyErrorDetails = useCallback(() => {
    const text = `Error: ${error.title}
Code: ${error.code}
Message: ${error.message}
Details: ${error.details}
Time: ${new Date(error.timestamp).toISOString()}
${error.stack ? `\nStack:\n${error.stack}` : ""}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [error]);

  const severityColors = {
    warning: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-400",
    },
    error: {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-400",
    },
    critical: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
    },
  };

  const colors = severityColors[error.severity];

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border} ${className}`}
      >
        <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${colors.text}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300 truncate">{error.message}</p>
        </div>
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 rounded-xl border ${colors.bg} ${colors.border} ${className}`}
    >
      {/* Icon */}
      <div className="mb-6">{getErrorIcon(error.type, error.severity)}</div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-white mb-2">{error.title}</h2>

      {/* Message */}
      <p className="text-gray-400 text-center max-w-md mb-6">{error.message}</p>

      {/* Error Code */}
      {error.code && (
        <div className="flex items-center gap-2 mb-6 px-3 py-1.5 bg-gray-800 rounded-lg">
          <span className="text-xs text-gray-500">Error Code:</span>
          <code className="text-xs text-gray-300 font-mono">{error.code}</code>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mb-6">
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        )}
        {onGoHome && (
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
        )}
      </div>

      {/* Error Details (collapsible) */}
      {showDetails && error.details && (
        <div className="w-full max-w-lg">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-400 transition-colors mx-auto mb-2"
          >
            <Bug className="w-4 h-4" />
            Technical Details
            {detailsExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {detailsExpanded && (
            <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Error Details</span>
                <button
                  onClick={copyErrorDetails}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {error.details}
              </pre>
              {error.stack && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                    Stack Trace
                  </summary>
                  <pre className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto whitespace-pre-wrap break-all">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Support Link */}
      <a
        href="https://github.com/bitsage/validator/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 mt-4 text-sm text-gray-500 hover:text-gray-400 transition-colors"
      >
        Report this issue
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

// ============================================
// Error Boundary Class Component
// ============================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, showDetails, className } = this.props;

    if (hasError && error) {
      const errorInfo = classifyError(error);

      if (fallback) {
        if (typeof fallback === "function") {
          return fallback(errorInfo, this.resetError);
        }
        return fallback;
      }

      return (
        <ErrorDisplay
          error={errorInfo}
          onRetry={errorInfo.retryable ? this.resetError : undefined}
          showDetails={showDetails}
          className={className}
        />
      );
    }

    return children;
  }
}

// ============================================
// Specialized Error Boundaries
// ============================================

interface APIErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
  fallback?: ReactNode;
  className?: string;
}

export function APIErrorBoundary({
  children,
  onRetry,
  fallback,
  className,
}: APIErrorBoundaryProps) {
  return (
    <ErrorBoundary
      errorType="api"
      onReset={onRetry}
      fallback={
        fallback ||
        ((error, retry) => (
          <ErrorDisplay
            error={error}
            onRetry={onRetry || retry}
            compact
            className={className}
          />
        ))
      }
    >
      {children}
    </ErrorBoundary>
  );
}

interface TransactionErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function TransactionErrorBoundary({
  children,
  onRetry,
  onCancel,
  className,
}: TransactionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      errorType="transaction"
      fallback={(error, retry) => (
        <div className={`p-4 rounded-xl border border-red-500/30 bg-red-500/10 ${className}`}>
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-400">{error.title}</h4>
              <p className="text-sm text-gray-400 mt-1">{error.message}</p>
              {error.details && (
                <p className="text-xs text-gray-500 mt-2 font-mono">{error.details}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                {error.retryable && (
                  <button
                    onClick={onRetry || retry}
                    className="px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 transition-colors"
                  >
                    Try Again
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

// ============================================
// Error State Hook
// ============================================

interface UseErrorStateResult {
  error: ErrorInfo | null;
  setError: (error: Error | string | null) => void;
  clearError: () => void;
  hasError: boolean;
}

export function useErrorState(): UseErrorStateResult {
  const [error, setErrorState] = useState<ErrorInfo | null>(null);

  const setError = useCallback((err: Error | string | null) => {
    if (err === null) {
      setErrorState(null);
    } else if (typeof err === "string") {
      setErrorState({
        type: "unknown",
        severity: "error",
        title: "Error",
        message: err,
        retryable: true,
        timestamp: Date.now(),
      });
    } else {
      setErrorState(classifyError(err));
    }
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  return {
    error,
    setError,
    clearError,
    hasError: error !== null,
  };
}

// ============================================
// Inline Error Message
// ============================================

interface InlineErrorProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({
  message,
  onDismiss,
  onRetry,
  className = "",
}: InlineErrorProps) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 ${className}`}
    >
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <span className="flex-1 text-sm text-red-400">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="p-1 text-red-400 hover:text-red-300 transition-colors"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 text-red-400 hover:text-red-300 transition-colors"
          title="Dismiss"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export type { ErrorType, ErrorSeverity, ErrorInfo, ErrorBoundaryProps, ErrorDisplayProps };
