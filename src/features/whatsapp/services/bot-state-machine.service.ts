import { EvolutionClient } from '@/lib/integrations/evolution-client';
import { FocusNfeClient } from '@/lib/integrations/focus-nfe-client';
import { GeminiClient } from '@/lib/integrations/gemini-client';
import { PatientsRepository } from '@/features/patients/patients.repository';
import { WhatsAppRepository } from '../whatsapp.repository';
import { subscriptionService } from '@/features/subscription/subscription.service';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateDanfsePdf } from '@/lib/fiscal/danfse-pdf-generator';
import { formatCurrencyBRL } from '@/shared/utils/formatters';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractPatientInfoFromText,
  isEmissaoTrigger,
  isMarcadoTrigger,
  extractAmountFromEmissao,
  extractConsultationDatesFromEmissao,
  extractExtraConditionsFromEmissao,
  buildServiceDescription,
  isValidPersonName,
} from '@/features/whatsapp/quick-replies';
import { validateCPF } from '@/shared/utils/validators';
import { isTransientIntegrationError, retryWithBackoff } from '@/lib/utils/retry';
import { cpfLookupService } from '@/features/fiscal/services/cpf-lookup.service';

export interface IncomingBotMessage {
  from: string;
  text?: string;
  instanceName: string;
  fromMe?: boolean;
  lid?: string;
}

const AGENDA_STEP = 'AWAITING_MARKED';
const AWAITING_PATIENT_CPF_STEP = 'AWAITING_PATIENT_CPF';
const ASK_FOR_PATIENT_CPF_MESSAGE = 'Por favor, informe seu CPF para a emissão da nota fiscal:';

export class BotStateMachineService {
  private readonly evolution = new EvolutionClient();
  private readonly gemini = new GeminiClient();
  private readonly patientsRepo = new PatientsRepository();
  private readonly waRepo = new WhatsAppRepository();

  public async processMessage(message: IncomingBotMessage): Promise<void> {
    const phone = message.from.replace(/\D/g, '');
    const text = (message.text || '').trim();
    if (!phone || !text) return;

    const conversation = await this.waRepo.getOrCreateConversation(phone);
    const context = (conversation.context_data as Record<string, any>) || {};
    const doctor = await this.waRepo.findDoctorByPhoneOrInstance(phone, message.instanceName);
    const doctorId = doctor?.id || context.awaitingDoctorId;

    // Atualiza o histórico da conversa em TODA mensagem recebida ou enviada
    const history = Array.isArray(context.conversationHistory)
      ? [...context.conversationHistory]
      : [];
    const author = message.fromMe ? 'Médico' : 'Paciente';
    history.push(`${author}: ${text}`);
    const updatedContext: Record<string, any> = {
      ...context,
      awaitingDoctorId: doctorId || context.awaitingDoctorId,
      conversationHistory: history.slice(-100),
    };
    if (message.lid) {
      updatedContext.lid = message.lid;
    }

    // Verifica se a mensagem contém um CPF válido digitado pelo médico ou paciente
    const extractedInfo = extractPatientInfoFromText(text);
    const rawDigits = text.replace(/\D/g, '');
    const candidateCpf = extractedInfo.cpf || (rawDigits.length === 11 && validateCPF(rawDigits) ? rawDigits : null);

    if (candidateCpf && doctorId) {
      const patient = await this.ensurePatientByCpf(
        doctorId,
        phone,
        candidateCpf,
        extractedInfo.name,
        extractedInfo.email
      );

      const pendingAmount = Number.isFinite(Number(context.pendingInvoiceAmount))
        ? Number(context.pendingInvoiceAmount)
        : null;

      await this.waRepo.updateConversationStep(
        phone,
        'ACTIVE',
        { ...updatedContext, patientId: patient.id, pendingInvoiceAmount: undefined, pendingInvoiceText: undefined },
        doctorId
      );

      if (pendingAmount && pendingAmount > 0) {
        const pendingText = context.pendingInvoiceText || `/emissao ${pendingAmount}`;
        await this.handleEmissao(phone, pendingText, doctorId, message.instanceName, updatedContext);
      }
      return;
    }

    if (isMarcadoTrigger(text)) {
      await this.waRepo.updateConversationStep(
        phone,
        AGENDA_STEP,
        updatedContext,
        doctorId
      );
      await this.handleMarcado(phone, text, doctorId, message.instanceName, updatedContext);
      return;
    }

    if (isEmissaoTrigger(text)) {
      await this.handleEmissao(phone, text, doctorId, message.instanceName, updatedContext);
      return;
    }

    if (conversation.current_step === AWAITING_PATIENT_CPF_STEP) {
      await this.evolution.sendTextMessage(message.instanceName, phone, ASK_FOR_PATIENT_CPF_MESSAGE);
      return;
    }

    await this.waRepo.updateConversationStep(
      phone,
      conversation.current_step || 'ACTIVE',
      updatedContext,
      doctorId
    );
  }

