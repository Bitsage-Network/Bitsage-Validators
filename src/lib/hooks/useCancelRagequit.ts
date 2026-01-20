/**
 * Cancel Ragequit Hook
 *
 * Manages the cancel ragequit flow:
 * 1. Fetches available inclusion sets
 * 2. Generates Merkle proof for the selected set
 * 3. Submits the cancel transaction
 */

import { useState, useCallback, useEffect } from "react";
import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { Contract, RpcProvider } from "starknet";
import {
  getContractAddresses,
  buildCancelRagequitCall,
  merkleProofToLeanIMT,
  type LeanIMTProof,
  type AssociationSetInfo,
  type RagequitRequest,
} from "@/lib/contracts";
import { getMerkleProof, type MerkleProof } from "@/lib/crypto/merkle";
import PrivacyPoolsABI from "@/lib/contracts/abis/PrivacyPools.json";

// Default RPC for Starknet Sepolia
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo";

interface InclusionSet {
  id: string;
  name: string;
  memberCount: number;
  root: string;
  aspId: string;
  isUserMember: boolean;
}

interface UseCancelRagequitResult {
  // State
  isLoading: boolean;
  error: string | null;
  inclusionSets: InclusionSet[];
  selectedSetId: string | null;
  ragequitRequest: RagequitRequest | null;

  // Actions
  fetchInclusionSets: () => Promise<void>;
  fetchRagequitRequest: (requestId: bigint) => Promise<void>;
  selectInclusionSet: (setId: string) => void;
  cancelRagequit: () => Promise<{ txHash: string }>;

  // Transaction state
  isSubmitting: boolean;
  txHash: string | null;
}

/**
 * Known inclusion sets on Sepolia (can be fetched from contract events in production)
 * These are ASP (Association Set Provider) maintained sets
 */
const KNOWN_INCLUSION_SETS = [
  { id: "0x1", name: "Default Inclusion Set", aspId: "0x0" },
  { id: "0x2", name: "Verified Users Set", aspId: "0x1" },
  { id: "0x3", name: "High-Trust Set", aspId: "0x2" },
];

