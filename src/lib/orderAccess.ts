/**
 * Acesso do cliente ao pedido: código + token secreto.
 * O token vai no fragmento do URL (#t=…), que nunca é enviado a servidores nem a
 * terceiros via Referer, e é guardado localmente apenas neste dispositivo.
 */
const KEY = 'v25.orders';

export interface SavedOrder {
  code: string;
  token: string;
  savedAt: string;
}

function read(): SavedOrder[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.code === 'string' && typeof x.token === 'string') : [];
  } catch {
    return [];
  }
}

export function savedOrders(): SavedOrder[] {
  return read();
}

export function saveOrderAccess(code: string, token: string) {
  try {
    const list = read().filter((o) => o.code !== code);
    list.unshift({ code, token, savedAt: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* armazenamento indisponível: o cliente mantém a ligação/email */
  }
}

export function forgetOrderAccess(code: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(read().filter((o) => o.code !== code)));
  } catch {
    /* ignorar */
  }
}

export function tokenFor(code: string): string | null {
  return read().find((o) => o.code === code)?.token ?? null;
}

export function orderPath(code: string, token: string) {
  return `/pedido/${encodeURIComponent(code)}#t=${encodeURIComponent(token)}`;
}

export function orderUrl(code: string, token: string) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
  return `${base}${orderPath(code, token)}`;
}

export function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}