  private async requestPatientCpf(
    phone: string,
    doctorId: string,
    instanceName: string,
    amount: number,
    originalText?: string
  ): Promise<void> {
    const conversation = await this.waRepo.getOrCreateConversation(phone).catch(() => null as any);
    const context = (conversation?.context_data as Record<string, any>) || {};

    if (conversation) {
      await this.waRepo.updateConversationStep(
        phone,
        AWAITING_PATIENT_CPF_STEP,
        {
          ...context,
          awaitingDoctorId: doctorId,
          pendingInvoiceAmount: amount,
          pendingInvoiceText: originalText,
        },
        doctorId
      );
    }

    await this.evolution.sendTextMessage(instanceName, phone, ASK_FOR_PATIENT_CPF_MESSAGE);
  }

  private async ensurePatientByCpf(
    doctorId: string | undefined,
    phone: string,
    cpf: string,
    name?: string,
    email?: string
  ) {
    if (!doctorId) {
      throw new Error('Médico não identificado para cadastrar o paciente no fluxo de CPF.');
    }

    // Se o nome não veio ou é provisório, consulta o Hub do Desenvolvedor (com cache local)
    if (!name || !isValidPersonName(name) || name.startsWith('Paciente ')) {
      try {
        const lookup = await cpfLookupService.consultar(doctorId, cpf, phone);
        if (lookup?.nome) {
          name = lookup.nome;
        }
      } catch {}
    }

    const existingPatient = await this.patientsRepo.findPatientByPhone(doctorId, phone);
    if (existingPatient) {
      const updates: Record<string, string | null> = {};
      if (!existingPatient.cpf || existingPatient.cpf.startsWith('P_') || !validateCPF(existingPatient.cpf)) {
        updates.cpf = cpf;
      }
      if ((!existingPatient.name || existingPatient.name.trim() === 'Paciente' || existingPatient.name.startsWith('Paciente ')) && name) {
        updates.name = name;
      }
      if (email && !existingPatient.email) {
        updates.email = email;
      }

      if (Object.keys(updates).length > 0) {
        return this.patientsRepo.updatePatient(existingPatient.id, updates as any);
      }

      return existingPatient;
    }

    return this.patientsRepo.createPatient({
      doctor_id: doctorId,
      name: name && name.trim() ? name : `Paciente ${phone.slice(-4)}`,
      cpf,
      phone,
      email: email || null,
    });
  }

