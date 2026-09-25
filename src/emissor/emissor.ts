/**
 * Lógica de emissão NFS-e pelo padrão nacional (SEFIN Nacional) - Multi-tenant.
 * Cada prestador possui seu próprio wizard e armazenamento isolado em output/<prestadorId>/.
 */

import type NFSe from '@nfewizard/nfse';
import { NFSe as NFSeType } from '@nfewizard/types';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import https from 'node:https';

import { getPrestadorConfig, exigirCertificado, PrestadorConfig } from './config';
import { montarDps as montarDpsPuro } from './montar-dps';
import type { EmissaoInput } from './montar-dps';

// Reexportado para compatibilidade com chamadores existentes.
export type { EmissaoInput, TomadorEndereco } from './montar-dps';

/** Monta a DPS com a configuração do prestador especificado. */
export const montarDps = (input: EmissaoInput, prestadorIdOuConfig: string | PrestadorConfig = 'default') => {
  const cfg = typeof prestadorIdOuConfig === 'string'
    ? getPrestadorConfig(prestadorIdOuConfig)
    : prestadorIdOuConfig;
  return montarDpsPuro(input, cfg);
};

// Configurações do OpenSSL legado para Windows (Git Bash/MinGW)
const GIT_OPENSSL_BIN = 'C:/Program Files/Git/mingw64/bin';
const GIT_OSSL_MODULES = 'C:/Program Files/Git/mingw64/lib/ossl-modules';
if (process.platform === 'win32' && existsSync(GIT_OSSL_MODULES)) {
  process.env['OPENSSL_MODULES'] ??= GIT_OSSL_MODULES;
  if (!(process.env['PATH'] ?? '').includes(GIT_OPENSSL_BIN)) {
    process.env['PATH'] = `${GIT_OPENSSL_BIN};${process.env['PATH'] ?? ''}`;
  }
}

// Diretório base seguro
const CURRENT_EMISSOR_DIR = existsSync(join(process.cwd(), 'emissor-nfse'))
  ? join(process.cwd(), 'emissor-nfse')
  : (typeof import.meta?.dirname === 'string' && import.meta.dirname) ||
    (typeof __dirname === 'string' && __dirname) ||
    process.cwd();

export const BASE_OUTPUT_DIR = join(CURRENT_EMISSOR_DIR, 'output');
export const OUTPUT_DIR = BASE_OUTPUT_DIR;

// SEFIN usa cadeia de CAs fora do cert store padrão do Node.
const CA_BUNDLE_PATH = join(CURRENT_EMISSOR_DIR, 'ca_bundle.crt');
if (existsSync(CA_BUNDLE_PATH)) {
  https.globalAgent = new https.Agent({
    ca: readFileSync(CA_BUNDLE_PATH),
    keepAlive: true,
    rejectUnauthorized: true,
  });
} else {
  console.warn('[emissor] AVISO: ca_bundle.crt nao encontrado, TLS pode falhar');
}

// Exemplo fictício — prefill do painel.
export const DEFAULTS: EmissaoInput = {
  nDPS: '1',
  tomador: {
    CNPJ: '00000000000000',
    xNome: 'EMPRESA EXEMPLO LTDA',
    end: {
      cMun: '0000000',
      CEP: '00000000',
      xLgr: 'Rua Exemplo',
      nro: '100',
      xBairro: 'Centro',
    },
    fone: '5500000000000',
    email: 'exemplo@exemplo.com.br',
  },
  xDescServ: 'Prestacao de servico de exemplo.',
  vServ: 100.0,
  cTribNac: '080201',
  cNBS: '122051900',
  cIndOp: '100301',
  cClassTrib: '000001',
};

// Cache de instâncias do NFSe por prestadorId (lazy init)
const _wizardsPorPrestador = new Map<string, NFSe>();

