// ===== OPERAÇÕES SUPABASE - NPL =====
// Mesmo banco da Ana, dados separados por campo 'escritorio' = 'npl'

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
const ESC = config.ESCRITORIO; // 'npl'

// Sanitiza string antes de interpolar em filtros PostgREST (.or, .ilike)
function sanitizePostgrest(str) {
  if (!str) return '';
  return str.replace(/[,().%_\\*]/g, '').trim().slice(0, 100);
}
const INST = config.ZAPI_INSTANCE; // ID da instância Z-API (separa dados Laura/Ana)

// Fallback: formata telefone BR como (DDD) XXXXX-XXXX
function formatarTelefoneBR(tel) {
  if (!tel) return 'Contato';
  const limpo = tel.replace(/\D/g, '');
  const sem55 = limpo.startsWith('55') ? limpo.slice(2) : limpo;
  if (sem55.length === 11) return `(${sem55.slice(0,2)}) ${sem55.slice(2,7)}-${sem55.slice(7)}`;
  if (sem55.length === 10) return `(${sem55.slice(0,2)}) ${sem55.slice(2,6)}-${sem55.slice(6)}`;
  return `+${limpo}`;
}

// ===== CONVERSAS =====

async function getOrCreateConversa(phone) {
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);

  let { data: conv } = await supabase
    .from('conversas')
    .select('*')
    .eq('telefone', tel)
    .eq('status', 'ativa')
    .eq('escritorio', ESC)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conv) return conv;

  const { data: newConv } = await supabase
    .from('conversas')
    .insert({ telefone: tel, titulo: formatarTelefoneBR(tel), escritorio: ESC, instancia: INST })
    .select()
    .single();

  return newConv;
}

async function updateConversa(conversaId, updates) {
  await supabase.from('conversas').update(updates).eq('id', conversaId);
}

// ===== MENSAGENS =====

async function saveMessage(conversaId, role, content, extra = {}) {
  await supabase
    .from('mensagens')
    .insert({ conversa_id: conversaId, role, content, ...extra });
}

async function getHistory(conversaId, limit = 500) {
  const { data: msgs } = await supabase
    .from('mensagens')
    .select('role, content, manual, usuario_nome, criado_em')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true })
    .limit(limit);

  return msgs || [];
}

async function getRecentMessages(conversaIds, perConversation = 3) {
  const { data } = await supabase
    .from('mensagens')
    .select('conversa_id, role, criado_em')
    .in('conversa_id', conversaIds)
    .order('criado_em', { ascending: false })
    .limit(Math.max(conversaIds.length * perConversation, 500));

  return data || [];
}

// ===== LEADS =====

async function getOrCreateLead(phone, nome) {
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);

  // Buscar lead existente desta instância
  let { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('telefone', tel)
    .eq('escritorio', ESC)
    .limit(1)
    .maybeSingle();

  if (lead) {
    // Se lead existe mas nome é fallback (WhatsApp XXXX ou telefone), atualizar com nome real recebido agora
    if (nome && nome.trim()) {
      const nomeAtual = lead.nome || '';
      const nomeEhFallback = nomeAtual.startsWith('WhatsApp ') || /^\+?\(?\d{1,3}\)?/.test(nomeAtual) || !nomeAtual;
      if (nomeEhFallback && nome.trim() !== nomeAtual) {
        try {
          await supabase.from('leads').update({ nome: nome.trim() }).eq('id', lead.id);
          lead.nome = nome.trim();
        } catch (e) {
          console.error(`[DB-NPL] Erro ao atualizar nome do lead ${lead.id}:`, e.message);
        }
      }
    }
    return lead;
  }

  // Atribuir variante A/B ao criar lead
  const tempId = Date.now().toString();
  const variante = atribuirVarianteAB(tempId);

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      nome: nome && nome.trim() ? nome.trim() : formatarTelefoneBR(tel),
      telefone: tel,
      origem: 'WhatsApp NPL',
      etapa_funil: 'novo',
      escritorio: ESC,
      instancia: INST,
      tese_interesse: 'Trabalhista',
      ab_variante: variante,
      score: 0,
      data_primeiro_contato: new Date().toISOString()
    })
    .select()
    .single();

  console.log('[LEAD-NPL] Novo lead criado:', newLead?.nome);
  return newLead;
}

async function updateLead(leadId, updates) {
  updates.atualizado_em = new Date().toISOString();
  await supabase.from('leads').update(updates).eq('id', leadId);
}

