import type { Metadata } from 'next';
import './globals.css';

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://beta.geotechcli.com';

export const metadata: Metadata = {
  title: 'geotechCLI Strong Beta - Geotechnical CLI',
  description:
    'Strong beta for geotechCLI. Deterministic geotechnical calculations and hosted GLM beta access are live now with privacy-first guardrails.',
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
  metadataBase: new URL(appUrl),
  openGraph: {
    title: 'geotechCLI Strong Beta',
    description: 'Privacy-first strong beta for a geotechnical engineering CLI with deterministic workflows and hosted GLM beta access live now.',
    url: appUrl,
    siteName: 'geotechCLI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geotechCLI Strong Beta',
    description: 'Privacy-first deterministic geotechnical CLI workflows and hosted GLM beta access are live now.',
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
