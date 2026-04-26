# Servidor NPL - Laura (Assistente Virtual)

## Visão Geral
Servidor Node.js/Express que opera a Laura, assistente virtual do escritório Neves Pinheiro Lins Sociedade de Advogados (direito trabalhista, Belém/PA). Atende leads via WhatsApp (Z-API + Datacrazy Cloud API), faz triagem, agenda consultas (Google Calendar) e gerencia o funil de vendas.

## Integração com CRM
O CRM frontend (hospedado no GitHub Pages, repositório `npladvs-crm`) chama diretamente os endpoints deste servidor. **Este é o único backend** — não existe outro servidor para o CRM. Todas as chamadas do CRM vão para `https://servidor-npl.onrender.com`.

### Endpoints da API (TODOS requerem header `x-api-key`, exceto /api/health e webhooks)

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
- **Claude Sonnet 4** (claude-sonnet-4-20250514) — modelo principal para conversas (config.js)
- **Claude Haiku 4.5** — classificação/cobrança de documentos (documentos.js)
- **Claude Opus 4.7** — extração estruturada de PDF (documentos.js)
- MAX_TOKENS: 800 (respostas objetivas)
- Janela de contexto: 150 mensagens enviadas ao Claude
- Ficha do lead: 40 mensagens anteriores resumidas
- trimResponse: máx 8 frases
- **Prompt caching ativado** em `generateResponse` (ia.js): SYSTEM_PROMPT_BASE (~50KB) marcado com `cache_control: ephemeral`. Cache hit cobra 10% do input — economia ~90% em janelas de 5min (rajadas, follow-ups, lembretes consecutivos)
- **Retry exponencial** (`callClaudeWithRetry` em ia.js): 3 tentativas com backoff 2s/4s/8s. Erros permanentes (sem crédito, 4xx) pulam o retry. Aplicado em generateResponse, generateFollowUp, gerarResumoCaso
- **Proxy `/api/chat`** do CRM usa `config.CLAUDE_MODEL` (não mais hardcoded)

## Primeiro Contato (programático — não depende da IA)
Quando um lead **totalmente novo** manda a primeira mensagem, o servidor envia **2 msgs** e para. Laura só responde quando o lead responder.

1. **Apresentação** (servidor): Laura se apresenta como IA + explica que pode errar + pede nome completo. Tudo numa mensagem.
2. **Credibilidade** (servidor): "Enquanto aguardo sua resposta, quero que você conheça o escritório..." + OAB + link https://npladvogados.com.br

Laura IA **NÃO responde no primeiro contato** de lead novo — aguarda lead mandar nome. Abordagem mais leve pro público humilde/desconfiado.

### Apresentação programática é PULADA quando:
- **Telefone reconhecido como cliente do CRM** (tabela `clientes`) — Laura responde direto em modo premium pra não soar "esquecida"
- **Lead já avançou no funil** (`etapa_funil !== 'novo'`) — caso típico: lead agendou, conversa fechou, lead voltou pra mandar mais info → Laura responde com contexto (lead.notas tem o resumo) em vez de pedir nome de novo

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
**3 caminhos de detecção** (qualquer um aciona modo premium):
1. Tabela `clientes` (CRM) com telefone batendo em `getContextoCompleto`
2. `etapa_funil === 'cliente'` no lead (botão "Salvar Cliente" no CRM)
3. Tabela `npl_clientes_processos` (planilha de clientes antigos) com nome batendo após confirmação

Quando lead vira cliente via "Salvar Cliente" no CRM (`PUT /api/leads/:id` com `etapa_funil: cliente`):
- Servidor envia msg premium automaticamente: "Bem-vindo(a)! Atendimento prioritário..."
- Rastreia evento `cliente_salvo`

### Comportamento da Laura no modo premium (TODOS os 3 caminhos)
- Tom mais próximo e caloroso, trata como cliente, **não refaz triagem**
- Vende o diferencial: "**prioridade direta com a equipe de advogados NPL**" + "atendimento 24h via IA de ponta (Claude AI)"
- Na primeira interação como cliente confirmado:
  > "[nome], que bom falar com você! Sou a Laura, IA do escritório NPL. Tenho uma novidade massa: o NPL investiu em IA de ponta pra te dar atendimento premium 24h por aqui. Você tem PRIORIDADE DIRETA com nossa equipe de advogados — se quiser falar com seu advogado, é só me avisar que já aciono pra te dar retorno o quanto antes. E pra dúvidas do dia a dia, prazos, audiências, termos do processo — pode contar comigo. O que você precisa hoje?"
- **NÃO repete essa apresentação** após a primeira

### O que Laura faz pelo cliente
1. Responde dúvidas usando os DADOS DOS PROCESSOS da planilha (fase, próxima audiência, prazos, tribunal) — **APENAS o que está listado, nunca inventa**
2. Interpreta termos jurídicos básicos (execução, alvará, trânsito em julgado, perícia, etc)
3. Orienta sobre audiência (preparação, o que levar)
4. Tira dúvidas trabalhistas gerais

