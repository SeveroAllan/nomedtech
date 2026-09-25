import { supabaseAdmin } from '@/lib/supabase/server';

export const MONTHLY_INVOICES_LIMIT = 200;

export interface DoctorSubscriptionInfo {
  doctorId: string;
  isPaying: boolean;
  status: 'free' | 'trial' | 'active' | 'past_due' | 'cancelled';
  planTier: 'free' | 'pro' | 'clinic';
  environment: 'homologacao' | 'producao';
  canSavePatients: boolean;
  canSaveAppointments: boolean;
  canIssueRealInvoices: boolean;
  hasUsedFreeInvoice: boolean;
  canIssueInvoice: boolean;
  invoicesCount: number;
  freeInvoicesUsed: number;
  freeInvoicesLimit: number;
  monthlyInvoicesLimit: number;
  monthlyInvoicesUsed: number;
  currentPeriodEnd?: string | null;
  paymentGateway?: string;
  gatewaySubscriptionId?: string;
  gatewayCustomerId?: string;
  reason?: string;
}

export interface SetStripeSubscriptionParams {
  doctorId: string;
  status: 'active' | 'past_due' | 'cancelled';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}

/**
 * Serviço central de controle de planos e assinaturas do NotoWhats.
 * Suporta integração com a Stripe (Plano Pro com 200 notas emitidas/mês).
 */
export class SubscriptionService {
  /**
   * Consulta a assinatura do médico na tabela public.subscriptions do Supabase
   */
  public async getDoctorSubscription(doctorId: string): Promise<DoctorSubscriptionInfo> {
    if (!doctorId) {
      return this.buildDefaultFreeInfo('', 'ID do médico não fornecido.');
    }

    try {
      const { data: subRow } = await (supabaseAdmin.from('subscriptions') as any)
        .select('*')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      const { data: doc } = await (supabaseAdmin.from('doctors') as any)
        .select('id, name, onboarding_status, email')
        .eq('id', doctorId)
        .maybeSingle();

      const { data: integ } = await (supabaseAdmin.from('integrations') as any)
        .select('focus_nfe_environment, pluggy_validated, homologation_invoice_ref')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      const invoicesCount = await this.countTotalInvoices(doctorId, integ?.homologation_invoice_ref);
      const monthlyInvoicesUsed = await this.countCurrentMonthInvoices(doctorId);

      const isPaying = subRow ? Boolean(subRow.is_paying) : Boolean(integ?.focus_nfe_environment === 'producao' || doc?.onboarding_status === 'active');
      const status = (subRow?.status as any) || (isPaying ? 'active' : 'free');
      const planTier = (subRow?.plan_tier as any) || (isPaying ? 'pro' : 'free');
      const currentPeriodEnd = subRow?.current_period_end || null;
      const paymentGateway = subRow?.payment_gateway || (isPaying ? 'stripe' : undefined);
      const gatewaySubscriptionId = subRow?.gateway_subscription_id || undefined;
      const gatewayCustomerId = subRow?.gateway_customer_id || undefined;

      if (!subRow) {
        await this.initializeSubscriptionRecord(doctorId, isPaying, status, planTier);
      }

      const environment: 'homologacao' | 'producao' = isPaying ? 'producao' : 'homologacao';
      const monthlyInvoicesLimit = MONTHLY_INVOICES_LIMIT;

      let canIssueInvoice = true;
      let reason = '';

      if (isPaying) {
        if (monthlyInvoicesUsed >= monthlyInvoicesLimit) {
          canIssueInvoice = false;
          reason = `Limite mensal de ${monthlyInvoicesLimit} notas fiscais atingido para sua assinatura. Sua cota será renovada no próximo ciclo.`;
        } else {
          canIssueInvoice = true;
          reason = `Médico assinante ativo — ${monthlyInvoicesUsed} de ${monthlyInvoicesLimit} notas emitidas este mês.`;
        }
      } else {
        canIssueInvoice = true;
        reason = 'Em modo sandbox não é emitido notas reais. Comece emitir notas válidas.';
      }

      return {
        doctorId,
        isPaying,
        status,
        planTier,
        environment,
        canSavePatients: isPaying,
        canSaveAppointments: isPaying,
        canIssueRealInvoices: isPaying,
        hasUsedFreeInvoice: false,
        canIssueInvoice,
        invoicesCount,
        freeInvoicesUsed: invoicesCount,
        freeInvoicesLimit: 999999,
        monthlyInvoicesLimit,
        monthlyInvoicesUsed,
        currentPeriodEnd,
        paymentGateway,
        gatewaySubscriptionId,
        gatewayCustomerId,
        reason,
      };
    } catch (err: any) {
      console.warn('[SubscriptionService] Erro ao consultar assinatura:', err?.message);
      return this.buildDefaultFreeInfo(doctorId, 'Em modo sandbox não é emitido notas reais. Comece emitir notas válidas.');
    }
  }

  /**
   * Helper booleano direto para checagens rápidas de assinante
   */
  public async isSubscriber(doctorId: string): Promise<boolean> {
    const info = await this.getDoctorSubscription(doctorId);
    return info.isPaying;
  }

  /**
   * Helper para verificar se o médico pode emitir uma nota fiscal
   */
  public async canDoctorIssueInvoice(doctorId: string): Promise<{
    allowed: boolean;
    isPaying: boolean;
    environment: 'homologacao' | 'producao';
    isFirstAhaInvoice: boolean;
    monthlyInvoicesUsed: number;
    monthlyInvoicesLimit: number;
    reason: string;
  }> {
    const sub = await this.getDoctorSubscription(doctorId);
    return {
      allowed: sub.canIssueInvoice,
      isPaying: sub.isPaying,
      environment: sub.environment,
      isFirstAhaInvoice: !sub.isPaying && sub.invoicesCount === 0,
      monthlyInvoicesUsed: sub.monthlyInvoicesUsed,
      monthlyInvoicesLimit: sub.monthlyInvoicesLimit,
      reason: sub.reason || '',
    };
  }

