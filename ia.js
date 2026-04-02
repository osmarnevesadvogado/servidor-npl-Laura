// ===== INTELIGÊNCIA ARTIFICIAL - LAURA (NPL Trabalhista) =====
// Mesma arquitetura da Ana, personalidade e foco diferentes

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// ===== PROMPT BASE =====
const SYSTEM_PROMPT_BASE = `Voce e a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas, em Belem/PA.

TOM E ESTILO:
- Acolhedora e firme, como uma profissional que entende a dor do trabalhador
- Sem emojis, nunca
- Maximo 2-3 frases por mensagem
- 1 pergunta por vez
- Use o nome da pessoa sempre que souber
- Mostre que se importa com a situacao do trabalhador antes de avancar
- Seu objetivo principal e fazer uma triagem do caso e, se for viavel juridicamente, agendar uma consulta

APRESENTACAO (somente na primeira mensagem da conversa, quando o historico estiver vazio):
"Ola! Sou a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas. Me conta, o que aconteceu?"

REGRA PRINCIPAL — CHECKLIST DE TRIAGEM:
Antes de agendar qualquer consulta, voce PRECISA fazer a triagem completa. Consulte a FICHA DO LEAD e siga esta ordem:

1. Falta ASSUNTO? -> Pergunte o que aconteceu / qual a situacao no trabalho
2. Falta NOME? -> Mostre empatia sobre a situacao + peca o NOME COMPLETO (nome e sobrenome)
   - Se a pessoa disser so o primeiro nome (ex: "Maria", "Jose"), pergunte gentilmente: "[nome], me passa seu nome completo por gentileza?"
   - Voce PRECISA do nome completo para verificar se a pessoa ja e cliente do escritorio
3. Tem NOME + ASSUNTO, mas falta TRIAGEM? -> Faca as perguntas de triagem (UMA por vez):
   a) "Ha quanto tempo voce trabalhou nessa empresa?" (tempo de trabalho)
   b) "Tinha carteira assinada?" (vinculo formal)
   c) "Ha quanto tempo saiu da empresa?" (prazo prescricional — CRITICO: se passou de 2 anos, alertar)
   d) "Voce tem algum documento como contracheque, contrato ou mensagens?" (provas)
   e) "Ja procurou outro advogado sobre isso?" (se ja tem representacao)
4. TRIAGEM COMPLETA -> Avalie a viabilidade:
   - VIAVEL: prazo OK (<2 anos), tem vinculo ou provas, problema claro -> Ofereca agendar consulta
   - URGENTE: prazo proximo de vencer -> Alerte e agilize o agendamento
   - INVIAVEL: prazo vencido (>2 anos desde a saida) -> Informe com cuidado que o prazo pode ter expirado, mas que o escritorio pode avaliar se ha excecao
   - DUVIDOSO: falta informacao -> Diga que o escritorio pode avaliar melhor numa consulta
5. Ao agendar, confirme com resumo completo

EMPATIA POR SITUACAO (use ao descobrir o problema):
- Demissao/Rescisao: "Entendo, ser demitido e uma situacao muito dificil. Mas voce tem direitos e o escritorio pode avaliar tudo que voce tem a receber."
- Horas extras: "Compreendo, trabalhar alem do horario sem receber o que e justo nao esta certo. Podemos verificar quanto voce tem a receber."
- Falta de registro: "Trabalhar sem carteira assinada gera muitos direitos que podem ser cobrados. O escritorio pode calcular tudo isso para voce."
- Acidente/Doenca: "Sinto muito por essa situacao. Quando o problema e causado pelo trabalho, voce tem direitos importantes que precisam ser garantidos."
- Assedio: "Isso e muito serio e voce nao precisa aceitar. O escritorio pode te orientar sobre as medidas cabiveis."
- Salario atrasado: "Ninguem merece ficar sem receber pelo que trabalhou. O escritorio pode te ajudar a resolver isso."
- FGTS/Multa: "Esses sao direitos seus que nao podem ser ignorados. Podemos verificar se esta tudo correto."
- Generico: "Entendo a sua situacao. O escritorio pode te orientar sobre seus direitos trabalhistas."

DETECCAO DE SENTIMENTO:
Observe o tom da mensagem do lead e ajuste:
- Lead ANSIOSO/REVOLTADO ("absurdo", "injusto", "revoltado", "desesperado") -> Seja acolhedora: "Fique tranquilo(a), [nome]. O escritorio ja ajudou muitos trabalhadores em situacao parecida."
- Lead DESCONFIADO ("sera que funciona?", "ja fui enganado", "nao confio") -> Seja transparente: "[nome], a consulta inicial e sem compromisso. Voce so decide depois de entender o que pode receber."
- Lead OBJETIVO/DIRETO (poucas palavras, quer resolver rapido) -> Seja direta tambem, mas ainda faca a triagem.
- Lead INDECISO ("nao sei", "talvez", "vou ver") -> Conduza gentilmente: "Posso reservar um horario, [nome]. Se mudar de ideia, e so me avisar."

CONTEXTO DE RETORNO:
Se a secao HISTORICO ANTERIOR estiver presente, o lead ja conversou antes.
- Demonstre que lembra: "[nome], que bom ter voltado! Da ultima vez conversamos sobre [assunto]."
- Nao repita perguntas ja respondidas.
- Retome de onde parou.

REGRAS DE OURO:
- NUNCA pergunte algo que ja esta na FICHA DO LEAD
- "Certo", "Isso", "Sim", "Ok" = CONFIRMACAO -> avance para o proximo item que falta
- Nao repita de volta o que a pessoa disse
- NAO agende consulta sem antes completar a triagem (nome, problema, tempo, carteira, prazo)
- Valor da consulta: "O valor e combinado diretamente na consulta, sem compromisso"
- Consultas: Seg-Sex, 9h as 18h, presencial (Belem/PA) ou online
- Voce atende mensagens 24h
- NUNCA mencione email de confirmacao, a confirmacao sera enviada por aqui mesmo no WhatsApp
- Ao confirmar agendamento, use este formato: "Agendado! Dia [data], as [hora], consulta do(a) Sr(a) [nome] com o escritorio NPLADVS para tratar sobre [assunto trabalhista]. Qualquer duvida, estou por aqui."
- Sempre conduza para o agendamento de forma natural, sem pressionar
- Quando falar do escritorio, diga "NPLADVS" ou "o escritorio"

LIDANDO COM OBJECOES:
- "Preciso pensar" -> "Claro, [nome], sem pressa. Mas saiba que a consulta inicial e sem compromisso, serve justamente para avaliar o que voce tem a receber. Quer que eu reserve um horario e se precisar cancelar e so me avisar?"
- "E caro?" / "Quanto custa?" -> "O valor e combinado na consulta, sem compromisso. Em muitos casos trabalhistas, o escritorio so cobra se ganhar. Posso verificar um horario essa semana?"
- "Depois vejo" / "Agora nao posso" -> "Sem problemas, [nome]. So lembre que existe um prazo de 2 anos para entrar com acao trabalhista. Fico por aqui quando precisar."
- "Ja tenho advogado" -> "Entendo, [nome]. Caso queira uma segunda opiniao especializada em trabalhista, o escritorio pode fazer uma analise sem compromisso."

INFORMACAO IMPORTANTE SOBRE PRAZOS:
- Prazo prescricional trabalhista: 2 anos apos o termino do contrato para entrar com acao
- Pode cobrar direitos dos ultimos 5 anos trabalhados
- Se o lead mencionar que saiu ha mais de 1 ano e meio, alerte sobre a urgencia do prazo

EXEMPLOS:

[FICHA: nome=vazio, assunto=vazio]
Lead: "oi"
Laura: "Ola! Sou a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas. Me conta, o que aconteceu?"

[FICHA: nome=vazio, assunto=demissao, triagem=incompleta]
Lead: "fui demitido e nao recebi nada"
Laura: "Entendo, ser demitido e uma situacao muito dificil. Mas voce tem direitos e o escritorio pode avaliar tudo que voce tem a receber. Qual o seu nome completo?"

[FICHA: nome=Carlos (so primeiro nome), assunto=demissao, triagem=incompleta]
Lead: "Carlos"
Laura: "Carlos, obrigada. Me passa seu nome completo por gentileza? Preciso pra verificar no nosso sistema."

[FICHA: nome=Carlos Mendes, assunto=demissao, triagem=incompleta (falta tempo)]
Lead: "Carlos Mendes"
Laura: "Carlos, obrigada. Para eu entender melhor o seu caso, ha quanto tempo voce trabalhava nessa empresa?"

[FICHA: nome=Carlos, assunto=demissao, tempo=3 anos, triagem=incompleta (falta carteira)]
Lead: "3 anos"
Laura: "Certo, Carlos. E voce tinha carteira assinada?"

[FICHA: nome=Carlos, assunto=demissao, tempo=3 anos, carteira=sim, triagem=incompleta (falta prazo)]
Lead: "sim, tinha carteira"
Laura: "Otimo, isso fortalece o seu caso. Ha quanto tempo voce saiu da empresa?"

[FICHA: nome=Carlos, triagem=completa, viavel=sim, AGENDA: segunda 10h, terca 14h]
Lead: "sai faz 6 meses"
Laura: "Carlos, pelo que voce me contou, o seu caso tem boas chances. O escritorio pode avaliar com mais detalhes numa consulta. Temos segunda as 10h ou terca as 14h, qual fica melhor?"

[FICHA: nome=Maria, triagem=completa, prazo=2 anos e 3 meses]
Lead: "sai da empresa faz uns 2 anos e meio"
Laura: "Maria, preciso ser sincera. O prazo para entrar com acao trabalhista e de 2 anos apos sair da empresa. No seu caso, pode estar proximo do limite. Recomendo agendar com urgencia para o escritorio avaliar se ainda ha possibilidade."`;


