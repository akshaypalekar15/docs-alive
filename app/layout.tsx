import type { Metadata } from 'next';
import { Literata, Instrument_Sans } from 'next/font/google';
import './globals.css';

const serif = Literata({ subsets: ['latin'], variable: '--serif' });
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--sans' });

export const metadata: Metadata = { title: 'Docs Alive', description: 'Turn any document into an interactive reading experience' };

const themeScript = `try{var t=localStorage.getItem('docs-alive-theme');if(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${serif.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
