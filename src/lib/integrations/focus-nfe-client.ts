import { FOCUS_NFE_CONFIG } from '@/config/constants';

export interface FocusNfeOptions {
  token?: string;
  environment?: 'homologacao' | 'producao';
}

export interface FocusEmpresaPayload {
  cnpj: string;
  nome: string;
  nome_fantasia?: string;
  inscricao_municipal?: string | number;
  inscricao_estadual?: string | number;
  codigo_municipio?: string;
  bairro?: string;
  cep?: string | number;
  logradouro?: string;
  numero?: string | number;
  complemento?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
  cnae_fiscal?: string;
  regime_tributario?: number; // 1 = Simples Nacional, 2 = Excesso, 3 = Regime Normal, 4 = MEI
  habilita_nfe?: boolean;
  habilita_nfce?: boolean;
  habilita_nfse?: boolean;
  habilita_nfsen_producao?: boolean;
  habilita_nfsen_homologacao?: boolean;
  habilita_cte?: boolean;
  habilita_mdfe?: boolean;
  discrimina_impostos?: boolean;
  enviar_email_destinatario?: boolean;
  arquivo_certificado_base64?: string;
  senha_certificado?: string;
  certificado_especifico?: boolean;
}

export interface FocusEmpresaResponse {
  id: number;
  nome: string;
  nome_fantasia?: string;
  cnpj: string;
  cpf?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  bairro?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
  regime_tributario?: string;
  token_producao?: string;
  token_homologacao?: string;
  certificado_cnpj?: string;
  certificado_valido_ate?: string;
  certificado_valido_de?: string;
  habilita_nfse?: boolean;
  habilita_nfsen_producao?: boolean;
  habilita_nfsen_homologacao?: boolean;
  [key: string]: any;
}

export interface FocusNfsePayload {
  data_emissao: string;
  prestador: {
    cnpj: string;
    inscricao_municipal: string;
    codigo_municipio?: string;
  };
  tomador: {
    cpf?: string;
    cnpj?: string;
    razao_social: string;
    email?: string;
    endereco?: {
      logradouro?: string;
      numero?: string;
      bairro?: string;
      codigo_municipio?: string;
      uf?: string;
      cep?: string;
    };
  };
  servico: {
    aliquota: number;
    discriminacao: string;
    iss_retido: boolean;
    item_lista_servico: string;
    codigo_tributario_municipio?: string;
    valor_servicos: number;
  };
}

export interface FocusNfseResponse {
  status: 'processando_autorizacao' | 'autorizado' | 'erro_autorizacao' | 'cancelado';
  numero?: string;
  numero_rps?: string;
  codigo_verificacao?: string;
  caminho_danfe?: string;
  url_danfse?: string;
  url?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem_sefaz?: string;
  erros?: Array<{ codigo: string; mensagem: string }>;
}

export class FocusNfeClient {
  private baseUrl: string;
  private readonly empresasBaseUrl = 'https://api.focusnfe.com.br/v2';
  private token: string;

  constructor(options?: FocusNfeOptions) {
    const env = options?.environment || (process.env.FOCUS_NFE_ENV as any) || 'homologacao';
    this.baseUrl = env === 'producao' ? FOCUS_NFE_CONFIG.PRODUCAO_URL : FOCUS_NFE_CONFIG.HOMOLOGACAO_URL;
    this.token = options?.token || process.env.FOCUS_NFE_GLOBAL_TOKEN || '';
  }

