"use client";

/**
 * ConfidentialWallet Component
 *
 * UI for managing encrypted balances via ConfidentialTransfer contract.
 * Supports: Register, Fund, Transfer, Rollover, Withdraw
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Lock,
  Unlock,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  Wallet,
  Send,
  Download,
  Upload,
} from "lucide-react";
import { useConfidentialTransfer, ASSET_IDS, type AssetId } from "@/lib/hooks/useConfidentialTransfer";
import { useAccount } from "@starknet-react/core";

// Asset display config
const ASSET_CONFIG: Record<AssetId, { name: string; symbol: string; decimals: number; color: string }> = {
  SAGE: { name: "SAGE Token", symbol: "SAGE", decimals: 18, color: "from-purple-500 to-indigo-500" },
  STRK: { name: "Starknet", symbol: "STRK", decimals: 18, color: "from-blue-500 to-cyan-500" },
  USDC: { name: "USD Coin", symbol: "USDC", decimals: 6, color: "from-green-500 to-emerald-500" },
};

type Tab = "balances" | "transfer" | "fund" | "withdraw";

export function ConfidentialWallet() {
  const { address, isConnected } = useAccount();
  const {
    state,
    register,
    fund,
    transfer,
    rollover,
    withdraw,
    getBalance,
    refreshBalances,
  } = useConfidentialTransfer();

  const [activeTab, setActiveTab] = useState<Tab>("balances");
  const [selectedAsset, setSelectedAsset] = useState<AssetId>("SAGE");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [showBalances, setShowBalances] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txResult, setTxResult] = useState<{ success: boolean; message: string; hash?: string } | null>(null);

  // Refresh balances on mount and when registered
  useEffect(() => {
    if (state.isRegistered && isConnected) {
      refreshBalances();
    }
  }, [state.isRegistered, isConnected, refreshBalances]);

  const formatBalance = (balance: bigint, asset: AssetId): string => {
    const decimals = ASSET_CONFIG[asset].decimals;
    const divisor = 10n ** BigInt(decimals);
    const whole = balance / divisor;
    const fraction = balance % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fractionStr}`;
  };

  const parseAmount = (value: string, asset: AssetId): bigint => {
    const decimals = ASSET_CONFIG[asset].decimals;
    const [whole, fraction = ""] = value.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction);
  };

  const handleRegister = async () => {
    setTxPending(true);
    setTxResult(null);
    try {
      await register();
      setTxResult({ success: true, message: "Successfully registered for private transfers!" });
    } catch (error) {
      setTxResult({
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
      });
    }
    setTxPending(false);
  };

  const handleFund = async () => {
    if (!amount) return;
    setTxPending(true);
    setTxResult(null);
    try {
      const amountWei = parseAmount(amount, selectedAsset);
      const hash = await fund(selectedAsset, amountWei);
      setTxResult({ success: true, message: "Funds deposited to private balance!", hash });
      setAmount("");
      await refreshBalances();
    } catch (error) {
      setTxResult({
        success: false,
        message: error instanceof Error ? error.message : "Deposit failed",
      });
    }
    setTxPending(false);
  };

  const handleTransfer = async () => {
    if (!amount || !recipient) return;
    setTxPending(true);
    setTxResult(null);
    try {
      const amountWei = parseAmount(amount, selectedAsset);
      const hash = await transfer(recipient, selectedAsset, amountWei);
      setTxResult({ success: true, message: "Private transfer complete!", hash });
      setAmount("");
      setRecipient("");
      await refreshBalances();
    } catch (error) {
      setTxResult({
        success: false,
        message: error instanceof Error ? error.message : "Transfer failed",
      });
    }
    setTxPending(false);
  };

  const handleWithdraw = async () => {
    if (!amount) return;
    setTxPending(true);
    setTxResult(null);
    try {
      const amountWei = parseAmount(amount, selectedAsset);
      const hash = await withdraw(address || "", selectedAsset, amountWei);
      setTxResult({ success: true, message: "Withdrawal complete!", hash });
      setAmount("");
      await refreshBalances();
    } catch (error) {
      setTxResult({
        success: false,
        message: error instanceof Error ? error.message : "Withdrawal failed",
      });
    }
    setTxPending(false);
  };

  const handleRollover = async (asset: AssetId) => {
    setTxPending(true);
    setTxResult(null);
    try {
      const hash = await rollover(asset);
      setTxResult({ success: true, message: "Pending transfers claimed!", hash });
      await refreshBalances();
    } catch (error) {
      setTxResult({
        success: false,
        message: error instanceof Error ? error.message : "Rollover failed",
      });
    }
    setTxPending(false);
  };

  if (!isConnected) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8 text-center">
        <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-500" />
        <h3 className="text-lg font-semibold text-gray-300 mb-2">Connect Wallet</h3>
        <p className="text-gray-500">Connect your wallet to access private transfers</p>
      </div>
    );
  }

  if (!state.isRegistered) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Enable Private Transfers</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Register your privacy key to start making confidential transfers. Your balances will be encrypted on-chain.
          </p>
          <button
            onClick={handleRegister}
            disabled={txPending || state.isLoading}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {txPending || state.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
            Register Privacy Key
          </button>
          {txResult && (
            <div className={`mt-4 p-3 rounded-lg ${txResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {txResult.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Confidential Wallet</h2>
              <p className="text-sm text-gray-400">Tongo-style encrypted balances</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBalances(!showBalances)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title={showBalances ? "Hide balances" : "Show balances"}
            >
              {showBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button
              onClick={() => refreshBalances()}
              disabled={state.isLoading}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Refresh balances"
            >
              <RefreshCw className={`w-5 h-5 ${state.isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {(["balances", "fund", "transfer", "withdraw"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-purple-400 border-b-2 border-purple-400 bg-purple-500/5"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab === "balances" && <Wallet className="w-4 h-4 inline mr-2" />}
            {tab === "fund" && <Download className="w-4 h-4 inline mr-2" />}
            {tab === "transfer" && <Send className="w-4 h-4 inline mr-2" />}
            {tab === "withdraw" && <Upload className="w-4 h-4 inline mr-2" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {activeTab === "balances" && (
            <motion.div
              key="balances"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {(["SAGE", "STRK", "USDC"] as AssetId[]).map((asset) => {
                const config = ASSET_CONFIG[asset];
                const balance = state.balances[asset];
                const pendingIn = state.pendingIn[asset];

                return (
                  <div
                    key={asset}
                    className="p-4 rounded-lg bg-gray-800/50 border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${config.color} flex items-center justify-center text-white font-bold text-sm`}>
                          {config.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-white">{config.name}</div>
                          <div className="text-sm text-gray-400">{config.symbol}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg text-white">
                          {showBalances ? formatBalance(balance, asset) : "••••••"}
                        </div>
                        {pendingIn > 0n && (
                          <div className="text-sm text-green-400 flex items-center gap-1 justify-end">
                            <ArrowDownLeft className="w-3 h-3" />
                            +{showBalances ? formatBalance(pendingIn, asset) : "••••"} pending
                            <button
                              onClick={() => handleRollover(asset)}
                              className="ml-2 text-xs text-purple-400 hover:text-purple-300"
                            >
                              Claim
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === "fund" && (
            <motion.div
              key="fund"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Asset</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["SAGE", "STRK", "USDC"] as AssetId[]).map((asset) => (
                    <button
                      key={asset}
                      onClick={() => setSelectedAsset(asset)}
                      className={`p-3 rounded-lg border transition-all ${
                        selectedAsset === asset
                          ? "border-purple-500 bg-purple-500/10 text-purple-400"
                          : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {ASSET_CONFIG[asset].symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                onClick={handleFund}
                disabled={txPending || !amount}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {txPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                Deposit to Private Balance
              </button>
            </motion.div>
          )}

          {activeTab === "transfer" && (
            <motion.div
              key="transfer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Asset</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["SAGE", "STRK", "USDC"] as AssetId[]).map((asset) => (
                    <button
                      key={asset}
                      onClick={() => setSelectedAsset(asset)}
                      className={`p-3 rounded-lg border transition-all ${
                        selectedAsset === asset
                          ? "border-purple-500 bg-purple-500/10 text-purple-400"
                          : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {ASSET_CONFIG[asset].symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Recipient Address</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-start gap-2">
                  <Shield className="w-5 h-5 text-purple-400 mt-0.5" />
                  <div className="text-sm text-purple-300">
                    <strong>Private Transfer:</strong> Amount is encrypted on-chain. Only sender, receiver, and auditor can decrypt.
                  </div>
                </div>
              </div>

              <button
                onClick={handleTransfer}
                disabled={txPending || !amount || !recipient}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {txPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Send Private Transfer
              </button>
            </motion.div>
          )}

          {activeTab === "withdraw" && (
            <motion.div
              key="withdraw"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Asset</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["SAGE", "STRK", "USDC"] as AssetId[]).map((asset) => (
                    <button
                      key={asset}
                      onClick={() => setSelectedAsset(asset)}
                      className={`p-3 rounded-lg border transition-all ${
                        selectedAsset === asset
                          ? "border-purple-500 bg-purple-500/10 text-purple-400"
                          : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {ASSET_CONFIG[asset].symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                <div className="relative">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    Available: {showBalances ? formatBalance(state.balances[selectedAsset], selectedAsset) : "••••••"}
                  </div>
                </div>
              </div>

              <button
                onClick={handleWithdraw}
                disabled={txPending || !amount}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {txPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                Withdraw to Public Balance
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transaction Result */}
        <AnimatePresence>
          {txResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
                txResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
              }`}
            >
              {txResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
              )}
              <div>
                <div className={txResult.success ? "text-green-400" : "text-red-400"}>
                  {txResult.message}
                </div>
                {txResult.hash && (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${txResult.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-400 hover:text-purple-300 mt-1 inline-flex items-center gap-1"
                  >
                    View on Explorer <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Display */}
        {state.error && (
          <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfidentialWallet;
