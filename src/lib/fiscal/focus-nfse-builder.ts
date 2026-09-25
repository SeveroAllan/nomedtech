import type { ExtractedFiscalData } from '../xml/nfse-parser';

export interface FocusNfseNacionalPayload {
  data_emissao: string;
  data_competencia: string;
  codigo_municipio_emissora: string;
  cnpj_prestador: string;
  codigo_opcao_simples_nacional: 1 | 2 | 3;
  regime_especial_tributacao: number;
  razao_social_tomador: string;
  codigo_municipio_tomador: string;
  logradouro_tomador?: string;
  numero_tomador?: string;
  bairro_tomador?: string;
  cep_tomador?: string;
  codigo_municipio_prestacao: string;
  codigo_tributacao_nacional_iss: string;
  codigo_nbs: string;
  descricao_servico: string;
  valor_servico: number;
  tributacao_iss: number;
  tipo_retencao_iss: number;
  serie_dps: string;
  numero_dps: number;
  percentual_total_tributos_federais: string;
  percentual_total_tributos_estaduais: string;
  percentual_total_tributos_municipais: string;
  finalidade_emissao: number;
  codigo_indicador_operacao: string;
  consumidor_final: number;
  indicador_destinatario: number;
  ibs_cbs_situacao_tributaria: string;
  ibs_cbs_classificacao_tributaria: string;
  cbs_aliquota: number;
  ibs_uf_aliquota: number;
  ibs_mun_aliquota: number;
  cpf_tomador: string;
  email_tomador?: string;
  telefone_tomador?: string;
}

export interface PatientFiscalInput {
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  postalCode?: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  ibgeCityCode?: string;
}

export interface AppointmentFiscalInput {
  /** Data principal da consulta — "YYYY-MM-DD" ou "YYYY-MM-DDTHH:MM:SS" */
  appointmentDate: string;
  /** Datas adicionais de consultas sem NF emitida (incluindo a appointmentDate quando há múltiplas) */
  appointmentDates?: string[];
  amount: number; // valor em reais (ex: 900)
  numeroDps?: number;
  serieDps?: string;
  notes?: string;
}

const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * Converte data "YYYY-MM-DD" para "D de mês de YYYY" (ex: "15 de setembro de 2026")
 */
export function formatDateToPortuguese(dateStr: string): string {
  if (!dateStr) return 'data da consulta';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;

  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (monthIdx >= 0 && monthIdx < 12) {
    return `${day} de ${MESES_EXTENSO[monthIdx]} de ${year}`;
  }
  return clean;
}

/**
 * Retorna data e hora atual no formato ISO com offset de fuso brasileiro (ex: 2026-09-16T08:50:07-0300)
 */
