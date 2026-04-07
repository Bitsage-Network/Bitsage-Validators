/**
 * @obelyzk/prover-sdk - TEE Proxy
 *
 * Proxy for TEE-assisted proof generation with encrypted witness transport.
 * Handles ECDH key exchange, witness encryption, and attestation verification.
 */

import {
  CircuitType,
  Witness,
  EncryptedWitness,
  TEEAttestation,
  ProverError,
  ProverErrorCode,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

const ATTESTATION_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// TEE Proxy Implementation
// ============================================================================

export class TEEProxy {
  private coordinatorUrl: string;
  private apiKey?: string;
  private enclavePublicKey: Uint8Array | null = null;
  private attestation: TEEAttestation | null = null;
  private sharedSecret: Uint8Array | null = null;
  private ephemeralKeyPair: CryptoKeyPair | null = null;

  constructor(coordinatorUrl: string, apiKey?: string) {
    this.coordinatorUrl = coordinatorUrl;
    this.apiKey = apiKey;
  }

  // ==========================================================================
  // Key Exchange & Attestation
  // ==========================================================================

  /**
   * Get enclave public key and attestation from coordinator
   */
  async getEnclaveKey(): Promise<{ publicKey: Uint8Array; attestation: TEEAttestation }> {
    // Check if we have a valid cached attestation
    if (this.attestation && this.enclavePublicKey) {
      const age = Date.now() - this.attestation.timestamp;
      if (age < ATTESTATION_VALIDITY_MS) {
        return {
          publicKey: this.enclavePublicKey,
          attestation: this.attestation,
        };
      }
    }

    // Request fresh attestation
    const response = await fetch(`${this.coordinatorUrl}/api/v1/tee/attestation`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new ProverError(
        'Failed to get enclave attestation',
        ProverErrorCode.ATTESTATION_FAILED
      );
    }

    const data = await response.json();

    // Verify attestation
    const valid = await this.verifyAttestation(data.attestation);
    if (!valid) {
      throw new ProverError(
        'Invalid enclave attestation',
        ProverErrorCode.ATTESTATION_FAILED
      );
    }

    this.enclavePublicKey = this.hexToBytes(data.attestation.enclavePubKey);
    this.attestation = data.attestation;

    return {
      publicKey: this.enclavePublicKey,
      attestation: this.attestation!,
    };
  }

  /**
   * Verify TEE attestation
   */
  private async verifyAttestation(attestation: TEEAttestation): Promise<boolean> {
    // In production, this would verify:
    // 1. Quote signature against Intel/AMD/ARM root CA
    // 2. MRENCLAVE matches expected value
    // 3. Quote timestamp is recent
    // 4. Enclave security version is acceptable

    // For development, we do basic checks
    if (!attestation.quote || !attestation.enclavePubKey) {
      return false;
    }

    // Check timestamp is recent
    const age = Date.now() - attestation.timestamp;
    if (age > ATTESTATION_VALIDITY_MS) {
      return false;
    }

    // Verify quote structure
    try {
      const quoteBytes = this.hexToBytes(attestation.quote);
      // SGX quote header check
      if (quoteBytes.length < 48) {
        return false;
      }

      // TODO: Full SGX/TDX quote verification with Intel/AMD attestation service
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Witness Encryption
  // ==========================================================================

  /**
   * Encrypt witness for TEE transport
   */
  async encryptWitness(witness: Witness): Promise<EncryptedWitness> {
    // Get enclave public key
    const { publicKey: enclavePubKey, attestation } = await this.getEnclaveKey();

    // Generate ephemeral ECDH key pair
    this.ephemeralKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Export ephemeral public key
    const ephemeralPubKeyRaw = await crypto.subtle.exportKey(
      'raw',
      this.ephemeralKeyPair.publicKey
    );
    const ephemeralPubKeyHex = this.bytesToHex(new Uint8Array(ephemeralPubKeyRaw));

    // Import enclave public key
    const enclaveKeyImported = await crypto.subtle.importKey(
      'raw',
      enclavePubKey as unknown as ArrayBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // Derive shared secret via ECDH
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: enclaveKeyImported },
      this.ephemeralKeyPair.privateKey,
      256
    );
    this.sharedSecret = new Uint8Array(sharedBits);

    // Derive AES key from shared secret using HKDF
    const aesKey = await this.deriveAESKey(this.sharedSecret);

    // Encrypt private inputs
    const privateInputsJson = JSON.stringify(witness.privateInputs || {});
    const privateInputsBytes = new TextEncoder().encode(privateInputsJson);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // AES-GCM encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      privateInputsBytes
    );

    return {
      ciphertext: this.bytesToHex(new Uint8Array(ciphertext)),
      iv: this.bytesToHex(iv),
      ephemeralPubKey: ephemeralPubKeyHex,
      enclavePubKey: attestation.enclavePubKey,
      publicInputs: witness.publicInputs,
    };
  }

  /**
   * Derive AES-256-GCM key from shared secret using HKDF
   */
  private async deriveAESKey(sharedSecret: Uint8Array): Promise<CryptoKey> {
    // Import shared secret as HKDF key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      sharedSecret as unknown as ArrayBuffer,
      'HKDF',
      false,
      ['deriveKey']
    );

    // Derive AES key
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('bitsage-tee-witness-v1'),
        info: new TextEncoder().encode('aes-gcm-key'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ==========================================================================
  // Proof Request
  // ==========================================================================

  /**
   * Request proof generation from TEE
   */
  async requestProof(
    circuit: CircuitType,
    encryptedWitness: EncryptedWitness,
    deadline: number
  ): Promise<string> {
    const response = await fetch(`${this.coordinatorUrl}/api/v1/tee/prove`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        circuit,
        encryptedWitness,
        deadline,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ProverError(
        error.message || 'TEE proof request failed',
        ProverErrorCode.PROOF_FAILED
      );
    }

    const result = await response.json();
    return result.requestId;
  }

  /**
   * Get proof result status
   */
  async getProofStatus(requestId: string): Promise<{
    status: 'pending' | 'proving' | 'completed' | 'failed';
    progress?: number;
    result?: unknown;
    error?: string;
  }> {
    const response = await fetch(
      `${this.coordinatorUrl}/api/v1/tee/status/${requestId}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new ProverError(
        'Failed to get proof status',
        ProverErrorCode.NETWORK_ERROR
      );
    }

    return response.json();
  }

  // ==========================================================================
  // Attestation Verification
  // ==========================================================================

  /**
   * Verify proof was generated by genuine TEE
   */
  async verifyProofAttestation(
    proofHash: string,
    attestation: TEEAttestation
  ): Promise<boolean> {
    // Verify the attestation itself
    const valid = await this.verifyAttestation(attestation);
    if (!valid) return false;

    // Verify signature over proof hash
    try {
      const pubKeyBytes = this.hexToBytes(attestation.enclavePubKey);
      const signatureBytes = this.hexToBytes(attestation.signature);
      const proofHashBytes = this.hexToBytes(proofHash);

      const pubKey = await crypto.subtle.importKey(
        'raw',
        pubKeyBytes as unknown as ArrayBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pubKey,
        signatureBytes as unknown as ArrayBuffer,
        proofHashBytes as unknown as ArrayBuffer
      );
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private hexToBytes(hex: string): Uint8Array {
    const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return '0x' + Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Clear cached keys and attestation
   */
  clearCache(): void {
    this.enclavePublicKey = null;
    this.attestation = null;
    this.sharedSecret = null;
    this.ephemeralKeyPair = null;
  }
}
