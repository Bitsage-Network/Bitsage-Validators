"use client";

import { useState, useCallback } from "react";
import {
  ArrowLeft,
  FileText,
  Send,
  AlertCircle,
  Info,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useSendTransaction } from "@starknet-react/core";
import {
  buildProposeCall,
  useSageBalance,
  PROPOSAL_TYPES,
  type ProposalTypeKey,
  getContractAddresses,
} from "@/lib/contracts";
import { SAGE_DECIMALS } from "@/lib/contracts/addresses";

const CATEGORIES = [
  { id: "economics", label: "Economics", description: "Token rewards, fees, treasury" },
  { id: "privacy", label: "Privacy", description: "Privacy pools, stealth addresses" },
  { id: "governance", label: "Governance", description: "Voting rules, delegation" },
  { id: "technical", label: "Technical", description: "Protocol upgrades, parameters" },
  { id: "community", label: "Community", description: "Grants, partnerships" },
];

const PROPOSAL_TEMPLATES = [
  {
    id: "parameter_change",
    title: "Parameter Change",
    description: "Modify a protocol parameter",
    template: `## Summary
Brief description of the proposed parameter change.

## Current Value
[Current parameter value]

## Proposed Value
[New parameter value]

## Rationale
Explain why this change is needed.

## Impact Analysis
- Expected positive outcomes
- Potential risks
- Mitigation strategies`,
  },
  {
    id: "treasury_spend",
    title: "Treasury Spending",
    description: "Request funds from treasury",
    template: `## Summary
Brief description of the funding request.

## Amount Requested
[Amount in SAGE/USDC]

## Recipient
[Recipient address or organization]

## Purpose
Detailed explanation of how funds will be used.

## Milestones
1. [Milestone 1 - Amount]
2. [Milestone 2 - Amount]
3. [Milestone 3 - Amount]

## Success Metrics
How will success be measured?`,
  },
  {
    id: "feature_request",
    title: "Feature Request",
    description: "Propose a new protocol feature",
    template: `## Summary
Brief description of the proposed feature.

## Motivation
Why is this feature needed?

## Specification
Technical details of the implementation.

## Benefits
- Benefit 1
- Benefit 2
- Benefit 3

## Risks and Mitigations
Potential risks and how to address them.`,
  },
];

// Minimum SAGE required to create a proposal (10,000 SAGE)
const MIN_PROPOSAL_THRESHOLD = BigInt(10000) * BigInt(10 ** SAGE_DECIMALS);

// Map categories to proposal types
const CATEGORY_TO_PROPOSAL_TYPE: Record<string, ProposalTypeKey> = {
  economics: "Treasury",
  privacy: "Parameter",
  governance: "Parameter",
  technical: "Upgrade",
  community: "Treasury",
};

