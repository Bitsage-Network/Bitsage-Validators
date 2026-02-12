"use client";

import { useState, useCallback, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Brain,
  Shield,
  Cpu,
  Database,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Validation constants
const VALIDATION = {
  MIN_PAYMENT: 0.01,
  MAX_PAYMENT: 10000,
  MIN_SLA_MINUTES: 5,
  MAX_SLA_MINUTES: 10080, // 7 days
  MIN_INPUT_LENGTH: 1,
  MAX_INPUT_LENGTH: 10000,
  MIN_PROOF_SIZE: 128,
  MAX_PROOF_SIZE: 1048576, // 1MB
};

interface ValidationError {
  field: string;
  message: string;
}
import {
  useBitSageTransaction,
  buildSubmitAIJobMulticall,
  buildSubmitProveJobMulticall,
  useSageBalance,
  JOB_TYPES,
  VERIFICATION_METHODS,
  type JobSpecInput,
  type ProveJobDataInput,
  type JobTypeKey,
  type VerificationMethodKey,
} from "@/lib/contracts";
import { SAGE_DECIMALS } from "@/lib/contracts/addresses";
import { hash } from "starknet";

// Job type configurations for UI
const JOB_TYPE_CONFIG: Record<JobTypeKey, {
  icon: typeof Brain;
  label: string;
  description: string;
  color: string;
  bg: string;
  defaultPayment: number;
}> = {
  AIInference: {
    icon: Brain,
    label: "AI Inference",
    description: "Run inference on AI/ML models",
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    defaultPayment: 1,
  },
  AITraining: {
    icon: Cpu,
    label: "AI Training",
    description: "Train or fine-tune AI models",
    color: "text-orange-400",
    bg: "bg-orange-500/20",
    defaultPayment: 10,
  },
  ProofGeneration: {
    icon: Shield,
    label: "ZK Proof Generation",
    description: "Generate zero-knowledge proofs",
    color: "text-brand-400",
    bg: "bg-brand-500/20",
    defaultPayment: 5,
  },
  ProofVerification: {
    icon: Shield,
    label: "Proof Verification",
    description: "Verify existing ZK proofs",
    color: "text-cyan-400",
    bg: "bg-cyan-500/20",
    defaultPayment: 0.5,
  },
  DataPipeline: {
    icon: Database,
    label: "Data Pipeline",
    description: "Execute data processing pipelines",
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    defaultPayment: 2,
  },
  ConfidentialVM: {
    icon: Zap,
    label: "Confidential VM",
    description: "Run confidential compute in TEE",
    color: "text-pink-400",
    bg: "bg-pink-500/20",
    defaultPayment: 3,
  },
};

const VERIFICATION_CONFIG: Record<VerificationMethodKey, {
  label: string;
  description: string;
}> = {
  None: {
    label: "None",
    description: "No verification required",
  },
  StatisticalSampling: {
    label: "Statistical Sampling",
    description: "Verify using random sampling",
  },
  ZeroKnowledgeProof: {
    label: "Zero-Knowledge Proof",
    description: "Full ZK proof verification",
  },
  ConsensusValidation: {
    label: "Consensus Validation",
    description: "Multi-validator consensus",
  },
};

interface JobSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (jobId: string, txHash: string) => void;
}

type SubmissionTab = "ai" | "proof";
type SubmissionStep = "form" | "review" | "submitting" | "success" | "error";

