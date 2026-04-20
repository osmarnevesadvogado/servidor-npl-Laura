// ===== NEVES PINHEIRO LINS - SERVIDOR (Laura) =====
// Mesma arquitetura do servidor da Ana, branding NPL

const express = require('express');
const cors = require('cors');
const config = require('./config');
const whatsapp = require('./whatsapp');
const db = require('./database');
const ia = require('./ia');
const fluxo = require('./fluxo');
let audio;
try { audio = require('./audio'); } catch (e) { console.log('[INIT-NPL] Audio nao disponivel'); }
let calendar;
try {
  calendar = require('./calendar');
  ia.setCalendar(calendar); // Injetar calendar no ia.js para buscar horários
  console.log('[INIT-NPL] Calendar OK');
} catch (e) {
  console.log('[INIT-NPL] Calendar nao disponivel:', e.message);
}
let documentos;
try { documentos = require('./documentos'); console.log('[INIT-NPL] Documentos OK'); } catch (e) { console.log('[INIT-NPL] Documentos nao disponivel:', e.message); }
let aprendizado;
try { aprendizado = require('./aprendizado'); console.log('[INIT-NPL] Aprendizado OK'); } catch (e) { console.log('[INIT-NPL] Aprendizado nao disponivel:', e.message); }

const app = express();

// CORS restrito a origens permitidas
const corsOptions = config.ALLOWED_ORIGINS
  ? { origin: config.ALLOWED_ORIGINS.split(',').map(o => o.trim()), credentials: true }
  : {};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Middleware de autenticação para endpoints da API
function requireApiKey(req, res, next) {
  if (!config.API_KEY) return next(); // se não configurada, permite (dev local)
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (key !== config.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ===== BUFFER DE MENSAGENS =====
const messageBuffer = new Map();

function bufferMessage(phone, text, senderName) {
  const cleanP = whatsapp.cleanPhone(phone);
  const existing = messageBuffer.get(cleanP);

  if (existing) {
    existing.messages.push(text);
    existing.senderName = senderName || existing.senderName;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushBuffer(cleanP), config.BUFFER_DELAY);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const entry = {
      messages: [text],
      senderName: senderName || '',
      timer: setTimeout(() => flushBuffer(cleanP), config.BUFFER_DELAY),
      resolve
    };
    messageBuffer.set(cleanP, entry);
  });
}

function flushBuffer(cleanP) {
  const entry = messageBuffer.get(cleanP);
  if (!entry) return;
  messageBuffer.delete(cleanP);
  entry.resolve({
    combined: entry.messages.join('\n'),
    senderName: entry.senderName
  });
}

// ===== CONTROLE DE PAUSA =====
const pausedConversas = new Map();
const processedMessages = new Set();

// ===== VERIFICAÇÃO DE CLIENTE ANTIGO =====
// Armazena clientes pendentes de confirmação: phone -> { processos, tentativas }
const pendingClienteVerification = new Map();

function pauseAI(phone, minutes = 30) {
  pausedConversas.set(whatsapp.cleanPhone(phone), Date.now() + minutes * 60 * 1000);
  console.log(`[PAUSE-NPL] IA pausada para ${phone} por ${minutes} min`);
}

function isAIPaused(phone) {
  const until = pausedConversas.get(whatsapp.cleanPhone(phone));
  if (!until) return false;
  if (Date.now() > until) {
    pausedConversas.delete(whatsapp.cleanPhone(phone));
    return false;
  }
  return true;
}

// ===== LIMPEZA PERIÓDICA =====
setInterval(() => {
  processedMessages.clear();
  whatsapp.cleanup();
  fluxo.cleanup();
  const now = Date.now();
  for (const [phone, until] of pausedConversas) {
    if (now > until) pausedConversas.delete(phone);
  }
}, 10 * 60 * 1000);

// ===== CONTROLE DE NOTIFICAÇÃO DE LEAD QUENTE =====
const jaNotificouHot = new Set(); // phones já notificados como lead quente

// ===== CLIENTES EXISTENTES CONFIRMADOS (persiste processos durante conversa) =====
const clientesConfirmados = new Map(); // phone -> { processos, timestamp }

// Limpar cache de clientes confirmados após 24h
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of clientesConfirmados) {
    if (now - entry.timestamp > 24 * 60 * 60 * 1000) clientesConfirmados.delete(phone);
  }
}, 60 * 60 * 1000);

// ===== CONTROLE DE AGENDAMENTO ÚNICO POR CONVERSA =====
// Evita que a Laura agende 2 consultas pro mesmo lead
// Persiste via métricas no banco para sobreviver a deploys

async function verificarJaAgendou(phone) {
  try {
    const { cleanPhone } = require('./whatsapp');
    const tel = cleanPhone(phone);

    // 1. Verificar no banco (métricas)
    const limite = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data } = await db.supabase
      .from('metricas')
      .select('conversa_id, detalhes, criado_em')
      .eq('evento', 'consulta_agendada')
      .eq('escritorio', 'npl')
      .gte('criado_em', limite)
      .order('criado_em', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      for (const m of data) {
        if (!m.conversa_id) continue;
        const { data: conv } = await db.supabase
          .from('conversas')
          .select('telefone')
          .eq('id', m.conversa_id)
          .maybeSingle();
        if (conv && conv.telefone === tel) {
          return { data: m.detalhes, timestamp: m.criado_em };
        }
      }
    }

    // 2. Verificar direto no Google Calendar (fallback se métrica falhou)
    if (calendar && calendar.buscarConsultaPorTelefone) {
      try {
        const eventoExistente = await calendar.buscarConsultaPorTelefone(tel);
        if (eventoExistente) {
          console.log(`[AGENDAMENTO-NPL] Consulta encontrada no Calendar: ${eventoExistente.summary}`);
          return { data: eventoExistente.summary, timestamp: eventoExistente.inicio };
        }
      } catch (e) {}
    }

    return null;
  } catch (e) {
    console.log('[AGENDAMENTO-NPL] Erro ao verificar duplicata:', e.message);
    return null;
  }
}

// ===== RATE LIMIT =====
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= config.RATE_LIMIT_MAX;
}
setInterval(() => { rateLimitMap.clear(); }, 5 * 60 * 1000);

