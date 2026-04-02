// ===== INTEGRAÇÃO GOOGLE CALENDAR - NPLADVS =====
// Agenda separada: "Consultas NPL - Laura"
// Horários: 08-12h e 14-17h (seg-sex, com intervalo de almoço)
// Rodízio: Dra Luma, Dra Sophia, Luiza
// Feriados nacionais considerados
// Lock contra agendamentos duplicados

const { google } = require('googleapis');
const config = require('./config');

// Configurar autenticação com Service Account
function getCalendarClient() {
  const credStr = config.GOOGLE_CALENDAR_CREDENTIALS;
  if (!credStr) {
    console.error('[CALENDAR-NPL] GOOGLE_CALENDAR_CREDENTIALS não configurada');
    return null;
  }

  let credentials;
  try {
    credentials = JSON.parse(credStr);
  } catch (e) {
    console.error('[CALENDAR-NPL] Erro ao parsear credenciais:', e.message);
    return null;
  }

  if (!credentials.client_email || !credentials.private_key) {
    console.error('[CALENDAR-NPL] Credenciais incompletas (falta client_email ou private_key)');
    return null;
  }

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );

  return google.calendar({ version: 'v3', auth });
}

// ID da agenda "Consultas NPL - Laura"
const CALENDAR_ID = config.GOOGLE_CALENDAR_ID;

// Horário comercial (em horário de Belém) — COM intervalo de almoço
const HORARIOS_MANHA = { inicio: 8, fim: 12 };  // 08h às 12h
const HORARIOS_TARDE = { inicio: 14, fim: 17 }; // 14h às 17h
const DURACAO_CONSULTA = 60; // minutos
const TIMEZONE = 'America/Belem';
const UTC_OFFSET = -3; // Belém = UTC-3

// ===== RODÍZIO DE COLABORADORAS =====
const COLABORADORAS = ['Dra. Luma', 'Dra. Sophia', 'Luiza'];
let rodizioIndex = 0; // Índice atual do rodízio (em memória)

function getProximaColaboradora() {
  const colaboradora = COLABORADORAS[rodizioIndex % COLABORADORAS.length];
  rodizioIndex++;
  return colaboradora;
}

// Determinar colaboradora com base nos eventos existentes (para manter equilíbrio)
function determinarColaboradora(eventosExistentes) {
  // Contar quantas consultas cada colaboradora já tem no período
  const contagem = {};
  COLABORADORAS.forEach(c => contagem[c] = 0);

  for (const ev of eventosExistentes) {
    for (const c of COLABORADORAS) {
      if (ev.summary && ev.summary.includes(c)) {
        contagem[c]++;
        break;
      }
    }
  }

  // Retornar a que tem menos consultas agendadas
  let menor = Infinity;
  let escolhida = COLABORADORAS[0];
  for (const c of COLABORADORAS) {
    if (contagem[c] < menor) {
      menor = contagem[c];
      escolhida = c;
    }
  }

  console.log(`[CALENDAR-NPL] Rodízio: ${JSON.stringify(contagem)} -> ${escolhida}`);
  return escolhida;
}

// ===== FERIADOS NACIONAIS 2025-2027 =====
const FERIADOS = [
  // 2025
  '2025-01-01', // Confraternização Universal
  '2025-03-03', // Carnaval (segunda)
  '2025-03-04', // Carnaval (terça)
  '2025-04-18', // Sexta-feira Santa
  '2025-04-21', // Tiradentes
  '2025-05-01', // Dia do Trabalho
  '2025-06-19', // Corpus Christi
  '2025-09-07', // Independência
  '2025-10-12', // Nossa Sra. Aparecida
  '2025-11-02', // Finados
  '2025-11-15', // Proclamação da República
  '2025-12-25', // Natal
  // 2026
  '2026-01-01', // Confraternização Universal
  '2026-02-16', // Carnaval (segunda)
  '2026-02-17', // Carnaval (terça)
  '2026-04-03', // Sexta-feira Santa
  '2026-04-21', // Tiradentes
  '2026-05-01', // Dia do Trabalho
  '2026-06-04', // Corpus Christi
  '2026-09-07', // Independência
  '2026-10-12', // Nossa Sra. Aparecida
  '2026-11-02', // Finados
  '2026-11-15', // Proclamação da República
  '2026-12-25', // Natal
  // 2027
  '2027-01-01', // Confraternização Universal
  '2027-02-08', // Carnaval (segunda)
  '2027-02-09', // Carnaval (terça)
  '2027-03-26', // Sexta-feira Santa
  '2027-04-21', // Tiradentes
  '2027-05-01', // Dia do Trabalho
  '2027-05-27', // Corpus Christi
  '2027-09-07', // Independência
  '2027-10-12', // Nossa Sra. Aparecida
  '2027-11-02', // Finados
  '2027-11-15', // Proclamação da República
  '2027-12-25', // Natal
];

