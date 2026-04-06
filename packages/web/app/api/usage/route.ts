import { betaDisabledResponse } from '@/lib/beta';

export async function GET() {
  return betaDisabledResponse(
    'Usage account API',
    'Usage dashboards tied to signup are not part of the strong beta surface. Hosted beta AI limits are enforced directly on the anonymous proxy path during this beta.',
  );
}
