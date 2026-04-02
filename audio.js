// ===== MÓDULO DE ÁUDIO - NPLADVS (Laura) =====
// Transcrição (Whisper) e Geração de Voz (TTS) via OpenAI
const config = require('./config');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

let openaiClient = null;

function getClient() {
  if (!openaiClient) {
    if (!config.OPENAI_API_KEY) {
      console.error('[AUDIO-NPL] OPENAI_API_KEY não configurada');
      return null;
    }
    openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return openaiClient;
}

// ===== TRANSCREVER ÁUDIO (Whisper) =====
async function transcreverAudio(audioUrl) {
  const client = getClient();
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

// ===== GERAR ÁUDIO DA RESPOSTA (TTS) =====
async function gerarAudio(texto) {
  const client = getClient();
  if (!client) return null;

  try {
    const textoLimitado = texto.slice(0, 500);

    console.log('[AUDIO-NPL] Gerando voz para:', textoLimitado.slice(0, 60));

    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: textoLimitado,
      response_format: 'mp3',
      speed: 1.0
    });

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log('[AUDIO-NPL] Áudio gerado com sucesso');
    return `data:audio/mpeg;base64,${base64}`;

  } catch (e) {
    console.error('[AUDIO-NPL] Erro ao gerar áudio:', e.message);
    return null;
  }
}

module.exports = {
  transcreverAudio,
  gerarAudio
};