// ===== PROCESSAMENTO ASSÍNCRONO =====
async function processBufferedMessage(phone, text, senderName, respondComAudio = false, instancia = null) {
  try {
    const result = await bufferMessage(phone, text, senderName);
    if (!result) return;

    const combinedText = result.combined;
    const finalName = result.senderName;

    console.log(`[BUFFER-NPL] Processando ${combinedText.split('\n').length} msg(s) de ${phone}`);

    // Verificar pausa ANTES de processar (pode ter sido pausada enquanto buffered)
    if (isAIPaused(phone)) {
      console.log(`[PAUSE-NPL] Msg de ${phone} descartada (IA pausada durante buffer)`);
      try {
        const conv = await db.getOrCreateConversa(phone);
        await db.saveMessage(conv.id, 'user', combinedText);
      } catch (e) {}
      return;
    }

    const lead = await db.getOrCreateLead(phone, finalName);
    const conversa = await db.getOrCreateConversa(phone);

    // Vincular lead a conversa
    if (lead && conversa && !conversa.lead_id) {
      await db.updateConversa(conversa.id, { lead_id: lead.id, titulo: finalName || conversa.titulo });
    }

    // Salvar mensagem
    await db.saveMessage(conversa.id, 'user', combinedText);

    // Extrair dados do lead (nome, subtipo trabalhista)
    if (lead) {
      await db.extractAndUpdateLead(lead.id, combinedText);
    }

    // Processar etapa do fluxo
    if (conversa.etapa_conversa) {
      fluxo.setEtapa(conversa.id, conversa.etapa_conversa);
    }
    const etapaAntes = fluxo.getEtapa(conversa.id);

    const etapaDepois = fluxo.processarEtapa(conversa.id, combinedText, lead);

    if (etapaAntes !== etapaDepois) {
      await db.updateConversa(conversa.id, { etapa_conversa: etapaDepois });
      await db.trackEvent(conversa.id, lead?.id, 'etapa_avancou', `${etapaAntes} -> ${etapaDepois}`);
    }

    // Detectar lead quente (notifica só 1 vez por lead)
    const cleanP = whatsapp.cleanPhone(phone);
    if (lead && isHotLead(combinedText) && !jaNotificouHot.has(cleanP)) {
      jaNotificouHot.add(cleanP);
      console.log(`[HOT-NPL] Lead quente: ${finalName}`);
      await db.markLeadHot(lead.id);
      await whatsapp.notifyHotLead(finalName || lead.nome, phone, combinedText.slice(0, 100));
      await db.trackEvent(conversa.id, lead.id, 'lead_quente', combinedText.slice(0, 100));
    }

    // Buscar contexto CRM completo
    let contexto = null;
    try {
      contexto = await db.getContextoCompleto(phone);
      if (contexto.tipo === 'cliente') {
        console.log(`[CRM-NPL] ${phone} e CLIENTE: ${contexto.cliente.nome_completo || contexto.cliente.razao_social}`);
      }
    } catch (e) {
      console.log('[CRM-NPL] Erro ao buscar contexto:', e.message);
    }

    // Se não é cliente CRM, verificar se é cliente antigo (planilha de processos) pelo nome
    if (!contexto || contexto.tipo === 'lead') {
      // Primeiro: verificar se já foi confirmado como cliente existente nesta conversa
      const confirmadoRecente = clientesConfirmados.get(cleanP);
      if (confirmadoRecente) {
        contexto = { tipo: 'cliente_processo', processos: confirmadoRecente.processos };
      } else {
      const pendingVerif = pendingClienteVerification.get(cleanP);

      if (pendingVerif) {
        // Já encontramos um match antes — verificar se o lead confirmou
        const lower = combinedText.toLowerCase().trim();
        // Verificar se mencionou a empresa do processo (forte confirmação)
        const empresas = pendingVerif.processos.map(p => (p.parte_contraria || '').toLowerCase()).filter(Boolean);
        const mencionouEmpresa = empresas.some(emp => emp.length > 3 && lower.includes(emp.split(' ')[0]));
        const confirmou = mencionouEmpresa || /\b(sim|confirmo|isso|exato|sou eu|tenho sim|correto|é isso|isso mesmo|sou cliente|tenho processo|ja tenho|tive sim)\b/.test(lower);
        const negou = /\b(nunca|nenhum|engano|errado|primeira vez|nao tenho processo|nao sou cliente|nunca processei)\b/.test(lower);

        if (confirmou) {
          console.log(`[CLIENTE-ANTIGO-NPL] ${cleanP} CONFIRMOU ser cliente existente`);
          contexto = { tipo: 'cliente_processo', processos: pendingVerif.processos };
          pendingClienteVerification.delete(cleanP);
          // Salvar como cliente confirmado (persiste pela conversa toda)
          clientesConfirmados.set(cleanP, { processos: pendingVerif.processos, timestamp: Date.now() });

          // Notificar Dr. Osmar
          const nomeCliente = pendingVerif.processos[0]?.nome_cliente || 'Cliente';
          await whatsapp.notifyHotLead(
            `CLIENTE EXISTENTE CONFIRMADO: ${nomeCliente}`,
            phone,
            `Cliente antigo confirmou identidade. Processos: ${pendingVerif.processos.map(p => p.numero_processo || p.materia).join(', ')}`
          );
        } else if (negou) {
          console.log(`[CLIENTE-ANTIGO-NPL] ${cleanP} NEGOU ser cliente existente`);
          pendingClienteVerification.delete(cleanP);
          // Segue como lead normal, contexto fica null/lead
        } else {
          // Resposta ambígua — tentar mais 1 vez, depois seguir como lead
          pendingVerif.tentativas = (pendingVerif.tentativas || 0) + 1;
          if (pendingVerif.tentativas >= 2) {
            // Após 2 tentativas, desistir — seguir como lead normal
            console.log(`[CLIENTE-ANTIGO-NPL] ${cleanP} não confirmou após 2 tentativas, seguindo como lead`);
            pendingClienteVerification.delete(cleanP);
          } else {
            // Manter pendente mas NÃO bloquear — Laura pode perguntar na próxima msg
            contexto = { tipo: 'cliente_processo_pendente', processos: pendingVerif.processos };
          }
        }
      } else {
        // Primeira busca — só buscar se o nome tem pelo menos 2 palavras significativas
        // A função findClienteProcessoByName já filtra nomes comuns internamente
        const nomeLead = lead?.nome;
        if (nomeLead && !nomeLead.startsWith('WhatsApp')) {
          const palavras = nomeLead.trim().split(/\s+/).filter(p => p.length > 2);
          if (palavras.length >= 2) {
            try {
              const processos = await db.findClienteProcessoByName(nomeLead);
              if (processos && processos.length > 0) {
                console.log(`[CLIENTE-ANTIGO-NPL] ${nomeLead} encontrado na base (${processos.length} processo(s)) — aguardando confirmação`);
                // NÃO definir como cliente_processo ainda — aguardar confirmação
                pendingClienteVerification.set(cleanP, { processos, tentativas: 0 });
                contexto = { tipo: 'cliente_processo_pendente', processos };
              }
            } catch (e) {
              console.log('[CLIENTE-ANTIGO-NPL] Erro ao buscar por nome:', e.message);
            }
          }
        }
      }
      } // fim do else de confirmadoRecente
    }

    // Gerar e enviar resposta (excluir última msg do history pois já vai na ficha)
    const fullHistory = await db.getHistory(conversa.id);
    const history = fullHistory.slice(0, -1);
    const rawReply = await ia.generateResponse(history, combinedText, conversa.id, lead, contexto, phone);

    // Se API sem crédito, não enviar nada (silenciar)
    if (!rawReply) {
      console.log(`[PROCESS-NPL] Resposta nula para ${phone} — API possivelmente sem credito`);
      return;
    }

    const reply = ia.trimResponse(rawReply);
    await db.saveMessage(conversa.id, 'assistant', reply);

    // Se Laura confirmou agendamento, criar evento no Google Calendar
    const replyLower = reply.toLowerCase();

    // Verificar bloqueios no histórico (mesma lógica do ia.js)
    const allTextBloqueio = (history || []).map(m => m.content).join(' ').toLowerCase() + ' ' + combinedText.toLowerCase();
    const temBloqueio = /(prefeitura|governo municipal|orgao municipal|órgão municipal|servidor municipal|câmara municipal|camara municipal)/i.test(allTextBloqueio);

    // Detectar confirmação NOVA — exige "Agendado!" (com exclamação, não interrogação)
    const temConfirmacao = /agendado\s*!/i.test(reply) ||
      (/agendad[oa]/i.test(reply) && !/já está agendad|ja esta agendad|agendado\s*\?/i.test(replyLower));
    // Exige DIA e HORA na resposta (não apenas um dos dois)
    const temDia = /(segunda|terça|terca|quarta|quinta|sexta|amanhã|amanha|hoje|\d{1,2}\/\d{1,2}|dia\s+\d{1,2})/i.test(replyLower);
    const temHora = /(\d{1,2})\s*(?:h|hrs?|horas?)/i.test(replyLower) || /[àa]s\s+\d{1,2}/i.test(replyLower);
    // Palavras que indicam referência (não confirmação nova)
    const eReferencia = /(já está|ja esta|desculpa|confusão|confusao|verificar|vou buscar|tem certeza|quer mudar|quer mesmo|precisa mudar)/i.test(replyLower);
    const agendouConsulta = temConfirmacao && temDia && temHora && !eReferencia && !temBloqueio;
    if (calendar && agendouConsulta) {
      // Verificar se já agendou
      const agendamentoExistente = await verificarJaAgendou(phone);

      // Detectar remarcação: palavras explícitas OU (tem agendamento + lead mencionou outra data)
      const allTextLower = (history || []).slice(-6).map(m => m.content).join(' ').toLowerCase() + ' ' + combinedText.toLowerCase();
      const remarcacaoExplicita = /(remarc|mudar|trocar|cancelar|adiar|nao vou poder|não vou poder|outro dia|outro horario|outro horário|posso mudar|posso trocar|pode ser outro|tem outro)/.test(allTextLower);
      const leadMudouData = agendamentoExistente && /(pode ser|prefiro|quero|melhor|bora|vamos|segunda|terça|terca|quarta|quinta|sexta|amanhã|amanha)/.test(combinedText.toLowerCase());
      const eRemarcacao = remarcacaoExplicita || leadMudouData;

      if (agendamentoExistente && !eRemarcacao) {
        console.log(`[CALENDAR-NPL] BLOQUEADO: ${phone} ja agendou recentemente (${agendamentoExistente.data})`);
      } else {
      // Se é remarcação, cancelar consulta anterior
      if (eRemarcacao && agendamentoExistente) {
        try {
          const cancelado = await calendar.cancelarConsulta(phone);
          if (cancelado) {
            console.log(`[CALENDAR-NPL] Remarcação: consulta anterior cancelada (${cancelado.summary})`);
          }
        } catch (e) {
          console.log('[CALENDAR-NPL] Erro ao cancelar consulta anterior:', e.message);
        }
      }
      try {
        // Buscar slot usando a RESPOSTA DA LAURA (que tem o horário confirmado)
        // e o texto do lead como fallback
        const slot = await calendar.encontrarSlot(reply, phone) || await calendar.encontrarSlot(combinedText, phone);
        if (slot) {
          const nome = lead?.nome || 'Lead';
          const email = lead?.email || null;
          // Detectar formato (presencial ou online) na conversa
          const allConvText = (history || []).map(m => m.content).join(' ').toLowerCase() + ' ' + reply.toLowerCase();
          const formato = /(presencial|no escritorio|no escritório|pessoalmente)/.test(allConvText) ? 'presencial' : 'online';
          const resultado = await calendar.criarConsulta(nome, phone, email, slot.inicio, formato);
          if (resultado) {
            console.log(`[CALENDAR-NPL] Consulta CRIADA: ${nome} em ${resultado.inicio} com ${resultado.colaboradora}`);
            try {
              await db.trackEvent(conversa.id, lead?.id, 'consulta_agendada', `${resultado.inicio} - ${resultado.colaboradora}`);
            } catch (e) {
              console.log('[TRACK-NPL] Erro ao rastrear evento (nao bloqueante):', e.message);
            }

            // Criar tarefa no CRM para a consulta agendada
            try {
              const dataConsulta = slot.inicio.toISOString().slice(0, 10);
              await db.createTarefa({
                descricao: `Consulta Trabalhista - ${nome} - ${resultado.inicio} com ${resultado.colaboradora}`,
                data_limite: dataConsulta,
                prioridade: 'alta',
                status: 'pendente',
                responsavel: resultado.colaboradora
              });
              console.log(`[TAREFA-NPL] Tarefa criada para consulta de ${nome}`);
            } catch (e) {
              console.log('[TAREFA-NPL] Erro ao criar tarefa:', e.message);
            }

            // Mover lead no funil para "proposta" (agendou consulta)
            if (lead) {
              try {
                const etapaAtual = lead.etapa_funil || 'novo';
                if (etapaAtual !== 'convertido' && etapaAtual !== 'proposta') {
                  await db.updateLead(lead.id, { etapa_funil: 'proposta' });
                  console.log(`[FUNIL-NPL] ${nome} movido para 'proposta' (agendou consulta)`);
                }
              } catch (e) {
                console.log('[FUNIL-NPL] Erro ao mover lead:', e.message);
              }
            }

            // Notificar Dr. Osmar sobre o novo agendamento
            await whatsapp.notifyHotLead(
              `CONSULTA AGENDADA: ${nome}`,
              phone,
              `${resultado.inicio} com ${resultado.colaboradora}. Formato: online.`
            );

            // Enviar confirmação detalhada ao lead (texto + áudio)
            try {
              const tituloResponsavel = resultado.colaboradora === 'Luiza' ? 'Responsável' : 'Advogada';
              const msgConfirmacao = `${nome}, sua consulta foi confirmada!\n\n` +
                `Data: ${resultado.inicio}\n` +
                `${tituloResponsavel}: ${resultado.colaboradora}\n` +
                `Formato: Online (o link será enviado antes da reunião)\n\n` +
                `Escritório NPLADVS - Especializado em Direitos Trabalhistas.\n` +
                `Qualquer dúvida, estou à disposição!`;

              await whatsapp.sendText(phone, msgConfirmacao, instancia);
              await db.saveMessage(conversa.id, 'assistant', msgConfirmacao);
              console.log(`[CONFIRM-NPL] Confirmação enviada para ${nome}`);
            } catch (e) {
              console.log('[CONFIRM-NPL] Erro ao enviar confirmação:', e.message);
            }

            // Analisar conversa para aprendizado (async, não bloqueia)
            if (aprendizado) {
              const histCompleto = await db.getHistory(conversa.id);
              aprendizado.analisarConversa(histCompleto, lead, 'agendou').catch(e =>
                console.log('[APRENDIZADO-NPL] Erro na analise pos-agendamento:', e.message)
              );
            }
          } else {
            console.log('[CALENDAR-NPL] Falha ao criar evento (calendar retornou null)');
          }
        } else {
          console.log('[CALENDAR-NPL] Não encontrou slot correspondente à escolha do lead');
        }
      } catch (e) {
        console.log('[CALENDAR-NPL] Erro ao criar evento no agendamento:', e.message);
      }
      } // fecha else do verificarJaAgendou
    }

    // Enviar resposta — áudio só se o lead mandou áudio
    await whatsapp.sendText(phone, reply, instancia);
    if (respondComAudio && audio) {
      const audioBase64 = await audio.gerarAudio(reply);
      if (audioBase64) {
        await whatsapp.sendAudio(phone, audioBase64, instancia);
        console.log(`[AUDIO-NPL] Resposta em audio enviada para ${phone}`);
      }
    }

    // Atualizar etapa do funil
    if (lead && lead.etapa_funil === 'novo') {
      await db.updateLead(lead.id, { etapa_funil: 'contato' });
    }

    // Calcular score do lead (async, não bloqueia)
    if (lead) {
      db.calcularScore(lead.id, conversa.id).catch(e =>
        console.log('[SCORING-NPL] Erro:', e.message)
      );
    }

    // Metrica de primeiro contato
    if (history.length <= 1) {
      await db.trackEvent(conversa.id, lead?.id, 'primeiro_contato', senderName);
    }

    console.log(`[REPLY-NPL] Para ${phone}: ${reply.slice(0, 80)}...`);
  } catch (e) {
    console.error('[PROCESS-NPL] Erro:', e.message);
  }
}

