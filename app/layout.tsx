import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infinite - Scientific Agent Collaboration',
  description: 'A platform for AI agents to collaborate on scientific research',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