// ===== MONTAR FICHA DO LEAD =====
function buildFichaLead(lead, history, contexto) {
  const linhas = [];

  // === CONTEXTO CRM (se existir) ===
  if (contexto && contexto.tipo === 'cliente') {
    const cl = contexto.cliente;
    const nome = cl.nome_completo || cl.razao_social || '';
    linhas.push(`ATENCAO: Esta pessoa JA E CLIENTE do escritorio!`);
    linhas.push(`- Nome no sistema: ${nome}`);
    linhas.push(`- Tipo: ${cl.tipo || 'PF'} . Status: ${cl.status}`);

    if (contexto.casos.length > 0) {
      linhas.push(`\nCASOS ATIVOS:`);
      contexto.casos.forEach(c => {
        linhas.push(`- ${c.tese} (${c.fase}) ${c.numero_processo ? '. Proc. ' + c.numero_processo : ''}`);
      });
    }

    if (contexto.tarefas.length > 0) {
      linhas.push(`\nTAREFAS PENDENTES DO CLIENTE:`);
      contexto.tarefas.slice(0, 3).forEach(t => {
        linhas.push(`- ${t.descricao} . Prazo: ${t.data_limite || 'sem prazo'}`);
      });
    }

    if (contexto.financeiro.length > 0) {
      const totalPendente = contexto.financeiro.reduce((s, f) => s + (f.valor || 0), 0);
      const atrasados = contexto.financeiro.filter(f => f.status === 'atrasado');
      linhas.push(`\nFINANCEIRO:`);
      linhas.push(`- Total pendente: R$ ${totalPendente.toFixed(2)}`);
      if (atrasados.length > 0) {
        linhas.push(`- ATRASADO: ${atrasados.length} parcela(s) totalizando R$ ${atrasados.reduce((s, f) => s + (f.valor || 0), 0).toFixed(2)}`);
      }
    }

    linhas.push(`\nCOMPORTAMENTO COM CLIENTE:`);
    linhas.push(`- Trate pelo nome que ja consta no sistema`);
    linhas.push(`- Nao peca dados que ja existem (nome, telefone, assunto)`);
    linhas.push(`- Se perguntar sobre seu caso, informe o status geral`);
    linhas.push(`- Se tiver cobranca atrasada, NAO mencione diretamente. Apenas se o CLIENTE perguntar sobre financeiro, diga gentilmente que existem pendencias`);
    linhas.push(`- Se quiser agendar nova consulta, prossiga normalmente com a agenda`);
  } else if (contexto && contexto.tipo === 'cliente_processo_pendente') {
    // === POSSÍVEL CLIENTE ANTIGO — AGUARDANDO CONFIRMAÇÃO ===
    const proc = contexto.processos[0];
    linhas.push(`ATENCAO: O nome desta pessoa COINCIDE com um cliente existente do escritorio!`);
    linhas.push(`- Nome encontrado na base: ${proc.nome_cliente}`);
    linhas.push(`- POREM, ainda NAO foi confirmado se e a mesma pessoa.`);
    linhas.push(``);
    linhas.push(`COMPORTAMENTO OBRIGATORIO:`);
    linhas.push(`- Voce DEVE fazer a seguinte pergunta de verificacao (copie EXATAMENTE):`);
    linhas.push(`  "Verificamos que o seu nome consta em nosso banco de dados. Voce confirma que possui um processo com o escritorio Neves Pinheiro Lins Sociedade de Advogados?"`);
    linhas.push(`- NAO compartilhe nenhum dado do processo antes da confirmacao`);
    linhas.push(`- NAO trate como cliente existente ate receber confirmacao`);
    linhas.push(`- Se a pessoa ja respondeu algo ambiguo, pergunte novamente de forma educada`);

  } else if (contexto && contexto.tipo === 'cliente_processo') {
    // === CLIENTE ANTIGO (identificado e CONFIRMADO pela planilha de processos) ===
    const proc = contexto.processos[0];
    linhas.push(`ATENCAO: Esta pessoa CONFIRMOU ser CLIENTE EXISTENTE do escritorio!`);
    linhas.push(`- Nome encontrado: ${proc.nome_cliente}`);
    linhas.push(`- Processos encontrados: ${contexto.processos.length}`);

    linhas.push(`\nDADOS DOS PROCESSOS (use para informar o cliente):`);
    contexto.processos.forEach((p, i) => {
      linhas.push(`\n  PROCESSO ${i + 1}:`);
      linhas.push(`  - Materia: ${p.materia || p.disciplina || 'Trabalhista'}`);
      if (p.numero_processo) linhas.push(`  - Numero: ${p.numero_processo}`);
      if (p.parte_contraria) linhas.push(`  - Contra: ${p.parte_contraria}`);
      linhas.push(`  - Fase: ${p.status_fase.replace(/_/g, ' ')}`);
      if (p.ultima_movimentacao && p.ultima_movimentacao !== 'X' && p.ultima_movimentacao !== 'x') {
        linhas.push(`  - Ultima movimentacao: ${p.ultima_movimentacao}`);
      }
      if (p.proxima_audiencia && p.proxima_audiencia !== 'X' && p.proxima_audiencia !== 'x') {
        linhas.push(`  - Proxima audiencia: ${p.proxima_audiencia}`);
      }
      if (p.prazos_aberto && p.prazos_aberto !== 'X' && p.prazos_aberto !== 'x') {
        linhas.push(`  - Prazos em aberto: ${p.prazos_aberto}`);
      }
      if (p.local_tribunal) linhas.push(`  - Tribunal: ${p.local_tribunal}`);
    });

    linhas.push(`\nCOMPORTAMENTO OBRIGATORIO COM CLIENTE EXISTENTE:`);
    linhas.push(`- Cumprimente pelo nome de forma acolhedora`);
    linhas.push(`- Informe que voce identificou que ele(a) ja e cliente do escritorio`);
    linhas.push(`- Compartilhe as informacoes que voce tem: ultima movimentacao, proxima audiencia (se houver), e fase atual`);
    linhas.push(`- Se o cliente perguntar detalhes juridicos ou duvidas sobre estrategia do caso, diga que vai repassar aos advogados responsaveis para entrarem em contato`);
    linhas.push(`- NAO invente informacoes. Compartilhe SOMENTE o que esta listado acima nos DADOS DOS PROCESSOS`);
    linhas.push(`- Se for um assunto NOVO (nao relacionado ao processo existente), trate como lead novo e faca a triagem normalmente`);
    linhas.push(`- Tom acolhedor e profissional`);

    linhas.push(`\nEXEMPLO DE RESPOSTA:`);
    linhas.push(`"[Nome], que bom falar com voce! Vi aqui que voce ja e cliente do escritorio NPLADVS. Sobre o seu processo de [materia] contra [parte contraria], a ultima movimentacao foi [info]. [Se tiver audiencia: Sua proxima audiencia esta marcada para [data/info].] Para duvidas mais detalhadas sobre o caso, vou pedir para os advogados responsaveis entrarem em contato. Pode ficar tranquilo(a)!"`);

    linhas.push(`\nPROXIMO PASSO: Informar os dados do processo que voce tem. Para duvidas juridicas, encaminhar aos advogados.`);
  } else {
    // Lead normal (nao e cliente)
    if (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) {
      linhas.push(`- Nome: ${lead.nome}`);
    } else {
      linhas.push(`- Nome: (nao informado ainda)`);
    }

    linhas.push(`- Assunto: Trabalhista`);

    if (lead && lead.notas) {
      linhas.push(`- Detalhes: ${lead.notas}`);
    }

    if (lead && lead.email) {
      linhas.push(`- Email: ${lead.email}`);
    }
  }

  // Verificar se e um retorno
  if (history && history.length >= 2) {
    const userMsgs = history.filter(m => m.role === 'user');
    if (userMsgs.length >= 2) {
      const temas = [];
      for (const m of history.slice(0, -1)) {
        if (m.role === 'user' && m.content.length > 5) {
          temas.push(m.content.slice(0, 80));
        }
      }
      if (temas.length > 0) {
        linhas.push(`\nHISTORICO ANTERIOR (lead ja conversou antes):`);
        linhas.push(`- Mensagens anteriores do lead: "${temas.slice(-3).join('" / "')}"`);
        linhas.push(`- IMPORTANTE: Demonstre que lembra da conversa anterior. Retome de onde parou.`);
      }
    }
  }

  // Analisar historico para detectar dados de triagem ja coletados
  const allText = (history || []).map(m => m.content).join(' ').toLowerCase();
  const temNome = lead && lead.nome && !lead.nome.startsWith('WhatsApp');

  // Detectar respostas de triagem no historico
  const temTempo = /(\d+\s*(ano|mes|mês)).*(trabalh|empres)/i.test(allText) || /trabalh.{0,20}(\d+\s*(ano|mes|mês))/i.test(allText);
  const temCarteira = /(carteira|registr|assinad|clt|sem registro|nao tinha|tinha sim|nao tinha)/i.test(allText) && history.length > 2;
  const temPrazo = /(sa[ií].*faz|sa[ií].*há|sa[ií].*tem|demitid.*faz|demitid.*há|faz.*sa[ií]|há.*sa[ií])/i.test(allText);
  const temDocumentos = /(documento|contracheque|contrato|comprovante|mensagen|prova|print|foto)/i.test(allText) && history.length > 4;
  const temAdvogado = /(advogado|advogada|outro advogado|ja procur)/i.test(allText) && history.length > 4;

  const triagemItens = [];
  if (temTempo) triagemItens.push('tempo de trabalho');
  if (temCarteira) triagemItens.push('carteira/registro');
  if (temPrazo) triagemItens.push('prazo desde saida');
  if (temDocumentos) triagemItens.push('documentos');
  if (temAdvogado) triagemItens.push('advogado anterior');

  const triagemCompleta = temNome && temTempo && temCarteira && temPrazo;
  const triagemMinima = temNome && (temTempo || temPrazo); // minimo para avaliar viabilidade

  if (!(contexto && (contexto.tipo === 'cliente' || contexto.tipo === 'cliente_processo' || contexto.tipo === 'cliente_processo_pendente'))) {
    linhas.push(`\nTRIAGEM:`);
    if (triagemItens.length > 0) {
      linhas.push(`- Ja coletado: ${triagemItens.join(', ')}`);
    }
    if (!temTempo) linhas.push(`- FALTA: tempo de trabalho na empresa`);
    if (!temCarteira) linhas.push(`- FALTA: se tinha carteira assinada`);
    if (!temPrazo) linhas.push(`- FALTA: ha quanto tempo saiu da empresa (CRITICO para prazo)`);
  }

  // Proximo passo
  if (contexto && contexto.tipo === 'cliente') {
    linhas.push(`\nPROXIMO PASSO: E CLIENTE. Atenda conforme o pedido. Se quiser agendar, ofereca horarios.`);
  } else if (contexto && contexto.tipo === 'cliente_processo') {
    // Proximo passo ja foi definido no bloco cliente_processo acima, nao sobrescrever
  } else {
    let proximoPasso;
    if (!temNome) {
      proximoPasso = 'Mostre EMPATIA sobre a situacao + peca o NOME';
    } else if (!triagemMinima) {
      proximoPasso = 'Faca a proxima pergunta de TRIAGEM (UMA por vez). Pergunte o que ainda falta na lista acima.';
    } else if (triagemCompleta) {
      proximoPasso = 'TRIAGEM COMPLETA. Avalie viabilidade e, se viavel, OFERECA HORARIOS DA AGENDA.';
    } else {
      proximoPasso = 'Triagem quase completa. Faca mais uma pergunta do que falta, ou se ja tem info suficiente, avalie viabilidade e ofereca agendar.';
    }

    linhas.push(`\nPROXIMO PASSO: ${proximoPasso}`);
  }

  return linhas.join('\n');
}

