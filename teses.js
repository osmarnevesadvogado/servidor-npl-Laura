// ===== TESES TRABALHISTAS - NPL =====
// Identifica o tipo de caso e fornece contexto técnico para a Laura personalizar a abordagem.
// Cada tese tem: padrões de detecção, argumentos específicos, perguntas de aprofundamento e valor típico.

const TESES = {
  rescisao_indireta: {
    titulo: 'Rescisão Indireta',
    patterns: [
      /rescis.{0,15}indireta|justa causa do (empregador|patrao|patrão|empresa)|empresa descumpr|empresa n[aã]o pag|atraso de sal[aá]rio|n[aã]o recolh.{0,10}(fgts|inss)|obrigand.{0,15}fazer|humilh|ofensa|agress|me expuseram|trabalho insalubre sem adicional/i
    ],
    argumentos: 'Rescisao indireta e a "justa causa do empregador". O trabalhador pode sair e receber TUDO como se fosse demitido sem justa causa (aviso previo, FGTS+40%, seguro-desemprego). Casos fortes: atraso recorrente de salario, falta de FGTS/INSS, assedio moral, desvio de funcao sem pagamento.',
    perguntas: [
      'Ha quanto tempo vem acontecendo isso?',
      'Voce ainda esta na empresa ou ja saiu?',
      'Tem provas? Testemunhas, mensagens, prints?'
    ]
  },
  horas_extras: {
    titulo: 'Horas Extras',
    patterns: [
      /hora.?s? extra|trabalh.{0,15}alem do horario|fim de semana.*(trabalh|serv)|feriado.*(trabalh|serv)|banco de hora|passav.{0,10}das 8|das \d+ (da noite|da madrugada)|carga.{0,10}hor[aá]ria|sem pausa|sem intervalo|intervalo.*almoc/i
    ],
    argumentos: 'Jornada acima de 44h/semana gera hora extra com adicional MINIMO 50% (100% fim de semana/feriado). Intervalo de almoco nao concedido vale 1h extra por dia com 50%. Retroativo de ate 5 anos. Em casos com banco de horas irregular, valor vira significativo rapidamente.',
    perguntas: [
      'Qual era sua jornada (entrada, saida, almoco)?',
      'Trabalhava fim de semana ou feriado?',
      'Tinha algum registro de ponto (biometria, app, planilha)?'
    ]
  },
  sem_registro: {
    titulo: 'Reconhecimento de Vínculo (sem carteira)',
    patterns: [
      /sem carteira|n[aã]o (me )?registr|pagav.{0,10}(por fora|em dinheiro)|sem assinatura na carteira|informal|trabalh.{0,15}bico|fich[ãa] virtual|p[jJ] forc|pejot[iao]|contrat.{0,15}cnpj|carteira vazia/i
    ],
    argumentos: 'Trabalho sem registro e direito automatico de reconhecimento de vinculo se ha subordinacao, pessoalidade, nao eventualidade e onerosidade (art. 3o CLT). Alem do reconhecimento, o trabalhador tem direito a TODAS as verbas de todo o periodo (FGTS, 13o, ferias, horas extras) dos ultimos 5 anos. Valores costumam ser ALTOS.',
    perguntas: [
      'Quanto tempo voce trabalhou assim?',
      'Qual era seu salario e a funcao?',
      'Tem prova do vinculo (mensagens, pagamentos, testemunhas, uniforme, cracha)?'
    ]
  },
  acidente_doenca: {
    titulo: 'Acidente de Trabalho / Doença Ocupacional',
    patterns: [
      /acident.{0,10}(trabalho|servi|empresa)|me machuquei|quebrei|fraturei|cai no servi[cç]o|LER|DORT|tendinite|ler\/dort|hernia|coluna|afastado pelo inss|auxilio doen[cç]a|b.?31|b.?91|cat[^a-z]|doen[cç]a ocupacional|estabilidade acident/i
    ],
    argumentos: 'Acidente de trabalho ou doenca ocupacional garante ESTABILIDADE de 12 meses apos o retorno, FGTS mesmo afastado e indenizacao por danos morais/materiais. Se a empresa nao emitiu CAT, cabe acao. Se houve sequela, cabe pensao vitalicia. Valores de indenizacao costumam ser ALTOS.',
    perguntas: [
      'O INSS concedeu auxilio-doenca? Foi B91 (acidentario) ou B31 (comum)?',
      'A empresa emitiu CAT?',
      'Ha sequela ou limitacao para o trabalho?'
    ]
  },
  assedio: {
    titulo: 'Assédio Moral / Sexual',
    patterns: [
      /assedi|humilh|ofens|me xingav|gritava comigo|me chamav.{0,15}(de|palavr)|me expo[sa]|expuseram|exposto na frente|passava vergonha|cham.{0,10}pervers|cantada|pegou em mim|encostou em mim|investida|abuso/i
    ],
    argumentos: 'Assedio moral ou sexual no trabalho gera direito a indenizacao por dano moral (valores entre R$ 5.000 a R$ 50.000+ dependendo da gravidade) e justifica rescisao indireta (receber tudo como demitido sem justa causa). Empresa responde objetivamente pelos atos do supervisor.',
    perguntas: [
      'Quem praticava o assedio? (chefe, colega, cliente)',
      'Com que frequencia? Ha testemunhas?',
      'Tem provas (mensagens, audios, prints)?'
    ]
  },
  verbas_rescisorias: {
    titulo: 'Verbas Rescisórias Não Pagas',
    patterns: [
      /n[aã]o (me )?pag(ou|aram)|fui (mandado|demitido).{0,20}(sem|nao)|sa[ií] e nao recebi|n[aã]o recebi a rescis|verbas rescis|acerto|TRCT|multa de 40|seguro desemprego|n[aã]o liberaram.*(fgts|seguro)|nao saquei|n[aã]o (dei|consegui) (entrada|sacar)/i
    ],
    argumentos: 'Se saiu e nao recebeu rescisao no prazo (10 dias), cabe acao com verbas + MULTA DO ART. 477 (1 salario) + correcao + juros. Pode ser demissao sem justa causa que a empresa simula como pedido de demissao — cabe reverter e receber tudo.',
    perguntas: [
      'Quando voce saiu da empresa?',
      'Que valor foi pago, se algum?',
      'Tem o TRCT (termo de rescisao)?'
    ]
  },
  adicional_insalubridade: {
    titulo: 'Adicional de Insalubridade / Periculosidade',
    patterns: [
      /insalubridade|periculosidade|adicional noturno|trabalho.{0,10}(calor|frio|ruido|ruído|barulho|produto quimico|químico|inflamavel|gas|combustivel)|area de risco|vigilante|risco de vida/i
    ],
    argumentos: 'Insalubridade (10%, 20% ou 40% sobre o minimo) e periculosidade (30% sobre salario base) sao direitos de quem trabalha exposto a agentes nocivos/perigo. Retroativo de 5 anos. Valores aumentam a base de calculo de ferias, 13o, FGTS. Normalmente a empresa nao paga e o direito se descobre so na acao.',
    perguntas: [
      'Em que condicoes voce trabalhava? (calor, ruido, produtos quimicos, etc)',
      'Recebia algum adicional no salario?',
      'Usava EPI? Qual?'
    ]
  }
};