  public get authHeader(): string {
    const encoded = Buffer.from(`${this.token}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Lista empresas cadastradas (filtra opcionalmente por CNPJ)
   * GET /v2/empresas?cnpj=...
   */
  public async getEmpresas(params?: { cnpj?: string }): Promise<FocusEmpresaResponse[]> {
    let url = `${this.empresasBaseUrl}/empresas`;
    if (params?.cnpj) {
      const cleanCnpj = params.cnpj.replace(/\D/g, '');
      url += `?cnpj=${encodeURIComponent(cleanCnpj)}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /**
   * Busca detalhes de uma empresa pelo ID numérico
   * GET /v2/empresas/{id}
   */
  public async getEmpresa(id: string | number): Promise<FocusEmpresaResponse> {
    const res = await fetch(`${this.empresasBaseUrl}/empresas/${id}`, {
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.mensagem || `Empresa ${id} não encontrada na Focus NFe`);
    }

    return res.json();
  }

  /**
   * Cria uma nova empresa
   * POST /v2/empresas (OpenAPI OpenAPI 3.0.3)
   */
  public async createEmpresa(payload: Partial<FocusEmpresaPayload>, dryRun = false): Promise<FocusEmpresaResponse> {
    const url = dryRun ? `${this.empresasBaseUrl}/empresas?dry_run=1` : `${this.empresasBaseUrl}/empresas`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorDetail = data?.erros?.[0]?.mensagem || data?.mensagem || `Erro HTTP ${res.status}`;
      throw new Error(`Falha ao criar empresa na Focus NFe: ${errorDetail}`);
    }

    return data;
  }

  /**
   * Atualiza os dados de uma empresa existente pelo ID numérico
   * PUT /v2/empresas/{id} (OpenAPI 3.0.3)
   */
  public async updateEmpresa(id: string | number, payload: Partial<FocusEmpresaPayload>, dryRun = false): Promise<FocusEmpresaResponse> {
    const url = dryRun ? `${this.empresasBaseUrl}/empresas/${id}?dry_run=1` : `${this.empresasBaseUrl}/empresas/${id}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorDetail = data?.erros?.[0]?.mensagem || data?.mensagem || `Erro HTTP ${res.status}`;
      throw new Error(`Falha ao atualizar empresa na Focus NFe: ${errorDetail}`);
    }

    return data;
  }

  /**
   * Exclui uma empresa e retorna seus dados
   * DELETE /v2/empresas/{id} (OpenAPI 3.0.3)
   */
  public async deleteEmpresa(id: string | number): Promise<FocusEmpresaResponse> {
    const res = await fetch(`${this.empresasBaseUrl}/empresas/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: this.authHeader,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorDetail = data?.erros?.[0]?.mensagem || data?.mensagem || `Erro HTTP ${res.status}`;
      throw new Error(`Falha ao excluir empresa na Focus NFe: ${errorDetail}`);
    }

    return data;
  }

  /**
   * Cadastra ou atualiza os dados da empresa emissora e anexa o Certificado Digital A1
   * Consulta por CNPJ antes de criar para garantir idempotência e atualização correta via PUT.
   */
  public async createOrUpdateEmpresa(payload: FocusEmpresaPayload): Promise<FocusEmpresaResponse> {
    const cleanCnpj = payload.cnpj.replace(/\D/g, '');

    // Sanitiza e formata os dados conforme o schema EmpresaCreate da Focus NFe
    const body: Record<string, any> = {
      cnpj: cleanCnpj,
      nome: payload.nome,
      nome_fantasia: payload.nome_fantasia || payload.nome,
      regime_tributario: payload.regime_tributario || 1,
      enviar_email_destinatario: payload.enviar_email_destinatario ?? false,
      habilita_nfe: payload.habilita_nfe ?? false,
      habilita_nfce: payload.habilita_nfce ?? false,
      // Focus NFe: habilita_nfse não pode estar habilitado simultaneamente com NFSe Nacional em produção
      habilita_nfsen_producao: payload.habilita_nfsen_producao ?? true,
      habilita_nfsen_homologacao: payload.habilita_nfsen_homologacao ?? true,
      habilita_nfse: payload.habilita_nfse ?? false,
    };

    if (payload.inscricao_municipal) {
      const cleanIm = String(payload.inscricao_municipal).replace(/\D/g, '');
      body.inscricao_municipal = cleanIm ? Number(cleanIm) || payload.inscricao_municipal : payload.inscricao_municipal;
    }
    if (payload.inscricao_estadual) {
      const cleanIe = String(payload.inscricao_estadual).replace(/\D/g, '');
      body.inscricao_estadual = cleanIe ? Number(cleanIe) : undefined;
    }
    if (payload.logradouro) body.logradouro = payload.logradouro;
    if (payload.numero) {
      const numClean = String(payload.numero).replace(/\D/g, '');
      body.numero = numClean ? Number(numClean) || payload.numero : payload.numero;
    }
    if (payload.bairro) body.bairro = payload.bairro;
    if (payload.cep) {
      const cepClean = String(payload.cep).replace(/\D/g, '');
      body.cep = cepClean ? Number(cepClean) || payload.cep : payload.cep;
    }
    if (payload.municipio) body.municipio = payload.municipio;
    if (payload.uf) body.uf = payload.uf;
    if (payload.email) body.email = payload.email;
    if (payload.telefone) body.telefone = String(payload.telefone).replace(/\D/g, '');

    if (payload.arquivo_certificado_base64 && payload.senha_certificado) {
      body.arquivo_certificado_base64 = payload.arquivo_certificado_base64;
      body.senha_certificado = payload.senha_certificado;
    }

    // 1. Verifica se a empresa já está cadastrada na Focus NFe pelo CNPJ
    const existingList = await this.getEmpresas({ cnpj: cleanCnpj });
    if (existingList.length > 0 && existingList[0].id) {
      const existingId = existingList[0].id;
      console.log(`[Focus NFe] Empresa ${cleanCnpj} já cadastrada com ID ${existingId}. Atualizando via PUT /v2/empresas/${existingId}...`);
      return await this.updateEmpresa(existingId, body);
    }

    // 2. Se não existir, cria a nova empresa via POST /v2/empresas
    console.log(`[Focus NFe] Criando nova empresa para o CNPJ ${cleanCnpj} via POST /v2/empresas...`);
    return await this.createEmpresa(body);
  }

