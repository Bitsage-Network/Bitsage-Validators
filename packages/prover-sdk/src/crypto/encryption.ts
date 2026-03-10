/**
 * @bitsage/prover-sdk - Witness Encryption
 *
 * Cryptographic utilities for encrypting witness data for TEE transport.
 * Uses ECDH key exchange + AES-GCM for confidential witness transmission.
 */

import { PrivateInputs } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface EncryptionResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  ephemeralPublicKey: Uint8Array;
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

// ============================================================================
// ECDH Key Exchange
// ============================================================================

/**
 * Generate ephemeral ECDH key pair
 */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
}

/**
 * Export public key to raw bytes
 */
export async function exportPublicKey(keyPair: CryptoKeyPair): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return new Uint8Array(raw);
}

/**
 * Import public key from raw bytes
 */
export async function importPublicKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    bytes as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

/**
 * Derive shared secret via ECDH
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  return new Uint8Array(bits);
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive AES key from shared secret using HKDF
 */
export async function deriveAESKey(
  sharedSecret: Uint8Array,
  info = 'bitsage-witness-encryption'
): Promise<CryptoKey> {
  // Import as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0), // No salt (ephemeral keys provide freshness)
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// AES-GCM Encryption
// ============================================================================

/**
 * Encrypt data with AES-GCM
 */
export async function encryptAESGCM(
  data: Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
  };
}

/**
 * Decrypt data with AES-GCM
 */
export async function decryptAESGCM(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );

  return new Uint8Array(plaintext);
}

// ============================================================================
// Witness Encryption (High-Level API)
// ============================================================================

/**
 * Encrypt private inputs for TEE transport
 */
export async function encryptWitnessForTEE(
  privateInputs: PrivateInputs,
  enclavePublicKey: Uint8Array
): Promise<EncryptionResult> {
  // Generate ephemeral key pair
  const ephemeralKeyPair = await generateEphemeralKeyPair();
  const ephemeralPublicKey = await exportPublicKey(ephemeralKeyPair);

  // Import enclave public key
  const enclaveKey = await importPublicKey(enclavePublicKey);

  // Derive shared secret
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    enclaveKey
  );

  // Derive AES key
  const aesKey = await deriveAESKey(sharedSecret);

  // Serialize private inputs
  const plaintext = new TextEncoder().encode(JSON.stringify(privateInputs));

  // Encrypt
  const { ciphertext, iv } = await encryptAESGCM(plaintext, aesKey);

  return {
    ciphertext,
    iv,
    ephemeralPublicKey,
  };
}

/**
 * Decrypt private inputs from TEE transport (for testing)
 */
export async function decryptWitnessFromTEE(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  enclavePrivateKey: CryptoKey
): Promise<PrivateInputs> {
  // Import ephemeral public key
  const ephemeralKey = await importPublicKey(ephemeralPublicKey);

  // Derive shared secret
  const sharedSecret = await deriveSharedSecret(enclavePrivateKey, ephemeralKey);

  // Derive AES key
  const aesKey = await deriveAESKey(sharedSecret);

  // Decrypt
  const plaintext = await decryptAESGCM(ciphertext, iv, aesKey);

  // Parse JSON
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Compute SHA-256 hash
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(hash);
}

/**
 * Constant-time comparison (prevents timing attacks)
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}
