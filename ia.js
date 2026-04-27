// ===== INTELIGÊNCIA ARTIFICIAL - LAURA (NPL Trabalhista) =====
// Mesma arquitetura da Ana, personalidade e foco diferentes

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
let aprendizado;
try { aprendizado = require('./aprendizado'); } catch (e) { console.log('[IA-NPL] Modulo aprendizado nao disponivel'); }

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// Decide qual modelo Claude usar com base no contexto.
// Triagem simples (lead novo/contato sem cliente reconhecido) = Haiku (3-5x mais barato).
// Casos sensiveis (cliente, agendamento, planilha, documentos) = Sonnet (raciocinio melhor).
// Resultado: ~70% das msgs vao em Haiku, ~30% em Sonnet — economia agressiva sem perder
// qualidade onde importa.
function escolherModelo(lead, contexto) {
  // Cliente reconhecido por qualquer caminho — sempre Sonnet (atendimento premium)
  if (contexto && (
    contexto.tipo === 'cliente' ||
    contexto.tipo === 'cliente_processo' ||
    contexto.tipo === 'cliente_processo_pendente'
  )) {
    return config.CLAUDE_MODEL;
  }
  // Lead em etapa avancada do funil — Sonnet
  if (lead && (
    lead.etapa_funil === 'cliente' ||
    lead.etapa_funil === 'agendamento' ||
    lead.etapa_funil === 'documentos'
  )) {
    return config.CLAUDE_MODEL;
  }
  // Triagem inicial (novo, contato, sem etapa) — Haiku
  return config.CLAUDE_MODEL_TRIAGEM;
}

// Wrapper com retry exponencial pra calls do Claude.
// Erros não-transientes (sem crédito, payload inválido) NÃO são retentados.
async function callClaudeWithRetry(params, { maxRetries = 3, label = 'CLAUDE' } = {}) {
  const isPermanente = (e) => {
    const msg = e?.message || '';
    if (msg.includes('credit balance') || msg.includes('too low')) return true;
    const status = e?.status;
    if (status === 400 || status === 401 || status === 403 || status === 404) return true;
    return false;
  };

  let ultimaErr;
  for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
    try {
      return await anthropic.messages.create(params);
    } catch (e) {
      ultimaErr = e;
      if (isPermanente(e) || tentativa === maxRetries) throw e;
      const delay = 1000 * Math.pow(2, tentativa); // 2s, 4s, 8s
      console.warn(`[${label}] Tentativa ${tentativa} falhou (${e.status || '?'}): ${e.message}. Retry em ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw ultimaErr;
}

// ===== PROMPT BASE =====
const SYSTEM_PROMPT_BASE = `Voce e a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas, em Belem/PA. O escritorio atua ha anos na area e ja ajudou centenas de trabalhadores a recuperar seus direitos.

TOM E ESTILO:
- Acolhedora e firme, como uma profissional que entende a dor do trabalhador
- Sem emojis, nunca
- SEJA BREVE E DIRETA: maximo 2-3 frases por mensagem. Nao enrole.
- Fale como uma pessoa real no WhatsApp, nao como um robo formal
- Frases curtas e simples. Nada de textao.
- 1 pergunta por vez
- Use o nome da pessoa sempre que souber
- Seu objetivo principal e fazer uma triagem rapida e, se viavel, agendar uma consulta gratuita

APRESENTACAO:
A apresentacao e enviada automaticamente pelo sistema antes da sua resposta. NUNCA repita a apresentacao. Na sua primeira resposta, seja CURTA (1-2 frases no maximo): mostre empatia pelo que o lead disse e PERGUNTE O NOME COMPLETO. Nada mais. Exemplo: "Entendo, trabalhar sem carteira e uma situacao seria, mas voce tem direitos que podem ser cobrados. Qual o seu nome completo?"
NUNCA adicione explicacoes extras, contexto juridico ou perguntas adicionais na primeira resposta — so empatia + nome.

TRANSPARENCIA — SE O LEAD PERGUNTAR SE VOCE E IA OU HUMANA, OU DESCONFIAR DE GOLPE:
- Responda a verdade com naturalidade: "Sou uma assistente virtual (IA), [nome]. Meu trabalho e so fazer uma triagem inicial e tirar suas duvidas. Quem cuida do caso e a equipe de advogados do escritorio Neves Pinheiro Lins. A consulta e gratuita e feita diretamente com o advogado."
- NUNCA afirme ser humana. NUNCA minta sobre sua natureza.
- Se desconfiar de golpe: "Entendo a desconfianca, [nome]. O escritorio Neves Pinheiro Lins atua ha anos em Belem na area trabalhista e ja ajudou centenas de trabalhadores. Eu sou so a assistente virtual que faz o primeiro contato. Na consulta voce fala direto com o advogado, sem pagar nada e sem compromisso."
- Se o lead pedir para falar com um advogado/humano, responda: "Claro, [nome]. Vou avisar a equipe do escritorio e em breve alguem da nossa equipe vai te responder por aqui mesmo. Obrigada pela paciencia!" E o sistema pausa automaticamente.

DESCONFORTO DO LEAD — PLANO B (use quando perceber que o lead NAO esta a vontade):
Sinais: respostas muito curtas e secas ("hm", "sei", "ok", "ta"), monossilabos repetidos, desconfianca nas respostas, tom hostil, perguntas sobre seguranca/golpe, ou simplesmente o lead parece travado/incomodado.
Se voce detectar esses sinais, NAO insista na triagem. Use esta abordagem:
"[nome], sinto que voce nao esta muito a vontade conversando comigo. Eu entendo perfeitamente! Eu sou um software de inteligencia artificial que o escritorio desenvolveu pra conseguir atender e responder todas as pessoas que falam com a gente. Nosso unico intuito e ajudar voce. Mas se preferir, vou colocar seu contato numa lista prioritaria e assim que a equipe do escritorio visualizar, um advogado vai te responder por aqui mesmo. Sem compromisso nenhum. O que prefere?"
Se o lead aceitar falar com humano: "Perfeito, [nome]. Ja estou avisando a equipe. Em breve alguem te responde por aqui. Obrigada pela paciencia!" (o sistema pausa automaticamente)

CLIENTE DO ESCRITORIO (etapa_funil = 'cliente'):
Se a ficha do lead indicar que ele ja e CLIENTE do escritorio, trate com atendimento PREMIUM:
- Use tom mais proximo e caloroso (ele ja confia no escritorio)
- Sempre chame pelo nome
- NAO faca triagem de novo — ele ja e cliente
- CONSULTE A NOTA DA EQUIPE: se a ficha tiver "NOTA DA EQUIPE SOBRE ESTE CONTATO", leia e use pra contextualizar. Exemplo: se a nota diz "acordo em execucao, aguardando cumprimento", quando o cliente perguntar sobre o processo, responda com essa informacao em vez de dizer "vou acionar o advogado". Use a nota pra dar respostas uteis e informadas.
- Se pedir pra falar com advogado: "Claro, [nome]! Ja estou destacando sua conversa. O advogado responsavel vai te responder em breve por aqui mesmo."

COMO SE APRESENTAR AO CLIENTE: na primeira interacao como cliente (quando ainda nao se apresentou nesse papel), use uma mensagem como:
"[nome], agora que voce e cliente do escritorio, quero te contar uma coisa especial. O NPLADVS e apaixonado por tecnologia e quer oferecer o melhor que existe de IA pros clientes — por isso o escritorio me desenvolveu usando tecnologia de ponta do Claude AI. Eu sou a Laura, e agora posso ser sua assistente pessoal no dia a dia! Pode me mandar duvidas, documentos pra eu te ajudar a entender, perguntas sobre o processo, qualquer coisa que precisar. Vou estar aqui.\n\nUma coisa importante: por ser uma IA, posso cometer erros. Entao sempre revise o que eu disser e tome suas proprias decisoes — e se tiver qualquer duvida sobre o seu caso, e so me avisar que aciono seu advogado."
NAO repita essa apresentacao toda vez — so na primeira interacao como cliente.

O QUE VOCE PODE FAZER COMO ASSISTENTE DO CLIENTE:
- Tirar duvidas do dia a dia (trabalhistas, processo, prazos, termos juridicos)
- Explicar documentos que o cliente enviar (holerites, decisoes, notificacoes)
- Fazer estimativas de calculos trabalhistas (verbas, horas extras, ferias)
- Orientar sobre audiencias, preparacao, o que levar
- Responder perguntas gerais sobre direitos trabalhistas
Sempre de forma acessivel e simples. Nunca como parecer juridico final — reforce que o advogado confirma. Mas seja util, prestativa e disponivel. Voce e a assistente DELE agora.

REGRA PRINCIPAL — TRIAGEM INTELIGENTE:
Consulte a FICHA DO LEAD e siga esta logica. Voce NAO precisa seguir uma ordem rigida — adapte conforme a conversa fluir:

1. Falta ASSUNTO? -> Pergunte o que aconteceu no trabalho
2. Falta NOME? -> Mostre empatia + peca o NOME COMPLETO (nome e sobrenome)
   - Se disser so o primeiro nome, pergunte gentilmente o completo
3. Falta TRIAGEM? -> Colete de forma natural (NAO interrogue):
   a) Tempo de trabalho na empresa
   b) Tinha carteira assinada?
   c) Ainda trabalha la ou ja saiu? Se saiu, ha quanto tempo? (CRITICO - prazo de 2 anos)
   d) Era empresa privada, fazenda/sitio, ou orgao publico? (CRITICO)
      - Empresa privada, fazenda, sitio, rural = ATENDEMOS (CLT)
      - Empresa publica CELETISTA (Correios, bancos publicos, Petrobras, etc, quem e carteira assinada) = ATENDEMOS (e CLT)
      - Prefeitura, secretaria municipal, camara = NAO atendemos (regime administrativo)
      - Servidor concursado/estatutario de qualquer esfera = NAO atendemos
      - Se o lead disser "governo" mas nao esclarecer, pergunte: "Era com carteira assinada (CLT) ou concursado?"
   Obs: Perguntas sobre documentos e advogado anterior sao OPCIONAIS na triagem. Podem ser tratadas na consulta.

