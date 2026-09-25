import { supabaseAdmin } from '@/lib/supabase/server';
import type { Database, PatientRow } from '@/types/database.types';
import { validateCPF } from '@/shared/utils/validators';

export function getBrazilianPhoneVariations(phone: string): {
  clean: string;
  ddd?: string;
  subscriber8?: string;
  subscriber9?: string;
  allVariants: string[];
} {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return { clean: '', allVariants: [] };

  let national = clean;
  if (clean.startsWith('55') && clean.length >= 12) {
    national = clean.slice(2);
  }

  let ddd: string | undefined;
  let subscriber8: string | undefined;
  let subscriber9: string | undefined;

  if (national.length === 10) {
    // DDD (2) + 8 dígitos: ex 51 81936133
    ddd = national.slice(0, 2);
    subscriber8 = national.slice(2);
    subscriber9 = `9${subscriber8}`;
  } else if (national.length === 11) {
    // DDD (2) + 9 dígitos: ex 51 981936133
    ddd = national.slice(0, 2);
    const rest = national.slice(2);
    if (rest.startsWith('9')) {
      subscriber9 = rest;
      subscriber8 = rest.slice(1);
    } else {
      subscriber9 = rest;
      subscriber8 = rest;
    }
  } else if (national.length === 8) {
    subscriber8 = national;
    subscriber9 = `9${national}`;
  } else if (national.length === 9) {
    subscriber9 = national;
    if (national.startsWith('9')) {
      subscriber8 = national.slice(1);
    }
  }

  const variants = new Set<string>();
  variants.add(clean);
  variants.add(national);

  if (ddd && subscriber8) {
    variants.add(`${ddd}${subscriber8}`);
    variants.add(`55${ddd}${subscriber8}`);
    variants.add(`+55${ddd}${subscriber8}`);
    variants.add(`(${ddd}) ${subscriber8.slice(0, 4)}-${subscriber8.slice(4)}`);
    variants.add(`(${ddd}) ${subscriber8}`);
    variants.add(`${ddd} ${subscriber8.slice(0, 4)}-${subscriber8.slice(4)}`);
    variants.add(`${ddd} ${subscriber8}`);
    variants.add(`+55 (${ddd}) ${subscriber8.slice(0, 4)}-${subscriber8.slice(4)}`);
    variants.add(`+55 ${ddd} ${subscriber8.slice(0, 4)}-${subscriber8.slice(4)}`);
    variants.add(`+55 ${ddd} ${subscriber8}`);
  }

  if (ddd && subscriber9) {
    variants.add(`${ddd}${subscriber9}`);
    variants.add(`55${ddd}${subscriber9}`);
    variants.add(`+55${ddd}${subscriber9}`);
    variants.add(`(${ddd}) ${subscriber9.slice(0, 5)}-${subscriber9.slice(5)}`);
    variants.add(`(${ddd}) ${subscriber9}`);
    variants.add(`${ddd} ${subscriber9.slice(0, 5)}-${subscriber9.slice(5)}`);
    variants.add(`${ddd} ${subscriber9}`);
    variants.add(`+55 (${ddd}) ${subscriber9.slice(0, 5)}-${subscriber9.slice(5)}`);
    variants.add(`+55 ${ddd} ${subscriber9.slice(0, 5)}-${subscriber9.slice(5)}`);
    variants.add(`+55 ${ddd} ${subscriber9}`);
  }

  if (subscriber8) {
    variants.add(subscriber8);
    variants.add(`${subscriber8.slice(0, 4)}-${subscriber8.slice(4)}`);
  }
  if (subscriber9) {
    variants.add(subscriber9);
    variants.add(`${subscriber9.slice(0, 5)}-${subscriber9.slice(5)}`);
  }

  return {
    clean,
    ddd,
    subscriber8,
    subscriber9,
    allVariants: Array.from(variants),
  };
}

