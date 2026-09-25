import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailService } from '../gmail.service';
import { googleClientService } from '@/lib/integrations/google-client';
import { google } from 'googleapis';

vi.mock('googleapis', () => {
  const mockSend = vi.fn().mockResolvedValue({
    data: { id: 'msg-gmail-123', threadId: 'thread-123' },
  });

  return {
    google: {
      gmail: vi.fn().mockReturnValue({
        users: {
          messages: {
            send: mockSend,
          },
        },
      }),
    },
  };
});

vi.mock('@/lib/integrations/google-client', () => ({
  googleClientService: {
    getAuthenticatedClient: vi.fn(),
  },
}));

describe('GmailService', () => {
  let service: GmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GmailService();
  });

  it('deve disparar mensagem MIME e chamar a API do Gmail', async () => {
    (googleClientService.getAuthenticatedClient as any).mockResolvedValue({
      oauth2Client: {},
      integration: { googleEmail: 'medico@consultorio.com' },
    });

    const result = await service.sendInvoiceEmail({
      doctorId: 'doc-123',
      recipientEmail: 'paciente@gmail.com',
      patientName: 'Lucas Lima',
      doctorName: 'Dr. Roberto',
      invoiceNumber: '104',
      amount: 450,
      pdfBuffer: Buffer.from('mock pdf content'),
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-gmail-123');
    expect(result.recipientEmail).toBe('paciente@gmail.com');
  });

  it('deve lançar erro se o destinatário for vazio', async () => {
    await expect(
      service.sendInvoiceEmail({
        doctorId: 'doc-123',
        recipientEmail: '',
        patientName: 'Sem Email',
      })
    ).rejects.toThrow('E-mail do destinatário não informado');
  });
});
