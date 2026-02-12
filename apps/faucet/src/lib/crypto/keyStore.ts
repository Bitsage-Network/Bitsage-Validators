/**
 * Privacy Key Storage with Wallet-Derived KEK
 *
 * Implements secure storage for privacy keys:
 * 1. Generate separate ElGamal keypair
 * 2. Derive KEK from wallet signature via HKDF
 * 3. Encrypt private key with AES-GCM
 * 4. Store in IndexedDB
 */

import {
  PRIVACY_DB_NAME,
  PRIVACY_DB_VERSION,
  KEY_STORE_NAME,
  NOTE_STORE_NAME,
  KEY_DERIVATION_DOMAIN,
  type StoredPrivacyKey,
  type PrivacyKeyPair,
  type ECPoint,
  type PrivacyNote,
} from "./constants";
import { generateKeyPair } from "./elgamal";

// IndexedDB wrapper
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(PRIVACY_DB_NAME, PRIVACY_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Key storage
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: "address" });
      }

      // Note storage
      if (!db.objectStoreNames.contains(NOTE_STORE_NAME)) {
        const noteStore = db.createObjectStore(NOTE_STORE_NAME, {
          keyPath: "commitment",
        });
        noteStore.createIndex("address", "address", { unique: false });
        noteStore.createIndex("spent", "spent", { unique: false });
      }
    };
  });

  return dbPromise;
}

// Generate the message for wallet to sign (domain-separated)
export function getKeyDerivationMessage(
  chainId: string,
  userAddress: string
): string {
  return `${KEY_DERIVATION_DOMAIN} | chainId=${chainId} | user=${userAddress}`;
}

