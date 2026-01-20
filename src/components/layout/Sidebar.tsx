"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Coins,
  ArrowUpDown,
  Server,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Briefcase,
  Shield,
  Send,
  Wallet,
  X,
  Vote,
  TrendingUp,
  Droplets,
} from "lucide-react";
import { LogoIcon } from "@/components/ui/Logo";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "GPU overview & status",
  },
  {
    title: "Obelysk Wallet",
    href: "/wallet",
    icon: Wallet,
    description: "Privacy-first GPU earnings",
  },
  {
    title: "Send",
    href: "/send",
    icon: Send,
    description: "Public or private transfer",
  },
  {
    title: "Get SAGE",
    href: "/trade",
    icon: ArrowUpDown,
    description: "Buy & sell SAGE tokens",
  },
  {
    title: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    description: "History & analytics",
  },
  {
    title: "Proofs",
    href: "/proofs",
    icon: Shield,
    description: "STWO validation",
  },
  {
    title: "Stake SAGE",
    href: "/stake",
    icon: Coins,
    description: "Stake to validate",
  },
  {
    title: "Earnings",
    href: "/earnings",
    icon: TrendingUp,
    description: "Claim rewards & analytics",
  },
  {
    title: "Governance",
    href: "/governance",
    icon: Vote,
    description: "Vote on proposals",
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: collapsed ? 80 : 280,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={cn(
          "fixed left-0 top-0 h-screen bg-surface-card border-r border-surface-border z-50 flex flex-col",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-surface-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
            <LogoIcon className="text-brand-400" size={36} />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <span className="font-bold text-white text-lg">BitSage</span>
                <span className="block text-xs text-brand-400">Validator Network</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
        {/* Mobile Close Button */}
        <button
          onClick={onMobileClose}
          className="lg:hidden p-2 rounded-lg hover:bg-surface-elevated transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggle}
          className="hidden lg:block p-2 rounded-lg hover:bg-surface-elevated transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>

      {/* Network Status Banner */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mt-3 p-3 rounded-xl bg-brand-600/10 border border-brand-500/20"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Starknet Sepolia</span>
            </div>
            <p className="text-xs text-gray-400">24 Active Validators</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "nav-item group",
                isActive && "active",
                collapsed && "justify-center px-3"
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-brand-400")} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1"
                  >
                    <span className="block">{item.title}</span>
                    <span className="text-xs text-gray-500 group-hover:text-gray-400">
                      {item.description}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          );
        })}

        {/* CLI Guide CTA */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 p-4 rounded-xl bg-gradient-to-br from-brand-600/20 to-accent-purple/20 border border-brand-500/20"
            >
              <Server className="w-5 h-5 text-brand-400 mb-2" />
              <p className="text-sm font-medium text-white mb-1">Run a Validator</p>
              <p className="text-xs text-gray-400 mb-3">
                Join the network with your GPU via CLI
              </p>
              <Link
                href="/docs"
                onClick={onMobileClose}
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
              >
                View Setup Guide <ExternalLink className="w-3 h-3" />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Collapsed indicator for network */}
      {collapsed && (
        <div className="py-4 px-3">
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Starknet Sepolia" />
          </div>
        </div>
      )}
    </motion.aside>
    </>
  );
}
