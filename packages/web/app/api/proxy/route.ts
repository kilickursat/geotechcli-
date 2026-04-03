import { betaDisabledResponse } from '@/lib/beta';

export async function POST() {
  return betaDisabledResponse(
    'Hosted beta AI gateway',
    'Hosted anonymous GLM access will be enabled in Wave 2 after the dedicated beta proxy and Redis-backed rate limits are in place.',
    503,
  );
}

export async function GET() {
  return betaDisabledResponse(
    'Hosted beta AI gateway',
    'Hosted anonymous GLM access is being prepared for the next strong-beta wave.',
    503,
  );
}
