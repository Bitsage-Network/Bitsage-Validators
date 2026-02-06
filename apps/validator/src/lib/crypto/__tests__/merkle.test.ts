import { describe, it, expect } from 'vitest';
import {
  initLeanIMT,
  insertLeaf,
  getMerkleProof,
  verifyMerkleProof,
  computeRootFromProof,
  proofToContractFormat,
  contractFormatToProof,
  getLeafIndex,
  EMPTY_LEAF,
  getZeroHash,
  computeCommitmentHash,
} from '../merkle';

// Use a small depth for fast tests
const TEST_DEPTH = 4;

// ============================================================================
// Lean IMT
// ============================================================================

describe('initLeanIMT', () => {
  it('starts with size 0', () => {
    const tree = initLeanIMT(TEST_DEPTH);
    expect(tree.size).toBe(0);
  });

  it('has correct depth', () => {
    const tree = initLeanIMT(TEST_DEPTH);
    expect(tree.depth).toBe(TEST_DEPTH);
  });

  it('root is deterministic for same depth', () => {
    const t1 = initLeanIMT(TEST_DEPTH);
    const t2 = initLeanIMT(TEST_DEPTH);
    expect(t1.root).toBe(t2.root);
  });
});

describe('insertLeaf', () => {
  it('increments size', () => {
    let tree = initLeanIMT(TEST_DEPTH);
    tree = insertLeaf(tree, 42n);
    expect(tree.size).toBe(1);
  });

  it('changes root', () => {
    const empty = initLeanIMT(TEST_DEPTH);
    const inserted = insertLeaf(empty, 42n);
    expect(inserted.root).not.toBe(empty.root);
  });

  it('different leaves produce different roots', () => {
    const t1 = insertLeaf(initLeanIMT(TEST_DEPTH), 1n);
    const t2 = insertLeaf(initLeanIMT(TEST_DEPTH), 2n);
    expect(t1.root).not.toBe(t2.root);
  });

  it('multiple inserts produce unique roots', () => {
    let tree = initLeanIMT(TEST_DEPTH);
    const roots = new Set<bigint>();

    for (let i = 0; i < 8; i++) {
      tree = insertLeaf(tree, BigInt(i + 1));
      roots.add(tree.root);
    }

    expect(roots.size).toBe(8);
  });
});

// ============================================================================
// Merkle Proofs
// ============================================================================

describe('getMerkleProof / verifyMerkleProof', () => {
  it('proof for single leaf verifies', async () => {
    const leaves = [42n];
    const proof = await getMerkleProof(0, leaves, TEST_DEPTH);
    expect(verifyMerkleProof(proof)).toBe(true);
  });

  it('proof for each leaf in multi-leaf tree verifies', async () => {
    const leaves = [10n, 20n, 30n, 40n, 50n, 60n, 70n, 80n];

    for (let i = 0; i < leaves.length; i++) {
      const proof = await getMerkleProof(i, leaves, TEST_DEPTH);
      expect(verifyMerkleProof(proof)).toBe(true);
      expect(proof.leaf).toBe(leaves[i]);
      expect(proof.leafIndex).toBe(i);
    }
  });

  it('all proofs share same root', async () => {
    const leaves = [1n, 2n, 3n, 4n];
    const proofs = await Promise.all(
      leaves.map((_, i) => getMerkleProof(i, leaves, TEST_DEPTH))
    );

    const root = proofs[0].root;
    for (const proof of proofs) {
      expect(proof.root).toBe(root);
    }
  });

  it('tampered leaf fails verification', async () => {
    const leaves = [42n];
    const proof = await getMerkleProof(0, leaves, TEST_DEPTH);
    proof.leaf = 99n;
    expect(verifyMerkleProof(proof)).toBe(false);
  });

  it('throws for out-of-bounds index', async () => {
    const leaves = [1n, 2n];
    await expect(getMerkleProof(5, leaves, TEST_DEPTH)).rejects.toThrow();
  });
});

describe('computeRootFromProof', () => {
  it('matches proof root', async () => {
    const leaves = [10n, 20n, 30n];
    const proof = await getMerkleProof(1, leaves, TEST_DEPTH);
    const computed = computeRootFromProof(
      proof.leaf,
      proof.pathElements,
      proof.pathIndices
    );
    expect(computed).toBe(proof.root);
  });
});

// ============================================================================
// Contract Format Conversion
// ============================================================================

describe('proofToContractFormat / contractFormatToProof', () => {
  it('round-trip preserves proof', async () => {
    const leaves = [42n, 99n];
    const proof = await getMerkleProof(0, leaves, TEST_DEPTH);

    const contractFmt = proofToContractFormat(proof);
    expect(contractFmt.leaf.startsWith('0x')).toBe(true);
    expect(contractFmt.root.startsWith('0x')).toBe(true);

    const back = contractFormatToProof(contractFmt);
    expect(back.leaf).toBe(proof.leaf);
    expect(back.leafIndex).toBe(proof.leafIndex);
    expect(back.root).toBe(proof.root);
    expect(back.pathElements).toEqual(proof.pathElements);
    expect(back.pathIndices).toEqual(proof.pathIndices);
  });
});

// ============================================================================
// Utilities
// ============================================================================

describe('getLeafIndex', () => {
  it('decodes index 0', () => {
    expect(getLeafIndex([0, 0, 0, 0])).toBe(0);
  });

  it('decodes index 1', () => {
    expect(getLeafIndex([1, 0, 0, 0])).toBe(1);
  });

  it('decodes index 5 (binary 0101)', () => {
    expect(getLeafIndex([1, 0, 1, 0])).toBe(5);
  });
});

describe('getZeroHash', () => {
  it('level 0 is EMPTY_LEAF', () => {
    expect(getZeroHash(0)).toBe(EMPTY_LEAF);
  });

  it('higher levels are nonzero', () => {
    expect(getZeroHash(1)).not.toBe(0n);
  });
});

describe('computeCommitmentHash', () => {
  it('returns nonzero hash', () => {
    const result = computeCommitmentHash(
      { x: 100n, y: 200n },
      1000n,
      42n
    );
    expect(result).not.toBe(0n);
  });

  it('is deterministic', () => {
    const args = [{ x: 1n, y: 2n }, 100n, 42n] as const;
    expect(computeCommitmentHash(...args)).toBe(computeCommitmentHash(...args));
  });
});
