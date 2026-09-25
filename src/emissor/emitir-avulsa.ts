/**
 * emitir-avulsa.ts — emissão real de uma NFS-e única a partir de um arquivo JSON.
 *
 * Uso:
 *   nfse emitir nota.json           confere e mostra o que seria enviado
 *   nfse emitir nota.json --real    emite de verdade (irreversivel)
 *
 * Formato do JSON (ver nota-exemplo.json):
 * {
 *   "idVenda": "cliente-2026-01",
 *   "produto": "consultoria",
 *   "tomador": { "CNPJ": "...", "xNome": "...", "end": {...}, "email": "..." },
 *   "xDescServ": "...", "vServ": 100.0,
 *   "cTribNac": "080201", "cNBS": "122051900"
 * }
 *
 * Emissão em produção é irreversível — só se corrige por substituição, no prazo
 * do município. Confira o JSON antes de rodar.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmissaoInput } from './montar-dps';
import { getPrestadorConfig, PrestadorConfig } from './config';
import { conferirDps } from './dps-xml';
import { initDb, proximoNDPS, registrarNota, upsertVenda } from './store';
import {
  cepInvalido,
  cNBSInvalido,
  cTribNacInvalido,
  codMunicipioInvalido,
  docTomadorInvalido,
  vServInvalido,
} from './validacoes.mjs';

interface NotaAvulsa extends Omit<EmissaoInput, 'nDPS' | 'cIndOp' | 'cClassTrib'> {
  idVenda: string;
  prestadorId?: string;
  produto?: string;
  cIndOp?: string;
  cClassTrib?: string;
}

/** Chave = nome do XML mais novo em autorizacao/ (a lib grava <chave>.xml no sucesso). */
function chaveDoXmlMaisNovo(outputDir: string): string | null {
  const dir = join(outputDir, 'autorizacao');
  if (!readdirSync || !existsSync(dir)) return null;
  const xmls = readdirSync(dir).filter((f) => f.endsWith('.xml'));
  if (xmls.length === 0) return null;
  const novo = xmls
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0];
  return novo.f.replace(/\.xml$/, '');
}

function carregar(path: string): NotaAvulsa {
  const nota = JSON.parse(readFileSync(path, 'utf-8')) as NotaAvulsa;
  const faltando = (
    ['idVenda', 'tomador', 'xDescServ', 'vServ', 'cTribNac', 'cNBS'] as const
  ).filter((k) => nota[k] === undefined || nota[k] === null);
  if (faltando.length > 0) {
    throw new Error(`Campos ausentes no JSON: ${faltando.join(', ')}`);
  }
  const problemas = [
    docTomadorInvalido(nota.tomador),
    cTribNacInvalido(nota.cTribNac),
    cNBSInvalido(nota.cNBS),
    vServInvalido(nota.vServ),
    nota.tomador.end ? cepInvalido(nota.tomador.end.CEP) : null,
    nota.tomador.end ? codMunicipioInvalido(nota.tomador.end.cMun) : null,
  ].filter(Boolean);
  if (problemas.length > 0) {
    throw new Error(`JSON invalido:\n  - ${problemas.join('\n  - ')}`);
  }
  return nota;
}

/**
 * Dry-run: monta a DPS de verdade, valida contra o XSD e grava o XML para
 * conferencia. Nada e enviado e nada e gravado no banco.
 */
async function conferir(input: EmissaoInput, nota: NotaAvulsa, cfg: PrestadorConfig): Promise<void> {
  const doc = input.tomador.CNPJ ?? input.tomador.CPF ?? '';
  const valor = input.vServ.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  console.log(`\n=== CONFERENCIA [Prestador: ${cfg.id}] (nada foi enviado) ===\n`);
  console.log(`  id_venda ....... ${nota.idVenda}`);
  console.log(`  nDPS ........... ${input.nDPS}   <- proximo numero que sera usado`);
  console.log(`  tomador ........ ${input.tomador.xNome} (${doc})`);
  console.log(`  valor .......... ${valor}`);
  console.log(`  servico ........ cTribNac ${input.cTribNac} | cNBS ${input.cNBS}`);
  console.log(`  descricao ...... ${input.xDescServ}`);
  console.log(`  tributos ....... ${input.pTotTribSN ?? cfg.pTotTribSN}% (pTotTribSN)`);
  console.log(
    `  ambiente ....... ${cfg.ambiente === 1 ? 'PRODUCAO — a nota valera de verdade' : 'producao restrita'}`,
  );

  const { ok, msg, xml } = await conferirDps(input, cfg);
  console.log(`\n  XSD ............ ${ok ? 'OK' : 'FALHOU'} — ${msg}`);

  if (xml) {
    const destino = join(cfg.outputDir, `dry-run-${nota.idVenda}.xml`);
    mkdirSync(cfg.outputDir, { recursive: true });
    writeFileSync(destino, xml, 'utf-8');
    console.log(`  XML ............ ${destino}`);
  }

  if (!ok) {
    console.error('\nCorrija o JSON antes de emitir.');
    process.exit(1);
  }

  console.log(
    `\nConfira os dados acima. Para emitir de verdade:\n  nfse emitir ${jsonPathArg()} --prestador ${cfg.id} --real\n`,
  );
}

