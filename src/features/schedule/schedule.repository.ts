import { supabaseAdmin } from '@/lib/supabase/server';
import type { Database, AppointmentRow } from '@/types/database.types';

export class ScheduleRepository {
  public async createSlot(appointment: Database['public']['Tables']['appointments']['Insert']): Promise<AppointmentRow> {
    const { data, error } = await (supabaseAdmin.from('appointments') as any)
      .insert(appointment)
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar slot de consulta: ${error.message}`);
    return data as AppointmentRow;
  }

  public async getAvailableSlots(doctorId: string): Promise<AppointmentRow[]> {
    const { data, error } = await (supabaseAdmin.from('appointments') as any)
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('status', 'available')
      .gte('slot_time', new Date().toISOString())
      .order('slot_time', { ascending: true })
      .limit(5);

    if (error) throw new Error(`Erro ao buscar slots disponíveis: ${error.message}`);
    return (data || []) as AppointmentRow[];
  }

  public async reserveSlot(appointmentId: string, patientId?: string, notes?: string): Promise<AppointmentRow> {
    const { data, error } = await (supabaseAdmin.from('appointments') as any)
      .update({
        status: 'reserved',
        patient_id: patientId || null,
        notes: notes || 'Agendado via WhatsApp',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao reservar horário: ${error.message}`);
    return data as AppointmentRow;
  }

  public async listAppointmentsByDoctor(doctorId: string): Promise<any[]> {
    const { data, error } = await (supabaseAdmin.from('appointments') as any)
      .select('*, patients(*)')
      .eq('doctor_id', doctorId)
      .order('slot_time', { ascending: true });

    if (error) throw new Error(`Erro ao listar agendamentos: ${error.message}`);
    return data || [];
  }

  /**
   * Lista consultas confirmadas que ainda NÃO foram faturadas (status = 'confirmed')
   * Consultas já faturadas ficam com status = 'completed'.
   */
  public async getUnbilledAppointments(doctorId: string, patientId?: string): Promise<any[]> {
    let query = (supabaseAdmin.from('appointments') as any)
      .select('*, patients(*)')
      .eq('doctor_id', doctorId)
      .eq('status', 'confirmed')
      .order('slot_time', { ascending: true });

    if (patientId) {
      query = query.eq('patient_id', patientId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao buscar consultas não faturadas: ${error.message}`);
    return data || [];
  }

  /**
   * Marca a consulta como faturada/concluída (status = 'completed')
   * Vincula a referência da nota fiscal para impedir duplicidade de emissão.
   */
  public async markAppointmentAsBilled(appointmentId: string, invoiceReferenceId: string): Promise<AppointmentRow> {
    const { data: current } = await (supabaseAdmin.from('appointments') as any)
      .select('notes')
      .eq('id', appointmentId)
      .maybeSingle();

    const previousNotes = current?.notes || '';
    const updatedNotes = `${previousNotes}\n[NFS-e Faturada: ${invoiceReferenceId}]`.trim();

    const { data, error } = await (supabaseAdmin.from('appointments') as any)
      .update({
        status: 'completed',
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao marcar consulta como faturada: ${error.message}`);
    return data as AppointmentRow;
  }

  /**
   * Reverte o status da consulta para 'confirmed' caso a nota fiscal seja cancelada.
   * Permite que a consulta volte a ficar disponível para nova emissão.
   */
  public async revertCancelledInvoiceAppointment(invoiceReferenceId: string): Promise<void> {
    const { data: appt } = await (supabaseAdmin.from('appointments') as any)
      .select('id, notes')
      .ilike('notes', `%${invoiceReferenceId}%`)
      .maybeSingle();

    if (appt) {
      const cleanNotes = (appt.notes || '').replace(`[NFS-e Faturada: ${invoiceReferenceId}]`, '[NFS-e Cancelada]').trim();
      await (supabaseAdmin.from('appointments') as any)
        .update({
          status: 'confirmed',
          notes: cleanNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appt.id);
    }
  }
}
