/**
 * @obelyzk/prover-sdk - Crypto Module
 */

export {
  generateEphemeralKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  deriveAESKey,
  encryptAESGCM,
  decryptAESGCM,
  encryptWitnessForTEE,
  decryptWitnessFromTEE,
  bytesToHex,
  hexToBytes,
  sha256,
  constantTimeEqual,
  type EncryptionResult,
  type KeyPair,
} from './encryption';
