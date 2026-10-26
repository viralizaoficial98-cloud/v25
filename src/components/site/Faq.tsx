import * as A from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { CmsHeading, Spinner } from '@/components/ui/misc';
import { fetchFaqs } from '@/lib/api';
import { useAsync } from '@/hooks/useAsync';
import { useSite } from '@/hooks/useSite';
import type { Faq as FaqT } from '@/lib/types';

/** Usado apenas se a API estiver indisponível (mesmo conteúdo do seed). */
const FALLBACK: Pick<FaqT, 'id' | 'question' | 'answer'>[] = [
  {
    id: 'f1',
    question: 'Carregar o comprovativo confirma o meu pagamento?',
    answer:
      'Não. O comprovativo é analisado manualmente pela equipa financeira, que confirma a entrada do valor na conta. Só depois dessa verificação o pagamento é aprovado e o ingresso digital é emitido.',
  },
  {
    id: 'f2',
    question: 'Quando e onde é o evento?',
    answer: 'A 20 de Dezembro de 2026, às 16h00, no Hotel Brisa Tropical, Morro Bento, Luanda.',
  },
];

export function Faq() {
  const { data, loading, error } = useAsync(fetchFaqs, []);
  const faqs = error ? FALLBACK : (data ?? []);

  return (
    <section id="faq" className="section" aria-labelledby="faq-titulo">
      <div className="container max-w-3xl">
        <CmsHeading id="faq-titulo" s={useSite().content.faq} />
        {loading ? (
          <div className="flex justify-center"><Spinner /></div>
        ) : (
          <A.Root type="single" collapsible className="divide-y divide-fg/10 rounded-3xl border border-gold/15 bg-paper-soft/50">
            {faqs.map((f) => (
              <A.Item key={f.id} value={f.id}>
                <A.Header>
                  <A.Trigger className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-display text-xl text-fg transition hover:text-gold-light md:text-2xl">
                    {f.question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-gold transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden />
                  </A.Trigger>
                </A.Header>
                <A.Content className="overflow-hidden px-6 text-fg/70 data-[state=closed]:hidden">
                  <p className="whitespace-pre-line pb-6 leading-relaxed">{f.answer}</p>
                </A.Content>
              </A.Item>
            ))}
          </A.Root>
        )}
      </div>
    </section>
  );
}
