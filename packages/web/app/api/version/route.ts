import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_VISION_MODEL,
  GEOTECHCLI_VERSION,
} from '@geotechcli/core/meta';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      version: GEOTECHCLI_VERSION,
      provider: DEFAULT_LLM_PROVIDER,
      defaults: {
        text: DEFAULT_LLM_MODEL,
        vision: DEFAULT_LLM_VISION_MODEL,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    },
  );
}
