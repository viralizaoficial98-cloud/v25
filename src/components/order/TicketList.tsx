import { useEffect, useState } from 'react';
import { Download, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { qrDataUrl } from '@/lib/ticketPdf';
import { downloadTicketsPdf } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatEventDate, formatEventTime } from '@/lib/format';
import type { CustomerOrder, EventSettings, OrderTicket } from '@/lib/types';

function TicketCard({ t, order, settings }: { t: OrderTicket; order: CustomerOrder; settings: EventSettings }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void qrDataUrl(t.qr_payload, 480).then(setQr);
  }, [t.qr_payload]);
  return (
    <li className="relative overflow-hidden rounded-[1.75rem] border border-gold/30 bg-gradient-to-br from-espresso to-paper-soft md:flex">
      <div className="flex-1 p-6 md:p-7">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-3xl">
            <span className="text-gold-metal font-bold">V25</span> <span className="text-xl tracking-[0.2em]">O LEGADO</span>
          </p>
          {t.status === 'valido' ? <Badge tone="ok">Válido</Badge> : t.status === 'utilizado' ? <Badge tone="warn">Utilizado</Badge> : <Badge tone="bad">Anulado</Badge>}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2">
            <dt className="text-[11px] uppercase tracking-[0.2em] text-fg/45">Participante</dt>
            <dd className="font-semibold text-fg">{t.holder_name}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-fg/45">Data</dt>
            <dd className="text-fg">{formatEventDate(settings.starts_at)} · {formatEventTime(settings.starts_at)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.2em] text-fg/45">Categoria</dt>
            <dd className="text-fg">{order.ticket_type.name}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] uppercase tracking-[0.2em] text-fg/45">Local</dt>
            <dd className="text-fg">{settings.venue}, {settings.address}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-fg/45">Ingresso {t.seq} de {order.quantity}{t.checked_in_at ? ` · Entrada registada em ${formatDateTime(t.checked_in_at)}` : ''}</p>
      </div>
      <div className="flex flex-col items-center justify-center border-t border-dashed border-gold/30 bg-black/25 p-6 md:border-l md:border-t-0">
        {qr ? (
          <img src={qr} alt={`QR Code do ingresso ${t.ticket_code}`} className="h-44 w-44 rounded-xl bg-white p-2" />
        ) : (
          <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-fg/5"><QrCode className="h-10 w-10 text-gold/40" /></div>
        )}
        <p className="mt-3 font-mono text-base font-bold tracking-widest text-gold-light">{t.ticket_code}</p>
      </div>
    </li>
  );
}

export function TicketList({ order, settings, token }: { order: CustomerOrder; settings: EventSettings; token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-3xl font-semibold">Os seus ingressos</h3>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await downloadTicketsPdf(order.order_code, token);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download className="h-4 w-4" aria-hidden /> Descarregar PDF
        </Button>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-800">{error}</p>}
      <ul className="space-y-5">
        {order.tickets.map((t) => (
          <TicketCard key={t.ticket_code} t={t} order={order} settings={settings} />
        ))}
      </ul>
      <p className="mt-4 text-xs text-fg/50">Cada QR Code é individual e válido para uma única entrada. Não partilhe os seus ingressos.</p>
    </div>
  );
}