// Detecta a tese mais provável a partir do texto da conversa
function detectarTese(texto) {
  if (!texto) return null;
  const pontuacao = {};
  for (const [id, tese] of Object.entries(TESES)) {
    let matches = 0;
    for (const pattern of tese.patterns) {
      const encontrados = texto.match(new RegExp(pattern.source, pattern.flags + 'g')) || [];
      matches += encontrados.length;
    }
    if (matches > 0) pontuacao[id] = matches;
  }
  if (Object.keys(pontuacao).length === 0) return null;
  // Retornar tese com mais matches (+ lista de teses secundárias)
  const ordenadas = Object.entries(pontuacao).sort(([, a], [, b]) => b - a);
  return {
    principal: ordenadas[0][0],
    todas: ordenadas.map(([id]) => id)
  };
}

// Formata o bloco de contexto técnico para injetar na ficha do lead
function formatarParaFicha(detectado) {
  if (!detectado) return null;
  const tese = TESES[detectado.principal];
  if (!tese) return null;

  const linhas = [`TESE PROVAVEL: ${tese.titulo}`];
  linhas.push(`- Contexto tecnico: ${tese.argumentos}`);
  if (tese.perguntas && tese.perguntas.length > 0) {
    linhas.push(`- Perguntas uteis para aprofundar (se ainda nao foi respondido): ${tese.perguntas.join(' | ')}`);
  }
  if (detectado.todas.length > 1) {
    const secundarias = detectado.todas.slice(1).map(id => TESES[id].titulo).join(', ');
    linhas.push(`- Possiveis teses adicionais: ${secundarias}`);
  }
  return linhas.join('\n');
}

module.exports = {
  TESES,
  detectarTese,
  formatarParaFicha
};
