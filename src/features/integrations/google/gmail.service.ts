import { google } from 'googleapis';
import { googleClientService } from '@/lib/integrations/google-client';

export interface SendInvoiceEmailParams {
  doctorId: string;
  recipientEmail: string;
  patientName: string;
  doctorName?: string;
  invoiceNumber?: string;
  verificationCode?: string;
  amount?: number;
  pdfUrl?: string;
  pdfBuffer?: Buffer;
  xmlContent?: string;
}

export class GmailService {
  /**
   * Envia a nota fiscal (DANFSE PDF e/ou XML) diretamente pelo Gmail do médico
   */
  public async sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<{
    success: boolean;
    messageId?: string | null;
    recipientEmail: string;
  }> {
    const {
      doctorId,
      recipientEmail,
      patientName,
      doctorName = 'Consultório Médico',
      invoiceNumber = 'NFS-e',
      amount,
      pdfUrl,
      pdfBuffer,
      xmlContent,
    } = params;

    if (!recipientEmail) {
      throw new Error('E-mail do destinatário não informado.');
    }

    const { oauth2Client, integration } = await googleClientService.getAuthenticatedClient(doctorId);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const senderEmail = integration.googleEmail || 'me';
    const subject = `Sua Nota Fiscal de Consulta - ${doctorName} (Nº ${invoiceNumber})`;

    let attachmentBuffer: Buffer | null = pdfBuffer || null;
    if (!attachmentBuffer && pdfUrl) {
      try {
        const response = await fetch(pdfUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          attachmentBuffer = Buffer.from(arrayBuffer);
        }
      } catch (fetchErr) {
        console.warn('[GmailService] Não foi possível baixar PDF da URL para anexo:', fetchErr);
      }
    }

    const formattedAmount = typeof amount === 'number'
      ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;

    const emailBodyText = `Olá, ${patientName}!

Segue em anexo a sua Nota Fiscal de Serviços Eletrônica (NFS-e nº ${invoiceNumber})${formattedAmount ? ` no valor de ${formattedAmount}` : ''} referente à sua consulta com ${doctorName}.

Guarde este documento para fins de declaração de Imposto de Renda e comprovação fiscal.

Atenciosamente,
${doctorName}`;

    const emailBodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #18181b; background-color: #ffffff; border: 1px solid #e4e4e7; rounded: 12px;">
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #09090b;">Sua Nota Fiscal foi emitida</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #52525b;">Olá, <strong>${patientName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #52525b;">
          Sua Nota Fiscal de Serviços Eletrônica (<strong>NFS-e Nº ${invoiceNumber}</strong>)${formattedAmount ? ` no valor de <strong>${formattedAmount}</strong>` : ''} emitida por <strong>${doctorName}</strong> está pronta e segue em anexo a este e-mail.
        </p>
        <div style="margin: 20px 0; padding: 14px; background-color: #f4f4f5; border-radius: 8px; font-size: 13px; color: #71717a;">
          <p style="margin: 0;">Você pode utilizar o PDF em anexo para solicitar reembolso do plano de saúde ou na sua declaração do Imposto de Renda.</p>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #a1a1aa; margin-top: 24px;">
          Enviado com segurança diretamente pelo consultório de ${doctorName} via NotoWhats.
        </p>
      </div>
    `;

    const rawMessage = this.buildMimeMessage({
      from: `${doctorName} <${senderEmail}>`,
      to: recipientEmail,
      subject,
      bodyText: emailBodyText,
      bodyHtml: emailBodyHtml,
      pdfAttachment: attachmentBuffer
        ? { filename: `DANFSE-${invoiceNumber}.pdf`, content: attachmentBuffer }
        : undefined,
      xmlAttachment: xmlContent
        ? { filename: `NFSe-${invoiceNumber}.xml`, content: Buffer.from(xmlContent, 'utf-8') }
        : undefined,
    });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });

    return {
      success: true,
      messageId: res.data.id,
      recipientEmail,
    };
  }

  private buildMimeMessage(params: {
    from: string;
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    pdfAttachment?: { filename: string; content: Buffer };
    xmlAttachment?: { filename: string; content: Buffer };
  }): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const altBoundary = `alt_boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const header = [
      `From: =?utf-8?B?${Buffer.from(params.from).toString('base64')}?=`,
      `To: ${params.to}`,
      `Subject: =?utf-8?B?${Buffer.from(params.subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
    ].join('\r\n');

    let body = `--${boundary}\r\n`;
    body += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

    body += `--${altBoundary}\r\n`;
    body += 'Content-Type: text/plain; charset="UTF-8"\r\n';
    body += 'Content-Transfer-Encoding: base64\r\n\r\n';
    body += Buffer.from(params.bodyText).toString('base64') + '\r\n\r\n';

    body += `--${altBoundary}\r\n`;
    body += 'Content-Type: text/html; charset="UTF-8"\r\n';
    body += 'Content-Transfer-Encoding: base64\r\n\r\n';
    body += Buffer.from(params.bodyHtml).toString('base64') + '\r\n\r\n';
    body += `--${altBoundary}--\r\n\r\n`;

    if (params.pdfAttachment) {
      body += `--${boundary}\r\n`;
      body += `Content-Type: application/pdf; name="${params.pdfAttachment.filename}"\r\n`;
      body += 'Content-Transfer-Encoding: base64\r\n';
      body += `Content-Disposition: attachment; filename="${params.pdfAttachment.filename}"\r\n\r\n`;
      body += params.pdfAttachment.content.toString('base64') + '\r\n\r\n';
    }

    if (params.xmlAttachment) {
      body += `--${boundary}\r\n`;
      body += `Content-Type: application/xml; name="${params.xmlAttachment.filename}"\r\n`;
      body += 'Content-Transfer-Encoding: base64\r\n';
      body += `Content-Disposition: attachment; filename="${params.xmlAttachment.filename}"\r\n\r\n`;
      body += params.xmlAttachment.content.toString('base64') + '\r\n\r\n';
    }

    body += `--${boundary}--`;

    const fullMime = header + '\r\n' + body;
    return Buffer.from(fullMime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

export const gmailService = new GmailService();
