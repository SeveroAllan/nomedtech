import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/features/integrations/google/gmail.service';
import { getAuthenticatedDoctorId, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const authDoctorId = await getAuthenticatedDoctorId().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const {
      doctorId: paramDoctorId,
      invoiceId,
      recipientEmail: directRecipientEmail,
      patientName: directPatientName,
      doctorName: directDoctorName,
      invoiceNumber: directInvoiceNumber,
      amount: directAmount,
      pdfUrl: directPdfUrl,
      xmlContent: directXmlContent,
    } = body;

    const doctorId = authDoctorId || paramDoctorId;
    if (!doctorId) {
      return NextResponse.json({ error: 'ID do médico é obrigatório.' }, { status: 400 });
    }

    let recipientEmail = directRecipientEmail;
    let patientName = directPatientName || 'Paciente';
    let doctorName = directDoctorName;
    let invoiceNumber = directInvoiceNumber || 'NFS-e';
    let amount = directAmount;
    let pdfUrl = directPdfUrl;
    let xmlContent = directXmlContent;

    // Se invoiceId foi fornecido, busca dados na tabela invoices e patients
    if (invoiceId) {
      const { data: inv } = await (supabaseAdmin.from('invoices') as any)
        .select('*, patients(*)')
        .eq('id', invoiceId)
        .eq('doctor_id', doctorId)
        .maybeSingle();

      if (inv) {
        invoiceNumber = inv.invoice_number || inv.reference_id || invoiceNumber;
        amount = Number(inv.amount) || amount;
        pdfUrl = inv.pdf_url || pdfUrl;
        xmlContent = inv.xml_url || xmlContent;
        if (!recipientEmail && inv.patients?.email) {
          recipientEmail = inv.patients.email;
        }
        if (inv.patients?.name) {
          patientName = inv.patients.name;
        }
      }
    }

    if (!doctorName) {
      const { data: doc } = await (supabaseAdmin.from('doctors') as any)
        .select('name')
        .eq('id', doctorId)
        .maybeSingle();
      doctorName = doc?.name || 'Dr(a). Consultório';
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'E-mail do paciente/destinatário é obrigatório.' },
        { status: 400 }
      );
    }

    const result = await gmailService.sendInvoiceEmail({
      doctorId,
      recipientEmail,
      patientName,
      doctorName,
      invoiceNumber,
      amount,
      pdfUrl,
      xmlContent,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      recipientEmail: result.recipientEmail,
      message: `Nota Fiscal nº ${invoiceNumber} enviada com sucesso para ${recipientEmail}!`,
    });
  } catch (error: any) {
    console.error('[API Gmail Send] Erro ao enviar nota por e-mail:', error);
    return NextResponse.json({ error: error?.message || 'Falha ao enviar e-mail via Gmail.' }, { status: 500 });
  }
}
