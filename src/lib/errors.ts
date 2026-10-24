/** Mensagens em português para os códigos de erro devolvidos pelas funções da base de dados. */
const MESSAGES: Record<string, string> = {
  BACKEND_NAO_CONFIGURADO: 'A plataforma ainda não está ligada ao servidor. Tente novamente mais tarde.',
  PEDIDO_INVALIDO: 'Pedido inválido. Actualize a página e tente novamente.',
  CONSENTIMENTO_OBRIGATORIO: 'É necessário aceitar a utilização dos dados pessoais para concluir a inscrição.',
  NOME_INVALIDO: 'Indique o seu nome completo (nome e apelido).',
  EMAIL_INVALIDO: 'Indique um endereço de email válido.',
  TELEFONE_INVALIDO: 'Indique um número de telefone válido com indicativo (ex.: +244 9XX XXX XXX).',
  INGRESSO_INEXISTENTE: 'Esta categoria de ingresso não está disponível.',
  VENDAS_FECHADAS: 'As vendas para esta categoria não estão abertas neste momento.',
  QUANTIDADE_INVALIDA: 'A quantidade escolhida excede o limite permitido por pedido.',
  CONVIDADOS_INVALIDO: 'O número de convidados não é compatível com a quantidade de ingressos.',
  ESGOTADO: 'Lamentamos — não há lugares suficientes disponíveis nesta categoria.',
  PEDIDO_DUPLICADO:
    'Já existe um pedido em aberto com este email para esta categoria. Consulte o seu pedido existente (pode recuperar o acesso por email).',
  LIMITE_POR_CLIENTE: 'Atingiu o limite de ingressos por cliente nesta categoria.',
  LIMITE_PEDIDOS: 'Demasiadas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  ACESSO_INVALIDO: 'Não foi possível abrir este pedido. Verifique a ligação ou recupere o acesso por email.',
  ESTADO_INVALIDO: 'Esta operação não é possível no estado actual do pedido.',
  FICHEIRO_TIPO_INVALIDO: 'Formato não aceite. Envie o comprovativo em PDF, JPG ou PNG.',
  FICHEIRO_DEMASIADO_GRANDE: 'O ficheiro excede o limite de 5 MB.',
  COMPROVATIVO_REUTILIZADO: 'Este comprovativo já foi submetido noutro pedido.',
  UPLOAD_INVALIDO: 'O envio expirou ou já foi concluído. Tente novamente.',
  UPLOAD_NAO_ENCONTRADO: 'O ficheiro não chegou ao servidor. Tente novamente.',
  NAO_AUTENTICADO: 'Sessão expirada. Inicie sessão novamente.',
  SEM_PERMISSAO: 'Não tem permissão para esta operação.',
  PEDIDO_INEXISTENTE: 'Pedido não encontrado.',
  REFERENCIA_OBRIGATORIA: 'Indique a referência da transacção bancária conferida.',
  REFERENCIA_REUTILIZADA: 'Esta referência bancária já foi usada para validar outro pedido.',
  VALOR_NAO_CONFERE: 'O valor confirmado não corresponde ao total do pedido.',
  MOTIVO_OBRIGATORIO: 'Indique o motivo (mínimo 5 caracteres).',
  INGRESSO_JA_UTILIZADO: 'Não é possível cancelar: há ingressos deste pedido já utilizados.',
  PERFIL_INVALIDO: 'Perfil inválido.',
  UTILIZADOR_INEXISTENTE:
    'Não existe utilizador com esse email. Crie-o primeiro em Supabase → Authentication → Users (ou convide-o).',
  NAO_PODE_REMOVER_PROPRIO: 'Não pode retirar o seu próprio perfil de administrador.',
};

/** Erro com mensagem já pronta para o utilizador (em português). */
export class UserError extends Error {}

export function errorMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  const code = Object.keys(MESSAGES).find((k) => raw === k || raw.includes(k));
  if (code) return MESSAGES[code];
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'Sem ligação ao servidor. Verifique a sua internet.';
  if (/Invalid login credentials/i.test(raw)) return 'Email ou palavra-passe incorrectos.';
  if (/row-level security|permission denied/i.test(raw)) return MESSAGES.SEM_PERMISSAO;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

export function errorCode(err: unknown): string | null {
  const raw = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  return Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? null;
}
