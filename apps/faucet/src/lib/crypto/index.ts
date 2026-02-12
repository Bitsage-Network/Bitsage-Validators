/**
 * BitSage Privacy Crypto Module
 *
 * Exports all cryptographic primitives for privacy operations:
 * - ElGamal encryption
 * - Pedersen commitments
 * - Merkle tree proofs
 * - Nullifier derivation
 * - Key storage
 */

// Constants and types
export {
  STARK_PRIME,
  CURVE_ORDER,
  GENERATOR_X,
  GENERATOR_Y,
  PEDERSEN_H_X,
  PEDERSEN_H_Y,
  CURVE_A,
  CURVE_B,
  POINT_AT_INFINITY,
  PRIVACY_DENOMINATIONS,
  KEY_DERIVATION_DOMAIN,
  PRIVACY_DB_NAME,
  PRIVACY_DB_VERSION,
  KEY_STORE_NAME,
  NOTE_STORE_NAME,
  PROVING_KEY_STORE_NAME,
  type ECPoint,
  type ElGamalCiphertext,
  type PrivacyKeyPair,
  type StoredPrivacyKey,
  type PrivacyNote,
  type PrivacyDenomination,
  type CircuitType,
} from "./constants";

// ElGamal encryption
export {
  mod,
  modInverse,
  modPow,
  isInfinity,
  isOnCurve,
  negatePoint,
  addPoints,
  scalarMult,
  getGenerator,
  randomScalar,
  generateKeyPair,
  encrypt,
  decrypt,
  addCiphertexts,
  subtractCiphertexts,
  rerandomize,
  scalarMultCiphertext,
  verifyCiphertext,
  ciphertextToFelts,
  feltsToChiphertext,
  pointToFelts,
  feltsToPoint,
  compressPoint,
  decompressPoint,
} from "./elgamal";

// Pedersen commitments
export {
  getPedersenH,
  commit,
  commitWithRandomBlinding,
  verifyOpening,
  addCommitments,
  subtractCommitments,
  scalarMultCommitment,
  verifyCommitment,
  commitmentToFelt,
  createNote,
  serializeNote,
  deserializeNote,
  valueToFixedDenomination,
  fixedDenominationToValue,
  generateRangeProof,
  verifyRangeProof,
  commitmentToContractFormat,
  type NoteData,
  type RangeProofData,
} from "./pedersen";

// Nullifier derivation
export {
  generateNullifierSecret,
  deriveNullifier,
  deriveNullifierWithDomain,
  isNullifierSpent,
  nullifierToFelt,
  feltToNullifier,
  createNullifierWitness,
  verifyNullifierDerivation,
  deriveNullifierBatch,
  deriveKeyImage,
  isKeyImageUsed,
  deriveStealthNullifier,
  deriveViewTag,
  matchViewTag,
  type NullifierWitness,
  type KeyImage,
} from "./nullifier";

// Merkle tree
export {
  EMPTY_LEAF,
  TREE_DEPTH,
  getZeroHash,
  initLeanIMT,
  insertLeaf,
  getMerkleProof,
  verifyMerkleProof,
  computeRootFromProof,
  getLeafIndex,
  proofToContractFormat,
  contractFormatToProof,
  fetchLeavesFromContract,
  sparseToRegularProof,
  getBatchMerkleProofs,
  fetchPoolMerkleState,
  computeCommitmentHash,
  type MerkleProof,
  type LeanIMTState,
  type SparseMerkleProof,
  type PrivacyPoolMerkleState,
} from "./merkle";

// Key storage
export {
  getKeyDerivationMessage,
  deriveKEK,
  generateAndStoreKey,
  getStoredPublicKey,
  loadPrivateKey,
  loadKeyPair,
  hasStoredKey,
  rotateKeys,
  deleteKeys,
  saveNote,
  getNotes,
  getUnspentNotes,
  markNoteSpent,
  deleteNote,
  getUnspentBalance,
  clearAllData,
  exportKeys,
  importKeys,
} from "./keyStore";

// AE Hints for O(1) decryption (Tongo-style)
export {
  createAEHint,
  createAEHintFromRandomness,
  decryptAEHint,
  decryptAEHintFromCiphertext,
  createTransferHintBundle,
  aeHintToFelts,
  feltsToAEHint,
  verifyAEHint,
  batchDecryptAEHints,
  hybridDecrypt,
  deriveSharedSecret,
  type AEHint,
  type TransferHintBundle,
} from "./aeHints";

// ZK Proofs for confidential transfers
export {
  // Schnorr proofs
  generateSchnorrProof,
  verifySchnorrProof,
  // Range proofs (aliased to avoid collision with pedersen)
  generateRangeProof as generateZKRangeProof,
  verifyRangeProof as verifyZKRangeProof,
  // Balance proofs
  generateBalanceProof,
  // Same-encryption proofs
  generateSameEncryptionProof,
  verifySameEncryptionProof,
  // Complete transfer proofs
  generateTransferProof,
  transferProofToCalldata,
  verifyTransferProof,
  computeChallenge,
  // Types
  type SchnorrProof,
  type RangeProof as ZKRangeProof,
  type BalanceProof,
  type SameEncryptionProof,
  type TransferProof,
} from "./zkProofs";
