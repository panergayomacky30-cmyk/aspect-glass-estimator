import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aspect | Storefront Estimator',
  description: 'Storefront glazing budget estimating workspace',
  icons: {
    icon: '/aspect-glasswork-logo.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