export function getLocalIsoString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}T${h}:${min}:${s}-0300`;
}

/**
 * Monta o texto padronizado da descrição do serviço na nota fiscal.
 *
 * Formato: "REFERENTE A [N] CONSULTA(S) REALIZADAS COM [MÉDICO] ([RQE/CRM]) NAS DATAS [DATAS]."
 *
 * Aceita uma única data (`dataConsulta`) ou múltiplas (`datasConsulta`). Quando ambas
 * são fornecidas, `datasConsulta` tem precedência e `dataConsulta` é ignorada.
 */
export function buildDescricaoServico(params: {
  especialidade?: string;
  nomeProfissional?: string;
  crm?: string;
  rqe?: string;
  /** Data única — mantido para compatibilidade retroativa */
  dataConsulta?: string;
  /** Lista de datas quando há múltiplas consultas sem NF emitida */
  datasConsulta?: string[];
  cidade?: string;
  isOptanteSimples?: boolean;
}): string {
  const datas = params.datasConsulta && params.datasConsulta.length > 0
    ? params.datasConsulta
    : (params.dataConsulta ? [params.dataConsulta] : []);

  const totalConsultas = datas.length;
  const quantidadePart = totalConsultas === 1 ? '1 CONSULTA' : `${totalConsultas} CONSULTAS`;
  const realizadaPart = totalConsultas === 1 ? 'REALIZADA' : 'REALIZADAS';

  const prof = (params.nomeProfissional || 'MÉDICO(A)').toUpperCase();

  // Monta a identificação do médico: prioriza RQE sobre CRM conforme presença
  const identificacaoParts: string[] = [];
  if (params.rqe) identificacaoParts.push(`RQE: ${params.rqe}`);
  if (params.crm) identificacaoParts.push(`CRM: ${params.crm}`);
  const identificacao = identificacaoParts.length > 0
    ? ` (${identificacaoParts.join(' / ')})`
    : '';

  const datasFormatadas = datas
    .map(formatDateToPortuguese)
    .join(', ');

  let desc = `REFERENTE A ${quantidadePart} ${realizadaPart} COM ${prof}${identificacao} NAS DATAS ${datasFormatadas}.`;

  if (params.isOptanteSimples) {
    desc += ' DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI/ICMS/ISS.';
  }

  return desc;
}

/**
 * Construtor oficial do Payload Focus NFe NFS-e Nacional (DPS / Reforma Tributária)
 * Aplica automaticamente a diferenciação entre Optante pelo Simples Nacional e Não Optante (Lucro Presumido/Real).
 */
export function buildFocusNfsePayload(
  doctorFiscal: ExtractedFiscalData,
  patient: PatientFiscalInput,
  appointment: AppointmentFiscalInput
): FocusNfseNacionalPayload {
  const isOptante = doctorFiscal.isOptanteSimples || doctorFiscal.codigoOpcaoSimplesNacional === 3;
  const cleanCpf = patient.cpf.replace(/\D/g, '');
  const cleanPhone = (patient.phone || '').replace(/\D/g, '');

  // Município Tomador: se o paciente tiver código IBGE específico usa ele; senão usa o município da prestação
  const codMunicipioTomador = patient.ibgeCityCode && patient.ibgeCityCode.length === 7
    ? patient.ibgeCityCode
    : doctorFiscal.codigoMunicipioEmissora;

  const dataCompetencia = appointment.appointmentDate.includes('T')
    ? appointment.appointmentDate.split('T')[0]
    : appointment.appointmentDate;

  const numeroDps = appointment.numeroDps || doctorFiscal.proximoNumeroDps || 1;
  const serieDps = appointment.serieDps || doctorFiscal.serieDps || '1';

  // Usa datasConsulta (múltiplas) se fornecidas; caso contrário, cai na data única
  const datasNormalizadas = appointment.appointmentDates && appointment.appointmentDates.length > 0
    ? appointment.appointmentDates.map((d) => (d.includes('T') ? d.split('T')[0] : d))
    : [dataCompetencia];

  const descricaoServico = buildDescricaoServico({
    especialidade: doctorFiscal.especialidade,
    nomeProfissional: doctorFiscal.nomeProfissional || doctorFiscal.razaoSocial,
    crm: doctorFiscal.crm,
    rqe: doctorFiscal.rqe,
    datasConsulta: datasNormalizadas,
    cidade: doctorFiscal.cidade,
    isOptanteSimples: isOptante,
  });

  return {
    data_emissao: getLocalIsoString(),
    data_competencia: dataCompetencia,
    codigo_municipio_emissora: doctorFiscal.codigoMunicipioEmissora,
    cnpj_prestador: doctorFiscal.cnpj,
    // 1 = Não optante (Lucro Presumido / Real), 3 = Optante ME/EPP (Simples Nacional)
    codigo_opcao_simples_nacional: isOptante ? 3 : 1,
    regime_especial_tributacao: doctorFiscal.regimeEspecialTributacao || 0,
    razao_social_tomador: patient.name,
    codigo_municipio_tomador: codMunicipioTomador,
    logradouro_tomador: patient.address || doctorFiscal.logradouro || undefined,
    numero_tomador: patient.number || doctorFiscal.numero || undefined,
    bairro_tomador: patient.neighborhood || doctorFiscal.bairro || undefined,
    cep_tomador: patient.postalCode ? patient.postalCode.replace(/\D/g, '') : (doctorFiscal.cep ? doctorFiscal.cep.replace(/\D/g, '') : undefined),
    codigo_municipio_prestacao: doctorFiscal.codigoMunicipioEmissora,
    codigo_tributacao_nacional_iss: doctorFiscal.codigoTributacaoNacionalIss || '041601',
    codigo_nbs: doctorFiscal.codigoNbs || '123011300',
    descricao_servico: descricaoServico,
    valor_servico: appointment.amount,
    tributacao_iss: 1,
    tipo_retencao_iss: 1,
    serie_dps: serieDps,
    numero_dps: numeroDps,
    // Regras de Diferenciação Tributária:
    // Não Optante (Lucro Presumido): "11.33" federais, 0.9 CBS, 0.1 IBS UF
    // Optante Simples Nacional: "0.00" federais (inclusos no DAS), 0 CBS, 0 IBS UF
    percentual_total_tributos_federais: isOptante ? '0.00' : '11.33',
    percentual_total_tributos_estaduais: '0.00',
    percentual_total_tributos_municipais: doctorFiscal.percentualTotalTributosMunicipais || '2',
    finalidade_emissao: 0,
    codigo_indicador_operacao: '030101',
    consumidor_final: 1,
    indicador_destinatario: 0,
    ibs_cbs_situacao_tributaria: '000',
    ibs_cbs_classificacao_tributaria: '000001',
    cbs_aliquota: isOptante ? 0 : 0.9,
    ibs_uf_aliquota: isOptante ? 0 : 0.1,
    ibs_mun_aliquota: 0,
    cpf_tomador: cleanCpf,
    email_tomador: patient.email || undefined,
    telefone_tomador: cleanPhone || undefined,
  };
}
