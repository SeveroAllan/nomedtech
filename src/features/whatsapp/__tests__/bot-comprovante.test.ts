import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BotStateMachineService } from '../services/bot-state-machine.service';
import { supabaseAdmin } from '@/lib/supabase/server';
import { EvolutionClient } from '@/lib/integrations/evolution-client';
import { convenioNacionalService } from '@/lib/fiscal/convenio-nacional-service';
import { generateDanfsePdf } from '@/lib/fiscal/danfse-pdf-generator';

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/integrations/evolution-client');
vi.mock('@/lib/fiscal/convenio-nacional-service', () => ({
  convenioNacionalService: {
    obterConfiguracao: vi.fn(),
    cadastrarPrestador: vi.fn(),
    emitirNotaConsulta: vi.fn(),
    obterDanfseOriginalPdf: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/lib/fiscal/danfse-pdf-generator', () => ({
  generateDanfsePdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test')),
}));

describe('BotStateMachineService - handleEmissao', () => {
  let botService: BotStateMachineService;
  let mockEvolutionSendText: any;
  let mockEvolutionSendPdf: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEvolutionSendText = vi.fn().mockResolvedValue({ success: true });
    mockEvolutionSendPdf = vi.fn().mockResolvedValue({ success: true });
    vi.mocked(EvolutionClient).mockImplementation(() => ({
      sendTextMessage: mockEvolutionSendText,
      sendMediaPdf: mockEvolutionSendPdf,
      findLatestMediaMessage: vi.fn().mockResolvedValue(null),
      findMessages: vi.fn().mockResolvedValue([]),
    } as any));

    botService = new BotStateMachineService();
  });

  it('NÃO deve emitir nota quando o paciente não possui CPF e deve pedir o CPF', async () => {
    const doctorMock = {
      id: 'doc-123',
      name: 'Dr. Allan Severo',
      email: 'allan@gmail.com',
      cpf_cnpj: '33841732000163',
      city: 'Porto Alegre',
      tax_regime: 'simples_nacional',
      iss_rate: 2,
    };

    const mockChain = (returnVal: any) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      single: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'doctors') return mockChain(doctorMock) as any;
      if (table === 'patients') return mockChain(null) as any;
      if (table === 'subscriptions') return mockChain(null) as any;
      if (table === 'invoices') return mockChain({ id: 'inv-err' }) as any;
      return mockChain(null) as any;
    });

    await botService.handleEmissao(
      '555181936133',
      'Obrigado. Vou lhe enviar em instante sua NF no valor de R$ 400',
      'doc-123',
      'default',
      {}
    );

    expect(convenioNacionalService.emitirNotaConsulta).not.toHaveBeenCalled();

    // Deve solicitar o CPF do paciente para seguir com a emissão
    expect(mockEvolutionSendText).toHaveBeenCalledWith(
      'default',
      '555181936133',
      'Por favor, informe seu CPF para a emissão da nota fiscal:'
    );
  });

  it('deve emitir nota com a mensagem padrão quando o paciente tem CPF', async () => {
    const doctorMock = {
      id: 'doc-123',
      name: 'Dr. Allan Severo',
      email: 'allan@gmail.com',
      cpf_cnpj: '33841732000163',
      city: 'Porto Alegre',
      tax_regime: 'simples_nacional',
      iss_rate: 2,
    };

    const patientMock = {
      id: 'pat-999',
      doctor_id: 'doc-123',
      name: 'Mariana Lima',
      cpf: '98765432100',
      email: 'mariana@paciente.com',
      phone: '(51) 98193-6133',
    };

    const mockChain = (returnVal: any) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      single: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'doctors') return mockChain(doctorMock) as any;
      if (table === 'patients') return mockChain(patientMock) as any;
      if (table === 'subscriptions') return mockChain(null) as any;
      if (table === 'invoices') return mockChain({ id: 'inv-123' }) as any;
      return mockChain(null) as any;
    });

    vi.mocked(convenioNacionalService.obterConfiguracao).mockReturnValue({
      ambiente: 2,
    } as any);
    vi.mocked(convenioNacionalService.emitirNotaConsulta).mockResolvedValue({
      sucesso: true,
      nDPS: '100',
      chNFSe: '43260933841732000163560000000000000000000100',
      resultado: {},
    });

    await botService.handleEmissao(
      '555181936133',
      'Vou lhe enviar em instante sua NF no valor de R$ 400',
      'doc-123',
      'default',
      {}
    );

    expect(convenioNacionalService.emitirNotaConsulta).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(convenioNacionalService.emitirNotaConsulta).mock.calls[0][0];
    expect(callArgs.valor).toBe(400);
    expect(callArgs.patient.name).toBe('Mariana Lima');
    expect(callArgs.patient.cpf).toBe('98765432100');
    expect(callArgs.descricao).toContain('CONSULTA MEDICA REALIZADA EM');
  });

  it('deve incluir condicionais extras na descrição quando enviadas após o valor', async () => {
    const doctorMock = {
      id: 'doc-123',
      name: 'Dr. Allan Severo',
      email: 'allan@gmail.com',
      cpf_cnpj: '33841732000163',
      city: 'Porto Alegre',
      tax_regime: 'simples_nacional',
      iss_rate: 2,
    };

    const patientMock = {
      id: 'pat-999',
      doctor_id: 'doc-123',
      name: 'Mariana Lima',
      cpf: '98765432100',
      email: 'mariana@paciente.com',
      phone: '(51) 98193-6133',
    };

    const mockChain = (returnVal: any) => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      single: vi.fn().mockResolvedValue({ data: returnVal, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'doctors') return mockChain(doctorMock) as any;
      if (table === 'patients') return mockChain(patientMock) as any;
      if (table === 'subscriptions') return mockChain(null) as any;
      if (table === 'invoices') return mockChain({ id: 'inv-123' }) as any;
      return mockChain(null) as any;
    });

    vi.mocked(convenioNacionalService.obterConfiguracao).mockReturnValue({
      ambiente: 2,
    } as any);
    vi.mocked(convenioNacionalService.emitirNotaConsulta).mockResolvedValue({
      sucesso: true,
      nDPS: '101',
      chNFSe: '43260933841732000163560000000000000000000101',
      resultado: {},
    });

    await botService.handleEmissao(
      '555181936133',
      'Vou lhe enviar em instante sua NF no valor de R$ 600,00 das consultas 10/09 e 17/09',
      'doc-123',
      'default',
      {}
    );

    expect(convenioNacionalService.emitirNotaConsulta).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(convenioNacionalService.emitirNotaConsulta).mock.calls[0][0];
    expect(callArgs.valor).toBe(600);
    expect(callArgs.descricao).toBe(
      'CONSULTA MEDICA REALIZADA DAS CONSULTAS 10/09 E 17/09 COM DR. ALLAN SEVERO'
    );
  });
});
