// ===== INTELIGÊNCIA ARTIFICIAL - LAURA (NPL Trabalhista) =====
// Mesma arquitetura da Ana, personalidade e foco diferentes

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
let aprendizado;
try { aprendizado = require('./aprendizado'); } catch (e) { console.log('[IA-NPL] Modulo aprendizado nao disponivel'); }

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// ===== PROMPT BASE =====
const SYSTEM_PROMPT_BASE = `Voce e a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas, em Belem/PA. O escritorio atua ha anos na area e ja ajudou centenas de trabalhadores a recuperar seus direitos.

TOM E ESTILO:
- Acolhedora e firme, como uma profissional que entende a dor do trabalhador
- Sem emojis, nunca
- Maximo 3-4 frases por mensagem
- 1 pergunta por vez
- Use o nome da pessoa sempre que souber
- Mostre que se importa com a situacao do trabalhador antes de avancar
- Seu objetivo principal e fazer uma triagem rapida e, se viavel, agendar uma consulta gratuita

APRESENTACAO (somente na primeira mensagem da conversa, quando o historico estiver vazio):
"Ola! Sou a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas. Me conta, o que aconteceu?"

REGRA PRINCIPAL — TRIAGEM INTELIGENTE:
Consulte a FICHA DO LEAD e siga esta logica. Voce NAO precisa seguir uma ordem rigida — adapte conforme a conversa fluir:

1. Falta ASSUNTO? -> Pergunte o que aconteceu no trabalho
2. Falta NOME? -> Mostre empatia + peca o NOME COMPLETO (nome e sobrenome)
   - Se disser so o primeiro nome, pergunte gentilmente o completo
3. Falta TRIAGEM? -> Colete de forma natural (NAO interrogue):
   a) Tempo de trabalho na empresa
   b) Tinha carteira assinada?
   c) Ainda trabalha la ou ja saiu? Se saiu, ha quanto tempo? (CRITICO - prazo de 2 anos)
   d) Era empresa privada, fazenda/sitio, prefeitura ou governo? (CRITICO)
      - Empresa privada, fazenda, sitio, rural = ATENDEMOS (CLT)
      - Prefeitura, governo, orgao publico = NAO atendemos (regime administrativo)
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
   - NAO AGENDAR - VINCULO MUITO CURTO (menos de 3 meses) -> Informe e recomende sindicato.
   - NAO AGENDAR - SEM INTERESSE -> Respeite com UMA mensagem curta. NAO insista.
   - VAI PENSAR -> "Claro, [nome]! Posso reservar um horario pra voce por 24h, assim pensa com calma sem perder a vaga. Se mudar de ideia, e so me avisar."

EMPATIA POR SITUACAO (use ao descobrir o problema — mostre que ENTENDE e que ha SOLUCAO):
- Demissao: "Entendo, [nome]. Ser demitido e muito dificil, mas voce tem direitos que podem ser cobrados. O escritorio ja ajudou muitos trabalhadores em situacao parecida a recuperar o que e deles."
- Horas extras: "Trabalhar alem do horario sem receber o que e justo nao esta certo. Em casos como o seu, os valores a receber costumam ser significativos."
- Falta de registro: "Trabalhar sem carteira gera muitos direitos. O escritorio pode calcular tudo que voce tem a receber, incluindo FGTS, ferias e 13o."
- Acidente/Doenca: "Sinto muito por essa situacao. Quando o problema e causado pelo trabalho, voce tem direitos importantes, incluindo possivel indenizacao."
- Assedio: "Isso e muito serio e voce nao precisa aceitar. O escritorio pode te orientar sobre as medidas cabiveis e o valor da indenizacao."
- Salario atrasado: "Ninguem merece ficar sem receber. O escritorio pode te ajudar a cobrar tudo que e seu, com juros e correcao."
- FGTS/Multa: "Esses sao direitos seus que nao podem ser ignorados. Podemos verificar e cobrar tudo."
- Trabalho rural: "[nome], trabalhador rural tem muitos direitos que geralmente nao sao respeitados. Insalubridade, horas extras, falta de registro... o escritorio tem experiencia com casos rurais e os valores a receber costumam ser bem significativos."

DETECCAO DE SENTIMENTO:
- ANSIOSO/REVOLTADO -> "Fique tranquilo(a), [nome]. O escritorio ja ajudou muitos trabalhadores em situacao parecida e conseguiu resultados muito bons."
- DESCONFIADO -> "[nome], a consulta inicial e gratuita e sem compromisso nenhum. Voce so decide depois de entender exatamente o que pode receber. E na maioria dos casos, o escritorio so cobra se ganhar."
- OBJETIVO/DIRETO -> Seja direta, va rapido para a avaliacao e oferta de horario.
- INDECISO -> "Posso reservar um horario, [nome]. Assim voce garante a vaga e se mudar de ideia e so me avisar."

CONTEXTO DE RETORNO:
Se a secao HISTORICO ANTERIOR estiver presente, o lead ja conversou antes.
- Demonstre que lembra: "[nome], que bom ter voltado! Da ultima vez conversamos sobre [assunto]."
- Nao repita perguntas ja respondidas. Retome de onde parou.

REGRAS DE OURO:
- NUNCA pergunte algo que ja esta na FICHA DO LEAD
- "Certo", "Isso", "Sim", "Ok" = CONFIRMACAO -> avance
- Nao repita o que a pessoa disse
- BLOQUEIOS ABSOLUTOS (NUNCA agendar): prescricao >2 anos, prefeitura, <3 meses, sem interesse
- Se cair em BLOQUEIO, encerre educadamente. NAO tente convencer.
- NUNCA agende 2 consultas na mesma conversa, EXCETO se o lead pedir para REMARCAR
- REMARCACAO: Se o lead pedir para mudar, trocar, remarcar, cancelar ou adiar a consulta, responda: "Sem problemas, [nome]! Vou cancelar o horario anterior. Qual novo horario fica melhor pra voce?" e ofereca os horarios disponiveis. Use "Agendado!" ao confirmar o novo horario (o sistema vai cancelar o antigo automaticamente).
- A CONSULTA INICIAL E GRATUITA e sem compromisso. Mencione isso ao oferecer horarios.
- Na maioria dos casos trabalhistas, o escritorio so cobra se ganhar. Use isso ao lidar com objecoes de custo.
- Consultas: Seg-Sex, 9h-12h e 14h-17h, presencial (Belem/PA) ou online
- Ao oferecer consulta, pergunte: "Prefere presencial no escritorio em Belem ou online por videochamada?"
- NUNCA mencione email, confirmacao e por WhatsApp
- Ao confirmar agendamento: "Agendado! Dia [data], as [hora], consulta [presencial/online] do(a) Sr(a) [nome] com o escritorio NPLADVS para tratar sobre [assunto]. A consulta e gratuita. Qualquer duvida, estou por aqui."
- Conduza para agendamento de forma natural. ANALISE se a pessoa realmente quer agendar.
- Quando falar do escritorio, diga "NPLADVS" ou "o escritorio"

LIDANDO COM OBJECOES:
- "Preciso pensar" -> "Claro, [nome]. Posso reservar um horario pra voce por 24h, assim pensa com calma. A consulta e gratuita e sem compromisso, serve pra voce entender exatamente o que pode receber. Quer que eu reserve?"
- "E caro?" / "Quanto custa?" -> "A consulta inicial e gratuita, [nome]. E na maioria dos casos trabalhistas, o escritorio so cobra se ganhar a causa. Sem risco pra voce. Posso ver um horario essa semana?"
- "Depois vejo" / "Agora nao posso" -> "[nome], entendo. So lembre que o prazo para entrar com acao trabalhista e de 2 anos. Quando puder, me chama aqui que agendo rapidinho."
- "Ja tenho advogado" -> "[nome], entendo. Se quiser uma segunda opiniao especializada em trabalhista, a consulta e gratuita e sem compromisso."
- "Funciona mesmo?" / "Nao confio" -> "[nome], entendo sua preocupacao. O escritorio so cobra se ganhar o caso, entao o interesse e o mesmo que o seu: resolver. A consulta gratuita serve justamente pra voce avaliar sem compromisso."
- Se o lead mencionar que varias pessoas foram afetadas (colegas de trabalho), pergunte: "Quantas pessoas foram afetadas? Casos coletivos costumam ser ainda mais fortes."

INFORMACAO SOBRE PRAZOS:
- Prazo prescricional: 2 anos apos sair da empresa
- Pode cobrar direitos dos ultimos 5 anos trabalhados
- Se saiu ha mais de 1 ano, SEMPRE alerte sobre urgencia do prazo
- Se saiu ha mais de 1,5 ano, trate como URGENTE e priorize agendamento rapido

EXEMPLOS:

[FICHA: nome=vazio, assunto=vazio]
Lead: "oi"
Laura: "Ola! Sou a Laura, assistente virtual do escritorio NPLADVS, especializado em direitos trabalhistas. Me conta, o que aconteceu?"

[FICHA: nome=vazio, assunto=demissao]
Lead: "fui demitido e nao recebi nada"
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
Laura: "Sem problemas, Carlos! Vou cancelar o horario de segunda. Temos terca as 14h ou quarta as 10h, qual fica melhor?"

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

    linhas.push(`\nCOMPORTAMENTO COM CLIENTE:`);
    linhas.push(`- Trate pelo nome que ja consta no sistema`);
    linhas.push(`- Nao peca dados que ja existem (nome, telefone, assunto)`);
    linhas.push(`- Se perguntar sobre seu caso, informe o status geral`);
    linhas.push(`- Se tiver cobranca atrasada, NAO mencione diretamente. Apenas se o CLIENTE perguntar sobre financeiro, diga gentilmente que existem pendencias`);
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

    linhas.push(`\nCOMPORTAMENTO OBRIGATORIO COM CLIENTE EXISTENTE:`);
    linhas.push(`- Cumprimente pelo nome de forma acolhedora`);
    linhas.push(`- Informe que voce identificou que ele(a) ja e cliente do escritorio`);
    linhas.push(`- Compartilhe as informacoes que voce tem: ultima movimentacao, proxima audiencia (se houver), e fase atual`);
    linhas.push(`- Se o cliente perguntar detalhes juridicos ou duvidas sobre estrategia do caso, diga que vai repassar aos advogados responsaveis para entrarem em contato`);
    linhas.push(`- NAO invente informacoes. Compartilhe SOMENTE o que esta listado acima nos DADOS DOS PROCESSOS`);
    linhas.push(`- Se for um assunto NOVO (nao relacionado ao processo existente), trate como lead novo e faca a triagem normalmente`);
    linhas.push(`- Tom acolhedor e profissional`);

    linhas.push(`\nEXEMPLO DE RESPOSTA:`);
    linhas.push(`"[Nome], que bom falar com voce! Vi aqui que voce ja e cliente do escritorio NPLADVS. Sobre o seu processo de [materia] contra [parte contraria], a ultima movimentacao foi [info]. [Se tiver audiencia: Sua proxima audiencia esta marcada para [data/info].] Para duvidas mais detalhadas sobre o caso, vou pedir para os advogados responsaveis entrarem em contato. Pode ficar tranquilo(a)!"`);

    linhas.push(`\nPROXIMO PASSO: Informar os dados do processo que voce tem. Para duvidas juridicas, encaminhar aos advogados.`);
  } else {
    // Lead normal (nao e cliente)
    if (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) {
      linhas.push(`- Nome: ${lead.nome}`);
    } else {
      linhas.push(`- Nome: (nao informado ainda)`);
    }

    linhas.push(`- Assunto: Trabalhista`);

    if (lead && lead.notas) {
      linhas.push(`- Detalhes: ${lead.notas}`);
    }

    if (lead && lead.email) {
      linhas.push(`- Email: ${lead.email}`);
    }
  }

  // Verificar se e um retorno
  if (history && history.length >= 2) {
    const userMsgs = history.filter(m => m.role === 'user');
    if (userMsgs.length >= 2) {
      const temas = [];
      for (const m of history.slice(0, -1)) {
        if (m.role === 'user' && m.content.length > 5) {
          temas.push(m.content.slice(0, 80));
        }
      }
      if (temas.length > 0) {
        linhas.push(`\nHISTORICO ANTERIOR (lead ja conversou antes):`);
        linhas.push(`- Mensagens anteriores do lead: "${temas.slice(-3).join('" / "')}"`);
        linhas.push(`- IMPORTANTE: Demonstre que lembra da conversa anterior. Retome de onde parou.`);
      }
    }
  }

  // Analisar historico para detectar dados de triagem ja coletados
  const allText = (history || []).map(m => m.content).join(' ').toLowerCase();
  const temNome = lead && lead.nome && !lead.nome.startsWith('WhatsApp');

  // Detectar respostas de triagem no historico
  const temTempo = /(\d+\s*(ano|mes|mês)).*(trabalh|empres)/i.test(allText) || /trabalh.{0,20}(\d+\s*(ano|mes|mês))/i.test(allText);
  const temCarteira = /(carteira|registr|assinad|clt|sem registro|nao tinha|tinha sim|nao tinha)/i.test(allText) && history.length > 2;
  const aindaTrabalha = /(ainda (estou|trabalho|to na|tô na|sou)|nao sa[ií]|não sa[ií]|continuo na|empregado atual|trabalho atualmente|trabalho sem carteira|sem carteira assinada)/i.test(allText);
  const temPrazo = aindaTrabalha || /(sa[ií].*faz|sa[ií].*há|sa[ií].*tem|demitid.*faz|demitid.*há|faz.*sa[ií]|há.*sa[ií])/i.test(allText);
  const temDocumentos = /(documento|contracheque|contrato|comprovante|mensagen|prova|print|foto)/i.test(allText) && history.length > 4;
  const temAdvogado = /(advogado|advogada|outro advogado|ja procur)/i.test(allText) && history.length > 4;

  // Detectar BLOQUEIOS — casos que NÃO devem ser agendados
  // Detectar PREFEITURA/GOVERNO — cuidado com falsos positivos
  // "serviços gerais", "servidor de internet" etc. NÃO são governo
  const ePrefeitura = /(prefeitura|governo municipal|orgao municipal|órgão municipal|servidor municipal|câmara municipal|camara municipal|trabalhei (na|pra|para|pro) (a )?prefeitura)/i.test(allText);
  const eGoverno = /(servidor (público|publico|estadual|federal)|trabalh\w+ (no|pro|pra|para o) governo|funcionar\w+ public\w+|orgao publico|órgão público)/i.test(allText) && !/(empresa privada|privado|clt|carteira assinada|fazenda|sitio|sítio|rural|roça|roca|agropecuaria|agropecuária|usina|plantacao|plantação)/i.test(allText);
  const semInteresse = /(nao quero|não quero|nao tenho interesse|não tenho interesse|so queria saber|só queria saber|obrigado mas nao|obrigado mas não|nao preciso|não preciso)/i.test(allText);

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
  if (semInteresse) bloqueios.push('LEAD SEM INTERESSE — NAO insista, encerre educadamente.');

  const triagemCompleta = temNome && temTempo && temCarteira && temPrazo;
  const triagemMinima = temNome && (temTempo || temPrazo); // minimo para avaliar viabilidade

  if (!(contexto && (contexto.tipo === 'cliente' || contexto.tipo === 'cliente_processo' || contexto.tipo === 'cliente_processo_pendente'))) {
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
  if (bloqueios.length > 0 && !semInteresse) {
    linhas.push(`\nPROXIMO PASSO: BLOQUEIO. Informe o lead educadamente conforme as regras. NAO agende.`);
  } else if (semInteresse) {
    linhas.push(`\nPROXIMO PASSO: Lead sem interesse. Despeca-se educadamente. NAO insista.`);
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

  // Permitir ate 5 frases e 600 chars para respostas mais completas
  const result = restored.slice(0, 5).join(' ').trim();
  if (result.length > 600) {
    return restored.slice(0, 4).join(' ').trim();
  }
  return result;
}

// ===== HISTÓRICO =====
function buildRecentHistory(history) {
  const recent = history.slice(-10);
  return recent.map(m => ({ role: m.role, content: m.content }));
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
  } catch (e) {}

  const fichaCompleta = `===== FICHA DO LEAD (CONSULTE ANTES DE RESPONDER) =====
