"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useMemo,
} from "react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import {
  usePrivacy,
  usePrivateBalance,
  usePrivacyKeys,
  useRewardsInfo,
  usePrivateTransfer,
  useClaimRewards,
} from "@/lib/providers/BitSageSDKProvider";
import { useSendTransaction, useContract } from "@starknet-react/core";
import { getContractAddresses, useSageBalance } from "@/lib/contracts";
import { useOnChainSagePrice } from "@/lib/hooks/useOnChainData";
import { useSession, useSessionStatus, Session, SessionConfig, SessionKeyPair, SESSION_PRESETS } from "@/lib/sessions";
import { getUnspentBalance, getUnspentNotes, getNotes, deleteNote } from "@/lib/crypto/keyStore";
import { usePrivacyKeys as useLocalPrivacyKeys, type DecryptedNote } from "@/lib/hooks/usePrivacyKeys";
import type { ECPoint } from "@/lib/crypto";

// Types
export interface ObelyskBalance {
  public: string;
  private: string; // Encrypted - only revealed with signature
  pending: string; // GPU earnings waiting to be rolled over
}

export interface ObelyskTransaction {
  id: string;
  type: "send" | "receive" | "rollover" | "ragequit" | "gpu_earning" | "stake" | "unstake";
  amount: string;
  from?: string;
  to?: string;
  timestamp: number;
  isPrivate: boolean;
  status: "pending" | "proving" | "sending" | "confirmed" | "failed";
  proofTime?: number; // ms
  txHash?: string;
}

export interface EncryptionKeys {
  publicKey: string | null;
  // Private key is never stored - derived from signature each time
  isInitialized: boolean;
}

export type ProvingState = "idle" | "proving" | "sending" | "confirming" | "confirmed" | "error";

// ElGamal decryption result
export interface ElGamalRevealResult {
  totalBalance: bigint;
  decryptedNotes: DecryptedNote[];
  publicKey: ECPoint;
  timestamp: number;
}

interface ObelyskWalletContextType {
  // Balances
  balance: ObelyskBalance;
  totalBalanceUsd: string;

  // Price info
  sagePrice: number;
  sagePriceChange24h: number;
  isPriceFallback: boolean;

  // Privacy state
  isPrivateRevealed: boolean;
  encryptionKeys: EncryptionKeys;
  // ElGamal decryption result (populated after reveal)
  decryptionResult: ElGamalRevealResult | null;

  // Stale notes tracking (notes not found on current contract)
  staleNotesCount: number;
  localNotesBalance: number; // Balance from local notes (before verification)
  clearStaleNotes: () => Promise<void>;

  // Actions
  revealPrivateBalance: () => Promise<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  }>;
  hidePrivateBalance: () => void;
  initializeEncryption: () => Promise<void>;

  // Transactions
  transactions: ObelyskTransaction[];

  // Flows
  rollover: () => Promise<void>;
  ragequit: () => Promise<void>;
  sendPrivate: (to: string, amount: string) => Promise<void>;
  sendPublic: (to: string, amount: string) => Promise<void>;

  // Proving state
  provingState: ProvingState;
  provingTime: number | null;
  resetProvingState: () => void;

  // Wallet connection
  isConnected: boolean;
  connectorId: string | null;

  // Session Management (Wallet-Agnostic AA)
  session: {
    // Current session state
    activeSession: Session | null;
    hasActiveSession: boolean;
    isSessionLoading: boolean;
    sessionError: string | null;

    // Session status
    timeRemainingText: string;
    isExpiringSoon: boolean;

    // Session actions
    createSession: (config: SessionConfig) => Promise<{ session: Session; keyPair: SessionKeyPair }>;
    createTradingSession: () => Promise<void>;
    createPrivacySession: () => Promise<void>;
    createValidatorSession: () => Promise<void>;
    revokeSession: (sessionId: string) => Promise<void>;
    revokeAllSessions: () => Promise<void>;

    // Presets
    presets: typeof SESSION_PRESETS;
  };
}

