import { NextRequest, NextResponse } from 'next/server';
import { EvolutionClient } from '@/lib/integrations/evolution-client';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const evolution = new EvolutionClient();
const HISTORY_TERMS_VERSION = '2026-09-21';

function expectedInstanceName(doctorId: string): string {
  return `nw_${doctorId.replace(/-/g, '').slice(-16)}`;
}

async function authorizeInstance(instanceName: string, doctorId: string | null) {
  if (!doctorId) return false;
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('evolution_instance_name')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (integration?.evolution_instance_name) {
    return integration.evolution_instance_name === instanceName;
  }

  return expectedInstanceName(doctorId) === instanceName;
}

/** GET /api/integrations/whatsapp?instance=xxx — verifica status de conexão */
export async function GET(req: NextRequest) {
  try {
    const doctorId = await getAuthenticatedDoctorId();
    if (!doctorId) {
      return NextResponse.json({ success: false, status: 'close', error: 'Não autenticado.' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const instanceName = searchParams.get('instance') || expectedInstanceName(doctorId);
    if (!await authorizeInstance(instanceName, doctorId)) {
      return NextResponse.json({ success: false, status: 'close', error: 'Não autorizado.' }, { status: 403 });
    }
    const wantsQr = searchParams.get('qr') === '1';

    if (wantsQr) {
      // Retorna QR Code fresco para polling
      try {
        const { qrcode } = await evolution.getQrCode(instanceName);
        return NextResponse.json({ success: true, qrcode });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err?.message || 'Não foi possível buscar o QR Code.' },
          { status: 200 }
        );
      }
    }

    const status = await evolution.getInstanceStatus(instanceName);
    await supabaseAdmin
      .from('integrations')
      .update({
        evolution_connected: status.state === 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('doctor_id', doctorId)
      .eq('evolution_instance_name', instanceName);

    return NextResponse.json({
      success: true,
      instanceName,
      status: status.state, // 'open' | 'close' | 'connecting'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, status: 'close', error: err?.message || 'Evolution API inacessível' },
      { status: 200 }
    );
  }
}

/** POST /api/integrations/whatsapp — cria instância e retorna QR Code base64 */
export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    if (!authenticatedDoctorId) {
      return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const { instanceName = expectedInstanceName(authenticatedDoctorId), doctorId } = body;
    if (doctorId && doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 403 });
    }
    if (!await authorizeInstance(instanceName, authenticatedDoctorId)) {
      return NextResponse.json({ success: false, error: 'Instância do WhatsApp não pertence ao médico autenticado.' }, { status: 403 });
    }

    const { error: integrationError } = await supabaseAdmin
      .from('integrations')
      .upsert({
        doctor_id: authenticatedDoctorId,
        evolution_instance_name: instanceName,
        evolution_connected: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'doctor_id' });

    if (integrationError) {
      console.error('[WhatsApp API] Erro ao vincular instância ao médico:', integrationError.message);
      return NextResponse.json(
        { success: false, error: 'Não foi possível vincular a instância ao médico.' },
        { status: 500 }
      );
    }

    const { error: consentError } = await supabaseAdmin
      .from('whatsapp_history_consents')
      .upsert({
        doctor_id: authenticatedDoctorId,
        instance_name: instanceName,
        terms_version: HISTORY_TERMS_VERSION,
        purpose: 'patient_contact_data_import',
        status: 'pending',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'doctor_id,instance_name' });

    if (consentError) {
      console.error('[WhatsApp API] Erro ao registrar consentimento:', consentError.message);
      return NextResponse.json(
        { success: false, error: 'Não foi possível registrar o aceite dos termos de importação.' },
        { status: 500 }
      );
    }

    console.log(`[WhatsApp API] Criando instância com QR Code — instância: ${instanceName}`);

    // Cria (ou recria) a instância com qrcode:true e configura webhook
    await evolution.createInstanceWithQr(instanceName);

    // Busca o QR Code gerado
    const { qrcode } = await evolution.getQrCode(instanceName);

    console.log(`[WhatsApp API] QR Code obtido com sucesso para ${instanceName}`);

    return NextResponse.json({
      success: true,
      qrcode,
      instanceName,
    });
  } catch (err: any) {
    console.error('[WhatsApp API] Erro ao gerar QR Code:', err?.message || err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Falha ao gerar QR Code na Evolution API.',
      },
      { status: 500 }
    );
  }
}
