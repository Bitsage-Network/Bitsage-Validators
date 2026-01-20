"use client";

/**
 * Address Display Component
 *
 * Displays blockchain addresses with truncation, copy functionality,
 * and optional avatar/badge decorations.
 */

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  ExternalLink,
  User,
  Shield,
  Wallet,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressDisplayProps {
  /** Full address string */
  address: string;
  /** Number of characters to show at start */
  startChars?: number;
  /** Number of characters to show at end */
  endChars?: number;
  /** Show full address on hover */
  showFullOnHover?: boolean;
  /** Enable copy to clipboard */
  copyable?: boolean;
  /** External link URL (e.g., block explorer) */
  explorerUrl?: string;
  /** Address type for avatar/badge */
  type?: "user" | "contract" | "validator" | "wallet";
  /** Show avatar */
  showAvatar?: boolean;
  /** Custom label */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
}

export function AddressDisplay({
  address,
  startChars = 6,
  endChars = 4,
  showFullOnHover = true,
  copyable = true,
  explorerUrl,
  type,
  showAvatar = false,
  label,
  size = "md",
  className,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Truncate address
  const truncatedAddress = useMemo(() => {
    if (!address) return "";
    if (address.length <= startChars + endChars + 3) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
  }, [address, startChars, endChars]);

  // Handle copy
  const handleCopy = useCallback(async () => {
    if (!copyable || !address) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [address, copyable]);

  // Avatar icon based on type
  const AvatarIcon = useMemo(() => {
    switch (type) {
      case "user":
        return User;
      case "contract":
        return Server;
      case "validator":
        return Shield;
      case "wallet":
        return Wallet;
      default:
        return null;
    }
  }, [type]);

  // Generate avatar color from address
  const avatarColor = useMemo(() => {
    if (!address) return "bg-gray-500";
    const hash = address.slice(2, 8);
    const hue = parseInt(hash, 16) % 360;
    return `hsl(${hue}, 60%, 50%)`;
  }, [address]);

  // Size classes
  const sizeClasses = {
    sm: {
      container: "text-xs",
      avatar: "h-5 w-5",
      icon: "h-3 w-3",
    },
    md: {
      container: "text-sm",
      avatar: "h-6 w-6",
      icon: "h-3.5 w-3.5",
    },
    lg: {
      container: "text-base",
      avatar: "h-8 w-8",
      icon: "h-4 w-4",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 group",
        sizes.container,
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar */}
      {showAvatar && (
        <div
          className={cn(
            "rounded-full flex items-center justify-center",
            sizes.avatar
          )}
          style={{ backgroundColor: `${avatarColor}30` }}
        >
          {AvatarIcon ? (
            <AvatarIcon
              className={sizes.icon}
              style={{ color: avatarColor }}
            />
          ) : (
            <span
              className="text-xs font-bold"
              style={{ color: avatarColor }}
            >
              {address.slice(2, 4).toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Label */}
      {label && <span className="text-gray-400">{label}:</span>}

      {/* Address */}
      <div className="relative">
        <span className="font-mono text-gray-300 select-all">
          {showFullOnHover && isHovered ? address : truncatedAddress}
        </span>

        {/* Full address tooltip */}
        {showFullOnHover && !isHovered && (
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute left-0 bottom-full mb-2 z-50"
              >
                <div className="px-3 py-2 rounded-lg bg-gray-900 border border-white/10 shadow-xl">
                  <span className="font-mono text-xs text-white whitespace-nowrap">
                    {address}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Copy button */}
        {copyable && (
          <button
            onClick={handleCopy}
            className={cn(
              "p-1 rounded hover:bg-white/10 transition-colors",
              copied && "text-green-400"
            )}
            title={copied ? "Copied!" : "Copy address"}
          >
            {copied ? (
              <Check className={sizes.icon} />
            ) : (
              <Copy className={cn(sizes.icon, "text-gray-400")} />
            )}
          </button>
        )}

        {/* Explorer link */}
        {explorerUrl && (
          <a
            href={`${explorerUrl}${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="View in explorer"
          >
            <ExternalLink className={cn(sizes.icon, "text-gray-400")} />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Address Badge
 *
 * Compact address display as a badge.
 */
interface AddressBadgeProps {
  address: string;
  label?: string;
  variant?: "default" | "success" | "warning" | "error";
  copyable?: boolean;
  className?: string;
}

export function AddressBadge({
  address,
  label,
  variant = "default",
  copyable = true,
  className,
}: AddressBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyable) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const variantClasses = {
    default: "bg-white/5 border-white/10 text-gray-300",
    success: "bg-green-500/10 border-green-500/20 text-green-400",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    error: "bg-red-500/10 border-red-500/20 text-red-400",
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!copyable}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full border",
        "text-xs font-mono transition-all",
        copyable && "hover:bg-white/10 cursor-pointer",
        variantClasses[variant],
        className
      )}
      title={copyable ? (copied ? "Copied!" : "Click to copy") : undefined}
    >
      {label && <span className="text-gray-500 font-sans">{label}</span>}
      <span>
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
      {copyable && (
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="h-3 w-3 text-green-400" />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Copy className="h-3 w-3 opacity-50" />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </button>
  );
}

/**
 * Address List
 *
 * Display multiple addresses in a list format.
 */
interface AddressListProps {
  addresses: {
    address: string;
    label?: string;
    type?: "user" | "contract" | "validator" | "wallet";
    balance?: string;
  }[];
  explorerUrl?: string;
  onSelect?: (address: string) => void;
  selectedAddress?: string;
  className?: string;
}

export function AddressList({
  addresses,
  explorerUrl,
  onSelect,
  selectedAddress,
  className,
}: AddressListProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {addresses.map((item, i) => (
        <div
          key={i}
          onClick={() => onSelect?.(item.address)}
          className={cn(
            "flex items-center justify-between p-2 rounded-lg",
            "border border-transparent transition-colors",
            onSelect && "cursor-pointer hover:bg-white/5",
            selectedAddress === item.address && "bg-white/5 border-white/10"
          )}
        >
          <AddressDisplay
            address={item.address}
            label={item.label}
            type={item.type}
            showAvatar
            explorerUrl={explorerUrl}
            size="sm"
          />
          {item.balance && (
            <span className="text-sm text-gray-400">{item.balance}</span>
          )}
        </div>
      ))}
    </div>
  );
}
