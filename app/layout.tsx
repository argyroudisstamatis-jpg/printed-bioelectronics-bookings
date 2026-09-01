import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Laboratory of Printed Bioelectronics · Equipment Calendar',
  description: 'Shared equipment calendar for the Laboratory of Printed Bioelectronics.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
