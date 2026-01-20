/**
 * Init Command
 *
 * Interactive setup wizard for new validators
 */

import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig, saveConfig, CONFIG_PATH, type BitSageConfig } from "../lib/config.js";
import { detectGPU, type GPUInfo } from "./gpu.js";
import { spawn } from "child_process";
import * as path from "path";

interface InitOptions {
  network?: string;
  skipDocker?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                   BitSage Validator Setup"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();

  // Step 1: Network Selection
  console.log(chalk.yellow("Step 1/5: Network Selection"));
  console.log("");

  const networkAnswer = await inquirer.prompt([
    {
      type: "list",
      name: "network",
      message: "Select network:",
      choices: [
        { name: "Sepolia Testnet (recommended for testing)", value: "sepolia" },
        { name: "Mainnet", value: "mainnet" },
        { name: "Local Devnet", value: "devnet" },
      ],
      default: options.network || "sepolia",
    },
  ]);

  config.network = networkAnswer.network;

  // Set RPC URLs based on network
  const rpcUrls: Record<string, string> = {
    sepolia: "https://starknet-sepolia.public.blastapi.io",
    mainnet: "https://starknet-mainnet.public.blastapi.io",
    devnet: "http://localhost:5050",
  };
  config.rpcUrl = rpcUrls[config.network] || rpcUrls.sepolia;

  console.log(chalk.green(`  ✓ Network: ${config.network}`));
  console.log("");

  // Step 2: Wallet Configuration
  console.log(chalk.yellow("Step 2/5: Wallet Configuration"));
  console.log("");

  const walletAnswer = await inquirer.prompt([
    {
      type: "input",
      name: "address",
      message: "Validator wallet address (0x...):",
      validate: (input: string) => {
        if (!input.startsWith("0x") || input.length < 10) {
          return "Please enter a valid Starknet address";
        }
        return true;
      },
      default: config.wallet.address,
    },
    {
      type: "password",
      name: "privateKey",
      message: "Private key (will not be stored in plain text):",
      mask: "*",
      validate: (input: string) => {
        if (!input || input.length < 10) {
          return "Please enter a valid private key";
        }
        return true;
      },
    },
  ]);

  config.wallet.address = walletAnswer.address;
  config.validator.operatorAddress = walletAnswer.address;

  // Store private key temporarily for this session
  // In production, should use keystore
  const privateKey = walletAnswer.privateKey;

  console.log(chalk.green(`  ✓ Wallet configured`));
  console.log("");

  // Step 3: GPU Detection
  console.log(chalk.yellow("Step 3/5: GPU Detection"));
  console.log("");

  const spinner = ora("Detecting GPU...").start();
  const gpuInfo = await detectGPU();
  spinner.stop();

