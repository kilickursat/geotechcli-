import { betaDisabledResponse } from '@/lib/beta';

export async function POST() {
  return betaDisabledResponse(
    'Checkout and billing APIs',
    'Paid plans are visible for roadmap context only during strong beta. Live checkout will be enabled after Stripe approval and production validation are complete.',
  );
}
