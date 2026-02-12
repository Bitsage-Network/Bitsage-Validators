/**
 * ElGamal Encryption on Stark Curve
 *
 * Implements ElGamal encryption scheme using the Stark curve.
 * Provides homomorphic addition for encrypted balances.
 */

import {
  STARK_PRIME,
  CURVE_ORDER,
  GENERATOR_X,
  GENERATOR_Y,
  PEDERSEN_H_X,
  PEDERSEN_H_Y,
  CURVE_A,
  POINT_AT_INFINITY,
  type ECPoint,
  type ElGamalCiphertext,
  type PrivacyKeyPair,
} from "./constants";

// Modular arithmetic helpers
export function mod(a: bigint, m: bigint): bigint {
  const result = a % m;
  return result < 0n ? result + m : result;
}

export function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = old_r / r;
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }

  return mod(old_s, m);
}

export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  base = mod(base, m);
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = mod(result * base, m);
    }
    exp = exp >> 1n;
    base = mod(base * base, m);
  }
  return result;
}

// Check if point is the point at infinity
export function isInfinity(p: ECPoint): boolean {
  return p.x === 0n && p.y === 0n;
}

// Check if point is on the curve
export function isOnCurve(p: ECPoint): boolean {
  if (isInfinity(p)) return true;
  const left = mod(p.y * p.y, STARK_PRIME);
  const right = mod(p.x * p.x * p.x + CURVE_A * p.x + BigInt("0x6f21413efbe40de150e596d72f7a8c5609ad26c15c915c1f4cdfcb99cee9e89"), STARK_PRIME);
  return left === right;
}

// Point negation
export function negatePoint(p: ECPoint): ECPoint {
  if (isInfinity(p)) return POINT_AT_INFINITY;
  return { x: p.x, y: mod(-p.y, STARK_PRIME) };
}

// Point addition (handles edge cases)
export function addPoints(p1: ECPoint, p2: ECPoint): ECPoint {
  if (isInfinity(p1)) return p2;
  if (isInfinity(p2)) return p1;

  // Check if points are inverses
  if (p1.x === p2.x && p1.y === mod(-p2.y, STARK_PRIME)) {
    return POINT_AT_INFINITY;
  }

  let slope: bigint;

  if (p1.x === p2.x && p1.y === p2.y) {
    // Point doubling
    const numerator = mod(3n * p1.x * p1.x + CURVE_A, STARK_PRIME);
    const denominator = modInverse(mod(2n * p1.y, STARK_PRIME), STARK_PRIME);
    slope = mod(numerator * denominator, STARK_PRIME);
  } else {
    // Point addition
    const numerator = mod(p2.y - p1.y, STARK_PRIME);
    const denominator = modInverse(mod(p2.x - p1.x, STARK_PRIME), STARK_PRIME);
    slope = mod(numerator * denominator, STARK_PRIME);
  }

  const x3 = mod(slope * slope - p1.x - p2.x, STARK_PRIME);
  const y3 = mod(slope * (p1.x - x3) - p1.y, STARK_PRIME);

  return { x: x3, y: y3 };
}

// Scalar multiplication using double-and-add
export function scalarMult(k: bigint, p: ECPoint): ECPoint {
  if (k === 0n || isInfinity(p)) return POINT_AT_INFINITY;
  if (k < 0n) {
    k = mod(-k, CURVE_ORDER);
    p = negatePoint(p);
  }
  k = mod(k, CURVE_ORDER);

  let result = POINT_AT_INFINITY;
  let addend = p;

  while (k > 0n) {
    if (k & 1n) {
      result = addPoints(result, addend);
    }
    addend = addPoints(addend, addend);
    k = k >> 1n;
  }

  return result;
}

// Get the generator point G
export function getGenerator(): ECPoint {
  return { x: GENERATOR_X, y: GENERATOR_Y };
}

// Get the Pedersen H generator (second generator for amount encoding)
// Using H instead of G prevents revealing amount through discrete log attacks
export function getPedersenH(): ECPoint {
  return { x: PEDERSEN_H_X, y: PEDERSEN_H_Y };
}

// Generate a random scalar (for private key or randomness)
export function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let scalar = 0n;
  for (let i = 0; i < 32; i++) {
    scalar = (scalar << 8n) | BigInt(bytes[i]);
  }
  return mod(scalar, CURVE_ORDER);
}

// Generate a privacy keypair
export function generateKeyPair(): PrivacyKeyPair {
  const privateKey = randomScalar();
  const publicKey = scalarMult(privateKey, getGenerator());
  return { privateKey, publicKey };
}

