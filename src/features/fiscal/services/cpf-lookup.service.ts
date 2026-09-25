/**
 * cpf-lookup.service.ts — Serviço de Consulta Cadastral de CPF via Hub do Desenvolvedor (HubDB)
 * 
 * Arquitetura em camadas:
 *  1. Cache local no Supabase (tabela `patients`): custo R$ 0,00 se o paciente já foi atendido.
 *  2. Consulta à API Hub do Desenvolvedor (hubdodesenvolvedor.com.br).
 *  3. Persistência automática do paciente no banco para evitar consultas repetidas.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { validateCPF } from '@/shared/utils/validators';

export interface CpfLookupResult {
  cpf: string;
  nome: string;
  situacaoCadastral?: string;
  dataNascimento?: string;
  origem: 'cache_local' | 'hub_desenvolvedor';
}

/**
 * Cliente HTTP para a API de Consulta CPF do Hub do Desenvolvedor (hubdodesenvolvedor.com.br).
 */
class HubDesenvolvedorClient {
  private apiUrl: string;
  private apiToken: string | null;

  constructor() {
    this.apiUrl =
      process.env.HUB_DESENVOLVEDOR_URL ||
      process.env.HUBDB_URL ||
      'https://ws.hubdodesenvolvedor.com.br/v2/cpf/';
    this.apiToken =
      process.env.HUB_DESENVOLVEDOR_TOKEN ||
      process.env.HUBDB_TOKEN ||
      process.env.CPF_API_TOKEN ||
      null;
  }

  public async consultarCpf(cpfLimpo: string): Promise<{ nome: string; situacao?: string; nascimento?: string } | null> {
    const token = this.apiToken?.trim();
    if (!token) {
      console.warn('[HubDesenvolvedorClient] Token não configurado (adicione HUB_DESENVOLVEDOR_TOKEN no .env.local).');
      return null;
    }

    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('cpf', cpfLimpo);
      url.searchParams.set('token', token);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[HubDesenvolvedorClient] Erro HTTP na consulta do CPF ${cpfLimpo}: status ${response.status}`);
        return null;
      }

      const payload = await response.json();

      // Mapeia formatos do Hub do Desenvolvedor (result.nome_da_pf)
      const data = payload?.result || payload?.dados || payload?.data || payload;
      const nome = data?.nome_da_pf || data?.nome || data?.nome_completo || data?.Nome || payload?.nome;
      const situacao = data?.situacao_cadastral || data?.situacao || data?.status;
      const nascimento = data?.data_nascimento || data?.nascimento;

      if (!nome) {
        console.warn(`[HubDesenvolvedorClient] Resposta sem nome para o CPF ${cpfLimpo}:`, payload);
        return null;
      }

      return {
        nome: String(nome).trim().toUpperCase(),
        situacao: typeof situacao === 'string' ? situacao : undefined,
        nascimento: typeof nascimento === 'string' ? nascimento : undefined,
      };
    } catch (err: any) {
      console.error(`[HubDesenvolvedorClient] Falha na requisição da API de CPF:`, err.message);
      return null;
    }
  }
}

/**
 * Serviço de alto nível que orquestra cache local e consulta externa.
 */
export class CpfLookupService {
  private hubClient: HubDesenvolvedorClient;

  constructor() {
    this.hubClient = new HubDesenvolvedorClient();
  }

  /**
   * Consulta o nome do paciente a partir do CPF com auto-cache inteligente.
   */
  public async consultar(doctorId: string, cpfInput: string, phoneFallback?: string): Promise<CpfLookupResult | null> {
    const cleanCpf = cpfInput.replace(/\D/g, '');
    if (!validateCPF(cleanCpf)) {
      return null;
    }

    // 1. Camada 1: Cache Local no Banco de Dados (Custo zero)
    const cached = await this.buscarCacheLocal(doctorId, cleanCpf);
    if (cached) {
      return {
        cpf: cleanCpf,
        nome: cached.name.toUpperCase(),
        origem: 'cache_local',
      };
    }

    // 2. Camada 2: Consulta Oficial Hub do Desenvolvedor
    const resultadoHub = await this.hubClient.consultarCpf(cleanCpf);
    if (resultadoHub?.nome) {
      await this.salvarOuAtualizarPaciente(doctorId, cleanCpf, resultadoHub.nome, phoneFallback);

      return {
        cpf: cleanCpf,
        nome: resultadoHub.nome,
        situacaoCadastral: resultadoHub.situacao,
        dataNascimento: resultadoHub.nascimento,
        origem: 'hub_desenvolvedor',
      };
    }

    return null;
  }

  private async buscarCacheLocal(doctorId: string, cleanCpf: string) {
    let query = (supabaseAdmin.from('patients') as any)
      .select('name, cpf')
      .eq('cpf', cleanCpf);

    if (doctorId) {
      query = query.eq('doctor_id', doctorId);
    }

    const { data } = await query.maybeSingle();
    const isPlaceholder = data?.name && /^Paciente\s+\d+$/i.test(data.name);

    if (data?.name && !isPlaceholder) {
      return data;
    }

    return null;
  }

  private async salvarOuAtualizarPaciente(
    doctorId: string,
    cleanCpf: string,
    nome: string,
    phoneFallback?: string
  ): Promise<void> {
    try {
      const cleanPhone = (phoneFallback || '').replace(/\D/g, '') || `5500000000000`;

      // Verifica se já existe registro provisório no banco
      const { data: existing } = await (supabaseAdmin.from('patients') as any)
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('cpf', cleanCpf)
        .maybeSingle();

      if (existing?.id) {
        await (supabaseAdmin.from('patients') as any)
          .update({ name: nome, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await (supabaseAdmin.from('patients') as any).insert({
          doctor_id: doctorId,
          cpf: cleanCpf,
          name: nome,
          phone: cleanPhone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('[CpfLookupService] Falha ao gravar paciente em cache local:', err);
    }
  }
}

export const cpfLookupService = new CpfLookupService();
