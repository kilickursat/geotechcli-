import type { Metadata } from 'next';
import './globals.css';
import { IS_PUBLIC_PRODUCTION, SITE_URL } from '@/lib/site';

const title = IS_PUBLIC_PRODUCTION
  ? 'geotechCLI - Agentic AI CLI for Geotechnical Engineering'
  : 'geotechCLI Strong Beta - Geotechnical CLI';

const description = IS_PUBLIC_PRODUCTION
  ? 'geotechCLI is an agentic AI command-line tool for geotechnical engineering. Deterministic calculations are free and offline; LLM and bring-your-own-key workflows are donation-supported. Privacy-first.'
  : 'Strong beta for geotechCLI. Deterministic geotechnical calculations and hosted GLM beta access are live now with privacy-first guardrails.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'geotechnical engineering',
    'CLI',
    'AI',
    'bearing capacity',
    'settlement',
    'liquefaction',
    'RMR',
    'TBM',
    'tunnel',
    'soil classification',
  ],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  // Only the public production host is indexable; beta and previews stay noindex.
  robots: {
    index: IS_PUBLIC_PRODUCTION,
    follow: IS_PUBLIC_PRODUCTION,
  },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: 'geotechCLI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="overflow-x-hidden">{children}</body>
    </html>
  );
}
