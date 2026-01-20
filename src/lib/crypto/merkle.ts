/**
 * Merkle Tree for Privacy Pool Membership Proofs
 *
 * Implements an incremental Merkle tree (Lean IMT) for efficient
 * membership proofs in the privacy pool.
 *
 * Uses Starknet's Poseidon hash for all tree operations.
 */

import { poseidonHash } from "./nullifier";

// Hash two nodes together
function hashNodes(left: bigint, right: bigint): bigint {
  return poseidonHash([left, right]);
}

// Default empty leaf value
export const EMPTY_LEAF = 0n;

// Merkle tree depth (supports 2^20 = ~1M leaves)
export const TREE_DEPTH = 20;

// Precomputed zero hashes for each level
const zeroHashes: bigint[] = [];
let current = EMPTY_LEAF;
for (let i = 0; i < TREE_DEPTH; i++) {
  zeroHashes.push(current);
  current = hashNodes(current, current);
}

// Get zero hash at level
export function getZeroHash(level: number): bigint {
  return zeroHashes[level];
}

// Merkle proof structure
export interface MerkleProof {
  leaf: bigint;
  leafIndex: number;
  pathElements: bigint[];   // Sibling hashes
  pathIndices: number[];    // 0 = left, 1 = right
  root: bigint;
}

// Lean IMT state
export interface LeanIMTState {
  depth: number;
  root: bigint;
  size: number;
  rightmostPath: bigint[];  // Rightmost filled hashes at each level
}

// Initialize empty Lean IMT
export function initLeanIMT(depth: number = TREE_DEPTH): LeanIMTState {
  return {
    depth,
    root: zeroHashes[depth - 1],
    size: 0,
    rightmostPath: new Array(depth).fill(EMPTY_LEAF),
  };
}

// Insert a leaf into the Lean IMT
export function insertLeaf(state: LeanIMTState, leaf: bigint): LeanIMTState {
  const newState = { ...state };
  const index = state.size;
  newState.size = index + 1;
  newState.rightmostPath = [...state.rightmostPath];

  let currentHash = leaf;
  let currentIndex = index;

  for (let level = 0; level < state.depth; level++) {
    if (currentIndex % 2 === 0) {
      // Even index: update rightmost path
      newState.rightmostPath[level] = currentHash;
      currentHash = hashNodes(currentHash, zeroHashes[level]);
    } else {
      // Odd index: hash with left sibling
      const leftSibling = state.rightmostPath[level];
      currentHash = hashNodes(leftSibling, currentHash);
    }
    currentIndex = Math.floor(currentIndex / 2);
  }

  newState.root = currentHash;
  return newState;
}

// Build Merkle proof for a leaf at given index
// This requires access to all leaves or a proof server
export async function getMerkleProof(
  leafIndex: number,
  leaves: bigint[],
  depth: number = TREE_DEPTH
): Promise<MerkleProof> {
  if (leafIndex >= leaves.length) {
    throw new Error("Leaf index out of bounds");
  }

  // Build full tree
  const layers: bigint[][] = [leaves.slice()];

  // Pad to next power of 2
  const targetSize = 1 << depth;
  while (layers[0].length < targetSize) {
    layers[0].push(EMPTY_LEAF);
  }

  // Build layers bottom-up
  for (let level = 0; level < depth; level++) {
    const currentLayer = layers[level];
    const nextLayer: bigint[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = currentLayer[i + 1] ?? zeroHashes[level];
      nextLayer.push(hashNodes(left, right));
    }

    layers.push(nextLayer);
  }

  // Extract proof path
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let currentIndex = leafIndex;

  for (let level = 0; level < depth; level++) {
    const isRight = currentIndex % 2 === 1;
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

    pathElements.push(
      siblingIndex < layers[level].length
        ? layers[level][siblingIndex]
        : zeroHashes[level]
    );
    pathIndices.push(isRight ? 1 : 0);

    currentIndex = Math.floor(currentIndex / 2);
  }

  return {
    leaf: leaves[leafIndex],
    leafIndex,
    pathElements,
    pathIndices,
    root: layers[depth][0],
  };
}

// Verify a Merkle proof
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let currentHash = proof.leaf;

  for (let i = 0; i < proof.pathElements.length; i++) {
    const sibling = proof.pathElements[i];
    const isRight = proof.pathIndices[i] === 1;

    currentHash = isRight
      ? hashNodes(sibling, currentHash)
      : hashNodes(currentHash, sibling);
  }

  return currentHash === proof.root;
}