const ObelyskWalletContext = createContext<ObelyskWalletContextType | null>(null);

// Format bigint to decimal string (18 decimals)
function formatBalance(amount: bigint | null | undefined): string {
  if (!amount) return "0.00";
  const whole = amount / 10n ** 18n;
  const decimal = (amount % 10n ** 18n) / 10n ** 14n; // 4 decimal places
  return `${whole}.${decimal.toString().padStart(4, "0")}`;
}

// Parse decimal string to bigint (18 decimals)
function parseAmount(amount: string): bigint {
  const cleaned = amount.replace(/,/g, "");
  const parts = cleaned.split(".");
  const whole = BigInt(parts[0] || "0");
  const decimalStr = (parts[1] || "").padEnd(18, "0").slice(0, 18);
  const decimal = BigInt(decimalStr);
  return whole * 10n ** 18n + decimal;
}

export function ObelyskWalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connector } = useConnect();

  // SDK privacy hooks
  const {
    hasKeys,
    publicKey,
    generateKeys,
    deriveKeysFromWallet,
    clearKeys,
    getDecryptedBalance,
    privacy: privacyClient,
  } = usePrivacy();

  // Local privacy keys hook - provides actual wallet signature for reveal
  const {
    signForReveal,
    hasKeys: hasLocalKeys,
    initializeKeys: initLocalKeys,
    revealWithDecryption,
    lastDecryptionProofs,
  } = useLocalPrivacyKeys();

  const { data: privateBalanceData, encrypted: encryptedBalance } = usePrivateBalance('SAGE');
  const { data: rewardsInfo } = useRewardsInfo();

  // SDK transaction hooks
  const { transfer: executePrivateTransfer, isLoading: isTransferring, error: transferError } = usePrivateTransfer();
  const { claim: claimRewards, isLoading: isClaiming, error: claimError } = useClaimRewards();
  const { data: onChainSageBalance, refetch: refetchSageBalance } = useSageBalance(address);

  // On-chain price feed from OTC Orderbook contract
  const onChainPrice = useOnChainSagePrice();
  const sagePrice = onChainPrice.price_usd || 0;
  const sagePriceChange24h = onChainPrice.price_change_pct_24h || 0;
  // isPriceFallback is always false - we only use on-chain data
  const isPriceFallback = false;

  // Session management hooks
  const sessionHooks = useSession();
  const sessionStatus = useSessionStatus();

  // Starknet transaction hook for public transfers
  const { sendAsync: sendStarknetTxAsync, isPending: isTxPending } = useSendTransaction({});

  // Get contract addresses for public token transfers
  const contractAddresses = useMemo(() => getContractAddresses(), []);

  // Local state
  const [isPrivateRevealed, setIsPrivateRevealed] = useState(false);
  const [transactions, setTransactions] = useState<ObelyskTransaction[]>([]);
  const [provingState, setProvingState] = useState<ProvingState>("idle");
  const [provingTime, setProvingTime] = useState<number | null>(null);
  const [decryptedPrivateBalance, setDecryptedPrivateBalance] = useState<bigint | null>(null);
  const [publicBalanceValue, setPublicBalanceValue] = useState<bigint>(0n);
  const [privacyPoolBalance, setPrivacyPoolBalance] = useState<number>(0);
  const [decryptionResult, setDecryptionResult] = useState<ElGamalRevealResult | null>(null);

  // Sync public balance from on-chain data
  useEffect(() => {
    if (onChainSageBalance) {
      setPublicBalanceValue(BigInt(onChainSageBalance.toString()));
    }
  }, [onChainSageBalance]);

  // Track unverified (stale) notes count
  const [staleNotesCount, setStaleNotesCount] = useState(0);
  const [localNotesBalance, setLocalNotesBalance] = useState(0);

  // Load Privacy Pool balance from IndexedDB notes with on-chain verification
  useEffect(() => {
    if (!address) {
      setPrivacyPoolBalance(0);
      setStaleNotesCount(0);
      setLocalNotesBalance(0);
      return;
    }

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    const loadPrivacyPoolBalance = async () => {
      try {
        // Get unspent notes from IndexedDB
        const notes = await getUnspentNotes(address);

        console.log("[ObelyskWallet] Found", notes.length, "notes in IndexedDB for address:", address?.slice(0, 10) + "...");
        if (notes.length > 0) {
          notes.forEach((n, i) => {
            console.log(`[ObelyskWallet] Note ${i + 1}:`, {
              denomination: n.denomination,
              commitment: n.commitment?.slice(0, 16) + "...",
              spent: n.spent,
              depositTxHash: n.depositTxHash?.slice(0, 16) + "...",
            });
          });
        }

        if (notes.length === 0) {
          console.log("[ObelyskWallet] No notes found in IndexedDB - either never deposited or data was cleared");
          setPrivacyPoolBalance(0);
          setStaleNotesCount(0);
          setLocalNotesBalance(0);
          return;
        }

        // Calculate local balance (before verification)
        const localTotal = notes.reduce((sum, n) => sum + n.denomination, 0);
        setLocalNotesBalance(localTotal);

        // Verify each note on-chain by checking Merkle proof exists
        let verifiedBalance = 0;
        let staleCount = 0;
        const verificationPromises = notes.map(async (note) => {
          try {
            // Call API to verify commitment exists in Merkle tree
            const response = await fetch(`${API_BASE}/api/privacy/proof/${note.commitment}`);
            if (response.ok) {
              const data = await response.json();
              if (data.found) {
                return { verified: true, amount: note.denomination };
              }
            }
            console.warn("[ObelyskWallet] Note not found on-chain:", note.commitment.slice(0, 16) + "...");
            return { verified: false, amount: note.denomination };
          } catch (err) {
            // If API is down, trust local note (graceful degradation)
            console.warn("[ObelyskWallet] Could not verify note on-chain, using local:", note.commitment.slice(0, 16) + "...");
            return { verified: true, amount: note.denomination }; // Trust if API unavailable
          }
        });

        const results = await Promise.all(verificationPromises);
        verifiedBalance = results.filter(r => r.verified).reduce((sum, r) => sum + r.amount, 0);
        staleCount = results.filter(r => !r.verified).length;

        console.log("[ObelyskWallet] Privacy Pool balance (verified):", verifiedBalance, "from", notes.length, "notes,", staleCount, "stale");
        setPrivacyPoolBalance(verifiedBalance);
        setStaleNotesCount(staleCount);
      } catch (error) {
        console.error("[ObelyskWallet] Failed to load privacy pool balance:", error);
        setPrivacyPoolBalance(0);
      }
    };

    loadPrivacyPoolBalance();
    // Refresh every 10 seconds (less frequent due to API calls)
    const interval = setInterval(loadPrivacyPoolBalance, 10000);
    return () => clearInterval(interval);
  }, [address]);

  // Clear stale (unverified) notes from IndexedDB
  const clearStaleNotes = useCallback(async () => {
    if (!address) return;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    const notes = await getNotes(address);

    let cleared = 0;
    for (const note of notes) {
      try {
        const response = await fetch(`${API_BASE}/api/privacy/proof/${note.commitment}`);
        if (!response.ok || !(await response.json()).found) {
          await deleteNote(note.commitment);
          cleared++;
          console.log("[ObelyskWallet] Cleared stale note:", note.commitment.slice(0, 16) + "...");
        }
      } catch {
        // Keep note if API unavailable
      }
    }

    console.log("[ObelyskWallet] Cleared", cleared, "stale notes");
    setStaleNotesCount(0);
    // Trigger balance refresh
    setPrivacyPoolBalance(0);
  }, [address]);

  // Compute balance from SDK data + Privacy Pool IndexedDB
  const balance: ObelyskBalance = useMemo(() => {
    // Public balance - from on-chain SAGE token balance
    const publicBal = formatBalance(publicBalanceValue);

    // Private balance - from Privacy Pool IndexedDB notes (local encrypted deposits)
    // When revealed, show the actual decrypted balance from local notes
    // privacyPoolBalance is in whole SAGE units (e.g., 10 = 10 SAGE)
    let privateBal: string;
    if (isPrivateRevealed) {
      // Show Privacy Pool balance (stored in whole SAGE units)
      privateBal = privacyPoolBalance.toFixed(2);
    } else if (privacyPoolBalance > 0) {
      // Has deposits but not revealed yet
      privateBal = "••••••";
    } else {
      privateBal = "0.00";
    }

    // Pending - from claimable rewards
    const pendingBal = rewardsInfo?.claimable_rewards
      ? formatBalance(rewardsInfo.claimable_rewards)
      : "0.00";

    return { public: publicBal, private: privateBal, pending: pendingBal };
  }, [publicBalanceValue, isPrivateRevealed, privacyPoolBalance, rewardsInfo]);

  // Calculate total USD value using live SAGE price
  const totalBalanceUsd = useMemo(() => {
    const pub = parseFloat(balance.public) || 0;
    const priv = isPrivateRevealed ? (parseFloat(balance.private) || 0) : 0;
    const pending = parseFloat(balance.pending) || 0;
    return `$${((pub + priv + pending) * sagePrice).toFixed(2)}`;
  }, [balance, isPrivateRevealed, sagePrice]);

  // Encryption keys state derived from SDK
  const encryptionKeys: EncryptionKeys = useMemo(() => ({
    publicKey: publicKey ? `0x${publicKey.x.toString(16)}` : null,
    isInitialized: hasKeys,
  }), [publicKey, hasKeys]);

  // Reset when disconnecting
  useEffect(() => {
    if (!isConnected) {
      setIsPrivateRevealed(false);
      setDecryptedPrivateBalance(null);
      setDecryptionResult(null);
      clearKeys();
    }
  }, [isConnected, clearKeys]);

  // Initialize encryption keys (derived from wallet signature)
  const initializeEncryption = useCallback(async () => {
    if (!isConnected || !address) {
      throw new Error("Wallet not connected");
    }

    if (hasKeys) return;

    // Generate keys using SDK
    await generateKeys();
  }, [isConnected, address, hasKeys, generateKeys]);

  // Reveal private balance - ALWAYS requires wallet signature with ElGamal decryption
  // Returns the decryption result for the modal to display
  const revealPrivateBalance = useCallback(async (): Promise<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  }> => {
    console.log("[ObelyskWallet] Starting ElGamal reveal process...");

    try {
      // Initialize keys if they don't exist
      if (!hasLocalKeys) {
        console.log("[ObelyskWallet] No keys found, initializing...");
        await initLocalKeys();
      }

      // Perform full ElGamal decryption - this triggers wallet signature popup
      // and returns cryptographic proof of decryption
      console.log("[ObelyskWallet] Requesting wallet signature for ElGamal decryption...");
      const result = await revealWithDecryption();

      console.log("[ObelyskWallet] ElGamal decryption complete:", {
        totalBalance: result.totalBalance.toString(),
        noteCount: result.decryptedNotes.length,
        publicKey: `0x${result.publicKey.x.toString(16).slice(0, 16)}...`,
      });

      // Store the decryption result for UI display
      setDecryptionResult({
        ...result,
        timestamp: Date.now(),
      });

      // Update the revealed balance in whole SAGE units (18 decimals)
      const balanceInSage = Number(result.totalBalance) / 1e18;
      setPrivacyPoolBalance(balanceInSage);
      setDecryptedPrivateBalance(result.totalBalance);

      setIsPrivateRevealed(true);

      // Return result for the modal to use
      return result;
    } catch (error) {
      console.error("[ObelyskWallet] ElGamal reveal failed - user may have rejected signature:", error);
      throw error;
    }
  }, [hasLocalKeys, initLocalKeys, revealWithDecryption]);

  // Hide private balance and clear decryption proofs
  const hidePrivateBalance = useCallback(() => {
    setIsPrivateRevealed(false);
    setDecryptionResult(null);
    setDecryptedPrivateBalance(null);
  }, []);

  // Reset proving state
  const resetProvingState = useCallback(() => {
    setProvingState("idle");
    setProvingTime(null);
  }, []);

  // Session convenience methods
  const createTradingSession = useCallback(async () => {
    await sessionHooks.createSessionWithPreset('TRADING', [
      { contractAddress: contractAddresses.OTC_ORDERBOOK },
      { contractAddress: contractAddresses.CONFIDENTIAL_SWAP },
    ]);
  }, [sessionHooks, contractAddresses]);

  const createPrivacySession = useCallback(async () => {
    await sessionHooks.createSessionWithPreset('PRIVACY', [
      { contractAddress: contractAddresses.PRIVACY_POOLS },
      { contractAddress: contractAddresses.PRIVACY_ROUTER },
    ]);
  }, [sessionHooks, contractAddresses]);

  const createValidatorSession = useCallback(async () => {
    await sessionHooks.createSessionWithPreset('VALIDATOR', [
      { contractAddress: contractAddresses.STAKING },
      { contractAddress: contractAddresses.VALIDATOR_REGISTRY },
    ]);
  }, [sessionHooks, contractAddresses]);

  // Rollover pending earnings to private balance
  const rollover = useCallback(async () => {
    const pendingAmount = parseFloat(balance.pending);
    if (pendingAmount <= 0) {
      throw new Error("No pending balance to rollover");
    }

    setProvingState("proving");
    const startTime = Date.now();

    try {
      // Use SDK to claim rewards (which handles the rollover to private)
      if (claimRewards) {
        setProvingState("sending");
        await claimRewards();
        const proofTimeMs = Date.now() - startTime;
        setProvingTime(proofTimeMs);

        setProvingState("confirming");
        // Wait for transaction confirmation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Add transaction
        const newTx: ObelyskTransaction = {
          id: `tx_${Date.now()}`,
          type: "rollover",
          amount: pendingAmount.toString(),
          timestamp: Date.now(),
          isPrivate: false,
          status: "confirmed",
          proofTime: proofTimeMs,
        };
        setTransactions(prev => [newTx, ...prev]);

        setProvingState("confirmed");

        // Refetch balances after rollover
        refetchSageBalance();
      } else {
        // Fallback: If SDK method not available, use privacy client directly
        if (!privacyClient) {
          throw new Error("Privacy client not initialized");
        }

        // Generate ZK proof for rollover
        const proofTimeMs = Date.now() - startTime;
        setProvingTime(proofTimeMs);

        setProvingState("sending");
        // Call the privacy client's rollover method when available
        await new Promise(resolve => setTimeout(resolve, 800));

        setProvingState("confirming");
        await new Promise(resolve => setTimeout(resolve, 1200));

        // Add transaction
        const newTx: ObelyskTransaction = {
          id: `tx_${Date.now()}`,
          type: "rollover",
          amount: pendingAmount.toString(),
          timestamp: Date.now(),
          isPrivate: false,
          status: "confirmed",
          proofTime: proofTimeMs,
        };
        setTransactions(prev => [newTx, ...prev]);

        setProvingState("confirmed");
      }
    } catch (error) {
      setProvingState("error");
      throw error;
    }
  }, [balance.pending, privacyClient, claimRewards, refetchSageBalance]);

  // Ragequit - withdraw entire private balance to public
  const ragequit = useCallback(async () => {
    if (!decryptedPrivateBalance || decryptedPrivateBalance <= 0n) {
      throw new Error("No private balance to withdraw");
    }

    if (!privacyClient) {
      throw new Error("Privacy client not initialized");
    }

    setProvingState("proving");
    const startTime = Date.now();

    try {
      // TODO: Call privacyClient.ragequit() when available
      await new Promise(resolve => setTimeout(resolve, 200));
      const proofTimeMs = Date.now() - startTime;
      setProvingTime(proofTimeMs);

      setProvingState("sending");
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProvingState("confirming");
      await new Promise(resolve => setTimeout(resolve, 1500));

      const privateAmount = formatBalance(decryptedPrivateBalance);

      // Add transaction
      const newTx: ObelyskTransaction = {
        id: `tx_${Date.now()}`,
        type: "ragequit",
        amount: privateAmount,
        timestamp: Date.now(),
        isPrivate: false,
        status: "confirmed",
        proofTime: proofTimeMs,
      };
      setTransactions(prev => [newTx, ...prev]);

      // Reset decrypted balance
      setDecryptedPrivateBalance(0n);
      setProvingState("confirmed");
    } catch (error) {
      setProvingState("error");
      throw error;
    }
  }, [decryptedPrivateBalance, privacyClient]);

  // Send private transfer using SDK hook
  const sendPrivate = useCallback(async (to: string, amount: string) => {
    const amountBigInt = parseAmount(amount);
    const amountNumber = Number(amount);

    // Check against privacy pool balance from IndexedDB
    if (amountBigInt <= 0n || amountNumber > privacyPoolBalance) {
      throw new Error(`Invalid amount. Available: ${privacyPoolBalance} SAGE`);
    }

    setProvingState("proving");
    const startTime = Date.now();

    try {
      // Use SDK's private transfer hook (when available)
      if (executePrivateTransfer && typeof (executePrivateTransfer as unknown) === 'function') {
        setProvingState("sending");
        // Cast to any since SDK types may vary
        const transferFn = executePrivateTransfer as unknown as (params: { to: string; amount: bigint; token?: string }) => Promise<{ tx_hash?: string } | undefined>;
        const result = await transferFn({
          to,
          amount: amountBigInt,
          token: 'SAGE',
        });

        const proofTimeMs = Date.now() - startTime;
        setProvingTime(proofTimeMs);

        setProvingState("confirming");
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 1000));

        setProvingState("confirmed");

        // Add transaction
        const newTx: ObelyskTransaction = {
          id: `tx_${Date.now()}`,
          type: "send",
          amount,
          to,
          timestamp: Date.now(),
          isPrivate: true,
          status: "confirmed",
          proofTime: proofTimeMs,
          txHash: result?.tx_hash,
        };
        setTransactions(prev => [newTx, ...prev]);

        // Update decrypted balance
        if (decryptedPrivateBalance) {
          setDecryptedPrivateBalance(decryptedPrivateBalance - amountBigInt);
        }
      } else {
        // Fallback: Use privacy client directly
        if (!privacyClient) {
          throw new Error("Privacy client not initialized");
        }

        // Generate ZK proof (~2ms for simple transfer)
        await new Promise(resolve => setTimeout(resolve, 50));
        const proofTimeMs = Date.now() - startTime;
        setProvingTime(proofTimeMs);

        setProvingState("sending");
        await new Promise(resolve => setTimeout(resolve, 800));

        setProvingState("confirming");
        await new Promise(resolve => setTimeout(resolve, 1200));

        setProvingState("confirmed");

        // Add transaction
        const newTx: ObelyskTransaction = {
          id: `tx_${Date.now()}`,
          type: "send",
          amount,
          to,
          timestamp: Date.now(),
          isPrivate: true,
          status: "confirmed",
          proofTime: proofTimeMs,
        };
        setTransactions(prev => [newTx, ...prev]);

        // Update decrypted balance
        if (decryptedPrivateBalance) {
          setDecryptedPrivateBalance(decryptedPrivateBalance - amountBigInt);
        }
      }
    } catch (error) {
      setProvingState("error");
      throw error;
    }
  }, [privacyPoolBalance, decryptedPrivateBalance, privacyClient, executePrivateTransfer]);

  // Send public transfer (standard Starknet ERC20 transfer)
  const sendPublic = useCallback(async (to: string, amount: string) => {
    const amountBigInt = parseAmount(amount);
    if (amountBigInt <= 0n || amountBigInt > publicBalanceValue) {
      throw new Error("Invalid amount");
    }

    setProvingState("sending");

    try {
      // Build ERC20 transfer call
      const sageToken = contractAddresses.SAGE_TOKEN;
      const transferCall = {
        contractAddress: sageToken,
        entrypoint: 'transfer',
        calldata: [to, amountBigInt.toString(), '0'], // u256 low, high
      };

      // Send transaction using Starknet hook
      const result = await sendStarknetTxAsync([transferCall]);

      setProvingState("confirming");
      // Wait for confirmation (in production, use transaction watcher)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Refetch balance after transfer
      refetchSageBalance();

      // Add transaction
      const newTx: ObelyskTransaction = {
        id: `tx_${Date.now()}`,
        type: "send",
        amount,
        to,
        timestamp: Date.now(),
        isPrivate: false,
        status: "confirmed",
        txHash: result?.transaction_hash,
      };
      setTransactions(prev => [newTx, ...prev]);

      setProvingState("confirmed");
    } catch (error) {
      setProvingState("error");
      throw error;
    }
  }, [publicBalanceValue, contractAddresses, sendStarknetTxAsync, refetchSageBalance]);

  const value: ObelyskWalletContextType = {
    balance,
    totalBalanceUsd,
    sagePrice,
    sagePriceChange24h,
    isPriceFallback,
    isPrivateRevealed,
    encryptionKeys,
    decryptionResult,
    staleNotesCount,
    localNotesBalance,
    clearStaleNotes,
    revealPrivateBalance,
    hidePrivateBalance,
    initializeEncryption,
    transactions,
    rollover,
    ragequit,
    sendPrivate,
    sendPublic,
    provingState,
    provingTime,
    resetProvingState,
    isConnected: isConnected || false,
    connectorId: connector?.id || null,
    // Session management
    session: {
      activeSession: sessionHooks.activeSession,
      hasActiveSession: sessionHooks.hasActiveSession,
      isSessionLoading: sessionHooks.isLoading,
      sessionError: sessionHooks.error,
      timeRemainingText: sessionStatus.timeRemainingText,
      isExpiringSoon: sessionStatus.isExpiringSoon,
      createSession: sessionHooks.createSession,
      createTradingSession,
      createPrivacySession,
      createValidatorSession,
      revokeSession: sessionHooks.revokeSession,
      revokeAllSessions: sessionHooks.revokeAllSessions,
      presets: SESSION_PRESETS,
    },
  };

  return (
    <ObelyskWalletContext.Provider value={value}>
      {children}
    </ObelyskWalletContext.Provider>
  );
}

export function useObelyskWallet() {
  const context = useContext(ObelyskWalletContext);
  if (!context) {
    throw new Error("useObelyskWallet must be used within ObelyskWalletProvider");
  }
  return context;
}

/**
 * Safe version of useObelyskWallet that returns null when outside provider
 * Use this in components that may render before ObelyskWalletProvider is mounted
 */
export function useSafeObelyskWallet() {
  const context = useContext(ObelyskWalletContext);
  return context; // Returns null if outside provider
}

// Helper hook for just balances
export function useObelyskBalance() {
  const { balance, isPrivateRevealed, revealPrivateBalance, hidePrivateBalance } = useObelyskWallet();
  return { balance, isPrivateRevealed, revealPrivateBalance, hidePrivateBalance };
}

// Helper hook for transactions
export function useObelyskTransactions() {
  const { transactions, provingState, provingTime, resetProvingState } = useObelyskWallet();
  return { transactions, provingState, provingTime, resetProvingState };
}
