import { describe, it, expect } from 'vitest';
import {
  mod,
  modInverse,
  modPow,
  isOnCurve,
  isInfinity,
  addPoints,
  scalarMult,
  negatePoint,
  getGenerator,
  getPedersenH,
  encrypt,
  decrypt,
  addCiphertexts,
  subtractCiphertexts,
  verifyCiphertext,
  compressPoint,
  decompressPoint,
  generateKeyPair,
  randomScalar,
  ciphertextToFelts,
  feltsToChiphertext,
  pointToFelts,
  feltsToPoint,
} from '../elgamal';
import {
  STARK_PRIME,
  CURVE_ORDER,
  POINT_AT_INFINITY,
} from '../constants';

// ============================================================================
// Modular Arithmetic
// ============================================================================

describe('mod', () => {
  it('handles positive values', () => {
    expect(mod(7n, 5n)).toBe(2n);
  });

  it('handles negative values', () => {
    expect(mod(-3n, 5n)).toBe(2n);
  });

  it('returns zero for exact multiples', () => {
    expect(mod(10n, 5n)).toBe(0n);
  });

  it('handles zero', () => {
    expect(mod(0n, 5n)).toBe(0n);
  });
});

describe('modInverse', () => {
  it('computes inverse correctly', () => {
    const inv = modInverse(3n, 7n);
    expect(mod(3n * inv, 7n)).toBe(1n);
  });

  it('computes inverse for large values', () => {
    const a = 123456789n;
    const inv = modInverse(a, STARK_PRIME);
    expect(mod(a * inv, STARK_PRIME)).toBe(1n);
  });
});

describe('modPow', () => {
  it('handles zero exponent', () => {
    expect(modPow(5n, 0n, 7n)).toBe(1n);
  });

  it('handles exponent of one', () => {
    expect(modPow(5n, 1n, 7n)).toBe(5n);
  });

  it('computes correctly', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n); // 1024 mod 1000
  });

  it('returns 0 when modulus is 1', () => {
    expect(modPow(5n, 3n, 1n)).toBe(0n);
  });
});

// ============================================================================
// Curve Point Operations
// ============================================================================

describe('isOnCurve', () => {
  it('generator is on curve', () => {
    expect(isOnCurve(getGenerator())).toBe(true);
  });

  it('Pedersen H is on curve', () => {
    expect(isOnCurve(getPedersenH())).toBe(true);
  });

  it('point at infinity is on curve', () => {
    expect(isOnCurve(POINT_AT_INFINITY)).toBe(true);
  });

  it('arbitrary invalid point is not on curve', () => {
    expect(isOnCurve({ x: 1n, y: 1n })).toBe(false);
  });
});

describe('addPoints', () => {
  it('identity: P + O = P', () => {
    const g = getGenerator();
    expect(addPoints(g, POINT_AT_INFINITY)).toEqual(g);
  });

  it('identity: O + P = P', () => {
    const g = getGenerator();
    expect(addPoints(POINT_AT_INFINITY, g)).toEqual(g);
  });

  it('point + inverse = infinity', () => {
    const g = getGenerator();
    const negG = negatePoint(g);
    expect(isInfinity(addPoints(g, negG))).toBe(true);
  });

  it('doubling: P + P produces valid point', () => {
    const g = getGenerator();
    const result = addPoints(g, g);
    expect(isOnCurve(result)).toBe(true);
    expect(isInfinity(result)).toBe(false);
  });

  it('addition is commutative', () => {
    const g = getGenerator();
    const h = getPedersenH();
    expect(addPoints(g, h)).toEqual(addPoints(h, g));
  });
});

describe('scalarMult', () => {
  it('0 * G = infinity', () => {
    expect(isInfinity(scalarMult(0n, getGenerator()))).toBe(true);
  });

  it('1 * G = G', () => {
    const g = getGenerator();
    expect(scalarMult(1n, g)).toEqual(g);
  });

  it('2 * G = G + G', () => {
    const g = getGenerator();
    expect(scalarMult(2n, g)).toEqual(addPoints(g, g));
  });

  it('result is on curve', () => {
    expect(isOnCurve(scalarMult(42n, getGenerator()))).toBe(true);
  });

  it('n * G = infinity (curve order)', () => {
    const g = getGenerator();
    expect(isInfinity(scalarMult(CURVE_ORDER, g))).toBe(true);
  });
});

// ============================================================================
// ElGamal Encryption
// ============================================================================

