"use client";

import { useConnect, useAccount, Connector, useSignTypedData } from "@starknet-react/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Shield,
  ArrowRight,
  Loader2,
  Cpu,
  Zap,
  Check,
  AlertCircle,
  Info,
  Pencil,
  X,
  Fingerprint,
  Lock,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoIcon } from "@/components/ui/Logo";
import {
  useValidatorRegistration,
  GPU_TIERS,
  type GPUTier,
} from "@/lib/hooks/useValidatorRegistration";
import { cn } from "@/lib/utils";

// Minimum stake in SAGE tokens (display value)
const MIN_STAKE_DISPLAY = 1000;
const SAGE_DECIMALS = 18;

type Step = "connect" | "register";

export default function ConnectPage() {
  const { connect, connectAsync, connectors, isPending, error: connectError } = useConnect();
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("connect");
  const [stakeAmount, setStakeAmount] = useState(MIN_STAKE_DISPLAY.toString());
  const [commissionBps, setCommissionBps] = useState("500"); // 5%
  const [connectingConnectorId, setConnectingConnectorId] = useState<string | null>(null);

  // Signature verification state
  const [isRequestingSignature, setIsRequestingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [hasVerifiedSignature, setHasVerifiedSignature] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureStep, setSignatureStep] = useState<'preview' | 'signing' | 'success' | 'error'>('preview');

  // Create typed data for signature verification
  // Professional EIP-712 style message for wallet verification
  // Note: felt type has max 31 characters for short strings
  const getTypedData = useCallback(() => {
    const timestamp = Math.floor(Date.now() / 1000);
    const expiresAt = timestamp + 3600; // Valid for 1 hour
    return {
      types: {
        StarkNetDomain: [
          { name: "name", type: "felt" },
          { name: "version", type: "felt" },
          { name: "chainId", type: "felt" },
        ],
        Auth: [
          { name: "scope", type: "felt" },
          { name: "wallet", type: "felt" },
          { name: "issued", type: "felt" },
          { name: "expires", type: "felt" },
        ],
      },
      primaryType: "Auth" as const,
      domain: {
        name: "BitSage Network",
        version: "1",
        chainId: "SN_SEPOLIA", // Use SN_MAIN for mainnet
      },
      message: {
        scope: "validator_access",
        wallet: address?.slice(0, 31) || "unknown",
        issued: timestamp.toString(),
        expires: expiresAt.toString(),
      },
    };
  }, [address]);

  // Sign typed data hook
  const { signTypedDataAsync, isPending: isSignPending } = useSignTypedData({});

  // Validator registration hook
  const {
    gpuInfo,
    isDetectingGPU,
    detectGPU,
    validatorStatus,
    isLoadingStatus,
    networkStats,
    sageBalance,
    hasEnoughBalance,
    isRegistering,
    registrationError,
    register,
    txHash,
  } = useValidatorRegistration();

  // Set mounted after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle step transitions - redirect to dashboard after signature verification
  const [hasExplicitlyConnected, setHasExplicitlyConnected] = useState(false);

  useEffect(() => {
    if (isConnected && address && hasExplicitlyConnected && hasVerifiedSignature) {
      // User connected AND signed - redirect to dashboard
      router.push("/dashboard");
    } else if (!isConnected) {
      setStep("connect");
      setHasVerifiedSignature(false);
    }
  }, [isConnected, address, router, hasExplicitlyConnected, hasVerifiedSignature]);

  // Open signature modal for professional flow
  const openSignatureModal = useCallback(() => {
    setShowSignatureModal(true);
    setSignatureStep('preview');
    setSignatureError(null);
  }, []);

  // Execute the signature request
  const executeSignature = useCallback(async () => {
    if (!isConnected || !address) return false;

    setSignatureStep('signing');
    setIsRequestingSignature(true);
    setSignatureError(null);

    try {
      const typedData = getTypedData();
      await signTypedDataAsync(typedData);
      setHasVerifiedSignature(true);
      setSignatureStep('success');

      // Set cookie to indicate wallet is verified (for middleware auth)
      document.cookie = `wallet-verified=${address}; path=/; max-age=86400`; // 24 hours

      // Auto-close modal and redirect after success
      setTimeout(() => {
        setShowSignatureModal(false);
        router.push("/dashboard");
      }, 1500);

      return true;
    } catch (error) {
      console.error("Signature verification failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Signature rejected";
      setSignatureError(errorMessage);
      setSignatureStep('error');
      setHasVerifiedSignature(false);
      return false;
    } finally {
      setIsRequestingSignature(false);
    }
  }, [isConnected, address, signTypedDataAsync, getTypedData, router]);

  // Request signature verification (legacy - opens modal now)
  const requestSignatureVerification = useCallback(async () => {
    if (!isConnected || !address) return false;
    openSignatureModal();
    return false; // Return false since we need user to confirm in modal
  }, [isConnected, address, openSignatureModal]);

  const handleConnect = async (connector: Connector) => {
    try {
      setConnectingConnectorId(connector.id);
      setSignatureError(null);
      setHasExplicitlyConnected(true);
      await connectAsync({ connector });
      // Connection successful - now open signature modal
      // Small delay to ensure wallet state is updated
      setTimeout(() => {
        setConnectingConnectorId(null);
        openSignatureModal();
      }, 500);
    } catch (error) {
      console.error("Connection failed:", error);
      setHasExplicitlyConnected(false);
      setConnectingConnectorId(null);
    }
  };

  // Handle continue to dashboard (for already connected wallets)
  const handleContinueToDashboard = async () => {
    if (hasVerifiedSignature) {
      router.push("/dashboard");
      return;
    }
    // Open the professional signature modal
    openSignatureModal();
  };

  const handleRegister = async () => {
    try {
      const stakeWei = BigInt(parseFloat(stakeAmount) * 10 ** SAGE_DECIMALS);
      await register({
        stakeAmount: stakeWei,
        commissionBps: parseInt(commissionBps),
      });
      // On success, redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Registration failed:", error);
    }
  };

  const handleSkipRegistration = () => {
    // Allow users to skip and browse without registering as validator
    router.push("/dashboard");
  };

  // Format balance for display
  const formatBalance = (wei: bigint) => {
    return (Number(wei) / 10 ** SAGE_DECIMALS).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="min-h-screen bg-surface-dark bg-grid flex items-center justify-center p-4">
      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-accent-purple/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* Logo & Title */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-3 sm:mb-4"
          >
            <LogoIcon className="text-emerald-400" size={56} />
          </motion.div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Welcome to <span className="text-gradient">BitSage</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-400 px-4">
            {step === "connect"
              ? "Connect your wallet to access the validator dashboard"
              : "Register your GPU to start earning SAGE"}
          </p>
        </div>


        <AnimatePresence mode="wait">
          {step === "connect" ? (
            <motion.div
              key="connect"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Connect Card */}
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  Connect Wallet
                </h2>

                {/* Connection Error */}
                {connectError && (
                  <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">
                      {connectError.message || "Failed to connect wallet. Please try again."}
                    </p>
                  </div>
                )}

                {/* Already Connected - Show Signature Verification */}
                {isConnected && address && (
                  <div className="mb-4">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-400">Wallet Connected</span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono truncate">{address}</p>
                    </div>

                    {/* Signature Error */}
                    {signatureError && (
                      <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-300">{signatureError}</p>
                      </div>
                    )}

                    {/* Signature Status */}
                    {hasVerifiedSignature && (
                      <div className="mb-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-emerald-400">Signature verified</span>
                      </div>
                    )}

                    <motion.button
                      onClick={handleContinueToDashboard}
                      disabled={isRequestingSignature || isSignPending}
                      whileHover={{ scale: (isRequestingSignature || isSignPending) ? 1 : 1.02 }}
                      whileTap={{ scale: (isRequestingSignature || isSignPending) ? 1 : 0.98 }}
                      className={cn(
                        "w-full py-3 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all",
                        (isRequestingSignature || isSignPending)
                          ? "bg-emerald-600/50 cursor-wait"
                          : "bg-emerald-600 hover:bg-emerald-500"
                      )}
                    >
                      {(isRequestingSignature || isSignPending) ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Requesting Signature...
                        </>
                      ) : hasVerifiedSignature ? (
                        <>
                          Continue to Dashboard
                          <ArrowRight className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <Pencil className="w-4 h-4" />
                          Sign to Verify Ownership
                        </>
                      )}
                    </motion.button>

                    {!hasVerifiedSignature && (
                      <p className="text-xs text-gray-500 text-center mt-2">
                        Sign a message to verify you own this wallet
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {!mounted && (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="w-full flex items-center justify-between p-3 sm:p-4 bg-surface-elevated border border-surface-border rounded-xl animate-pulse">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-card" />
                            <div>
                              <div className="h-4 w-24 bg-surface-card rounded" />
                              <div className="h-3 w-16 bg-surface-card rounded mt-1" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {mounted && connectors.map((connector) => {
                    const isThisConnecting = connectingConnectorId === connector.id;
                    const isAnyConnecting = connectingConnectorId !== null;
                    return (
                      <motion.button
                        key={connector.id}
                        onClick={() => handleConnect(connector)}
                        disabled={isPending || isAnyConnecting}
                        whileHover={{ scale: isAnyConnecting ? 1 : 1.02 }}
                        whileTap={{ scale: isAnyConnecting ? 1 : 0.98 }}
                        className={cn(
                          "w-full flex items-center justify-between p-3 sm:p-4 bg-surface-elevated",
                          "border rounded-xl transition-all duration-200 group",
                          isThisConnecting
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-surface-border hover:border-emerald-500/50",
                          (isPending || isAnyConnecting) && !isThisConnecting && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-card flex items-center justify-center">
                            {connector.icon ? (
                              <img
                                src={typeof connector.icon === 'string' ? connector.icon : connector.icon.dark}
                                alt={connector.name}
                                className="w-6 h-6"
                              />
                            ) : (
                              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-sm sm:text-base font-medium text-white">{connector.name}</p>
                            <p className="text-xs sm:text-sm text-gray-500">
                              {isThisConnecting
                                ? "Connecting..."
                                : connector.id === "argentX"
                                ? "Most Popular"
                                : "Secure Wallet"}
                            </p>
                          </div>
                        </div>
                        {isThisConnecting ? (
                          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-hover:text-emerald-400 transition-colors" />
                        )}
                      </motion.button>
                    );
                  })}

                  {mounted && connectors.length === 0 && (
                    <div className="text-center py-8">
                      <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-400 mb-2">No wallets detected</p>
                      <p className="text-sm text-gray-500">
                        Install{" "}
                        <a
                          href="https://www.argent.xyz/argent-x/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          ArgentX
                        </a>{" "}
                        or{" "}
                        <a
                          href="https://braavos.app/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          Braavos
                        </a>{" "}
                        to continue
                      </p>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* GPU Registration Card */}
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  Register as Validator
                </h2>

                {/* GPU Detection */}
                <div className="mb-6">
                  <label className="text-sm text-gray-400 mb-2 block">GPU Detected</label>
                  <div className="p-4 bg-surface-elevated rounded-xl border border-surface-border">
                    {isDetectingGPU ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                        <span className="text-gray-400">Detecting GPU...</span>
                      </div>
                    ) : gpuInfo?.detected ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-500/20 rounded-lg">
                              <Cpu className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {gpuInfo.unmaskedRenderer || gpuInfo.renderer}
                              </p>
                              <p className="text-xs text-gray-500">
                                {gpuInfo.unmaskedVendor || gpuInfo.vendor}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-emerald-400">
                              Tier {gpuInfo.tier}
                            </p>
                            <p className="text-xs text-gray-500">
                              ~{gpuInfo.estimatedVRAM}GB VRAM
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn(
                            "px-2 py-1 rounded",
                            gpuInfo.tier >= 2
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          )}>
                            {GPU_TIERS[gpuInfo.tier as GPUTier].name}
                          </span>
                          {gpuInfo.hasTEE && (
                            <span className="px-2 py-1 rounded bg-accent-purple/20 text-accent-purple">
                              TEE Enabled
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-400">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">GPU not detected</span>
                        </div>
                        <button
                          onClick={detectGPU}
                          className="text-sm text-emerald-400 hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stake Amount */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Stake Amount (SAGE)</label>
                    <span className="text-xs text-gray-500">
                      Balance: {formatBalance(sageBalance)} SAGE
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      min={MIN_STAKE_DISPLAY}
                      className="w-full p-3 bg-surface-elevated border border-surface-border rounded-xl
                               text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                      placeholder={`Min ${MIN_STAKE_DISPLAY} SAGE`}
                    />
                    <button
                      onClick={() => setStakeAmount(formatBalance(sageBalance))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400 hover:underline"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Minimum stake: {MIN_STAKE_DISPLAY} SAGE
                  </p>
                </div>

                {/* Commission */}
                <div className="mb-6">
                  <label className="text-sm text-gray-400 mb-2 block">Commission Rate</label>
                  <select
                    value={commissionBps}
                    onChange={(e) => setCommissionBps(e.target.value)}
                    className="w-full p-3 bg-surface-elevated border border-surface-border rounded-xl
                             text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="100">1%</option>
                    <option value="300">3%</option>
                    <option value="500">5% (Recommended)</option>
                    <option value="1000">10%</option>
                    <option value="2000">20%</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Commission on delegated stake rewards
                  </p>
                </div>

                {/* Network Stats */}
                {networkStats && (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 bg-surface-elevated rounded-lg">
                      <p className="text-xs text-gray-500">Active Validators</p>
                      <p className="text-lg font-semibold text-white">
                        {networkStats.activeValidators}
                      </p>
                    </div>
                    <div className="p-3 bg-surface-elevated rounded-lg">
                      <p className="text-xs text-gray-500">Network Stake</p>
                      <p className="text-lg font-semibold text-white">
                        {formatBalance(networkStats.totalStake)} SAGE
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {registrationError && (
                  <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">{registrationError}</p>
                  </div>
                )}

                {/* Success Message */}
                {txHash && (
                  <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-emerald-300">Registration submitted!</p>
                      <p className="text-xs text-emerald-400/70 font-mono truncate">
                        {txHash}
                      </p>
                    </div>
                  </div>
                )}

                {/* Register Button */}
                <motion.button
                  onClick={handleRegister}
                  disabled={
                    isRegistering ||
                    !hasEnoughBalance ||
                    parseFloat(stakeAmount) < MIN_STAKE_DISPLAY ||
                    !!txHash
                  }
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all",
                    isRegistering || !hasEnoughBalance || !!txHash
                      ? "bg-surface-elevated text-gray-500 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  )}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Registering...
                    </>
                  ) : txHash ? (
                    <>
                      <Check className="w-5 h-5" />
                      Registered!
                    </>
                  ) : !hasEnoughBalance ? (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Insufficient Balance
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Register & Stake
                    </>
                  )}
                </motion.button>

                {/* Skip Option */}
                <button
                  onClick={handleSkipRegistration}
                  className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Skip for now (browse as user)
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Features */}
        <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-3 sm:gap-4">
          <div className="glass-card p-3 sm:p-4 text-center">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-accent-emerald mx-auto mb-1.5 sm:mb-2" />
            <p className="text-xs sm:text-sm text-gray-400">ZK Proof Verified</p>
          </div>
          <div className="glass-card p-3 sm:p-4 text-center">
            <LogoIcon className="text-accent-cyan mx-auto mb-1.5 sm:mb-2" size={20} />
            <p className="text-xs sm:text-sm text-gray-400">GPU Accelerated</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs sm:text-sm text-gray-500 mt-6 sm:mt-8 px-4">
          By connecting, you agree to our{" "}
          <a href="#" className="text-emerald-400 hover:underline">Terms of Service</a>
        </p>
      </motion.div>

      {/* Professional Signature Modal */}
      <AnimatePresence>
        {showSignatureModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => signatureStep === 'preview' && setShowSignatureModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-surface-border bg-surface-elevated/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <Fingerprint className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Verify Ownership</h3>
                      <p className="text-xs text-gray-500">Sign to authenticate</p>
                    </div>
                  </div>
                  {signatureStep === 'preview' && (
                    <button
                      onClick={() => setShowSignatureModal(false)}
                      className="p-2 hover:bg-surface-elevated rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {signatureStep === 'preview' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* What you're signing */}
                    <div className="p-4 bg-surface-elevated rounded-xl border border-surface-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-white">Signature Request</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Domain</span>
                          <span className="text-white font-mono">BitSage Network</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Action</span>
                          <span className="text-emerald-400">Validator Access</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Wallet</span>
                          <span className="text-white font-mono text-xs">
                            {address?.slice(0, 10)}...{address?.slice(-8)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Expires</span>
                          <span className="text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            1 hour
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Security Notice */}
                    <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-blue-300">
                        <p className="font-medium mb-1">This is a signature request, not a transaction</p>
                        <p className="text-blue-400/70">
                          No gas fees or blockchain transactions will occur. This only verifies you own this wallet.
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <motion.button
                      onClick={executeSignature}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500
                               text-white rounded-xl font-medium flex items-center justify-center gap-2
                               hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/25"
                    >
                      <Fingerprint className="w-5 h-5" />
                      Sign Message
                    </motion.button>
                  </motion.div>
                )}

                {signatureStep === 'signing' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-8"
                  >
                    <div className="relative mx-auto w-16 h-16 mb-4">
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                      <div className="relative w-full h-full bg-surface-elevated rounded-full flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                      </div>
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2">
                      Waiting for Signature
                    </h4>
                    <p className="text-sm text-gray-400">
                      Please confirm the signature request in your wallet
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      Check your wallet extension
                    </div>
                  </motion.div>
                )}

                {signatureStep === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-8"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.1 }}
                      className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
                    >
                      <Check className="w-8 h-8 text-emerald-400" />
                    </motion.div>
                    <h4 className="text-lg font-semibold text-white mb-2">
                      Verified Successfully
                    </h4>
                    <p className="text-sm text-gray-400">
                      Redirecting to dashboard...
                    </p>
                  </motion.div>
                )}

                {signatureStep === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="text-center py-4">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-white mb-2">
                        Signature Failed
                      </h4>
                      <p className="text-sm text-gray-400 mb-2">
                        {signatureError || "The signature request was rejected"}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowSignatureModal(false)}
                        className="flex-1 py-3 bg-surface-elevated text-gray-300 rounded-xl font-medium
                                 hover:bg-surface-border transition-colors"
                      >
                        Cancel
                      </button>
                      <motion.button
                        onClick={() => setSignatureStep('preview')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium
                                 hover:bg-emerald-500 transition-colors"
                      >
                        Try Again
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
