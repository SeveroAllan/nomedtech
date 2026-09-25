import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

// Mock do supabaseAdmin
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'doctors') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'doc_mock_123',
              name: 'Dr. Roberto Teste',
              cpf_cnpj: '12345678000195',
              inscricao_municipal: '123456',
              email: 'roberto@teste.med.br',
              iss_rate: 2.0,
            },
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { doctor_id: 'doc_mock_123' },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
      };
    }),
  },
}));

// Mock do FocusNfeClient
vi.mock('@/lib/integrations/focus-nfe-client', () => {
  return {
    FocusNfeClient: vi.fn().mockImplementation(() => ({
      emitirNfse: vi.fn().mockResolvedValue({
        status: 'processando_autorizacao',
        numero: '123',
        codigo_verificacao: 'ABC-123',
      }),
    })),
  };
});

describe('Webhook Mercado Pago Money Out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET responde 200 com status ok', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/mercadopago');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('POST responde 200 mesmo quando payload não contém ID', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/mercadopago', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
    expect(data.warning).toBeDefined();
  });

  it('POST processa webhook com sucesso e dispara nota de homologação Focus NFe', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/mercadopago', {
      method: 'POST',
      body: JSON.stringify({
        id: 'tx_123456789',
        action: 'transfer.processed',
        status: 'processed',
        external_reference: 'DOC_doc_mock_123_1700000000000',
      }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.doctorId).toBe('doc_mock_123');
    expect(data.homologationInvoice).toBeDefined();
    expect(data.homologationInvoice.reference).toContain('homolog-');
  });
});