function isFeriado(ano, mes, dia) {
  const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return FERIADOS.includes(dateStr);
}

// ===== LOCK CONTRA AGENDAMENTOS DUPLICADOS =====
// Quando a Laura oferece um horário para alguém, "reserva" temporariamente
const slotsReservados = new Map(); // key: ISO string do slot -> { phone, expira }
const RESERVA_DURACAO = 10 * 60 * 1000; // 10 minutos de reserva temporária

function reservarSlot(slotInicio, phone) {
  const key = slotInicio.toISOString();
  slotsReservados.set(key, {
    phone,
    expira: Date.now() + RESERVA_DURACAO
  });
  console.log(`[CALENDAR-NPL] Slot reservado: ${key} para ${phone} (10min)`);
}

function isSlotReservado(slotInicio, phoneAtual) {
  const key = slotInicio.toISOString();
  const reserva = slotsReservados.get(key);
  if (!reserva) return false;
  if (Date.now() > reserva.expira) {
    slotsReservados.delete(key);
    return false;
  }
  // Se é a mesma pessoa que reservou, não bloqueia
  if (reserva.phone === phoneAtual) return false;
  return true;
}

function liberarReservasExpiradas() {
  const agora = Date.now();
  for (const [key, reserva] of slotsReservados) {
    if (agora > reserva.expira) {
      slotsReservados.delete(key);
    }
  }
}

// Limpar reservas periodicamente
setInterval(liberarReservasExpiradas, 5 * 60 * 1000);

// ===== FUNÇÕES DE DATA/HORA =====

function agoraBelem() {
  const now = new Date();
  const belemTime = new Date(now.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
  return belemTime;
}

function criarDataBelem(ano, mes, dia, hora, minuto) {
  const utcDate = new Date(Date.UTC(ano, mes, dia, hora - UTC_OFFSET, minuto, 0, 0));
  return utcDate;
}

// Gerar os horários válidos de um dia (manhã + tarde, sem almoço)
function getHorasDoDia() {
  const horas = [];
  for (let h = HORARIOS_MANHA.inicio; h < HORARIOS_MANHA.fim; h++) {
    horas.push(h);
  }
  for (let h = HORARIOS_TARDE.inicio; h < HORARIOS_TARDE.fim; h++) {
    horas.push(h);
  }
  return horas; // [8, 9, 10, 11, 14, 15, 16]
}

// ===== BUSCAR HORÁRIOS DISPONÍVEIS =====

async function getHorariosDisponiveis(diasParaFrente = 5, phoneAtual = null) {
  const calendar = getCalendarClient();
  if (!calendar) {
    console.log('[CALENDAR-NPL] Client não disponível');
    return [];
  }

  try {
    const belemAgora = agoraBelem();
    const horaAtualBelem = belemAgora.getUTCHours();

    console.log(`[CALENDAR-NPL] Hora Belém: ${horaAtualBelem}h`);

    let inicioAno = belemAgora.getUTCFullYear();
    let inicioMes = belemAgora.getUTCMonth();
    let inicioDia = belemAgora.getUTCDate();

    // Se já passou do último horário da tarde, começar amanhã
    if (horaAtualBelem >= HORARIOS_TARDE.fim) {
      inicioDia++;
    }

    // Buscar dias úteis (excluindo fds e feriados)
    const diasUteis = [];
    let tempDate = new Date(Date.UTC(inicioAno, inicioMes, inicioDia));

    while (diasUteis.length < diasParaFrente) {
      const diaSemana = tempDate.getUTCDay();
      const ano = tempDate.getUTCFullYear();
      const mes = tempDate.getUTCMonth();
      const dia = tempDate.getUTCDate();

      if (diaSemana !== 0 && diaSemana !== 6 && !isFeriado(ano, mes, dia)) {
        diasUteis.push({ ano, mes, dia, diaSemana });
      }
      tempDate.setUTCDate(tempDate.getUTCDate() + 1);
    }

    if (diasUteis.length === 0) {
      console.log('[CALENDAR-NPL] Nenhum dia útil encontrado');
      return [];
    }

    const primeiro = diasUteis[0];
    const ultimo = diasUteis[diasUteis.length - 1];
    const timeMin = criarDataBelem(primeiro.ano, primeiro.mes, primeiro.dia, HORARIOS_MANHA.inicio, 0);
    const timeMax = criarDataBelem(ultimo.ano, ultimo.mes, ultimo.dia, HORARIOS_TARDE.fim, 0);

    console.log(`[CALENDAR-NPL] Buscando eventos de ${timeMin.toISOString()} até ${timeMax.toISOString()}`);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TIMEZONE
    });

    const eventosOcupados = (response.data.items || []).map(ev => ({
      inicio: new Date(ev.start.dateTime || ev.start.date),
      fim: new Date(ev.end.dateTime || ev.end.date),
      summary: ev.summary || ''
    }));

    console.log(`[CALENDAR-NPL] ${eventosOcupados.length} eventos encontrados no período`);

    const utcAgora = new Date();
    const horasValidas = getHorasDoDia();

    const slots = [];
    for (const diaUtil of diasUteis) {
      for (const hora of horasValidas) {
        const slotInicio = criarDataBelem(diaUtil.ano, diaUtil.mes, diaUtil.dia, hora, 0);
        const slotFim = new Date(slotInicio.getTime() + DURACAO_CONSULTA * 60 * 1000);

        // Slot no passado
        if (slotInicio <= utcAgora) continue;

        // Conflito com evento existente no Google Calendar
        const conflito = eventosOcupados.some(ev =>
          (slotInicio < ev.fim && slotFim > ev.inicio)
        );
        if (conflito) continue;

        // Reservado por outra conversa simultânea
        if (isSlotReservado(slotInicio, phoneAtual)) continue;

        slots.push({
          inicio: slotInicio,
          fim: slotFim,
          label: formatarSlot(hora, diaUtil)
        });
      }
    }

    console.log(`[CALENDAR-NPL] ${slots.length} slots disponíveis`);
    return slots;
  } catch (e) {
    console.error('[CALENDAR-NPL] Erro ao buscar horários:', e.message);
    return [];
  }
}

