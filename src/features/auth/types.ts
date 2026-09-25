import type { User, Session } from '@supabase/supabase-js';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials extends AuthCredentials {
  name?: string;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error?: string;
}
