export const RESET_PASSWORD_ITERATIONS = 100_000;
export const RESET_PASSWORD_MIN_LENGTH = 6;
export const RESET_PASSWORD_MAX_LENGTH = 64;

export interface ResetPasswordHashPayload {
  passwordHash: string;
  salt: string;
  iterations: number;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    throw new Error('Format salt tidak valid.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSaltHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashResetPassword(
  password: string,
  saltHex: string,
  iterations: number = RESET_PASSWORD_ITERATIONS
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBytes = hexToBytes(saltHex);
  const saltBuffer = new Uint8Array(saltBytes).buffer;
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export async function createResetPasswordRecord(
  password: string
): Promise<ResetPasswordHashPayload> {
  const trimmed = password.trim();
  if (trimmed.length < RESET_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password minimal ${RESET_PASSWORD_MIN_LENGTH} karakter.`);
  }
  if (trimmed.length > RESET_PASSWORD_MAX_LENGTH) {
    throw new Error(`Password maksimal ${RESET_PASSWORD_MAX_LENGTH} karakter.`);
  }
  const salt = generateSaltHex(16);
  const passwordHash = await hashResetPassword(trimmed, salt, RESET_PASSWORD_ITERATIONS);
  return {
    passwordHash,
    salt,
    iterations: RESET_PASSWORD_ITERATIONS,
  };
}

export async function verifyResetPassword(
  candidate: string,
  stored: ResetPasswordHashPayload
): Promise<boolean> {
  const trimmed = candidate.trim();
  if (!trimmed || !stored.passwordHash || !stored.salt) return false;
  if (!/^[0-9a-f]{64}$/.test(stored.passwordHash) || !/^[0-9a-f]{32}$/.test(stored.salt)) {
    return false;
  }
  const iterations =
    Number.isInteger(stored.iterations) && stored.iterations > 0
      ? stored.iterations
      : RESET_PASSWORD_ITERATIONS;
  const derived = await hashResetPassword(trimmed, stored.salt, iterations);
  return constantTimeHexEqual(derived, stored.passwordHash);
}