// Formata telefone como (DDD) XXXXX-XXXX (ou variações)
function formatarTelefone(tel) {
  if (!tel) return 'Contato';
  const limpo = tel.replace(/\D/g, '');
  // Remove DDI 55 se presente
  const sem55 = limpo.startsWith('55') ? limpo.slice(2) : limpo;
  if (sem55.length === 11) return `(${sem55.slice(0,2)}) ${sem55.slice(2,7)}-${sem55.slice(7)}`;
  if (sem55.length === 10) return `(${sem55.slice(0,2)}) ${sem55.slice(2,6)}-${sem55.slice(6)}`;
  return `(${tel})`;
}

function isHotLead(text) {
  const lower = text.toLowerCase();
  return config.HOT_LEAD_KEYWORDS.some(kw => lower.includes(kw));
}

// ===== FOLLOW-UP AUTOMÁTICO =====
async function checkFollowUps() {
  try {
    const eligible = await db.getEligibleConversas();
    if (eligible.length === 0) return;

    const conversaIds = eligible.map(c => c.id);
    const allMsgs = await db.getRecentMessages(conversaIds, 5);

    const msgsByConv = {};
    for (const msg of allMsgs) {
      if (!msgsByConv[msg.conversa_id]) msgsByConv[msg.conversa_id] = [];
      if (msgsByConv[msg.conversa_id].length < 5) {
        msgsByConv[msg.conversa_id].push(msg);
      }
    }

    const now = Date.now();

    for (const conv of eligible) {
      const lastMsgs = msgsByConv[conv.id];
      if (!lastMsgs || lastMsgs.length === 0) continue;

      const lastMsg = lastMsgs[0];
      const hoursAgo = (now - new Date(lastMsg.criado_em).getTime()) / (1000 * 60 * 60);

      // Se última msg é do lead (Laura não respondeu, ex: API sem crédito),
      // tratar como se a última msg da Laura fosse há muito tempo
      if (lastMsg.role !== 'assistant') {
        // Só enviar follow-up se faz mais de 2h que o lead mandou sem resposta
        if (hoursAgo < 2) continue;
      }

      let followUpCount = 0;
      for (const m of lastMsgs) {
        if (m.role === 'assistant') followUpCount++;
        else break;
      }

      const nome = conv.leads?.nome || 'amigo(a)';

      async function getSmartMsg(fixedMsg, followUpNum) {
        try {
          const history = await db.getHistory(conv.id);
          const smart = await ia.generateFollowUp(history, conv.leads, followUpNum);
          if (smart && smart.length > 10) return smart;
        } catch (e) {
          // Se sem crédito, não enviar nem a mensagem fixa
          if (e.message?.includes('credit balance') || e.message?.includes('too low')) {
            console.log(`[FOLLOWUP-NPL] API sem credito — follow-up cancelado`);
            return null;
          }
          console.log(`[FOLLOWUP-NPL] IA falhou, usando fixo: ${e.message}`);
        }
        return fixedMsg;
      }

      async function sendFollowUp(msg, asAudio) {
        // Validar que a mensagem é válida antes de enviar
        if (!msg || msg.length < 15 || msg.toLowerCase().includes('não consigo') || msg.toLowerCase().includes('nao consigo') || msg.toLowerCase().includes('como assistente')) {
          console.log(`[FOLLOWUP-NPL] Mensagem inválida descartada: "${msg?.slice(0, 60)}"`);
          return;
        }
        if (asAudio && audio) {
          const audioBase64 = await audio.gerarAudio(msg);
          if (audioBase64) {
            await whatsapp.sendAudio(conv.telefone, audioBase64);
          } else {
            await whatsapp.sendText(conv.telefone, msg);
          }
        } else {
          await whatsapp.sendText(conv.telefone, msg);
        }
        await db.saveMessage(conv.id, 'assistant', msg);
      }

      // 1o FOLLOW-UP: 2h sem resposta
      if (followUpCount === 1 && hoursAgo >= 2 && hoursAgo < 4) {
        const fixo = `${nome}, tudo bem? Ficou com alguma duvida sobre os seus direitos trabalhistas? Estou aqui para te ajudar.`;
        const msg = await getSmartMsg(fixo, 1);
        console.log(`[FOLLOWUP-NPL-2h] ${conv.telefone} (${nome})`);
        await sendFollowUp(msg, false);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_2h', nome);
      }

      // 2o FOLLOW-UP: 4h sem resposta
      if (followUpCount === 2 && hoursAgo >= 4 && hoursAgo < 20) {
        const fixo = `${nome}, aqui e a Laura do escritorio NPLADVS. Passando para saber se posso te ajudar com a sua situacao trabalhista. Temos horarios disponiveis essa semana e a consulta inicial e sem compromisso.`;
        const msg = await getSmartMsg(fixo, 2);
        console.log(`[FOLLOWUP-NPL-4h] ${conv.telefone} (${nome})`);
        await sendFollowUp(msg, false);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_4h', nome);
      }

      // 3o FOLLOW-UP: 24h
      if (followUpCount === 3 && hoursAgo >= 24 && hoursAgo < 48) {
        const fixo = `${nome}, so lembrando que existe um prazo de 2 anos apos sair da empresa para buscar seus direitos trabalhistas. O escritorio NPLADVS pode avaliar o seu caso sem compromisso. Me avisa se tiver interesse.`;
        const msg = await getSmartMsg(fixo, 3);
        console.log(`[FOLLOWUP-NPL-24h] ${conv.telefone} (${nome})`);
        await sendFollowUp(msg, false);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_24h', nome);
      }

      // 4o FOLLOW-UP: 72h
      if (followUpCount === 4 && hoursAgo >= 48 && hoursAgo < 96) {
        const fixo = `${nome}, tudo bem? Aqui e a Laura do escritorio NPLADVS. Essa e a minha ultima mensagem sobre o assunto, nao quero te incomodar. Caso mude de ideia, estamos a disposicao para avaliar os seus direitos. Te desejo tudo de bom.`;
        const msg = await getSmartMsg(fixo, 4);
        console.log(`[FOLLOWUP-NPL-72h] ${conv.telefone} (${nome})`);
        await sendFollowUp(msg, false);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_72h', nome);

        // Marcar lead como perdido
        if (conv.leads?.id) {
          await db.updateLead(conv.leads.id, { etapa_funil: 'perdido' });
          console.log(`[FUNIL-NPL] ${nome} marcado como perdido (4o follow-up sem resposta)`);
        }

        // Analisar conversa perdida para aprendizado
        if (aprendizado) {
          const histCompleto = await db.getHistory(conv.id);
          aprendizado.analisarConversa(histCompleto, conv.leads, 'lead perdido').catch(e =>
            console.log('[APRENDIZADO-NPL] Erro na analise lead perdido:', e.message)
          );
        }
      }
    }
  } catch (e) {
    console.error('[FOLLOWUP-NPL] Erro:', e.message);
  }
}

