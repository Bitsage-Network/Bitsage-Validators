"use client";

import { useEffect, useState } from "react";
import { validateEnv, logEnvConfig, getEnvConfigSafe } from "@/lib/env";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface EnvValidatorProps {
  children: React.ReactNode;
  /** Show warnings even in development */
  showInDev?: boolean;
}

/**
 * Environment Validator Component
 *
 * Validates environment variables at startup and displays a warning banner
 * if required variables are missing. In production, this will prevent rendering.
 */
export function EnvValidator({ children, showInDev = false }: EnvValidatorProps) {
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const result = validateEnv();
    setValidationResult(result);

    // Log config on mount
    if (result.valid) {
      logEnvConfig();
    } else {
      console.warn("[EnvValidator] Validation failed:", result.errors);
    }
  }, []);

  // Still loading
  if (!validationResult) {
    return <>{children}</>;
  }

  const { valid, errors } = validationResult;
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";

  // In production, block rendering if invalid
  if (!valid && isProduction) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base p-6">
        <div className="max-w-lg w-full bg-surface-card border border-red-500/30 rounded-xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            Configuration Error
          </h1>
          <p className="text-gray-400 mb-4">
            The application cannot start due to missing environment variables.
          </p>
          <div className="bg-surface-elevated rounded-lg p-4 text-left">
            <p className="text-sm text-gray-500 mb-2">Missing variables:</p>
            <ul className="space-y-1">
              {errors.map((error, i) => (
                <li key={i} className="text-sm text-red-400 font-mono">
                  • {error}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Please check your .env.local file and restart the application.
          </p>
        </div>
      </div>
    );
  }

  // In development, show warning banner (if enabled)
  if (!valid && isDevelopment && showInDev && !dismissed) {
    return (
      <>
        <AnimatePresence>
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-orange-600/90 backdrop-blur-sm border-b border-orange-500/50"
          >
            <div className="max-w-7xl mx-auto px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-200" />
                  <span className="text-sm text-white">
                    <strong>Dev Warning:</strong> {errors.length} environment
                    variable{errors.length > 1 ? "s" : ""} missing
                  </span>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-orange-200 hover:text-white transition-colors"
                  >
                    {expanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setDismissed(true)}
                  className="p-1 hover:bg-orange-500/30 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-orange-200" />
                </button>
              </div>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 text-xs text-orange-100 font-mono"
                >
                  {errors.map((error, i) => (
                    <div key={i} className="py-0.5">
                      • {error}
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
        <div className={showInDev && !dismissed ? "pt-12" : ""}>{children}</div>
      </>
    );
  }

  // Valid or dismissed - render normally
  return <>{children}</>;
}

/**
 * Hook to check environment status
 */
export function useEnvStatus() {
  const [status, setStatus] = useState<{
    valid: boolean;
    errors: string[];
    config: ReturnType<typeof getEnvConfigSafe>;
  } | null>(null);

  useEffect(() => {
    const result = validateEnv();
    const config = getEnvConfigSafe();
    setStatus({ ...result, config });
  }, []);

  return status;
}