// ElGamal encryption for amount hiding
// Encrypts amount m as: C = (C1, C2) where:
//   C1 = r * G (ephemeral public key)
//   C2 = m * H + r * PK (encrypted amount using Pedersen H)
//
// Using H (not G) for amount encoding is CRITICAL:
// - Prevents revealing amount through discrete log on G
// - Allows homomorphic addition on encrypted amounts
// - Matches contract's expectation for amount_commitment
export function encrypt(
  message: bigint,
  publicKey: ECPoint,
  randomness?: bigint
): ElGamalCiphertext {
  const r = randomness ?? randomScalar();
  const g = getGenerator();
  const h = getPedersenH();

  // C1 = r * G (randomness point / ephemeral key)
  const c1 = scalarMult(r, g);

  // C2 = m * H + r * PK (encrypted amount)
  // Using H for amount encoding provides proper hiding
  const mH = scalarMult(message, h);
  const pkR = scalarMult(r, publicKey);
  const c2 = addPoints(mH, pkR);

  return {
    c1_x: c1.x,
    c1_y: c1.y,
    c2_x: c2.x,
    c2_y: c2.y,
  };
}

// ElGamal decryption
// Recovers m from C = (C1, C2) using private key sk:
//   m * H = C2 - sk * C1
//        = (m * H + r * PK) - sk * (r * G)
//        = m * H + r * sk * G - sk * r * G  (since PK = sk * G)
//        = m * H
// Then solve discrete log base H to find m (only works for small m)
export function decrypt(
  ciphertext: ElGamalCiphertext,
  privateKey: bigint,
  maxValue: bigint = 1000000000000n // Max balance to search
): bigint {
  const c1: ECPoint = { x: ciphertext.c1_x, y: ciphertext.c1_y };
  const c2: ECPoint = { x: ciphertext.c2_x, y: ciphertext.c2_y };

  // Compute C2 - sk * C1 = m * H
  const c1Sk = scalarMult(privateKey, c1);
  const negC1Sk = negatePoint(c1Sk);
  const mH = addPoints(c2, negC1Sk);

  // Baby-step giant-step to find m where m * H = mH
  // Uses H generator instead of G
  return babystepGiantstepH(mH, maxValue);
}

// Baby-step giant-step for discrete log base G (for small values only)
function babystepGiantstep(target: ECPoint, maxValue: bigint): bigint {
  const g = getGenerator();
  const m = BigInt(Math.ceil(Math.sqrt(Number(maxValue))));

  // Baby steps: compute i*G for i = 0 to m-1
  const babySteps = new Map<string, bigint>();
  let current = POINT_AT_INFINITY;
  for (let i = 0n; i <= m; i++) {
    const key = `${current.x.toString(16)}_${current.y.toString(16)}`;
    babySteps.set(key, i);
    current = addPoints(current, g);
  }

  // Giant steps: compute target - j*m*G for j = 0 to m
  const mG = scalarMult(m, g);
  const negMG = negatePoint(mG);
  current = target;
  for (let j = 0n; j <= m; j++) {
    const key = `${current.x.toString(16)}_${current.y.toString(16)}`;
    const i = babySteps.get(key);
    if (i !== undefined) {
      return j * m + i;
    }
    current = addPoints(current, negMG);
  }

  throw new Error("Discrete log not found within range");
}

// Baby-step giant-step for discrete log base H (Pedersen generator)
// Used for decrypting amounts encrypted with H
function babystepGiantstepH(target: ECPoint, maxValue: bigint): bigint {
  const h = getPedersenH();
  const m = BigInt(Math.ceil(Math.sqrt(Number(maxValue))));

  // Baby steps: compute i*H for i = 0 to m-1
  const babySteps = new Map<string, bigint>();
  let current = POINT_AT_INFINITY;
  for (let i = 0n; i <= m; i++) {
    const key = `${current.x.toString(16)}_${current.y.toString(16)}`;
    babySteps.set(key, i);
    current = addPoints(current, h);
  }

  // Giant steps: compute target - j*m*H for j = 0 to m
  const mH = scalarMult(m, h);
  const negMH = negatePoint(mH);
  current = target;
  for (let j = 0n; j <= m; j++) {
    const key = `${current.x.toString(16)}_${current.y.toString(16)}`;
    const i = babySteps.get(key);
    if (i !== undefined) {
      return j * m + i;
    }
    current = addPoints(current, negMH);
  }

  throw new Error("Discrete log not found within range");
}

