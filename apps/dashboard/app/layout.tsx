import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { RouteTitle } from '@/components/layout/route-title';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'DLE Digital Enterprise',
    template: '%s | DLE Digital Enterprise',
  },
  description: 'AI-Powered Industrial Enterprise Command Center',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased text-slate-900 bg-slate-50" suppressHydrationWarning>
        <RouteTitle />
        {children}
      </body>
    </html>
  );
}
