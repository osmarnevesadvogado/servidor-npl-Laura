// ===== MÓDULO DE ÁUDIO - NPLADVS (Laura) =====
// Transcrição: Whisper (OpenAI)
// Geração de voz: ElevenLabs (voz natural em português BR)
// Fallback: OpenAI TTS se ElevenLabs não estiver configurada

const config = require('./config');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    if (!config.OPENAI_API_KEY) {
      console.error('[AUDIO-NPL] OPENAI_API_KEY não configurada');
      return null;
    }
    openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openaiClient;
}

function isUrlSegura(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false;
    if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host.endsWith('.internal') || host.endsWith('.local')) return false;
    return true;
  } catch { return false; }
}

// ===== TRANSCREVER ÁUDIO (Whisper — OpenAI) =====
// Timeouts: 15s pra baixar o audio do Z-API, 25s pra Whisper transcrever.
// Render mata request inteira em 30s — sem esses timeouts, audio lento
// derrubava o webhook todo.
const DOWNLOAD_TIMEOUT_MS = 15_000;
const WHISPER_TIMEOUT_MS = 25_000;

async function transcreverAudio(audioUrl) {
  const client = getOpenAI();
  if (!client) return null;

  if (!isUrlSegura(audioUrl)) {
    console.log('[AUDIO-NPL] URL bloqueada (SSRF):', audioUrl?.slice(0, 50));
    return null;
  }

  let tempFile = null;

  try {
    console.log('[AUDIO-NPL] Baixando áudio:', audioUrl.slice(0, 80));

    const response = await fetch(audioUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Erro ao baixar áudio: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    tempFile = path.join(os.tmpdir(), `audio_npl_${Date.now()}.ogg`);
    fs.writeFileSync(tempFile, buffer);

    console.log('[AUDIO-NPL] Enviando para Whisper...');

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text'
    }, {
      timeout: WHISPER_TIMEOUT_MS
    });

    const texto = transcription.trim();
    console.log(`[AUDIO-NPL] Transcrito: "${texto.slice(0, 100)}"`);
    return texto;

  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error('[AUDIO-NPL] Timeout na transcrição:', e.message);
    } else {
      console.error('[AUDIO-NPL] Erro na transcrição:', e.message);
    }
    return null;
  } finally {
    if (tempFile) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
  }
}

// ===== GERAR ÁUDIO (ElevenLabs — voz natural) =====
async function gerarAudioElevenLabs(texto) {
  const apiKey = config.ELEVENLABS_API_KEY;
  const voiceId = config.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) return null;

  try {
    // ElevenLabs cobra por caractere — limitar para economizar créditos
    const textoLimitado = texto.slice(0, 600);

    console.log('[AUDIO-NPL] ElevenLabs gerando voz para:', textoLimitado.slice(0, 60));

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: textoLimitado,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      if (errText.includes('quota_exceeded')) {
        elevenlabsDesativada = true;
        elevenlabsDesativadaEm = Date.now();
        console.log('[AUDIO-NPL] ElevenLabs sem crédito — desativada por 24h');
      }
      throw new Error(`ElevenLabs ${response.status}: ${errText.slice(0, 200)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log('[AUDIO-NPL] ElevenLabs áudio gerado com sucesso');
    return `data:audio/mpeg;base64,${base64}`;

  } catch (e) {
    console.error('[AUDIO-NPL] Erro ElevenLabs:', e.message);
    return null;
  }
}

// ===== FALLBACK: OpenAI TTS =====
async function gerarAudioOpenAI(texto) {
  const client = getOpenAI();
  if (!client) return null;

  try {
    const textoLimitado = texto.slice(0, 600);

    console.log('[AUDIO-NPL] OpenAI TTS (fallback) para:', textoLimitado.slice(0, 60));

    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: textoLimitado,
      response_format: 'opus',
      speed: 1.0
    });

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log('[AUDIO-NPL] OpenAI TTS áudio gerado (fallback)');
    return `data:audio/ogg;base64,${base64}`;

  } catch (e) {
    console.error('[AUDIO-NPL] Erro OpenAI TTS:', e.message);
    return null;
  }
}

// ===== GERAR ÁUDIO (tenta ElevenLabs, fallback OpenAI) =====
let elevenlabsDesativada = false;
let elevenlabsDesativadaEm = 0;
const ELEVENLABS_RETRY_MS = 24 * 60 * 60 * 1000; // tenta de novo após 24h

async function gerarAudio(texto) {
  // Só gera áudio com ElevenLabs (voz natural). Se sem crédito, não gera — sem fallback.
  // Resetar flag após 24h (crédito pode ter sido reposto)
  if (elevenlabsDesativada && Date.now() - elevenlabsDesativadaEm > ELEVENLABS_RETRY_MS) {
    elevenlabsDesativada = false;
    console.log('[AUDIO-NPL] ElevenLabs reativada (24h desde desativação)');
  }
  if (config.ELEVENLABS_API_KEY && !elevenlabsDesativada) {
    const audio = await gerarAudioElevenLabs(texto);
    if (audio) return audio;
  }

  // Sem ElevenLabs = sem áudio (OpenAI TTS desativado — voz robótica)
  return null;
}

module.exports = {
  transcreverAudio,
  gerarAudio
};
