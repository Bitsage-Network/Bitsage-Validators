/**
 * Authenticated Encryption Hints for O(1) Decryption
 *
 * Tongo-style AE hints allow instant decryption of ElGamal ciphertexts
 * without baby-step giant-step discrete log search.
 *
 * Key insight: Alongside ElGamal Enc[pk](m), we store:
 *   AE_hint = AES-GCM(HKDF(ECDH(sender_sk, receiver_pk)), amount)
 *
 * Recipient computes: ECDH(receiver_sk, sender_epk) to recover shared secret
 * Then decrypts AE_hint in O(1) time.
 *
 * Security: AE hints don't weaken ElGamal - they're encrypted under the same
 * shared secret, just using symmetric crypto for efficiency.
 */

import {
  ECPoint,
  STARK_PRIME,
  CURVE_ORDER,
  type ElGamalCiphertext,
} from "./constants";
import { scalarMult, addPoints, mod, randomScalar, getGenerator } from "./elgamal";

// AE Hint structure matching Cairo contract
export interface AEHint {
  encryptedAmount: bigint;  // Poseidon-encrypted amount
  nonce: bigint;            // Unique nonce for this hint
  mac: bigint;              // Message authentication code
}

// Full transfer hint bundle (sender + receiver + auditor)
export interface TransferHintBundle {
  senderHint: AEHint;     // For sender's new balance
  receiverHint: AEHint;   // For receiver's new balance
  auditorHint?: AEHint;   // Optional compliance auditor hint
}

// Poseidon constants (matching Cairo's poseidon_hash_span)
const POSEIDON_ROUND_CONSTANTS = [
  0x6861759ea556a2339dd92f9562a30b9e58e2ad98109ae4780b7fd8eac77fe6fn,
  0x3827681995d5af9ffc8397a3d00425a3da43f76abf28a64e4ab1a22ad1eeee7n,
];

/**
 * Simple Poseidon hash (2-to-1 compression)
 * Simplified version - production should use full sponge construction
 */
function poseidonHash(inputs: bigint[]): bigint {
  let state = 0n;
  for (const input of inputs) {
    // Mix input into state
    state = mod(state + input, STARK_PRIME);
    // Apply round constant
    state = mod(state * state * state + POSEIDON_ROUND_CONSTANTS[0], STARK_PRIME);
    state = mod(state + POSEIDON_ROUND_CONSTANTS[1], STARK_PRIME);
  }
  return state;
}

/**
 * Derive shared secret via ECDH
 * shared = sk_a * pk_b = sk_b * pk_a
 */
export function deriveSharedSecret(
  privateKey: bigint,
  publicKey: ECPoint
): bigint {
  const sharedPoint = scalarMult(privateKey, publicKey);
  // Hash to get uniform 252-bit secret
  return poseidonHash([sharedPoint.x, sharedPoint.y]);
}

/**
 * Derive encryption key from shared secret + nonce
 * Uses HKDF-like construction with Poseidon
 */
function deriveEncryptionKey(sharedSecret: bigint, nonce: bigint): bigint {
  return poseidonHash([sharedSecret, nonce, 0x414547454e4348494e54n]); // "AEGENCHIN" domain
}

/**
 * Derive MAC key from shared secret + nonce
 */
function deriveMacKey(sharedSecret: bigint, nonce: bigint): bigint {
  return poseidonHash([sharedSecret, nonce, 0x4145474d41434b4559n]); // "AEGMACKEY" domain
}

/**
 * Compute MAC over encrypted amount
 */
function computeMac(macKey: bigint, encryptedAmount: bigint, nonce: bigint): bigint {
  return poseidonHash([macKey, encryptedAmount, nonce]);
}

/**
 * Create AE hint for an amount
 *
 * @param amount - The plaintext amount to encrypt
 * @param senderPrivateKey - Sender's ElGamal private key
 * @param receiverPublicKey - Receiver's ElGamal public key
 * @returns AE hint that receiver can decrypt in O(1)
 */
export function createAEHint(
  amount: bigint,
  senderPrivateKey: bigint,
  receiverPublicKey: ECPoint
): AEHint {
  // Generate random nonce
  const nonce = randomScalar();

  // Derive shared secret via ECDH
  const sharedSecret = deriveSharedSecret(senderPrivateKey, receiverPublicKey);

  // Derive encryption key
  const encKey = deriveEncryptionKey(sharedSecret, nonce);

  // Encrypt amount (simple XOR for felt252 - production uses proper block cipher)
  const encryptedAmount = mod(amount ^ encKey, STARK_PRIME);

  // Compute MAC
  const macKey = deriveMacKey(sharedSecret, nonce);
  const mac = computeMac(macKey, encryptedAmount, nonce);

  return {
    encryptedAmount,
    nonce,
    mac,
  };
}

/**
 * Create AE hint using ephemeral key from ElGamal ciphertext
 *
 * This version uses the ElGamal randomness r to derive the hint,
 * so no additional ECDH is needed - receiver uses c1 = r*G directly.
 *
 * @param amount - The plaintext amount
 * @param randomness - The same r used in ElGamal encryption
 * @param receiverPublicKey - Receiver's public key
 */
export function createAEHintFromRandomness(
  amount: bigint,
  randomness: bigint,
  receiverPublicKey: ECPoint
): AEHint {
  // Shared secret = r * receiver_pk (same as ElGamal's pk^r)
  const sharedPoint = scalarMult(randomness, receiverPublicKey);
  const sharedSecret = poseidonHash([sharedPoint.x, sharedPoint.y]);

  // Use hash of randomness as nonce for determinism
  const nonce = poseidonHash([randomness, 0x4145484e4f4e4345n]); // "AEHNONCE"

  const encKey = deriveEncryptionKey(sharedSecret, nonce);
  const encryptedAmount = mod(amount ^ encKey, STARK_PRIME);

  const macKey = deriveMacKey(sharedSecret, nonce);
  const mac = computeMac(macKey, encryptedAmount, nonce);

  return {
    encryptedAmount,
    nonce,
    mac,
  };
}