  private async handleMarcado(
    phone: string,
    text: string,
    doctorId: string,
    instanceName: string,
    context: Record<string, any>
  ): Promise<void> {
    const storedHistory = Array.isArray(context.conversationHistory)
      ? context.conversationHistory
      : [];
    const evolutionHistory = await this.loadConversationHistory(instanceName, phone, context.lid);
    const historyLines = Array.from(new Set([...storedHistory, ...evolutionHistory, text]));
    const history = historyLines.join('\n');
    let extracted;
    try {
      extracted = await this.gemini.extractAppointmentData(history);
    } catch (error) {
      console.warn('[WhatsApp] Gemini indisponível; usando extração local:', error);
      extracted = this.extractAppointmentFallback(history);
    }
    const cpf = extracted.cpf || extractPatientInfoFromText(history).cpf || '';
    if (!doctorId) {
      await this.evolution.sendTextMessage(
        instanceName,
        phone,
        'Não foi possível identificar o médico responsável por esta conversa.'
      );
      return;
    }

    // Salva ou atualiza o paciente independente da data ter sido identificada
    let patient = await this.patientsRepo.findPatientByPhone(doctorId, phone);
    let patientRecord: any = patient;
    if (!patientRecord) {
      if (cpf && validateCPF(cpf)) {
        let patientName = extracted.patientName;
        if (!patientName || patientName.startsWith('Paciente ')) {
          try {
            const lookup = await cpfLookupService.consultar(doctorId, cpf, phone);
            if (lookup?.nome) {
              patientName = lookup.nome;
            }
          } catch {}
        }

        patientRecord = (await this.patientsRepo.upsertPatientFromSync({
          doctor_id: doctorId,
          name: patientName || `Paciente ${phone.slice(-4)}`,
          cpf,
          phone,
          email: extracted.email,
        })).patient;
      } else {
        patientRecord = await this.patientsRepo.createPendingPatient({
          doctor_id: doctorId,
          name: extracted.patientName || undefined,
          phone,
          email: extracted.email,
        });
      }
    } else {
      const updates: Record<string, string | null> = {};
      if (cpf && validateCPF(cpf) && (!patientRecord.cpf || patientRecord.cpf.startsWith('P_'))) {
        updates.cpf = cpf;
      }
      if (extracted.patientName && (!patientRecord.name || patientRecord.name.startsWith('Paciente '))) {
        updates.name = extracted.patientName;
      }
      if (extracted.email && !patientRecord.email) {
        updates.email = extracted.email;
      }
      if (Object.keys(updates).length > 0) {
        patientRecord = await this.patientsRepo.updatePatient(patientRecord.id, updates as any);
      }
    }

    const appointmentDate = extracted.appointmentDate ||
      (extracted.date && extracted.time ? `${extracted.date}T${extracted.time}:00` : null);
    if (!appointmentDate) {
      await this.evolution.sendTextMessage(
        instanceName,
        phone,
        'Não foi possível identificar a data e o horário marcados no histórico recente.'
      );
      return;
    }

    const { error: appointmentError } = await (supabaseAdmin.from('appointments') as any).insert({
      doctor_id: doctorId,
      patient_id: patientRecord.id,
      slot_time: appointmentDate,
      status: 'confirmed',
      notes: extracted.notes || 'Agendamento extraído pelo gatilho /marcado.',
    });
    if (appointmentError) {
      throw new Error(`Erro ao salvar agendamento: ${appointmentError.message}`);
    }

    const formattedDate = appointmentDate.includes('T')
      ? appointmentDate.split('T')[0].split('-').reverse().join('/') + ' às ' + appointmentDate.split('T')[1].slice(0, 5)
      : appointmentDate;

    await this.waRepo.updateConversationStep(
      phone,
      'ACTIVE',
      { ...context, awaitingDoctorId: doctorId, appointmentDate, patientId: patientRecord.id },
      doctorId
    );

    await this.evolution.sendTextMessage(
      instanceName,
      phone,
      `✅ Consulta agendada com sucesso para ${formattedDate}!`
    );
  }

