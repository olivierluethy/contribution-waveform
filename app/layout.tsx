import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Contribution Waveform',
  description:
    'GitHub contribution history as a smooth waveform graph, rendered on demand as an SVG badge for your profile README.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-200 antialiased">{children}</body>
    </html>
  );
}
