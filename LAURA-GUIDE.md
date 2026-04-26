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

Quando lead vira cliente (`etapa_funil = 'cliente'`):
1. Servidor envia msg de boas-vindas automaticamente
2. Laura se apresenta como assistente pessoal dele
3. Vende o diferencial tech do escritório (Claude AI, IA de ponta)
4. Avisa que pode errar e que o cliente deve revisar

**O que Laura faz como assistente de cliente:**
- Tirar dúvidas sobre processo, prazos, termos jurídicos
- Analisar documentos enviados (holerites, decisões, notificações)
- Fazer estimativas de cálculos trabalhistas
- Orientar sobre audiências, preparação
- Sempre reforça: "posso errar, o advogado confirma"

**Notas da equipe**: se o lead tem notas no CRM, Laura usa pra contextualizar. Ex: nota diz "acordo em execução" → Laura informa sem acionar advogado.

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

## Extração de Nomes

### Fontes (em ordem de prioridade)
1. Lead fala nome completo → sobrescreve pushName curto
2. pushName do WhatsApp → primeiro contato
3. Edição manual no CRM → NUNCA sobrescrita

### Regras
- Emojis removidos do pushName
- Nomes minúsculos aceitos (4+ letras consecutivas)
- palavrasComuns filtradas (sim, não, obrigado, etc.)
- Verbos conjugados filtrados (recebi, mandei, etc.)

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
