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
import { getConfig } from "@/lib/env";
import {
  createAEHintFromRandomness,
  createTransferHintBundle,
  decryptAEHintFromCiphertext,
  hybridDecrypt,
  type AEHint,
} from "../crypto/aeHints";
import { poseidonHash } from "../crypto/nullifier";
import {
  generateRangeProof as generateZKRangeProof,
  generateBalanceProof as generateZKBalanceProof,
  computeChallenge,
} from "../crypto/zkProofs";
import { commit, commitWithRandomBlinding } from "../crypto/pedersen";
import { getGenerator, getPedersenH, scalarMult, addPoints, mod } from "../crypto/elgamal";
import { CURVE_ORDER } from "../crypto/constants";

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
  bitResponses: bigint[];
  aggregateChallenge: bigint;
  numBits: number;
}

export interface RateProof {
  rateCommitment: ECPoint;
  challenge: bigint;
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
 * Generate a range proof using real bit-decomposition with EC commitments
 * Wraps zkProofs.generateRangeProof and adds numBits tracking for ABI serialization
 */
function generateSwapRangeProof(
  amount: bigint,
  blinding: bigint,
  numBits: number = 64
): RangeProof {
  const zkProof = generateZKRangeProof(amount, blinding, numBits);
  return {
    bitCommitments: zkProof.bitCommitments,
    bitResponses: zkProof.bitResponses,
    aggregateChallenge: zkProof.aggregateChallenge,
    numBits,
  };
}

/**
 * Generate a rate proof: Pedersen commitment to rate + Schnorr proof of opening
 * Proves knowledge of (rate, blinding) such that C = rate*G + blinding*H
 */
function generateSwapRateProof(
  giveAmount: bigint,
  wantAmount: bigint,
): RateProof {
  const rate = giveAmount > 0n ? (wantAmount * 1000000n) / giveAmount : 0n;
  const blinding = randomScalar();

  // Real Pedersen commitment: C = rate * G + blinding * H
  const rateCommitment = commit(rate, blinding);

  // Schnorr-style proof of opening
  const g = getGenerator();
  const h = getPedersenH();
  const kRate = randomScalar();
  const kBlinding = randomScalar();

  // Proof commitment: A = kRate * G + kBlinding * H
  const proofCommitment = addPoints(scalarMult(kRate, g), scalarMult(kBlinding, h));

  // Fiat-Shamir challenge
  const challenge = computeChallenge(g, h, rateCommitment, proofCommitment);

  // Responses: s = k + c * secret
  const responseRate = mod(kRate + challenge * rate, CURVE_ORDER);
  const responseBlinding = mod(kBlinding + challenge * blinding, CURVE_ORDER);

  return {
    rateCommitment,
    challenge,
    responseRate,
    responseBlinding,
  };
}

/**
 * Generate a balance proof: proves newBalance = oldBalance - amount AND newBalance >= 0
 * Wraps zkProofs.generateBalanceProof and extracts fields for ABI serialization
 */
function generateSwapBalanceProof(
  balance: bigint,
  amount: bigint,
  blinding: bigint
): BalanceProof {
  const zkProof = generateZKBalanceProof(balance, amount, blinding);
  return {
    balanceCommitment: zkProof.newBalanceCommitment,
    challenge: zkProof.consistencyProof.challenge,
    response: zkProof.consistencyProof.response,
  };
}

/**
 * Serialize a range proof to calldata matching ABI:
 * (Array<(felt252,felt252)>, felt252, Array<felt252>, u8)
 */
function serializeRangeProof(proof: RangeProof): string[] {
  const data: string[] = [];
  // Array of (felt252, felt252) — bit commitments
  data.push(proof.bitCommitments.length.toString());
  for (const c of proof.bitCommitments) {
    data.push(c.x.toString());
    data.push(c.y.toString());
  }
  // felt252 — aggregate challenge
  data.push(proof.aggregateChallenge.toString());
  // Array of felt252 — bit responses
  data.push(proof.bitResponses.length.toString());
  for (const r of proof.bitResponses) {
    data.push(r.toString());
  }
  // u8 — numBits
  data.push(proof.numBits.toString());
  return data;
}

/**
 * Serialize a SwapProofBundle to calldata
 */
function serializeSwapProofBundle(bundle: SwapProofBundle): string[] {
  return [
    // Range proof (give)
    ...serializeRangeProof(bundle.giveRangeProof),
    // Range proof (want)
    ...serializeRangeProof(bundle.wantRangeProof),
    // Rate proof: ((felt252,felt252), felt252, felt252, felt252)
    bundle.rateProof.rateCommitment.x.toString(),
    bundle.rateProof.rateCommitment.y.toString(),
    bundle.rateProof.challenge.toString(),
    bundle.rateProof.responseRate.toString(),
    bundle.rateProof.responseBlinding.toString(),
    // Balance proof: ((felt252,felt252), felt252, felt252)
    bundle.balanceProof.balanceCommitment.x.toString(),
    bundle.balanceProof.balanceCommitment.y.toString(),
    bundle.balanceProof.challenge.toString(),
    bundle.balanceProof.response.toString(),
  ];
}

/**
 * Decode a felt252 back to an asset string (reverse of assetToFelt)
 */
function feltToAsset(felt: bigint): AssetId {
  if (felt === 0n) return "";
  const bytes: number[] = [];
  let remaining = felt;
  while (remaining > 0n) {
    bytes.unshift(Number(remaining & 0xFFn));
    remaining >>= 8n;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Decode a felt252 status enum to SwapOrderStatus
 */
function feltToStatus(felt: bigint): SwapOrderStatus {
  switch (Number(felt)) {
    case 0: return "Open";
    case 1: return "PartialFill";
    case 2: return "Filled";
    case 3: return "Cancelled";
    case 4: return "Expired";
    default: return "Open";
  }
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
        nodeUrl: getConfig().rpcUrl,
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
      const giveRangeProof = generateSwapRangeProof(giveAmount, randomness);
      const wantRangeProof = generateSwapRangeProof(wantAmount, randomness);
      const rateProof = generateSwapRateProof(giveAmount, wantAmount);
      const balanceProof = generateSwapBalanceProof(balance, giveAmount, randomness);

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

        // Generate rate commitment using real Pedersen commitment
        const rate = giveAmount > 0n ? (wantAmount * 1000000n) / giveAmount : 0n;
        const { commitment: rateCommitmentPoint } = commitWithRandomBlinding(rate);
        const rateCommitment = poseidonHash([rateCommitmentPoint.x, rateCommitmentPoint.y]);

        // Generate real range proofs with EC bit decomposition
        const rangeProofGive = generateSwapRangeProof(giveAmount, randomness);
        const rangeProofWant = generateSwapRangeProof(wantAmount, randomScalar());

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
            // range_proof_give (full serialization)
            ...serializeRangeProof(rangeProofGive),
            // range_proof_want (full serialization)
            ...serializeRangeProof(rangeProofWant),
          ],
        };

        const response = await sendAsync([call]);

        // Wait for on-chain confirmation
        await provider.waitForTransaction(response.transaction_hash);

        // Fetch the real order ID from contract (last user order)
        const countResult = await contract.call("get_user_order_count", [address]);
        const count = Number(countResult);
        let orderId = 0n;
        if (count > 0) {
          const lastOrderResult = await contract.call("get_user_order_at", [address, (count - 1).toString()]);
          orderId = BigInt(lastOrderResult.toString());
        }

        setState((s) => ({ ...s, isLoading: false }));
        return orderId;
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
            // Full proof bundle
            ...serializeSwapProofBundle(proofBundle),
          ],
        };

        const response = await sendAsync([call]);

        // Wait for on-chain confirmation and parse match ID from events
        const receipt = await provider.waitForTransaction(response.transaction_hash);
        let matchId = 0n;
        if ("events" in receipt && Array.isArray(receipt.events) && receipt.events.length > 0) {
          const ev = receipt.events[0];
          if (ev.data && ev.data.length >= 2) {
            matchId = BigInt(ev.data[0]) + (BigInt(ev.data[1]) << 128n);
          }
        }

        setState((s) => ({ ...s, isLoading: false }));
        return matchId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to execute swap";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, contract, provider, sendAsync, generateProofBundle]
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
            // maker_proof (full)
            ...serializeSwapProofBundle(makerProof),
            // taker_proof (full)
            ...serializeSwapProofBundle(takerProof),
          ],
        };

        const response = await sendAsync([call]);

        // Wait for on-chain confirmation and parse match ID from events
        const receipt = await provider.waitForTransaction(response.transaction_hash);
        let matchId = 0n;
        if ("events" in receipt && Array.isArray(receipt.events) && receipt.events.length > 0) {
          const ev = receipt.events[0];
          if (ev.data && ev.data.length >= 2) {
            matchId = BigInt(ev.data[0]) + (BigInt(ev.data[1]) << 128n);
          }
        }

        setState((s) => ({ ...s, isLoading: false }));
        return matchId;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to execute match";
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw error;
      }
    },
    [address, account, contract, provider, sendAsync, generateProofBundle]
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
        const rangeProof = generateSwapRangeProof(amount, randomness);

        const call = {
          contractAddress: CONFIDENTIAL_SWAP_ADDRESS,
          entrypoint: "deposit_for_swap",
          calldata: [
            assetToFelt(asset).toString(),
            encryptedAmount.c1_x.toString(),
            encryptedAmount.c1_y.toString(),
            encryptedAmount.c2_x.toString(),
            encryptedAmount.c2_y.toString(),
            // Full range proof serialization
            ...serializeRangeProof(rangeProof),
          ],
        };

        await sendAsync([call]);

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

        const balanceProof = generateSwapBalanceProof(balance, amount, randomness);

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
  const data = result as unknown[];

  // Parse u256 orderId from two felts (low, high)
  const orderId = BigInt(data[0]?.toString() || "0");

  // Decode asset felts back to string identifiers
  const giveAssetFelt = BigInt(data[2]?.toString() || "0");
  const wantAssetFelt = BigInt(data[3]?.toString() || "0");

  return {
    orderId,
    maker: String(data[1] || ""),
    giveAsset: feltToAsset(giveAssetFelt) || "SAGE",
    wantAsset: feltToAsset(wantAssetFelt) || "USDC",
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
    status: feltToStatus(BigInt(data[14]?.toString() || "0")),
    createdAt: new Date(Number(data[15] || 0) * 1000),
    expiresAt: data[16] ? new Date(Number(data[16]) * 1000) : null,
  };
}

export default useConfidentialSwap;
