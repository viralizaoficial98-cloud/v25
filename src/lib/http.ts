/**
 * Cliente HTTP da API PHP (/api). Mesma origem: o cookie de sessão (HttpOnly) é enviado
 * automaticamente; o token CSRF vai no cabeçalho X-CSRF-Token em pedidos que alteram dados.
 * O frontend nunca liga directamente à base de dados.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

let csrfToken = '';
export function setCsrfToken(t: string | null | undefined) {
  if (t) csrfToken = t;
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Notificado quando a API responde 401 (sessão expirada) num pedido do painel. */
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly details?: unknown) {
    super(code);
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  blob?: boolean;
  /** uso interno: evita ciclo ao renovar o CSRF */
  retried?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.json !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError('SEM_LIGACAO', 0);
  }

  if (res.ok) {
    if (opts.blob) return (await res.blob()) as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  let code = `ERRO_HTTP_${res.status}`;
  let details: unknown;
  try {
    const data = await res.json();
    if (data?.error) code = String(data.error);
    details = data?.details;
  } catch {
    /* resposta sem JSON (ex.: erro do servidor web) */
  }
  // Token CSRF expirado (ex.: sessão renovada): obtém um novo e repete uma vez
  if (code === 'CSRF_INVALIDO' && !opts.retried) {
    const s = await api<{ csrf_token: string }>('/auth/session');
    setCsrfToken(s.csrf_token);
    return api<T>(path, { ...opts, retried: true });
  }
  if (res.status === 401 && path.startsWith('/admin')) unauthorizedListeners.forEach((fn) => fn());
  throw new ApiError(code, res.status, details);
}

/** URL pública de um ficheiro carregado (galeria, linha do tempo, integrantes). */
export const MEDIA_BASE: string = (import.meta.env.VITE_MEDIA_URL as string | undefined)?.replace(/\/$/, '') || `${import.meta.env.BASE_URL.replace(/\/$/, '')}/uploads/media`;