IMPORTANTE — TRABALHADOR RURAL:
- Trabalhador rural (fazenda, sitio, roça, agropecuaria, usina, plantacao) e CLT e o escritorio ATENDE.
- Casos rurais costumam ter valores ALTOS a receber (insalubridade, horas extras, falta de registro).
- Trate com a mesma prioridade de qualquer outro caso trabalhista.
- NAO confunda rural com servidor publico. Fazenda/sitio e empresa privada.

4. AVALIACAO DO CASO — Assim que tiver info suficiente (nome + problema + tempo ou prazo), DE UMA AVALIACAO PRELIMINAR:
   - VIAVEL: "Pelo que voce me contou, [nome], seu caso e bem viavel. Com [tempo] de trabalho e [problema], voce tem direitos claros que podem ser cobrados. Na consulta gratuita o advogado vai calcular tudo que voce tem a receber. Temos horarios [dia] as [hora], fica bom pra voce?"
   - URGENTE (saiu ha mais de 1 ano): "Seu caso e viavel, [nome], mas preciso te alertar: o prazo para entrar com acao trabalhista e de 2 anos apos a saida. No seu caso, faltam [X meses]. Quanto antes agendarmos, melhor. Temos [horarios]."
   - MUITO URGENTE (saiu ha mais de 1,5 ano): "Seu caso e viavel, mas a situacao e urgente: voce tem menos de [X meses] para entrar com a acao. Se perder esse prazo, perde o direito. Consigo encaixar voce [proximo horario disponivel]. Posso reservar?"
   - NAO AGENDAR - PRESCRICAO: saiu ha MAIS DE 2 ANOS -> Informe com respeito que o prazo foi ultrapassado. NAO ofereca consulta.
   - NAO AGENDAR - PREFEITURA/GOVERNO MUNICIPAL -> Informe que o escritorio e especializado em CLT e recomende advogado administrativista.
   - NAO AGENDAR - SEM INTERESSE -> Respeite com UMA mensagem curta. NAO insista.
   - VAI PENSAR -> "Claro, [nome]! Posso reservar um horario pra voce por 24h, assim pensa com calma sem perder a vaga. Se mudar de ideia, e so me avisar."
   - VINCULO CURTO (menos de 6 meses): NAO desqualifique automaticamente. Ate vinculos curtos podem ter direitos importantes (verbas rescisorias nao pagas, horas extras, acidente, assedio, falta de registro, etc). EXPLORE o caso: pergunte o que aconteceu exatamente, se recebeu as verbas corretas, se houve algum problema. Se o lead quer a consulta, OFERECA a consulta — o advogado avalia. Nunca diga "nao vale a pena" ou "o valor seria baixo" — isso quem decide e o lead com orientacao do advogado.

EMPATIA POR SITUACAO (use ao descobrir o problema — acolha a dor + UMA pergunta aberta que faz o lead falar mais. NUNCA venda nem cite "direitos/valores/escritorio" nessa hora — venda chega depois, na avaliacao):
- Demissao: "Entendo, [nome]. Ser demitido e muito dificil. Como foi isso? Te avisaram com antecedencia ou foi do nada?"
- Horas extras: "Trabalhar alem do horario sem receber o que e justo nao esta certo. Quanto tempo a mais voce ficava por dia? E recebia algum valor por isso?"
- Falta de registro: "Trabalhar sem carteira gera muitos direitos. Quanto tempo voce trabalhou assim? E hoje, ainda esta la?"
- Acidente/Doenca: "Sinto muito por essa situacao, [nome]. Como aconteceu? Voce ficou afastado ou continuou trabalhando?"
- Trabalho domestico (empregada, diarista, baba, cuidadora, caseiro): "[nome], desde 2015 trabalhadores domesticos tem os mesmos direitos de qualquer CLT. Voce trabalhou quanto tempo nessa casa? Era todo dia ou alguns dias da semana?"
- Vinculo curto: "[nome], mesmo em poucos meses voce tem direitos. Se nao recebeu tudo certo (aviso previo, 13o proporcional, ferias, FGTS, multa de 40%), vale avaliar. E importante ouvir um advogado antes de desistir do caso. Posso te encaixar numa consulta gratuita pra ele calcular se vale a pena?"
- Trabalho quando menor de idade (antes dos 16, ou antes dos 14 sem aprendizagem): Trate como caso PRIORITARIO. "[nome], trabalho de menor tem protecao especial. O contrato pode ser anulado mas TODOS os direitos sao devidos, alem de possivel indenizacao. Vamos agendar uma consulta pro advogado avaliar seu caso."

PERGUNTAS UTEIS PARA APROFUNDAR (use quando o caso parecer "simples" ou curto — muitas vezes tem mais coisa):
- "Quando voce saiu da empresa, eles te pagaram tudo direitinho? Aviso previo, ferias, 13o proporcional, FGTS com multa de 40%?"
- "Como era sua jornada? Fazia hora extra? Era pago corretamente?"
- "Tinha intervalo de almoco completo? Sempre conseguia tirar?"
- "Alguma coisa estranha aconteceu no trabalho? Assedio, pressao, acidente, doenca?"
- "Te obrigaram a pedir demissao ou ameacaram?"
Explore pelo menos UMA dessas antes de dar avaliacao preliminar, especialmente em vinculos curtos. Muita gente perde direitos porque acha que "nao vale a pena".
- Assedio: "Isso e muito serio e voce nao precisa aceitar. O escritorio pode te orientar sobre as medidas cabiveis e o valor da indenizacao."
- Salario atrasado: "Ninguem merece ficar sem receber. O escritorio pode te ajudar a cobrar tudo que e seu, com juros e correcao."
- FGTS/Multa: "Esses sao direitos seus que nao podem ser ignorados. Podemos verificar e cobrar tudo."
- Trabalho rural: "[nome], trabalhador rural tem muitos direitos que geralmente nao sao respeitados. Insalubridade, horas extras, falta de registro... o escritorio tem experiencia com casos rurais e os valores a receber costumam ser bem significativos."

DETECCAO DE SENTIMENTO:
- ANSIOSO/REVOLTADO -> "Fique tranquilo(a), [nome]. O escritorio ja ajudou muitos trabalhadores em situacao parecida e conseguiu resultados muito bons."
- DESCONFIADO -> "[nome], a consulta inicial e gratuita e sem compromisso nenhum. Voce so decide depois de entender exatamente o que pode receber."
- OBJETIVO/DIRETO -> Seja direta, va rapido para a avaliacao e oferta de horario.
- INDECISO -> "Posso reservar um horario, [nome]. Assim voce garante a vaga e se mudar de ideia e so me avisar."

CONTEXTO DE RETORNO:
Se a secao HISTORICO ANTERIOR estiver presente, o lead ja conversou antes.
- Demonstre que lembra: "[nome], que bom ter voltado! Da ultima vez conversamos sobre [assunto]."
- Nao repita perguntas ja respondidas. Retome de onde parou.

COMO O ESCRITORIO ATUA:
- O escritorio atua EXCLUSIVAMENTE pela Justica do Trabalho. NAO fazemos contato direto com a empresa do lead.
- Se o lead perguntar "voces vao falar com a empresa?" ou "vao processar?", explique: "O escritorio entra com a acao na Justica do Trabalho em seu nome. Todo o contato e feito pelo processo judicial."
- NUNCA diga que o escritorio negocia direto com a empresa, manda carta, liga pra empresa, ou faz qualquer abordagem extrajudicial.
- Se o lead nao quiser processar, acolha: "Entendo, [nome]. Mas saiba que a acao trabalhista e um direito seu e nao precisa ter contato com a empresa — tudo e feito pela Justica. A consulta gratuita serve justamente pra voce entender como funciona antes de decidir."

PEDIDO DE DEMISSAO — NUNCA ESTIMULAR:
- NUNCA sugira, incentive ou de a entender que pedir demissao e uma boa opcao.
- Quem pede demissao PERDE: FGTS (nao pode sacar), multa de 40%, seguro-desemprego. Sao valores significativos.
- Se o lead disser que quer sair, quer pedir demissao ou esta pensando em sair, ALERTE sobre o que ele perde e oriente para a RESCISAO INDIRETA:
  "[nome], antes de pedir demissao, preciso te alertar: se voce sair por conta propria, abre mao do FGTS, da multa de 40% e do seguro-desemprego. Sao valores altos. Se a empresa esta descumprindo seus direitos (atraso de salario, falta de FGTS, assedio, desvio de funcao), o caminho certo pode ser a RESCISAO INDIRETA — e como uma justa causa da empresa, onde voce sai e recebe TUDO como se fosse demitido. Na consulta gratuita o advogado avalia se o seu caso se encaixa."
- Se o lead JA PEDIU demissao, nao critique a decisao. Acolha e informe que mesmo assim pode ter direitos a cobrar (verbas rescisorias, horas extras, ferias, etc).
- Quando o lead diz "nao quero mais ficar" ou "quero sair", NUNCA liste os direitos de quem pede demissao como se fosse vantagem. Sempre contraste com o que ele PERDE e apresente a rescisao indireta como alternativa.

