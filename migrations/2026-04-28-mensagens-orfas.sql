-- =====================================================
-- Migration: tabela mensagens_orfas
-- Data: 2026-04-28
-- Motivo: quando a equipe responde cliente pelo CELULAR vinculado, o Z-API
--   envia webhook fromMe=true com o telefone destino mascarado como @lid
--   (privacidade Multi-Device). O servidor tenta resolver @lid -> telefone
--   via cache OU match por nome no banco. Se ambos falharem, a mensagem
--   era DESCARTADA.
--
-- Esta tabela guarda essas mensagens orfas pra triagem manual via
-- /api/admin/mensagens-orfas. Quando alguem da equipe atribui a uma
-- conversa, a mensagem eh movida pra tabela `mensagens` E o lidPhoneMap
-- em memoria eh populado, fazendo as proximas msgs daquele @lid resolverem
-- automaticamente.
-- =====================================================

CREATE TABLE IF NOT EXISTS mensagens_orfas (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_lid        text          NOT NULL,           -- ex: "108795900477482@lid"
  chat_name       text,                              -- nome custom do contato no celular
  content         text,                              -- texto/caption
  media_url       text,
  media_type      text,                              -- image/audio/document/video/unknown
  raw_body        jsonb         NOT NULL,            -- body completo do webhook pra fallback
  endpoint        text          NOT NULL DEFAULT '/webhook/zapi',
  instancia       text,
  atribuida       boolean       NOT NULL DEFAULT false,
  conversa_id     uuid,                              -- preenchida apos atribuicao
  usuario_atribuiu text,
  atribuida_em    timestamptz,
  criado_em       timestamptz   NOT NULL DEFAULT now()
);

-- Indices: lista pendentes (parcial), busca por lid pra dedup
CREATE INDEX IF NOT EXISTS idx_orfas_pendentes ON mensagens_orfas(criado_em DESC) WHERE atribuida = false;
CREATE INDEX IF NOT EXISTS idx_orfas_lid ON mensagens_orfas(chat_lid);
CREATE INDEX IF NOT EXISTS idx_orfas_criado ON mensagens_orfas(criado_em DESC);

-- IMPORTANTE: desabilitar RLS (mesma justificativa de webhook_raw — escrita
-- so pelo servidor, leitura via endpoints com x-api-key)
ALTER TABLE mensagens_orfas DISABLE ROW LEVEL SECURITY;
