import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBrazilianPhoneVariations, PatientsRepository } from '../patients.repository';
import { supabaseAdmin } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('getBrazilianPhoneVariations', () => {
  it('deve gerar variações completas para número de WhatsApp de 12 dígitos sem o 9 (555181936133)', () => {
    const vars = getBrazilianPhoneVariations('555181936133');

    expect(vars.ddd).toBe('51');
    expect(vars.subscriber8).toBe('81936133');
    expect(vars.subscriber9).toBe('981936133');

    // Deve conter variações com e sem 9, com e sem 55, e formatadas
    expect(vars.allVariants).toContain('555181936133');
    expect(vars.allVariants).toContain('5181936133');
    expect(vars.allVariants).toContain('5551981936133');
    expect(vars.allVariants).toContain('51981936133');
    expect(vars.allVariants).toContain('(51) 98193-6133');
    expect(vars.allVariants).toContain('(51) 8193-6133');
  });

  it('deve gerar variações para número com 13 dígitos contendo o 9 (5551981936133)', () => {
    const vars = getBrazilianPhoneVariations('5551981936133');

    expect(vars.ddd).toBe('51');
    expect(vars.subscriber8).toBe('81936133');
    expect(vars.subscriber9).toBe('981936133');

    expect(vars.allVariants).toContain('555181936133');
    expect(vars.allVariants).toContain('5181936133');
    expect(vars.allVariants).toContain('5551981936133');
    expect(vars.allVariants).toContain('51981936133');
    expect(vars.allVariants).toContain('(51) 98193-6133');
  });

  it('deve lidar com número formatado do cadastro (51) 98193-6133', () => {
    const vars = getBrazilianPhoneVariations('(51) 98193-6133');

    expect(vars.ddd).toBe('51');
    expect(vars.subscriber8).toBe('81936133');
    expect(vars.subscriber9).toBe('981936133');
    expect(vars.allVariants).toContain('555181936133');
    expect(vars.allVariants).toContain('5551981936133');
  });
});

describe('PatientsRepository.findPatientByPhone', () => {
  let repo: PatientsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PatientsRepository();
  });

  it('deve encontrar o paciente quando o banco tem o telefone formatado com traço', async () => {
    const mockPatient = {
      id: 'pat-123',
      doctor_id: 'doc-1',
      name: 'João Paciente Real',
      cpf: '98765432100',
      phone: '(51) 98193-6133',
    };

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockPatient, error: null }),
    };

    vi.mocked(supabaseAdmin.from).mockReturnValue(mockQuery as any);

    const result = await repo.findPatientByPhone('doc-1', '555181936133');

    expect(result).toEqual(mockPatient);
    expect(mockQuery.in).toHaveBeenCalled();
  });

  it('deve retornar null se o paciente não for encontrado em nenhuma variação', async () => {
    const mockQuery1 = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const mockQuery2 = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    vi.mocked(supabaseAdmin.from)
      .mockReturnValueOnce(mockQuery1 as any)
      .mockReturnValueOnce(mockQuery2 as any)
      .mockReturnValueOnce(mockQuery1 as any)
      .mockReturnValueOnce(mockQuery2 as any);

    const result = await repo.findPatientByPhone('doc-1', '551100001111');
    expect(result).toBeNull();
  });
});

describe('PatientsRepository.createPatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve rejeitar cadastro sem CPF válido antes de acessar o banco', async () => {
    const repo = new PatientsRepository();

    await expect(
      repo.createPatient({
        doctor_id: 'doc-1',
        name: 'Paciente sem CPF',
        cpf: '',
        phone: '5551999999999',
      })
    ).rejects.toThrow('CPF válido é obrigatório');

    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
