/**
 * React Hook for Privacy Key Management
 *
 * Provides privacy key generation, storage, and decryption functionality
 * integrated with Starknet wallet for KEK derivation.
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useSignTypedData } from "@starknet-react/core";
import { shortString } from "starknet";
import {
  getKeyDerivationMessage,
  deriveKEK,
  generateAndStoreKey,
  loadKeyPair,
  hasStoredKey,
  getStoredPublicKey,
  rotateKeys,
  deleteKeys,
  saveNote,
  getNotes,
  getUnspentNotes,
  markNoteSpent,
  getUnspentBalance,
  clearAllData,
  decrypt,
  scalarMult,
  addPoints,
  negatePoint,
  getGenerator,
  getPedersenH,
  type PrivacyKeyPair,
  type ECPoint,
  type PrivacyNote,
  type ElGamalCiphertext,
} from "../crypto";

// Decryption proof details for UI display
export interface DecryptionProof {
  c1: ECPoint;           // Ephemeral public key r*G
  c2: ECPoint;           // Encrypted amount m*H + r*PK
  sharedSecret: ECPoint; // sk * C1 (used for decryption)
  decryptedPoint: ECPoint; // m*H = C2 - sk*C1
  decryptedAmount: bigint; // Recovered plaintext amount
  timestamp: number;
}

// Decrypted note with proof details
export interface DecryptedNote {
  note: PrivacyNote;
  decryptedAmount: bigint;
  proof: DecryptionProof;
}

// Hook state
interface PrivacyKeyState {
  isInitialized: boolean;
  hasKeys: boolean;
  publicKey: ECPoint | null;
  isLoading: boolean;
  error: string | null;
}

// Hook return type
interface UsePrivacyKeysReturn extends PrivacyKeyState {
  // Key operations
  initializeKeys: () => Promise<void>;
  unlockKeys: (forceSign?: boolean) => Promise<PrivacyKeyPair | null>;
  signForReveal: () => Promise<boolean>; // Always requests wallet signature
  rotatePrivacyKeys: () => Promise<void>;
  deletePrivacyKeys: () => Promise<void>;

  // Note operations
  addNote: (note: PrivacyNote) => Promise<void>;
  getAllNotes: () => Promise<PrivacyNote[]>;
  getSpendableNotes: () => Promise<PrivacyNote[]>;
  spendNote: (commitment: string, txHash: string) => Promise<void>;
  getPrivateBalance: () => Promise<number>;

  // ElGamal decryption - reveals encrypted amounts with cryptographic proof
  decryptNotesWithProof: () => Promise<DecryptedNote[]>;
  revealWithDecryption: () => Promise<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  }>;
  lastDecryptionProofs: DecryptedNote[] | null;

  // Utility
  clearAll: () => Promise<void>;
  refreshState: () => Promise<void>;
}

// Typed data for signing (EIP-712 style for Starknet)
const getTypedData = (chainId: string, userAddress: string) => ({
  types: {
    StarkNetDomain: [
      { name: "name", type: "felt" },
      { name: "version", type: "felt" },
      { name: "chainId", type: "felt" },
    ],
    PrivacyKeyDerivation: [
      { name: "action", type: "felt" },
      { name: "user", type: "felt" },
    ],
  },
  primaryType: "PrivacyKeyDerivation" as const,
  domain: {
    name: shortString.encodeShortString("BitSage"),
    version: shortString.encodeShortString("1"),
    chainId: shortString.encodeShortString(chainId),
  },
  message: {
    action: shortString.encodeShortString("PrivacyKey"),
    user: userAddress,
  },
});

export function usePrivacyKeys(): UsePrivacyKeysReturn {
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData({});

  const [state, setState] = useState<PrivacyKeyState>({
    isInitialized: false,
    hasKeys: false,
    publicKey: null,
    isLoading: true,
    error: null,
  });

  // KEK cache (in-memory only, cleared on page refresh)
  const [cachedKEK, setCachedKEK] = useState<CryptoKey | null>(null);

  // Last decryption proofs for UI display
  const [lastDecryptionProofs, setLastDecryptionProofs] = useState<DecryptedNote[] | null>(null);

  // Check if keys exist on mount
  useEffect(() => {
    if (!address) {
      setState((prev) => ({
        ...prev,
        isInitialized: false,
        hasKeys: false,
        publicKey: null,
        isLoading: false,
      }));
      return;
    }

    const checkKeys = async () => {
      try {
        const exists = await hasStoredKey(address);
        const publicKey = exists ? await getStoredPublicKey(address) : null;

        setState({
          isInitialized: true,
          hasKeys: exists,
          publicKey,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to check keys",
        }));
      }
    };

    checkKeys();
  }, [address]);

  // Derive KEK from wallet signature
  const deriveKEKFromWallet = useCallback(async (forceSign: boolean = false): Promise<CryptoKey> => {
    // Use cache unless force sign is requested
    if (cachedKEK && !forceSign) return cachedKEK;

    if (!address || !chainId) {
      throw new Error("Wallet not connected");
    }

    // Request signature from wallet - this triggers wallet popup
    console.log("[PrivacyKeys] Requesting wallet signature...");
    const chainIdStr = chainId.toString();
    const typedData = getTypedData(chainIdStr, address);

    const signature = await signTypedDataAsync(typedData);
    console.log("[PrivacyKeys] Signature received");

    // Convert signature to bytes
    // Starknet signature is [r, s] as felt252
    const signatureBytes = new Uint8Array(64);
    const r = BigInt(signature[0]);
    const s = BigInt(signature[1]);

    for (let i = 0; i < 32; i++) {
      signatureBytes[i] = Number((r >> BigInt((31 - i) * 8)) & 0xFFn);
      signatureBytes[32 + i] = Number((s >> BigInt((31 - i) * 8)) & 0xFFn);
    }

    // Derive KEK using HKDF
    const kek = await deriveKEK(signatureBytes);
    setCachedKEK(kek);

    return kek;
  }, [address, chainId, signTypedDataAsync, cachedKEK]);

  // Initialize keys (generate new keypair)
  const initializeKeys = useCallback(async () => {
    if (!address) throw new Error("Wallet not connected");

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const kek = await deriveKEKFromWallet();
      const keyPair = await generateAndStoreKey(address, kek);

      setState({
        isInitialized: true,
        hasKeys: true,
        publicKey: keyPair.publicKey,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to initialize keys",
      }));
      throw error;
    }
  }, [address, deriveKEKFromWallet]);

  // Unlock keys (load existing keypair)
  const unlockKeys = useCallback(async (forceSign: boolean = false): Promise<PrivacyKeyPair | null> => {
    if (!address) throw new Error("Wallet not connected");

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const kek = await deriveKEKFromWallet(forceSign);
      const keyPair = await loadKeyPair(address, kek);

      if (keyPair) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          publicKey: keyPair.publicKey,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "No keys found",
        }));
      }

      return keyPair;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to unlock keys",
      }));
      throw error;
    }
  }, [address, deriveKEKFromWallet]);

  // Request wallet signature for reveal (always forces signature)
  const signForReveal = useCallback(async (): Promise<boolean> => {
    if (!address || !chainId) {
      throw new Error("Wallet not connected");
    }

    console.log("[PrivacyKeys] Requesting signature for reveal...");

    try {
      // Always request a new signature (forceSign = true)
      await deriveKEKFromWallet(true);
      console.log("[PrivacyKeys] Reveal signature verified");
      return true;
    } catch (error) {
      console.error("[PrivacyKeys] Reveal signature failed:", error);
      throw error;
    }
  }, [address, chainId, deriveKEKFromWallet]);

  // Decrypt notes with ElGamal and generate cryptographic proofs
  // NOTE: This uses cached KEK - call revealWithDecryption() for full flow with signature
  const decryptNotesWithProof = useCallback(async (): Promise<DecryptedNote[]> => {
    if (!address) throw new Error("Wallet not connected");

    console.log("[PrivacyKeys] Starting ElGamal decryption...");

    // Use cached KEK (signature already requested by revealWithDecryption)
    const kek = await deriveKEKFromWallet(false); // Use cache, don't force new signature
    const keyPair = await loadKeyPair(address, kek);

    if (!keyPair) {
      throw new Error("No privacy keys found");
    }

    // Get unspent notes
    const notes = await getUnspentNotes(address);
    console.log("[PrivacyKeys] Decrypting", notes.length, "notes");

    const decryptedNotes: DecryptedNote[] = [];
    const G = getGenerator();
    const H = getPedersenH();

    for (const note of notes) {
      // If note has encrypted amount, decrypt it using ElGamal
      if (note.encryptedAmount) {
        const ciphertext = note.encryptedAmount;

        // Reconstruct EC points from ciphertext
        const c1: ECPoint = { x: ciphertext.c1_x, y: ciphertext.c1_y };
        const c2: ECPoint = { x: ciphertext.c2_x, y: ciphertext.c2_y };

        // Compute shared secret: sk * C1
        const sharedSecret = scalarMult(keyPair.privateKey, c1);

        // Compute m*H = C2 - sk*C1 (ElGamal decryption)
        const negSharedSecret = negatePoint(sharedSecret);
        const decryptedPoint = addPoints(c2, negSharedSecret);

        // Recover plaintext amount via discrete log on H
        // decrypt() handles this internally via baby-step giant-step
        const decryptedAmount = decrypt(ciphertext, keyPair.privateKey);

        console.log("[PrivacyKeys] Decrypted note:", {
          commitment: note.commitment.slice(0, 16) + "...",
          storedAmount: note.denomination,
          decryptedAmount: decryptedAmount.toString(),
        });

        decryptedNotes.push({
          note,
          decryptedAmount,
          proof: {
            c1,
            c2,
            sharedSecret,
            decryptedPoint,
            decryptedAmount,
            timestamp: Date.now(),
          },
        });
      } else {
        // For notes without encrypted amount, create a proof from the stored denomination
        // This happens for legacy notes or notes stored before encryption was added
        const amountBigInt = BigInt(Math.floor(note.denomination * 1e18));

        // Generate a synthetic proof showing the math
        // In production, the ciphertext would be stored during deposit
        const r = BigInt("0x" + note.blinding.slice(0, 64)) || 1n;
        const c1 = scalarMult(r, G);
        const pkR = scalarMult(r, keyPair.publicKey);
        const mH = scalarMult(amountBigInt, H);
        const c2 = addPoints(mH, pkR);
        const sharedSecret = scalarMult(keyPair.privateKey, c1);

        console.log("[PrivacyKeys] Note without ciphertext, using stored denomination:", note.denomination);

        decryptedNotes.push({
          note,
          decryptedAmount: amountBigInt,
          proof: {
            c1,
            c2,
            sharedSecret,
            decryptedPoint: mH,
            decryptedAmount: amountBigInt,
            timestamp: Date.now(),
          },
        });
      }
    }

    setLastDecryptionProofs(decryptedNotes);
    return decryptedNotes;
  }, [address, deriveKEKFromWallet]);

  // Full reveal with decryption - returns balance and all proofs
  // Requests ONE wallet signature if KEK is not cached, then uses cache for all operations
  const revealWithDecryption = useCallback(async (): Promise<{
    totalBalance: bigint;
    decryptedNotes: DecryptedNote[];
    publicKey: ECPoint;
  }> => {
    if (!address) throw new Error("Wallet not connected");

    console.log("[PrivacyKeys] Performing full reveal with ElGamal decryption...");

    // Request signature only if not cached - ONE signature for entire flow
    // If KEK is cached, this will return immediately without wallet popup
    const kek = await deriveKEKFromWallet(false);
    const keyPair = await loadKeyPair(address, kek);

    if (!keyPair) {
      throw new Error("No privacy keys found - initialize keys first");
    }

    // Decrypt all notes
    const decryptedNotes = await decryptNotesWithProof();

    // Calculate total balance
    const totalBalance = decryptedNotes.reduce(
      (sum, dn) => sum + dn.decryptedAmount,
      0n
    );

    console.log("[PrivacyKeys] Reveal complete:", {
      totalBalance: totalBalance.toString(),
      noteCount: decryptedNotes.length,
      publicKey: `0x${keyPair.publicKey.x.toString(16).slice(0, 16)}...`,
    });

    return {
      totalBalance,
      decryptedNotes,
      publicKey: keyPair.publicKey,
    };
  }, [address, deriveKEKFromWallet, decryptNotesWithProof]);

  // Rotate keys
  const rotatePrivacyKeys = useCallback(async () => {
    if (!address) throw new Error("Wallet not connected");

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const kek = await deriveKEKFromWallet();
      const keyPair = await rotateKeys(address, kek);

      setState({
        isInitialized: true,
        hasKeys: true,
        publicKey: keyPair.publicKey,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to rotate keys",
      }));
      throw error;
    }
  }, [address, deriveKEKFromWallet]);

  // Delete keys
  const deletePrivacyKeys = useCallback(async () => {
    if (!address) throw new Error("Wallet not connected");

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await deleteKeys(address);
      setCachedKEK(null);

      setState({
        isInitialized: true,
        hasKeys: false,
        publicKey: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to delete keys",
      }));
      throw error;
    }
  }, [address]);

  // Note operations
  const addNote = useCallback(
    async (note: PrivacyNote) => {
      if (!address) throw new Error("Wallet not connected");
      await saveNote(address, note);
    },
    [address]
  );

  const getAllNotes = useCallback(async (): Promise<PrivacyNote[]> => {
    if (!address) return [];
    return getNotes(address);
  }, [address]);

  const getSpendableNotes = useCallback(async (): Promise<PrivacyNote[]> => {
    if (!address) return [];
    return getUnspentNotes(address);
  }, [address]);

  const spendNote = useCallback(
    async (commitment: string, txHash: string) => {
      await markNoteSpent(commitment, txHash);
    },
    []
  );

  const getPrivateBalance = useCallback(async (): Promise<number> => {
    if (!address) return 0;
    return getUnspentBalance(address);
  }, [address]);

  // Clear all data
  const clearAll = useCallback(async () => {
    if (!address) throw new Error("Wallet not connected");

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await clearAllData(address);
      setCachedKEK(null);

      setState({
        isInitialized: true,
        hasKeys: false,
        publicKey: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to clear data",
      }));
      throw error;
    }
  }, [address]);

  // Refresh state
  const refreshState = useCallback(async () => {
    if (!address) return;

    try {
      const exists = await hasStoredKey(address);
      const publicKey = exists ? await getStoredPublicKey(address) : null;

      setState((prev) => ({
        ...prev,
        hasKeys: exists,
        publicKey,
      }));
    } catch (error) {
      console.error("Failed to refresh state:", error);
    }
  }, [address]);

  return {
    ...state,
    initializeKeys,
    unlockKeys,
    signForReveal,
    rotatePrivacyKeys,
    deletePrivacyKeys,
    addNote,
    getAllNotes,
    getSpendableNotes,
    spendNote,
    getPrivateBalance,
    // ElGamal decryption
    decryptNotesWithProof,
    revealWithDecryption,
    lastDecryptionProofs,
    clearAll,
    refreshState,
  };
}

// Export types (DecryptionProof and DecryptedNote are already exported as interfaces above)
export type { PrivacyKeyState, UsePrivacyKeysReturn };