// Compute root from proof without verification
export function computeRootFromProof(
  leaf: bigint,
  pathElements: bigint[],
  pathIndices: number[]
): bigint {
  let currentHash = leaf;

  for (let i = 0; i < pathElements.length; i++) {
    const sibling = pathElements[i];
    const isRight = pathIndices[i] === 1;

    currentHash = isRight
      ? hashNodes(sibling, currentHash)
      : hashNodes(currentHash, sibling);
  }

  return currentHash;
}

// Get leaf index from binary path
export function getLeafIndex(pathIndices: number[]): number {
  let index = 0;
  for (let i = 0; i < pathIndices.length; i++) {
    if (pathIndices[i] === 1) {
      index |= 1 << i;
    }
  }
  return index;
}

// Convert proof to contract format
export function proofToContractFormat(proof: MerkleProof): {
  leaf: string;
  leafIndex: number;
  pathElements: string[];
  pathIndices: number[];
  root: string;
} {
  return {
    leaf: "0x" + proof.leaf.toString(16),
    leafIndex: proof.leafIndex,
    pathElements: proof.pathElements.map((e) => "0x" + e.toString(16)),
    pathIndices: proof.pathIndices,
    root: "0x" + proof.root.toString(16),
  };
}

// Parse proof from contract response
export function contractFormatToProof(data: {
  leaf: string;
  leafIndex: number;
  pathElements: string[];
  pathIndices: number[];
  root: string;
}): MerkleProof {
  return {
    leaf: BigInt(data.leaf),
    leafIndex: data.leafIndex,
    pathElements: data.pathElements.map((e) => BigInt(e)),
    pathIndices: data.pathIndices,
    root: BigInt(data.root),
  };
}

// Fetch leaves from contract (paginated)
export async function fetchLeavesFromContract(
  contractRead: (startIndex: number, count: number) => Promise<bigint[]>,
  totalLeaves: number,
  batchSize: number = 100
): Promise<bigint[]> {
  const leaves: bigint[] = [];

  for (let i = 0; i < totalLeaves; i += batchSize) {
    const count = Math.min(batchSize, totalLeaves - i);
    const batch = await contractRead(i, count);
    leaves.push(...batch);
  }

  return leaves;
}

// Build sparse Merkle proof (for large trees with most empty leaves)
export interface SparseMerkleProof {
  leaf: bigint;
  leafIndex: number;
  siblings: Array<{
    hash: bigint;
    isZero: boolean;  // If true, use zero hash at this level
  }>;
  root: bigint;
}

// Convert sparse proof to regular proof
export function sparseToRegularProof(
  sparse: SparseMerkleProof,
  depth: number = TREE_DEPTH
): MerkleProof {
  const pathElements = sparse.siblings.map((s, level) =>
    s.isZero ? zeroHashes[level] : s.hash
  );

  // Derive pathIndices from leafIndex
  const pathIndices: number[] = [];
  let idx = sparse.leafIndex;
  for (let i = 0; i < depth; i++) {
    pathIndices.push(idx % 2);
    idx = Math.floor(idx / 2);
  }

  return {
    leaf: sparse.leaf,
    leafIndex: sparse.leafIndex,
    pathElements,
    pathIndices,
    root: sparse.root,
  };
}

// Batch proof generation (for multiple leaves)
export async function getBatchMerkleProofs(
  leafIndices: number[],
  leaves: bigint[],
  depth: number = TREE_DEPTH
): Promise<MerkleProof[]> {
  return Promise.all(
    leafIndices.map((idx) => getMerkleProof(idx, leaves, depth))
  );
}

// Merkle tree utilities for privacy pool integration
export interface PrivacyPoolMerkleState {
  root: string;
  totalDeposits: number;
}

// Fetch current pool state from contract
export async function fetchPoolMerkleState(
  getRoot: () => Promise<string>,
  getTotalDeposits: () => Promise<number>
): Promise<PrivacyPoolMerkleState> {
  const [root, totalDeposits] = await Promise.all([
    getRoot(),
    getTotalDeposits(),
  ]);
  return { root, totalDeposits };
}

// Commitment hash for privacy pool leaf
export function computeCommitmentHash(
  commitment: { x: bigint; y: bigint },
  amount: bigint,
  tokenAddress: bigint
): bigint {
  return poseidonHash([commitment.x, commitment.y, amount, tokenAddress]);
}
