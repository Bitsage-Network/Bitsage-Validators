/**
 * Privacy Pool Commands
 *
 * Manage privacy pool operations:
 * - Deposit (wrap) tokens for privacy
 * - Withdraw with ZK proofs
 * - Check privacy balance
 * - Manage association sets
 */

import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig, getContractAddresses } from "../lib/config.js";
import { initStarknet, getSageBalance, waitForTransaction } from "../lib/starknet.js";
import { Account, CallData, RpcProvider, Contract } from "starknet";

const DENOMINATIONS = [10, 100, 1000] as const;
type Denomination = typeof DENOMINATIONS[number];

interface PrivacyNote {
  commitment: string;
  nullifier: string;
  amount: bigint;
  timestamp: number;
  spent: boolean;
}

export async function privacyCommand(
  subcommand: string,
  args: string[],
  options: Record<string, unknown>
): Promise<void> {
  switch (subcommand) {
    case "deposit":
      await handleDeposit(args[0], options);
      break;
    case "withdraw":
      await handleWithdraw(args[0], options);
      break;
    case "balance":
      await handleBalance(options);
      break;
    case "notes":
      await handleNotes(options);
      break;
    case "sets":
      await handleSets(options);
      break;
    default:
      showPrivacyHelp();
  }
}

function showPrivacyHelp(): void {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                    Privacy Pool Commands"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");
  console.log("Usage: bitsage privacy <command> [options]");
  console.log("");
  console.log(chalk.yellow("Commands:"));
  console.log(`  ${chalk.cyan("deposit <amount>")}   Deposit SAGE into privacy pool`);
  console.log(`  ${chalk.cyan("withdraw <index>")}   Withdraw from privacy pool`);
  console.log(`  ${chalk.cyan("balance")}            Show privacy pool balance`);
  console.log(`  ${chalk.cyan("notes")}              List your privacy notes`);
  console.log(`  ${chalk.cyan("sets")}               List association sets`);
  console.log("");
  console.log(chalk.yellow("Options:"));
  console.log("  --denomination <n>   Fixed denomination (10, 100, 1000 SAGE)");
  console.log("  --compliance <n>     Compliance level (0=full, 1=association, 2=auditable)");
  console.log("  --set <id>           Association set ID for withdrawal");
  console.log("");
  console.log(chalk.yellow("Examples:"));
  console.log("  bitsage privacy deposit 100");
  console.log("  bitsage privacy withdraw 0 --set 0x1");
  console.log("  bitsage privacy balance");
  console.log("");
}

