"use client";

import { useState } from "react";
import {
  Copy,
  CheckCircle2,
  Cpu,
  Key,
  Download,
  Zap,
  Coins,
  Shield,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const docsSections = [
  {
    id: "quickstart",
    title: "Quick Start",
    icon: Zap,
    description: "Get started in 5 minutes",
  },
  {
    id: "requirements",
    title: "Requirements",
    icon: Cpu,
    description: "Hardware & software requirements",
  },
  {
    id: "installation",
    title: "Installation",
    icon: Download,
    description: "Install the BitSage CLI",
  },
  {
    id: "registration",
    title: "Registration",
    icon: Key,
    description: "Register as a validator",
  },
  {
    id: "staking",
    title: "Staking",
    icon: Coins,
    description: "Stake SAGE tokens",
  },
  {
    id: "tee",
    title: "TEE Setup",
    icon: Shield,
    description: "Confidential compute",
  },
];

function CodeBlock({ code, id, copiedCommand, onCopy }: { code: string; id: string; copiedCommand: string | null; onCopy: (text: string, id: string) => void }) {
  return (
    <div className="relative group">
      <pre className="p-3 sm:p-4 rounded-xl bg-surface-dark border border-surface-border overflow-x-auto">
        <code className="text-xs sm:text-sm text-gray-300 font-mono">{code}</code>
      </pre>
      <button
        onClick={() => onCopy(code, id)}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 p-1.5 sm:p-2 rounded-lg bg-surface-elevated opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      >
        {copiedCommand === id ? (
          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
        )}
      </button>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quickstart");
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <div className="min-h-screen">
      {/* Mobile Section Selector */}
      <div className="lg:hidden px-4 sm:px-0 mb-4">
        <div className="glass-card p-3">
          <label className="block text-xs font-medium text-gray-400 mb-2">Jump to section</label>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="input-field w-full text-sm"
          >
            {docsSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Desktop Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden lg:block w-56 xl:w-64 flex-shrink-0"
        >
          <div className="sticky top-8 glass-card p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Documentation</h3>
            <nav className="space-y-1">
              {docsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                    activeSection === section.id
                      ? "bg-emerald-600/20 text-white"
                      : "text-gray-400 hover:text-white hover:bg-surface-elevated"
                  )}
                >
                  <section.icon className={cn(
                    "w-4 h-4",
                    activeSection === section.id ? "text-emerald-400" : ""
                  )} />
                  <span className="text-sm">{section.title}</span>
                </button>
              ))}
            </nav>
          </div>
        </motion.aside>

        {/* Content */}
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 w-full max-w-full lg:max-w-3xl px-4 sm:px-0"
        >
          {activeSection === "quickstart" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Quick Start Guide</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Get your GPU validator up and running on BitSage Network in 5 minutes.
                </p>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Overview</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 rounded-xl bg-surface-elevated text-center">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
                      <span className="text-emerald-400 font-bold text-sm sm:text-base">1</span>
                    </div>
                    <p className="text-xs sm:text-sm text-white">Install CLI</p>
                  </div>
                  <div className="p-3 sm:p-4 rounded-xl bg-surface-elevated text-center">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
                      <span className="text-emerald-400 font-bold text-sm sm:text-base">2</span>
                    </div>
                    <p className="text-xs sm:text-sm text-white">Register & Stake</p>
                  </div>
                  <div className="p-3 sm:p-4 rounded-xl bg-surface-elevated text-center">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-1.5 sm:mb-2">
                      <span className="text-emerald-400 font-bold text-sm sm:text-base">3</span>
                    </div>
                    <p className="text-xs sm:text-sm text-white">Start Validating</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">1. Install the CLI</h2>
                <CodeBlock
                  id="install"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Install BitSage CLI
curl -sSL https://get.bitsage.network | bash

# Verify installation
bitsage --version`}
                />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">2. Initialize Your Node</h2>
                <CodeBlock
                  id="init"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Initialize node configuration
bitsage init --name "my-validator"

# Configure your Starknet wallet
bitsage config set wallet <YOUR_STARKNET_ADDRESS>`}
                />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">3. Start Validating</h2>
                <CodeBlock
                  id="start"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Start the validator node
bitsage start

