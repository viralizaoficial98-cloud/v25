/** Mensagens em português para os códigos de erro devolvidos pelas funções da base de dados. */
const MESSAGES: Record<string, string> = {
  SEM_LIGACAO: 'Sem ligação ao servidor. Verifique a sua internet e tente novamente.',
  API_NAO_INSTALADA: 'A plataforma está em manutenção. Tente novamente mais tarde.',
  ERRO_INTERNO: 'Ocorreu um erro no servidor. Tente novamente dentro de instantes.',
  NAO_ENCONTRADO: 'Não encontrado.',
  CSRF_INVALIDO: 'A sessão expirou. Actualize a página e tente novamente.',
  ORIGEM_NAO_PERMITIDA: 'Pedido recusado por segurança.',
  CREDENCIAIS_INVALIDAS: 'Email ou palavra-passe incorrectos.',
  CONTA_BLOQUEADA: 'Demasiadas tentativas falhadas. A conta fica bloqueada durante 15 minutos.',
  PALAVRA_PASSE_FRACA: 'A palavra-passe deve ter pelo menos 10 caracteres, com letras e números.',
  TOKEN_INVALIDO: 'Esta ligação expirou ou já foi utilizada. Peça uma nova.',
  SETUP_TOKEN_INVALIDO: 'Código de instalação inválido (SETUP_TOKEN do ficheiro .env).',
  INSTALACAO_CONCLUIDA: 'A instalação já foi concluída. Inicie sessão.',
  UTILIZADOR_JA_EXISTE: 'Já existe um utilizador com este email.',
  ULTIMO_ADMINISTRADOR: 'Tem de existir pelo menos um administrador activo.',
  PRECO_OBRIGATORIO_PARA_PUBLICAR: 'Para publicar, defina um preço válido em Kz.',
  PRECO_INVALIDO: 'Preço inválido.',
  STOCK_INFERIOR_AO_VENDIDO: 'A quantidade total não pode ser inferior aos lugares já reservados/vendidos.',
  CATEGORIA_COM_PEDIDOS: 'Não é possível eliminar: existem pedidos associados. Despublique em vez de eliminar.',
  VALOR_INVALIDO: 'Valor inválido.',
  DATA_INVALIDA: 'Data inválida.',
  PERIODO_INVALIDO: 'O fim das vendas tem de ser posterior ao início.',
  TEXTO_DEMASIADO_LONGO: 'Texto demasiado longo.',
  CAMPO_OBRIGATORIO: 'Preencha os campos obrigatórios.',
  URL_INVALIDO: 'Ligação inválida (deve começar por https://).',
  YOUTUBE_INVALIDO: 'Ligação do YouTube inválida.',
  IMAGEM_INVALIDA: 'Imagem inválida.',
  PASTA_INVALIDA: 'Destino de upload inválido.',
  FICHEIRO_EM_FALTA: 'O ficheiro não foi encontrado no servidor.',
  METODO_NAO_PERMITIDO: 'Operação não permitida.',
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
  FICHEIRO_DEMASIADO_GRANDE: 'O ficheiro excede o tamanho máximo permitido (comprovativos: 5 MB; fotografias: 15 MB; vídeos: 50 MB).',
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
  UTILIZADOR_INEXISTENTE: 'Utilizador não encontrado.',
  INGRESSO_POR_CONSULTA: 'O acesso VIP é atribuído por consulta: utilize o botão “Solicitar acesso VIP”.',
  DISPONIBILIDADE_POR_ANUNCIAR: 'A disponibilidade desta categoria ainda não foi anunciada.',
  METODO_PAGAMENTO_INVALIDO: 'Escolha Transferência Bancária ou Transferência Express.',
  PARTICIPANTES_INVALIDO: 'Indique entre 1 e 100 participantes.',
  VIP_PEDIDO_DUPLICADO: 'Já existe uma solicitação VIP em aberto com este email. Consulte a ligação que recebeu por email.',
  VIP_INDISPONIVEL: 'De momento não estamos a receber solicitações VIP.',
  VIP_ESGOTADO: 'Não há lugares VIP suficientes disponíveis para esta proposta.',
  PROPOSTA_EXPIRADA: 'Esta proposta expirou. Contacte a organização para receber uma nova.',
  PROPOSTA_INDISPONIVEL: 'Esta proposta já não está disponível (foi respondida, substituída ou cancelada).',
  CONDICOES_OBRIGATORIAS: 'Descreva as condições da proposta (mínimo 5 caracteres).',
  VIDEO_URL_NAO_AUTORIZADO: 'Só são aceites ligações do YouTube ou do Vimeo.',
  VENDAS_SUSPENSAS: 'As vendas desta categoria estão suspensas pela organização.',
  PAGAMENTO_POR_VALIDAR: 'As vendas ainda não estão disponíveis: a organização está a validar os dados de pagamento. Tente novamente mais tarde.',
  DADOS_PAGAMENTO_INCOMPLETOS: 'Preencha o titular e pelo menos o IBAN/número de conta ou o número Express antes de confirmar.',
  LIMITE_ALBUM: 'O álbum atingiu o limite de 500 itens.',
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
  if (MESSAGES[raw]) return MESSAGES[raw];
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return MESSAGES[code];
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'Sem ligação ao servidor. Verifique a sua internet.';
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

export function errorCode(err: unknown): string | null {
  const raw = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  return MESSAGES[raw] ? raw : (Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? null);
}