/** O caminho do JSON como o usuario digitou, para repetir no comando sugerido. */
function jsonPathArg(): string {
  const args = process.argv.slice(2).filter((a) => a !== '--real' && a !== '--prestador');
  const p = args[0] ?? 'nota.json';
  return p.includes(' ') ? `"${p}"` : p;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  let jsonPath = '';
  let cliPrestadorId: string | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--prestador' && rawArgs[i + 1]) {
      cliPrestadorId = rawArgs[i + 1];
      i++;
    } else if (!rawArgs[i].startsWith('-') && !jsonPath) {
      jsonPath = rawArgs[i];
    }
  }

  if (!jsonPath) {
    console.error('Uso: EMITIR_REAL=1 npx tsx emitir-avulsa.ts <nota.json> [--prestador <id>]');
    process.exit(1);
  }

  const nota = carregar(jsonPath);
  const prestadorId = cliPrestadorId || nota.prestadorId || 'default';
  const cfg = getPrestadorConfig(prestadorId);

  initDb();
  const nDPS = String(proximoNDPS(prestadorId));

  const input: EmissaoInput = {
    nDPS,
    tomador: nota.tomador,
    xDescServ: nota.xDescServ,
    vServ: nota.vServ,
    cTribNac: nota.cTribNac,
    cNBS: nota.cNBS,
    cIndOp: nota.cIndOp ?? '100301',
    cClassTrib: nota.cClassTrib ?? '000001',
    ...(nota.pTotTribSN !== undefined ? { pTotTribSN: nota.pTotTribSN } : {}),
  };

  // Sem --real: confere e para.
  if (process.env['EMITIR_REAL'] !== '1') {
    await conferir(input, nota, cfg);
    return;
  }

  console.log(`Emitindo nDPS=${nDPS} para ${input.tomador.xNome} (${nota.idVenda}) [Prestador: ${prestadorId}]...`);
  const { emitirNfse } = await import('./emissor');
  const resultado = await emitirNfse(input, prestadorId);
  const r = resultado as Record<string, unknown>;
  let chave = (r['chNFSe'] as string) ?? (r['chaveAcesso'] as string) ?? '';
  if (!/^\d{50}$/.test(chave)) {
    chave = chaveDoXmlMaisNovo(cfg.outputDir) ?? '';
  }
  if (!/^\d{50}$/.test(chave)) {
    throw new Error(
      `Nota autorizada mas chave não capturada (valor: "${chave}"). Ver ${join(cfg.outputDir, 'autorizacao')}.`,
    );
  }

  upsertVenda({
    id_venda: nota.idVenda,
    prestador_id: prestadorId,
    fonte: 'avulsa',
    produto: nota.produto ?? 'avulsa',
    valor: input.vServ,
    data_venda: new Date().toISOString().slice(0, 10),
    cpf_cnpj: input.tomador.CNPJ ?? input.tomador.CPF,
    nome: input.tomador.xNome,
    ...(input.tomador.email ? { email: input.tomador.email } : {}),
    fila: 'pronta',
    status: 'emitida',
  });

  registrarNota({
    chave_acesso: chave,
    ndps: Number(nDPS),
    id_venda: nota.idVenda,
    prestador_id: prestadorId,
    emitida_em: new Date().toISOString(),
  }, prestadorId);

  console.log(`AUTORIZADA. chave=${chave}`);
  console.log(`Arquivar: npx tsx arquivar-nota.ts ${nota.idVenda} --prestador ${prestadorId}`);
}

main().catch((err) => {
  // Erro completo, com stack: e o caminho de emissao real e irreversivel —
  // diagnostico truncado aqui custa caro.
  console.error('FALHA na emissão:', err);
  process.exit(1);
});
