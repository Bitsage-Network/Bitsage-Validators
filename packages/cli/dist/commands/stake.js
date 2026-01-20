/**
 * Stake Command
 *
 * Manage validator stake (add, remove, info)
 */
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig } from "../lib/config.js";
import { initStarknet, getSageBalance, addStake, removeStake, getValidatorInfo, waitForTransaction, } from "../lib/starknet.js";
export async function stakeCommand(action, amount) {
    const config = loadConfig();
    if (!config.wallet.address) {
        console.log(chalk.red("Error: Wallet not configured"));
        console.log(chalk.dim("Run 'bitsage init' first"));
        process.exit(1);
    }
    switch (action) {
        case "add":
            await handleAddStake(config.wallet.address, amount);
            break;
        case "remove":
            await handleRemoveStake(config.wallet.address, amount);
            break;
        case "info":
            await handleStakeInfo(config.wallet.address);
            break;
        default:
            console.log(chalk.red(`Unknown action: ${action}`));
            console.log(chalk.dim("Usage: bitsage stake <add|remove|info> [amount]"));
            process.exit(1);
    }
}
async function handleAddStake(address, amountArg) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                      Add Stake"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
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
        // Get current balance
        spinner.text = "Checking balance...";
        const balance = await getSageBalance(client, address);
        const balanceInSage = Number(balance) / 1e18;
        spinner.stop();
        console.log(chalk.dim(`  Available balance: ${balanceInSage.toLocaleString()} SAGE`));
        console.log("");
        // Get amount to stake
        let amount;
        if (amountArg) {
            amount = parseInt(amountArg, 10);
        }
        else {
            const answer = await inquirer.prompt([
                {
                    type: "input",
                    name: "amount",
                    message: "Amount to stake (SAGE):",
                    validate: (input) => {
                        const num = parseInt(input, 10);
                        if (isNaN(num) || num <= 0) {
                            return "Please enter a valid amount";
                        }
                        if (num > balanceInSage) {
                            return `Insufficient balance (max: ${balanceInSage.toFixed(2)} SAGE)`;
                        }
                        return true;
                    },
                },
            ]);
            amount = parseInt(answer.amount, 10);
        }
        const stakeAmount = BigInt(amount) * BigInt(1e18);
        if (balance < stakeAmount) {
            console.log(chalk.red("Insufficient balance"));
            process.exit(1);
        }
        // Confirm
        const confirm = await inquirer.prompt([
            {
                type: "confirm",
                name: "proceed",
                message: `Add ${amount} SAGE to your stake?`,
                default: true,
            },
        ]);
        if (!confirm.proceed) {
            console.log(chalk.yellow("Cancelled"));
            return;
        }
        // Execute
        const txSpinner = ora("Submitting transaction...").start();
        const txHash = await addStake(client, stakeAmount);
        txSpinner.text = "Waiting for confirmation...";
        const success = await waitForTransaction(client, txHash);
        if (success) {
            txSpinner.succeed(`Added ${amount} SAGE to stake`);
            console.log(chalk.dim(`  Transaction: ${txHash}`));
        }
        else {
            txSpinner.fail("Transaction failed");
        }
    }
    catch (error) {
        spinner.fail("Failed to add stake");
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
async function handleRemoveStake(address, amountArg) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                     Remove Stake"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
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
        // Get validator info
        spinner.text = "Fetching validator info...";
        const validatorInfo = await getValidatorInfo(client, address);
        spinner.stop();
        if (!validatorInfo) {
            console.log(chalk.red("You are not registered as a validator"));
            process.exit(1);
        }
        const selfStake = validatorInfo.self_stake;
        const currentStake = BigInt(selfStake?.low || 0) + (BigInt(selfStake?.high || 0) << 128n);
        const currentStakeInSage = Number(currentStake) / 1e18;
        const minStake = 1000;
        console.log(chalk.dim(`  Current stake: ${currentStakeInSage.toLocaleString()} SAGE`));
        console.log(chalk.dim(`  Minimum stake: ${minStake} SAGE`));
        console.log("");
        // Get amount to remove
        let amount;
        if (amountArg) {
            amount = parseInt(amountArg, 10);
        }
        else {
            const maxRemovable = Math.max(0, currentStakeInSage - minStake);
            const answer = await inquirer.prompt([
                {
                    type: "input",
                    name: "amount",
                    message: `Amount to remove (max ${maxRemovable.toFixed(2)} SAGE):`,
                    validate: (input) => {
                        const num = parseInt(input, 10);
                        if (isNaN(num) || num <= 0) {
                            return "Please enter a valid amount";
                        }
                        if (num > maxRemovable) {
                            return `Cannot remove more than ${maxRemovable.toFixed(2)} SAGE`;
                        }
                        return true;
                    },
                },
            ]);
            amount = parseInt(answer.amount, 10);
        }
        const removeAmount = BigInt(amount) * BigInt(1e18);
        // Confirm
        const confirm = await inquirer.prompt([
            {
                type: "confirm",
                name: "proceed",
                message: `Remove ${amount} SAGE from your stake?`,
                default: false,
            },
        ]);
        if (!confirm.proceed) {
            console.log(chalk.yellow("Cancelled"));
            return;
        }
        // Execute
        const txSpinner = ora("Submitting transaction...").start();
        const txHash = await removeStake(client, removeAmount);
        txSpinner.text = "Waiting for confirmation...";
        const success = await waitForTransaction(client, txHash);
        if (success) {
            txSpinner.succeed(`Removed ${amount} SAGE from stake`);
            console.log(chalk.dim(`  Transaction: ${txHash}`));
        }
        else {
            txSpinner.fail("Transaction failed");
        }
    }
    catch (error) {
        spinner.fail("Failed to remove stake");
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
async function handleStakeInfo(address) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                      Stake Info"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    const spinner = ora("Fetching stake information...").start();
    try {
        const client = initStarknet();
        // Get balance
        const balance = await getSageBalance(client, address);
        const balanceInSage = Number(balance) / 1e18;
        // Get validator info
        const validatorInfo = await getValidatorInfo(client, address);
        spinner.stop();
        console.log(chalk.dim(`  Wallet: ${address}`));
        console.log(chalk.dim(`  Available Balance: ${balanceInSage.toLocaleString()} SAGE`));
        console.log("");
        if (validatorInfo) {
            const selfStake = validatorInfo.self_stake;
            const totalStake = validatorInfo.total_stake;
            const selfStakeAmount = BigInt(selfStake?.low || 0) + (BigInt(selfStake?.high || 0) << 128n);
            const totalStakeAmount = BigInt(totalStake?.low || 0) + (BigInt(totalStake?.high || 0) << 128n);
            const delegatedStake = totalStakeAmount - selfStakeAmount;
            console.log(chalk.green("  Validator Status: Registered"));
            console.log(chalk.dim(`  Self Stake:       ${(Number(selfStakeAmount) / 1e18).toLocaleString()} SAGE`));
            console.log(chalk.dim(`  Delegated Stake:  ${(Number(delegatedStake) / 1e18).toLocaleString()} SAGE`));
            console.log(chalk.dim(`  Total Stake:      ${(Number(totalStakeAmount) / 1e18).toLocaleString()} SAGE`));
            console.log(chalk.dim(`  Commission:       ${Number(validatorInfo.commission_bps || 0) / 100}%`));
        }
        else {
            console.log(chalk.yellow("  Validator Status: Not Registered"));
            console.log(chalk.dim("  Run 'bitsage register' to become a validator"));
        }
        console.log("");
    }
    catch (error) {
        spinner.fail("Failed to fetch stake info");
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
//# sourceMappingURL=stake.js.map