async function handleDeposit(
  amountArg: string | undefined,
  options: Record<string, unknown>
): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                  Privacy Pool Deposit"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();
  const addresses = getContractAddresses(config.network);

  if (!config.wallet.address) {
    console.log(chalk.red("Error: Wallet not configured"));
    console.log(chalk.dim("Run 'bitsage init' first"));
    process.exit(1);
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

    // Check balance
    spinner.text = "Checking SAGE balance...";
    const balance = await getSageBalance(client, config.wallet.address);
    const balanceInSage = Number(balance) / 1e18;

    spinner.stop();

    console.log(chalk.dim(`  Wallet: ${config.wallet.address}`));
    console.log(chalk.dim(`  Balance: ${balanceInSage.toLocaleString()} SAGE`));
    console.log("");

    // Select denomination
    let denomination: Denomination;
    if (amountArg && DENOMINATIONS.includes(parseInt(amountArg) as Denomination)) {
      denomination = parseInt(amountArg) as Denomination;
    } else {
      const answer = await inquirer.prompt([
        {
          type: "list",
          name: "denomination",
          message: "Select deposit denomination:",
          choices: DENOMINATIONS.map(d => ({
            name: `${d} SAGE`,
            value: d,
          })),
        },
      ]);
      denomination = answer.denomination;
    }

    const depositAmount = BigInt(denomination) * BigInt(1e18);

    if (balance < depositAmount) {
      console.log(chalk.red(`Insufficient balance. Need ${denomination} SAGE`));
      process.exit(1);
    }

    // Generate commitment
    console.log("");
    console.log(chalk.yellow("Generating privacy commitment..."));

    const commitment = generateCommitment(denomination);
    const nullifierSecret = generateNullifierSecret();

    console.log(chalk.dim(`  Commitment: ${commitment.slice(0, 20)}...`));
    console.log("");

    // Confirm
    const confirm = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: `Deposit ${denomination} SAGE to privacy pool?`,
        default: true,
      },
    ]);

    if (!confirm.proceed) {
      console.log(chalk.yellow("Cancelled"));
      return;
    }

    // Execute deposit
    const txSpinner = ora("Submitting deposit transaction...").start();

    const txHash = await executeDeposit(
      client.account,
      addresses,
      depositAmount,
      commitment
    );

    txSpinner.text = "Waiting for confirmation...";
    const success = await waitForTransaction(client, txHash);

    if (success) {
      txSpinner.succeed("Deposit successful!");

      // Save privacy note locally
      const note: PrivacyNote = {
        commitment,
        nullifier: nullifierSecret,
        amount: depositAmount,
        timestamp: Date.now(),
        spent: false,
      };

      savePrivacyNote(note);

      console.log("");
      console.log(chalk.green("  ✓ Funds deposited to privacy pool"));
      console.log(chalk.dim(`    Transaction: ${txHash}`));
      console.log("");
      console.log(chalk.yellow("IMPORTANT: Your privacy note has been saved locally."));
      console.log(chalk.yellow("Back up ~/.bitsage/privacy-notes.json to recover funds."));
    } else {
      txSpinner.fail("Deposit failed");
    }
  } catch (error) {
    spinner.fail("Deposit failed");
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function handleWithdraw(
  indexArg: string | undefined,
  options: Record<string, unknown>
): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                  Privacy Pool Withdrawal"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();

  if (!config.wallet.address) {
    console.log(chalk.red("Error: Wallet not configured"));
    process.exit(1);
  }

  // Load privacy notes
  const notes = loadPrivacyNotes();
  const spendableNotes = notes.filter(n => !n.spent);

  if (spendableNotes.length === 0) {
    console.log(chalk.yellow("No spendable privacy notes found"));
    console.log(chalk.dim("Deposit funds first with 'bitsage privacy deposit'"));
    return;
  }

  console.log(chalk.yellow("Spendable Notes:"));
  spendableNotes.forEach((note, i) => {
    const amount = Number(note.amount) / 1e18;
    const date = new Date(note.timestamp).toLocaleString();
    console.log(chalk.dim(`  [${i}] ${amount} SAGE - ${date}`));
  });
  console.log("");

  // Select note
  let noteIndex: number;
  if (indexArg !== undefined) {
    noteIndex = parseInt(indexArg);
  } else {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "index",
        message: "Note index to withdraw:",
        default: "0",
        validate: (input: string) => {
          const idx = parseInt(input);
          if (isNaN(idx) || idx < 0 || idx >= spendableNotes.length) {
            return `Please enter a number between 0 and ${spendableNotes.length - 1}`;
          }
          return true;
        },
      },
    ]);
    noteIndex = parseInt(answer.index);
  }

  const selectedNote = spendableNotes[noteIndex];
  const amount = Number(selectedNote.amount) / 1e18;

  // Compliance level
  const compliance = await inquirer.prompt([
    {
      type: "list",
      name: "level",
      message: "Compliance level:",
      choices: [
        { name: "Full Privacy (no association proof)", value: 0 },
        { name: "Association Set (prove ASP membership)", value: 1 },
        { name: "Auditable (with audit key)", value: 2 },
      ],
    },
  ]);

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

  const spinner = ora("Generating withdrawal proof...").start();

  try {
    const client = initStarknet(privateKey);
    const addresses = getContractAddresses(config.network);

    // Request proof from coordinator (TEE-assisted)
    spinner.text = "Requesting proof from TEE worker...";

    const proof = await requestWithdrawalProof(
      config,
      selectedNote,
      config.wallet.address,
      compliance.level
    );

    spinner.text = "Submitting withdrawal transaction...";

    // Execute withdrawal
    const txHash = await executeWithdrawal(
      client.account!,
      addresses,
      proof,
      config.wallet.address
    );

    spinner.text = "Waiting for confirmation...";
    const success = await waitForTransaction(client, txHash);

    if (success) {
      spinner.succeed("Withdrawal successful!");

      // Mark note as spent
      markNoteSpent(selectedNote.commitment);

      console.log("");
      console.log(chalk.green(`  ✓ Withdrew ${amount} SAGE`));
      console.log(chalk.dim(`    Transaction: ${txHash}`));
    } else {
      spinner.fail("Withdrawal failed");
    }
  } catch (error) {
    spinner.fail("Withdrawal failed");
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

async function handleBalance(options: Record<string, unknown>): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                    Privacy Pool Balance"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const config = loadConfig();

  if (!config.wallet.address) {
    console.log(chalk.red("Error: Wallet not configured"));
    return;
  }

  const spinner = ora("Loading balances...").start();

  try {
    const client = initStarknet();

    // Public balance
    const publicBalance = await getSageBalance(client, config.wallet.address);
    const publicSage = Number(publicBalance) / 1e18;

    // Private balance (from local notes)
    const notes = loadPrivacyNotes();
    const privateBalance = notes
      .filter(n => !n.spent)
      .reduce((sum, n) => sum + n.amount, 0n);
    const privateSage = Number(privateBalance) / 1e18;

    spinner.stop();

    console.log(chalk.dim(`  Wallet: ${config.wallet.address}`));
    console.log("");
    console.log(`  ${chalk.cyan("Public Balance:")}  ${publicSage.toLocaleString()} SAGE`);
    console.log(`  ${chalk.green("Private Balance:")} ${privateSage.toLocaleString()} SAGE`);
    console.log(`  ${chalk.yellow("Total:")}           ${(publicSage + privateSage).toLocaleString()} SAGE`);
    console.log("");

    if (privateBalance > 0n) {
      console.log(chalk.dim("Use 'bitsage privacy notes' to see individual deposits"));
    }
  } catch (error) {
    spinner.fail("Failed to load balance");
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function handleNotes(options: Record<string, unknown>): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                      Privacy Notes"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const notes = loadPrivacyNotes();

  if (notes.length === 0) {
    console.log(chalk.yellow("No privacy notes found"));
    console.log(chalk.dim("Deposit funds with 'bitsage privacy deposit'"));
    return;
  }

  console.log(chalk.yellow("Index  Amount       Status    Date"));
  console.log(chalk.dim("─────  ───────────  ────────  ────────────────────"));

  notes.forEach((note, i) => {
    const amount = (Number(note.amount) / 1e18).toLocaleString().padEnd(11);
    const status = note.spent ? chalk.red("Spent") : chalk.green("Ready");
    const date = new Date(note.timestamp).toLocaleDateString();

    console.log(`  ${i.toString().padEnd(4)}  ${amount}  ${status.padEnd(16)}  ${date}`);
  });

  console.log("");

  const spendable = notes.filter(n => !n.spent);
  const total = spendable.reduce((sum, n) => sum + n.amount, 0n);
  console.log(chalk.dim(`Total spendable: ${Number(total) / 1e18} SAGE (${spendable.length} notes)`));
  console.log("");
}

async function handleSets(options: Record<string, unknown>): Promise<void> {
  console.log("");
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold("                    Association Sets"));
  console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Known association sets
  const sets = [
    { id: "0x1", name: "Default Inclusion Set", members: 1234 },
    { id: "0x2", name: "Verified Users Set", members: 456 },
    { id: "0x3", name: "High-Trust Set", members: 89 },
  ];

  console.log(chalk.yellow("ID     Name                    Members"));
  console.log(chalk.dim("─────  ──────────────────────  ───────"));

  sets.forEach(set => {
    console.log(`  ${set.id.padEnd(4)}  ${set.name.padEnd(22)}  ${set.members}`);
  });

  console.log("");
  console.log(chalk.dim("Join an ASP set to use Association compliance level"));
  console.log("");
}

