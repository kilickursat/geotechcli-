import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'geotechCLI Strong Beta - Geotechnical CLI',
  description:
    'Strong beta for geotechCLI. Deterministic geotechnical calculations are live now, with privacy-first AI evaluation and hosted GLM beta rolling out in later waves.',
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
  metadataBase: new URL('https://geotechcli.com'),
  openGraph: {
    title: 'geotechCLI Strong Beta',
    description: 'Privacy-first strong beta for a geotechnical engineering CLI with deterministic workflows live now.',
    url: 'https://geotechcli.com',
    siteName: 'geotechCLI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geotechCLI Strong Beta',
    description: 'Privacy-first deterministic geotechnical CLI workflows are live now.',
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
