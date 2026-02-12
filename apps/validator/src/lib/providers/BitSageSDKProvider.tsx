"use client";

import { ReactNode, useMemo, useState, useEffect, createContext, useContext } from "react";
import { useAccount } from "@starknet-react/core";
import {
  BitSageProvider,
  useBitSage,
  WebSocketProvider,
  PrivacyProvider,
} from "@bitsagecli/sdk/react";
import type { Network } from "@bitsagecli/sdk";

interface BitSageSDKProviderProps {
  children: ReactNode;
}

// Context to track if SDK provider is mounted and ready
const SDKReadyContext = createContext<boolean>(false);

/**
 * Hook to check if SDK is mounted and ready
 * Use this before calling any SDK hooks to prevent "must be used within provider" errors
 */
export function useSDKMounted(): boolean {
  return useContext(SDKReadyContext);
}

/**
 * BitSage SDK Provider
 *
 * Wraps the dashboard with BitSage SDK context, connecting to the
 * user's Starknet wallet and providing access to all SDK functionality.
 */
export function BitSageSDKProvider({ children }: BitSageSDKProviderProps) {
  const { address, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [connectionStable, setConnectionStable] = useState(false);

  // Track when wallet connection becomes stable (persists for a while)
  useEffect(() => {
    if (!isConnected) {
      setConnectionStable(false);
      setWsReady(false);
      return;
    }

    // Wait for connection to be stable before enabling WebSocket
    // This prevents race conditions during wallet connect/disconnect cycles
    const timer = setTimeout(() => {
      setConnectionStable(true);
    }, 1500); // 1.5 seconds after wallet connects

    return () => clearTimeout(timer);
  }, [isConnected]);

  // Delay WebSocket connection until component is fully mounted AND connection is stable
  useEffect(() => {
    setMounted(true);
  }, []);

  // Only enable WebSocket after mounted AND connection has been stable
  useEffect(() => {
    if (!mounted || !connectionStable) {
      setWsReady(false);
      return;
    }

    // Additional delay after connection is stable
    const timer = setTimeout(() => {
      setWsReady(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [mounted, connectionStable]);

  // Determine network from environment
  const network: Network = useMemo(() => {
    const envNetwork = process.env.NEXT_PUBLIC_STARKNET_NETWORK;
    if (envNetwork === "mainnet") return "mainnet";
    if (envNetwork === "local") return "local";
    return "sepolia";
  }, []);

  // API and RPC URLs from environment
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || undefined;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || undefined;
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || undefined;

  // Create wallet config when connected
  const walletConfig = useMemo(() => {
    if (!isConnected || !address) return undefined;
    return { address };
  }, [isConnected, address]);

  // Only render WebSocket provider when actually connected to avoid auto-connect errors
  const renderContent = () => (
    <PrivacyProvider autoLoad={false}>
      {children}
    </PrivacyProvider>
  );

  // Suppress SDK WebSocket errors during initial connection
  const handleWsError = useMemo(() => {
    return {
      onError: (error: Error) => {
        // Suppress initial connection errors - they're expected during startup
        if (process.env.NODE_ENV === 'development') {
          // Only log in dev, not as error
          console.debug('[SDK WebSocket] Connection attempt:', error.message);
        }
      },
    };
  }, []);

  // Always provide WebSocket context, but only connect when ready
  // This prevents "must be used within WebSocketProvider" errors during SSR
  const shouldConnectWs = Boolean(isConnected && wsUrl && mounted && wsReady);
  const effectiveWsUrl = wsUrl || "wss://placeholder.invalid"; // Placeholder URL for SSR

  return (
    <SDKReadyContext.Provider value={true}>
      <BitSageProvider
        network={network}
        apiUrl={apiUrl}
        rpcUrl={rpcUrl}
        wallet={walletConfig}
      >
        <WebSocketProvider
          url={effectiveWsUrl}
          autoConnect={shouldConnectWs}
          {...handleWsError}
        >
          {renderContent()}
        </WebSocketProvider>
      </BitSageProvider>
    </SDKReadyContext.Provider>
  );
}

/**
 * Hook to check if SDK is ready
 */
export function useSDKReady(): boolean {
  const { isConnected } = useBitSage();
  return isConnected;
}

/**
 * Re-export SDK hooks for convenience
 */
export {
  useBitSage,
  useBitSageClient,
  useWallet,
  useNetwork,
  useContracts,
} from "@bitsagecli/sdk/react";

// Job hooks
export {
  useSubmitJob,
  useJobStatus,
  useJobs,
  useWaitForJob,
  useCancelJob,
  useJobResult,
} from "@bitsagecli/sdk/react";

// Mining hooks
export {
  useMiningRewardEstimate,
  useWorkerMiningStats,
  useMiningPoolStatus,
  useDailyCap,
  useCurrentBaseReward,
  useGpuMultiplier,
  useRemainingDailyCap,
  useMiningOverview,
} from "@bitsagecli/sdk/react";

// Staking hooks
export {
  useStakeInfo,
  useStake,
  useUnstake,
  useClaimRewards,
  useStakingConfig,
  useWorkerTier,
  useWorkerTierBenefits,
  useMinStake,
  usePendingUnstakes,
  useDelegateStake,
  useTotalStaked,
  useMyStaking,
} from "@bitsagecli/sdk/react";

// Worker hooks
export {
  useWorkers,
  useWorker,
  useWorkerProfile,
  useLeaderboard,
  useRegisterWorker,
  useHeartbeat,
  useWorkersByCapability,
} from "@bitsagecli/sdk/react";

// Privacy hooks
export {
  usePrivateAccount,
  usePrivateBalance,
  usePrivateTransfer,
  useRegisterPrivateAccount,
  useStealthAddress,
  useRefreshPrivateBalances,
  useAllPrivateBalances,
} from "@bitsagecli/sdk/react";

// Governance hooks
export {
  useProposal,
  useProposals,
  useCreateProposal,
  useVote,
  useVotingPower,
  useGovernanceRights,
  useDelegate,
  useGovernanceStats,
  usePoolBalances,
  useTotalBurned,
  useVestingStatus,
} from "@bitsagecli/sdk/react";

// Dashboard hooks
export {
  useValidatorStatus,
  useGpuMetrics,
  useRewardsInfo,
  useRewardsHistory,
  useJobAnalytics,
  useRecentJobs,
  useNetworkStats,
  useNetworkWorkers,
  useValidatorOverview,
} from "@bitsagecli/sdk/react";

// WebSocket hooks
export {
  useJobUpdates,
  useWorkerUpdates,
  useNetworkStatsStream,
  useProofVerified,
  useMultipleJobUpdates,
  useSmoothedNetworkStats,
} from "@bitsagecli/sdk/react";

// Privacy context
export {
  usePrivacy,
  usePrivacyKeys,
  usePrivacyClient,
} from "@bitsagecli/sdk/react";

// WebSocket context
export {
  useWebSocket,
  useWebSocketConnection,
} from "@bitsagecli/sdk/react";
