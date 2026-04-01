// ===== INTEGRAÇÃO GOOGLE DRIVE - NPLADVS =====
// Upload e organização de documentos de clientes no Google Drive
// Usa mesma Service Account do Google Calendar

const { google } = require('googleapis');
const config = require('./config');

// Autenticação com Service Account (mesma credencial do Calendar)
function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS || '{}');

  if (!credentials.client_email) {
    console.error('[DRIVE-NPL] Credenciais não configuradas');
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

// ID da pasta raiz no Google Drive (configurar no .env)
const PASTA_RAIZ_ID = process.env.GOOGLE_DRIVE_PASTA_RAIZ || null;

// Buscar ou criar pasta por nome dentro de uma pasta pai
async function getOrCreateFolder(nome, pastaParentId = null) {
  const drive = getDriveClient();
  if (!drive) return null;

  const parentId = pastaParentId || PASTA_RAIZ_ID;

  try {
    // Buscar pasta existente
    const query = parentId
      ? `name='${nome}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${nome}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

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
    const { data } = await drive.files.list({
      q: `name='${nome}' and '${pastaId}' in parents and trashed=false`,
      fields: 'files(id)',
      pageSize: 1
    });

    return data.files && data.files.length > 0;
  } catch (e) {
    return false;
  }
}

// Criar estrutura de pastas: NPLADVS Documentos / [Nome do Cliente] /
async function criarEstruturaPastas(nomeCliente) {
  // Pasta raiz: NPLADVS Documentos
  const pastaRaiz = await getOrCreateFolder('NPLADVS Documentos');
  if (!pastaRaiz) return null;

  // Pasta do cliente
  const pastaCliente = await getOrCreateFolder(nomeCliente, pastaRaiz.id);
  if (!pastaCliente) return null;

  return { raiz: pastaRaiz, cliente: pastaCliente };
}

module.exports = {
  getDriveClient,
  getOrCreateFolder,
  uploadFile,
  listFiles,
  fileExists,
  criarEstruturaPastas,
  PASTA_RAIZ_ID
};
