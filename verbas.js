// ===== CALCULADORA DE VERBAS RESCISÓRIAS - NPL =====
// Estimativas preliminares baseadas na CLT para mostrar ao lead "quanto pode receber".
// IMPORTANTE: valores são ESTIMATIVAS — sempre deixar claro que o cálculo final é do advogado.

const MOTIVOS = {
  SEM_JUSTA_CAUSA: 'sem_justa_causa',      // demitido sem justa causa
  COM_JUSTA_CAUSA: 'com_justa_causa',      // demitido por justa causa
  PEDIDO_DEMISSAO: 'pedido_demissao',      // pediu demissão
  ACORDO: 'acordo',                        // demissão em acordo (Lei 13.467)
  RESCISAO_INDIRETA: 'rescisao_indireta',  // "justa causa do empregador" — lead recebe tudo
  TERMINO_CONTRATO: 'termino_contrato'     // contrato por prazo determinado encerrou
};

/**
 * Calcula estimativa de verbas rescisórias.
 *
 * @param {Object} params
 * @param {number} params.salario       - último salário bruto mensal (R$)
 * @param {number} params.mesesTrabalho - quantos meses trabalhou (total, incluindo frações)
 * @param {string} params.motivo        - uma das chaves de MOTIVOS
 * @param {boolean} params.carteiraAssinada - se tinha carteira assinada
 * @param {number} [params.mesesAviso=1]  - aviso prévio em meses (1 mês + 3 dias por ano de vínculo)
 * @returns {Object} { verbas: {nome, valor, base}, total, observacoes }
 */
function calcularRescisao({ salario, mesesTrabalho, motivo, carteiraAssinada = true, mesesAviso = null }) {
  if (!salario || salario <= 0) {
    return { erro: 'Salário inválido' };
  }
  if (!mesesTrabalho || mesesTrabalho <= 0) {
    return { erro: 'Tempo de trabalho inválido' };
  }

  const anos = mesesTrabalho / 12;
  const verbas = [];

  // Saldo de salário (média de 15 dias do último mês — estimativa)
  const saldoSalario = salario / 2;
  verbas.push({ nome: 'Saldo de salário', valor: saldoSalario, base: '15 dias do último mês' });

  // Aviso prévio (proporcional: 30 dias + 3 dias/ano, máx 90 dias)
  const diasAviso = Math.min(30 + 3 * Math.floor(anos), 90);
  const avisoPrevio = (salario / 30) * diasAviso;

  // 13º proporcional (meses trabalhados no ano / 12 * salário)
  const mesesNoAno = Math.min(mesesTrabalho, 12);
  const decimoTerceiro = (salario / 12) * mesesNoAno;
  verbas.push({ nome: '13º proporcional', valor: decimoTerceiro, base: `${mesesNoAno.toFixed(1)} meses do ano atual` });

  // Férias proporcionais + 1/3
  const feriasProp = (salario / 12) * mesesNoAno;
  const tercoFerias = feriasProp / 3;
  verbas.push({ nome: 'Férias proporcionais', valor: feriasProp, base: `${mesesNoAno.toFixed(1)}/12 avos` });
  verbas.push({ nome: '1/3 constitucional', valor: tercoFerias, base: 'sobre férias proporcionais' });

  // Férias vencidas (se trabalhou mais de 12 meses sem tirar — estimativa conservadora: 1 período se >18 meses)
  if (mesesTrabalho >= 18) {
    const feriasVencidas = salario + (salario / 3);
    verbas.push({ nome: 'Férias vencidas + 1/3', valor: feriasVencidas, base: 'estimativa — confirmar na consulta' });
  }

  // FGTS: 8% ao mês sobre todo o vínculo + multa 40% se sem justa causa / indireta
  const fgtsDepositado = salario * 0.08 * mesesTrabalho;

  let multaFgts = 0;
  let observacoes = [];

  switch (motivo) {
    case MOTIVOS.SEM_JUSTA_CAUSA:
    case MOTIVOS.RESCISAO_INDIRETA:
      verbas.push({ nome: 'Aviso prévio indenizado', valor: avisoPrevio, base: `${diasAviso} dias` });
      multaFgts = fgtsDepositado * 0.40;
      verbas.push({ nome: 'Multa 40% do FGTS', valor: multaFgts, base: 'sobre saldo depositado estimado' });
      observacoes.push('Lead pode sacar FGTS integral e receber seguro-desemprego');
      if (motivo === MOTIVOS.RESCISAO_INDIRETA) {
        observacoes.push('Rescisão indireta precisa ser reconhecida judicialmente — cabe ação trabalhista');
      }
      break;

    case MOTIVOS.ACORDO:
      verbas.push({ nome: 'Aviso prévio (50%)', valor: avisoPrevio / 2, base: `${diasAviso} dias × 50%` });
      multaFgts = fgtsDepositado * 0.20;
      verbas.push({ nome: 'Multa 20% do FGTS', valor: multaFgts, base: 'acordo (Lei 13.467/17)' });
      observacoes.push('Em acordo: pode sacar 80% do FGTS, NÃO tem direito a seguro-desemprego');
      break;

    case MOTIVOS.COM_JUSTA_CAUSA:
      observacoes.push('Justa causa: perde aviso prévio, multa FGTS, seguro-desemprego e saque do FGTS');
      observacoes.push('Avaliar se justa causa foi aplicada corretamente — pode ser revertida');
      break;

    case MOTIVOS.PEDIDO_DEMISSAO:
      observacoes.push('Pedido de demissão: não tem direito a aviso prévio indenizado, multa FGTS nem seguro-desemprego');
      observacoes.push('Pode sacar FGTS apenas em situações específicas');
      break;

    case MOTIVOS.TERMINO_CONTRATO:
      observacoes.push('Término de contrato por prazo determinado: sem aviso prévio nem multa FGTS');
      break;
  }

  // Verbas que dependem de direitos não respeitados (para o advogado calcular)
  const verbasAdicionais = [
    'Horas extras (+ 50% ou 100%) dos últimos 5 anos, se houver',
    'Adicional noturno, insalubridade ou periculosidade, se aplicável',
    'Eventual indenização por dano moral (assédio, situação degradante)',
    'Diferenças salariais, se houve promoção não formalizada'
  ];

  if (!carteiraAssinada) {
    observacoes.push('SEM CARTEIRA: ação de reconhecimento de vínculo + todas as verbas dos últimos 5 anos');
    observacoes.push('Valor pode ser muito maior — FGTS retroativo, 13º, férias, INSS de todo o período');
  }

  const total = verbas.reduce((s, v) => s + v.valor, 0);

  return {
    verbas,
    total,
    fgts_estimado: fgtsDepositado,
    observacoes,
    verbas_adicionais_a_apurar: verbasAdicionais,
    mesesAviso: diasAviso / 30,
    disclaimer: 'Valores são ESTIMATIVAS. O cálculo final considera particularidades do contrato e será feito na consulta pelo advogado.'
  };
}

