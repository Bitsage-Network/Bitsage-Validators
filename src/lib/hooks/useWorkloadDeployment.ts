/**
 * useWorkloadDeployment Hook
 *
 * Manages workload deployment state, including:
 * - Fetching connected GPU workers for the current wallet
 * - Deploying workloads to workers
 * - Tracking deployment progress via polling
 * - Stopping deployed workloads
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from '@starknet-react/core';
import {
  getMyWorkers,
  getMyDeployments,
  deployWorkload,
  getDeploymentStatus,
  stopWorkload,
  MyWorker,
  WorkloadDeployment,
  DeploymentStatus,
  WorkloadDeployResponse,
} from '../api/client';

interface UseWorkloadDeploymentReturn {
  // Workers
  myWorkers: MyWorker[];
  hasConnectedWorker: boolean;
  isLoadingWorkers: boolean;
  workersError: string | null;
  refreshWorkers: () => Promise<void>;

  // Available worker (first idle worker)
  availableWorker: MyWorker | null;

  // Deployments
  activeDeployment: WorkloadDeployment | null;
  allDeployments: WorkloadDeployment[];
  isLoadingDeployments: boolean;

  // Deployment actions
  isDeploying: boolean;
  deploymentError: string | null;
  deploy: (workloadId: string, workerId?: string) => Promise<WorkloadDeployResponse | null>;
  stop: (deploymentId?: string) => Promise<boolean>;

  // Validation
  canDeploy: (minVramGb: number) => boolean;
  getInsufficientVramMessage: (minVramGb: number) => string | null;
}

const POLLING_INTERVAL = 2000; // 2 seconds

export function useWorkloadDeployment(): UseWorkloadDeploymentReturn {
  const { address } = useAccount();

  // Workers state
  const [myWorkers, setMyWorkers] = useState<MyWorker[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);

  // Deployments state
  const [allDeployments, setAllDeployments] = useState<WorkloadDeployment[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(true);

  // Deployment action state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch workers
  const refreshWorkers = useCallback(async () => {
    if (!address) {
      setMyWorkers([]);
      setIsLoadingWorkers(false);
      return;
    }

    try {
      setWorkersError(null);
      const response = await getMyWorkers();
      setMyWorkers(response.data.workers || []);
    } catch (error) {
      console.error('[useWorkloadDeployment] Failed to fetch workers:', error);
      setWorkersError('Failed to fetch workers');
      setMyWorkers([]);
    } finally {
      setIsLoadingWorkers(false);
    }
  }, [address]);

  // Fetch deployments
  const refreshDeployments = useCallback(async () => {
    if (!address) {
      setAllDeployments([]);
      setIsLoadingDeployments(false);
      return;
    }

    try {
      const response = await getMyDeployments();
      setAllDeployments(response.data.deployments || []);
    } catch (error) {
      console.error('[useWorkloadDeployment] Failed to fetch deployments:', error);
      setAllDeployments([]);
    } finally {
      setIsLoadingDeployments(false);
    }
  }, [address]);

  // Poll deployment status
  const pollDeploymentStatus = useCallback(async (deploymentId: string) => {
    try {
      const response = await getDeploymentStatus(deploymentId);
      const deployment = response.data;

      // Update in allDeployments
      setAllDeployments((prev) =>
        prev.map((d) => (d.id === deploymentId ? deployment : d))
      );

      // Check if deployment is complete
      const terminalStatuses: DeploymentStatus[] = ['ready', 'failed', 'stopped'];
      if (terminalStatuses.includes(deployment.status)) {
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setActiveDeploymentId(null);

        // Refresh workers to update active_workload
        await refreshWorkers();
      }
    } catch (error) {
      console.error('[useWorkloadDeployment] Failed to poll deployment status:', error);
    }
  }, [refreshWorkers]);

  // Start polling for a deployment
  const startPolling = useCallback((deploymentId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setActiveDeploymentId(deploymentId);

    // Initial poll
    pollDeploymentStatus(deploymentId);

    // Set up interval
    pollingRef.current = setInterval(() => {
      pollDeploymentStatus(deploymentId);
    }, POLLING_INTERVAL);
  }, [pollDeploymentStatus]);

  // Deploy workload
  const deploy = useCallback(async (
    workloadId: string,
    workerId?: string
  ): Promise<WorkloadDeployResponse | null> => {
    if (!address) {
      setDeploymentError('Wallet not connected');
      return null;
    }

    setIsDeploying(true);
    setDeploymentError(null);

    try {
      const response = await deployWorkload({
        workload_id: workloadId,
        owner_address: address,
        worker_id: workerId,
      });

      const deployResponse = response.data;

      // Add to deployments list
      const newDeployment: WorkloadDeployment = {
        id: deployResponse.deployment_id,
        workload_id: workloadId,
        worker_id: deployResponse.worker_id,
        owner_address: address,
        status: deployResponse.status,
        progress: null,
        created_at: Date.now(),
        ready_at: null,
        error: null,
      };
      setAllDeployments((prev) => [newDeployment, ...prev]);

      // Start polling for status updates
      startPolling(deployResponse.deployment_id);

      // Refresh workers to update active_workload
      await refreshWorkers();

      return deployResponse;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to deploy workload';
      console.error('[useWorkloadDeployment] Deploy failed:', error);
      setDeploymentError(errorMessage);
      return null;
    } finally {
      setIsDeploying(false);
    }
  }, [address, startPolling, refreshWorkers]);

  // Stop workload
  const stop = useCallback(async (deploymentId?: string): Promise<boolean> => {
    const targetId = deploymentId || activeDeploymentId;
    if (!targetId) {
      setDeploymentError('No deployment to stop');
      return false;
    }

    try {
      await stopWorkload(targetId);

      // Update deployment status locally
      setAllDeployments((prev) =>
        prev.map((d) =>
          d.id === targetId ? { ...d, status: 'stopped' as DeploymentStatus } : d
        )
      );

      // Stop polling if this is the active deployment
      if (pollingRef.current && targetId === activeDeploymentId) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setActiveDeploymentId(null);
      }

      // Refresh workers to update active_workload
      await refreshWorkers();

      return true;
    } catch (error) {
      console.error('[useWorkloadDeployment] Stop failed:', error);
      setDeploymentError('Failed to stop workload');
      return false;
    }
  }, [activeDeploymentId, refreshWorkers]);

  // Validation helpers
  const canDeploy = useCallback((minVramGb: number): boolean => {
    if (myWorkers.length === 0) return false;

    // Check if there's an idle worker with enough VRAM
    return myWorkers.some(
      (w) => w.active_workload === null && (w.vram_gb ?? 0) >= minVramGb
    );
  }, [myWorkers]);

  const getInsufficientVramMessage = useCallback((minVramGb: number): string | null => {
    if (myWorkers.length === 0) {
      return 'No GPU workers connected. Start your worker with OWNER_ADDRESS set.';
    }

    const idleWorkers = myWorkers.filter((w) => w.active_workload === null);
    if (idleWorkers.length === 0) {
      const busyWorker = myWorkers[0];
      return `Worker is running "${busyWorker.active_workload}". Stop it first.`;
    }

    const bestWorker = idleWorkers.reduce((best, w) =>
      (w.vram_gb ?? 0) > (best.vram_gb ?? 0) ? w : best
    );

    if ((bestWorker.vram_gb ?? 0) < minVramGb) {
      return `Requires ${minVramGb}GB VRAM. Your GPU has ${bestWorker.vram_gb ?? 0}GB.`;
    }

    return null;
  }, [myWorkers]);

  // Derived state
  const hasConnectedWorker = myWorkers.length > 0;
  const availableWorker = myWorkers.find((w) => w.active_workload === null) ?? null;
  const activeDeployment = allDeployments.find(
    (d) => d.id === activeDeploymentId ||
      (d.status !== 'stopped' && d.status !== 'failed' && d.status !== 'ready')
  ) ?? null;

  // Initial load and cleanup
  useEffect(() => {
    refreshWorkers();
    refreshDeployments();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [refreshWorkers, refreshDeployments]);

  // Resume polling for in-progress deployments
  useEffect(() => {
    const inProgressDeployment = allDeployments.find(
      (d) => d.status !== 'ready' && d.status !== 'failed' && d.status !== 'stopped'
    );

    if (inProgressDeployment && !activeDeploymentId) {
      startPolling(inProgressDeployment.id);
    }
  }, [allDeployments, activeDeploymentId, startPolling]);

  return {
    // Workers
    myWorkers,
    hasConnectedWorker,
    isLoadingWorkers,
    workersError,
    refreshWorkers,
    availableWorker,

    // Deployments
    activeDeployment,
    allDeployments,
    isLoadingDeployments,

    // Deployment actions
    isDeploying,
    deploymentError,
    deploy,
    stop,

    // Validation
    canDeploy,
    getInsufficientVramMessage,
  };
}

export default useWorkloadDeployment;
