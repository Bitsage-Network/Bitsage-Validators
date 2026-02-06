"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  Shield,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Download,
  Copy,
  Check,
  Cpu,
  Activity,
  Zap,
  Hash,
  Layers,
  Timer,
  Server,
  FileJson,
  Code,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Link as LinkIcon,
  Box,
  Binary,
  Fingerprint,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { PrivacyModeToggle } from "@/components/privacy/PrivacyToggle";
import { useProofDetail } from "@/lib/hooks/useApiData";
import type { ProofDetail, ProofExecutionPhase } from "@/lib/api/client";
import {
  CIRCUIT_REGISTRY,
  getCircuitColor,
  formatFriParams,
  type CircuitId,
} from "@/lib/proofs/circuitRegistry";

// Transform API response to component format (snake_case -> camelCase)
function transformProofDetail(data: ProofDetail) {
  return {
    id: data.id,
    jobId: data.job_id,
    circuitType: data.circuit_type,
    circuitLabel: data.circuit_label,
    status: data.status,
    gpu: data.gpu,
    generatedAt: data.generated_at,
    verifiedAt: data.verified_at,
    duration: data.duration,
    durationMs: data.duration_ms,
    verifiedOnChain: data.verified_on_chain,
    txHash: data.tx_hash,
    blockNumber: data.block_number,
    proofSize: data.proof_size,
    proofSizeBytes: data.proof_size_bytes,
    client: data.client,
    reward: data.reward,
    isPrivate: data.is_private,
    progress: data.progress,
    currentPhase: data.current_phase,
    input: {
      hash: data.input.hash,
      encryptedHash: data.input.encrypted_hash,
      dataType: data.input.data_type,
      shape: data.input.shape,
      description: data.input.description,
      preview: data.input.preview ? {
        topPredictions: data.input.preview.top_predictions,
        metrics: data.input.preview.metrics,
      } : undefined,
    },
    output: {
      hash: data.output.hash,
      encryptedHash: data.output.encrypted_hash,
      dataType: data.output.data_type,
      shape: data.output.shape,
      description: data.output.description,
      preview: data.output.preview ? {
        topPredictions: data.output.preview.top_predictions,
        metrics: data.output.preview.metrics,
      } : undefined,
    },
    circuit: {
      constraintCount: data.circuit.constraint_count,
      traceLength: data.circuit.trace_length,
      traceRows: data.circuit.trace_rows,
      fieldSize: data.circuit.field_size,
      blowupFactor: data.circuit.blowup_factor,
      numQueries: data.circuit.num_queries,
      friLayers: data.circuit.fri_layers,
      securityBits: data.circuit.security_bits,
    },
    proofComponents: {
      firstLayerCommitment: data.proof_components.first_layer_commitment,
      friCommitments: data.proof_components.fri_commitments,
      traceCommitments: data.proof_components.trace_commitments,
      lastLayerDegree: data.proof_components.last_layer_degree,
      queryResponses: data.proof_components.query_responses,
    },
    verification: {
      verifierContract: data.verification.verifier_contract,
      verificationGas: data.verification.verification_gas,
      verificationTime: data.verification.verification_time,
      channelState: data.verification.channel_state,
    },
    teeAttestation: data.tee_attestation ? {
      enclaveId: data.tee_attestation.enclave_id,
      mrEnclave: data.tee_attestation.mr_enclave,
      mrSigner: data.tee_attestation.mr_signer,
      reportData: data.tee_attestation.report_data,
      timestamp: data.tee_attestation.timestamp,
    } : null,
    executionPhases: data.execution_phases,
  };
}

// Status configuration
const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  verified: { label: "Verified", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: CheckCircle2 },
  generating: { label: "Generating", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: Activity },
  pending: { label: "Pending", color: "text-orange-400", bg: "bg-orange-500/20", icon: Clock },
  failed: { label: "Failed", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle },
};

