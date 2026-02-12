"use client";

import { forwardRef, ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    const variants = {
      primary: "btn-glow",
      secondary: "btn-secondary",
      ghost: "bg-transparent hover:bg-surface-elevated text-gray-300 hover:text-white",
      danger: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20",
      success: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
    };

    const sizes = {
      sm: "text-xs px-3 py-1.5 rounded-lg",
      md: "text-sm px-4 py-2.5 rounded-xl",
      lg: "text-base px-6 py-3 rounded-xl",
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-2 focus:ring-offset-surface-dark",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className={cn(
              "animate-spin",
              size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4"
            )} />
            {loadingText || children}
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };

/**
 * Icon-only button variant
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  tooltip?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = "ghost", size = "md", isLoading, tooltip, className, ...props }, ref) => {
    const sizes = {
      sm: "p-1.5",
      md: "p-2",
      lg: "p-3",
    };

    const iconSizes = {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-6 h-6",
    };

    const variants = {
      primary: "bg-brand-600 hover:bg-brand-500 text-white",
      secondary: "bg-surface-elevated hover:bg-surface-card text-gray-300 hover:text-white border border-surface-border",
      ghost: "hover:bg-surface-elevated text-gray-400 hover:text-white",
    };

    return (
      <button
        ref={ref}
        title={tooltip}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-brand-500/50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className={cn("animate-spin", iconSizes[size])} />
        ) : (
          <span className={iconSizes[size]}>{icon}</span>
        )}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

/**
 * Button group for related actions
 */
export function ButtonGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-xl overflow-hidden", className)}>
      {children}
    </div>
  );
}

/**
 * Animated action button with ripple effect
 */
export function ActionButton({
  children,
  onClick,
  isLoading,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={isLoading || disabled}
      className={cn(
        "btn-glow inline-flex items-center justify-center gap-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : null}
      {children}
    </motion.button>
  );
}
