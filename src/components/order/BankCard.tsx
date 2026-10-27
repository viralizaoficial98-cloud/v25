import { Landmark, Smartphone } from 'lucide-react';
import { CopyButton } from '@/components/ui/misc';
import { formatKz } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PaymentMethod } from '@/lib/types';

export function groupIban(iban: string) {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

interface Props {
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  saving?: boolean;
  /** Coordenadas validadas pela organização (sem validação nada é mostrado) */
  confirmed: boolean;
  accountName: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  expressNumber: string;
  amount: number;
  reference: string;
}

function Line({ label, value, copy, mono = true, accent }: { label: string; value: string; copy?: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fg/10 pb-4 last:border-0 last:pb-0">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">{label}</dt>
        <dd className={cn('mt-1 break-all text-lg text-fg', mono && 'font-mono tracking-wider', accent && 'font-semibold text-gold-deep')}>{value}</dd>
      </div>
      {copy && <CopyButton value={copy} label="Copiar" />}
    </div>
  );
}

/**
 * Etapa 4 — dados oficiais de pagamento (vindos da base de dados, só mostrados
 * na página do pedido) com escolha entre Transferência Bancária e Express.
 */
export function BankCard({ method, onMethod, saving, confirmed, accountName, bankName, accountNumber, iban, expressNumber, amount, reference }: Props) {
  const hasTransfer = Boolean(iban || accountNumber);
  const hasExpress = Boolean(expressNumber);
  // Só são oferecidos os métodos com dados oficiais configurados
  const active: PaymentMethod = method === 'express' && hasExpress ? 'express' : hasTransfer ? 'transferencia' : 'express';
  const missing = !confirmed || (active === 'express' ? !hasExpress : !hasTransfer);
  const tab = (m: PaymentMethod, label: string, Icon: typeof Landmark) => (
    <button
      type="button"
      role="tab"
      aria-selected={active === m}
      disabled={saving}
      onClick={() => onMethod(m)}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition',
        active === m ? 'bg-paper text-fg shadow-soft ring-1 ring-gold/50' : 'text-fg-muted hover:text-fg',
      )}
    >
      <Icon className="h-4 w-4 text-gold" aria-hidden /> {label}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-gold/40 bg-paper p-6 shadow-card md:p-8">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold-metal" />
      <p className="eyebrow">Etapa 4 · Pagamento</p>
      <h2 className="mt-2 font-display text-3xl font-semibold text-fg">Escolha como pagar</h2>

      <div role="tablist" aria-label="Método de pagamento" className="mt-6 flex gap-1 rounded-2xl bg-paper-muted p-1">
        {(hasTransfer || !confirmed) && tab('transferencia', 'Transferência Bancária', Landmark)}
        {(hasExpress || !confirmed) && tab('express', 'Transferência Express', Smartphone)}
      </div>

      <div role="tabpanel" className="mt-6">
        {missing ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-300">
            Os dados de pagamento estão a ser validados pela organização. <strong>Não efectue nenhuma transferência</strong> até
            os dados oficiais aparecerem nesta página (actualize-a mais tarde ou contacte a organização).
          </p>
        ) : (
          <dl className="space-y-4">
            {accountName && <Line label="Titular" value={accountName} mono={false} />}
            {active === 'transferencia' ? (
              <>
                {bankName && <Line label="Banco" value={bankName} mono={false} />}
                {accountNumber && <Line label="Conta" value={accountNumber} copy={accountNumber.replace(/\s+/g, '')} />}
                {iban && <Line label="IBAN" value={groupIban(iban)} copy={iban.replace(/\s+/g, '')} accent />}
              </>
            ) : (
              <Line label="Número Express" value={expressNumber} copy={expressNumber.replace(/\s+/g, '')} accent />
            )}
          </dl>
        )}
      </div>

      <div className="mt-7 grid gap-4 rounded-2xl bg-gold-soft p-5 ring-1 ring-gold/30 sm:grid-cols-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Valor exacto a pagar</p>
            <p className="mt-1 font-display text-3xl font-semibold text-gold-metal">{formatKz(amount)}</p>
          </div>
          <CopyButton value={String(amount)} label="Copiar" />
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Descritivo / referência</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-wider text-fg">{reference}</p>
          </div>
          <CopyButton value={reference} label="Copiar" />
        </div>
      </div>
      <p className="mt-4 text-xs text-fg-muted">Indique o número do pedido no descritivo da transferência para facilitar a validação.</p>
    </div>
  );
}
