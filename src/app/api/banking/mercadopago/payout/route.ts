import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';
import { MercadoPagoMoneyOutClient } from '@/lib/integrations/mercadopago-money-out';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    if (!authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const { doctorId, forceSimulated } = body;

    if (!doctorId) {
      return NextResponse.json(
        { error: 'doctorId é obrigatório para enviar o Pix de homologação.' },
        { status: 400 }
      );
    }
    if (doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // 1. Busca os dados do médico no Supabase
    const { data: doctor, error: docError } = await supabaseAdmin
      .from('doctors')
      .select('*')
      .eq('id', doctorId)
      .maybeSingle();

    if (docError || !doctor) {
      return NextResponse.json(
        { error: 'Médico não encontrado para processar Pix de validação.' },
        { status: 404 }
      );
    }

    // 2. Busca dados de integração (para verificar chave Pix configurada ou salvar o intent)
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    // Determina a chave Pix:
    // Prioridade: integration.pluggy_pix_key > doctor.cpf_cnpj > doctor.phone > doctor.email
    const cleanTaxId = (doctor.cpf_cnpj || '').replace(/\D/g, '');
    const cleanPhone = (doctor.phone || '').replace(/\D/g, '');
    const pixKey =
      integration?.pluggy_pix_key ||
      cleanTaxId ||
      doctor.email ||
      cleanPhone;

    if (!pixKey) {
      return NextResponse.json(
        {
          error:
            'Nenhuma chave Pix (CPF, CNPJ, E-mail ou Telefone) encontrada no cadastro do médico.',
        },
        { status: 400 }
      );
    }

    const client = new MercadoPagoMoneyOutClient();

    // 3. Executa a transferência Pix Money Out de R$ 0,01
    const externalRef = `DOC_${doctor.id}_${Date.now()}`;
    const transferResult = await client.sendPixTransfer({
      doctorId: doctor.id,
      amount: 0.01,
      pixKey,
      ownerTaxId: cleanTaxId || '12345678909',
      ownerName: doctor.name,
      externalReference: externalRef,
    });

    // 4. Registra no Supabase o envio do Pix de homologação
    try {
      if (integration) {
        await (supabaseAdmin.from('integrations') as any)
          .update({
            mp_payout_intent_id: transferResult.id,
            mp_payout_status: transferResult.status,
            mp_payout_reference: externalRef,
            updated_at: new Date().toISOString(),
          })
          .eq('doctor_id', doctorId);
      }
    } catch (saveErr) {
      console.warn('Aviso ao registrar status do Pix na tabela integrations:', saveErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Transferência Pix de R$ 0,01 enviada com sucesso via Mercado Pago Money Out.',
      transactionIntent: transferResult,
      externalReference: externalRef,
      recipient: {
        name: doctor.name,
        pixKey,
      },
    });
  } catch (err: any) {
    console.error('Erro na rota de payout Mercado Pago:', err);
    return NextResponse.json(
      {
        error:
          err?.message || 'Falha ao processar transferência Pix via Mercado Pago Money Out.',
      },
      { status: 500 }
    );
  }
}
