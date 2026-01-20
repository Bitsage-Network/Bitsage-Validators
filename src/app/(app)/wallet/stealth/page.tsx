"use client";

import { useState, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Search,
  Clock,
  CheckCircle2,
  Copy,
  Check,
  Download,
  QrCode,
  Wallet,
  ArrowDownToLine,
  RefreshCw,
  Loader2,
  Info,
  Key,
  Lock,
  Send,
  AlertCircle,
  ChevronDown,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAccount } from "@starknet-react/core";
import { useStealthPageData } from "@/lib/hooks/useApiData";

// Time ranges for scanning
const TIME_RANGES = [
  { id: "1h", label: "Last Hour" },
  { id: "24h", label: "Last 24 Hours" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "all", label: "All Time" },
];

export default function StealthAddressesPage() {
  const { address } = useAccount();
  const [showSpendingKey, setShowSpendingKey] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[1]);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [showQRCode, setShowQRCode] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterStatus, setFilterStatus] = useState<"all" | "unclaimed" | "claimed">("all");

  // Use real API data via hook
  const {
    metaAddress: metaAddressData,
    payments,
    unclaimedCount,
    totalUnclaimedValue,
    isLoading,
    scan,
    isScanning,
    claim,
    isClaiming,
  } = useStealthPageData(address);

  // Get meta address or fallback to placeholder
  const metaAddress = {
    spendingPubKey: metaAddressData?.spending_pub_key || "Connect wallet to view",
    viewingPubKey: metaAddressData?.viewing_pub_key || "Connect wallet to view",
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedValue(value);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const handleScan = async () => {
    if (!address) return;
    setScanProgress(0);

    // Start scan via API
    scan({ address, timeRange: selectedTimeRange.id });

    // Simulate progress while scanning
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    // Clean up when scan completes (handled by mutation state)
  };

  // Reset progress when scan completes
  useMemo(() => {
    if (!isScanning && scanProgress > 0) {
      setScanProgress(100);
      setTimeout(() => setScanProgress(0), 500);
    }
  }, [isScanning, scanProgress]);

  const handleClaimSelected = async () => {
    if (selectedPayments.length === 0 || !address) return;
    claim({ address, paymentIds: selectedPayments });
    setSelectedPayments([]);
  };

  const handleClaimSingle = async (paymentId: string) => {
    if (!address) return;
    claim({ address, paymentIds: [paymentId] });
  };

  const togglePaymentSelection = (paymentId: string) => {
    if (selectedPayments.includes(paymentId)) {
      setSelectedPayments(selectedPayments.filter(id => id !== paymentId));
    } else {
      if (selectedPayments.length < 20) {
        setSelectedPayments([...selectedPayments, paymentId]);
      }
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      if (filterStatus === "unclaimed") return !payment.claimed;
      if (filterStatus === "claimed") return payment.claimed;
      return true;
    });
  }, [payments, filterStatus]);

  const unclaimedPayments = payments.filter(p => !p.claimed);
  const totalUnclaimed = parseFloat(totalUnclaimedValue) / 1e18;

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Stealth Addresses</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Receive private payments with one-time stealth addresses
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/wallet"
          className="px-4 py-2 rounded-lg bg-surface-elevated border border-surface-border text-gray-300 hover:text-white transition-colors"
        >
          Back to Wallet
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Unclaimed Payments</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : unclaimedCount}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Unclaimed Value</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `${totalUnclaimed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAGE`}
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Claimed</p>
              <p className="text-lg font-bold text-white">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : payments.filter(p => p.claimed).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Meta Address & Scanner */}
        <div className="lg:col-span-2 space-y-6">
          {/* Meta Address Display */}
          <div className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Your Stealth Meta-Address</h3>
              <button
                onClick={() => setShowQRCode(!showQRCode)}
                className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-card transition-colors"
              >
                <QrCode className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-400">
              Share this meta-address to receive private payments. Senders will derive a unique one-time address for each payment.
            </p>

            {/* Viewing Key */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-brand-400" />
                <label className="text-sm font-medium text-gray-300">Viewing Public Key</label>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-surface-border">
                <code className="text-sm text-gray-300 flex-1 font-mono truncate">
                  {metaAddress.viewingPubKey}
                </code>
                <button
                  onClick={() => handleCopy(metaAddress.viewingPubKey)}
                  className="p-1.5 rounded-md hover:bg-surface-card transition-colors"
                >
                  {copiedValue === metaAddress.viewingPubKey ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Safe to share - allows scanning for incoming payments
              </p>
            </div>

            {/* Spending Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-purple-400" />
                  <label className="text-sm font-medium text-gray-300">Spending Public Key</label>
                </div>
                <button
                  onClick={() => setShowSpendingKey(!showSpendingKey)}
                  className="text-xs text-brand-400 flex items-center gap-1"
                >
                  {showSpendingKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showSpendingKey ? "Hide" : "Show"}
                </button>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-surface-border">
                <code className="text-sm text-gray-300 flex-1 font-mono truncate">
                  {showSpendingKey ? metaAddress.spendingPubKey : "••••••••••••••••••••••••••••••••••••••••••••"}
                </code>
                <button
                  onClick={() => handleCopy(metaAddress.spendingPubKey)}
                  className="p-1.5 rounded-md hover:bg-surface-card transition-colors"
                >
                  {copiedValue === metaAddress.spendingPubKey ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Required for receiving - keep this secure
              </p>
            </div>

            {/* QR Code Modal */}
            <AnimatePresence>
              {showQRCode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-6 rounded-xl bg-white mx-auto w-fit"
                >
                  {/* Placeholder for QR code */}
                  <div className="w-48 h-48 bg-gray-100 flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-gray-400" />
                  </div>
                  <p className="text-center text-gray-600 text-sm mt-2">Scan to get meta-address</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Payment Scanner */}
          <div className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Payment Scanner</h3>
              <div className="flex items-center gap-2">
                {/* Time Range Selector */}
                <div className="relative">
                  <select
                    value={selectedTimeRange.id}
                    onChange={(e) => {
                      const range = TIME_RANGES.find(r => r.id === e.target.value);
                      if (range) setSelectedTimeRange(range);
                    }}
                    className="appearance-none pl-3 pr-8 py-2 rounded-lg bg-surface-elevated border border-surface-border text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {TIME_RANGES.map((range) => (
                      <option key={range.id} value={range.id}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                <button
                  onClick={handleScan}
                  disabled={isScanning || !address}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                    isScanning || !address
                      ? "bg-gray-600 cursor-not-allowed text-gray-300"
                      : "bg-brand-600 hover:bg-brand-500 text-white"
                  )}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning ({scanProgress}%)
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      {address ? "Scan for Payments" : "Connect Wallet"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Scanning Progress */}
            {isScanning && (
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${scanProgress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <p className="text-sm text-gray-400">
                  Scanning blockchain for payments using your viewing key...
                </p>
              </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <div className="flex gap-1 p-1 bg-surface-elevated rounded-lg">
                {(["all", "unclaimed", "claimed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                      filterStatus === status
                        ? "bg-brand-500 text-white"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Detected Payments */}
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 text-brand-400 mx-auto mb-3 animate-spin" />
                  <p className="text-gray-400">Loading payments...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No payments found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {!address ? "Connect your wallet to view payments" : "Try scanning with a different time range"}
                  </p>
                </div>
              ) : (
                filteredPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-lg border transition-all",
                      payment.claimed
                        ? "bg-surface-elevated/50 border-surface-border"
                        : "bg-surface-elevated border-surface-border hover:border-brand-500/50"
                    )}
                  >
                    {!payment.claimed && (
                      <button
                        onClick={() => togglePaymentSelection(payment.id)}
                        className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                          selectedPayments.includes(payment.id)
                            ? "bg-brand-500 border-brand-500"
                            : "border-gray-500 hover:border-gray-400"
                        )}
                      >
                        {selectedPayments.includes(payment.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {payment.amount_formatted} {payment.token_symbol}
                        </span>
                        {payment.claimed && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            Claimed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400 truncate max-w-[200px]">
                          Stealth: {payment.stealth_address}
                        </span>
                        <span className="text-xs text-gray-500">
                          View Tag: {payment.view_tag}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-400">{formatTimeAgo(payment.timestamp * 1000)}</p>
                      {!payment.claimed && (
                        <button
                          onClick={() => handleClaimSingle(payment.id)}
                          disabled={isClaiming}
                          className="mt-1 text-xs text-brand-400 hover:text-brand-300"
                        >
                          {isClaiming ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Claim"}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Batch Claim */}
            {selectedPayments.length > 0 && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-brand-500/10 border border-brand-500/30">
                <div>
                  <p className="font-medium text-white">
                    {selectedPayments.length} payment{selectedPayments.length > 1 ? "s" : ""} selected
                  </p>
                  <p className="text-sm text-gray-400">
                    Max 20 payments per batch claim
                  </p>
                </div>
                <button
                  onClick={handleClaimSelected}
                  disabled={isClaiming}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all",
                    isClaiming
                      ? "bg-gray-600 cursor-not-allowed text-gray-300"
                      : "bg-brand-600 hover:bg-brand-500 text-white"
                  )}
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-4 h-4" />
                      Claim Selected
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Info & Export */}
        <div className="space-y-6">
          {/* Key Export */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Detection Key Export</h3>
            <p className="text-sm text-gray-400">
              Export your viewing key for third-party scanning services. This allows servers to detect payments on your behalf without access to spending authority.
            </p>

            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-300">Privacy Note</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Sharing your viewing key allows detecting your payments but not spending them.
                  </p>
                </div>
              </div>
            </div>

            <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-surface-elevated border border-surface-border hover:bg-surface-card transition-colors text-white font-medium">
              <Download className="w-4 h-4" />
              Export Detection Key
            </button>
          </div>

          {/* FMD Info */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Fuzzy Message Detection</h3>
            <p className="text-sm text-gray-400">
              Your scanning uses FMD with view tags for efficient detection. Configure your detection precision in wallet settings.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated">
                <span className="text-sm text-gray-300">Detection Precision</span>
                <span className="text-sm font-medium text-white">16 bits</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated">
                <span className="text-sm text-gray-300">False Positive Rate</span>
                <span className="text-sm font-medium text-white">~0.0015%</span>
              </div>
            </div>

            <Link
              href="/settings"
              className="block text-center text-brand-400 text-sm hover:underline"
            >
              Configure FMD Settings →
            </Link>
          </div>

          {/* Info Card */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-300">
                  <strong className="text-white">Stealth Addresses</strong> enable receiving payments where each sender creates a unique one-time address. Only you can detect and claim these payments.
                </p>
                <Link href="/docs/stealth-addresses" className="text-brand-400 text-sm hover:underline mt-2 inline-block">
                  Learn more →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
