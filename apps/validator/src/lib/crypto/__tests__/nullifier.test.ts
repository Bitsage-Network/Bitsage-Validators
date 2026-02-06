import { describe, it, expect } from 'vitest';
import {
  deriveNullifier,
  deriveNullifierWithDomain,
  generateNullifierSecret,
  createNullifierWitness,
  verifyNullifierDerivation,
  deriveNullifierBatch,
  nullifierToFelt,
  feltToNullifier,
  deriveViewTag,
  matchViewTag,
  poseidonHash,
} from '../nullifier';

// ============================================================================
// Poseidon Hash
// ============================================================================

describe('poseidonHash', () => {
  it('single input produces nonzero output', () => {
    const result = poseidonHash([42n]);
    expect(result).not.toBe(0n);
  });

  it('two inputs produce nonzero output', () => {
    const result = poseidonHash([1n, 2n]);
    expect(result).not.toBe(0n);
  });

  it('is deterministic', () => {
    expect(poseidonHash([100n, 200n])).toBe(poseidonHash([100n, 200n]));
  });

  it('different inputs produce different outputs', () => {
    expect(poseidonHash([1n, 2n])).not.toBe(poseidonHash([2n, 1n]));
  });

  it('throws on empty input', () => {
    expect(() => poseidonHash([])).toThrow();
  });
});

// ============================================================================
// Nullifier Derivation
// ============================================================================

describe('deriveNullifier', () => {
  it('is deterministic', () => {
    const secret = 123456n;
    const idx = 0;
    expect(deriveNullifier(secret, idx)).toBe(deriveNullifier(secret, idx));
  });

  it('different secrets produce different nullifiers', () => {
    expect(deriveNullifier(1n, 0)).not.toBe(deriveNullifier(2n, 0));
  });

  it('different indices produce different nullifiers', () => {
    const secret = 42n;
    expect(deriveNullifier(secret, 0)).not.toBe(deriveNullifier(secret, 1));
  });

  it('result is nonzero', () => {
    expect(deriveNullifier(999n, 5)).not.toBe(0n);
  });
});

describe('deriveNullifierWithDomain', () => {
  it('different domains produce different nullifiers', () => {
    const secret = 42n;
    const idx = 0;
    const n1 = deriveNullifierWithDomain(secret, idx, 'withdraw');
    const n2 = deriveNullifierWithDomain(secret, idx, 'transfer');
    expect(n1).not.toBe(n2);
  });
});

describe('generateNullifierSecret', () => {
  it('produces nonzero value', () => {
    const secret = generateNullifierSecret();
    expect(secret).not.toBe(0n);
  });

  it('produces different values on successive calls', () => {
    const s1 = generateNullifierSecret();
    const s2 = generateNullifierSecret();
    expect(s1).not.toBe(s2);
  });
});

// ============================================================================
// Nullifier Witness
// ============================================================================

describe('createNullifierWitness / verifyNullifierDerivation', () => {
  it('valid witness verifies', () => {
    const secret = generateNullifierSecret();
    const witness = createNullifierWitness(secret, 3);
    expect(verifyNullifierDerivation(witness)).toBe(true);
  });

  it('witness has correct structure', () => {
    const witness = createNullifierWitness(42n, 7);
    expect(witness.nullifierSecret).toBe(42n);
    expect(witness.leafIndex).toBe(7);
    expect(witness.nullifier).toBe(deriveNullifier(42n, 7));
  });
});

// ============================================================================
// Batch Derivation
// ============================================================================

describe('deriveNullifierBatch', () => {
  it('matches individual calls', () => {
    const secrets = [10n, 20n, 30n];
    const indices = [0, 1, 2];
    const batch = deriveNullifierBatch(secrets, indices);

    expect(batch).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(batch[i]).toBe(deriveNullifier(secrets[i], indices[i]));
    }
  });

  it('throws on mismatched lengths', () => {
    expect(() => deriveNullifierBatch([1n, 2n], [0])).toThrow();
  });
});

// ============================================================================
// Nullifier Conversion
// ============================================================================

describe('nullifierToFelt / feltToNullifier', () => {
  it('round-trip', () => {
    const nullifier = deriveNullifier(123n, 0);
    const felt = nullifierToFelt(nullifier);
    expect(felt.startsWith('0x')).toBe(true);
    expect(feltToNullifier(felt)).toBe(nullifier);
  });
});

// ============================================================================
// View Tags (FMD)
// ============================================================================

describe('deriveViewTag', () => {
  it('returns 16-bit value', () => {
    const tag = deriveViewTag(42n, 0);
    expect(tag).toBeGreaterThanOrEqual(0);
    expect(tag).toBeLessThanOrEqual(0xFFFF);
  });

  it('is deterministic', () => {
    expect(deriveViewTag(42n, 0)).toBe(deriveViewTag(42n, 0));
  });

  it('different secrets produce different tags (usually)', () => {
    const tag1 = deriveViewTag(1n, 0);
    const tag2 = deriveViewTag(2n, 0);
    // Not guaranteed but extremely unlikely to collide
    expect(tag1).not.toBe(tag2);
  });
});

describe('matchViewTag', () => {
  it('correct key matches', () => {
    const viewKey = 42n;
    const ephemeralPub = { x: 100n, y: 200n };
    const outputIndex = 0;

    // Compute expected shared secret and tag
    const sharedSecret = poseidonHash([viewKey, ephemeralPub.x, ephemeralPub.y]);
    const expectedTag = deriveViewTag(sharedSecret, outputIndex);

    expect(matchViewTag(viewKey, ephemeralPub, outputIndex, expectedTag)).toBe(true);
  });

  it('wrong key does not match', () => {
    const viewKey = 42n;
    const wrongKey = 43n;
    const ephemeralPub = { x: 100n, y: 200n };

    const sharedSecret = poseidonHash([viewKey, ephemeralPub.x, ephemeralPub.y]);
    const tag = deriveViewTag(sharedSecret, 0);

    expect(matchViewTag(wrongKey, ephemeralPub, 0, tag)).toBe(false);
  });
});