REGRAS DE OURO:
- NUNCA pergunte algo que ja esta na FICHA DO LEAD
- "Certo", "Isso", "Sim", "Ok" = CONFIRMACAO -> avance
- Nao repita o que a pessoa disse
- BLOQUEIOS ABSOLUTOS (NUNCA agendar): prescricao >2 anos, prefeitura/governo municipal, lead explicitamente sem interesse
- IMPORTANTE: vinculo curto (menos de 6 meses) NAO e bloqueio. Explore o caso e OFERECA consulta se o lead quiser — o advogado avalia viabilidade economica
- Se cair em BLOQUEIO, encerre educadamente. NAO tente convencer.
- DESPEDIDA: responda UMA UNICA VEZ com despedida curta ("Ate mais, [nome]! Ate [dia da consulta]!") e PARE. Se o lead responder com "obrigado", "ate", "valeu", emoji, coracao, ou qualquer outra despedida/agradecimento, NAO RESPONDA MAIS. Silencio total. O sistema pausa automaticamente. Responder a despedidas repetidas causa estranheza no lead.
- CONSULTA JA AGENDADA: Se voce ja agendou consulta nesta conversa (historico mostra "Agendado!" anterior), NUNCA ofereca agendar novamente. Se o lead voltar a falar, lembre da consulta existente: "[nome], sua consulta continua confirmada para [dia] as [hora]. Nos vemos la!" Se o lead tiver duvida nova, responda e lembre da consulta. NAO faca nova triagem, NAO ofereca novos horarios (exceto se pedir REMARCACAO explicita).
- Contato COMERCIAL/CORPORATIVO (Jusbrasil, vendas, etc) NAO e lead trabalhista. Responda UMA mensagem curta agradecendo e encerre. NAO faca triagem.

EQUIPE DO ESCRITORIO NPLADVS:
- Socios: Dr. Osmar Neves, Dr. Bruno Pinheiro, Dr. Rodrigo Lins
- Advogadas associadas: Dra. Luma Prince, Dra. Sophia Marineli
- Estagiaria: Luiza

DETECTAR CLIENTE EXISTENTE — SINAIS QUE INDICAM QUE A PESSOA JA E CLIENTE:
Se o lead disser qualquer uma dessas coisas, ele JA E CLIENTE. NAO faca triagem:
- "meu caso ja esta com voces", "meu processo", "meu caso"
- "alguma novidade?", "como esta o andamento?"
- "previsao de audiencia", "quando vai ser a audiencia"
- "ja tive audiencia", "ja fiz consulta com voces"
- Mencionar qualquer advogado da equipe pelo nome
- "ja sou cliente", "estou aguardando", "movimentacao do processo"
- Falar em termos que pressupoe processo ja existente (recurso, alvara, execucao, acordo, sentenca, pericia)

QUANDO DETECTAR CLIENTE EXISTENTE:
1. NUNCA faca triagem (tempo de empresa, carteira, etc). Isso irrita o cliente.
2. Primeiro, peca o NOME COMPLETO se ainda nao tem (pra poder localizar no sistema)
3. Depois, responda: "[nome], entendo. Vou acionar o advogado responsavel pelo seu caso pra te dar um retorno. Obrigada pela paciencia!"
4. Se o cliente tiver NOTA DA EQUIPE na ficha, use pra contextualizar a resposta
5. O sistema pausa automaticamente
- NAO tente agendar nada.
- NAO fique respondendo perguntas juridicas.
- O sistema vai pausar automaticamente para o advogado atender pelo CRM.
- Laura foca em PROSPECCAO de leads novos, nao em clientes ja existentes.
- NUNCA agende 2 consultas na mesma conversa, EXCETO se o lead pedir para REMARCAR
- REMARCACAO: Se o lead pedir para mudar, trocar ou remarcar a consulta:
  1. PRIMEIRO informe que ja tem um advogado da equipe reservado para aquele horario: "[nome], sua consulta esta marcada para [dia/hora] e um advogado da nossa equipe ja esta reservado para te atender nesse horario. Tem certeza que precisa mudar?"
  2. Se o lead CONFIRMAR que quer mudar, ai sim ofereca novos horarios: "Sem problemas! Vou cancelar o horario anterior. Temos [horarios]. Qual fica melhor?"
  3. Use "Agendado!" ao confirmar o novo horario (o sistema cancela o antigo automaticamente)
  4. NUNCA cancele sem o lead confirmar que quer mudar. O lead deve ter APENAS 1 agendamento ativo.
- A CONSULTA INICIAL E GRATUITA e sem compromisso. Mencione isso ao oferecer horarios.
- NAO fale sobre honorarios, custos ou como o escritorio cobra. Isso e assunto para a consulta com o advogado.
- Se o lead perguntar sobre custos/honorarios, diga apenas: "A consulta inicial e gratuita e sem compromisso. Os detalhes sobre o andamento do caso sao tratados diretamente com o advogado na consulta."
- Consultas: Seg-Sex, manha 9h-11h e tarde 14h-16h, presencial (Belem/PA) ou online
- HORARIOS VALIDOS: 9h, 10h, 11h, 14h, 15h, 16h. NUNCA ofereca horarios fora desses (12h, 13h, 17h, 18h NAO existem na agenda).
- DIFICULDADE DE HORARIO — NAO DESISTA FACIL:
  Se o lead disser que nao tem tempo, nao consegue folga, trabalha muito, fica dificil, etc:
  1. Reforce que a consulta e ONLINE e rapida (20-30 minutos): "[nome], entendo que e corrido. A consulta e online e rapida, voce faz de onde estiver, ate pelo celular. Temos horarios de manha (9h-11h) e tarde (14h-16h), qual periodo fica melhor?"
  2. Se nenhum horario funcionar, proponha um dia que ele tenha folga: "[nome], tem algum dia da semana que voce folga? Posso tentar encaixar nesse dia."
  3. So desista se o lead EXPLICITAMENTE disser que nao quer. Dificuldade de horario NAO e falta de interesse — e so um obstaculo logistico. Seja persistente (sem ser chato).
- Ao oferecer consulta, pergunte: "Prefere presencial no escritorio em Belem ou online por videochamada?"
- PRESENCIAL: Se o lead escolher presencial, informe: "[nome], para consulta presencial preciso confirmar a disponibilidade do advogado no escritorio. Vou verificar e te retorno em breve." NAO use "Agendado!" para presencial — o agendamento presencial precisa de confirmacao da equipe.
- ONLINE: Se o lead escolher online, pode agendar normalmente com "Agendado!".
- NUNCA mencione email, confirmacao e por WhatsApp
- Ao confirmar agendamento ONLINE, use EXATAMENTE este formato: "Agendado! Dia [dia da semana], as [hora]h, consulta online do(a) Sr(a) [nome] com o escritorio NPLADVS para tratar sobre [assunto]. A consulta e gratuita. Qualquer duvida, estou por aqui."
- PRESENCIAL: NUNCA use "Agendado!" para presencial. Use: "[nome], para consulta presencial preciso confirmar a disponibilidade do advogado no escritorio. Vou verificar e te retorno em breve."
- IMPORTANTE: SO use "Agendado!" quando o lead ESCOLHEU um horario especifico. Se o lead responder apenas "sim", "pode ser", "quero", "bora", sem dizer QUAL horario, pergunte: "[nome], qual dos horarios fica melhor pra voce?" NAO confirme agendamento sem horario definido.
- Conduza para agendamento de forma natural. ANALISE se a pessoa realmente quer agendar.
- Quando falar do escritorio, diga "NPLADVS" ou "o escritorio"

LIDANDO COM OBJECOES:
- "Preciso pensar" -> "Claro, [nome]. Posso reservar um horario pra voce por 24h, assim pensa com calma. A consulta e gratuita e sem compromisso, serve pra voce entender exatamente o que pode receber. Quer que eu reserve?"
- "E caro?" / "Quanto custa?" -> "A consulta inicial e gratuita, [nome]. Na consulta o advogado explica tudo sobre como funciona. Posso ver um horario essa semana?"
- "Depois vejo" / "Agora nao posso" -> "[nome], entendo. So lembre que o prazo para entrar com acao trabalhista e de 2 anos. Quando puder, me chama aqui que agendo rapidinho."
- "Ja tenho advogado" -> "[nome], entendo. Se quiser uma segunda opiniao especializada em trabalhista, a consulta e gratuita e sem compromisso."
- "Funciona mesmo?" / "Nao confio" -> "[nome], entendo sua preocupacao. O escritorio atua ha anos na area trabalhista e ja ajudou centenas de trabalhadores. A consulta gratuita serve justamente pra voce avaliar sem compromisso."
- Se o lead mencionar que varias pessoas foram afetadas (colegas de trabalho), pergunte: "Quantas pessoas foram afetadas? Casos coletivos costumam ser ainda mais fortes."

ESTIMATIVA DE VERBAS (quando disponivel na FICHA DO LEAD):
Se a secao FICHA DO LEAD contiver "ESTIMATIVA_VERBAS: ...", voce tem uma estimativa PRE-CALCULADA do que o lead pode receber. Use como argumento de conversao quando fizer sentido (depois de avaliar o caso, antes de oferecer horario).
- Apresente como ESTIMATIVA preliminar, nunca como valor definitivo: "[nome], fazendo uma estimativa preliminar com base no que voce me contou, voce pode ter direito a aproximadamente R$ XXXX entre verbas rescisorias e FGTS. Mas sao so valores iniciais — o advogado pode identificar muito mais na consulta. Posso reservar um horario?"
- SEMPRE deixe claro que e estimativa e que o calculo final e na consulta
- NAO mencione valores especificos se nao estiver na FICHA DO LEAD. NUNCA invente valores.
- Se o lead perguntar "quanto posso receber?" e voce ainda nao tem salario+tempo+motivo, pergunte esses dados antes.

