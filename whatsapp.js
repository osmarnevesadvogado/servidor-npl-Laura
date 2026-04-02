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

function markBotSent(phone) {
  recentBotSends.set(cleanPhone(phone), Date.now());
}

function wasBotRecentSend(phone) {
  const ts = recentBotSends.get(cleanPhone(phone));
  if (!ts) return false;
  // Janela de 15 segundos para filtrar o echo do bot
  // Z-API pode demorar 5-10s para ecoar dependendo da latência
  // 15s é seguro: nenhum humano lê e responde em menos de 15s
  // Antes era 5s (echo escapava) e 30s (bloqueava advogado)
  return (Date.now() - ts) < 15000;
}

async function sendText(phone, text) {
  try {
    const res = await fetch(`${config.ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': config.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: cleanPhone(phone), message: text })
    });
    const json = await res.json();
    console.log('[ZAPI-NPL] Mensagem enviada:', phone);
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar:', e.message);
    return null;
  }
}

async function sendAudio(phone, audioBase64) {
  try {
    const res = await fetch(`${config.ZAPI_BASE}/send-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': config.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: cleanPhone(phone), audio: audioBase64 })
    });
    const json = await res.json();
    console.log('[ZAPI-NPL] Áudio enviado:', phone);
    markBotSent(phone);
    return json;
  } catch (e) {
    console.error('[ZAPI-NPL] Erro ao enviar áudio:', e.message);
    return null;
  }
}

async function notifyHotLead(leadName, phone, trigger) {
  const msg = `LEAD QUENTE - NPL TRABALHISTA!\n\n${leadName} (${phone}) demonstrou interesse alto.\n\nFrase: "${trigger}"\n\nResponda rapido ou a Laura continua o atendimento.`;
  try {
    await fetch(`${config.ZAPI_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': config.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: config.OSMAR_PHONE, message: msg })
    });
    console.log(`[HOT-NPL] Notificação enviada sobre ${leadName}`);
  } catch (e) {
    console.error('[HOT-NPL] Erro ao notificar:', e.message);
  }
}

function cleanup() {
  const now = Date.now();
  for (const [phone, ts] of recentBotSends) {
    if (now - ts > 120000) recentBotSends.delete(phone);
  }
}

module.exports = {
  cleanPhone,
  markBotSent,
  wasBotRecentSend,
  sendText,
  sendAudio,
  notifyHotLead,
  cleanup
};
