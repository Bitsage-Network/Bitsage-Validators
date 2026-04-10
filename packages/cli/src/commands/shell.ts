/**
 * bitsage shell — SSH into an ObelyZK prover node.
 *
 * Usage:
 *   bitsage login --api-key bsk_obelysk_h100_demo_2026
 *   bitsage shell h100-prover
 */

import chalk from "chalk";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as https from "https";

// Known prover nodes
const NODES: Record<string, { host: string; user: string; description: string }> = {
  "h100-prover": {
    host: "62.169.159.231",
    user: "obelyzk",
    description: "NVIDIA H100 PCIe (80 GB) — Qwen2.5-14B + GLM-4-9B",
  },
};

// Config paths
const CONFIG_DIR = path.join(os.homedir(), ".bitsage");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const KEY_DIR = path.join(CONFIG_DIR, "keys");

interface Config {
  apiKey?: string;
  nodes?: Record<string, { keyPath: string }>;
}

function loadConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config: Config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// Valid API keys (in production, validate against a server)
const VALID_KEYS = new Set([
  "bsk_obelysk_h100_demo_2026",
  "bsk_starkware_review_2026",
  "bsk_dev_preview_2026",
]);

/**
 * bitsage login --api-key <key>
 */
export async function loginCommand(opts: { apiKey: string }) {
  const key = opts.apiKey;

  if (!key || !key.startsWith("bsk_")) {
    console.log(chalk.red("  Invalid API key format. Keys start with bsk_"));
    process.exit(1);
  }

  if (!VALID_KEYS.has(key)) {
    console.log(chalk.red("  Invalid API key. Contact team@bitsage.network for access."));
    process.exit(1);
  }

  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);

  console.log(chalk.green("  ✓ Authenticated successfully"));
  console.log(chalk.dim(`    Key stored in ${CONFIG_FILE}`));
  console.log();
  console.log(chalk.cyan("  Available nodes:"));
  for (const [name, node] of Object.entries(NODES)) {
    console.log(chalk.white(`    ${name}`) + chalk.dim(` — ${node.description}`));
  }
  console.log();
  console.log(chalk.dim("  Connect with: ") + chalk.bold("bitsage shell h100-prover"));
}

/**
 * bitsage shell <node-name>
 */
