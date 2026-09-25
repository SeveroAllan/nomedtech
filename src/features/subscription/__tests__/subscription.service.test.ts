import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionService } from '../subscription.service';
import { supabaseAdmin } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionService();
  });

  it('deve retornar não-pagante/sandbox quando doctorId estiver vazio', async () => {
    const result = await service.getDoctorSubscription('');
    expect(result.isPaying).toBe(false);
    expect(result.environment).toBe('homologacao');
    expect(result.canSavePatients).toBe(false);
    expect(result.canSaveAppointments).toBe(false);
    expect(result.canIssueRealInvoices).toBe(false);
    expect(result.canIssueInvoice).toBe(false);
  });

  it('deve permitir a 1ª nota em Sandbox (momento a-ha) para não-assinante com 0 faturas', async () => {
    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-aha-1',
          is_paying: false,
          status: 'free',
          plan_tier: 'free',
          free_invoices_limit: 1,
          free_invoices_used: 0,
        },
        error: null,
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const mockDoctorsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-aha-1', name: 'Dr. Novo', onboarding_status: 'homologation_ready' },
        error: null,
      }),
    };

    const mockIntegrationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'homologacao', pluggy_validated: false, homologation_invoice_ref: null },
        error: null,
      }),
    };

    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        count: 0,
        error: null,
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return mockDoctorsBuilder;
      if (table === 'integrations') return mockIntegrationsBuilder;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const info = await service.getDoctorSubscription('doc-aha-1');

    expect(info.doctorId).toBe('doc-aha-1');
    expect(info.isPaying).toBe(false);
    expect(info.status).toBe('free');
    expect(info.environment).toBe('homologacao');
    // Pode emitir a 1ª nota do momento a-ha:
    expect(info.hasUsedFreeInvoice).toBe(false);
    expect(info.canIssueInvoice).toBe(true);
    // Mas não grava pacientes nem consultas:
    expect(info.canSavePatients).toBe(false);
    expect(info.canSaveAppointments).toBe(false);

    const check = await service.canDoctorIssueInvoice('doc-aha-1');
    expect(check.allowed).toBe(true);
    expect(check.isFirstAhaInvoice).toBe(true);
    expect(check.environment).toBe('homologacao');
  });

  it('deve PERMITIR emissões ilimitadas em Sandbox para não-assinante poder testar com a equipe/secretária', async () => {
    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-aha-2',
          is_paying: false,
          status: 'free',
          plan_tier: 'free',
          free_invoices_limit: 999999,
          free_invoices_used: 5, // já usou 5 notas de teste
        },
        error: null,
      }),
    };

    const mockDoctorsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-aha-2', name: 'Dr. Teste', onboarding_status: 'homologation_ready' },
        error: null,
      }),
    };

    const mockIntegrationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'homologacao', pluggy_validated: true, homologation_invoice_ref: 'homolog-123' },
        error: null,
      }),
    };

    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        count: 5,
        error: null,
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return mockDoctorsBuilder;
      if (table === 'integrations') return mockIntegrationsBuilder;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const info = await service.getDoctorSubscription('doc-aha-2');

    expect(info.isPaying).toBe(false);
    expect(info.environment).toBe('homologacao');
    // Emissão ilimitada em Sandbox permitida:
    expect(info.canIssueInvoice).toBe(true);

    const check = await service.canDoctorIssueInvoice('doc-aha-2');
    expect(check.allowed).toBe(true);
    expect(check.environment).toBe('homologacao');
  });

  it('deve identificar como ASSINANTE quando tabela subscriptions indicar is_paying = true', async () => {
    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-456',
          is_paying: true,
          status: 'active',
          plan_tier: 'pro',
          free_invoices_limit: 1,
          free_invoices_used: 12,
        },
        error: null,
      }),
    };

    const mockDoctorsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-456', name: 'Dra. Silva', onboarding_status: 'active' },
        error: null,
      }),
    };

    const mockIntegrationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'producao', pluggy_validated: true },
        error: null,
      }),
    };

    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        count: 12,
        error: null,
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return mockDoctorsBuilder;
      if (table === 'integrations') return mockIntegrationsBuilder;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const info = await service.getDoctorSubscription('doc-456');

    expect(info.doctorId).toBe('doc-456');
    expect(info.isPaying).toBe(true);
    expect(info.status).toBe('active');
    expect(info.planTier).toBe('pro');
    expect(info.environment).toBe('producao');
    expect(info.canSavePatients).toBe(true);
    expect(info.canSaveAppointments).toBe(true);
    expect(info.canIssueRealInvoices).toBe(true);
    expect(info.canIssueInvoice).toBe(true);

    const isSub = await service.isSubscriber('doc-456');
    expect(isSub).toBe(true);
  });

  it('deve atualizar na tabela subscriptions ao chamar setDoctorSubscription', async () => {
    const updateIntegMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const updateDocMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const upsertSubMock = vi.fn().mockResolvedValue({ error: null });

    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-999',
          is_paying: true,
          status: 'active',
          plan_tier: 'pro',
          free_invoices_limit: 1,
          free_invoices_used: 0,
        },
        error: null,
      }),
      upsert: upsertSubMock,
    };

    const selectDocMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-999', name: 'Dr. Promovido', onboarding_status: 'active' },
        error: null,
      }),
      update: updateDocMock,
    };

    const selectIntegMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'producao', pluggy_validated: true },
        error: null,
      }),
      update: updateIntegMock,
    };

    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        count: 0,
        error: null,
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return selectDocMock;
      if (table === 'integrations') return selectIntegMock;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const updated = await service.setDoctorSubscription('doc-999', true);

    expect(upsertSubMock).toHaveBeenCalledWith(
      expect.objectContaining({ doctor_id: 'doc-999', is_paying: true, status: 'active', plan_tier: 'pro' }),
      { onConflict: 'doctor_id' }
    );
    expect(updateIntegMock).toHaveBeenCalledWith(
      expect.objectContaining({ focus_nfe_environment: 'producao' })
    );
    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_status: 'active' })
    );
    expect(updated.isPaying).toBe(true);
  });

  it('deve atualizar assinatura com dados da Stripe via setStripeSubscription', async () => {
    const updateIntegMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const updateDocMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const upsertSubMock = vi.fn().mockResolvedValue({ error: null });

    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-stripe-1',
          is_paying: true,
          status: 'active',
          plan_tier: 'pro',
          payment_gateway: 'stripe',
          gateway_customer_id: 'cus_123',
          gateway_subscription_id: 'sub_123',
        },
        error: null,
      }),
      upsert: upsertSubMock,
    };

    const mockDoctorsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-stripe-1', name: 'Dr. Stripe', onboarding_status: 'active' },
        error: null,
      }),
      update: updateDocMock,
    };

    const mockIntegrationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'producao' },
        error: null,
      }),
      update: updateIntegMock,
    };

    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 50, error: null }),
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return mockDoctorsBuilder;
      if (table === 'integrations') return mockIntegrationsBuilder;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const info = await service.setStripeSubscription({
      doctorId: 'doc-stripe-1',
      status: 'active',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });

    expect(upsertSubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor_id: 'doc-stripe-1',
        status: 'active',
        is_paying: true,
        payment_gateway: 'stripe',
        gateway_customer_id: 'cus_123',
        gateway_subscription_id: 'sub_123',
      }),
      { onConflict: 'doctor_id' }
    );
    expect(info.isPaying).toBe(true);
    expect(info.status).toBe('active');
  });

  it('deve bloquear emissão de notas se o assinante atingir o limite de 200 notas no mês', async () => {
    const mockSubscriptionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          doctor_id: 'doc-limit-1',
          is_paying: true,
          status: 'active',
          plan_tier: 'pro',
        },
        error: null,
      }),
    };

    const mockDoctorsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-limit-1', name: 'Dr. Cota', onboarding_status: 'active' },
        error: null,
      }),
    };

    const mockIntegrationsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { focus_nfe_environment: 'producao' },
        error: null,
      }),
    };

    // Retorna 200 notas para o mês atual
    const mockInvoicesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 200, error: null }),
      }),
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'subscriptions') return mockSubscriptionsBuilder;
      if (table === 'doctors') return mockDoctorsBuilder;
      if (table === 'integrations') return mockIntegrationsBuilder;
      if (table === 'invoices') return mockInvoicesBuilder;
      return {};
    });

    const info = await service.getDoctorSubscription('doc-limit-1');

    expect(info.isPaying).toBe(true);
    expect(info.monthlyInvoicesLimit).toBe(200);
    expect(info.monthlyInvoicesUsed).toBe(200);
    expect(info.canIssueInvoice).toBe(false);
    expect(info.reason).toContain('Limite mensal de 200 notas');

    const check = await service.canDoctorIssueInvoice('doc-limit-1');
    expect(check.allowed).toBe(false);
  });
});

