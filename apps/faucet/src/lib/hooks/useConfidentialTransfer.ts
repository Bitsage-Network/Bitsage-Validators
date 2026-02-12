/**
 * useConfidentialTransfer Hook
 *
 * Frontend integration with the ConfidentialTransfer contract (Tongo-style privacy).
 * Handles encrypted balance management, transfers, and O(1) decryption with AE hints.
 *
 * Uses usePrivacyKeys for proper wallet-based key management.
 */

"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import { RpcProvider, CallData } from "starknet";
import {
  encrypt,
  randomScalar,
  type ECPoint,
  type ElGamalCiphertext,
  // ZK Proofs
  generateTransferProof as generateZKTransferProof,
  transferProofToCalldata,
  type TransferProof as ZKTransferProof,
} from "../crypto";
import {
  createAEHintFromRandomness,
  hybridDecrypt,
  type AEHint,
} from "../crypto/aeHints";
import { usePrivacyKeys } from "./usePrivacyKeys";

// Contract address from env
const CONFIDENTIAL_TRANSFER_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_TRANSFER_ADDRESS ||
  "0x626df6abac7e4c2140d8a2e2024503431a5492526adda96f78c1b623a855b";

// Asset IDs (matching Cairo contract)
export const ASSET_IDS = {
  SAGE: "0x53414745",
  STRK: "0x5354524b",
  USDC: "0x55534443",
} as const;

export type AssetId = keyof typeof ASSET_IDS;

// Hook state
export interface ConfidentialTransferState {
  isLoading: boolean;
  error: string | null;
  isRegistered: boolean;
  balances: Record<AssetId, bigint>;
  pendingIn: Record<AssetId, bigint>;
  pendingOut: Record<AssetId, bigint>;
}

// Transfer proof structure (matches Cairo contract)
export interface TransferProof {
  ownership_a: { x: string; y: string };
  ownership_s: string;
  ownership_c: string;
  blinding_a: { x: string; y: string };
  blinding_s: string;
  enc_a_l: { x: string; y: string };
  enc_s_b: string;
  enc_s_r: string;
  range_commitment: { x: string; y: string };
  range_challenge: string;
  range_response_l: string;
  range_response_r: string;
  balance_commitment: { x: string; y: string };
  balance_response: string;
}

// Hook return type
export interface UseConfidentialTransferReturn {
  state: ConfidentialTransferState;
  // Account
  register: () => Promise<void>;
  isRegistered: () => Promise<boolean>;
  // Funding
  fund: (asset: AssetId, amount: bigint) => Promise<string>;
  // Transfers
  transfer: (to: string, asset: AssetId, amount: bigint) => Promise<string>;
  // Rollover
  rollover: (asset: AssetId) => Promise<string>;
  // Withdrawal
  withdraw: (to: string, asset: AssetId, amount: bigint) => Promise<string>;
  // Balance
  getBalance: (asset: AssetId) => Promise<bigint>;
  refreshBalances: () => Promise<void>;
  // Utils
  generateProof: (amount: bigint, balance: bigint) => Promise<TransferProof>;
}

/**
 * Generate transfer proof using proper ZK circuits
 * Uses Schnorr ownership proofs, range proofs, and balance proofs
 */
function generateProofForTransfer(
  privateKey: bigint,
  publicKey: ECPoint,
  amount: bigint,
  balance: bigint,
  randomness: bigint
): TransferProof {
  // Use the proper ZK proof generation
  const zkProof = generateZKTransferProof(
    privateKey,
    publicKey,
    amount,
    balance,
    randomness
  );

  // Convert to contract format
  return {
    ownership_a: {
      x: zkProof.ownership_a.x.toString(),
      y: zkProof.ownership_a.y.toString(),
    },
    ownership_s: zkProof.ownership_s.toString(),
    ownership_c: zkProof.ownership_c.toString(),
    blinding_a: {
      x: zkProof.blinding_a.x.toString(),
      y: zkProof.blinding_a.y.toString(),
    },
    blinding_s: zkProof.blinding_s.toString(),
    enc_a_l: {
      x: zkProof.enc_a_l.x.toString(),
      y: zkProof.enc_a_l.y.toString(),
    },
    enc_s_b: zkProof.enc_s_b.toString(),
    enc_s_r: zkProof.enc_s_r.toString(),
    range_commitment: {
      x: zkProof.range_commitment.x.toString(),
      y: zkProof.range_commitment.y.toString(),
    },
    range_challenge: zkProof.range_challenge.toString(),
    range_response_l: zkProof.range_response_l.toString(),
    range_response_r: zkProof.range_response_r.toString(),
    balance_commitment: {
      x: zkProof.balance_commitment.x.toString(),
      y: zkProof.balance_commitment.y.toString(),
    },
    balance_response: zkProof.balance_response.toString(),
  };
}

