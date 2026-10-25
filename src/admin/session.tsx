import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onUnauthorized, setCsrfToken } from '@/lib/http';
import type { StaffRole } from '@/lib/types';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
}

interface SessionResponse {
  user: SessionUser | null;
  role: StaffRole | null;
  permissions: string[];
  csrf_token: string;
  needs_setup?: boolean;
}

interface AdminCtx {
  user: SessionUser | null;
  role: StaffRole | null;
  permissions: string[];
  needsSetup: boolean;
  loading: boolean;
  can: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AdminCtx | null>(null);

/** Sessão do painel: cookie HttpOnly gerido pelo servidor PHP; o perfil é sempre verificado no servidor. */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: SessionUser | null; role: StaffRole | null; permissions: string[]; needsSetup: boolean }>({
    user: null,
    role: null,
    permissions: [],
    needsSetup: false,
  });
  const [loading, setLoading] = useState(true);

  const apply = (s: SessionResponse) => {
    setCsrfToken(s.csrf_token);
    setState((prev) => ({ user: s.user, role: s.role, permissions: s.permissions ?? [], needsSetup: s.needs_setup ?? prev.needsSetup }));
  };

  const refresh = useCallback(async () => {
    try {
      apply(await api<SessionResponse>('/auth/session'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Sessão expirada noutro pedido → volta ao ecrã de entrada
    const off = onUnauthorized(() => setState((s) => ({ ...s, user: null, role: null, permissions: [] })));
    return () => {
      off();
    };
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    // Garante um token CSRF antes do login
    if (!state.user) apply(await api<SessionResponse>('/auth/session'));
    apply(await api<SessionResponse>('/auth/login', { json: { email, password } }));
  };

  const signOut = async () => {
    try {
      const r = await api<{ csrf_token: string }>('/auth/logout', { method: 'POST' });
      setCsrfToken(r.csrf_token);
    } finally {
      setState((s) => ({ ...s, user: null, role: null, permissions: [] }));
    }
  };

  const can = (p: string) => state.permissions.includes(p);

  return <Ctx.Provider value={{ ...state, loading, can, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
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
