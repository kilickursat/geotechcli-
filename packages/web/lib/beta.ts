import { NextResponse } from 'next/server';

export const STRONG_BETA_MODE = true;

export function betaDisabledResponse(feature: string, detail: string, status = 410) {
  return NextResponse.json(
    {
      beta: STRONG_BETA_MODE,
      status: 'coming_soon',
      feature,
      message: `${feature} is disabled in strong beta.`,
      detail,
      available_now: [
        'Deterministic geotechnical CLI commands',
        'Public docs and changelog',
        'Strong beta website and install flow',
      ],
    },
    { status },
  );
}
