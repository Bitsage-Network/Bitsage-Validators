"use client";

/**
 * Validated Input Components
 *
 * Form inputs with integrated validation feedback:
 * - Real-time validation indicators
 * - Error and warning states
 * - Loading state during async validation
 * - Accessibility-friendly labels and error messages
 */

import React, { forwardRef, useId } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Info,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import type { FieldState } from "@/lib/validation/formValidation";

// ============================================
// Types
// ============================================

interface ValidatedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  validating?: boolean;
  valid?: boolean;
  touched?: boolean;
  showValidation?: boolean;
  size?: "sm" | "md" | "lg";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onCopy?: () => void;
  fieldState?: FieldState;
}

interface ValidatedTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  validating?: boolean;
  valid?: boolean;
  touched?: boolean;
  showValidation?: boolean;
  maxCharacters?: number;
  fieldState?: FieldState;
}

interface ValidatedSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  warning?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  fieldState?: FieldState;
}

// ============================================
// Size Classes
// ============================================

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-base",
  lg: "px-5 py-3 text-lg",
};

const iconSizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
};

// ============================================
// Validation Status Icon
// ============================================

function ValidationIcon({
  validating,
  valid,
  hasError,
  hasWarning,
  size = "md",
}: {
  validating?: boolean;
  valid?: boolean;
  hasError?: boolean;
  hasWarning?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const iconClass = iconSizeClasses[size];

  if (validating) {
    return <Loader2 className={`${iconClass} text-blue-400 animate-spin`} />;
  }

  if (hasError) {
    return <XCircle className={`${iconClass} text-red-400`} />;
  }

  if (hasWarning) {
    return <AlertTriangle className={`${iconClass} text-yellow-400`} />;
  }

  if (valid) {
    return <CheckCircle className={`${iconClass} text-green-400`} />;
  }

  return null;
}

// ============================================
// ValidatedInput Component
// ============================================

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  (
    {
      label,
      hint,
      error: propError,
      warning: propWarning,
      validating: propValidating,
      valid: propValid,
      touched: propTouched,
      showValidation = true,
      size = "md",
      leftIcon,
      rightIcon,
      onCopy,
      fieldState,
      className = "",
      type = "text",
      disabled,
      ...props
    },
    ref
  ) => {
    const id = useId();
    const [showPassword, setShowPassword] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    // Use fieldState if provided, otherwise use individual props
    const error = fieldState?.error ?? propError;
    const warning = fieldState?.warning ?? propWarning;
    const validating = fieldState?.validating ?? propValidating;
    const valid = fieldState?.valid ?? propValid;
    const touched = fieldState?.touched ?? propTouched;

    const hasError = touched && !!error;
    const hasWarning = touched && !error && !!warning;
    const isValid = touched && valid && !error && !warning;

    const handleCopy = () => {
      if (onCopy) {
        onCopy();
      } else if (props.value) {
        navigator.clipboard.writeText(String(props.value));
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const inputType = type === "password" && showPassword ? "text" : type;

    const borderClass = hasError
      ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
      : hasWarning
        ? "border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500/20"
        : isValid
          ? "border-green-500/50 focus:border-green-500 focus:ring-green-500/20"
          : "border-gray-700 focus:border-blue-500 focus:ring-blue-500/20";

    return (
      <div className={className}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={id}
            type={inputType}
            disabled={disabled}
            className={`
              w-full rounded-lg border bg-gray-900 text-white placeholder-gray-500
              transition-all duration-200
              focus:outline-none focus:ring-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${sizeClasses[size]}
              ${borderClass}
              ${leftIcon ? "pl-10" : ""}
              ${rightIcon || type === "password" || onCopy || showValidation ? "pr-10" : ""}
            `}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${id}-error` : hasWarning ? `${id}-warning` : hint ? `${id}-hint` : undefined
            }
            {...props}
          />

          {/* Right Side Icons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {/* Custom Right Icon */}
            {rightIcon && !showValidation && (
              <span className="text-gray-400">{rightIcon}</span>
            )}

            {/* Password Toggle */}
            {type === "password" && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className={iconSizeClasses[size]} />
                ) : (
                  <Eye className={iconSizeClasses[size]} />
                )}
              </button>
            )}

            {/* Copy Button */}
            {onCopy !== undefined && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-gray-400 hover:text-gray-300 transition-colors"
                tabIndex={-1}
                aria-label="Copy to clipboard"
              >
                {copied ? (
                  <Check className={`${iconSizeClasses[size]} text-green-400`} />
                ) : (
                  <Copy className={iconSizeClasses[size]} />
                )}
              </button>
            )}

            {/* Validation Icon */}
            {showValidation && touched && (
              <ValidationIcon
                validating={validating}
                valid={isValid}
                hasError={hasError}
                hasWarning={hasWarning}
                size={size}
              />
            )}
          </div>
        </div>

        {/* Hint */}
        {hint && !hasError && !hasWarning && (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-gray-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            {hint}
          </p>
        )}

        {/* Error Message */}
        {hasError && (
          <p
            id={`${id}-error`}
            className="mt-1.5 text-sm text-red-400 flex items-center gap-1"
            role="alert"
          >
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Warning Message */}
        {hasWarning && (
          <p
            id={`${id}-warning`}
            className="mt-1.5 text-sm text-yellow-400 flex items-center gap-1"
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {warning}
          </p>
        )}
      </div>
    );
  }
);

ValidatedInput.displayName = "ValidatedInput";

// ============================================
// ValidatedTextarea Component
// ============================================

export const ValidatedTextarea = forwardRef<HTMLTextAreaElement, ValidatedTextareaProps>(
  (
    {
      label,
      hint,
      error: propError,
      warning: propWarning,
      validating: propValidating,
      valid: propValid,
      touched: propTouched,
      showValidation = true,
      maxCharacters,
      fieldState,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const id = useId();

    const error = fieldState?.error ?? propError;
    const warning = fieldState?.warning ?? propWarning;
    const validating = fieldState?.validating ?? propValidating;
    const valid = fieldState?.valid ?? propValid;
    const touched = fieldState?.touched ?? propTouched;

    const hasError = touched && !!error;
    const hasWarning = touched && !error && !!warning;
    const isValid = touched && valid && !error && !warning;

    const charCount = String(props.value || "").length;
    const isOverLimit = maxCharacters && charCount > maxCharacters;

    const borderClass = hasError || isOverLimit
      ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
      : hasWarning
        ? "border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500/20"
        : isValid
          ? "border-green-500/50 focus:border-green-500 focus:ring-green-500/20"
          : "border-gray-700 focus:border-blue-500 focus:ring-blue-500/20";

    return (
      <div className={className}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}

        {/* Textarea Container */}
        <div className="relative">
          <textarea
            ref={ref}
            id={id}
            disabled={disabled}
            className={`
              w-full rounded-lg border bg-gray-900 text-white placeholder-gray-500
              px-4 py-3 min-h-[100px] resize-y
              transition-all duration-200
              focus:outline-none focus:ring-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${borderClass}
            `}
            aria-invalid={!!(hasError || isOverLimit)}
            aria-describedby={
              hasError ? `${id}-error` : hasWarning ? `${id}-warning` : hint ? `${id}-hint` : undefined
            }
            {...props}
          />

          {/* Validation Icon */}
          {showValidation && touched && (
            <div className="absolute right-3 top-3">
              <ValidationIcon
                validating={validating}
                valid={isValid}
                hasError={hasError}
                hasWarning={hasWarning}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex-1">
            {/* Hint */}
            {hint && !hasError && !hasWarning && (
              <p id={`${id}-hint`} className="text-sm text-gray-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                {hint}
              </p>
            )}

            {/* Error Message */}
            {hasError && (
              <p
                id={`${id}-error`}
                className="text-sm text-red-400 flex items-center gap-1"
                role="alert"
              >
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </p>
            )}

            {/* Warning Message */}
            {hasWarning && (
              <p id={`${id}-warning`} className="text-sm text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {warning}
              </p>
            )}
          </div>

          {/* Character Count */}
          {maxCharacters && (
            <p
              className={`text-sm ${
                isOverLimit ? "text-red-400" : charCount > maxCharacters * 0.9 ? "text-yellow-400" : "text-gray-500"
              }`}
            >
              {charCount}/{maxCharacters}
            </p>
          )}
        </div>
      </div>
    );
  }
);

ValidatedTextarea.displayName = "ValidatedTextarea";

// ============================================
// ValidatedSelect Component
// ============================================

export const ValidatedSelect = forwardRef<HTMLSelectElement, ValidatedSelectProps>(
  (
    {
      label,
      hint,
      error: propError,
      warning: propWarning,
      options,
      placeholder,
      size = "md",
      fieldState,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const id = useId();

    const error = fieldState?.error ?? propError;
    const warning = fieldState?.warning ?? propWarning;

    const hasError = !!error;
    const hasWarning = !error && !!warning;

    const borderClass = hasError
      ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
      : hasWarning
        ? "border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500/20"
        : "border-gray-700 focus:border-blue-500 focus:ring-blue-500/20";

    return (
      <div className={className}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}

        {/* Select */}
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          className={`
            w-full rounded-lg border bg-gray-900 text-white
            transition-all duration-200
            focus:outline-none focus:ring-2
            disabled:opacity-50 disabled:cursor-not-allowed
            appearance-none cursor-pointer
            ${sizeClasses[size]}
            ${borderClass}
            pr-10
          `}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Hint */}
        {hint && !hasError && !hasWarning && (
          <p id={`${id}-hint`} className="mt-1.5 text-sm text-gray-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            {hint}
          </p>
        )}

        {/* Error Message */}
        {hasError && (
          <p
            id={`${id}-error`}
            className="mt-1.5 text-sm text-red-400 flex items-center gap-1"
            role="alert"
          >
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Warning Message */}
        {hasWarning && (
          <p className="mt-1.5 text-sm text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {warning}
          </p>
        )}
      </div>
    );
  }
);

ValidatedSelect.displayName = "ValidatedSelect";

// ============================================
// Address Input (specialized for crypto addresses)
// ============================================

interface AddressInputProps extends Omit<ValidatedInputProps, "type"> {
  addressType?: "starknet" | "ethereum" | "auto";
  onResolve?: (address: string) => void;
}

export const AddressInput = forwardRef<HTMLInputElement, AddressInputProps>(
  ({ addressType = "starknet", onResolve, ...props }, ref) => {
    const [resolving, setResolving] = React.useState(false);

    // Could add ENS/Starknet ID resolution here
    const handleResolve = async () => {
      if (!props.value) return;
      setResolving(true);
      // Resolution logic would go here
      setResolving(false);
    };

    return (
      <ValidatedInput
        ref={ref}
        type="text"
        placeholder={
          addressType === "starknet"
            ? "0x..."
            : addressType === "ethereum"
              ? "0x..."
              : "Enter address"
        }
        {...props}
        rightIcon={
          resolving ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : undefined
        }
      />
    );
  }
);

AddressInput.displayName = "AddressInput";

// ============================================
// Amount Input (specialized for token amounts)
// ============================================

interface AmountInputProps extends Omit<ValidatedInputProps, "type"> {
  tokenSymbol?: string;
  balance?: string | number;
  onMax?: () => void;
  decimals?: number;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ tokenSymbol, balance, onMax, decimals = 18, ...props }, ref) => {
    return (
      <div className="space-y-1">
        <ValidatedInput
          ref={ref}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          placeholder="0.00"
          {...props}
          rightIcon={
            <div className="flex items-center gap-2">
              {tokenSymbol && (
                <span className="text-sm text-gray-400">{tokenSymbol}</span>
              )}
              {onMax && (
                <button
                  type="button"
                  onClick={onMax}
                  className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                >
                  MAX
                </button>
              )}
            </div>
          }
        />
        {balance !== undefined && (
          <p className="text-xs text-gray-500 text-right">
            Balance: {typeof balance === "number" ? balance.toFixed(4) : balance} {tokenSymbol}
          </p>
        )}
      </div>
    );
  }
);

AmountInput.displayName = "AmountInput";

export type {
  ValidatedInputProps,
  ValidatedTextareaProps,
  ValidatedSelectProps,
  AddressInputProps,
  AmountInputProps,
};
