# Segurança — Servidor NPL (Laura)

## Autenticação

### API Key (x-api-key)
- **TODOS os endpoints** (GET e POST) exigem header `x-api-key` com valor da env `API_KEY`
- Se `API_KEY` não estiver configurada no Render, servidor recusa TODAS as requisições (fail-closed)
- Exceções: `GET /api/health`, `GET /api/pausar/status`, webhooks Z-API

### Webhooks Z-API
- Autenticação opcional via `ZAPI_WEBHOOK_TOKEN` (header `client-token`)
- **Recomendação**: sempre configurar `ZAPI_WEBHOOK_TOKEN` no Render E no painel Z-API
- Sem token, qualquer pessoa pode enviar payloads forjados pro webhook

## Proteções Implementadas

### SSRF (Server-Side Request Forgery)
- `isUrlSegura()` em `audio.js` bloqueia URLs de:
  - localhost, 127.0.0.1, [::1]
  - IPs privados (10.x, 172.16-31.x, 192.168.x, 169.254.x)
  - Domínios .internal, .local
  - Protocolos não-HTTP/HTTPS
- Aplicada em: transcrição de áudio (audioUrl do webhook)

### PostgREST Injection
- `sanitizePostgrest()` em `database.js` remove caracteres perigosos (`,().%_\*`) antes de interpolar em filtros `.or()` e `.ilike()`
- Todas as queries que usam input do usuário passam por sanitização

### Dedup de Webhook
- `processedMessages` Map com TTL de 30min por entrada impede reprocessamento
- `wasBotRecentSend` (60s) impede echoes do Z-API de pausar a IA
- Content-based dedup (±5min) pega echoes lentos

### Cache Poisoning (lidPhoneMap)
- Cache @lid → telefone populado **apenas** de mensagens incoming (fromMe=false)
- Mensagens fromMe não populam o cache (previne atacante forjando payload)

### Dados Sensíveis
- PII (telefones, nomes) aparece em logs — aceito pro contexto de debug
- Notas financeiras de clientes NUNCA são compartilhadas pela Laura
- Laura encaminha pra equipe administrativa quando cliente pergunta valores

## Variáveis de Ambiente Sensíveis

| Variável | Onde fica | Quem usa |
|----------|----------|----------|
| `API_KEY` | Render | CRM frontend (header x-api-key) |
| `ANTHROPIC_API_KEY` | Render | Servidor (Claude API) |
| `OPENAI_API_KEY` | Render | Servidor (Whisper transcrição) |
| `ELEVENLABS_API_KEY` | Render | Servidor (voz natural) |
| `SUPABASE_KEY` | Render | Servidor (banco de dados) |
| `GOOGLE_CALENDAR_CREDENTIALS` | Render | Servidor (Google Calendar) |
| `DATACRAZY_API_TOKEN` | Render | Servidor (polling Datacrazy) |
| `ZAPI_WEBHOOK_TOKEN` | Render + Z-API | Validação webhook |

## Checklist de Deploy

- [ ] `API_KEY` configurada no Render (sem ela, nada funciona)
- [ ] `ALLOWED_ORIGINS` com domínio do CRM (`https://osmarnevesadvogado.github.io`)
- [ ] `ZAPI_WEBHOOK_TOKEN` configurado (webhook autenticado)
- [ ] Verificar logs: nenhum `503 API_KEY not configured`
- [ ] Testar: `GET /api/health` retorna 200, `GET /api/leads` sem header retorna 401

## Vulnerabilidades Conhecidas (Aceitas)

1. **Webhook Z-API sem auth obrigatória** — `ZAPI_WEBHOOK_TOKEN` é opcional. Se não configurado, webhook é aberto. Mitigação: sempre configurar.
2. **PII em logs** — telefones e nomes em stdout/Render logs. Mitigação: acesso restrito ao dashboard Render.
3. **Claude proxy `/api/chat`** — aberto pra quem tem API_KEY. Mitigação: rate limit implícito do Anthropic.
