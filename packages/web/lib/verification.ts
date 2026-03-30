// ---------------------------------------------------------------------------
// Email Verification — time-limited codes
//
// In production, integrate with SendGrid, Resend, or AWS SES to deliver
// the verification code. The verify() function validates the code.
//
// Flow:
//   1. User calls POST /api/auth {action:"register", email:"..."}
//   2. Server generates 6-digit code, stores it, sends via email
//   3. User calls POST /api/auth {action:"verify", email:"...", code:"123456"}
//   4. If valid and not expired, account is created and key returned
// ---------------------------------------------------------------------------

import { randomInt } from 'node:crypto';
import { logger } from './logger.js';

interface PendingVerification {
  code: string;
  email: string;
  createdAt: number;
  attempts: number;
}

// In-memory store (swap with Redis in production for multi-instance)
const pendingVerifications = new Map<string, PendingVerification>();

const CODE_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;          // max wrong code attempts
const CLEANUP_INTERVAL_MS = 5 * 60_000; // cleanup every 5 minutes

/**
 * Generate a 6-digit verification code and store it.
 * Returns the code (caller is responsible for sending it).
 */
export function createVerificationCode(email: string): string {
  const normalized = email.toLowerCase().trim();

  // Generate cryptographically random 6-digit code
  const code = String(randomInt(100000, 999999));

  pendingVerifications.set(normalized, {
    code,
    email: normalized,
    createdAt: Date.now(),
    attempts: 0,
  });

  logger.info('Verification code created', { email: normalized });
  return code;
}

/**
 * Verify a code for the given email.
 * Returns { valid: true } on success, or { valid: false, reason: "..." } on failure.
 */
export function verifyCode(
  email: string,
  code: string,
): { valid: boolean; reason?: string } {
  const normalized = email.toLowerCase().trim();
  const pending = pendingVerifications.get(normalized);

  if (!pending) {
    return { valid: false, reason: 'No pending verification for this email. Register first.' };
  }

  // Check expiry
  if (Date.now() - pending.createdAt > CODE_TTL_MS) {
    pendingVerifications.delete(normalized);
    return { valid: false, reason: 'Verification code expired (10 min limit). Register again.' };
  }

  // Check attempt limit
  if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
    pendingVerifications.delete(normalized);
    return { valid: false, reason: 'Too many failed attempts. Register again.' };
  }

  // Check code
  if (pending.code !== code.trim()) {
    pending.attempts += 1;
    return {
      valid: false,
      reason: `Invalid code. ${MAX_VERIFY_ATTEMPTS - pending.attempts} attempt(s) remaining.`,
    };
  }

  // Success — remove pending entry
  pendingVerifications.delete(normalized);
  return { valid: true };
}

/**
 * Check if an email already has a pending verification (to avoid re-sending).
 */
export function hasPendingVerification(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  const pending = pendingVerifications.get(normalized);
  if (!pending) return false;
  if (Date.now() - pending.createdAt > CODE_TTL_MS) {
    pendingVerifications.delete(normalized);
    return false;
  }
  return true;
}

/**
 * Send verification email.
 * In production, replace this with SendGrid/Resend/SES integration.
 * For now, logs the code (development only).
 */
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  // --- Production: integrate your email provider here ---
  // Example with Resend:
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({
  //     from: 'geotechCLI <noreply@geotechcli.com>',
  //     to: email,
  //     subject: 'Your geotechCLI verification code',
  //     text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
  //   });

  if (!IS_PRODUCTION) {
    // Development: log the code for testing
    logger.info('VERIFICATION CODE (dev only)', { email, code });
    return true;
  }

  // Production stub — replace with real email delivery
  // For now, return the code in the response (see auth route)
  logger.warn('Email delivery not configured — code returned in response', { email });
  return true;
}

// Periodic cleanup of expired entries
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pendingVerifications.entries()) {
      if (now - entry.createdAt > CODE_TTL_MS) {
        pendingVerifications.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}
