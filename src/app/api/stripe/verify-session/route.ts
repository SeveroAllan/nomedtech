import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/integrations/stripe-client';
import { subscriptionService } from '@/features/subscription/subscription.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
    const doctorIdParam = searchParams.get('doctorId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id é obrigatório.' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({
        verified: false,
        paymentStatus: session.payment_status,
        status: session.status,
      });
    }

    const targetDoctorId = session.client_reference_id || session.metadata?.doctorId || doctorIdParam;

    if (!targetDoctorId) {
      return NextResponse.json(
        { error: 'ID do médico não encontrado na sessão Stripe.' },
        { status: 400 }
      );
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    const customerId = typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;

    let currentPeriodStart: string | null = null;
    let currentPeriodEnd: string | null = null;

    if (subscriptionId) {
      try {
        const subObj: any = await stripe.subscriptions.retrieve(subscriptionId);
        if (subObj?.current_period_start) {
          currentPeriodStart = new Date(subObj.current_period_start * 1000).toISOString();
        }
        if (subObj?.current_period_end) {
          currentPeriodEnd = new Date(subObj.current_period_end * 1000).toISOString();
        }
      } catch (err) {
        console.warn('[Stripe Verify] Erro ao obter dados adicionais da assinatura:', err);
      }
    }

    const updated = await subscriptionService.setStripeSubscription({
      doctorId: targetDoctorId,
      status: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
    });

    return NextResponse.json({
      verified: true,
      subscription: updated,
    });
  } catch (error: any) {
    console.error('[Stripe Verify] Erro ao verificar sessão:', error);
    return NextResponse.json(
      { error: error?.message || 'Falha ao verificar sessão da Stripe.' },
      { status: 500 }
    );
  }
}
