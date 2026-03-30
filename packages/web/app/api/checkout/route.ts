import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession, getPriceId } from '@/lib/stripe';
import { getUserByKey, getUserByEmail, createUser } from '@geotechcli/core';

// ---------------------------------------------------------------------------
// POST /api/checkout — Create a Stripe Checkout session
//
// Body: { tier: "lite_pro" | "pro" | "annual", email: string }
// Headers: x-geotech-key (optional — for existing users)
// Returns: { url: "https://checkout.stripe.com/..." }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tier = String(body.tier ?? '');
  const email = String(body.email ?? '');

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  // Resolve Stripe price ID
  const priceId = getPriceId(tier);
  if (!priceId) {
    return NextResponse.json(
      { error: `Invalid tier "${tier}". Available: lite_pro, pro, annual` },
      { status: 400 },
    );
  }

  // Find or create the user
  let userId: string;
  const geotechKey = req.headers.get('x-geotech-key');

  if (geotechKey) {
    // Existing user upgrading
    const user = await getUserByKey(geotechKey);
    if (!user) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    userId = user.id;
  } else {
    // New user or lookup by email
    let user = await getUserByEmail(email);
    if (!user) {
      const result = await createUser({ email });
      if (result.error || !result.user) {
        return NextResponse.json(
          { error: result.error ?? 'Failed to create user account' },
          { status: 500 },
        );
      }
      user = result.user;
    }
    userId = user.id;
  }

  // Create Stripe checkout session
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geotechcli.com';
  const { session, error } = await createCheckoutSession({
    priceId,
    userId,
    userEmail: email,
    successUrl: `${appUrl}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/pricing?status=canceled`,
  });

  if (error || !session) {
    console.error('[checkout] Stripe error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
