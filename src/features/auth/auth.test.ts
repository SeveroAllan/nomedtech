import { describe, it, expect, vi } from 'vitest';
import { AuthRepository } from './auth.repository';

// Mock do supabase client apenas no teste unitário de repositório para validar o contrato
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(async ({ email, password }) => {
        if (password === 'senha-invalida') {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        return {
          data: {
            user: { id: 'usr-123', email },
            session: { access_token: 'fake-jwt-token' },
          },
          error: null,
        };
      }),
      signUp: vi.fn(async ({ email }) => ({
        data: {
          user: { id: 'usr-new', email },
          session: null,
        },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  },
}));

describe('AuthRepository', () => {
  const repo = new AuthRepository();

  it('deve realizar login com sucesso com credenciais válidas', async () => {
    const res = await repo.signIn({
      email: 'dr.ricardo@clinica.com.br',
      password: 'password123',
    });

    expect(res.user).not.toBeNull();
    expect(res.user?.email).toBe('dr.ricardo@clinica.com.br');
    expect(res.error).toBeUndefined();
  });

  it('deve retornar erro quando as credenciais forem inválidas', async () => {
    const res = await repo.signIn({
      email: 'dr.ricardo@clinica.com.br',
      password: 'senha-invalida',
    });

    expect(res.user).toBeNull();
    expect(res.error).toBe('Invalid login credentials');
  });

  it('deve cadastrar novo médico no Supabase Auth', async () => {
    const res = await repo.signUp({
      email: 'novo.medico@clinica.com.br',
      password: 'strongPassword123',
      name: 'Dr. Lucas Santos',
    });

    expect(res.user).not.toBeNull();
    expect(res.user?.email).toBe('novo.medico@clinica.com.br');
  });
});
