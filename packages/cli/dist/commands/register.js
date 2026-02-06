/**
 * Register Command
 *
 * Register as a validator on-chain
 */
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig } from "../lib/config.js";
import { initStarknet, getSageBalance, registerValidator, waitForTransaction, isActiveValidator, } from "../lib/starknet.js";
export async function registerCommand(options) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                   Register as Validator"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    const config = loadConfig();
    if (!config.wallet.address) {
        console.log(chalk.red("Error: Wallet not configured"));
        console.log(chalk.dim("Run 'bitsage init' first to set up your wallet"));
        process.exit(1);
    }
    // Prompt for private key if not in environment
    let privateKey = process.env.VALIDATOR_PRIVATE_KEY;
    if (!privateKey) {
        const answer = await inquirer.prompt([
            {
                type: "password",
                name: "privateKey",
                message: "Enter your private key:",
                mask: "*",
            },
        ]);
        privateKey = answer.privateKey;
    }
    const spinner = ora("Connecting to Starknet...").start();
    try {
        const client = initStarknet(privateKey);
        if (!client.account) {
            spinner.fail("Failed to initialize account");
            process.exit(1);
        }
        // Check if already registered
        spinner.text = "Checking registration status...";
        const isRegistered = await isActiveValidator(client, config.wallet.address);
        if (isRegistered) {
            spinner.info("You are already registered as a validator");
            console.log(chalk.dim("Use 'bitsage stake add <amount>' to increase your stake"));
            return;
        }
        // Check balance
        spinner.text = "Checking SAGE balance...";
        const balance = await getSageBalance(client, config.wallet.address);
        const balanceInSage = Number(balance) / 1e18;
        const stakeAmount = BigInt(parseInt(options.stake, 10)) * BigInt(1e18);
        const stakeInSage = parseInt(options.stake, 10);
        spinner.stop();
        console.log(chalk.dim(`  Wallet: ${config.wallet.address}`));
        console.log(chalk.dim(`  Balance: ${balanceInSage.toLocaleString()} SAGE`));
        console.log(chalk.dim(`  Stake: ${stakeInSage.toLocaleString()} SAGE`));
        console.log(chalk.dim(`  Commission: ${parseInt(options.commission, 10) / 100}%`));
        console.log("");
        if (balance < stakeAmount) {
            console.log(chalk.red(`Insufficient balance. You need ${stakeInSage} SAGE but have ${balanceInSage.toFixed(2)} SAGE`));
            console.log(chalk.dim("Use 'bitsage faucet' to claim testnet tokens"));
            process.exit(1);
        }
        // Confirm registration
        const confirm = await inquirer.prompt([
            {
                type: "confirm",
                name: "proceed",
                message: `Register as validator with ${stakeInSage} SAGE stake?`,
                default: true,
            },
        ]);
        if (!confirm.proceed) {
            console.log(chalk.yellow("Registration cancelled"));
            return;
        }
        // Execute registration
        const regSpinner = ora("Submitting registration transaction...").start();
        const txHash = await registerValidator(client, stakeAmount, parseInt(options.commission, 10), config.validator.attestationHash || "0");
        regSpinner.text = `Transaction submitted: ${txHash.slice(0, 20)}...`;
        // Wait for confirmation
        regSpinner.text = "Waiting for confirmation...";
        const success = await waitForTransaction(client, txHash);
        if (success) {
            regSpinner.succeed("On-chain registration successful!");
            // Register with coordinator (non-blocking — coordinator may not be running)
            const coordinatorPort = config.services?.coordinator?.port || 8080;
            const coordinatorUrl = `http://localhost:${coordinatorPort}`;
            try {
                const gpuModule = await import("./gpu.js");
                const gpuInfo = await gpuModule.detectGPU();
                const regResponse = await fetch(`${coordinatorUrl}/api/workers/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        worker_id: config.wallet.address,
                        owner_wallet: config.wallet.address,
                        gpu_model: gpuInfo.name,
                        gpu_backend: gpuInfo.type,
                        vram_gb: gpuInfo.vramGb,
                        capacity: 1,
                    }),
                });
                if (regResponse.ok) {
                    console.log(chalk.green("  ✓ Registered with coordinator"));
                }
            }
            catch {
                // Coordinator not running — that's fine, will register on next start
            }
            console.log("");
            console.log(chalk.green("  ✓ You are now registered as a validator"));
            console.log(chalk.dim(`    Transaction: ${txHash}`));
            console.log("");
            console.log(chalk.bold("Next steps:"));
            console.log(`  ${chalk.cyan("bitsage start")}    - Start your validator node`);
            console.log(`  ${chalk.cyan("bitsage status")}   - Check your validator status`);
        }
        else {
            regSpinner.fail("Transaction failed");
            console.log(chalk.red(`Transaction hash: ${txHash}`));
        }
    }
    catch (error) {
        spinner.fail("Registration failed");
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
//# sourceMappingURL=register.js.map