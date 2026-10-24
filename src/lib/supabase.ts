import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quando as variáveis do Supabase estão definidas no build. */
export const isBackendConfigured = Boolean(url && anonKey);

/**
 * Cliente Supabase (apenas chave pública "anon"; a segurança é garantida por RLS e RPCs).
 * É null quando o backend ainda não está configurado — a interface mostra então um estado
 * "integração pendente" em vez de simular operações.
 */
export const supabase: SupabaseClient | null = isBackendConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'v25-admin-auth' },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('BACKEND_NAO_CONFIGURADO');
  return supabase;
}
