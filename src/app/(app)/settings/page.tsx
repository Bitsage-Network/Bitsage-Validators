"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useDisconnect, useSendTransaction } from "@starknet-react/core";
import {
  Settings,
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  LogOut,
  Copy,
  CheckCircle2,
  ExternalLink,
  Moon,
  Sun,
  Monitor,
  Wallet,
  Key,
  AlertTriangle,
  Server,
  Loader2,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINKS, CURRENT_NETWORK, NETWORK_CONFIG, getExplorerUrl } from "@/lib/contracts/addresses";
import {
  buildRegisterValidatorCall,
  buildExitValidatorCall,
  useIsValidator,
  useValidatorInfo,
} from "@/lib/contracts";

const networkName = NETWORK_CONFIG[CURRENT_NETWORK]?.name || "Starknet Sepolia";

export default function SettingsPage() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [commissionBps, setCommissionBps] = useState(500); // 5% default
  const [regTxHash, setRegTxHash] = useState<string | null>(null);

  // Settings state with localStorage persistence
  const [notifications, setNotifications] = useState({
    rewards: true,
    jobs: true,
    network: false,
    marketing: false,
  });
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [currency, setCurrency] = useState("USD");

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedNotifications = localStorage.getItem("bitsage_notifications");
      if (savedNotifications) {
        setNotifications(JSON.parse(savedNotifications));
      }
      const savedTheme = localStorage.getItem("bitsage_theme") as "dark" | "light" | "system";
      if (savedTheme) {
        setTheme(savedTheme);
      }
      const savedCurrency = localStorage.getItem("bitsage_currency");
      if (savedCurrency) {
        setCurrency(savedCurrency);
      }
    } catch (e) {
      console.error("Failed to load settings from localStorage:", e);
    }
  }, []);

  // Save notifications to localStorage when changed
  useEffect(() => {
    localStorage.setItem("bitsage_notifications", JSON.stringify(notifications));
  }, [notifications]);

  // Save theme to localStorage when changed
  useEffect(() => {
    localStorage.setItem("bitsage_theme", theme);
  }, [theme]);

  // Save currency to localStorage when changed
  useEffect(() => {
    localStorage.setItem("bitsage_currency", currency);
  }, [currency]);


  // Validator status from on-chain
  const { data: isValidator, refetch: refetchValidatorStatus } = useIsValidator(address);
  const { data: validatorInfo } = useValidatorInfo(address);

  // Transaction hook
  const { send: sendTransaction, isPending: txPending, data: txData } = useSendTransaction({});

  // Handle validator registration
  const handleRegisterValidator = useCallback(async () => {
    if (!address) return;
    try {
      const registerCall = buildRegisterValidatorCall(address, commissionBps, "0", CURRENT_NETWORK);
      await sendTransaction([registerCall]);
    } catch (err) {
      console.error("Validator registration failed:", err);
    }
  }, [address, commissionBps, sendTransaction]);

  // Handle validator exit
  const handleExitValidator = useCallback(async () => {
    if (!address) return;
    try {
      const exitCall = buildExitValidatorCall(CURRENT_NETWORK);
      await sendTransaction([exitCall]);
    } catch (err) {
      console.error("Validator exit failed:", err);
    }
  }, [address, sendTransaction]);

  // Update tx hash and refetch status when transaction succeeds
  useEffect(() => {
    if (txData?.transaction_hash) {
      setRegTxHash(txData.transaction_hash);
      setTimeout(() => refetchValidatorStatus(), 3000);
    }
  }, [txData, refetchValidatorStatus]);

  useEffect(() => {
    setIsDemoMode(localStorage.getItem("bitsage_demo_mode") === "true");
  }, []);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem("bitsage_demo_mode");
    disconnect();
    window.location.href = "/connect";
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account preferences</p>
      </div>

      {/* Account Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-brand-400" />
            Account
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Demo Mode Warning */}
          {isDemoMode && (
            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 mb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-sm font-medium text-orange-400">Demo Mode Active</p>
                  <p className="text-xs text-gray-400">
                    You're viewing the app with mock data. Connect a real wallet for full functionality.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Address */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Wallet Address</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-surface-border">
                <Wallet className="w-5 h-5 text-gray-400" />
                <code className="text-sm text-white font-mono flex-1">
                  {isDemoMode ? "0xDEMO...MODE" : address ? formatAddress(address) : "Not connected"}
                </code>
              </div>
              <button
                onClick={copyAddress}
                disabled={isDemoMode || !address}
                className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors disabled:opacity-50"
              >
                {copied ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Copy className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {!isDemoMode && address && (
                <a
                  href={`${getExplorerUrl('contract')}/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors"
                >
                  <ExternalLink className="w-5 h-5 text-gray-400" />
                </a>
              )}
            </div>
          </div>

          {/* Network */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Network</label>
            <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-surface-border">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white">{networkName}</span>
            </div>
          </div>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {isDemoMode ? "Exit Demo Mode" : "Disconnect Wallet"}
          </button>
        </div>
      </motion.div>

      {/* Validator Registration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-brand-400" />
            Validator Status
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-surface-border">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                isValidator ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
              )} />
              <div>
                <p className="text-white font-medium">
                  {isValidator ? "Registered Validator" : "Not Registered"}
                </p>
                <p className="text-sm text-gray-400">
                  {isValidator ? "Your node is eligible to receive jobs" : "Register to start validating"}
                </p>
              </div>
            </div>
            {isValidator && (
              <span className="badge badge-success">Active</span>
            )}
          </div>

          {!isValidator ? (
            <>
              {/* Commission Setting */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Commission Rate (%)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={commissionBps / 100}
                    onChange={(e) => setCommissionBps(Math.min(10000, Math.max(0, parseFloat(e.target.value) * 100 || 0)))}
                    className="input-field flex-1"
                    placeholder="5"
                  />
                  <span className="text-gray-400">%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  The percentage you take from delegator rewards
                </p>
              </div>

              {/* Register Button */}
              <button
                onClick={handleRegisterValidator}
                disabled={txPending || !address || isDemoMode}
                className="w-full btn-glow py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {txPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Register as Validator
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Validator Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-surface-card border border-surface-border">
                  <p className="text-xs text-gray-400">Commission</p>
                  <p className="text-lg font-semibold text-white">
                    {validatorInfo ? `${Number(validatorInfo) / 100}%` : "5%"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-surface-card border border-surface-border">
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="text-lg font-semibold text-emerald-400">Active</p>
                </div>
              </div>

              {/* Exit Button */}
              <button
                onClick={handleExitValidator}
                disabled={txPending || isDemoMode}
                className="w-full p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {txPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    Exit Validator Set
                  </>
                )}
              </button>
            </>
          )}

          {/* Transaction Success */}
          {regTxHash && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <span className="text-sm text-emerald-400">Transaction submitted!</span>
                <a
                  href={`${getExplorerUrl('tx')}/${regTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-sm"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand-400" />
            Notifications
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {[
            { key: "rewards", label: "Reward notifications", description: "Get notified when you earn rewards" },
            { key: "jobs", label: "Job updates", description: "Updates on job status changes" },
            { key: "network", label: "Network alerts", description: "Important network announcements" },
            { key: "marketing", label: "Marketing emails", description: "News and promotional content" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="text-white">{item.label}</p>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
              <button
                onClick={() => setNotifications((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  notifications[item.key as keyof typeof notifications]
                    ? "bg-brand-600"
                    : "bg-surface-elevated"
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                    notifications[item.key as keyof typeof notifications] ? "left-7" : "left-1"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Appearance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-brand-400" />
            Appearance
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Theme */}
          <div>
            <label className="block text-sm text-gray-400 mb-3">Theme</label>
            <div className="flex gap-3">
              {[
                { value: "dark", icon: Moon, label: "Dark" },
                { value: "light", icon: Sun, label: "Light" },
                { value: "system", icon: Monitor, label: "System" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value as typeof theme)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-colors",
                    theme === option.value
                      ? "bg-brand-600/20 border-brand-500/50 text-white"
                      : "bg-surface-elevated border-surface-border text-gray-400 hover:text-white"
                  )}
                >
                  <option.icon className="w-4 h-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Display Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full p-3 bg-surface-elevated border border-surface-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="ETH">ETH (Ξ)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Security */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-400" />
            Security
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
            <div className="flex items-center gap-3 mb-2">
              <Key className="w-5 h-5 text-brand-400" />
              <p className="font-medium text-white">Wallet Security</p>
            </div>
            <p className="text-sm text-gray-400">
              Your wallet is managed by your browser extension (ArgentX/Braavos). 
              BitSage never has access to your private keys.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-elevated border border-surface-border">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <p className="font-medium text-white">Transaction Signing</p>
            </div>
            <p className="text-sm text-gray-400">
              All transactions require explicit approval in your wallet.
              Always verify transaction details before signing.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="font-medium text-white mb-4">Resources</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a
            href={EXTERNAL_LINKS.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors text-center"
          >
            <Globe className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-white">Docs</span>
          </a>
          <a
            href={EXTERNAL_LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors text-center"
          >
            <Globe className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-white">Discord</span>
          </a>
          <a
            href={EXTERNAL_LINKS.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors text-center"
          >
            <Globe className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-white">Twitter</span>
          </a>
          <a
            href={EXTERNAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors text-center"
          >
            <Globe className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-white">GitHub</span>
          </a>
        </div>
      </motion.div>

      {/* Version */}
      <div className="text-center text-sm text-gray-500">
        <p>BitSage Network v0.1.0 ({CURRENT_NETWORK === 'mainnet' ? 'Mainnet' : 'Testnet'})</p>
        <p className="mt-1">© {new Date().getFullYear()} BitSage. All rights reserved.</p>
      </div>
    </div>
  );
}
