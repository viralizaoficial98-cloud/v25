import { useSettings } from '@/hooks/useSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const DEFAULT_PRIVACY = `Responsável pelo tratamento: organização do evento V25 — O Legado (Vibes – Grupo Vocal).

Dados recolhidos: nome completo, email, telefone, categoria e quantidade de ingressos, número de convidados e o comprovativo de pagamento que decidir enviar. Não recolhemos dados desnecessários à inscrição.

Finalidade: gerir a inscrição, verificar o pagamento, emitir e validar ingressos e comunicar consigo sobre o evento. Os dados não são vendidos nem cedidos a terceiros para fins comerciais.

Segurança: os comprovativos ficam guardados num armazenamento privado, acessível apenas à equipa financeira autorizada. Os QR Codes dos ingressos não contêm dados pessoais. O acesso ao seu pedido é feito através de uma ligação privada.

Conservação: os dados são conservados apenas durante o período necessário à gestão do evento e às obrigações legais aplicáveis.

Direitos: pode pedir o acesso, a rectificação ou a eliminação dos seus dados, nos termos da legislação angolana de protecção de dados pessoais (Lei n.º 22/11), contactando a organização.`;

const DEFAULT_TERMS = `A inscrição só é considerada concluída após a confirmação manual do pagamento pela equipa financeira. O envio de um comprovativo não constitui confirmação de pagamento.

Os pedidos não pagos dentro do prazo indicado expiram automaticamente, libertando os lugares reservados.

Cada ingresso tem um QR Code individual, válido para uma única entrada. A organização não se responsabiliza por ingressos partilhados ou reproduzidos.

Outras condições (reembolsos, transferências de titularidade, regras de acesso) serão publicadas pela organização nesta página.`;

export default function Legal({ kind }: { kind: 'privacidade' | 'termos' }) {
  const { settings } = useSettings();
  const title = kind === 'privacidade' ? 'Política de Privacidade' : 'Termos e Condições';
  useDocumentTitle(`${title} · V25 — O Legado`);
  const text = (kind === 'privacidade' ? settings.privacy_text : settings.terms_text) || (kind === 'privacidade' ? DEFAULT_PRIVACY : DEFAULT_TERMS);
  return (
    <div className="container max-w-3xl pb-24 pt-28 md:pt-36">
      <p className="eyebrow">{settings.event_name}</p>
      <h1 className="mt-3 text-5xl font-semibold">{title}</h1>
      <div className="mt-10 space-y-5 leading-relaxed text-cream/75">
        {text.split(/\n{2,}/).map((p, i) => (
          <p key={i} className="whitespace-pre-line">{p}</p>
        ))}
      </div>
    </div>
  );
}
