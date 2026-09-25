import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_CONFIG } from '@/lib/integrations/stripe-client';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { doctorId } = body;

    if (!doctorId) {
      return NextResponse.json(
        { error: 'ID do médico é obrigatório.' },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Chave da Stripe não configurada no servidor.' },
        { status: 500 }
      );
    }

    // Busca dados do médico para pré-preencher email na Stripe
    const { data: doctor } = await (supabaseAdmin.from('doctors') as any)
      .select('id, name, email')
      .eq('id', doctorId)
      .maybeSingle();

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: STRIPE_CONFIG.priceId,
          quantity: 1,
        },
      ],
      client_reference_id: doctorId,
      metadata: {
        doctorId,
      },
      subscription_data: {
        metadata: {
          doctorId,
        },
      },
      customer_email: doctor?.email || undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[Stripe Checkout] Erro ao criar sessão:', error);
    return NextResponse.json(
      { error: error?.message || 'Falha ao iniciar checkout com a Stripe.' },
      { status: 500 }
    );
  }
}
