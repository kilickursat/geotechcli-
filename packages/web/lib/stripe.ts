// ---------------------------------------------------------------------------
// Stripe Integration — geotechCLI Payments
//
// Uses Stripe's REST API directly to avoid pulling in the full stripe SDK
// (keeps the Cloudflare Workers / Edge deployment light).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getStripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return { secretKey, webhookSecret, publishableKey };
}

// ---------------------------------------------------------------------------
// Price mapping — maps geotechCLI tiers to Stripe price IDs
//
// Set these in your environment. Create these products/prices in Stripe Dashboard:
//   - Lite Pro: $15/month
//   - Pro: $49/month
//   - Annual: $399/year
// ---------------------------------------------------------------------------

export function getPriceId(tier: string): string | null {
  const prices: Record<string, string | undefined> = {
    lite_pro: process.env.STRIPE_PRICE_LITE_PRO,
    pro: process.env.STRIPE_PRICE_PRO,
    annual: process.env.STRIPE_PRICE_ANNUAL,
  };

  return prices[tier] ?? null;
}

export function getTierFromPriceId(priceId: string): string {
  const litePro = process.env.STRIPE_PRICE_LITE_PRO;
  const pro = process.env.STRIPE_PRICE_PRO;
  const annual = process.env.STRIPE_PRICE_ANNUAL;

  if (priceId === litePro) return 'lite_pro';
  if (priceId === pro) return 'pro';
  if (priceId === annual) return 'annual';
  return 'free';
}

// ---------------------------------------------------------------------------
// Stripe REST API helpers
// ---------------------------------------------------------------------------

async function stripeRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  body?: Record<string, string>,
): Promise<{ data: T | null; error: string | null }> {
  const { secretKey } = getStripeConfig();

  if (!secretKey) {
    return { data: null, error: 'Stripe secret key not configured.' };
  }

  const url = `https://api.stripe.com/v1${endpoint}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
  };

  let bodyStr: string | undefined;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    bodyStr = new URLSearchParams(body).toString();
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Unknown' } }));
      return { data: null, error: (err as any).error?.message ?? `Stripe ${res.status}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Checkout Session
// ---------------------------------------------------------------------------

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer: string;
  subscription: string;
  payment_status: string;
  metadata: Record<string, string>;
}

export async function createCheckoutSession(params: {
  priceId: string;
  userId: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ session: StripeCheckoutSession | null; error: string | null }> {
  const { data, error } = await stripeRequest<StripeCheckoutSession>('POST', '/checkout/sessions', {
    'mode': 'subscription',
    'payment_method_types[0]': 'card',
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    'success_url': params.successUrl,
    'cancel_url': params.cancelUrl,
    'customer_email': params.userEmail,
    'metadata[user_id]': params.userId,
    'metadata[geotech_tier]': 'pending',
    'allow_promotion_codes': 'true',
    'subscription_data[metadata][user_id]': params.userId,
  });

  return { session: data, error };
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{
      price: { id: string };
    }>;
  };
  metadata: Record<string, string>;
}

export async function getSubscription(subscriptionId: string): Promise<{ sub: StripeSubscription | null; error: string | null }> {
  const { data, error } = await stripeRequest<StripeSubscription>('GET', `/subscriptions/${subscriptionId}`);
  return { sub: data, error };
}

export async function cancelSubscription(subscriptionId: string): Promise<{ error: string | null }> {
  // Cancel at period end (user keeps access until billing period ends)
  const { error } = await stripeRequest('POST', `/subscriptions/${subscriptionId}`, {
    'cancel_at_period_end': 'true',
  });
  return { error };
}

// ---------------------------------------------------------------------------
// Customer portal (for managing billing)
// ---------------------------------------------------------------------------

export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await stripeRequest<{ url: string }>('POST', '/billing_portal/sessions', {
    'customer': customerId,
    'return_url': returnUrl,
  });

  return { url: data?.url ?? null, error };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
//
// Stripe sends a `Stripe-Signature` header with every webhook.
// We must verify it using HMAC-SHA256 to ensure the event is genuine.
// ---------------------------------------------------------------------------

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  // Parse Stripe signature header: t=timestamp,v1=signature
  const parts = signature.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigPart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !sigPart) return false;

  const timestamp = timestampPart.slice(2);
  const expectedSig = sigPart.slice(3);

  // Check timestamp freshness (reject events older than 5 minutes)
  const eventAge = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (eventAge > 300) return false;

  // Compute HMAC-SHA256
  const signedPayload = `${timestamp}.${payload}`;

  // Use Web Crypto API (works in Node 18+, Cloudflare Workers, Edge)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (computedSig.length !== expectedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedSig.length; i++) {
    mismatch |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}