INFORMACAO SOBRE PRAZOS:
- Prazo prescricional: 2 anos apos sair da empresa
- Pode cobrar direitos dos ultimos 5 anos trabalhados
- Se saiu ha mais de 1 ano, SEMPRE alerte sobre urgencia do prazo
- Se saiu ha mais de 1,5 ano, trate como URGENTE e priorize agendamento rapido
- CONTRADICAO DE DATA: Se o lead disser duas datas diferentes (ex: "saí em 2022" e depois "faz 1 ano"), NAO assuma uma das duas. Peça esclarecimento: "[nome], voce havia mencionado que saiu em [data1], mas agora falou [data2]. Qual e a data certa da sua saida? Se preferir, pode verificar na CTPS ou no app do FGTS."
- NUNCA INVENTE DATA DE PRESCRICAO: se a ficha NAO tiver bloco "PRAZO PRESCRICIONAL: ...", NAO afirme prazos especificos pro lead (NUNCA diga "voce tem ate marco de 2026", "faltam X meses pra prescrever", etc). O sistema calcula isso automaticamente quando o lead informa data de saida — se nao calculou, voce NAO sabe. Em vez de inventar, diga: "[nome], o advogado calcula o prazo exato na consulta — me passa quando voce saiu da empresa pra eu ja verificar?". Inventar prazo errado = consulta agendada de caso prescrito = problema serio.

EXEMPLOS:

[FICHA: nome=vazio, assunto=vazio — lead respondeu generico "oi preciso de ajuda"]
Laura (sistema ja enviou apresentacao automatica + pedido de nome antes desta resposta):
Laura: "Claro, estou aqui pra te ajudar. Qual o seu nome completo e o que aconteceu no trabalho?"

[FICHA: nome=vazio, assunto=demissao — lead respondeu "fui demitido e nao recebi nada"]
Laura: "Entendo, ser demitido e muito dificil. Mas voce tem direitos que podem ser cobrados, e o escritorio ja ajudou muitos trabalhadores nessa situacao. Qual o seu nome completo?"

[FICHA: nome=Carlos Mendes, assunto=demissao, triagem=incompleta]
Lead: "Carlos Mendes"
Laura: "Carlos, obrigada. Para eu entender melhor, ha quanto tempo voce trabalhava nessa empresa e ja saiu ou ainda esta la?"

[FICHA: nome=Carlos, assunto=demissao, tempo=5 anos, carteira=sim, saiu ha 6 meses]
Lead: "trabalhei 5 anos com carteira, sai faz 6 meses"
Laura: "Carlos, pelo que voce me contou, seu caso e muito viavel. Com 5 anos de CLT e demissao recente, voce tem direitos claros que podem ser cobrados. Na consulta gratuita o advogado vai calcular tudo. Temos horarios essa semana, prefere presencial em Belem ou online?"

[FICHA: nome=Maria, triagem=completa, saiu ha 1 ano e 8 meses — URGENTE]
Lead: "sai da empresa faz quase 2 anos"
Laura: "Maria, seu caso e viavel, mas preciso te alertar: voce tem menos de 4 meses para entrar com a acao. Se perder esse prazo, perde o direito. Consigo encaixar voce ainda essa semana numa consulta gratuita. Posso reservar?"

[FICHA: nome=Maria, triagem=completa, prazo=2 anos e 3 meses — PRESCRICAO]
Lead: "sai faz uns 2 anos e meio"
Laura: "Maria, infelizmente o prazo para entrar com acao trabalhista e de 2 anos apos a saida, e no seu caso esse prazo ja foi ultrapassado. Lamento nao poder ajudar. Te desejo tudo de bom."

[FICHA: nome=Pedro, lead SEM INTERESSE]
Lead: "nao obrigado, so queria saber mesmo"
Laura: "Pedro, sem problemas. Caso mude de ideia, estou por aqui. Te desejo tudo de bom."

[FICHA: nome=Lucas, viavel=sim]
Lead: "vou pensar e depois falo"
Laura: "Lucas, claro! Posso reservar um horario por 24h pra voce, assim pensa com calma sem perder a vaga. A consulta e gratuita. Quer que eu reserve?"

[FICHA: nome=Carlos, JA AGENDOU segunda 10h]
Lead: "marca outra consulta pra mim"
Laura: "Carlos, sua consulta ja esta agendada para segunda as 10h. Nos vemos la!"

[FICHA: nome=Carlos, JA AGENDOU segunda 10h, lead quer REMARCAR]
Lead: "nao vou poder segunda, tem outro dia?"
Laura: "Carlos, sua consulta esta marcada para segunda as 10h e um advogado da equipe ja esta reservado pra te atender. Tem certeza que precisa mudar?"

[Resposta do Carlos: "sim, preciso mudar"]
Laura: "Sem problemas! Vou cancelar segunda. Temos terca as 14h ou quarta as 10h, qual fica melhor?"

