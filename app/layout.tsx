import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import PrototypeBanner from '@/components/layout/PrototypeBanner';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-display',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-mono',
  display: 'swap',
  preload: false, // Only used in code blocks — skip preload to avoid console warning
});

export const metadata: Metadata = {
  title: 'Pact — Put Your Money Where Your Goals Are',
  description: 'The accountability platform where missing your goal costs you — and keeping it pays you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <body className="bg-[#F5F7F0] text-[#1B1F1A] antialiased">
        <PrototypeBanner />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'white',
              border: '1px solid #E0EBE1',
              color: '#1B1F1A',
              borderRadius: '12px',
            },
          }}
        />
      </body>
    </html>
  );
}
