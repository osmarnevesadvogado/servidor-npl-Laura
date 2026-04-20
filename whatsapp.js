// ===== INTEGRAÇÃO Z-API (WhatsApp) - NPL =====
const config = require('./config');

const recentBotSends = new Map();

function cleanPhone(phone) {
  if (!phone) return null;
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('55') && p.length >= 12) return p;
  if (p.length === 11) return '55' + p;
  if (p.length === 10) return '55' + p;
  return p;
}

// Retorna base URL e client token da instância correta
function getInstanceConfig(instancia) {
  if (instancia === 'prospeccao' && config.ZAPI_INSTANCE_PROSPECCAO) {
    return {
      base: config.ZAPI_BASE_PROSPECCAO,
      clientToken: config.ZAPI_CLIENT_TOKEN_PROSPECCAO
    };
  }
  // Default: escritório
  return {
    base: config.ZAPI_BASE,
    clientToken: config.ZAPI_CLIENT_TOKEN
  };
}

function markBotSent(phone) {
  recentBotSends.set(cleanPhone(phone), Date.now());
}

function wasBotRecentSend(phone) {
  const ts = recentBotSends.get(cleanPhone(phone));
  if (!ts) return false;
  // Janela de 60s: Z-API às vezes demora 30-45s para ecoar o envio
  return (Date.now() - ts) < 60000;
}

async function sendText(phone, text, instancia = null) {
  try {
    const inst = getInstanceConfig(instancia);
    const res = await fetch(`${inst.base}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': inst.clientToken },
      body: JSON.stringify({ phone: cleanPhone(phone), message: text })
    });
    const json = await res.json();
    if (json.error || json.Error) {
      console.error(`[ZAPI-NPL] Erro ao enviar msg (${instancia || 'escritorio'}):`, phone, JSON.stringify(json));
    } else {
      console.log(`[ZAPI-NPL] Mensagem enviada (${instancia || 'escritorio'}):`, phone);
    }
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar:', e.message);
    return null;
  }
}

async function sendAudio(phone, audioBase64, instancia = null) {
  try {
    const base64Pure = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const inst = getInstanceConfig(instancia);
    const res = await fetch(`${inst.base}/send-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': inst.clientToken },
      body: JSON.stringify({ phone: cleanPhone(phone), audio: base64Pure })
    });
    const json = await res.json();
    if (json.error || json.Error) {
      console.error(`[ZAPI-NPL] Erro ao enviar áudio (${instancia || 'escritorio'}):`, JSON.stringify(json));
    } else {
      console.log(`[ZAPI-NPL] Áudio enviado (${instancia || 'escritorio'}):`, phone);
    }
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar áudio:', e.message);
    return null;
  }
}

async function sendImage(phone, imageUrl, caption = '', instancia = null) {
  try {
    const inst = getInstanceConfig(instancia);
    const res = await fetch(`${inst.base}/send-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': inst.clientToken },
      body: JSON.stringify({ phone: cleanPhone(phone), image: imageUrl, caption })
    });
    const json = await res.json();
    console.log(`[ZAPI-NPL] Imagem enviada (${instancia || 'escritorio'}):`, phone);
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar imagem:', e.message);
    return null;
  }
}

async function sendDocument(phone, documentUrl, fileName = 'arquivo.pdf', instancia = null) {
  try {
    const ext = fileName.split('.').pop() || 'pdf';
    const inst = getInstanceConfig(instancia);
    const res = await fetch(`${inst.base}/send-document/${ext}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': inst.clientToken },
      body: JSON.stringify({ phone: cleanPhone(phone), document: documentUrl, fileName })
    });
    const json = await res.json();
    console.log(`[ZAPI-NPL] Documento enviado (${instancia || 'escritorio'}):`, phone, fileName);
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar documento:', e.message);
    return null;
  }
}

