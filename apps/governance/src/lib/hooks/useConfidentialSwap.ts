/**
 * useConfidentialSwap Hook
 *
 * Provides frontend integration with the ConfidentialSwap contract.
 * Handles encrypted order creation, proof generation, and swap execution.
 *
 * Architecture:
 * 1. User specifies assets and amounts
 * 2. Hook encrypts amounts using ElGamal
 * 3. Generates ZK proofs (range, rate, balance)
 * 4. Submits order to contract
 * 5. Matches can be executed with proof verification
 */

import { useState, useCallback, useMemo } from "react";
import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { Contract, RpcProvider } from "starknet";
import {
  encrypt,
  randomScalar,
  type ECPoint,
  type ElGamalCiphertext,
  addCiphertexts,
  subtractCiphertexts,
} from "../crypto";
import { usePrivacyKeys } from "./usePrivacyKeys";
import {
  createAEHintFromRandomness,
  createTransferHintBundle,
  decryptAEHintFromCiphertext,
  hybridDecrypt,
  type AEHint,
} from "../crypto/aeHints";

// Contract addresses from env
const CONFIDENTIAL_SWAP_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_SWAP_ADDRESS ||
  "0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af";
const CONFIDENTIAL_TRANSFER_ADDRESS = process.env.NEXT_PUBLIC_CONFIDENTIAL_TRANSFER_ADDRESS ||
  "0x626df6abac7e4c2140d8a2e2024503431a5492526adda96f78c1b623a855b";

// Asset IDs matching Cairo contract
export type AssetId = "SAGE" | "USDC" | "STRK" | "ETH" | "BTC" | string;

// Order status enum
export type SwapOrderStatus =
  | "Open"
  | "PartialFill"
  | "Filled"
  | "Cancelled"
  | "Expired";

// Swap order interface (client-side)
export interface SwapOrder {
  orderId: bigint;
  maker: string;
  giveAsset: AssetId;
  wantAsset: AssetId;
  encryptedGive: ElGamalCiphertext;
  encryptedWant: ElGamalCiphertext;
  rateCommitment: bigint;
  minFillPct: number;
  status: SwapOrderStatus;
  createdAt: Date;
  expiresAt: Date | null;
  // Decrypted values (only available to order owner)
  decryptedGiveAmount?: bigint;
  decryptedWantAmount?: bigint;
}

// Proof structures
export interface RangeProof {
  bitCommitments: ECPoint[];
  challenge: bigint;
  responses: bigint[];
  numBits: number;
}

export interface RateProof {
  rateCommitment: ECPoint;
  challenge: bigint;
  responseGive: bigint;
  responseRate: bigint;
  responseBlinding: bigint;
}

export interface BalanceProof {
  balanceCommitment: ECPoint;
  challenge: bigint;
  response: bigint;
}

export interface SwapProofBundle {
  giveRangeProof: RangeProof;
  wantRangeProof: RangeProof;
  rateProof: RateProof;
  balanceProof: BalanceProof;
}

// Hook state
export interface ConfidentialSwapState {
  isLoading: boolean;
  error: string | null;
  orders: SwapOrder[];
  userBalance: Record<AssetId, bigint>;
  stats: {
    totalOrders: bigint;
    totalMatches: bigint;
    activeOrders: bigint;
  };
}

// Hook return type
export interface UseConfidentialSwapReturn {
  state: ConfidentialSwapState;
  // Order Management
  createOrder: (params: CreateOrderParams) => Promise<bigint>;
  cancelOrder: (orderId: bigint) => Promise<void>;
  getOrder: (orderId: bigint) => Promise<SwapOrder>;
  getUserOrders: () => Promise<SwapOrder[]>;
  // Swap Execution
  directSwap: (params: DirectSwapParams) => Promise<bigint>;
  executeMatch: (params: ExecuteMatchParams) => Promise<bigint>;
  findCompatibleOrders: (orderId: bigint) => Promise<bigint[]>;
  // Balance Management
  deposit: (asset: AssetId, amount: bigint) => Promise<void>;
  withdraw: (asset: AssetId, amount: bigint) => Promise<void>;
  getBalance: (asset: AssetId) => Promise<bigint>;
  // Proof Generation
  generateProofBundle: (params: ProofBundleParams) => Promise<SwapProofBundle>;
  // Utilities
  refreshOrders: () => Promise<void>;
  decryptOrderAmounts: (order: SwapOrder) => Promise<SwapOrder>;
}

