/**
 * Password hashing for Cloudflare Workers: PBKDF2-SHA256 from Web Crypto (scrypt is not available there).
 * The cost (iterations) is stored inside each hash, so it can be raised later without breaking existing passwords.
 */
const encoder = new TextEncoder();

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(await derive(password, salt, iterations))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string | undefined, fallbackIterations: number): Promise<boolean> {
  const parts = stored?.startsWith('pbkdf2$') ? stored.split('$') : [];
  // with an unknown email, hash against a throwaway salt so the time taken does not give that away
  const iterations = Number(parts[1]) || fallbackIterations;
  const salt = parts[2] ? fromB64(parts[2]) : new Uint8Array(16);
  const actual = await derive(password, salt, iterations);
  return parts.length === 4 && sameBytes(actual, fromB64(parts[3] ?? ''));
}