  /**
   * Registra o uso da nota gratuita em sandbox
   */
  public async recordFreeInvoiceUsed(doctorId: string): Promise<void> {
    try {
      const { data: sub } = await (supabaseAdmin.from('subscriptions') as any)
        .select('free_invoices_used')
        .eq('doctor_id', doctorId)
        .maybeSingle();

      const currentUsed = sub?.free_invoices_used ?? 0;

      await (supabaseAdmin.from('subscriptions') as any)
        .update({
          free_invoices_used: currentUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('doctor_id', doctorId);
    } catch (err) {
      console.warn('[SubscriptionService] Falha ao registrar uso de nota gratuita:', err);
    }
  }

  /**
   * Atualiza o status de assinante vindo da Stripe (Webhook ou Verificação de Sessão)
   */
  public async setStripeSubscription(params: SetStripeSubscriptionParams): Promise<DoctorSubscriptionInfo> {
    const isSubscriber = params.status === 'active';
    const environment = isSubscriber ? 'producao' : 'homologacao';
    const onboardingStatus = isSubscriber ? 'active' : 'homologation_ready';
    const planTier = isSubscriber ? 'pro' : 'free';

    await (supabaseAdmin.from('subscriptions') as any).upsert({
      doctor_id: params.doctorId,
      status: params.status,
      plan_tier: planTier,
      is_paying: isSubscriber,
      payment_gateway: 'stripe',
      gateway_customer_id: params.stripeCustomerId,
      gateway_subscription_id: params.stripeSubscriptionId,
      current_period_start: params.currentPeriodStart || new Date().toISOString(),
      current_period_end: params.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'doctor_id' });

    await (supabaseAdmin.from('integrations') as any)
      .update({
        focus_nfe_environment: environment,
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', params.doctorId);

    await (supabaseAdmin.from('doctors') as any)
      .update({
        onboarding_status: onboardingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.doctorId);

    console.log(`[SubscriptionService] 💳 Assinatura Stripe atualizada para médico ${params.doctorId}: status=${params.status}`);
    return this.getDoctorSubscription(params.doctorId);
  }

  /**
   * Atualiza o status de assinante do médico na tabela public.subscriptions do Supabase
   */
  public async setDoctorSubscription(
    doctorId: string,
    isSubscriber: boolean
  ): Promise<DoctorSubscriptionInfo> {
    const environment = isSubscriber ? 'producao' : 'homologacao';
    const onboarding_status = isSubscriber ? 'active' : 'homologation_ready';
    const status = isSubscriber ? 'active' : 'free';
    const plan_tier = isSubscriber ? 'pro' : 'free';
    const currentPeriodStart = isSubscriber ? new Date().toISOString() : null;
    const currentPeriodEnd = isSubscriber
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await (supabaseAdmin.from('subscriptions') as any).upsert({
      doctor_id: doctorId,
      status,
      plan_tier,
      is_paying: isSubscriber,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'doctor_id' });

    await (supabaseAdmin.from('integrations') as any)
      .update({
        focus_nfe_environment: environment,
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', doctorId);

    await (supabaseAdmin.from('doctors') as any)
      .update({
        onboarding_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doctorId);

    console.log(
      `[SubscriptionService] 🔄 Médico ${doctorId} atualizado no Supabase para ${
        isSubscriber ? 'ASSINANTE (PRODUÇÃO)' : 'NÃO-ASSINANTE (SANDBOX)'
      }`
    );

    return this.getDoctorSubscription(doctorId);
  }

  // --- MÉTODOS PRIVADOS AUXILIARES ---

  private async countTotalInvoices(doctorId: string, homologationRef?: string): Promise<number> {
    try {
      const { count } = await (supabaseAdmin.from('invoices') as any)
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId);
      const total = typeof count === 'number' ? count : 0;
      return total === 0 && homologationRef ? 1 : total;
    } catch {
      return 0;
    }
  }

  private async countCurrentMonthInvoices(doctorId: string): Promise<number> {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { count } = await (supabaseAdmin.from('invoices') as any)
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('competence_month', currentMonth);
      return typeof count === 'number' ? count : 0;
    } catch {
      return 0;
    }
  }

  private async initializeSubscriptionRecord(
    doctorId: string,
    isPaying: boolean,
    status: string,
    planTier: string
  ): Promise<void> {
    try {
      await (supabaseAdmin.from('subscriptions') as any).upsert({
        doctor_id: doctorId,
        status,
        plan_tier: planTier,
        is_paying: isPaying,
        free_invoices_limit: 1,
        free_invoices_used: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'doctor_id' });
    } catch (initErr) {
      console.warn('[SubscriptionService] Aviso ao inicializar registro em subscriptions:', initErr);
    }
  }

  private buildDefaultFreeInfo(doctorId: string, reason: string): DoctorSubscriptionInfo {
    return {
      doctorId,
      isPaying: false,
      status: 'free',
      planTier: 'free',
      environment: 'homologacao',
      canSavePatients: false,
      canSaveAppointments: false,
      canIssueRealInvoices: false,
      hasUsedFreeInvoice: false,
      canIssueInvoice: Boolean(doctorId),
      invoicesCount: 0,
      freeInvoicesUsed: 0,
      freeInvoicesLimit: 999999,
      monthlyInvoicesLimit: MONTHLY_INVOICES_LIMIT,
      monthlyInvoicesUsed: 0,
      reason,
    };
  }
}

export const subscriptionService = new SubscriptionService();
