// ===== FLUXO DE CONVERSA - NPL (Trabalhista) =====
// Etapas: saudacao -> qualificacao -> proposta -> agendamento -> pos_agendamento
// Adaptado para reclamantes trabalhistas

const config = require('./config');
const { ETAPAS } = config;

const conversaEtapas = new Map();

const FLUXO = {
  [ETAPAS.SAUDACAO]: {
    instrucao: `ETAPA: SAUDACAO
Se e a PRIMEIRA mensagem, apresente-se: "Ola! Sou a Laura, do escritorio NPLADVS. Somos especializados em direitos trabalhistas. Me conta, como posso te ajudar?"
Se a pessoa JA disse o assunto junto com o oi, mostre que entendeu e pergunte o nome. Nao repita a apresentacao se ja se apresentou.`,

    avanca: (text, lead) => {
      const lower = text.toLowerCase();
      const temas = ['trabalhist', 'demissão', 'demissao', 'demitid', 'mandaram embora',
        'rescisão', 'rescisao', 'carteira', 'registro', 'salário', 'salario',
        'horas extra', 'hora extra', 'acidente', 'doença', 'doenca',
        'assédio', 'assedio', 'fgts', 'multa', 'aviso prévio', 'aviso previo',
        'férias', 'ferias', 'décimo', 'decimo', '13',
        'problema', 'ajuda', 'preciso', 'quero', 'consulta', 'advogado',
        'dúvida', 'duvida', 'direito', 'patrão', 'patrao', 'empresa',
        'não pago', 'nao pago', 'não pagou', 'nao pagou', 'atraso'];
      return temas.some(t => lower.includes(t));
    },
    proxima: ETAPAS.QUALIFICACAO
  },

  [ETAPAS.QUALIFICACAO]: {
    instrucao: `ETAPA: QUALIFICACAO
Voce ja sabe o assunto trabalhista. Mostre que entendeu o problema e que o escritorio pode ajudar.
Se NAO tem o nome: peca o nome para consultar a agenda.
Se JA tem o nome: confirme que entendeu o caso em 1 frase e pergunte detalhes relevantes (tempo de trabalho, se tem carteira assinada).
LEMBRE: "certo", "isso", "sim" = confirmacao. Avance, nao repita.
Maximo 2 trocas aqui, depois proponha agendar.`,

    avanca: (text, lead) => {
      if (lead && lead.nome && !lead.nome.startsWith('WhatsApp')) {
        return true;
      }
      const lower = text.toLowerCase();
      return lower.includes('como funciona') || lower.includes('quanto custa') ||
             lower.includes('como faz') || lower.includes('quero saber mais');
    },
    proxima: ETAPAS.PROPOSTA
  },

  [ETAPAS.PROPOSTA]: {
    instrucao: `ETAPA: PROPOSTA
Chame pelo NOME. O foco agora e AGENDAR, nao perguntar mais sobre o problema.
Se nao tem EMAIL: peca o email para enviar a confirmacao.
Se ja tem email: "Deixa eu consultar a agenda..." e proponha horarios.
Tom profissional: "Temos disponibilidade essa semana" / "Consigo encaixar um horario para voce".
NAO repita informacoes do caso. Avance para o agendamento.`,

    avanca: (text, lead) => {
      const lower = text.toLowerCase();
      const sinaisAgendamento = ['pode ser', 'vamos', 'quero agendar', 'marca', 'agenda',
        'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'amanhã', 'hoje',
        'de manhã', 'à tarde', 'horário', 'bora', 'fechado', 'combinado'];
      const temHorario = /\d{1,2}\s*h|\d{1,2}:\d{2}/.test(lower);
      return temHorario || sinaisAgendamento.some(s => lower.includes(s));
    },
    proxima: ETAPAS.AGENDAMENTO
  },

  [ETAPAS.AGENDAMENTO]: {
    instrucao: '',
    instrucaoDinamica: true,

    avanca: (text, lead) => {
      const lower = text.toLowerCase();
      const temHorario = /\d{1,2}\s*h|\d{1,2}:\d{2}/.test(lower);
      return temHorario || lower.includes('ok') || lower.includes('combinado') || lower.includes('fechado') ||
             lower.includes('perfeito') || lower.includes('confirmado') || lower.includes('pode ser') ||
             lower.includes('online') || lower.includes('presencial') ||
             lower.includes('certo') || lower.includes('isso') || lower.includes('sim') ||
             lower.includes('esse') || lower.includes('quero') || lower.includes('tá bom') ||
             lower.includes('ta bom') || lower.includes('beleza');
    },
    proxima: ETAPAS.POS_AGENDAMENTO
  },

  [ETAPAS.POS_AGENDAMENTO]: {
    instrucao: `ETAPA: POS-AGENDAMENTO
A consulta foi agendada. Confirme data/hora e diga: "Qualquer duvida antes da consulta, estou a disposicao."
Se perguntarem algo, responda. Se quiserem remarcar, ajude.
Nao tente vender de novo. Tom cordial e profissional.`,

    avanca: () => false,
    proxima: null
  }
};

function getEtapa(conversaId) {
  return conversaEtapas.get(conversaId) || ETAPAS.SAUDACAO;
}

function setEtapa(conversaId, etapa) {
  if (FLUXO[etapa]) {
    conversaEtapas.set(conversaId, etapa);
  }
}

function processarEtapa(conversaId, text, lead) {
  const etapaAtual = getEtapa(conversaId);
  const fluxo = FLUXO[etapaAtual];

  if (!fluxo) return etapaAtual;

  if (fluxo.avanca(text, lead) && fluxo.proxima) {
    const novaEtapa = fluxo.proxima;
    conversaEtapas.set(conversaId, novaEtapa);
    console.log(`[FLUXO-NPL] ${conversaId}: ${etapaAtual} -> ${novaEtapa}`);
    return novaEtapa;
  }

  return etapaAtual;
}

async function getInstrucaoEtapa(conversaId, horariosTexto) {
  const etapa = getEtapa(conversaId);
  const fluxo = FLUXO[etapa];

  if (!fluxo) return FLUXO[ETAPAS.SAUDACAO].instrucao;

  if (fluxo.instrucaoDinamica && horariosTexto) {
    return `ETAPA ATUAL: AGENDAMENTO
Seu objetivo agora: confirmar dia, horario e formato da consulta.

HORARIOS DISPONIVEIS (consulte a agenda real):
${horariosTexto}

- Ofereca 2 ou 3 desses horarios para a pessoa escolher
- Pergunte se prefere presencial (Belem/PA) ou online
- Se ainda nao tem email, peca agora
- Quando confirmar: "Perfeito! Consulta marcada pra [dia] as [hora], [formato]. A equipe do NPLADVS vai te atender!"
- NUNCA invente horarios, use SOMENTE os listados acima`;
  }

  return fluxo.instrucao || FLUXO[ETAPAS.SAUDACAO].instrucao;
}

function cleanup() {
  if (conversaEtapas.size > 500) {
    const keys = [...conversaEtapas.keys()];
    keys.slice(0, 200).forEach(k => conversaEtapas.delete(k));
  }
}

module.exports = {
  getEtapa,
  setEtapa,
  processarEtapa,
  getInstrucaoEtapa,
  cleanup,
  FLUXO
};
