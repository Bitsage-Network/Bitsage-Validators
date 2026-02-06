import { describe, it, expect } from 'vitest';
import {
  commit,
  commitWithRandomBlinding,
  verifyOpening,
  addCommitments,
  verifyCommitment,
  createNote,
  serializeNote,
  deserializeNote,
  commitmentToFelt,
  valueToFixedDenomination,
  fixedDenominationToValue,
  generateRangeProof,
  verifyRangeProof,
} from '../pedersen';
import { isOnCurve } from '../elgamal';

// ============================================================================
// Pedersen Commitments
// ============================================================================

describe('commit', () => {
  it('produces a point on the curve', () => {
    const c = commit(100n, 42n);
    expect(isOnCurve(c)).toBe(true);
  });

  it('different values produce different commitments', () => {
    const c1 = commit(100n, 42n);
    const c2 = commit(200n, 42n);
    expect(c1.x).not.toEqual(c2.x);
  });

  it('different blindings produce different commitments', () => {
    const c1 = commit(100n, 1n);
    const c2 = commit(100n, 2n);
    expect(c1.x).not.toEqual(c2.x);
  });

  it('zero value with zero blinding is on curve', () => {
    const c = commit(0n, 0n);
    // 0*G + 0*H = O (point at infinity)
    expect(c.x).toBe(0n);
    expect(c.y).toBe(0n);
  });
});

describe('verifyOpening', () => {
  it('valid opening verifies', () => {
    const value = 500n;
    const blinding = 12345n;
    const c = commit(value, blinding);
    expect(verifyOpening(c, value, blinding)).toBe(true);
  });

  it('wrong value fails', () => {
    const c = commit(500n, 12345n);
    expect(verifyOpening(c, 501n, 12345n)).toBe(false);
  });

  it('wrong blinding fails', () => {
    const c = commit(500n, 12345n);
    expect(verifyOpening(c, 500n, 12346n)).toBe(false);
  });
});

describe('commitWithRandomBlinding', () => {
  it('produces verifiable commitment', () => {
    const { commitment, blinding } = commitWithRandomBlinding(777n);
    expect(verifyOpening(commitment, 777n, blinding)).toBe(true);
  });

  it('commitment is on curve', () => {
    const { commitment } = commitWithRandomBlinding(42n);
    expect(verifyCommitment(commitment)).toBe(true);
  });
});

// ============================================================================
// Homomorphic Properties
// ============================================================================

describe('addCommitments (homomorphic)', () => {
  it('C(v1,r1) + C(v2,r2) = C(v1+v2, r1+r2)', () => {
    const v1 = 100n, r1 = 10n;
    const v2 = 200n, r2 = 20n;
    const c1 = commit(v1, r1);
    const c2 = commit(v2, r2);
    const cSum = addCommitments(c1, c2);
    const cExpected = commit(v1 + v2, r1 + r2);
    expect(cSum.x).toBe(cExpected.x);
    expect(cSum.y).toBe(cExpected.y);
  });
});

// ============================================================================
// Note Serialization
// ============================================================================

describe('createNote', () => {
  it('produces valid commitment', () => {
    const note = createNote(1000n);
    expect(verifyOpening(note.commitment, note.value, note.blinding)).toBe(true);
  });

  it('value matches input', () => {
    const note = createNote(42n);
    expect(note.value).toBe(42n);
  });

  it('blinding and nullifier secret are nonzero', () => {
    const note = createNote(1n);
    expect(note.blinding).not.toBe(0n);
    expect(note.nullifierSecret).not.toBe(0n);
  });
});

describe('serializeNote / deserializeNote', () => {
  it('round-trip preserves all fields', () => {
    const note = createNote(12345n);
    const serialized = serializeNote(note);
    const deserialized = deserializeNote(serialized);

    expect(deserialized.value).toBe(note.value);
    expect(deserialized.blinding).toBe(note.blinding);
    expect(deserialized.nullifierSecret).toBe(note.nullifierSecret);
    expect(deserialized.commitment.x).toBe(note.commitment.x);
    expect(deserialized.commitment.y).toBe(note.commitment.y);
  });

  it('serialized form is valid JSON', () => {
    const note = createNote(1n);
    const serialized = serializeNote(note);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

// ============================================================================
// Commitment Utilities
// ============================================================================

describe('commitmentToFelt', () => {
  it('returns hex string', () => {
    const c = commit(100n, 42n);
    const felt = commitmentToFelt(c);
    expect(felt.startsWith('0x')).toBe(true);
  });

  it('deterministic for same input', () => {
    const c = commit(100n, 42n);
    expect(commitmentToFelt(c)).toBe(commitmentToFelt(c));
  });
});

describe('valueToFixedDenomination / fixedDenominationToValue', () => {
  it('round-trip for 1.0', () => {
    const fixed = valueToFixedDenomination(1.0);
    expect(fixedDenominationToValue(fixed)).toBeCloseTo(1.0);
  });

  it('round-trip for 0.1', () => {
    const fixed = valueToFixedDenomination(0.1);
    expect(fixedDenominationToValue(fixed)).toBeCloseTo(0.1);
  });
});

// ============================================================================
// Range Proofs
// ============================================================================

describe('generateRangeProof / verifyRangeProof', () => {
  it('valid proof verifies', () => {
    const proof = generateRangeProof(100n, 42n, 64);
    expect(verifyRangeProof(proof)).toBe(true);
  });

  it('value at boundary verifies', () => {
    const proof = generateRangeProof(0n, 42n, 64);
    expect(verifyRangeProof(proof)).toBe(true);
  });

  it('out-of-range value throws', () => {
    expect(() => generateRangeProof(-1n, 42n, 64)).toThrow();
  });
});
