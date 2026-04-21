// ===== DETECÇÃO DE ALUCINAÇÃO - NPL =====
// Procura por promessas / afirmações fora da política que a Laura não pode fazer.
// Retorna lista de flags + severidade. Usado para auditoria e alerta, não bloqueia envio.

const REGRAS = [
  {
    tipo: 'garantia_resultado',
    severidade: 'alta',
    descricao: 'Garantia de resultado / ganho de causa',
    patterns: [
      /\b(garant[oi]|garantimos|te asseguro|asseguramos|com certeza (voce|vc|você) (vai )?(gan|receb)|voce vai ganhar|vc vai ganhar|você vai ganhar|(a causa|o caso) e ganho|100\s*%\s*(de )?(chance|certeza)|prometo que (voce|vc|você) (vai )?(gan|receb))\b/i
    ]
  },
  {
    tipo: 'valor_definitivo',
    severidade: 'alta',
    descricao: 'Valor exato prometido sem ressalva de estimativa',
    patterns: [
      // "voce (vai/vc vai) receber R$ X" sem palavras como "estimativa", "media", "aproxim"
      /\b(voce|vc|você) (vai|ira|irá) receber\b(?!.*(estimativa|aproxim|em m[eé]dia|em torno|por volta))/i,
      /\b(o valor e|valor final|valor total)\b.*r\$\s*\d/i
    ]
  },
  {
    tipo: 'prazo_definitivo',
    severidade: 'media',
    descricao: 'Prazo exato de encerramento do processo',
    patterns: [
      /\b(o processo (vai |ira |irá )?(acabar|terminar|ser encerrado) em|a a[cç][aã]o termina em|voce recebe em)\s+\d+\s*(dia|semana|mes|m[eê]s|ano)/i
    ]
  },
  {
    tipo: 'falsa_credencial',
    severidade: 'alta',
    descricao: 'Falsa credencial ou superlativo sobre o escritório',
    patterns: [
      /\b(nunca perdemos|nunca perdi|somos os melhores|melhor escritorio|melhor escritório|escritorio numero 1|escrit[oó]rio n.?mero 1|ganhamos todos)\b/i
    ]
  },
  {
    tipo: 'conselho_juridico_final',
    severidade: 'media',
    descricao: 'Conselho jurídico conclusivo (competência do advogado na consulta)',
    patterns: [
      /\b(voc[eê]|vc)\s+deve\s+entrar\s+com\s+a\s+a[cç][aã]o\b/i,
      /\brecomendo\s+.{0,10}\s*entrar\s+com\s+a\s+a[cç][aã]o\b/i,
      /\bprocesse\s+imediatamente\b/i,
      /\bn[aã]o\s+aceite\s+(o|qualquer)\s+acordo\b/i
    ]
  },
  {
    tipo: 'honorario_fora_politica',
    severidade: 'alta',
    descricao: 'Menção a honorários / percentuais fora da política (só o advogado define)',
    patterns: [
      /\bcobramos\s+\d+\s*%|honor[aá]rios?\s+(de|s[aã]o)\s+\d+\s*%|taxa\s+de\s+\d+\s*%/i
    ]
  }
];

/**
 * Analisa uma resposta da Laura em busca de alucinações.
 * @param {string} texto - resposta gerada
 * @returns {{flags: Array<{tipo,severidade,descricao,trecho}>, severidadeMax: string|null}}
 */
function analisar(texto) {
  if (!texto || typeof texto !== 'string') return { flags: [], severidadeMax: null };

  const flags = [];
  for (const regra of REGRAS) {
    for (const pattern of regra.patterns) {
      const m = texto.match(pattern);
      if (m) {
        flags.push({
          tipo: regra.tipo,
          severidade: regra.severidade,
          descricao: regra.descricao,
          trecho: m[0]
        });
        break; // não repetir a mesma regra várias vezes
      }
    }
  }

  const ordem = { alta: 3, media: 2, baixa: 1 };
  const severidadeMax = flags.reduce((max, f) => {
    if (!max) return f.severidade;
    return ordem[f.severidade] > ordem[max] ? f.severidade : max;
  }, null);

  return { flags, severidadeMax };
}

module.exports = { analisar, REGRAS };
