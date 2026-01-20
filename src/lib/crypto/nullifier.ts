/**
 * Nullifier Derivation for Privacy Pool
 *
 * Nullifiers are unique identifiers derived from secret data
 * that prevent double-spending without revealing the note.
 *
 * Nullifier = H(nullifier_secret, leaf_index)
 *
 * Uses Starknet's Poseidon hash - the ZK-friendly hash function
 * that is efficient for STARK circuits.
 */

import { hash } from "starknet";
import { CURVE_ORDER } from "./constants";
import { mod, randomScalar } from "./elgamal";

/**
 * Poseidon hash using Starknet's implementation
 * This is the production-ready cryptographic hash function.
 *
 * Poseidon is SNARK-friendly and used throughout Starknet for:
 * - Pedersen commitments
 * - Merkle trees
 * - Nullifier derivation
 */
function poseidonHash(inputs: bigint[]): bigint {
  if (inputs.length === 0) {
    throw new Error("Poseidon hash requires at least one input");
  }

  // Convert bigints to hex strings for starknet.js
  const hexInputs = inputs.map((input) => {
    const modInput = mod(input, CURVE_ORDER);
    return "0x" + modInput.toString(16);
  });

  // Use Starknet's Poseidon hash
  // For single input, use computePoseidonHash
  // For multiple inputs, chain them using computePoseidonHashOnElements
  let result: string;

  if (hexInputs.length === 1) {
    // Single input - hash with zero
    result = hash.computePoseidonHash(hexInputs[0], "0x0");
  } else if (hexInputs.length === 2) {
    // Two inputs - direct hash
    result = hash.computePoseidonHash(hexInputs[0], hexInputs[1]);
  } else {
    // Multiple inputs - use hash chain
    result = hash.computePoseidonHashOnElements(hexInputs);
  }

  return BigInt(result);
}

/**
 * Pedersen hash for compatibility with older contracts
 * Some contracts may still use Pedersen instead of Poseidon
 */
function pedersenHash(inputs: bigint[]): bigint {
  if (inputs.length === 0) {
    throw new Error("Pedersen hash requires at least one input");
  }

  const hexInputs = inputs.map((input) => {
    const modInput = mod(input, CURVE_ORDER);
    return "0x" + modInput.toString(16);
  });

  // Use Starknet's Pedersen hash
  let result: string;

  if (hexInputs.length === 1) {
    result = hash.computePedersenHash(hexInputs[0], "0x0");
  } else if (hexInputs.length === 2) {
    result = hash.computePedersenHash(hexInputs[0], hexInputs[1]);
  } else {
    result = hash.computePedersenHashOnElements(hexInputs);
  }

  return BigInt(result);
}

// Export hash functions for use in other modules
export { poseidonHash, pedersenHash };

// Generate a random nullifier secret
export function generateNullifierSecret(): bigint {
  return randomScalar();
}

// Derive nullifier from secret and leaf index
// Nullifier = H(nullifier_secret, leaf_index)
export function deriveNullifier(
  nullifierSecret: bigint,
  leafIndex: number
): bigint {
  return poseidonHash([nullifierSecret, BigInt(leafIndex)]);
}

// Derive nullifier with additional domain separation
export function deriveNullifierWithDomain(
  nullifierSecret: bigint,
  leafIndex: number,
  domain: string
): bigint {
  const domainHash = stringToBigint(domain);
  return poseidonHash([domainHash, nullifierSecret, BigInt(leafIndex)]);
}

// Convert string to bigint for hashing
function stringToBigint(str: string): bigint {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    result = (result << 8n) | BigInt(str.charCodeAt(i));
  }
  return mod(result, CURVE_ORDER);
}

// Check if a nullifier has been used (call contract)
export async function isNullifierSpent(
  nullifier: bigint,
  contractRead: (nullifier: string) => Promise<boolean>
): Promise<boolean> {
  const nullifierHex = "0x" + nullifier.toString(16);
  return contractRead(nullifierHex);
}

// Convert nullifier to felt252 string
export function nullifierToFelt(nullifier: bigint): string {
  return "0x" + nullifier.toString(16);
}

// Parse nullifier from felt252 string
export function feltToNullifier(felt: string): bigint {
  return BigInt(felt);
}

