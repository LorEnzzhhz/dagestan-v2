/**
 * sync.ts — End-to-end encrypted chat-history sync.
 *
 * Architecture:
 *  - The user opts in via Settings → Sync and supplies a passphrase.
 *  - PBKDF2-SHA256 (600k iterations) derives a 256-bit AES-GCM key.
 *  - Per-record encryption: random 96-bit IV + AES-GCM-256 ciphertext.
 *  - The server only sees opaque blobs: { id, iv, ciphertext, updatedAt }.
 *  - Server NEVER sees plaintext or the derived key.
 *
 * Threat model:
 *  - Server compromise: attacker gets only ciphertext, useless without
 *    the passphrase.
 *  - Network observer: same as above (E2E).
 *  - Lost passphrase: unrecoverable. Local key is derivable on the fly;
 *    we do not store it.
 *
 * Out of scope (intentionally):
 *  - Multi-user accounts (no auth, no sharing)
 *  - Server-side search
 *  - API-key / setting sync (only chat history)
 */

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;
const SALT_LENGTH_BYTES = 16;

const PREFERRED_PORT = 18927;
const PROBE_RANGE = 5;

let cachedPort: number | null = null;
async function baseUrl(): Promise<string> {
  if (cachedPort === null) {
    for (let i = 0; i < PROBE_RANGE; i++) {
      const port = PREFERRED_PORT + i;
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 500);
        const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: c.signal });
        clearTimeout(t);
        if (r.ok) { cachedPort = port; break; }
      } catch { /* keep probing */ }
    }
    if (cachedPort === null) cachedPort = PREFERRED_PORT;
  }
  return `http://127.0.0.1:${cachedPort}`;
}

export interface SyncBlob {
  id: string;            // chat id
  iv: string;            // base64
  ciphertext: string;    // base64
  updatedAt: number;
}

export interface SyncManifest {
  salt: string;          // base64 — per-account, stored on server
  updatedAt: number;
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // not extractable — stays in crypto.subtle
    ["encrypt", "decrypt"],
  );
}

export async function encryptChat(
  key: CryptoKey,
  chatId: string,
  payload: unknown,
): Promise<{ id: string; iv: string; ciphertext: string; updatedAt: number }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return {
    id: chatId,
    iv: toB64(iv),
    ciphertext: toB64(ct),
    updatedAt: Date.now(),
  };
}

export async function decryptChat<T = unknown>(
  key: CryptoKey,
  blob: SyncBlob,
): Promise<T> {
  const iv = fromB64(blob.iv);
  const ct = fromB64(blob.ciphertext);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/** Build the full key + salt pair for a passphrase. The salt is stored on
 *  the server alongside the ciphertexts. */
export async function initSync(passphrase: string): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const key = await deriveKey(passphrase, salt);
  return { key, salt };
}

/** Recreate the key from an existing salt + the user's passphrase. */
export async function resumeSync(passphrase: string, saltB64: string): Promise<CryptoKey> {
  return deriveKey(passphrase, fromB64(saltB64));
}

// ── Server side ───────────────────────────────────────────────────

async function serverGet<T>(path: string): Promise<T | null> {
  const base = await baseUrl();
  const r = await fetch(`${base}${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
async function serverSend<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  const base = await baseUrl();
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Initialize server-side manifest (stores the salt). */
export async function registerSync(passphrase: string): Promise<{ key: CryptoKey; saltB64: string }> {
  const { key, salt } = await initSync(passphrase);
  const saltB64 = toB64(salt);
  await serverSend("/v1/sync/init", { salt: saltB64 });
  return { key, saltB64 };
}

/** Push one chat blob. */
export async function pushChat(blob: SyncBlob): Promise<void> {
  await serverSend("/v1/sync/chats", blob);
}

/** Pull all chat blobs (since a timestamp). */
export async function pullChats(since: number = 0): Promise<SyncBlob[]> {
  const r = await serverGet<{ chats: SyncBlob[] }>(`/v1/sync/chats?since=${since}`);
  return r?.chats ?? [];
}

/** Wipe the server-side store (panic button). */
export async function wipeSync(): Promise<void> {
  await serverSend("/v1/sync/wipe", {}, "DELETE");
}