export default function ProofDetailPage() {
  const params = useParams();
  const router = useRouter();
  const proofId = params.id as string;

  // Fetch proof data from API
  const { data: proofData, isLoading: loading, error, refetch } = useProofDetail(proofId);

  // Transform API response to component format
  const proof = useMemo(() => {
    if (!proofData) return null;
    return transformProofDetail(proofData);
  }, [proofData]);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["overview", "io", "circuit", "verification"])
  );
  const [privacyMode, setPrivacyMode] = useState(true); // Default to showing encrypted view for private proofs
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  const toggleReveal = (field: string) => {
    setRevealedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const downloadProof = () => {
    if (!proof) return;
    const proofData = {
      proof_id: proof.id,
      job_id: proof.jobId,
      circuit_type: proof.circuitType,
      status: proof.status,
      generated_at: new Date(proof.generatedAt).toISOString(),
      verified_at: proof.verifiedAt ? new Date(proof.verifiedAt).toISOString() : null,
      tx_hash: proof.txHash,
      input_hash: proof.input.hash,
      output_hash: proof.output.hash,
      // STWO proof components
      commitments: {
        first_layer: proof.proofComponents.firstLayerCommitment,
        trace: proof.proofComponents.traceCommitments,
        fri_layers: proof.proofComponents.friCommitments,
      },
      fri_config: {
        last_layer_degree: proof.proofComponents.lastLayerDegree,
        query_count: proof.proofComponents.queryResponses,
      },
      circuit_stats: proof.circuit,
      verification: proof.verification,
    };
    const blob = new Blob([JSON.stringify(proofData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${proof.id}.json`;
    a.click();
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Activity className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading proof details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load Proof</h2>
        <p className="text-gray-400 mb-4">Unable to fetch proof details. Please try again.</p>
        <div className="flex gap-3">
          <button onClick={() => refetch()} className="btn-primary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link href="/proofs" className="btn-secondary">
            Back to Proofs
          </Link>
        </div>
      </div>
    );
  }

  if (!proof) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Proof Not Found</h2>
        <p className="text-gray-400 mb-4">The proof "{proofId}" could not be found.</p>
        <Link href="/proofs" className="btn-primary">
          Back to Proofs
        </Link>
      </div>
    );
  }

  const status = statusConfig[proof.status];
  const StatusIcon = status?.icon || Clock;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg bg-surface-elevated hover:bg-surface-border transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white font-mono">{proof.id}</h1>
              <span className={cn("badge flex items-center gap-1", status?.bg, status?.color)}>
                <StatusIcon className="w-3 h-3" />
                {status?.label}
              </span>
              {proof.verifiedOnChain && (
                <span className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  On-chain Verified
                </span>
              )}
              {proof.isPrivate && (
                <span className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  Private Job
                </span>
              )}
            </div>
            <p className="text-gray-400 mt-1">
              {proof.circuitLabel} • Generated {formatTimeAgo(proof.generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadProof} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download
          </button>
          {proof.txHash && (
            <a
              href={`https://sepolia.starkscan.co/tx/${proof.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View on Starkscan
            </a>
          )}
        </div>
      </div>

      {/* Live Progress Bar (for generating proofs) */}
      {proof.status === "generating" && proof.progress !== undefined && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-sm text-white font-medium">Proof Generation in Progress</span>
            </div>
            <span className="text-2xl font-bold text-emerald-400">{proof.progress}%</span>
          </div>
          <div className="h-3 bg-surface-elevated rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${proof.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Current Phase: <span className="text-white">{proof.currentPhase}</span>
          </p>
        </motion.div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">Duration</p>
          <p className="text-lg font-semibold text-white">{proof.duration}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">Proof Size</p>
          <p className="text-lg font-semibold text-white">{proof.proofSize}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">Constraints</p>
          <p className="text-lg font-semibold text-white">{proof.circuit.constraintCount.toLocaleString()}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">Security</p>
          <p className="text-lg font-semibold text-white">{proof.circuit.securityBits} bits</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4">
          <p className="text-xs text-gray-500 mb-1">Reward</p>
          {proof.isPrivate && privacyMode ? (
            <p className="text-lg font-semibold text-emerald-400 font-mono tracking-wider">+•••••</p>
          ) : (
            <p className="text-lg font-semibold text-emerald-400">+{proof.reward} SAGE</p>
          )}
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Input/Output Section */}
          <CollapsibleSection
            title="Input / Output"
            icon={<Box className="w-5 h-5" />}
            isExpanded={expandedSections.has("io")}
            onToggle={() => toggleSection("io")}
            badge={proof.isPrivate && privacyMode ? (
              <span className="badge bg-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1">
                <Lock className="w-3 h-3" /> Encrypted
              </span>
            ) : undefined}
          >
            {/* Privacy Toggle for this proof */}
            {proof.isPrivate && (
              <div className="mb-4">
                <PrivacyModeToggle
                  enabled={privacyMode}
                  onToggle={setPrivacyMode}
                />
                {privacyMode && (
                  <p className="text-xs text-emerald-400/70 mt-2 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    This job used privacy mode. Input/output data is ElGamal encrypted on-chain.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Input */}
              <div className={cn(
                "p-4 rounded-xl border transition-all",
                proof.isPrivate && privacyMode 
                  ? "bg-gradient-to-br from-emerald-600/10 to-accent-purple/10 border-emerald-500/30"
                  : "bg-surface-elevated/50 border-surface-border"
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      proof.isPrivate && privacyMode ? "bg-emerald-500/20" : "bg-cyan-500/20"
                    )}>
                      {proof.isPrivate && privacyMode ? (
                        <Lock className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Binary className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                    <span className="font-medium text-white">Input</span>
                    {proof.isPrivate && privacyMode && (
                      <span className="text-xs text-emerald-400">(encrypted)</span>
                    )}
                  </div>
                  {proof.isPrivate && privacyMode && (
                    <button
                      onClick={() => toggleReveal("input")}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      {revealedFields.has("input") ? (
                        <><EyeOff className="w-3 h-3" /> Hide</>
                      ) : (
                        <><Eye className="w-3 h-3" /> Reveal</>
                      )}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      {proof.isPrivate && privacyMode ? "Ciphertext" : "Hash"}
                    </p>
                    {proof.isPrivate && privacyMode && !revealedFields.has("input") ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">L:</span>
                          <code className="text-xs text-emerald-400 font-mono tracking-wider">
                            •••••••••••••••••••••
                          </code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">R:</span>
                          <code className="text-xs text-emerald-400 font-mono tracking-wider">
                            •••••••••••••••••••••
                          </code>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-gray-300 font-mono truncate flex-1">
                          {proof.input.hash.slice(0, 24)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(proof.input.hash, "input-hash")}
                          className="text-gray-500 hover:text-white flex-shrink-0"
                        >
                          {copiedField === "input-hash" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Type</p>
                    <p className="text-sm text-white">{proof.input.dataType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Shape</p>
                    {proof.isPrivate && privacyMode && !revealedFields.has("input") ? (
                      <code className="text-sm text-emerald-400 font-mono tracking-wider">•••••••</code>
                    ) : (
                      <code className="text-sm text-emerald-400 font-mono">{proof.input.shape}</code>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    {proof.isPrivate && privacyMode && !revealedFields.has("input") ? (
                      <p className="text-sm text-emerald-400/70 italic">[ description encrypted ]</p>
                    ) : (
                      <p className="text-sm text-gray-300">{proof.input.description}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Output */}
              <div className={cn(
                "p-4 rounded-xl border transition-all",
                proof.isPrivate && privacyMode 
                  ? "bg-gradient-to-br from-emerald-600/10 to-accent-purple/10 border-emerald-500/30"
                  : "bg-surface-elevated/50 border-surface-border"
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      proof.isPrivate && privacyMode ? "bg-emerald-500/20" : "bg-emerald-500/20"
                    )}>
                      {proof.isPrivate && privacyMode ? (
                        <Lock className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Binary className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <span className="font-medium text-white">Output</span>
                    {proof.isPrivate && privacyMode && (
                      <span className="text-xs text-emerald-400">(encrypted)</span>
                    )}
                  </div>
                  {proof.isPrivate && privacyMode && proof.output.hash && proof.output.hash !== "—" && (
                    <button
                      onClick={() => toggleReveal("output")}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      {revealedFields.has("output") ? (
                        <><EyeOff className="w-3 h-3" /> Hide</>
                      ) : (
                        <><Eye className="w-3 h-3" /> Reveal</>
                      )}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      {proof.isPrivate && privacyMode ? "Ciphertext" : "Hash"}
                    </p>
                    {proof.output.hash && proof.output.hash !== "—" ? (
                      proof.isPrivate && privacyMode && !revealedFields.has("output") ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">L:</span>
                            <code className="text-xs text-emerald-400 font-mono tracking-wider">
                              •••••••••••••••••••••
                            </code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">R:</span>
                            <code className="text-xs text-emerald-400 font-mono tracking-wider">
                              •••••••••••••••••••••
                            </code>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-gray-300 font-mono truncate flex-1">
                            {proof.output.hash.slice(0, 24)}...
                          </code>
                          <button
                            onClick={() => copyToClipboard(proof.output.hash, "output-hash")}
                            className="text-gray-500 hover:text-white flex-shrink-0"
                          >
                            {copiedField === "output-hash" ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-gray-500">Pending...</span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Type</p>
                    <p className="text-sm text-white">{proof.output.dataType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Shape</p>
                    {proof.isPrivate && privacyMode && !revealedFields.has("output") ? (
                      <code className="text-sm text-emerald-400 font-mono tracking-wider">•••••••</code>
                    ) : (
                      <code className="text-sm text-emerald-400 font-mono">{proof.output.shape}</code>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    {proof.isPrivate && privacyMode && !revealedFields.has("output") ? (
                      <p className="text-sm text-emerald-400/70 italic">[ description encrypted ]</p>
                    ) : (
                      <p className="text-sm text-gray-300">{proof.output.description}</p>
                    )}
                  </div>
                </div>

                {/* Output Preview - Only show if NOT in privacy mode or revealed */}
                {proof.output.preview && (!proof.isPrivate || !privacyMode || revealedFields.has("output")) && (
                  <div className="mt-4 pt-4 border-t border-surface-border/50">
                    <p className="text-xs text-gray-500 mb-2">Preview</p>
                    {proof.output.preview.topPredictions && (
                      <div className="space-y-2">
                        {proof.output.preview.topPredictions.map((pred: { class: string; confidence: number }, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">{pred.class}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${pred.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-12 text-right">
                                {(pred.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {proof.output.preview.metrics && (
                      <div className="space-y-2">
                        {Object.entries(proof.output.preview.metrics).map(([key, value]: [string, any]) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-gray-400">{key}</span>
                            <span className="text-sm text-white font-mono">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Encrypted Preview Placeholder */}
                {proof.output.preview && proof.isPrivate && privacyMode && !revealedFields.has("output") && (
                  <div className="mt-4 pt-4 border-t border-emerald-500/20">
                    <p className="text-xs text-gray-500 mb-2">Preview</p>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-emerald-400 font-mono">•••••••••</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-emerald-500/20 rounded-full" />
                            <span className="text-xs text-emerald-400/50 w-12 text-right">
                              ••.•%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-emerald-400/50 mt-3 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Click "Reveal" to decrypt (requires signature)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Circuit Details */}
          <CollapsibleSection
            title="Circuit Details"
            icon={<Layers className="w-5 h-5" />}
            isExpanded={expandedSections.has("circuit")}
            onToggle={() => toggleSection("circuit")}
            badge={(() => {
              const circuitDef = CIRCUIT_REGISTRY[proof.circuitType as CircuitId];
              if (!circuitDef) return undefined;
              const colors = getCircuitColor(proof.circuitType as CircuitId);
              return (
                <span className={cn("badge text-xs flex items-center gap-1", colors.bg, colors.text)}>
                  {circuitDef.recommendedMode === 'gpu_worker' ? 'GPU' :
                   circuitDef.recommendedMode === 'tee_assisted' ? 'TEE' : 'WASM'}
                </span>
              );
            })()}
          >
            {/* Circuit info from registry */}
            {CIRCUIT_REGISTRY[proof.circuitType as CircuitId] && (
              <div className="mb-4 p-3 rounded-lg bg-surface-elevated/50 border border-surface-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className={cn(
                      "font-medium",
                      getCircuitColor(proof.circuitType as CircuitId).text
                    )}>
                      {CIRCUIT_REGISTRY[proof.circuitType as CircuitId].name}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      {CIRCUIT_REGISTRY[proof.circuitType as CircuitId].description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Proof Mode</p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      CIRCUIT_REGISTRY[proof.circuitType as CircuitId].recommendedMode === 'gpu_worker' && "bg-purple-500/20 text-purple-400",
                      CIRCUIT_REGISTRY[proof.circuitType as CircuitId].recommendedMode === 'tee_assisted' && "bg-emerald-500/20 text-emerald-400",
                      CIRCUIT_REGISTRY[proof.circuitType as CircuitId].recommendedMode === 'client_wasm' && "bg-cyan-500/20 text-cyan-400"
                    )}>
                      {CIRCUIT_REGISTRY[proof.circuitType as CircuitId].recommendedMode === 'gpu_worker' ? 'GPU Worker' :
                       CIRCUIT_REGISTRY[proof.circuitType as CircuitId].recommendedMode === 'tee_assisted' ? 'TEE Assisted' : 'Client WASM'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-surface-border/50 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500">Est. Time</p>
                    <p className="text-white font-mono">{(CIRCUIT_REGISTRY[proof.circuitType as CircuitId].estimatedTimeMs / 1000).toFixed(1)}s</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Proof Size</p>
                    <p className="text-white font-mono">{(CIRCUIT_REGISTRY[proof.circuitType as CircuitId].proofSizeBytes / 1024).toFixed(1)} KB</p>
                  </div>
                  <div>
                    <p className="text-gray-500">FRI Params</p>
                    <p className="text-emerald-400 font-mono">{formatFriParams(CIRCUIT_REGISTRY[proof.circuitType as CircuitId].friParams)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatItem label="Constraint Count" value={proof.circuit.constraintCount.toLocaleString()} />
              <StatItem label="Trace Length" value={proof.circuit.traceLength} />
              <StatItem label="Trace Rows" value={proof.circuit.traceRows.toLocaleString()} />
              <StatItem label="Field" value={proof.circuit.fieldSize} highlight />
              <StatItem label="Blowup Factor" value={`${proof.circuit.blowupFactor}x`} />
              <StatItem label="FRI Queries" value={proof.circuit.numQueries.toString()} />
              <StatItem label="FRI Layers" value={proof.circuit.friLayers.toString()} />
              <StatItem label="Security Bits" value={`${proof.circuit.securityBits} bits`} highlight />
            </div>
          </CollapsibleSection>

          {/* Proof Components */}
          <CollapsibleSection
            title="Proof Components"
            icon={<Fingerprint className="w-5 h-5" />}
            isExpanded={expandedSections.has("components")}
            onToggle={() => toggleSection("components")}
            badge={proof.isPrivate ? (
              <span className="badge bg-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1">
                <Eye className="w-3 h-3" /> Public (ZK)
              </span>
            ) : undefined}
          >
            {proof.isPrivate && (
              <div className="mb-4 p-3 rounded-lg bg-surface-elevated/50 border border-surface-border">
                <p className="text-xs text-gray-400 flex items-start gap-2">
                  <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong className="text-emerald-400">Zero-Knowledge:</strong> These cryptographic commitments 
                    are designed to be public. They prove the computation is valid without revealing 
                    any information about the actual input/output values.
                  </span>
                </p>
              </div>
            )}
            <div className="space-y-4">
              {/* First Layer Commitment (first_layer.commitment in FriProof) */}
              <HashField
                label="First Layer Commitment"
                value={proof.proofComponents.firstLayerCommitment || ""}
                onCopy={() => copyToClipboard(proof.proofComponents.firstLayerCommitment || "", "commitment")}
                copied={copiedField === "commitment"}
              />
              
              {/* FRI Inner Layer Commitments */}
              <div>
                <p className="text-xs text-gray-500 mb-2">FRI Layer Commitments ({proof.proofComponents.friCommitments.length})</p>
                <div className="space-y-2">
                  {proof.proofComponents.friCommitments.map((commit: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated/50">
                      <span className="text-xs text-gray-500 w-8">L{i + 1}</span>
                      <code className="text-xs text-gray-300 font-mono truncate flex-1">
                        {commit.slice(0, 32)}...
                      </code>
                      <button
                        onClick={() => copyToClipboard(commit, `fri-${i}`)}
                        className="text-gray-500 hover:text-white"
                      >
                        {copiedField === `fri-${i}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Trace Commitments (Merkle roots for trace polynomials) */}
              {proof.proofComponents.traceCommitments && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Trace Commitments ({proof.proofComponents.traceCommitments.length})</p>
                  <div className="space-y-2">
                    {proof.proofComponents.traceCommitments.map((commit: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated/50">
                        <span className="text-xs text-gray-500 w-8">T{i}</span>
                        <code className="text-xs text-gray-300 font-mono truncate flex-1">
                          {commit.slice(0, 32)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(commit, `trace-${i}`)}
                          className="text-gray-500 hover:text-white"
                        >
                          {copiedField === `trace-${i}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Additional STWO-specific fields */}
              <div className="grid grid-cols-2 gap-3">
                <StatItem label="Last Layer Degree" value={proof.proofComponents.lastLayerDegree?.toString() || "—"} />
                <StatItem label="Query Count" value={proof.proofComponents.queryResponses.toString()} />
              </div>
              
              {/* Security Nonce - internal STWO grinding result (not user-facing) */}
              {/* Removed: This is an internal prover detail, not meaningful to display */}
            </div>
          </CollapsibleSection>

          {/* Verification Details */}
          <CollapsibleSection
            title="Verification"
            icon={<CheckCircle2 className="w-5 h-5" />}
            isExpanded={expandedSections.has("verification")}
            onToggle={() => toggleSection("verification")}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatItem 
                  label="Verification Gas" 
                  value={proof.verification.verificationGas ? `${proof.verification.verificationGas.toLocaleString()} (sponsored)` : "—"} 
                />
                <StatItem label="Verification Time" value={proof.verification.verificationTime || "—"} />
                <StatItem label="Block Number" value={proof.blockNumber ? `#${proof.blockNumber.toLocaleString()}` : "—"} />
              </div>
              <HashField
                label="Verifier Contract"
                value={proof.verification.verifierContract}
                onCopy={() => copyToClipboard(proof.verification.verifierContract, "verifier")}
                copied={copiedField === "verifier"}
                link={`https://sepolia.starkscan.co/contract/${proof.verification.verifierContract}`}
              />
              {/* Fiat-Shamir: challenges derived from channel state, not explicit seed */}
              <div className="p-3 rounded-lg bg-surface-elevated/50">
                <p className="text-xs text-gray-500 mb-1">Challenge Generation</p>
                <p className="text-sm text-white">{proof.verification.channelState || "Fiat-Shamir (Blake2s)"}</p>
                <p className="text-xs text-gray-500 mt-1">Challenges derived from Merkle channel state</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* TEE Attestation (if available) */}
          {proof.teeAttestation && (
            <CollapsibleSection
              title="TEE Attestation"
              icon={<Shield className="w-5 h-5" />}
              isExpanded={expandedSections.has("tee")}
              onToggle={() => toggleSection("tee")}
            >
              <div className="space-y-4">
                <HashField
                  label="Enclave ID"
                  value={proof.teeAttestation.enclaveId}
                  onCopy={() => copyToClipboard(proof.teeAttestation!.enclaveId, "enclave")}
                  copied={copiedField === "enclave"}
                />
                <HashField
                  label="MR Enclave"
                  value={proof.teeAttestation.mrEnclave}
                  onCopy={() => copyToClipboard(proof.teeAttestation!.mrEnclave, "mrenclave")}
                  copied={copiedField === "mrenclave"}
                />
                <HashField
                  label="MR Signer"
                  value={proof.teeAttestation.mrSigner}
                  onCopy={() => copyToClipboard(proof.teeAttestation!.mrSigner, "mrsigner")}
                  copied={copiedField === "mrsigner"}
                />
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-4">
          {/* Job Info */}
          <div className={cn(
            "glass-card p-4",
            proof.isPrivate && privacyMode && "border-emerald-500/20"
          )}>
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-gray-400" />
              Related
              {proof.isPrivate && privacyMode && (
                <Lock className="w-3 h-3 text-emerald-400" />
              )}
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Job ID</p>
                {proof.isPrivate && privacyMode ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-emerald-400 font-mono tracking-wider">job_••••••••</code>
                    <Lock className="w-3 h-3 text-emerald-400/50" />
                  </div>
                ) : (
                  <Link
                    href={`/jobs?search=${proof.jobId}`}
                    className="text-emerald-400 hover:text-emerald-300 text-sm font-mono flex items-center gap-1"
                  >
                    {proof.jobId}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Client</p>
                {proof.isPrivate && privacyMode ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-emerald-400 font-mono tracking-wider">0x••••••••••••</code>
                    <span className="text-[10px] text-emerald-400/50">(sender hidden)</span>
                  </div>
                ) : (
                  <code className="text-sm text-gray-300 font-mono">{proof.client.slice(0, 12)}...{proof.client.slice(-8)}</code>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">GPU</p>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-white">{proof.gpu.name}</span>
                  <span className="text-xs text-gray-500">({proof.gpu.memory})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Execution Timeline */}
          <div className="glass-card p-4">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Timer className="w-4 h-4 text-gray-400" />
              Execution Timeline
            </h3>
            <div className="space-y-3">
              {proof.executionPhases.map((phase: ProofExecutionPhase, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                    phase.status === "completed" && "bg-emerald-500/20",
                    phase.status === "in_progress" && "bg-emerald-500/20 ring-2 ring-emerald-500/50",
                    phase.status === "pending" && "bg-surface-elevated"
                  )}>
                    {phase.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : phase.status === "in_progress" ? (
                      <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm",
                      phase.status === "in_progress" ? "text-emerald-400 font-medium" : 
                      phase.status === "pending" ? "text-gray-500" : "text-white"
                    )}>{phase.name}</p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {phase.status === "completed" ? `${(phase.duration / 1000).toFixed(1)}s` :
                     phase.status === "in_progress" ? "..." : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-surface-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Total Time</span>
                <span className="text-sm font-semibold text-white">{proof.duration}</span>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="glass-card p-4">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Timestamps
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Generated</span>
                <span className="text-white">{new Date(proof.generatedAt).toLocaleString()}</span>
              </div>
              {proof.verifiedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Verified</span>
                  <span className="text-white">{new Date(proof.verifiedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function CollapsibleSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-surface-elevated/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-emerald-400">{icon}</div>
          <h3 className="font-semibold text-white">{title}</h3>
          {badge}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-surface-border/50 pt-4">
          {children}
        </div>
      )}
    </motion.div>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-surface-elevated/50">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn("text-sm font-mono", highlight ? "text-emerald-400" : "text-white")}>{value}</p>
    </div>
  );
}

function HashField({
  label,
  value,
  onCopy,
  copied,
  link,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  link?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-elevated/50">
        <code className="text-xs text-gray-300 font-mono truncate flex-1">
          {value}
        </code>
        <button onClick={onCopy} className="text-gray-500 hover:text-white flex-shrink-0">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-emerald-400 flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
