-- =============================================================================
-- V25 — O LEGADO · Dados iniciais seguros
-- Contém apenas informação oficial fornecida pelo cliente. NÃO cria ingressos,
-- preços, marcos históricos nem regras não confirmadas: esses são definidos no
-- painel administrativo. Pode ser executado várias vezes.
-- =============================================================================

update public.event_settings set
  event_name = 'V25 — O LEGADO',
  subtitle = '25 Anos de Música, Fé, Amizade e História',
  slogan = 'Uma história que nos une. Um legado que permanece.',
  group_name = 'Vibes – Grupo Vocal',
  starts_at = '2026-12-20 16:00:00+01',  -- 16h00, hora de Luanda (WAT, UTC+1)
  timezone = 'Africa/Luanda',
  venue = 'Hotel Brisa Tropical',
  address = 'Morro Bento, Luanda, Angola',
  about_text = 'Em 2026, o Vibes – Grupo Vocal celebra 25 anos de uma trajectória marcada pela música, pela fé, pela amizade e por histórias que atravessam gerações.

O V25 — O Legado será muito mais do que um concerto: será um reencontro emocionante entre antigos e actuais integrantes, reunindo vozes, memórias e pessoas que fizeram parte desta caminhada, incluindo membros que regressam de outros países para celebrar este marco especial.

Uma tarde única para recordar o passado, celebrar o presente e honrar o legado que continuará a inspirar as próximas gerações.',
  closing_message = '25 anos. Uma história. Muitas vozes. Um legado.',
  bank_account_name = '27 LUAS COMUNICACAO E MARKETING SU LDA',
  bank_account_number = '140065995 10 001',
  bank_iban = 'AO06004000004006599510166',
  express_number = '920000000',
  payment_instructions = 'Indique o código do pedido no descritivo da transferência. Após a transferência, carregue o comprovativo (PDF, JPG ou PNG). O pagamento só é considerado confirmado depois da verificação manual pela equipa financeira.',
  sales_open = false
where id = 1;

-- Perguntas frequentes baseadas apenas no funcionamento real da plataforma.
-- Regras ainda não definidas (reembolsos, crianças, dress code…) devem ser
-- acrescentadas pelo administrador quando estiverem confirmadas.
insert into public.faqs (question, answer, category, sort_order)
select * from (values
  ('Como compro o meu ingresso?',
   'Escolha a categoria na secção Ingressos, preencha a inscrição e receberá um código de pedido e os dados bancários. Faça a transferência e carregue o comprovativo na página do seu pedido.',
   'bilhetes', 10),
  ('Carregar o comprovativo confirma o meu pagamento?',
   'Não. O comprovativo é analisado manualmente pela equipa financeira, que confirma a entrada do valor na conta. Só depois dessa verificação o pagamento é aprovado e o ingresso digital é emitido.',
   'pagamentos', 20),
  ('Que formatos de comprovativo são aceites?',
   'PDF, JPG ou PNG, com o máximo de 5 MB. Os comprovativos são guardados de forma privada e apenas a equipa autorizada os pode consultar.',
   'comprovativos', 30),
  ('Que formas de pagamento estão disponíveis?',
   'Transferência bancária ou Transferência Express, para os dados indicados no seu pedido. Indique o código do pedido no descritivo.',
   'pagamentos', 40),
  ('Durante quanto tempo fica o meu lugar reservado?',
   'O pedido mantém o lugar reservado durante o prazo indicado na página do pedido. Se o comprovativo não for enviado dentro desse prazo, a reserva expira e os lugares voltam a ficar disponíveis.',
   'bilhetes', 50),
  ('Como acompanho o estado do meu pedido?',
   'Através da ligação segura que recebe ao criar o pedido. Se a perder, use a opção "Consultar pedido" e enviaremos novas ligações para o email usado na inscrição.',
   'bilhetes', 60),
  ('Como entro no evento?',
   'Cada ingresso aprovado tem um QR Code individual. Apresente-o à entrada (no telemóvel ou impresso). Cada QR Code só pode ser utilizado uma vez.',
   'entradas', 70),
  ('Quando e onde é o evento?',
   'A 20 de Dezembro de 2026, às 16h00, no Hotel Brisa Tropical, Morro Bento, Luanda.',
   'evento', 80)
) as v(question, answer, category, sort_order)
where not exists (select 1 from public.faqs);
