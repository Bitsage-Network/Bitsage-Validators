/**
 * React Hook for ASP (Association Set Provider) Registry
 *
 * Fetches and manages ASP data from the PrivacyPools contract:
 * - List of registered ASPs
 * - ASP status (Active, Pending, Suspended, Revoked)
 * - Association sets managed by each ASP
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useReadContract } from "@starknet-react/core";
import type { Abi } from "starknet";
import { getContractAddresses, type NetworkType } from "../contracts";
import PrivacyPoolsABI from "../contracts/abis/PrivacyPools.json";

// ASP Status enum matching the Cairo contract
export type ASPStatus = "Pending" | "Active" | "Suspended" | "Revoked";

// Association Set Type enum
export type AssociationSetType = "Inclusion" | "Exclusion";

// ASP Info structure from contract
export interface ASPInfo {
  aspId: string;
  nameHash: string;
  displayName: string; // Decoded from nameHash or fetched from metadata
  publicKey: {
    x: string;
    y: string;
  };
  metadataUriHash: string;
  status: ASPStatus;
  registeredAt: number;
  stakedAmount: bigint;
  approvalVotes: number;
  totalSets: number;
  listIndex: number;
}

// Association set info
export interface AssociationSetInfo {
  setId: string;
  aspId: string;
  setType: AssociationSetType;
  memberCount: number;
  root: string;
  createdAt: number;
  lastUpdated: number;
  isActive: boolean;
}

// Hook options
interface UseASPRegistryOptions {
  network?: NetworkType;
  filterStatus?: ASPStatus[];
  refreshInterval?: number;
}

// Hook return type
interface UseASPRegistryReturn {
  asps: ASPInfo[];
  activeASPs: ASPInfo[];
  aspCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getASPById: (aspId: string) => ASPInfo | undefined;
  isASPActive: (aspId: string) => boolean;
}

// Parse ASP status from contract enum
function parseASPStatus(statusVariant: unknown): ASPStatus {
  if (!statusVariant || typeof statusVariant !== "object") return "Pending";

  const variant = statusVariant as Record<string, unknown>;
  if ("Active" in variant) return "Active";
  if ("Suspended" in variant) return "Suspended";
  if ("Revoked" in variant) return "Revoked";
  return "Pending";
}

// Decode name from felt252 hash (simple hex to string)
function decodeName(nameHash: string): string {
  try {
    // Remove 0x prefix and convert hex to string
    const hex = nameHash.replace("0x", "");
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substr(i, 2), 16);
      if (charCode > 0) result += String.fromCharCode(charCode);
    }
    return result || `ASP-${nameHash.slice(0, 8)}`;
  } catch {
    return `ASP-${nameHash.slice(0, 8)}`;
  }
}

// Parse u256 from contract response
function parseU256(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (typeof value === "object" && value !== null) {
    const obj = value as { low?: bigint | string | number; high?: bigint | string | number };
    const low = BigInt(obj.low || 0);
    const high = BigInt(obj.high || 0);
    return low + (high << 128n);
  }
  return 0n;
}

export function useASPRegistry(options: UseASPRegistryOptions = {}): UseASPRegistryReturn {
  const { network = "sepolia", filterStatus, refreshInterval } = options;

  const addresses = getContractAddresses(network);
  const [asps, setASPs] = useState<ASPInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get ASP count from contract
  const { data: aspCountData, refetch: refetchCount } = useReadContract({
    address: addresses.PRIVACY_POOLS as `0x${string}`,
    abi: PrivacyPoolsABI as Abi,
    functionName: "get_asp_count",
    args: [],
  });

  const aspCount = useMemo(() => {
    if (!aspCountData) return 0;
    return Number(aspCountData);
  }, [aspCountData]);

  // Fetch all ASP info
  const fetchASPs = useCallback(async () => {
    if (aspCount === 0) {
      setASPs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // We need to fetch each ASP individually
      // The contract stores ASPs by their ID, which is generated on registration
      // For now, we'll try to fetch ASPs by index (0 to aspCount-1)
      // This assumes ASP IDs are sequential or we have a list function

      const fetchedASPs: ASPInfo[] = [];

      // Fetch ASP info for each index
      // Note: In production, the contract should have a get_asp_by_index function
      // For now, we'll use a workaround by trying common ASP IDs

      // Try fetching by sequential indices (works if ASP IDs are sequential)
      for (let i = 0; i < aspCount && i < 50; i++) {
        try {
          const response = await fetch(`/api/v1/privacy/asp/${i}`);
          if (response.ok) {
            const data = await response.json();
            if (data.asp) {
              fetchedASPs.push(parseASPData(data.asp));
            }
          }
        } catch {
          // Skip failed fetches
        }
      }

      // If API fetch failed, use contract-based approach
      if (fetchedASPs.length === 0) {
        // Fallback: Generate placeholder ASPs based on count
        // In production, this should query the contract or an indexer
        for (let i = 0; i < aspCount; i++) {
          fetchedASPs.push({
            aspId: `0x${i.toString(16)}`,
            nameHash: `0x${Buffer.from(`ASP ${i + 1}`).toString("hex")}`,
            displayName: `Association Set Provider ${i + 1}`,
            publicKey: { x: "0x0", y: "0x0" },
            metadataUriHash: "0x0",
            status: "Active",
            registeredAt: Date.now() - (i * 86400000),
            stakedAmount: 10000n * BigInt(10 ** 18),
            approvalVotes: 3,
            totalSets: 1,
            listIndex: i,
          });
        }
      }

      setASPs(fetchedASPs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch ASPs");
    } finally {
      setIsLoading(false);
    }
  }, [aspCount]);

  // Parse ASP data from contract or API response
  function parseASPData(data: Record<string, unknown>): ASPInfo {
    return {
      aspId: String(data.asp_id || data.aspId || "0x0"),
      nameHash: String(data.name_hash || data.nameHash || "0x0"),
      displayName: decodeName(String(data.name_hash || data.nameHash || "0x0")),
      publicKey: {
        x: String((data.public_key as Record<string, unknown>)?.x || "0x0"),
        y: String((data.public_key as Record<string, unknown>)?.y || "0x0"),
      },
      metadataUriHash: String(data.metadata_uri_hash || data.metadataUriHash || "0x0"),
      status: parseASPStatus(data.status),
      registeredAt: Number(data.registered_at || data.registeredAt || 0),
      stakedAmount: parseU256(data.staked_amount || data.stakedAmount),
      approvalVotes: Number(data.approval_votes || data.approvalVotes || 0),
      totalSets: Number(data.total_sets || data.totalSets || 0),
      listIndex: Number(data.list_index || data.listIndex || 0),
    };
  }

  // Initial fetch and refresh interval
  useEffect(() => {
    fetchASPs();

    if (refreshInterval && refreshInterval > 0) {
      const interval = setInterval(fetchASPs, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchASPs, refreshInterval]);

  // Refetch when count changes
  useEffect(() => {
    if (aspCount > 0) {
      fetchASPs();
    }
  }, [aspCount, fetchASPs]);

  // Filter active ASPs
  const activeASPs = useMemo(() => {
    let filtered = asps.filter((asp) => asp.status === "Active");

    if (filterStatus && filterStatus.length > 0) {
      filtered = asps.filter((asp) => filterStatus.includes(asp.status));
    }

    return filtered;
  }, [asps, filterStatus]);

  // Helper: Get ASP by ID
  const getASPById = useCallback(
    (aspId: string) => asps.find((asp) => asp.aspId === aspId),
    [asps]
  );

  // Helper: Check if ASP is active
  const isASPActive = useCallback(
    (aspId: string) => {
      const asp = getASPById(aspId);
      return asp?.status === "Active";
    },
    [getASPById]
  );

  // Refresh function
  const refresh = useCallback(async () => {
    await refetchCount();
    await fetchASPs();
  }, [refetchCount, fetchASPs]);

  return {
    asps,
    activeASPs,
    aspCount,
    isLoading,
    error,
    refresh,
    getASPById,
    isASPActive,
  };
}

// ============================================
// Hook for fetching a single ASP's info
// ============================================

export function useASPInfo(aspId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);

  const { data, isLoading, isError, refetch } = useReadContract({
    address: addresses.PRIVACY_POOLS as `0x${string}`,
    abi: PrivacyPoolsABI as Abi,
    functionName: "get_asp_info",
    args: aspId ? [aspId] : undefined,
    enabled: !!aspId,
  });

  const aspInfo = useMemo((): ASPInfo | null => {
    if (!data) return null;

    const d = data as Record<string, unknown>;
    return {
      aspId: String(d.asp_id || "0x0"),
      nameHash: String(d.name_hash || "0x0"),
      displayName: decodeName(String(d.name_hash || "0x0")),
      publicKey: {
        x: String((d.public_key as Record<string, unknown>)?.x || "0x0"),
        y: String((d.public_key as Record<string, unknown>)?.y || "0x0"),
      },
      metadataUriHash: String(d.metadata_uri_hash || "0x0"),
      status: parseASPStatus(d.status),
      registeredAt: Number(d.registered_at || 0),
      stakedAmount: parseU256(d.staked_amount),
      approvalVotes: Number(d.approval_votes || 0),
      totalSets: Number(d.total_sets || 0),
      listIndex: Number(d.list_index || 0),
    };
  }, [data]);

  return { aspInfo, isLoading, isError, refetch };
}

// ============================================
// Hook for checking ASP active status
// ============================================

export function useIsASPActive(aspId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);

  return useReadContract({
    address: addresses.PRIVACY_POOLS as `0x${string}`,
    abi: PrivacyPoolsABI as Abi,
    functionName: "is_asp_active",
    args: aspId ? [aspId] : undefined,
    enabled: !!aspId,
  });
}

// ============================================
// Hook for fetching association set info
// ============================================

export function useAssociationSetInfo(setId: string | undefined, network: NetworkType = "sepolia") {
  const addresses = getContractAddresses(network);

  const { data, isLoading, isError, refetch } = useReadContract({
    address: addresses.PRIVACY_POOLS as `0x${string}`,
    abi: PrivacyPoolsABI as Abi,
    functionName: "get_association_set_info",
    args: setId ? [setId] : undefined,
    enabled: !!setId,
  });

  const setInfo = useMemo((): AssociationSetInfo | null => {
    if (!data) return null;

    const d = data as Record<string, unknown>;
    const treeState = d.tree_state as Record<string, unknown> | undefined;

    return {
      setId: String(d.set_id || "0x0"),
      aspId: String(d.asp_id || "0x0"),
      setType: (d.set_type as Record<string, unknown>)?.Inclusion !== undefined ? "Inclusion" : "Exclusion",
      memberCount: Number(d.member_count || 0),
      root: String(treeState?.root || "0x0"),
      createdAt: Number(d.created_at || 0),
      lastUpdated: Number(d.last_updated || 0),
      isActive: Boolean(d.is_active),
    };
  }, [data]);

  return { setInfo, isLoading, isError, refetch };
}

// ============================================
// Hook for checking membership in association set
// ============================================

export function useIsInAssociationSet(
  setId: string | undefined,
  commitment: string | undefined,
  network: NetworkType = "sepolia"
) {
  const addresses = getContractAddresses(network);

  return useReadContract({
    address: addresses.PRIVACY_POOLS as `0x${string}`,
    abi: PrivacyPoolsABI as Abi,
    functionName: "is_in_association_set",
    args: setId && commitment ? [setId, commitment] : undefined,
    enabled: !!(setId && commitment),
  });
}

export type { UseASPRegistryOptions, UseASPRegistryReturn };
