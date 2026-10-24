import { mediaUrl } from '@/lib/api';
import { CrudPage } from '../Crud';

export default function MembersAdmin() {
  return (
    <CrudPage
      table="members"
      title="Integrantes"
      description="Apresente integrantes actuais e antigos membros. Use apenas fotografias reais fornecidas pelo grupo."
      empty="Ainda não foram adicionados integrantes."
      defaults={{ name: '', voice: '', period_label: '', is_current: true, bio: '', photo_path: null, published: false }}
      fields={[
        { key: 'name', label: 'Nome', type: 'text', required: true },
        { key: 'voice', label: 'Naipe / função', type: 'text', placeholder: 'ex.: Tenor' },
        { key: 'period_label', label: 'Período no grupo', type: 'text', placeholder: 'Texto livre, apenas se confirmado' },
        { key: 'bio', label: 'Nota biográfica', type: 'textarea' },
        { key: 'photo_path', label: 'Fotografia', type: 'image', folder: 'integrantes' },
        { key: 'is_current', label: 'Integrante actual (desligado = antigo membro)', type: 'bool' },
        { key: 'published', label: 'Publicado no site', type: 'bool' },
      ]}
      render={(r) => (
        <div className="flex items-center gap-3">
          {typeof r.photo_path === 'string' && r.photo_path && <img src={mediaUrl(r.photo_path) ?? ''} alt="" className="h-10 w-10 rounded-full object-cover" />}
          <div>
            <p className="font-semibold">{String(r.name)}</p>
            <p className="text-xs text-cream/50">{[r.voice, r.is_current ? 'Actual' : 'Antigo membro', r.period_label].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      )}
    />
  );
}
