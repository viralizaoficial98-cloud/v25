import { CrudPage } from '../Crud';

export default function FaqAdmin() {
  return (
    <CrudPage
      table="faqs"
      title="Perguntas frequentes"
      description="Edite as regras do evento (reembolsos, crianças, dress code, estacionamento…) à medida que forem confirmadas."
      empty="Sem perguntas."
      defaults={{ question: '', answer: '', category: 'geral', published: true }}
      fields={[
        { key: 'question', label: 'Pergunta', type: 'text', required: true },
        { key: 'answer', label: 'Resposta', type: 'textarea', required: true },
        {
          key: 'category',
          label: 'Categoria',
          type: 'select',
          options: [
            { value: 'geral', label: 'Geral' },
            { value: 'bilhetes', label: 'Bilhetes' },
            { value: 'pagamentos', label: 'Pagamentos' },
            { value: 'comprovativos', label: 'Comprovativos' },
            { value: 'entradas', label: 'Entradas' },
            { value: 'evento', label: 'Evento' },
          ],
        },
        { key: 'published', label: 'Publicada', type: 'bool' },
      ]}
      render={(r) => (
        <div>
          <p className="font-semibold">{String(r.question)}</p>
          <p className="line-clamp-2 text-xs text-cream/50">{String(r.answer)}</p>
        </div>
      )}
    />
  );
}
