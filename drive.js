// ===== INTEGRAÇÃO GOOGLE DRIVE - NPLADVS =====
// Upload e organização de documentos de clientes no Google Drive
// Usa mesma Service Account do Google Calendar

const { google } = require('googleapis');
const config = require('./config');

// Autenticação com Service Account (mesma credencial do Calendar)
function getDriveClient() {
  const credStr = config.GOOGLE_CALENDAR_CREDENTIALS;
  if (!credStr) {
    console.error('[DRIVE-NPL] GOOGLE_CALENDAR_CREDENTIALS não configurada');
    return null;
  }

  let credentials;
  try {
    credentials = JSON.parse(credStr);
  } catch (e) {
    console.error('[DRIVE-NPL] Erro ao parsear credenciais:', e.message);
    return null;
  }

  if (!credentials.client_email || !credentials.private_key) {
    console.error('[DRIVE-NPL] Credenciais incompletas');
    return null;
  }

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file'
    ]
  );

  return google.drive({ version: 'v3', auth });
}

// ID da pasta raiz no Google Drive — pasta principal do escritório
const PASTA_RAIZ_ID = process.env.GOOGLE_DRIVE_PASTA_RAIZ || '1AxSr25WaWtsC38-eZBPwdBiqKXdemiMW';

// ===== MAPEAMENTO: MATÉRIA → ID DA PASTA NO DRIVE =====
// Estrutura: Pasta Raiz → Matéria → Cliente → Documentos
const MATERIAS = {
  'ACIDENTE DE TRABALHO':          '1vW6Y3mCrb-ZRLUHUT-mfudmYQTFTTb4J',
  'ASSÉDIO':                       '1vGI-aiG0s8xMdsuboluPeA9Jj7ejAF8-',
  'DOENÇA DO TRABALHO':            '1IEmxnZC-inaY3Ob6Dy8T3PDep2ZRmhM7',
  'EMPREGADA DOMESTICA':           '1f9gKjUl84Y18RO8HOKwV6OEwygCsc4Bj',
  'ESTABILIDADE GRAVIDEZ':         '1DA2p1y6AZ3ZkyA0nhdAnxDLpKmSuKVDe',
  'ESTAGIÁRIO':                    '1I_w5Hk_VrPKdlusud40eqH1Hi5e_G1HW',
  'HORAS EXTRAS E ACÚMULO DE FUNCAO': '1fQ-T0drYOwR6MpFdWGTNtGIbLXZJV1Um',
  'INSALUBRIDADE':                 '1ThANKDXMQq7LWJel6PjJgt3D1CFB0x0e',
  'JORNALISTA/REPORTER':           '1HFQ6ScxrLIO54c7n8kVHUNKbya-bBCSE',
  'MORTE ACIDENTE DE TRABALHO':    '1H3OSl6DpmuGOmq4rhlIknIVP6_DTd2Ue',
  'NÃO PAGAMENTO DE VERBAS':       '1PW8dUsRnYrL7NlRqZKHefIzKP7QoKnXN',
  'PEJOTIZAÇÃO':                   '1JHbk97LB2QhSxg2SN_ghTlBkGJPLZJ_b',
  'PERICULOSIDADE':                '1uj62gfGhTFkgKNdbN3gJ0YA8YfpDGRTp',
  'RECONHECIMENTO DE VÍNCULO':     '1m_nzQ49w9jg34NBzIHzszs-5ulWEFiYQ',
  'RECURSO ORDINARIO':             '1k4aemdm2bPeofinso5Naei5ZCQVKtCxm',
  'RESCISÃO INDIRETA':             '1-ksFgCX2CuUNENh94zBAxjPYn6TYuOyN',
  'REVERSÃO DE JUSTA CAUSA':       '1qQ_JrRqUDODi-Df_YB5HcUDzLan1ZLOb',
  'RURAL':                         '1-hMpivJ1XPU1tYzgtqx0fl9q9E0ImP5W',
  'SEGURO DESEMPREGO':             '1jJOinLzttZU32VYOj5avFOg0nkRDGJFB'
};

