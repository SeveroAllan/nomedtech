import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

function getOptionalEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function isValidHttpUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const rawSupabaseUrl = getOptionalEnv('NEXT_PUBLIC_SUPABASE_URL');
const defaultSupabaseUrl = 'https://lplgvpcjiftognaclecw.supabase.co';
const supabaseUrl = isValidHttpUrl(rawSupabaseUrl) ? rawSupabaseUrl : defaultSupabaseUrl;

const supabasePublishableKey =
  getOptionalEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  getOptionalEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  'sb_publishable_ljMNsq8gMjkC7P9IJPDB8A_w6OkrVXv';
const serviceRoleKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');

function createAdminClientFallback() {
  return {
    from: () => {
      throw new Error('Supabase admin client is unavailable because required environment variables are missing.');
    },
    auth: {
      admin: {
        createUser: async () => {
          throw new Error('Supabase admin auth is unavailable because required environment variables are missing.');
        },
      },
    },
    storage: undefined,
  } as any;
}

/**
 * Client server-side com contexto de cookies do usuário (para Server Components e Server Actions)
 */
export async function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Chamado de Server Component, ignorado se middleware estiver ativo
        }
      },
    },
  });
}

/**
 * Client administrativo (service_role) para uso exclusivo em Route Handlers de Webhooks
 * Quando a env não está configurada (ex.: testes locais sem Supabase), ele falha de forma explícita
 * sem quebrar o processo de inicialização.
 */
export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : createAdminClientFallback();

export async function getAuthenticatedDoctorId(): Promise<string | null> {
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error || !user) {
      return null;
    }

    const { data: doctor } = await supabaseAdmin
      .from('doctors')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    return doctor?.id || null;
  } catch {
    return null;
  }
}
