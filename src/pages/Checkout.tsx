import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CheckoutFlow } from '@/components/checkout/CheckoutFlow';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** Checkout em página (ligações directas /checkout?tipo=…); o site abre o mesmo fluxo num popup. */
export default function Checkout() {
  useDocumentTitle('Comprar bilhete · V25 — O Legado');
  const [params] = useSearchParams();
  const mode = params.get('modo') === 'reserva' ? 'reserva' : 'compra';
  return (
    <Shell title={mode === 'reserva' ? 'Reservar lugar' : 'Comprar bilhete'}>
      <div className="mx-auto max-w-3xl">
        <CheckoutFlow initialTypeId={params.get('tipo') ?? undefined} mode={mode} />
      </div>
    </Shell>
  );
}

function Shell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="container max-w-6xl pb-24 pt-28 md:pt-36">
      <Link to="/#ingressos" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-fg-muted hover:text-gold-deep">
        <ArrowLeft className="h-4 w-4" /> Voltar aos bilhetes
      </Link>
      <h1 className="mb-6 text-4xl font-semibold md:text-6xl">{title}</h1>
      {children}
    </div>
  );
}