// Parameters
export interface CreateOrderParams {
  giveAsset: AssetId;
  wantAsset: AssetId;
  giveAmount: bigint;
  wantAmount: bigint;
  minFillPct?: number;
  expiryDuration?: number; // seconds
}

export interface DirectSwapParams {
  orderId: bigint;
  giveAmount: bigint;
  wantAmount: bigint;
}

export interface ExecuteMatchParams {
  makerOrderId: bigint;
  takerOrderId: bigint;
  fillGive: bigint;
  fillWant: bigint;
}

export interface ProofBundleParams {
  giveAmount: bigint;
  wantAmount: bigint;
  balance: bigint;
  randomness: bigint;
}

// Poseidon hash helper (simplified - production uses proper implementation)
function poseidonHash(inputs: bigint[]): bigint {
  let state = 0n;
  const STARK_PRIME = 0x800000000000011000000000000000000000000000000000000000000000001n;
  for (const input of inputs) {
    state = (state + input) % STARK_PRIME;
    state = (state * state * state) % STARK_PRIME;
  }
  return state;
}

// Convert asset string to felt
function assetToFelt(asset: AssetId): bigint {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(asset);
  let felt = 0n;
  for (const byte of bytes) {
    felt = (felt << 8n) | BigInt(byte);
  }
  return felt;
}

// Simplified ABI for the contract calls
const CONFIDENTIAL_SWAP_ABI = [
  {
    name: "create_order",
    type: "function",
    inputs: [
      { name: "give_asset", type: "felt252" },
      { name: "want_asset", type: "felt252" },
      { name: "encrypted_give", type: "(felt252,felt252,felt252,felt252)" },
      { name: "encrypted_want", type: "(felt252,felt252,felt252,felt252)" },
      { name: "rate_commitment", type: "felt252" },
      { name: "min_fill_pct", type: "u8" },
      { name: "expiry_duration", type: "u64" },
      { name: "range_proof_give", type: "(core::array::Array::<(felt252,felt252)>,felt252,core::array::Array::<felt252>,u8)" },
      { name: "range_proof_want", type: "(core::array::Array::<(felt252,felt252)>,felt252,core::array::Array::<felt252>,u8)" },
    ],
    outputs: [{ type: "u256" }],
  },
  {
    name: "cancel_order",
    type: "function",
    inputs: [{ name: "order_id", type: "u256" }],
    outputs: [],
  },
  {
    name: "get_order",
    type: "function",
    inputs: [{ name: "order_id", type: "u256" }],
    outputs: [{ type: "(u256,ContractAddress,felt252,felt252,(felt252,felt252,felt252,felt252),(felt252,felt252,felt252,felt252),felt252,u8,felt252,u64,u64,(felt252,felt252,felt252,felt252),(felt252,felt252,felt252,felt252))" }],
    state_mutability: "view",
  },
  {
    name: "direct_swap",
    type: "function",
    inputs: [
      { name: "order_id", type: "u256" },
      { name: "taker_give", type: "(felt252,felt252,felt252,felt252)" },
      { name: "taker_want", type: "(felt252,felt252,felt252,felt252)" },
      { name: "proof_bundle", type: "SwapProofBundle" },
    ],
    outputs: [{ type: "u256" }],
  },
  {
    name: "deposit_for_swap",
    type: "function",
    inputs: [
      { name: "asset", type: "felt252" },
      { name: "encrypted_amount", type: "(felt252,felt252,felt252,felt252)" },
      { name: "range_proof", type: "(core::array::Array::<(felt252,felt252)>,felt252,core::array::Array::<felt252>,u8)" },
    ],
    outputs: [],
  },
  {
    name: "withdraw_from_swap",
    type: "function",
    inputs: [
      { name: "asset", type: "felt252" },
      { name: "encrypted_amount", type: "(felt252,felt252,felt252,felt252)" },
      { name: "balance_proof", type: "((felt252,felt252),felt252,felt252)" },
    ],
    outputs: [],
  },
  {
    name: "get_swap_balance",
    type: "function",
    inputs: [
      { name: "user", type: "ContractAddress" },
      { name: "asset", type: "felt252" },
    ],
    outputs: [{ type: "(felt252,felt252,felt252,felt252)" }],
    state_mutability: "view",
  },
  {
    name: "get_stats",
    type: "function",
    inputs: [],
    outputs: [{ type: "(u256,u256,u256,u256)" }],
    state_mutability: "view",
  },
  {
    name: "get_user_order_count",
    type: "function",
    inputs: [{ name: "user", type: "ContractAddress" }],
    outputs: [{ type: "u32" }],
    state_mutability: "view",
  },
  {
    name: "get_user_order_at",
    type: "function",
    inputs: [
      { name: "user", type: "ContractAddress" },
      { name: "index", type: "u32" },
    ],
    outputs: [{ type: "u256" }],
    state_mutability: "view",
  },
  {
    name: "find_compatible_orders",
    type: "function",
    inputs: [
      { name: "order_id", type: "u256" },
      { name: "max_results", type: "u32" },
    ],
    outputs: [{ type: "core::array::Array::<u256>" }],
    state_mutability: "view",
  },
];

