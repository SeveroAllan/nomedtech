import { supabaseAdmin } from '@/lib/supabase/server';
import type { Database, IntegrationRow } from '@/types/database.types';

export class IntegrationsRepository {
  public async getByDoctorId(doctorId: string): Promise<IntegrationRow | null> {
    const { data, error } = await (supabaseAdmin.from('integrations') as any)
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error) throw new Error(`Erro ao buscar integrações: ${error.message}`);
    return data as IntegrationRow | null;
  }

  public async upsertIntegrations(doctorId: string, updates: Partial<Database['public']['Tables']['integrations']['Insert']>) {
    const existing = await this.getByDoctorId(doctorId);

    if (existing) {
      const updatePayload: Database['public']['Tables']['integrations']['Update'] = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (supabaseAdmin.from('integrations') as any)
        .update(updatePayload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`Erro ao atualizar integrações: ${error.message}`);
      return data;
    }

    const { data, error } = await (supabaseAdmin.from('integrations') as any)
      .insert({
        doctor_id: doctorId,
        ...updates,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao salvar integrações: ${error.message}`);
    return data;
  }
}
