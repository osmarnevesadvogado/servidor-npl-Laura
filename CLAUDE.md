# Servidor NPL - Laura (Assistente Virtual)

## Visão Geral
Servidor Node.js/Express que opera a Laura, assistente virtual do escritório Neves Pinheiro Lins Sociedade de Advogados (direito trabalhista, Belém/PA). Atende leads via WhatsApp (Z-API + Datacrazy Cloud API), faz triagem, agenda consultas (Google Calendar) e gerencia o funil de vendas.

## Integração com CRM
O CRM frontend (hospedado no GitHub Pages, repositório `npladvs-crm`) chama diretamente os endpoints deste servidor. **Este é o único backend** — não existe outro servidor para o CRM. Todas as chamadas do CRM vão para `https://servidor-npl.onrender.com`.

### Endpoints da API (todos POST requerem header `x-api-key`)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/health` | Status do servidor |
| GET | `/api/conversas` | Lista conversas |
| GET | `/api/conversas/:id/mensagens` | Mensagens de uma conversa |
| GET | `/api/leads` | Lista leads com dados completos. Filtros: `?etapa=contato&limit=100` |
| GET | `/api/leads/:id` | Detalhes de um lead + conversas vinculadas |
| GET | `/api/leads/aguardando-humano?dias=7` | Leads que pediram contato humano ou plano B ativado |
| GET | `/api/clientes/destaque?dias=7` | Clientes NPL que pediram contato com advogado (card destaque) |
| PUT | `/api/leads/:id` | Atualizar lead — sincroniza titulo de todas as conversas vinculadas. Se etapa vira `cliente`, envia msg premium automaticamente |
| GET | `/api/metricas` | Leads por etapa, conversas ativas |
| GET | `/api/agendamentos?dias=30` | Lista consultas do Google Calendar |
| POST | `/api/agendamentos/manual` | Agendar consulta manualmente `{phone, nome, data, hora, formato, usuario_nome}` |
| GET | `/api/analytics?dias=30` | Funil de conversão, A/B testing, scoring |
| GET | `/api/relatorio-semanal` | Dados do relatório semanal |
| GET | `/api/documentos/auditoria/:phone` | Mídias recebidas de um telefone |
| POST | `/api/enviar` | Enviar texto via WhatsApp `{phone, message, conversaId, usuario_nome}` |
| POST | `/api/enviar-audio` | Enviar áudio `{phone, audioBase64, conversaId, usuario_nome}` |
| POST | `/api/enviar-arquivo` | Enviar arquivo `{phone, fileUrl, fileName, mediaType, conversaId, usuario_nome}` |
| POST | `/api/pausar` | Pausar IA `{phone, minutes}` |
| POST | `/api/retomar` | Retomar IA `{phone}` |
| POST | `/api/chat` | Proxy Claude para CRM `{system, messages}` |
| POST | `/api/documentos/analisar` | Analisar doc via Claude Vision |
| POST | `/api/documentos/organizar` | Organizar docs `{phone, nome, tese}` |
| POST | `/api/documentos/cobrar` | Cobrar docs `{phone, nome, auditoria}` |
| POST | `/api/relatorio-semanal` | Disparar relatório |
| GET | `/api/pausar/status?phone=X` | Verificar se IA está pausada para um telefone |
| GET | `/api/dias-nao-uteis` | Listar feriados/enforcados futuros |
| POST | `/api/dias-nao-uteis` | Adicionar dia não útil `{data, tipo, descricao}` |
| DELETE | `/api/dias-nao-uteis/:id` | Remover dia não útil |
| POST | `/api/recuperar-vacuo` | Dispara Laura para leads sem resposta |
| POST | `/api/verbas/calcular` | Estimativa de verbas rescisórias CLT |
| POST | `/api/feedback` | Registra 👍/👎 do CRM |
| GET | `/api/feedback?dias=30` | Lista feedbacks recentes |
| GET | `/api/analise/conversoes?dias=30` | Compara leads cliente vs perdido |
| GET | `/api/relatorio/advogadas?dias=30` | Consultas por colaboradora + taxa de fechamento |
| GET | `/api/analise/horarios?dias=30` | Heatmap mensagens/hora × dia da semana |
| GET | `/api/analise/origens?dias=30` | Leads por origem + taxa de conversão |
| GET | `/api/auditoria?dias=7&acao=read&recurso=lead&usuario=X` | Log de acesso a dados sensíveis |
| POST | `/webhook/zapi` | Webhook da Laura (processa com IA) |
| POST | `/webhook/zapi-escritorio` | Webhook do escritório (só salva, sem IA) |