### Quando Laura aciona o advogado
- Cliente pede explicitamente
- Pergunta valor / quanto vai receber / quando cai o dinheiro
- Pergunta sobre acordo, negociação com a empresa
- Pergunta algo que não está nos DADOS DOS PROCESSOS (a Laura não inventa)
- Cliente nervoso, com pressa, urgência real
- Resposta padrão: *"[nome], deixa que aciono [seu/sua] advogad[o/a] agora pra te dar retorno o quanto antes! Aqui no NPL você tem prioridade."* (sistema pausa automaticamente)

### Notas da equipe
Campo `notas` do lead aparece em destaque na ficha como "NOTA DA EQUIPE SOBRE ESTE CONTATO". Laura usa pra contextualizar respostas (ex: "acordo em execução" → Laura informa sem precisar acionar advogado).

### Card no dashboard
- Cliente NPL pediu advogado → aparece em `/api/clientes/destaque`
- Lead pediu humano (Plano B) → aparece em `/api/leads/aguardando-humano`

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
- **Salvos no banco**: helper `enviarLembrete()` envia + chama `db.saveMessage`. Sem isso, o polling do Datacrazy puxava a msg pelo espelho do número e salvava com rótulo "Equipe (Datacrazy)" no CRM.

## Follow-ups (automáticos, 8h-20h Belém)
- 2h, 4h, 24h, 72h sem resposta do lead
- Contador usa eventos `followup_Xh` em metricas (não conta msgs programáticas como follow-ups)
- 72h marca lead como `perdido`
- Não se aplica a leads em etapa `agendamento`, `documentos`, `cliente` ou `perdido`
- Proteção extra: verifica `consulta_agendada` em metricas antes de enviar

## Extração de Nomes
- **pushName do WhatsApp**: emojis removidos, cargos/empresas filtrados
- **Mensagem do lead**: padrões "me chamo X", "sou X", nome completo em linha isolada
- **Upgrade automático**: nome com mais palavras E mais longo sobrescreve o atual (ex: pushName "Leo" → "Leonardo Silva de Souza"). **EXIGE prefix match**: a primeira palavra do nome novo precisa bater com a do atual (proteção contra "Viviane" virar "do Rio de janeiro"). Edição manual no CRM fica protegida.
- **Proteção contra frases capturadas como nome**:
  - Regex de "sou X" sem flag `/i` no nome capturado — exige que o nome comece com maiúscula real (evita "sou do Rio de janeiro" → "do Rio de janeiro")
  - `palavrasComuns` filtra preposições/artigos/pronomes na primeira palavra (do, da, no, eu, ele, esse, etc)
  - `verbosForma` filtra verbos comuns (sou, é, está, fui, etc)
- **Título da conversa**: sincroniza quando lead ganha nome real; atualiza se pushName muda
- **Nomes minúsculos**: "glacielnunesdasilva" (tudo junto, sem maiúscula) agora é aceito como nome real (4+ letras consecutivas)
- **Sync com tabela clientes**: quando nome muda via API, propaga para `leads.nome` + `conversas.titulo` + `clientes.nome_completo`
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
- **Detecção ampliada**: frases como "meu caso já está com vocês", "previsão de audiência", "andamento do processo" também identificam cliente existente (não só nome de advogado)

## Pause da IA (cirúrgica)
A IA é pausada por 24h apenas em **2 cenários fortes** (não mais por simples detecção de cliente):
1. Cliente menciona advogado pelo NOME (Dra. Luma, Dr. Osmar, etc) — sinal de tratativa direta
2. A própria Laura, na resposta, sinaliza escalonamento ("aciono seu advogado", "vou avisar a equipe", "destacando conversa")

Pedido genérico de humano continua tratado pelo Plano B (pause 2h + tracking de evento `pediu_humano`).

**Por que não pausa por simples detecção:** no modelo premium, a Laura ATENDE o cliente reconhecido (tira dúvidas do processo, interpreta termos jurídicos). Pausar logo na primeira interação travaria exatamente o atendimento que ela deveria estar fazendo.

## Assinatura da Laura
Toda resposta da Laura termina com:
> _Laura — Assistente Virtual (IA) | Escritório NPL_

## Documentação complementar
- `SECURITY.md` — segurança, autenticação, proteções, checklist de deploy
- `LAURA-GUIDE.md` — comportamento da IA, fluxos, regras aprendidas, arquitetura do prompt

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
- Sem crédito ElevenLabs = sem áudio (só texto), retenta após 24h automaticamente
- Proteção SSRF: `isUrlSegura()` bloqueia URLs internas/privadas antes de baixar áudio

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
