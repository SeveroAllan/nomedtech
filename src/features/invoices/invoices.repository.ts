import { supabaseAdmin } from '@/lib/supabase/server';
import type { Database, InvoiceRow } from '@/types/database.types';

export class InvoicesRepository {
  public async createInvoice(invoice: Database['public']['Tables']['invoices']['Insert']): Promise<InvoiceRow> {
    const { data, error } = await (supabaseAdmin.from('invoices') as any)
      .insert(invoice)
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar fatura: ${error.message}`);
    return data as InvoiceRow;
  }

  public async getInvoicesByDoctorAndMonth(doctorId: string, competenceMonth: string): Promise<any[]> {
    const { data, error } = await (supabaseAdmin.from('invoices') as any)
      .select('*, patients(*)')
      .eq('doctor_id', doctorId)
      .ilike('competence_month', `%${competenceMonth}%`);

    if (error) throw new Error(`Erro ao listar faturas: ${error.message}`);
    return data || [];
  }

  public async getInvoicesByDoctor(doctorId: string): Promise<any[]> {
    const { data, error } = await (supabaseAdmin.from('invoices') as any)
      .select('*, patients(*)')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Erro ao listar faturas do médico: ${error.message}`);
    return data || [];
  }

  public async updateInvoiceStatus(
    referenceId: string,
    status: Database['public']['Tables']['invoices']['Row']['status'],
    details?: { invoiceNumber?: string; verificationCode?: string; pdfUrl?: string; xmlUrl?: string; errorMessage?: string }
  ): Promise<InvoiceRow> {
    const updateData: Database['public']['Tables']['invoices']['Update'] = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (details?.invoiceNumber) updateData.invoice_number = details.invoiceNumber;
    if (details?.verificationCode) updateData.verification_code = details.verificationCode;
    if (details?.pdfUrl) updateData.pdf_url = details.pdfUrl;
    if (details?.xmlUrl) updateData.xml_url = details.xmlUrl;
    if (details?.errorMessage) updateData.error_message = details.errorMessage;

    const { data, error } = await (supabaseAdmin.from('invoices') as any)
      .update(updateData)
      .eq('reference_id', referenceId)
      .select()
      .single();

    if (error) throw new Error(`Erro ao atualizar status da fatura: ${error.message}`);
    return data as InvoiceRow;
  }
}