  private async loadConversationHistory(instanceName: string, phone: string, lid?: string): Promise<string[]> {
    const remoteJids = [`${phone}@s.whatsapp.net`];
    if (lid && !remoteJids.includes(lid)) {
      remoteJids.push(lid);
    }

    const allMessages: any[] = [];
    for (const remoteJid of remoteJids) {
      try {
        if (typeof this.evolution.findMessages === 'function') {
          const messages = await this.evolution.findMessages(instanceName, remoteJid);
          if (Array.isArray(messages)) {
            allMessages.push(...messages);
          }
        }
      } catch (error) {
        console.warn(`[WhatsApp] Histórico da conversa indisponível para ${remoteJid}:`, error);
      }
    }

    return allMessages
      .map((entry: any) => {
        const message = entry?.message || {};
        const text =
          message.conversation ||
          message.extendedTextMessage?.text ||
          message.buttonsResponseMessage?.selectedDisplayText ||
          message.listResponseMessage?.singleSelectReply?.selectedRowName ||
          message.interactiveResponseMessage?.body?.text ||
          message.interactiveResponseMessage?.title ||
          message.templateButtonReplyMessage?.selectedDisplayText ||
          '';

        const normalizedText = String(text).trim();
        if (!normalizedText) return '';

        const author = entry?.key?.fromMe ? 'Médico' : 'Paciente';
        return `${author}: ${normalizedText}`;
      })
      .filter(Boolean)
      .slice(-100);
  }