## Banco de Dados (Supabase — compartilhado com CRM)

### Tabelas principais

**leads** — dados dos leads
- `id`, `nome`, `telefone`, `email`, `escritorio` ('npl'), `instancia`
- `etapa_funil`: novo → contato → agendamento → documentos → cliente / perdido
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
- `media_url`, `media_type` (audio/image/document/video)
- `manual` (bool), `usuario_nome`, `criado_em`

**metricas** — eventos rastreados
- `id`, `conversa_id`, `lead_id`, `evento`, `detalhes`, `escritorio`, `criado_em`
- Eventos: primeiro_contato, lead_quente, consulta_agendada, followup_2h, followup_4h, followup_24h, followup_72h, etapa_avancou, objecao, alucinacao_detectada, feedback_mensagem, prazo_prescricional, auditoria_acesso, lembrete_*, pediu_humano, cliente_salvo, cliente_pediu_advogado

**dias_nao_uteis** — feriados adicionais, enforcados, férias da equipe
- `id`, `data` (YYYY-MM-DD), `tipo` (enforcado/feriado/ferias), `descricao`, `escritorio`

**tarefas** — tarefas do CRM
**aprendizados** — lições aprendidas pela IA
**npl_clientes_processos** — base de clientes antigos (importada)

## Modelo de IA
- **Claude Sonnet 4** (claude-sonnet-4-20250514) — modelo principal para conversas
- MAX_TOKENS: 800 (respostas objetivas)
- Janela de contexto: 150 mensagens enviadas ao Claude
- Ficha do lead: 40 mensagens anteriores resumidas
- trimResponse: máx 8 frases

## Primeiro Contato (programático — não depende da IA)
Quando um lead manda a primeira mensagem, o servidor envia **2 msgs** e para. Laura só responde quando o lead responder.

1. **Apresentação** (servidor): Laura se apresenta como IA + explica que pode errar + pede nome completo. Tudo numa mensagem.
2. **Credibilidade** (servidor): "Enquanto aguardo sua resposta, quero que você conheça o escritório..." + OAB + link https://npladvogados.com.br

Laura IA **NÃO responde no primeiro contato** — aguarda lead mandar nome. Abordagem mais leve pro público humilde/desconfiado.

Race protection: `primeiroContatoEnviado` Set impede duplicação quando lead manda msgs rápidas.

## Módulos de inteligência da Laura
- `teses.js`: detecta tipo de caso e injeta contexto técnico + perguntas de aprofundamento
- `objecoes.js`: detecta 7 tipos de objeção e injeta estratégia de resposta
- `verbas.js`: calculadora CLT de rescisão
- `prescricao.js`: alerta sobre prazo de 2 anos (ok/atenção/urgente/prescrito)
- `alucinacao.js`: pós-análise das respostas (promessas fora da política); severidade alta notifica Dr. Osmar
- Resumo automático do caso: após agendar, Claude gera resumo executivo salvo em `leads.notas`
- Auditoria: acesso a dados sensíveis registra evento `auditoria_acesso`

## Plano B — Desconforto do Lead
Quando Laura detecta desconforto (respostas curtas "hm/sei/ok", monossílabos, tom hostil, desconfiança), ela oferece encaminhar pra equipe:
- Reconhece o desconforto com empatia
- Explica que é IA criada pelo escritório pra atender todo mundo
- Oferece colocar em lista prioritária pra advogado responder
- Se lead aceitar, sistema pausa IA e rastreia evento `pediu_humano`
- Frases-gatilho detectadas na resposta: "lista prioritária", "equipe vai te responder", "já estou avisando"
- Aparece no card "Aguardando Humano" do dashboard via `/api/leads/aguardando-humano`

## Atendimento Premium — Clientes NPL
Quando lead vira **cliente** (botão "Salvar Cliente" no CRM → `PUT /api/leads/:id` com `etapa_funil: cliente`):
- Servidor envia msg premium automaticamente: "Bem-vindo(a)! Atendimento prioritário..."
- Rastreia evento `cliente_salvo`
- Laura muda tom: mais próximo e caloroso, trata como cliente, não refaz triagem
- Na primeira interação como cliente, Laura vende o diferencial tecnológico:
  > "[nome], agora que você é cliente, quero te contar uma coisa especial. O NPLADVS é apaixonado por tecnologia e quer oferecer o melhor de IA — por isso o escritório me desenvolveu usando tecnologia de ponta do Claude AI. Posso ser sua assistente pessoal no dia a dia! Dúvidas, documentos, perguntas sobre processo. Por ser IA, posso errar — revise e tome suas decisões. Se quiser falar com advogado, é só avisar."
