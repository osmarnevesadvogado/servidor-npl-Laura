// ===== ALERTA DE PRAZO PRESCRICIONAL - NPL =====
// Detecta "há quanto tempo saiu" na conversa, calcula tempo restante até 2 anos
// e formata alerta para injetar na ficha do lead.

// Mapa de meses em portugues
const MESES_PT = {
  jan: 0, janeiro: 0, fev: 1, fevereiro: 1, mar: 2, marco: 2, 'março': 2,
  abr: 3, abril: 3, mai: 4, maio: 4, jun: 5, junho: 5,
  jul: 6, julho: 6, ago: 7, agosto: 7, set: 8, setembro: 8,
  out: 9, outubro: 9, nov: 10, novembro: 10, dez: 11, dezembro: 11
};

function mesesEntre(dataAntiga, dataAtual = new Date()) {
  const anos = dataAtual.getFullYear() - dataAntiga.getFullYear();
  const meses = dataAtual.getMonth() - dataAntiga.getMonth();
  return anos * 12 + meses;
}

// Extrai "saiu há X meses/anos" / "saí da empresa em <data>" / "trabalhei até <data>" do texto
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

  // "saí em mar/2024" / "trabalhei até dezembro de 2023" / "ultimo dia foi janeiro 2024"
  // Captura mes + ano. Importante pra audios transcritos onde o lead fala datas
  // ao inves de "ha X meses".
  const padraoData = /(?:sa[ií]|parei|me desliguei|me mandaram|me demitiram|fui demitid[oa]|encerrei|trabalhei at[eé]|terminei|[uú]ltimo dia)\b[^.]{0,40}?\b(jan(?:eiro)?|fev(?:ereiro)?|mar(?:[çc]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\b[\s\.\/]{0,5}(?:de\s+)?(\d{4})/i;
  const m3 = texto.match(padraoData);
  if (m3) {
    const mesNome = m3[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ano = parseInt(m3[2]);
    const mesIdx = MESES_PT[mesNome] ?? MESES_PT[mesNome.slice(0, 3)];
    if (mesIdx != null && ano >= 2000 && ano <= new Date().getFullYear() + 1) {
      const dataSaida = new Date(ano, mesIdx, 15); // dia 15 do mes (meio do mes pra reduzir off-by-one)
      const meses = mesesEntre(dataSaida);
      if (meses >= 0) {
        return { mesesDesdeSaida: meses, trechoOriginal: m3[0], dataSaida: dataSaida.toISOString().slice(0, 10) };
      }
    }
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
