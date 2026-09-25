import { NextRequest, NextResponse } from 'next/server';
import { generateDanfsePdf } from '@/lib/fiscal/danfse-pdf-generator';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const doctorId = searchParams.get('doctorId');
    const numero = searchParams.get('numero') || '1';
    const chave = searchParams.get('chave') || searchParams.get('chNFSe');
    const codigoVerificacao = searchParams.get('codigoVerificacao');

    if (doctorId) {
      const authenticatedDoctorId = await getAuthenticatedDoctorId();
      if (authenticatedDoctorId && doctorId !== authenticatedDoctorId) {
        return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
      }

      // 1. Tenta obter o PDF oficial do DANFSe do governo (ADN/SEFIN) ou do cache do disco
      try {
        const pdfOriginal = await convenioNacionalService.obterDanfseOriginalPdf(doctorId, chave || numero);
        if (pdfOriginal) {
          return new Response(new Uint8Array(pdfOriginal), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="DANFSe_${numero}.pdf"`,
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (adnErr) {
        console.warn('[PDF Route] PDF oficial não disponível, gerando via motor local:', adnErr);
      }
    }

    let prestador = {
      razaoSocial: 'CONSULTÓRIO MÉDICO MODELO',
      cnpj: '00.000.000/0001-00',
      inscricaoMunicipal: '00000000',
      municipio: 'Porto Alegre',
      uf: 'RS',
      simplesNacional: true,
    };

    if (doctorId) {
      const { data: doc } = await (supabaseAdmin.from('doctors') as any)
        .select('*')
        .eq('id', doctorId)
        .maybeSingle();

      if (doc) {
        prestador = {
          razaoSocial: (doc.name || doc.company_name || 'CONSULTÓRIO MÉDICO').toUpperCase(),
          cnpj: doc.cpf_cnpj || '00.000.000/0001-00',
          inscricaoMunicipal: doc.inscricao_municipal || '',
          municipio: doc.city || 'Porto Alegre',
          uf: doc.state || 'RS',
          simplesNacional: doc.tax_regime === 'simples_nacional',
        };
      }
    }

    const pdfBytes = await generateDanfsePdf({
      numero,
      codigoVerificacao: codigoVerificacao || undefined,
      prestador,
      tomador: {
        nome: 'PACIENTE MODELO HOMOLOGAÇÃO',
        cpf: '000.000.000-00',
        municipio: prestador.municipio,
      },
      servico: {
        discriminacao: 'HOMOLOGACAO DE EMISSAO FISCAL NOTOWHATS SAAS - CONSULTA MEDICA ESPECIALIZADA',
        valor: 1.0,
        aliquota: 2.0,
      },
    });

    const buffer = Buffer.from(pdfBytes);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="DANFSe_${numero}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('Erro ao gerar PDF da NFS-e:', err);
    return NextResponse.json({ error: 'Erro ao gerar PDF da nota' }, { status: 500 });
  }
}
