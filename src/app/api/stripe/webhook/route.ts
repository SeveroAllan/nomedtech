import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, STRIPE_CONFIG } from '@/lib/integrations/stripe-client';
import { subscriptionService } from '@/features/subscription/subscription.service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event: Stripe.Event;

    if (STRIPE_CONFIG.webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          STRIPE_CONFIG.webhookSecret
        );
      } catch (err: any) {
        console.error('[Stripe Webhook] Falha ao verificar assinatura:', err.message);
        return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
      }
    } else {
      // Sem secret configurado (modo de teste direto ou desenvolvimento)
      event = JSON.parse(rawBody) as Stripe.Event;
    }

    console.log(`[Stripe Webhook] Evento recebido: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const doctorId = session.client_reference_id || session.metadata?.doctorId;

        if (doctorId) {
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
            } catch (fetchSubErr) {
              console.warn('[Stripe Webhook] Aviso ao obter dados da assinatura:', fetchSubErr);
            }
          }

          await subscriptionService.setStripeSubscription({
            doctorId,
            status: 'active',
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            currentPeriodStart,
            currentPeriodEnd,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        const doctorId = sub.metadata?.doctorId;

        if (doctorId) {
          const isActive = sub.status === 'active';
          const currentPeriodStart = sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null;
          const currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;

          await subscriptionService.setStripeSubscription({
            doctorId,
            status: isActive ? 'active' : 'past_due',
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            stripeSubscriptionId: sub.id,
            currentPeriodStart,
            currentPeriodEnd,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const doctorId = sub.metadata?.doctorId;

        if (doctorId) {
          await subscriptionService.setStripeSubscription({
            doctorId,
            status: 'cancelled',
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            stripeSubscriptionId: sub.id,
          });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Stripe Webhook] Erro ao processar:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno no webhook.' },
      { status: 500 }
    );
  }
}
