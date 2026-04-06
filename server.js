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

// ===== CONTROLE DE AGENDAMENTO ÚNICO POR CONVERSA =====
// Evita que a Laura agende 2 consultas pro mesmo lead na mesma conversa
const jaAgendou = new Map(); // phone -> { nome, data, colaboradora, timestamp }

function marcarAgendado(phone, nome, data, colaboradora) {
  jaAgendou.set(phone, { nome, data, colaboradora, timestamp: Date.now() });
}

function verificarJaAgendou(phone) {
  const agendamento = jaAgendou.get(phone);
  if (!agendamento) return null;
  // Expira depois de 24h (nova conversa pode agendar)
  if (Date.now() - agendamento.timestamp > 24 * 60 * 60 * 1000) {
    jaAgendou.delete(phone);
    return null;
  }
  return agendamento;
}

// Limpar agendamentos expirados
setInterval(() => {
  const now = Date.now();
  for (const [phone, ag] of jaAgendou) {
    if (now - ag.timestamp > 24 * 60 * 60 * 1000) jaAgendou.delete(phone);
  }
}, 60 * 60 * 1000);

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
async function processBufferedMessage(phone, text, senderName, respondComAudio = false) {
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

    const leadAtualizado = await db.getOrCreateLead(phone, finalName);
    const etapaDepois = fluxo.processarEtapa(conversa.id, combinedText, leadAtualizado);

    if (etapaAntes !== etapaDepois) {
      await db.updateConversa(conversa.id, { etapa_conversa: etapaDepois });
      await db.trackEvent(conversa.id, lead?.id, 'etapa_avancou', `${etapaAntes} -> ${etapaDepois}`);
    }

    // Detectar lead quente
    if (lead && isHotLead(combinedText)) {
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
      const cleanP = whatsapp.cleanPhone(phone);
      const pendingVerif = pendingClienteVerification.get(cleanP);

      if (pendingVerif) {
        // Já encontramos um match antes — verificar se o lead confirmou
        const lower = combinedText.toLowerCase().trim();
        const confirmou = /\b(sim|confirmo|isso|exato|sou eu|tenho sim|correto|é isso|isso mesmo|sou cliente|tenho processo)\b/.test(lower);
        const negou = /\b(não|nao|nunca|nenhum|engano|errado|outro|primeira vez)\b/.test(lower);

        if (confirmou) {
          console.log(`[CLIENTE-ANTIGO-NPL] ${cleanP} CONFIRMOU ser cliente existente`);
          contexto = { tipo: 'cliente_processo', processos: pendingVerif.processos };
          pendingClienteVerification.delete(cleanP);

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
          // Resposta ambígua — manter pendente mas não bloquear fluxo
          pendingVerif.tentativas = (pendingVerif.tentativas || 0) + 1;
          if (pendingVerif.tentativas >= 3) {
            // Após 3 tentativas, desistir da verificação
            console.log(`[CLIENTE-ANTIGO-NPL] ${cleanP} não confirmou após 3 tentativas, seguindo como lead`);
            pendingClienteVerification.delete(cleanP);
          } else {
            // Manter o contexto pendente para a Laura perguntar de novo
            contexto = { tipo: 'cliente_processo_pendente', processos: pendingVerif.processos };
          }
        }
      } else {
        // Primeira busca — só buscar se o nome tem pelo menos 2 palavras significativas
        // A função findClienteProcessoByName já filtra nomes comuns internamente
        const nomeLead = leadAtualizado?.nome;
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
    }

    // Gerar e enviar resposta
    const history = await db.getHistory(conversa.id);
    const rawReply = await ia.generateResponse(history, combinedText, conversa.id, leadAtualizado, contexto, phone);
    const reply = ia.trimResponse(rawReply);
    await db.saveMessage(conversa.id, 'assistant', reply);

    // Se Laura confirmou agendamento, criar evento no Google Calendar
    const replyLower = reply.toLowerCase();
    const agendouConsulta = replyLower.includes('agendado') || replyLower.includes('agendada') ||
      replyLower.includes('consulta marcada') || replyLower.includes('confirmado') ||
      replyLower.includes('reservado') || replyLower.includes('horário confirmado') ||
      (replyLower.includes('consulta') && (replyLower.includes('dia ') || replyLower.includes('às ')));
    if (calendar && agendouConsulta) {
      // Verificar se já agendou nesta conversa (evitar double booking)
      const agendamentoExistente = verificarJaAgendou(phone);
      if (agendamentoExistente) {
        console.log(`[CALENDAR-NPL] BLOQUEADO: ${phone} ja agendou (${agendamentoExistente.data} com ${agendamentoExistente.colaboradora})`);
      } else {
      try {
        const slot = await calendar.encontrarSlot(combinedText, phone);
        if (slot) {
          const nome = leadAtualizado?.nome || 'Lead';
          const email = leadAtualizado?.email || null;
          const resultado = await calendar.criarConsulta(nome, phone, email, slot.inicio, 'online');
          if (resultado) {
            console.log(`[CALENDAR-NPL] Consulta CRIADA: ${nome} em ${resultado.inicio} com ${resultado.colaboradora}`);
            marcarAgendado(phone, nome, resultado.inicio, resultado.colaboradora);
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

              await whatsapp.sendText(phone, msgConfirmacao);
              await db.saveMessage(conversa.id, 'assistant', msgConfirmacao);
              console.log(`[CONFIRM-NPL] Confirmação enviada para ${nome}`);

              // Enviar áudio de confirmação
              if (audio) {
                const tituloAudio = resultado.colaboradora === 'Luiza' ? 'a colaboradora' : 'a advogada';
                const audioConfirm = `${nome}, aqui é a Laura do escritório NPLADVS. ` +
                  `Sua consulta trabalhista foi confirmada para ${resultado.inicio} ` +
                  `com ${tituloAudio} ${resultado.colaboradora}. A consulta será online. ` +
                  `Qualquer dúvida, é só me chamar aqui. Até lá!`;
                const audioBase64 = await audio.gerarAudio(audioConfirm);
                if (audioBase64) {
                  await whatsapp.sendAudio(phone, audioBase64);
                  console.log(`[CONFIRM-NPL] Áudio de confirmação enviado para ${nome}`);
                }
              }
            } catch (e) {
              console.log('[CONFIRM-NPL] Erro ao enviar confirmação:', e.message);
            }

            // Analisar conversa para aprendizado (async, não bloqueia)
            if (aprendizado) {
              const histCompleto = await db.getHistory(conversa.id);
              aprendizado.analisarConversa(histCompleto, leadAtualizado, 'agendou').catch(e =>
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

    // Se veio de audio, responder com audio + texto
    if (respondComAudio && audio) {
      const audioBase64 = await audio.gerarAudio(reply);
      if (audioBase64) {
        await whatsapp.sendAudio(phone, audioBase64);
        console.log(`[AUDIO-NPL] Resposta em audio enviada para ${phone}`);
      } else {
        await whatsapp.sendText(phone, reply);
      }
    } else {
      await whatsapp.sendText(phone, reply);
    }

    // Atualizar etapa do funil
    if (lead && lead.etapa_funil === 'novo') {
      await db.updateLead(lead.id, { etapa_funil: 'contato' });
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

      if (lastMsg.role !== 'assistant') continue;

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
          console.log(`[FOLLOWUP-NPL] IA falhou, usando fixo: ${e.message}`);
        }
        return fixedMsg;
      }

      async function sendFollowUp(msg, asAudio) {
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
      if (followUpCount === 2 && hoursAgo >= 2 && hoursAgo < 20) {
        const fixo = `${nome}, aqui e a Laura do escritorio NPLADVS. Passando para saber se posso te ajudar com a sua situacao trabalhista. Temos horarios disponiveis essa semana e a consulta inicial e sem compromisso.`;
        const msg = await getSmartMsg(fixo, 2);
        console.log(`[FOLLOWUP-NPL-4h] ${conv.telefone} (${nome})`);
        await sendFollowUp(msg, true);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_4h_audio', nome);
      }

      // 3o FOLLOW-UP: 24h
      if (followUpCount === 3 && hoursAgo >= 20 && hoursAgo < 48) {
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
        await sendFollowUp(msg, true);
        await db.trackEvent(conv.id, conv.leads?.id, 'followup_72h_audio', nome);

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

          // Enviar como áudio
          if (audio) {
            const audioBase64 = await audio.gerarAudio(msgTexto);
            if (audioBase64) {
              await whatsapp.sendAudio(consulta.telefone, audioBase64);
              console.log(`[LEMBRETE-NPL] Áudio matinal enviado para ${consulta.nome} (${consulta.telefone})`);
            } else {
              await whatsapp.sendText(consulta.telefone, msgTexto);
            }
          } else {
            await whatsapp.sendText(consulta.telefone, msgTexto);
          }
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

// ===== WEBHOOK Z-API =====
app.post('/webhook/zapi', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (!config.ZAPI_WEBHOOK_TOKEN) {
      console.error('[WEBHOOK-NPL] ZAPI_WEBHOOK_TOKEN nao configurado - rejeitando requisicao');
      return res.status(500).json({ error: 'Webhook token not configured' });
    }
    const received = req.headers['x-api-key'] || req.headers['authorization'];
    if (received !== config.ZAPI_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body;
    const messageId = body.messageId || body.ids?.[0]?.serialized || body.id?.id || '';
    const isMessage = body.type === 'ReceivedCallback' || body.text?.message;
    const isFromMe = body.fromMe || body.isFromMe;

    if (isFromMe) {
      const phone = body.phone || body.to?.replace('@c.us', '') || '';
      if (phone && whatsapp.wasBotRecentSend(phone)) {
        return res.json({ status: 'bot_sent' });
      }
      if (phone) {
        pauseAI(phone, 30);
        console.log(`[MANUAL-NPL] Atendente respondeu para ${phone} - IA pausada 30min`);
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
    const audioUrl = body.audio?.audioUrl || body.audioMessage?.url || body.audio?.url || null;
    const isAudio = body.isAudio === true || !!body.audioMessage || (!!audioUrl && audioUrl.length > 10);

    // Detectar mídia (imagem, documento, vídeo)
    const imageData = body.image || body.imageMessage || null;
    const documentData = body.document || body.documentMessage || null;
    const videoData = body.video || body.videoMessage || null;
    const hasMedia = imageData || documentData || videoData;

    // Se for mídia (imagem, documento, vídeo), salvar na conversa
    if (hasMedia && phone) {
      let mediaUrl = null;
      let mediaType = null;
      let caption = '';

      if (imageData) {
        mediaUrl = imageData.imageUrl || imageData.url || imageData.mediaUrl || null;
        mediaType = 'image';
        caption = imageData.caption || '';
      } else if (documentData) {
        mediaUrl = documentData.documentUrl || documentData.url || documentData.mediaUrl || null;
        mediaType = 'document';
        caption = documentData.fileName || documentData.caption || 'Documento';
      } else if (videoData) {
        mediaUrl = videoData.videoUrl || videoData.url || videoData.mediaUrl || null;
        mediaType = 'video';
        caption = videoData.caption || '';
      }

      console.log(`[MEDIA-NPL] ${mediaType} recebido de ${phone}: ${mediaUrl?.slice(0, 60)}`);

      try {
        const conversa = await db.getOrCreateConversa(phone);
        const content = caption || (mediaType === 'image' ? '📷 Imagem' : mediaType === 'document' ? '📄 Documento' : '🎥 Vídeo');
        await db.saveMessage(conversa.id, 'user', content, { media_url: mediaUrl, media_type: mediaType });
      } catch (e) {
        console.error('[MEDIA-NPL] Erro ao salvar mídia:', e.message);
      }

      return res.json({ status: 'media_saved' });
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
          if (url) {
            await db.saveMessage(conversa.id, 'user', '🎤 Áudio', { media_url: url, media_type: 'audio' });
          }

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

          const transcricao = await audio.transcreverAudio(url);
          if (!transcricao) {
            console.error('[AUDIO-NPL] Falha na transcricao');
            await whatsapp.sendText(phone, 'Desculpe, nao consegui ouvir seu audio. Pode digitar ou enviar novamente?');
            return;
          }

          // Atualizar a mensagem do áudio com a transcrição
          // (salvar transcrição como conteúdo para o histórico da IA)
          await processBufferedMessage(phone, transcricao, senderName, true);
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

    processBufferedMessage(phone, text, senderName).catch(err => {
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

app.get('/api/metricas', async (req, res) => {
  try {
    res.json(await db.getMetricas());
  } catch (e) {
    console.error('[METRICAS] Erro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar metricas' });
  }
});

// ===== AGENTE ORGANIZADOR DE DOCUMENTOS =====

// Organizar documentos de um cliente (sob demanda)
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

    // Identificar tipos rapidamente (por caption/nome, sem IA vision para ser rápido)
    const tipos = [];
    for (const m of midias) {
      const caption = m.caption || m.fileName || '';
      if (caption) {
        const tipo = documentos.identificarDocumento ? 'Outro' : 'Outro';
        tipos.push(caption);
      }
    }

    res.json({
      phone,
      totalMidias: midias.length,
      midias: midias.map(m => ({
        fileName: m.fileName,
        caption: m.caption,
        mimeType: m.mimeType,
        isImage: m.isImage,
        isDocument: m.isDocument,
        timestamp: m.timestamp
      }))
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
    res.status(500).json({ error: e.message });
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

    // Extrair base64 puro (remover prefixo data:audio/...)
    const base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;

    const result = await whatsapp.sendAudio(phone, base64Data);

    if (conversaId) {
      await db.saveMessage(conversaId, 'assistant', '🎤 Áudio enviado', {
        manual: true,
        usuario_nome: usuario_nome || null,
        media_type: 'audio'
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
