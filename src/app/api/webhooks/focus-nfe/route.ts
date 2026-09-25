import { NextRequest, NextResponse } from 'next/server';
import { InvoicesRepository } from '@/features/invoices/invoices.repository';
import { ScheduleRepository } from '@/features/schedule/schedule.repository';

export const dynamic = 'force-dynamic';

const invoicesRepo = new InvoicesRepository();
const scheduleRepo = new ScheduleRepository();

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { ref, status, numero, codigo_verificacao, caminho_danfe, caminho_xml, erros } = payload;

    if (!ref) {
      return NextResponse.json({ error: 'Referência não informada' }, { status: 400 });
    }

    let mappedStatus: 'authorized' | 'error' | 'processing' | 'cancelled' = 'processing';
    if (status === 'autorizado') mappedStatus = 'authorized';
    if (status === 'erro_autorizacao') mappedStatus = 'error';
    if (status === 'cancelado' || status === 'cancelled') {
      mappedStatus = 'cancelled';
      // Reverte o status da consulta vinculada de 'completed' de volta para 'confirmed'
      await scheduleRepo.revertCancelledInvoiceAppointment(ref);
    }

    await invoicesRepo.updateInvoiceStatus(ref, mappedStatus, {
      invoiceNumber: numero,
      verificationCode: codigo_verificacao,
      pdfUrl: caminho_danfe,
      xmlUrl: caminho_xml,
      errorMessage: erros ? JSON.stringify(erros) : undefined,
    });

    return NextResponse.json({ success: true, updatedRef: ref });
  } catch (err: any) {
    console.error('Erro no webhook Focus NFe:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao processar retorno da Focus NFe' },
      { status: 500 }
    );
  }
}
