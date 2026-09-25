import { NextRequest, NextResponse } from 'next/server';
import { FocusNfeClient } from '@/lib/integrations/focus-nfe-client';
import { getAuthenticatedDoctorId } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!await getAuthenticatedDoctorId()) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const body = await req.json();
    const {
      cnpj,
      razaoSocial,
      inscricaoMunicipal,
      cnae,
      regimeTributario,
      arquivoCertificadoBase64,
      senhaCertificado,
    } = body;

    if (!cnpj || !razaoSocial || !inscricaoMunicipal) {
      return NextResponse.json(
        { error: 'CNPJ, Razão Social e Inscrição Municipal são obrigatórios.' },
        { status: 400 }
      );
    }

    const focusClient = new FocusNfeClient({
      environment: 'homologacao', // Mantém estritamente Sandbox/Homologação da Focus NFe conforme solicitado
    });

    const result = await focusClient.createOrUpdateEmpresa({
      cnpj,
      nome: razaoSocial,
      inscricao_municipal: inscricaoMunicipal,
      cnae_fiscal: cnae || '8630503',
      regime_tributario: regimeTributario === 'simples_nacional' ? 1 : 3,
      arquivo_certificado_base64: arquivoCertificadoBase64,
      senha_certificado: senhaCertificado,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Empresa e Certificado A1 processados com sucesso no Sandbox da Focus NFe.',
    });
  } catch (err: any) {
    console.error('Erro na validação Focus NFe:', err);
    return NextResponse.json(
      {
        error: err?.message || 'Erro ao conectar à API da Focus NFe Sandbox.',
      },
      { status: 500 }
    );
  }
}