// Aliases para mapear tese_interesse do lead → nome da pasta no Drive
const MATERIA_ALIASES = {
  'trabalhista':                'NÃO PAGAMENTO DE VERBAS',
  'sem carteira':               'RECONHECIMENTO DE VÍNCULO',
  'reconhecimento de vinculo':  'RECONHECIMENTO DE VÍNCULO',
  'vinculo empregaticio':       'RECONHECIMENTO DE VÍNCULO',
  'verbas rescisorias':         'NÃO PAGAMENTO DE VERBAS',
  'verbas rescisórias':         'NÃO PAGAMENTO DE VERBAS',
  'nao pagamento':              'NÃO PAGAMENTO DE VERBAS',
  'rescisao indireta':          'RESCISÃO INDIRETA',
  'rescisão indireta':          'RESCISÃO INDIRETA',
  'acidente de trabalho':       'ACIDENTE DE TRABALHO',
  'acidente trabalho':          'ACIDENTE DE TRABALHO',
  'doenca do trabalho':         'DOENÇA DO TRABALHO',
  'doença do trabalho':         'DOENÇA DO TRABALHO',
  'assedio':                    'ASSÉDIO',
  'assédio':                    'ASSÉDIO',
  'assedio moral':              'ASSÉDIO',
  'horas extras':               'HORAS EXTRAS E ACÚMULO DE FUNCAO',
  'acumulo de funcao':          'HORAS EXTRAS E ACÚMULO DE FUNCAO',
  'insalubridade':              'INSALUBRIDADE',
  'periculosidade':             'PERICULOSIDADE',
  'pejotizacao':                'PEJOTIZAÇÃO',
  'pejotização':                'PEJOTIZAÇÃO',
  'justa causa':                'REVERSÃO DE JUSTA CAUSA',
  'reversao justa causa':       'REVERSÃO DE JUSTA CAUSA',
  'domestica':                  'EMPREGADA DOMESTICA',
  'empregada domestica':        'EMPREGADA DOMESTICA',
  'gravidez':                   'ESTABILIDADE GRAVIDEZ',
  'estabilidade':               'ESTABILIDADE GRAVIDEZ',
  'estagiario':                 'ESTAGIÁRIO',
  'rural':                      'RURAL',
  'seguro desemprego':          'SEGURO DESEMPREGO',
  'morte':                      'MORTE ACIDENTE DE TRABALHO',
  'recurso':                    'RECURSO ORDINARIO'
};

// Encontrar a pasta da matéria a partir da tese_interesse
function encontrarPastaMateria(teseInteresse) {
  if (!teseInteresse) return null;
  const tese = teseInteresse.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Tentar match direto nos aliases
  for (const [alias, materia] of Object.entries(MATERIA_ALIASES)) {
    const aliasNorm = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (tese.includes(aliasNorm)) {
      return { nome: materia, id: MATERIAS[materia] };
    }
  }

  // Tentar match direto no nome da matéria
  for (const [materia, id] of Object.entries(MATERIAS)) {
    const materiaNorm = materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (tese.includes(materiaNorm) || materiaNorm.includes(tese)) {
      return { nome: materia, id };
    }
  }

  return null;
};

