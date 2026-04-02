// ===== OPERAÇÕES SUPABASE - NPL =====
// Mesmo banco da Ana, dados separados por campo 'escritorio' = 'npl'

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
const ESC = config.ESCRITORIO; // 'npl'

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
    .single();

  if (conv) return conv;

  const { data: newConv } = await supabase
    .from('conversas')
    .insert({ telefone: tel, titulo: 'WhatsApp', escritorio: ESC })
    .select()
    .single();

  return newConv;
}

async function updateConversa(conversaId, updates) {
  await supabase.from('conversas').update(updates).eq('id', conversaId);
}

// ===== MENSAGENS =====

async function saveMessage(conversaId, role, content, extras = {}) {
  const row = { conversa_id: conversaId, role, content };
  if (extras.manual) row.manual = true;
  if (extras.usuario_nome) row.usuario_nome = extras.usuario_nome;
  await supabase.from('mensagens').insert(row);
}

async function getHistory(conversaId, limit = 100) {
  const { data: msgs } = await supabase
    .from('mensagens')
    .select('role, content')
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
    .limit(conversaIds.length * perConversation);

  return data || [];
}

// ===== LEADS =====

async function getOrCreateLead(phone, nome) {
  const { cleanPhone } = require('./whatsapp');
  const tel = cleanPhone(phone);

  // Buscar lead existente deste escritório
  let { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('telefone', tel)
    .eq('escritorio', ESC)
    .limit(1)
    .single();

  if (lead) return lead;

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      nome: nome || 'WhatsApp ' + tel.slice(-4),
      telefone: tel,
      origem: 'WhatsApp NPL',
      etapa_funil: 'novo',
      escritorio: ESC,
      tese_interesse: 'Trabalhista',
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
  await updateLead(leadId, { etapa_funil: 'proposta' });
}

// Extrair dados do lead automaticamente das mensagens
async function extractAndUpdateLead(leadId, text) {
  if (!leadId || !text) return;
  const updates = {};

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) updates.email = emailMatch[0];

  // Nome
  const nomePatterns = [
    /(?:me chamo|meu nome é|sou o |sou a |pode me chamar de )\s*([A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+){0,3})/i,
    /(?:^|\n)([A-ZÀ-Ú][a-zà-ú]+ [A-ZÀ-Ú][a-zà-ú]+)(?:\s*$)/m
  ];
  for (const pattern of nomePatterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 3 && match[1].length < 50) {
      updates.nome = match[1].trim();
      break;
    }
  }

  // Tese — no NPL tudo é trabalhista, mas podemos detalhar o tipo
  const lower = text.toLowerCase();
  if (!updates.tese_interesse) {
    // Já é trabalhista por padrão, mas podemos registrar subtipo nas notas
    if (lower.includes('demiss') || lower.includes('mandaram embora') || lower.includes('demitid')) {
      updates.notas = 'Tipo: Rescisão/Demissão';
    } else if (lower.includes('horas extra') || lower.includes('hora extra')) {
      updates.notas = 'Tipo: Horas extras';
    } else if (lower.includes('acidente') || lower.includes('doença') || lower.includes('doenca')) {
      updates.notas = 'Tipo: Acidente/Doença do trabalho';
    } else if (lower.includes('assédio') || lower.includes('assedio')) {
      updates.notas = 'Tipo: Assédio no trabalho';
    } else if (lower.includes('salário') || lower.includes('salario') || lower.includes('não pagou') || lower.includes('nao pagou')) {
      updates.notas = 'Tipo: Salário atrasado/não pago';
    } else if (lower.includes('carteira') || lower.includes('registro')) {
      updates.notas = 'Tipo: Falta de registro/carteira';
    } else if (lower.includes('fgts') || lower.includes('multa')) {
      updates.notas = 'Tipo: FGTS/Multa rescisória';
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
    .select('id, telefone, lead_id, leads(id, nome, tese_interesse, etapa_funil, telefone)')
    .eq('status', 'ativa')
    .eq('escritorio', ESC)
    .not('lead_id', 'is', null);

  if (!data) return [];

  return data.filter(c =>
    c.leads && c.leads.etapa_funil !== 'convertido' && c.leads.etapa_funil !== 'perdido'
  );
}

// ===== QUERIES DO CRM =====

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
  const etapas = { novo: 0, contato: 0, proposta: 0, convertido: 0, perdido: 0 };
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
      ? ((etapas.convertido / (leads || []).length) * 100).toFixed(1) + '%'
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

  // Busca parcial: primeiro + último nome como palavras (não pedaços)
  // Usar espaços ao redor para evitar match parcial (ex: "ana" não bater em "mariana")
  const { data: parcial } = await supabase
    .from('npl_clientes_processos')
    .select('*')
    .or(`nome_normalizado.ilike.${primeiro} %,nome_normalizado.ilike.% ${primeiro} %,nome_normalizado.ilike.% ${primeiro}`)
    .or(`nome_normalizado.ilike.${ultimo} %,nome_normalizado.ilike.% ${ultimo} %,nome_normalizado.ilike.% ${ultimo}`);

  // Só confiar se achou EXATAMENTE 1 resultado (sem ambiguidade)
  if (parcial && parcial.length === 1) return parcial;

  // Se achou mais de 1, verificar se algum é match muito próximo (>80% das palavras)
  if (parcial && parcial.length > 1 && parcial.length <= 3) {
    const melhorMatch = parcial.filter(p => {
      const nomeBanco = (p.nome_normalizado || '').split(' ').filter(w => w.length > 2);
      const palavrasMatch = palavras.filter(pl => nomeBanco.includes(pl));
      return palavrasMatch.length >= Math.max(palavras.length, nomeBanco.length) * 0.7;
    });
    if (melhorMatch.length === 1) return melhorMatch;
  }

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

  const { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefone', tel)
    .limit(1)
    .single();

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

  const convertidos = (leadsNovos || []).filter(l => l.etapa_funil === 'convertido');

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
    .not('etapa_funil', 'in', '("convertido","perdido")');

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
  listConversas,
  getConversaMensagens,
  getMetricas,
  createTarefa,
  findClienteProcessoByName,
  findClienteByPhone,
  findCasoByCliente,
  getContextoCompleto,
  getRelatorioSemanal
};
