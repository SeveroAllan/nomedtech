import { describe, it, expect } from 'vitest';
import { validateCPF, validateCNPJ } from './validators';

describe('Validators', () => {
  it('deve validar CPFs válidos e rejeitar inválidos', () => {
    // CPFs com dígitos verificadores matematicamente válidos
    expect(validateCPF('52998224725')).toBe(true);
    expect(validateCPF('11111111111')).toBe(false);
    expect(validateCPF('123')).toBe(false);
  });

  it('deve validar CNPJs válidos e rejeitar inválidos', () => {
    // 12345678000195 e 11444777000161 são válidos
    expect(validateCNPJ('12345678000195')).toBe(true);
    expect(validateCNPJ('11444777000161')).toBe(true);
    expect(validateCNPJ('12345678000100')).toBe(false);
    expect(validateCNPJ('00000000000000')).toBe(false);
  });
});
