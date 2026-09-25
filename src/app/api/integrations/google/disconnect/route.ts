import { NextRequest, NextResponse } from 'next/server';
import { googleClientService } from '@/lib/integrations/google-client';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const { doctorId: paramDoctorId } = body;
    const doctorId = authDoctorId || paramDoctorId;

    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    await googleClientService.disconnect(doctorId);

    return NextResponse.json({
      success: true,
      message: 'Conta Google desconectada com sucesso.',
    });
  } catch (error: any) {
    console.error('[API Google Disconnect] Erro ao desconectar:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao desconectar conta Google.' }, { status: 500 });
  }
}
