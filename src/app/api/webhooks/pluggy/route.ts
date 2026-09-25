import { NextRequest, NextResponse } from 'next/server';
import { IntegrationsRepository } from '@/features/integrations/integrations.repository';

export const dynamic = 'force-dynamic';

const integrationsRepo = new IntegrationsRepository();

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const event = payload.event; // ex: 'TRANSACTIONS_UPDATED'
    const accountId = payload.accountId || payload.data?.accountId;

    if (!accountId) {
      return NextResponse.json({ received: true, note: 'Sem accountId informado' });
    }

    return NextResponse.json({ success: true, event, accountId });
  } catch (err: any) {
    console.error('Erro no webhook Pluggy:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao processar webhook Pluggy' },
      { status: 500 }
    );
  }
}