// Helper functions

function generateCommitment(amount: number): string {
  const crypto = require("crypto");
  const data = Buffer.concat([
    Buffer.from(amount.toString()),
    crypto.randomBytes(32),
  ]);
  return "0x" + crypto.createHash("sha256").update(data).digest("hex");
}

function generateNullifierSecret(): string {
  const crypto = require("crypto");
  return "0x" + crypto.randomBytes(32).toString("hex");
}

function loadPrivacyNotes(): PrivacyNote[] {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const notesPath = path.join(os.homedir(), ".bitsage", "privacy-notes.json");

  if (!fs.existsSync(notesPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(notesPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function savePrivacyNote(note: PrivacyNote): void {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const configDir = path.join(os.homedir(), ".bitsage");
  const notesPath = path.join(configDir, "privacy-notes.json");

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  const notes = loadPrivacyNotes();
  notes.push(note);

  fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2), { mode: 0o600 });
}

function markNoteSpent(commitment: string): void {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const notesPath = path.join(os.homedir(), ".bitsage", "privacy-notes.json");
  const notes = loadPrivacyNotes();

  const updated = notes.map(n =>
    n.commitment === commitment ? { ...n, spent: true } : n
  );

  fs.writeFileSync(notesPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
}

async function executeDeposit(
  account: Account,
  addresses: Record<string, string>,
  amount: bigint,
  commitment: string
): Promise<string> {
  const { low, high } = bigIntToUint256(amount);

  const result = await account.execute([
    // Approve
    {
      contractAddress: addresses.SAGE_TOKEN,
      entrypoint: "approve",
      calldata: CallData.compile({
        spender: addresses.PRIVACY_POOLS || "0x0",
        amount: { low, high },
      }),
    },
    // Deposit
    {
      contractAddress: addresses.PRIVACY_POOLS || "0x0",
      entrypoint: "pp_deposit",
      calldata: CallData.compile({
        token: addresses.SAGE_TOKEN,
        amount: { low, high },
        commitment,
      }),
    },
  ]);

  return result.transaction_hash;
}

async function requestWithdrawalProof(
  config: ReturnType<typeof loadConfig>,
  note: PrivacyNote,
  recipient: string,
  complianceLevel: number
): Promise<string> {
  // Request proof from coordinator TEE worker
  const coordinatorUrl = process.env.COORDINATOR_URL || "http://localhost:8080";

  const response = await fetch(`${coordinatorUrl}/api/jobs/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      circuit_type: "PrivacyWithdraw",
      encrypted_witness: {
        commitment: note.commitment,
        nullifier: note.nullifier,
        amount: note.amount.toString(),
        recipient,
        compliance_level: complianceLevel,
      },
      deadline: Date.now() + 60000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Proof request failed: ${await response.text()}`);
  }

  const result = (await response.json()) as { proof: string };
  return result.proof;
}

async function executeWithdrawal(
  account: Account,
  addresses: Record<string, string>,
  proof: string,
  recipient: string
): Promise<string> {
  const result = await account.execute({
    contractAddress: addresses.PRIVACY_POOLS || "0x0",
    entrypoint: "pp_withdraw",
    calldata: CallData.compile({
      withdrawal_proof: proof,
    }),
  });

  return result.transaction_hash;
}

function bigIntToUint256(value: bigint): { low: string; high: string } {
  const mask = (1n << 128n) - 1n;
  return {
    low: (value & mask).toString(),
    high: (value >> 128n).toString(),
  };
}
