import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    if (!authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const doctorId = searchParams.get('doctorId');

    if (doctorId && doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    let query = supabaseAdmin.from('doctors').select('*');
    query = query.eq('id', authenticatedDoctorId);

    const { data: doc, error } = await (query as any).maybeSingle();
    if (error || !doc) {
      return NextResponse.json({ error: 'Médico não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, doctor: doc, doctorId: doc.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    const body = await req.json().catch(() => ({}));
    let { doctorId, email, name, crm, rqe, rqr, especialidade, phone } = body;
    const finalRqr = (rqr || rqe || '').trim();

    if (!name || name.trim().length < 3) {
      return NextResponse.json({ error: 'Nome e sobrenome são obrigatórios.' }, { status: 400 });
    }

    if (!authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    if (doctorId && doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }
    doctorId = authenticatedDoctorId;

    const updates: Record<string, any> = {
      name: name.trim(),
      updated_at: new Date().toISOString(),
    };

    if (crm) updates.crm = crm.trim();
    if (finalRqr) updates.rqe = finalRqr;
    if (especialidade) updates.especialidade = especialidade.trim();
    if (phone) updates.phone = phone.trim();

    const { data: updatedDoc, error } = await (supabaseAdmin.from('doctors') as any)
      .update(updates)
      .eq('id', doctorId)
      .select()
      .maybeSingle();

    if (error) {
      // Fallback para colunas básicas se crm/rqe/especialidade ainda não existirem
      await (supabaseAdmin.from('doctors') as any)
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', doctorId);
    }

    return NextResponse.json({
      success: true,
      message: 'Perfil médico atualizado com sucesso!',
      doctorId,
      doctor: updatedDoc || { id: doctorId, name: name.trim() },
    });
  } catch (err: any) {
    console.error('Erro ao atualizar perfil do médico:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
