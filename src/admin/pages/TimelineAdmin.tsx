import { mediaUrl } from '@/lib/api';
import { CrudPage } from '../Crud';

export default function TimelineAdmin() {
  return (
    <CrudPage
      type="timeline"
      title="Linha do tempo — 25 anos"
      description="Adicione apenas marcos confirmados pelo grupo (datas, actuações, gravações…). Nada é publicado automaticamente."
      empty="Ainda não há marcos. O site mostra “A história está a ser reunida”."
      defaults={{ period_label: '', title: '', description: '', image_path: null, published: false }}
      fields={[
        { key: 'period_label', label: 'Período / data', type: 'text', required: true, placeholder: 'ex.: 2005 ou Dezembro de 2010', hint: 'Texto livre — use exactamente a data confirmada.' },
        { key: 'title', label: 'Título', type: 'text', required: true },
        { key: 'description', label: 'Descrição', type: 'textarea' },
        { key: 'image_path', label: 'Fotografia histórica', type: 'image', folder: 'historia' },
        { key: 'published', label: 'Publicado no site', type: 'bool' },
      ]}
      render={(r) => (
        <div className="flex items-center gap-3">
          {typeof r.image_path === 'string' && r.image_path && <img src={mediaUrl(r.image_path) ?? ''} alt="" className="h-12 w-16 rounded object-cover" />}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">{String(r.period_label)}</p>
            <p className="font-semibold">{String(r.title)}</p>
          </div>
        </div>
      )}
    />
  );
}