- Cliente pode usar Laura como assistente pessoal: dúvidas trabalhistas, análise de documentos, cálculos, orientações sobre audiência
- Quando cliente pede advogado → Laura destaca conversa, pausa IA 2h, rastreia `cliente_pediu_advogado`
- Aparece no card "Clientes NPL" do dashboard via `/api/clientes/destaque`

## Agendamento (Google Calendar)
- Horários válidos: 9h, 10h, 11h, 14h, 15h, 16h (seg-sex). **12h, 13h, 17h, 18h NÃO existem**.
- Detecção: exige "Agendado!" no início da resposta da Laura + dia + hora
- Slot extraído APENAS da resposta da Laura (nunca do texto do lead — evita capturar datas mencionadas em outro contexto)
- Fallback: `construirSlotDeTexto` parseia dia+hora direto da confirmação quando `encontrarSlot` falha
- Anti-duplo: verifica metricas (30 dias) + Google Calendar + agendamentoLock Set
- Bloqueios: prefeitura/governo verificados nas 2 últimas msgs do lead (não histórico inteiro)
- Referência: "já está agendada" não dispara novo evento
- Remarcação: exige palavras específicas (remarcar/mudar/trocar + consulta/horário), cancela antigo + cria novo. Se cancel falhar, alerta Osmar.
- Reserva: 20 minutos por slot (`slotsReservados` Map)
- Rodízio: Dra. Luma, Dra. Sophia, Luiza — desempate aleatório (não enviesa)
- Luiza: seg/qua/qui manhã, ter/sex tarde
- Conflict check: qualquer evento não-cancelado no Calendar bloqueia (não só "Consulta Trabalhista")
- `dias_nao_uteis`: tabela do Supabase verificada ao gerar slots (enforcados, férias da equipe)
- Cache de horários: 5 minutos, só popula quando sem phoneAtual
- Year rollover: "02/01" em dezembro cria corretamente em janeiro do próximo ano
- Funil: ao criar consulta, lead move para etapa `agendamento` (não regride documentos/cliente)
- Endpoint manual: `POST /api/agendamentos/manual` — CRM pode agendar direto

## Lembretes de Consulta (persistidos em metricas)
- 48h antes: cobrança de documentos
- 24h antes: confirmação
- 08h matinal: lembrete do dia
- 1h antes: lembrete
- 30min antes: lembrete final
- +2h depois: re-engajamento no-show (só se lead NÃO respondeu após a consulta)
- Dedup: persistido em metricas (evento `lembrete_<chave>`) — sobrevive a deploys
- Instância: cada lembrete usa `consulta.origem` (escritório ou prospecção) para enviar pelo número correto

## Follow-ups (automáticos, 8h-20h Belém)
- 2h, 4h, 24h, 72h sem resposta do lead
- Contador usa eventos `followup_Xh` em metricas (não conta msgs programáticas como follow-ups)
- 72h marca lead como `perdido`
- Não se aplica a leads em etapa `agendamento`, `documentos`, `cliente` ou `perdido`
- Proteção extra: verifica `consulta_agendada` em metricas antes de enviar

## Extração de Nomes
- **pushName do WhatsApp**: emojis removidos, cargos/empresas filtrados
- **Mensagem do lead**: padrões "me chamo X", "sou X", nome completo em linha isolada
- **Upgrade automático**: nome com mais palavras E mais longo sobrescreve o atual (ex: pushName "Leo" → "Leonardo Silva de Souza"). Edição manual no CRM fica protegida.
- **Proteção**: não sobrescreve nomes editados manualmente no CRM
- **Título da conversa**: sincroniza quando lead ganha nome real; atualiza se pushName muda
- **Filtro de falsos positivos**: palavrasComuns + verbos conjugados rejeitados
- **Horário comercial**: leads que chegam no horário comercial também têm nome extraído (antes ficavam como "WhatsApp")
- **Default da conversa**: nova conversa nasce com título = telefone formatado (ex: "(91) 8630-9184"), nunca mais "WhatsApp" genérico

## Captura de Mensagens Multi-Device
### Z-API (fromMe)
- Mensagens enviadas pelo celular/WhatsApp Web chegam via webhook `fromMe=true`
- Phone pode vir como `@lid` (Multi-Device privacy) — resolvido via cache `lidPhoneMap`
- Cache populado apenas de msgs incoming (fromMe=false) — impede cache poisoning
- Resolução fallback: match por chatName nas conversas (com normalização de acentos)
- Dedup: `wasBotRecentSend` (60s) + `processedMessages` Map (TTL 30min por entrada) + conteúdo ±5min (cobre echoes lentos do Z-API que chegam 2-3min depois do envio)

