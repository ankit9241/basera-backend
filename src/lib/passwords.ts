import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = 12;

/**
 * Securely hashes a plain-text password using bcrypt (work factor 12).
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  return bcrypt.hash(plainText, BCRYPT_ROUNDS);
}

/**
 * Verifies a plain-text password against a stored hash.
 * Supports standard bcrypt hashes ($2a$, $2b$, $2y$).
 * If legacy SHA-256 hash format is encountered, validates with timingSafeEqual.
 * Never allows any hardcoded bypass or default passwords.
 */
export async function verifyPassword(plainText: string, storedHash?: string | null): Promise<boolean> {
  if (!plainText || !storedHash) {
    return false;
  }

  // 1. Standard Bcrypt verification ($2a$, $2b$, $2y$)
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    try {
      return await bcrypt.compare(plainText, storedHash);
    } catch {
      return false;
    }
  }

  // 2. Legacy fallback: 64-char hex string (SHA-256)
  if (storedHash.length === 64 && /^[0-9a-fA-F]{64}$/.test(storedHash)) {
    try {
      const computed = crypto.createHash("sha256").update(plainText).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
    } catch {
      return false;
    }
  }

  return false;
}
