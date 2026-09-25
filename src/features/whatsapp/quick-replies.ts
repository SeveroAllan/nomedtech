import { validateCPF } from '@/shared/utils/validators';

export interface QuickReplyDefinition {
  shortcut: string;
  triggerPhrase: string;
  copyablePhrase?: string;
  completionExample?: string;
  description: string;
  exampleUsage: string;
}

export const DEFAULT_QUICK_REPLIES: QuickReplyDefinition[] = [
  {
    shortcut: '/marcado',
    triggerPhrase: 'Consulta agendada!',
    copyablePhrase: 'Consulta agendada!',
    description: 'Usa a IA para extrair data, hora e dados cadastrais do paciente da conversa desde o momento em que a consulta foi agendada.',
    exampleUsage: 'Consulta agendada!',
  },
  {
    shortcut: '/emissao',
    triggerPhrase: 'Vou lhe enviar em instante sua NF no valor de R$ ___',
    copyablePhrase: 'Vou lhe enviar em instante sua NF no valor de R$ ',
    completionExample: '400,00',
    description: 'Emite e envia a NFS-e usando o valor informado na mensagem. Se houver mais de uma consulta, adicione: das consultas [datas].',
    exampleUsage: 'Vou lhe enviar em instante sua NF no valor de R$ 400,00 das consultas 10/09 e 17/09',
  },
];

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function isAgendaTrigger(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.startsWith('/agenda') ||
    normalized.startsWith('vou verificar a disponibilidade, so um instante por favor')
  );
}

export function isMarcadoTrigger(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.startsWith('/marcado') ||
    normalized.startsWith('/agendado') ||
    normalized.startsWith('consulta agendada') ||
    normalized.startsWith('atendimento marcado')
  );
}

export function isEmissaoTrigger(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.startsWith('/emissao') ||
    normalized.includes('vou lhe enviar em instante sua nf') ||
    normalized.includes('vou lhe enviar em instantes sua nf') ||
    normalized.includes('vou lhe enviar em instante a sua nf') ||
    normalized.includes('vou lhe enviar em instantes a sua nf') ||
    normalized.includes('vou enviar em instante sua nf') ||
    normalized.includes('vou enviar em instantes sua nf') ||
    /vou\s+(?:lhe\s+)?enviar\s+em\s+instantes?\s+(?:[a-z]{1,3}\s+)?nf\s+no\s+valor/i.test(text)
  );
}