/**
 * Main hook for confidential transfer operations
 */
export function useConfidentialTransfer(): UseConfidentialTransferReturn {
  const { address, account } = useAccount();
  const { sendAsync } = useSendTransaction({});

  // Use privacy keys hook for proper key management
  const {
    hasKeys,
    publicKey,
    isLoading: keysLoading,
    initializeKeys,
    unlockKeys,
  } = usePrivacyKeys();

  // State
  const [state, setState] = useState<ConfidentialTransferState>({
    isLoading: false,
    error: null,
    isRegistered: false,
    balances: { SAGE: 0n, STRK: 0n, USDC: 0n },
    pendingIn: { SAGE: 0n, STRK: 0n, USDC: 0n },
    pendingOut: { SAGE: 0n, STRK: 0n, USDC: 0n },
  });

  // Provider for read calls
  const provider = useMemo(
    () => new RpcProvider({
      nodeUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.starknet-testnet.lava.build",
    }),
    []
  );

  /**
   * Check if user is registered
   */
  const isRegistered = useCallback(async (): Promise<boolean> => {
    if (!address) return false;

    try {
      const result = await provider.callContract({
        contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
        entrypoint: "get_public_key",
        calldata: [address],
      });

      // Check if public key is non-zero
      const pkX = BigInt(result[0] || "0");
      const pkY = BigInt(result[1] || "0");
      return pkX !== 0n || pkY !== 0n;
    } catch (error) {
      console.error("[ConfidentialTransfer] isRegistered error:", error);
      return false;
    }
  }, [address, provider]);

  /**
   * Register with a new public key
   */
  const register = useCallback(async (): Promise<void> => {
    if (!address || !account) {
      throw new Error("Wallet not connected");
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Check if already registered on-chain
      const registered = await isRegistered();
      if (registered) {
        console.log("[ConfidentialTransfer] Already registered on-chain");
        setState((s) => ({ ...s, isLoading: false, isRegistered: true }));
        return;
      }

      // Initialize or unlock privacy keys using usePrivacyKeys hook
      let userPublicKey = publicKey;
      if (!hasKeys) {
        console.log("[ConfidentialTransfer] Initializing privacy keys...");
        await initializeKeys();
        // Wait for keys to be available
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Failed to initialize privacy keys");
        }
        userPublicKey = keyPair.publicKey;
      } else if (!userPublicKey) {
        console.log("[ConfidentialTransfer] Unlocking existing keys...");
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Failed to unlock privacy keys");
        }
        userPublicKey = keyPair.publicKey;
      }

      if (!userPublicKey) {
        throw new Error("No public key available");
      }

      // Register public key on-chain
      const pkCalldata = {
        x: "0x" + userPublicKey.x.toString(16),
        y: "0x" + userPublicKey.y.toString(16),
      };

      console.log("[ConfidentialTransfer] Registering public key:", pkCalldata);

      const tx = await sendAsync([
        {
          contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
          entrypoint: "register",
          calldata: CallData.compile([pkCalldata]),
        },
      ]);

      console.log("[ConfidentialTransfer] Register TX:", tx.transaction_hash);
      await provider.waitForTransaction(tx.transaction_hash);

      setState((s) => ({ ...s, isLoading: false, isRegistered: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to register";
      setState((s) => ({ ...s, isLoading: false, error: message }));
      throw error;
    }
  }, [address, account, sendAsync, provider, isRegistered, hasKeys, publicKey, initializeKeys, unlockKeys]);

  /**
   * Fund private balance (public -> private)
   */
  const fund = useCallback(
    async (asset: AssetId, amount: bigint): Promise<string> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        // Unlock keypair using privacy keys hook
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found. Please register first.");
        }

        // Generate randomness
        const randomness = randomScalar();

        // Create AE hint for O(1) decryption
        const aeHint = createAEHintFromRandomness(amount, randomness, keyPair.publicKey);

        console.log("[ConfidentialTransfer] Funding:", { asset, amount: amount.toString() });

        // First approve token transfer
        const tokenAddress = getTokenAddress(asset);
        const approveTx = await sendAsync([
          {
            contractAddress: tokenAddress,
            entrypoint: "approve",
            calldata: [CONFIDENTIAL_TRANSFER_ADDRESS, amount.toString(), "0"],
          },
        ]);
        await provider.waitForTransaction(approveTx.transaction_hash);

        // Then fund
        const tx = await sendAsync([
          {
            contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
            entrypoint: "fund",
            calldata: CallData.compile([
              ASSET_IDS[asset],
              { low: amount.toString(), high: "0" }, // u256
              "0x" + randomness.toString(16),
              {
                encrypted_amount: "0x" + aeHint.encryptedAmount.toString(16),
                nonce: "0x" + aeHint.nonce.toString(16),
                mac: "0x" + aeHint.mac.toString(16),
              },
            ]),
          },
        ]);

        console.log("[ConfidentialTransfer] Fund TX:", tx.transaction_hash);
        await provider.waitForTransaction(tx.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return tx.transaction_hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fund";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync, provider, unlockKeys]
  );

  /**
   * Transfer privately (private -> private)
   */
  const transfer = useCallback(
    async (to: string, asset: AssetId, amount: bigint): Promise<string> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        // Get receiver's public key
        const receiverPkResult = await provider.callContract({
          contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
          entrypoint: "get_public_key",
          calldata: [to],
        });
        const receiverPk: ECPoint = {
          x: BigInt(receiverPkResult[0] || "0"),
          y: BigInt(receiverPkResult[1] || "0"),
        };

        if (receiverPk.x === 0n && receiverPk.y === 0n) {
          throw new Error("Receiver not registered");
        }

        // Get auditor public key
        const auditorPkResult = await provider.callContract({
          contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
          entrypoint: "get_auditor",
          calldata: [],
        });
        const auditorPk: ECPoint = {
          x: BigInt(auditorPkResult[0] || "0"),
          y: BigInt(auditorPkResult[1] || "0"),
        };

        // Generate randomness (same for all ciphertexts - same-encryption constraint)
        const randomness = randomScalar();

        // Encrypt amount for sender, receiver, and auditor
        const senderCipher = encrypt(amount, keyPair.publicKey, randomness);
        const receiverCipher = encrypt(amount, receiverPk, randomness);
        const auditorCipher = encrypt(amount, auditorPk, randomness);

        // Get current balance for proof
        const currentBalance = state.balances[asset];

        // Generate proper ZK proof with ownership, range, and balance proofs
        const proof = generateProofForTransfer(
          keyPair.privateKey,
          keyPair.publicKey,
          amount,
          currentBalance,
          randomness
        );

        // Create AE hints
        const senderHint = createAEHintFromRandomness(currentBalance - amount, randomness, keyPair.publicKey);
        const receiverHint = createAEHintFromRandomness(amount, randomness, receiverPk);

        console.log("[ConfidentialTransfer] Transferring:", { to, asset, amount: amount.toString() });

        const tx = await sendAsync([
          {
            contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
            entrypoint: "transfer",
            calldata: CallData.compile([
              to,
              ASSET_IDS[asset],
              cipherToCalldata(senderCipher),
              cipherToCalldata(receiverCipher),
              cipherToCalldata(auditorCipher),
              proof,
              aeHintToCalldata(senderHint),
              aeHintToCalldata(receiverHint),
            ]),
          },
        ]);

        console.log("[ConfidentialTransfer] Transfer TX:", tx.transaction_hash);
        await provider.waitForTransaction(tx.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return tx.transaction_hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to transfer";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync, provider, state.balances, unlockKeys]
  );

  /**
   * Rollover pending transfers to main balance
   */
  const rollover = useCallback(
    async (asset: AssetId): Promise<string> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const tx = await sendAsync([
          {
            contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
            entrypoint: "rollover",
            calldata: [ASSET_IDS[asset]],
          },
        ]);

        console.log("[ConfidentialTransfer] Rollover TX:", tx.transaction_hash);
        await provider.waitForTransaction(tx.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return tx.transaction_hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to rollover";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync, provider]
  );

  /**
   * Withdraw to public balance (private -> public)
   */
  const withdraw = useCallback(
    async (to: string, asset: AssetId, amount: bigint): Promise<string> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        const currentBalance = state.balances[asset];
        const randomness = randomScalar();

        // Generate proper ZK proof for withdrawal
        const proof = generateProofForTransfer(
          keyPair.privateKey,
          keyPair.publicKey,
          amount,
          currentBalance,
          randomness
        );

        console.log("[ConfidentialTransfer] Withdrawing:", { to, asset, amount: amount.toString() });

        const tx = await sendAsync([
          {
            contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
            entrypoint: "withdraw",
            calldata: CallData.compile([
              to,
              ASSET_IDS[asset],
              { low: amount.toString(), high: "0" },
              proof,
            ]),
          },
        ]);

        console.log("[ConfidentialTransfer] Withdraw TX:", tx.transaction_hash);
        await provider.waitForTransaction(tx.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return tx.transaction_hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to withdraw";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync, provider, state.balances, unlockKeys]
  );

  /**
   * Get decrypted balance for an asset
   */
  const getBalance = useCallback(
    async (asset: AssetId): Promise<bigint> => {
      if (!address) return 0n;

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) return 0n;

        // Get encrypted balance from contract
        const result = await provider.callContract({
          contractAddress: CONFIDENTIAL_TRANSFER_ADDRESS,
          entrypoint: "get_encrypted_balance",
          calldata: [address, ASSET_IDS[asset]],
        });

        // Parse encrypted balance
        const cipher: ElGamalCiphertext = {
          c1_x: BigInt(result[0] || "0"),
          c1_y: BigInt(result[1] || "0"),
          c2_x: BigInt(result[2] || "0"),
          c2_y: BigInt(result[3] || "0"),
        };

        // Use hybrid decryption (O(1) with hint, fallback to BSGS)
        const balance = await hybridDecrypt(cipher, keyPair.privateKey, undefined, 10000000000n);
        return balance;
      } catch (error) {
        console.error("[ConfidentialTransfer] getBalance error:", error);
        return 0n;
      }
    },
    [address, provider, unlockKeys]
  );

  /**
   * Refresh all balances
   */
  const refreshBalances = useCallback(async (): Promise<void> => {
    if (!address) return;

    const assets: AssetId[] = ["SAGE", "STRK", "USDC"];
    const newBalances: Record<AssetId, bigint> = { SAGE: 0n, STRK: 0n, USDC: 0n };

    for (const asset of assets) {
      newBalances[asset] = await getBalance(asset);
    }

    setState((s) => ({ ...s, balances: newBalances }));
  }, [address, getBalance]);

  /**
   * Generate proof helper (requires unlocking keys first)
   */
  const generateProof = useCallback(
    async (amount: bigint, balance: bigint): Promise<TransferProof> => {
      const keyPair = await unlockKeys();
      if (!keyPair) {
        throw new Error("Privacy keys not found");
      }
      return generateProofForTransfer(
        keyPair.privateKey,
        keyPair.publicKey,
        amount,
        balance,
        randomScalar()
      );
    },
    [unlockKeys]
  );

  // Check registration status on mount
  useEffect(() => {
    if (address) {
      isRegistered().then((registered) => {
        setState((s) => ({ ...s, isRegistered: registered }));
      });
    }
  }, [address, isRegistered]);

  return {
    state,
    register,
    isRegistered,
    fund,
    transfer,
    rollover,
    withdraw,
    getBalance,
    refreshBalances,
    generateProof,
  };
}

// Helper functions
function getTokenAddress(asset: AssetId): string {
  const tokens: Record<AssetId, string> = {
    SAGE: process.env.NEXT_PUBLIC_SAGE_TOKEN_ADDRESS || "0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    USDC: "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080",
  };
  return tokens[asset];
}

function cipherToCalldata(cipher: ElGamalCiphertext): object {
  return {
    l_x: "0x" + cipher.c1_x.toString(16),
    l_y: "0x" + cipher.c1_y.toString(16),
    r_x: "0x" + cipher.c2_x.toString(16),
    r_y: "0x" + cipher.c2_y.toString(16),
  };
}

function aeHintToCalldata(hint: AEHint): object {
  return {
    encrypted_amount: "0x" + hint.encryptedAmount.toString(16),
    nonce: "0x" + hint.nonce.toString(16),
    mac: "0x" + hint.mac.toString(16),
  };
}

export default useConfidentialTransfer;
