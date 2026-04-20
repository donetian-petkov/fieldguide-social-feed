import './globals.css';

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Fieldguide',
  description: 'Educational social feed for history, art, books, movies, country knowledge, photography, and nature.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