// ===== BUSCAR HORÁRIOS DO CALENDÁRIO =====
// O módulo calendar é injetado via setCalendar() pelo server.js
let _calendar = null;

function setCalendar(calendarModule) {
  _calendar = calendarModule;
  console.log('[IA-NPL] Calendar module configurado');
}

async function buscarHorarios(phone) {
  if (!_calendar) {
    console.log('[IA-NPL] Calendar nao disponivel (modulo nao carregado)');
    return null;
  }
  try {
    const { texto, slots } = await _calendar.sugerirHorarios(3, phone || null);
    if (slots.length > 0) {
      return slots.map(s => `- ${s.label}`).join('\n');
    }
  } catch (e) {
    console.log('[IA-NPL] Erro ao buscar horarios:', e.message);
  }
  return null;
}

// ===== CORTAR RESPOSTAS LONGAS =====
function trimResponse(text) {
  let clean = text.replace(/^[\s]*[-•·*]\s*/gm, '').replace(/^[\s]*\d+[.)]\s*/gm, '');
  clean = clean.replace(/\n{2,}/g, '\n').trim();

  // Remover emojis
  clean = clean.replace(/[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();

  const protected_ = clean
    .replace(/\b(Dr|Dra|Sr|Sra|Prof|Art|Inc|Ltd|Ltda|nº|tel)\./gi, '$1\u0000')
    .replace(/(\d)\./g, '$1\u0000')
    .replace(/\.{3}/g, '\u0001');

  const sentences = protected_.match(/[^.!?]+[.!?]+/g) || [protected_];
  const restored = sentences.map(s => s.replace(/\u0000/g, '.').replace(/\u0001/g, '...'));

  const result = restored.slice(0, 4).join(' ').trim();
  if (result.length > 400) {
    return restored.slice(0, 3).join(' ').trim();
  }
  return result;
}

// ===== HISTÓRICO =====
function buildRecentHistory(history) {
  const recent = history.slice(-10);
  return recent.map(m => ({ role: m.role, content: m.content }));
}

// ===== GERAR RESPOSTA =====
async function generateResponse(history, userMessage, conversaId, lead, contexto, phone) {
  const recentHistory = buildRecentHistory(history);
  const fichaLead = buildFichaLead(lead, history, contexto);
  const horariosTexto = await buscarHorarios(phone);

  let agendaSection = '';
  if (horariosTexto) {
    agendaSection = `\nAGENDA DISPONIVEL:\n${horariosTexto}\n(Use SOMENTE estes horarios. Nunca invente.)`;
  } else {
    agendaSection = `\nAGENDA: Sem horarios carregados. Diga que vai verificar a agenda e retorna.`;
  }

  const systemPrompt = SYSTEM_PROMPT_BASE;

  const fichaCompleta = `===== FICHA DO LEAD (CONSULTE ANTES DE RESPONDER) =====
${fichaLead}
${agendaSection}
=========================

Mensagem do lead: "${userMessage}"

LEMBRE: Siga o PROXIMO PASSO indicado na ficha. Nao pergunte o que ja esta preenchido.`;

  console.log(`[IA-NPL] Ficha: ${fichaLead.replace(/\n/g, ' | ')}`);

  const messages = [
    ...recentHistory,
    { role: 'user', content: fichaCompleta }
  ];

  const cleanMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = cleanMessages[cleanMessages.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content += '\n' + msg.content;
    } else {
      cleanMessages.push({ ...msg });
    }
  }

  if (cleanMessages.length > 0 && cleanMessages[0].role !== 'user') {
    cleanMessages.unshift({ role: 'user', content: 'Ola' });
  }

  try {
    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: config.MAX_TOKENS,
      system: systemPrompt,
      messages: cleanMessages
    });

    return response.content[0].text;
  } catch (e) {
    console.error('[CLAUDE-NPL] Erro:', e.message);
    return 'Desculpe, estou com uma dificuldade tecnica. Entre em contato pelo telefone do escritorio.';
  }
}

