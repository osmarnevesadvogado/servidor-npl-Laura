// ===== ALERTA DE PRAZO PRESCRICIONAL - NPL =====
// Detecta "há quanto tempo saiu" na conversa, calcula tempo restante até 2 anos
// e formata alerta para injetar na ficha do lead.

// Extrai "saiu há X meses/anos" / "saí da empresa em <data>" do texto
function extrairTempoSaida(texto) {
  if (!texto) return null;
  const lower = texto.toLowerCase();

  // "sai ha X anos" / "saí faz X anos" / "parei ha X meses"
  const padraoHa = /(?:sai|sa[ií]|parei|me desliguei|me mandaram|me demitiram|fui demitid[oa]|encerrei).{0,30}?\b(h[aá]|faz|ha)\s+(\d+)\s*(ano|anos|mes(?:es)?|m[eê]s|dias?)/i;
  const m = texto.match(padraoHa);
  if (m) {
    const n = parseInt(m[2]);
    const unidade = m[3].toLowerCase();
    let meses = 0;
    if (unidade.startsWith('ano')) meses = n * 12;
    else if (unidade.startsWith('mes') || unidade.startsWith('mê')) meses = n;
    else if (unidade.startsWith('dia')) meses = n / 30;
    return { mesesDesdeSaida: meses, trechoOriginal: m[0] };
  }

  // "X anos e Y meses atras" (sem mencionar saída explicitamente é arriscado — só aceitar se combinado com "sai"/"parei")
  const padraoCombinado = /(?:sa[ií]|parei|fui (demitid[oa]|mandad[oa])).{0,50}?(\d+)\s*anos?\s*(?:e\s*(\d+)\s*mes(?:es)?)?.{0,15}?(atras|atrás)/i;
  const m2 = texto.match(padraoCombinado);
  if (m2) {
    const anos = parseInt(m2[2]);
    const mesesExtra = m2[3] ? parseInt(m2[3]) : 0;
    return { mesesDesdeSaida: anos * 12 + mesesExtra, trechoOriginal: m2[0] };
  }

  // "ainda trabalho" / "estou na empresa" — sem risco de prescrição
  if (/\b(ainda (estou|trabalho)|continuo (na|no)|t[oô] na empresa|t[oô] lá|estou l[aá])\b/i.test(lower)) {
    return { aindaTrabalha: true };
  }

  return null;
}

// Classifica nível de urgência
function classificar(mesesDesdeSaida) {
  if (mesesDesdeSaida == null) return 'desconhecido';
  const restante = 24 - mesesDesdeSaida; // 2 anos = 24 meses
  if (restante <= 0) return 'prescrito';
  if (restante <= 6) return 'urgente';
  if (restante <= 12) return 'atencao';
  return 'ok';
}

function formatarAlerta(texto) {
  const info = extrairTempoSaida(texto);
  if (!info) return null;
  if (info.aindaTrabalha) {
    return { nivel: 'ok', mensagem: 'Lead ainda empregado — sem risco de prescrição.' };
  }
  const nivel = classificar(info.mesesDesdeSaida);
  const restanteMeses = 24 - info.mesesDesdeSaida;
  const restanteFmt = restanteMeses > 12
    ? `${Math.floor(restanteMeses / 12)} ano(s) e ${Math.round(restanteMeses % 12)} mes(es)`
    : `${Math.round(restanteMeses)} mes(es)`;

  switch (nivel) {
    case 'prescrito':
      return {
        nivel,
        mesesDesdeSaida: Math.round(info.mesesDesdeSaida),
        mensagem: `PRESCRITO: lead saiu há ${Math.round(info.mesesDesdeSaida)} mes(es). Prazo de 2 anos excedido — NÃO agendar, comunicar com empatia.`
      };
    case 'urgente':
      return {
        nivel,
        mesesDesdeSaida: Math.round(info.mesesDesdeSaida),
        mesesRestantes: Math.round(restanteMeses),
        mensagem: `URGENCIA MAXIMA: restam apenas ${restanteFmt} para prescrição. Usar urgência no diálogo e priorizar agendamento rápido.`
      };
    case 'atencao':
      return {
        nivel,
        mesesDesdeSaida: Math.round(info.mesesDesdeSaida),
        mesesRestantes: Math.round(restanteMeses),
        mensagem: `ATENÇÃO: restam ${restanteFmt} até prescrição. Mencionar prazo no diálogo.`
      };
    default:
      return {
        nivel,
        mesesDesdeSaida: Math.round(info.mesesDesdeSaida),
        mesesRestantes: Math.round(restanteMeses),
        mensagem: `Sem urgência imediata: ${restanteFmt} até prescrição.`
      };
  }
}

function formatarParaFicha(alerta) {
  if (!alerta) return null;
  return `PRAZO PRESCRICIONAL: ${alerta.mensagem}`;
}

module.exports = {
  extrairTempoSaida,
  classificar,
  formatarAlerta,
  formatarParaFicha
};
