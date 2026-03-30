import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByEmail,
  getUserById,
  getUserByStripeCustomer,
  linkStripeCustomer,
  updateSubscription,
} from '@geotechcli/core';
import {
  verifyWebhookSignature,
  getStripeConfig,
  getTierFromPriceId,
  getSubscription,
} from '@/lib/stripe';
import type { GeotechUser, UserTier } from '@geotechcli/core';

const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function trackEvent(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}

function mapSubscriptionStatus(
  stripeStatus: string,
  cancelAtPeriodEnd: boolean,
): 'active' | 'past_due' | 'canceled' | 'trialing' | 'none' {
  if (cancelAtPeriodEnd) return 'canceled';
  if (stripeStatus === 'active') return 'active';
  if (stripeStatus === 'past_due') return 'past_due';
  if (stripeStatus === 'trialing') return 'trialing';
  if (stripeStatus === 'canceled' || stripeStatus === 'unpaid') return 'canceled';
  return 'none';
}

async function resolveCheckoutUser(params: {
  userId: string;
  customerId: string;
  customerEmail: string;
}): Promise<GeotechUser | null> {
  if (params.userId) {
    const user = await getUserById(params.userId);
    if (user) return user;
  }

  if (params.customerId) {
    const user = await getUserByStripeCustomer(params.customerId);
    if (user) return user;
  }

  if (params.customerEmail) {
    const user = await getUserByEmail(params.customerEmail);
    if (user) return user;
  }

  return null;
}

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [id, ts] of processedEvents.entries()) {
      if (ts < cutoff) processedEvents.delete(id);
    }
  }, CLEANUP_INTERVAL_MS);
}

export async function POST(req: NextRequest) {
  const { webhookSecret } = getStripeConfig();

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    logger.error('Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (processedEvents.has(event.id)) {
    logger.info('Duplicate webhook event skipped', {
      eventId: event.id,
      type: event.type,
    });
    return NextResponse.json({ received: true, duplicate: true });
  }
  trackEvent(event.id);

  const eventType = event.type;
  const obj = event.data.object;

  logger.info('Webhook event received', { eventId: event.id, type: eventType });

  try {
    switch (eventType) {
      case 'checkout.session.completed': {
        const customerId = String(obj.customer ?? '');
        const subscriptionId = String(obj.subscription ?? '');
        const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};
        const userId = String(metadata.user_id ?? '');
        const customerEmail = String(obj.customer_email ?? '');

        if (!userId && !customerEmail && !customerId) {
          logger.error('Checkout session completed without resolvable user identity', {
            eventId: event.id,
          });
          break;
        }

        const user = await resolveCheckoutUser({ userId, customerId, customerEmail });
        if (!user) {
          logger.error('Checkout session completed but user was not found', {
            eventId: event.id,
            userId,
            customerId,
            customerEmail,
          });
          break;
        }

        if (customerId) {
          const linkResult = await linkStripeCustomer(user.id, customerId);
          if (linkResult.error) {
            logger.error('Failed to link Stripe customer after checkout', {
              eventId: event.id,
              userId: user.id,
              customerId,
              error: linkResult.error,
            });
          }
        }

        if (!subscriptionId) {
          logger.warn('Checkout completed without subscription id', {
            eventId: event.id,
            userId: user.id,
          });
          break;
        }

        const { sub, error } = await getSubscription(subscriptionId);
        if (error || !sub) {
          logger.error('Failed to fetch Stripe subscription after checkout', {
            eventId: event.id,
            userId: user.id,
            subscriptionId,
            error,
          });
          break;
        }

        const priceId = sub.items.data[0]?.price?.id ?? '';
        const tier = getTierFromPriceId(priceId) as UserTier;
        const updateResult = await updateSubscription(user.id, {
          tier,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId || null,
          subscription_status: 'active',
          subscription_end_at: new Date(sub.current_period_end * 1000).toISOString(),
        });

        if (updateResult.error) {
          logger.error('Failed to update subscription after checkout', {
            eventId: event.id,
            userId: user.id,
            subscriptionId,
            error: updateResult.error,
          });
          break;
        }

        logger.info('Subscription activated from checkout', {
          eventId: event.id,
          userId: user.id,
          tier,
          subscriptionId,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const customerId = String(obj.customer ?? '');
        const subscriptionId = String(obj.id ?? '');
        const status = String(obj.status ?? '');
        const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);
        const currentPeriodEnd = Number(obj.current_period_end ?? 0);

        const user = await getUserByStripeCustomer(customerId);
        if (!user) {
          logger.error('Subscription updated but customer was not found', {
            eventId: event.id,
            customerId,
            subscriptionId,
          });
          break;
        }

        const items = (obj.items as { data: Array<{ price: { id: string } }> } | undefined)?.data ?? [];
        const priceId = items[0]?.price?.id ?? user.stripe_price_id ?? '';
        const tier = getTierFromPriceId(priceId) as UserTier;
        const subscriptionStatus = mapSubscriptionStatus(status, cancelAtPeriodEnd);
        const effectiveTier =
          subscriptionStatus === 'canceled' && !cancelAtPeriodEnd ? 'free' : tier;

        const updateResult = await updateSubscription(user.id, {
          tier: effectiveTier,
          stripe_subscription_id: subscriptionId || user.stripe_subscription_id,
          stripe_price_id: priceId || user.stripe_price_id,
          subscription_status: subscriptionStatus,
          subscription_end_at:
            currentPeriodEnd > 0
              ? new Date(currentPeriodEnd * 1000).toISOString()
              : null,
        });

        if (updateResult.error) {
          logger.error('Failed to update subscription state', {
            eventId: event.id,
            userId: user.id,
            subscriptionId,
            error: updateResult.error,
          });
          break;
        }

        logger.info('Subscription state updated', {
          eventId: event.id,
          userId: user.id,
          tier: effectiveTier,
          subscriptionStatus,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = String(obj.customer ?? '');
        const user = await getUserByStripeCustomer(customerId);
        if (!user) {
          logger.error('Subscription deleted but customer was not found', {
            eventId: event.id,
            customerId,
          });
          break;
        }

        const updateResult = await updateSubscription(user.id, {
          tier: 'free',
          stripe_subscription_id: null,
          stripe_price_id: null,
          subscription_status: 'none',
          subscription_end_at: null,
        });

        if (updateResult.error) {
          logger.error('Failed to downgrade deleted subscription to free', {
            eventId: event.id,
            userId: user.id,
            error: updateResult.error,
          });
          break;
        }

        logger.info('Subscription deleted and downgraded to free', {
          eventId: event.id,
          userId: user.id,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const customerId = String(obj.customer ?? '');
        const user = await getUserByStripeCustomer(customerId);
        if (!user) {
          logger.warn('Payment failed but customer was not found', {
            eventId: event.id,
            customerId,
          });
          break;
        }

        const updateResult = await updateSubscription(user.id, {
          tier: user.tier as UserTier,
          stripe_subscription_id: user.stripe_subscription_id,
          stripe_price_id: user.stripe_price_id,
          subscription_status: 'past_due',
          subscription_end_at: user.subscription_end_at,
        });

        if (updateResult.error) {
          logger.error('Failed to mark subscription as past_due', {
            eventId: event.id,
            userId: user.id,
            error: updateResult.error,
          });
          break;
        }

        logger.info('Subscription marked as past_due', {
          eventId: event.id,
          userId: user.id,
        });
        break;
      }

      default:
        logger.info('Unhandled webhook event', { eventId: event.id, type: eventType });
    }
  } catch (err) {
    logger.error('Webhook processing error', {
      eventId: event.id,
      type: eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}
