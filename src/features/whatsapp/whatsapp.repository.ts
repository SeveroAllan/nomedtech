import { supabaseAdmin } from '@/lib/supabase/server';
import type { Database, DoctorRow, BotConversationRow } from '@/types/database.types';

export class WhatsAppRepository {
  /**
   * Busca ou cria o estado de conversa do número de telefone
   */
  public async getOrCreateConversation(phone: string): Promise<BotConversationRow> {
    const cleanPhone = phone.replace(/\D/g, '');
    const { data, error } = await (supabaseAdmin.from('bot_conversations') as any)
      .select('*')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar conversa: ${error.message}`);
    }

    if (data) return data as BotConversationRow;

    const { data: created, error: insertError } = await (supabaseAdmin.from('bot_conversations') as any)
      .insert({
        phone: cleanPhone,
        current_step: 'WELCOME',
        context_data: {},
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erro ao criar conversa: ${insertError.message}`);
    }

    return created as BotConversationRow;
  }

  /**
   * Atualiza a etapa atual e dados de contexto da conversa
   */
  public async updateConversationStep(
    phone: string,
    currentStep: string,
    contextData: Record<string, any>,
    doctorId?: string
  ): Promise<BotConversationRow> {
    const cleanPhone = phone.replace(/\D/g, '');
    const updatePayload: Database['public']['Tables']['bot_conversations']['Update'] = {
      current_step: currentStep,
      context_data: contextData,
      last_interaction: new Date().toISOString(),
    };

    if (doctorId) {
      updatePayload.doctor_id = doctorId;
    }

    const { data, error } = await (supabaseAdmin.from('bot_conversations') as any)
      .update(updatePayload)
      .eq('phone', cleanPhone)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar conversa: ${error.message}`);
    }

    return data as BotConversationRow;
  }

  /**
   * Localiza o médico pelo telefone do WhatsApp
   */
  public async findDoctorByPhone(phone: string): Promise<DoctorRow | null> {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return null;

    // 1. Correspondência exata
    const { data: exact } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (exact) return exact as DoctorRow;

    // 2. Correspondência com ou sem DDI 55
    const with55 = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const without55 = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : cleanPhone;

    const { data: alt } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .in('phone', [with55, without55])
      .limit(1)
      .maybeSingle();

    if (alt) return alt as DoctorRow;

    // 3. Fallback inteligente pelos últimos 8 dígitos (ignora variação de DDD ou nono dígito)
    if (cleanPhone.length >= 8) {
      const last8 = cleanPhone.slice(-8);
      const { data: lastMatch } = await (supabaseAdmin.from('doctors') as any)
        .select('*')
        .ilike('phone', `%${last8}`)
        .limit(1)
        .maybeSingle();

      if (lastMatch) return lastMatch as DoctorRow;
    }

    return null;
  }

  /**
   * Localiza o médico por telefone ou pelo nome da instância Evolution conectada
   */
  public async findDoctorByPhoneOrInstance(phone?: string, instanceName?: string): Promise<DoctorRow | null> {
    // 1. Tenta localizar pelo telefone primeiro
    if (phone) {
      const byPhone = await this.findDoctorByPhone(phone);
      if (byPhone) return byPhone;
    }

    // 2. Busca pela instância Evolution na tabela integrations
    if (instanceName && instanceName !== 'default') {
      const { data: integration } = await (supabaseAdmin.from('integrations') as any)
        .select('doctor_id')
        .eq('evolution_instance_name', instanceName)
        .maybeSingle();

      if (integration?.doctor_id) {
        const { data: doctor } = await (supabaseAdmin.from('doctors') as any)
          .select('*')
          .eq('id', integration.doctor_id)
          .maybeSingle();

        if (doctor) return doctor as DoctorRow;
      }
    }

    // 3. Fallback: único médico cadastrado (válido apenas em ambiente de desenvolvimento)
    const { data: fallback } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return (fallback as DoctorRow) || null;
  }


  /**
   * Atualiza ou cadastra o médico extraído do XML
   */
  public async upsertDoctorFromXml(phone: string, xmlData: any): Promise<DoctorRow> {
    const cleanPhone = phone.replace(/\D/g, '');
    const existing = await this.findDoctorByPhone(cleanPhone);

    if (existing) {
      const { data, error } = await (supabaseAdmin.from('doctors') as any)
        .update({
          cpf_cnpj: xmlData.cnpj,
          inscricao_municipal: xmlData.inscricaoMunicipal,
          name: xmlData.razaoSocial,
          cnae: xmlData.cnae,
          tax_regime: xmlData.regimeTributario,
          iss_rate: xmlData.aliquotaIss,
          city: xmlData.cidade,
          state: xmlData.uf,
          onboarding_status: 'pending_certificate',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`Erro ao atualizar médico: ${error.message}`);
      return data as DoctorRow;
    }

    const { data, error } = await (supabaseAdmin.from('doctors') as any)
      .insert({
        phone: cleanPhone,
        name: xmlData.razaoSocial,
        email: `${cleanPhone}@notowhats.local`,
        cpf_cnpj: xmlData.cnpj,
        inscricao_municipal: xmlData.inscricaoMunicipal,
        cnae: xmlData.cnae,
        tax_regime: xmlData.regimeTributario,
        iss_rate: xmlData.aliquotaIss,
        city: xmlData.cidade,
        state: xmlData.uf,
        onboarding_status: 'pending_certificate',
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao cadastrar médico: ${error.message}`);
    return data as DoctorRow;
  }

  /**
   * Atualiza status do onboarding do médico
   */
  public async updateDoctorStatus(doctorId: string, status: any): Promise<DoctorRow> {
    const { data, error } = await (supabaseAdmin.from('doctors') as any)
      .update({ onboarding_status: status, updated_at: new Date().toISOString() })
      .eq('id', doctorId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar status do médico: ${error.message}`);
    return data as DoctorRow;
  }
}