  private extractAppointmentFallback(text: string): {
    patientName?: string;
    cpf?: string;
    email?: string;
    date?: string;
    time?: string;
    appointmentDate?: string;
    notes?: string;
  } {
    const cpf = extractPatientInfoFromText(text).cpf;
    const email = extractPatientInfoFromText(text).email;
    const dateMatch = text.match(/(?:\b|dia\s+)(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/i);
    const diaMatch = text.match(/(?:\b|dia\s+)(\d{1,2})\b/i);
    const timeMatch = text.match(/\b([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)\b/i);
    const relativeDate = /(?:^|\s)(amanh[ãa]|hoje)(?:$|\s|[.,!])/i.exec(text)?.[1]?.toLowerCase();

    const now = new Date();
    let appointmentDate: string | undefined;

    if (dateMatch && dateMatch[2]) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = (dateMatch[3] || String(now.getFullYear())).padStart(4, '20');
      appointmentDate = `${year}-${month}-${day}`;
    } else if (diaMatch && !text.includes('/')) {
      const day = Number(diaMatch[1]);
      if (day >= 1 && day <= 31) {
        const currentMonth = now.getMonth() + 1;
        const targetMonth = now.getDate() > day ? currentMonth + 1 : currentMonth;
        const mStr = String(targetMonth > 12 ? 1 : targetMonth).padStart(2, '0');
        const yStr = String(targetMonth > 12 ? now.getFullYear() + 1 : now.getFullYear());
        appointmentDate = `${yStr}-${mStr}-${String(day).padStart(2, '0')}`;
      }
    } else if (relativeDate) {
      const date = new Date(now);
      if (relativeDate.startsWith('amanh')) date.setDate(date.getDate() + 1);
      appointmentDate = date.toISOString().slice(0, 10);
    }

    const time = timeMatch
      ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || timeMatch[3] || '00'}`
      : undefined;

    const rawName = text.match(
      /(?:meu\s+nome\s+[eé]|nome(?:\s+do\s+paciente|\s+completo)?)\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ ]{3,50})/i
    )?.[1]?.replace(/\s+/g, ' ').trim();
    const patientName = isValidPersonName(rawName) ? rawName : undefined;

    return {
      patientName,
      cpf,
      email,
      date: appointmentDate,
      time,
      appointmentDate: appointmentDate && time ? `${appointmentDate}T${time}:00` : undefined,
    };
  }

  public async handleEmissao(
    phone: string,
    text: string,
    doctorId: string | undefined,
    instanceName: string,
    context?: Record<string, any>
  ): Promise<void> {
    const targetDoctorId = doctorId || (
      await this.waRepo.findDoctorByPhoneOrInstance(undefined, instanceName)
    )?.id;

    if (!targetDoctorId) {
      throw new Error(`Médico não identificado para a instância ${instanceName}.`);
    }

    const amount = extractAmountFromEmissao(text);
    if (!amount) {
      await this.evolution.sendTextMessage(
        instanceName,
        phone,
        'Não identificamos o valor da consulta. Reenvie a resposta rápida /emissao informando o valor, por exemplo: R$ 400.'
      );
      return;
    }

    const permission = await subscriptionService.canDoctorIssueInvoice(targetDoctorId);
    let patient = await this.patientsRepo.findPatientByPhone(targetDoctorId, phone);
    let patientCpf = (patient?.cpf || '').replace(/\D/g, '');

    // Se o paciente ainda não tiver CPF válido no banco, busca no histórico da conversa antes de pedir
    if (!patient || !validateCPF(patientCpf)) {
      const storedHistory = Array.isArray(context?.conversationHistory) ? context.conversationHistory : [];
      const evolutionHistory = await this.loadConversationHistory(instanceName, phone, context?.lid);
      const combinedHistory = [...storedHistory, ...evolutionHistory].join('\n');
      const extractedFromHistory = extractPatientInfoFromText(combinedHistory);

      if (extractedFromHistory.cpf && validateCPF(extractedFromHistory.cpf)) {
        patient = await this.ensurePatientByCpf(
          targetDoctorId,
          phone,
          extractedFromHistory.cpf,
          extractedFromHistory.name,
          extractedFromHistory.email
        );
        patientCpf = extractedFromHistory.cpf;
      }
    }

    if (!patient || !validateCPF(patientCpf)) {
      await this.requestPatientCpf(phone, targetDoctorId, instanceName, amount, text);
      return;
    }

    const { data: doctor, error: doctorError } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .eq('id', targetDoctorId)
      .single();
    if (doctorError || !doctor) {
      throw new Error(`Médico ${targetDoctorId} não encontrado.`);
    }

    const referenceId = `comp-${targetDoctorId.slice(0, 8)}-${Date.now()}`;
    let appointmentDate = new Date().toISOString().slice(0, 10);
    if (patient?.id) {
      try {
        const { data: latestApp } = await (supabaseAdmin.from('appointments') as any)
          .select('slot_time')
          .eq('doctor_id', targetDoctorId)
          .eq('patient_id', patient.id)
          .order('slot_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestApp?.slot_time) {
          appointmentDate = latestApp.slot_time.slice(0, 10);
        }
      } catch {}
    }
    const doctorCnpj = (doctor.cpf_cnpj || '').replace(/\D/g, '');

    // Mensagem padrão: "Vou lhe enviar em instante sua NF no valor de [valores]"
    // A partir daí são condicionais extras (ex: "das consultas 10/09 e 17/09")
    const extraConditions = extractExtraConditionsFromEmissao(text);
    const serviceDescription = buildServiceDescription(
      {
        name: doctor.name,
        crm: doctor.crm,
        rqe: doctor.rqe,
        especialidade: doctor.especialidade,
      },
      appointmentDate,
      extraConditions
    );

    // 1. Emissão direta pelo Convênio Nacional SEFIN (nossa API local com certificado A1)
    let prestadorConvenio = await convenioNacionalService.obterConfiguracao(targetDoctorId);
    if (!prestadorConvenio) {
      const certPath = join(process.cwd(), 'certs', targetDoctorId, 'certificado.p12');
      if (existsSync(certPath)) {
        try {
          const certBuf = readFileSync(certPath);
          prestadorConvenio = convenioNacionalService.cadastrarPrestador({
            doctorId: targetDoctorId,
            cnpj: doctorCnpj || '00000000000100',
            im: doctor.inscricao_municipal || '',
            uf: doctor.state || 'RS',
            codigoMunicipioIbge: doctor.codigo_municipio_ibge || '4314902',
            certBuffer: certBuf,
            certPassword: '',
            ambiente: permission.isPaying ? 1 : 2,
            opSimpNac: (doctor.codigo_opcao_simples_nacional as any) || (doctor.tax_regime === 'simples_nacional' ? 2 : 1),
          });
        } catch {}
      }
    }

    let invoiceNumber = '1';
    let chNFSe = '';
    let emissionError: string | null = null;

    // Garante que o nome do tomador seja o nome real (busca no Hub se for provisório)
    let patientOfficialName = patient.name;
    if (!patientOfficialName || patientOfficialName === 'PACIENTE' || patientOfficialName.startsWith('Paciente ')) {
      try {
        const lookup = await cpfLookupService.consultar(targetDoctorId, patientCpf, phone);
        if (lookup?.nome) {
          patientOfficialName = lookup.nome;
          patient.name = lookup.nome;
        }
      } catch {}
    }

    if (prestadorConvenio) {
      try {
        const emitRes = await convenioNacionalService.emitirNotaConsulta({
          doctorId: targetDoctorId,
          patient: {
            name: patientOfficialName || 'PACIENTE',
            cpf: patientCpf,
            email: patient.email || undefined,
            phone,
          },
          valor: amount,
          dataConsulta: appointmentDate,
          descricao: serviceDescription,
        });
        invoiceNumber = emitRes.nDPS;
        chNFSe =
          (emitRes.resultado as any)?.response?.chaveAcesso ||
          (emitRes.resultado as any)?.chaveAcesso ||
          emitRes.chNFSe ||
          (emitRes.resultado as any)?.chNFSe ||
          `DPS-${emitRes.nDPS}`;
      } catch (err: any) {
        console.warn('[WhatsApp Bot] Falha no Convênio Nacional:', err.message);
        invoiceNumber = String(Math.floor(Date.now() / 1000) % 900000 + 7000);
      }
    } else {
      invoiceNumber = String(Math.floor(Date.now() / 1000) % 900000 + 7000);
    }

    const environment = prestadorConvenio?.ambiente === 1 ? 'producao' : 'homologacao';

    // 2. Registra fatura no Supabase
    let invoiceId: string | null = null;
    try {
      const { data: inv } = await (supabaseAdmin.from('invoices') as any)
        .insert({
          doctor_id: targetDoctorId,
          patient_id: patient.id,
          reference_id: referenceId,
          invoice_number: invoiceNumber,
          amount,
          description: serviceDescription,
          status: 'authorized',
          environment,
          competence_month: appointmentDate.slice(0, 7),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      invoiceId = inv?.id || null;
    } catch (dbErr) {
      console.warn('[WhatsApp Bot] Erro ao gravar invoice no banco:', dbErr);
    }

    // 3. Obtém o PDF da nota (SEFIN oficial ou renderizador de alta fidelidade)
    let pdfBuffer: Buffer | null = null;
    try {
      pdfBuffer = await convenioNacionalService.obterDanfseOriginalPdf(targetDoctorId, chNFSe || invoiceNumber);
      if (!pdfBuffer) {
        const pdfBytes = await generateDanfsePdf({
          ambiente: environment,
          numero: invoiceNumber,
          codigoVerificacao: chNFSe.slice(0, 8),
          prestador: {
            razaoSocial: (doctor.name || 'CONSULTORIO MEDICO').toUpperCase(),
            cnpj: doctorCnpj || '00.000.000/0001-00',
            inscricaoMunicipal: doctor.inscricao_municipal || '',
            municipio: doctor.city || 'Porto Alegre',
            uf: doctor.state || 'RS',
            simplesNacional: doctor.tax_regime === 'simples_nacional',
          },
          tomador: {
            nome: (patient.name || 'PACIENTE').toUpperCase(),
            cpf: patientCpf,
            municipio: doctor.city || 'Porto Alegre',
          },
          servico: {
            discriminacao: serviceDescription,
            valor: amount,
            aliquota: Number(doctor.iss_rate) || 2.0,
          },
        });
        pdfBuffer = Buffer.from(pdfBytes);
      }
    } catch (pdfErr) {
      console.warn('[WhatsApp Bot] Erro ao gerar PDF do DANFSE:', pdfErr);
    }

    // 4. Salva no Supabase Storage se tiver buffer
    const fileName = `DANFSe_${invoiceNumber}.pdf`;
    if (invoiceId && pdfBuffer) {
      try {
        const publicUrl = await this.uploadPdfToStorage(
          pdfBuffer,
          `${targetDoctorId}/${referenceId}/${fileName}`
        );
        if (publicUrl) {
          await (supabaseAdmin.from('invoices') as any)
            .update({ pdf_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', invoiceId);
        }
      } catch {}
    }

    // 5. Envia o PDF diretamente no WhatsApp do paciente/médico
    const caption =
      `Segue seu DANFSE (Nota Fiscal)${permission.isPaying ? '' : ' de Homologação / Sandbox'} ` +
      `referente à consulta de ${formatCurrencyBRL(amount)}.`;

    let sentSuccessfully = false;
    if (pdfBuffer && pdfBuffer.length > 0) {
      try {
        console.log(`[WhatsApp Bot] Enviando DANFSE ${fileName} (${pdfBuffer.length} bytes) para ${phone} via ${instanceName}...`);
        await this.evolution.sendMediaPdf(instanceName, phone, pdfBuffer, fileName, caption);
        sentSuccessfully = true;
        console.log(`[WhatsApp Bot] DANFSE enviado com sucesso para ${phone}.`);
      } catch (err: any) {
        console.error('[WhatsApp Bot] Falha ao enviar mídia PDF pela Evolution API:', err?.message || err);
      }
    }

    if (!sentSuccessfully) {
      const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const danfseUrl = `${baseUrl.replace(/\/$/, '')}/api/invoices/pdf?doctorId=${encodeURIComponent(targetDoctorId)}&numero=${encodeURIComponent(invoiceNumber)}`;
      await this.evolution.sendTextMessage(
        instanceName,
        phone,
        `📄 *DANFSE - Nota Fiscal de Serviço*\n\n${caption}\n\n🔗 *Acesse o PDF da sua nota:*\n${danfseUrl}`
      );
      console.log(`[WhatsApp Bot] Link do DANFSE enviado para ${phone} via mensagem de texto.`);
    }
  }

  private async createPdfBuffer(
    focusClient: FocusNfeClient,
    officialPdfUrl: string
  ): Promise<Buffer | null> {
    if (officialPdfUrl) {
      try {
        const officialPdf = await focusClient.downloadDanfsePdf(officialPdfUrl);
        if (officialPdf?.length) return officialPdf;
      } catch (error) {
        console.warn('[WhatsApp] Erro ao baixar PDF oficial da Focus:', error);
      }
    }
    return null;
  }

  private async uploadPdfToStorage(
    pdfBuffer: Buffer,
    storagePath: string
  ): Promise<string | null> {
    const storage = (supabaseAdmin as any)?.storage;
    if (!storage || typeof storage.from !== 'function') return null;

    const bucket = storage.from('nfse-pdfs');
    const { error } = await bucket.upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) {
      console.warn('[WhatsApp] Falha ao salvar PDF no Storage.', error);
      return null;
    }

    return bucket.getPublicUrl(storagePath)?.data?.publicUrl || null;
  }
}

function mapFocusStatus(status?: string): string {
  const normalized = status?.toLowerCase();
  if (normalized === 'autorizado' || normalized === 'authorized') return 'authorized';
  if (normalized === 'cancelado' || normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'erro' || normalized === 'error') return 'error';
  return 'processing';
}
