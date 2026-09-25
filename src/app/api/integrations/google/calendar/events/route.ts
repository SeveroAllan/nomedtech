import { NextRequest, NextResponse } from 'next/server';
import { googleCalendarService } from '@/features/integrations/google/google-calendar.service';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const paramDoctorId = searchParams.get('doctorId');
    const timeMin = searchParams.get('timeMin') || undefined;
    const timeMax = searchParams.get('timeMax') || undefined;

    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const doctorId = authDoctorId || paramDoctorId;

    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    const events = await googleCalendarService.listEvents({
      doctorId,
      timeMin,
      timeMax,
    });

    const parsedEvents = events.map((ev) => ({
      raw: ev,
      parsed: googleCalendarService.parseEvent(ev),
    }));

    return NextResponse.json({
      success: true,
      count: events.length,
      events: parsedEvents,
    });
  } catch (error: any) {
    console.error('[API Google Calendar Events] Erro ao listar eventos:', error);
    return NextResponse.json({ error: error?.message || 'Falha ao buscar eventos da agenda.' }, { status: 500 });
  }
}
