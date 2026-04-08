# Servidor NPL - Laura (Assistente Virtual)

## Visão Geral
Servidor Node.js/Express que opera a Laura, assistente virtual do escritório NPLADVS (direito trabalhista, Belém/PA). Atende leads via WhatsApp (Z-API), faz triagem, agenda consultas (Google Calendar) e gerencia o funil de vendas.

## Integração com CRM
O CRM frontend (hospedado no GitHub Pages, repositório separado) chama diretamente os endpoints deste servidor. **Este é o único backend** — não existe outro servidor para o CRM. Todas as chamadas do CRM vão para `https://servidor-npl.onrender.com`.

### Endpoints da API (todos POST requerem header `x-api-key`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | Status do servidor |
| GET | `/api/conversas` | Lista conversas |
| GET | `/api/conversas/:id/mensagens` | Mensagens de uma conversa |
| GET | `/api/metricas` | Leads por etapa, conversas ativas |
| GET | `/api/analytics?dias=30` | Funil de conversão, A/B testing, scoring |
| GET | `/api/relatorio-semanal` | Dados do relatório semanal |
| GET | `/api/documentos/auditoria/:phone` | Mídias recebidas de um telefone |
| POST | `/api/enviar` | Enviar texto via WhatsApp `{phone, message, conversaId, usuario_nome}` |
| POST | `/api/enviar-audio` | Enviar áudio `{phone, audioBase64, conversaId, usuario_nome}` |
| POST | `/api/enviar-arquivo` | Enviar arquivo `{phone, fileUrl, fileName, mediaType, conversaId, usuario_nome}` |
| POST | `/api/pausar` | Pausar IA `{phone, minutes}` |
| POST | `/api/retomar` | Retomar IA `{phone}` |
| POST | `/api/chat` | Proxy Claude para CRM `{system, messages}` |
| POST | `/api/documentos/organizar` | Organizar docs `{phone, nome, tese}` |
| POST | `/api/documentos/cobrar` | Cobrar docs `{phone, nome, auditoria}` |
| POST | `/api/relatorio-semanal` | Disparar relatório |
| GET | `/api/pausar/status?phone=X` | Verificar se IA está pausada para um telefone |

### Resposta do /api/analytics
```json
{
  "periodo": "30 dias",
  "funil": {
    "leads_novos": 100,
    "fizeram_triagem": 60,
    "receberam_oferta": 40,
    "agendaram": 15,
    "perdidos": 20
  },
  "taxas": {
    "triagem": "60%",
    "oferta": "66.7%",
    "agendamento": "37.5%",
    "perda": "20%"
  },
  "leads_por_etapa": { "novo": 20, "contato": 30, "proposta": 30, "convertido": 10, "perdido": 10 },
  "score_medio_por_etapa": { "novo": 5, "contato": 25, "proposta": 55, "convertido": 75 },
  "ab_testing": {
    "A": { "total": 50, "convertido": 8, "taxa": "16%", "nome_variante": "consulta_gratuita" },
    "B": { "total": 50, "convertido": 12, "taxa": "24%", "nome_variante": "sem_risco" }
  },
  "eventos": { "primeiro_contato": 100, "lead_quente": 15, "consulta_agendada": 15, "followup_2h": 40 }
}
```

## Banco de Dados (Supabase — compartilhado com CRM)

### Tabelas principais

**leads** — dados dos leads
- `id`, `nome`, `telefone`, `email`, `escritorio` ('npl'), `instancia`
- `etapa_funil`: novo → contato → proposta → convertido / perdido
- `tese_interesse`, `notas`, `origem`
- `score` (0-100): scoring automático do lead
- `score_detalhes`: critérios (ex: "engajado,resposta_rapida,quer_agendar")
- `ab_variante`: "A" ou "B" (A/B testing)
- `criado_em`, `atualizado_em`, `data_primeiro_contato`

**conversas** — conversas ativas
- `id`, `telefone`, `titulo`, `status` (ativa/finalizada), `escritorio`, `instancia`
- `lead_id`, `etapa_conversa`, `criado_em`

**mensagens** — histórico de mensagens
- `id`, `conversa_id`, `role` (user/assistant), `content`
- `media_url`, `media_type` (audio/image/document)
- `manual` (bool), `usuario_nome`, `criado_em`

**metricas** — eventos rastreados
- `id`, `conversa_id`, `lead_id`, `evento`, `detalhes`, `escritorio`, `criado_em`
- Eventos: primeiro_contato, lead_quente, consulta_agendada, followup_2h, followup_4h, followup_24h, followup_72h, etapa_avancou

**tarefas** — tarefas do CRM
- `id`, `descricao`, `data_limite`, `prioridade`, `status`, `responsavel`

**aprendizados** — lições aprendidas pela IA
- `tipo`, `categoria`, `licao`, `contexto`, `resultado`, `efetividade`, `vezes_usado`

**npl_clientes_processos** — base de clientes antigos (importada)
- `nome_cliente`, `nome_normalizado`, `parte_contraria`, `materia`, `numero_processo`, `status_fase`

## Lead Scoring (automático)
Calculado a cada mensagem do lead. Critérios:
- Engajamento: 3+ msgs (+10), 6+ msgs (+10)
- Velocidade: resposta <2min (+15), <10min (+5)
- Mídia: áudio (+10), documento (+15)
- Urgência: palavras urgentes (+15), "quero agendar" (+20)
- Negativo: hesitante (-10), sem interesse (-30)

## A/B Testing
- Variante A ("consulta_gratuita"): "A consulta inicial é gratuita e sem compromisso"
- Variante B ("sem_risco"): "Você não paga nada pela primeira consulta"
- Atribuída ao criar lead, determinística pelo ID
- Resultados visíveis em /api/analytics

## Configuração
Variáveis de ambiente no Render:
- `API_KEY` — autenticação dos endpoints POST
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`
- `SUPABASE_URL`, `SUPABASE_KEY`
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_CREDENTIALS`
- `OSMAR_PHONE`, `ALLOWED_ORIGINS`
