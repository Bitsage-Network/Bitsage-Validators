/**
 * BitSage Session Manager SDK
 *
 * Wallet-agnostic session key management for seamless dApp interactions.
 * Supports SNIP-9 outside execution for meta-transactions.
 */

import { Account, AccountInterface, Call, CallData, ec, hash, Provider, Contract, ProviderInterface } from 'starknet';
import {
  Session,
  SessionConfig,
  SessionKeyPair,
  AllowedCall,
  StoredSession,
  SessionExecutionResult,
  OutsideExecution,
  SESSION_CONSTANTS,
} from './types';

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

// IndexedDB wrapper for session storage
class SessionStorage {
  private dbName = 'BitSageSessionsDB';
  private storeName = 'sessions';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    // Skip initialization if not in browser
    if (!isBrowser) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'sessionId' });
          store.createIndex('owner', 'owner', { unique: false });
          store.createIndex('chainId', 'chainId', { unique: false });
        }
      };
    });
  }

  async saveSession(session: StoredSession): Promise<void> {
    if (!isBrowser) return; // SSR guard
    if (!this.db) await this.init();
    if (!this.db) return; // Still no DB after init

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(session);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    if (!isBrowser) return null; // SSR guard
    if (!this.db) await this.init();
    if (!this.db) return null; // Still no DB after init

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getSessionsByOwner(owner: string): Promise<StoredSession[]> {
    if (!isBrowser) return []; // SSR guard
    if (!this.db) await this.init();
    if (!this.db) return []; // Still no DB after init

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('owner');
      const request = index.getAll(owner);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!isBrowser) return; // SSR guard
    if (!this.db) await this.init();
    if (!this.db) return; // Still no DB after init

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(sessionId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearExpiredSessions(): Promise<void> {
    if (!isBrowser) return; // SSR guard
    const now = Math.floor(Date.now() / 1000);
    if (!this.db) await this.init();
    if (!this.db) return; // Still no DB after init

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const session = cursor.value as StoredSession;
          if (session.expiresAt < now) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}

// Key encryption utilities
class KeyEncryption {
  // Derive KEK from wallet signature
  static async deriveKEK(signature: string): Promise<CryptoKey> {
    const signatureBytes = new TextEncoder().encode(signature);

    // Import signature as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      signatureBytes,
      'HKDF',
      false,
      ['deriveKey']
    );

    // Derive AES key using HKDF
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode('BitSage Session KEK v1'),
        info: new TextEncoder().encode('session-key-encryption'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt session private key
  static async encryptPrivateKey(
    privateKey: string,
    kek: CryptoKey
  ): Promise<{ encrypted: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(privateKey);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      kek,
      encoded
    );

    return {
      encrypted: this.arrayBufferToHex(encrypted),
      iv: this.arrayBufferToHex(iv.buffer as ArrayBuffer),
    };
  }

  // Decrypt session private key
  static async decryptPrivateKey(
    encrypted: string,
    iv: string,
    kek: CryptoKey
  ): Promise<string> {
    const encryptedBytes = this.hexToArrayBuffer(encrypted);
    const ivBytes = this.hexToArrayBuffer(iv);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      kek,
      encryptedBytes
    );

    return new TextDecoder().decode(decrypted);
  }

  private static arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private static hexToArrayBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }
}

// Main Session Manager class
export class BitSageSessionManager {
  private provider: ProviderInterface;
  private contractAddress: string;
  private storage: SessionStorage;
  private chainId: string;
  private contract: Contract | null = null;

  constructor(
    provider: ProviderInterface,
    contractAddress: string,
    chainId: string = 'SN_SEPOLIA'
  ) {
    this.provider = provider;
    this.contractAddress = contractAddress;
    this.chainId = chainId;
    this.storage = new SessionStorage();
  }

  // Initialize the session manager
  async init(): Promise<void> {
    await this.storage.init();
    await this.storage.clearExpiredSessions();
  }

  // Generate a new session keypair (Stark curve)
  generateSessionKeyPair(): SessionKeyPair {
    const privateKey = ec.starkCurve.utils.randomPrivateKey();
    const publicKey = ec.starkCurve.getStarkKey(privateKey);

    return {
      privateKey: '0x' + Buffer.from(privateKey).toString('hex'),
      publicKey: publicKey,
    };
  }

