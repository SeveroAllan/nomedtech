import { NextRequest, NextResponse } from 'next/server';
import { subscriptionService } from '@/features/subscription/subscription.service';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscription?doctorId={id}
 * Retorna as permissões e o status do plano do médico.
 */
export async function GET(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    const { searchParams } = new URL(req.url);
    const requestedDoctorId = searchParams.get('doctorId');

    if (authenticatedDoctorId && requestedDoctorId && requestedDoctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const doctorId = authenticatedDoctorId || requestedDoctorId;
    if (!doctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const subscription = await subscriptionService.getDoctorSubscription(doctorId);

    return NextResponse.json({
      success: true,
      subscription,
    });
  } catch (err: any) {
    console.error('[API /api/subscription] Erro no GET:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao consultar assinatura.' }, { status: 500 });
  }
}

/**
 * POST /api/subscription
 * Body: { doctorId: string, isSubscriber: boolean }
 * Atualiza o médico entre modo Sandbox (não pagante) e Produção (assinante ativo).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { doctorId, isSubscriber } = body;

    if (!doctorId || typeof isSubscriber !== 'boolean') {
      return NextResponse.json(
        { error: 'doctorId e isSubscriber (boolean) são obrigatórios.' },
        { status: 400 }
      );
    }
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    if (!authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    if (doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const updated = await subscriptionService.setDoctorSubscription(doctorId, isSubscriber);

    return NextResponse.json({
      success: true,
      message: isSubscriber
        ? 'Médico promovido para ASSINANTE ATIVO (Emissão real em produção com registro de agenda e pacientes habilitados).'
        : 'Médico alterado para NÃO-ASSINANTE (Emissão restrita a Sandbox, bloqueio de gravação de datas e pacientes).',
      subscription: updated,
    });
  } catch (err: any) {
    console.error('[API /api/subscription] Erro no POST:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao atualizar assinatura.' }, { status: 500 });
  }
}
