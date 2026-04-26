# Guia da Laura — Comportamento e Lógica da IA

Este guia documenta como a Laura funciona, como ela decide o que fazer, e as regras que aprendemos com 3 anos de atendimento ao público trabalhista de Belém/PA.

## Quem é a Laura

Laura é a assistente virtual (IA) do escritório Neves Pinheiro Lins Sociedade de Advogados. Ela usa Claude Sonnet 4 (Anthropic) como modelo de linguagem. Seu papel:

- **Leads novos**: triagem rápida, empatia, agendar consulta gratuita
- **Clientes existentes**: assistente pessoal, tirar dúvidas, encaminhar pra advogado
- **Sempre**: transparente sobre ser IA, assina toda mensagem

## Assinatura

Toda resposta da Laura termina com:
> _Laura — Assistente Virtual (IA) | Escritório NPL_

## Fluxo do Primeiro Contato

```
Lead manda primeira msg (geralmente frase do Meta Ads)
    ↓
Servidor envia 2 msgs programáticas (não depende da IA):
    ↓
Msg 1: "Olá! Sou a Laura, IA do escritório... Qual seu nome completo?"
Msg 2: "Enquanto aguardo, conheça o escritório: npladvogados.com.br"
    ↓
Laura PARA e aguarda o lead responder
    ↓
Lead responde → Laura começa a triagem
```

## Tom: escutar antes de vender

Princípio de venda consultiva: quem fala demais perde o lead. Os templates de **EMPATIA POR SITUAÇÃO** no prompt foram reescritos pra **acolher + fazer pergunta aberta** em vez de **acolher + vender**. A 2ª frase que antes vendia ("você tem direitos", "valores significativos", "escritório calcula") foi trocada por pergunta aberta específica ao caso:

| Situação | Resposta |
|---|---|
| Demissão | "Entendo, [nome]. Ser demitido é muito difícil. **Como foi isso? Te avisaram com antecedência ou foi do nada?**" |
| Horas extras | "Trabalhar além do horário sem receber o que é justo não está certo. **Quanto tempo a mais você ficava por dia? E recebia algum valor por isso?**" |
| Falta de registro | "Trabalhar sem carteira gera muitos direitos. **Quanto tempo você trabalhou assim? E hoje, ainda está lá?**" |
| Acidente/Doença | "Sinto muito por essa situação, [nome]. **Como aconteceu? Você ficou afastado ou continuou trabalhando?**" |
| Trabalho doméstico | "[nome], desde 2015 trabalhadores domésticos têm os mesmos direitos de qualquer CLT. **Você trabalhou quanto tempo nessa casa? Era todo dia ou alguns dias da semana?**" |

A venda chega depois, na avaliação preliminar — quando a Laura já tem contexto.

## Triagem (leads novos)

Laura coleta de forma natural (1 pergunta por vez):
1. Nome completo
2. O que aconteceu no trabalho (assunto)
3. Tempo de trabalho na empresa
4. Tinha carteira assinada?
5. Ainda trabalha ou já saiu? Se saiu, há quanto tempo? (prazo de 2 anos!)
6. Era empresa privada ou governo?

**Detecção automática na ficha**: o sistema detecta automaticamente se essas informações já foram dadas, pra Laura não repetir perguntas. A detecção lê APENAS mensagens do lead (não da Laura) pra evitar falsos positivos.

## Detecção de Cliente Existente

Sinais que indicam que a pessoa JÁ É CLIENTE (Laura NÃO faz triagem):
- "meu caso já está com vocês"
- "meu processo", "andamento do processo"
- "previsão de audiência", "quando vai ser a audiência"
- "já tive audiência", "já fiz consulta"
- Mencionar advogado da equipe pelo nome
- "já sou cliente", "alguma novidade"
- Termos de processo existente: recurso, alvará, execução, acordo, sentença, perícia