  // Create a new session
  async createSession(
    account: AccountInterface,
    config: SessionConfig,
    walletSignature?: string
  ): Promise<{ session: Session; keyPair: SessionKeyPair }> {
    // Validate config
    if (config.expiresIn < SESSION_CONSTANTS.MIN_DURATION) {
      throw new Error(`Session duration must be at least ${SESSION_CONSTANTS.MIN_DURATION} seconds`);
    }
    if (config.expiresIn > SESSION_CONSTANTS.MAX_DURATION) {
      throw new Error(`Session duration must be at most ${SESSION_CONSTANTS.MAX_DURATION} seconds`);
    }

    // Generate session keypair
    const keyPair = this.generateSessionKeyPair();

    // Build allowed calls for contract
    const allowedCallsForContract = config.allowedCalls.map((call) => ({
      contract_address: call.contractAddress,
      selector: call.selector || '0x0',
    }));

    // Compute message hash for user to sign
    const messageHash = this.computeSessionMessageHash(
      keyPair.publicKey,
      Math.floor(Date.now() / 1000) + config.expiresIn,
      config.spendingLimit,
      config.allowedCalls
    );

    // Get wallet signature if not provided
    let signature: string[];
    if (walletSignature) {
      signature = [walletSignature];
    } else {
      // Request signature from wallet
      const signedMessage = await account.signMessage({
        domain: {
          name: 'BitSage Session',
          version: '1',
          chainId: this.chainId,
        },
        types: {
          Session: [
            { name: 'sessionKey', type: 'felt' },
            { name: 'expiresIn', type: 'felt' },
            { name: 'spendingLimit', type: 'u256' },
          ],
        },
        primaryType: 'Session',
        message: {
          sessionKey: keyPair.publicKey,
          expiresIn: config.expiresIn.toString(),
          spendingLimit: config.spendingLimit.toString(),
        },
      });
      signature = signedMessage as unknown as string[];
    }

    // Build create_session call
    const calldata = CallData.compile({
      session_key: keyPair.publicKey,
      expires_in: config.expiresIn,
      spending_limit: {
        low: (config.spendingLimit & BigInt('0xFFFFFFFFFFFFFFFF')).toString(),
        high: (config.spendingLimit >> 128n).toString(),
      },
      allowed_calls: allowedCallsForContract,
      signature: signature,
    });

    // Execute transaction
    const tx = await account.execute({
      contractAddress: this.contractAddress,
      entrypoint: 'create_session',
      calldata,
    });

    // Wait for transaction
    await this.provider.waitForTransaction(tx.transaction_hash);

    // Get session ID from events (or compute it)
    const sessionId = this.computeSessionId(
      account.address,
      keyPair.publicKey,
      Date.now()
    );

    // Derive KEK and encrypt private key
    const kekSignature = await account.signMessage({
      domain: { name: 'BitSage KEK', version: '1', chainId: this.chainId },
      types: { KEK: [{ name: 'purpose', type: 'string' }] },
      primaryType: 'KEK',
      message: { purpose: 'session-key-encryption' },
    });

    const kek = await KeyEncryption.deriveKEK(JSON.stringify(kekSignature));
    const { encrypted, iv } = await KeyEncryption.encryptPrivateKey(
      keyPair.privateKey,
      kek
    );

    // Store session locally
    const expiresAt = Math.floor(Date.now() / 1000) + config.expiresIn;
    const storedSession: StoredSession = {
      sessionId,
      owner: account.address,
      encryptedPrivateKey: encrypted,
      iv,
      salt: '', // Salt is embedded in KEK derivation
      publicKey: keyPair.publicKey,
      expiresAt,
      createdAt: Math.floor(Date.now() / 1000),
      chainId: this.chainId,
    };
    await this.storage.saveSession(storedSession);

    // Return session info
    const session: Session = {
      sessionId,
      owner: account.address,
      sessionKey: keyPair.publicKey,
      expiresAt,
      spendingLimit: config.spendingLimit,
      amountSpent: 0n,
      isActive: true,
      createdAt: Math.floor(Date.now() / 1000),
      allowedCalls: config.allowedCalls,
    };

    return { session, keyPair };
  }

  // Execute calls using a session (no wallet popup!)
  async executeWithSession(
    sessionId: string,
    calls: Call[],
    kekSignature: string
  ): Promise<SessionExecutionResult> {
    // Get stored session
    const storedSession = await this.storage.getSession(sessionId);
    if (!storedSession) {
      throw new Error('Session not found locally');
    }

    // Check expiration
    if (storedSession.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new Error('Session expired');
    }

    // Decrypt private key
    const kek = await KeyEncryption.deriveKEK(kekSignature);
    const privateKey = await KeyEncryption.decryptPrivateKey(
      storedSession.encryptedPrivateKey,
      storedSession.iv,
      kek
    );

    // Compute calls hash
    const callsHash = this.hashCalls(calls);

    // Sign with session key
    const signature = ec.starkCurve.sign(callsHash, privateKey.slice(2));

    // Build calldata for execute_with_session
    const calldata = CallData.compile({
      session_id: sessionId,
      session_signature: [signature.r.toString(), signature.s.toString()],
      calls: calls.map((call) => ({
        to: call.contractAddress,
        selector: hash.getSelectorFromName(call.entrypoint),
        calldata: call.calldata || [],
      })),
    });

    // Create an account instance for the session manager contract
    // We use a "pseudo" account that only executes through the session manager
    const sessionAccount = new Account(
      this.provider,
      this.contractAddress,
      privateKey
    );

    // Execute through session manager
    const tx = await sessionAccount.execute({
      contractAddress: this.contractAddress,
      entrypoint: 'execute_with_session',
      calldata,
    });

    // Wait for transaction
    const receipt = await this.provider.waitForTransaction(tx.transaction_hash);

    return {
      transactionHash: tx.transaction_hash,
      success: true,
      results: [], // Parse from receipt events
      amountSpent: 0n, // Parse from receipt events
    };
  }

