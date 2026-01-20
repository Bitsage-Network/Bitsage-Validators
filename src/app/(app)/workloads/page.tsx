"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Cpu,
  Brain,
  Server,
  Shield,
  Zap,
  Play,
  Check,
  AlertCircle,
  Square,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useWorkloadDeployment } from "@/lib/hooks/useWorkloadDeployment";
import { WorkerStatusBanner } from "@/components/workloads/WorkerStatusBanner";
import { DeploymentProgressModal } from "@/components/workloads/DeploymentProgressModal";

// Workload data (matches backend workload_types.rs)
const workloads = [
  {
    id: "qwen-2.5",
    name: "Qwen 2.5",
    category: "ai",
    description: "Alibaba Cloud's large language model family supporting text, images, audio, and video. Qwen2.5 offers strong multilingual capabilities and up to 32K context length for diverse AI applications.",
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    verified: true,
    minVramGb: 24,
    tags: ["LLM", "Multimodal", "Inference"],
  },
  {
    id: "llama-3.2",
    name: "Llama 3.2",
    category: "ai",
    description: "Meta AI's open-source LLM family with models ranging from 1B to 70B+ parameters. Features strong reasoning, coding, and multilingual capabilities with 8K+ context length. Part of the Llama series leading to Llama 4.",
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    verified: true,
    minVramGb: 16,
    tags: ["LLM", "Open Source", "Meta AI"],
  },
  {
    id: "stwo-prover",
    name: "STWO Prover",
    category: "compute",
    description: "GPU-accelerated zero-knowledge proof generation using STWO protocol",
    icon: Shield,
    color: "text-brand-400",
    bg: "bg-brand-500/20",
    verified: true,
    minVramGb: 8,
    tags: ["ZK", "Proofs", "GPU"],
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    category: "creative",
    description: "Powerful node-based UI for Stable Diffusion image generation workflows",
    icon: Brain,
    color: "text-pink-400",
    bg: "bg-pink-500/20",
    verified: true,
    minVramGb: 12,
    tags: ["Image", "Stable Diffusion", "Workflows"],
  },
  {
    id: "starknet-node",
    name: "Starknet Full Node",
    category: "infra",
    description: "Run a Starknet full node to support the network and earn rewards",
    icon: Server,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    verified: true,
    minVramGb: 4,
    tags: ["Node", "Starknet", "Infrastructure"],
  },
  {
    id: "sdxl",
    name: "Stable Diffusion XL",
    category: "ai",
    description: "High-quality image generation model for creative applications",
    icon: Brain,
    color: "text-pink-400",
    bg: "bg-pink-500/20",
    verified: true,
    minVramGb: 16,
    tags: ["Image", "Generation", "Creative"],
  },
  {
    id: "whisper-large",
    name: "Whisper Large",
    category: "ai",
    description: "OpenAI's speech recognition model for transcription and translation",
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    verified: true,
    minVramGb: 8,
    tags: ["Audio", "Transcription", "Speech"],
  },
  {
    id: "cairo-vm",
    name: "Cairo VM",
    category: "compute",
    description: "Execute Cairo programs with GPU acceleration for Starknet",
    icon: Cpu,
    color: "text-cyan-400",
    bg: "bg-cyan-500/20",
    verified: true,
    minVramGb: 4,
    tags: ["Cairo", "Execution", "Starknet"],
  },
];

const categories = [
  { id: "all", name: "All Workloads", icon: Zap },
  { id: "ai", name: "AI Models", icon: Brain },
  { id: "compute", name: "Compute", icon: Cpu },
  { id: "infra", name: "Infrastructure", icon: Server },
  { id: "creative", name: "Creative", icon: Brain },
];