// Nullifier commitment for ZK proof
// Proves: "I know a secret s such that H(s, idx) = nullifier"
// without revealing s or idx
export interface NullifierWitness {
  nullifierSecret: bigint;
  leafIndex: number;
  nullifier: bigint;
}

export function createNullifierWitness(
  nullifierSecret: bigint,
  leafIndex: number
): NullifierWitness {
  const nullifier = deriveNullifier(nullifierSecret, leafIndex);
  return {
    nullifierSecret,
    leafIndex,
    nullifier,
  };
}

// Verify nullifier derivation (for testing)
export function verifyNullifierDerivation(witness: NullifierWitness): boolean {
  const expectedNullifier = deriveNullifier(
    witness.nullifierSecret,
    witness.leafIndex
  );
  return expectedNullifier === witness.nullifier;
}

// Batch nullifier derivation (for efficiency)
export function deriveNullifierBatch(
  secrets: bigint[],
  indices: number[]
): bigint[] {
  if (secrets.length !== indices.length) {
    throw new Error("Secrets and indices must have same length");
  }
  return secrets.map((secret, i) => deriveNullifier(secret, indices[i]));
}

// Key image for ring signatures (alternative nullifier scheme)
// Used in mixing router for Monero-style privacy
export interface KeyImage {
  x: bigint;
  y: bigint;
}

// Derive key image from private key
// KeyImage = sk * H_p(P) where P = sk * G
export function deriveKeyImage(
  privateKey: bigint,
  publicKeyX: bigint,
  publicKeyY: bigint
): KeyImage {
  // Hash public key to curve point
  const hashPoint = hashToCurvePoint(publicKeyX, publicKeyY);

  // Key image = sk * H_p(P)
  // Simplified: just hash and multiply
  const imageX = mod(privateKey * hashPoint.x, CURVE_ORDER);
  const imageY = mod(privateKey * hashPoint.y, CURVE_ORDER);

  return { x: imageX, y: imageY };
}

/**
 * Hash to curve point using Poseidon
 * This derives a deterministic curve point from input coordinates.
 *
 * Note: This is a simplified implementation that hashes to a scalar
 * and derives a point. For full security in production, consider
 * using a proper hash-to-curve implementation like Elligator2.
 */
function hashToCurvePoint(x: bigint, y: bigint): { x: bigint; y: bigint } {
  // Hash the coordinates using Poseidon
  const h1 = poseidonHash([x, y]);
  const h2 = poseidonHash([y, x, h1]);

  // Derive point coordinates (simplified - assumes valid curve points)
  // In a full implementation, we would use try-and-increment or Elligator
  const pointX = mod(h1, CURVE_ORDER);
  const pointY = mod(h2, CURVE_ORDER);

  return { x: pointX, y: pointY };
}

// Check if key image has been used (prevents double-spending in mixing)
export async function isKeyImageUsed(
  keyImage: KeyImage,
  contractRead: (x: string, y: string) => Promise<boolean>
): Promise<boolean> {
  const xHex = "0x" + keyImage.x.toString(16);
  const yHex = "0x" + keyImage.y.toString(16);
  return contractRead(xHex, yHex);
}

// Stealth address nullifier (for stealth payments)
export function deriveStealthNullifier(
  viewKey: bigint,
  spendKey: bigint,
  ephemeralPubKey: { x: bigint; y: bigint }
): bigint {
  return poseidonHash([viewKey, spendKey, ephemeralPubKey.x, ephemeralPubKey.y]);
}

// View tag for efficient scanning (FMD)
// First 2 bytes of hash for quick filtering
export function deriveViewTag(
  sharedSecret: bigint,
  outputIndex: number
): number {
  const hash = poseidonHash([sharedSecret, BigInt(outputIndex)]);
  // Return first 16 bits as view tag
  return Number(hash & 0xFFFFn);
}

// Check if view tag matches (for FMD scanning)
export function matchViewTag(
  viewKey: bigint,
  ephemeralPubKey: { x: bigint; y: bigint },
  outputIndex: number,
  expectedTag: number
): boolean {
  // Compute shared secret (simplified ECDH)
  const sharedSecret = poseidonHash([viewKey, ephemeralPubKey.x, ephemeralPubKey.y]);
  const derivedTag = deriveViewTag(sharedSecret, outputIndex);
  return derivedTag === expectedTag;
}
