# V25 — O LEGADO

Plataforma oficial do evento de celebração dos **25 anos do Vibes – Grupo Vocal**
— 20 de Dezembro de 2026, 16h00, Hotel Brisa Tropical, Morro Bento, Luanda.

Divulgação do evento, inscrição, pagamento manual por transferência, validação de
comprovativos, emissão de ingressos digitais com QR Code assinado, check-in e gestão
administrativa.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS, componentes no estilo shadcn/ui (Radix), Framer Motion, Lucide |
| Backend | Supabase: PostgreSQL (RLS + funções transaccionais), Auth, Storage, Edge Function (Deno) |
| PDF / QR | jsPDF, qrcode; leitura de QR com jsQR + câmara (getUserMedia) |
| Alojamento | build estático (cPanel/Apache) + Supabase externo |

## Estrutura

```
src/
  pages/            Landing, Checkout, Pedido (/pedido/:code#t=token), Consultar, Legal
  components/site/  Secções da landing (Hero, Sobre, História, Grupo, Informações, Ingressos, Memórias, FAQ, Rodapé)
  components/order/ Cartão bancário, upload de comprovativo, ingressos (QR + PDF)
  admin/            Painel (/admin) com perfis Administrador, Financeiro e Check-in
  lib/              API, validação, formatação (Kz, fuso Africa/Luanda), erros, PDF
supabase/
  migrations/       Esquema, RPCs (compra, aprovação, emissão, check-in), RLS e storage
  functions/        send-emails (fila → SMTP) + templates partilhados
  seed.sql          Dados oficiais (sem preços inventados)
  tests/            Testes de integração PostgreSQL
assets/originals/   Fotografias oficiais (originais) → `npm run images` gera WebP/AVIF
docs/DEPLOY.md      Supabase, variáveis, cPanel, DNS, HTTPS e SMTP
```

## Desenvolvimento

```bash
npm install
cp .env.example .env     # preencher VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Sem `.env`, o site funciona em modo de divulgação: mostra a identidade do evento e
“A AGUARDAR ABERTURA DAS VENDAS”; o checkout e o painel indicam *integração pendente*
(nenhuma operação é simulada).

## Testes

```bash
npm test          # Vitest: validação, datas/fuso, Kz, CSV, upload, templates de email, secções
npm run test:db   # PostgreSQL real (cria cluster temporário; ou TEST_DATABASE_URL=...)
npm run typecheck
```

`test:db` cobre: RLS (anon sem acesso a dados pessoais), validação no backend, idempotência
e pedidos duplicados, upload seguro (slot único, bucket privado), aprovação/rejeição com
permissões, valor e referência bancária únicos, emissão de ingressos, QR sem dados pessoais,
check-in com bloqueio de reutilização e assinatura adulterada, cancelamento, expiração de
reservas, rate limiting, **stock concorrente** (20 compras paralelas para 5 lugares) e
**aprovações concorrentes** do mesmo pedido.

## Fluxo de pagamento

1. Cliente escolhe a categoria → o sistema calcula o total (preço definido no painel).
2. Inscrição → pedido com código único `V25-XXXXXX` e reserva de stock com prazo.
3. Página privada do pedido (token no fragmento `#t=`, nunca enviado ao servidor web) com dados bancários e botões de cópia.
4. Upload do comprovativo (PDF/JPG/PNG ≤ 5 MB, verificado por assinatura de bytes) para bucket **privado**.
5. Pedido passa a *Comprovativo enviado* → *Em análise* — **isto não confirma o pagamento**.
6. Financeiro confere no banco e aprova indicando a referência da transacção e o valor
   (referência não reutilizável; valor tem de coincidir) ou rejeita com motivo.
7. Só após aprovação são emitidos os ingressos (um QR por ingresso, assinado por HMAC).

## Segurança

- Chave `service_role` nunca no frontend; credenciais SMTP apenas em *secrets* da Edge Function.
- RLS em todas as tabelas; escrita de pedidos/ingressos apenas por funções `SECURITY DEFINER`
  com verificação de perfil no servidor e bloqueios de linha (`FOR UPDATE`).
- Comprovativos: bucket privado, upload só para um caminho pré-autorizado e de uso único,
  leitura por URL assinado temporário (5 min) apenas para Administrador/Financeiro.
- Tokens de acesso guardados como hash SHA-256; QR Codes contêm só `V25:<código>:<assinatura>`.
- Auditoria de aprovações, rejeições, cancelamentos, preços, configurações e equipa.

## Pendências que dependem da organização

- Preços, categorias e lotes (painel → *Ingressos*); as vendas estão **fechadas** por omissão.
- Marcos da linha do tempo, integrantes, fotografias e vídeos adicionais (painel).
- Confirmação do número Transferência Express (`920000000`, conforme briefing) e da localização exacta.
- Credenciais SMTP e domínio final; redes sociais; textos legais revistos.
