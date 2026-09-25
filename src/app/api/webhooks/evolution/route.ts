import { NextRequest, NextResponse } from 'next/server';
import { BotStateMachineService } from '@/features/whatsapp/services/bot-state-machine.service';
import { supabaseAdmin } from '@/lib/supabase/server';
import { PatientHistoryImportService } from '@/features/patients/patient-history-import.service';

export const dynamic = 'force-dynamic';

const botService = new BotStateMachineService();
const patientHistoryImport = new PatientHistoryImportService();

// Deduplicação: descarta re-transmissões da Evolution API para o mesmo messageId
// em até 60 segundos (evita emitir nota duplicada por webhook duplicado).
const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60_000;

function isDuplicate(instanceName: string, messageId: string): boolean {
  const now = Date.now();
  const deduplicationKey = `${instanceName}:${messageId}`;
  // Remove entradas expiradas periodicamente
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) processedMessages.delete(id);
  }
  if (processedMessages.has(deduplicationKey)) return true;
  processedMessages.set(deduplicationKey, now);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const rawEvent = payload.event || payload.type || '';
    const event = String(rawEvent).toLowerCase();

    // Eventos de conexão não acionam automações.
    if (event === 'connection.update' || event === 'connection_update') {
      const state = payload.data?.state || payload.data?.connection;
      const instanceName = payload.instance || 'default';
      if (state === 'open' && instanceName !== 'default') {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from('whatsapp_history_consents')
          .update({ connected_at: now, updated_at: now })
          .eq('instance_name', instanceName)
          .eq('status', 'pending');
        if (error) {
          console.error('[Evolution Webhook] Erro ao registrar conexão:', error.message);
        }
        const { data: consent } = await supabaseAdmin
          .from('whatsapp_history_consents')
          .select('doctor_id,status')
          .eq('instance_name', instanceName)
          .eq('status', 'pending')
          .maybeSingle();
        if (consent?.doctor_id) {
          void patientHistoryImport.importForConnection(consent.doctor_id, instanceName)
            .catch((error) => console.error('[Evolution Webhook] Importação histórica falhou:', error));
        }
      }
      return NextResponse.json({ received: true, event: 'connection.update', state });
    }

    // Validação básica do evento Evolution API
    if (event !== 'messages.upsert' && event !== 'messages_upsert') {
      return NextResponse.json({ received: true, ignoredEvent: rawEvent });
    }

    const data = payload.data || {};
    const key = data.key || {};
    const remoteJid =
      (key.remoteJid?.endsWith('@lid') && key.remoteJidAlt?.includes('@s.whatsapp.net')
        ? key.remoteJidAlt
        : null) ||
      (key.participant?.includes('@s.whatsapp.net') && key.remoteJid?.endsWith('@lid')
        ? key.participant
        : null) ||
      key.remoteJid ||
      '';
    const instanceName = payload.instance || 'default';
    const messageId = key.id || '';

    // A instância de onboarding é usada apenas para autenticação por OTP.
    // Ela não deve disparar automações nem competir com a instância do médico.
    if (
      process.env.EVOLUTION_ONBOARDING_INSTANCE_NAME &&
      instanceName === process.env.EVOLUTION_ONBOARDING_INSTANCE_NAME
    ) {
      return NextResponse.json({ received: true, ignored: 'onboarding_instance' });
    }

    // Ignora mensagens de grupos ou transmissões de status
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
      return NextResponse.json({ received: true, ignored: 'group_or_broadcast' });
    }

    // Somente mensagens de texto acionam as respostas rápidas configuradas.
    let message = data.message || {};
    if (message.ephemeralMessage?.message) {
      message = message.ephemeralMessage.message;
    }
    if (message.viewOnceMessage?.message) {
      message = message.viewOnceMessage.message;
    }
    if (message.viewOnceMessageV2?.message) {
      message = message.viewOnceMessageV2.message;
    }
    if (message.documentWithCaptionMessage?.message) {
      message = message.documentWithCaptionMessage.message;
    }

    const text =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.buttonsResponseMessage?.selectedDisplayText ||
      message.listResponseMessage?.singleSelectReply?.selectedRowId ||
      message.listResponseMessage?.singleSelectReply?.selectedRowName ||
      message.interactiveResponseMessage?.body?.text ||
      message.interactiveResponseMessage?.title ||
      message.templateButtonReplyMessage?.selectedDisplayText ||
      message.templateButtonReplyMessage?.selectedId ||
      '';

    const trimmedText = (text || '').trim();

    if (!trimmedText) return NextResponse.json({ received: true, ignored: 'non_text_message' });

    console.log(`[Evolution Webhook] ${instanceName} | ${remoteJid} | "${trimmedText}" | fromMe:${key.fromMe} | id:${messageId}`);

    // Rejeita mensagens duplicadas (re-transmissões do webhook Evolution)
    if (messageId && isDuplicate(instanceName, messageId)) {
      console.log(`[Evolution Webhook] Mensagem duplicada ignorada: ${messageId}`);
      return NextResponse.json({ received: true, deduplicated: true });
    }

    const lid =
      key.remoteJid?.endsWith('@lid') ? key.remoteJid : (key.participant?.endsWith('@lid') ? key.participant : undefined);

    // Processa na máquina de estados
    await botService.processMessage({
      from: remoteJid,
      text: trimmedText,
      instanceName,
      fromMe: Boolean(key.fromMe),
      lid,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro no webhook Evolution API:', err);
    if (/\b(408|425|429|500|502|503|504)\b|timeout|temporar|indisponível|quota|limite/i.test(err?.message || '')) {
      return NextResponse.json(
        { received: true, processed: false, retryable: true, error: err?.message || 'Falha temporária.' },
        { status: 202 }
      );
    }
    return NextResponse.json(
      { error: err?.message || 'Erro interno no processamento do webhook' },
      { status: 500 }
    );
  }
}
