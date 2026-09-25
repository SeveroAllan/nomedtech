/**
 * arquivar-nota.ts — organiza uma NFS-e emitida em pasta própria.
 *
 * Uso: npx tsx arquivar-nota.ts <id_venda>
 *
 * Lê chave (tabela notas) e competência (vendas.data_venda) do banco, então:
 *   - copia o XML autorizado (<output>/autorizacao/<chave>.xml) → nfse.xml
 *   - baixa o DANFSe da SEFIN nacional (ADN) → danfse.pdf
 * Destino: output/notas/<AAAA-MM>/<id_venda>/
 *
 * Idempotente: sobrescreve os arquivos de destino.
 */
import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getPrestadorConfig } from './config';
import { getComCertificado } from './http-mtls';

const BASE = import.meta.dirname;

// Argumentos: arquivar-nota.ts <id_venda> [--prestador <id>]
const args = process.argv.slice(2);
let idVenda = '';
let cliPrestadorId: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--prestador' && args[i + 1]) {
    cliPrestadorId = args[i + 1];
    i++;
  } else if (!args[i].startsWith('-') && !idVenda) {
    idVenda = args[i];
  }
}

if (!idVenda) {
  console.error('Uso: npx tsx arquivar-nota.ts <id_venda> [--prestador <id>]');
  process.exit(1);
}

const db = new DatabaseSync(join(BASE, 'output', 'emissor.db'));

const query = cliPrestadorId
  ? 'SELECT chave_acesso, ndps, prestador_id FROM notas WHERE id_venda = ? AND prestador_id = ?'
  : 'SELECT chave_acesso, ndps, prestador_id FROM notas WHERE id_venda = ?';

const params = cliPrestadorId ? [idVenda, cliPrestadorId] : [idVenda];
const nota = db.prepare(query).get(...params) as
  | { chave_acesso: string; ndps: number; prestador_id?: string }
  | undefined;

if (!nota) {
  console.error(`Sem nota emitida para id_venda=${idVenda} (tabela notas vazia ou prestador incorreto).`);
  process.exit(1);
}

const prestadorId = nota.prestador_id || cliPrestadorId || 'default';
const cfg = getPrestadorConfig(prestadorId);

const venda = db
  .prepare('SELECT data_venda FROM vendas WHERE id_venda = ?')
  .get(idVenda) as { data_venda?: string } | undefined;
const comp = (venda?.data_venda ?? '0000-00').slice(0, 7);
const chave = nota.chave_acesso;

const destDir = join(cfg.outputDir, 'notas', comp, idVenda);
mkdirSync(destDir, { recursive: true });

// XML autorizado
const xmlSrc = join(cfg.outputDir, 'autorizacao', `${chave}.xml`);
if (existsSync(xmlSrc)) {
  copyFileSync(xmlSrc, join(destDir, 'nfse.xml'));
  console.log(`XML  -> ${join(destDir, 'nfse.xml')}`);
} else {
  console.log(`AVISO: XML autorizado não encontrado em ${xmlSrc}`);
}

// DANFSe (PDF) via ADN
const { status: s, contentType: ct, buf } = await getComCertificado(
  `https://adn.nfse.gov.br/danfse/${chave}`,
  cfg,
);
if ((ct.includes('pdf') || buf.subarray(0, 4).toString() === '%PDF') && buf.length > 1000) {
  writeFileSync(join(destDir, 'danfse.pdf'), buf);
  console.log(`PDF  -> ${join(destDir, 'danfse.pdf')} (${buf.length} bytes)`);
} else {
  console.log(`AVISO: DANFSe não baixado (HTTP ${s}, ct=${ct}, ${buf.length} bytes)`);
}

console.log(`\nNota ${idVenda} arquivada para prestador [${prestadorId}]. chave=${chave} competência=${comp}`);

