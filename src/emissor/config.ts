/**
 * config.ts — identidade do prestador e parâmetros fiscais por tenant.
 *
 * Cada prestador possui seu próprio CNPJ, Inscrição Municipal, certificado A1 (.p12)
 * e ambiente de emissão (produção real vs restrita).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { cnpjInvalido, codMunicipioInvalido } from './validacoes.mjs';

export interface PrestadorConfig {
  /** Identificador único do tenant/prestador (ex.: CNPJ ou slug/id) */
  id: string;
  /** CNPJ do prestador, apenas dígitos (14 dígitos) */
  cnpj: string;
  /** Inscrição Municipal na prefeitura */
  im: string;
  /** Sigla do estado (UF), ex.: SP */
  uf: string;
  /** Código IBGE do município do prestador (7 dígitos) */
  codMunicipio: string;
  /** Caminho do certificado digital A1 (.p12) */
  certPath: string;
  /** Senha do certificado digital */
  certPassword: string;
  /** 1 = produção real; 2 = produção restrita/homologação */
  ambiente: 1 | 2;
  /** Diretório base de saída para artefatos deste prestador */
  outputDir: string;
  /** Regime tributário */
  regTrib: {
    opSimpNac: 1 | 2 | 3;
    regApTribSN: 1 | 2 | 3;
    regEspTrib: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
  };
  /** % aproximado de tributos do Simples (Lei da Transparência) */
  pTotTribSN: number;
}

export type PrestadorConfigProvider = (prestadorId: string) => PrestadorConfig | null;

// Registro em memória de prestadores (útil em testes ou cache)
const _memoryConfigs = new Map<string, PrestadorConfig>();
let _customProvider: PrestadorConfigProvider | null = null;

/** Define um provedor customizado de configuração de prestador. */
export function setPrestadorConfigProvider(provider: PrestadorConfigProvider | null): void {
  _customProvider = provider;
}

/** Registra ou atualiza um prestador em memória. */
export function registrarPrestadorConfig(cfg: PrestadorConfig): void {
  validarPrestadorConfig(cfg);
  _memoryConfigs.set(cfg.id, cfg);
}

/** Limpa configurações registradas em memória (usado em testes). */
export function limparPrestadoresMemoria(): void {
  _memoryConfigs.clear();
}

/** Valida a conformidade dos dados do prestador com o padrão fiscal. */
export function validarPrestadorConfig(cfg: PrestadorConfig): void {
  if (!cfg.id?.trim()) {
    throw new Error('ID do prestador é obrigatório.');
  }

  const cnpjClean = cfg.cnpj?.replace(/\D/g, '') ?? '';
  const erroCnpj = cnpjInvalido(cnpjClean);
  if (erroCnpj) {
    throw new Error(`Prestador ${cfg.id}: CNPJ inválido (${erroCnpj}).`);
  }

  // A Inscrição Municipal é opcional no padrão SEFIN Nacional quando não há CNC complementar (E0120).
  if (cfg.im && typeof cfg.im !== 'string') {
    throw new Error(`Prestador ${cfg.id}: Inscrição Municipal inválida.`);
  }

  if (!cfg.uf?.trim() || cfg.uf.trim().length !== 2) {
    throw new Error(`Prestador ${cfg.id}: UF inválida (${cfg.uf}).`);
  }

  const codMunClean = cfg.codMunicipio?.replace(/\D/g, '') ?? '';
  const erroMun = codMunicipioInvalido(codMunClean);
  if (erroMun) {
    throw new Error(`Prestador ${cfg.id}: Código de município inválido (${erroMun}).`);
  }

  if (!cfg.certPath?.trim()) {
    throw new Error(`Prestador ${cfg.id}: Caminho do certificado (certPath) é obrigatório.`);
  }

  if (cfg.ambiente !== 1 && cfg.ambiente !== 2) {
    throw new Error(`Prestador ${cfg.id}: Ambiente inválido (${cfg.ambiente}). Use 1 para produção ou 2 para homologação.`);
  }
}

/**
 * Confere se o certificado do prestador existe no disco.
 * Chamado no ponto de uso (emissão real, DANFSe, consultas mTLS).
 */