[Resposta do Carlos: "terca as 14h"]
Laura: "Agendado! Dia terca, as 14h, consulta online do Sr Carlos com o escritorio NPLADVS. A consulta e gratuita. Qualquer duvida, estou por aqui."`;


// ===== MONTAR FICHA DO LEAD =====
function buildFichaLead(lead, history, contexto) {
  const linhas = [];

  // === CONTEXTO CRM (se existir) ===
  if (contexto && contexto.tipo === 'cliente') {
    const cl = contexto.cliente;
    const nome = cl.nome_completo || cl.razao_social || '';
    linhas.push(`ATENCAO: Esta pessoa JA E CLIENTE do escritorio!`);
    linhas.push(`- Nome no sistema: ${nome}`);
    linhas.push(`- Tipo: ${cl.tipo || 'PF'} . Status: ${cl.status}`);

    if (contexto.casos.length > 0) {
      linhas.push(`\nCASOS ATIVOS:`);
      contexto.casos.forEach(c => {
        linhas.push(`- ${c.tese} (${c.fase}) ${c.numero_processo ? '. Proc. ' + c.numero_processo : ''}`);
      });
    }

    if (contexto.tarefas.length > 0) {
      linhas.push(`\nTAREFAS PENDENTES DO CLIENTE:`);
      contexto.tarefas.slice(0, 3).forEach(t => {
        linhas.push(`- ${t.descricao} . Prazo: ${t.data_limite || 'sem prazo'}`);
      });
    }

    if (contexto.financeiro.length > 0) {
      const totalPendente = contexto.financeiro.reduce((s, f) => s + (f.valor || 0), 0);
      const atrasados = contexto.financeiro.filter(f => f.status === 'atrasado');
      linhas.push(`\nFINANCEIRO:`);
      linhas.push(`- Total pendente: R$ ${totalPendente.toFixed(2)}`);
      if (atrasados.length > 0) {
        linhas.push(`- ATRASADO: ${atrasados.length} parcela(s) totalizando R$ ${atrasados.reduce((s, f) => s + (f.valor || 0), 0).toFixed(2)}`);
      }
    }

    // Notas da equipe sobre o cliente (preenchidas via CRM) — contexto crítico
    if (lead && lead.notas) {
      linhas.push('');
      linhas.push('NOTA DA EQUIPE SOBRE ESTE CONTATO:');
      linhas.push(lead.notas);
      linhas.push('IMPORTANTE: Use esta nota pra contextualizar. NAO pergunte o que ja consta na nota. Responda de forma informada.');
    }

    linhas.push(`\nCOMPORTAMENTO COM CLIENTE:`);
    linhas.push(`- Trate pelo nome que ja consta no sistema`);
    linhas.push(`- Nao peca dados que ja existem (nome, telefone, assunto)`);
    linhas.push(`- Se perguntar sobre seu caso, informe o status geral`);
    linhas.push(`- NUNCA compartilhe valores financeiros exatos. Se cliente perguntar: "[nome], questoes financeiras sao tratadas com a equipe administrativa. Vou pedir pra entrarem em contato."`);
    linhas.push(`- Se quiser agendar nova consulta, prossiga normalmente com a agenda`);
  } else if (contexto && contexto.tipo === 'cliente_processo_pendente') {
    // === POSSÍVEL CLIENTE ANTIGO — AGUARDANDO CONFIRMAÇÃO ===
    const processos = contexto.processos;
    const proc = processos[0];
    const empresas = [...new Set(processos.map(p => p.parte_contraria).filter(Boolean))];
    linhas.push(`ATENCAO: O nome desta pessoa COINCIDE com um cliente existente do escritorio!`);
    linhas.push(`- Nome encontrado na base: ${proc.nome_cliente}`);
    linhas.push(`- POREM, ainda NAO foi confirmado se e a mesma pessoa (pode ser homonimo).`);
    linhas.push(``);
    linhas.push(`COMPORTAMENTO OBRIGATORIO:`);
    if (empresas.length > 0) {
      linhas.push(`- Para confirmar a identidade, pergunte de forma NATURAL sobre a empresa:`);
      linhas.push(`  "[nome], antes de continuar, voce ja teve algum processo trabalhista com o escritorio? Seria contra a empresa ${empresas[0]}?"`);
      linhas.push(`- Se o lead confirmar a empresa ou o processo, trate como cliente existente.`);
      linhas.push(`- Se o lead negar ou mencionar outra empresa, trate como lead novo normalmente.`);
    } else {
      linhas.push(`- Pergunte de forma NATURAL se ja e cliente do escritorio:`);
      linhas.push(`  "[nome], voce ja tem ou ja teve algum processo com o escritorio NPLADVS?"`);
    }
    linhas.push(`- NAO compartilhe dados do processo antes da confirmacao`);
    linhas.push(`- Se a resposta for ambigua, tente UMA vez mais de forma educada. Se continuar ambigua, siga como lead novo.`);
    linhas.push(`- IMPORTANTE: NAO deixe essa verificacao atrapalhar o fluxo da conversa. Se o lead quer falar de outro assunto, atenda normalmente e aproveite para confirmar depois.`);

  } else if (contexto && contexto.tipo === 'cliente_processo') {
    // === CLIENTE ANTIGO (identificado e CONFIRMADO pela planilha de processos) ===
    const proc = contexto.processos[0];
    linhas.push(`ATENCAO: Esta pessoa CONFIRMOU ser CLIENTE EXISTENTE do escritorio!`);
    linhas.push(`- Nome encontrado: ${proc.nome_cliente}`);
    linhas.push(`- Processos encontrados: ${contexto.processos.length}`);

    linhas.push(`\nDADOS DOS PROCESSOS (use para informar o cliente):`);
    contexto.processos.forEach((p, i) => {
      linhas.push(`\n  PROCESSO ${i + 1}:`);
      linhas.push(`  - Materia: ${p.materia || p.disciplina || 'Trabalhista'}`);
      if (p.numero_processo) linhas.push(`  - Numero: ${p.numero_processo}`);
      if (p.parte_contraria) linhas.push(`  - Contra: ${p.parte_contraria}`);
      linhas.push(`  - Fase: ${p.status_fase.replace(/_/g, ' ')}`);
      if (p.ultima_movimentacao && p.ultima_movimentacao !== 'X' && p.ultima_movimentacao !== 'x') {
        linhas.push(`  - Ultima movimentacao: ${p.ultima_movimentacao}`);
      }
      if (p.proxima_audiencia && p.proxima_audiencia !== 'X' && p.proxima_audiencia !== 'x') {
        linhas.push(`  - Proxima audiencia: ${p.proxima_audiencia}`);
      }
      if (p.prazos_aberto && p.prazos_aberto !== 'X' && p.prazos_aberto !== 'x') {
        linhas.push(`  - Prazos em aberto: ${p.prazos_aberto}`);
      }
      if (p.local_tribunal) linhas.push(`  - Tribunal: ${p.local_tribunal}`);
    });

    linhas.push(`\nCOMPORTAMENTO COM CLIENTE EXISTENTE — ATENDIMENTO PREMIUM:`);
    linhas.push(`Voce agora e a assistente pessoal deste cliente. Ele tem PRIORIDADE DIRETA com a equipe de advogados NPL.`);
    linhas.push(``);
    linhas.push(`PRIMEIRA INTERACAO COMO CLIENTE (se voce ainda nao se apresentou nesse papel):`);
    linhas.push(`Mostre empolgacao genuina. Vista a camisa do escritorio. Use uma mensagem nessa linha (adapte ao tom do cliente):`);
    linhas.push(`"[Nome], que bom falar com voce! Sou a Laura, IA do escritorio NPL. Tenho uma novidade massa: o NPL investiu em IA de ponta (Claude AI) pra te dar atendimento premium 24h por aqui. Voce tem PRIORIDADE DIRETA com nossa equipe de advogados — se quiser falar com seu advogado, e so me avisar que ja aciono pra te dar retorno o quanto antes. E pra duvidas do dia a dia, prazos, audiencias, termos do processo — pode contar comigo. O que voce precisa hoje?"`);
    linhas.push(`NAO repita essa apresentacao toda vez — so na primeira interacao como cliente confirmado.`);
    linhas.push(``);
    linhas.push(`O QUE VOCE PODE FAZER PELO CLIENTE:`);
    linhas.push(`1. Responder duvidas usando os DADOS DOS PROCESSOS acima (fase, proxima audiencia, prazos, tribunal). Use SOMENTE o que esta listado — NUNCA invente.`);
    linhas.push(`2. Interpretar termos juridicos basicos pra leigo (ex: "execucao = fase de cobrar a sentenca", "alvara = autorizacao do juiz pra liberar valores", "transito em julgado = quando nao cabe mais recurso").`);
    linhas.push(`3. Orientar sobre audiencia (o que levar, como se preparar, chegada com antecedencia).`);
    linhas.push(`4. Tirar duvidas trabalhistas gerais.`);
    linhas.push(``);
    linhas.push(`QUANDO ACIONAR O ADVOGADO (sempre que houver qualquer dessas situacoes):`);
    linhas.push(`- Cliente PEDE pra falar com advogado/equipe`);
    linhas.push(`- Cliente pergunta algo que NAO esta nos DADOS DOS PROCESSOS acima (ex: "ja saiu a sentenca?", "quanto vou receber?", "quando cai o dinheiro?")`);
    linhas.push(`- Cliente pergunta sobre acordo, valores, negociacao com a empresa`);
    linhas.push(`- Cliente esta nervoso, com pressa, ou demonstra urgencia real`);
    linhas.push(`- Qualquer duvida sobre o caso especifico que exige analise juridica`);
    linhas.push(`Resposta padrao: "[Nome], deixa que aciono [seu/sua] advogad[o/a] agora pra te dar retorno o quanto antes! Aqui no NPL voce tem prioridade." (sistema pausa automaticamente)`);
    linhas.push(``);
    linhas.push(`REGRAS DE OURO:`);
    linhas.push(`- NUNCA invente info do processo. Se nao esta nos DADOS acima, voce NAO sabe — escala pro advogado.`);
    linhas.push(`- NUNCA fale valores, calculos exatos, ou previsao de quanto o cliente vai receber.`);
    linhas.push(`- NAO faca triagem. Ele ja e cliente.`);
    linhas.push(`- Sempre que escalar pro advogado, fale do beneficio premium ("voce tem prioridade", "vou destacar sua conversa").`);
    linhas.push(`- Tom: empolgado mas nao exagerado. Voce e a assistente DELE.`);
  } else if (lead && lead.etapa_funil === 'cliente') {
    // Lead marcado como cliente no funil mas SEM registro na tabela clientes
    // (ex: CRM clicou "Salvar Cliente" mas não criou ficha completa ainda)
    linhas.push(`ATENCAO: Esta pessoa JA E CLIENTE do escritorio (etapa_funil = cliente)!`);
    linhas.push(`- Nome: ${lead.nome || '(nao informado)'}`);
    linhas.push(`- Telefone: ${lead.telefone}`);
    linhas.push(`- Tese: ${lead.tese_interesse || 'Trabalhista'}`);

    if (lead.notas) {
      linhas.push('');
      linhas.push('NOTA DA EQUIPE SOBRE ESTE CONTATO:');
      linhas.push(lead.notas);
      linhas.push('IMPORTANTE: Use esta nota pra contextualizar. NAO pergunte o que ja consta.');
    }

    linhas.push(`\nCOMPORTAMENTO: ATENDIMENTO PREMIUM.`);
    linhas.push(`- Trate como cliente, nao como lead. NAO faca triagem.`);
    linhas.push(`- Tom proximo e caloroso. Chame pelo nome.`);
    linhas.push(`- Se pedir advogado: destaque conversa e avise que advogado responde em breve.`);
    linhas.push(`- NUNCA compartilhe valores financeiros. Encaminhe pra equipe administrativa.`);
  } else {
    // Lead normal (nao e cliente)
    if (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) {
      linhas.push(`- Nome: ${lead.nome}`);
    } else {
      linhas.push(`- Nome: (nao informado ainda)`);
    }

    linhas.push(`- Assunto: Trabalhista`);

    if (lead && lead.notas) {
      linhas.push('');
      linhas.push('NOTA DA EQUIPE SOBRE ESTE CONTATO:');
      linhas.push(lead.notas);
      linhas.push('IMPORTANTE: Use esta nota para contextualizar sua resposta. NAO pergunte informacoes que ja constam na nota. Se a nota mencionar andamento de processo, use isso pra responder de forma informada.');
    }

    if (lead && lead.email) {
      linhas.push(`- Email: ${lead.email}`);
    }

    // Detecção de tese trabalhista (contexto técnico específico)
    try {
      const teses = require('./teses');
      const textoConversaCompleta = (history || []).filter(m => m.role === 'user').map(m => m.content).join('\n');
      const detectado = teses.detectarTese(textoConversaCompleta);
      const blocoTese = teses.formatarParaFicha(detectado);
      if (blocoTese) {
        linhas.push(`\n${blocoTese}`);
        linhas.push(`USO: use o contexto tecnico acima para dar argumentos concretos e relevantes. Se faltam respostas das perguntas uteis, faça UMA delas (nunca todas de uma vez).`);
      }
    } catch (e) {
      // Módulo teses opcional
    }

    // Detecção de objeções na última mensagem do lead
    try {
      const objecoes = require('./objecoes');
      const ultimaMsgLead = (history || []).filter(m => m.role === 'user').slice(-1)[0];
      if (ultimaMsgLead) {
        const detectadas = objecoes.detectarObjecoes(ultimaMsgLead.content);
        const bloco = objecoes.formatarParaFicha(detectadas);
        if (bloco) {
          linhas.push(`\n${bloco}`);
          linhas.push(`Aborde as objecoes acima com empatia e argumentos concretos. NAO seja pushy.`);
        }
      }
    } catch (e) {
      // Módulo objecoes opcional
    }

    // Estimativa de verbas rescisórias (se temos dados suficientes)
    try {
      const verbas = require('./verbas');
      const textoConversa = (history || []).filter(m => m.role === 'user').map(m => m.content).join('\n');
      const dados = verbas.extrairDadosDaConversa(textoConversa);
      if (dados.salario && dados.mesesTrabalho && dados.motivo) {
        const resultado = verbas.calcularRescisao({
          salario: dados.salario,
          mesesTrabalho: dados.mesesTrabalho,
          motivo: dados.motivo,
          carteiraAssinada: dados.carteiraAssinada !== false
        });
        if (!resultado.erro) {
          const total = resultado.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const fgts = resultado.fgts_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          linhas.push(`\nESTIMATIVA_VERBAS: ~${total} em verbas rescisorias + ~${fgts} de FGTS (motivo: ${dados.motivo}, ${dados.mesesTrabalho} meses, salario R$ ${dados.salario})`);
          linhas.push(`USO: apresente como estimativa preliminar quando fizer sentido — depois de avaliar caso, antes de oferecer horario. Sempre diga que e estimativa e o advogado calcula tudo na consulta.`);
        }
      }
    } catch (e) {
      // Módulo verbas opcional — se falhar, segue sem estimativa
    }

    // Alerta de prazo prescricional (2 anos)
    try {
      const prescricao = require('./prescricao');
      const textoConversa = (history || []).filter(m => m.role === 'user').map(m => m.content).join('\n');
      const alerta = prescricao.formatarAlerta(textoConversa);
      const bloco = prescricao.formatarParaFicha(alerta);
      if (bloco && alerta.nivel !== 'ok') {
        linhas.push(`\n${bloco}`);
      }
    } catch (e) {
      // Opcional
    }

    // Base de processos similares (contexto para dar confiança, sem expor dados)
    try {
      const teses = require('./teses');
      const textoConversa = (history || []).filter(m => m.role === 'user').map(m => m.content).join('\n');
      const detectado = teses.detectarTese(textoConversa);
      if (detectado && lead) {
        const materia = teses.TESES[detectado.principal]?.titulo;
        const db = require('./database');
        if (materia && db.contarProcessosSimilares) {
          // Atenção: ficha é síncrona — usar then/catch descartável
          // Como buildFichaLead é chamado de forma síncrona no prompt, o contador precisa ser async.
          // Solução: expor a materia como hint no prompt e deixar Laura mencionar "nosso escritório tem experiência em X"
          linhas.push(`\nCASOS_SIMILARES: escritorio ja atendeu casos de ${materia}. Se fizer sentido, use como argumento de credibilidade SEM prometer resultado.`);
        }
      }
    } catch (e) {
      // Opcional
    }
  }

  // Resumo da conversa anterior (lead + Laura) para contexto completo.
  // Janela ampla — Laura precisa do contexto inteiro pra retomada apos atendimento
  // humano. Trecho de cada msg cortado em 200 chars pra evitar prompt gigante.
  if (history && history.length >= 2) {
    const resumo = [];
    for (const m of history.slice(-120)) {
      const autor = m.role === 'user' ? 'Lead' : (m.manual ? `Equipe${m.usuario_nome ? ' (' + m.usuario_nome + ')' : ''}` : 'Laura');
      resumo.push(`${autor}: ${m.content.slice(0, 200)}`);
    }
    if (resumo.length > 0) {
      linhas.push(`\nRESUMO DA CONVERSA (ultimas ${resumo.length} mensagens):`);
      linhas.push(resumo.join('\n'));
      linhas.push(`\nIMPORTANTE: Voce tem o resumo completo acima. NUNCA repita perguntas que voce (Laura) ja fez. NUNCA peca informacoes que o lead ja deu. Retome de onde parou.`);
    }
  }

  // IMPORTANTE: análise de triagem e bloqueios usa APENAS mensagens do LEAD
  // (não da Laura). Antes, incluir msgs da Laura causava falsos positivos —
  // ex: Laura dizendo "trabalhar sem carteira é sério" marcava triagem como
  // completa; Laura dizendo "não precisa se preocupar" bloqueava como sem interesse.
  const allTextLeadOnly = (history || []).filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase();
  const ultimasMsgsLead = (history || []).filter(m => m.role === 'user').slice(-3).map(m => m.content).join(' ').toLowerCase();
  const temNome = lead && lead.nome && !lead.nome.startsWith('WhatsApp');

  // Detectar respostas de triagem — SEMPRE nas msgs do lead
  const temTempo = /(\d+\s*(ano|mes|mês)).*(trabalh|empres)/i.test(allTextLeadOnly) || /trabalh.{0,20}(\d+\s*(ano|mes|mês))/i.test(allTextLeadOnly);
  const temCarteira = /(com carteira|sem carteira|tinha carteira|n[ãa]o tinha carteira|era registrad|n[ãa]o era registrad|clt|fichado|sem registro|registrad[oa] sim|registrad[oa] n[ãa]o)/i.test(allTextLeadOnly);
  const aindaTrabalha = /(ainda (estou|trabalho|to na|tô na|sou)|n[ãa]o sa[ií]|continuo na|empregado atual|trabalho atualmente)/i.test(allTextLeadOnly);
  const temPrazo = aindaTrabalha || /(sa[ií].*faz|sa[ií].*h[aá]|sa[ií].*tem|demitid.*faz|demitid.*h[aá]|faz.*sa[ií]|h[aá].*sa[ií])/i.test(allTextLeadOnly);
  const temDocumentos = /(documento|contracheque|contrato|comprovante|mensagen|prova|print|foto)/i.test(allTextLeadOnly) && history.length > 4;
  const temAdvogado = /(advogado|advogada|outro advogado|j[aá] procur)/i.test(allTextLeadOnly) && history.length > 4;

  // Detectar menção a advogado da equipe (= cliente existente em tratativa)
  const mencionouEquipe = /(dra\.?\s*luma|luma prince|dra\.?\s*sophia|sophia marineli|dr\.?\s*osmar|osmar neves|dr\.?\s*bruno|bruno pinheiro|dr\.?\s*rodrigo|rodrigo lins|minha advogada|meu advogado|falei com (a |o )?(dra?\.?|advogad)|ta nas maos da|tá nas mãos da|ja sou cliente|já sou cliente|ja fiz consulta|já fiz consulta|meu caso.{0,20}(com voc|com o escrit|no escrit)|meu processo.{0,20}(com voc|com o escrit|no escrit)|andamento.{0,15}(do meu|do processo|do caso)|previs[ãa]o.{0,15}(de audi[eê]ncia|do julgamento)|j[aá] (tive|teve|tivemos|fiz|fizemos).{0,15}(audi[eê]ncia|consulta)|alguma novidade.{0,15}(do meu|do caso|do processo)|como (est[aá]|anda|t[aá]).{0,15}(meu caso|meu processo|o processo|a a[cç][ãa]o))/i.test(allTextLeadOnly);

  // BLOQUEIOS — só nas ÚLTIMAS 3 msgs do lead (evita bloqueio eterno por menção antiga)
  // Ex: "meu marido trabalha na prefeitura, mas eu sou CLT" NÃO bloqueia
  const ePrefeitura = /(prefeitura|governo municipal|orgao municipal|órgão municipal|servidor municipal|câmara municipal|camara municipal|trabalhei (na|pra|para|pro) (a )?prefeitura)/i.test(ultimasMsgsLead);
  const eGoverno = /(servidor (público|publico) (estatut|concurs)|sou (concursad|estatut)|funcionar\w+ public\w+ (estatut|concurs))/i.test(ultimasMsgsLead);
  // "nao quero" só bloqueia se vier com contexto explícito de recusar o serviço
  const semInteresse = /(n[ãa]o (quero|tenho interesse).{0,30}(consulta|agendar|advogado|ajuda|servi[çc]o)|s[óo] queria saber|obrigad[oa] mas n[ãa]o preciso|n[ãa]o preciso de (advogado|consulta|ajuda)|n[ãa]o tenho (nenhum[a]? )?(questao|caso|problema) trabalhista)/i.test(allTextLeadOnly);

  // Contato comercial/corporativo (não é lead trabalhista) — removido "entrando em contato com escritório" (falso positivo)
  const eContatoComercial = /(jusbrasil|sou (do|da) (time |equipe |setor )?(comercial|corporativo|vendas)|contato (comercial|corporativo)|solucoes corporativas|soluções corporativas)/i.test(allTextLeadOnly);

  const triagemItens = [];
  if (temTempo) triagemItens.push('tempo de trabalho');
  if (temCarteira) triagemItens.push('carteira/registro');
  if (aindaTrabalha) triagemItens.push('ainda empregado (sem risco de prescricao)');
  else if (temPrazo) triagemItens.push('prazo desde saida');
  if (temDocumentos) triagemItens.push('documentos');
  if (temAdvogado) triagemItens.push('advogado anterior');

  // Detectar bloqueios e adicionar alertas CRITICOS na ficha
  const bloqueios = [];
  if (ePrefeitura) bloqueios.push('PREFEITURA/GOVERNO MUNICIPAL — NAO AGENDAR. Informe que o escritorio e especializado em CLT privada.');
  if (eGoverno) bloqueios.push('POSSIVEL SERVIDOR PUBLICO — Confirme se e empresa privada ou governo antes de agendar.');
  if (semInteresse) bloqueios.push('LEAD SEM INTERESSE — NAO insista, encerre educadamente com UMA mensagem curta.');
  if (eContatoComercial) bloqueios.push('CONTATO COMERCIAL/CORPORATIVO — NAO e um caso trabalhista, NAO faca triagem. Responda UMA vez: "Obrigada pelo contato. Nossa equipe administrativa vai analisar." e encerre. NAO mande mensagens de despedida repetidas.');

  const triagemCompleta = temNome && temTempo && temCarteira && temPrazo;
  const triagemMinima = temNome && (temTempo || temPrazo); // minimo para avaliar viabilidade

  // Se mencionou advogado da equipe, marcar como cliente em tratativa
  if (mencionouEquipe && !eContatoComercial) {
    linhas.push(`\n⚠ CLIENTE EM TRATATIVA COM O ESCRITORIO:`);
    linhas.push(`- Esta pessoa mencionou um advogado/advogada da equipe NPLADVS`);
    linhas.push(`- Trate como CLIENTE EXISTENTE. NAO faca triagem.`);
    linhas.push(`- Pergunte em que pode ajudar e encaminhe para o advogado responsavel.`);
  }

  if (!(contexto && (contexto.tipo === 'cliente' || contexto.tipo === 'cliente_processo' || contexto.tipo === 'cliente_processo_pendente')) && !mencionouEquipe) {
    linhas.push(`\nTRIAGEM:`);
    if (triagemItens.length > 0) {
      linhas.push(`- Ja coletado: ${triagemItens.join(', ')}`);
    }
    if (!temTempo) linhas.push(`- FALTA: tempo de trabalho na empresa`);
    if (!temCarteira) linhas.push(`- FALTA: se tinha carteira assinada`);
    if (!temPrazo) linhas.push(`- FALTA: ha quanto tempo saiu da empresa (CRITICO para prazo)`);
  }

  // Alertar bloqueios na ficha
  if (bloqueios.length > 0) {
    linhas.push(`\n⚠ BLOQUEIO DETECTADO:`);
    bloqueios.forEach(b => linhas.push(`- ${b}`));
    linhas.push(`- SIGA AS INSTRUCOES DE BLOQUEIO DO PROMPT. NAO ofereca consulta.`);
  }

  // Proximo passo
  if (mencionouEquipe && !eContatoComercial) {
    linhas.push(`\nPROXIMO PASSO: CLIENTE EM TRATATIVA. NAO faca triagem. Pergunte em que pode ajudar. Se tiver duvida juridica, diga que vai pedir para o advogado responsavel entrar em contato.`);
  } else if (eContatoComercial) {
    linhas.push(`\nPROXIMO PASSO: CONTATO COMERCIAL. Responda UMA unica mensagem curta ("Obrigada pelo contato. Nossa equipe administrativa vai avaliar.") e encerre. NAO pergunte triagem. NAO insista.`);
  } else if (bloqueios.length > 0 && !semInteresse) {
    linhas.push(`\nPROXIMO PASSO: BLOQUEIO. Informe o lead educadamente conforme as regras. NAO agende.`);
  } else if (semInteresse) {
    linhas.push(`\nPROXIMO PASSO: Lead sem interesse. Despeca-se educadamente com UMA mensagem. NAO insista.`);
  } else if (contexto && contexto.tipo === 'cliente') {
    linhas.push(`\nPROXIMO PASSO: E CLIENTE. Atenda conforme o pedido. Se quiser agendar, ofereca horarios.`);
  } else if (contexto && contexto.tipo === 'cliente_processo') {
    // Proximo passo ja foi definido no bloco cliente_processo acima, nao sobrescrever
  } else {
    let proximoPasso;
    if (!temNome) {
      proximoPasso = 'Mostre EMPATIA sobre a situacao + peca o NOME';
    } else if (!triagemMinima) {
      proximoPasso = 'Faca a proxima pergunta de TRIAGEM (UMA por vez). Pergunte o que ainda falta na lista acima.';
    } else if (triagemCompleta) {
      proximoPasso = 'TRIAGEM COMPLETA. Avalie viabilidade e, se viavel, OFERECA HORARIOS DA AGENDA.';
    } else {
      proximoPasso = 'Triagem quase completa. Faca mais uma pergunta do que falta, ou se ja tem info suficiente, avalie viabilidade e ofereca agendar.';
    }

    linhas.push(`\nPROXIMO PASSO: ${proximoPasso}`);
  }

  return linhas.join('\n');
}

// ===== BUSCAR HORÁRIOS DO CALENDÁRIO =====
// O módulo calendar é injetado via setCalendar() pelo server.js
let _calendar = null;

function setCalendar(calendarModule) {
  _calendar = calendarModule;
  console.log('[IA-NPL] Calendar module configurado');
}

async function buscarHorarios(phone) {
  if (!_calendar) {
    console.log('[IA-NPL] Calendar nao disponivel (modulo nao carregado)');
    return null;
  }
  try {
    const { texto, slots } = await _calendar.sugerirHorarios(3, phone || null);
    if (slots.length > 0) {
      return slots.map(s => `- ${s.label}`).join('\n');
    }
  } catch (e) {
    console.log('[IA-NPL] Erro ao buscar horarios:', e.message);
  }
  return null;
}

// ===== CORTAR RESPOSTAS LONGAS =====
function trimResponse(text) {
  let clean = text.replace(/^[\s]*[-•·*]\s*/gm, '').replace(/^[\s]*\d+[.)]\s*/gm, '');
  clean = clean.replace(/\n{2,}/g, '\n').trim();

  // Remover emojis
  clean = clean.replace(/[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();

  const protected_ = clean
    .replace(/\b(Dr|Dra|Sr|Sra|Prof|Art|Inc|Ltd|Ltda|nº|tel)\./gi, '$1\u0000')
    .replace(/(\d)\./g, '$1\u0000')
    .replace(/\.{3}/g, '\u0001');

  const sentences = protected_.match(/[^.!?]+[.!?]+/g) || [protected_];
  const restored = sentences.map(s => s.replace(/\u0000/g, '.').replace(/\u0001/g, '...'));

  // Não truncar agressivamente — confiar no prompt para manter respostas curtas
  // Só corta se passar de 8 frases (caso extremo)
  const result = restored.slice(0, 8).join(' ').trim();

  // Assinatura da Laura em itálico (WhatsApp markdown)
  return result + '\n\n_Laura — Assistente Virtual (IA) | Escritorio NPL_';
}

// ===== HISTÓRICO =====
function buildRecentHistory(history) {
  // Janela ampla pra Laura ter contexto completo da conversa, mesmo apos a equipe
  // ter atendido por dias. Custo extra de input eh mitigado pelo prompt caching
  // — o ganho de qualidade (Laura nao perdendo o fio) compensa.
  const recent = history.slice(-500);
  return recent
    .map(m => ({ role: m.role, content: (m.content || '').toString() }))
    .filter(m => m.content.trim().length > 0);
}

// ===== GERAR RESPOSTA =====
async function generateResponse(history, userMessage, conversaId, lead, contexto, phone) {
  const recentHistory = buildRecentHistory(history);
  const fichaLead = buildFichaLead(lead, history, contexto);
  const horariosTexto = await buscarHorarios(phone);

  let agendaSection = '';
  if (horariosTexto) {
    agendaSection = `\nAGENDA DISPONIVEL:\n${horariosTexto}\n(Use SOMENTE estes horarios. Nunca invente.)`;
  } else {
    agendaSection = `\nAGENDA: Sem horarios carregados. Diga que vai verificar a agenda e retorna.`;
  }

  const systemPrompt = SYSTEM_PROMPT_BASE;

  // Buscar lições aprendidas de conversas anteriores
  let licoesTexto = '';
  if (aprendizado) {
    try {
      const licoes = await aprendizado.buscarLicoesRelevantes('triagem', 5);
      licoesTexto = aprendizado.formatarLicoesParaPrompt(licoes);
    } catch (e) {
      console.log('[IA-NPL] Erro ao buscar licoes:', e.message);
    }
  }

  // A/B Testing — injetar variante na ficha
  let abSection = '';
  try {
    const { getVarianteAB, AB_VARIANTES } = require('./database');
    const variante = getVarianteAB(lead);
    const ab = AB_VARIANTES[variante];
    if (ab) {
      abSection = `\nABORDAGEM DE VENDA (use estas frases ao oferecer consulta ou lidar com objecoes de custo):
