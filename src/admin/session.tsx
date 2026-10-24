import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { StaffRole } from '@/lib/types';

interface AdminCtx {
  session: Session | null;
  role: StaffRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminCtx | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = useCallback(async (s: Session | null) => {
    if (!s || !supabase) {
      setRole(null);
      return;
    }
    // O perfil é sempre confirmado no servidor (RLS/RPC); aqui serve apenas para a interface.
    const { data } = await supabase.rpc('current_staff_role');
    setRole((data as StaffRole | null) ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRole(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      void loadRole(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadRole]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('BACKEND_NAO_CONFIGURADO');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    await loadRole(data.session);
  };
  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setRole(null);
  };

  return <Ctx.Provider value={{ session, role, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin fora do provider');
  return c;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  checkin: 'Operador de check-in',
};