export class PatientsRepository {
  public async createPatient(patient: Database['public']['Tables']['patients']['Insert']): Promise<PatientRow> {
    const cleanCpf = String(patient.cpf || '').replace(/\D/g, '');
    if (!validateCPF(cleanCpf)) {
      throw new Error('CPF válido é obrigatório para cadastrar o paciente.');
    }

    const { data, error } = await (supabaseAdmin.from('patients') as any)
      .insert({ ...patient, cpf: cleanCpf })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar paciente: ${error.message}`);
    return data as PatientRow;
  }

  public async createPendingPatient(params: {
    doctor_id: string;
    name?: string;
    phone: string;
    email?: string | null;
  }): Promise<PatientRow> {
    const cleanPhone = params.phone.replace(/\D/g, '');
    if (!cleanPhone) {
      throw new Error('Telefone é obrigatório para criar o cadastro provisório do paciente.');
    }

    const { data, error } = await (supabaseAdmin.from('patients') as any)
      .insert({
        doctor_id: params.doctor_id,
        name: params.name?.trim() || `Paciente ${cleanPhone.slice(-4)}`,
        cpf: `P_${cleanPhone.slice(-17)}`,
        phone: cleanPhone,
        email: params.email || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar paciente provisório: ${error.message}`);
    return data as PatientRow;
  }

  public async findPatientByCpf(doctorId: string, cpf: string): Promise<PatientRow | null> {
    const cleanCpf = (cpf || '').replace(/\D/g, '');
    if (!cleanCpf || cleanCpf.length < 11) return null;
    let query = (supabaseAdmin.from('patients') as any)
      .select('*')
      .eq('cpf', cleanCpf);

    if (doctorId) {
      query = query.eq('doctor_id', doctorId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw new Error(`Erro ao buscar paciente por CPF: ${error.message}`);
    return (data as PatientRow) || null;
  }

  public async listPatientsByDoctor(doctorId: string): Promise<PatientRow[]> {
    const { data, error } = await (supabaseAdmin.from('patients') as any)
      .select('*')
      .eq('doctor_id', doctorId)
      .order('name', { ascending: true });

    if (error) throw new Error(`Erro ao listar pacientes: ${error.message}`);
    return (data || []) as PatientRow[];
  }

  public async findPatientByPhone(doctorId: string | undefined, phone: string): Promise<PatientRow | null> {
    const variations = getBrazilianPhoneVariations(phone);
    if (!variations.clean) return null;

    // 1. Busca direta pelas variações conhecidas (formatadas e puras)
    let directQuery = (supabaseAdmin.from('patients') as any)
      .select('*')
      .in('phone', variations.allVariants);

    if (doctorId) {
      directQuery = directQuery.eq('doctor_id', doctorId);
    }

    const { data: exactMatch } = await directQuery.limit(1).maybeSingle();
    if (exactMatch) return exactMatch as PatientRow;

    // 2. Busca por sufixo dos últimos 4 dígitos e validação em memória (tolerante a pontuações exóticas)
    const last4 = variations.subscriber8 ? variations.subscriber8.slice(-4) : variations.clean.slice(-4);
    if (last4.length === 4) {
      let candidateQuery = (supabaseAdmin.from('patients') as any)
        .select('*')
        .ilike('phone', `%${last4}`);

      if (doctorId) {
        candidateQuery = candidateQuery.eq('doctor_id', doctorId);
      }

      const { data: candidates } = await candidateQuery.limit(30);
      if (candidates && candidates.length > 0) {
        for (const cand of candidates) {
          const candClean = (cand.phone || '').replace(/\D/g, '');
          if (variations.allVariants.includes(candClean)) {
            return cand as PatientRow;
          }
          if (variations.subscriber8 && candClean.endsWith(variations.subscriber8)) {
            if (!variations.ddd || candClean.includes(variations.ddd)) {
              return cand as PatientRow;
            }
          }
          if (variations.subscriber9 && candClean.endsWith(variations.subscriber9)) {
            if (!variations.ddd || candClean.includes(variations.ddd)) {
              return cand as PatientRow;
            }
          }
        }
      }
    }

    // 3. Fallback sem filtro estrito de doctor_id caso o médico não tenha sido resolvido com exatidão
    if (doctorId) {
      const fallbackAny = await this.findPatientByPhone(undefined, phone);
      if (fallbackAny) return fallbackAny;
    }

    return null;
  }

  public async updatePatient(
    id: string,
    updates: Partial<Database['public']['Tables']['patients']['Update']>
  ): Promise<PatientRow> {
    const { data, error } = await (supabaseAdmin.from('patients') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar paciente: ${error.message}`);
    return data as PatientRow;
  }

  public async upsertPatientFromSync(params: {
    doctor_id: string;
    name: string;
    cpf?: string;
    phone: string;
    email?: string;
  }): Promise<{ patient: PatientRow; created: boolean; updated: boolean }> {
    const cleanCpf = (params.cpf || '').replace(/\D/g, '');
    const cleanPhone = (params.phone || '').replace(/\D/g, '');

    if (!validateCPF(cleanCpf)) {
      throw new Error('CPF válido é obrigatório para sincronizar o paciente.');
    }

    // 1. Tenta localizar por CPF
    let existing: PatientRow | null = null;
    if (cleanCpf && cleanCpf.length === 11) {
      existing = await this.findPatientByCpf(params.doctor_id, cleanCpf);
    }

    // 2. Se não encontrou por CPF, tenta por telefone
    if (!existing && cleanPhone) {
      existing = await this.findPatientByPhone(params.doctor_id, cleanPhone);
    }

    // 3. Se já existe, atualiza dados faltantes
    if (existing) {
      const updates: Record<string, any> = {};
      if (!existing.cpf && cleanCpf) updates.cpf = cleanCpf;
      if (!existing.email && params.email) updates.email = params.email;
      if (params.name && (!existing.name || existing.name === existing.phone)) {
        updates.name = params.name;
      }

      if (Object.keys(updates).length > 0) {
        const updated = await this.updatePatient(existing.id, updates);
        return { patient: updated, created: false, updated: true };
      }
      return { patient: existing, created: false, updated: false };
    }

    // 4. Se não existe, cria novo registro
    const created = await this.createPatient({
      doctor_id: params.doctor_id,
      name: params.name || `Paciente ${cleanPhone.slice(-4)}`,
      cpf: cleanCpf || '',
      phone: cleanPhone,
      email: params.email || null,
    });

    return { patient: created, created: true, updated: false };
  }
}
