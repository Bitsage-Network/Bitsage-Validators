/**
 * GPU Commands
 *
 * GPU detection and configuration
 */

import chalk from "chalk";
import ora from "ora";
import { loadConfig, updateConfig } from "../lib/config.js";

export interface GPUInfo {
  detected: boolean;
  name: string;
  vramGb: number;
  type: "cuda" | "metal" | "cpu";
  tier: number;
  tierName: string;
  driver?: string;
}

interface GPUSetOptions {
  tier?: string;
  vram?: string;
  type?: string;
}

const GPU_TIERS: Record<number, { name: string; minVram: number }> = {
  0: { name: "Consumer", minVram: 4 },
  1: { name: "Prosumer", minVram: 8 },
  2: { name: "Professional", minVram: 12 },
  3: { name: "Datacenter", minVram: 24 },
  4: { name: "Enterprise", minVram: 48 },
};

/**
 * Detect GPU capabilities
 */
export async function detectGPU(): Promise<GPUInfo> {
  const defaultInfo: GPUInfo = {
    detected: false,
    name: "Unknown",
    vramGb: 0,
    type: "cpu",
    tier: 0,
    tierName: "Consumer",
  };

  try {
    // Try to use systeminformation library
    const si = await import("systeminformation");
    const graphics = await si.graphics();

    if (graphics.controllers && graphics.controllers.length > 0) {
      const gpu = graphics.controllers[0];

      // Determine GPU type
      let type: "cuda" | "metal" | "cpu" = "cpu";
      let vramGb = 0;

      if (gpu.vendor?.toLowerCase().includes("nvidia") || gpu.model?.toLowerCase().includes("nvidia")) {
        type = "cuda";
        vramGb = gpu.vram ? Math.round(gpu.vram / 1024) : estimateVRAM(gpu.model || "");
      } else if (
        gpu.vendor?.toLowerCase().includes("apple") ||
        process.platform === "darwin"
      ) {
        type = "metal";
        // For Apple Silicon, estimate based on total system memory
        const mem = await si.mem();
        vramGb = Math.round((mem.total / 1024 / 1024 / 1024) * 0.75); // ~75% available as unified memory
      } else if (gpu.vendor?.toLowerCase().includes("amd")) {
        // AMD GPUs - could support ROCm in future
        type = "cuda"; // placeholder
        vramGb = gpu.vram ? Math.round(gpu.vram / 1024) : estimateVRAM(gpu.model || "");
      }

      const tier = determineTier(vramGb);

      return {
        detected: true,
        name: gpu.model || gpu.name || "Unknown GPU",
        vramGb,
        type,
        tier,
        tierName: GPU_TIERS[tier]?.name || "Consumer",
        driver: gpu.driverVersion,
      };
    }

    return defaultInfo;
  } catch (error) {
    // Fallback to basic detection
    return defaultInfo;
  }
}

/**
 * Estimate VRAM from GPU model name
 */
function estimateVRAM(model: string): number {
  const modelLower = model.toLowerCase();

  // NVIDIA high-end
  if (modelLower.includes("h100")) return 80;
  if (modelLower.includes("a100")) return 40;
  if (modelLower.includes("4090")) return 24;
  if (modelLower.includes("4080")) return 16;
  if (modelLower.includes("4070")) return 12;
  if (modelLower.includes("3090")) return 24;
  if (modelLower.includes("3080 ti")) return 12;
  if (modelLower.includes("3080")) return 10;
  if (modelLower.includes("3070")) return 8;
  if (modelLower.includes("3060")) return 12;

  // NVIDIA mid-range
  if (modelLower.includes("2080 ti")) return 11;
  if (modelLower.includes("2080")) return 8;
  if (modelLower.includes("2070")) return 8;
  if (modelLower.includes("2060")) return 6;
  if (modelLower.includes("1080 ti")) return 11;
  if (modelLower.includes("1080")) return 8;
  if (modelLower.includes("1070")) return 8;

  // AMD
  if (modelLower.includes("rx 7900")) return 24;
  if (modelLower.includes("rx 7800")) return 16;
  if (modelLower.includes("rx 6900")) return 16;
  if (modelLower.includes("rx 6800")) return 16;
  if (modelLower.includes("rx 6700")) return 12;

  // Apple Silicon
  if (modelLower.includes("m3 max")) return 40;
  if (modelLower.includes("m3 pro")) return 18;
  if (modelLower.includes("m2 max")) return 32;
  if (modelLower.includes("m2 pro")) return 16;
  if (modelLower.includes("m1 max")) return 32;
  if (modelLower.includes("m1 pro")) return 16;
  if (modelLower.includes("apple m")) return 8;

  return 4;
}