// ===== FORMATAÇÃO =====

function formatarSlot(hora, diaUtil) {
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const nomeDia = dias[diaUtil.diaSemana];
  const dd = diaUtil.dia.toString().padStart(2, '0');
  const mm = (diaUtil.mes + 1).toString().padStart(2, '0');
  return `${nomeDia} (${dd}/${mm}) às ${hora}h`;
}

function formatarSlotDate(data) {
  const belem = new Date(data.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const dia = dias[belem.getUTCDay()];
  const dd = belem.getUTCDate().toString().padStart(2, '0');
  const mm = (belem.getUTCMonth() + 1).toString().padStart(2, '0');
  const hora = belem.getUTCHours();
  return `${dia} (${dd}/${mm}) às ${hora}h`;
}

// ===== SUGERIR HORÁRIOS (com reserva) =====

async function sugerirHorarios(quantidade = 3, phoneAtual = null) {
  const slots = await getHorariosDisponiveis(5, phoneAtual);

  if (slots.length === 0) {
    return {
      texto: 'No momento estou sem horários disponíveis essa semana. Posso te retornar quando abrir uma vaga?',
      slots: []
    };
  }

  // Pegar slots espalhados (manhã e tarde de dias diferentes)
  const selecionados = [];
  const diasUsados = new Set();

  for (const slot of slots) {
    const belemHora = new Date(slot.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000)).getUTCHours();
    const periodo = belemHora < 12 ? 'manha' : 'tarde';
    const key = `${slot.label.split(')')[0]}-${periodo}`;

    if (!diasUsados.has(key) && selecionados.length < quantidade) {
      selecionados.push(slot);
      diasUsados.add(key);
    }
  }

  if (selecionados.length < quantidade) {
    for (const slot of slots) {
      if (!selecionados.includes(slot) && selecionados.length < quantidade) {
        selecionados.push(slot);
      }
    }
  }

  // Reservar os slots oferecidos para evitar duplicidade
  if (phoneAtual) {
    for (const slot of selecionados) {
      reservarSlot(slot.inicio, phoneAtual);
    }
  }

  const opcoes = selecionados.map(s => s.label);
  let texto;
  if (opcoes.length === 1) {
    texto = `Tenho ${opcoes[0]} com o escritório. Quer marcar?`;
  } else if (opcoes.length === 2) {
    texto = `Tenho ${opcoes[0]} ou ${opcoes[1]}. Qual prefere?`;
  } else {
    texto = `Tenho ${opcoes[0]}, ${opcoes[1]} ou ${opcoes[2]}. Qual fica melhor pra você?`;
  }

  return { texto, slots: selecionados };
}

