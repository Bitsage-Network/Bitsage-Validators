"use client";

import { useState, forwardRef, HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { User, Users, Crown, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type StatusType = "online" | "offline" | "busy" | "away" | "dnd";
type BadgeType = "verified" | "premium" | "admin" | "validator" | "prover";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: StatusType;
  badge?: BadgeType;
  showFallback?: boolean;
  bordered?: boolean;
  className?: string;
}

// ============================================================================
// Size Configurations
// ============================================================================

const sizeConfig = {
  xs: {
    container: "w-6 h-6",
    text: "text-xs",
    status: "w-2 h-2 border",
    badge: "w-3 h-3",
    badgeIcon: "w-2 h-2",
    badgeOffset: "-right-0.5 -bottom-0.5",
  },
  sm: {
    container: "w-8 h-8",
    text: "text-sm",
    status: "w-2.5 h-2.5 border-2",
    badge: "w-4 h-4",
    badgeIcon: "w-2.5 h-2.5",
    badgeOffset: "-right-0.5 -bottom-0.5",
  },
  md: {
    container: "w-10 h-10",
    text: "text-base",
    status: "w-3 h-3 border-2",
    badge: "w-5 h-5",
    badgeIcon: "w-3 h-3",
    badgeOffset: "-right-1 -bottom-1",
  },
  lg: {
    container: "w-12 h-12",
    text: "text-lg",
    status: "w-3.5 h-3.5 border-2",
    badge: "w-5 h-5",
    badgeIcon: "w-3 h-3",
    badgeOffset: "-right-1 -bottom-1",
  },
  xl: {
    container: "w-16 h-16",
    text: "text-xl",
    status: "w-4 h-4 border-2",
    badge: "w-6 h-6",
    badgeIcon: "w-3.5 h-3.5",
    badgeOffset: "-right-1 -bottom-1",
  },
  "2xl": {
    container: "w-24 h-24",
    text: "text-3xl",
    status: "w-5 h-5 border-[3px]",
    badge: "w-7 h-7",
    badgeIcon: "w-4 h-4",
    badgeOffset: "-right-1 -bottom-1",
  },
};

const statusColors = {
  online: "bg-emerald-500",
  offline: "bg-gray-500",
  busy: "bg-red-500",
  away: "bg-amber-500",
  dnd: "bg-red-600",
};

const badgeConfig: Record<BadgeType, { bg: string; icon: typeof Check }> = {
  verified: { bg: "bg-blue-500", icon: Check },
  premium: { bg: "bg-amber-500", icon: Crown },
  admin: { bg: "bg-red-500", icon: Shield },
  validator: { bg: "bg-brand-500", icon: Zap },
  prover: { bg: "bg-purple-500", icon: Zap },
};

// ============================================================================
// Helper: Get initials from name
// ============================================================================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ============================================================================
// Helper: Generate consistent color from string
// ============================================================================

function stringToColor(str: string): string {
  const colors = [
    "from-brand-500 to-brand-600",
    "from-purple-500 to-purple-600",
    "from-blue-500 to-blue-600",
    "from-cyan-500 to-cyan-600",
    "from-teal-500 to-teal-600",
    "from-emerald-500 to-emerald-600",
    "from-orange-500 to-orange-600",
    "from-pink-500 to-pink-600",
    "from-rose-500 to-rose-600",
    "from-indigo-500 to-indigo-600",
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ============================================================================
// Avatar Component
// ============================================================================

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      src,
      alt = "",
      name,
      size = "md",
      status,
      badge,
      showFallback = true,
      bordered = false,
      className,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = useState(false);
    const config = sizeConfig[size];
    const showImage = src && !imageError;
    const displayName = name || alt;

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex flex-shrink-0", className)}
        {...props}
      >
        {/* Main Avatar */}
        <div
          className={cn(
            "rounded-full overflow-hidden flex items-center justify-center",
            config.container,
            bordered && "ring-2 ring-surface-border ring-offset-2 ring-offset-surface-base",
            !showImage && displayName && `bg-gradient-to-br ${stringToColor(displayName)}`
          )}
        >
          {showImage ? (
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : displayName && showFallback ? (
            <span className={cn("font-medium text-white", config.text)}>
              {getInitials(displayName)}
            </span>
          ) : (
            <div className="w-full h-full bg-surface-elevated flex items-center justify-center">
              <User className={cn("text-gray-500", config.text)} />
            </div>
          )}
        </div>

        {/* Status Indicator */}
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 rounded-full border-surface-base",
              config.status,
              statusColors[status]
            )}
          />
        )}

        {/* Badge */}
        {badge && !status && (
          <span
            className={cn(
              "absolute rounded-full flex items-center justify-center",
              config.badge,
              config.badgeOffset,
              badgeConfig[badge].bg
            )}
          >
            {(() => {
              const Icon = badgeConfig[badge].icon;
              return <Icon className={cn("text-white", config.badgeIcon)} />;
            })()}
          </span>
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

// ============================================================================
// Avatar Group
// ============================================================================

interface AvatarGroupProps {
  avatars: Array<{
    src?: string;
    name?: string;
    alt?: string;
  }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = "md",
  className,
}: AvatarGroupProps) {
  const config = sizeConfig[size];
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  const overlapMap: Record<AvatarSize, string> = {
    xs: "-ml-1.5",
    sm: "-ml-2",
    md: "-ml-2.5",
    lg: "-ml-3",
    xl: "-ml-4",
    "2xl": "-ml-6",
  };

  return (
    <div className={cn("flex items-center", className)}>
      {visibleAvatars.map((avatar, index) => (
        <div
          key={index}
          className={cn(
            "relative",
            index > 0 && overlapMap[size],
            "ring-2 ring-surface-base rounded-full"
          )}
          style={{ zIndex: visibleAvatars.length - index }}
        >
          <Avatar
            src={avatar.src}
            name={avatar.name}
            alt={avatar.alt}
            size={size}
          />
        </div>
      ))}

      {remainingCount > 0 && (
        <div
          className={cn(
            "relative rounded-full flex items-center justify-center",
            "bg-surface-elevated border-2 border-surface-base",
            config.container,
            overlapMap[size]
          )}
          style={{ zIndex: 0 }}
        >
          <span className={cn("text-gray-400 font-medium", size === "xs" ? "text-[10px]" : "text-xs")}>
            +{remainingCount}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Avatar with Info
// ============================================================================

interface AvatarWithInfoProps {
  src?: string;
  name: string;
  subtitle?: string;
  size?: AvatarSize;
  status?: StatusType;
  badge?: BadgeType;
  action?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function AvatarWithInfo({
  src,
  name,
  subtitle,
  size = "md",
  status,
  badge,
  action,
  className,
  onClick,
}: AvatarWithInfoProps) {
  const textSizes: Record<AvatarSize, { name: string; subtitle: string }> = {
    xs: { name: "text-xs", subtitle: "text-[10px]" },
    sm: { name: "text-sm", subtitle: "text-xs" },
    md: { name: "text-sm", subtitle: "text-xs" },
    lg: { name: "text-base", subtitle: "text-sm" },
    xl: { name: "text-lg", subtitle: "text-base" },
    "2xl": { name: "text-xl", subtitle: "text-lg" },
  };

  const Component = onClick ? motion.button : "div";

  return (
    <Component
      className={cn(
        "flex items-center gap-3",
        onClick && "hover:bg-white/5 rounded-xl p-2 -m-2 transition-colors cursor-pointer",
        className
      )}
      onClick={onClick}
      {...(onClick && { whileTap: { scale: 0.98 } })}
    >
      <Avatar
        src={src}
        name={name}
        size={size}
        status={status}
        badge={badge}
      />
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium text-white truncate", textSizes[size].name)}>
          {name}
        </p>
        {subtitle && (
          <p className={cn("text-gray-400 truncate", textSizes[size].subtitle)}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </Component>
  );
}

// ============================================================================
// Starknet Address Avatar
// ============================================================================

interface AddressAvatarProps {
  address: string;
  size?: AvatarSize;
  showAddress?: boolean;
  truncate?: boolean;
  status?: StatusType;
  className?: string;
}

export function AddressAvatar({
  address,
  size = "md",
  showAddress = false,
  truncate = true,
  status,
  className,
}: AddressAvatarProps) {
  const displayAddress = truncate
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  // Generate a color based on address
  const colorIndex = parseInt(address.slice(2, 8), 16) % 10;
  const colors = [
    "from-brand-400 to-brand-600",
    "from-purple-400 to-purple-600",
    "from-blue-400 to-blue-600",
    "from-cyan-400 to-cyan-600",
    "from-teal-400 to-teal-600",
    "from-emerald-400 to-emerald-600",
    "from-orange-400 to-orange-600",
    "from-pink-400 to-pink-600",
    "from-rose-400 to-rose-600",
    "from-indigo-400 to-indigo-600",
  ];

  const config = sizeConfig[size];

  if (showAddress) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div
          className={cn(
            "rounded-full bg-gradient-to-br flex items-center justify-center relative",
            config.container,
            colors[colorIndex]
          )}
        >
          {/* Blockie-style pattern */}
          <div className="absolute inset-1 rounded-full overflow-hidden opacity-30">
            <div className="grid grid-cols-3 gap-px w-full h-full">
              {Array.from({ length: 9 }).map((_, i) => {
                const char = address.charCodeAt((i * 7) % address.length);
                return (
                  <div
                    key={i}
                    className={char % 2 === 0 ? "bg-white" : "bg-black/50"}
                  />
                );
              })}
            </div>
          </div>
          {status && (
            <span
              className={cn(
                "absolute bottom-0 right-0 rounded-full border-surface-base",
                sizeConfig[size].status,
                statusColors[status]
              )}
            />
          )}
        </div>
        <span className="font-mono text-sm text-gray-300">{displayAddress}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center relative",
        config.container,
        colors[colorIndex],
        className
      )}
    >
      <div className="absolute inset-1 rounded-full overflow-hidden opacity-30">
        <div className="grid grid-cols-3 gap-px w-full h-full">
          {Array.from({ length: 9 }).map((_, i) => {
            const char = address.charCodeAt((i * 7) % address.length);
            return (
              <div
                key={i}
                className={char % 2 === 0 ? "bg-white" : "bg-black/50"}
              />
            );
          })}
        </div>
      </div>
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-surface-base",
            sizeConfig[size].status,
            statusColors[status]
          )}
        />
      )}
    </div>
  );
}

// ============================================================================
// Presence Avatar (for real-time status)
// ============================================================================

interface PresenceAvatarProps extends AvatarProps {
  isTyping?: boolean;
  lastSeen?: Date;
}

export function PresenceAvatar({
  isTyping,
  lastSeen,
  status: propStatus,
  ...props
}: PresenceAvatarProps) {
  // Determine status from lastSeen if not provided
  let status: StatusType | undefined = propStatus;

  if (!status && lastSeen) {
    const minutesAgo = (Date.now() - lastSeen.getTime()) / 60000;
    if (minutesAgo < 5) status = "online";
    else if (minutesAgo < 30) status = "away";
    else status = "offline";
  }

  return (
    <div className="relative inline-flex">
      <Avatar {...props} status={status} />
      {isTyping && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5 bg-surface-card rounded-full px-1.5 py-0.5 border border-surface-border"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full bg-gray-400"
              animate={{ y: [0, -2, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.1,
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Validator Avatar (specialized for validators/provers)
// ============================================================================

interface ValidatorAvatarProps {
  address: string;
  name?: string;
  isActive?: boolean;
  reputation?: number; // 0-100
  size?: AvatarSize;
  className?: string;
}

export function ValidatorAvatar({
  address,
  name,
  isActive = true,
  reputation,
  size = "md",
  className,
}: ValidatorAvatarProps) {
  const config = sizeConfig[size];

  // Reputation ring color
  const getReputationColor = (rep: number) => {
    if (rep >= 90) return "stroke-emerald-500";
    if (rep >= 70) return "stroke-brand-500";
    if (rep >= 50) return "stroke-amber-500";
    return "stroke-red-500";
  };

  const containerSizeMap: Record<AvatarSize, number> = {
    xs: 28,
    sm: 36,
    md: 44,
    lg: 52,
    xl: 68,
    "2xl": 100,
  };

  const containerSize = containerSizeMap[size];
  const strokeWidth = size === "xs" || size === "sm" ? 2 : 3;
  const radius = (containerSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("relative inline-flex", className)}>
      {/* Reputation ring */}
      {reputation !== undefined && (
        <svg
          width={containerSize}
          height={containerSize}
          className="absolute -inset-0.5 -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface-border"
          />
          {/* Progress ring */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={getReputationColor(reputation)}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - reputation / 100)}
          />
        </svg>
      )}

      <AddressAvatar
        address={address}
        size={size}
        status={isActive ? "online" : "offline"}
      />

      {/* Validator badge */}
      <span
        className={cn(
          "absolute rounded-full flex items-center justify-center bg-brand-500",
          config.badge,
          config.badgeOffset
        )}
      >
        <Zap className={cn("text-white", config.badgeIcon)} />
      </span>
    </div>
  );
}

// ============================================================================
// Team/Group Avatar
// ============================================================================

interface TeamAvatarProps {
  name: string;
  memberCount?: number;
  size?: AvatarSize;
  className?: string;
}

export function TeamAvatar({
  name,
  memberCount,
  size = "md",
  className,
}: TeamAvatarProps) {
  const config = sizeConfig[size];

  return (
    <div className={cn("relative inline-flex", className)}>
      <div
        className={cn(
          "rounded-xl bg-gradient-to-br flex items-center justify-center",
          config.container,
          stringToColor(name)
        )}
      >
        <Users className={cn("text-white", config.text)} />
      </div>
      {memberCount !== undefined && (
        <span
          className={cn(
            "absolute -top-1 -right-1 min-w-[1.25rem] h-5 rounded-full",
            "bg-surface-elevated border border-surface-border",
            "flex items-center justify-center text-[10px] font-medium text-gray-300 px-1"
          )}
        >
          {memberCount > 99 ? "99+" : memberCount}
        </span>
      )}
    </div>
  );
}
