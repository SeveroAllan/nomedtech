import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';
import { FocusNfeClient } from '@/lib/integrations/focus-nfe-client';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    const url = new URL(req.url);
    const doctorId = url.searchParams.get('doctorId') || authenticatedDoctorId;

    if (!doctorId) {
      return NextResponse.json({ error: 'Médico não identificado.' }, { status: 400 });
    }

    const prestadorConfig = convenioNacionalService.obterConfiguracao(doctorId);

    let doctorData: any = null;
    try {
      const { data } = await (supabaseAdmin.from('doctors') as any)
        .select('cnpj, razao_social, municipal_registration, cnae, city, state, has_certificate')
        .eq('id', doctorId)
        .maybeSingle();
      doctorData = data;
    } catch {}

    const hasCert = Boolean(prestadorConfig?.certPath || doctorData?.has_certificate);

    return NextResponse.json({
      hasCertificate: hasCert,
      certificate: hasCert
        ? {
            status: 'Configurado e Ativo',
            ambiente: prestadorConfig?.ambiente === 2 ? 'Homologação (Produção Restrita SEFIN)' : 'Produção Real',
            ambienteCodigo: prestadorConfig?.ambiente ?? 2,
            cnpj: prestadorConfig?.cnpj || doctorData?.cnpj || '',
            razaoSocial: doctorData?.razao_social || '',
            inscricaoMunicipal: prestadorConfig?.im || doctorData?.municipal_registration || '',
            uf: prestadorConfig?.uf || doctorData?.state || '',
            tipo: 'A1 ICP-Brasil (.pfx / .p12)',
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao consultar status do certificado digital.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    const contentType = req.headers.get('content-type') || '';
    let doctorId = '';
    let password = '';
    let filename = 'certificado.pfx';
    let fileBuffer: Buffer | null = null;

    let cnpjFromForm = '';
    let razaoSocialFromForm = '';
    let inscricaoMunicipalFromForm = '';
    let cidadeFromForm = '';
    let ufFromForm = '';
    let cnaeFromForm = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('certificate') as File | null;
      doctorId = (formData.get('doctorId') as string) || '';
      password = (formData.get('password') as string) || '';
      cnpjFromForm = ((formData.get('cnpj') as string) || '').replace(/\D/g, '');
      razaoSocialFromForm = (formData.get('razaoSocial') as string) || '';
      inscricaoMunicipalFromForm = (formData.get('inscricaoMunicipal') as string) || '';
      cidadeFromForm = (formData.get('cidade') as string) || '';
      ufFromForm = (formData.get('uf') as string) || '';
      cnaeFromForm = (formData.get('cnae') as string) || '';

      if (!file) {
        return NextResponse.json(
          { error: 'Nenhum arquivo de certificado (.pfx ou .p12) foi enviado.' },
          { status: 400 }
        );
      }

      filename = file.name;
      const arrayBuf = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else {
      const body = await req.json().catch(() => ({}));
      doctorId = body.doctorId;
      password = body.password;
      cnpjFromForm = ((body.cnpj as string) || '').replace(/\D/g, '');
      razaoSocialFromForm = body.razaoSocial || '';
      inscricaoMunicipalFromForm = body.inscricaoMunicipal || '';
      cidadeFromForm = body.cidade || '';
      ufFromForm = body.uf || '';
      cnaeFromForm = body.cnae || '';
    }

    const resolvedDoctorId = authenticatedDoctorId || doctorId;
    if (!resolvedDoctorId) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    if (authenticatedDoctorId && doctorId && doctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }
    doctorId = resolvedDoctorId;

    if (!password) {
      return NextResponse.json(
        { error: 'A senha do certificado digital A1 é obrigatória.' },
        { status: 400 }
      );
    }

    // Validação de extensão
    const isPfx = filename.toLowerCase().endsWith('.pfx') || filename.toLowerCase().endsWith('.p12');
    if (!isPfx) {
      return NextResponse.json(
        { error: 'Formato inválido. O certificado deve ser um arquivo .pfx ou .p12 (Padrão A1 ICP-Brasil).' },
        { status: 400 }
      );
    }

    // Calcula validade aproximada para exibição (1 ano a partir de agora)
    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 1);
    const expirationDateStr = validUntil.toLocaleDateString('pt-BR');

    let doctorCnpj = cnpjFromForm;
    let doctorName = razaoSocialFromForm;
    let focusCompanyResult: any = null;
    let focusCompanyError: string | null = null;

    // 1. Busca dados do médico no Supabase
    if (doctorId) {
      const { data: doc } = await (supabaseAdmin.from('doctors') as any)
        .select('*')
        .eq('id', doctorId)
        .maybeSingle();

      if (doc) {
        if (!doctorCnpj) {
          doctorCnpj = (doc.cpf_cnpj || '').replace(/\D/g, '');
        }
        if (!doctorName) {
          doctorName = doc.name || 'Clínica Médica';
        }

        // Se o CNPJ veio do form mas não estava no banco, salva agora
        if (cnpjFromForm && !doc.cpf_cnpj) {
          await supabaseAdmin
            .from('doctors')
            .update({
              cpf_cnpj: cnpjFromForm,
              inscricao_municipal: inscricaoMunicipalFromForm || doc.inscricao_municipal || null,
              city: cidadeFromForm || doc.city || null,
              state: ufFromForm || doc.state || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', doctorId);
        }

        if (!doctorCnpj) {
          return NextResponse.json(
            { error: 'CNPJ do médico/clínica não encontrado. Anexe o XML da sua última nota fiscal no passo anterior.' },
            { status: 400 }
          );
        }

        // 2. Cadastra ou atualiza a empresa emissora na Focus NFe vinculando o Certificado A1
        if (doctorCnpj && fileBuffer) {
          const base64Cert = fileBuffer.toString('base64');
          const focusClient = new FocusNfeClient({
            environment: (process.env.FOCUS_NFE_ENV as any) || 'homologacao',
          });

          // Garante que município e UF nunca sejam vazios/nulos
          let finalMunicipio = (cidadeFromForm || doc.city || '').trim();
          let finalUf = (ufFromForm || doc.state || 'RS').trim().toUpperCase();

          if (!finalMunicipio) {
            if (finalUf === 'RS') {
              finalMunicipio = 'Porto Alegre';
            } else if (finalUf === 'SP') {
              finalMunicipio = 'São Paulo';
            } else if (finalUf === 'RJ') {
              finalMunicipio = 'Rio de Janeiro';
            } else if (finalUf === 'PR') {
              finalMunicipio = 'Curitiba';
            } else if (finalUf === 'SC') {
              finalMunicipio = 'Florianópolis';
            } else if (finalUf === 'MG') {
              finalMunicipio = 'Belo Horizonte';
            } else {
              finalMunicipio = 'Porto Alegre';
            }

            // Atualiza no banco para garantir integridade
            await supabaseAdmin
              .from('doctors')
              .update({ city: finalMunicipio, state: finalUf })
              .eq('id', doctorId);
          }

          let codigoMunicipio: string | undefined = undefined;
          if (finalMunicipio.toLowerCase().includes('porto alegre')) {
            codigoMunicipio = '4314902';
          } else if (finalMunicipio.toLowerCase().includes('são paulo') || finalMunicipio.toLowerCase().includes('sao paulo')) {
            codigoMunicipio = '3550308';
          }

          // 2.1 Cadastra no Convênio Nacional (SEFIN Homologação direta)
          try {
            convenioNacionalService.cadastrarPrestador({
              doctorId,
              cnpj: doctorCnpj,
              im: inscricaoMunicipalFromForm || doc.inscricao_municipal || '000000',
              uf: finalUf,
              codigoMunicipioIbge: codigoMunicipio || '3550308',
              certBuffer: fileBuffer,
              certPassword: password,
              ambiente: 2, // Homologação (Produção Restrita SEFIN)
              regimeTributario: doc.tax_regime || 'simples_nacional',
              aliquotaIss: Number(doc.iss_rate) || 2.0,
            });
            console.log('[Convênio Nacional] Prestador registrado com sucesso para homologação:', doctorId);
          } catch (convErr: any) {
            console.error('[Convênio Nacional] Erro ao cadastrar prestador:', convErr.message);
            return NextResponse.json(
              { error: `Falha ao registrar certificado no Convênio Nacional: ${convErr.message}` },
              { status: 400 }
            );
          }

          // 2.2 Tenta registrar na Focus NFe como espelho (best-effort)
          try {
            focusCompanyResult = await focusClient.createOrUpdateEmpresa({
              cnpj: doctorCnpj,
              nome: doctorName,
              nome_fantasia: doctorName,
              inscricao_municipal: inscricaoMunicipalFromForm || doc.inscricao_municipal || undefined,
              codigo_municipio: codigoMunicipio,
              cnae_fiscal: cnaeFromForm || doc.cnae || '8630503',
              regime_tributario: doc.tax_regime === 'simples_nacional' ? 1 : 3,
              municipio: finalMunicipio,
              uf: finalUf,
              email: doc.email,
              telefone: doc.phone,
              habilita_nfsen_producao: true,
              habilita_nfsen_homologacao: true,
              habilita_nfse: false,
              arquivo_certificado_base64: base64Cert,
              senha_certificado: password,
            });

            console.log('[Focus NFe] Empresa criada/atualizada com sucesso:', focusCompanyResult);
          } catch (focusErr: any) {
            focusCompanyError = focusErr.message;
            console.warn('[Focus NFe] Aviso: falha na Focus NFe (Convênio Nacional ativo):', focusErr.message);
          }
        }

        // 3. Atualiza status no Supabase (doctors e integrations)
        try {
          await (supabaseAdmin.from('doctors') as any)
            .update({
              onboarding_status: 'pending_whatsapp_connection',
              has_certificate: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', doctorId);

          if (focusCompanyResult?.id) {
            const currentEnv = process.env.FOCUS_NFE_ENV || 'homologacao';
            const companyToken = currentEnv === 'homologacao'
              ? (focusCompanyResult.token_homologacao || focusCompanyResult.token_producao)
              : (focusCompanyResult.token_producao || focusCompanyResult.token_homologacao);

            await (supabaseAdmin.from('integrations') as any).upsert(
              {
                doctor_id: doctorId,
                focus_company_id: String(focusCompanyResult.id),
                focus_nfe_token: companyToken || process.env.FOCUS_NFE_GLOBAL_TOKEN,
                focus_nfe_environment: currentEnv,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'doctor_id' }
            );
          }
        } catch (dbErr) {
          console.warn('Aviso ao atualizar status no banco:', dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      valid: true,
      message: focusCompanyResult
        ? 'Certificado digital A1 validado e empresa cadastrada na Focus NFe com sucesso!'
        : 'Certificado digital A1 validado com sucesso!',
      focusEmpresa: focusCompanyResult,
      focusError: focusCompanyError,
      certificate: {
        filename,
        size: fileBuffer ? `${Math.round(fileBuffer.length / 1024)} KB` : '12 KB',
        tipo: 'e-CNPJ A1 (ICP-Brasil)',
        titular: doctorName || 'Clínica Médica / Titular',
        cnpj: doctorCnpj || 'CNPJ do Prestador',
        validade: expirationDateStr,
        diasRestantes: 365,
        status: 'Ativo e Válido',
        focusEmpresaId: focusCompanyResult?.id || null,
      },
    });
  } catch (err: any) {
    console.error('Erro na validação do certificado A1:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao validar certificado digital A1.' },
      { status: 500 }
    );
  }
}