// Homomorphic addition of two ciphertexts
// Enc(m1) + Enc(m2) = Enc(m1 + m2)
export function addCiphertexts(
  c1: ElGamalCiphertext,
  c2: ElGamalCiphertext
): ElGamalCiphertext {
  const c1_1: ECPoint = { x: c1.c1_x, y: c1.c1_y };
  const c1_2: ECPoint = { x: c1.c2_x, y: c1.c2_y };
  const c2_1: ECPoint = { x: c2.c1_x, y: c2.c1_y };
  const c2_2: ECPoint = { x: c2.c2_x, y: c2.c2_y };

  const newC1 = addPoints(c1_1, c2_1);
  const newC2 = addPoints(c1_2, c2_2);

  return {
    c1_x: newC1.x,
    c1_y: newC1.y,
    c2_x: newC2.x,
    c2_y: newC2.y,
  };
}

// Subtract ciphertext: Enc(m1) - Enc(m2) = Enc(m1 - m2)
export function subtractCiphertexts(
  c1: ElGamalCiphertext,
  c2: ElGamalCiphertext
): ElGamalCiphertext {
  const c2_1: ECPoint = { x: c2.c1_x, y: c2.c1_y };
  const c2_2: ECPoint = { x: c2.c2_x, y: c2.c2_y };

  const negC2: ElGamalCiphertext = {
    c1_x: negatePoint(c2_1).x,
    c1_y: negatePoint(c2_1).y,
    c2_x: negatePoint(c2_2).x,
    c2_y: negatePoint(c2_2).y,
  };

  return addCiphertexts(c1, negC2);
}

// Re-randomize a ciphertext (same plaintext, new randomness)
export function rerandomize(
  ciphertext: ElGamalCiphertext,
  publicKey: ECPoint
): ElGamalCiphertext {
  const zeroEncryption = encrypt(0n, publicKey);
  return addCiphertexts(ciphertext, zeroEncryption);
}

// Scalar multiplication of ciphertext: k * Enc(m) = Enc(k*m)
export function scalarMultCiphertext(
  k: bigint,
  ciphertext: ElGamalCiphertext
): ElGamalCiphertext {
  const c1: ECPoint = { x: ciphertext.c1_x, y: ciphertext.c1_y };
  const c2: ECPoint = { x: ciphertext.c2_x, y: ciphertext.c2_y };

  const newC1 = scalarMult(k, c1);
  const newC2 = scalarMult(k, c2);

  return {
    c1_x: newC1.x,
    c1_y: newC1.y,
    c2_x: newC2.x,
    c2_y: newC2.y,
  };
}

// Verify a ciphertext is well-formed (both points are on curve)
export function verifyCiphertext(ciphertext: ElGamalCiphertext): boolean {
  const c1: ECPoint = { x: ciphertext.c1_x, y: ciphertext.c1_y };
  const c2: ECPoint = { x: ciphertext.c2_x, y: ciphertext.c2_y };
  return isOnCurve(c1) && isOnCurve(c2);
}

// Convert ciphertext to felt252 array for contract calls
export function ciphertextToFelts(ciphertext: ElGamalCiphertext): string[] {
  return [
    "0x" + ciphertext.c1_x.toString(16),
    "0x" + ciphertext.c1_y.toString(16),
    "0x" + ciphertext.c2_x.toString(16),
    "0x" + ciphertext.c2_y.toString(16),
  ];
}

// Parse ciphertext from contract response
export function feltsToChiphertext(felts: bigint[]): ElGamalCiphertext {
  return {
    c1_x: felts[0],
    c1_y: felts[1],
    c2_x: felts[2],
    c2_y: felts[3],
  };
}

// Convert ECPoint to felt252 array
export function pointToFelts(point: ECPoint): string[] {
  return ["0x" + point.x.toString(16), "0x" + point.y.toString(16)];
}

// Parse ECPoint from contract response
export function feltsToPoint(felts: bigint[]): ECPoint {
  return { x: felts[0], y: felts[1] };
}

// Export point in compressed format (x-coordinate + sign bit)
export function compressPoint(point: ECPoint): string {
  const signBit = point.y & 1n;
  return (signBit === 1n ? "03" : "02") + point.x.toString(16).padStart(64, "0");
}

// Decompress point from compressed format
export function decompressPoint(compressed: string): ECPoint {
  const signBit = compressed.slice(0, 2) === "03" ? 1n : 0n;
  const x = BigInt("0x" + compressed.slice(2));

  // y^2 = x^3 + ax + b
  const y2 = mod(
    x * x * x + CURVE_A * x + BigInt("0x6f21413efbe40de150e596d72f7a8c5609ad26c15c915c1f4cdfcb99cee9e89"),
    STARK_PRIME
  );

  // Tonelli-Shanks for square root (simplified for Stark prime)
  const y = modPow(y2, (STARK_PRIME + 1n) / 4n, STARK_PRIME);

  // Select correct y based on sign bit
  const finalY = (y & 1n) === signBit ? y : mod(-y, STARK_PRIME);

  return { x, y: finalY };
}