export function extractAmountFromEmissao(text: string): number | null {
  const match = text.match(
    /(?:valor\s+(?:de\s*)?(?:r\$\s*)?|r\$\s*|\/emissao\s+)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i
  );
  if (!match?.[1]) return null;

  const amount = Number.parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function extractExtraConditionsFromEmissao(text: string): string | null {
  // Localiza o trecho do prefixo + valor monetário
  const match = text.match(
    /(?:valor\s+(?:de\s*)?(?:r\$\s*)?|r\$\s*|\/emissao\s+)(\d{1,3}(?:\.\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i
  );
  if (!match || match.index === undefined) return null;

  const valueEndIndex = match.index + match[0].length;
  const remaining = text.slice(valueEndIndex).trim();

  // Remove eventuais pontuações iniciais/finais como vírgulas, traços ou pontos
  const cleaned = remaining.replace(/^[,;\-–—.\s]+/, '').replace(/[.\s]+$/, '').trim();
  return cleaned || null;
}

export function extractConsultationDatesFromEmissao(text: string): string | null {
  const match = text.match(/da[s]?\s+consulta[s]?\s+([^\n\r]+)/i);
  if (!match?.[1]) return null;

  const datesStr = match[1].replace(/[.]+$/, '').trim();
  return datesStr || null;
}

export interface DoctorFiscalInfo {
  name?: string;
  crm?: string;
  rqe?: string;
  rqr?: string;
  especialidade?: string;
}

export function formatDoctorCredentials(doctor?: DoctorFiscalInfo | string): string {
  if (!doctor) return 'MEDICO(A)';
  if (typeof doctor === 'string') return doctor.toUpperCase();

  const parts: string[] = [];
  if (doctor.name) parts.push(doctor.name.toUpperCase().trim());
  if (doctor.crm) {
    const crmUpper = doctor.crm.toUpperCase().trim();
    parts.push(crmUpper.startsWith('CRM') ? crmUpper : `CRM ${crmUpper}`);
  }
  const rqrVal = doctor.rqr || doctor.rqe;
  if (rqrVal) {
    const rqrUpper = rqrVal.toUpperCase().trim();
    parts.push(rqrUpper.startsWith('RQ') ? rqrUpper : `RQE ${rqrUpper}`);
  }
  if (doctor.especialidade) {
    parts.push(`(${doctor.especialidade.toUpperCase().trim()})`);
  }

  return parts.length > 0 ? parts.join(' - ') : 'MEDICO(A)';
}

export function buildServiceDescription(
  doctor?: DoctorFiscalInfo | string,
  appointmentDate: string = new Date().toISOString().slice(0, 10),
  extraConditions?: string | null
): string {
  const sanitizedDoctor = formatDoctorCredentials(doctor);
  if (extraConditions) {
    const cleaned = extraConditions.trim().toUpperCase();
    if (/^(DAS?|EM|REFERENTE|PARA|COM)\b/i.test(cleaned)) {
      return `CONSULTA MEDICA REALIZADA ${cleaned} COM ${sanitizedDoctor}`;
    }
    return `CONSULTA MEDICA REALIZADA (${cleaned}) COM ${sanitizedDoctor}`;
  }
  return `CONSULTA MEDICA REALIZADA EM ${appointmentDate} COM ${sanitizedDoctor}`;
}

export function extractPatientInfoFromText(text: string): {
  cpf?: string;
  name?: string;
  email?: string;
} {
  const result: { cpf?: string; name?: string; email?: string } = {};
  const cpfMatch = text.match(/(?:^|[^\d])((?:\d[\s.-]?){11})(?=$|[^\d])/);
  if (cpfMatch) {
    const cpf = cpfMatch[1].replace(/\D/g, '');
    if (validateCPF(cpf)) result.cpf = cpf;
  }

  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) result.email = emailMatch[1].toLowerCase();

  const nameMatch = text.match(
    /(?:meu\s+nome\s+[eé]|nome(?:\s+do\s+paciente|\s+completo)?)\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ ]{3,60})/i
  );
  if (nameMatch?.[1]) {
    const cleaned = cleanName(nameMatch[1]);
    if (isValidPersonName(cleaned)) result.name = cleaned;
  }
  return result;
}

export function isValidPersonName(name?: string): boolean {
  if (!name || name.trim().length < 3 || name.trim().length > 50) return false;
  const invalidKeywords = [
    'possivel',
    'possivel',
    'identificar',
    'consulta',
    'agendada',
    'obrigado',
    'reenviar',
    'doutor',
    'medico',
    'paciente',
    'instante',
    'valor',
    'marcado',
  ];
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !invalidKeywords.some((kw) => normalized.includes(kw));
}

function cleanName(name: string): string {
  return name.replace(/[,\-–—;]/g, '').replace(/\s+/g, ' ').trim();
}

export function generateQuickRepliesWelcomeMessage(doctorName?: string): string {
  const name = doctorName ? `Dr(a). ${doctorName}` : 'Doutor(a)';
  return (
    `🚀 *Bem-vindo(a) ao Noto Sync, ${name}!*\n\n` +
    `Salve estas respostas rápidas no WhatsApp Business:\n\n` +
    `1️⃣ */marcado* — ${DEFAULT_QUICK_REPLIES[0].triggerPhrase}\n` +
    `2️⃣ */emissao* — ${DEFAULT_QUICK_REPLIES[1].triggerPhrase}\n\n` +
    `📌 WhatsApp Business → Configurações → Ferramentas Comerciais → Respostas Rápidas`
  );
}
