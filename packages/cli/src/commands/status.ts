/**
 * Status and Health Commands
 *
 * Show validator node status and health checks
 */

import chalk from "chalk";
import ora from "ora";
import { loadConfig } from "../lib/config.js";
import {
  initStarknet,
  getSageBalance,
  getValidatorInfo,
  isActiveValidator,
  getNetworkStats,
} from "../lib/starknet.js";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

interface StatusOptions {
  json?: boolean;
}

interface HealthOptions {
  verbose?: boolean;
}

function getDeployDir(): string {
  const cwdDeploy = path.join(process.cwd(), "deploy");
  if (fs.existsSync(cwdDeploy)) {
    return cwdDeploy;
  }
  return cwdDeploy;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const config = loadConfig();

  if (options.json) {
    await outputJsonStatus(config);
    return;
  }

  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                   Validator Node Status"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Configuration
  console.log(chalk.yellow("Configuration:"));
  console.log(chalk.dim(`  Network:  ${config.network}`));
  console.log(chalk.dim(`  RPC URL:  ${config.rpcUrl}`));
  console.log(chalk.dim(`  Wallet:   ${config.wallet.address || "Not configured"}`));
  console.log(chalk.dim(`  GPU:      ${config.gpu.type} (Tier ${config.gpu.tier}, ${config.gpu.vramGb}GB)`));
  console.log("");

  // On-chain status
  if (config.wallet.address) {
    const spinner = ora("Fetching on-chain status...").start();

    try {
      const client = initStarknet();

      // Balance
      const balance = await getSageBalance(client, config.wallet.address);
      const balanceInSage = Number(balance) / 1e18;

      // Validator status
      const isValidator = await isActiveValidator(client, config.wallet.address);
      const validatorInfo = await getValidatorInfo(client, config.wallet.address);

      // Network stats
      const networkStats = await getNetworkStats(client);

      spinner.stop();

      console.log(chalk.yellow("On-Chain Status:"));
      console.log(chalk.dim(`  SAGE Balance: ${balanceInSage.toLocaleString()} SAGE`));

      if (isValidator && validatorInfo) {
        const selfStake = validatorInfo.self_stake as { low: bigint; high: bigint };
        const totalStake = validatorInfo.total_stake as { low: bigint; high: bigint };
        const selfStakeAmount = BigInt(selfStake?.low || 0) + (BigInt(selfStake?.high || 0) << 128n);
        const totalStakeAmount = BigInt(totalStake?.low || 0) + (BigInt(totalStake?.high || 0) << 128n);

        console.log(chalk.green(`  Validator:    Active`));
        console.log(chalk.dim(`  Self Stake:   ${(Number(selfStakeAmount) / 1e18).toLocaleString()} SAGE`));
        console.log(chalk.dim(`  Total Stake:  ${(Number(totalStakeAmount) / 1e18).toLocaleString()} SAGE`));
        console.log(chalk.dim(`  Commission:   ${Number(validatorInfo.commission_bps || 0) / 100}%`));
      } else if (validatorInfo) {
        console.log(chalk.yellow(`  Validator:    Registered (inactive)`));
      } else {
        console.log(chalk.dim(`  Validator:    Not registered`));
      }

      if (networkStats) {
        console.log("");
        console.log(chalk.yellow("Network Stats:"));
        console.log(chalk.dim(`  Total Validators: ${networkStats.total_registered || 0}`));
        console.log(chalk.dim(`  Active:           ${networkStats.active_count || 0}`));
      }
    } catch (error) {
      spinner.fail("Failed to fetch on-chain status");
      console.log(chalk.dim(`  Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  console.log("");

  // Docker status
  await showDockerStatus();

  console.log("");
}

async function showDockerStatus(): Promise<void> {
  const deployDir = getDeployDir();

  if (!fs.existsSync(path.join(deployDir, "docker-compose.yml"))) {
    console.log(chalk.yellow("Docker Status:"));
    console.log(chalk.dim("  Docker deployment not configured"));
    return;
  }

  console.log(chalk.yellow("Docker Services:"));

  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "ps", "--format", "table {{.Name}}\t{{.Status}}"], {
      cwd: deployDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0 && output.trim()) {
        const lines = output.trim().split("\n");
        lines.forEach((line) => {
          if (line.includes("Up")) {
            console.log(chalk.green(`  ✓ ${line}`));
          } else if (line.includes("Exit") || line.includes("Restarting")) {
            console.log(chalk.red(`  ✗ ${line}`));
          } else {
            console.log(chalk.dim(`  ${line}`));
          }
        });
      } else {
        console.log(chalk.dim("  No services running"));
      }
      resolve();
    });

    child.on("error", () => {
      console.log(chalk.dim("  Docker not available"));
      resolve();
    });
  });
}

async function outputJsonStatus(config: ReturnType<typeof loadConfig>): Promise<void> {
  const status: Record<string, unknown> = {
    config: {
      network: config.network,
      rpcUrl: config.rpcUrl,
      wallet: config.wallet.address,
      gpu: config.gpu,
    },
    onChain: null,
    docker: null,
  };

  if (config.wallet.address) {
    try {
      const client = initStarknet();
      const balance = await getSageBalance(client, config.wallet.address);
      const isValidator = await isActiveValidator(client, config.wallet.address);
      const validatorInfo = await getValidatorInfo(client, config.wallet.address);

      status.onChain = {
        balance: Number(balance) / 1e18,
        isValidator,
        validatorInfo,
      };
    } catch {
      // Ignore errors for JSON output
    }
  }

  console.log(JSON.stringify(status, null, 2));
}

export async function healthCommand(options: HealthOptions): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                      Health Check"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();
  const checks: Array<{ name: string; status: "ok" | "warn" | "error"; message: string }> = [];

  // Check configuration
  if (config.wallet.address) {
    checks.push({
      name: "Wallet Configuration",
      status: "ok",
      message: `Configured: ${config.wallet.address.slice(0, 20)}...`,
    });
  } else {
    checks.push({
      name: "Wallet Configuration",
      status: "error",
      message: "Not configured. Run 'bitsage init'",
    });
  }

  // Check Starknet connection
  const spinner = ora("Checking Starknet connection...").start();
  try {
    const client = initStarknet();
    await client.provider.getChainId();
    spinner.stop();
    checks.push({
      name: "Starknet RPC",
      status: "ok",
      message: `Connected to ${config.network}`,
    });
  } catch (error) {
    spinner.stop();
    checks.push({
      name: "Starknet RPC",
      status: "error",
      message: `Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }

  // Check coordinator
  try {
    const response = await fetch(`http://localhost:${config.services.coordinator.port}/health`);
    if (response.ok) {
      checks.push({
        name: "Coordinator",
        status: "ok",
        message: `Running on port ${config.services.coordinator.port}`,
      });

      // Check capabilities if verbose
      if (options.verbose) {
        const capsResponse = await fetch(
          `http://localhost:${config.services.coordinator.port}/api/pricing/summary`
        );
        if (capsResponse.ok) {
          const caps = await capsResponse.json();
          checks.push({
            name: "Prover Capabilities",
            status: "ok",
            message: JSON.stringify(caps),
          });
        }
      }
    } else {
      checks.push({
        name: "Coordinator",
        status: "error",
        message: "Not healthy",
      });
    }
  } catch {
    checks.push({
      name: "Coordinator",
      status: "warn",
      message: "Not running. Start with 'bitsage start'",
    });
  }

  // Check dashboard
  try {
    const response = await fetch(`http://localhost:${config.services.dashboard.port}/`);
    if (response.ok) {
      checks.push({
        name: "Dashboard",
        status: "ok",
        message: `Running on port ${config.services.dashboard.port}`,
      });
    } else {
      checks.push({
        name: "Dashboard",
        status: "error",
        message: "Not healthy",
      });
    }
  } catch {
    checks.push({
      name: "Dashboard",
      status: "warn",
      message: "Not running",
    });
  }

  // Display results
  for (const check of checks) {
    const icon =
      check.status === "ok" ? chalk.green("✓") : check.status === "warn" ? chalk.yellow("⚠") : chalk.red("✗");
    const color =
      check.status === "ok" ? chalk.green : check.status === "warn" ? chalk.yellow : chalk.red;
    console.log(`  ${icon} ${chalk.bold(check.name)}`);
    console.log(`    ${color(check.message)}`);
    console.log("");
  }

  // Summary
  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warn").length;

  if (errors > 0) {
    console.log(chalk.red(`${errors} error(s), ${warnings} warning(s)`));
  } else if (warnings > 0) {
    console.log(chalk.yellow(`All checks passed with ${warnings} warning(s)`));
  } else {
    console.log(chalk.green("All checks passed!"));
  }

  console.log("");
}
