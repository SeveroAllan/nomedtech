/**
 * check-convenio.ts — verifica se o município aderiu ao Convênio NFS-e Nacional
 * e consulta a alíquota vigente do serviço na competência atual.
 *
 * Uso: npx tsx check-convenio.ts [cTribNac]
 *   cTribNac: item da LC 116 com 6 dígitos (default 080201 — instrução/treinamento)
 *
 * Sem adesão ao Convênio, a emissão pela SEFIN Nacional não funciona — o caminho
 * passa a ser o sistema próprio da prefeitura.
 */
import { getPrestadorConfig } from './config';
import { getComCertificado } from './http-mtls';

// Parseia argumentos da CLI
const args = process.argv.slice(2);
let prestadorId = 'default';
let cTribNac = '080201';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--prestador' && args[i + 1]) {
    prestadorId = args[i + 1];
    i++;
  } else if (!args[i].startsWith('-')) {
    cTribNac = args[i];
  }
}

const cfg = getPrestadorConfig(prestadorId);

/** Falha de rede vira status 'ERR' aqui: este script diagnostica, nao aborta. */
async function get(url: string): Promise<{ status: number | string; data: string }> {
  try {
    const res = await getComCertificado(url, cfg);
    return { status: res.status, data: res.texto() };
  } catch (err) {
    return { status: 'ERR', data: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A DPS usa o codigo do servico sem pontos (`080201`); a API de parametrizacao
 * do ADN exige a forma pontuada com o desdobro (`08.02.01.000`) e recusa a
 * outra com "O codigo do servico deve ser composto por nove digitos".
 */
function paraFormatoParametrizacao(cTribNac: string): string {
  const d = cTribNac.replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}.000`;
}

const codigoParam = paraFormatoParametrizacao(cTribNac);
const hoje = new Date().toISOString().slice(0, 7); // competencia AAAA-MM
const mun = cfg.codMunicipio;

console.log(`Verificando adesão do prestador "${cfg.id}" (Município IBGE ${mun}, Serviço ${codigoParam})...\n`);

const checks: Array<[string, string]> = [
  ['prod convenio', `https://adn.nfse.gov.br/parametrizacao/${mun}/convenio`],
  [
    'restrita convenio',
    `https://adn.producaorestrita.nfse.gov.br/parametrizacao/${mun}/convenio`,
  ],
  [
    `aliquota vigente ${codigoParam}`,
    `https://adn.nfse.gov.br/parametrizacao/${mun}/${codigoParam}/${hoje}/aliquota`,
  ],
  [
    `historico de aliquotas ${codigoParam}`,
    `https://adn.nfse.gov.br/parametrizacao/${mun}/${codigoParam}/historicoaliquotas`,
  ],
];

for (const [label, url] of checks) {
  const { status, data } = await get(url);
  let body: string;
  try {
    body = JSON.stringify(JSON.parse(data)).slice(0, 1200);
  } catch {
    body = data.slice(0, 300);
  }
  console.log(`[${label}] HTTP ${status}: ${body}\n`);
}

console.log(
  'Leitura: em "prod convenio", aderenteEmissorNacional=1 significa que o seu\n' +
    'municipio emite pelo padrao nacional — e o unico resultado que decide se\n' +
    'este sistema serve para voce.\n\n' +
    'HTTP 404 em "restrita convenio" e comum e NAO impede nada: muitos municipios\n' +
    'aderiram so em producao, sem ambiente de teste. Onde isso acontece, nao existe\n' +
    'homologacao possivel e a primeira emissao ja vale como documento fiscal.',
);