  // Execute from outside (SNIP-9 meta-transaction)
  async executeFromOutside(
    outsideExecution: OutsideExecution,
    ownerSignature: string[]
  ): Promise<SessionExecutionResult> {
    const calldata = CallData.compile({
      outside_execution: {
        caller: outsideExecution.caller,
        nonce: outsideExecution.nonce,
        execute_after: outsideExecution.executeAfter,
        execute_before: outsideExecution.executeBefore,
        calls: outsideExecution.calls.map((call) => ({
          to: call.contractAddress,
          selector: hash.getSelectorFromName(call.entrypoint),
          calldata: call.calldata || [],
        })),
      },
      signature: ownerSignature,
    });

    // This can be executed by ANY account (relayer)
    // The owner's signature proves authorization
    const relayerAccount = new Account(
      this.provider,
      this.contractAddress,
      '0x0' // Dummy key - not used for outside execution
    );

    const tx = await relayerAccount.execute({
      contractAddress: this.contractAddress,
      entrypoint: 'execute_from_outside',
      calldata,
    });

    const receipt = await this.provider.waitForTransaction(tx.transaction_hash);

    return {
      transactionHash: tx.transaction_hash,
      success: true,
      results: [],
      amountSpent: 0n,
    };
  }

  // Revoke a session
  async revokeSession(account: AccountInterface, sessionId: string): Promise<string> {
    const tx = await account.execute({
      contractAddress: this.contractAddress,
      entrypoint: 'revoke_session',
      calldata: [sessionId],
    });

    await this.provider.waitForTransaction(tx.transaction_hash);

    // Remove from local storage
    await this.storage.deleteSession(sessionId);

    return tx.transaction_hash;
  }

  // Get all sessions for an owner
  async getSessions(owner: string): Promise<Session[]> {
    // Get from local storage
    const storedSessions = await this.storage.getSessionsByOwner(owner);

    // Filter expired sessions
    const now = Math.floor(Date.now() / 1000);
    const activeSessions = storedSessions.filter((s) => s.expiresAt > now);

    // Convert to Session type
    return activeSessions.map((s) => ({
      sessionId: s.sessionId,
      owner: s.owner,
      sessionKey: s.publicKey,
      expiresAt: s.expiresAt,
      spendingLimit: 0n, // Would need to fetch from contract
      amountSpent: 0n,
      isActive: true,
      createdAt: s.createdAt,
      allowedCalls: [],
    }));
  }

  // Check if a session is valid
  async isSessionValid(sessionId: string): Promise<boolean> {
    const stored = await this.storage.getSession(sessionId);
    if (!stored) return false;
    if (stored.expiresAt < Math.floor(Date.now() / 1000)) return false;

    // Optionally verify on-chain
    // const result = await this.contract?.is_session_valid(sessionId);
    // return result;

    return true;
  }

  // Get remaining spending limit
  async getRemainingLimit(sessionId: string): Promise<bigint> {
    // This would query the contract
    // For now, return from local state or fetch
    return 0n;
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private computeSessionId(
    owner: string,
    sessionKey: string,
    nonce: number
  ): string {
    return hash.computePoseidonHash(
      hash.computePoseidonHash(owner, sessionKey),
      nonce.toString()
    );
  }

  private computeSessionMessageHash(
    sessionKey: string,
    expiresAt: number,
    spendingLimit: bigint,
    allowedCalls: AllowedCall[]
  ): string {
    // Hash allowed calls
    const callsData = allowedCalls
      .map((c) => `${c.contractAddress}${c.selector || '0x0'}`)
      .join('');
    const callsHash = hash.computePoseidonHashOnElements(
      allowedCalls.flatMap((c) => [c.contractAddress, c.selector || '0x0'])
    );

    // Compute final hash
    return hash.computePoseidonHashOnElements([
      SESSION_CONSTANTS.SESSION_TYPE_HASH,
      sessionKey,
      expiresAt.toString(),
      (spendingLimit & BigInt('0xFFFFFFFFFFFFFFFF')).toString(),
      (spendingLimit >> 128n).toString(),
      callsHash,
    ]);
  }

  private hashCalls(calls: Call[]): string {
    const elements: string[] = [];
    for (const call of calls) {
      elements.push(call.contractAddress);
      elements.push(hash.getSelectorFromName(call.entrypoint));
      // Hash calldata
      const calldataHash = hash.computePoseidonHashOnElements(
        (call.calldata as string[]) || []
      );
      elements.push(calldataHash);
    }
    return hash.computePoseidonHashOnElements(elements);
  }
}

// Factory function
export function createSessionManager(
  provider: ProviderInterface,
  contractAddress: string,
  chainId?: string
): BitSageSessionManager {
  return new BitSageSessionManager(provider, contractAddress, chainId);
}