// Buscar ou criar pasta por nome dentro de uma pasta pai
async function getOrCreateFolder(nome, pastaParentId = null) {
  const drive = getDriveClient();
  if (!drive) return null;

  const parentId = pastaParentId || PASTA_RAIZ_ID;

  try {
    // Escapar aspas simples no nome para evitar injection na query
    const nomeSafe = nome.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // Buscar pasta existente
    const query = parentId
      ? `name='${nomeSafe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${nomeSafe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const { data } = await drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 });

    if (data.files && data.files.length > 0) {
      console.log(`[DRIVE-NPL] Pasta encontrada: ${nome} (${data.files[0].id})`);
      return data.files[0];
    }

    // Criar pasta
    const folderMeta = {
      name: nome,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) folderMeta.parents = [parentId];

    const { data: folder } = await drive.files.create({
      resource: folderMeta,
      fields: 'id, name'
    });

    console.log(`[DRIVE-NPL] Pasta criada: ${nome} (${folder.id})`);
    return folder;
  } catch (e) {
    console.error(`[DRIVE-NPL] Erro ao criar/buscar pasta ${nome}:`, e.message);
    return null;
  }
}

// Upload de arquivo para uma pasta
async function uploadFile(nomeArquivo, buffer, mimeType, pastaId) {
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMeta = { name: nomeArquivo };
    if (pastaId) fileMeta.parents = [pastaId];

    const { data } = await drive.files.create({
      resource: fileMeta,
      media: { mimeType, body: stream },
      fields: 'id, name, webViewLink'
    });

    console.log(`[DRIVE-NPL] Arquivo enviado: ${nomeArquivo} (${data.id})`);
    return data;
  } catch (e) {
    console.error(`[DRIVE-NPL] Erro ao enviar ${nomeArquivo}:`, e.message);
    return null;
  }
}

// Listar arquivos dentro de uma pasta
async function listFiles(pastaId) {
  const drive = getDriveClient();
  if (!drive) return [];

  try {
    const { data } = await drive.files.list({
      q: `'${pastaId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink)',
      orderBy: 'name'
    });

    return data.files || [];
  } catch (e) {
    console.error('[DRIVE-NPL] Erro ao listar arquivos:', e.message);
    return [];
  }
}

// Verificar se arquivo já existe na pasta (evitar duplicatas)
async function fileExists(nome, pastaId) {
  const drive = getDriveClient();
  if (!drive) return false;

  try {
    const nomeSafe = nome.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const { data } = await drive.files.list({
      q: `name='${nomeSafe}' and '${pastaId}' in parents and trashed=false`,
      fields: 'files(id)',
      pageSize: 1
    });

    return data.files && data.files.length > 0;
  } catch (e) {
    return false;
  }
}

// Criar estrutura: Pasta Raiz → Matéria → Cliente
// Se não encontrar matéria, cria direto na raiz
async function criarEstruturaPastas(nomeCliente, teseInteresse = null) {
  let pastaParent = null;

  // Tentar encontrar pasta da matéria
  const materia = encontrarPastaMateria(teseInteresse);
  if (materia && materia.id) {
    pastaParent = { id: materia.id, name: materia.nome };
    console.log(`[DRIVE-NPL] Matéria encontrada: ${materia.nome}`);
  } else if (PASTA_RAIZ_ID) {
    // Se não encontrou matéria, usa a pasta raiz
    pastaParent = { id: PASTA_RAIZ_ID, name: 'RAIZ' };
    console.log(`[DRIVE-NPL] Matéria não identificada para "${teseInteresse}", usando pasta raiz`);
  } else {
    console.error('[DRIVE-NPL] Sem pasta raiz configurada');
    return null;
  }

  // Criar pasta do cliente dentro da matéria (ou raiz)
  const nomeClienteUpper = nomeCliente.toUpperCase().trim();
  const pastaCliente = await getOrCreateFolder(nomeClienteUpper, pastaParent.id);
  if (!pastaCliente) return null;

  return { materia: pastaParent, cliente: pastaCliente };
}

// Listar todas as matérias disponíveis
function listarMaterias() {
  return Object.keys(MATERIAS);
}

module.exports = {
  getDriveClient,
  getOrCreateFolder,
  uploadFile,
  listFiles,
  fileExists,
  criarEstruturaPastas,
  encontrarPastaMateria,
  listarMaterias,
  PASTA_RAIZ_ID,
  MATERIAS,
  MATERIA_ALIASES
};