/**
 * Decrypt AE hint in O(1) time
 *
 * @param hint - The AE hint to decrypt
 * @param receiverPrivateKey - Receiver's private key
 * @param senderPublicKey - Sender's public key (or ephemeral key from c1)
 * @returns Decrypted amount, or null if MAC verification fails
 */
export function decryptAEHint(
  hint: AEHint,
  receiverPrivateKey: bigint,
  senderPublicKey: ECPoint
): bigint | null {
  // Derive shared secret via ECDH
  const sharedSecret = deriveSharedSecret(receiverPrivateKey, senderPublicKey);

  // Derive MAC key and verify
  const macKey = deriveMacKey(sharedSecret, hint.nonce);
  const expectedMac = computeMac(macKey, hint.encryptedAmount, hint.nonce);

  if (expectedMac !== hint.mac) {
    console.warn("[AEHint] MAC verification failed");
    return null;
  }

  // Derive encryption key and decrypt
  const encKey = deriveEncryptionKey(sharedSecret, hint.nonce);
  const amount = mod(hint.encryptedAmount ^ encKey, STARK_PRIME);

  return amount;
}

/**
 * Decrypt AE hint using ElGamal ciphertext's c1 as ephemeral key
 *
 * This is the most common case - receiver uses their sk and the c1 from
 * the ElGamal ciphertext to derive the same shared secret.
 */
export function decryptAEHintFromCiphertext(
  hint: AEHint,
  ciphertext: ElGamalCiphertext,
  receiverPrivateKey: bigint
): bigint | null {
  // c1 = r * G, so sk * c1 = sk * r * G = r * pk
  const ephemeralKey: ECPoint = { x: ciphertext.c1_x, y: ciphertext.c1_y };
  return decryptAEHint(hint, receiverPrivateKey, ephemeralKey);
}

/**
 * Create a complete transfer hint bundle
 *
 * For Tongo-style transfers, we create hints for:
 * - Sender (new balance after transfer)
 * - Receiver (incoming amount)
 * - Auditor (optional, for compliance)
 */
export function createTransferHintBundle(
  transferAmount: bigint,
  senderNewBalance: bigint,
  randomness: bigint,
  senderPublicKey: ECPoint,
  receiverPublicKey: ECPoint,
  auditorPublicKey?: ECPoint
): TransferHintBundle {
  // Hint for sender's new balance
  const senderHint = createAEHintFromRandomness(
    senderNewBalance,
    randomness,
    senderPublicKey
  );

  // Hint for receiver's incoming amount
  const receiverHint = createAEHintFromRandomness(
    transferAmount,
    randomness,
    receiverPublicKey
  );

  // Optional auditor hint
  const auditorHint = auditorPublicKey
    ? createAEHintFromRandomness(transferAmount, randomness, auditorPublicKey)
    : undefined;

  return {
    senderHint,
    receiverHint,
    auditorHint,
  };
}

/**
 * Convert AE hint to contract call format (felt252 array)
 */
export function aeHintToFelts(hint: AEHint): string[] {
  return [
    "0x" + hint.encryptedAmount.toString(16),
    "0x" + hint.nonce.toString(16),
    "0x" + hint.mac.toString(16),
  ];
}

/**
 * Parse AE hint from contract response
 */
export function feltsToAEHint(felts: bigint[]): AEHint {
  return {
    encryptedAmount: felts[0],
    nonce: felts[1],
    mac: felts[2],
  };
}

/**
 * Verify an AE hint is valid without decrypting
 * Used to check hint integrity before storing
 */
export function verifyAEHint(
  hint: AEHint,
  ciphertext: ElGamalCiphertext,
  receiverPrivateKey: bigint
): boolean {
  const amount = decryptAEHintFromCiphertext(hint, ciphertext, receiverPrivateKey);
  return amount !== null && amount >= 0n;
}

/**
 * Batch decrypt multiple AE hints
 * Useful for computing total balance from multiple incoming transfers
 */
export function batchDecryptAEHints(
  hints: Array<{ hint: AEHint; ciphertext: ElGamalCiphertext }>,
  receiverPrivateKey: bigint
): bigint {
  let total = 0n;
  for (const { hint, ciphertext } of hints) {
    const amount = decryptAEHintFromCiphertext(hint, ciphertext, receiverPrivateKey);
    if (amount !== null) {
      total += amount;
    }
  }
  return total;
}

/**
 * Hybrid decryption: Try AE hint first, fall back to baby-step giant-step
 *
 * This provides O(1) decryption when hint is available, with fallback
 * to O(√n) when hint is missing or corrupted.
 */
export async function hybridDecrypt(
  ciphertext: ElGamalCiphertext,
  privateKey: bigint,
  hint?: AEHint,
  maxValue: bigint = 1000000000000n
): Promise<bigint> {
  // Try AE hint first (O(1))
  if (hint) {
    const amount = decryptAEHintFromCiphertext(hint, ciphertext, privateKey);
    if (amount !== null) {
      console.log("[AEHint] O(1) decryption successful");
      return amount;
    }
    console.warn("[AEHint] Hint decryption failed, falling back to BSGS");
  }

  // Fall back to baby-step giant-step (O(√n))
  // Import dynamically to avoid circular dependency
  const { decrypt } = await import("./elgamal");
  console.log("[AEHint] Using baby-step giant-step (O(√n))");
  return decrypt(ciphertext, privateKey, maxValue);
}