- Oferta: "${ab.frase_oferta}"
- Custo: "${ab.frase_custo}"`;
    }
  } catch (e) {
    console.error('[IA-NPL] Erro ao montar abSection (A/B testing):', e.message);
  }

  // ===== DETECCAO DE RETOMADA APOS ATENDIMENTO HUMANO =====
  // Se a equipe (atendente humano via CRM/Datacrazy) esteve respondendo este lead
  // recentemente, a Laura precisa RETOMAR a conversa com contexto, nao agir como se
  // estivesse comecando do zero. Cobre 2 cenarios:
  //   1. Toggle global Laura ON apos equipe ter atendido durante OFF
  //   2. Pause individual expirou e a equipe tinha respondido manualmente
  let retomadaSection = '';
  try {
    const ultimasAssistant = (history || []).filter(m => m.role === 'assistant').slice(-10);
    const msgsManuais = ultimasAssistant.filter(m => m.manual === true);
    if (msgsManuais.length > 0) {
      // Pegar nomes unicos dos atendentes que falaram
      const atendentes = [...new Set(
        msgsManuais.map(m => m.usuario_nome).filter(n => n && n !== 'CRM' && n !== 'Equipe (Datacrazy)')
      )];
      const ultimaManual = msgsManuais[msgsManuais.length - 1];
      const assistantTotal = ultimasAssistant.length;
      const proporcaoManual = msgsManuais.length / assistantTotal;
      // So entra modo retomada se a equipe foi PROTAGONISTA recente (>30% das ultimas
      // msgs do assistente foram manuais, OU a ultima msg do assistente foi manual)
      const ultimaFoiManual = ultimasAssistant[ultimasAssistant.length - 1]?.manual === true;
      if (ultimaFoiManual || proporcaoManual >= 0.3) {
        const trechoUltima = (ultimaManual.content || '').slice(0, 200);
        const quemFalou = atendentes.length > 0
          ? `da equipe (${atendentes.join(', ')})`
          : 'da equipe';
        retomadaSection = `
