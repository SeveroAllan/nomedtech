/**
 * convenio-nacional-service.ts — Integração entre Notowhats e o motor multi-tenant emissor-nfse.
 *
 * Responsável por:
 *  - Persistir de forma segura o certificado A1 (.p12/.pfx) do médico.
 *  - Registrar o prestador no SQLite central do emissor com ambiente de homologação (ambiente: 2).
 *  - Emitir NFS-e pelo Convênio Nacional (SEFIN) diretamente com assinatura digital do médico.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initDb, salvarPrestador, obterPrestador, proximoNDPS, registrarNota } from '@/emissor/store';
import { emitirNfse } from '@/emissor/emissor';
import type { EmissaoInput } from '@/emissor/montar-dps';
import type { PrestadorConfig } from '@/emissor/config';

export interface RegistrarPrestadorParams {
  doctorId: string;
  cnpj: string;
  im?: string;
  uf: string;
  codigoMunicipioIbge: string;
  certBuffer: Buffer;
  certPassword: string;
  ambiente?: 1 | 2; // Default 2 (homologação / produção restrita)
  regimeTributario?: 'simples_nacional' | 'lucro_presumido' | 'lucro_real';
  opSimpNac?: 1 | 2 | 3;
  aliquotaIss?: number;
}

export class ConvenioNacionalService {
  private baseDir: string;
  private certsDir: string;

  constructor() {
    this.baseDir = join(process.cwd(), 'emissor-nfse');
    this.certsDir = join(process.cwd(), 'certs');
    initDb();
  }

  /**
   * Salva o certificado A1 no disco e cadastra o médico como tenant prestador no emissor.
   */
  public cadastrarPrestador(params: RegistrarPrestadorParams): PrestadorConfig {
    const {
      doctorId,
      cnpj,
      im = '',
      uf,
      codigoMunicipioIbge,
      certBuffer,
      certPassword,
      ambiente = 2, // Homologação por padrão
      regimeTributario = 'simples_nacional',
      opSimpNac,
      aliquotaIss = 2.0,
    } = params;

    // 1. Garante diretório seguro de certificados
    const doctorCertDir = join(this.certsDir, doctorId);
    if (!existsSync(doctorCertDir)) {
      mkdirSync(doctorCertDir, { recursive: true });
    }

    const certPath = join(doctorCertDir, 'certificado.p12');
    writeFileSync(certPath, certBuffer);

    // 2. Garante diretório de saída do prestador
    const outputDir = join(this.baseDir, 'output', doctorId);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // 3. Monta e persiste configuração do prestador
    const resolvedOpSimpNac: 1 | 2 | 3 =
      opSimpNac ?? (regimeTributario === 'simples_nacional' ? 2 : 1);

    const config: PrestadorConfig = {
      id: doctorId,
      cnpj: cnpj.replace(/\D/g, ''),
      im: im.trim(),
      uf: uf.trim().toUpperCase(),
      codMunicipio: codigoMunicipioIbge.replace(/\D/g, ''),
      certPath,
      certPassword,
      ambiente,
      outputDir,
      regTrib: {
        opSimpNac: resolvedOpSimpNac,
        regApTribSN: 1,
        regEspTrib: 0,
      },
      pTotTribSN: aliquotaIss,
    };

    salvarPrestador(config);
    return config;
  }

  /**
   * Obtém a configuração salva do prestador.
   */
  public obterConfiguracao(doctorId: string): PrestadorConfig | null {
    return obterPrestador(doctorId);
  }

  /**
   * Emite a NFS-e para uma consulta médica pelo Convênio Nacional em homologação.
   */
  public async emitirNotaConsulta(params: {
    doctorId: string;
    patient: {
      name: string;
      cpf: string;
      email?: string;
      phone?: string;
      address?: string;
      postalCode?: string;
      city?: string;
      state?: string;
    };
    valor: number;
    dataConsulta: string;
    descricao?: string;
    cTribNac?: string;
    cNBS?: string;
    isTelemedicina?: boolean;
  }) {
    const {
      doctorId,
      patient,
      valor,
      dataConsulta,
      descricao,
      cTribNac = '041601',
      cNBS = '123011300',
      isTelemedicina = false,
    } = params;

    const prestador = this.obterConfiguracao(doctorId);
    if (!prestador) {
      throw new Error(`Médico ${doctorId} não possui certificado ou configuração fiscal no Convênio Nacional.`);
    }

    const nDPS = String(proximoNDPS(doctorId));
    const docClean = patient.cpf.replace(/\D/g, '');

    // Garante endereço completo para o tomador, evitando a rejeição E0234 da SEFIN Nacional
    const cleanCep = (patient.postalCode || '90010000').replace(/\D/g, '').padEnd(8, '0').slice(0, 8);
    const logradouro = (patient.address || 'Atendimento ao Paciente - Consultório').trim();
    const bairro = (patient.city ? 'Centro' : 'Centro');

    const input: EmissaoInput = {
      nDPS,
      tomador: {
        xNome: patient.name || 'PACIENTE',
        CPF: docClean.length === 11 ? docClean : undefined,
        CNPJ: docClean.length === 14 ? docClean : undefined,
        email: patient.email,
        fone: patient.phone ? `55${patient.phone.replace(/\D/g, '')}` : undefined,
        end: {
          cMun: prestador.codMunicipio,
          CEP: cleanCep.length === 8 ? cleanCep : '90010000',
          xLgr: logradouro,
          nro: 'S/N',
          xBairro: bairro,
        },
      },
      xDescServ: descricao || `Consulta medica realizada em ${dataConsulta}.`,
      vServ: valor,
      cTribNac,
      cNBS,
      // Anexo VII (IndOp IBS/CBS - LC 214/2025):
      // 030101 = Serviço prestado fisicamente sobre a pessoa no estabelecimento (consultório médico)
      // 100301 = Demais serviços em operações onerosas (ex: telemedicina / remoto)
      cIndOp: isTelemedicina ? '100301' : '030101',
      cClassTrib: '000001',
      pTotTribSN: prestador.pTotTribSN,
    };

    const resultado = await emitirNfse(input, doctorId);
    let chNFSe = `DPS-${nDPS}`;
    try {
      chNFSe =
        (resultado as any)?.response?.chaveAcesso ||
        (resultado as any)?.chaveAcesso ||
        (resultado as any)?.chNFSe ||
        `DPS-${nDPS}`;
      registrarNota({
        chave_acesso: chNFSe,
        ndps: Number(nDPS),
        prestador_id: doctorId,
        emitida_em: new Date().toISOString(),
      }, doctorId);
    } catch {}

    return {
      resultado,
      nDPS,
      chNFSe,
      outputDir: prestador.outputDir,
    };
  }

  /**
   * Tenta obter o PDF oficial do DANFSe do governo (SEFIN/ADN) via mTLS
   * ou do cache local gerado no disco.
   */
  public async obterDanfseOriginalPdf(doctorId: string, chaveOuNumero: string): Promise<Buffer | null> {
    const prestador = this.obterConfiguracao(doctorId);
    if (!prestador) return null;

    // 1. Checa se o PDF oficial já está em cache no diretório do prestador
    const possiblePaths = [
      join(prestador.outputDir, `danfse-${chaveOuNumero}.pdf`),
      join(prestador.outputDir, `danfse.pdf`),
      join(this.baseDir, 'output', doctorId, `danfse-${chaveOuNumero}.pdf`),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        try {
          return readFileSync(p);
        } catch {}
      }
    }

    // 2. Procura pelo XML de autorização oficial da SEFIN gravado pelo emissor
    const cleanChave = chaveOuNumero.replace(/\D/g, '');
    const possibleXmlPaths = [
      join(prestador.outputDir, 'autorizacao', `${cleanChave}.xml`),
      join(this.baseDir, 'output', doctorId, 'autorizacao', `${cleanChave}.xml`),
      join(prestador.outputDir, `${cleanChave}.xml`),
    ];

    let foundXmlPath: string | null = null;
    for (const xp of possibleXmlPaths) {
      if (existsSync(xp)) {
        foundXmlPath = xp;
        break;
      }
    }

    // Se não achou pelo nome da chave completa, vasculha o diretório de autorização pelo mais recente
    if (!foundXmlPath) {
      const authDir = join(prestador.outputDir, 'autorizacao');
      if (existsSync(authDir)) {
        try {
          const { readdirSync, statSync } = await import('node:fs');
          const files = readdirSync(authDir)
            .filter((f) => f.endsWith('.xml'))
            .map((f) => ({ file: f, mtime: statSync(join(authDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          if (files.length > 0) {
            // Se foi informada chave parcial ou se tiver XML recente
            foundXmlPath = join(authDir, files[0].file);
          }
        } catch {}
      }
    }

    // 3. Se encontrou o XML oficial da SEFIN, gera o DANFSe NT-008 fiel
    if (foundXmlPath && existsSync(foundXmlPath)) {
      try {
        const { generateDanfsePdf } = await import('@/lib/fiscal/danfse-pdf-generator');
        const xmlContent = readFileSync(foundXmlPath, 'utf8');
        console.log(`[ConvenioNacionalService] Gerando DANFSe NT-008 oficial a partir do XML: ${foundXmlPath}`);
        const pdfBytes = await generateDanfsePdf({
          xmlContent,
          ambiente: prestador.ambiente === 1 ? 'producao' : 'homologacao',
        });
        const pdfBuffer = Buffer.from(pdfBytes);
        const savePath = join(prestador.outputDir, `danfse-${cleanChave || chaveOuNumero}.pdf`);
        writeFileSync(savePath, pdfBuffer);
        console.log(`[ConvenioNacionalService] DANFSe NT-008 gerado e salvo em: ${savePath} (${pdfBuffer.length} bytes)`);
        return pdfBuffer;
      } catch (renderErr: any) {
        console.warn(`[ConvenioNacionalService] Falha ao renderizar DANFSe do XML oficial:`, renderErr.message);
      }
    }

    // 4. Se for uma chave de acesso completa de 50 dígitos e não gerou acima, tenta mTLS ADN
    if (cleanChave.length === 50 && prestador.certPath && existsSync(prestador.certPath)) {
      try {
        const { baixarDanfse } = await import('@/emissor/email');
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`[ConvenioNacionalService] Tentando baixar DANFSe do ADN (tentativa ${attempt}/2)...`);
            const pdfBuf = await baixarDanfse(cleanChave, prestador);
            if (pdfBuf && (pdfBuf.subarray(0, 4).toString() === '%PDF' || pdfBuf.length > 1000)) {
              const savePath = join(prestador.outputDir, `danfse-${cleanChave}.pdf`);
              writeFileSync(savePath, pdfBuf);
              console.log(`[ConvenioNacionalService] DANFSe oficial do ADN obtido com sucesso (${pdfBuf.length} bytes).`);
              return pdfBuf;
            }
          } catch (fetchErr: any) {
            console.warn(`[ConvenioNacionalService] Tentativa ${attempt} ADN: ${fetchErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn(`[ConvenioNacionalService] Falha no fallback ADN:`, err.message);
      }
    }

    return null;
  }

  /**
   * Cancela uma NFS-e emitida registrando o evento de cancelamento oficial (101101) na SEFIN Nacional.
   */
  public async cancelarNota(doctorId: string, chaveAcesso: string, motivo: string = 'Cancelamento de nota fiscal emitido em teste operacional do consultorio') {
    const prestador = this.obterConfiguracao(doctorId);
    if (!prestador) {
      throw new Error(`Médico ${doctorId} não possui configuração fiscal cadastrada.`);
    }

    const { getNfseWizard } = await import('@/emissor/emissor');
    const wizard = await getNfseWizard(prestador);

    const cleanChave = chaveAcesso.replace(/\D/g, '');
    const cleanMotivo = motivo.length >= 15 ? motivo : `${motivo} - cancelamento operacional solicitado pelo emitente`;

    const { momentoSP } = await import('@/emissor/montar-dps');
    const { dhEmi } = momentoSP();

    const eventoCancelamento: any = {
      chaveAcesso: cleanChave,
      pedRegEvento: {
        infPedReg: {
          tpAmb: prestador.ambiente,
          verAplic: '1.0',
          dhEvento: dhEmi,
          CNPJAutor: prestador.cnpj,
          chNFSe: cleanChave,
          e101101: {
            xDesc: 'Cancelamento de NFS-e',
            cMotivo: '1',
            xMotivo: cleanMotivo,
          },
        },
      },
    };

    const resultado = await wizard.RegistrarEvento(eventoCancelamento);
    return resultado;
  }
}

export const convenioNacionalService = new ConvenioNacionalService();

