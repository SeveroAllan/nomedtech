import { EvolutionClient, type EvolutionChat } from '@/lib/integrations/evolution-client';
import { GeminiClient } from '@/lib/integrations/gemini-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { validateCPF } from '@/shared/utils/validators';
import { PatientsRepository } from './patients.repository';

const MAX_CHATS = 200;
const MAX_MESSAGES_PER_CHAT = 100;

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function getChatJid(chat: EvolutionChat): string {
  return chat.remoteJid || chat.id || '';
}

function getMessageText(message: any): string {
  const content = message?.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.documentMessage?.caption ||
    content.templateMessage?.hydratedTemplate?.hydratedContentText ||
    content.templateMessage?.hydratedTemplate?.imageMessage?.caption ||
    ''
  ).trim();
}

function getContactPhone(jid: string): string {
  return normalizePhone(jid.split('@')[0] || '');
}

function getMessageJid(message: any): string {
  const key = message?.key || {};
  if (key.remoteJidAlt?.endsWith('@s.whatsapp.net')) return key.remoteJidAlt;
  return key.remoteJid || '';
}

function isIndividualChat(jid: string): boolean {
  return Boolean(jid) && !jid.includes('@g.us') && !jid.includes('status@broadcast');
}

export class PatientHistoryImportService {
  private readonly evolution = new EvolutionClient();
  private readonly gemini = new GeminiClient();
  private readonly patients = new PatientsRepository();

  public async importForConnection(doctorId: string, instanceName: string): Promise<void> {
    const { data: consent, error: consentError } = await supabaseAdmin
      .from('whatsapp_history_consents')
      .select('id,status')
      .eq('doctor_id', doctorId)
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (consentError) throw new Error(`Erro ao consultar consentimento: ${consentError.message}`);
    if (!consent || consent.status !== 'pending') return;

    const { data: lockedConsent, error: lockError } = await supabaseAdmin
      .from('whatsapp_history_consents')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', consent.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (lockError) throw new Error(`Erro ao iniciar importação histórica: ${lockError.message}`);
    if (!lockedConsent) return;

    try {
      const chats = (await this.evolution.findChats(instanceName))
        .filter((chat) => isIndividualChat(getChatJid(chat)))
        .slice(0, MAX_CHATS);

      for (const chat of chats) {
        await this.importChat(doctorId, instanceName, chat);
      }

      await supabaseAdmin
        .from('whatsapp_history_consents')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', consent.id);
    } catch (error) {
      await supabaseAdmin
        .from('whatsapp_history_consents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', consent.id);
      throw error;
    }
  }

  private async importChat(doctorId: string, instanceName: string, chat: EvolutionChat): Promise<void> {
    const jid = getChatJid(chat);
    const messages = (await this.evolution.findMessages(instanceName, jid)).slice(-MAX_MESSAGES_PER_CHAT);
    const messageJid = messages.map(getMessageJid).find((value) => value.endsWith('@s.whatsapp.net'));
    const phone = getContactPhone(messageJid || chat.remoteJidAlt || jid);
    if (!phone) return;

    const text = messages.map(getMessageText).filter(Boolean).join('\n');
    if (!text) return;

    const extracted = await this.gemini.extractPatientContactData(text);
    const cpf = (extracted.cpf || '').replace(/\D/g, '');
    if (!validateCPF(cpf)) return;

    await this.patients.upsertPatientFromSync({
      doctor_id: doctorId,
      name: extracted.name || `Paciente ${phone.slice(-4)}`,
      cpf,
      phone,
      email: extracted.email,
    });
  }
}