describe('encrypt / decrypt', () => {
  const keyPair = generateKeyPair();

  it('round-trip for value 0', () => {
    const ct = encrypt(0n, keyPair.publicKey, 42n);
    expect(decrypt(ct, keyPair.privateKey, 100n)).toBe(0n);
  });

  it('round-trip for value 1', () => {
    const ct = encrypt(1n, keyPair.publicKey, 42n);
    expect(decrypt(ct, keyPair.privateKey, 100n)).toBe(1n);
  });

  it('round-trip for value 42', () => {
    const ct = encrypt(42n, keyPair.publicKey, 100n);
    expect(decrypt(ct, keyPair.privateKey, 1000n)).toBe(42n);
  });

  it('round-trip for value 1000', () => {
    const ct = encrypt(1000n, keyPair.publicKey, 77n);
    expect(decrypt(ct, keyPair.privateKey, 10000n)).toBe(1000n);
  });

  it('ciphertext is well-formed', () => {
    const ct = encrypt(5n, keyPair.publicKey, 123n);
    expect(verifyCiphertext(ct)).toBe(true);
  });

  it('different randomness produces different ciphertexts', () => {
    const ct1 = encrypt(5n, keyPair.publicKey, 1n);
    const ct2 = encrypt(5n, keyPair.publicKey, 2n);
    expect(ct1.c1_x).not.toEqual(ct2.c1_x);
  });
});

// ============================================================================
// Homomorphic Properties
// ============================================================================

describe('addCiphertexts (homomorphic)', () => {
  const keyPair = generateKeyPair();

  it('Enc(a) + Enc(b) decrypts to a + b', () => {
    const a = 7n;
    const b = 13n;
    const ctA = encrypt(a, keyPair.publicKey, 10n);
    const ctB = encrypt(b, keyPair.publicKey, 20n);
    const ctSum = addCiphertexts(ctA, ctB);
    expect(decrypt(ctSum, keyPair.privateKey, 100n)).toBe(a + b);
  });

  it('Enc(0) + Enc(x) = Enc(x)', () => {
    const x = 42n;
    const ctZero = encrypt(0n, keyPair.publicKey, 5n);
    const ctX = encrypt(x, keyPair.publicKey, 15n);
    const ctResult = addCiphertexts(ctZero, ctX);
    expect(decrypt(ctResult, keyPair.privateKey, 100n)).toBe(x);
  });
});

describe('subtractCiphertexts', () => {
  const keyPair = generateKeyPair();

  it('Enc(a) - Enc(b) decrypts to a - b when a > b', () => {
    const a = 20n;
    const b = 7n;
    const ctA = encrypt(a, keyPair.publicKey, 10n);
    const ctB = encrypt(b, keyPair.publicKey, 20n);
    const ctDiff = subtractCiphertexts(ctA, ctB);
    expect(decrypt(ctDiff, keyPair.privateKey, 100n)).toBe(a - b);
  });
});

// ============================================================================
// Point Compression
// ============================================================================

describe('compressPoint', () => {
  it('produces hex string with prefix 02 or 03', () => {
    const g = getGenerator();
    const compressed = compressPoint(g);
    expect(compressed.startsWith('02') || compressed.startsWith('03')).toBe(true);
  });

  it('preserves x coordinate', () => {
    const g = getGenerator();
    const compressed = compressPoint(g);
    const xHex = compressed.slice(2);
    expect(BigInt('0x' + xHex)).toBe(g.x);
  });

  it('sign bit reflects y parity', () => {
    const g = getGenerator();
    const compressed = compressPoint(g);
    const prefix = compressed.slice(0, 2);
    const expectedPrefix = (g.y & 1n) === 1n ? '03' : '02';
    expect(prefix).toBe(expectedPrefix);
  });
});

// ============================================================================
// Conversion Helpers
// ============================================================================

describe('ciphertextToFelts / feltsToChiphertext', () => {
  it('round-trip', () => {
    const ct = { c1_x: 1n, c1_y: 2n, c2_x: 3n, c2_y: 4n };
    const felts = ciphertextToFelts(ct);
    expect(felts).toHaveLength(4);
    const back = feltsToChiphertext(felts.map(BigInt));
    expect(back).toEqual(ct);
  });
});

describe('pointToFelts / feltsToPoint', () => {
  it('round-trip', () => {
    const g = getGenerator();
    const felts = pointToFelts(g);
    expect(felts).toHaveLength(2);
    const back = feltsToPoint(felts.map(BigInt));
    expect(back).toEqual(g);
  });
});

describe('generateKeyPair', () => {
  it('public key is on curve', () => {
    const kp = generateKeyPair();
    expect(isOnCurve(kp.publicKey)).toBe(true);
  });

  it('private key is in valid range', () => {
    const kp = generateKeyPair();
    expect(kp.privateKey > 0n).toBe(true);
    expect(kp.privateKey < CURVE_ORDER).toBe(true);
  });

  it('pk = sk * G', () => {
    const kp = generateKeyPair();
    const derivedPub = scalarMult(kp.privateKey, getGenerator());
    expect(derivedPub).toEqual(kp.publicKey);
  });
});
