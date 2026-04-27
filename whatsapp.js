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

// Limpa pushName/senderName — se vier com descrição de cargo/empresa,
// pegar só o nome próprio (primeiras 2-3 palavras que começam com maiúscula)
function limparNomeContato(nome) {
  if (!nome) return '';
  let limpo = nome.trim();
  if (limpo.startsWith('@') || limpo.includes('@')) return '';
  // Remover emojis (manter texto)
  limpo = limpo.replace(/[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2700}-\u{27BF}\u{2300}-\u{23FF}#\*]/gu, '').trim();
  if (!limpo || limpo.length < 2) return '';
  // Se é só números/pontos/underscores sem letras suficientes, ignorar.
  // Mas aceita nomes longos tipo "glacielnunesdasilva" (>8 letras consecutivas = nome real)
  if (/^[a-z0-9._]+$/i.test(limpo) && !/[a-zA-ZÀ-Úà-ú]{4,}/.test(limpo)) return '';
  // Palavras de cargo/empresa — extrair só o nome
  const palavrasNaoNome = /(time|equipe|setor|comercial|corporativo|tecnico|técnico|vendas|empresa|escritorio|escritório|sociedade|advogad)/i;
  if (!palavrasNaoNome.test(limpo)) return limpo;
  const palavras = limpo.split(/\s+/);
  const nomeProprio = [];
  for (const p of palavras) {
    if (/^(de|da|do|dos|das)$/i.test(p)) { nomeProprio.push(p); continue; }
    if (/^[a-záéíóúâêîôûãõç]/.test(p) && nomeProprio.length > 0) break;
    if (palavrasNaoNome.test(p)) break;
    nomeProprio.push(p);
    if (nomeProprio.length >= 4) break;
  }
  return nomeProprio.length > 0 ? nomeProprio.join(' ') : '';
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

// Wrapper com retry exponencial pra Z-API.
// Erros transitorios (timeout, 5xx, falha de rede) = retenta 3x com backoff 2s/4s/8s.
// Erros permanentes (4xx — telefone invalido, instancia nao encontrada, payload ruim)
// = nao retenta, retorna direto.
const ZAPI_REQUEST_TIMEOUT_MS = 15_000;

async function zapiRequest(url, body, clientToken, label = 'ZAPI', maxRetries = 3) {
  let ultimoErro = null;
  let ultimaResp = null;

  for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ZAPI_REQUEST_TIMEOUT_MS)
      });

      // 4xx = erro de cliente, nao retenta
      if (res.status >= 400 && res.status < 500) {
        const json = await res.json().catch(() => ({}));
        console.error(`[${label}] Erro ${res.status} (sem retry):`, JSON.stringify(json).slice(0, 200));
        return json;
      }

      // 5xx = erro do servidor, retenta
      if (res.status >= 500) {
        ultimaResp = res;
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.error || json.Error) {
        // Z-API as vezes retorna 200 com {error: "..."}. Logar mas nao retentar
        // (geralmente erro de payload, nao de transporte).
        console.error(`[${label}] Erro no payload (sem retry):`, JSON.stringify(json).slice(0, 200));
      }
      return json;

    } catch (e) {
      ultimoErro = e;
      const ehTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      const ehUltima = tentativa === maxRetries;
      if (ehUltima) {
        console.error(`[${label}] Falha definitiva apos ${tentativa} tentativa(s):`, e.message);
        return null;
      }
      const delay = 1000 * Math.pow(2, tentativa); // 2s, 4s, 8s
      console.warn(`[${label}] Tentativa ${tentativa} falhou (${ehTimeout ? 'timeout' : e.message}). Retry em ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

async function sendText(phone, text, instancia = null) {
  const inst = getInstanceConfig(instancia);
  const json = await zapiRequest(
    `${inst.base}/send-text`,
    { phone: cleanPhone(phone), message: text },
    inst.clientToken,
    `ZAPI-NPL ${instancia || 'escritorio'}`
  );
  if (json && !json.error && !json.Error) {
    console.log(`[ZAPI-NPL] Mensagem enviada (${instancia || 'escritorio'}):`, phone);
  }
  markBotSent(phone);
  return json;
}

async function sendAudio(phone, audioBase64, instancia = null) {
  // Z-API exige formato data URI completo (data:audio/ogg;base64,XXXXX)
  // Se já vem com prefixo, manter. Se é base64 puro, adicionar prefixo.
  const audioData = audioBase64.startsWith('data:')
    ? audioBase64
    : `data:audio/ogg;base64,${audioBase64}`;
  const inst = getInstanceConfig(instancia);
  const json = await zapiRequest(
    `${inst.base}/send-audio`,
    { phone: cleanPhone(phone), audio: audioData },
    inst.clientToken,
    `ZAPI-NPL ${instancia || 'escritorio'} audio`
  );
  if (json && !json.error && !json.Error) {
    console.log(`[ZAPI-NPL] Áudio enviado (${instancia || 'escritorio'}):`, phone);
  }
  markBotSent(phone);
  return json;
}

async function sendImage(phone, imageUrl, caption = '', instancia = null) {
  const inst = getInstanceConfig(instancia);
  const json = await zapiRequest(
    `${inst.base}/send-image`,
    { phone: cleanPhone(phone), image: imageUrl, caption },
    inst.clientToken,
    `ZAPI-NPL ${instancia || 'escritorio'} image`
  );
  if (json && !json.error && !json.Error) {
    console.log(`[ZAPI-NPL] Imagem enviada (${instancia || 'escritorio'}):`, phone);
  }
  markBotSent(phone);
  return json;
}

async function sendDocument(phone, documentUrl, fileName = 'arquivo.pdf', instancia = null) {
  const ext = fileName.split('.').pop() || 'pdf';
  const inst = getInstanceConfig(instancia);
  const json = await zapiRequest(
    `${inst.base}/send-document/${ext}`,
    { phone: cleanPhone(phone), document: documentUrl, fileName },
    inst.clientToken,
    `ZAPI-NPL ${instancia || 'escritorio'} document`
  );
  if (json && !json.error && !json.Error) {
    console.log(`[ZAPI-NPL] Documento enviado (${instancia || 'escritorio'}):`, phone, fileName);
  }
  markBotSent(phone);
  return json;
}

async function notifyHotLead(leadName, phone, trigger, instancia = null) {
  if (!config.OSMAR_PHONE) {
    console.warn('[HOT-NPL] OSMAR_PHONE nao configurado, notificacao ignorada');
    return null;
  }
  const msg = `LEAD QUENTE - NPL TRABALHISTA!\n\n${leadName} (${phone}) demonstrou interesse alto.\n\nFrase: "${trigger}"\n\nResponda rapido ou a Laura continua o atendimento.`;
  const inst = getInstanceConfig(instancia);
  const json = await zapiRequest(
    `${inst.base}/send-text`,
    { phone: config.OSMAR_PHONE, message: msg },
    inst.clientToken,
    `HOT-NPL`
  );
  markBotSent(config.OSMAR_PHONE); // evita que o echo pause a IA do Dr. Osmar
  if (json && !json.error && !json.Error) {
    console.log(`[HOT-NPL] Notificação enviada sobre ${leadName}`);
  } else {
    console.error(`[HOT-NPL] Falha ao notificar sobre ${leadName} (resposta:`, JSON.stringify(json || {}).slice(0, 150), ')');
  }
  return json;
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
  } catch (e) {
    console.error('[WHATSAPP-NPL] Erro ao checar feriado nacional:', e.message);
  }

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
  limparNomeContato,
  cleanup
};