export default function CreateProposalPage() {
  const router = useRouter();
  const { address, status: accountStatus } = useAccount();
  const { data: balanceData } = useSageBalance(address);
  const { sendAsync: sendTransaction, isPending: isWalletPending } = useSendTransaction({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Treasury amount for spending proposals
  const [treasuryAmount, setTreasuryAmount] = useState("");
  const [targetAddress, setTargetAddress] = useState("");

  // Check if user has enough SAGE
  const balance = balanceData ? BigInt(balanceData.toString()) : 0n;
  const balanceFormatted = (Number(balance) / 10 ** SAGE_DECIMALS).toFixed(2);
  const hasEnoughBalance = balance >= MIN_PROPOSAL_THRESHOLD;

  const handleTemplateSelect = (template: typeof PROPOSAL_TEMPLATES[0]) => {
    setSelectedTemplate(template.id);
    setDescription(template.template);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !address) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const proposalType = CATEGORY_TO_PROPOSAL_TYPE[category.id] || "Parameter";
      const addresses = getContractAddresses("sepolia");

      // Parse treasury amount if provided
      const value = treasuryAmount
        ? BigInt(Math.floor(parseFloat(treasuryAmount) * 10 ** SAGE_DECIMALS))
        : 0n;

      // Build the proposal call
      const call = buildProposeCall(
        title,
        description.slice(0, 31), // First 31 chars for on-chain description
        targetAddress || addresses.GOVERNANCE_TREASURY,
        value,
        "0x0", // No calldata for basic proposals
        proposalType
      );

      // Send transaction
      const result = await sendTransaction([call]);

      if (result?.transaction_hash) {
        setTxHash(result.transaction_hash);
        setIsSuccess(true);

        // Redirect after success
        setTimeout(() => {
          router.push("/governance");
        }, 3000);
      }
    } catch (err: unknown) {
      console.error("Proposal submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit proposal");
    } finally {
      setIsSubmitting(false);
    }
  }, [address, title, description, category.id, treasuryAmount, targetAddress, sendTransaction, router]);

  const isValid = title.trim().length >= 10 && description.trim().length >= 100;
  const canSubmit = isValid && accountStatus === "connected" && hasEnoughBalance && !isSubmitting;

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Proposal Submitted!</h2>
          <p className="text-gray-400 mb-4">
            Your proposal has been submitted on-chain.
            The voting period will begin after the configured delay.
          </p>
          {txHash && (
            <a
              href={`https://sepolia.starkscan.co/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 text-sm mb-4"
            >
              View on Starkscan
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <p className="text-sm text-gray-500">Redirecting to governance page...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/governance"
          className="p-2 rounded-lg bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Create Proposal</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Submit a new governance proposal for community voting
          </p>
        </div>
      </div>

      {/* Requirements Banner */}
      <div className="glass-card p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-gray-300">
              <strong className="text-white">Requirements:</strong> You need at least{" "}
              <span className="text-brand-400">10,000 SAGE</span> to create a proposal.
              Proposals require a 7-day voting period and 20% quorum to pass.
            </p>
            {accountStatus === "connected" && (
              <p className="text-sm mt-2">
                Your balance:{" "}
                <span className={hasEnoughBalance ? "text-emerald-400" : "text-red-400"}>
                  {balanceFormatted} SAGE
                </span>
                {!hasEnoughBalance && (
                  <span className="text-red-400 ml-2">(Insufficient)</span>
                )}
              </p>
            )}
            {accountStatus !== "connected" && (
              <p className="text-sm text-orange-400 mt-2">
                Please connect your wallet to create a proposal
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="glass-card p-4 border-red-500/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="glass-card p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Proposal Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a clear, descriptive title..."
                  className="w-full p-4 rounded-xl bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  maxLength={100}
                />
                <div className="flex justify-between mt-2">
                  <span className={cn(
                    "text-xs",
                    title.length < 10 ? "text-orange-400" : "text-gray-500"
                  )}>
                    {title.length < 10 ? "Minimum 10 characters" : ""}
                  </span>
                  <span className="text-xs text-gray-500">{title.length}/100</span>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Category
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-surface-border hover:border-brand-500/50 transition-colors"
                  >
                    <div className="text-left">
                      <p className="font-medium text-white">{category.label}</p>
                      <p className="text-xs text-gray-400">{category.description}</p>
                    </div>
                    <ChevronDown className={cn(
                      "w-5 h-5 text-gray-400 transition-transform",
                      isCategoryOpen && "rotate-180"
                    )} />
                  </button>
                  <AnimatePresence>
                    {isCategoryOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden"
                      >
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setCategory(cat);
                              setIsCategoryOpen(false);
                            }}
                            className={cn(
                              "w-full p-4 text-left hover:bg-surface-elevated transition-colors",
                              category.id === cat.id && "bg-brand-500/10"
                            )}
                          >
                            <p className="font-medium text-white">{cat.label}</p>
                            <p className="text-xs text-gray-400">{cat.description}</p>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="glass-card p-6">
              <label className="block text-sm font-medium text-white mb-2">
                Proposal Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your proposal in detail. Use markdown formatting for headers (##), lists (-), and emphasis..."
                rows={15}
                className="w-full p-4 rounded-xl bg-surface-elevated border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono text-sm resize-none"
              />
              <div className="flex justify-between mt-2">
                <span className={cn(
                  "text-xs",
                  description.length < 100 ? "text-orange-400" : "text-gray-500"
                )}>
                  {description.length < 100 ? `${100 - description.length} more characters needed` : "Markdown formatting supported"}
                </span>
                <span className="text-xs text-gray-500">{description.length} characters</span>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition-all",
                  canSubmit
                    ? "bg-gradient-to-r from-brand-600 to-purple-600 hover:shadow-lg hover:shadow-brand-500/25"
                    : "bg-gray-700 cursor-not-allowed"
                )}
              >
                {isSubmitting || isWalletPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isWalletPending ? "Confirm in Wallet..." : "Submitting Proposal..."}
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit Proposal On-Chain
                  </>
                )}
              </button>
              <Link
                href="/governance"
                className="px-6 py-4 rounded-xl bg-surface-elevated border border-surface-border text-gray-300 hover:text-white transition-colors font-medium"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Sidebar - Templates */}
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold text-white mb-4">Templates</h3>
            <div className="space-y-3">
              {PROPOSAL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className={cn(
                    "w-full p-4 rounded-lg border text-left transition-all",
                    selectedTemplate === template.id
                      ? "bg-brand-500/10 border-brand-500"
                      : "bg-surface-elevated border-surface-border hover:border-gray-600"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <FileText className={cn(
                      "w-5 h-5 flex-shrink-0",
                      selectedTemplate === template.id ? "text-brand-400" : "text-gray-400"
                    )} />
                    <div>
                      <p className="font-medium text-white">{template.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{template.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Guidelines */}
          <div className="glass-card p-6">
            <h3 className="font-semibold text-white mb-4">Guidelines</h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Be clear and specific about the proposed changes</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Explain the motivation and expected impact</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Address potential risks and mitigations</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Include technical specifications if applicable</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Engage with community feedback before finalizing</span>
              </li>
            </ul>
          </div>

          {/* Warning */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-300">
                  <strong className="text-orange-400">Note:</strong> Submitted proposals cannot be edited.
                  Make sure to review carefully before submitting.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
