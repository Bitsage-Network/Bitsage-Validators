/**
 * Starknet Integration
 *
 * Handles wallet operations and contract interactions
 */

import { Account, RpcProvider, Contract, CallData, uint256 } from "starknet";
import { loadConfig, getContractAddresses } from "./config.js";

// ABI fragments for contract calls
const FAUCET_ABI = [
  {
    name: "claim",
    type: "function",
    inputs: [],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "get_claim_amount",
    type: "function",
    inputs: [],
    outputs: [{ name: "amount", type: "core::integer::u256" }],
    state_mutability: "view",
  },
];

const VALIDATOR_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    inputs: [
      { name: "operator", type: "core::starknet::contract_address::ContractAddress" },
      { name: "commission_bps", type: "core::integer::u16" },
      { name: "attestation_hash", type: "core::felt252" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "add_stake",
    type: "function",
    inputs: [{ name: "amount", type: "core::integer::u256" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "remove_stake",
    type: "function",
    inputs: [{ name: "amount", type: "core::integer::u256" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "get_validator",
    type: "function",
    inputs: [{ name: "validator", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ name: "info", type: "ValidatorInfo" }],
    state_mutability: "view",
  },
  {
    name: "is_active_validator",
    type: "function",
    inputs: [{ name: "validator", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ name: "is_active", type: "core::bool" }],
    state_mutability: "view",
  },
  {
    name: "get_stats",
    type: "function",
    inputs: [],
    outputs: [{ name: "stats", type: "ValidatorStats" }],
    state_mutability: "view",
  },
];

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ name: "success", type: "core::bool" }],
    state_mutability: "external",
  },
  {
    name: "balance_of",
    type: "function",
    inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ name: "balance", type: "core::integer::u256" }],
    state_mutability: "view",
  },
];

export interface StarknetClient {
  provider: RpcProvider;
  account: Account | null;
  addresses: Record<string, string>;
}

/**
 * Initialize Starknet client
 */
export function initStarknet(privateKey?: string): StarknetClient {
  const config = loadConfig();
  const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  const addresses = getContractAddresses(config.network);

  let account: Account | null = null;

  const pk = privateKey || config.wallet.privateKey;
  if (pk && config.wallet.address) {
    account = new Account(provider, config.wallet.address, pk);
  }

  return { provider, account, addresses };
}

/**
 * Get SAGE token balance
 */
export async function getSageBalance(client: StarknetClient, address: string): Promise<bigint> {
  const contract = new Contract(ERC20_ABI, client.addresses.SAGE_TOKEN, client.provider);
  const result = await contract.call("balance_of", [address]);
  return uint256ToBigInt(result as { low: bigint; high: bigint });
}

/**
 * Claim from faucet
 */
export async function claimFromFaucet(client: StarknetClient): Promise<string> {
  if (!client.account) {
    throw new Error("Wallet not connected");
  }

  const result = await client.account.execute({
    contractAddress: client.addresses.FAUCET,
    entrypoint: "claim",
    calldata: [],
  });

  return result.transaction_hash;
}

/**
 * Register as validator
 */
export async function registerValidator(
  client: StarknetClient,
  stakeAmount: bigint,
  commissionBps: number = 500,
  attestationHash: string = "0"
): Promise<string> {
  if (!client.account) {
    throw new Error("Wallet not connected");
  }

  const { low: stakeLow, high: stakeHigh } = bigIntToUint256(stakeAmount);

  // Multicall: approve + register + stake
  const result = await client.account.execute([
    // Approve SAGE tokens for validator registry
    {
      contractAddress: client.addresses.SAGE_TOKEN,
      entrypoint: "approve",
      calldata: CallData.compile({
        spender: client.addresses.VALIDATOR_REGISTRY,
        amount: { low: stakeLow, high: stakeHigh },
      }),
    },
    // Register validator
    {
      contractAddress: client.addresses.VALIDATOR_REGISTRY,
      entrypoint: "register",
      calldata: CallData.compile({
        operator: client.account.address,
        commission_bps: commissionBps,
        attestation_hash: attestationHash,
      }),
    },
    // Add initial stake
    {
      contractAddress: client.addresses.VALIDATOR_REGISTRY,
      entrypoint: "add_stake",
      calldata: CallData.compile({
        amount: { low: stakeLow, high: stakeHigh },
      }),
    },
  ]);

  return result.transaction_hash;
}

/**
 * Add stake to validator
 */
export async function addStake(client: StarknetClient, amount: bigint): Promise<string> {
  if (!client.account) {
    throw new Error("Wallet not connected");
  }

  const { low, high } = bigIntToUint256(amount);

  const result = await client.account.execute([
    // Approve
    {
      contractAddress: client.addresses.SAGE_TOKEN,
      entrypoint: "approve",
      calldata: CallData.compile({
        spender: client.addresses.VALIDATOR_REGISTRY,
        amount: { low, high },
      }),
    },
    // Add stake
    {
      contractAddress: client.addresses.VALIDATOR_REGISTRY,
      entrypoint: "add_stake",
      calldata: CallData.compile({
        amount: { low, high },
      }),
    },
  ]);

  return result.transaction_hash;
}

/**
 * Remove stake from validator
 */
export async function removeStake(client: StarknetClient, amount: bigint): Promise<string> {
  if (!client.account) {
    throw new Error("Wallet not connected");
  }

  const { low, high } = bigIntToUint256(amount);

  const result = await client.account.execute({
    contractAddress: client.addresses.VALIDATOR_REGISTRY,
    entrypoint: "remove_stake",
    calldata: CallData.compile({
      amount: { low, high },
    }),
  });

  return result.transaction_hash;
}

/**
 * Get validator info
 */
export async function getValidatorInfo(
  client: StarknetClient,
  address: string
): Promise<Record<string, unknown> | null> {
  const contract = new Contract(
    VALIDATOR_REGISTRY_ABI,
    client.addresses.VALIDATOR_REGISTRY,
    client.provider
  );

  try {
    const result = await contract.call("get_validator", [address]);
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if address is active validator
 */
export async function isActiveValidator(client: StarknetClient, address: string): Promise<boolean> {
  const contract = new Contract(
    VALIDATOR_REGISTRY_ABI,
    client.addresses.VALIDATOR_REGISTRY,
    client.provider
  );

  try {
    const result = await contract.call("is_active_validator", [address]);
    return Boolean(result);
  } catch {
    return false;
  }
}

/**
 * Get network stats
 */
export async function getNetworkStats(
  client: StarknetClient
): Promise<Record<string, unknown> | null> {
  const contract = new Contract(
    VALIDATOR_REGISTRY_ABI,
    client.addresses.VALIDATOR_REGISTRY,
    client.provider
  );

  try {
    const result = await contract.call("get_stats", []);
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  client: StarknetClient,
  txHash: string
): Promise<boolean> {
  try {
    await client.provider.waitForTransaction(txHash, {
      retryInterval: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

// Utility functions
function bigIntToUint256(value: bigint): { low: string; high: string } {
  const mask = (1n << 128n) - 1n;
  return {
    low: (value & mask).toString(),
    high: (value >> 128n).toString(),
  };
}

function uint256ToBigInt(value: { low: bigint; high: bigint }): bigint {
  return BigInt(value.low) + (BigInt(value.high) << 128n);
}
