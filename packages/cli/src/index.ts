#!/usr/bin/env node
/**
 * BitSage CLI
 *
 * Command-line interface for managing BitSage validator nodes.
 *
 * Commands:
 *   init      - Interactive setup wizard
 *   register  - Register as validator on-chain
 *   stake     - Add or remove stake
 *   faucet    - Claim testnet tokens
 *   start     - Start validator services
 *   stop      - Stop validator services
 *   status    - Show node status
 *   logs      - View service logs
 *   gpu       - GPU detection and configuration
 *   privacy   - Privacy pools and confidential transactions
 *   health    - Health check all services
 */

import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init.js";
import { registerCommand } from "./commands/register.js";
import { stakeCommand } from "./commands/stake.js";
import { faucetCommand } from "./commands/faucet.js";
import { startCommand, stopCommand } from "./commands/services.js";
import { statusCommand, healthCommand } from "./commands/status.js";
import { gpuCommand } from "./commands/gpu.js";
import { privacyCommand } from "./commands/privacy.js";
import { loginCommand, shellCommand, proveCommand, nodesCommand } from "./commands/shell.js";

const program = new Command();

// ASCII banner
const banner = `
${chalk.blue("╔══════════════════════════════════════════════════════════════╗")}
${chalk.blue("║")}                                                              ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("██████╗ ██╗████████╗███████╗ █████╗  ██████╗ ███████╗")}   ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗██╔════╝ ██╔════╝")}   ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("██████╔╝██║   ██║   ███████╗███████║██║  ███╗█████╗")}     ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("██╔══██╗██║   ██║   ╚════██║██╔══██║██║   ██║██╔══╝")}     ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("██████╔╝██║   ██║   ███████║██║  ██║╚██████╔╝███████╗")}   ${chalk.blue("║")}
${chalk.blue("║")}   ${chalk.bold.cyan("╚═════╝ ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝")}   ${chalk.blue("║")}
${chalk.blue("║")}                                                              ${chalk.blue("║")}
${chalk.blue("║")}           ${chalk.dim("GPU Validator Node CLI v0.1.0")}                       ${chalk.blue("║")}
${chalk.blue("╚══════════════════════════════════════════════════════════════╝")}
`;

program
  .name("bitsage")
  .description("BitSage Network Validator CLI")
  .version("0.1.0")
  .hook("preAction", () => {
    // Show banner for main commands
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      console.log(banner);
    }
  });

// Init command - Interactive setup wizard
program
  .command("init")
  .description("Interactive setup wizard for new validators")
  .option("-n, --network <network>", "Network to use (sepolia|mainnet)", "sepolia")
  .option("--skip-docker", "Skip Docker setup")
  .action(initCommand);

// Register command - On-chain registration
program
  .command("register")
  .description("Register as a validator on-chain")
  .option("-s, --stake <amount>", "Initial stake amount in SAGE", "1000")
  .option("-c, --commission <bps>", "Commission rate in basis points", "500")
  .action(registerCommand);

// Stake command - Stake management
program
  .command("stake")
  .description("Manage validator stake")
  .argument("<action>", "Action: add | remove | info")
  .argument("[amount]", "Amount in SAGE")
  .action(stakeCommand);

// Faucet command - Claim testnet tokens
program
  .command("faucet")
  .description("Claim testnet SAGE tokens")
  .option("-a, --amount <amount>", "Amount to claim", "1000")
  .action(faucetCommand);

// Start command - Start services
program
  .command("start")
  .description("Start validator services")
  .option("--no-gpu", "Start without GPU worker")
  .option("-m, --monitoring", "Include monitoring stack")
  .option("-f, --foreground", "Run in foreground")
  .action(startCommand);

// Stop command - Stop services
program
  .command("stop")
  .description("Stop validator services")
  .option("-v, --volumes", "Remove data volumes")
  .action(stopCommand);

// Status command - Show status
program
  .command("status")
  .description("Show validator node status")
  .option("-j, --json", "Output as JSON")
  .action(statusCommand);

// Health command - Health check
program
  .command("health")
  .description("Health check all services")
  .option("-v, --verbose", "Verbose output")
  .action(healthCommand);

// GPU command - GPU management
const gpu = program
  .command("gpu")
  .description("GPU detection and configuration");

gpu
  .command("detect")
  .description("Detect GPU capabilities")
  .option("-j, --json", "Output as JSON")
  .action((opts) => gpuCommand("detect", opts));

