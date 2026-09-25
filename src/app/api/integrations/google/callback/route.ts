import { NextRequest, NextResponse } from 'next/server';
import { googleClientService } from '@/lib/integrations/google-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const doctorId = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (errorParam) {
    console.warn('[API Google Callback] Usuário cancelou ou ocorreu erro:', errorParam);
    return NextResponse.redirect(`${appUrl}/?google_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !doctorId) {
    return NextResponse.redirect(`${appUrl}/?google_error=codigo_ou_medico_invalido`);
  }

  try {
    const { tokens, userInfo } = await googleClientService.exchangeCode(code);

    await googleClientService.saveIntegration({
      doctorId,
      tokens,
      userInfo,
    });

    console.log(`[API Google Callback] 🎉 Conta Google vinculada com sucesso para o médico ${doctorId} (${userInfo.email})`);
    return NextResponse.redirect(`${appUrl}/?google=connected`);
  } catch (error: any) {
    console.error('[API Google Callback] Erro ao trocar código por tokens:', error);
    return NextResponse.redirect(`${appUrl}/?google_error=${encodeURIComponent(error?.message || 'falha_ao_autenticar')}`);
  }
}
