import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

const defaultUrl = 'https://lplgvpcjiftognaclecw.supabase.co';
const defaultKey = 'sb_publishable_ljMNsq8gMjkC7P9IJPDB8A_w6OkrVXv';

function isValidHttpUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseUrl = isValidHttpUrl(rawUrl) ? rawUrl! : defaultUrl;

const rawKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const supabaseKey = (rawKey && rawKey.length > 20) ? rawKey : defaultKey;

// Client público do navegador com suporte a SSR e cookies
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseKey);
