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

    if (!googleClientService.isConfigured()) {
      return NextResponse.json(
        {
          error: 'Credenciais do Google não configuradas.',
          message: 'Configure as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env.local para habilitar a integração.',
        },
        { status: 500 }
      );
    }

    const authUrl = googleClientService.getAuthUrl(doctorId);

    // Se a requisição veio via JSON ou fetch, retorna a URL. Se for navegação direta, redireciona.
    const acceptHeader = req.headers.get('accept') || '';
    if (acceptHeader.includes('application/json')) {
      return NextResponse.json({ url: authUrl });
    }

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('[API Google Auth] Erro ao gerar URL de autorização:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao iniciar autenticação com o Google.' }, { status: 500 });
  }
}
