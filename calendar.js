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
const HORARIOS_MANHA = { inicio: 9, fim: 12 };  // 09h às 12h
const HORARIOS_TARDE = { inicio: 14, fim: 17 }; // 14h às 17h
const DURACAO_CONSULTA = 60; // minutos
const TIMEZONE = 'America/Belem';
const UTC_OFFSET = -3; // Belém = UTC-3

// ===== RODÍZIO DE COLABORADORAS =====
const COLABORADORAS = ['Dra. Luma', 'Dra. Sophia', 'Luiza'];

// Disponibilidade da Luiza (estagiária, 4h/dia):
// Seg, Qua, Qui → manhã (9h-12h)
// Ter, Sex → tarde (14h-17h)
const LUIZA_DISPONIBILIDADE = {
  1: 'manha',  // segunda
  2: 'tarde',  // terça
  3: 'manha',  // quarta
  4: 'manha',  // quinta
  5: 'tarde'   // sexta
};

// Verificar se a Luiza está disponível num determinado horário
function luizaDisponivel(dataHora) {
  const belem = new Date(dataHora.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
  const diaSemana = belem.getUTCDay(); // 0=dom, 1=seg...
  const hora = belem.getUTCHours();

  const turno = LUIZA_DISPONIBILIDADE[diaSemana];
  if (!turno) return false; // fim de semana

  if (turno === 'manha') return hora >= HORARIOS_MANHA.inicio && hora < HORARIOS_MANHA.fim;
  if (turno === 'tarde') return hora >= HORARIOS_TARDE.inicio && hora < HORARIOS_TARDE.fim;
  return false;
}

// Determinar colaboradora com base nos eventos existentes e horário do slot
function determinarColaboradora(eventosExistentes, dataHoraSlot) {
  // Filtrar colaboradoras disponíveis para este horário
  let candidatas = [...COLABORADORAS];
  if (dataHoraSlot && !luizaDisponivel(dataHoraSlot)) {
    candidatas = candidatas.filter(c => c !== 'Luiza');
  }

  if (candidatas.length === 0) candidatas = ['Dra. Luma', 'Dra. Sophia'];

  // Contar quantas consultas cada colaboradora já tem no período
  const contagem = {};
  candidatas.forEach(c => contagem[c] = 0);

  for (const ev of eventosExistentes) {
    for (const c of candidatas) {
      if (ev.summary && ev.summary.includes(c)) {
        contagem[c]++;
        break;
      }
    }
  }

  // Retornar a que tem menos consultas agendadas
  let menor = Infinity;
  let escolhida = candidatas[0];
  for (const c of candidatas) {
    if (contagem[c] < menor) {
      menor = contagem[c];
      escolhida = c;
    }
  }

  console.log(`[CALENDAR-NPL] Rodízio: ${JSON.stringify(contagem)} -> ${escolhida}${dataHoraSlot && !luizaDisponivel(dataHoraSlot) ? ' (Luiza indisponível)' : ''}`);
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
const RESERVA_DURACAO = 20 * 60 * 1000; // 20 minutos de reserva temporária

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

// Cache de horários (evita chamadas repetidas ao Google Calendar)
let horariosCache = null;
let horariosCacheExpires = 0;

async function getHorariosDisponiveis(diasParaFrente = 5, phoneAtual = null) {
  // Retornar cache se válido (5 minutos)
  if (horariosCache && Date.now() < horariosCacheExpires && !phoneAtual) {
    console.log('[CALENDAR-NPL] Usando cache de horarios');
    return horariosCache;
  }

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

    // Salvar no cache (5 minutos)
    horariosCache = slots;
    horariosCacheExpires = Date.now() + 5 * 60 * 1000;

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
  const slots = await getHorariosDisponiveis(10, phoneAtual);

  if (slots.length === 0) {
    return {
      texto: 'Esta semana esta lotada, mas na proxima ja tenho horarios. Posso reservar um horario pra voce assim que abrir?',
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
  const totalDisponiveis = slots.length;
  const escassez = totalDisponiveis <= 3 ? ' (ultimos horarios da semana)' : '';
  let texto;
  if (opcoes.length === 1) {
    texto = `So tenho ${opcoes[0]} disponivel${escassez}. Quer que eu reserve pra voce?`;
  } else if (opcoes.length === 2) {
    texto = `Tenho ${opcoes[0]} ou ${opcoes[1]}${escassez}. Qual prefere?`;
  } else {
    texto = `Tenho ${opcoes[0]}, ${opcoes[1]} ou ${opcoes[2]}${escassez}. Qual fica melhor pra voce?`;
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

    const colaboradora = determinarColaboradora(eventosParaRodizio, inicio);

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

async function encontrarSlot(texto, phoneAtual = null) {
  const slots = await getHorariosDisponiveis(10, phoneAtual);
  if (slots.length === 0) return null;

  const lower = texto.toLowerCase();

  // Extrair dia da semana
  const diasSemana = {
    'segunda': 1, 'terça': 2, 'terca': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5,
    'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5
  };

  let diaAlvo = null;
  for (const [nome, num] of Object.entries(diasSemana)) {
    if (lower.includes(nome)) {
      diaAlvo = num;
      break;
    }
  }

  // Extrair data explícita (DD/MM ou "dia DD")
  let dataExplicita = null;
  const matchData = lower.match(/(\d{1,2})\/(\d{1,2})/) || lower.match(/dia\s+(\d{1,2})(?:\s+de\s+)?/);
  if (matchData) {
    const dia = parseInt(matchData[1]);
    const mes = matchData[2] ? parseInt(matchData[2]) - 1 : agoraBelem().getUTCMonth();
    const ano = agoraBelem().getUTCFullYear();
    dataExplicita = new Date(Date.UTC(ano, mes, dia));
  }

  const belemAgora = agoraBelem();
  if (lower.includes('amanhã') || lower.includes('amanha')) {
    const amanha = new Date(belemAgora);
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    diaAlvo = amanha.getUTCDay();
    dataExplicita = amanha;
  }
  if (lower.includes('hoje')) {
    diaAlvo = belemAgora.getUTCDay();
    dataExplicita = belemAgora;
  }

  // Extrair hora
  let horaAlvo = null;
  const horaMatch = lower.match(/(\d{1,2})\s*(?:h|hrs?|horas?)/);
  if (horaMatch) {
    horaAlvo = parseInt(horaMatch[1]);
    const horasValidas = getHorasDoDia();
    if (!horasValidas.includes(horaAlvo)) horaAlvo = null;
  }
  // Fallback: "às DD" sem sufixo h
  if (!horaAlvo) {
    const asMatch = lower.match(/[àa]s\s+(\d{1,2})/);
    if (asMatch) {
      const h = parseInt(asMatch[1]);
      const horasValidas = getHorasDoDia();
      if (horasValidas.includes(h)) horaAlvo = h;
    }
  }

  if (lower.includes('manhã') || lower.includes('manha') || lower.includes('de manhã')) {
    horaAlvo = horaAlvo || 10;
  }
  if (lower.includes('tarde')) {
    horaAlvo = horaAlvo || 15;
  }

  // Filtrar por data explícita (mais preciso)
  let candidatos = slots;
  if (dataExplicita) {
    const diaExpl = dataExplicita.getUTCDate();
    const mesExpl = dataExplicita.getUTCMonth();
    const filtrados = slots.filter(s => {
      const belem = new Date(s.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
      return belem.getUTCDate() === diaExpl && belem.getUTCMonth() === mesExpl;
    });
    if (filtrados.length > 0) candidatos = filtrados;
  } else if (diaAlvo !== null) {
    // Filtrar por dia da semana
    const filtrados = slots.filter(s => {
      const belem = new Date(s.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000));
      return belem.getUTCDay() === diaAlvo;
    });
    if (filtrados.length > 0) candidatos = filtrados;
  }

  // Ordenar por proximidade de hora
  if (horaAlvo !== null && candidatos.length > 0) {
    candidatos.sort((a, b) => {
      const horaA = new Date(a.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000)).getUTCHours();
      const horaB = new Date(b.inicio.getTime() + (UTC_OFFSET * 60 * 60 * 1000)).getUTCHours();
      return Math.abs(horaA - horaAlvo) - Math.abs(horaB - horaAlvo);
    });
  }

  // Só retorna se encontrou correspondência real (dia OU hora)
  // Se não encontrou nenhum filtro, retorna null (não chutar slot aleatório)
  if (diaAlvo === null && dataExplicita === null && horaAlvo === null) {
    console.log('[CALENDAR-NPL] encontrarSlot: nenhum dia/hora identificado no texto');
    return null;
  }

  return candidatos.length > 0 ? candidatos[0] : null;
}

// ===== BUSCAR CONSULTAS DO DIA (para lembretes) =====
async function getConsultasDoDia() {
  const calendar = getCalendarClient();
  if (!calendar) return [];

  try {
    const belemAgora = agoraBelem();
    const ano = belemAgora.getUTCFullYear();
    const mes = belemAgora.getUTCMonth();
    const dia = belemAgora.getUTCDate();

    const inicioDia = criarDataBelem(ano, mes, dia, 0, 0);
    const fimDia = criarDataBelem(ano, mes, dia, 23, 59);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: inicioDia.toISOString(),
      timeMax: fimDia.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TIMEZONE
    });

    const eventos = (response.data.items || []).map(ev => {
      // Extrair telefone da descrição
      const descricao = ev.description || '';
      const phoneMatch = descricao.match(/Telefone:\s*(\d+)/);
      const telefone = phoneMatch ? phoneMatch[1] : null;

      // Extrair nome do summary: "Consulta Trabalhista - Nome (Colaboradora)"
      const summaryMatch = (ev.summary || '').match(/Consulta.*?-\s*(.+?)\s*\(/);
      const nome = summaryMatch ? summaryMatch[1].trim() : ev.summary;

      // Extrair colaboradora
      const colabMatch = (ev.summary || '').match(/\(([^)]+)\)/);
      const colaboradora = colabMatch ? colabMatch[1] : '';

      const inicio = new Date(ev.start.dateTime || ev.start.date);

      return {
        id: ev.id,
        nome,
        telefone,
        colaboradora,
        inicio,
        inicioFormatado: formatarSlotDate(inicio),
        summary: ev.summary
      };
    });

    console.log(`[CALENDAR-NPL] ${eventos.length} consulta(s) hoje`);
    return eventos;
  } catch (e) {
    console.error('[CALENDAR-NPL] Erro ao buscar consultas do dia:', e.message);
    return [];
  }
}

// ===== CANCELAR CONSULTA POR TELEFONE =====
async function cancelarConsulta(telefone) {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  try {
    // Buscar eventos futuros que contenham o telefone na descrição
    const agora = new Date();
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: agora.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TIMEZONE,
      maxResults: 20
    });

    const eventos = response.data.items || [];
    const telLimpo = telefone.replace(/\D/g, '');

    for (const ev of eventos) {
      const desc = ev.description || '';
      if (desc.includes(telLimpo) && ev.summary?.includes('Consulta Trabalhista')) {
        await calendar.events.delete({
          calendarId: CALENDAR_ID,
          eventId: ev.id
        });
        console.log(`[CALENDAR-NPL] Consulta cancelada: ${ev.summary} (${ev.start?.dateTime})`);
        return { id: ev.id, summary: ev.summary, inicio: ev.start?.dateTime };
      }
    }

    console.log(`[CALENDAR-NPL] Nenhuma consulta encontrada para ${telefone}`);
    return null;
  } catch (e) {
    console.error('[CALENDAR-NPL] Erro ao cancelar consulta:', e.message);
    return null;
  }
}

module.exports = {
  getHorariosDisponiveis,
  sugerirHorarios,
  criarConsulta,
  cancelarConsulta,
  encontrarSlot,
  getConsultasDoDia,
  formatarSlot: formatarSlotDate,
  reservarSlot,
  agoraBelem,
  COLABORADORAS
};
