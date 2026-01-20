"use client";

import { forwardRef, useState, useCallback, useRef, useEffect, InputHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ChevronUp, ChevronDown, Minus, Plus, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Number Input with Increment/Decrement
// ============================================================================

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value" | "size"> {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  label?: string;
  error?: string | null;
  helperText?: string;
  unit?: string;
  showControls?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  containerClassName?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      precision = 2,
      label,
      error,
      helperText,
      unit,
      showControls = true,
      size = "md",
      className,
      containerClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Allow empty, negative sign, decimal point, and numbers
      if (val === "" || val === "-" || val === "." || /^-?\d*\.?\d*$/.test(val)) {
        onChange(val);
      }
    };

    const increment = () => {
      const num = parseFloat(String(value)) || 0;
      const newVal = Math.min(num + step, max ?? Infinity);
      onChange(newVal.toFixed(precision));
    };

    const decrement = () => {
      const num = parseFloat(String(value)) || 0;
      const newVal = Math.max(num - step, min ?? -Infinity);
      onChange(newVal.toFixed(precision));
    };

    const handleBlur = () => {
      const num = parseFloat(String(value));
      if (!isNaN(num)) {
        let clampedVal = num;
        if (min !== undefined) clampedVal = Math.max(clampedVal, min);
        if (max !== undefined) clampedVal = Math.min(clampedVal, max);
        onChange(clampedVal.toFixed(precision));
      }
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-5 py-3 text-lg",
    };

    const buttonSizes = {
      sm: "p-1",
      md: "p-1.5",
      lg: "p-2",
    };

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {label && (
          <label className={cn("text-sm font-medium text-gray-300", error && "text-red-400")}>
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled}
            className={cn(
              "w-full rounded-xl",
              "bg-surface-elevated border transition-all duration-200",
              "text-white placeholder:text-gray-500 text-center font-mono",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              !error
                ? "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
                : "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              showControls && "px-12",
              sizes[size],
              className
            )}
            {...props}
          />

          {/* Decrement Button */}
          {showControls && (
            <button
              type="button"
              onClick={decrement}
              disabled={disabled || (min !== undefined && parseFloat(String(value)) <= min)}
              className={cn(
                "absolute left-2 rounded-lg",
                "text-gray-400 hover:text-white hover:bg-white/10",
                "transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                buttonSizes[size]
              )}
            >
              <Minus className="w-4 h-4" />
            </button>
          )}

          {/* Increment Button */}
          {showControls && (
            <button
              type="button"
              onClick={increment}
              disabled={disabled || (max !== undefined && parseFloat(String(value)) >= max)}
              className={cn(
                "absolute right-2 rounded-lg",
                "text-gray-400 hover:text-white hover:bg-white/10",
                "transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                buttonSizes[size]
              )}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {/* Unit */}
          {unit && !showControls && (
            <span className="absolute right-3 text-gray-500 text-sm">{unit}</span>
          )}
        </div>

        {/* Error / Helper */}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-gray-500"
            >
              {helperText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

NumberInput.displayName = "NumberInput";

// ============================================================================
// Search Input
// ============================================================================

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "size"> {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  isLoading?: boolean;
  showClear?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  containerClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onSearch,
      isLoading = false,
      showClear = true,
      size = "md",
      className,
      containerClassName,
      placeholder = "Search...",
      ...props
    },
    ref
  ) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && onSearch) {
        onSearch(value);
      }
      if (e.key === "Escape") {
        onChange("");
      }
    };

    const sizes = {
      sm: "pl-8 pr-8 py-1.5 text-sm",
      md: "pl-10 pr-10 py-2.5 text-base",
      lg: "pl-12 pr-12 py-3 text-lg",
    };

    const iconSizes = {
      sm: "w-3.5 h-3.5",
      md: "w-4 h-4",
      lg: "w-5 h-5",
    };

    const iconPositions = {
      sm: "left-2.5",
      md: "left-3",
      lg: "left-4",
    };

    return (
      <div className={cn("relative", containerClassName)}>
        {/* Search Icon */}
        <div className={cn("absolute top-1/2 -translate-y-1/2 text-gray-500", iconPositions[size])}>
          {isLoading ? (
            <Loader2 className={cn(iconSizes[size], "animate-spin")} />
          ) : (
            <Search className={iconSizes[size]} />
          )}
        </div>

        {/* Input */}
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-xl",
            "bg-surface-elevated border border-surface-border",
            "text-white placeholder:text-gray-500",
            "focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500",
            "transition-all duration-200",
            sizes[size],
            className
          )}
          {...props}
        />

        {/* Clear Button */}
        {showClear && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 right-3",
              "text-gray-500 hover:text-white transition-colors"
            )}
          >
            <X className={iconSizes[size]} />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";