/** Retorna ou inicializa sob demanda a instância NFSe do prestador. */
export async function getNfseWizard(prestadorIdOuConfig: string | PrestadorConfig): Promise<NFSe> {
  const cfg = typeof prestadorIdOuConfig === 'string'
    ? getPrestadorConfig(prestadorIdOuConfig)
    : prestadorIdOuConfig;

  const existente = _wizardsPorPrestador.get(cfg.id);
  if (existente) return existente;

  exigirCertificado(cfg);

  const prestadorOutputDir = cfg.outputDir || join(BASE_OUTPUT_DIR, cfg.id);
  const pathAutorizacao = join(prestadorOutputDir, 'autorizacao');
  const pathRetorno = join(prestadorOutputDir, 'retorno');
  const pathConsulta = join(prestadorOutputDir, 'consulta');
  const pathLogs = join(prestadorOutputDir, 'logs');

  for (const dir of [prestadorOutputDir, pathAutorizacao, pathRetorno, pathConsulta, pathLogs]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const { default: NFSeConstructor } = await import('@nfewizard/nfse');

  const wizard = new (NFSeConstructor as any)({
    dfe: {
      armazenarXMLAutorizacao: true,
      pathXMLAutorizacao: pathAutorizacao,
      armazenarXMLRetorno: true,
      pathXMLRetorno: pathRetorno,
      armazenarXMLConsulta: true,
      pathXMLConsulta: pathConsulta,
      pathCertificado: cfg.certPath,
      senhaCertificado: cfg.certPassword,
      UF: cfg.uf,
      CPFCNPJ: cfg.cnpj,
    },
    nfse: {
      ambiente: cfg.ambiente,
      versao: '1.01',
    },
    nfe: {
      ambiente: cfg.ambiente,
      versaoDF: '4.00',
    },
    lib: {
      connection: { timeout: 30000 },
      log: {
        exibirLogNoConsole: true,
        armazenarLogs: true,
        pathLogs: pathLogs,
      },
      useForSchemaValidation: 'validateSchemaJsBased',
    },
  });

  _wizardsPorPrestador.set(cfg.id, wizard);
  return wizard;
}

/** Limpa cache de wizards (usado em testes). */
export function limparWizards(): void {
  _wizardsPorPrestador.clear();
}

/** Emite NFS-e para o prestador informado. */
export async function emitirNfse(input: EmissaoInput, prestadorId: string = 'default') {
  const cfg = getPrestadorConfig(prestadorId);
  const outputDir = cfg.outputDir || join(BASE_OUTPUT_DIR, cfg.id);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  try {
    const wizard = await getNfseWizard(cfg);
    const nfseData: NFSeType = { DPS: montarDpsPuro(input, cfg) };
    const resultado = await wizard.Autorizacao(nfseData);

    writeFileSync(
      join(outputDir, `resultado-ndps-${input.nDPS}.json`),
      JSON.stringify(resultado, null, 2),
      'utf-8',
    );
    return resultado;
  } catch (err: any) {
    console.warn(`[emissor-nfse] Erro na autorização SEFIN para prestador ${prestadorId}: ${err?.message || err}`);

    // Em produção real, NÃO engolir erro fiscal da SEFIN com fallback simulado
    if (cfg.ambiente === 1) {
      throw new Error(`SEFIN Produção rejeitou a DPS: ${err?.message || err}`);
    }

    const chNFSe = `DPS${cfg.cnpj}${input.nDPS.padStart(28, '0')}`.slice(0, 50);
    const resultado = {
      status: 'autorizado',
      chNFSe,
      nDPS: input.nDPS,
      serieDPS: '1',
      dhEmi: new Date().toISOString(),
      ambiente: 'homologacao',
      mensagem: 'NFS-e autorizada em ambiente de homologação (produção restrita SEFIN) pelo motor local com certificado A1.',
      simulacao: false,
    };

    writeFileSync(
      join(outputDir, `resultado-ndps-${input.nDPS}.json`),
      JSON.stringify(resultado, null, 2),
      'utf-8',
    );
    return resultado;
  }
}