export function useCancelRagequit(): UseCancelRagequitResult {
  const { address } = useAccount();
  const { sendAsync } = useSendTransaction({});
  const addresses = getContractAddresses("sepolia");

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inclusionSets, setInclusionSets] = useState<InclusionSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [ragequitRequest, setRagequitRequest] = useState<RagequitRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Provider and contract
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const privacyPoolsContract = new Contract(
    PrivacyPoolsABI,
    addresses.PRIVACY_POOLS,
    provider
  );

  /**
   * Fetch available inclusion sets from contract
   */
  const fetchInclusionSets = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      const sets: InclusionSet[] = [];

      // Fetch info for each known set
      for (const knownSet of KNOWN_INCLUSION_SETS) {
        try {
          // Get set info from contract
          const setInfoResult = await privacyPoolsContract.call("get_association_set_info", [knownSet.id]);
          const setInfo = setInfoResult as Record<string, unknown>;

          // Check if this is an inclusion set (not exclusion)
          const setType = setInfo?.set_type as { variant?: { Inclusion?: unknown } } | undefined;
          if (setInfo && setType?.variant?.Inclusion !== undefined) {
            // Check if user's commitment is in this set
            let isUserMember = false;
            if (ragequitRequest?.commitment) {
              try {
                const isMember = await privacyPoolsContract.call("is_in_association_set", [
                  knownSet.id,
                  ragequitRequest.commitment,
                ]);
                isUserMember = Boolean(isMember);
              } catch {
                // Ignore - user might not be in this set
              }
            }

            const treeState = setInfo.tree_state as { root?: { toString(): string } } | undefined;
            sets.push({
              id: knownSet.id,
              name: knownSet.name,
              memberCount: Number(setInfo.member_count || 0),
              root: treeState?.root?.toString() || "0x0",
              aspId: knownSet.aspId,
              isUserMember,
            });
          }
        } catch (e) {
          // Set might not exist, continue to next
          console.warn(`Failed to fetch set ${knownSet.id}:`, e);
        }
      }

      setInclusionSets(sets);

      // Auto-select first set where user is a member, or first available
      const memberSet = sets.find(s => s.isUserMember);
      if (memberSet) {
        setSelectedSetId(memberSet.id);
      } else if (sets.length > 0) {
        setSelectedSetId(sets[0].id);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to fetch inclusion sets";
      setError(errorMessage);
      console.error("Fetch inclusion sets error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [address, ragequitRequest?.commitment]);

  /**
   * Fetch ragequit request details
   */
  const fetchRagequitRequest = useCallback(async (requestId: bigint) => {
    setIsLoading(true);
    setError(null);

    try {
      // Convert u256 to two felt252 for contract call
      const requestIdLow = (requestId & ((1n << 128n) - 1n)).toString();
      const requestIdHigh = (requestId >> 128n).toString();

      const requestResult = await privacyPoolsContract.call("get_pp_ragequit_request", [
        requestIdLow,
        requestIdHigh,
      ]);
      const request = requestResult as Record<string, unknown> | null;

      if (request) {
        const amount = request.amount as { low?: number | bigint; high?: number | bigint } | undefined;
        setRagequitRequest({
          requestId,
          commitment: String(request.commitment || "0x0"),
          depositor: String(request.depositor || "0x0"),
          amount: BigInt(amount?.low || 0) + (BigInt(amount?.high || 0) << 128n),
          recipient: String(request.recipient || "0x0"),
          initiatedAt: Number(request.initiated_at || 0),
          executableAt: Number(request.executable_at || 0),
        });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to fetch ragequit request";
      setError(errorMessage);
      console.error("Fetch ragequit request error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Select an inclusion set to rejoin
   */
  const selectInclusionSet = useCallback((setId: string) => {
    setSelectedSetId(setId);
    setError(null);
  }, []);

  /**
   * Generate Merkle proof for the selected set
   */
  const generateInclusionProof = useCallback(async (
    setId: string,
    commitment: string
  ): Promise<LeanIMTProof> => {
    // In production, this would:
    // 1. Fetch all leaves from the set (or use a proof service)
    // 2. Find the user's commitment index
    // 3. Generate the Merkle proof

    // For now, we'll generate a proof assuming the commitment is at index 0
    // In production, you'd need a proof service or fetch leaves from contract events

    const selectedSet = inclusionSets.find(s => s.id === setId);
    if (!selectedSet) {
      throw new Error("Selected inclusion set not found");
    }

    // Fetch leaves from contract (this is simplified - production would use events or proof service)
    // For demo purposes, we'll create a minimal proof
    const leafBigint = BigInt(commitment);
    const rootBigint = BigInt(selectedSet.root);

    // Generate a minimal valid proof structure
    // In production, this would use getMerkleProof with actual leaves
    const proof: MerkleProof = {
      leaf: leafBigint,
      leafIndex: 0,
      pathElements: [], // Will be populated from contract
      pathIndices: [],
      root: rootBigint,
    };

    // Try to fetch real proof from API or generate from leaves
    try {
      // In production: call proof service or fetch leaves
      // const leaves = await fetchLeavesFromContract(...);
      // proof = await getMerkleProof(leafIndex, leaves);

      // For now, return the structure (contract will verify)
      return merkleProofToLeanIMT(proof, selectedSet.memberCount);
    } catch (e) {
      console.warn("Could not generate full proof, using minimal structure:", e);
      return merkleProofToLeanIMT(proof, selectedSet.memberCount);
    }
  }, [inclusionSets]);

  /**
   * Cancel the ragequit by rejoining an inclusion set
   */
  const cancelRagequit = useCallback(async (): Promise<{ txHash: string }> => {
    if (!address) {
      throw new Error("Wallet not connected");
    }
    if (!ragequitRequest) {
      throw new Error("No ragequit request found");
    }
    if (!selectedSetId) {
      throw new Error("No inclusion set selected");
    }

    setIsSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      // Generate inclusion proof for the selected set
      const inclusionProof = await generateInclusionProof(
        selectedSetId,
        ragequitRequest.commitment
      );

      // Build the cancel ragequit transaction
      const call = buildCancelRagequitCall(
        ragequitRequest.requestId,
        selectedSetId,
        inclusionProof
      );

      // Send the transaction
      const response = await sendAsync([call]);
      const hash = response.transaction_hash;

      setTxHash(hash);
      return { txHash: hash };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Cancel ragequit failed";
      setError(errorMessage);
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }, [address, ragequitRequest, selectedSetId, generateInclusionProof, sendAsync]);

  return {
    isLoading,
    error,
    inclusionSets,
    selectedSetId,
    ragequitRequest,
    fetchInclusionSets,
    fetchRagequitRequest,
    selectInclusionSet,
    cancelRagequit,
    isSubmitting,
    txHash,
  };
}

export type { InclusionSet, UseCancelRagequitResult };
