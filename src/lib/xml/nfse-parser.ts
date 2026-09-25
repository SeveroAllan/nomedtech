import { XMLParser } from 'fast-xml-parser';

export interface ExtractedFiscalData {
  // Prestador
  cnpj: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnae: string;
  codigoMunicipioEmissora: string; // IBGE 7 dígitos (ex: '4314902')
  cidade: string;
  uf: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cep?: string;

  // Regime Tributário
  codigoOpcaoSimplesNacional: 1 | 2 | 3; // 1 = Não optante, 2 = MEI, 3 = Optante ME/EPP
  regimeTributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  isOptanteSimples: boolean;
  regimeEspecialTributacao: number; // 0 = Nenhum

  // Códigos Nacionais de Serviço
  codigoTributacaoNacionalIss: string; // Padrão Nacional ISS (ex: '041601')
  codigoNbs: string; // Nomenclatura Brasileira de Serviços (ex: '123011300')
  itemListaServico: string;
  codigoTributacaoMunicipio?: string;

  // Alíquotas e Tributos
  aliquotaIss: number;
  percentualTotalTributosFederais: string; // '11.33' (Não Optante) ou '0.00' (Optante)
  percentualTotalTributosEstaduais: string; // '0.00'
  percentualTotalTributosMunicipais: string; // '2'
  cbsAliquota: number; // 0.9 (Não Optante) ou 0 (Optante)
  ibsUfAliquota: number; // 0.1 (Não Optante) ou 0 (Optante)
  ibsMunAliquota: number; // 0

  // Dados Médicos do Prestador (para formatação da descrição perfeita)
  crm?: string;
  rqe?: string;
  especialidade?: string;
  nomeProfissional?: string;

  // DPS Sequencial
  serieDps: string;
  ultimoNumeroDps?: number;
  proximoNumeroDps: number;
}

// Mapa de apoio com códigos IBGE 7 dígitos dos municípios mais frequentes
export const IBGE_TO_CIDADE: Record<string, { nome: string; uf: string }> = {
  '4314902': { nome: 'Porto Alegre', uf: 'RS' },
  '3550308': { nome: 'São Paulo', uf: 'SP' },
  '3304557': { nome: 'Rio de Janeiro', uf: 'RJ' },
  '3106200': { nome: 'Belo Horizonte', uf: 'MG' },
  '4106902': { nome: 'Curitiba', uf: 'PR' },
  '4205407': { nome: 'Florianópolis', uf: 'SC' },
  '5300108': { nome: 'Brasília', uf: 'DF' },
  '2927408': { nome: 'Salvador', uf: 'BA' },
  '2304400': { nome: 'Fortaleza', uf: 'CE' },
  '2611606': { nome: 'Recife', uf: 'PE' },
  '5208707': { nome: 'Goiânia', uf: 'GO' },
  '3509502': { nome: 'Campinas', uf: 'SP' },
  '1302603': { nome: 'Manaus', uf: 'AM' },
  '1501402': { nome: 'Belém', uf: 'PA' },
  '3205309': { nome: 'Vitória', uf: 'ES' },
  '2408102': { nome: 'Natal', uf: 'RN' },
  '4305108': { nome: 'Caxias do Sul', uf: 'RS' },
  '4304606': { nome: 'Canoas', uf: 'RS' },
  '4313409': { nome: 'Novo Hamburgo', uf: 'RS' },
  '4314407': { nome: 'Pelotas', uf: 'RS' },
  '4316907': { nome: 'Santa Maria', uf: 'RS' },
  '4318705': { nome: 'São Leopoldo', uf: 'RS' },
  '4309209': { nome: 'Gravataí', uf: 'RS' },
  '4323002': { nome: 'Viamão', uf: 'RS' },
  '4314050': { nome: 'Passo Fundo', uf: 'RS' },
  '3548500': { nome: 'Santos', uf: 'SP' },
  '3543402': { nome: 'Ribeirão Preto', uf: 'SP' },
  '3549904': { nome: 'São José dos Campos', uf: 'SP' },
};

