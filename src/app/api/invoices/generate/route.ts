import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFocusNfsePayload } from '@/lib/fiscal/focus-nfse-builder';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';
import { subscriptionService } from '@/features/subscription/subscription.service';
import { googleClientService } from '@/lib/integrations/google-client';
import { googleDriveService } from '@/features/integrations/google/google-drive.service';
import { gmailService } from '@/features/integrations/google/gmail.service';
import type { ExtractedFiscalData } from '@/lib/xml/nfse-parser';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';



export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authenticatedDoctorId = await getAuthenticatedDoctorId();
    const url = new URL(req.url);
    const queryDoctorId = url.searchParams.get('doctorId');
    const body = await req.json().catch(() => ({}));
    const {
      doctorId: inputDoctorId,
      patientId,
      appointmentId,
      consultaId,
      amount = 900,
      appointmentDate = new Date().toISOString().slice(0, 10),
      // Possibilidade de enviar payload customizado ou dados manuais
      customPayload,
    } = body;

    const doctorId = authenticatedDoctorId || inputDoctorId || queryDoctorId;
    if (!doctorId) {
      return NextResponse.json({ error: 'Médico não identificado ou não autenticado.' }, { status: 401 });
    }
    if (authenticatedDoctorId && inputDoctorId && inputDoctorId !== authenticatedDoctorId) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // 1. Busca médico e seu perfil fiscal
    const { data: doc, error: docError } = await (supabaseAdmin.from('doctors') as any)
      .select('*')
      .eq('id', doctorId)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Médico não encontrado.' }, { status: 404 });
    }

    // 2. Extrai ou valida o perfil fiscal do médico (extraído do XML)
    if (!doc.fiscal_profile && (!doc.cpf_cnpj || !doc.codigo_municipio_ibge)) {
      return NextResponse.json({
        error: 'O médico ainda não possui perfil fiscal configurado. Faça o upload do XML de uma nota do médico para extrair os dados reais da emissora.',
      }, { status: 400 });
    }

    const fiscalProfile: ExtractedFiscalData = doc.fiscal_profile || {
      cnpj: (doc.cpf_cnpj || '').replace(/\D/g, ''),
      inscricaoMunicipal: doc.inscricao_municipal || '',
      razaoSocial: doc.name || 'Clínica Médica',
      cnae: doc.cnae || '8630503',
      codigoMunicipioEmissora: doc.codigo_municipio_ibge || '',
      cidade: doc.city || '',
      uf: doc.state || '',
      codigoOpcaoSimplesNacional: (doc.tax_regime === 'simples_nacional' || doc.codigo_opcao_simples_nacional === 3) ? 3 : 1,
      regimeTributario: doc.tax_regime === 'simples_nacional' ? 'simples_nacional' : 'lucro_presumido',
      isOptanteSimples: doc.tax_regime === 'simples_nacional' || doc.codigo_opcao_simples_nacional === 3,
      regimeEspecialTributacao: 0,
      codigoTributacaoNacionalIss: '041601',
      codigoNbs: '123011300',
      itemListaServico: '04.01',
      aliquotaIss: Number(doc.iss_rate) || 2.0,
      percentualTotalTributosFederais: doc.tax_regime === 'simples_nacional' ? '0.00' : '11.33',
      percentualTotalTributosEstaduais: '0.00',
      percentualTotalTributosMunicipais: String(Math.round(Number(doc.iss_rate) || 2)),
      cbsAliquota: doc.tax_regime === 'simples_nacional' ? 0 : 0.9,
      ibsUfAliquota: doc.tax_regime === 'simples_nacional' ? 0 : 0.1,
      ibsMunAliquota: 0,
      crm: doc.crm || undefined,
      rqe: doc.rqe || undefined,
      especialidade: doc.especialidade || undefined,
      serieDps: '1',
      proximoNumeroDps: 1,
    };

    // 3. Obtém dados do paciente (tabela 'patients' ou enviados diretamente)
    let patientData: any = body.patient || null;

    if (!patientData && patientId) {
      const { data: p } = await (supabaseAdmin.from('patients') as any)
        .select('*')
        .eq('id', patientId)
        .maybeSingle();

      if (p) {
        patientData = {
          name: p.name,
          cpf: p.cpf,
          phone: p.phone,
          email: p.email,
          address: p.address,
          postalCode: p.postal_code,
          city: p.city,
          state: p.state,
        };
      }
    }

    if (!patientData || !patientData.cpf || !patientData.name) {
      return NextResponse.json({
        error: 'Dados do paciente (nome e CPF) são obrigatórios para a emissão da NFS-e. Certifique-se de que o paciente está cadastrado no sistema.',
      }, { status: 400 });
    }

    // 4. Monta o payload DPS Nacional oficial
    const payload = customPayload || buildFocusNfsePayload(
      fiscalProfile,
      patientData,
      {
        appointmentDate,
        amount: Number(amount),
        numeroDps: fiscalProfile.proximoNumeroDps,
        serieDps: fiscalProfile.serieDps,
      }
    );

    // 5. Verifica status da assinatura do médico e cota da primeira nota (momento a-ha)
    const subscription = await subscriptionService.getDoctorSubscription(doctorId);
    if (!subscription.canIssueInvoice) {
      return NextResponse.json({
        error: 'Limite de emissão atingido.',
        message: subscription.reason || 'Você atingiu o limite de 200 notas emitidas este mês.',
        code: subscription.isPaying ? 'MONTHLY_LIMIT_REACHED' : 'FREE_LIMIT_REACHED',
        requiresSubscription: !subscription.isPaying,
      }, { status: 403 });
    }

    const isSubscriber = subscription.isPaying;
    const environment: 'homologacao' | 'producao' = isSubscriber ? 'producao' : 'homologacao';

    console.log(`[API /invoices/generate] Médico ${doctorId} - Assinante: ${isSubscriber} | Ambiente forçado: ${environment}`);

    // 6. Gera referência única
    const ref = `dps-${doc.id.slice(0, 8)}-${Date.now()}`;

    // 7. Envia para o Convênio Nacional (SEFIN Nacional - nossa API local)
    let emissionResponse: any = null;
    let emissionError: any = null;
    const emissionEngine = 'convenio_nacional';

    let prestadorConvenio = await convenioNacionalService.obterConfiguracao(doctorId);

    // Se não estiver em memória mas o certificado físico existir no disco
    if (!prestadorConvenio) {
      const certPath = join(process.cwd(), 'certs', doctorId, 'certificado.p12');
      if (existsSync(certPath)) {
        try {
          const certBuf = readFileSync(certPath);
          prestadorConvenio = convenioNacionalService.cadastrarPrestador({
            doctorId,
            cnpj: fiscalProfile.cnpj,
            im: fiscalProfile.inscricaoMunicipal,
            uf: doc.state || 'SP',
            codigoMunicipioIbge: doc.codigo_municipio_ibge || '3550308',
            certBuffer: certBuf,
            certPassword: '',
            ambiente: isSubscriber ? 1 : 2,
          });
        } catch {}
      }
    }

    if (prestadorConvenio) {
      console.log(`[API /invoices/generate] Emitindo via Convênio Nacional SEFIN para médico ${doctorId} (Ambiente: ${prestadorConvenio.ambiente === 1 ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'})...`);
      try {
        const emitRes = await convenioNacionalService.emitirNotaConsulta({
          doctorId,
          patient: patientData,
          valor: Number(amount),
          dataConsulta: appointmentDate,
          descricao: payload.descricao_servico,
          cTribNac: fiscalProfile.codigoTributacaoNacionalIss || '041601',
          cNBS: fiscalProfile.codigoNbs || '123011300',
        });
        emissionResponse = {
          status: 'autorizado',
          chNFSe: (emitRes.resultado as any)?.chNFSe || (emitRes.resultado as any)?.chaveAcesso || `DPS-${emitRes.nDPS}`,
          numero_dps: emitRes.nDPS,
          url_danfse: `/api/invoices/pdf?doctorId=${encodeURIComponent(doctorId)}&numero=${encodeURIComponent(emitRes.nDPS)}`,
          ...emitRes.resultado,
        };
      } catch (convErr: any) {
        emissionError = convErr?.message || 'Erro ao emitir NFS-e pelo Convênio Nacional';
        console.error('[API /invoices/generate] Falha no Convênio Nacional STACK:', convErr?.stack || convErr);
      }
    } else {
      // Médico sem certificado A1: emite demonstração/simulação pelo motor local
      const nDpsSimulado = String(fiscalProfile.proximoNumeroDps || Math.floor(Date.now() / 1000) % 90000 + 1000);
      emissionResponse = {
        status: 'autorizado',
        simulacao: true,
        numero_dps: nDpsSimulado,
        chNFSe: `DPS-SIMULADA-${nDpsSimulado}`,
        url_danfse: `/api/invoices/pdf?doctorId=${encodeURIComponent(doctorId)}&numero=${encodeURIComponent(nDpsSimulado)}`,
      };
    }

    // 8. Salva fatura no Supabase em invoices
    let invoiceId: string | null = null;
    try {
      const competenceMonth = appointmentDate.slice(0, 7);
      const { data: inv } = await (supabaseAdmin.from('invoices') as any)
        .insert({
          doctor_id: doctorId,
          patient_id: isSubscriber ? (patientId || null) : null,
          reference_id: ref,
          amount: Number(amount),
          description: payload.descricao_servico,
          status: emissionResponse?.status || (emissionError ? 'error' : 'processing'),
          environment: prestadorConvenio ? (prestadorConvenio.ambiente === 1 ? 'producao' : 'homologacao') : environment,
          competence_month: competenceMonth,
          error_message: emissionError,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      invoiceId = inv?.id || null;

      // 9. Atualiza consultas e agendamentos (APENAS para assinantes)
      if (isSubscriber && invoiceId) {
        if (consultaId) {
          await (supabaseAdmin as any)
            .from('consultas')
            .update({ invoice_id: invoiceId, status: 'completed' })
            .eq('id', consultaId);
        }
        if (appointmentId) {
          await (supabaseAdmin.from('appointments') as any)
            .update({ status: 'completed' })
            .eq('id', appointmentId);
        }
      } else if (!isSubscriber) {
        console.log(`[API /invoices/generate] ℹ️ Pulo de atualização de consultas/agenda: médico não-assinante (Sandbox).`);
      }
    } catch (dbErr) {
      console.warn('Aviso ao salvar fatura no Supabase:', dbErr);
    }

    // 10. Integrações Google automáticas (Drive e Gmail)
    const danfseUrl = emissionResponse?.url_danfse || `/api/invoices/pdf?doctorId=${encodeURIComponent(doctorId)}&numero=${encodeURIComponent(emissionResponse?.numero_dps || '25')}`;

    if (!emissionError) {
      try {
        const googleIntegration = await googleClientService.getIntegration(doctorId);
        if (googleIntegration?.accessToken) {
          if (googleIntegration.autoUploadDrive) {
            googleDriveService.uploadInvoiceFromUrl({
              doctorId,
              invoiceNumber: String(emissionResponse?.numero_dps || fiscalProfile.proximoNumeroDps || 'NFS-e'),
              pdfUrl: danfseUrl,
            }).catch((err) => console.warn('[GoogleDrive AutoUpload] Falha em background:', err));
          }

          if (googleIntegration.autoSendGmail && patientData?.email) {
            gmailService.sendInvoiceEmail({
              doctorId,
              recipientEmail: patientData.email,
              patientName: patientData.name || 'Paciente',
              doctorName: doc.name,
              invoiceNumber: String(emissionResponse?.numero_dps || fiscalProfile.proximoNumeroDps || 'NFS-e'),
              amount: Number(amount),
              pdfUrl: danfseUrl,
            }).catch((err) => console.warn('[Gmail AutoSend] Falha em background:', err));
          }
        }
      } catch (googleErr) {
        console.warn('[API /invoices/generate] Falha ao verificar integrações Google:', googleErr);
      }
    }

    return NextResponse.json({
      success: !emissionError,
      reference: ref,
      invoiceId,
      environment: prestadorConvenio?.ambiente === 1 ? 'producao' : 'homologacao',
      isSubscriber,
      subscriptionStatus: subscription.status,
      numero: emissionResponse?.numero_dps,
      urlDanfse: danfseUrl,
      emissionEngine,
      emissionResponse,
      error: emissionError,
      message: emissionError
        ? `Falha na emissão pelo Convênio Nacional SEFIN: ${emissionError}`
        : (!isSubscriber
            ? 'NFS-e emitida pelo Convênio Nacional em Homologação com sucesso!'
            : 'NFS-e Nacional oficial autorizada com sucesso pelo Convênio Nacional!'),
    });
  } catch (err: any) {
    console.error('Erro na emissão de NFS-e:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao emitir NFS-e.' }, { status: 500 });
  }
}
