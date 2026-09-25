import { NextRequest, NextResponse } from 'next/server';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { doctorId, chave, invoiceId, motivo = 'Cancelamento de nota fiscal emitido em teste operacional do consultorio' } = body;

    if (!doctorId) {
      return NextResponse.json({ error: 'doctorId é obrigatório' }, { status: 400 });
    }

    let chaveAcesso = chave;

    // Se informou apenas o invoiceId, busca a fatura no Supabase
    if (!chaveAcesso && invoiceId) {
      const { data: inv } = await (supabaseAdmin.from('invoices') as any)
        .select('*')
        .eq('id', invoiceId)
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (inv) {
        chaveAcesso = inv.verification_code || inv.reference_id;
      }
    }

    if (!chaveAcesso) {
      return NextResponse.json({ error: 'Chave de acesso da nota não informada' }, { status: 400 });
    }

    console.log(`[Cancelamento NFS-e] Solicitando cancelamento para o médico ${doctorId}, chave: ${chaveAcesso}...`);
    const resultado = await convenioNacionalService.cancelarNota(doctorId, chaveAcesso, motivo);

    // Atualiza status no Supabase
    if (invoiceId) {
      await (supabaseAdmin.from('invoices') as any)
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', invoiceId);
    } else {
      await (supabaseAdmin.from('invoices') as any)
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('doctor_id', doctorId)
        .or(`verification_code.eq.${chaveAcesso},reference_id.eq.${chaveAcesso}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Nota fiscal cancelada com sucesso junto à SEFIN Nacional.',
      resultado,
    });
  } catch (err: any) {
    console.error('[Cancelamento NFS-e] Erro:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Falha ao cancelar nota fiscal na SEFIN',
    }, { status: 500 });
  }
}