ATENCAO — RETOMADA DE CONVERSA:
A equipe humana ${quemFalou} esteve atendendo este lead manualmente. Voce esta voltando a responder agora.

REGRAS OBRIGATORIAS:
- NAO se reapresente como Laura. O lead ja conversou — voce esta CONTINUANDO.
- LEIA TODO o resumo da conversa abaixo pra entender o contexto antes de escrever.
- NAO refaca triagem (nome, tempo de empresa, carteira, etc) se ja foi conversado.
- Reconheca a passagem da equipe pelo atendimento. Algo como: "[nome], voltei aqui pra te ajudar! Vi que voce estava conversando com a nossa equipe sobre [resumo do que foi discutido]. [continua de onde parou ou pergunta o que precisa]"
- NAO invente o que a equipe falou. Se nao estiver claro no historico, diga "vi que a equipe esteve aqui — em que posso te ajudar agora?"
- Se a equipe deixou uma pergunta em aberto, PRIORIZE retomar essa pergunta.

ULTIMA MENSAGEM DA EQUIPE: "${trechoUltima}"
`;
        console.log(`[IA-NPL] Retomada detectada (atendentes: ${atendentes.join(', ') || 'sem nome'}, ${msgsManuais.length}/${assistantTotal} msgs manuais)`);
      }
    }
  } catch (e) {
    console.error('[IA-NPL] Erro ao detectar retomada:', e.message);
  }

  const fichaCompleta = `===== FICHA DO LEAD (CONSULTE ANTES DE RESPONDER) =====
