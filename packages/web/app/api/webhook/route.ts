import { betaDisabledResponse } from '@/lib/beta';

export async function POST() {
  return betaDisabledResponse(
    'Stripe webhook endpoint',
    'Webhook processing is disabled during strong beta because live billing is not active yet.',
  );
}
