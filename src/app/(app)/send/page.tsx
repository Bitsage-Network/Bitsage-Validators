"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Send,
  ArrowRight,
  Eye,
  EyeOff,
  Shield,
  Clock,
  CheckCircle2,
  Loader2,
  Info,
  User,
  Copy,
  ExternalLink,
  Zap,
  Wallet,
  RefreshCw,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { PrivacyBalanceCard, PrivacyModeToggle } from "@/components/privacy/PrivacyToggle";
import { ProofDetails } from "@/components/privacy/ProofDetails";
import { useSafeObelyskWallet } from "@/lib/obelysk/ObelyskWalletContext";
import Link from "next/link";
import { SUPPORTED_ASSETS, type Asset, DEFAULT_ASSET } from "@/lib/contracts/assets";
import { useAccount } from "@starknet-react/core";
import { useSendPageData } from "@/lib/hooks/useApiData";
import { usePrivacyPool } from "@/lib/hooks/usePrivacyPool";
import { usePrivacyKeys } from "@/lib/hooks/usePrivacyKeys";
import { PRIVACY_DENOMINATIONS, type PrivacyDenomination } from "@/lib/crypto";
import { useToast } from "@/lib/providers/ToastProvider";

export default function SendPage() {
  const { address } = useAccount();
  const obelyskWallet = useSafeObelyskWallet();
  const balance = obelyskWallet?.balance ?? { public: "0", private: "0", pending: "0" };
  const isPrivateRevealed = obelyskWallet?.isPrivateRevealed ?? false;
  const revealPrivateBalance = obelyskWallet?.revealPrivateBalance;
  const hidePrivateBalance = obelyskWallet?.hidePrivateBalance;
  const sendPrivate = obelyskWallet?.sendPrivate ?? (async () => {});
  const sendPublic = obelyskWallet?.sendPublic ?? (async () => {});
  const provingState = obelyskWallet?.provingState ?? "idle";
  const provingTime = obelyskWallet?.provingTime ?? null;
  const resetProvingState = obelyskWallet?.resetProvingState ?? (() => {});
  const decryptionResult = obelyskWallet?.decryptionResult ?? null;
  const staleNotesCount = obelyskWallet?.staleNotesCount ?? 0;
  const localNotesBalance = obelyskWallet?.localNotesBalance ?? 0;
  const clearStaleNotes = obelyskWallet?.clearStaleNotes;

  // Toast notifications
  const toast = useToast();

  // Privacy pool for wrap/unwrap and private sends
  const {
    deposit,
    withdraw,
    depositState,
    withdrawState,
    poolStats,
    isKeysDerived,
    derivePrivacyKeys,
  } = usePrivacyPool();

  // Privacy keys for note management
  const { getSpendableNotes } = usePrivacyKeys();

  // Fetch real data from API
  const {
    recentTransfers,
    isLoadingTransfers,
    contacts: savedContacts,
    isLoadingContacts,
    addContact,
    assetBalances: apiAssetBalances,
    isLoadingBalances,
  } = useSendPageData(address);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [usePrivateBalance, setUsePrivateBalance] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset>(DEFAULT_ASSET);
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [privateSendTxHash, setPrivateSendTxHash] = useState<string | null>(null);
  const [privateSendNote, setPrivateSendNote] = useState<{
    commitment: string;
    nullifier: string;
    amount: number;
  } | null>(null);

  // Build asset balances from API data, with SAGE from Obelysk wallet as fallback
  const assetBalances = useMemo(() => {
    const balances: Record<string, { public: string; private: string }> = {
      SAGE: { public: balance.public, private: balance.private },
    };

    // Merge API balances
    for (const assetBalance of apiAssetBalances) {
      balances[assetBalance.symbol] = {
        public: assetBalance.public_balance,
        private: assetBalance.private_balance,
      };
    }

    // Ensure SAGE uses Obelysk wallet if not in API response
    if (!balances.SAGE || balances.SAGE.public === "0") {
      balances.SAGE = { public: balance.public, private: balance.private };
    }

    return balances;
  }, [apiAssetBalances, balance.public, balance.private]);

  // Convert amount to fixed denominations using greedy algorithm
  const amountToDenominations = useCallback((amountStr: string): PrivacyDenomination[] => {
    const numAmount = parseFloat(amountStr) || 0;
    const denominations: PrivacyDenomination[] = [];
    let remaining = numAmount;

    // Sort denominations from largest to smallest
    const sortedDenoms = [...PRIVACY_DENOMINATIONS].sort((a, b) => b - a);

    for (const denom of sortedDenoms) {
      while (remaining >= denom) {
        denominations.push(denom);
        remaining -= denom;
        // Handle floating point precision
        remaining = Math.round(remaining * 1000) / 1000;
      }
    }

    return denominations;
  }, []);

  // Wrap: Deposit public balance into privacy pool
  const handleWrap = useCallback(async (amountStr: string) => {
    const denominations = amountToDenominations(amountStr);

    if (denominations.length === 0) {
      toast.error("Invalid Amount", "Amount must be at least 0.1 SAGE");
      return;
    }

    try {
      // Ensure privacy keys are derived before depositing
      if (!isKeysDerived) {
        toast.info("Initializing Privacy", "Please sign the message in your wallet to derive your privacy keys...");
        await derivePrivacyKeys();
        toast.success("Privacy Ready", "Privacy keys derived successfully");
      }

      // Deposit each denomination
      for (let i = 0; i < denominations.length; i++) {
        const denom = denominations[i];
        toast.info(
          "Depositing...",
          `Processing ${i + 1}/${denominations.length}: ${denom} SAGE`
        );
        await deposit(denom);
      }

      toast.success(
        "Wrapped Successfully",
        `${amountStr} SAGE wrapped into ${denominations.length} privacy note(s)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wrap failed";
      toast.error("Wrap Failed", message);
      throw error;
    }
  }, [amountToDenominations, deposit, toast, isKeysDerived, derivePrivacyKeys]);

  // Unwrap: Withdraw from privacy pool to public balance
  const handleUnwrap = useCallback(async (amountStr: string) => {
    const targetAmount = parseFloat(amountStr) || 0;

    if (targetAmount <= 0) {
      toast.error("Invalid Amount", "Please enter a valid amount");
      return;
    }

    try {
      // Ensure privacy keys are derived before withdrawing
      if (!isKeysDerived) {
        toast.info("Initializing Privacy", "Please sign the message in your wallet to derive your privacy keys...");
        await derivePrivacyKeys();
        toast.success("Privacy Ready", "Privacy keys derived successfully");
      }

      // Get available notes
      const notes = await getSpendableNotes();

      if (!notes || notes.length === 0) {
        toast.error("No Notes", "No privacy notes available to withdraw");
        return;
      }

      // Select notes to withdraw (greedy: largest first)
      const sortedNotes = [...notes].sort((a, b) => b.denomination - a.denomination);
      const notesToWithdraw: typeof notes = [];
      let accumulated = 0;

      for (const note of sortedNotes) {
        if (accumulated >= targetAmount) break;
        notesToWithdraw.push(note);
        accumulated += note.denomination;
      }

      if (accumulated < targetAmount) {
        toast.error(
          "Insufficient Notes",
          `Can only withdraw ${accumulated} SAGE from available notes`
        );
        return;
      }

      // Withdraw each note
      for (let i = 0; i < notesToWithdraw.length; i++) {
        const note = notesToWithdraw[i];
        toast.info(
          "Withdrawing...",
          `Processing ${i + 1}/${notesToWithdraw.length}: ${note.denomination} SAGE`
        );
        await withdraw(note);
      }

      toast.success(
        "Unwrapped Successfully",
        `${accumulated} SAGE withdrawn from ${notesToWithdraw.length} note(s)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unwrap failed";
      toast.error("Unwrap Failed", message);
      throw error;
    }
  }, [getSpendableNotes, withdraw, toast, isKeysDerived, derivePrivacyKeys]);

  const handleSend = async () => {
    setIsSending(true);
    setPrivateSendTxHash(null);
    setPrivateSendNote(null);

    try {
      if (privacyMode || usePrivateBalance) {
        // ============================================
        // PRIVATE SEND - Uses real ZK proofs on-chain
        // ============================================
        console.log("🔐 [Private Send] Starting with amount:", amount);

        // 1. Ensure privacy keys are derived
        if (!isKeysDerived) {
          console.log("Deriving privacy keys for private send...");
          await derivePrivacyKeys();
        }

        // 2. Find a note that covers the amount
        const amountNum = parseFloat(amount);
        const notes = poolStats.yourNotes.filter(n => !n.spent && n.denomination >= amountNum);

        if (notes.length === 0) {
          throw new Error(
            `No suitable note found for amount ${amount} SAGE. ` +
            `Available notes: ${poolStats.yourNotes.filter(n => !n.spent).map(n => n.denomination).join(", ")} SAGE`
          );
        }

        // Use the smallest note that covers the amount
        const note = notes.sort((a, b) => a.denomination - b.denomination)[0];

        console.log("📝 [Private Send] Using note:", {
          commitment: note.commitment.slice(0, 10) + "...",
          denomination: note.denomination,
          leafIndex: note.leafIndex,
        });

        // 3. Execute withdrawal with recipient address
        // This generates real ZK proofs:
        // - Derives nullifier = H(nullifier_secret, leaf_index)
        // - Fetches Merkle proof from backend
        // - Submits on-chain withdrawal to PrivacyPools contract
        const txHash = await withdraw(note, recipient);

        console.log("✅ [Private Send] Complete! TxHash:", txHash);

        // Store proof data for display
        setPrivateSendTxHash(txHash);
        setPrivateSendNote({
          commitment: note.commitment,
          nullifier: note.nullifierSecret, // Will be hashed with leafIndex
          amount: note.denomination,
        });

        toast.success("Private transfer complete!");
        setSendSuccess(true);

        setTimeout(() => {
          setShowConfirm(false);
          setSendSuccess(false);
          setAmount("");
          setRecipient("");
          resetProvingState();
        }, 3000);

      } else {
        // Public send
        await sendPublic(recipient, amount);
        setSendSuccess(true);
        setTimeout(() => {
          setShowConfirm(false);
          setSendSuccess(false);
          setAmount("");
          setRecipient("");
          resetProvingState();
        }, 2000);
      }
    } catch (error) {
      console.error("Send failed:", error);
      toast.error(error instanceof Error ? error.message : "Send failed");
    } finally {
      setIsSending(false);
    }
  };

  // Use balances from Obelysk wallet based on selected asset
  const currentAssetBalance = assetBalances[selectedAsset.id] || { public: "0.00", private: "0.00" };
  const availableBalance = usePrivateBalance
    ? currentAssetBalance.private
    : currentAssetBalance.public;

  const isValidAmount = amount && parseFloat(amount) > 0;
  const isValidRecipient = recipient.length > 10;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Send {selectedAsset.symbol}</h1>
        <p className="text-gray-400 mt-1">
          Transfer tokens publicly or privately
        </p>
      </div>

      {/* Obelysk Wallet Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Obelysk Wallet</p>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{balance.public} SAGE</span>
                <span className="text-gray-600">|</span>
                <span className="text-brand-400 font-mono text-sm">
                  {isPrivateRevealed ? balance.private : "•••••"} private
                </span>
                {parseFloat(balance.pending) > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-orange-400 text-sm flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      +{balance.pending} pending
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Link
            href="/wallet"
            className="px-3 py-1.5 text-sm text-brand-400 hover:text-brand-300 border border-brand-500/30 rounded-lg hover:bg-brand-500/10 transition-colors"
          >
            Manage
          </Link>
        </div>
      </motion.div>

      {/* Balance Card */}
      <PrivacyBalanceCard
        publicBalance={balance.public}
        privateBalance={balance.private}
        isRevealed={isPrivateRevealed}
        onReveal={revealPrivateBalance}
        onHide={hidePrivateBalance}
        onWrap={handleWrap}
        onUnwrap={handleUnwrap}
        decryptionResult={decryptionResult}
        staleNotesCount={staleNotesCount}
        localNotesBalance={localNotesBalance}
        onClearStaleNotes={clearStaleNotes}
      />

      {/* ZK Proof Details - Show after successful deposit */}
      {depositState.phase === "confirmed" && depositState.proofData && depositState.txHash && depositState.provingTimeMs && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ProofDetails
            commitment={depositState.proofData.commitment}
            amountCommitment={depositState.proofData.amountCommitment}
            provingTimeMs={depositState.provingTimeMs}
            leafIndex={depositState.proofData.leafIndex}
            txHash={depositState.txHash}
            amount={depositState.proofData.amount}
            symbol="SAGE"
          />
        </motion.div>
      )}

      {/* ZK Proof Details - Show after successful private send (withdraw) */}
      {withdrawState.txHash && privateSendNote && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                Private Transfer Complete
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  ZK Verified
                </span>
              </h3>
              <p className="text-sm text-gray-400">
                {privateSendNote.amount} SAGE sent with zero-knowledge proof
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Nullifier */}
            <div className="p-3 rounded-lg bg-surface-elevated/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Nullifier (prevents double-spend)</span>
              </div>
              <code className="text-brand-400 font-mono text-sm break-all">
                {privateSendNote.nullifier.slice(0, 20)}...{privateSendNote.nullifier.slice(-16)}
              </code>
            </div>

            {/* Commitment */}
            <div className="p-3 rounded-lg bg-surface-elevated/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Note Commitment (Pedersen)</span>
              </div>
              <code className="text-purple-400 font-mono text-sm break-all">
                {privateSendNote.commitment.slice(0, 20)}...{privateSendNote.commitment.slice(-16)}
              </code>
            </div>

            {/* Transaction Link */}
            <div className="flex items-center justify-between pt-2 border-t border-surface-border">
              <span className="text-sm text-gray-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                On-chain withdrawal verified
              </span>
              <a
                href={`https://sepolia.starkscan.co/tx/${withdrawState.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                View on Starkscan
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </motion.div>
      )}

      {/* Send Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
      >
        <div className="p-6 space-y-5">
          {/* Privacy Mode Toggle */}
          <PrivacyModeToggle
            enabled={privacyMode}
            onToggle={(enabled) => {
              setPrivacyMode(enabled);
              if (enabled) setUsePrivateBalance(true);
            }}
          />

          {/* Source Balance Toggle */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-xl border transition-all",
            usePrivateBalance 
              ? "bg-brand-600/10 border-brand-500/30" 
              : "bg-surface-elevated/50 border-surface-border"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                usePrivateBalance ? "bg-brand-500/30" : "bg-surface-elevated"
              )}>
                {usePrivateBalance ? (
                  <EyeOff className="w-4 h-4 text-brand-400" />
                ) : (
                  <Eye className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white">Send from</p>
                <p className="text-xs text-gray-500">
                  {usePrivateBalance ? "Private balance" : "Public balance"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {usePrivateBalance ? (
                isPrivateRevealed ? (
                  <span className="text-brand-400 font-medium">{balance.private}</span>
                ) : (
                  <span className="text-brand-400 font-mono">•••••</span>
                )
              ) : (
                <span className="text-white font-medium">{balance.public}</span>
              )}
              <span className="text-sm text-gray-400">SAGE</span>
              <button
                onClick={() => setUsePrivateBalance(!usePrivateBalance)}
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                Switch
              </button>
            </div>
          </div>

          {/* Recipient Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Recipient</label>
            <div className="relative">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onFocus={() => setShowContacts(true)}
                onBlur={() => setTimeout(() => setShowContacts(false), 200)}
                placeholder="0x... or select contact"
                className="input-field pr-24"
              />
              <button
                onClick={() => navigator.clipboard.readText().then(setRecipient)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Paste
              </button>
              
              {/* Contacts Dropdown */}
              <AnimatePresence>
                {showContacts && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl z-10 overflow-hidden"
                  >
                    <p className="text-xs text-gray-500 px-4 py-2 border-b border-surface-border">
                      Saved Contacts
                    </p>
                    {isLoadingContacts ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                      </div>
                    ) : savedContacts.length === 0 ? (
                      <div className="px-4 py-3 text-center">
                        <p className="text-xs text-gray-500">No saved contacts</p>
                      </div>
                    ) : (
                      savedContacts.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => {
                            setRecipient(contact.address);
                            setShowContacts(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-brand-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm text-white">{contact.name}</p>
                            <p className="text-xs text-gray-500 font-mono">{contact.address}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Asset Selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Asset</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssetDropdown(!showAssetDropdown)}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedAsset.icon}</span>
                  <div className="text-left">
                    <p className="font-medium text-white">{selectedAsset.symbol}</p>
                    <p className="text-xs text-gray-400">{selectedAsset.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">
                    Balance: {isLoadingBalances ? (
                      <Loader2 className="w-3 h-3 inline animate-spin" />
                    ) : availableBalance}
                  </span>
                  <ChevronDown className={cn(
                    "w-5 h-5 text-gray-400 transition-transform",
                    showAssetDropdown && "rotate-180"
                  )} />
                </div>
              </button>
              <AnimatePresence>
                {showAssetDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto"
                  >
                    {SUPPORTED_ASSETS.map((asset) => {
                      const assetBal = assetBalances[asset.id] || { public: "0.00", private: "0.00" };
                      const displayBalance = usePrivateBalance ? assetBal.private : assetBal.public;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setShowAssetDropdown(false);
                            setAmount(""); // Clear amount when switching assets
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-4 hover:bg-surface-elevated transition-colors",
                            selectedAsset.id === asset.id && "bg-brand-500/10"
                          )}
                        >
                          <span className="text-2xl">{asset.icon}</span>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-white">{asset.symbol}</p>
                            <p className="text-xs text-gray-400">{asset.name}</p>
                          </div>
                          <span className="text-sm text-gray-400">{displayBalance}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Amount</label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input-field pr-28 text-xl"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  onClick={() => setAmount(availableBalance.replace(/,/g, ""))}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  MAX
                </button>
                <span className="text-gray-400">{selectedAsset.symbol}</span>
              </div>
            </div>
          </div>

          {/* Transaction Preview */}
          <div className={cn(
            "p-4 rounded-xl border space-y-3",
            privacyMode 
              ? "bg-gradient-to-r from-brand-600/10 to-accent-purple/10 border-brand-500/30" 
              : "bg-surface-elevated/50 border-surface-border"
          )}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">You send</span>
              {privacyMode ? (
                <span className="text-brand-400 font-mono tracking-wider">••••••• {selectedAsset.symbol}</span>
              ) : (
                <span className="text-white">{amount || "0.00"} {selectedAsset.symbol}</span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Recipient sees</span>
              {privacyMode ? (
                <span className="text-brand-400 font-mono tracking-wider">••••••• {selectedAsset.symbol}</span>
              ) : (
                <span className="text-white">{amount || "0.00"} {selectedAsset.symbol}</span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Transaction fee</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Sponsored (AA)
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Privacy</span>
              {privacyMode ? (
                <span className="text-brand-400 flex items-center gap-1">
                  <EyeOff className="w-3 h-3" /> End-to-end encrypted
                </span>
              ) : (
                <span className="text-gray-400 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Public on-chain
                </span>
              )}
            </div>
          </div>

          {/* Privacy Info */}
          {privacyMode && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-600/10 border border-brand-500/20">
              <Shield className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-gray-400">
                <strong className="text-brand-400">Private Transfer:</strong> This transaction will 
                generate a ZK proof (~2ms). The amount and recipient will show as{" "}
                <span className="font-mono text-brand-400">? → ?</span> on block explorers. 
                Only you and the recipient can see the actual values.
              </div>
            </div>
          )}

          {/* Send Button */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!isValidAmount || !isValidRecipient}
            className={cn(
              "w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
              !isValidAmount || !isValidRecipient
                ? "bg-surface-elevated text-gray-500 cursor-not-allowed"
                : privacyMode
                  ? "bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-accent-purple/90 text-white"
                  : "btn-glow"
            )}
          >
            {privacyMode ? (
              <>
                <EyeOff className="w-5 h-5" />
                Send Privately
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Send {selectedAsset.symbol}
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Recent Transfers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card"
      >
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <h3 className="font-medium text-white">Recent Transfers</h3>
          <span className="text-xs text-gray-500">
            {isLoadingTransfers ? "Loading..." : `${recentTransfers.length} transactions`}
          </span>
        </div>
        <div className="divide-y divide-surface-border">
          {isLoadingTransfers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
            </div>
          ) : recentTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Send className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No recent transfers</p>
              <p className="text-xs text-gray-500 mt-1">Your transfers will appear here</p>
            </div>
          ) : (
            recentTransfers.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    tx.status === "completed"
                      ? "bg-emerald-500/20"
                      : tx.status === "failed"
                        ? "bg-red-500/20"
                        : "bg-orange-500/20"
                  )}>
                    {tx.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : tx.status === "failed" ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-orange-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-sm">{tx.to}</span>
                      {tx.is_private && (
                        <span className="text-brand-400">
                          <EyeOff className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{tx.time}</span>
                      {tx.tx_hash && !tx.is_private && (
                        <a
                          href={`https://sepolia.starkscan.co/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-400 hover:underline flex items-center gap-1"
                        >
                          {tx.tx_hash.slice(0, 8)}...{tx.tx_hash.slice(-6)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {tx.is_private && (
                        <span className="text-xs text-brand-400/60 font-mono">encrypted</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {tx.is_private ? (
                    <span className="text-brand-400 font-mono tracking-wider">•••••</span>
                  ) : (
                    <span className="text-white font-medium">{tx.amount}</span>
                  )}
                  <p className="text-xs text-gray-500">{tx.token_symbol || "SAGE"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !isSending && !sendSuccess && setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden"
            >
              {sendSuccess ? (
                /* Success State */
                <div className="p-8 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Transfer {privacyMode ? "Sent Privately" : "Complete"}!
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {privacyMode 
                      ? "Your private transfer has been sent. The transaction appears as ? → ? on-chain."
                      : `${amount} SAGE sent successfully.`
                    }
                  </p>
                </div>
              ) : isSending ? (
                /* Sending State - like Tongo's rollover */
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-white text-center mb-6">
                    {privacyMode ? "Private Transfer" : "Sending"}
                  </h3>
                  <div className="space-y-4">
                    {/* Progress Steps */}
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {privacyMode ? "Proving" : "Preparing"}
                        </p>
                        <p className="text-xs text-emerald-400">
                          {privacyMode ? "Proved in 2ms" : "Transaction prepared"}
                        </p>
                      </div>
                    </div>
                    <div className="w-0.5 h-6 bg-emerald-500/30 ml-5" />
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">Sending</p>
                        <p className="text-xs text-gray-500">Broadcasting to network...</p>
                      </div>
                    </div>
                    <div className="w-0.5 h-6 bg-surface-border ml-5" />
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center">
                        <Clock className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-500">Confirming</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Confirmation State */
                <>
                  <div className="p-4 border-b border-surface-border">
                    <h3 className="font-semibold text-white text-center flex items-center justify-center gap-2">
                      {privacyMode ? (
                        <>
                          <EyeOff className="w-5 h-5 text-brand-400" />
                          Confirm Private Transfer
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Confirm Transfer
                        </>
                      )}
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Visual Flow */}
                    <div className="flex items-center justify-center gap-4 py-4">
                      <div className="text-center">
                        <div className="text-2xl mb-1">👤</div>
                        <span className="text-xs text-gray-400">You</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center">
                        <ArrowRight className="w-6 h-6 text-brand-400" />
                        {privacyMode ? (
                          <span className="text-xs text-brand-400 font-mono mt-1">? → ?</span>
                        ) : (
                          <span className="text-xs text-gray-400 mt-1">{amount} SAGE</span>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-2xl mb-1">👤</div>
                        <span className="text-xs text-gray-400 font-mono">{recipient.slice(0, 8)}...</span>
                      </div>
                    </div>

                    {/* Details */}
                    <div className={cn(
                      "p-4 rounded-xl border space-y-2",
                      privacyMode ? "bg-brand-600/10 border-brand-500/20" : "bg-surface-elevated border-surface-border"
                    )}>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Amount</span>
                        {privacyMode ? (
                          <span className="text-brand-400 font-mono">•••••••</span>
                        ) : (
                          <span className="text-white">{amount} SAGE</span>
                        )}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Recipient</span>
                        <span className="text-white font-mono text-xs">{recipient}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">From</span>
                        <span className={cn(
                          "flex items-center gap-1",
                          usePrivateBalance ? "text-brand-400" : "text-white"
                        )}>
                          {usePrivateBalance ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {usePrivateBalance ? "Private" : "Public"} balance
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Fee</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Zap className="w-3 h-3" /> Sponsored
                        </span>
                      </div>
                    </div>

                    {privacyMode && (
                      <div className="flex items-center gap-2 text-xs text-brand-400">
                        <Zap className="w-3 h-3" />
                        ZK proof will be generated (~2ms)
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-surface-border flex gap-3">
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 py-3 rounded-lg border border-surface-border text-gray-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSend}
                      className={cn(
                        "flex-1 py-3 rounded-lg font-medium transition-all",
                        privacyMode
                          ? "bg-gradient-to-r from-brand-600 to-accent-purple text-white"
                          : "bg-brand-600 hover:bg-brand-500 text-white"
                      )}
                    >
                      {privacyMode ? "Send Privately" : "Confirm Send"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