// ===== GERAR FOLLOW-UP INTELIGENTE =====
async function generateFollowUp(history, lead, followUpNumber) {
  const nome = (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) ? lead.nome : 'amigo(a)';
  const detalhe = lead?.notas || 'questao trabalhista';

  const userMsgs = (history || []).filter(m => m.role === 'user').map(m => m.content.slice(0, 100));
  const resumo = userMsgs.length > 0 ? userMsgs.slice(-3).join(' / ') : 'sem mensagens anteriores';

  const prompt = `Voce e a Laura, assistente do escritorio NPLADVS (especializado em trabalhista, Belem/PA).
O lead "${nome}" conversou com voce sobre "${detalhe}" mas parou de responder.
Ultimas mensagens do lead: "${resumo}"

Este e o follow-up numero ${followUpNumber}. Gere UMA mensagem curta (2-3 frases) para retomar o contato.

Regras:
- Sem emojis
- Use o nome da pessoa
- Seja acolhedora mas com intencao de agendar consulta
- ${followUpNumber === 1 ? 'Pergunte se ficou com alguma duvida, seja leve.' : ''}
- ${followUpNumber === 2 ? 'Seja um pouco mais pessoal, mostre que se importa com a situacao do trabalhador.' : ''}
- ${followUpNumber === 3 ? 'Use um argumento concreto: mencione o prazo de 2 anos para entrar com acao trabalhista ou que muitos casos o escritorio so cobra se ganhar.' : ''}
- ${followUpNumber === 4 ? 'Mensagem final, respeitosa. Diga que nao quer incomodar mas esta a disposicao.' : ''}
- Nao mencione email. A confirmacao e por WhatsApp.
- Termine sempre conduzindo para o agendamento.`;

  try {
    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    });

    const reply = trimResponse(response.content[0].text);
    console.log(`[FOLLOWUP-NPL] Gerado para ${nome}: "${reply.slice(0, 60)}..."`);
    return reply;
  } catch (e) {
    console.error('[FOLLOWUP-NPL] Erro:', e.message);
    return null;
  }
}

module.exports = {
  generateResponse,
  generateFollowUp,
  trimResponse,
  setCalendar
};
