/**
 * store.ts — SQLite persistence layer para o emissor NFS-e multi-tenant
 *
 * Usa node:sqlite (built-in Node 24, DatabaseSync).
 * Banco em: output/emissor.db (ao lado do codigo)
 *
 * API exportada:
 *   initDb()              — abre/cria banco, migrations, seed mapa_produtos
 *   salvarPrestador(cfg)  — cadastra/atualiza configuração do prestador
 *   obterPrestador(id)    — busca prestador por id
 *   listarPrestadores()   — lista todos os prestadores
 *   upsertVenda(v)        — idempotente por id_venda
 *   listVendas(filtro?)   — lista vendas com filtro opcional por prestador
 *   proximoNDPS(prestador)— próximo nDPS (MAX+1 por prestador, seed via ndps.json)
 *   registrarNota(n)      — insere na tabela notas com prestador_id
 *   marcarStatus(id, s)   — atualiza fila/status/erro de uma venda
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrestadorConfig, setPrestadorConfigProvider, registrarPrestadorConfig } from "./config.js";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Estado do processamento de uma venda. */
export type StatusVenda =
  | "pendente"
  | "pronta"
  | "simulada"
  | "emitida"
  | "erro"
  | "excecao"
  | "aguardando_garantia"
  | "pendente_cadastro"
  | "pronta_sem_endereco";

/** Fila em que a venda esta parada. */
export type FilaVenda =
  | "pronta"
  | "pendente_cadastro"
  | "aguardando_garantia"
  | "excecao"
  /** Tem documento e valor, mas falta endereco — a SEFIN recusa com E0234. */
  | "pronta_sem_endereco";

export interface Venda {
  id_venda: string;
  prestador_id?: string;
  fonte?: string;
  produto?: string;
  /** Valor da nota (comissão do coprodutor) */
  valor?: number;
  /** Valor bruto da venda (preço cheio pago pelo cliente) */
  valor_bruto?: number;
  data_venda?: string;
  /** Data de expiração da garantia (ISO AAAA-MM-DD) */
  data_expiracao?: string;
  /** Status original da Lastlink: Aprovada | Reembolsada | Expirada | Pendente */
  status_lastlink?: string;
  discriminacao?: string;
  cpf_cnpj?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  /** Codigo IBGE do municipio do tomador, resolvido pelo CEP na importacao. */
  cmun?: string;
  cidade?: string;
  uf?: string;
  bairro?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  dias_garantia?: number;
  estrangeiro?: number; // 0 ou 1
  fila?: FilaVenda;
  status?: StatusVenda;
  erro?: string;
  criada_em?: string;
  atualizada_em?: string;
}

export interface NotaFiscal {
  chave_acesso: string;
  ndps: number;
  id_venda?: string;
  prestador_id?: string;
  xml_path?: string;
  pdf_path?: string;
  emitida_em?: string;
}