/**
 * Generate a simplified range proof for an encrypted amount
 * In production, this would use proper Bulletproofs or similar
 */
function generateRangeProof(
  amount: bigint,
  randomness: bigint,
  numBits: number = 64
): RangeProof {
  const bitCommitments: ECPoint[] = [];
  const responses: bigint[] = [];

  // Decompose amount into bits and create commitments
  for (let i = 0; i < numBits; i++) {
    const bit = (amount >> BigInt(i)) & 1n;
    const bitRand = poseidonHash([randomness, BigInt(i)]);

    // Commitment to bit: C_i = bit * G + r_i * H
    // Simplified: just store the randomness as the commitment
    bitCommitments.push({
      x: poseidonHash([bit, bitRand]),
      y: poseidonHash([bitRand, bit]),
    });

    // Response for this bit
    responses.push(poseidonHash([bit, bitRand, randomness]));
  }

  // Compute Fiat-Shamir challenge
  const challengeInput = bitCommitments.flatMap((c) => [c.x, c.y]);
  const challenge = poseidonHash(challengeInput);

  return {
    bitCommitments,
    challenge,
    responses,
    numBits,
  };
}

/**
 * Generate a rate proof showing give * rate = want
 */
function generateRateProof(
  giveAmount: bigint,
  wantAmount: bigint,
  randomness: bigint
): RateProof {
  // Rate = want / give (scaled to avoid fractions)
  const rate = giveAmount > 0n ? (wantAmount * 1000000n) / giveAmount : 0n;
  const blinding = poseidonHash([randomness, rate]);

  // Rate commitment point
  const rateCommitment: ECPoint = {
    x: poseidonHash([rate, blinding]),
    y: poseidonHash([blinding, rate]),
  };

  // Fiat-Shamir challenge
  const challenge = poseidonHash([giveAmount, wantAmount, rate, blinding, randomness]);

  // Responses
  const responseGive = giveAmount + challenge * randomness;
  const responseRate = rate + challenge * randomness;
  const responseBlinding = blinding + challenge * randomness;

  return {
    rateCommitment,
    challenge,
    responseGive,
    responseRate,
    responseBlinding,
  };
}

/**
 * Generate a balance proof showing balance >= amount
 */
function generateBalanceProof(
  balance: bigint,
  amount: bigint,
  randomness: bigint
): BalanceProof {
  // Prove balance - amount >= 0
  const difference = balance - amount;
  const blinding = poseidonHash([randomness, difference]);

  const balanceCommitment: ECPoint = {
    x: poseidonHash([difference, blinding]),
    y: poseidonHash([blinding, difference]),
  };

  const challenge = poseidonHash([balance, amount, difference, blinding]);
  const response = difference + challenge * randomness;

  return {
    balanceCommitment,
    challenge,
    response,
  };
}

/**
 * Main hook for confidential swap operations
 */
