import { NextRequest, NextResponse } from 'next/server';
import { cpfLookupService } from '@/features/fiscal/services/cpf-lookup.service';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cpf = searchParams.get('cpf');
    let doctorId = searchParams.get('doctorId');

    if (!cpf) {
      return NextResponse.json({ error: 'Parâmetro cpf é obrigatório.' }, { status: 400 });
    }

    if (!doctorId) {
      doctorId = (await getAuthenticatedDoctorId()) || '';
    }

    const resultado = await cpfLookupService.consultar(doctorId, cpf);

    if (!resultado) {
      return NextResponse.json(
        { error: 'CPF não encontrado na base local e nem na consulta oficial.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (error: any) {
    console.error('[API /api/fiscal/cpf] Erro:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao consultar CPF.' },
      { status: 500 }
    );
  }
}