export function JobSubmissionModal({ isOpen, onClose, onSuccess }: JobSubmissionModalProps) {
  const { address, status: accountStatus } = useAccount();
  const { data: balanceData } = useSageBalance(address);
  const { sendTransactionAsync, isPending } = useBitSageTransaction();

  // Tab state
  const [activeTab, setActiveTab] = useState<SubmissionTab>("ai");
  const [step, setStep] = useState<SubmissionStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // AI Job form state
  const [aiJobType, setAiJobType] = useState<JobTypeKey>("AIInference");
  const [modelId, setModelId] = useState("1");
  const [inputData, setInputData] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("json");
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethodKey>("StatisticalSampling");
  const [payment, setPayment] = useState("1");
  const [slaMinutes, setSlaMinutes] = useState("30");

  // Proof Job form state
  const [circuitId, setCircuitId] = useState("fibonacci");
  const [publicInputs, setPublicInputs] = useState("");
  const [privateInputsHash, setPrivateInputsHash] = useState("");
  const [expectedProofSize, setExpectedProofSize] = useState("1024");
  const [proofPayment, setProofPayment] = useState("5");

  // Calculate balance
  const balance = balanceData ? BigInt(balanceData.toString()) : 0n;
  const balanceFormatted = (Number(balance) / 10 ** SAGE_DECIMALS).toFixed(2);

  // Parse payment amount to wei
  const paymentWei = BigInt(Math.floor(parseFloat(activeTab === "ai" ? payment : proofPayment) * 10 ** SAGE_DECIMALS));
  const hasInsufficientBalance = balance < paymentWei;

  // Comprehensive form validation
  const validationErrors = useMemo((): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (activeTab === "ai") {
      // Model ID validation
      const modelIdNum = parseInt(modelId);
      if (!modelId || isNaN(modelIdNum) || modelIdNum < 1) {
        errors.push({ field: "modelId", message: "Model ID must be a positive number" });
      }

      // Input data validation
      if (!inputData || inputData.trim().length < VALIDATION.MIN_INPUT_LENGTH) {
        errors.push({ field: "inputData", message: "Input data is required" });
      } else if (inputData.length > VALIDATION.MAX_INPUT_LENGTH) {
        errors.push({ field: "inputData", message: `Input data must be under ${VALIDATION.MAX_INPUT_LENGTH} characters` });
      }

      // Payment validation
      const paymentNum = parseFloat(payment);
      if (isNaN(paymentNum) || paymentNum < VALIDATION.MIN_PAYMENT) {
        errors.push({ field: "payment", message: `Minimum payment is ${VALIDATION.MIN_PAYMENT} SAGE` });
      } else if (paymentNum > VALIDATION.MAX_PAYMENT) {
        errors.push({ field: "payment", message: `Maximum payment is ${VALIDATION.MAX_PAYMENT} SAGE` });
      }

      // SLA validation
      const slaNum = parseInt(slaMinutes);
      if (isNaN(slaNum) || slaNum < VALIDATION.MIN_SLA_MINUTES) {
        errors.push({ field: "sla", message: `Minimum SLA is ${VALIDATION.MIN_SLA_MINUTES} minutes` });
      } else if (slaNum > VALIDATION.MAX_SLA_MINUTES) {
        errors.push({ field: "sla", message: `Maximum SLA is ${VALIDATION.MAX_SLA_MINUTES} minutes (7 days)` });
      }
    } else {
      // Proof job validation
      if (!circuitId) {
        errors.push({ field: "circuitId", message: "Circuit ID is required" });
      }

      // Proof size validation
      const proofSizeNum = parseInt(expectedProofSize);
      if (isNaN(proofSizeNum) || proofSizeNum < VALIDATION.MIN_PROOF_SIZE) {
        errors.push({ field: "proofSize", message: `Minimum proof size is ${VALIDATION.MIN_PROOF_SIZE} bytes` });
      } else if (proofSizeNum > VALIDATION.MAX_PROOF_SIZE) {
        errors.push({ field: "proofSize", message: `Maximum proof size is ${(VALIDATION.MAX_PROOF_SIZE / 1024 / 1024).toFixed(0)} MB` });
      }

      // Public inputs format validation
      if (publicInputs) {
        const inputs = publicInputs.split(",").map(s => s.trim());
        const invalidInputs = inputs.filter(input => {
          if (!input) return false;
          // Check if it's a valid hex string or number
          return !(/^0x[0-9a-fA-F]+$/.test(input) || /^\d+$/.test(input));
        });
        if (invalidInputs.length > 0) {
          errors.push({ field: "publicInputs", message: "Public inputs must be hex strings (0x...) or numbers" });
        }
      }

      // Payment validation
      const paymentNum = parseFloat(proofPayment);
      if (isNaN(paymentNum) || paymentNum < VALIDATION.MIN_PAYMENT) {
        errors.push({ field: "proofPayment", message: `Minimum payment is ${VALIDATION.MIN_PAYMENT} SAGE` });
      } else if (paymentNum > VALIDATION.MAX_PAYMENT) {
        errors.push({ field: "proofPayment", message: `Maximum payment is ${VALIDATION.MAX_PAYMENT} SAGE` });
      }
    }

    return errors;
  }, [activeTab, modelId, inputData, payment, slaMinutes, circuitId, publicInputs, expectedProofSize, proofPayment]);

  const hasValidationErrors = validationErrors.length > 0;
  const getFieldError = (field: string): string | undefined =>
    validationErrors.find(e => e.field === field)?.message;

  // Hash input data for on-chain storage
  const hashData = (data: string): string => {
    if (!data) return "0x0";
    try {
      // Use starknet's computePedersenHash for consistent hashing
      const dataAsHex = "0x" + Buffer.from(data.slice(0, 31)).toString("hex").padEnd(62, "0");
      return hash.computePedersenHash(dataAsHex, "0x0");
    } catch {
      return "0x" + Buffer.from(data.slice(0, 31)).toString("hex").padEnd(62, "0");
    }
  };

  // Submit AI Job
  const handleSubmitAIJob = useCallback(async () => {
    if (!address) return;

    setStep("submitting");
    setError(null);

    try {
      const spec: JobSpecInput = {
        jobType: aiJobType,
        modelId: BigInt(modelId || "1"),
        inputDataHash: hashData(inputData),
        expectedOutputFormat: "0x" + Buffer.from(expectedOutput.slice(0, 31)).toString("hex").padEnd(62, "0"),
        verificationMethod,
        maxReward: paymentWei,
        slaDeadline: Math.floor(Date.now() / 1000) + parseInt(slaMinutes) * 60,
        computeRequirements: [],
        metadata: [],
      };

      const calls = buildSubmitAIJobMulticall(spec, paymentWei, address);
      const result = await sendTransactionAsync(calls);

      if (result?.transaction_hash) {
        setTxHash(result.transaction_hash);
        setJobId(`job-${Date.now()}`);
        setStep("success");
        onSuccess?.(jobId || "", result.transaction_hash);
      }
    } catch (err: unknown) {
      console.error("Job submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit job");
      setStep("error");
    }
  }, [address, aiJobType, modelId, inputData, expectedOutput, verificationMethod, paymentWei, slaMinutes, sendTransactionAsync, onSuccess, jobId]);

  // Submit Proof Job
  const handleSubmitProofJob = useCallback(async () => {
    if (!address) return;

    setStep("submitting");
    setError(null);

    try {
      const data: ProveJobDataInput = {
        circuitId: "0x" + Buffer.from(circuitId.slice(0, 31)).toString("hex").padEnd(62, "0"),
        publicInputs: publicInputs ? publicInputs.split(",").map(s => s.trim()) : [],
        privateInputsHash: privateInputsHash || hashData("private-" + Date.now()),
        expectedProofSize: parseInt(expectedProofSize),
      };

      const proofPaymentWei = BigInt(Math.floor(parseFloat(proofPayment) * 10 ** SAGE_DECIMALS));
      const calls = buildSubmitProveJobMulticall(data, proofPaymentWei, address);
      const result = await sendTransactionAsync(calls);

      if (result?.transaction_hash) {
        setTxHash(result.transaction_hash);
        setJobId(`proof-${Date.now()}`);
        setStep("success");
        onSuccess?.(jobId || "", result.transaction_hash);
      }
    } catch (err: unknown) {
      console.error("Proof job submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit proof job");
      setStep("error");
    }
  }, [address, circuitId, publicInputs, privateInputsHash, expectedProofSize, proofPayment, sendTransactionAsync, onSuccess, jobId]);

  const handleSubmit = () => {
    if (activeTab === "ai") {
      handleSubmitAIJob();
    } else {
      handleSubmitProofJob();
    }
  };

  const resetForm = () => {
    setStep("form");
    setError(null);
    setTxHash(null);
    setJobId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass-card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border">
            <h2 className="text-lg font-semibold text-white">Submit New Job</h2>
            <button onClick={handleClose} className="p-1 rounded-lg hover:bg-surface-elevated">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Wallet Status */}
            {accountStatus !== "connected" && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                <AlertCircle className="w-5 h-5 text-orange-400" />
                <span className="text-sm text-orange-300">Please connect your wallet to submit jobs</span>
              </div>
            )}

            {/* Balance Display */}
            {accountStatus === "connected" && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated">
                <span className="text-sm text-gray-400">Available Balance</span>
                <span className="text-white font-medium">{balanceFormatted} SAGE</span>
              </div>
            )}

            {/* Form Steps */}
            {step === "form" && (
              <>
                {/* Tab Selector */}
                <div className="flex gap-2 p-1 bg-surface-elevated rounded-lg">
                  <button
                    onClick={() => setActiveTab("ai")}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                      activeTab === "ai"
                        ? "bg-brand-600 text-white"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Brain className="w-4 h-4" />
                    AI Job
                  </button>
                  <button
                    onClick={() => setActiveTab("proof")}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                      activeTab === "proof"
                        ? "bg-brand-600 text-white"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <Shield className="w-4 h-4" />
                    Proof Generation
                  </button>
                </div>

                {/* AI Job Form */}
                {activeTab === "ai" && (
                  <div className="space-y-4">
                    {/* Job Type */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Job Type</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(Object.keys(JOB_TYPE_CONFIG) as JobTypeKey[]).map((type) => {
                          const config = JOB_TYPE_CONFIG[type];
                          const Icon = config.icon;
                          return (
                            <button
                              key={type}
                              onClick={() => {
                                setAiJobType(type);
                                setPayment(config.defaultPayment.toString());
                              }}
                              className={cn(
                                "p-3 rounded-lg border transition-all text-left",
                                aiJobType === type
                                  ? "border-brand-500 bg-brand-500/10"
                                  : "border-surface-border hover:border-gray-600"
                              )}
                            >
                              <Icon className={cn("w-5 h-5 mb-1", config.color)} />
                              <p className="text-sm font-medium text-white">{config.label}</p>
                              <p className="text-xs text-gray-500">{config.defaultPayment} SAGE</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Model ID */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Model ID</label>
                      <input
                        type="text"
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        placeholder="e.g., 1 (GPT-4), 2 (Llama), 3 (Stable Diffusion)"
                        className={cn(
                          "input-field w-full",
                          getFieldError("modelId") && "border-red-500 focus:border-red-500"
                        )}
                      />
                      {getFieldError("modelId") && (
                        <p className="text-xs text-red-400 mt-1">{getFieldError("modelId")}</p>
                      )}
                    </div>

                    {/* Input Data */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Input Data
                        <span className="text-gray-600 ml-2">({inputData.length}/{VALIDATION.MAX_INPUT_LENGTH})</span>
                      </label>
                      <textarea
                        value={inputData}
                        onChange={(e) => setInputData(e.target.value)}
                        placeholder="Enter your input prompt or data..."
                        rows={3}
                        className={cn(
                          "input-field w-full resize-none",
                          getFieldError("inputData") && "border-red-500 focus:border-red-500"
                        )}
                      />
                      {getFieldError("inputData") ? (
                        <p className="text-xs text-red-400 mt-1">{getFieldError("inputData")}</p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          Input will be hashed on-chain. Store full data off-chain.
                        </p>
                      )}
                    </div>

                    {/* Verification Method */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Verification Method</label>
                      <select
                        value={verificationMethod}
                        onChange={(e) => setVerificationMethod(e.target.value as VerificationMethodKey)}
                        className="input-field w-full"
                      >
                        {(Object.keys(VERIFICATION_CONFIG) as VerificationMethodKey[]).map((method) => (
                          <option key={method} value={method}>
                            {VERIFICATION_CONFIG[method].label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Payment & SLA */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Payment (SAGE)</label>
                        <input
                          type="number"
                          value={payment}
                          onChange={(e) => setPayment(e.target.value)}
                          min={VALIDATION.MIN_PAYMENT}
                          max={VALIDATION.MAX_PAYMENT}
                          step="0.1"
                          className={cn(
                            "input-field w-full",
                            getFieldError("payment") && "border-red-500 focus:border-red-500"
                          )}
                        />
                        {getFieldError("payment") && (
                          <p className="text-xs text-red-400 mt-1">{getFieldError("payment")}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">SLA Deadline (minutes)</label>
                        <input
                          type="number"
                          value={slaMinutes}
                          onChange={(e) => setSlaMinutes(e.target.value)}
                          min={VALIDATION.MIN_SLA_MINUTES}
                          max={VALIDATION.MAX_SLA_MINUTES}
                          step="5"
                          className={cn(
                            "input-field w-full",
                            getFieldError("sla") && "border-red-500 focus:border-red-500"
                          )}
                        />
                        {getFieldError("sla") && (
                          <p className="text-xs text-red-400 mt-1">{getFieldError("sla")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Proof Job Form */}
                {activeTab === "proof" && (
                  <div className="space-y-4">
                    {/* Circuit ID */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Circuit ID</label>
                      <select
                        value={circuitId}
                        onChange={(e) => setCircuitId(e.target.value)}
                        className={cn(
                          "input-field w-full",
                          getFieldError("circuitId") && "border-red-500 focus:border-red-500"
                        )}
                      >
                        <option value="fibonacci">Fibonacci</option>
                        <option value="poseidon">Poseidon Hash</option>
                        <option value="ecdsa">ECDSA Signature</option>
                        <option value="merkle">Merkle Proof</option>
                        <option value="range">Range Proof</option>
                        <option value="custom">Custom Circuit</option>
                      </select>
                      {getFieldError("circuitId") && (
                        <p className="text-xs text-red-400 mt-1">{getFieldError("circuitId")}</p>
                      )}
                    </div>

                    {/* Public Inputs */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Public Inputs (comma-separated)</label>
                      <textarea
                        value={publicInputs}
                        onChange={(e) => setPublicInputs(e.target.value)}
                        placeholder="0x123, 0x456, 0x789"
                        rows={2}
                        className={cn(
                          "input-field w-full resize-none",
                          getFieldError("publicInputs") && "border-red-500 focus:border-red-500"
                        )}
                      />
                      {getFieldError("publicInputs") && (
                        <p className="text-xs text-red-400 mt-1">{getFieldError("publicInputs")}</p>
                      )}
                    </div>

                    {/* Private Inputs Hash */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Private Inputs Hash (optional)</label>
                      <input
                        type="text"
                        value={privateInputsHash}
                        onChange={(e) => setPrivateInputsHash(e.target.value)}
                        placeholder="0x... (auto-generated if empty)"
                        className="input-field w-full"
                      />
                    </div>

                    {/* Proof Size & Payment */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Expected Proof Size (bytes)</label>
                        <input
                          type="number"
                          value={expectedProofSize}
                          onChange={(e) => setExpectedProofSize(e.target.value)}
                          min={VALIDATION.MIN_PROOF_SIZE}
                          max={VALIDATION.MAX_PROOF_SIZE}
                          step="128"
                          className={cn(
                            "input-field w-full",
                            getFieldError("proofSize") && "border-red-500 focus:border-red-500"
                          )}
                        />
                        {getFieldError("proofSize") && (
                          <p className="text-xs text-red-400 mt-1">{getFieldError("proofSize")}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Payment (SAGE)</label>
                        <input
                          type="number"
                          value={proofPayment}
                          onChange={(e) => setProofPayment(e.target.value)}
                          min={VALIDATION.MIN_PAYMENT}
                          max={VALIDATION.MAX_PAYMENT}
                          step="0.5"
                          className={cn(
                            "input-field w-full",
                            getFieldError("proofPayment") && "border-red-500 focus:border-red-500"
                          )}
                        />
                        {getFieldError("proofPayment") && (
                          <p className="text-xs text-red-400 mt-1">{getFieldError("proofPayment")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Errors Summary */}
                {hasValidationErrors && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-orange-300 font-medium">Please fix the following errors:</p>
                      <ul className="text-xs text-orange-200/80 mt-1 list-disc list-inside">
                        {validationErrors.slice(0, 3).map((err, i) => (
                          <li key={i}>{err.message}</li>
                        ))}
                        {validationErrors.length > 3 && (
                          <li>...and {validationErrors.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Insufficient Balance Warning */}
                {hasInsufficientBalance && accountStatus === "connected" && !hasValidationErrors && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-red-300">Insufficient SAGE balance</span>
                  </div>
                )}
              </>
            )}

            {/* Submitting State */}
            {step === "submitting" && (
              <div className="py-12 text-center">
                <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-medium mb-2">Submitting Job</p>
                <p className="text-sm text-gray-400">
                  Please confirm the transaction in your wallet...
                </p>
              </div>
            )}

            {/* Success State */}
            {step === "success" && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-white font-medium mb-2">Job Submitted Successfully!</p>
                <p className="text-sm text-gray-400 mb-4">
                  Your job has been submitted to the network.
                </p>
                {txHash && (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 hover:text-brand-300 text-sm underline"
                  >
                    View on Starkscan
                  </a>
                )}
              </div>
            )}

            {/* Error State */}
            {step === "error" && (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                </div>
                <p className="text-white font-medium mb-2">Submission Failed</p>
                <p className="text-sm text-red-400 mb-4">{error}</p>
                <button onClick={resetForm} className="btn-secondary text-sm">
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {step === "form" && (
            <div className="p-4 border-t border-surface-border flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Total: <span className="text-white font-medium">
                  {activeTab === "ai" ? payment : proofPayment} SAGE
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={handleClose} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    accountStatus !== "connected" ||
                    hasInsufficientBalance ||
                    hasValidationErrors ||
                    isPending
                  }
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Submit Job
                </button>
              </div>
            </div>
          )}

          {/* Close button for success/error states */}
          {(step === "success" || step === "error") && (
            <div className="p-4 border-t border-surface-border flex justify-center">
              <button onClick={handleClose} className="btn-primary text-sm">
                Close
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