async function notifyHotLead(leadName, phone, trigger, instancia = null) {
  const msg = `LEAD QUENTE - NPL TRABALHISTA!\n\n${leadName} (${phone}) demonstrou interesse alto.\n\nFrase: "${trigger}"\n\nResponda rapido ou a Laura continua o atendimento.`;
  try {
    const inst = getInstanceConfig(instancia);
    await fetch(`${inst.base}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': inst.clientToken },
      body: JSON.stringify({ phone: config.OSMAR_PHONE, message: msg })
    });
    markBotSent(config.OSMAR_PHONE); // evita que o echo pause a IA do Dr. Osmar
    console.log(`[HOT-NPL] Notificação enviada sobre ${leadName}`);
  } catch (e) {
    console.error('[HOT-NPL] Erro ao notificar:', e.message);
  }
}

// Detectar qual instância pelo instanceId do payload da Z-API
function detectarInstancia(body) {
  const instanceId = body.instanceId || body.token || '';
  if (config.ZAPI_INSTANCE_PROSPECCAO && instanceId.includes(config.ZAPI_INSTANCE_PROSPECCAO)) {
    return 'prospeccao';
  }
  return 'escritorio';
}

// Cache de dias não úteis (feriados + enforcados do escritório)
let diasNaoUteisCache = null;
let diasNaoUteisCacheExpira = 0;

async function getDiasNaoUteis() {
  // Cache de 1 hora
  if (diasNaoUteisCache && Date.now() < diasNaoUteisCacheExpira) {
    return diasNaoUteisCache;
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
    const { data } = await supabase
      .from('dias_nao_uteis')
      .select('data, tipo, descricao')
      .eq('escritorio', 'npl')
      .gte('data', new Date().toISOString().slice(0, 10));

    diasNaoUteisCache = (data || []).map(d => d.data);
    diasNaoUteisCacheExpira = Date.now() + 60 * 60 * 1000;
    return diasNaoUteisCache;
  } catch (e) {
    console.log('[WHATSAPP-NPL] Erro ao buscar dias nao uteis:', e.message);
    return [];
  }
}

function limparCacheDiasNaoUteis() {
  diasNaoUteisCache = null;
  diasNaoUteisCacheExpira = 0;
}

// Verificar se está em horário comercial (Belém, seg-sex, sem feriados/enforcados)
async function isHorarioComercial() {
  const agora = new Date();
  const belemHour = parseInt(agora.toLocaleString('en-US', { timeZone: 'America/Belem', hour: 'numeric', hour12: false }));
  const belemDate = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Belem' }));
  const belemDay = belemDate.getDay();
  // 0=domingo, 6=sábado
  const isWeekday = belemDay >= 1 && belemDay <= 5;
  if (!isWeekday) return false;
  if (belemHour < config.OFFICE_HOURS_START || belemHour >= config.OFFICE_HOURS_END) return false;

  // Verificar feriados nacionais (via calendar.js)
  try {
    const calendar = require('./calendar');
    const ano = belemDate.getFullYear();
    const mes = belemDate.getMonth();
    const dia = belemDate.getDate();
    // Acessar FERIADOS através de uma função exposta ou reimplementar
    const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const diasNaoUteis = await getDiasNaoUteis();
    if (diasNaoUteis.includes(dateStr)) {
      return false;
    }
    // Feriado nacional (do calendar)
    if (calendar.isFeriadoNacional && calendar.isFeriadoNacional(ano, mes, dia)) {
      return false;
    }
  } catch (e) {}

  return true;
}

function cleanup() {
  const now = Date.now();
  for (const [phone, ts] of recentBotSends) {
    // Limpar após 3min (janela de 60s + margem)
    if (now - ts > 180000) recentBotSends.delete(phone);
  }
}

module.exports = {
  cleanPhone,
  markBotSent,
  wasBotRecentSend,
  sendText,
  sendAudio,
  sendImage,
  sendDocument,
  notifyHotLead,
  detectarInstancia,
  isHorarioComercial,
  getInstanceConfig,
  limparCacheDiasNaoUteis,
  getDiasNaoUteis,
  cleanup
};