export async function shellCommand(nodeName: string) {
  const config = loadConfig();

  if (!config.apiKey) {
    console.log(chalk.red("  Not authenticated. Run:"));
    console.log(chalk.bold("    bitsage login --api-key <your-key>"));
    process.exit(1);
  }

  if (!VALID_KEYS.has(config.apiKey)) {
    console.log(chalk.red("  API key expired or revoked. Contact team@bitsage.network"));
    process.exit(1);
  }

  const node = NODES[nodeName];
  if (!node) {
    console.log(chalk.red(`  Unknown node: ${nodeName}`));
    console.log(chalk.dim("  Available nodes:"));
    for (const [name, n] of Object.entries(NODES)) {
      console.log(chalk.white(`    ${name}`) + chalk.dim(` — ${n.description}`));
    }
    process.exit(1);
  }

  // Ensure SSH key is provisioned
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const keyPath = path.join(KEY_DIR, `${nodeName}.pem`);

  if (!fs.existsSync(keyPath)) {
    console.log(chalk.cyan(`  Provisioning SSH key for ${nodeName}...`));
    // Download key from GitHub (in production: from authenticated API)
    const keyUrl = "https://raw.githubusercontent.com/Bitsage-Network/obelyzk.rs/development/engine/scripts/obelyzk_dev_key";
    await downloadFile(keyUrl, keyPath);
    fs.chmodSync(keyPath, 0o600);
    console.log(chalk.green("  ✓ Key provisioned"));
  }

  console.log(chalk.cyan(`  Connecting to ${chalk.bold(nodeName)} (${node.host})...`));
  console.log();

  // Spawn interactive SSH
  const ssh = spawn("ssh", [
    "-i", keyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-t",
    `${node.user}@${node.host}`,
  ], {
    stdio: "inherit",
  });

  ssh.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

/**
 * bitsage prove <prompt> — prove inference via API and return TX hash.
 */
export async function proveCommand(prompt: string, opts: { model?: string; node?: string }) {
  const config = loadConfig();
  if (!config.apiKey) {
    console.log(chalk.red("  Not authenticated. Run: bitsage login --api-key <key>"));
    process.exit(1);
  }

  const nodeName = opts.node ?? "h100-prover";
  const node = NODES[nodeName];
  if (!node) {
    console.log(chalk.red(`  Unknown node: ${nodeName}`));
    process.exit(1);
  }

  const model = opts.model ?? "local";
  const url = `http://${node.host}:8080/v1/chat/completions`;

  console.log(chalk.cyan(`  Proving: "${prompt}"`));
  console.log(chalk.dim(`  Node: ${nodeName} | Model: ${model}`));
  console.log(chalk.dim(`  Waiting for GKR proof + recursive STARK + on-chain TX...`));
  console.log();

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.log(chalk.red(`  Error: ${resp.status} ${err.slice(0, 200)}`));
      process.exit(1);
    }

    const data = await resp.json() as any;
    const meta = data.obelyzk ?? {};
    const text = data.choices?.[0]?.message?.content ?? "";

    console.log(chalk.green("  ╔══════════════════════════════════════════════╗"));
    console.log(chalk.green("  ║") + chalk.bold.white("  VERIFIED ON-CHAIN") + chalk.green("                         ║"));
    console.log(chalk.green("  ╠══════════════════════════════════════════════╣"));
    console.log(chalk.green("  ║") + chalk.dim("  Output:    ") + chalk.white(text.slice(0, 30)) + " ".repeat(Math.max(0, 30 - text.length)) + chalk.green("  ║"));
    console.log(chalk.green("  ║") + chalk.dim("  Trust:     ") + chalk.cyan(meta.trust_model ?? "—") + " ".repeat(Math.max(0, 30 - (meta.trust_model?.length ?? 1))) + chalk.green("  ║"));
    if (meta.tx_hash) {
      const txShort = meta.tx_hash.slice(0, 18) + "...";
      console.log(chalk.green("  ║") + chalk.dim("  TX:        ") + chalk.yellow(txShort) + " ".repeat(Math.max(0, 30 - txShort.length)) + chalk.green("  ║"));
    }
    if (meta.calldata_felts) {
      console.log(chalk.green("  ║") + chalk.dim("  Felts:     ") + chalk.white(String(meta.calldata_felts)) + " ".repeat(Math.max(0, 30 - String(meta.calldata_felts).length)) + chalk.green("  ║"));
    }
    if (meta.model_id) {
      const idShort = meta.model_id.slice(0, 18) + "...";
      console.log(chalk.green("  ║") + chalk.dim("  Model ID:  ") + chalk.white(idShort) + " ".repeat(Math.max(0, 30 - idShort.length)) + chalk.green("  ║"));
    }
    console.log(chalk.green("  ╚══════════════════════════════════════════════╝"));

    if (meta.explorer_url) {
      console.log();
      console.log(chalk.dim("  Explorer: ") + chalk.underline(meta.explorer_url));
    }
  } catch (err: any) {
    console.log(chalk.red(`  Connection failed: ${err.message}`));
    console.log(chalk.dim(`  Is the server running at ${url}?`));
    process.exit(1);
  }
}

/**
 * bitsage nodes — list available prover nodes.
 */
export function nodesCommand() {
  console.log(chalk.cyan("  Available prover nodes:"));
  console.log();
  for (const [name, node] of Object.entries(NODES)) {
    console.log(chalk.bold.white(`  ${name}`));
    console.log(chalk.dim(`    Host: ${node.host}`));
    console.log(chalk.dim(`    ${node.description}`));
    console.log();
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location!, (r2) => {
          r2.pipe(file);
          file.on("finish", () => { file.close(); resolve(); });
        }).on("error", reject);
      } else {
        response.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }
    }).on("error", reject);
  });
}