### Datacrazy (Cloud API)
- Equipe usa Datacrazy (WhatsApp Cloud API) para atendimento — pipeline separada da Z-API
- Polling a cada 15s: busca 10 conversas mais recentes, filtra msgs enviadas desde último sync
- Dedup: conteúdo + prefix (50 chars) em janela de ±3 minutos
- Requer variável `DATACRAZY_API_TOKEN` no Render

## Equipe do escritório NPLADVS
- Sócios: Dr. Osmar Neves, Dr. Bruno Pinheiro, Dr. Rodrigo Lins
- Advogadas associadas: Dra. Luma Prince, Dra. Sophia Marineli
- Estagiária: Luiza
- Se alguém mencionar um desses nomes, Laura trata como cliente existente em tratativa

## Feriados reconhecidos automaticamente (2025-2027)
Nacionais + Estadual PA + Municipais Belém (hardcoded em calendar.js).
Para feriados adicionais, enforcados e férias da equipe, use a tabela `dias_nao_uteis` (verificada ao gerar slots E no fallback construirSlotDeTexto).

## Bloqueios automáticos
- Prefeitura/governo municipal → não agenda (verifica só 2 últimas msgs + atual, não histórico inteiro)
- Servidor público → pede confirmação
- Prescrição > 2 anos → não agenda
- Lead sem interesse → encerra
- **Trabalhador rural = CLT = ATENDE** (não confundir com governo)
- **Vínculo curto NÃO é bloqueio** — Laura explora o caso com perguntas direcionadas; se lead quiser consulta, oferece (advogado avalia viabilidade econômica)

## Multi-instância Z-API
**Número 01 — Escritório** (ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN)
- Laura silenciosa durante horário comercial (seg-sex 8h-18h Belém) — mas CRIA lead, sincroniza título, extrai nome e salva mídia
- Laura ativa à noite, fins de semana e feriados
- Equipe atende durante o dia pelo CRM/Datacrazy

**Número 02 — Prospecção** (ZAPI_INSTANCE_ID_PROSPECCAO, ZAPI_TOKEN_PROSPECCAO, ZAPI_CLIENT_TOKEN_PROSPECCAO)
- Laura ativa 24/7
- Foco em prospecção de leads

## Áudio (ElevenLabs)
- Áudio só quando lead envia áudio (não em follow-ups/lembretes)
- **ElevenLabs only**: fallback OpenAI TTS foi desativado (voz robótica rejeitava leads)
- Sem crédito ElevenLabs = sem áudio (só texto)

## Caches em memória (server.js)
| Cache | Tipo | Cleanup | Propósito |
|-------|------|---------|-----------|
| `processedMessages` | Map<id,ts> | TTL 30min por entrada | Dedup webhook Z-API |
| `pausedConversas` | Map<phone,until> | 10min sweep | Pausa da IA |
| `agendamentoLock` | Set<phone> | try/finally | Anti-race agendamento |
| `primeiroContatoEnviado` | Set<phone> | Cap 1000 | Anti-race apresentação |
| `lidPhoneMap` | Map<lid,phone> | Cap 5000 | @lid → telefone |
| `jaNotificouHot` | Set<phone> | Cap 1000 | Notificação de lead quente |
| `clientesConfirmados` | Map<phone,obj> | 7 dias / 6h sweep | Clientes antigos confirmados |
| `lembretesCache` | Map<chave,ts> | 7 dias / 1h sweep | Otimização dedup lembretes (source of truth = metricas) |
| `slotsReservados` | Map<iso,obj> | 5min sweep | Reserva 20min de slots oferecidos |

## Configuração
Variáveis de ambiente no Render:
- `API_KEY` — autenticação dos endpoints POST
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`
- `SUPABASE_URL`, `SUPABASE_KEY`
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `ZAPI_INSTANCE_ID_PROSPECCAO`, `ZAPI_TOKEN_PROSPECCAO`, `ZAPI_CLIENT_TOKEN_PROSPECCAO`
- `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_CREDENTIALS`
- `OSMAR_PHONE`, `ALLOWED_ORIGINS`
- `DATACRAZY_API_TOKEN` — token Bearer da API Datacrazy (polling mensagens)
- `DATACRAZY_SYNC_INTERVAL_SECS` (default: 15) — intervalo do polling
- `OFFICE_BUSINESS_HOURS_START` (default: 8), `OFFICE_BUSINESS_HOURS_END` (default: 18)