export default function WorkloadsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"name">("name");
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedWorkloadName, setSelectedWorkloadName] = useState("");

  // Use the workload deployment hook
  const {
    myWorkers,
    hasConnectedWorker,
    isLoadingWorkers,
    workersError,
    refreshWorkers,
    activeDeployment,
    isDeploying,
    deploymentError,
    deploy,
    stop,
    canDeploy,
    getInsufficientVramMessage,
  } = useWorkloadDeployment();

  // Filter and sort workloads
  const filteredWorkloads = useMemo(() => {
    return workloads
      .filter((w) => {
        if (searchQuery && !w.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        if (selectedCategory !== "all" && w.category !== selectedCategory) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [searchQuery, selectedCategory, sortBy]);

  // Get the active workload (if any worker is running one)
  const runningWorkloadId = myWorkers.find(w => w.active_workload)?.active_workload;

  const handleDeploy = async (workloadId: string, workloadName: string) => {
    setSelectedWorkloadName(workloadName);
    const result = await deploy(workloadId);
    if (result) {
      setShowProgressModal(true);
    }
  };

  const handleStop = async () => {
    await stop();
    setShowProgressModal(false);
  };

  const handleCloseModal = () => {
    setShowProgressModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">GPU Workloads</h1>
        <p className="text-gray-400 mt-1">
          Deploy workloads to your connected GPUs and start earning SAGE
        </p>
      </div>

      {/* Worker Status Banner */}
      <WorkerStatusBanner
        workers={myWorkers}
        isLoading={isLoadingWorkers}
        error={workersError}
        onRefresh={refreshWorkers}
      />

      {/* Error Message */}
      <AnimatePresence>
        {deploymentError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 p-4 rounded-lg bg-red-500/20 border border-red-500/30"
          >
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-300">{deploymentError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search workloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name")}
            className="input-field min-w-[150px]"
          >
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((category) => {
          const Icon = category.icon;
          const isActive = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all",
                isActive
                  ? "bg-brand-600 text-white"
                  : "bg-surface-elevated text-gray-400 hover:text-white hover:bg-surface-border"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{category.name}</span>
            </button>
          );
        })}
      </div>

      {/* Workload Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWorkloads.map((workload, idx) => {
          const Icon = workload.icon;
          const isRunning = runningWorkloadId === workload.id;
          const canDeployThis = canDeploy(workload.minVramGb);
          const insufficientMessage = getInsufficientVramMessage(workload.minVramGb);
          const isDisabled = !hasConnectedWorker || !canDeployThis || isDeploying;

          return (
            <motion.div
              key={workload.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "glass-card overflow-hidden group",
                isRunning && "ring-2 ring-blue-500/50"
              )}
            >
              {/* Header */}
              <div className="p-4 border-b border-surface-border/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-xl", workload.bg)}>
                      <Icon className={cn("w-5 h-5", workload.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{workload.name}</h3>
                        {workload.verified && (
                          <div className="p-0.5 rounded-full bg-brand-500/20">
                            <Check className="w-3 h-3 text-brand-400" />
                          </div>
                        )}
                      </div>
                      {isRunning && (
                        <span className="text-xs text-blue-400">Running</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-4">
                <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                  {workload.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {workload.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-surface-elevated text-xs text-gray-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="mb-4">
                  <div className="p-2 rounded-lg bg-surface-elevated/50">
                    <p className="text-xs text-gray-500">Min VRAM</p>
                    <p className="text-sm font-medium text-white">{workload.minVramGb}GB</p>
                  </div>
                </div>

                {/* Insufficient VRAM Warning */}
                {hasConnectedWorker && insufficientMessage && (
                  <div className="mb-3 p-2 rounded-lg bg-amber-900/20 border border-amber-800/30">
                    <p className="text-xs text-amber-400">{insufficientMessage}</p>
                  </div>
                )}

                {/* Deploy / Stop Button */}
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    className="w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white"
                  >
                    <Square className="w-4 h-4" />
                    Stop Workload
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeploy(workload.id, workload.name)}
                    disabled={isDisabled}
                    className={cn(
                      "w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
                      isDisabled
                        ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                        : "bg-brand-600 hover:bg-brand-500 text-white"
                    )}
                  >
                    {isDeploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Deploy to GPU
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredWorkloads.length === 0 && (
        <div className="text-center py-12">
          <Cpu className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No workloads found matching your criteria</p>
        </div>
      )}

      {/* Deployment Progress Modal */}
      {activeDeployment && (
        <DeploymentProgressModal
          deployment={activeDeployment}
          workloadName={selectedWorkloadName || activeDeployment.workload_id}
          isOpen={showProgressModal}
          onClose={handleCloseModal}
          onStop={handleStop}
        />
      )}
    </div>
  );
}
