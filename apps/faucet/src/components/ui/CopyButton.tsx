"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline";
  showText?: boolean;
  successText?: string;
  onCopy?: () => void;
}

/**
 * Standalone copy button with visual feedback
 */
export function CopyButton({
  text,
  className,
  size = "md",
  variant = "ghost",
  showText = false,
  successText = "Copied!",
  onCopy,
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard({
    successDuration: 2000,
    onSuccess: onCopy,
  });

  const sizes = {
    sm: "p-1",
    md: "p-1.5",
    lg: "p-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const variants = {
    ghost: "hover:bg-surface-elevated",
    outline: "border border-surface-border hover:border-brand-500/50",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => copy(text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg transition-colors",
        "text-gray-400 hover:text-white",
        sizes[size],
        variants[variant],
        className
      )}
      title={copied ? successText : "Copy to clipboard"}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="text-emerald-400"
          >
            <Check className={iconSizes[size]} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Copy className={iconSizes[size]} />
          </motion.span>
        )}
      </AnimatePresence>
      {showText && (
        <span className="text-xs">
          {copied ? successText : "Copy"}
        </span>
      )}
    </motion.button>
  );
}

interface CopyableTextProps {
  text: string;
  displayText?: string;
  truncate?: boolean;
  maxLength?: number;
  className?: string;
  textClassName?: string;
  showFullOnHover?: boolean;
}

/**
 * Text with inline copy button
 */
export function CopyableText({
  text,
  displayText,
  truncate = true,
  maxLength = 20,
  className,
  textClassName,
  showFullOnHover = false,
}: CopyableTextProps) {
  const { copied, copy } = useCopyToClipboard({ successDuration: 2000 });
  const [isHovered, setIsHovered] = useState(false);

  const display = displayText || text;
  const truncatedDisplay = truncate && display.length > maxLength
    ? `${display.slice(0, maxLength / 2)}...${display.slice(-maxLength / 2)}`
    : display;

  return (
    <div
      className={cn("group inline-flex items-center gap-2", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <code
        className={cn(
          "font-mono text-sm",
          textClassName
        )}
        title={showFullOnHover ? text : undefined}
      >
        {showFullOnHover && isHovered ? text : truncatedDisplay}
      </code>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => copy(text)}
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "p-1 rounded hover:bg-surface-elevated"
        )}
      >
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="w-3 h-3 text-emerald-400" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Copy className="w-3 h-3 text-gray-500 hover:text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

interface CopyableAddressProps {
  address: string;
  showFull?: boolean;
  className?: string;
}

/**
 * Formatted address with copy functionality
 */
export function CopyableAddress({
  address,
  showFull = false,
  className,
}: CopyableAddressProps) {
  const { copied, copy } = useCopyToClipboard({ successDuration: 2000 });

  const formatAddress = (addr: string) => {
    if (showFull) return addr;
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <button
      onClick={() => copy(address)}
      className={cn(
        "inline-flex items-center gap-2 px-2 py-1 rounded-lg",
        "font-mono text-sm text-gray-300 hover:text-white",
        "bg-surface-elevated hover:bg-surface-card border border-surface-border",
        "transition-colors group",
        className
      )}
      title={address}
    >
      <span>{formatAddress(address)}</span>
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Check className="w-3 h-3 text-emerald-400" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Copy className="w-3 h-3 text-gray-500" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

interface CopyableHashProps {
  hash: string;
  type?: "tx" | "block" | "address" | "proof";
  explorerUrl?: string;
  className?: string;
}

/**
 * Hash display with copy and explorer link
 */
export function CopyableHash({
  hash,
  type = "tx",
  explorerUrl,
  className,
}: CopyableHashProps) {
  const { copied, copy } = useCopyToClipboard({ successDuration: 2000 });

  const getExplorerUrl = () => {
    if (explorerUrl) return explorerUrl;
    const base = "https://sepolia.starkscan.co";
    switch (type) {
      case "tx":
        return `${base}/tx/${hash}`;
      case "block":
        return `${base}/block/${hash}`;
      case "address":
        return `${base}/contract/${hash}`;
      case "proof":
        return `/proofs/${hash}`;
      default:
        return `${base}/tx/${hash}`;
    }
  };

  const formatHash = () => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <a
        href={getExplorerUrl()}
        target={type === "proof" ? "_self" : "_blank"}
        rel="noopener noreferrer"
        className="font-mono text-sm text-brand-400 hover:text-brand-300 hover:underline"
      >
        {formatHash()}
      </a>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => copy(hash)}
        className="p-1 rounded hover:bg-surface-elevated transition-colors"
        title={copied ? "Copied!" : "Copy hash"}
      >
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="w-3 h-3 text-emerald-400" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Copy className="w-3 h-3 text-gray-500 hover:text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
