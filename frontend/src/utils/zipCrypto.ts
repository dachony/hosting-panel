import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

interface EncryptedMeta {
  encrypted: true;
  salt: string;
  iv: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function asBuffer(arr: Uint8Array): ArrayBuffer {
  return (arr.buffer as ArrayBuffer).slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data: Uint8Array, password: string): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; iv: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(data));
  return { ciphertext: new Uint8Array(encrypted), salt, iv };
}

async function decrypt(ciphertext: Uint8Array, password: string, salt: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(ciphertext));
  return new Uint8Array(decrypted);
}

export async function createBackupZip(jsonString: string, password?: string): Promise<Uint8Array> {
  if (password) {
    const jsonBytes = strToU8(jsonString);
    const { ciphertext, salt, iv } = await encrypt(jsonBytes, password);
    const meta: EncryptedMeta = {
      encrypted: true,
      salt: toBase64(salt),
      iv: toBase64(iv),
    };
    return zipSync({
      'backup.enc': ciphertext,
      'meta.json': strToU8(JSON.stringify(meta)),
    });
  }
  return zipSync({
    'backup.json': strToU8(jsonString),
  });
}

export function isEncryptedBackup(zipData: ArrayBuffer): boolean {
  try {
    const files = unzipSync(new Uint8Array(zipData));
    return 'backup.enc' in files;
  } catch {
    return false;
  }
}

export async function readBackupZip(zipData: ArrayBuffer, password?: string): Promise<string> {
  const files = unzipSync(new Uint8Array(zipData));

  if ('backup.json' in files) {
    return strFromU8(files['backup.json']);
  }

  if ('backup.enc' in files && 'meta.json' in files) {
    if (!password) {
      throw new Error('PASSWORD_REQUIRED');
    }
    const meta: EncryptedMeta = JSON.parse(strFromU8(files['meta.json']));
    const salt = fromBase64(meta.salt);
    const iv = fromBase64(meta.iv);
    const decrypted = await decrypt(files['backup.enc'], password, salt, iv);
    return strFromU8(decrypted);
  }

  throw new Error('INVALID_ZIP');
}
