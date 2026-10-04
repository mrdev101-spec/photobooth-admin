import type { Metadata } from 'next';
import { Sarabun } from 'next/font/google';
import './globals.css';

// Sarabun: the kiosk also uses it for Thai text on prints
const thai = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap'
});

export const metadata: Metadata = {
  title: { default: 'Photobooth Admin', template: '%s · Photobooth Admin' },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
