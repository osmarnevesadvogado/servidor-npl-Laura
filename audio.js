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

// ===== TRANSCREVER ÁUDIO (Whisper — OpenAI) =====
async function transcreverAudio(audioUrl) {
  const client = getOpenAI();
  if (!client) return null;

  let tempFile = null;

  try {
    console.log('[AUDIO-NPL] Baixando áudio:', audioUrl.slice(0, 80));

    const response = await fetch(audioUrl);
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
    });

    const texto = transcription.trim();
    console.log(`[AUDIO-NPL] Transcrito: "${texto.slice(0, 100)}"`);
    return texto;

  } catch (e) {
    console.error('[AUDIO-NPL] Erro na transcrição:', e.message);
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
        console.log('[AUDIO-NPL] ElevenLabs sem crédito — desativada até próximo deploy');
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
let elevenlabsDesativada = false; // cache quando sem crédito

async function gerarAudio(texto) {
  // Só gera áudio com ElevenLabs (voz natural). Se sem crédito, não gera — sem fallback.
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