export interface FiltroVendas {
  prestador_id?: string;
  fila?: FilaVenda;
  status?: StatusVenda;
  id_venda?: string;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _db: DatabaseSync | null = null;
let _dbPath: string | null = null;

function resolveDbPath(): string {
  const scriptDir = existsSync(join(process.cwd(), 'emissor-nfse'))
    ? join(process.cwd(), 'emissor-nfse')
    : (typeof import.meta?.dirname === 'string' && import.meta.dirname) ||
      (typeof __dirname === 'string' && __dirname) ||
      process.cwd();

  mkdirSync(join(scriptDir, 'output'), { recursive: true });
  return join(scriptDir, 'output', 'emissor.db');
}

// ─── initDb ──────────────────────────────────────────────────────────────────

export function initDb(dbPath?: string): DatabaseSync {
  const path = dbPath ?? resolveDbPath();
  const podeReaproveitar = dbPath === undefined && _db && _dbPath === path;
  if (podeReaproveitar) return _db as DatabaseSync;
  if (_db) _db.close();

  _db = new DatabaseSync(path);
  _dbPath = path;

  _db.exec("PRAGMA journal_mode=WAL;");
  _db.exec("PRAGMA foreign_keys=ON;");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS prestadores (
      id             TEXT PRIMARY KEY,
      cnpj           TEXT NOT NULL,
      im             TEXT NOT NULL,
      uf             TEXT NOT NULL,
      cod_municipio  TEXT NOT NULL,
      cert_path      TEXT NOT NULL,
      cert_password  TEXT NOT NULL,
      ambiente       INTEGER NOT NULL DEFAULT 2,
      output_dir     TEXT,
      op_simp_nac    INTEGER DEFAULT 3,
      reg_ap_trib_sn INTEGER DEFAULT 1,
      reg_esp_trib   INTEGER DEFAULT 0,
      p_tot_trib_sn  REAL DEFAULT 6.00,
      criado_em      TEXT,
      atualizado_em  TEXT
    );
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS vendas (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      id_venda       TEXT    UNIQUE NOT NULL,
      prestador_id   TEXT    NOT NULL DEFAULT 'default',
      fonte          TEXT,
      produto        TEXT,
      valor          REAL,
      valor_bruto    REAL,
      data_venda     TEXT,
      data_expiracao TEXT,
      status_lastlink TEXT,
      discriminacao  TEXT,
      cpf_cnpj       TEXT,
      nome           TEXT,
      email          TEXT,
      telefone       TEXT,
      cep            TEXT,
      cmun           TEXT,
      cidade         TEXT,
      uf             TEXT,
      bairro         TEXT,
      rua            TEXT,
      numero         TEXT,
      complemento    TEXT,
      dias_garantia  INTEGER,
      estrangeiro    INTEGER DEFAULT 0,
      fila           TEXT,
      status         TEXT,
      erro           TEXT,
      criada_em      TEXT,
      atualizada_em  TEXT
    );
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS notas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_acesso TEXT UNIQUE NOT NULL,
      ndps         INTEGER NOT NULL,
      id_venda     TEXT REFERENCES vendas(id_venda),
      prestador_id TEXT NOT NULL DEFAULT 'default',
      xml_path     TEXT,
      pdf_path     TEXT,
      emitida_em   TEXT
    );
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS mapa_produtos (
      produto      TEXT PRIMARY KEY,
      prestador_id TEXT NOT NULL DEFAULT 'default',
      ctrib_nac    TEXT NOT NULL,
      cnbs         TEXT,
      xdesc_serv   TEXT
    );
  `);

  // ── Migração idempotente: adiciona colunas novas e atualiza dados legados ───
  migrarColunas(_db);

  criarTabelaContratos();
  seedMapaProdutos();

  // Conecta o provedor SQLite com o config.ts para busca transparente por prestadorId
  setPrestadorConfigProvider((id: string) => obterPrestador(id));

  return _db;
}

function db(): DatabaseSync {
  if (!_db) throw new Error("DB não inicializado — chame initDb() antes.");
  return _db;
}

// ─── Prestadores CRUD ────────────────────────────────────────────────────────

export function salvarPrestador(cfg: PrestadorConfig): void {
  const now = new Date().toISOString();
  db()
    .prepare(`
      INSERT INTO prestadores
        (id, cnpj, im, uf, cod_municipio, cert_path, cert_password,
         ambiente, output_dir, op_simp_nac, reg_ap_trib_sn, reg_esp_trib,
         p_tot_trib_sn, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        cnpj           = excluded.cnpj,
        im             = excluded.im,
        uf             = excluded.uf,
        cod_municipio  = excluded.cod_municipio,
        cert_path      = excluded.cert_path,
        cert_password  = excluded.cert_password,
        ambiente       = excluded.ambiente,
        output_dir     = excluded.output_dir,
        op_simp_nac    = excluded.op_simp_nac,
        reg_ap_trib_sn = excluded.reg_ap_trib_sn,
        reg_esp_trib   = excluded.reg_esp_trib,
        p_tot_trib_sn  = excluded.p_tot_trib_sn,
        atualizado_em  = ?
    `)
    .run(
      cfg.id,
      cfg.cnpj,
      cfg.im,
      cfg.uf,
      cfg.codMunicipio,
      cfg.certPath,
      cfg.certPassword,
      cfg.ambiente,
      cfg.outputDir,
      cfg.regTrib.opSimpNac,
      cfg.regTrib.regApTribSN,
      cfg.regTrib.regEspTrib,
      cfg.pTotTribSN,
      now,
      now,
      now,
    );
  registrarPrestadorConfig(cfg);
}

export function obterPrestador(id: string): PrestadorConfig | null {
  try {
    const row = db()
      .prepare("SELECT * FROM prestadores WHERE id = ?")
      .get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      cnpj: row.cnpj,
      im: row.im,
      uf: row.uf,
      codMunicipio: row.cod_municipio,
      certPath: row.cert_path,
      certPassword: row.cert_password,
      ambiente: row.ambiente as 1 | 2,
      outputDir: row.output_dir ?? join(fileURLToPath(import.meta.url), '..', 'output', row.id),
      regTrib: {
        opSimpNac: (row.op_simp_nac ?? 3) as 1 | 2 | 3,
        regApTribSN: (row.reg_ap_trib_sn ?? 1) as 1 | 2 | 3,
        regEspTrib: (row.reg_esp_trib ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9,
      },
      pTotTribSN: row.p_tot_trib_sn ?? 6.0,
    };
  } catch {
    return null;
  }
}

export function listarPrestadores(): PrestadorConfig[] {
  const rows = db().prepare("SELECT * FROM prestadores ORDER BY id").all() as any[];
  return rows.map((row) => ({
    id: row.id,
    cnpj: row.cnpj,
    im: row.im,
    uf: row.uf,
    codMunicipio: row.cod_municipio,
    certPath: row.cert_path,
    certPassword: row.cert_password,
    ambiente: row.ambiente as 1 | 2,
    outputDir: row.output_dir ?? join(fileURLToPath(import.meta.url), '..', 'output', row.id),
    regTrib: {
      opSimpNac: (row.op_simp_nac ?? 3) as 1 | 2 | 3,
      regApTribSN: (row.reg_ap_trib_sn ?? 1) as 1 | 2 | 3,
      regEspTrib: (row.reg_esp_trib ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9,
    },
    pTotTribSN: row.p_tot_trib_sn ?? 6.0,
  }));
}

// ─── Migração de colunas ──────────────────────────────────────────────────────

function migrarColunas(database: DatabaseSync): void {
  const migrations: Array<{ tabela: string; coluna: string; ddl: string }> = [
    { tabela: "vendas", coluna: "prestador_id", ddl: "ALTER TABLE vendas ADD COLUMN prestador_id TEXT NOT NULL DEFAULT 'default'" },
    { tabela: "vendas", coluna: "valor_bruto", ddl: "ALTER TABLE vendas ADD COLUMN valor_bruto REAL" },
    { tabela: "vendas", coluna: "status_lastlink", ddl: "ALTER TABLE vendas ADD COLUMN status_lastlink TEXT" },
    { tabela: "vendas", coluna: "data_expiracao", ddl: "ALTER TABLE vendas ADD COLUMN data_expiracao TEXT" },
    { tabela: "vendas", coluna: "cmun", ddl: "ALTER TABLE vendas ADD COLUMN cmun TEXT" },
    { tabela: "notas", coluna: "prestador_id", ddl: "ALTER TABLE notas ADD COLUMN prestador_id TEXT NOT NULL DEFAULT 'default'" },
    { tabela: "contratos", coluna: "prestador_id", ddl: "ALTER TABLE contratos ADD COLUMN prestador_id TEXT NOT NULL DEFAULT 'default'" },
    { tabela: "mapa_produtos", coluna: "prestador_id", ddl: "ALTER TABLE mapa_produtos ADD COLUMN prestador_id TEXT NOT NULL DEFAULT 'default'" },
  ];

  for (const m of migrations) {
    try {
      const colunas = (database.prepare(`PRAGMA table_info(${m.tabela})`).all() as Array<{ name: string }>).map((c) => c.name);
      if (!colunas.includes(m.coluna)) {
        database.exec(m.ddl);
      }
    } catch {
      // Ignora caso a tabela ainda não exista
    }
  }

  // Preenche dados legados sem prestador atribuindo 'default'
  try {
    database.exec("UPDATE vendas SET prestador_id = 'default' WHERE prestador_id IS NULL;");
    database.exec("UPDATE notas SET prestador_id = 'default' WHERE prestador_id IS NULL;");
    database.exec("UPDATE contratos SET prestador_id = 'default' WHERE prestador_id IS NULL;");
  } catch {
    // seguro ignorar
  }
}

// ─── Seed mapa_produtos ───────────────────────────────────────────────────────

const SEED_PRODUTOS: Array<{
  produto: string;
  ctrib_nac: string;
  cnbs: string;
  xdesc_serv: string;
}> = [];

function seedMapaProdutos(): void {
  const stmt = db().prepare(`
    INSERT INTO mapa_produtos (produto, ctrib_nac, cnbs, xdesc_serv)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(produto) DO NOTHING
  `);
  for (const p of SEED_PRODUTOS) {
    stmt.run(p.produto, p.ctrib_nac, p.cnbs, p.xdesc_serv);
  }
}

// ─── upsertVenda ─────────────────────────────────────────────────────────────

export function upsertVenda(v: Venda): void {
  const now = new Date().toISOString();
  const prestadorId = v.prestador_id ?? "default";

  db().prepare(`
    INSERT INTO vendas
      (id_venda, prestador_id, fonte, produto, valor, valor_bruto, data_venda, data_expiracao,
       status_lastlink, discriminacao,
       cpf_cnpj, nome, email, telefone, cep, cmun, cidade, uf, bairro,
       rua, numero, complemento, dias_garantia, estrangeiro,
       fila, status, erro, criada_em, atualizada_em)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id_venda) DO UPDATE SET
      prestador_id    = excluded.prestador_id,
      fonte           = excluded.fonte,
      produto         = excluded.produto,
      valor           = excluded.valor,
      valor_bruto     = excluded.valor_bruto,
      data_venda      = excluded.data_venda,
      data_expiracao  = excluded.data_expiracao,
      status_lastlink = excluded.status_lastlink,
      discriminacao   = excluded.discriminacao,
      cpf_cnpj        = excluded.cpf_cnpj,
      nome            = excluded.nome,
      email           = excluded.email,
      telefone        = excluded.telefone,
      cep             = excluded.cep,
      cmun            = excluded.cmun,
      cidade          = excluded.cidade,
      uf              = excluded.uf,
      bairro          = excluded.bairro,
      rua             = excluded.rua,
      numero          = excluded.numero,
      complemento     = excluded.complemento,
      dias_garantia   = excluded.dias_garantia,
      estrangeiro     = excluded.estrangeiro,
      fila = CASE
        WHEN vendas.status IN ('emitida', 'simulada') THEN vendas.fila
        ELSE excluded.fila
      END,
      status = CASE
        WHEN vendas.status IN ('emitida', 'simulada') THEN vendas.status
        ELSE excluded.status
      END,
      atualizada_em = ?
  `).run(
    v.id_venda,
    prestadorId,
    v.fonte ?? null,
    v.produto ?? null,
    v.valor ?? null,
    v.valor_bruto ?? null,
    v.data_venda ?? null,
    v.data_expiracao ?? null,
    v.status_lastlink ?? null,
    v.discriminacao ?? null,
    v.cpf_cnpj ?? null,
    v.nome ?? null,
    v.email ?? null,
    v.telefone ?? null,
    v.cep ?? null,
    v.cmun ?? null,
    v.cidade ?? null,
    v.uf ?? null,
    v.bairro ?? null,
    v.rua ?? null,
    v.numero ?? null,
    v.complemento ?? null,
    v.dias_garantia ?? null,
    v.estrangeiro ?? 0,
    v.fila ?? null,
    v.status ?? null,
    v.erro ?? null,
    now,
    now,
  );
}

// ─── listVendas ───────────────────────────────────────────────────────────────

export function listVendas(filtro?: FiltroVendas): Venda[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filtro?.prestador_id) {
    conditions.push("prestador_id = ?");
    params.push(filtro.prestador_id);
  }
  if (filtro?.fila) {
    conditions.push("fila = ?");
    params.push(filtro.fila);
  }
  if (filtro?.status) {
    conditions.push("status = ?");
    params.push(filtro.status);
  }
  if (filtro?.id_venda) {
    conditions.push("id_venda = ?");
    params.push(filtro.id_venda);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db()
    .prepare(`SELECT * FROM vendas ${where} ORDER BY data_venda DESC`)
    .all(...params) as unknown as Venda[];
}

// ─── proximoNDPS ─────────────────────────────────────────────────────────────

export function proximoNDPS(prestadorId: string = "default"): number {
  const row = db()
    .prepare("SELECT MAX(ndps) AS maxNdps FROM notas WHERE prestador_id = ?")
    .get(prestadorId) as { maxNdps: number | null } | null;

  const maxDb = row?.maxNdps ?? 0;

  let seed = 1;
  if (maxDb === 0) {
    const pastaOutput = prestadorId === "default" ? "nfewizard" : prestadorId;
    const ndpsPath = join(
      fileURLToPath(import.meta.url),
      "..",
      "output",
      pastaOutput,
      "ndps.json",
    );
    if (existsSync(ndpsPath)) {
      try {
        const parsed = JSON.parse(readFileSync(ndpsPath, "utf-8")) as {
          proximoNDPS?: number;
        };
        if (typeof parsed.proximoNDPS === "number") seed = parsed.proximoNDPS;
      } catch {
        // ignora JSON malformado
      }
    }
  }

  return Math.max(maxDb + 1, seed);
}

// ─── registrarNota ────────────────────────────────────────────────────────────

export function registrarNota(n: NotaFiscal, prestadorId?: string): void {
  const now = new Date().toISOString();
  const prestador = n.prestador_id ?? prestadorId ?? "default";
  db()
    .prepare(`
      INSERT INTO notas (chave_acesso, ndps, id_venda, prestador_id, xml_path, pdf_path, emitida_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chave_acesso) DO NOTHING
    `)
    .run(
      n.chave_acesso,
      n.ndps,
      n.id_venda ?? null,
      prestador,
      n.xml_path ?? null,
      n.pdf_path ?? null,
      n.emitida_em ?? now,
    );
}

// ─── Contratos recorrentes ───────────────────────────────────────────────────

export interface Contrato {
  id?: number;
  prestador_id?: string;
  cliente_doc: string;
  cliente_nome: string;
  cliente_email?: string;
  valor: number;
  xdesc_serv: string;
  ctrib_nac: string;
  cnbs?: string;
  dia_do_mes: number;
  ativo?: number;
  criado_em?: string;
}

export function criarTabelaContratos(): void {
  db().exec(`
    CREATE TABLE IF NOT EXISTS contratos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      prestador_id  TEXT    NOT NULL DEFAULT 'default',
      cliente_doc   TEXT    NOT NULL,
      cliente_nome  TEXT    NOT NULL,
      cliente_email TEXT,
      valor         REAL    NOT NULL,
      xdesc_serv    TEXT    NOT NULL,
      ctrib_nac     TEXT    NOT NULL,
      cnbs          TEXT,
      dia_do_mes    INTEGER NOT NULL,
      ativo         INTEGER DEFAULT 1,
      criado_em     TEXT
    );
  `);
}

export function criarContrato(
  c: Omit<Contrato, "id" | "criado_em">,
  prestadorId?: string,
): number {
  const now = new Date().toISOString();
  const prestador = c.prestador_id ?? prestadorId ?? "default";

  const result = db()
    .prepare(`
      INSERT INTO contratos
        (prestador_id, cliente_doc, cliente_nome, cliente_email, valor, xdesc_serv,
         ctrib_nac, cnbs, dia_do_mes, ativo, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `)
    .run(
      prestador,
      c.cliente_doc,
      c.cliente_nome,
      c.cliente_email ?? null,
      c.valor,
      c.xdesc_serv,
      c.ctrib_nac,
      c.cnbs ?? null,
      c.dia_do_mes,
      now,
    );

  const id = result.lastInsertRowid as number;

  const produtoChave = `Contrato: ${c.xdesc_serv}`;
  db()
    .prepare(`
      INSERT INTO mapa_produtos (produto, prestador_id, ctrib_nac, cnbs, xdesc_serv)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(produto) DO UPDATE SET
        prestador_id = excluded.prestador_id,
        ctrib_nac    = excluded.ctrib_nac,
        cnbs         = excluded.cnbs,
        xdesc_serv   = excluded.xdesc_serv
    `)
    .run(produtoChave, prestador, c.ctrib_nac, c.cnbs ?? null, c.xdesc_serv);

  return id;
}

export function listContratos(
  prestadorOuAtivos: string | boolean = "default",
  apenasAtivos = true,
): Contrato[] {
  let prestadorId: string | undefined;
  let ativos = apenasAtivos;

  if (typeof prestadorOuAtivos === "boolean") {
    ativos = prestadorOuAtivos;
    prestadorId = undefined;
  } else {
    prestadorId = prestadorOuAtivos;
  }

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (prestadorId) {
    conditions.push("prestador_id = ?");
    params.push(prestadorId);
  }
  if (ativos) {
    conditions.push("ativo = 1");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db()
    .prepare(`SELECT * FROM contratos ${where} ORDER BY id`)
    .all(...params) as unknown as Contrato[];
}

export function desativarContrato(id: number, prestadorId?: string): void {
  if (prestadorId) {
    db().prepare("UPDATE contratos SET ativo = 0 WHERE id = ? AND prestador_id = ?").run(id, prestadorId);
  } else {
    db().prepare("UPDATE contratos SET ativo = 0 WHERE id = ?").run(id);
  }
}

export function gerarVendasDoMes(competencia: string, prestadorId: string = "default"): number {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  const mesCandidato = match ? parseInt(match[2], 10) : NaN;
  if (!match || mesCandidato < 1 || mesCandidato > 12) {
    throw new Error(`Competência inválida: "${competencia}" — use formato AAAA-MM`);
  }
  const ano = parseInt(match[1], 10);
  const mes = mesCandidato;

  const contratos = listContratos(prestadorId, true);
  let novas = 0;

  for (const c of contratos) {
    const idVenda = `contrato-${c.id}-${competencia}`;

    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = Math.min(c.dia_do_mes, ultimoDia);
    const dataVenda = `${competencia}-${String(dia).padStart(2, "0")}`;

    const produtoChave = `Contrato: ${c.xdesc_serv}`;

    const existente = db()
      .prepare("SELECT id_venda, status FROM vendas WHERE id_venda = ?")
      .get(idVenda) as { id_venda: string; status: string } | undefined;

    if (existente) {
      continue;
    }

    const now = new Date().toISOString();
    db()
      .prepare(`
        INSERT INTO vendas
          (id_venda, prestador_id, fonte, produto, valor, data_venda,
           discriminacao, cpf_cnpj, nome, email,
           dias_garantia, estrangeiro, fila, status, criada_em, atualizada_em)
        VALUES (?, ?, 'contrato', ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pronta', 'pronta', ?, ?)
      `)
      .run(
        idVenda,
        c.prestador_id ?? prestadorId,
        produtoChave,
        c.valor,
        dataVenda,
        c.xdesc_serv,
        c.cliente_doc,
        c.cliente_nome,
        c.cliente_email ?? null,
        now,
        now,
      );

    novas++;
  }

  return novas;
}

// ─── marcarStatus ─────────────────────────────────────────────────────────────

export function marcarStatus(
  idVenda: string,
  status: StatusVenda,
  erro?: string,
  prestadorId?: string,
): void {
  const now = new Date().toISOString();

  const filaMap: Partial<Record<StatusVenda, FilaVenda>> = {
    pronta: "pronta",
    aguardando_garantia: "aguardando_garantia",
    pendente_cadastro: "pendente_cadastro",
    excecao: "excecao",
    pronta_sem_endereco: "pronta_sem_endereco",
    simulada: "pronta",
    emitida: "pronta",
    erro: "pronta",
  };
  const novaFila = filaMap[status] ?? "pronta";

  const sql = prestadorId
    ? `
      UPDATE vendas
      SET
        status        = CASE WHEN status = 'emitida' THEN 'emitida' ELSE ? END,
        fila          = CASE WHEN status = 'emitida' THEN fila ELSE ? END,
        erro          = ?,
        atualizada_em = ?
      WHERE id_venda = ? AND prestador_id = ?
    `
    : `
      UPDATE vendas
      SET
        status        = CASE WHEN status = 'emitida' THEN 'emitida' ELSE ? END,
        fila          = CASE WHEN status = 'emitida' THEN fila ELSE ? END,
        erro          = ?,
        atualizada_em = ?
      WHERE id_venda = ?
    `;

  const params = prestadorId
    ? [status, novaFila, erro ?? null, now, idVenda, prestadorId]
    : [status, novaFila, erro ?? null, now, idVenda];

  db().prepare(sql).run(...params);
}

