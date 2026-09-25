import { NextRequest, NextResponse } from 'next/server';
import { googleDriveService } from '@/features/integrations/google/google-drive.service';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const {
      doctorId: paramDoctorId,
      invoiceId,
      invoiceNumber: directInvoiceNumber,
      pdfUrl: directPdfUrl,
      xmlContent: directXmlContent,
    } = body;

    const doctorId = authDoctorId || paramDoctorId;
    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    let invoiceNumber = directInvoiceNumber || 'NFS-e';
    let pdfUrl = directPdfUrl;
    let xmlContent = directXmlContent;

    if (invoiceId) {
      const { data: inv } = await (supabaseAdmin.from('invoices') as any)
        .select('*')
        .eq('id', invoiceId)
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (inv) {
        invoiceNumber = inv.invoice_number || inv.reference_id || invoiceNumber;
        pdfUrl = inv.pdf_url || pdfUrl;
        xmlContent = inv.xml_url || xmlContent;
      }
    }

    if (!pdfUrl && !xmlContent) {
      return NextResponse.json(
        { error: 'Nenhum PDF ou XML informado para upload no Google Drive.' },
        { status: 400 }
      );
    }

    const uploadResults = await googleDriveService.uploadInvoiceFromUrl({
      doctorId,
      invoiceNumber,
      pdfUrl,
      xmlContent,
    });

    return NextResponse.json({
      success: true,
      results: uploadResults,
      message: `Arquivos da nota nº ${invoiceNumber} enviados com sucesso para a pasta do Google Drive!`,
    });
  } catch (error: any) {
    console.error('[API Drive Sync] Erro ao sincronizar com Google Drive:', error);
    return NextResponse.json({ error: error?.message || 'Falha ao salvar no Google Drive.' }, { status: 500 });
  }
}
