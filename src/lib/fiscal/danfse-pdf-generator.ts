import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import QRCode from 'qrcode';
import { XMLParser } from 'fast-xml-parser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DanfsePdfOptions {
  xmlContent?: string;
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  dataEmissao?: string;
  competencia?: string;
  ambiente?: 'producao' | 'homologacao';
  cancelada?: boolean;
  prestador?: {
    razaoSocial?: string;
    nomeFantasia?: string;
    cnpj?: string;
    inscricaoMunicipal?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
    simplesNacional?: boolean;
  };
  tomador?: {
    nome?: string;
    cpf?: string;
    inscricaoMunicipal?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
  };
  servico?: {
    cTribNac?: string;
    cNBS?: string;
    discriminacao?: string;
    valor?: number;
    aliquota?: number;
    issApurado?: number;
    desconto?: number;
    deducoes?: number;
    retencoes?: number;
  };
}

/** Formata chave de 50 dígitos em grupos de 4 */
function formatarChaveAcesso(chave?: string | number): string {
  if (!chave) return '';
  const limpa = String(chave).replace(/\D/g, '');
  return limpa.replace(/(\d{4})/g, '$1 ').trim();
}

/** Formata CPF ou CNPJ */
function formatarDoc(doc?: string | number): string {
  if (!doc) return '-';
  const c = String(doc).replace(/\D/g, '');
  if (c.length === 11) {
    return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (c.length === 14) {
    return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return String(doc);
}

/** Formata CEP */
function formatarCep(cep?: string | number): string {
  if (!cep) return '-';
  const c = String(cep).replace(/\D/g, '');
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : String(cep);
}

/** Formata Moeda BRL */
function formatarMoeda(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0,00';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Gera o DANFSe Padrão Nacional oficial (conforme Nota Técnica NT-008, v1.02)
 * Desenha fielmente o layout de referência do Sistema Nacional da NFS-e.
 */
export async function generateDanfsePdf(options: DanfsePdfOptions = {}): Promise<Uint8Array> {
  let {
    xmlContent,
    chaveAcesso = '',
    numero = '1',
    serie = '1',
    dataEmissao = new Date().toISOString(),
    competencia = new Date().toISOString().slice(0, 10),
    ambiente = 'producao',
    cancelada = false,
    prestador = {},
    tomador = {},
    servico = {},
  } = options;

  // 1. Se vier o XML oficial da SEFIN, extrai todos os dados originais
  if (xmlContent) {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });
      const parsed = parser.parse(xmlContent);
      const infNFSe = parsed?.NFSe?.infNFSe;
      const infDPS = infNFSe?.DPS?.infDPS;

      if (infNFSe) {
        chaveAcesso = (infNFSe['@_Id'] || chaveAcesso).replace(/^NFS/, '');
        numero = String(infNFSe.nNFSe || numero);
        dataEmissao = infNFSe.dhProc || dataEmissao;
        if (infNFSe.cStat === 101 || String(infNFSe.cStat).includes('cancel')) {
          cancelada = true;
        }

        const emit = infNFSe.emit;
        if (emit) {
          prestador.razaoSocial = emit.xNome || prestador.razaoSocial;
          prestador.cnpj = emit.CNPJ || emit.CPF || prestador.cnpj;
          if (emit.enderNac) {
            prestador.endereco = `${emit.enderNac.xLgr || ''}, ${emit.enderNac.nro || 'S/N'}${emit.enderNac.xCpl ? ` ${emit.enderNac.xCpl}` : ''} - ${emit.enderNac.xBairro || ''}`.trim();
            prestador.municipio = infNFSe.xLocEmi || prestador.municipio;
            prestador.uf = emit.enderNac.UF || prestador.uf;
            prestador.cep = emit.enderNac.CEP || prestador.cep;
          }
          prestador.telefone = emit.fone || prestador.telefone;
          prestador.email = emit.email || prestador.email;
        }
      }

      if (infDPS) {
        serie = String(infDPS.serie || serie);
        competencia = infDPS.dCompet || competencia;
        const toma = infDPS.toma;
        if (toma) {
          tomador.nome = toma.xNome || tomador.nome;
          tomador.cpf = toma.CPF || toma.CNPJ || tomador.cpf;
          if (toma.end?.endNac) {
            tomador.endereco = `${toma.end.xLgr || ''}, ${toma.end.nro || 'S/N'} - ${toma.end.xBairro || ''}`.trim();
            tomador.municipio = toma.end.endNac.xMun || infNFSe?.xLocPrestacao || tomador.municipio;
            tomador.cep = toma.end.endNac.CEP || tomador.cep;
          }
          tomador.telefone = toma.fone || tomador.telefone;
          tomador.email = toma.email || tomador.email;
        }

        const s = infDPS.serv;
        if (s) {
          servico.cTribNac = s.cServ?.cTribNac || servico.cTribNac;
          servico.cNBS = s.cServ?.cNBS || servico.cNBS;
          servico.discriminacao = s.cServ?.xDescServ || servico.discriminacao;
        }

        const v = infDPS.valores;
        if (v) {
          servico.valor = Number(v.vServPrest?.vServ || servico.valor || 0);
          servico.aliquota = Number(v.trib?.tribMun?.pAliq || servico.aliquota || 2);
          servico.issApurado = Number(v.trib?.tribMun?.vISSQN || ((servico.valor || 0) * (servico.aliquota || 0)) / 100);
        }
      }
    } catch (e) {
      console.warn('[DANFSe PDF] Erro ao interpretar XML oficial:', e);
    }
  }

  // 2. Cria documento PDF A4 (595.28 x 841.89 pt)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 20;
  const contentWidth = width - marginX * 2; // ~555.28 pt
  let currentY = height - 20;

  // Paleta oficial DANFSe NT-008
  const colorBlack = rgb(0, 0, 0);
  const colorGrayText = rgb(0.35, 0.35, 0.35);
  const colorBorder = rgb(0.2, 0.2, 0.2); // borda padrão contínua fina
  const colorSectionHeaderBg = rgb(0.88, 0.88, 0.88); // cinza cabeçalho seção
  const colorFieldBg = rgb(0.96, 0.96, 0.96); // leve fundo para destaque

  // Helpers de desenho
  const drawBox = (x: number, y: number, w: number, h: number, bg?: any) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: 0.5,
      borderColor: colorBorder,
      color: bg,
    });
  };

  const drawField = (
    x: number,
    yTop: number,
    w: number,
    h: number,
    label: string,
    value: string,
    isBold = false,
    bg?: any
  ) => {
    drawBox(x, yTop - h, w, h, bg);
    if (label) {
      page.drawText(label.toUpperCase(), {
        x: x + 2.5,
        y: yTop - 7.5,
        size: 5.5,
        font: fontBold,
        color: colorGrayText,
      });
    }
    const valY = label ? yTop - 16.5 : yTop - h / 2 - 3;
    const valStr = value || '-';
    // Trunca texto se for maior que a largura
    const maxChars = Math.floor(w / 4.8);
    const displayVal = valStr.length > maxChars ? `${valStr.slice(0, maxChars - 2)}..` : valStr;

    page.drawText(displayVal, {
      x: x + 2.5,
      y: valY,
      size: isBold ? 7.5 : 7,
      font: isBold ? fontBold : fontRegular,
      color: colorBlack,
    });
  };

  const drawSectionTitle = (title: string, h = 12) => {
    drawBox(marginX, currentY - h, contentWidth, h, colorSectionHeaderBg);
    page.drawText(title.toUpperCase(), {
      x: marginX + 4,
      y: currentY - 8.5,
      size: 6.5,
      font: fontBold,
      color: colorBlack,
    });
    currentY -= h;
  };

  // ----------------------------------------------------
  // BANDA 1: CABEÇALHO OFICIAL (Logo + Título + Município)
  // ----------------------------------------------------
  const cabecalhoH = 45;
  drawBox(marginX, currentY - cabecalhoH, contentWidth, cabecalhoH);

  // Logo Oficial NFS-e Nacional
  const logoPath = join(process.cwd(), 'src', 'lib', 'fiscal', 'assets', 'nfse-logo.png');
  let logoEmbedded = false;
  if (existsSync(logoPath)) {
    try {
      const logoBytes = readFileSync(logoPath);
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const logoW = 110;
      const logoH = 34;
      page.drawImage(logoImg, {
        x: marginX + 6,
        y: currentY - cabecalhoH + (cabecalhoH - logoH) / 2,
        width: logoW,
        height: logoH,
      });
      logoEmbedded = true;
    } catch {}
  }

  if (!logoEmbedded) {
    page.drawText('NFS-e', {
      x: marginX + 10,
      y: currentY - 26,
      size: 20,
      font: fontBold,
      color: colorBlack,
    });
    page.drawText('NACIONAL', {
      x: marginX + 10,
      y: currentY - 37,
      size: 9,
      font: fontBold,
      color: colorGrayText,
    });
  }

  // Centro - Título Oficial
  page.drawText('DANFSe v2.0', {
    x: marginX + 135,
    y: currentY - 14,
    size: 11,
    font: fontBold,
    color: colorBlack,
  });
  page.drawText('Documento Auxiliar da Nota Fiscal de Serviço Eletrônica', {
    x: marginX + 135,
    y: currentY - 26,
    size: 8.5,
    font: fontRegular,
    color: colorBlack,
  });

  const isHomologacao = ambiente === 'homologacao';
  if (isHomologacao) {
    page.drawText('NFS-e SEM VALIDADE JURÍDICA — HOMOLOGAÇÃO', {
      x: marginX + 135,
      y: currentY - 37,
      size: 7.5,
      font: fontBold,
      color: rgb(0.85, 0.1, 0.1),
    });
  } else {
    page.drawText('Padrão Nacional da NFS-e (Receita Federal do Brasil / SEFIN)', {
      x: marginX + 135,
      y: currentY - 37,
      size: 7,
      font: fontRegular,
      color: colorGrayText,
    });
  }

  // Direita - Município e Ambiente
  const dirW = 140;
  const dirX = width - marginX - dirW;
  const munNome = (prestador.municipio || 'Porto Alegre').toUpperCase();
  const ufSigla = (prestador.uf || 'RS').toUpperCase();
  page.drawText(`MUNICÍPIO: ${munNome} - ${ufSigla}`, {
    x: dirX,
    y: currentY - 13,
    size: 7,
    font: fontBold,
    color: colorBlack,
  });
  page.drawText('Ambiente Gerador: SEFIN Nacional', {
    x: dirX,
    y: currentY - 24,
    size: 6.5,
    font: fontRegular,
    color: colorGrayText,
  });
  page.drawText(`Tipo de Ambiente: ${isHomologacao ? 'Homologação' : 'Produção'}`, {
    x: dirX,
    y: currentY - 34,
    size: 6.5,
    font: fontBold,
    color: isHomologacao ? rgb(0.85, 0.1, 0.1) : rgb(0.1, 0.5, 0.1),
  });

  currentY -= cabecalhoH;

  // ----------------------------------------------------
  // BANDA 2: DADOS DA NFS-E E QR-CODE
  // ----------------------------------------------------
  const dadosNfseH = 82;
  const qrColW = 95;
  const dadosColW = contentWidth - qrColW; // ~460.28 pt

  drawBox(marginX, currentY - dadosNfseH, contentWidth, dadosNfseH);

  // Sub-bloco esquerdo: Chave e Metadados (3 colunas)
  // Chave de Acesso (Destaque superior)
  const chaveFormatada = formatarChaveAcesso(chaveAcesso || '43149022233841732000163000000000001226097414639456');
  page.drawText('CHAVE DE ACESSO DA NFS-e', {
    x: marginX + 4,
    y: currentY - 9,
    size: 6,
    font: fontBold,
    color: colorGrayText,
  });
  page.drawText(chaveFormatada, {
    x: marginX + 4,
    y: currentY - 20,
    size: 8.5,
    font: fontBold,
    color: colorBlack,
  });

  // Linhas de dados em 3 colunas
  const cW3 = dadosColW / 3;
  const rowH = 19;
  let rY = currentY - 25;

  // Linha 1
  drawField(marginX, rY, cW3, rowH, 'Número da NFS-e', numero, true, colorFieldBg);
  drawField(marginX + cW3, rY, cW3, rowH, 'Competência', competencia);
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão NFS-e', dataEmissao.replace('T', ' ').slice(0, 19));

  // Linha 2
  rY -= rowH;
  drawField(marginX, rY, cW3, rowH, 'Número da DPS', options.numero || '1');
  drawField(marginX + cW3, rY, cW3, rowH, 'Série da DPS', serie || '00001');
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão DPS', dataEmissao.slice(0, 10));

  // Linha 3
  rY -= rowH;
  drawField(marginX, rY, cW3, rowH, 'Emitente da NFS-e', 'Prestador', false);
  drawField(marginX + cW3, rY, cW3, rowH, 'Situação da NFS-e', cancelada ? 'CANCELADA' : 'EMITIDA COM SUCESSO', true);
  drawField(marginX + cW3 * 2, rY, cW3, rowH, 'Finalidade', 'Normal');

  // Sub-bloco direito: QR Code Oficial
  const qrBoxX = marginX + dadosColW;
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chaveAcesso.replace(/\D/g, '')}`;
  try {
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      margin: 1,
      width: 140,
      errorCorrectionLevel: 'M',
    });
    const qrImg = await pdfDoc.embedPng(qrBuffer);
    const qrSize = 58;
    page.drawImage(qrImg, {
      x: qrBoxX + (qrColW - qrSize) / 2,
      y: currentY - qrSize - 4,
      width: qrSize,
      height: qrSize,
    });
  } catch {}

  page.drawText('Consulte pela chave ou QR Code', {
    x: qrBoxX + 5,
    y: currentY - 68,
    size: 5,
    font: fontRegular,
    color: colorGrayText,
  });
  page.drawText('no Portal Nacional da NFS-e', {
    x: qrBoxX + 11,
    y: currentY - 76,
    size: 5,
    font: fontRegular,
    color: colorGrayText,
  });

  currentY -= dadosNfseH;

  // ----------------------------------------------------
  // BANDA 3: PRESTADOR / FORNECEDOR
  // ----------------------------------------------------
  drawSectionTitle('Prestador / Fornecedor');
  const prestadorH = 19;
  const colW4 = contentWidth / 4;

  // Linha 1: CNPJ / IM / Telefone / Simples
  drawField(marginX, currentY, colW4, prestadorH, 'CNPJ / CPF', formatarDoc(prestador.cnpj || '33841732000163'), true);
  drawField(marginX + colW4, currentY, colW4, prestadorH, 'Inscrição Municipal', prestador.inscricaoMunicipal || '-');
  drawField(marginX + colW4 * 2, currentY, colW4, prestadorH, 'Telefone', prestador.telefone || '-');
  drawField(marginX + colW4 * 3, currentY, colW4, prestadorH, 'Opção Simples Nacional', 'Optante - MEI', false, colorFieldBg);
  currentY -= prestadorH;

  // Linha 2: Razão Social / Município / CEP
  drawField(marginX, currentY, colW4 * 2, prestadorH, 'Nome / Nome Empresarial', (prestador.razaoSocial || 'ALLAN SEVERO').toUpperCase(), true);
  drawField(marginX + colW4 * 2, currentY, colW4, prestadorH, 'Município / UF', `${prestador.municipio || 'Porto Alegre'} - ${prestador.uf || 'RS'}`);
  drawField(marginX + colW4 * 3, currentY, colW4, prestadorH, 'CEP', formatarCep(prestador.cep || '91790336'));
  currentY -= prestadorH;

  // Linha 3: Endereço completo / E-mail
  drawField(marginX, currentY, colW4 * 2.5, prestadorH, 'Endereço', prestador.endereco || 'Atendimento em Consultório Médico');
  drawField(marginX + colW4 * 2.5, currentY, colW4 * 1.5, prestadorH, 'E-mail', (prestador.email || '-').toLowerCase());
  currentY -= prestadorH;

  // ----------------------------------------------------
  // BANDA 4: TOMADOR / ADQUIRENTE
  // ----------------------------------------------------
  drawSectionTitle('Tomador / Adquirente');
  const tomadorH = 19;

  // Linha 1: CPF / IM / Telefone
  drawField(marginX, currentY, colW4, tomadorH, 'CPF / CNPJ', formatarDoc(tomador.cpf || '00000000000'), true);
  drawField(marginX + colW4, currentY, colW4, tomadorH, 'Inscrição Municipal', tomador.inscricaoMunicipal || '-');
  drawField(marginX + colW4 * 2, currentY, colW4 * 2, tomadorH, 'Telefone', tomador.telefone || '-');
  currentY -= tomadorH;

  // Linha 2: Nome / Município / CEP
  drawField(marginX, currentY, colW4 * 2, tomadorH, 'Nome / Nome Empresarial', (tomador.nome || 'PACIENTE').toUpperCase(), true);
  drawField(marginX + colW4 * 2, currentY, colW4, tomadorH, 'Município / UF', `${tomador.municipio || prestador.municipio || 'Porto Alegre'} - ${tomador.uf || prestador.uf || 'RS'}`);
  drawField(marginX + colW4 * 3, currentY, colW4, tomadorH, 'CEP', formatarCep(tomador.cep || prestador.cep || '90010000'));
  currentY -= tomadorH;

  // Linha 3: Endereço / E-mail
  drawField(marginX, currentY, colW4 * 2.5, tomadorH, 'Endereço', tomador.endereco || 'Atendimento ao Paciente');
  drawField(marginX + colW4 * 2.5, currentY, colW4 * 1.5, tomadorH, 'E-mail', (tomador.email || '-').toLowerCase());
  currentY -= tomadorH;

  // ----------------------------------------------------
  // BANDA 5: SERVIÇO PRESTADO
  // ----------------------------------------------------
  drawSectionTitle('Serviço Prestado');
  const servH1 = 18;
  drawField(marginX, currentY, colW4, servH1, 'Cód. Tributação Nacional', servico.cTribNac || '041601', true);
  drawField(marginX + colW4, currentY, colW4, servH1, 'Código da NBS', servico.cNBS || '123011300');
  drawField(marginX + colW4 * 2, currentY, colW4 * 2, servH1, 'Local da Prestação', `${prestador.municipio || 'Porto Alegre'} - ${prestador.uf || 'RS'} / Brasil`);
  currentY -= servH1;

  // Descrição do Serviço (com quebra em múltiplas linhas)
  const descH = 46;
  drawBox(marginX, currentY - descH, contentWidth, descH);
  page.drawText('DISCRIMINAÇÃO DOS SERVIÇOS', {
    x: marginX + 4,
    y: currentY - 8,
    size: 5.5,
    font: fontBold,
    color: colorGrayText,
  });

  const rawDesc = servico.discriminacao || `CONSULTA MEDICA REALIZADA EM ${competencia} COM ${prestador.razaoSocial || 'MEDICO(A)'}`;
  // Divide a descrição em linhas de até 95 caracteres
  const descLines: string[] = [];
  let currentLine = '';
  for (const word of rawDesc.split(' ')) {
    if ((currentLine + ' ' + word).trim().length <= 95) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      descLines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) descLines.push(currentLine);

  let descY = currentY - 20;
  for (const line of descLines.slice(0, 3)) {
    page.drawText(line, {
      x: marginX + 6,
      y: descY,
      size: 7.5,
      font: fontRegular,
      color: colorBlack,
    });
    descY -= 11;
  }
  currentY -= descH;

  // ----------------------------------------------------
  // BANDA 6: TRIBUTAÇÃO MUNICIPAL (ISSQN)
  // ----------------------------------------------------
  drawSectionTitle('Tributação Municipal (ISSQN)');
  const tribH = 19;
  drawField(marginX, currentY, colW4, tribH, 'Tipo de Tributação', 'Operação Tributável');
  drawField(marginX + colW4, currentY, colW4, tribH, 'Município de Incidência', `${prestador.municipio || 'Porto Alegre'} - ${prestador.uf || 'RS'}`);
  drawField(marginX + colW4 * 2, currentY, colW4, tribH, 'Regime Especial', 'Nenhum');
  drawField(marginX + colW4 * 3, currentY, colW4, tribH, 'Retenção ISSQN', 'Não Retido');
  currentY -= tribH;

  drawField(marginX, currentY, colW4, tribH, 'Base de Cálculo ISSQN', `R$ ${formatarMoeda(servico.valor)}`);
  drawField(marginX + colW4, currentY, colW4, tribH, 'Alíquota Aplicada', `${formatarMoeda(servico.aliquota)}%`);
  drawField(marginX + colW4 * 2, currentY, colW4, tribH, 'ISSQN Apurado', `R$ ${formatarMoeda(servico.issApurado)}`);
  drawField(marginX + colW4 * 3, currentY, colW4, tribH, 'Total Deduções / Reduções', `R$ ${formatarMoeda(servico.deducoes || 0)}`);
  currentY -= tribH;

  // ----------------------------------------------------
  // BANDA 7: VALORES TOTAIS DA NFS-E (Destaque Principal)
  // ----------------------------------------------------
  drawSectionTitle('Valores Totais da NFS-e');
  const totH = 24;

  drawField(marginX, currentY, colW4, totH, 'Valor dos Serviços', `R$ ${formatarMoeda(servico.valor)}`, true);
  drawField(marginX + colW4, currentY, colW4, totH, 'Desconto Incondicionado', `R$ ${formatarMoeda(servico.desconto || 0)}`);
  drawField(marginX + colW4 * 2, currentY, colW4, totH, 'Total Retenções Federais', `R$ ${formatarMoeda(servico.retencoes || 0)}`);

  // Campo Valor Líquido com destaque em negrito e fundo sombreado
  const valLiq = (servico.valor || 0) - (servico.desconto || 0) - (servico.retencoes || 0);
  drawBox(marginX + colW4 * 3, currentY - totH, colW4, totH, rgb(0.9, 0.95, 0.9));
  page.drawText('VALOR LÍQUIDO DA NFS-e', {
    x: marginX + colW4 * 3 + 3,
    y: currentY - 8,
    size: 6,
    font: fontBold,
    color: rgb(0.1, 0.4, 0.1),
  });
  page.drawText(`R$ ${formatarMoeda(valLiq)}`, {
    x: marginX + colW4 * 3 + 3,
    y: currentY - 19,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.4, 0.1),
  });
  currentY -= totH;

  // ----------------------------------------------------
  // BANDA 8: INFORMAÇÕES COMPLEMENTARES
  // ----------------------------------------------------
  drawSectionTitle('Informações Complementares', 11);
  const infoCompH = 48;
  drawBox(marginX, currentY - infoCompH, contentWidth, infoCompH);

  const infoTexts = [
    'I - Documento emitido por ME ou EPP optante pelo Simples Nacional (Microempreendedor Individual - MEI).',
    'II - Não gera direito a crédito fiscal de IPI ou ISSQN.',
    'III - Total aproximado de tributos federais, estaduais e municipais: R$ 0,00 (dispensado conforme Decreto Federal nº 8.264/2014).',
    'IV - NFS-e emitida em conformidade com o Convênio Nacional da NFS-e (Lei Complementar nº 116/2003 e Resolução CGSN nº 169/2022).',
  ];

  let infoY = currentY - 11;
  for (const t of infoTexts) {
    page.drawText(t, {
      x: marginX + 6,
      y: infoY,
      size: 6,
      font: fontRegular,
      color: colorGrayText,
    });
    infoY -= 10;
  }
  currentY -= infoCompH;

  // ----------------------------------------------------
  // MARCA D'ÁGUA EM CASO DE CANCELAMENTO OU HOMOLOGAÇÃO
  // ----------------------------------------------------
  if (cancelada) {
    page.drawText('CANCELADA', {
      x: width / 2 - 170,
      y: height / 2 - 40,
      size: 62,
      font: fontBold,
      color: rgb(0.9, 0.15, 0.15),
      opacity: 0.28,
      rotate: degrees(35),
    });
  } else if (isHomologacao) {
    page.drawText('HOMOLOGAÇÃO / SEM VALOR', {
      x: width / 2 - 210,
      y: height / 2 - 40,
      size: 38,
      font: fontBold,
      color: rgb(0.85, 0.2, 0.2),
      opacity: 0.22,
      rotate: degrees(30),
    });
  }

  return await pdfDoc.save();
}
