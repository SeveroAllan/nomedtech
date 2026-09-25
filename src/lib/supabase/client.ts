import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lplgvpcjiftognaclecw.supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ljMNsq8gMjkC7P9IJPDB8A_w6OkrVXv';

// Client público do navegador com suporte a SSR e cookies
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseKey);