async function markLeadHot(leadId) {
  // Lead quente: apenas rastrea o evento via trackEvent. A etapa só muda quando
  // agenda consulta (→ agendamento), envia documentos (→ documentos) ou fecha (→ cliente).
}

// Extrair dados do lead automaticamente das mensagens
async function extractAndUpdateLead(leadId, text) {
  if (!leadId || !text) return;
  const updates = {};

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) updates.email = emailMatch[0];

  // Nome — extrai da mensagem e decide se atualiza
  const { data: leadAtualNome } = await supabase.from('leads').select('nome, atualizado_em').eq('id', leadId).maybeSingle();
  const nomeAtual = leadAtualNome?.nome || '';
  const nomeEhFallback = !nomeAtual || nomeAtual.startsWith('WhatsApp') || /^\+?\(?\d/.test(nomeAtual) || /^\(\d{2}\)\s?\d/.test(nomeAtual);

  const nomePatterns = [
    /(?:me chamo|meu nome [eé]|pode me chamar de|meu nome)\s+([A-ZÀ-Úa-zà-ú][a-zà-ú]+(?: (?:de |da |do |dos |das )?[A-ZÀ-Úa-zà-ú][a-zà-ú]+){0,4})/i,
    // Captura nome em CAIXA ALTA depois de "me chamo / meu nome eh" ("Meu nome é SIMONE",
    // "Me chamo MARIA SILVA"). Whisper as vezes transcreve audio assim. Normalizado em
    // Title Case mais abaixo.
    /(?:me chamo|meu nome [eé]|pode me chamar de|meu nome)\s+([A-ZÀ-Ú]{2,15}(?: [A-ZÀ-Ú]{2,15}){0,4})\b/i,
    // Sem flag /i: o "sou" inicial casa minusculo OU maiusculo via grupo (?:sou|Sou|SOU),
    // mas o NOME capturado precisa comecar com maiuscula real ([A-ZÀ-Ú]) — evita capturar
    // frases tipo "sou do Rio de janeiro" como nome.
    /\b(?:sou|Sou|SOU)\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+(?: (?:de |da |do |dos |das )?[A-ZÀ-Úa-zà-ú][a-zà-ú]+){0,4})/,
    // Mesma ideia pra "sou SIMONE" (tudo maiusculo)
    /\b(?:sou|Sou|SOU)\s+(?:o\s+|a\s+)?([A-ZÀ-Ú]{2,15}(?: [A-ZÀ-Ú]{2,15}){0,4})\b/,
    /(?:^|\n)\s*([A-ZÀ-Ú][a-zà-ú]+(?: (?:de |da |do |dos |das )?[A-ZÀ-Ú][a-zà-ú]+){1,4})\s*(?:\n|$)/m,
    /(?:^|\n)\s*([A-ZÀ-Ú][a-zà-ú]{2,15})\s*(?:\n|$)/m
  ];
  const palavrasComuns = /^(sim|nao|não|oi|ola|olá|bom|boa|ok|obrigad|tudo|bem|dia|noite|tarde|quero|tenho|preciso|pode|certo|isso|aqui|agora|trabalhei|trabalho|meu|minha|fui|era|estou|estive|muito|pouco|talvez|quase|sempre|nunca|prezada|prezado|doutor|doutora|senhor|senhora|bel|salve|oie|pessoal|galera|gente|atenciosamente|cordialmente|obrigada|desculpa|desculpe|entendi|entendo|claro|perfeito|beleza|blz|show|do|da|de|dos|das|no|na|nos|nas|em|por|pra|para|com|sem|ao|aos|um|uma|uns|umas|eu|você|voce|ele|ela|nós|nos|vocês|voces|eles|elas|esse|essa|aquele|aquela|este|esta|que|quem|onde|quando|porque|por que|pq|tava|estava|estavam|fomos|foram|tive|teve|tivemos)$/i;
  const verbosForma = /^(recebi|mandei|trouxe|vi|vou|vai|vem|faço|faz|fez|saiu|sai|entrei|peguei|teve|temos|disse|vim|viajei|cheguei|liguei|ganho|ganhei|perdi|sou|é|está|estou|estive|estava|estavam|tava|tinha|tive|teve|fui|foi|fomos|foram|seria|seriam|posso|pode|podemos|podem)$/i;

  // Se o nome veio TODO em CAIXA ALTA (Whisper as vezes transcreve assim),
  // normaliza pra Title Case ("SIMONE SOUZA" -> "Simone Souza").
  const titleCase = (s) => s.split(/\s+/).map(p => {
    if (/^(de|da|do|dos|das)$/i.test(p)) return p.toLowerCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ');

  for (const pattern of nomePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    let nomeCapturado = match[1].trim();
    // Se veio tudo maiusculo, normaliza
    if (nomeCapturado === nomeCapturado.toUpperCase() && /[A-ZÀ-Ú]/.test(nomeCapturado)) {
      nomeCapturado = titleCase(nomeCapturado);
    }
    const primeiraPalavra = nomeCapturado.split(' ')[0];
    if (nomeCapturado.length < 3 || nomeCapturado.length >= 50) continue;
    if (palavrasComuns.test(primeiraPalavra) || verbosForma.test(primeiraPalavra)) continue;

    // Decide se atualiza:
    // - nomeAtual e fallback (telefone, "WhatsApp"): aceita qualquer nome valido
    // - ja tem nome real: so faz upgrade se o novo COMECA com a mesma primeira palavra
    //   (ex: "Viviane" -> "Viviane Silva" OK; "Viviane" -> "do Rio de janeiro" REJEITADO)
    const nomeAtualPrimeira = (nomeAtual.split(' ')[0] || '').toLowerCase();
    const nomeNovoPrimeira = primeiraPalavra.toLowerCase();
    const compartilhaPrimeiraPalavra = nomeAtualPrimeira && nomeNovoPrimeira === nomeAtualPrimeira;
    const nomeTemMaisPalavras = nomeCapturado.split(' ').length > nomeAtual.split(' ').length;
    const nomeEhUpgrade = compartilhaPrimeiraPalavra && nomeTemMaisPalavras && nomeCapturado.length > nomeAtual.length;
    if (nomeEhFallback || nomeEhUpgrade) {
      updates.nome = nomeCapturado;
    }
    break;
  }

  // Tese — detectar subtipo trabalhista e ADICIONAR às notas (sem sobrescrever)
  const lower = text.toLowerCase();
  let tipoDetectado = null;
  if (lower.includes('demiss') || lower.includes('mandaram embora') || lower.includes('demitid')) {
    tipoDetectado = 'Rescisão/Demissão';
  } else if (lower.includes('horas extra') || lower.includes('hora extra')) {
    tipoDetectado = 'Horas extras';
  } else if (lower.includes('acidente') || lower.includes('doença') || lower.includes('doenca')) {
    tipoDetectado = 'Acidente/Doença do trabalho';
  } else if (lower.includes('assédio') || lower.includes('assedio')) {
    tipoDetectado = 'Assédio no trabalho';
  } else if (lower.includes('salário') || lower.includes('salario') || lower.includes('não pagou') || lower.includes('nao pagou')) {
    tipoDetectado = 'Salário atrasado/não pago';
  } else if (lower.includes('carteira') || lower.includes('registro')) {
    tipoDetectado = 'Falta de registro/carteira';
  } else if (lower.includes('fgts') || lower.includes('multa')) {
    tipoDetectado = 'FGTS/Multa rescisória';
  } else if (lower.includes('rural') || lower.includes('fazenda') || lower.includes('sitio') || lower.includes('sítio') || lower.includes('roça')) {
    tipoDetectado = 'Trabalhador rural';
  }
  if (tipoDetectado) {
    // Buscar notas atuais para não sobrescrever
    const { data: leadAtual } = await supabase.from('leads').select('notas').eq('id', leadId).maybeSingle();
    const notasAtuais = leadAtual?.notas || '';
    if (!notasAtuais.includes(tipoDetectado)) {
      updates.notas = notasAtuais ? `${notasAtuais}, ${tipoDetectado}` : `Tipo: ${tipoDetectado}`;
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateLead(leadId, updates);
      console.log(`[LEAD-NPL] Dados extraídos para ${leadId}:`, Object.keys(updates).join(', '));
    } catch (e) {
      console.error('[LEAD-NPL] Erro ao atualizar dados:', e.message);
    }
  }
}

// ===== MÉTRICAS =====

async function trackEvent(conversaId, leadId, evento, detalhes) {
  try {
    await supabase.from('metricas').insert({
      conversa_id: conversaId,
      lead_id: leadId,
      evento,
      detalhes,
      escritorio: ESC,
      criado_em: new Date().toISOString()
    });
  } catch (e) {
    console.log(`[METRIC-NPL] ${evento}: ${detalhes || ''}`);
  }
}

// ===== FOLLOW-UPS =====

async function getEligibleConversas() {
  const { data } = await supabase
    .from('conversas')
    .select('id, telefone, lead_id, leads(id, nome, tese_interesse, etapa_funil, telefone, followup_tipo)')
    .eq('status', 'ativa')
    .eq('escritorio', ESC)
        .not('lead_id', 'is', null);

  if (!data) return [];

  return data.filter(c =>
    c.leads &&
    c.leads.etapa_funil !== 'cliente' &&
    c.leads.etapa_funil !== 'perdido' &&
    c.leads.etapa_funil !== 'agendamento' &&
    c.leads.etapa_funil !== 'documentos'
  );
}

// ===== QUERIES DO CRM =====

async function listLeads(filtros = {}) {
  let query = supabase
    .from('leads')
    .select('id, nome, telefone, email, etapa_funil, tese_interesse, notas, origem, score, score_detalhes, ab_variante, instancia, criado_em, atualizado_em, data_primeiro_contato')
    .eq('escritorio', ESC)
    .order('atualizado_em', { ascending: false });

  if (filtros.etapa) query = query.eq('etapa_funil', filtros.etapa);
  if (filtros.limit) query = query.limit(filtros.limit);
  else query = query.limit(200);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getLeadById(leadId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*, conversas(id, status, criado_em)')
    .eq('id', leadId)
    .eq('escritorio', ESC)
    .single();
  if (error) throw error;
  return data;
}

// Lookup read-only por telefone (não cria lead). Usado por jobs agendados.
async function getLeadByPhone(phone) {
  if (!phone) return null;
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);
  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('telefone', tel)
    .eq('escritorio', ESC)
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function listConversas(limit = 50) {
  const { data } = await supabase
    .from('conversas')
    .select('*, leads(nome, tese_interesse, etapa_funil)')
    .eq('escritorio', ESC)
        .order('criado_em', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getConversaMensagens(conversaId) {
  const { data } = await supabase
    .from('mensagens')
    .select('*')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true });
  return data || [];
}

async function getMetricas() {
  const { data: leads } = await supabase.from('leads').select('etapa_funil, criado_em').eq('escritorio', ESC);
  const etapas = { novo: 0, contato: 0, agendamento: 0, documentos: 0, cliente: 0, perdido: 0 };
  (leads || []).forEach(l => { if (etapas[l.etapa_funil] !== undefined) etapas[l.etapa_funil]++; });

  const { data: conversas } = await supabase.from('conversas').select('id, criado_em').eq('status', 'ativa').eq('escritorio', ESC);

  let eventos = [];
  try {
    const { data } = await supabase.from('metricas').select('evento, criado_em').eq('escritorio', ESC).order('criado_em', { ascending: false }).limit(100);
    eventos = data || [];
  } catch {}

  return {
    leads_por_etapa: etapas,
    total_leads: (leads || []).length,
    conversas_ativas: (conversas || []).length,
    followups_24h: eventos.filter(e => e.evento === 'followup_24h').length,
    followups_72h: eventos.filter(e => e.evento === 'followup_72h').length,
    leads_quentes: eventos.filter(e => e.evento === 'lead_quente').length,
    taxa_conversao: (leads || []).length > 0
      ? ((etapas.cliente / (leads || []).length) * 100).toFixed(1) + '%'
      : '0%'
  };
}

// ===== TAREFAS =====

async function createTarefa(tarefa) {
  try {
    const { data, error } = await supabase
      .from('tarefas')
      .insert(tarefa)
      .select()
      .single();

    if (error) {
      console.error('[TAREFA-NPL] Erro ao criar:', error.message);
      return null;
    }
    console.log(`[TAREFA-NPL] Criada: ${tarefa.descricao}`);
    return data;
  } catch (e) {
    console.error('[TAREFA-NPL] Erro:', e.message);
    return null;
  }
}

// Conta processos similares (mesma matéria) para dar contexto ao lead sem expor dados pessoais.
// Usa npl_clientes_processos que tem {materia, status_fase}.
async function contarProcessosSimilares(materia) {
  if (!materia || materia.length < 3) return null;
  try {
    const m = materia.toLowerCase();
    const { data } = await supabase
      .from('npl_clientes_processos')
      .select('status_fase')
      .ilike('materia', `%${m}%`)
      .limit(500);
    if (!data || data.length === 0) return { total: 0, encerrados: 0, em_andamento: 0 };
    const encerrados = data.filter(p => /encerrad|arquivad|transitad|finaliz/i.test(p.status_fase || '')).length;
    return {
      total: data.length,
      encerrados,
      em_andamento: data.length - encerrados
    };
  } catch (e) {
    console.log('[PROCESSOS-SIMILARES] Erro:', e.message);
    return null;
  }
}

// ===== CLIENTES ANTIGOS (busca por nome na planilha importada) =====

async function findClienteProcessoByName(nome) {
  if (!nome || nome.length < 3) return null;

  // Normalizar: minúsculo, sem acentos, sem espaços extras
  const normalizado = nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  // Exigir pelo menos 2 palavras significativas (nome + sobrenome)
  const palavras = normalizado.split(' ').filter(p => p.length > 2);
  if (palavras.length < 2) return null;

  // Busca exata pelo nome normalizado
  const { data: exato } = await supabase
    .from('npl_clientes_processos')
    .select('*')
    .eq('nome_normalizado', normalizado);

  if (exato && exato.length > 0) return exato;

  // Nomes muito comuns — busca parcial não é confiável com só 2 palavras
  const NOMES_COMUNS = [
    'maria', 'jose', 'ana', 'joao', 'francisco', 'antonio', 'carlos', 'paulo',
    'pedro', 'lucas', 'marcos', 'luiz', 'rafael', 'daniel', 'marcelo', 'bruno',
    'felipe', 'rodrigo', 'fabio', 'andre', 'fernando', 'jorge', 'manoel', 'raimundo'
  ];
  const SOBRENOMES_COMUNS = [
    'silva', 'santos', 'oliveira', 'souza', 'lima', 'pereira', 'ferreira',
    'costa', 'rodrigues', 'almeida', 'nascimento', 'araujo', 'melo', 'barbosa',
    'ribeiro', 'martins', 'carvalho', 'gomes', 'rocha', 'dias', 'monteiro',
    'mendes', 'barros', 'freitas', 'moreira', 'cardoso', 'batista', 'campos'
  ];

  const primeiro = palavras[0];
  const ultimo = palavras[palavras.length - 1];

  // Se tem só 2 palavras e AMBAS são comuns, a busca parcial é muito arriscada
  if (palavras.length <= 2) {
    const primeiroComum = NOMES_COMUNS.includes(primeiro);
    const ultimoComum = SOBRENOMES_COMUNS.includes(ultimo);
    if (primeiroComum && ultimoComum) {
      console.log(`[DB-NPL] Nome muito comum "${normalizado}", pulando busca parcial`);
      return null;
    }
  }

  // Busca parcial: usar a palavra MAIS RARA (não comum) para filtrar no banco
  // Depois cruzar com todas as palavras para pontuar
  const palavrasRaras = palavras.filter(p => !NOMES_COMUNS.includes(p) && !SOBRENOMES_COMUNS.includes(p));
  const palavraBusca = palavrasRaras.length > 0 ? palavrasRaras[0] : primeiro;

  const { data: parcial } = await supabase
    .from('npl_clientes_processos')
    .select('*')
    .ilike('nome_normalizado', `%${sanitizePostgrest(palavraBusca)}%`);

  if (!parcial || parcial.length === 0) {
    // Fallback: buscar por primeiro nome se a rara não achou nada
    if (palavrasRaras.length > 0) {
      const { data: fallback } = await supabase
        .from('npl_clientes_processos')
        .select('*')
        .ilike('nome_normalizado', `%${sanitizePostgrest(primeiro)}%`);
      if (fallback && fallback.length === 1) return fallback;
    }
    return null;
  }

  // Só 1 resultado — confiar
  if (parcial.length === 1) return parcial;

  // Múltiplos resultados — pontuar por quantidade de palavras em comum
  if (parcial.length > 1 && parcial.length <= 10) {
    const pontuados = parcial.map(p => {
      const nomeBanco = (p.nome_normalizado || '').split(' ').filter(w => w.length > 2);
      const palavrasMatch = palavras.filter(pl => nomeBanco.includes(pl));
      return { ...p, score: palavrasMatch.length / Math.max(palavras.length, nomeBanco.length) };
    }).filter(p => p.score >= 0.5) // mínimo 50% de match
      .sort((a, b) => b.score - a.score);

    // Se o melhor match tem score muito acima do segundo, confiar
    if (pontuados.length === 1) return [pontuados[0]];
    if (pontuados.length >= 2 && pontuados[0].score > pontuados[1].score + 0.2) {
      return [pontuados[0]];
    }
    // Se top matches têm score alto (>70%), retornar todos pra Laura perguntar
    const bonsMatches = pontuados.filter(p => p.score >= 0.7);
    if (bonsMatches.length > 0 && bonsMatches.length <= 3) return bonsMatches;
  }

  console.log(`[DB-NPL] ${parcial.length} resultados para "${normalizado}", ambiguidade alta`);
  return null;
}

// ===== CLIENTES (busca por telefone) =====

async function findClienteByPhone(phone) {
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefone', tel)
    .limit(1)
    .single();
  return data;
}

async function findCasoByCliente(clienteId) {
  const { data } = await supabase
    .from('casos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ===== CONTEXTO COMPLETO DO TELEFONE =====

async function getContextoCompleto(phone) {
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);
  if (!tel) return { tipo: 'lead', cliente: null, casos: [], tarefas: [], financeiro: [] };

  // Buscar cliente por múltiplos formatos de telefone pra cobrir inconsistências
  // O CRM pode salvar como "+55 91 99999-9999", "91999999999", "5591999999999"
  const telSem55 = tel.startsWith('55') ? tel.slice(2) : tel;
  const { data: clientes } = await supabase
    .from('clientes')
    .select('*')
    .or(`telefone.eq.${tel},telefone.eq.${telSem55},telefone.eq.+${tel}`)
    .limit(1);

  const cliente = clientes && clientes.length > 0 ? clientes[0] : null;

  if (!cliente) return { tipo: 'lead', cliente: null, casos: [], tarefas: [], financeiro: [] };

  const { data: casos } = await supabase
    .from('casos')
    .select('*')
    .eq('cliente_id', cliente.id)
    .order('criado_em', { ascending: false });

  const casoIds = (casos || []).map(c => c.id);
  let tarefas = [];
  if (casoIds.length > 0) {
    const { data: t } = await supabase
      .from('tarefas')
      .select('*')
      .in('caso_id', casoIds)
      .eq('status', 'pendente')
      .order('data_limite', { ascending: true })
      .limit(5);
    tarefas = t || [];
  }

  const { data: financeiro } = await supabase
    .from('financeiro')
    .select('*')
    .eq('cliente_id', cliente.id)
    .in('status', ['pendente', 'atrasado'])
    .order('data_vencimento', { ascending: true })
    .limit(5);

  return {
    tipo: 'cliente',
    cliente,
    casos: casos || [],
    tarefas,
    financeiro: financeiro || []
  };
}

// ===== RELATÓRIO SEMANAL =====

async function getRelatorioSemanal() {
  const agora = new Date();
  const semanaAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const semanaAtrasISO = semanaAtras.toISOString();

  const { data: leadsNovos } = await supabase
    .from('leads')
    .select('id, nome, tese_interesse, etapa_funil')
    .eq('escritorio', ESC)
        .gte('criado_em', semanaAtrasISO);

  const convertidos = (leadsNovos || []).filter(l => l.etapa_funil === 'cliente');

  const { data: cobrancas } = await supabase
    .from('financeiro')
    .select('id, valor, data_vencimento, cliente_id')
    .eq('status', 'atrasado');

  const totalAtrasado = (cobrancas || []).reduce((s, f) => s + (f.valor || 0), 0);

  const { data: tarefasVencidas } = await supabase
    .from('tarefas')
    .select('id, descricao, data_limite')
    .eq('status', 'pendente')
    .lt('data_limite', agora.toISOString().slice(0, 10));

  const { data: agendamentos } = await supabase
    .from('tarefas')
    .select('id, descricao')
    .gte('criado_em', semanaAtrasISO)
    .ilike('descricao', '%consulta%');

  const { data: leadsAtivos } = await supabase
    .from('leads')
    .select('id')
    .eq('escritorio', ESC)
        .not('etapa_funil', 'in', '("cliente","perdido","agendamento","documentos")');

  const { data: recebidos } = await supabase
    .from('financeiro')
    .select('id, valor')
    .eq('status', 'pago')
    .gte('data_pagamento', semanaAtrasISO.slice(0, 10));

  const totalRecebido = (recebidos || []).reduce((s, f) => s + (f.valor || 0), 0);

  return {
    leadsNovos: (leadsNovos || []).length,
    convertidos: convertidos.length,
    agendamentos: (agendamentos || []).length,
    cobrancasAtrasadas: (cobrancas || []).length,
    totalAtrasado,
    tarefasVencidas: (tarefasVencidas || []).length,
    leadsAtivos: (leadsAtivos || []).length,
    totalRecebido
  };
}

// ===== LEAD SCORING =====
// Calcula score do lead baseado em comportamento (chamado a cada mensagem)
async function calcularScore(leadId, conversaId) {
  if (!leadId) return 0;
  try {
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('role, content, criado_em, media_type')
      .eq('conversa_id', conversaId)
      .order('criado_em', { ascending: true });

    if (!msgs || msgs.length === 0) return 0;

    let score = 0;
    const detalhes = [];

    // Quantidade de mensagens do lead (engajamento)
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length >= 3) { score += 10; detalhes.push('engajado(3+msgs)'); }
    if (userMsgs.length >= 6) { score += 10; detalhes.push('muito_engajado(6+msgs)'); }

    // Velocidade de resposta (média entre msgs)
    if (userMsgs.length >= 2) {
      const tempos = [];
      for (let i = 1; i < Math.min(userMsgs.length, 5); i++) {
        const diff = new Date(userMsgs[i].criado_em) - new Date(userMsgs[i-1].criado_em);
        tempos.push(diff);
      }
      const mediaMinutos = tempos.reduce((a, b) => a + b, 0) / tempos.length / 60000;
      if (mediaMinutos < 2) { score += 15; detalhes.push('resposta_rapida'); }
      else if (mediaMinutos < 10) { score += 5; detalhes.push('resposta_moderada'); }
    }

    // Tamanho das mensagens (mensagens longas = mais interesse)
    const mediaChars = userMsgs.reduce((s, m) => s + m.content.length, 0) / userMsgs.length;
    if (mediaChars > 50) { score += 5; detalhes.push('msgs_detalhadas'); }

    // Enviou áudio (mais engajado)
    if (userMsgs.some(m => m.media_type === 'audio' || m.content.includes('Áudio'))) {
      score += 10; detalhes.push('enviou_audio');
    }

    // Enviou documento/foto (forte interesse)
    if (userMsgs.some(m => m.media_type === 'image' || m.media_type === 'document')) {
      score += 15; detalhes.push('enviou_documento');
    }

    // Keywords de urgência
    const allText = userMsgs.map(m => m.content).join(' ').toLowerCase();
    if (/(urgente|preciso|rápido|rapido|logo|agora|hoje|amanhã|amanha)/.test(allText)) {
      score += 15; detalhes.push('urgencia');
    }
    if (/(quero agendar|quero marcar|pode marcar|marca pra mim|vamos agendar)/.test(allText)) {
      score += 20; detalhes.push('quer_agendar');
    }

    // Triagem completa (respondeu perguntas-chave: tempo + carteira + tipo empresa)
    if (/(ano|anos|mes|meses|mês)/.test(allText) && /(carteira|registro|registrad|assinad)/.test(allText)) {
      score += 10; detalhes.push('triagem_respondida');
    }
    if (/(empresa privada|privada|fazenda|sitio|sítio|rural|indústria|industria|loja|comércio|comercio|restaurante|fábrica|fabrica)/.test(allText)) {
      score += 5; detalhes.push('tipo_empresa_informado');
    }

    // Escolheu formato ou horário (forte intenção)
    if (/(online|presencial|videochamada|video chamada)/.test(allText)) {
      score += 10; detalhes.push('escolheu_formato');
    }
    if (/(segunda|terça|terca|quarta|quinta|sexta|amanhã|amanha|\d{1,2}\s*h)/.test(allText) &&
        /(pode ser|quero|prefiro|bora|vamos|esse|essa|sim)/.test(allText)) {
      score += 15; detalhes.push('confirmou_horario');
    }

    // Keywords negativas
    if (/(vou pensar|depois|agora nao|agora não|talvez|não sei|nao sei)/.test(allText)) {
      score -= 10; detalhes.push('hesitante');
    }
    if (/(nao quero|não quero|sem interesse|nao preciso|não preciso)/.test(allText)) {
      score -= 30; detalhes.push('sem_interesse');
    }

    score = Math.max(0, Math.min(100, score));

    // Salvar score no lead
    await supabase.from('leads').update({
      score,
      score_detalhes: detalhes.join(','),
      atualizado_em: new Date().toISOString()
    }).eq('id', leadId);

    return score;
  } catch (e) {
    console.error('[SCORING-NPL] Erro:', e.message);
    return 0;
  }
}

// ===== A/B TESTING =====
// Variantes de abordagem para testar conversão
const AB_VARIANTES = {
  A: {
    nome: 'consulta_gratuita',
    frase_oferta: 'A consulta inicial e gratuita e sem compromisso.',
    frase_custo: 'Na maioria dos casos, o escritorio so cobra se ganhar a causa.'
  },
  B: {
    nome: 'sem_risco',
    frase_oferta: 'Voce nao paga nada pela primeira consulta.',
    frase_custo: 'Sem risco pra voce: o escritorio so recebe se voce ganhar.'
  }
};

function atribuirVarianteAB(leadId) {
  // Atribuir A ou B baseado no ID do lead (determinístico, não muda)
  const hash = (leadId || '').toString().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? 'A' : 'B';
}

function getVarianteAB(lead) {
  if (lead?.ab_variante) return lead.ab_variante;
  return atribuirVarianteAB(lead?.id);
}

// ===== ANALYTICS DE CONVERSÃO =====
async function getAnalytics(dias = 30) {
  try {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    // Leads por etapa (período)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, etapa_funil, ab_variante, score, criado_em')
      .eq('escritorio', ESC)
      .gte('criado_em', desde);

    const total = (leads || []).length;
    const etapas = { novo: 0, contato: 0, agendamento: 0, documentos: 0, cliente: 0, perdido: 0 };
    const porVariante = { A: { total: 0, convertido: 0 }, B: { total: 0, convertido: 0 } };

    for (const l of (leads || [])) {
      if (etapas[l.etapa_funil] !== undefined) etapas[l.etapa_funil]++;
      const v = l.ab_variante || 'A';
      if (porVariante[v]) {
        porVariante[v].total++;
        if (l.etapa_funil === 'cliente' || l.etapa_funil === 'documentos' || l.etapa_funil === 'agendamento') {
          porVariante[v].convertido++;
        }
      }
    }

    // Eventos do período
    const { data: eventos } = await supabase
      .from('metricas')
      .select('evento, criado_em')
      .eq('escritorio', ESC)
      .gte('criado_em', desde);

    const eventosCont = {};
    for (const e of (eventos || [])) {
      eventosCont[e.evento] = (eventosCont[e.evento] || 0) + 1;
    }

    // Scores médios por etapa
    const scoresPorEtapa = {};
    for (const l of (leads || [])) {
      if (!scoresPorEtapa[l.etapa_funil]) scoresPorEtapa[l.etapa_funil] = [];
      scoresPorEtapa[l.etapa_funil].push(l.score || 0);
    }
    const scoresMedias = {};
    for (const [etapa, scores] of Object.entries(scoresPorEtapa)) {
      scoresMedias[etapa] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    // Funil de conversão
    const funil = {
      leads_novos: total,
      fizeram_triagem: etapas.contato + etapas.agendamento + etapas.documentos + etapas.cliente,
      receberam_oferta: etapas.agendamento + etapas.documentos + etapas.cliente,
      agendaram: etapas.agendamento + etapas.documentos + etapas.cliente,
      clientes: etapas.cliente,
      perdidos: etapas.perdido
    };

    // Taxas de conversão
    const taxas = {
      triagem: total > 0 ? ((funil.fizeram_triagem / total) * 100).toFixed(1) + '%' : '0%',
      oferta: funil.fizeram_triagem > 0 ? ((funil.receberam_oferta / funil.fizeram_triagem) * 100).toFixed(1) + '%' : '0%',
      agendamento: funil.receberam_oferta > 0 ? ((funil.agendaram / funil.receberam_oferta) * 100).toFixed(1) + '%' : '0%',
      perda: total > 0 ? ((funil.perdidos / total) * 100).toFixed(1) + '%' : '0%'
    };

    // A/B testing resultados
    const abResultados = {};
    for (const [v, dados] of Object.entries(porVariante)) {
      abResultados[v] = {
        total: dados.total,
        convertido: dados.convertido,
        taxa: dados.total > 0 ? ((dados.convertido / dados.total) * 100).toFixed(1) + '%' : '0%',
        nome_variante: AB_VARIANTES[v]?.nome || v
      };
    }

    return {
      periodo: `${dias} dias`,
      funil,
      taxas,
      leads_por_etapa: etapas,
      score_medio_por_etapa: scoresMedias,
      ab_testing: abResultados,
      eventos: eventosCont
    };
  } catch (e) {
    console.error('[ANALYTICS-NPL] Erro:', e.message);
    return null;
  }
}

module.exports = {
  supabase,
  getOrCreateConversa,
  updateConversa,
  saveMessage,
  getHistory,
  getRecentMessages,
  getOrCreateLead,
  updateLead,
  markLeadHot,
  extractAndUpdateLead,
  trackEvent,
  getEligibleConversas,
  listLeads,
  getLeadById,
  getLeadByPhone,
  listConversas,
  getConversaMensagens,
  getMetricas,
  createTarefa,
  findClienteProcessoByName,
  contarProcessosSimilares,
  findClienteByPhone,
  findCasoByCliente,
  getContextoCompleto,
  getRelatorioSemanal,
  calcularScore,
  getVarianteAB,
  atribuirVarianteAB,
  AB_VARIANTES,
  getAnalytics
};