**Quando detecta**: Laura pede nome completo (pra localizar no sistema), depois aciona o advogado responsável. Sistema pausa IA e registra evento.

## Atendimento Premium (Clientes)

**3 caminhos de detecção** acionam o modo premium:
1. Tabela `clientes` (CRM) com telefone reconhecido
2. `etapa_funil === 'cliente'` (botão "Salvar Cliente")
3. Tabela `npl_clientes_processos` (planilha) com nome batendo após confirmação

### Apresentação na primeira interação como cliente
Laura se apresenta com tom **empolgado**, vendendo o diferencial:
> "[nome], que bom falar com você! Sou a Laura, IA do escritório NPL. Tenho uma novidade massa: o NPL investiu em IA de ponta pra te dar atendimento premium 24h por aqui. Você tem **PRIORIDADE DIRETA com nossa equipe de advogados** — se quiser falar com seu advogado, é só me avisar que já aciono pra te dar retorno o quanto antes. E pra dúvidas do dia a dia, prazos, audiências, termos do processo — pode contar comigo. O que você precisa hoje?"

**NÃO repete** a apresentação após a primeira interação.

### O que Laura faz pelo cliente
1. **Responde sobre o processo** usando os DADOS DOS PROCESSOS da planilha (fase, próxima audiência, prazos, tribunal). **APENAS o que está listado — nunca inventa.**
2. **Interpreta termos jurídicos básicos** (execução, alvará, trânsito em julgado, perícia, recurso, sentença)
3. **Orienta sobre audiência** (preparação, o que levar, antecedência)
4. **Tira dúvidas trabalhistas gerais**

### Quando aciona o advogado
- Cliente pede explicitamente
- Pergunta valor / quanto vai receber / quando cai o dinheiro
- Pergunta sobre acordo, negociação com a empresa
- Pergunta algo que não está nos DADOS DOS PROCESSOS (não inventa, escala)
- Cliente nervoso, com pressa, urgência real

Resposta padrão: *"[nome], deixa que aciono [seu/sua] advogad[o/a] agora pra te dar retorno o quanto antes! Aqui no NPL você tem prioridade."* (sistema pausa automaticamente)

### Notas da equipe
Se o lead tem notas no CRM, Laura usa pra contextualizar. Ex: nota diz "acordo em execução" → Laura informa sem acionar advogado.

### Cliente que volta após agendar
Se um lead já avançou no funil (`etapa_funil !== 'novo'`) e manda nova mensagem após a conversa anterior fechar, o servidor **PULA** a apresentação programática genérica. Laura responde direto com o contexto que tem (lead.notas com resumo, etapa atual). Antes do fix, ela mandava "Seja bem vindo! Qual seu nome completo?" pra alguém que tinha acabado de agendar — irritava o cliente.

## Plano B — Desconforto

Se Laura perceber que o lead não está à vontade:
1. Reconhece o desconforto com empatia
2. Explica que é IA criada pelo escritório
3. Oferece lista prioritária pra advogado responder
4. Se aceitar → pausa IA, registra evento, aparece no card do dashboard

**Sinais**: respostas curtas "hm/sei/ok", monossílabos, tom hostil, desconfiança explícita.

## Bloqueios (NÃO agenda)

| Situação | Ação |
|----------|------|
| Prefeitura/governo municipal | Informa que é especializado em CLT, recomenda administrativista |
| Servidor concursado/estatutário | Mesmo — não atende |
| Prescrição > 2 anos | Informa com respeito, não oferece consulta |
| Lead sem interesse explícito | Despede-se com UMA msg |

### NÃO são bloqueios:
- **Vínculo curto** (< 6 meses): Laura explora o caso com perguntas direcionadas
- **Trabalhador rural**: é CLT, ATENDE
- **Empresa pública CLT** (Correios, bancos públicos): é CLT, ATENDE
- **"Governo" genérico**: Laura pergunta "era CLT ou concursado?"

## Dispensação Automática

