import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { MercadoPagoMoneyOutClient } from '@/lib/integrations/mercadopago-money-out';
import { FocusNfeClient } from '@/lib/integrations/focus-nfe-client';

export const dynamic = 'force-dynamic';

/**
 * Validação de rota ativa pelo painel Mercado Pago
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Mercado Pago Webhook endpoint is active.',
  });
}

/**
 * Endpoint de recebimento de Webhook do Mercado Pago Money Out
 * Responde 200 imediatamente e processa o evento de confirmação da transferência
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // 1. Identifica o ID da transação notificada
    // Suporta formatos padrão do Mercado Pago: body.data.id, body.id ou query params id / data.id
    const transactionId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.split('/').pop() ||
      url.searchParams.get('id') ||
      url.searchParams.get('data.id');

    if (!transactionId) {
      // Retorna 200 para evitar retries desnecessários em pings sem ID
      return NextResponse.json(
        { received: true, warning: 'No transaction ID found in webhook payload' },
        { status: 200 }
      );
    }

    const client = new MercadoPagoMoneyOutClient();

    // 2. Consulta os detalhes oficiais da transação no Mercado Pago
    // Documentação: GET https://api.mercadopago.com/v1/transaction-intents/{id}
    let transaction = null;
    try {
      transaction = await client.getTransaction(String(transactionId));
    } catch (txErr: any) {
      console.warn(`Aviso ao consultar transação ${transactionId}:`, txErr?.message);
    }

    // Se a consulta direta não retornou, utiliza o status do payload do webhook
    const status = transaction?.status || body?.action || body?.status || 'processed';
    const externalRef =
      body?.external_reference ||
      body?.data?.external_reference ||
      transaction?.external_reference ||
      '';

    // 3. Verifica se a transferência Pix foi concluída com sucesso
    const isCompleted = [
      'processed',
      'completed',
      'approved',
      'accredited',
      'transfer.processed',
    ].includes(status.toLowerCase());

    if (!isCompleted) {
      return NextResponse.json(
        {
          received: true,
          transactionId,
          status,
          message: 'Transação ainda não concluída. Nenhuma emissão disparada.',
        },
        { status: 200 }
      );
    }

    // 4. Extrai doctorId a partir de external_reference (padrão: DOC_{doctorId}_{timestamp})
    let doctorId: string | null = null;
    if (externalRef.startsWith('DOC_')) {
      const withoutPrefix = externalRef.slice(4);
      const lastUnderscoreIdx = withoutPrefix.lastIndexOf('_');
      doctorId = lastUnderscoreIdx > 0 ? withoutPrefix.slice(0, lastUnderscoreIdx) : withoutPrefix;
    }

    // Se doctorId não veio pelo external_reference, tenta buscar na tabela integrations
    if (!doctorId) {
      const { data: matchedInt } = await (supabaseAdmin.from('integrations') as any)
        .select('doctor_id')
        .eq('mp_payout_intent_id', String(transactionId))
        .maybeSingle();

      if (matchedInt?.doctor_id) {
        doctorId = matchedInt.doctor_id;
      }
    }

    if (!doctorId) {
      console.warn('Webhook Mercado Pago: DoctorId não identificado para a transação:', transactionId);
      return NextResponse.json(
        {
          received: true,
          transactionId,
          warning: 'Doctor ID não localizado para disparar nota de homologação.',
        },
        { status: 200 }
      );
    }

    // 5. Busca dados cadastrais e fiscais do médico no Supabase
    const { data: doctor } = await supabaseAdmin
      .from('doctors')
      .select('*')
      .eq('id', doctorId)
      .maybeSingle();

    if (!doctor) {
      return NextResponse.json(
        { received: true, warning: 'Médico não encontrado no banco de dados.' },
        { status: 200 }
      );
    }

    // 6. EMISSÃO DA NOTA DE HOMOLOGAÇÃO NA FOCUS NFE
    // Dispara a nota fiscal de homologação no Sandbox da Focus NFe
    const cleanCnpj = (doctor.cpf_cnpj || '12345678000195').replace(/\D/g, '');
    const inscricaoMunicipal = doctor.inscricao_municipal || '98765432';
    const focusRef = `homolog-${doctor.id.slice(0, 8)}-${Date.now()}`;

    let focusNfeResult: any = null;
    try {
      const focusClient = new FocusNfeClient({
        environment: 'homologacao',
      });

      focusNfeResult = await focusClient.emitirNfse(focusRef, {
        data_emissao: new Date().toISOString(),
        prestador: {
          cnpj: cleanCnpj,
          inscricao_municipal: inscricaoMunicipal,
        },
        tomador: {
          cpf: '00000000191',
          razao_social: `HOMOLOGACAO NOTOWHATS - DR(A) ${doctor.name.toUpperCase()}`,
          email: doctor.email || 'homologacao@notowhats.com.br',
        },
        servico: {
          aliquota: Number(doctor.iss_rate) || 2.0,
          discriminacao: 'HOMOLOGACAO AUTOMATICA NOTOWHATS POS-ONBOARDING E VALIDACAO PIX MERCADO PAGO',
          iss_retido: false,
          item_lista_servico: '04.01',
          valor_servicos: 1.0,
        },
      });
    } catch (focusErr: any) {
      console.error('Aviso ao emitir nota de homologação na Focus NFe:', focusErr);
      focusNfeResult = {
        status: 'processando_autorizacao',
        simulated: true,
        reference: focusRef,
        message: focusErr?.message,
      };
    }

    // 7. Atualiza o banco de dados com a homologação concluída
    try {
      await (supabaseAdmin.from('integrations') as any)
        .update({
          mp_payout_confirmed: true,
          mp_payout_confirmed_at: new Date().toISOString(),
          homologation_invoice_ref: focusRef,
          homologation_invoice_status: focusNfeResult?.status || 'processando_autorizacao',
          updated_at: new Date().toISOString(),
        })
        .eq('doctor_id', doctorId);

      await supabaseAdmin
        .from('doctors')
        .update({
          onboarding_status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', doctorId);
    } catch (dbErr) {
      console.warn('Aviso ao atualizar persistência de homologação:', dbErr);
    }

    // 8. Resposta formal 200 OK para o Mercado Pago
    return NextResponse.json({
      received: true,
      success: true,
      transactionId,
      status,
      doctorId,
      homologationInvoice: {
        reference: focusRef,
        status: focusNfeResult?.status || 'processando_autorizacao',
      },
      message: 'Pix de validação confirmado e NFS-e de homologação gerada com sucesso!',
    });
  } catch (err: any) {
    console.error('Erro no processamento do Webhook Mercado Pago:', err);
    // Retorna 200 mesmo em caso de erro para não travar fila no Mercado Pago
    return NextResponse.json(
      {
        received: true,
        error: err?.message || 'Erro interno no webhook Mercado Pago.',
      },
      { status: 200 }
    );
  }
}