// ============================================================================
// Range Slider
// ============================================================================

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  marks?: { value: number; label: string }[];
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  formatValue = (v) => String(v),
  marks,
  disabled = false,
  className,
  containerClassName,
}: SliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percentage = ((value - min) / (max - min)) * 100;

  const updateValue = useCallback(
    (clientX: number) => {
      if (!sliderRef.current || disabled) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const rawValue = (x / rect.width) * (max - min) + min;
      const steppedValue = Math.round(rawValue / step) * step;
      const clampedValue = Math.max(min, Math.min(max, steppedValue));
      onChange(clampedValue);
    },
    [disabled, max, min, onChange, step]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateValue]);

  return (
    <div className={cn("space-y-2", containerClassName)}>
      {/* Label and Value */}
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-gray-300">{label}</span>}
          {showValue && (
            <span className="text-sm font-mono text-brand-400">{formatValue(value)}</span>
          )}
        </div>
      )}

      {/* Slider Track */}
      <div
        ref={sliderRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "relative h-2 rounded-full cursor-pointer",
          "bg-surface-elevated",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {/* Filled Track */}
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
          style={{ width: `${percentage}%` }}
        />

        {/* Thumb */}
        <motion.div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2",
            "w-4 h-4 rounded-full bg-white shadow-lg",
            "border-2 border-brand-500",
            isDragging && "ring-4 ring-brand-500/20",
            !disabled && "hover:scale-110",
            "transition-transform"
          )}
          style={{ left: `${percentage}%` }}
          animate={{ scale: isDragging ? 1.1 : 1 }}
        />
      </div>

      {/* Marks */}
      {marks && marks.length > 0 && (
        <div className="relative h-5">
          {marks.map((mark) => {
            const markPercentage = ((mark.value - min) / (max - min)) * 100;
            return (
              <button
                key={mark.value}
                type="button"
                onClick={() => !disabled && onChange(mark.value)}
                className={cn(
                  "absolute -translate-x-1/2 text-xs transition-colors",
                  mark.value === value ? "text-brand-400" : "text-gray-500 hover:text-gray-300",
                  disabled && "cursor-not-allowed"
                )}
                style={{ left: `${markPercentage}%` }}
              >
                {mark.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Token Amount Input
// ============================================================================

interface TokenAmountInputProps {
  value: string;
  onChange: (value: string) => void;
  token?: string;
  tokenIcon?: React.ReactNode;
  balance?: string;
  onMax?: () => void;
  label?: string;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

export function TokenAmountInput({
  value,
  onChange,
  token = "SAGE",
  tokenIcon,
  balance,
  onMax,
  label,
  error,
  disabled = false,
  className,
  containerClassName,
}: TokenAmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      onChange(val);
    }
  };

  return (
    <div className={cn("space-y-2", containerClassName)}>
      {/* Label and Balance */}
      {(label || balance) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className={cn("text-sm font-medium text-gray-300", error && "text-red-400")}>
              {label}
            </label>
          )}
          {balance && (
            <span className="text-sm text-gray-500">
              Balance: <span className="text-gray-300">{balance}</span>
            </span>
          )}
        </div>
      )}

      {/* Input Container */}
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl",
          "bg-surface-elevated border transition-all duration-200",
          !error
            ? "border-surface-border focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20"
            : "border-red-500/50 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {/* Input */}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder="0.00"
          className={cn(
            "flex-1 bg-transparent border-none outline-none",
            "text-2xl font-semibold text-white placeholder:text-gray-600",
            "disabled:cursor-not-allowed"
          )}
        />

        {/* Token and Max */}
        <div className="flex items-center gap-2">
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              disabled={disabled}
              className={cn(
                "px-2 py-1 rounded-lg text-xs font-medium",
                "bg-brand-500/20 text-brand-400 hover:bg-brand-500/30",
                "transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              MAX
            </button>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-card">
            {tokenIcon}
            <span className="font-medium text-white">{token}</span>
          </div>
        </div>
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
// Percentage Slider Buttons
// ============================================================================

interface PercentageButtonsProps {
  value: number;
  onChange: (value: number) => void;
  percentages?: number[];
  disabled?: boolean;
  className?: string;
}

export function PercentageButtons({
  value,
  onChange,
  percentages = [25, 50, 75, 100],
  disabled = false,
  className,
}: PercentageButtonsProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      {percentages.map((pct) => (
        <button
          key={pct}
          type="button"
          onClick={() => onChange(pct)}
          disabled={disabled}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all",
            value === pct
              ? "bg-brand-500 text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white hover:bg-surface-card",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {pct}%
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Date/Time Input
// ============================================================================

interface DateTimeInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: Date | null;
  onChange: (date: Date | null) => void;
  type?: "date" | "datetime-local" | "time";
  label?: string;
  error?: string | null;
  helperText?: string;
  className?: string;
  containerClassName?: string;
}

export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  (
    {
      value,
      onChange,
      type = "datetime-local",
      label,
      error,
      helperText,
      className,
      containerClassName,
      ...props
    },
    ref
  ) => {
    const formatValue = (date: Date | null): string => {
      if (!date) return "";
      if (type === "date") return date.toISOString().split("T")[0];
      if (type === "time") return date.toTimeString().slice(0, 5);
      return date.toISOString().slice(0, 16);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) {
        onChange(null);
        return;
      }
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        onChange(date);
      }
    };

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {label && (
          <label className={cn("text-sm font-medium text-gray-300", error && "text-red-400")}>
            {label}
          </label>
        )}

        <input
          ref={ref}
          type={type}
          value={formatValue(value)}
          onChange={handleChange}
          className={cn(
            "w-full px-4 py-2.5 rounded-xl",
            "bg-surface-elevated border transition-all duration-200",
            "text-white",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            !error
              ? "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
              : "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
            "[color-scheme:dark]",
            className
          )}
          {...props}
        />

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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-gray-500"
            >
              {helperText}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

DateTimeInput.displayName = "DateTimeInput";