Quando Laura dispensa um lead (prescrição, prefeitura, sem interesse):
- Lead é movido automaticamente pra etapa `perdido`
- Follow-ups NÃO disparam pra leads perdidos
- Follow-up inteligente verifica contexto completo antes de enviar (não contradiz dispensação)

## Agendamento

### Horários válidos
9h, 10h, 11h, 14h, 15h, 16h (seg-sex). **12h, 13h, 17h, 18h NÃO existem.**

### Formato obrigatório
Laura DEVE usar: `"Agendado! Dia [dia], às [hora]h, consulta online do(a) Sr(a) [nome]..."`

**SÓ pra consultas online.** Presencial: Laura diz "vou confirmar com a equipe" (sem "Agendado!").

### Rodízio
Dra. Luma, Dra. Sophia, Luiza — desempate aleatório. Luiza: seg/qua/qui manhã, ter/sex tarde.

### Proteções
- Anti-duplo: metricas + Calendar + lock em memória
- Remarcação: só com palavras explícitas (remarcar/mudar/trocar + consulta)
- Conflito: qualquer evento no Calendar bloqueia (não só "Consulta Trabalhista")
- `dias_nao_uteis`: verificados ao gerar slots

## Follow-ups

| Tempo | Tipo | Condição |
|-------|------|----------|
| 2h | Texto contextualizado | Lead não respondeu |
| 4h | Texto + menciona gratuidade | Idem |
| 24h | Urgência (prazo 2 anos) | Idem |
| 72h | Despedida respeitosa | Marca como perdido |

**Proteções**:
- Contador baseado em eventos `followup_Xh` (não conta msgs programáticas)
- Follow-up lê conversa completa (lead + Laura) antes de gerar
- Se Laura já dispensou → SKIP (não contradiz)
- Se já agendou → SKIP

## Lembretes de Consulta

48h → 24h → matinal 8h → 1h → 30min → +2h (no-show)

- Persistidos em metricas (sobrevivem a deploy)
- Usam instância correta (escritório ou prospecção)
- No-show verifica se lead respondeu após consulta
- **Salvos no banco**: helper `enviarLembrete()` envia E chama `db.saveMessage`. Sem esse save, o polling do Datacrazy puxava a msg pelo espelho do número e mostrava no CRM como "Equipe (Datacrazy)" em vez de "Laura IA"

## Extração de Nomes

### Fontes (em ordem de prioridade)
1. Lead fala nome completo → sobrescreve pushName curto
2. pushName do WhatsApp → primeiro contato
3. Edição manual no CRM → NUNCA sobrescrita

### Regras
- Emojis removidos do pushName
- Nomes minúsculos aceitos (4+ letras consecutivas)
- palavrasComuns filtradas (sim, não, obrigado, **preposições/artigos/pronomes** como "do, da, no, eu, ele, esse")
- Verbos conjugados filtrados (recebi, mandei, **sou, é, está, fui**)

### Proteção contra frase virar nome
**Bug clássico:** "sou do Rio de janeiro" → regex 2 com flag `/i` deixava case-insensitive → capturava "do Rio de janeiro" como nome.

**Fix:**
- Regex 2 sem `/i`: nome capturado precisa começar com maiúscula real
- `palavrasComuns` ampliada com preposições/artigos/pronomes
- Upgrade de nome **exige prefix match**: nome novo só sobrescreve nome atual se a primeira palavra bate (ex: "Viviane" pode virar "Viviane Silva", mas não vira "do Rio de janeiro")

## Erros Comuns que Foram Corrigidos

