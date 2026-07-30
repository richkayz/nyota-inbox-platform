import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Platform super-admin credential.
 *
 * The platform admin is NOT a mailbox: it exists so the operator can reach the
 * Super Admin console (tenants, onboarding, audit) without a Dovecot account.
 * Only a password *hash* is stored in the gateway environment; the plaintext
 * password never touches the gateway config, the database or the frontend.
 *
 * PLATFORM_ADMIN_EMAIL           e.g. richkayz@gmail.com
 * PLATFORM_ADMIN_PASSWORD_HASH   scrypt$<saltHex>$<hashHex>   (see scripts/hash-password.mjs)
 */
export interface PlatformAdminConfig {
  email: string;
  passwordHash: string;
}

export function platformAdminConfig(): PlatformAdminConfig | null {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.PLATFORM_ADMIN_PASSWORD_HASH?.trim();
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

export function isPlatformAdminEmail(email: string): boolean {
  const cfg = platformAdminConfig();
  return !!cfg && cfg.email === email.trim().toLowerCase();
}

/** scrypt$<saltHex>$<hashHex> — constant-time comparison. */
export function verifyPlatformAdminPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  // Digest both sides so a length mismatch cannot throw or leak via timing.
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Used by scripts/hash-password.mjs and tests. */
export function hashPlatformAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
