-- =============================================================================
-- V25 — O LEGADO · Migração 002 — dados oficiais iniciais
-- Apenas informação fornecida pela organização. NÃO cria preços, categorias de
-- ingresso nem marcos históricos (definidos no painel administrativo).
-- =============================================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 20/12/2026 16h00 em Luanda (WAT, UTC+1) = 15h00 UTC
INSERT INTO events (id, name, subtitle, slogan, group_name, starts_at, timezone, venue, address, maps_url,
                    about_text, closing_message, sales_open, sales_closed_message, reservation_hours)
VALUES (1, 'V25 — O LEGADO', '25 Anos de Música, Fé, Amizade e História',
        'Uma história que nos une. Um legado que permanece.', 'Vibes – Grupo Vocal',
        '2026-12-20 15:00:00', 'Africa/Luanda', 'Hotel Brisa Tropical', 'Morro Bento, Luanda, Angola',
        'https://www.google.com/maps/search/?api=1&query=Hotel%20Brisa%20Tropical%2C%20Morro%20Bento%2C%20Luanda',
        'Em 2026, o Vibes – Grupo Vocal celebra 25 anos de uma trajectória marcada pela música, pela fé, pela amizade e por histórias que atravessam gerações.\n\nO V25 — O Legado será muito mais do que um concerto: será um reencontro emocionante entre antigos e actuais integrantes, reunindo vozes, memórias e pessoas que fizeram parte desta caminhada, incluindo membros que regressam de outros países para celebrar este marco especial.\n\nUma tarde única para recordar o passado, celebrar o presente e honrar o legado que continuará a inspirar as próximas gerações.',
        '25 anos. Uma história. Muitas vozes. Um legado.', 0, 'A AGUARDAR ABERTURA DAS VENDAS', 48);

INSERT INTO settings (setting_key, setting_value) VALUES
 ('bank_account_name', '27 LUAS COMUNICACAO E MARKETING SU LDA'),
 ('bank_account_number', '140065995 10 001'),
 ('bank_iban', 'AO06004000004006599510166'),
 ('express_number', '920000000'),
 ('payment_instructions', 'Indique o código do pedido no descritivo da transferência. Após a transferência, carregue o comprovativo (PDF, JPG ou PNG). O pagamento só é considerado confirmado depois da verificação manual pela equipa financeira.'),
 ('contact_email', ''), ('contact_phone', ''), ('socials', '{}'),
 ('copyright_text', ''), ('credits_text', ''), ('privacy_text', ''), ('terms_text', ''),
 ('email_sender_name', 'V25 — O Legado'), ('email_reply_to', '');

INSERT INTO faqs (id, question, answer, category, sort_order, published) VALUES
 ('5611ca10-3bbc-5d49-b744-5f96d7e9c04f', 'Como compro o meu ingresso?', 'Escolha a categoria na secção Ingressos, preencha a inscrição e receberá um código de pedido e os dados bancários. Faça a transferência e carregue o comprovativo na página do seu pedido.', 'bilhetes', 10, 1),
 ('cd0f0681-dbee-5261-a949-0b52b943866e', 'Carregar o comprovativo confirma o meu pagamento?', 'Não. O comprovativo é analisado manualmente pela equipa financeira, que confirma a entrada do valor na conta. Só depois dessa verificação o pagamento é aprovado e o ingresso digital é emitido.', 'pagamentos', 20, 1),
 ('ba17aa1e-29fe-5023-ada8-af5f089f8b5a', 'Que formatos de comprovativo são aceites?', 'PDF, JPG ou PNG, com o máximo de 5 MB. Os comprovativos são guardados de forma privada e apenas a equipa autorizada os pode consultar.', 'comprovativos', 30, 1),
 ('87ac2b78-f987-5681-a858-40d5539adc56', 'Que formas de pagamento estão disponíveis?', 'Transferência bancária ou Transferência Express, para os dados indicados no seu pedido. Indique o código do pedido no descritivo.', 'pagamentos', 40, 1),
 ('4d86d88a-1804-54db-ab43-c5fde02931b1', 'Durante quanto tempo fica o meu lugar reservado?', 'O pedido mantém o lugar reservado durante o prazo indicado na página do pedido. Se o comprovativo não for enviado dentro desse prazo, a reserva expira e os lugares voltam a ficar disponíveis.', 'bilhetes', 50, 1),
 ('226aad81-f48c-5855-86fb-b996328b88e6', 'Como acompanho o estado do meu pedido?', 'Através da ligação segura que recebe ao criar o pedido. Se a perder, use a opção "Consultar pedido" e enviaremos novas ligações para o email usado na inscrição.', 'bilhetes', 60, 1),
 ('3ebfbee4-f12d-5914-a10b-148e530d303a', 'Como entro no evento?', 'Cada ingresso aprovado tem um QR Code individual. Apresente-o à entrada (no telemóvel ou impresso). Cada QR Code só pode ser utilizado uma vez.', 'entradas', 70, 1),
 ('5814ac98-2153-5cc0-a983-62c632b5a44d', 'Quando e onde é o evento?', 'A 20 de Dezembro de 2026, às 16h00, no Hotel Brisa Tropical, Morro Bento, Luanda.', 'evento', 80, 1);