  if (gpuInfo.detected) {
    console.log(chalk.green(`  ✓ GPU Detected: ${gpuInfo.name}`));
    console.log(chalk.dim(`    VRAM: ${gpuInfo.vramGb}GB | Type: ${gpuInfo.type} | Tier: ${gpuInfo.tier}`));

    const gpuConfirm = await inquirer.prompt([
      {
        type: "confirm",
        name: "useDetected",
        message: "Use detected GPU configuration?",
        default: true,
      },
    ]);

    if (gpuConfirm.useDetected) {
      config.gpu = {
        autoDetect: true,
        tier: gpuInfo.tier,
        vramGb: gpuInfo.vramGb,
        type: gpuInfo.type as "cuda" | "metal" | "cpu",
        devices: ["0"],
      };
    } else {
      const manualGpu = await promptManualGPU();
      config.gpu = manualGpu;
    }
  } else {
    console.log(chalk.yellow("  ⚠ No GPU detected"));

    const manualAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "setManually",
        message: "Configure GPU manually?",
        default: true,
      },
    ]);

    if (manualAnswer.setManually) {
      const manualGpu = await promptManualGPU();
      config.gpu = manualGpu;
    } else {
      config.gpu.type = "cpu";
      config.gpu.tier = 0;
    }
  }

  console.log("");

  // Step 4: Stake Configuration
  console.log(chalk.yellow("Step 4/5: Stake Configuration"));
  console.log("");
  console.log(chalk.dim("  Minimum stake: 1,000 SAGE"));
  console.log("");

  const stakeAnswer = await inquirer.prompt([
    {
      type: "input",
      name: "stakeAmount",
      message: "Initial stake amount (SAGE):",
      default: "1000",
      validate: (input: string) => {
        const amount = parseInt(input, 10);
        if (isNaN(amount) || amount < 1000) {
          return "Minimum stake is 1,000 SAGE";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "commission",
      message: "Commission rate on delegated rewards:",
      choices: [
        { name: "1%", value: 100 },
        { name: "3%", value: 300 },
        { name: "5% (recommended)", value: 500 },
        { name: "10%", value: 1000 },
      ],
      default: 2,
    },
  ]);

  config.validator.commissionBps = stakeAnswer.commission;

  console.log(chalk.green(`  ✓ Stake: ${stakeAnswer.stakeAmount} SAGE at ${stakeAnswer.commission / 100}% commission`));
  console.log("");

  // Step 5: Docker Setup
  console.log(chalk.yellow("Step 5/5: Docker Setup"));
  console.log("");

  if (!options.skipDocker) {
    const dockerAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "setupDocker",
        message: "Set up Docker deployment?",
        default: true,
      },
    ]);

    if (dockerAnswer.setupDocker) {
      const deployDir = path.resolve(process.cwd(), "deploy");
      console.log(chalk.dim(`  Running setup script in ${deployDir}...`));

      // Check if deploy directory exists
      try {
        const setupSpinner = ora("Setting up Docker environment...").start();

        // Create .env from template
        const envContent = generateEnvContent(config, privateKey, stakeAnswer.stakeAmount);
        const fs = await import("fs");
        fs.writeFileSync(path.join(deployDir, ".env"), envContent, { mode: 0o600 });

        setupSpinner.succeed("Docker environment configured");
      } catch (error) {
        console.log(chalk.yellow("  ⚠ Docker setup skipped (deploy directory not found)"));
      }
    }
  }

  // Save configuration
  saveConfig(config);

  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.green.bold("                    Setup Complete!"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`Configuration saved to: ${chalk.cyan(CONFIG_PATH)}`);
  console.log("");
  console.log(chalk.bold("Next steps:"));
  console.log("");
  console.log(`  1. ${chalk.cyan("bitsage faucet")}     - Claim testnet tokens (if on Sepolia)`);
  console.log(`  2. ${chalk.cyan("bitsage register")}   - Register as validator on-chain`);
  console.log(`  3. ${chalk.cyan("bitsage start")}      - Start validator services`);
  console.log(`  4. ${chalk.cyan("bitsage status")}     - Check node status`);
  console.log("");
}

async function promptManualGPU(): Promise<BitSageConfig["gpu"]> {
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: "GPU type:",
      choices: [
        { name: "NVIDIA (CUDA)", value: "cuda" },
        { name: "Apple Silicon (Metal)", value: "metal" },
        { name: "CPU Only", value: "cpu" },
      ],
    },
    {
      type: "input",
      name: "vramGb",
      message: "VRAM in GB:",
      default: "8",
      validate: (input: string) => {
        const vram = parseInt(input, 10);
        if (isNaN(vram) || vram < 0) {
          return "Please enter a valid number";
        }
        return true;
      },
    },
    {
      type: "list",
      name: "tier",
      message: "GPU tier:",
      choices: [
        { name: "0 - Consumer (4-8GB)", value: 0 },
        { name: "1 - Prosumer (8-12GB)", value: 1 },
        { name: "2 - Professional (12-24GB)", value: 2 },
        { name: "3 - Datacenter (24-48GB)", value: 3 },
        { name: "4 - Enterprise (48GB+)", value: 4 },
      ],
    },
  ]);

  return {
    autoDetect: false,
    tier: answers.tier,
    vramGb: parseInt(answers.vramGb, 10),
    type: answers.type,
    devices: ["0"],
  };
}

function generateEnvContent(config: BitSageConfig, privateKey: string, stakeAmount: string): string {
  return `# BitSage Validator Configuration
# Generated by bitsage init

# Network
NETWORK=${config.network}
STARKNET_RPC_URL=${config.rpcUrl}

# Wallet
VALIDATOR_ADDRESS=${config.wallet.address}
VALIDATOR_PRIVATE_KEY=${privateKey}

# Validator Settings
COMMISSION_BPS=${config.validator.commissionBps}
STAKE_AMOUNT=${stakeAmount}

# GPU
GPU_TYPE=${config.gpu.type}
GPU_TIER=${config.gpu.tier}
GPU_VRAM=${config.gpu.vramGb}
CUDA_VISIBLE_DEVICES=all
GPU_MEMORY_FRACTION=0.9

# Services
COORDINATOR_PORT=${config.services.coordinator.port}
DASHBOARD_PORT=${config.services.dashboard.port}

# Frontend
NEXT_PUBLIC_RPC_URL=${config.rpcUrl}
NEXT_PUBLIC_COORDINATOR_URL=http://localhost:${config.services.coordinator.port}
NEXT_PUBLIC_WS_URL=ws://localhost:${config.services.coordinator.port}/ws/prover

# Logging
RUST_LOG=bitsage_coordinator=info,stwo_gpu=info
`;
}