// Formata resposta para o WhatsApp (mensagem curta, em reais)
function formatarPreviaParaLead(resultado, nome) {
  if (resultado.erro) return null;
  const BRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const principais = resultado.verbas
    .filter(v => v.valor > 0)
    .map(v => `- ${v.nome}: ${BRL(v.valor)}`)
    .join('\n');

  const saudacao = nome ? `${nome}, fiz uma ` : 'Fiz uma ';

  return `${saudacao}estimativa preliminar do que voce pode receber:\n\n${principais}\n\nTotal estimado: ${BRL(resultado.total)}\n\nIsso e so uma previa — na consulta o advogado calcula tudo com precisao, incluindo horas extras, adicionais e outras verbas que podem aumentar bastante esse valor.`;
}

// Detecta se o lead já informou salário e tempo na conversa
function extrairDadosDaConversa(texto) {
  const lower = texto.toLowerCase();
  const dados = {};

  // Salário: "ganhava 2500", "salario de 3 mil", "recebia R$ 1800"
  const salarioMatch = texto.match(/(?:ganhav|salario|recebi|salário)[a-z]*\s*(?:de\s*)?(?:r?\$\s*)?(\d+(?:[.,]\d+)?)\s*(mil|k)?/i);
  if (salarioMatch) {
    let valor = parseFloat(salarioMatch[1].replace(',', '.'));
    if (salarioMatch[2]) valor *= 1000;
    dados.salario = valor;
  }

  // Tempo: "trabalhei 5 anos", "3 anos de empresa", "2 anos e 6 meses"
  const anosMatch = lower.match(/(\d+)\s*anos?(?:\s*e\s*(\d+)\s*mes)?/);
  const mesesMatch = lower.match(/(\d+)\s*mes(?:es)?/);
  if (anosMatch) {
    const anos = parseInt(anosMatch[1]);
    const meses = anosMatch[2] ? parseInt(anosMatch[2]) : 0;
    dados.mesesTrabalho = anos * 12 + meses;
  } else if (mesesMatch) {
    dados.mesesTrabalho = parseInt(mesesMatch[1]);
  }

  // Motivo
  if (/demiti.{0,20}(sem justa|injusta|arbitrari)/.test(lower) || /mandaram embora|fui mandado|botaram pra fora|pegaram minha conta/.test(lower)) {
    dados.motivo = MOTIVOS.SEM_JUSTA_CAUSA;
  } else if (/justa causa/.test(lower) && !/sem justa/.test(lower)) {
    dados.motivo = MOTIVOS.COM_JUSTA_CAUSA;
  } else if (/pedi (a )?demiss|me mandei|sai da empres/.test(lower)) {
    dados.motivo = MOTIVOS.PEDIDO_DEMISSAO;
  } else if (/acordo|rescis.{0,15}acordo|demiss.{0,15}acordo/.test(lower)) {
    dados.motivo = MOTIVOS.ACORDO;
  } else if (/rescis.{0,15}indireta|justa causa do (empregador|patrao|patrão)|empresa nao cumpr/.test(lower)) {
    dados.motivo = MOTIVOS.RESCISAO_INDIRETA;
  }

  // Carteira
  if (/sem carteira|nao (foi |era )?registrad|sem registro|pagava por fora|tudo por fora/.test(lower)) {
    dados.carteiraAssinada = false;
  } else if (/com carteira|carteira assinada|registrad/.test(lower)) {
    dados.carteiraAssinada = true;
  }

  return dados;
}

module.exports = {
  MOTIVOS,
  calcularRescisao,
  formatarPreviaParaLead,
  extrairDadosDaConversa
};
