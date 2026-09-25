/**
 * Envio de e-mail pós-emissão com DANFSe anexo.
 * DANFSe: GET https://adn.nfse.gov.br/danfse/{chave} com mTLS (mesmo .p12 da emissão).
 * E-mail: Resend API via fetch (RESEND_API_KEY no ambiente).
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Venda } from './store';
import { getPrestadorConfig, PrestadorConfig } from './config';
import { getComCertificado } from './http-mtls';
import { erroEnvioEmail } from './email-validacao';

const DANFSE_URL = 'https://adn.nfse.gov.br/danfse';

export async function baixarDanfse(
  chave: string,
  prestadorIdOuConfig: string | PrestadorConfig = 'default',
): Promise<Buffer> {
  const res = await getComCertificado(`${DANFSE_URL}/${chave}`, prestadorIdOuConfig);
  if (res.status !== 200) {
    throw new Error(`DANFSe HTTP ${res.status}: ${res.texto().slice(0, 300)}`);
  }
  return res.buf;
}

export async function enviarEmailNota(
  venda: Venda,
  chave: string,
  prestadorIdOuConfig?: string | PrestadorConfig,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_NOTAS ?? process.env.RESEND_FROM;
  const erro = erroEnvioEmail({ email: venda.email, apiKey, from });
  if (erro) throw new Error(erro);

  const prestador = prestadorIdOuConfig ?? venda.prestador_id ?? 'default';
  const cfg = typeof prestador === 'string' ? getPrestadorConfig(prestador) : prestador;

  // PDF é best-effort: nota já emitida, e-mail sai mesmo sem anexo.
  let pdf: Buffer | null = null;
  try {
    pdf = await baixarDanfse(chave, cfg);
    writeFileSync(join(cfg.outputDir, `danfse-${chave}.pdf`), pdf);
  } catch (err) {
    console.warn(`  DANFSe indisponivel (${err}), enviando sem anexo`);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: venda.email,
      subject: `Nota fiscal emitida — ${venda.produto ?? 'serviço'}`,
      html:
        `<p>Olá, ${venda.nome ?? ''}!</p>` +
        `<p>Sua nota fiscal de serviço foi emitida.</p>` +
        `<p>Chave de acesso: <code>${chave}</code></p>` +
        (pdf ? '<p>O DANFSe está em anexo.</p>' : ''),
      ...(pdf
        ? {
            attachments: [
              { filename: `danfse-${chave}.pdf`, content: pdf.toString('base64') },
            ],
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
