import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ChunkLoadRecovery } from '@/components/layout/chunk-load-recovery';
import { AuthSessionGuard } from '@/components/layout/auth-session-guard';
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
      <body className="min-w-0 overflow-x-clip bg-slate-50 font-sans antialiased text-slate-900" suppressHydrationWarning>
        <ChunkLoadRecovery />
        <AuthSessionGuard />
        <RouteTitle />
        {children}
      </body>
    </html>
  );
}
