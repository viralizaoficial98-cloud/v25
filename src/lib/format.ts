export const EVENT_TZ = 'Africa/Luanda';

const kz = new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 15000 → "15 000 Kz" (separador de milhares com espaço fino, como em pt-AO). */
export function formatKz(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${kz.format(n).replace(/ | |\./g, ' ')} Kz`;
}

export function formatDateTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: EVENT_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(new Date(iso));
}

export function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: EVENT_TZ, day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(iso))
    .replace(/^(\d+) de (\w)/, (_m, d: string, c: string) => `${d} de ${c.toUpperCase()}`);
}

export function formatEventTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('pt-PT', { timeZone: EVENT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '';
  return `${h}h${m}`;
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Tempo restante até `targetIso` (o ISO inclui o fuso, por isso é independente do relógio local). */
export function remainingUntil(targetIso: string, now: number = Date.now()): Remaining {
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** ISO → valor para <input type="datetime-local"> na hora de Luanda (WAT, UTC+1 sem horário de verão). */
export function toLuandaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (hora de Luanda) → ISO com fuso. */
export function fromLuandaInput(v: string): string | null {
  if (!v) return null;
  return `${v.length === 16 ? `${v}:00` : v}+01:00`;
}

/** Data sem hora ("2019-12-14") → "14 de dezembro de 2019" (sem desvios de fuso). */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
