// src/app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from '../src/app/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Plateau - Talent Escrow Platform',
  description: 'Create and browse jobs on-chain with Farcaster integration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}