// Limpar lições ruins semanalmente (domingo às 3h)
setInterval(() => {
  const now = new Date();
  const belemDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/Belem' })).getDay();
  const belemHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Belem', hour: 'numeric', hour12: false }));
  if (belemDay === 0 && belemHour === 3 && aprendizado) {
    aprendizado.limparLicoesRuins();
  }
}, 60 * 60 * 1000);

// Agendar follow-ups (8h-20h Belem, a cada 30 minutos)
setInterval(() => {
  const belemHour = new Date().toLocaleString('en-US', { timeZone: 'America/Belem', hour: 'numeric', hour12: false });
  if (parseInt(belemHour) >= 8 && parseInt(belemHour) <= 20) {
    console.log('[FOLLOWUP-NPL] Verificando...');
    checkFollowUps();
  }
}, 30 * 60 * 1000);
setTimeout(() => checkFollowUps(), 60 * 1000);

// ===== LEMBRETES DE CONSULTA =====
// Envia lembrete no dia da consulta às 08h (áudio) e 30min antes (texto)
const lembretesEnviados = new Set(); // evitar duplicatas: "tipo_eventId"

async function checkLembretesConsulta() {
  if (!calendar) return;
  try {
    const consultas = await calendar.getConsultasDoDia();
    if (consultas.length === 0) return;

    const belemAgora = calendar.agoraBelem();
    const horaAtual = belemAgora.getUTCHours();
    const minAtual = belemAgora.getUTCMinutes();

    for (const consulta of consultas) {
      if (!consulta.telefone) continue;

      const chaveMatinal = `matinal_${consulta.id}`;
      const chave30min = `30min_${consulta.id}`;

      // Lembrete matinal às 08h (áudio)
      if (horaAtual === 8 && minAtual < 15 && !lembretesEnviados.has(chaveMatinal)) {
        lembretesEnviados.add(chaveMatinal);
        try {
          const tituloLembrete = consulta.colaboradora === 'Luiza' ? 'a colaboradora' : 'a advogada';
          const msgTexto = `Bom dia, ${consulta.nome}! Aqui é a Laura do escritório NPLADVS. ` +
            `Passando para lembrar que hoje você tem consulta trabalhista às ${consulta.inicioFormatado} ` +
            `com ${tituloLembrete} ${consulta.colaboradora}. A consulta será online. ` +
            `Nos vemos mais tarde!`;

          await whatsapp.sendText(consulta.telefone, msgTexto);
          console.log(`[LEMBRETE-NPL] Lembrete matinal (08h) para ${consulta.nome}`);
        } catch (e) {
          console.log(`[LEMBRETE-NPL] Erro lembrete matinal ${consulta.nome}:`, e.message);
        }
      }

      // Lembrete 30min antes (texto)
      const inicioConsulta = consulta.inicio.getTime();
      const agora = Date.now();
      const minFaltando = (inicioConsulta - agora) / (1000 * 60);

      if (minFaltando > 0 && minFaltando <= 35 && !lembretesEnviados.has(chave30min)) {
        lembretesEnviados.add(chave30min);
        try {
          const titulo30 = consulta.colaboradora === 'Luiza' ? 'a colaboradora' : 'a advogada';
          const msgLembrete = `${consulta.nome}, sua consulta trabalhista com ${titulo30} ${consulta.colaboradora} ` +
            `comeca em 30 minutos!\n\n` +
            `O link para a reuniao online sera enviado em instantes.\n\n` +
            `Escritorio NPLADVS - Estamos te aguardando!`;

          await whatsapp.sendText(consulta.telefone, msgLembrete);
          console.log(`[LEMBRETE-NPL] Lembrete 30min enviado para ${consulta.nome}`);
        } catch (e) {
          console.log(`[LEMBRETE-NPL] Erro lembrete 30min ${consulta.nome}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[LEMBRETE-NPL] Erro geral:', e.message);
  }
}

// Verificar lembretes a cada 5 minutos (08h-18h Belém)
setInterval(() => {
  const belemHour = new Date().toLocaleString('en-US', { timeZone: 'America/Belem', hour: 'numeric', hour12: false });
  const h = parseInt(belemHour);
  if (h >= 8 && h <= 18) {
    checkLembretesConsulta();
  }
}, 5 * 60 * 1000);
// Primeira verificação 2min após boot
setTimeout(() => checkLembretesConsulta(), 2 * 60 * 1000);

// Limpar lembretes enviados à meia-noite (para o dia seguinte)
setInterval(() => {
  const belemHour = new Date().toLocaleString('en-US', { timeZone: 'America/Belem', hour: 'numeric', hour12: false });
  if (parseInt(belemHour) === 0) {
    lembretesEnviados.clear();
    console.log('[LEMBRETE-NPL] Lembretes limpos para novo dia');
  }
}, 60 * 60 * 1000);

// ===== WEBHOOK Z-API — ESCRITÓRIO (só salva, sem IA) =====
app.post('/webhook/zapi-escritorio', async (req, res) => {
  try {
    res.json({ ok: true });

    const body = req.body;
    const isFromMe = body.fromMe || body.isFromMe;
    const isMessage = body.type === 'ReceivedCallback' || body.text?.message || body.body;
    if (!isMessage && !isFromMe) return;

    const phone = isFromMe
      ? (body.phone || body.to?.replace('@c.us', '') || '')
      : (body.phone || body.from?.replace('@c.us', '') || '');
    if (!phone) return;

    const text = body.text?.message || body.body || '';
    const tel = whatsapp.cleanPhone(phone);

    // Detectar mídia
    const imageData = body.image || body.imageMessage || null;
    const documentData = body.document || body.documentMessage || null;
    const videoData = body.video || body.videoMessage || null;
    const audioData = body.audio || body.audioMessage || null;

    let mediaUrl = null;
    let mediaType = null;
    let content = text;

    if (imageData) {
      mediaUrl = imageData.imageUrl || imageData.url || imageData.mediaUrl || null;
      mediaType = 'image';
      content = imageData.caption || text || '📷 Imagem';
    } else if (documentData) {
      mediaUrl = documentData.documentUrl || documentData.url || documentData.mediaUrl || null;
      mediaType = 'document';
      content = documentData.fileName || text || '📄 Documento';
    } else if (videoData) {
      mediaUrl = videoData.videoUrl || videoData.url || videoData.mediaUrl || null;
      mediaType = 'video';
      content = videoData.caption || text || '🎥 Vídeo';
    } else if (audioData) {
      mediaUrl = audioData.audioUrl || audioData.url || audioData.mediaUrl || null;
      mediaType = 'audio';
      content = text || '🎤 Áudio';
    }

    if (!content && !mediaUrl) return;

    // Extrair nome do contato (senderName/pushName) ou formatar número como fallback
    const senderName = body.senderName || body.pushName || body.notifyName || body.chatName || '';
    const nomeContato = senderName && !senderName.startsWith('+') && senderName.length > 2
      ? senderName
      : formatarTelefone(tel);

    // Buscar ou criar conversa com origem_numero = 'escritorio'
    let { data: conv } = await db.supabase
      .from('conversas')
      .select('id, titulo')
      .eq('telefone', tel)
      .eq('status', 'ativa')
      .eq('escritorio', 'npl')
      .eq('origem_numero', 'escritorio')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await db.supabase
        .from('conversas')
        .insert({
          telefone: tel,
          titulo: nomeContato,
          escritorio: 'npl',
          origem_numero: 'escritorio'
        })
        .select('id, titulo')
        .single();
      conv = newConv;
    } else if (senderName && senderName.length > 2 && (!conv.titulo || conv.titulo === 'WhatsApp Escritório' || conv.titulo.startsWith('('))) {
      // Atualizar título se ainda não tem nome real
      await db.supabase
        .from('conversas')
        .update({ titulo: nomeContato })
        .eq('id', conv.id);
    }

    if (!conv) return;

    // Salvar mensagem
    const role = isFromMe ? 'assistant' : 'user';
    const extra = {
      origem_numero: 'escritorio',
      ...(mediaUrl && { media_url: mediaUrl }),
      ...(mediaType && { media_type: mediaType }),
      ...(isFromMe && { manual: true })
    };

    await db.supabase
      .from('mensagens')
      .insert({ conversa_id: conv.id, role, content, ...extra });

    console.log(`[ESCRITORIO-NPL] ${role === 'user' ? 'Recebida' : 'Enviada'}: ${tel} - ${content.slice(0, 60)}`);
  } catch (e) {
    console.error('[ESCRITORIO-NPL] Erro:', e.message);
  }
});

// ===== WEBHOOK Z-API — LAURA =====
app.post('/webhook/zapi', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Validar token do webhook (opcional — só valida se ZAPI_WEBHOOK_TOKEN estiver configurado)
    if (config.ZAPI_WEBHOOK_TOKEN) {
      const received = req.headers['client-token'] || req.headers['x-api-key'] || req.headers['authorization'] || req.query.token;
      if (received !== config.ZAPI_WEBHOOK_TOKEN) {
        console.log('[WEBHOOK-NPL] Token invalido recebido - rejeitando');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const body = req.body;
    const messageId = body.messageId || body.ids?.[0]?.serialized || body.id?.id || '';
    const isMessage = body.type === 'ReceivedCallback' || body.text?.message;
    const isFromMe = body.fromMe || body.isFromMe;

    // Detectar qual instância (escritório ou prospecção)
    const instancia = whatsapp.detectarInstancia(body);

    // Número 01 (escritório): Laura silenciosa durante horário comercial
    if (instancia === 'escritorio' && !isFromMe && await whatsapp.isHorarioComercial()) {
      // Salvar mensagem mas não responder (equipe atende)
      const phone = body.phone || body.from?.replace('@c.us', '') || '';
      if (phone) {
        try {
          const conversa = await db.getOrCreateConversa(phone);
          const text = body.text?.message || body.body || '';
          if (text) await db.saveMessage(conversa.id, 'user', text);
        } catch (e) {}
      }
      console.log(`[ESCRITORIO-NPL] Horario comercial - msg salva sem IA: ${phone}`);
      return res.json({ status: 'office_hours' });
    }

    if (isFromMe) {
      const phone = body.phone || body.to?.replace('@c.us', '') || '';
      if (phone && whatsapp.wasBotRecentSend(phone)) {
        return res.json({ status: 'bot_sent' });
      }
      if (phone) {
        pauseAI(phone, 30);
        console.log(`[MANUAL-NPL] Atendente respondeu para ${phone} - IA pausada 30min`);

        // Criar conversa/lead se for primeiro contato (outbound)
        try {
          const text = body.text?.message || body.body || '';
          const conversa = await db.getOrCreateConversa(phone);
          await db.getOrCreateLead(phone);
          if (text && conversa) {
            await db.saveMessage(conversa.id, 'assistant', text, { manual: true });
          }
        } catch (e) {
          console.log('[MANUAL-NPL] Erro ao criar conversa outbound:', e.message);
        }
      }
      return res.json({ status: 'manual_detected' });
    }

    if (!isMessage) return res.json({ status: 'ignored' });

    if (messageId && processedMessages.has(messageId)) {
      return res.json({ status: 'duplicate' });
    }
    if (messageId) processedMessages.add(messageId);

    const phone = body.phone || body.from?.replace('@c.us', '') || '';
    let text = body.text?.message || body.body || '';
    // Limitar tamanho da mensagem para evitar abuso
    if (text.length > 5000) text = text.slice(0, 5000);
    const senderName = body.senderName || body.notifyName || '';
    const audioUrl = body.audio?.audioUrl || body.audioMessage?.url || body.audio?.url || body.audio?.mediaUrl || body.audioMessage?.audioUrl || body.audioMessage?.mediaUrl || null;
    const isAudio = body.isAudio === true || !!body.audioMessage || (!!audioUrl && audioUrl.length > 10);

    // Detectar mídia (imagem, documento, vídeo)
    const imageData = body.image || body.imageMessage || null;
    const documentData = body.document || body.documentMessage || null;
    const videoData = body.video || body.videoMessage || null;
    const hasMedia = imageData || documentData || videoData;

    // Se for mídia (imagem, documento, vídeo), salvar na conversa e processar
    if (hasMedia && phone) {
      let mediaUrl = null;
      let mediaType = null;
      let caption = '';
      let fileName = '';

      if (imageData) {
        mediaUrl = imageData.imageUrl || imageData.url || imageData.mediaUrl || null;
        mediaType = 'image';
        caption = imageData.caption || '';
      } else if (documentData) {
        mediaUrl = documentData.documentUrl || documentData.url || documentData.mediaUrl || null;
        mediaType = 'document';
        fileName = documentData.fileName || '';
        caption = fileName || documentData.caption || 'Documento';
      } else if (videoData) {
        mediaUrl = videoData.videoUrl || videoData.url || videoData.mediaUrl || null;
        mediaType = 'video';
        caption = videoData.caption || '';
      }

      console.log(`[MEDIA-NPL] ${mediaType} recebido de ${phone}: ${mediaUrl?.slice(0, 60)}`);

      // Salvar mídia no banco
      const conversa = await db.getOrCreateConversa(phone);
      const contentLabel = mediaType === 'image' ? (caption || '📷 Imagem')
        : mediaType === 'document' ? `📄 ${fileName || 'Documento'}`
        : (caption || '🎥 Vídeo');
      await db.saveMessage(conversa.id, 'user', contentLabel, { media_url: mediaUrl, media_type: mediaType });

      // Se IA pausada, salvar mas não responder
      if (isAIPaused(phone)) {
        console.log(`[PAUSE-NPL] Mídia de ${phone} salva - IA pausada`);
        return res.json({ status: 'media_saved' });
      }

      // Processar com a IA para Laura responder sobre a mídia
      res.json({ status: 'media_processing' });
      const descricaoMidia = mediaType === 'image' ? (caption || 'uma imagem')
        : mediaType === 'document' ? `um documento: ${fileName || 'arquivo'}`
        : (caption || 'um vídeo');
      processBufferedMessage(phone, `[Lead enviou ${descricaoMidia}]`, senderName, false, instancia).catch(err => {
        console.error('[MEDIA-NPL] Erro ao processar:', err.message);
      });
      return;
    }

    // Se for audio, salvar URL + transcrever + processar
    if (isAudio || audioUrl) {
      console.log(`[AUDIO-NPL] Audio recebido de ${phone}`);
      res.json({ status: 'audio_received' });

      (async () => {
        try {
          const url = audioUrl;
          const conversa = await db.getOrCreateConversa(phone);

          // Salvar áudio com URL para o CRM poder reproduzir
          await db.saveMessage(conversa.id, 'user', '🎤 Áudio', { media_url: url || null, media_type: 'audio' });

          // Se IA pausada, não transcrever/responder
          if (isAIPaused(phone)) {
            console.log(`[PAUSE-NPL] Audio de ${phone} salvo - IA pausada`);
            return;
          }

          // Transcrever e responder
          if (!audio || !url) {
            console.log('[AUDIO-NPL] Whisper não disponível ou URL ausente');
            return;
          }

          let transcricao;
          try {
            transcricao = await audio.transcreverAudio(url);
          } catch (errTransc) {
            console.error('[AUDIO-NPL] Erro na transcricao:', errTransc.message);
          }
          if (!transcricao) {
            await whatsapp.sendText(phone, 'Desculpe, nao consegui ouvir seu audio. Pode digitar ou enviar novamente?');
            return;
          }

          // Atualizar a mensagem do áudio com a transcrição
          // (salvar transcrição como conteúdo para o histórico da IA)
          await processBufferedMessage(phone, transcricao, senderName, true, instancia);
        } catch (e) {
          console.error('[AUDIO-NPL] Erro ao processar audio:', e.message);
        }
      })();
      return;
    }

    if (!phone || !text) return res.json({ status: 'no_content' });

    // IA pausada: salvar mas nao responder
    if (isAIPaused(phone)) {
      console.log(`[PAUSE-NPL] Msg de ${phone} salva - IA pausada`);
      try {
        const conversa = await db.getOrCreateConversa(phone);
        await db.saveMessage(conversa.id, 'user', text);
      } catch (e) {
        console.error('[PAUSE-NPL] Erro ao salvar:', e.message);
      }
      return res.json({ status: 'paused' });
    }

    console.log(`[MSG-NPL] De: ${phone} (${senderName}): ${text.slice(0, 80)}`);

    res.json({ status: 'buffered' });

    processBufferedMessage(phone, text, senderName, false, instancia).catch(err => {
      console.error('[ASYNC-NPL] Erro:', err.message);
    });

  } catch (e) {
    console.error('[WEBHOOK-NPL] Erro:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno' });
    }
  }
});

// ===== ROTAS =====

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    escritorio: 'NPLADVS',
    assistente: 'Laura',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test/zapi', requireApiKey, async (req, res) => {
  try {
    const r = await fetch(`${config.ZAPI_BASE}/status`, { headers: { 'Client-Token': config.ZAPI_CLIENT_TOKEN } });
    res.json(await r.json());
  } catch (e) {
    console.error('[TEST-ZAPI] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao testar Z-API' });
  }
});

app.get('/api/test/claude', requireApiKey, async (req, res) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Diga apenas: OK' }]
    });
    res.json({ ok: true, response: response.content[0].text });
  } catch (e) {
    console.error('[TEST-CLAUDE] Erro:', e.message);
    res.status(500).json({ ok: false, error: 'Erro ao testar Claude' });
  }
});

app.get('/api/conversas', async (req, res) => {
  try {
    res.json(await db.listConversas());
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

app.get('/api/conversas/:id/mensagens', async (req, res) => {
  try {
    res.json(await db.getConversaMensagens(req.params.id));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

app.post('/api/enviar', requireApiKey, async (req, res) => {
  try {
    const { phone, message, conversaId, usuario_nome } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone e message obrigatorios' });
    // Pausar IA quando atendente envia pelo CRM (mesma lógica do WhatsApp direto)
    pauseAI(phone, 30);
    if (conversaId) await db.saveMessage(conversaId, 'assistant', message, { manual: true, usuario_nome: usuario_nome || null });
    const result = await whatsapp.sendText(phone, message);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao enviar' });
  }
});

app.post('/api/pausar', requireApiKey, (req, res) => {
  const { phone, minutes } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone obrigatorio' });
  pauseAI(phone, minutes || 30);
  res.json({ ok: true, msg: `IA pausada para ${phone} por ${minutes || 30} minutos` });
});

app.post('/api/retomar', requireApiKey, (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone obrigatorio' });
  pausedConversas.delete(whatsapp.cleanPhone(phone));
  res.json({ ok: true, msg: `IA retomada para ${phone}` });
});

app.get('/api/pausar/status', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'phone obrigatorio' });
  const paused = isAIPaused(phone);
  res.json({ phone: whatsapp.cleanPhone(phone), paused });
});

// ===== DIAS NÃO ÚTEIS (feriados municipais, enforcados, férias da equipe) =====

// Listar dias não úteis futuros
app.get('/api/dias-nao-uteis', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.supabase
      .from('dias_nao_uteis')
      .select('*')
      .eq('escritorio', 'npl')
      .gte('data', hoje)
      .order('data', { ascending: true });
    if (error) throw error;
    res.json({ ok: true, dias: data || [] });
  } catch (e) {
    console.error('[DIAS-NPL] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao listar dias nao uteis' });
  }
});

// Adicionar dia não útil
app.post('/api/dias-nao-uteis', requireApiKey, async (req, res) => {
  try {
    const { data, tipo, descricao } = req.body;
    if (!data) return res.status(400).json({ error: 'data obrigatoria (formato YYYY-MM-DD)' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ error: 'data deve ser no formato YYYY-MM-DD' });
    }
    const tipoFinal = tipo || 'enforcado';
    const { data: inserted, error } = await db.supabase
      .from('dias_nao_uteis')
      .insert({
        data,
        tipo: tipoFinal,
        descricao: descricao || tipoFinal,
        escritorio: 'npl'
      })
      .select()
      .single();
    if (error) throw error;

    // Limpar cache do whatsapp.js
    whatsapp.limparCacheDiasNaoUteis && whatsapp.limparCacheDiasNaoUteis();

    res.json({ ok: true, dia: inserted });
  } catch (e) {
    console.error('[DIAS-NPL] Erro ao adicionar:', e.message);
    res.status(500).json({ error: 'Erro ao adicionar dia' });
  }
});

// Remover dia não útil
app.delete('/api/dias-nao-uteis/:id', requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await db.supabase
      .from('dias_nao_uteis')
      .delete()
      .eq('id', id)
      .eq('escritorio', 'npl');
    if (error) throw error;

    whatsapp.limparCacheDiasNaoUteis && whatsapp.limparCacheDiasNaoUteis();
    res.json({ ok: true });
  } catch (e) {
    console.error('[DIAS-NPL] Erro ao remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover dia' });
  }
});

// ===== RECUPERAR LEADS NO VÁCUO =====
// Dispara resposta da Laura para leads que mandaram msg e não receberam resposta
app.post('/api/recuperar-vacuo', requireApiKey, async (req, res) => {
  try {
    const { desde, instancia } = req.body || {};
    // Padrão: últimos 3 dias
    const desdeData = desde
      ? new Date(desde).toISOString()
      : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Buscar todas conversas ativas da instância (ou todas se não especificado)
    let query = db.supabase
      .from('conversas')
      .select('id, telefone, lead_id, leads(id, nome, telefone)')
      .eq('status', 'ativa')
      .eq('escritorio', 'npl')
      .gte('criado_em', '2020-01-01');

    const { data: conversas, error: errConv } = await query;
    if (errConv) throw errConv;

    const processadas = [];
    const erros = [];

    for (const conv of (conversas || [])) {
      try {
        // Buscar a última mensagem da conversa
        const { data: msgs } = await db.supabase
          .from('mensagens')
          .select('role, content, criado_em')
          .eq('conversa_id', conv.id)
          .order('criado_em', { ascending: false })
          .limit(1);

        if (!msgs || msgs.length === 0) continue;
        const ultima = msgs[0];

        // Só processar se última msg é do lead E é recente (desde a data pedida)
        if (ultima.role !== 'user') continue;
        if (new Date(ultima.criado_em).toISOString() < desdeData) continue;

        // Pular se IA está pausada
        if (isAIPaused(conv.telefone)) continue;

        // Disparar processamento (async, sem bloquear)
        processBufferedMessage(conv.telefone, ultima.content, conv.leads?.nome || '', false, instancia || 'escritorio').catch(e => {
          console.log(`[RECUPERAR-VACUO] Erro ${conv.telefone}:`, e.message);
        });

        processadas.push({ telefone: conv.telefone, nome: conv.leads?.nome, ultima_msg_em: ultima.criado_em });

        // Throttle: aguardar 3s entre cada para não sobrecarregar
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        erros.push({ conversa: conv.id, erro: e.message });
      }
    }

    res.json({
      ok: true,
      total_processadas: processadas.length,
      processadas,
      erros: erros.length,
      desde: desdeData
    });
  } catch (e) {
    console.error('[RECUPERAR-VACUO] Erro geral:', e.message);
    res.status(500).json({ error: 'Erro ao recuperar leads no vacuo' });
  }
});

app.get('/api/metricas', async (req, res) => {
  try {
    res.json(await db.getMetricas());
  } catch (e) {
    console.error('[METRICAS] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar metricas' });
  }
});

// ===== ANALYTICS DE CONVERSÃO =====
app.get('/api/analytics', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;
    const analytics = await db.getAnalytics(dias);
    if (analytics) {
      res.json(analytics);
    } else {
      res.status(500).json({ error: 'Erro ao gerar analytics' });
    }
  } catch (e) {
    console.error('[ANALYTICS] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar analytics' });
  }
});

// ===== AGENTE ORGANIZADOR DE DOCUMENTOS =====

// Organizar documentos de um cliente (sob demanda)
// Analisar documento via Claude Vision (identifica tipo + extrai dados)
app.post('/api/documentos/analisar', requireApiKey, async (req, res) => {
  try {
    if (!documentos) return res.status(503).json({ error: 'Módulo de documentos não disponível' });

    const { mediaUrl, mediaType, clienteNome, clienteCpf } = req.body;
    if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl obrigatório' });

    const resultado = await documentos.analisarDocumento(mediaUrl, mediaType || '', clienteNome || '', clienteCpf || '');
    if (!resultado.ok) {
      return res.status(500).json({ ok: false, error: resultado.error || 'Erro ao analisar documento' });
    }
    res.json(resultado);
  } catch (e) {
    console.error('[DOCS-NPL] Erro no endpoint analisar:', e.message);
    res.status(500).json({ error: 'Erro ao analisar documento' });
  }
});

app.post('/api/documentos/organizar', requireApiKey, async (req, res) => {
  try {
    if (!documentos) return res.status(503).json({ error: 'Módulo de documentos não disponível' });

    const { phone, nome, tese } = req.body;
    if (!phone || !nome) return res.status(400).json({ error: 'phone e nome obrigatórios' });

    // Buscar tese do lead se não veio no body
    let teseInteresse = tese || null;
    if (!teseInteresse) {
      try {
        const lead = await db.getOrCreateLead(phone, nome);
        teseInteresse = lead?.tese_interesse || null;
      } catch (e) { console.log('[DOCS-NPL] Não encontrou tese do lead'); }
    }

    console.log(`[DOCS-NPL] Organização solicitada: ${nome} (${phone}) - Matéria: ${teseInteresse || 'não definida'}`);

    // Responder imediatamente e processar em background
    res.json({ ok: true, msg: `Organização iniciada para ${nome}. Você receberá o relatório no WhatsApp.` });

    // Processar em background
    (async () => {
      try {
        const resultado = await documentos.organizarDocumentos(phone, nome, teseInteresse);
        const relatorio = documentos.gerarRelatorioWhatsApp(resultado);

        // Enviar relatório para Dr. Osmar via WhatsApp
        await whatsapp.sendText(config.OSMAR_PHONE, relatorio);
        console.log(`[DOCS-NPL] Relatório enviado para ${config.OSMAR_PHONE}`);
      } catch (e) {
        console.error('[DOCS-NPL] Erro no processamento:', e.message);
        await whatsapp.sendText(config.OSMAR_PHONE, `Erro ao organizar documentos de ${nome}: ${e.message}`);
      }
    })();
  } catch (e) {
    console.error('[DOCS-NPL] Erro:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao organizar documentos' });
  }
});

// Auditoria rápida (sem upload, só verifica o que tem)
app.get('/api/documentos/auditoria/:phone', async (req, res) => {
  try {
    if (!documentos) return res.status(503).json({ error: 'Módulo de documentos não disponível' });

    const phone = req.params.phone;
    const midias = await documentos.buscarMidiasWhatsApp(phone);

    res.json({
      phone,
      totalMidias: midias.length,
      midias: midias.map(m => {
        const caption = m.caption || m.fileName || '';
        const tipo = documentos.identificarPorTexto ? documentos.identificarPorTexto(caption) : 'Outro';
        return {
          fileName: m.fileName,
          caption: m.caption,
          mimeType: m.mimeType,
          isImage: m.isImage,
          isDocument: m.isDocument,
          timestamp: m.timestamp,
          tipo
        };
      })
    });
  } catch (e) {
    console.error('[AUDITORIA] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar auditoria' });
  }
});

// Cobrar documentos faltantes do cliente
app.post('/api/documentos/cobrar', requireApiKey, async (req, res) => {
  try {
    if (!documentos) return res.status(503).json({ error: 'Módulo de documentos não disponível' });

    const { phone, nome, auditoria } = req.body;
    if (!phone || !nome || !auditoria) {
      return res.status(400).json({ error: 'phone, nome e auditoria obrigatórios' });
    }

    const msg = documentos.gerarCobrancaDocumentos(auditoria, nome);
    if (!msg) {
      return res.json({ ok: true, msg: 'Documentação completa, nada a cobrar.' });
    }

    await whatsapp.sendText(phone, msg);
    res.json({ ok: true, msg: 'Cobrança enviada ao cliente.' });
  } catch (e) {
    console.error('[DOCS-NPL] Erro ao cobrar:', e.message);
    res.status(500).json({ error: 'Erro ao cobrar documentos' });
  }
});

// ===== RELATÓRIO SEMANAL =====

async function enviarRelatorioSemanal() {
  try {
    const r = await db.getRelatorioSemanal();
    const hoje = new Date().toLocaleDateString('pt-BR');

    const msg = `Relatorio Semanal - NPLADVS (Trabalhista)
${hoje}

Novos leads: ${r.leadsNovos}
Convertidos: ${r.convertidos}
Agendamentos: ${r.agendamentos}
Leads ativos no funil: ${r.leadsAtivos}

Recebido na semana: R$ ${r.totalRecebido.toFixed(2)}
Cobrancas atrasadas: ${r.cobrancasAtrasadas} (R$ ${r.totalAtrasado.toFixed(2)})
Tarefas vencidas: ${r.tarefasVencidas}

Bom trabalho!`;

    await whatsapp.sendText(config.OSMAR_PHONE, msg);
    console.log(`[RELATORIO-NPL] Semanal enviado para ${config.OSMAR_PHONE}`);
    return msg;
  } catch (e) {
    console.error('[RELATORIO-NPL] Erro:', e.message);
    return null;
  }
}

// Segunda-feira as 8h30 (30min depois da Ana, para nao sobrepor)
setInterval(async () => {
  const agora = new Date();
  const belem = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia = belem.getUTCDay();
  const hora = belem.getUTCHours();
  const min = belem.getUTCMinutes();

  if (dia === 1 && hora === 8 && min >= 30 && min < 45) {
    const chave = `relatorio_npl_${belem.toISOString().slice(0, 10)}`;
    if (!global._relatorioNPLEnviado || global._relatorioNPLEnviado !== chave) {
      global._relatorioNPLEnviado = chave;
      await enviarRelatorioSemanal();
    }
  }
}, 15 * 60 * 1000);

app.post('/api/relatorio-semanal', requireApiKey, async (req, res) => {
  const msg = await enviarRelatorioSemanal();
  if (msg) {
    res.json({ ok: true, msg });
  } else {
    res.status(500).json({ error: 'Erro ao gerar relatorio' });
  }
});

app.get('/api/relatorio-semanal', async (req, res) => {
  try {
    const r = await db.getRelatorioSemanal();
    res.json(r);
  } catch (e) {
    console.error('[RELATORIO] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar relatorio' });
  }
});

// ===== ENVIAR ÁUDIO (gravado no CRM) =====
app.post('/api/enviar-audio', requireApiKey, async (req, res) => {
  try {
    const { phone, audioBase64, conversaId, usuario_nome } = req.body;
    if (!phone || !audioBase64) return res.status(400).json({ error: 'phone e audioBase64 obrigatorios' });

    const result = await whatsapp.sendAudio(phone, audioBase64);

    if (conversaId) {
      // Salvar com media_url para o player do CRM funcionar
      const base64Pure = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const mediaUrl = `data:audio/mpeg;base64,${base64Pure}`;
      await db.saveMessage(conversaId, 'assistant', '🎤 Áudio enviado', {
        manual: true,
        usuario_nome: usuario_nome || null,
        media_type: 'audio',
        media_url: mediaUrl
      });
    }

    res.json({ ok: true, result });
  } catch (e) {
    console.error('[ENVIAR-AUDIO] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar áudio' });
  }
});

// ===== ENVIAR ARQUIVO (imagem ou documento) =====
app.post('/api/enviar-arquivo', requireApiKey, async (req, res) => {
  try {
    const { phone, fileUrl, fileName, mediaType, conversaId, usuario_nome } = req.body;
    if (!phone || !fileUrl) return res.status(400).json({ error: 'phone e fileUrl obrigatorios' });

    // Validar URL para evitar SSRF
    try {
      const parsedUrl = new URL(fileUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: 'Protocolo de URL nao permitido' });
      }
      // Bloquear IPs internos/localhost
      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.') || hostname === '[::1]') {
        return res.status(400).json({ error: 'URL interna nao permitida' });
      }
    } catch {
      return res.status(400).json({ error: 'URL invalida' });
    }

    let result;
    const type = mediaType || 'document';

    if (type === 'image') {
      result = await whatsapp.sendImage(phone, fileUrl, fileName || '');
    } else {
      result = await whatsapp.sendDocument(phone, fileUrl, fileName || 'arquivo.pdf');
    }

    // Salvar na conversa
    if (conversaId) {
      const content = type === 'image' ? (fileName || '📷 Imagem enviada') : (fileName || '📄 Documento enviado');
      await db.saveMessage(conversaId, 'assistant', content, {
        manual: true,
        usuario_nome: usuario_nome || null,
        media_url: fileUrl,
        media_type: type
      });
    }

    res.json({ ok: true, result });
  } catch (e) {
    console.error('[ENVIAR-ARQUIVO] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao enviar arquivo' });
  }
});

// ===== CHAT IA (proxy para o CRM frontend) =====
app.post('/api/chat', requireApiKey, async (req, res) => {
  try {
    const { system, messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages obrigatorio (array)' });
    }
    if (!config.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada no servidor' });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: system || '',
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    });
    res.json({ ok: true, content: response.content[0].text });
  } catch (e) {
    console.error('[CHAT] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao processar chat' });
  }
});

// ===== INICIAR =====
app.listen(config.PORT, () => {
  console.log('');
  console.log('NPLADVS - Servidor (Laura)');
  console.log('Especializado em Direitos Trabalhistas');
  console.log(`Rodando na porta ${config.PORT}`);
  console.log('Servicos iniciados');
  console.log('');
});