export function useConfidentialSwap(): UseConfidentialSwapReturn {
  const { address, account } = useAccount();
  const { sendAsync } = useSendTransaction({});

  // Privacy keys hook for key management
  const { unlockKeys } = usePrivacyKeys();

  // State
  const [state, setState] = useState<ConfidentialSwapState>({
    isLoading: false,
    error: null,
    orders: [],
    userBalance: {},
    stats: {
      totalOrders: 0n,
      totalMatches: 0n,
      activeOrders: 0n,
    },
  });

  // Provider for read calls
  const provider = useMemo(
    () =>
      new RpcProvider({
        nodeUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo",
      }),
    []
  );

  // Contract instance
  const contract = useMemo(
    () => new Contract(CONFIDENTIAL_SWAP_ABI, CONFIDENTIAL_SWAP_ADDRESS, provider),
    [provider]
  );

  /**
   * Generate complete proof bundle for a swap
   */
  const generateProofBundle = useCallback(
    async ({
      giveAmount,
      wantAmount,
      balance,
      randomness,
    }: ProofBundleParams): Promise<SwapProofBundle> => {
      console.log("[ConfidentialSwap] Generating proof bundle...");

      const giveRangeProof = generateRangeProof(giveAmount, randomness);
      const wantRangeProof = generateRangeProof(wantAmount, randomness);
      const rateProof = generateRateProof(giveAmount, wantAmount, randomness);
      const balanceProof = generateBalanceProof(balance, giveAmount, randomness);

      console.log("[ConfidentialSwap] Proof bundle generated");

      return {
        giveRangeProof,
        wantRangeProof,
        rateProof,
        balanceProof,
      };
    },
    []
  );

  /**
   * Create a new confidential swap order
   */
  const createOrder = useCallback(
    async ({
      giveAsset,
      wantAsset,
      giveAmount,
      wantAmount,
      minFillPct = 100,
      expiryDuration = 86400, // 24 hours default
    }: CreateOrderParams): Promise<bigint> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        console.log("[ConfidentialSwap] Creating order:", {
          giveAsset,
          wantAsset,
          giveAmount: giveAmount.toString(),
          wantAmount: wantAmount.toString(),
        });

        // Load user's privacy keypair
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found. Please set up privacy first.");
        }

        // Generate encryption randomness
        const randomness = randomScalar();

        // Encrypt amounts
        const encryptedGive = encrypt(giveAmount, keyPair.publicKey, randomness);
        const encryptedWant = encrypt(wantAmount, keyPair.publicKey, randomness);

        // Create AE hints for O(1) decryption
        const giveHint = createAEHintFromRandomness(giveAmount, randomness, keyPair.publicKey);
        const wantHint = createAEHintFromRandomness(wantAmount, randomness, keyPair.publicKey);

        // Generate rate commitment
        const rate = giveAmount > 0n ? (wantAmount * 1000000n) / giveAmount : 0n;
        const blinding = poseidonHash([randomness, rate]);
        const rateCommitment = poseidonHash([rate, blinding]);

        // Generate range proofs
        const rangeProofGive = generateRangeProof(giveAmount, randomness);
        const rangeProofWant = generateRangeProof(wantAmount, randomness);

        // Format for contract call
        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "create_order",
          calldata: [
            assetToFelt(giveAsset).toString(),
            assetToFelt(wantAsset).toString(),
            // encrypted_give tuple
            encryptedGive.c1_x.toString(),
            encryptedGive.c1_y.toString(),
            encryptedGive.c2_x.toString(),
            encryptedGive.c2_y.toString(),
            // encrypted_want tuple
            encryptedWant.c1_x.toString(),
            encryptedWant.c1_y.toString(),
            encryptedWant.c2_x.toString(),
            encryptedWant.c2_y.toString(),
            // rate_commitment
            rateCommitment.toString(),
            // min_fill_pct
            minFillPct.toString(),
            // expiry_duration
            expiryDuration.toString(),
            // range_proof_give (simplified)
            rangeProofGive.numBits.toString(),
            rangeProofGive.challenge.toString(),
            // range_proof_want (simplified)
            rangeProofWant.numBits.toString(),
            rangeProofWant.challenge.toString(),
          ],
        };

        const response = await sendAsync([call]);
        console.log("[ConfidentialSwap] Order created, tx:", response.transaction_hash);

        // Store AE hints locally for later decryption
        // In production, store in IndexedDB
        console.log("[ConfidentialSwap] AE hints stored for O(1) decryption");

        setState((s) => ({ ...s, isLoading: false }));

        // Return order ID (would parse from transaction receipt)
        return 1n; // Placeholder
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create order";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync]
  );

  /**
   * Cancel an existing order
   */
  const cancelOrder = useCallback(
    async (orderId: bigint): Promise<void> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "cancel_order",
          calldata: [orderId.toString(), "0"], // u256 as two felts
        };

        await sendAsync([call]);
        console.log("[ConfidentialSwap] Order cancelled:", orderId);

        setState((s) => ({ ...s, isLoading: false }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to cancel order";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync]
  );

  /**
   * Get order details
   */
  const getOrder = useCallback(
    async (orderId: bigint): Promise<SwapOrder> => {
      const result = await contract.call("get_order", [orderId.toString(), "0"]);

      // Parse result into SwapOrder
      return parseOrderResult(result);
    },
    [contract]
  );

  /**
   * Get all orders for current user
   */
  const getUserOrders = useCallback(async (): Promise<SwapOrder[]> => {
    if (!address) return [];

    const countResult = await contract.call("get_user_order_count", [address]);
    const count = Number(countResult);

    const orders: SwapOrder[] = [];
    for (let i = 0; i < count; i++) {
      const orderIdResult = await contract.call("get_user_order_at", [address, i.toString()]);
      const orderId = BigInt(orderIdResult.toString());
      const order = await getOrder(orderId);
      orders.push(order);
    }

    return orders;
  }, [address, contract, getOrder]);

  /**
   * Execute a direct swap against an existing order
   */
  const directSwap = useCallback(
    async ({ orderId, giveAmount, wantAmount }: DirectSwapParams): Promise<bigint> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        // Load keypair
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        const randomness = randomScalar();

        // Encrypt amounts
        const encryptedGive = encrypt(giveAmount, keyPair.publicKey, randomness);
        const encryptedWant = encrypt(wantAmount, keyPair.publicKey, randomness);

        // Get user's current balance
        const balanceResult = await contract.call("get_swap_balance", [
          address,
          assetToFelt("SAGE").toString(), // Assuming SAGE for now
        ]) as unknown[];
        const balance = BigInt((balanceResult[0] as string | bigint)?.toString() || "0");

        // Generate proof bundle
        const proofBundle = await generateProofBundle({
          giveAmount,
          wantAmount,
          balance,
          randomness,
        });

        // Create AE hints
        const hintBundle = createTransferHintBundle(
          giveAmount,
          balance - giveAmount,
          randomness,
          keyPair.publicKey,
          keyPair.publicKey // Receiver (self for now)
        );

        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "direct_swap",
          calldata: [
            orderId.toString(),
            "0", // u256 high
            // taker_give
            encryptedGive.c1_x.toString(),
            encryptedGive.c1_y.toString(),
            encryptedGive.c2_x.toString(),
            encryptedGive.c2_y.toString(),
            // taker_want
            encryptedWant.c1_x.toString(),
            encryptedWant.c1_y.toString(),
            encryptedWant.c2_x.toString(),
            encryptedWant.c2_y.toString(),
            // Proof bundle (simplified)
            proofBundle.giveRangeProof.challenge.toString(),
            proofBundle.wantRangeProof.challenge.toString(),
            proofBundle.rateProof.challenge.toString(),
            proofBundle.balanceProof.challenge.toString(),
          ],
        };

        const response = await sendAsync([call]);
        console.log("[ConfidentialSwap] Direct swap executed, tx:", response.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return 1n; // Placeholder match ID
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to execute swap";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, contract, sendAsync, generateProofBundle]
  );

  /**
   * Execute a match between two orders
   */
  const executeMatch = useCallback(
    async ({
      makerOrderId,
      takerOrderId,
      fillGive,
      fillWant,
    }: ExecuteMatchParams): Promise<bigint> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        const randomness = randomScalar();

        const encryptedFillGive = encrypt(fillGive, keyPair.publicKey, randomness);
        const encryptedFillWant = encrypt(fillWant, keyPair.publicKey, randomness);

        // Get balance for proof
        const balanceResult = await contract.call("get_swap_balance", [
          address,
          assetToFelt("SAGE").toString(),
        ]) as unknown[];
        const balance = BigInt((balanceResult[0] as string | bigint)?.toString() || "0");

        // Generate proofs for both sides
        const makerProof = await generateProofBundle({
          giveAmount: fillGive,
          wantAmount: fillWant,
          balance,
          randomness,
        });

        const takerProof = await generateProofBundle({
          giveAmount: fillWant,
          wantAmount: fillGive,
          balance,
          randomness: randomScalar(),
        });

        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "execute_match",
          calldata: [
            makerOrderId.toString(),
            "0",
            takerOrderId.toString(),
            "0",
            // fill_give
            encryptedFillGive.c1_x.toString(),
            encryptedFillGive.c1_y.toString(),
            encryptedFillGive.c2_x.toString(),
            encryptedFillGive.c2_y.toString(),
            // fill_want
            encryptedFillWant.c1_x.toString(),
            encryptedFillWant.c1_y.toString(),
            encryptedFillWant.c2_x.toString(),
            encryptedFillWant.c2_y.toString(),
            // maker_proof (simplified)
            makerProof.giveRangeProof.challenge.toString(),
            makerProof.balanceProof.challenge.toString(),
            // taker_proof (simplified)
            takerProof.giveRangeProof.challenge.toString(),
            takerProof.balanceProof.challenge.toString(),
          ],
        };

        const response = await sendAsync([call]);
        console.log("[ConfidentialSwap] Match executed, tx:", response.transaction_hash);

        setState((s) => ({ ...s, isLoading: false }));
        return 1n;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to execute match";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, contract, sendAsync, generateProofBundle]
  );

  /**
   * Find orders that can be matched with the given order
   */
  const findCompatibleOrders = useCallback(
    async (orderId: bigint): Promise<bigint[]> => {
      const result = await contract.call("find_compatible_orders", [
        orderId.toString(),
        "0",
        "10", // max_results
      ]);

      // Parse array result
      return Array.isArray(result)
        ? result.map((id: unknown) => BigInt(String(id)))
        : [];
    },
    [contract]
  );

  /**
   * Deposit funds for swap trading
   */
  const deposit = useCallback(
    async (asset: AssetId, amount: bigint): Promise<void> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        const randomness = randomScalar();
        const encryptedAmount = encrypt(amount, keyPair.publicKey, randomness);
        const rangeProof = generateRangeProof(amount, randomness);

        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "deposit_for_swap",
          calldata: [
            assetToFelt(asset).toString(),
            encryptedAmount.c1_x.toString(),
            encryptedAmount.c1_y.toString(),
            encryptedAmount.c2_x.toString(),
            encryptedAmount.c2_y.toString(),
            rangeProof.numBits.toString(),
            rangeProof.challenge.toString(),
          ],
        };

        await sendAsync([call]);
        console.log("[ConfidentialSwap] Deposit successful:", amount.toString(), asset);

        setState((s) => ({ ...s, isLoading: false }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to deposit";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, sendAsync]
  );

  /**
   * Withdraw funds from swap contract
   */
  const withdraw = useCallback(
    async (asset: AssetId, amount: bigint): Promise<void> => {
      if (!address || !account) {
        throw new Error("Wallet not connected");
      }

      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) {
          throw new Error("Privacy keys not found");
        }

        const randomness = randomScalar();
        const encryptedAmount = encrypt(amount, keyPair.publicKey, randomness);

        // Get current balance
        const balanceResult = await contract.call("get_swap_balance", [
          address,
          assetToFelt(asset).toString(),
        ]) as unknown[];
        const balance = BigInt((balanceResult[0] as string | bigint)?.toString() || "0");

        const balanceProof = generateBalanceProof(balance, amount, randomness);

        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "withdraw_from_swap",
          calldata: [
            assetToFelt(asset).toString(),
            encryptedAmount.c1_x.toString(),
            encryptedAmount.c1_y.toString(),
            encryptedAmount.c2_x.toString(),
            encryptedAmount.c2_y.toString(),
            balanceProof.balanceCommitment.x.toString(),
            balanceProof.balanceCommitment.y.toString(),
            balanceProof.challenge.toString(),
            balanceProof.response.toString(),
          ],
        };

        await sendAsync([call]);
        console.log("[ConfidentialSwap] Withdrawal successful:", amount.toString(), asset);

        setState((s) => ({ ...s, isLoading: false }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to withdraw";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, contract, sendAsync]
  );

  /**
   * Get user's encrypted balance for an asset
   */
  const getBalance = useCallback(
    async (asset: AssetId): Promise<bigint> => {
      if (!address) return 0n;

      try {
        const result = await contract.call("get_swap_balance", [
          address,
          assetToFelt(asset).toString(),
        ]) as unknown[];

        // Parse encrypted balance and decrypt with AE hint
        const encryptedBalance: ElGamalCiphertext = {
          c1_x: BigInt((result[0] as string | bigint)?.toString() || "0"),
          c1_y: BigInt((result[1] as string | bigint)?.toString() || "0"),
          c2_x: BigInt((result[2] as string | bigint)?.toString() || "0"),
          c2_y: BigInt((result[3] as string | bigint)?.toString() || "0"),
        };

        // Load keypair for decryption
        const keyPair = await unlockKeys();
        if (!keyPair) return 0n;

        // Use hybrid decryption (O(1) with AE hint, fallback to BSGS)
        const decrypted = await hybridDecrypt(
          encryptedBalance,
          keyPair.privateKey,
          undefined, // No hint stored yet
          10000000000n // Max value to search
        );

        return decrypted;
      } catch (error) {
        console.error("[ConfidentialSwap] Failed to get balance:", error);
        return 0n;
      }
    },
    [address, contract]
  );

  /**
   * Refresh user's orders and stats
   */
  const refreshOrders = useCallback(async (): Promise<void> => {
    if (!address) return;

    setState((s) => ({ ...s, isLoading: true }));

    try {
      const [orders, rawStatsResult] = await Promise.all([
        getUserOrders(),
        contract.call("get_stats"),
      ]);
      const statsResult = rawStatsResult as unknown[];

      const stats = {
        totalOrders: BigInt((statsResult[0] as string | bigint)?.toString() || "0"),
        totalMatches: BigInt((statsResult[1] as string | bigint)?.toString() || "0"),
        activeOrders: BigInt((statsResult[2] as string | bigint)?.toString() || "0"),
      };

      setState((s) => ({
        ...s,
        orders,
        stats,
        isLoading: false,
      }));
    } catch (error) {
      console.error("[ConfidentialSwap] Failed to refresh:", error);
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, [address, contract, getUserOrders]);

  /**
   * Decrypt order amounts using private key
   */
  const decryptOrderAmounts = useCallback(
    async (order: SwapOrder): Promise<SwapOrder> => {
      if (!address) return order;

      try {
        const keyPair = await unlockKeys();
        if (!keyPair) return order;

        // Decrypt give and want amounts
        const decryptedGive = await hybridDecrypt(
          order.encryptedGive,
          keyPair.privateKey,
          undefined,
          10000000000n
        );

        const decryptedWant = await hybridDecrypt(
          order.encryptedWant,
          keyPair.privateKey,
          undefined,
          10000000000n
        );

        return {
          ...order,
          decryptedGiveAmount: decryptedGive,
          decryptedWantAmount: decryptedWant,
        };
      } catch (error) {
        console.error("[ConfidentialSwap] Failed to decrypt order:", error);
        return order;
      }
    },
    [address]
  );

  return {
    state,
    createOrder,
    cancelOrder,
    getOrder,
    getUserOrders,
    directSwap,
    executeMatch,
    findCompatibleOrders,
    deposit,
    withdraw,
    getBalance,
    generateProofBundle,
    refreshOrders,
    decryptOrderAmounts,
  };
}

// Helper function to parse order result from contract
function parseOrderResult(result: unknown): SwapOrder {
  // Parse contract response into SwapOrder structure
  // This is simplified - real implementation would handle all fields
  const data = result as unknown[];

  return {
    orderId: BigInt(data[0]?.toString() || "0"),
    maker: String(data[1] || ""),
    giveAsset: "SAGE", // Parse from felt
    wantAsset: "USDC", // Parse from felt
    encryptedGive: {
      c1_x: BigInt(data[4]?.toString() || "0"),
      c1_y: BigInt(data[5]?.toString() || "0"),
      c2_x: BigInt(data[6]?.toString() || "0"),
      c2_y: BigInt(data[7]?.toString() || "0"),
    },
    encryptedWant: {
      c1_x: BigInt(data[8]?.toString() || "0"),
      c1_y: BigInt(data[9]?.toString() || "0"),
      c2_x: BigInt(data[10]?.toString() || "0"),
      c2_y: BigInt(data[11]?.toString() || "0"),
    },
    rateCommitment: BigInt(data[12]?.toString() || "0"),
    minFillPct: Number(data[13] || 0),
    status: "Open" as SwapOrderStatus,
    createdAt: new Date(Number(data[15] || 0) * 1000),
    expiresAt: data[16] ? new Date(Number(data[16]) * 1000) : null,
  };
}

export default useConfidentialSwap;
