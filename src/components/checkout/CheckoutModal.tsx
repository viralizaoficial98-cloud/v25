import { Ticket } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { CheckoutFlow } from './CheckoutFlow';

/** Popup de compra (fundo branco, detalhes dourados) — o mesmo fluxo da página /checkout. */
export default function CheckoutModal({ ticketTypeId, open, onOpenChange }: { ticketTypeId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-3xl bg-paper p-4 sm:p-6"
      title={<span className="flex items-center gap-2"><Ticket className="h-5 w-5 text-gold" aria-hidden /> Comprar bilhete</span>}
      description="Pagamento por transferência. O bilhete é emitido depois da validação financeira."
    >
      <CheckoutFlow initialTypeId={ticketTypeId} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
