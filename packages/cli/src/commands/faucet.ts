/**
 * Faucet Command
 *
 * Claim testnet SAGE tokens
 */

import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig } from "../lib/config.js";
import {
  initStarknet,
  getSageBalance,
  claimFromFaucet,
  waitForTransaction,
} from "../lib/starknet.js";

interface FaucetOptions {
  amount: string;
}

export async function faucetCommand(options: FaucetOptions): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                   Claim Testnet Tokens"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();

  if (!config.wallet.address) {
    console.log(chalk.red("Error: Wallet not configured"));
    console.log(chalk.dim("Run 'bitsage init' first"));
    process.exit(1);
  }

  if (config.network !== "sepolia") {
    console.log(chalk.yellow("Warning: Faucet is only available on Sepolia testnet"));
    console.log(chalk.dim(`Current network: ${config.network}`));

    const confirm = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: "Continue anyway?",
        default: false,
      },
    ]);

    if (!confirm.proceed) {
      return;
    }
  }

  // Get private key
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

    // Check current balance
    spinner.text = "Checking current balance...";
    const balanceBefore = await getSageBalance(client, config.wallet.address);
    const balanceBeforeInSage = Number(balanceBefore) / 1e18;

    spinner.stop();

    console.log(chalk.dim(`  Wallet: ${config.wallet.address}`));
    console.log(chalk.dim(`  Current balance: ${balanceBeforeInSage.toLocaleString()} SAGE`));
    console.log("");

    // Claim tokens
    const claimSpinner = ora("Claiming tokens from faucet...").start();

    const txHash = await claimFromFaucet(client);
    claimSpinner.text = `Transaction submitted: ${txHash.slice(0, 20)}...`;

    // Wait for confirmation
    claimSpinner.text = "Waiting for confirmation...";
    const success = await waitForTransaction(client, txHash);

    if (success) {
      // Check new balance
      const balanceAfter = await getSageBalance(client, config.wallet.address);
      const balanceAfterInSage = Number(balanceAfter) / 1e18;
      const claimed = balanceAfterInSage - balanceBeforeInSage;

      claimSpinner.succeed("Tokens claimed successfully!");
      console.log("");
      console.log(chalk.green(`  ✓ Received: ${claimed.toLocaleString()} SAGE`));
      console.log(chalk.dim(`    New balance: ${balanceAfterInSage.toLocaleString()} SAGE`));
      console.log(chalk.dim(`    Transaction: ${txHash}`));
      console.log("");
      console.log(chalk.bold("Next steps:"));
      console.log(`  ${chalk.cyan("bitsage register")} - Register as a validator`);
    } else {
      claimSpinner.fail("Transaction failed");
      console.log(chalk.dim(`  Transaction: ${txHash}`));
      console.log("");
      console.log(chalk.yellow("This may happen if:"));
      console.log(chalk.dim("  - You've already claimed recently (cooldown period)"));
      console.log(chalk.dim("  - The faucet is out of funds"));
      console.log(chalk.dim("  - Network congestion"));
    }
  } catch (error) {
    spinner.fail("Failed to claim tokens");
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("cooldown") || errorMessage.includes("Cooldown")) {
      console.log(chalk.yellow("You must wait before claiming again"));
      console.log(chalk.dim("The faucet has a cooldown period between claims"));
    } else {
      console.log(chalk.red(`Error: ${errorMessage}`));
    }

    process.exit(1);
  }
}