const IBGE_MUNICIPIOS: Record<string, string> = {
  'porto alegre': '4314902',
  'sao paulo': '3550308',
  'são paulo': '3550308',
  'rio de janeiro': '3304557',
  'belo horizonte': '3106200',
  'curitiba': '4106902',
  'florianopolis': '4205407',
  'florianópolis': '4205407',
  'brasilia': '5300108',
  'brasília': '5300108',
  'salvador': '2927408',
  'fortaleza': '2304400',
  'recife': '2611606',
  'goiania': '5208707',
  'goiânia': '5208707',
  'campinas': '3509502',
  'manaus': '1302603',
  'belem': '1501402',
  'belém': '1501402',
  'vitoria': '3205309',
  'vitória': '3205309',
  'natal': '2408102',
  'caxias do sul': '4305108',
  'canoas': '4304606',
  'novo hamburgo': '4313409',
  'pelotas': '4314407',
  'santa maria': '4316907',
  'santos': '3548500',
  'ribeirao preto': '3543402',
  'ribeirão preto': '3543402',
  'sao jose dos campos': '3549904',
  'são josé dos campos': '3549904',
};

export class NfseParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: false,
    });
  }

  /**
   * Extrai dados fiscais completos de XMLs de NFS-e e NF-e
   * Compatível com Padrão Nacional (DPS), ABRASF v1/v2, Paulistana, DSF, Betha, IPM, Ginfes.
   */
  public parse(xmlContent: string): ExtractedFiscalData {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new Error('Conteúdo do XML é obrigatório e deve ser uma string');
    }

    let parsed: Record<string, any> = {};
    try {
      parsed = this.parser.parse(xmlContent);
    } catch {
      // Continua para extração via fallback regex se o parse falhar
    }

    const root = this.findDeepestSignificantRoot(parsed);
    const prestador = this.extractPrestadorNode(root);

    // 1. CNPJ / CPF
    let cnpj = this.cleanNumeric(
      prestador?.Cnpj ||
      prestador?.CNPJ ||
      prestador?.CpfCnpj?.Cnpj ||
      prestador?.IdentificacaoPrestador?.CpfCnpj?.Cnpj ||
      prestador?.IdentificacaoPrestador?.Cnpj ||
      this.searchFirstKey(root, ['Cnpj', 'CNPJ', 'cnpj'])
    );

    if (!cnpj) {
      const cnpjRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:CNPJ|Cnpj|cnpj)[^>]*>([0-9.\-\/\s]+)<\//i;
      const match = xmlContent.match(cnpjRegex);
      if (match && match[1]) cnpj = this.cleanNumeric(match[1]);
    }

    if (!cnpj) {
      const cpfRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:CPF|Cpf|cpf)[^>]*>([0-9.\-\/\s]+)<\//i;
      const match = xmlContent.match(cpfRegex);
      if (match && match[1]) cnpj = this.cleanNumeric(match[1]);
    }

    if (!cnpj) {
      throw new Error('CNPJ do prestador não encontrado no XML');
    }

    // 2. Inscrição Municipal
    let inscricaoMunicipal =
      prestador?.InscricaoMunicipal ||
      prestador?.IdentificacaoPrestador?.InscricaoMunicipal ||
      this.searchFirstKey(root, ['InscricaoMunicipal', 'IM', 'inscricaoMunicipal', 'Inscricao']) ||
      '';

    if (!inscricaoMunicipal) {
      const imRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:InscricaoMunicipal|IM)[^>]*>([^<]+)<\//i;
      const match = xmlContent.match(imRegex);
      inscricaoMunicipal = match && match[1] ? match[1].trim() : '';
    }

    // 3. Razão Social & Nome Fantasia
    let razaoSocial =
      prestador?.RazaoSocial ||
      prestador?.RazaoSocialPrestador ||
      prestador?.NomeFantasia ||
      prestador?.xNome ||
      this.searchFirstKey(root, ['RazaoSocial', 'RazaoSocialPrestador', 'xNome', 'NomePrestador']) ||
      '';

    if (!razaoSocial) {
      const nameRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:RazaoSocial|RazaoSocialPrestador|xNome|NomePrestador|xFant)[^>]*>([^<]+)<\//i;
      const match = xmlContent.match(nameRegex);
      razaoSocial = match && match[1] ? match[1].trim() : '';
    }

    const nomeFantasia =
      prestador?.NomeFantasia ||
      prestador?.xFant ||
      this.searchFirstKey(root, ['NomeFantasia', 'xFant']) ||
      razaoSocial;

    // 4. CNAE
    let cnae = this.searchFirstKey(root, ['CodigoCnae', 'CNAE', 'Cnae', 'cnae']) || '';
    if (!cnae) {
      const cnaeRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:CodigoCnae|CNAE|Cnae)[^>]*>([^<]+)<\//i;
      const match = xmlContent.match(cnaeRegex);
      cnae = match && match[1] ? this.cleanNumeric(match[1]) : '8630503';
    } else {
      cnae = this.cleanNumeric(cnae) || '8630503';
    }

    // 5. Endereço e Município IBGE (7 dígitos)
    const enderecoNode =
      prestador?.enderNac ||
      prestador?.Endereco ||
      prestador?.DadosEndereco ||
      prestador?.EnderEmit ||
      root?.enderNac ||
      root?.Endereco;

    let cidadeRaw =
      enderecoNode?.xMun ||
      enderecoNode?.Municipio ||
      this.searchFirstKey(root, ['xMun', 'Municipio', 'xLocEmi', 'NomeMunicipio', 'cidade']) ||
      '';

    if (!cidadeRaw) {
      const cityRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:xMun|Municipio|xLocEmi|NomeMunicipio|cidade)[^>]*>([^<]+)<\//i;
      const match = xmlContent.match(cityRegex);
      if (match && match[1]) cidadeRaw = match[1].trim();
    }

    let uf =
      enderecoNode?.UF ||
      enderecoNode?.Uf ||
      this.searchFirstKey(root, ['UF', 'Uf', 'siglaUF']) ||
      '';

    if (!uf) {
      const ufRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:UF|Uf|siglaUF)[^>]*>([A-Za-z]{2})<\//i;
      const match = xmlContent.match(ufRegex);
      if (match && match[1]) uf = match[1].trim().toUpperCase();
    }

    const logradouro = enderecoNode?.Endereco || enderecoNode?.Logradouro || enderecoNode?.xLgr || this.searchFirstKey(root, ['Logradouro', 'xLgr']);
    const numero = enderecoNode?.Numero || enderecoNode?.nro || this.searchFirstKey(root, ['Numero', 'nro']);
    const bairro = enderecoNode?.Bairro || enderecoNode?.xBairro || this.searchFirstKey(root, ['Bairro', 'xBairro']);
    const cep = this.cleanNumeric(enderecoNode?.CEP || enderecoNode?.Cep || this.searchFirstKey(root, ['CEP', 'Cep']));

    let codigoMunicipio = this.cleanNumeric(
      enderecoNode?.cMun ||
      enderecoNode?.CodigoMunicipio ||
      prestador?.cMun ||
      prestador?.CodigoMunicipio ||
      this.searchFirstKey(root, ['cMun', 'CodigoMunicipio', 'cMunPrest', 'codigo_municipio_emissora', 'cMunEmi'])
    );

    if (!codigoMunicipio) {
      const ibgeRegex = /<(?:[a-zA-Z0-9_\-]+:)?(?:cMun|CodigoMunicipio|cMunPrest|cMunEmi)[^>]*>([0-9]{7})<\//i;
      const match = xmlContent.match(ibgeRegex);
      if (match && match[1]) codigoMunicipio = match[1].trim();
    }

    // Se temos código IBGE mas não temos nome da cidade, resolve pelo mapa reverso
    if (codigoMunicipio && IBGE_TO_CIDADE[codigoMunicipio]) {
      if (!cidadeRaw) cidadeRaw = IBGE_TO_CIDADE[codigoMunicipio].nome;
      if (!uf) uf = IBGE_TO_CIDADE[codigoMunicipio].uf;
    }

    // Se temos o nome da cidade mas não temos código IBGE, resolve pelo mapa direto
    if (!codigoMunicipio || codigoMunicipio.length < 7) {
      const normalizedCity = String(cidadeRaw).trim().toLowerCase();
      if (IBGE_MUNICIPIOS[normalizedCity]) {
        codigoMunicipio = IBGE_MUNICIPIOS[normalizedCity];
      }
    }

    // Fallbacks inteligentes se cidade ou código IBGE ainda estiverem incompletos
    if (!cidadeRaw) {
      if (uf === 'RS' || (codigoMunicipio && codigoMunicipio.startsWith('43'))) {
        cidadeRaw = 'Porto Alegre';
        if (!codigoMunicipio) codigoMunicipio = '4314902';
        if (!uf) uf = 'RS';
      } else if (uf === 'SP' || (codigoMunicipio && codigoMunicipio.startsWith('35'))) {
        cidadeRaw = 'São Paulo';
        if (!codigoMunicipio) codigoMunicipio = '3550308';
        if (!uf) uf = 'SP';
      } else if (uf === 'RJ' || (codigoMunicipio && codigoMunicipio.startsWith('33'))) {
        cidadeRaw = 'Rio de Janeiro';
        if (!codigoMunicipio) codigoMunicipio = '3304557';
        if (!uf) uf = 'RJ';
      } else {
        cidadeRaw = 'Porto Alegre';
        codigoMunicipio = '4314902';
        uf = 'RS';
      }
    }

    // 6. Regime Tributário: Optante Simples Nacional vs Não Optante (Lucro Presumido / Real)
    // No layout DPS Nacional: 1 = Não Optante, 2 = MEI, 3 = Optante ME/EPP
    const opcSimpNacRaw = this.searchFirstKey(root, ['opcSimpNac', 'codigo_opcao_simples_nacional']);
    const optanteAbrasfRaw = this.searchFirstKey(root, ['OptanteSimplesNacional', 'optanteSimplesNacional']);
    const crtRaw = this.searchFirstKey(root, ['CRT', 'crt']);

    let codigoOpcaoSimplesNacional: 1 | 2 | 3 = 1; // Padrão: Não Optante (Lucro Presumido)
    let isOptante = false;

    if (opcSimpNacRaw !== null && opcSimpNacRaw !== undefined) {
      const val = parseInt(String(opcSimpNacRaw), 10);
      if (val === 3) {
        codigoOpcaoSimplesNacional = 3;
        isOptante = true;
      } else if (val === 2) {
        codigoOpcaoSimplesNacional = 2;
        isOptante = true;
      } else {
        codigoOpcaoSimplesNacional = 1;
        isOptante = false;
      }
    } else if (optanteAbrasfRaw !== null && optanteAbrasfRaw !== undefined) {
      // Padrão ABRASF: 1 = Sim (Optante), 2 = Não (Não Optante)
      const valStr = String(optanteAbrasfRaw).trim().toLowerCase();
      if (valStr === '1' || valStr === 'true') {
        codigoOpcaoSimplesNacional = 3;
        isOptante = true;
      } else {
        codigoOpcaoSimplesNacional = 1;
        isOptante = false;
      }
    } else if (crtRaw !== null && crtRaw !== undefined) {
      // NF-e CRT: 1 = Simples Nacional, 2 = Simples Nacional - excesso de sublimite, 3 = Regime Normal
      const crtVal = parseInt(String(crtRaw), 10);
      if (crtVal === 1 || crtVal === 2) {
        codigoOpcaoSimplesNacional = 3;
        isOptante = true;
      } else {
        codigoOpcaoSimplesNacional = 1;
        isOptante = false;
      }
    }

    const regimeTributario: ExtractedFiscalData['regimeTributario'] = isOptante
      ? 'simples_nacional'
      : 'lucro_presumido';

    // 7. Regime Especial de Tributação
    const rawRegimeEspecial = this.searchFirstKey(root, ['RegimeEspecialTributacao', 'regEspTrib', 'regime_especial_tributacao']);
    const regimeEspecialTributacao = rawRegimeEspecial !== null && rawRegimeEspecial !== undefined
      ? parseInt(String(rawRegimeEspecial), 10) || 0
      : 0;

    // 8. Códigos Nacionais (ISS e NBS)
    const codigoTribNac = this.searchFirstKey(root, [
      'CodigoTributacaoNacionalIss',
      'cTribNac',
      'codigo_tributacao_nacional_iss',
    ]);
    const codigoTributacaoNacionalIss = codigoTribNac ? String(codigoTribNac).trim() : '041601';

    const codigoNbsRaw = this.searchFirstKey(root, ['CodigoNBS', 'cNBS', 'codigo_nbs']);
    const codigoNbs = codigoNbsRaw ? String(codigoNbsRaw).trim() : '123011300';

    const itemListaServico = String(this.searchFirstKey(root, ['ItemListaServico', 'itemListaServico']) || '04.01');
    const codigoTributacaoMunicipio = String(
      this.searchFirstKey(root, ['CodigoTributacaoMunicipio', 'CodigoServico']) || itemListaServico
    );

    // 9. Alíquota ISS
    const rawAliquota = this.searchFirstKey(root, ['Aliquota', 'AliquotaServicos', 'pAliq']);
    let aliquotaIss = 2.0;
    if (rawAliquota) {
      const parsedNum = parseFloat(String(rawAliquota).replace(',', '.'));
      if (!isNaN(parsedNum)) {
        aliquotaIss = parsedNum < 1 ? parsedNum * 100 : parsedNum;
      }
    }

    // 10. Tributos Federais, Estaduais e Reforma Tributária (CBS e IBS)
    // Regra exata conforme diretriz do usuário:
    // Não Optante (Lucro Presumido / Real):
    //   - percentual_total_tributos_federais: "11.33"
    //   - cbs_aliquota: 0.9
    //   - ibs_uf_aliquota: 0.1
    //   - ibs_mun_aliquota: 0
    // Optante Simples Nacional:
    //   - percentual_total_tributos_federais: "0.00" (recolhimento unificado no DAS)
    //   - cbs_aliquota: 0
    //   - ibs_uf_aliquota: 0
    //   - ibs_mun_aliquota: 0
    const percentualTotalTributosFederais = isOptante ? '0.00' : '11.33';
    const percentualTotalTributosEstaduais = '0.00';
    const percentualTotalTributosMunicipais = String(aliquotaIss >= 1 ? Math.round(aliquotaIss) : 2);
    const cbsAliquota = isOptante ? 0 : 0.9;
    const ibsUfAliquota = isOptante ? 0 : 0.1;
    const ibsMunAliquota = 0;

    // 11. Extração de Dados Médicos (CRM, RQE, Especialidade, Nome Profissional)
    const discriminacao = String(
      this.searchFirstKey(root, ['Discriminacao', 'xServ', 'descricao_servico', 'DescricaoServico']) || ''
    );

    const crmMatch = discriminacao.match(/(?:CRM(?:[-\s]?[A-Z]{2})?[:\s]*)([0-9]{3,7})/i);
    const crm = crmMatch && crmMatch[1] ? `CRM${crmMatch[1]}` : undefined;

    const rqeMatch = discriminacao.match(/(?:RQE[:\s]*)([0-9]{3,7})/i);
    const rqe = rqeMatch && rqeMatch[1] ? `RQE${rqeMatch[1]}` : undefined;

    const espMatch = discriminacao.match(/(?:CONSULTA\s+(?:EM|DE)\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=:|-|\n|\r|$)/i);
    const especialidade = espMatch && espMatch[1] ? espMatch[1].trim().toUpperCase() : undefined;

    const profMatch = discriminacao.match(/(?:DRA?\.?|DR\.?|DOUTOR(?:A)?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?=\s+(?:CRM|RQE|-|\/|\())/i);
    const nomeProfissional = profMatch && profMatch[0]
      ? profMatch[0].trim()
      : (razaoSocial || undefined);

    // 12. Série e Número da DPS
    const serieDps = String(this.searchFirstKey(root, ['SerieDPS', 'serie_dps', 'Serie', 'serie']) || '1');
    const rawNumeroDps = this.searchFirstKey(root, ['NumeroDPS', 'nDPS', 'numero_dps', 'Numero', 'nNFSe']);
    const ultimoNumeroDps = rawNumeroDps ? parseInt(String(rawNumeroDps).replace(/\D/g, ''), 10) : undefined;
    const proximoNumeroDps = ultimoNumeroDps ? ultimoNumeroDps + 1 : 1;

    return {
      cnpj,
      inscricaoMunicipal: String(inscricaoMunicipal),
      razaoSocial: String(razaoSocial),
      nomeFantasia: nomeFantasia ? String(nomeFantasia) : undefined,
      cnae: String(cnae),
      codigoMunicipioEmissora: String(codigoMunicipio),
      cidade: String(cidadeRaw),
      uf: String(uf),
      logradouro: logradouro ? String(logradouro) : undefined,
      numero: numero ? String(numero) : undefined,
      bairro: bairro ? String(bairro) : undefined,
      cep: cep ? String(cep) : undefined,

      codigoOpcaoSimplesNacional,
      regimeTributario,
      isOptanteSimples: isOptante,
      regimeEspecialTributacao,

      codigoTributacaoNacionalIss,
      codigoNbs,
      itemListaServico,
      codigoTributacaoMunicipio,

      aliquotaIss,
      percentualTotalTributosFederais,
      percentualTotalTributosEstaduais,
      percentualTotalTributosMunicipais,
      cbsAliquota,
      ibsUfAliquota,
      ibsMunAliquota,

      crm,
      rqe,
      especialidade,
      nomeProfissional,

      serieDps,
      ultimoNumeroDps,
      proximoNumeroDps,
    };
  }

  private findDeepestSignificantRoot(obj: any): any {
    if (!obj || typeof obj !== 'object') return {};
    const keys = Object.keys(obj);
    if (keys.length === 1 && typeof obj[keys[0]] === 'object' && !Array.isArray(obj[keys[0]])) {
      return this.findDeepestSignificantRoot(obj[keys[0]]);
    }
    return obj;
  }

  private extractPrestadorNode(root: any): any {
    if (!root) return {};
    return (
      root.Prestador ||
      root.PrestadorServico ||
      root.DadosPrestador ||
      root.IdentificacaoPrestador ||
      root.emit ||
      root.Emitente ||
      root
    );
  }

  private searchFirstKey(obj: any, targetKeys: string[]): any {
    if (!obj || typeof obj !== 'object') return null;

    for (const key of targetKeys) {
      if (key in obj && obj[key] !== null && obj[key] !== undefined) {
        return obj[key];
      }
    }

    for (const childKey of Object.keys(obj)) {
      if (typeof obj[childKey] === 'object') {
        const found = this.searchFirstKey(obj[childKey], targetKeys);
        if (found !== null) return found;
      }
    }

    return null;
  }

  private cleanNumeric(val: any): string {
    if (!val) return '';
    return String(val).replace(/\D/g, '');
  }
}