// ===== CRIAR CONSULTA (com rodízio) =====

async function criarConsulta(nome, telefone, email, dataHora, formato = 'online') {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  try {
    const inicio = new Date(dataHora);
    const fim = new Date(inicio);
    fim.setMinutes(fim.getMinutes() + DURACAO_CONSULTA);

    // Buscar eventos do período para determinar rodízio
    const timeMin = new Date(inicio.getTime() - 7 * 24 * 60 * 60 * 1000);
    const timeMax = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
    let eventosParaRodizio = [];
    try {
      const resp = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        timeZone: TIMEZONE
      });
      eventosParaRodizio = (resp.data.items || []).map(ev => ({
        summary: ev.summary || ''
      }));
    } catch (e) {
      console.log('[CALENDAR-NPL] Erro ao buscar rodízio:', e.message);
    }

    const colaboradora = determinarColaboradora(eventosParaRodizio);

    const descricao = [
      `Consulta Trabalhista - ${nome}`,
      `Responsável: ${colaboradora}`,
      `Telefone: ${telefone}`,
      email ? `Email: ${email}` : '',
      `Formato: ${formato}`,
      '',
      'Agendado automaticamente pela Laura (NPLADVS)'
    ].filter(Boolean).join('\n');

    const evento = {
      summary: `Consulta Trabalhista - ${nome} (${colaboradora})`,
      description: descricao,
      start: {
        dateTime: inicio.toISOString(),
        timeZone: TIMEZONE
      },
      end: {
        dateTime: fim.toISOString(),
        timeZone: TIMEZONE
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 60 }
        ]
      }
    };

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: evento
    });

    // Limpar reserva do slot (já foi confirmado)
    slotsReservados.delete(inicio.toISOString());

    console.log(`[CALENDAR-NPL] Consulta criada: ${nome} com ${colaboradora} em ${formatarSlotDate(inicio)}`);
    return {
      id: response.data.id,
      link: response.data.htmlLink,
      inicio: formatarSlotDate(inicio),
      formato,
      colaboradora
    };
  } catch (e) {
    console.error('[CALENDAR-NPL] Erro ao criar consulta:', e.message);
    return null;
  }
}

// ===== INTERPRETAR TEXTO DO LEAD =====

async function encontrarSlot(textoLead, phoneAtual = null) {
  const slots = await getHorariosDisponiveis(7, phoneAtual);
  if (slots.length === 0) return null;

  const lower = textoLead.toLowerCase();

  const diasSemana = {
    'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5,
    'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5
  };

  let diaAlvo = null;
  for (const [nome, num] of Object.entries(diasSemana)) {
    if (lower.includes(nome)) {
      diaAlvo = num;
      break;
    }
  }

  const belemAgora = agoraBelem();
  if (lower.includes('amanhã') || lower.includes('amanha')) {
    const amanha = new Date(belemAgora);
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    diaAlvo = amanha.getUTCDay();
  }
  if (lower.includes('hoje')) {
    diaAlvo = belemAgora.getUTCDay();
  }

  let horaAlvo = null;
  const horaMatch = lower.match(/(\d{1,2})\s*(?:h|hrs?|horas?)?/);
  if (horaMatch) {
    horaAlvo = parseInt(horaMatch[1]);
    // Validar contra horários válidos
    const horasValidas = getHorasDoDia();
    if (!horasValidas.includes(horaAlvo)) horaAlvo = null;
  }

  if (lower.includes('manhã') || lower.includes('manha') || lower.includes('de manhã')) {
    horaAlvo = horaAlvo || 10;
  }
  if (lower.includes('tarde')) {
    horaAlvo = horaAlvo || 15;
  }

  let candidatos = slots;
  if (diaAlvo !== null) {
    const filtrados = slots.filter(s => {
      const belem = new Date(s.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
      return belem.getUTCDay() === diaAlvo;
    });
    if (filtrados.length > 0) candidatos = filtrados;
  }

  if (horaAlvo !== null && candidatos.length > 0) {
    candidatos.sort((a, b) => {
      const horaA = new Date(a.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000)).getUTCHours();
      const horaB = new Date(b.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000)).getUTCHours();
      return Math.abs(horaA - horaAlvo) - Math.abs(horaB - horaAlvo);
    });
  }

  return candidatos.length > 0 ? candidatos[0] : slots[0];
}

module.exports = {
  getHorariosDisponiveis,
  sugerirHorarios,
  criarConsulta,
  encontrarSlot,
  formatarSlot: formatarSlotDate,
  reservarSlot,
  COLABORADORAS
};
