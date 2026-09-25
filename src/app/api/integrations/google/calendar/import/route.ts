import { NextRequest, NextResponse } from 'next/server';
import { googleCalendarService } from '@/features/integrations/google/google-calendar.service';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const { doctorId: paramDoctorId, timeMin, timeMax } = body;

    const doctorId = authDoctorId || paramDoctorId;
    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    const importResult = await googleCalendarService.importEvents({
      doctorId,
      timeMin,
      timeMax,
    });

    return NextResponse.json({
      success: true,
      importedCount: importResult.importedCount,
      skippedCount: importResult.skippedCount,
      consultations: importResult.consultations,
      message: `${importResult.importedCount} consulta(s) importada(s) com sucesso da Google Agenda! (${importResult.skippedCount} já cadastradas ou ignoradas).`,
    });
  } catch (error: any) {
    console.error('[API Google Calendar Import] Erro ao importar consultas:', error);
    return NextResponse.json({ error: error?.message || 'Falha ao importar consultas da agenda.' }, { status: 500 });
  }
}