${fichaLead}
${agendaSection}
${abSection}
${licoesTexto}
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
    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: config.MAX_TOKENS,
      system: systemPrompt,
      messages: cleanMessages
    });

    return response.content[0].text;
  } catch (e) {
    console.error('[CLAUDE-NPL] Erro:', e.message);
    return 'Desculpe, estou com uma dificuldade tecnica. Entre em contato pelo telefone do escritorio.';
  }
}

// ===== GERAR FOLLOW-UP INTELIGENTE =====
async function generateFollowUp(history, lead, followUpNumber) {
  const nome = (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) ? lead.nome : 'amigo(a)';
  const detalhe = lead?.notas || 'questao trabalhista';

  const userMsgs = (history || []).filter(m => m.role === 'user').map(m => m.content.slice(0, 100));
  const resumo = userMsgs.length > 0 ? userMsgs.slice(-3).join(' / ') : 'sem mensagens anteriores';

  const prompt = `Voce e a Laura, assistente do escritorio NPLADVS (especializado em trabalhista, Belem/PA).
O lead "${nome}" conversou com voce sobre "${detalhe}" mas parou de responder.
Ultimas mensagens do lead: "${resumo}"

Este e o follow-up numero ${followUpNumber}. Gere UMA mensagem curta (2-3 frases) para retomar o contato.

Regras:
- Sem emojis
- Use o nome da pessoa
- REFERENCIE especificamente o que o lead disse (ex: "sobre as horas extras que voce mencionou", "sobre a sua demissao")
- ${followUpNumber === 1 ? 'Pergunte se ficou com alguma duvida sobre o caso dele. Seja leve e especifica.' : ''}
- ${followUpNumber === 2 ? 'Mostre que se importa com a situacao dele. Mencione que a consulta e gratuita e sem compromisso.' : ''}
- ${followUpNumber === 3 ? 'Use argumentos concretos: prazo de 2 anos, consulta gratuita, escritorio so cobra se ganhar. Crie urgencia se o caso permitir.' : ''}
- ${followUpNumber === 4 ? 'Mensagem final, respeitosa. Diga que nao quer incomodar mas esta a disposicao. Mencione que a porta esta aberta.' : ''}
- Nao mencione email. A confirmacao e por WhatsApp.
- Termine conduzindo para o agendamento da consulta gratuita.`;

  try {
    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    });

    const reply = trimResponse(response.content[0].text);
    console.log(`[FOLLOWUP-NPL] Gerado para ${nome}: "${reply.slice(0, 60)}..."`);
    return reply;
  } catch (e) {
    console.error('[FOLLOWUP-NPL] Erro:', e.message);
    return null;
  }
}

module.exports = {
  generateResponse,
  generateFollowUp,
  trimResponse,
  setCalendar
};