${fichaLead}
${agendaSection}
${abSection}
${licoesTexto}
${retomadaSection}
=========================

Mensagem do lead: "${userMessage}"

LEMBRE: Siga o PROXIMO PASSO indicado na ficha. Nao pergunte o que ja esta preenchido.`;

  console.log(`[IA-NPL] Ficha: ${fichaLead.replace(/\n/g, ' | ')}`);

  const messages = [
    ...recentHistory,
    { role: 'user', content: fichaCompleta }
  ];

  const cleanMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = cleanMessages[cleanMessages.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content += '\n' + msg.content;
    } else {
      cleanMessages.push({ ...msg });
    }
  }

  if (cleanMessages.length > 0 && cleanMessages[0].role !== 'user') {
    cleanMessages.unshift({ role: 'user', content: 'Ola' });
  }

  try {
    // SYSTEM_PROMPT_BASE é estável (~50KB) — marcado com cache_control pra reaproveitar
    // entre chamadas dentro de 5min. Reduz custo de input em ~90% no cache hit.
    // Roteamento: triagem inicial usa Haiku (mais barato), casos sensiveis Sonnet.
    const modelo = escolherModelo(lead, contexto);
    const ehHaiku = modelo === config.CLAUDE_MODEL_TRIAGEM;
    console.log(`[IA-NPL] Modelo: ${ehHaiku ? 'HAIKU' : 'SONNET'} (etapa=${lead?.etapa_funil || 'novo'}, ctx=${contexto?.tipo || 'lead'})`);

    const response = await callClaudeWithRetry({
      model: modelo,
      max_tokens: config.MAX_TOKENS,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }
      ],
      messages: cleanMessages
    }, { label: ehHaiku ? 'CLAUDE-NPL-HAIKU' : 'CLAUDE-NPL-SONNET' });

    return response.content[0].text;
  } catch (e) {
    console.error('[CLAUDE-NPL] Erro:', e.message);
    // Se sem crédito, não enviar mensagem de erro ao lead
    if (e.message?.includes('credit balance') || e.message?.includes('too low') || e.status === 400) {
      console.error('[CLAUDE-NPL] SEM CREDITO NA API — resposta suspensa');
      return null;
    }
    return 'Desculpe, estou com uma dificuldade tecnica. Entre em contato pelo telefone do escritorio.';
  }
}

// ===== GERAR FOLLOW-UP INTELIGENTE =====
async function generateFollowUp(history, lead, followUpNumber) {
  const nome = (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) ? lead.nome : 'amigo(a)';
  const detalhe = lead?.notas || 'questao trabalhista';

  // Incluir lead + Laura + Equipe humana — pra IA ver toda a conversa antes
  // de gerar follow-up (evita contradizer dispensa, evita reabordar caso ja
  // tratado pela equipe).
  const conversaRecente = (history || [])
    .slice(-30)
    .map(m => {
      const autor = m.role === 'user'
        ? 'LEAD'
        : (m.manual ? `EQUIPE${m.usuario_nome ? ' (' + m.usuario_nome + ')' : ''}` : 'LAURA');
      return `${autor}: ${m.content.slice(0, 200)}`;
    })
    .join('\n');

  const prompt = `Voce e a Laura, assistente do escritorio NPLADVS (especializado em trabalhista, Belem/PA).
O lead "${nome}" conversou com voce mas parou de responder.

CONVERSA RECENTE (leia com atencao antes de gerar o follow-up):
${conversaRecente}

REGRAS CRITICAS — LEIA ANTES DE ESCREVER:
1. Se a conversa mostra que voce (Laura) ja DISPENSOU o lead (disse "nao atendemos", "recomendo procurar outro advogado", "prazo ultrapassado", "nao podemos ajudar", "caso de prefeitura"), NAO envie follow-up. Responda EXATAMENTE: "SKIP_DISPENSADO"
2. Se a conversa mostra que o lead disse que NAO tem interesse, NAO insista. Responda: "SKIP_SEM_INTERESSE"
3. Se a conversa mostra que uma consulta JA FOI AGENDADA, NAO ofereca outra. Responda: "SKIP_JA_AGENDADO"

Se nenhuma regra acima se aplicar, gere UMA mensagem curta (2-3 frases) para retomar contato:
- Sem emojis
- Use o nome da pessoa
- REFERENCIE especificamente o que o lead disse (nao seja generico)
- ${followUpNumber === 1 ? 'Pergunte se ficou com alguma duvida sobre o caso dele. Seja leve e especifica.' : ''}
- ${followUpNumber === 2 ? 'Mostre que se importa. Mencione que a consulta e gratuita e sem compromisso.' : ''}
- ${followUpNumber === 3 ? 'Use argumentos: prazo de 2 anos, consulta gratuita. Crie urgencia se o caso permitir.' : ''}
- ${followUpNumber === 4 ? 'Mensagem final, respeitosa. Diga que nao quer incomodar mas esta a disposicao.' : ''}
- Nao mencione email. Confirmacao e por WhatsApp.
- Conduza para agendamento da consulta gratuita.`;

  try {
    // Follow-up = msg amigavel padronizada ("ficou com duvida?"). Haiku da conta.
    const response = await callClaudeWithRetry({
      model: config.CLAUDE_MODEL_TRIAGEM,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    }, { label: 'FOLLOWUP-NPL' });

    const reply = trimResponse(response.content[0].text);

    // Se a IA detectou que não deve enviar follow-up, retornar null
    if (reply.includes('SKIP_DISPENSADO') || reply.includes('SKIP_SEM_INTERESSE') || reply.includes('SKIP_JA_AGENDADO')) {
      console.log(`[FOLLOWUP-NPL] Skip para ${nome}: ${reply.slice(0, 40)}`);
      return null;
    }

    console.log(`[FOLLOWUP-NPL] Gerado para ${nome}: "${reply.slice(0, 60)}..."`);
    return reply;
  } catch (e) {
    console.error('[FOLLOWUP-NPL] Erro:', e.message);
    return null;
  }
}

// ===== RESUMO AUTOMATICO DO CASO (gerado quando lead agenda consulta) =====
// Analisa o historico da conversa e gera um resumo executivo de 4-6 linhas para o advogado
async function gerarResumoCaso(historico, lead) {
  if (!historico || historico.length === 0) return null;

  const conversaTexto = historico
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-100)
    .map(m => {
      const autor = m.role === 'user'
        ? 'LEAD'
        : (m.manual ? `EQUIPE${m.usuario_nome ? ' (' + m.usuario_nome + ')' : ''}` : 'LAURA');
      return `${autor}: ${m.content}`;
    })
    .join('\n');

  const prompt = `Voce e um assistente juridico especializado em direito trabalhista. Analise a conversa abaixo entre a Laura (IA de triagem) e um lead do escritorio NPLADVS, e gere um RESUMO EXECUTIVO para o advogado que vai atender a consulta.

FORMATO OBRIGATORIO (4 a 7 linhas, sem enrolacao):
TIPO DE ACAO: [rescisao indireta / horas extras / reconhecimento de vinculo / acidente de trabalho / assedio / verbas rescisorias / outro - especifique]
VINCULO: [tempo na empresa + tinha carteira assinada? + tipo de empresa (privada/rural/etc)]
SITUACAO ATUAL: [ainda trabalha la ou ja saiu? se saiu, ha quanto tempo]
PRINCIPAIS FATOS: [2-3 fatos mais relevantes do caso]
URGENCIA: [VIAVEL / URGENTE prazo < 6 meses / MUITO URGENTE prazo < 3 meses]
PONTOS DE ATENCAO: [contradições, info faltante, observações importantes - escreva "nenhum" se nao houver]

REGRAS:
- Use APENAS informacoes que aparecem na conversa. NAO invente.
- Se alguma info crítica nao foi coletada, escreva "nao informado"
- Seja objetivo e tecnico. Escreva para um advogado, nao para o cliente.
- NAO inclua saudacoes, conclusoes ou comentarios.

NOME DO LEAD: ${lead?.nome || 'nao informado'}
TESE DE INTERESSE: ${lead?.tese_interesse || 'a identificar'}

CONVERSA:
${conversaTexto}

RESUMO EXECUTIVO:`;

  try {
    const response = await callClaudeWithRetry({
      model: config.CLAUDE_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    }, { label: 'RESUMO-NPL' });
    const resumo = response.content[0].text.trim();
    console.log(`[RESUMO-NPL] Gerado para ${lead?.nome || 'lead'}: ${resumo.slice(0, 80)}...`);
    return resumo;
  } catch (e) {
    console.error('[RESUMO-NPL] Erro ao gerar resumo:', e.message);
    return null;
  }
}

module.exports = {
  generateResponse,
  generateFollowUp,
  gerarResumoCaso,
  trimResponse,
  setCalendar
};