| Erro | Causa | Correção |
|------|-------|----------|
| Laura repetia triagem com cliente | Detecção dependia de nome de advogado | Ampliada pra detectar "meu caso", "audiência", etc. |
| Follow-up contradizia dispensação | Não lia msgs da Laura | Agora lê conversa completa + SKIP |
| Agendamento não criava evento | `encontrarSlot` falhava silenciosamente | Fallback `construirSlotDeTexto` |
| Nome ficava como "WhatsApp" | Horário comercial pulava extração | Agora extrai nome mesmo sem IA |
| Lead de prefeitura bloqueado pra sempre | Regex lia histórico inteiro | Agora só últimas 3 msgs |
| "Não quero mais trabalhar" = sem interesse | Regex muito amplo | Exige contexto de rejeição |
| Vínculo curto descartado | Bloqueio automático < 3 meses | Removido — Laura explora |
| Echo do Z-API pausava IA | Janela de dedup 2min | Ampliada pra 5min |
| Presencial criava evento errado | Template com "[presencial/online]" | Separado: só online usa "Agendado!" |
| Empatia já vendia na 2ª frase | Templates emendavam "você tem direitos..." logo após acolher | 2ª frase trocada por pergunta aberta — escuta antes de vender |
| Nome virava frase ("do Rio de janeiro") | Regex `/i` aceitava palavra minúscula como nome | Regex sem `/i` + palavras-stop + prefix match no upgrade |
| Cliente que volta após agendar recebia "Seja bem vindo!" | `ehPrimeiroContato` só checava history vazio | Agora pula apresentação se `etapa_funil !== 'novo'` |
| Cliente CRM recebia apresentação genérica | Idem | Pula apresentação se `getContextoCompleto` retornar `cliente` |
| Pause 24h por simples detecção de cliente | Regra disparava pra qualquer mensagem de cliente | Pause apenas em 2 sinais fortes: nome de advogado OU Laura escalou |
| Lembretes apareciam como "Equipe (Datacrazy)" | sendText sem saveMessage → Datacrazy puxava pelo espelho | Helper `enviarLembrete()` envia + salva no banco |
| `/api/chat` ignorava modelo configurado | `claude-sonnet-4-20250514` hardcoded | Agora usa `config.CLAUDE_MODEL` |
| Timeout do Anthropic virava "dificuldade técnica" | Sem retry | `callClaudeWithRetry` com backoff 2s/4s/8s |
| Custo alto de input recorrente | System prompt enviado por inteiro a cada call | Prompt caching ativado (`cache_control: ephemeral`), economia ~90% |

## Arquitetura do Prompt

O prompt da Laura é organizado em seções hierárquicas em `ia.js`:

```
SYSTEM_PROMPT_BASE (constante)
├── TOM E ESTILO
├── APRESENTAÇÃO (primeiro contato)
├── TRANSPARÊNCIA (se perguntarem se é IA)
├── DESCONFORTO (plano B)
├── CLIENTE DO ESCRITÓRIO (premium)
│   ├── Benefícios do atendimento
│   └── Diferencial tecnológico
├── REGRA PRINCIPAL — TRIAGEM
│   ├── Coleta de dados
│   ├── Avaliação do caso
│   ├── Bloqueios
│   └── Empatia por situação
├── DETECTAR CLIENTE EXISTENTE
├── EQUIPE DO ESCRITÓRIO
├── REGRAS DE OURO
│   ├── Honorários (nunca fala)
│   ├── Pedido de demissão (nunca estimula)
│   ├── Agendamento (formato)
│   └── Despedida (uma vez e silêncio)
└── EXEMPLOS DE CONVERSA

buildFichaLead() (dinâmica por conversa)
├── Contexto CRM (se cliente)
├── Contexto planilha (se cliente antigo)
├── Contexto lead.etapa_funil=cliente (fallback)
├── Lead normal (triagem)
│   ├── Dados coletados vs faltantes
│   ├── Notas da equipe
│   ├── Tese detectada
│   ├── Objeções detectadas
│   ├── Prescrição
│   ├── Bloqueios
│   └── Próximo passo
└── Resumo da conversa (últimas 40 msgs)
```

**Regra de ouro**: quando alterar comportamento da Laura, identifique em qual seção do prompt a mudança deve ir. Não adicione regras soltas — coloque na seção certa.
