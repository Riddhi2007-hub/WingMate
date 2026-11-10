import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** A hash to compare against when the email is unknown, so timing does not reveal which emails exist. */
const DUMMY = `scrypt$${randomBytes(16).toString('base64')}$${scryptSync('dummy', randomBytes(16), KEYLEN).toString('base64')}`;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [scheme, saltB64, hashB64] = (stored && stored.startsWith('scrypt$') ? stored : DUMMY).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected) && stored !== undefined && stored.startsWith('scrypt$');
}