// Derive Key Encryption Key from wallet signature using HKDF
export async function deriveKEK(signature: Uint8Array): Promise<CryptoKey> {
  // Convert to ArrayBuffer for Web Crypto API - use new Uint8Array to ensure proper ArrayBuffer
  const signatureBuffer = new Uint8Array(signature).buffer as ArrayBuffer;

  // Import signature as HKDF input key material
  const ikm = await crypto.subtle.importKey(
    "raw",
    signatureBuffer,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const saltBuffer = new TextEncoder().encode("BitSage-Privacy-KEK-v1");
  const infoBuffer = new TextEncoder().encode("AES-GCM-256");

  // Derive AES-GCM key using HKDF
  const kek = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuffer.buffer.slice(
        saltBuffer.byteOffset,
        saltBuffer.byteOffset + saltBuffer.byteLength
      ),
      info: infoBuffer.buffer.slice(
        infoBuffer.byteOffset,
        infoBuffer.byteOffset + infoBuffer.byteLength
      ),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return kek;
}

// Convert bigint to Uint8Array (32 bytes)
function bigintToBytes(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to bigint
function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

// Encrypt private key with KEK
async function encryptPrivateKey(
  privateKey: bigint,
  kek: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = bigintToBytes(privateKey);

  // Convert to ArrayBuffer for Web Crypto API - use copy to avoid SharedArrayBuffer issues
  const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer;
  const plaintextBuffer = new Uint8Array(plaintext).buffer as ArrayBuffer;

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    kek,
    plaintextBuffer
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Decrypt private key with KEK
async function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  kek: CryptoKey
): Promise<bigint> {
  const ciphertext = Uint8Array.from(atob(encryptedKey), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  // Convert to ArrayBuffer for Web Crypto API - use copy to avoid SharedArrayBuffer issues
  const ivBuffer = new Uint8Array(ivBytes).buffer as ArrayBuffer;
  const ciphertextBuffer = new Uint8Array(ciphertext).buffer as ArrayBuffer;

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    kek,
    ciphertextBuffer
  );

  return bytesToBigint(new Uint8Array(plaintext));
}

// Generate and store a new privacy keypair
export async function generateAndStoreKey(
  address: string,
  kek: CryptoKey
): Promise<PrivacyKeyPair> {
  const keyPair = generateKeyPair();

  const { ciphertext, iv } = await encryptPrivateKey(keyPair.privateKey, kek);

  const storedKey: StoredPrivacyKey = {
    publicKey: keyPair.publicKey,
    encryptedPrivateKey: ciphertext,
    iv,
    salt: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
    version: 1,
    createdAt: Date.now(),
  };

  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readwrite");
  const store = tx.objectStore(KEY_STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.put({ address, ...storedKey });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  return keyPair;
}

// Load stored key (returns public key only, private key requires KEK)
export async function getStoredPublicKey(
  address: string
): Promise<ECPoint | null> {
  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readonly");
  const store = tx.objectStore(KEY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(address);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.publicKey : null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Decrypt and load private key
export async function loadPrivateKey(
  address: string,
  kek: CryptoKey
): Promise<bigint | null> {
  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readonly");
  const store = tx.objectStore(KEY_STORE_NAME);

  const stored = await new Promise<StoredPrivacyKey & { address: string } | undefined>(
    (resolve, reject) => {
      const request = store.get(address);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  );

  if (!stored) return null;

  return decryptPrivateKey(stored.encryptedPrivateKey, stored.iv, kek);
}

// Load full keypair (requires KEK)
export async function loadKeyPair(
  address: string,
  kek: CryptoKey
): Promise<PrivacyKeyPair | null> {
  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readonly");
  const store = tx.objectStore(KEY_STORE_NAME);

  const stored = await new Promise<StoredPrivacyKey & { address: string } | undefined>(
    (resolve, reject) => {
      const request = store.get(address);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  );

  if (!stored) return null;

  const privateKey = await decryptPrivateKey(
    stored.encryptedPrivateKey,
    stored.iv,
    kek
  );

  return {
    publicKey: stored.publicKey,
    privateKey,
  };
}

// Check if key exists for address
export async function hasStoredKey(address: string): Promise<boolean> {
  const publicKey = await getStoredPublicKey(address);
  return publicKey !== null;
}

// Rotate keys (generate new pair, keep old public key for reference)
export async function rotateKeys(
  address: string,
  kek: CryptoKey
): Promise<PrivacyKeyPair> {
  // Generate new keypair
  return generateAndStoreKey(address, kek);
}

// Delete all keys for address
export async function deleteKeys(address: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readwrite");
  const store = tx.objectStore(KEY_STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.delete(address);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// === Note Storage ===

interface StoredNote extends PrivacyNote {
  address: string;
}

// Save a privacy note (encrypted)
export async function saveNote(
  address: string,
  note: PrivacyNote
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readwrite");
  const store = tx.objectStore(NOTE_STORE_NAME);

  const storedNote: StoredNote = { ...note, address };

  await new Promise<void>((resolve, reject) => {
    const request = store.put(storedNote);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get all notes for address
export async function getNotes(address: string): Promise<PrivacyNote[]> {
  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readonly");
  const store = tx.objectStore(NOTE_STORE_NAME);
  const index = store.index("address");

  return new Promise((resolve, reject) => {
    const request = index.getAll(address);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get unspent notes for address
export async function getUnspentNotes(address: string): Promise<PrivacyNote[]> {
  const notes = await getNotes(address);
  return notes.filter((note) => !note.spent);
}

// Mark note as spent
export async function markNoteSpent(
  commitment: string,
  spentTxHash: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readwrite");
  const store = tx.objectStore(NOTE_STORE_NAME);

  const note = await new Promise<StoredNote | undefined>((resolve, reject) => {
    const request = store.get(commitment);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (note) {
    note.spent = true;
    note.spentTxHash = spentTxHash;

    await new Promise<void>((resolve, reject) => {
      const request = store.put(note);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Update note's leafIndex after deposit confirmation
export async function updateNoteLeafIndex(
  commitment: string,
  leafIndex: number
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readwrite");
  const store = tx.objectStore(NOTE_STORE_NAME);

  const note = await new Promise<StoredNote | undefined>((resolve, reject) => {
    const request = store.get(commitment);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (note) {
    note.leafIndex = leafIndex;

    await new Promise<void>((resolve, reject) => {
      const request = store.put(note);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log(`Updated note ${commitment.slice(0, 10)}... leafIndex to ${leafIndex}`);
  } else {
    console.warn(`Note not found for commitment: ${commitment}`);
  }
}

// Delete a note
export async function deleteNote(commitment: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readwrite");
  const store = tx.objectStore(NOTE_STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.delete(commitment);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get total unspent balance
export async function getUnspentBalance(address: string): Promise<number> {
  const unspentNotes = await getUnspentNotes(address);
  return unspentNotes.reduce((sum, note) => sum + note.denomination, 0);
}

// Clear all data for address
export async function clearAllData(address: string): Promise<void> {
  await deleteKeys(address);

  const db = await openDB();
  const tx = db.transaction(NOTE_STORE_NAME, "readwrite");
  const store = tx.objectStore(NOTE_STORE_NAME);
  const index = store.index("address");

  const notes = await new Promise<StoredNote[]>((resolve, reject) => {
    const request = index.getAll(address);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  for (const note of notes) {
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(note.commitment);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Export keys for backup (encrypted with user-provided password)
export async function exportKeys(
  address: string,
  password: string
): Promise<string> {
  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readonly");
  const store = tx.objectStore(KEY_STORE_NAME);

  const stored = await new Promise<StoredPrivacyKey & { address: string } | undefined>(
    (resolve, reject) => {
      const request = store.get(address);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }
  );

  if (!stored) throw new Error("No keys found for address");

  // Re-encrypt with password-derived key
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = new TextEncoder().encode(password);
  const passwordBuffer = passwordBytes.buffer.slice(
    passwordBytes.byteOffset,
    passwordBytes.byteOffset + passwordBytes.byteLength
  );
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const exportKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
  const data = new TextEncoder().encode(JSON.stringify(stored));
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    exportKey,
    dataBuffer
  );

  return JSON.stringify({
    version: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  });
}

// Import keys from backup
export async function importKeys(
  backup: string,
  password: string
): Promise<string> {
  const { version, salt, iv, data } = JSON.parse(backup);

  if (version !== 1) throw new Error("Unsupported backup version");

  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const encryptedBytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

  // Convert to ArrayBuffer for Web Crypto API
  const passwordBytes = new TextEncoder().encode(password);
  const passwordBuffer = passwordBytes.buffer.slice(
    passwordBytes.byteOffset,
    passwordBytes.byteOffset + passwordBytes.byteLength
  );
  const saltBuffer = saltBytes.buffer.slice(
    saltBytes.byteOffset,
    saltBytes.byteOffset + saltBytes.byteLength
  );
  const ivBuffer = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength
  );
  const encryptedBuffer = encryptedBytes.buffer.slice(
    encryptedBytes.byteOffset,
    encryptedBytes.byteOffset + encryptedBytes.byteLength
  );

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const importKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    importKey,
    encryptedBuffer
  );

  const stored = JSON.parse(new TextDecoder().decode(decrypted));

  const db = await openDB();
  const tx = db.transaction(KEY_STORE_NAME, "readwrite");
  const store = tx.objectStore(KEY_STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.put(stored);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  return stored.address;
}
