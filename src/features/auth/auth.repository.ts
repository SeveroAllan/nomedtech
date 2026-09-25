import { supabase } from '@/lib/supabase/client';
import type { AuthCredentials, SignUpCredentials, AuthResponse } from './types';

export class AuthRepository {
  /**
   * Realiza login real com e-mail e senha no Supabase Auth
   */
  public async signIn(credentials: AuthCredentials): Promise<AuthResponse> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  /**
   * Realiza cadastro real no Supabase Auth
   */
  public async signUp(credentials: SignUpCredentials): Promise<AuthResponse> {
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email.trim(),
      password: credentials.password,
      options: {
        data: {
          full_name: credentials.name || '',
        },
      },
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  /**
   * Realiza logout no Supabase Auth
   */
  public async signOut(): Promise<{ error?: string }> {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message };
  }

  /**
   * Obtém a sessão atual autenticada
   */
  public async getSession() {
    return supabase.auth.getSession();
  }

  /**
   * Obtém o usuário atual autenticado
   */
  public async getUser() {
    return supabase.auth.getUser();
  }
}
