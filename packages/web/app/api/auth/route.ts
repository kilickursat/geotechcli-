import { NextRequest, NextResponse } from 'next/server';
import {
  createUser,
  deleteUser,
  getUserByEmail,
  getUserByKey,
  regenerateKey,
} from '@geotechcli/core';
import { logger } from '@/lib/logger';
import {
  createVerificationCode,
  verifyCode,
  hasPendingVerification,
  sendVerificationEmail,
} from '@/lib/verification';

const regAttempts = new Map<string, number[]>();
const REG_WINDOW_MS = 3_600_000;
const REG_MAX_ATTEMPTS = 5;

function isRegRateLimited(ip: string): boolean {
  const now = Date.now();
  let attempts = regAttempts.get(ip) ?? [];
  attempts = attempts.filter((t) => now - t < REG_WINDOW_MS);
  if (attempts.length >= REG_MAX_ATTEMPTS) {
    regAttempts.set(ip, attempts);
    return true;
  }
  attempts.push(now);
  regAttempts.set(ip, attempts);
  return false;
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action ?? 'register');
  const email = String(body.email ?? '');
  const ip = getClientIP(req);

  if (action === 'register') {
    if (isRegRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Try again later.' },
        { status: 429 },
      );
    }

    if (!email || !email.includes('@') || email.length < 5 || email.length > 320) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists.',
          hint: 'If you lost your API key, use action: "regenerate" with your current key, or contact support@geotechcli.com.',
        },
        { status: 409 },
      );
    }

    if (hasPendingVerification(email)) {
      return NextResponse.json(
        {
          message: 'Verification code already sent. Check your email.',
          hint: 'Use action: "verify" with your email and the 6-digit code.',
          action_next: 'verify',
        },
        { status: 200 },
      );
    }

    const code = createVerificationCode(email);
    const sent = await sendVerificationEmail(email, code);

    if (!sent) {
      logger.error('Failed to send verification email', { email });
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 500 },
      );
    }

    logger.info('Registration initiated', { email, ip });

    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production';

    const response: Record<string, unknown> = {
      message: 'Verification code sent to your email.',
      email,
      action_next: 'verify',
      hint: `Run: curl -X POST https://geotechcli.com/api/auth -d '{"action":"verify","email":"${email}","code":"YOUR_CODE"}'`,
      expires_in: '10 minutes',
    };

    if (!isProduction) {
      response.dev_code = code;
      response.dev_note = 'Code included in response for development only. Will not appear in production.';
    }

    return NextResponse.json(response);
  }

  if (action === 'verify') {
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const code = String(body.code ?? '');
    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: 'A 6-digit verification code is required.' },
        { status: 400 },
      );
    }

    const verification = verifyCode(email, code);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.reason }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: 'Account already exists. This code may have been used already.' },
        { status: 409 },
      );
    }

    const result = await createUser({ email });
    if (result.error || !result.user) {
      logger.error('User creation failed after verification', {
        email,
        error: result.error,
      });
      return NextResponse.json(
        { error: result.error ?? 'Account creation failed.' },
        { status: 500 },
      );
    }

    logger.info('Account created after email verification', {
      email,
      userId: result.user.id,
    });

    return NextResponse.json({
      message: 'Email verified. Account created successfully.',
      email: result.user.email,
      geotech_key: result.user.geotech_key,
      tier: result.user.tier,
      important: 'Save your API key now; it will not be shown again.',
      setup: `Run: geotech config set auth.api_key ${result.user.geotech_key}`,
    });
  }

  if (action === 'regenerate') {
    const currentKey = req.headers.get('x-geotech-key') ?? '';
    if (!currentKey) {
      return NextResponse.json(
        { error: 'x-geotech-key header required to regenerate.' },
        { status: 401 },
      );
    }

    const user = await getUserByKey(currentKey);
    if (!user) {
      return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
    }

    const result = await regenerateKey(user.id);
    if (result.error || !result.key) {
      return NextResponse.json(
        { error: result.error ?? 'Key regeneration failed.' },
        { status: 500 },
      );
    }

    logger.info('API key regenerated', { userId: user.id });

    return NextResponse.json({
      message: 'API key regenerated. Your old key is now invalid.',
      geotech_key: result.key,
      important: 'Save your new API key now; it will not be shown again.',
      setup: `Run: geotech config set auth.api_key ${result.key}`,
    });
  }

  if (action === 'delete') {
    const currentKey = req.headers.get('x-geotech-key') ?? '';
    if (!currentKey) {
      return NextResponse.json(
        { error: 'x-geotech-key header required to delete account.' },
        { status: 401 },
      );
    }

    const user = await getUserByKey(currentKey);
    if (!user) {
      return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
    }

    const confirmEmail = String(body.confirm_email ?? '');
    if (!confirmEmail || confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'confirm_email must match the account email exactly.',
          hint: `Set confirm_email to ${user.email}`,
        },
        { status: 400 },
      );
    }

    const result = await deleteUser(user.id);
    if (result.error) {
      logger.error('Account deletion failed', {
        userId: user.id,
        email: user.email,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    logger.info('Account deleted', { userId: user.id, email: user.email });

    return NextResponse.json({
      message: 'Account deleted successfully.',
      email: user.email,
      important: 'Your API key is now invalid and usage records were deleted with the account.',
    });
  }

  return NextResponse.json(
    { error: `Unknown action: "${action}". Available: register, verify, regenerate, delete.` },
    { status: 400 },
  );
}