export function exigirCertificado(alvo: PrestadorConfig | string): void {
  const cfg = typeof alvo === 'string' ? getPrestadorConfig(alvo) : alvo;
  if (!existsSync(cfg.certPath)) {
    throw new Error(`Certificado não encontrado para o prestador "${cfg.id}": ${cfg.certPath}`);
  }
}

/**
 * Carrega a configuração de um prestador a partir de variáveis de ambiente (.env),
 * caso estejam presentes (compatibilidade / tenant 'default').
 */
function carregarDoAmbiente(prestadorId = 'default'): PrestadorConfig | null {
  const currentDir =
    (typeof import.meta?.dirname === 'string' && import.meta.dirname) ||
    (typeof __dirname === 'string' && __dirname) ||
    join(process.cwd(), 'emissor-nfse');

  try {
    process.loadEnvFile(join(currentDir, '.env'));
  } catch {
    /* sem .env — segue com process.env */
  }

  const cnpjRaw = process.env['NFSE_CNPJ']?.trim();
  const certPath = process.env['NFSE_CERT_PATH']?.trim();
  if (!cnpjRaw || !certPath) {
    return null;
  }

  const cnpj = cnpjRaw.replace(/\D/g, '');
  const codMunicipio = (process.env['NFSE_COD_MUNICIPIO']?.trim() ?? '').replace(/\D/g, '');
  const im = process.env['NFSE_IM']?.trim() ?? '';
  const uf = (process.env['NFSE_UF']?.trim() ?? '').toUpperCase();
  const certPassword = process.env['NFSE_CERT_PASSWORD']?.trim() ?? '';
  const ambiente = (Number(process.env['NFSE_AMBIENTE'] ?? '2') === 1 ? 1 : 2) as 1 | 2;
  const outputDir = process.env['NFSE_OUTPUT_DIR']?.trim() || join(currentDir, 'output', prestadorId);

  const opSimpNac = Number(process.env['NFSE_OP_SIMP_NAC'] ?? '3') as 1 | 2 | 3;
  const regApTribSN = Number(process.env['NFSE_REG_AP_TRIB_SN'] ?? '1') as 1 | 2 | 3;
  const regEspTrib = Number(process.env['NFSE_REG_ESP_TRIB'] ?? '0') as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
  const pTotTribSN = Number(process.env['NFSE_P_TOT_TRIB_SN'] ?? '6.00');

  const config: PrestadorConfig = {
    id: prestadorId,
    cnpj,
    im,
    uf,
    codMunicipio,
    certPath,
    certPassword,
    ambiente,
    outputDir,
    regTrib: {
      opSimpNac,
      regApTribSN,
      regEspTrib,
    },
    pTotTribSN,
  };

  validarPrestadorConfig(config);
  return config;
}

/**
 * Obtém a configuração de um prestador pelo seu identificador.
 * Busca sucessivamente:
 * 1. Cache em memória
 * 2. Provedor customizado registrado
 * 3. Variáveis de ambiente (se prestadorId for 'default')
 */
export function getPrestadorConfig(prestadorId: string): PrestadorConfig {
  if (!prestadorId?.trim()) {
    throw new Error('Identificador de prestador não informado.');
  }

  const id = prestadorId.trim();

  // 1. Memória
  const emMemoria = _memoryConfigs.get(id);
  if (emMemoria) return emMemoria;

  // 2. Custom provider (ex.: consulta no SQLite via store.ts)
  if (_customProvider) {
    const doProvider = _customProvider(id);
    if (doProvider) {
      validarPrestadorConfig(doProvider);
      _memoryConfigs.set(id, doProvider);
      return doProvider;
    }
  }

  // 3. Fallback .env se for 'default'
  if (id === 'default') {
    const doEnv = carregarDoAmbiente('default');
    if (doEnv) {
      _memoryConfigs.set(id, doEnv);
      return doEnv;
    }
  }

  throw new Error(`Configuração do prestador "${id}" não encontrada.`);
}

/**
 * @deprecated Use `getPrestadorConfig(prestadorId)`. Mantido para compatibilidade durante migração.
 */
export const config = new Proxy({} as PrestadorConfig, {
  get(_target, prop) {
    const cfg = getPrestadorConfig('default');
    return (cfg as any)[prop];
  },
});

