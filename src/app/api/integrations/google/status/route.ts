import { NextRequest, NextResponse } from 'next/server';
import { googleClientService } from '@/lib/integrations/google-client';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const paramDoctorId = searchParams.get('doctorId');
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const doctorId = authDoctorId || paramDoctorId;

    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    const isConfigured = googleClientService.isConfigured();
    const integration = await googleClientService.getIntegration(doctorId);

    return NextResponse.json({
      isConfigured,
      isConnected: Boolean(integration?.accessToken),
      integration: integration
        ? {
            email: integration.googleEmail,
            name: integration.googleName,
            avatarUrl: integration.googleAvatarUrl,
            driveFolderName: integration.driveFolderName,
            driveFolderId: integration.driveFolderId,
            autoSendGmail: integration.autoSendGmail,
            autoUploadDrive: integration.autoUploadDrive,
            lastCalendarSync: integration.lastCalendarSync,
            scopes: integration.scopes,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[API Google Status] Erro ao obter status:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao consultar status.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const { doctorId: paramDoctorId, autoSendGmail, autoUploadDrive } = body;
    const doctorId = authDoctorId || paramDoctorId;

    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    const updated = await googleClientService.updateSettings(doctorId, {
      autoSendGmail,
      autoUploadDrive,
    });

    return NextResponse.json({
      success: true,
      integration: updated,
    });
  } catch (error: any) {
    console.error('[API Google Status] Erro ao atualizar configurações:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao salvar alterações.' }, { status: 500 });
  }
}
