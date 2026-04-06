// ===== CONFIGURAÇÃO - NEVES PINHEIRO LINS (Laura) =====
// Variáveis de ambiente separadas para não conflitar com o servidor da Ana

require('dotenv').config();

module.exports = {
  // Anthropic (Claude) — pode usar a mesma API key
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  MAX_TOKENS: 200,

  // OpenAI (Whisper — transcrição de áudio)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // ElevenLabs (TTS — geração de voz natural)
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || 'rdBSfr2PAUTCe39SX2fo',

  // Supabase — MESMO banco, dados separados por campo 'escritorio'
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,

  // Z-API (WhatsApp) — INSTÂNCIA SEPARADA para o número do NPL
  ZAPI_INSTANCE: process.env.ZAPI_INSTANCE_ID,
  ZAPI_TOKEN: process.env.ZAPI_TOKEN,
  ZAPI_CLIENT_TOKEN: process.env.ZAPI_CLIENT_TOKEN,
  ZAPI_WEBHOOK_TOKEN: process.env.ZAPI_WEBHOOK_TOKEN,
  get ZAPI_BASE() {
    return `https://api.z-api.io/instances/${this.ZAPI_INSTANCE}/token/${this.ZAPI_TOKEN}`;
  },

  // Telefone do Dr. Osmar para notificações
  OSMAR_PHONE: process.env.OSMAR_PHONE,

  // Identificador do escritório (usado para separar dados no Supabase)
  ESCRITORIO: 'npl',
  ESCRITORIO_NOME: 'NPLADVS',

  // Buffer de mensagens
  BUFFER_DELAY: 6000,

  // Rate limit
  RATE_LIMIT_MAX: 30,

  // Palavras que indicam lead quente (foco trabalhista)
  HOT_LEAD_KEYWORDS: [
    'quero agendar', 'quero marcar', 'como faço pra contratar', 'quero contratar',
    'quanto custa', 'qual o valor', 'vamos agendar', 'pode marcar', 'tenho interesse',
    'quero consulta', 'me agenda', 'fecha pra mim', 'vamos fechar', 'pode ser amanhã',
    'pode ser segunda', 'pode ser terça', 'pode ser quarta', 'pode ser quinta', 'pode ser sexta',
    'qual horário', 'horário disponível', 'quero sim', 'vamos lá', 'bora',
    'tô precisando', 'preciso muito', 'urgente', 'me ajuda com isso',
    'fui demitido', 'me mandaram embora', 'não recebi', 'não pagaram',
    'quero meus direitos', 'quero processar', 'vou processar'
  ],

  // Etapas do fluxo de conversa
  ETAPAS: {
    SAUDACAO: 'saudacao',
    QUALIFICACAO: 'qualificacao',
    PROPOSTA: 'proposta',
    AGENDAMENTO: 'agendamento',
    POS_AGENDAMENTO: 'pos_agendamento'
  },

  // Google Calendar
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_CALENDAR_CREDENTIALS: process.env.GOOGLE_CALENDAR_CREDENTIALS || null,

  // Google Drive
  GOOGLE_DRIVE_PASTA_RAIZ: process.env.GOOGLE_DRIVE_PASTA_RAIZ || null,

  // Autenticação da API (obrigatório para endpoints POST)
  API_KEY: process.env.API_KEY,

  // Origens permitidas para CORS (separadas por vírgula)
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || null,

  // Servidor
  PORT: process.env.PORT || 3000,
  RENDER_URL: process.env.RENDER_EXTERNAL_URL
};