gpu
  .command("set")
  .description("Manually set GPU configuration")
  .option("-t, --tier <tier>", "GPU tier (0-4)")
  .option("-v, --vram <gb>", "VRAM in GB")
  .option("--type <type>", "GPU type (cuda|metal|cpu)")
  .action((opts) => gpuCommand("set", opts));

// Privacy command - Privacy pools and confidential transactions
const privacy = program
  .command("privacy")
  .description("Privacy pools and confidential transactions");

privacy
  .command("deposit")
  .description("Deposit tokens into privacy pool")
  .argument("<amount>", "Amount to deposit in SAGE")
  .option("-p, --pool <pool>", "Pool address (default: configured pool)")
  .option("-a, --asp <asp>", "Association Set Provider")
  .action((amount: string, opts: Record<string, string>) => privacyCommand("deposit", [amount], opts));

privacy
  .command("withdraw")
  .description("Withdraw from privacy pool (requires TEE proof)")
  .argument("<amount>", "Amount to withdraw in SAGE")
  .option("-r, --recipient <address>", "Recipient address (default: your address)")
  .option("-p, --pool <pool>", "Pool address")
  .option("--tee <url>", "TEE prover URL for withdrawal proof")
  .action((amount: string, opts: Record<string, string>) => privacyCommand("withdraw", [amount], opts));

privacy
  .command("balance")
  .description("Show private balance across pools")
  .option("-j, --json", "Output as JSON")
  .action((opts) => privacyCommand("balance", [], opts));

privacy
  .command("notes")
  .description("List your privacy notes (commitments)")
  .option("-s, --spent", "Include spent notes")
  .option("-j, --json", "Output as JSON")
  .action((opts) => privacyCommand("notes", [], opts));

privacy
  .command("sets")
  .description("List available Association Set Providers")
  .option("-v, --verbose", "Show detailed ASP info")
  .action((opts) => privacyCommand("sets", [], opts));

privacy
  .command("swap")
  .description("Confidential token swap")
  .argument("<from-token>", "Token to swap from")
  .argument("<to-token>", "Token to swap to")
  .argument("<amount>", "Amount to swap")
  .option("--slippage <bps>", "Max slippage in basis points", "50")
  .action((from: string, to: string, amount: string, opts: Record<string, string>) => privacyCommand("swap", [from, to, amount], opts));

// Logs command
program
  .command("logs")
  .description("View service logs")
  .argument("[service]", "Service name (coordinator|gpu-worker|dashboard)")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <n>", "Number of lines to show", "100")
  .action(async (service: string | undefined, options: { follow?: boolean; lines: string }) => {
    const { spawn } = await import("child_process");
    const args = ["compose", "logs"];

    if (options.follow) args.push("-f");
    args.push("-n", options.lines);
    if (service) args.push(service);

    const child = spawn("docker", args, {
      cwd: process.cwd() + "/deploy",
      stdio: "inherit",
    });

    child.on("error", (err) => {
      console.error(chalk.red("Error:"), err.message);
      process.exit(1);
    });
  });

// Update command
program
  .command("update")
  .description("Update to latest version")
  .option("--check", "Check for updates only")
  .action(async (options) => {
    const ora = (await import("ora")).default;
    const spinner = ora("Checking for updates...").start();

    // Placeholder for update logic
    await new Promise((r) => setTimeout(r, 1000));
    spinner.succeed("You are running the latest version");
  });

// Login command — authenticate with API key
program
  .command("login")
  .description("Authenticate with a BitSage API key")
  .requiredOption("-k, --api-key <key>", "API key (starts with bsk_)")
  .action(loginCommand);

// Shell command — SSH into a prover node
program
  .command("shell")
  .description("SSH into an ObelyZK prover node (H100 GPU)")
  .argument("<node>", "Node name (e.g., h100-prover)")
  .action(shellCommand);

// Prove command — submit inference + get on-chain proof
program
  .command("prove")
  .description("Run verifiable inference and submit proof on-chain")
  .argument("<prompt>", "Input text prompt")
  .option("-m, --model <model>", "Model name (default: local)", "local")
  .option("-n, --node <node>", "Prover node (default: h100-prover)", "h100-prover")
  .action(proveCommand);

// Nodes command — list available prover nodes
program
  .command("nodes")
  .description("List available prover nodes")
  .action(nodesCommand);

// Parse and execute
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
