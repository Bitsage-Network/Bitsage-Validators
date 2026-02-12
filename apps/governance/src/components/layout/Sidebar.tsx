"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Coins,
  Server,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Briefcase,
  Shield,
  Wallet,
  X,
  Vote,
  TrendingUp,
  Droplets,
  Network,
  Cpu,
  BookOpen,
  Settings,
  Landmark,
} from "lucide-react";
import { LogoIcon } from "@/components/ui/Logo";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Validator-specific navigation items
const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "GPU overview & status",
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
    title: "Earnings",
    href: "/earnings",
    icon: TrendingUp,
    description: "Claim rewards & analytics",
  },
  {
    title: "Network",
    href: "/network",
    icon: Network,
    description: "Network visualization",
  },
  {
    title: "Workloads",
    href: "/workloads",
    icon: Cpu,
    description: "AI model marketplace",
  },
  {
    title: "Docs",
    href: "/docs",
    icon: BookOpen,
    description: "Documentation",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Validator preferences",
  },
];

// External app links
const externalLinks = [
  {
    title: "Wallet",
    href: "https://obelysk.bitsage.network/wallet",
    icon: Wallet,
    description: "Obelysk Privacy Wallet",
  },
  {
    title: "Trade",
    href: "https://obelysk.bitsage.network/trade",
    icon: Coins,
    description: "Dark pool trading",
  },
  {
    title: "Stake",
    href: "https://obelysk.bitsage.network/stake",
    icon: Landmark,
    description: "Stake SAGE tokens",
  },
  {
    title: "Governance",
    href: "https://governance.bitsage.network",
    icon: Vote,
    description: "DAO proposals",
  },
  {
    title: "Faucet",
    href: "https://faucet.bitsage.network",
    icon: Droplets,
    description: "Get testnet tokens",
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
        {/* Validator Core */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-2"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Validator
              </span>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* External Links Divider */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-3 py-2 mt-4"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Ecosystem
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {externalLinks.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onMobileClose}
            className={cn(
              "nav-item group",
              collapsed && "justify-center px-3"
            )}
            title={collapsed ? item.title : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex items-center justify-between"
                >
                  <div>
                    <span className="block">{item.title}</span>
                    <span className="text-xs text-gray-500 group-hover:text-gray-400">
                      {item.description}
                    </span>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </a>
        ))}

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
