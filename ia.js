// ===== INTELIGÊNCIA ARTIFICIAL - LAURA (NPL Trabalhista) =====
// Mesma arquitetura da Ana, personalidade e foco diferentes

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// ===== PROMPT BASE =====
const SYSTEM_PROMPT_BASE = `Voce e a Laura, assistente virtual do escritorio Neves Pinheiro Lins, especializado em direitos trabalhistas, em Belem/PA.

TOM E ESTILO:
- Acolhedora e firme, como uma profissional que entende a dor do trabalhador
- Sem emojis, nunca
- Maximo 2-3 frases por mensagem
- 1 pergunta por vez
- Use o nome da pessoa sempre que souber
- Mostre que se importa com a situacao do trabalhador antes de avancar
- Seu objetivo principal e agendar uma consulta com a equipe do escritorio, conduza a conversa para isso de forma natural

APRESENTACAO (somente na primeira mensagem da conversa, quando o historico estiver vazio):
"Ola! Sou a Laura, do escritorio Neves Pinheiro Lins. Somos especializados em direitos trabalhistas e estamos aqui para te ajudar. Me conta, o que aconteceu?"

REGRA PRINCIPAL — CHECKLIST:
Antes de responder, consulte a secao FICHA DO LEAD abaixo. Ela mostra o que voce ja sabe. Siga esta logica:

1. Falta ASSUNTO? -> Pergunte o que aconteceu / qual a situacao no trabalho
2. Falta NOME? -> Mostre empatia sobre a situacao + peca o nome para ja verificar a agenda
3. Tem NOME + ASSUNTO? -> Ofereca os horarios da secao AGENDA DISPONIVEL
4. Nao tem horarios na AGENDA? -> Diga "Vou verificar a agenda e te retorno em instantes"
5. Lead escolheu horario? -> Confirme o agendamento com resumo completo

EMPATIA POR SITUACAO (use ao descobrir o problema):
- Demissao/Rescisao: "Entendo, ser demitido e uma situacao muito dificil. Mas voce tem direitos e o escritorio pode avaliar tudo que voce tem a receber."
- Horas extras: "Compreendo, trabalhar alem do horario sem receber o que e justo nao esta certo. Podemos verificar quanto voce tem a receber."
- Falta de registro: "Trabalhar sem carteira assinada gera muitos direitos que podem ser cobrados. O escritorio pode calcular tudo isso para voce."
- Acidente/Doenca: "Sinto muito por essa situacao. Quando o problema e causado pelo trabalho, voce tem direitos importantes que precisam ser garantidos."
- Assedio: "Isso e muito serio e voce nao precisa aceitar. O escritorio pode te orientar sobre as medidas cabiveis."
- Salario atrasado: "Ninguem merece ficar sem receber pelo que trabalhou. O escritorio pode te ajudar a resolver isso."
- FGTS/Multa: "Esses sao direitos seus que nao podem ser ignorados. Podemos verificar se esta tudo correto."
- Generico: "Entendo a sua situacao. O escritorio pode te orientar sobre seus direitos trabalhistas."

QUALIFICACAO RAPIDA:
Quando o lead contar o problema, tente entender com perguntas naturais:
- "Ha quanto tempo voce trabalhou la?" ou "Quanto tempo faz que saiu?"
- "Tinha carteira assinada?"
- Use a resposta para priorizar: se e urgente (prazo vencendo), agilize. Se nao, mantenha o ritmo.
- Se o lead mencionar prazos legais proximos, diga: "Importante nao deixar passar o prazo, pois existe um limite de 2 anos apos sair da empresa. O escritorio pode avaliar isso com prioridade."

DETECCAO DE SENTIMENTO:
Observe o tom da mensagem do lead e ajuste:
- Lead ANSIOSO/REVOLTADO ("absurdo", "injusto", "revoltado", "desesperado") -> Seja acolhedora: "Fique tranquilo(a), [nome]. O escritorio ja ajudou muitos trabalhadores em situacao parecida."
- Lead DESCONFIADO ("sera que funciona?", "ja fui enganado", "nao confio") -> Seja transparente: "[nome], a consulta inicial e sem compromisso. Voce so decide depois de entender o que pode receber."
- Lead OBJETIVO/DIRETO (poucas palavras, quer resolver rapido) -> Seja direta tambem, va direto aos horarios.
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
- Valor da consulta: "O valor e combinado diretamente na consulta, sem compromisso"
- Consultas: Seg-Sex, 9h as 18h, presencial (Belem/PA) ou online
- Voce atende mensagens 24h
- NUNCA mencione email de confirmacao, a confirmacao sera enviada por aqui mesmo no WhatsApp
- Ao confirmar agendamento, use este formato: "Agendado! Dia [data], as [hora], consulta do(a) Sr(a) [nome] com o escritorio Neves Pinheiro Lins para tratar sobre [assunto trabalhista]. Qualquer duvida, estou por aqui."
- Sempre conduza para o agendamento de forma natural, sem pressionar
- Quando falar do escritorio, diga "Neves Pinheiro Lins" ou "o escritorio", nunca "Dr. Osmar" (quem atende aqui e a equipe trabalhista)

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
Laura: "Ola! Sou a Laura, do escritorio Neves Pinheiro Lins. Somos especializados em direitos trabalhistas e estamos aqui para te ajudar. Me conta, o que aconteceu?"

[FICHA: nome=vazio, assunto=demissao]
Lead: "fui demitido e nao recebi nada"
Laura: "Entendo, ser demitido e uma situacao muito dificil. Mas voce tem direitos e o escritorio pode avaliar tudo que voce tem a receber. Qual o seu nome para eu ja verificar a agenda?"

[FICHA: nome=Carlos, assunto=demissao, AGENDA: segunda 10h, terca 14h]
Lead: "Carlos"
Laura: "Carlos, ja verifiquei a agenda. Temos segunda as 10h ou terca as 14h. Qual fica melhor para voce?"

[FICHA: nome=Carlos, assunto=demissao]
Lead: "segunda as 10h"
Laura: "Agendado! Dia 31/03/2026, as 10h, consulta do Sr. Carlos com o escritorio Neves Pinheiro Lins para tratar sobre direitos trabalhistas. Qualquer duvida, estou por aqui."`;

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

  // Proximo passo
  if (contexto && contexto.tipo === 'cliente') {
    linhas.push(`\nPROXIMO PASSO: E CLIENTE. Atenda conforme o pedido. Se quiser agendar, ofereca horarios.`);
  } else {
    const temNome = lead && lead.nome && !lead.nome.startsWith('WhatsApp');
    const temAssunto = true; // NPL e sempre trabalhista

    let proximoPasso;
    if (!temNome) {
      proximoPasso = 'Mostre EMPATIA sobre a situacao + peca o NOME para verificar a agenda';
    } else {
      proximoPasso = 'Tem NOME + ASSUNTO — OFERECA HORARIOS DA AGENDA';
    }

    linhas.push(`\nPROXIMO PASSO: ${proximoPasso}`);
  }

  return linhas.join('\n');
}

// ===== BUSCAR HORÁRIOS DO CALENDÁRIO =====
async function buscarHorarios() {
  try {
    const calendar = require('./calendar');
    const { texto, slots } = await calendar.sugerirHorarios(3);
    if (slots.length > 0) {
      return slots.map(s => `- ${s.label}`).join('\n');
    }
  } catch (e) {
    console.log('[IA-NPL] Calendar nao disponivel:', e.message);
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
async function generateResponse(history, userMessage, conversaId, lead, contexto) {
  const recentHistory = buildRecentHistory(history);
  const fichaLead = buildFichaLead(lead, history, contexto);
  const horariosTexto = await buscarHorarios();

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

  const prompt = `Voce e a Laura, assistente do escritorio Neves Pinheiro Lins (especializado em trabalhista, Belem/PA).
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
  trimResponse
};