# Check status
bitsage status`}
                />
              </div>
            </div>
          )}

          {activeSection === "requirements" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">System Requirements</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Minimum and recommended specifications for running a BitSage validator.
                </p>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Hardware Requirements</h2>
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-surface-border">
                        <th className="text-left p-2 sm:p-3 text-xs sm:text-sm text-gray-400">Component</th>
                        <th className="text-left p-2 sm:p-3 text-xs sm:text-sm text-gray-400">Minimum</th>
                        <th className="text-left p-2 sm:p-3 text-xs sm:text-sm text-gray-400">Recommended</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-surface-border/50">
                        <td className="p-2 sm:p-3 text-sm sm:text-base text-white">GPU</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-400">RTX 3090 (24GB)</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-emerald-400">H100 / A100 (80GB)</td>
                      </tr>
                      <tr className="border-b border-surface-border/50">
                        <td className="p-2 sm:p-3 text-sm sm:text-base text-white">CPU</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-400">8 cores</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-emerald-400">16+ cores</td>
                      </tr>
                      <tr className="border-b border-surface-border/50">
                        <td className="p-2 sm:p-3 text-sm sm:text-base text-white">RAM</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-400">32 GB</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-emerald-400">64+ GB</td>
                      </tr>
                      <tr className="border-b border-surface-border/50">
                        <td className="p-2 sm:p-3 text-sm sm:text-base text-white">Storage</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-400">500 GB SSD</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-emerald-400">1 TB NVMe</td>
                      </tr>
                      <tr>
                        <td className="p-2 sm:p-3 text-sm sm:text-base text-white">Network</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-gray-400">100 Mbps</td>
                        <td className="p-2 sm:p-3 text-xs sm:text-sm text-emerald-400">1 Gbps+</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Supported GPUs</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="p-2 sm:p-3 rounded-lg bg-surface-elevated text-center">
                    <p className="text-xs sm:text-sm text-emerald-400 font-medium">H100</p>
                  </div>
                  <div className="p-2 sm:p-3 rounded-lg bg-surface-elevated text-center">
                    <p className="text-xs sm:text-sm text-emerald-400 font-medium">A100</p>
                  </div>
                  <div className="p-2 sm:p-3 rounded-lg bg-surface-elevated text-center">
                    <p className="text-xs sm:text-sm text-emerald-400 font-medium">RTX 4090</p>
                  </div>
                  <div className="p-2 sm:p-3 rounded-lg bg-surface-elevated text-center">
                    <p className="text-xs sm:text-sm text-emerald-400 font-medium">RTX 3090</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Supported TEE Platforms</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 rounded-lg bg-surface-elevated">
                    <p className="text-sm sm:text-base text-white font-medium mb-1">Intel SGX</p>
                    <p className="text-xs sm:text-sm text-gray-400">Software Guard Extensions</p>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-surface-elevated">
                    <p className="text-sm sm:text-base text-white font-medium mb-1">AMD SEV</p>
                    <p className="text-xs sm:text-sm text-gray-400">Secure Encrypted Virtualization</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "installation" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Installation</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Step-by-step guide to install the BitSage validator software.
                </p>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">1. Install Dependencies</h2>
                <CodeBlock
                  id="deps"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y build-essential curl git`}
                />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">2. Install BitSage CLI</h2>
                <CodeBlock
                  id="cli"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Download and install
curl -sSL https://get.bitsage.network | bash

# Add to PATH
echo 'export PATH="$HOME/.bitsage/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc`}
                />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">3. Verify GPU Detection</h2>
                <CodeBlock
                  id="gpu"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Check GPU status
bitsage gpu list

# Run diagnostics
bitsage gpu test`}
                />
              </div>
            </div>
          )}

          {activeSection === "registration" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Registration</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Register your validator on the BitSage Network.
                </p>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-2 sm:mb-3">Prerequisites</h2>
                <p className="text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4">
                  You'll need a Starknet wallet (ArgentX or Braavos) with SAGE tokens for staking.
                </p>
                <CodeBlock
                  id="wallet"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Set your Starknet wallet address
bitsage config set wallet 0x1234...abcd`}
                />
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">2. Register as Validator</h2>
                <CodeBlock
                  id="register"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Initialize validator registration
bitsage validator register --name "My Validator"

# Confirm transaction in your wallet
# Wait for confirmation...`}
                />
              </div>
            </div>
          )}

          {activeSection === "staking" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Staking</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Stake SAGE tokens to activate your validator.
                </p>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Staking Requirements</h2>
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 mt-1.5 sm:mt-2 flex-shrink-0"></div>
                    <p className="text-xs sm:text-sm text-gray-300">Minimum stake: 10,000 SAGE</p>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 mt-1.5 sm:mt-2 flex-shrink-0"></div>
                    <p className="text-xs sm:text-sm text-gray-300">Lock period: 30 days</p>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 mt-1.5 sm:mt-2 flex-shrink-0"></div>
                    <p className="text-xs sm:text-sm text-gray-300">Rewards: Proportional to stake and uptime</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">Stake via CLI</h2>
                <CodeBlock
                  id="stake"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Stake SAGE tokens
bitsage stake 10000

# Check stake status
bitsage stake status`}
                />
              </div>
            </div>
          )}

          {activeSection === "tee" && (
            <div className="space-y-6 sm:space-y-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">TEE Setup</h1>
                <p className="text-sm sm:text-base text-gray-400">
                  Enable Trusted Execution Environment for confidential compute.
                </p>
              </div>

              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">What is TEE?</h2>
                <p className="text-xs sm:text-sm text-gray-400">
                  Trusted Execution Environments provide hardware-based security for sensitive computations.
                  BitSage supports Intel SGX and AMD SEV for enhanced privacy and security.
                </p>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-base sm:text-lg font-semibold text-white">Enable TEE</h2>
                <CodeBlock
                  id="tee"
                  copiedCommand={copiedCommand}
                  onCopy={copyToClipboard}
                  code={`# Check TEE availability
bitsage tee check

# Enable TEE mode
bitsage config set tee.enabled true

# Generate attestation
bitsage tee attest

# Verify attestation
bitsage tee verify`}
                />
              </div>
            </div>
          )}
        </motion.main>
      </div>
    </div>
  );
}
