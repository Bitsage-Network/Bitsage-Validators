"use client";

import { forwardRef, ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, Info, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface BaseFieldProps {
  label?: string;
  error?: string | null;
  helperText?: string;
  required?: boolean;
  success?: boolean;
  showCharCount?: boolean;
  maxLength?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
}

// ============================================================================
// FormField (Text Input)
// ============================================================================

export interface FormFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      success,
      showCharCount,
      maxLength,
      leftIcon,
      rightIcon,
      className,
      containerClassName,
      labelClassName,
      type = "text",
      value,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const inputType = isPassword && showPassword ? "text" : type;

    const charCount = typeof value === "string" ? value.length : 0;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {/* Label Row */}
        {(label || (showCharCount && maxLength)) && (
          <div className="flex items-center justify-between">
            {label && (
              <label
                className={cn(
                  "text-sm font-medium text-gray-300",
                  error && "text-red-400",
                  labelClassName
                )}
              >
                {label}
                {required && <span className="text-red-400 ml-1">*</span>}
              </label>
            )}
            {showCharCount && maxLength && (
              <span
                className={cn(
                  "text-xs",
                  charCount > maxLength ? "text-red-400" : "text-gray-500"
                )}
              >
                {charCount}/{maxLength}
              </span>
            )}
          </div>
        )}

        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            type={inputType}
            value={value}
            maxLength={maxLength}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl",
              "bg-surface-elevated border transition-all duration-200",
              "text-white placeholder:text-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              // Normal state
              !error && !success && "border-surface-border focus:border-brand-500 focus:ring-brand-500/20",
              // Error state
              error && "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              // Success state
              success && "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20",
              // Disabled state
              "disabled:opacity-50 disabled:cursor-not-allowed",
              // Icon padding
              leftIcon && "pl-10",
              (rightIcon || isPassword || error || success) && "pr-10",
              className
            )}
            aria-invalid={!!error}
            {...props}
          />

          {/* Right Icon / Status Icon / Password Toggle */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
            {error && !isPassword && <AlertCircle className="w-4 h-4 text-red-400" />}
            {success && !error && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {rightIcon && !error && !success && rightIcon}
          </div>
        </div>

        {/* Error / Helper Text */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-red-400 flex items-center gap-1"
            >
              <AlertCircle className="w-3 h-3" />
              {error}
            </motion.p>
          ) : helperText ? (
            <motion.p
              key="helper"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-gray-500 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              {helperText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

FormField.displayName = "FormField";

// ============================================================================
// TextArea Field
// ============================================================================

export interface TextAreaFieldProps
  extends BaseFieldProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      success,
      showCharCount,
      maxLength,
      className,
      containerClassName,
      labelClassName,
      value,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const charCount = typeof value === "string" ? value.length : 0;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {/* Label Row */}
        {(label || (showCharCount && maxLength)) && (
          <div className="flex items-center justify-between">
            {label && (
              <label
                className={cn(
                  "text-sm font-medium text-gray-300",
                  error && "text-red-400",
                  labelClassName
                )}
              >
                {label}
                {required && <span className="text-red-400 ml-1">*</span>}
              </label>
            )}
            {showCharCount && maxLength && (
              <span
                className={cn(
                  "text-xs",
                  charCount > maxLength ? "text-red-400" : "text-gray-500"
                )}
              >
                {charCount}/{maxLength}
              </span>
            )}
          </div>
        )}

        {/* TextArea */}
        <div className="relative">
          <textarea
            ref={ref}
            value={value}
            maxLength={maxLength}
            rows={rows}
            className={cn(
              "w-full px-4 py-3 rounded-xl resize-none",
              "bg-surface-elevated border transition-all duration-200",
              "text-white placeholder:text-gray-500",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              !error && !success && "border-surface-border focus:border-brand-500 focus:ring-brand-500/20",
              error && "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              success && "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className
            )}
            aria-invalid={!!error}
            {...props}
          />

          {/* Status Icon */}
          {(error || success) && (
            <div className="absolute right-3 top-3">
              {error && <AlertCircle className="w-4 h-4 text-red-400" />}
              {success && !error && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          )}
        </div>

        {/* Error / Helper Text */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-red-400 flex items-center gap-1"
            >
              <AlertCircle className="w-3 h-3" />
              {error}
            </motion.p>
          ) : helperText ? (
            <motion.p
              key="helper"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-gray-500 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              {helperText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

TextAreaField.displayName = "TextAreaField";

// ============================================================================
// Select Field
// ============================================================================

export interface SelectFieldProps
  extends BaseFieldProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      success,
      options,
      placeholder,
      leftIcon,
      className,
      containerClassName,
      labelClassName,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {/* Label */}
        {label && (
          <label
            className={cn(
              "text-sm font-medium text-gray-300",
              error && "text-red-400",
              labelClassName
            )}
          >
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}

        {/* Select Container */}
        <div className="relative">
          {/* Left Icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
              {leftIcon}
            </div>
          )}

          {/* Select */}
          <select
            ref={ref}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl appearance-none",
              "bg-surface-elevated border transition-all duration-200",
              "text-white",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              !error && !success && "border-surface-border focus:border-brand-500 focus:ring-brand-500/20",
              error && "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              success && "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              leftIcon && "pl-10",
              "pr-10",
              className
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled className="text-gray-500">
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="bg-surface-dark text-white"
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Chevron Icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg
              className={cn(
                "w-4 h-4",
                error ? "text-red-400" : success ? "text-emerald-400" : "text-gray-500"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Error / Helper Text */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-red-400 flex items-center gap-1"
            >
              <AlertCircle className="w-3 h-3" />
              {error}
            </motion.p>
          ) : helperText ? (
            <motion.p
              key="helper"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-gray-500 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              {helperText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

SelectField.displayName = "SelectField";

// ============================================================================
// Checkbox Field
// ============================================================================

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: ReactNode;
  description?: string;
  error?: string | null;
  className?: string;
  containerClassName?: string;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  ({ label, description, error, className, containerClassName, ...props }, ref) => {
    return (
      <div className={cn("space-y-1", containerClassName)}>
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative flex items-center">
            <input
              ref={ref}
              type="checkbox"
              className={cn(
                "w-5 h-5 rounded-md appearance-none cursor-pointer",
                "bg-surface-elevated border-2 transition-all duration-200",
                "checked:bg-brand-600 checked:border-brand-600",
                !error
                  ? "border-surface-border hover:border-gray-500"
                  : "border-red-500/50",
                "focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:ring-offset-0",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className
              )}
              {...props}
            />
            <svg
              className="absolute left-1 top-1 w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              {label}
            </span>
            {description && (
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
        </label>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-red-400 flex items-center gap-1 ml-8"
            >
              <AlertCircle className="w-3 h-3" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

CheckboxField.displayName = "CheckboxField";

// ============================================================================
// Radio Group
// ============================================================================

interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string | null;
  required?: boolean;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  label,
  error,
  required,
  orientation = "vertical",
  className,
}: RadioGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className={cn("text-sm font-medium text-gray-300", error && "text-red-400")}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      <div
        className={cn(
          "flex gap-3",
          orientation === "vertical" ? "flex-col" : "flex-row flex-wrap"
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex items-start gap-3 cursor-pointer group",
              option.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="relative flex items-center">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={option.disabled}
                className={cn(
                  "w-5 h-5 rounded-full appearance-none cursor-pointer",
                  "bg-surface-elevated border-2 transition-all duration-200",
                  "checked:border-brand-600",
                  !error
                    ? "border-surface-border hover:border-gray-500"
                    : "border-red-500/50",
                  "focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:ring-offset-0",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              />
              <div
                className={cn(
                  "absolute left-1.5 top-1.5 w-2 h-2 rounded-full transition-all duration-200",
                  value === option.value ? "bg-brand-600 scale-100" : "bg-transparent scale-0"
                )}
              />
            </div>
            <div className="flex-1">
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                {option.label}
              </span>
              {option.description && (
                <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-red-400 flex items-center gap-1"
          >
            <AlertCircle className="w-3 h-3" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Form Group (for grouping related fields)
// ============================================================================

interface FormGroupProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function FormGroup({ title, description, children, className }: FormGroupProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {description && <p className="text-sm text-gray-400">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ============================================================================
// Inline Form (horizontal layout for simple forms)
// ============================================================================

interface InlineFormProps {
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  className?: string;
}

export function InlineForm({ children, onSubmit, className }: InlineFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn("flex items-end gap-3", className)}
    >
      {children}
    </form>
  );
}
