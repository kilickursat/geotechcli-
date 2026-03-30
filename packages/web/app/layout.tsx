import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'geotechCLI — AI-Native Geotechnical Engineering',
  description:
    'The first AI-native CLI tool for geotechnical engineering. Bearing capacity, settlement, liquefaction, RMR, TBM prediction, and more — from the command line.',
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
    title: 'geotechCLI — AI-Native Geotechnical Engineering',
    description: 'Geotechnical calculations, AI interpretation, and visualization from the command line.',
    url: 'https://geotechcli.com',
    siteName: 'geotechCLI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geotechCLI',
    description: 'AI-native CLI for geotechnical engineering',
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
