import type { ComponentType } from 'react';
import { Hero } from '@/components/site/Hero';
import { About } from '@/components/site/About';
import { Banner } from '@/components/site/Banner';
import { Timeline } from '@/components/site/Timeline';
import { Group } from '@/components/site/Group';
import { EventInfo } from '@/components/site/EventInfo';
import { Tickets } from '@/components/site/Tickets';
import { EventGallery } from '@/components/site/EventGallery';
import { Memories } from '@/components/site/Memories';
import { Faq } from '@/components/site/Faq';
import { Alert } from '@/components/ui/misc';
import { useSite } from '@/hooks/useSite';
import type { SectionKey } from '@/lib/siteDefaults';

/** Componente de cada secção do CMS (rodapé e SEO são tratados fora da one page). */
const SECTIONS: Partial<Record<SectionKey, ComponentType>> = {
  hero: Hero,
  about: About,
  banner: Banner,
  tickets: Tickets,
  event_info: EventInfo,
  history: Timeline,
  group: Group,
  event_gallery: EventGallery,
  memories: Memories,
  faq: Faq,
};

export default function Landing() {
  const { order, enabled, preview, previewError } = useSite();
  return (
    <>
      {(preview || previewError) && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-3">
          <Alert tone={previewError ? 'bad' : 'warn'} title={previewError ? 'Pré-visualização indisponível' : 'Pré-visualização de rascunhos'} className="mx-auto max-w-xl bg-paper shadow-card">
            {previewError
              ? 'Inicie sessão no painel com permissão de gestão do website para ver os rascunhos. Está a ver o conteúdo publicado.'
              : 'Está a ver conteúdo ainda não publicado. Os visitantes continuam a ver a versão publicada.'}
          </Alert>
        </div>
      )}
      {order
        .filter((k) => enabled(k) && SECTIONS[k])
        .map((k) => {
          const C = SECTIONS[k]!;
          return <C key={k} />;
        })}
    </>
  );
}
