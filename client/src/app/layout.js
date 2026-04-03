import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'MeowChat // Secure Communications',
  description: 'Encrypted intelligence-grade chat system',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="font-mono bg-terminal-dark text-gray-100 antialiased min-h-screen">
        <div className="scanline" />
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
