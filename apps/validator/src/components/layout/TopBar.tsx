"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useDisconnect } from "@starknet-react/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets,
  Globe,
  BookOpen,
  Settings,
  Briefcase,
  LogOut,
  ChevronDown,
  Wallet,
  Zap,
  TrendingUp,
  Send,
  Menu,
  Coins,
} from "lucide-react";
import { AddSageButton } from "@/components/token/AddSageButton";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { address, status } = useAccount();
  const { disconnect } = useDisconnect();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const isConnected = status === "connected";

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleDisconnect = () => {
    disconnect();
    setShowProfileMenu(false);
  };

  const isWorkloadsActive = pathname === "/workloads";

  return (
    <div className="h-14 bg-surface-card border-b border-surface-border flex items-center justify-between px-4 sticky top-0 z-30">
      {/* Left side - Mobile Menu Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-elevated transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Workloads Button (Dot Grid) - Hidden on smallest screens */}
        <Link
          href="/workloads"
          className={cn(
            "hidden sm:block p-2.5 rounded-lg transition-all",
            isWorkloadsActive
              ? "bg-emerald-600/20 text-emerald-400"
              : "hover:bg-surface-elevated text-gray-400 hover:text-white"
          )}
          title="Deploy Workloads"
        >
          <div className="grid grid-cols-3 gap-1">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors",
                  isWorkloadsActive ? "bg-emerald-400" : "bg-current"
                )}
              />
            ))}
          </div>
        </Link>

        {/* Divider - Hidden on smallest screens */}
        <div className="hidden sm:block w-px h-6 bg-surface-border mx-1" />

        {/* Send - Always visible */}
        <Link
          href="/send"
          className={cn(
            "p-2.5 rounded-lg transition-colors",
            pathname === "/send"
              ? "bg-emerald-500/20 text-emerald-400"
              : "hover:bg-surface-elevated text-gray-400 hover:text-emerald-400"
          )}
          title="Send SAGE"
        >
          <Send className="w-5 h-5" />
        </Link>

        {/* Faucet - Hidden on mobile */}
        <Link
          href="/faucet"
          className={cn(
            "hidden md:block p-2.5 rounded-lg transition-colors",
            pathname === "/faucet"
              ? "bg-cyan-500/20 text-cyan-400"
              : "hover:bg-surface-elevated text-gray-400 hover:text-cyan-400"
          )}
          title="Faucet"
        >
          <Droplets className="w-5 h-5" />
        </Link>

        {/* Network - Hidden on mobile */}
        <Link
          href="/network"
          className={cn(
            "hidden md:block p-2.5 rounded-lg transition-colors",
            pathname === "/network"
              ? "bg-emerald-500/20 text-emerald-400"
              : "hover:bg-surface-elevated text-gray-400 hover:text-emerald-400"
          )}
          title="Network"
        >
          <Globe className="w-5 h-5" />
        </Link>

        {/* Docs - Hidden on mobile */}
        <Link
          href="/docs"
          className={cn(
            "hidden md:block p-2.5 rounded-lg transition-colors",
            pathname === "/docs"
              ? "bg-orange-500/20 text-orange-400"
              : "hover:bg-surface-elevated text-gray-400 hover:text-orange-400"
          )}
          title="Documentation"
        >
          <BookOpen className="w-5 h-5" />
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-surface-border mx-1" />

        {/* Connect / Profile */}
        {isConnected ? (
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
                showProfileMenu
                  ? "bg-surface-elevated"
                  : "hover:bg-surface-elevated"
              )}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-violet-500"
              >
                <span className="text-xs font-bold text-white">
                  {address ? address.slice(2, 4).toUpperCase() : "?"}
                </span>
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-white">
                  {address ? formatAddress(address) : "Connected"}
                </p>
                <p className="text-xs text-emerald-400">
                  Validator
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-gray-400 transition-transform",
                  showProfileMenu && "rotate-180"
                )}
              />
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden"
                >
                  {/* Profile Header */}
                  <div className="p-3 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-violet-500"
                      >
                        <span className="text-sm font-bold text-white">
                          {address ? address.slice(2, 4).toUpperCase() : "?"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {address ? formatAddress(address) : "Connected"}
                        </p>
                        <p className="text-xs text-emerald-400">
                          ● Active Validator
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-2">
                    <Link
                      href="/jobs"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors text-gray-300 hover:text-white"
                    >
                      <Briefcase className="w-4 h-4" />
                      <span className="text-sm">My Jobs</span>
                    </Link>
                    <Link
                      href="/earnings"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors text-gray-300 hover:text-white"
                    >
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm">Earnings</span>
                    </Link>

                    <div className="px-1">
                      <AddSageButton variant="compact" className="w-full justify-start px-3 py-2 rounded-lg" />
                    </div>

                    <Link
                      href="/settings"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors text-gray-300 hover:text-white"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-sm">Settings</span>
                    </Link>
                  </div>

                  {/* Disconnect */}
                  <div className="p-2 border-t border-surface-border">
                    <button
                      onClick={handleDisconnect}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg w-full transition-colors text-red-400 hover:bg-red-500/10"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm">Disconnect</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Link
            href="/connect"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <Wallet className="w-4 h-4" />
            Connect
          </Link>
        )}
      </div>
    </div>
  );
}
