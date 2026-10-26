import { Landmark, Smartphone } from 'lucide-react';
import { CopyButton } from '@/components/ui/misc';
import { formatKz } from '@/lib/format';

export function groupIban(iban: string) {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

interface Props {
  accountName: string;
  accountNumber: string;
  iban: string;
  expressNumber: string;
  amount: number;
  reference: string;
}

/** Cartão premium com os dados oficiais de pagamento (vindos da base de dados). */
export function BankCard({ accountName, accountNumber, iban, expressNumber, amount, reference }: Props) {
  const missing = !iban && !accountNumber && !expressNumber;
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-gold/40 bg-[linear-gradient(135deg,#2b1d13_0%,#120d09_45%,#1a130d_100%)] p-6 shadow-glow md:p-8">
      <div aria-hidden className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gold-metal" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Dados para pagamento</p>
          <p className="mt-2 font-display text-2xl text-fg md:text-3xl">Transferência bancária</p>
        </div>
        <Landmark className="h-8 w-8 text-gold" aria-hidden />
      </div>

      {missing ? (
        <p className="relative mt-6 text-sm text-amber-800">Os dados bancários ainda não foram configurados pela organização. Contacte a equipa antes de transferir.</p>
      ) : (
        <dl className="relative mt-7 space-y-5">
          {accountName && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">Nome da conta</dt>
              <dd className="mt-1 font-semibold text-fg">{accountName}</dd>
            </div>
          )}
          {accountNumber && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">Número da conta</dt>
                <dd className="mt-1 font-mono text-lg tracking-wider text-fg">{accountNumber}</dd>
              </div>
              <CopyButton value={accountNumber} label="Copiar conta" />
            </div>
          )}
          {iban && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">IBAN</dt>
                <dd className="mt-1 break-all font-mono text-lg tracking-wider text-gold-light">{groupIban(iban)}</dd>
              </div>
              <CopyButton value={iban.replace(/\s+/g, '')} label="Copiar IBAN" />
            </div>
          )}
          {expressNumber && (
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-fg/10 pt-5">
              <div>
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">
                  <Smartphone className="h-3.5 w-3.5" aria-hidden /> Transferência Express
                </dt>
                <dd className="mt-1 font-mono text-lg tracking-wider text-fg">{expressNumber}</dd>
              </div>
              <CopyButton value={expressNumber.replace(/\s+/g, '')} label="Copiar número Express" />
            </div>
          )}
        </dl>
      )}

      <div className="relative mt-7 grid gap-4 rounded-2xl bg-black/30 p-4 ring-1 ring-gold/20 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">Valor a transferir</p>
          <p className="mt-1 font-display text-3xl text-gold-metal">{formatKz(amount)}</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg/45">Descritivo / referência</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-wider text-fg">{reference}</p>
          </div>
          <CopyButton value={reference} label="Copiar" />
        </div>
      </div>
    </div>
  );
}
