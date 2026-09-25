import fs from 'node:fs';
import path from 'node:path';

interface LegalDocumentProps {
  fileName: string;
  title: string;
}

export function LegalDocument({ fileName, title }: LegalDocumentProps) {
  const filePath = path.join(process.cwd(), 'docs', fileName);
  const content = fs.readFileSync(filePath, 'utf8');

  return (
    <main className="min-h-[100dvh] bg-white px-6 py-12 text-ds-ink">
      <article className="mx-auto max-w-3xl">
        <a
          href="/login"
          className="font-text text-sm text-ds-ink-2 underline underline-offset-4 hover:text-ds-ink"
        >
          Voltar para o login
        </a>
        <h1 className="mt-10 font-display text-3xl font-medium tracking-tight sm:text-4xl">
          {title}
        </h1>
        <pre className="mt-8 whitespace-pre-wrap font-text text-[15px] leading-7 text-ds-ink-2">
          {content}
        </pre>
      </article>
    </main>
  );
}
