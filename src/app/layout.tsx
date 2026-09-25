import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NotoWhats — Emissão de NFS-e & Gestão Médica no WhatsApp',
  description: 'SaaS para médicos emitirem notas fiscais e gerenciarem consultas diretamente pelo WhatsApp via Evolution API, Focus NFe e Pluggy.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Familjen+Grotesk:ital,wght@0,400..700;1,400..700&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.pluggy.ai/pluggy-connect/v2.3.1/pluggy-connect.js" async />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" async />
      </head>
      <body className="fixed inset-0 w-full h-full overflow-hidden overscroll-none bg-ds-page text-ds-ink font-text antialiased selection:bg-ds-ink selection:text-ds-white">
        <div id="root-viewport-wrapper" className="fixed inset-0 w-full h-full overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
