import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'doc-stripe-test', name: 'Dr. Teste', email: 'medico@teste.com' },
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  },
}));

vi.mock('@/lib/integrations/stripe-client', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: 'cs_test_123',
          payment_status: 'paid',
          status: 'complete',
          client_reference_id: 'doc-stripe-test',
          subscription: 'sub_test_123',
          customer: 'cus_test_123',
        }),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_test_123',
        current_period_start: 1774300000,
        current_period_end: 1776900000,
      }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
  STRIPE_CONFIG: {
    priceId: 'price_1UFaloBMqkVPUWioDTWXIPv6',
    publishableKey: 'pk_live_test',
    webhookSecret: '',
    monthlyInvoicesLimit: 200,
  },
}));

vi.mock('@/features/subscription/subscription.service', () => ({
  subscriptionService: {
    setStripeSubscription: vi.fn().mockResolvedValue({
      doctorId: 'doc-stripe-test',
      isPaying: true,
      status: 'active',
      planTier: 'pro',
    }),
  },
}));

import { POST as checkoutPost } from '@/app/api/stripe/checkout/route';
import { GET as verifyGet } from '@/app/api/stripe/verify-session/route';
import { POST as webhookPost } from '@/app/api/stripe/webhook/route';
import { subscriptionService } from '@/features/subscription/subscription.service';

describe('Stripe Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_live_test';
  });

  describe('POST /api/stripe/checkout', () => {
    it('deve retornar erro 400 se doctorId não for enviado', async () => {
      const req = new NextRequest('http://localhost:3000/api/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await checkoutPost(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain('ID do médico é obrigatório');
    });

    it('deve criar sessão de checkout e retornar url da Stripe', async () => {
      const req = new NextRequest('http://localhost:3000/api/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ doctorId: 'doc-stripe-test' }),
      });

      const res = await checkoutPost(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
      expect(json.sessionId).toBe('cs_test_123');
    });
  });

  describe('GET /api/stripe/verify-session', () => {
    it('deve verificar sessão paga e atualizar assinatura', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/stripe/verify-session?session_id=cs_test_123&doctorId=doc-stripe-test'
      );

      const res = await verifyGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.verified).toBe(true);
      expect(subscriptionService.setStripeSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: 'doc-stripe-test',
          status: 'active',
          stripeCustomerId: 'cus_test_123',
          stripeSubscriptionId: 'sub_test_123',
        })
      );
    });
  });

  describe('POST /api/stripe/webhook', () => {
    it('deve processar evento checkout.session.completed com sucesso', async () => {
      const eventPayload = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            client_reference_id: 'doc-stripe-test',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
          },
        },
      };

      const req = new NextRequest('http://localhost:3000/api/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify(eventPayload),
      });

      const res = await webhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
      expect(subscriptionService.setStripeSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: 'doc-stripe-test',
          status: 'active',
          stripeCustomerId: 'cus_test_123',
          stripeSubscriptionId: 'sub_test_123',
        })
      );
    });
  });
});