  /**
   * Emite NFS-e Padrão Municipal (legado)
   */
  public async emitirNfse(referencia: string, payload: FocusNfsePayload): Promise<FocusNfseResponse> {
    const res = await fetch(`${this.baseUrl}/nfse?ref=${encodeURIComponent(referencia)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erro ao autorizar NFS-e na Focus NFe (${res.status}): ${err}`);
    }

    return res.json();
  }

  /**
   * Consulta o status da NFS-e municipal pela referência
   */
  public async consultarNfse(referencia: string): Promise<FocusNfseResponse> {
    const res = await fetch(`${this.baseUrl}/nfse/${encodeURIComponent(referencia)}?completo=1`, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erro ao consultar NFS-e (${res.status}): ${err}`);
    }

    return res.json();
  }

  /**
   * Baixa os bytes do DANFSe PDF gerado na Focus NFe.
   *
   * A Focus NFe retorna duas formas de URL para o PDF:
   * 1. Caminho relativo (ex: /path/to/file.pdf) → concatenamos com baseUrl + autenticação Basic.
   * 2. URL S3 pré-assinada (ex: https://focusnfe.s3.amazonaws.com/...) → URL pública temporária,
   *    NÃO deve ter cabeçalho Authorization pois o S3 rejeita com 400 "Conflicting Authorization".
   */
  public async downloadDanfsePdf(pdfUrlOrPath: string): Promise<Buffer | null> {
    try {
      let fullUrl = pdfUrlOrPath;
      const isRelativePath = pdfUrlOrPath.startsWith('/');
      const isS3Url = pdfUrlOrPath.includes('s3.amazonaws.com') || pdfUrlOrPath.includes('s3.sa-east-1.amazonaws.com');

      if (isRelativePath) {
        fullUrl = `${this.baseUrl}${pdfUrlOrPath}`;
      }

      // URLs S3 pré-assinadas não aceitam cabeçalho Authorization (retornam 400)
      const headers: Record<string, string> = isS3Url || !isRelativePath
        ? {}
        : { Authorization: this.authHeader };

      const res = await fetch(fullUrl, { headers });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 0) return buf;
      }

      // Segunda tentativa: sem autenticação (para URLs S3 que falham com auth)
      if (!isS3Url && res.status === 400) {
        console.warn(`[FocusNfeClient] Tentando sem autenticação para URL com status 400: ${fullUrl}`);
        const retryRes = await fetch(fullUrl);
        if (retryRes.ok) {
          const arrayBuf = await retryRes.arrayBuffer();
          return Buffer.from(arrayBuf);
        }
      }

      console.warn(`[FocusNfeClient] Status ${res.status} ao baixar DANFSe PDF de ${fullUrl}`);
    } catch (e) {
      console.warn('[FocusNfeClient] Erro ao baixar DANFSe PDF:', e);
    }
    return null;
  }


  /**
   * Emite NFS-e Padrão Nacional (DPS / Reforma Tributária IBS-CBS)
   * Endpoint oficial da Focus NFe: POST /v2/nfsen?ref=...
   */
  public async emitirNfseNacional(referencia: string, payload: Record<string, any>): Promise<FocusNfseResponse> {
    const res = await fetch(`${this.baseUrl}/nfsen?ref=${encodeURIComponent(referencia)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erro ao emitir NFS-e Nacional na Focus NFe (${res.status}): ${err}`);
    }

    return res.json();
  }

  /**
   * Consulta o status da NFS-e Nacional (DPS) pela referência
   * Endpoint oficial da Focus NFe: GET /v2/nfsen/...
   */
  public async consultarNfseNacional(referencia: string): Promise<FocusNfseResponse> {
    const res = await fetch(`${this.baseUrl}/nfsen/${encodeURIComponent(referencia)}?completo=1`, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erro ao consultar NFS-e Nacional (${res.status}): ${err}`);
    }

    return res.json();
  }
}