/**
 * Determine GPU tier from VRAM
 */
function determineTier(vramGb: number): number {
  if (vramGb >= 48) return 4;
  if (vramGb >= 24) return 3;
  if (vramGb >= 12) return 2;
  if (vramGb >= 8) return 1;
  return 0;
}

/**
 * GPU command handler
 */
export async function gpuCommand(
  subcommand: string,
  options: { json?: boolean } | GPUSetOptions
): Promise<void> {
  switch (subcommand) {
    case "detect":
      await handleDetect(options as { json?: boolean });
      break;
    case "set":
      await handleSet(options as GPUSetOptions);
      break;
    default:
      console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.log(chalk.dim("Usage: bitsage gpu <detect|set> [options]"));
      process.exit(1);
  }
}

async function handleDetect(options: { json?: boolean }): Promise<void> {
  if (!options.json) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                     GPU Detection"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
  }

  const spinner = options.json ? null : ora("Detecting GPU...").start();

  const gpuInfo = await detectGPU();

  spinner?.stop();

  if (options.json) {
    console.log(JSON.stringify(gpuInfo, null, 2));
    return;
  }

  if (gpuInfo.detected) {
    console.log(chalk.green("  ✓ GPU Detected"));
    console.log("");
    console.log(chalk.dim(`  Name:    ${gpuInfo.name}`));
    console.log(chalk.dim(`  Type:    ${gpuInfo.type.toUpperCase()}`));
    console.log(chalk.dim(`  VRAM:    ${gpuInfo.vramGb}GB`));
    console.log(chalk.dim(`  Tier:    ${gpuInfo.tier} (${gpuInfo.tierName})`));
    if (gpuInfo.driver) {
      console.log(chalk.dim(`  Driver:  ${gpuInfo.driver}`));
    }

    // Report GPU to coordinator (non-blocking)
    const config = loadConfig();
    const coordinatorPort = config.services?.coordinator?.port || 3030;
    try {
      const res = await fetch(`http://localhost:${coordinatorPort}/api/v1/workers/gpu/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: config.wallet?.address || "unknown",
          owner_wallet: config.wallet?.address || "unknown",
          gpu_model: gpuInfo.name,
          gpu_backend: gpuInfo.type,
          vram_gb: gpuInfo.vramGb,
          capacity: 1,
        }),
      });
      if (res.ok) {
        console.log(chalk.green("  ✓ Reported to coordinator"));
      }
    } catch {
      // Coordinator not running — skip silently
    }
  } else {
    console.log(chalk.yellow("  ⚠ No GPU detected"));
    console.log(chalk.dim("  The system will use CPU for proving"));
  }

  console.log("");
  console.log(chalk.bold("GPU Tiers:"));
  for (const [tier, info] of Object.entries(GPU_TIERS)) {
    const current = parseInt(tier) === gpuInfo.tier ? chalk.green(" ← current") : "";
    console.log(chalk.dim(`  ${tier}: ${info.name} (${info.minVram}GB+ VRAM)${current}`));
  }

  console.log("");
}

async function handleSet(options: GPUSetOptions): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                   Set GPU Configuration"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();

  // Parse options
  const tier = options.tier !== undefined ? parseInt(options.tier, 10) : config.gpu.tier;
  const vram = options.vram !== undefined ? parseInt(options.vram, 10) : config.gpu.vramGb;
  const type = (options.type as "cuda" | "metal" | "cpu") || config.gpu.type;

  // Validate
  if (tier < 0 || tier > 4) {
    console.log(chalk.red("Error: Tier must be between 0 and 4"));
    process.exit(1);
  }

  if (vram < 0) {
    console.log(chalk.red("Error: VRAM must be a positive number"));
    process.exit(1);
  }

  if (!["cuda", "metal", "cpu"].includes(type)) {
    console.log(chalk.red("Error: Type must be 'cuda', 'metal', or 'cpu'"));
    process.exit(1);
  }

  // Update config
  updateConfig({
    gpu: {
      autoDetect: false,
      tier,
      vramGb: vram,
      type,
      devices: config.gpu.devices,
    },
  });

  console.log(chalk.green("  ✓ GPU configuration updated"));
  console.log("");
  console.log(chalk.dim(`  Type:  ${type.toUpperCase()}`));
  console.log(chalk.dim(`  VRAM:  ${vram}GB`));
  console.log(chalk.dim(`  Tier:  ${tier} (${GPU_TIERS[tier]?.name || "Unknown"})`));
  console.log("");
}
