import { google } from 'googleapis';
import { googleClientService } from '@/lib/integrations/google-client';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface CalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
}

export interface ExtractedConsultation {
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  patientCpf?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  dateTimeIso: string;
  notes?: string;
  googleEventId: string;
}

export class GoogleCalendarService {
  /**
   * Lista eventos da agenda do médico
   */
  public async listEvents(params: {
    doctorId: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    calendarId?: string;
  }): Promise<CalendarEventItem[]> {
    const { doctorId, timeMin, timeMax, maxResults = 50, calendarId = 'primary' } = params;

    const { oauth2Client } = await googleClientService.getAuthenticatedClient(doctorId);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin || defaultMin,
      timeMax: timeMax || defaultMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = response.data.items || [];
    return items.map((e: any) => ({
      id: e.id,
      summary: e.summary || 'Consulta Médica',
      description: e.description || '',
      start: e.start || {},
      end: e.end || {},
      attendees: e.attendees || [],
    }));
  }

  /**
   * Extrai dados de paciente e horário a partir de um evento de agenda
   */
  public parseEvent(event: CalendarEventItem): ExtractedConsultation | null {
    const rawDateTime = event.start.dateTime || (event.start.date ? `${event.start.date}T09:00:00` : null);
    if (!rawDateTime) return null;

    let date = '';
    let time = '09:00:00';
    if (rawDateTime.includes('T')) {
      const parts = rawDateTime.split('T');
      date = parts[0];
      time = parts[1].replace(/Z|[-+].*$/, '').slice(0, 8);
      if (time.length === 5) time = `${time}:00`;
    } else {
      date = rawDateTime;
    }

    const startDate = new Date(rawDateTime);
    const dateTimeIso = !isNaN(startDate.getTime()) ? startDate.toISOString() : `${date}T${time}Z`;

    // Limpa o nome do paciente removendo prefixos comuns de agenda médica
    let cleanName = (event.summary || '')
      .replace(/^(consulta|retorno|atendimento|sessão|agendamento|paciente)\s*[:-]?\s*/i, '')
      .replace(/^dr\w*\.?\s+[\w\s]+[-–—]\s*/i, '')
      .trim();

    if (!cleanName || cleanName.length < 3) {
      cleanName = event.attendees?.[0]?.displayName || 'Paciente da Agenda';
    }

    // Busca CPF na descrição (formato 000.000.000-00 ou 11 dígitos)
    const desc = event.description || '';
    const cpfMatch = desc.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    const patientCpf = cpfMatch ? cpfMatch[0].replace(/\D/g, '') : undefined;

    // Busca telefone na descrição
    const phoneMatch = desc.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/);
    const patientPhone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : undefined;

    const patientEmail = event.attendees?.find((a) => a.email && !a.email.includes('resource.calendar'))?.email;

    return {
      patientName: cleanName,
      patientEmail,
      patientPhone,
      patientCpf,
      date,
      time,
      dateTimeIso: startDate.toISOString(),
      notes: event.description || `Importado do Google Agenda (${event.summary})`,
      googleEventId: event.id,
    };
  }

  /**
   * Importa consultas da Google Agenda e persiste no banco de dados
   */
  public async importEvents(params: {
    doctorId: string;
    timeMin?: string;
    timeMax?: string;
  }): Promise<{
    importedCount: number;
    skippedCount: number;
    consultations: any[];
  }> {
    const { doctorId, timeMin, timeMax } = params;

    const rawEvents = await this.listEvents({ doctorId, timeMin, timeMax });
    let importedCount = 0;
    let skippedCount = 0;
    const consultations: any[] = [];

    for (const ev of rawEvents) {
      const parsed = this.parseEvent(ev);
      if (!parsed) {
        skippedCount++;
        continue;
      }

      try {
        // 1. Localiza ou cria o paciente
        let patientId: string | null = null;

        if (parsed.patientCpf) {
          const { data: existingPatient } = await (supabaseAdmin.from('patients') as any)
            .select('id')
            .eq('doctor_id', doctorId)
            .eq('cpf', parsed.patientCpf)
            .maybeSingle();

          if (existingPatient) {
            patientId = existingPatient.id;
          }
        }

        if (!patientId) {
          const defaultCpf = parsed.patientCpf || `agenda-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 900 + 100)}`;
          const { data: newPatient, error: pError } = await (supabaseAdmin.from('patients') as any)
            .insert({
              doctor_id: doctorId,
              name: parsed.patientName,
              cpf: defaultCpf,
              email: parsed.patientEmail || null,
              phone: parsed.patientPhone || '',
            })
            .select()
            .single();

          if (!pError && newPatient) {
            patientId = newPatient.id;
          }
        }

        if (!patientId) {
          skippedCount++;
          continue;
        }

        // 2. Insere na tabela consultas (com trava de duplicidade por médico + data + hora)
        const { data: consulta, error: cError } = await (supabaseAdmin.from('consultas') as any)
          .insert({
            doctor_id: doctorId,
            patient_id: patientId,
            data: parsed.date,
            hora: parsed.time,
            status: 'confirmed',
            notes: parsed.notes,
          })
          .select()
          .single();

        if (cError) {
          // Erro de duplicidade no horário (uq_medico_data_hora)
          skippedCount++;
        } else {
          importedCount++;
          consultations.push({
            ...consulta,
            patientName: parsed.patientName,
          });

          // Também cria slot na tabela appointments para manter sincronizado com o fluxo legado
          try {
            await (supabaseAdmin.from('appointments') as any).insert({
              doctor_id: doctorId,
              patient_id: patientId,
              slot_time: parsed.dateTimeIso,
              status: 'reserved',
              notes: parsed.notes,
            });
          } catch {}
        }
      } catch (err) {
        console.warn('[GoogleCalendar] Erro ao processar evento:', err);
        skippedCount++;
      }
    }

    // Atualiza data de última sincronização
    await (supabaseAdmin.from('google_integrations') as any)
      .update({ last_calendar_sync: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('doctor_id', doctorId);

    return {
      importedCount,
      skippedCount,
      consultations,
    };
  }
}

export const googleCalendarService = new GoogleCalendarService();
