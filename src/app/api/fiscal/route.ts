import { NextRequest, NextResponse } from 'next/server';
import { NfseParser } from '@/lib/xml/nfse-parser';
import { buildFocusNfsePayload } from '@/lib/fiscal/focus-nfse-builder';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    let xmlContent = '';
    let doctorId = '';
    let action = 'parse_xml';
    let jsonBody: Record<string, any> = {};

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      doctorId = (formData.get('doctorId') as string) || '';
      action = (formData.get('action') as string) || 'parse_xml';

      if (file) {
        xmlContent = await file.text();
      }

      if (doctorId && doctorId !== authenticatedDoctorId) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
      }
      if (doctorId && !authenticatedDoctorId) {
        return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      }
      doctorId = authenticatedDoctorId || '';
    } else {
      jsonBody = await req.json().catch(() => ({}));
      xmlContent = jsonBody.xmlContent || '';
      doctorId = jsonBody.doctorId || '';
      action = jsonBody.action || 'parse_xml';

      if (action === 'save_fiscal' && jsonBody.fiscalData) {
        if (!doctorId) {
          return NextResponse.json({ error: 'doctorId é obrigatório para salvar dados fiscais.' }, { status: 400 });
        }

        const fiscal = jsonBody.fiscalData;
        const cleanCnpj = fiscal.cnpj ? String(fiscal.cnpj).replace(/\D/g, '') : null;
        const { data: updatedDoc, error } = await supabaseAdmin
          .from('doctors')
          .update({
            cpf_cnpj: cleanCnpj,
            inscricao_municipal: fiscal.inscricaoMunicipal || null,
            cnae: fiscal.cnae || null,
            city: fiscal.cidade || null,
            state: fiscal.uf || null,
            tax_regime: fiscal.regimeTributario || 'simples_nacional',
            iss_rate: Number(fiscal.aliquotaIss) || 2.0,
            onboarding_status: 'pending_certificate',
            updated_at: new Date().toISOString(),
          })
          .eq('id', doctorId)
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Erro ao atualizar save_fiscal, aplicando fallback apenas de CNPJ:', error);
          await supabaseAdmin
            .from('doctors')
            .update({
              cpf_cnpj: cleanCnpj,
              updated_at: new Date().toISOString(),
            })
            .eq('id', doctorId);
        }

        return NextResponse.json({
          success: true,
          message: 'Perfil fiscal do médico salvo com sucesso!',
          doctor: updatedDoc,
        });
      }
    }

    if (!xmlContent || typeof xmlContent !== 'string') {
      return NextResponse.json(
        { error: 'Nenhum conteúdo XML foi enviado para processamento.' },
        { status: 400 }
      );
    }

    const parser = new NfseParser();
    const extracted = parser.parse(xmlContent);

    // Gera o preview técnico para visualização pelo médico/administrador
    const previewPatient = jsonBody.patient || {
      name: 'PACIENTE EXEMPLO (SERÁ EXTRAÍDO DO WHATSAPP)',
      cpf: '00000000000',
      email: 'paciente@exemplo.com.br',
      phone: '11999999999',
    };

    const previewAppointment = jsonBody.appointment || {
      appointmentDate: new Date().toISOString().slice(0, 10),
      amount: 900,
      numeroDps: extracted.proximoNumeroDps,
      serieDps: extracted.serieDps,
    };

    const previewPayload = buildFocusNfsePayload(
      extracted,
      previewPatient,
      previewAppointment
    );

    // Se doctorId foi informado junto ao parse, vincula automaticamente ao médico
    if (doctorId && extracted.cnpj) {
      try {
        const updatePayload: Record<string, any> = {
          cpf_cnpj: extracted.cnpj.replace(/\D/g, ''),
          updated_at: new Date().toISOString(),
        };

        if (extracted.inscricaoMunicipal) updatePayload.inscricao_municipal = extracted.inscricaoMunicipal;
        if (extracted.cnae) updatePayload.cnae = extracted.cnae;
        if (extracted.cidade) updatePayload.city = extracted.cidade;
        if (extracted.uf) updatePayload.state = extracted.uf;
        if (extracted.aliquotaIss) updatePayload.iss_rate = Number(extracted.aliquotaIss) || 2.0;
        updatePayload.tax_regime = extracted.isOptanteSimples ? 'simples_nacional' : 'lucro_presumido';
        updatePayload.onboarding_status = 'pending_certificate';

        const { error: updateError } = await (supabaseAdmin.from('doctors') as any)
          .update(updatePayload)
          .eq('id', doctorId);

        if (updateError) {
          console.warn('Tentativa com payload completo falhou, aplicando fallback de CPF/CNPJ:', updateError);
          await supabaseAdmin
            .from('doctors')
            .update({
              cpf_cnpj: extracted.cnpj.replace(/\D/g, ''),
              updated_at: new Date().toISOString(),
            })
            .eq('id', doctorId);
        }
      } catch (saveErr) {
        console.warn('Aviso ao persistir dados fiscais automaticamente:', saveErr);
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      previewPayload,
      summary: {
        enquadramento: extracted.isOptanteSimples ? 'Optante pelo Simples Nacional' : 'Não Optante (Lucro Presumido / Real)',
        codigoOpcaoSimplesNacional: extracted.codigoOpcaoSimplesNacional,
        municipioIbge: extracted.codigoMunicipioEmissora,
        cidade: extracted.cidade,
        uf: extracted.uf,
        crm: extracted.crm || 'Não identificado no XML',
        rqe: extracted.rqe || 'Não identificado no XML',
        especialidade: extracted.especialidade || 'Clínica Médica',
        tributosFederais: extracted.percentualTotalTributosFederais,
        cbsAliquota: extracted.cbsAliquota,
        ibsUfAliquota: extracted.ibsUfAliquota,
        proximoNumeroDps: extracted.proximoNumeroDps,
      },
    });
  } catch (err: any) {
    console.error('Erro ao processar dados fiscais do XML:', err);
    return NextResponse.json(
      { error: err?.message || 'Falha ao processar o XML fiscal.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    if (!authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedDoctorId = searchParams.get('doctorId');

    if (requestedDoctorId && requestedDoctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }
    const doctorId = authenticatedDoctorId;

    const { data: doc, error } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .eq('id', doctorId)
      .maybeSingle();

    if (error || !doc) {
      return NextResponse.json({ error: 'Médico não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      doctor: doc,
      fiscalProfile: doc.fiscal_profile || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro ao carregar dados fiscais.' }, { status: 500 });
  }
}
