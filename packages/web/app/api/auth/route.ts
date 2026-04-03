import { betaDisabledResponse } from '@/lib/beta';

export async function POST() {
  return betaDisabledResponse(
    'Signup and account APIs',
    'Strong beta is running without signup, account management, or payment flows. These surfaces will return after the hosted beta AI and billing stack are fully validated.',
  );
}
