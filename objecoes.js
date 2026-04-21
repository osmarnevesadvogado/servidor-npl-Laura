// ===== DETECÇÃO DE OBJEÇÕES - NPL =====
// Identifica padrões de objeção do lead para injetar estratégia contextualizada na Laura

const PADROES = [
  {
    tipo: 'preco',
    patterns: [
      /\b(caro|custoso|nao tenho dinheiro|não tenho dinheiro|sem condic|sem grana|ta apertado|tá apertado|nao posso pagar|não posso pagar|quanto custa|qual (o )?valor|quanto cobra|quanto vai custar|cobran)\b/i
    ],
    estrategia: 'A consulta inicial e GRATUITA. Na maioria dos casos trabalhistas o escritorio so cobra se ganhar — sem risco financeiro. Reforce que o lead NADA paga na consulta.'
  },
  {
    tipo: 'pensar',
    patterns: [
      /\b(vou pensar|deixa eu pensar|preciso pensar|depois falo|depois eu vejo|te falo depois|te aviso depois|qualquer coisa te chamo|semana que vem|mes que vem|agora nao|agora não da|agora não dá)\b/i
    ],
    estrategia: 'Proponha reservar horario por 24h SEM COMPROMISSO. Lembre do prazo de 2 anos (urgencia). NAO insista, mas deixe a porta aberta.'
  },
  {
    tipo: 'ja_tem_advogado',
    patterns: [
      /\b(ja tenho advogado|já tenho advogado|meu advogado|ja estou com advogad|já estou com advogad|outro escritor|ja contratei|já contratei|ja tem advogad|já tem advogad)\b/i
    ],
    estrategia: 'Respeite a escolha. Ofereca segunda opiniao GRATUITA e sem compromisso. Se nao quiser, encerre educadamente.'
  },
  {
    tipo: 'desconfianca',
    patterns: [
      /\b(funciona mesmo|nao confio|não confio|sera que vale|será que vale|e golpe|é golpe|enganaçao|enganação|e confiavel|é confiável|posso confiar|tem certeza)\b/i
    ],
    estrategia: 'Reforce credibilidade: anos de atuacao, centenas de casos ajudados. Destaque que so cobram se ganhar — alinhamento de interesses. Consulta gratuita serve para o lead AVALIAR o escritorio.'
  },
  {
    tipo: 'medo_retaliacao',
    patterns: [
      /\b(medo|tenho receio|e se a empresa|se o patrao|se a empresa descobrir|vou arrumar problema|nao quero processo|não quero processo|nao quero briga|não quero briga|empresa vai saber)\b/i
    ],
    estrategia: 'Acolha o medo. Explique que a acao trabalhista e DIREITO do trabalhador e nao gera represalia legal — a empresa nao pode retaliar por isso. Muitos processos sao resolvidos em acordo, sem precisar ir a julgamento.'
  },
  {
    tipo: 'tempo',
    patterns: [
      /\b(demora muito|processo demora|nunca vou receber|quanto tempo|anos pra receber|vai demorar)\b/i
    ],
    estrategia: 'Seja realista: processos trabalhistas normalmente duram 1 a 2 anos, mas muitos terminam em ACORDO antes. O importante e nao perder o prazo de 2 anos para ABRIR a acao — esse sim e inegociavel.'
  },
  {
    tipo: 'duvida_caso',
    patterns: [
      /\b(meu caso (tem|da|dá)|sera que tenho direito|será que tenho direito|nao sei se|não sei se|talvez nao|talvez não|acho que nao|acho que não)\b/i
    ],
    estrategia: 'Reforce a viabilidade com base nos fatos ja coletados. Lembre que a CONSULTA EXISTE justamente para o advogado avaliar em detalhe — sem compromisso. Nao prometa resultado.'
  }
];

// Retorna lista de objeções detectadas no texto do lead
function detectarObjecoes(texto) {
  if (!texto) return [];
  const detectadas = [];
  for (const regra of PADROES) {
    if (regra.patterns.some(p => p.test(texto))) {
      detectadas.push({ tipo: regra.tipo, estrategia: regra.estrategia });
    }
  }
  return detectadas;
}

// Formata as objeções detectadas como bloco injetável na ficha do lead
function formatarParaFicha(objecoes) {
  if (!objecoes || objecoes.length === 0) return null;
  const linhas = ['OBJECOES DETECTADAS:'];
  for (const o of objecoes) {
    linhas.push(`- ${o.tipo.toUpperCase()}: ${o.estrategia}`);
  }
  return linhas.join('\n');
}

module.exports = {
  detectarObjecoes,
  formatarParaFicha,
  PADROES
};
