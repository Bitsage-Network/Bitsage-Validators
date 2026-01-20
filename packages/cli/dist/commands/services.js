/**
 * Services Commands
 *
 * Start and stop validator services via Docker Compose
 */
import chalk from "chalk";
import ora from "ora";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
function getDeployDir() {
    // Try to find deploy directory relative to current working directory
    const cwdDeploy = path.join(process.cwd(), "deploy");
    if (fs.existsSync(cwdDeploy)) {
        return cwdDeploy;
    }
    // Try parent directory
    const parentDeploy = path.join(process.cwd(), "..", "deploy");
    if (fs.existsSync(parentDeploy)) {
        return parentDeploy;
    }
    // Default to cwd/deploy
    return cwdDeploy;
}
export async function startCommand(options) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                Starting Validator Services"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    const deployDir = getDeployDir();
    // Check if deploy directory exists
    if (!fs.existsSync(deployDir)) {
        console.log(chalk.red("Error: Deploy directory not found"));
        console.log(chalk.dim(`Expected: ${deployDir}`));
        console.log(chalk.dim("Make sure you're in the BitSage-Validator project root"));
        process.exit(1);
    }
    // Check if docker-compose.yml exists
    const composePath = path.join(deployDir, "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
        console.log(chalk.red("Error: docker-compose.yml not found"));
        console.log(chalk.dim("Run the deployment setup first"));
        process.exit(1);
    }
    // Check if .env exists
    const envPath = path.join(deployDir, ".env");
    if (!fs.existsSync(envPath)) {
        console.log(chalk.yellow("Warning: .env file not found"));
        console.log(chalk.dim("Copying from .env.template..."));
        const templatePath = path.join(deployDir, ".env.template");
        if (fs.existsSync(templatePath)) {
            fs.copyFileSync(templatePath, envPath);
            console.log(chalk.green("  ✓ Created .env from template"));
            console.log(chalk.dim("  Please edit the .env file with your configuration"));
        }
        else {
            console.log(chalk.red("Error: .env.template not found"));
            process.exit(1);
        }
    }
    // Build docker compose command
    const args = ["compose"];
    // Add monitoring profile if requested
    if (options.monitoring) {
        args.push("--profile", "monitoring");
    }
    args.push("up");
    // Detached mode unless foreground requested
    if (!options.foreground) {
        args.push("-d");
    }
    // Specify services if GPU disabled
    if (options.gpu === false) {
        args.push("coordinator", "dashboard");
    }
    console.log(chalk.dim(`  Deploy directory: ${deployDir}`));
    console.log(chalk.dim(`  Command: docker ${args.join(" ")}`));
    console.log("");
    const spinner = ora("Starting services...").start();
    return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
            cwd: deployDir,
            stdio: options.foreground ? "inherit" : "pipe",
        });
        let stdout = "";
        let stderr = "";
        if (!options.foreground) {
            child.stdout?.on("data", (data) => {
                stdout += data.toString();
            });
            child.stderr?.on("data", (data) => {
                stderr += data.toString();
            });
        }
        child.on("close", (code) => {
            if (code === 0) {
                spinner.succeed("Services started successfully");
                console.log("");
                if (!options.foreground) {
                    console.log(chalk.green("Services running in background:"));
                    console.log(chalk.dim("  - coordinator: http://localhost:3030"));
                    console.log(chalk.dim("  - dashboard:   http://localhost:3000"));
                    if (options.gpu !== false) {
                        console.log(chalk.dim("  - gpu-worker:  running"));
                    }
                    if (options.monitoring) {
                        console.log(chalk.dim("  - prometheus:  http://localhost:9090"));
                        console.log(chalk.dim("  - grafana:     http://localhost:3001"));
                    }
                    console.log("");
                    console.log(chalk.bold("Useful commands:"));
                    console.log(`  ${chalk.cyan("bitsage logs -f")}      - Follow logs`);
                    console.log(`  ${chalk.cyan("bitsage status")}       - Check status`);
                    console.log(`  ${chalk.cyan("bitsage health")}       - Health check`);
                    console.log(`  ${chalk.cyan("bitsage stop")}         - Stop services`);
                }
                resolve();
            }
            else {
                spinner.fail("Failed to start services");
                if (stderr) {
                    console.log(chalk.red(stderr));
                }
                reject(new Error(`Docker compose exited with code ${code}`));
            }
        });
        child.on("error", (err) => {
            spinner.fail("Failed to start Docker");
            console.log(chalk.red(`Error: ${err.message}`));
            console.log(chalk.dim("Make sure Docker is installed and running"));
            reject(err);
        });
    });
}
export async function stopCommand(options) {
    console.log("");
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold("                Stopping Validator Services"));
    console.log(chalk.blue("═══════════════════════════════════════════════════════════════"));
    console.log("");
    const deployDir = getDeployDir();
    if (!fs.existsSync(deployDir)) {
        console.log(chalk.yellow("Deploy directory not found, nothing to stop"));
        return;
    }
    // Build command
    const args = ["compose", "--profile", "monitoring", "down"];
    if (options.volumes) {
        console.log(chalk.yellow("Warning: Removing all data volumes"));
        args.push("-v");
    }
    console.log(chalk.dim(`  Deploy directory: ${deployDir}`));
    console.log("");
    const spinner = ora("Stopping services...").start();
    return new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
            cwd: deployDir,
            stdio: "pipe",
        });
        let stderr = "";
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("close", (code) => {
            if (code === 0) {
                spinner.succeed("All services stopped");
                if (options.volumes) {
                    console.log(chalk.dim("  Data volumes removed"));
                }
                resolve();
            }
            else {
                spinner.fail("Failed to stop services");
                if (stderr) {
                    console.log(chalk.red(stderr));
                }
                reject(new Error(`Docker compose exited with code ${code}`));
            }
        });
        child.on("error", (err) => {
            spinner.fail("Failed to run Docker");
            console.log(chalk.red(`Error: ${err.message}`));
            reject(err);
        });
    });
}
//# sourceMappingURL=services.js.map