"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Progress Bar
// ============================================================================

interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "brand" | "success" | "warning" | "error";
  animated?: boolean;
  striped?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  label,
  size = "md",
  variant = "brand",
  animated = true,
  striped = false,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizes = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  };

  const variants = {
    default: "bg-gray-500",
    brand: "bg-gradient-to-r from-brand-600 to-brand-400",
    success: "bg-gradient-to-r from-emerald-600 to-emerald-400",
    warning: "bg-gradient-to-r from-orange-600 to-orange-400",
    error: "bg-gradient-to-r from-red-600 to-red-400",
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">{label}</span>
          {showLabel && (
            <span className="font-medium text-white">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div className={cn("w-full rounded-full bg-surface-elevated overflow-hidden", sizes[size])}>
        <motion.div
          className={cn(
            "h-full rounded-full",
            variants[variant],
            striped && "bg-stripes",
            animated && striped && "animate-stripes"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Circular Progress
// ============================================================================

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  variant?: "default" | "brand" | "success" | "warning" | "error";
  className?: string;
  children?: ReactNode;
}

export function CircularProgress({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  showValue = true,
  variant = "brand",
  className,
  children,
}: CircularProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const colors = {
    default: "stroke-gray-500",
    brand: "stroke-brand-500",
    success: "stroke-emerald-500",
    warning: "stroke-orange-500",
    error: "stroke-red-500",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-elevated"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={colors[variant]}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (showValue && (
          <span className="text-lg font-bold text-white">{Math.round(percentage)}%</span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Stepper
// ============================================================================

interface Step {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  variant?: "dots" | "numbers" | "icons";
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  orientation = "horizontal",
  size = "md",
  variant = "numbers",
  className,
}: StepperProps) {
  const isHorizontal = orientation === "horizontal";

  const sizes = {
    sm: { circle: "w-8 h-8", text: "text-xs", icon: "w-4 h-4" },
    md: { circle: "w-10 h-10", text: "text-sm", icon: "w-5 h-5" },
    lg: { circle: "w-12 h-12", text: "text-base", icon: "w-6 h-6" },
  };

  const getStepStatus = (index: number) => {
    if (index < currentStep) return "completed";
    if (index === currentStep) return "current";
    return "upcoming";
  };

  return (
    <div
      className={cn(
        "flex",
        isHorizontal ? "flex-row items-start" : "flex-col",
        className
      )}
    >
      {steps.map((step, index) => {
        const status = getStepStatus(index);
        const isLast = index === steps.length - 1;

        return (
          <div
            key={step.id}
            className={cn(
              "flex",
              isHorizontal ? "flex-col items-center flex-1" : "flex-row items-start"
            )}
          >
            <div
              className={cn(
                "flex items-center",
                isHorizontal ? "flex-col" : "flex-row gap-4"
              )}
            >
              {/* Step Circle */}
              <div className="relative">
                <motion.div
                  initial={false}
                  animate={{
                    scale: status === "current" ? 1.1 : 1,
                    backgroundColor:
                      status === "completed"
                        ? "rgb(16, 185, 129)"
                        : status === "current"
                        ? "rgb(99, 102, 241)"
                        : "transparent",
                  }}
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 transition-colors",
                    sizes[size].circle,
                    status === "completed" && "border-emerald-500 bg-emerald-500",
                    status === "current" && "border-brand-500 bg-brand-500",
                    status === "upcoming" && "border-gray-600 bg-transparent"
                  )}
                >
                  {status === "completed" ? (
                    <Check className={cn(sizes[size].icon, "text-white")} />
                  ) : variant === "dots" ? (
                    <Circle
                      className={cn(
                        sizes[size].icon,
                        status === "current" ? "text-white fill-white" : "text-gray-600"
                      )}
                    />
                  ) : variant === "icons" && step.icon ? (
                    <span className={status === "current" ? "text-white" : "text-gray-500"}>
                      {step.icon}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "font-semibold",
                        sizes[size].text,
                        status === "current" ? "text-white" : "text-gray-500"
                      )}
                    >
                      {index + 1}
                    </span>
                  )}
                </motion.div>

                {/* Pulse animation for current step */}
                {status === "current" && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-brand-500"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                )}
              </div>

              {/* Step Label and Description */}
              <div
                className={cn(
                  isHorizontal ? "mt-3 text-center" : "flex-1",
                  "min-w-0"
                )}
              >
                <p
                  className={cn(
                    "font-medium truncate",
                    sizes[size].text,
                    status === "completed" && "text-emerald-400",
                    status === "current" && "text-white",
                    status === "upcoming" && "text-gray-500"
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {step.description}
                  </p>
                )}
              </div>
            </div>

            {/* Connector Line */}
            {!isLast && (
              <div
                className={cn(
                  isHorizontal
                    ? "flex-1 h-0.5 mt-5 mx-2"
                    : "w-0.5 ml-5 my-2 min-h-[24px]",
                  "bg-surface-border"
                )}
              >
                <motion.div
                  className={cn(
                    isHorizontal ? "h-full" : "w-full",
                    "bg-emerald-500"
                  )}
                  initial={{ width: isHorizontal ? 0 : "100%", height: isHorizontal ? "100%" : 0 }}
                  animate={{
                    width: isHorizontal
                      ? currentStep > index
                        ? "100%"
                        : "0%"
                      : "100%",
                    height: isHorizontal
                      ? "100%"
                      : currentStep > index
                      ? "100%"
                      : "0%",
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Step Wizard
// ============================================================================

interface StepWizardProps {
  steps: Step[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  allowClickNavigation?: boolean;
  showProgress?: boolean;
  className?: string;
}

export function StepWizard({
  steps,
  currentStep,
  onStepChange,
  allowClickNavigation = false,
  showProgress = true,
  className,
}: StepWizardProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleStepClick = (index: number) => {
    if (allowClickNavigation && index < currentStep && onStepChange) {
      onStepChange(index);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Progress bar */}
      {showProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-brand-400 font-medium">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} animated />
        </div>
      )}

      {/* Steps */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = allowClickNavigation && isCompleted;

          return (
            <button
              key={step.id}
              onClick={() => handleStepClick(index)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-all shrink-0",
                "disabled:cursor-default",
                isCompleted && "bg-emerald-500/20 text-emerald-400",
                isCurrent && "bg-brand-500/20 text-brand-400 ring-2 ring-brand-500/50",
                !isCompleted && !isCurrent && "bg-surface-elevated text-gray-500",
                isClickable && "hover:bg-emerald-500/30 cursor-pointer"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                  isCompleted && "bg-emerald-500 text-white",
                  isCurrent && "bg-brand-500 text-white",
                  !isCompleted && !isCurrent && "bg-surface-card text-gray-500"
                )}
              >
                {isCompleted ? <Check className="w-3 h-3" /> : index + 1}
              </span>
              <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Loading Progress (Indeterminate)
// ============================================================================

interface LoadingProgressProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "bar" | "dots" | "spinner";
  className?: string;
}

export function LoadingProgress({
  label,
  size = "md",
  variant = "bar",
  className,
}: LoadingProgressProps) {
  const sizes = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  if (variant === "spinner") {
    const spinnerSizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" };
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Loader2 className={cn("animate-spin text-brand-400", spinnerSizes[size])} />
        {label && <span className="text-sm text-gray-400">{label}</span>}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-brand-400"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        {label && <span className="text-sm text-gray-400">{label}</span>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && <span className="text-sm text-gray-400">{label}</span>}
      <div className={cn("w-full rounded-full bg-surface-elevated overflow-hidden", sizes[size])}>
        <motion.div
          className="h-full w-1/3 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600 rounded-full"
          animate={{ x: ["-100%", "300%"] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Upload Progress
// ============================================================================

interface UploadProgressProps {
  fileName: string;
  progress: number;
  status: "uploading" | "completed" | "error" | "paused";
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function UploadProgress({
  fileName,
  progress,
  status,
  onCancel,
  onRetry,
  className,
}: UploadProgressProps) {
  const statusConfig = {
    uploading: { color: "brand", label: `${Math.round(progress)}%` },
    completed: { color: "success", label: "Complete" },
    error: { color: "error", label: "Failed" },
    paused: { color: "warning", label: "Paused" },
  };

  const config = statusConfig[status];

  return (
    <div className={cn("p-4 rounded-xl bg-surface-elevated border border-surface-border", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white truncate flex-1 mr-4">
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium",
              config.color === "brand" && "text-brand-400",
              config.color === "success" && "text-emerald-400",
              config.color === "error" && "text-red-400",
              config.color === "warning" && "text-orange-400"
            )}
          >
            {config.label}
          </span>
          {status === "uploading" && onCancel && (
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <span className="sr-only">Cancel</span>
              ×
            </button>
          )}
          {status === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-brand-400 hover:text-brand-300"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      <ProgressBar
        value={status === "completed" ? 100 : progress}
        variant={config.color as "brand" | "success" | "warning" | "error"}
        size="sm"
      />
    </div>
  );
}
