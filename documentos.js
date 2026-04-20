// ===== AGENTE ORGANIZADOR DE DOCUMENTOS - NPLADVS =====
// Busca documentos do WhatsApp (Z-API), identifica via IA (Claude Vision),
// organiza, renomeia e faz upload para Google Drive.
// Gera relatório de auditoria (tem / não tem).

const config = require('./config');
const drive = require('./drive');
const whatsapp = require('./whatsapp');
const Anthropic = require('@anthropic-ai/sdk');

const claude = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// ===== LISTA DE DOCUMENTOS OBRIGATÓRIOS =====
const DOCUMENTOS_OBRIGATORIOS = [
  { tipo: 'RG', aliases: ['rg', 'identidade', 'carteira de identidade', 'documento de identidade'] },
  { tipo: 'CPF', aliases: ['cpf', 'cadastro pessoa fisica'] },
  { tipo: 'Comprovante de Residencia', aliases: ['comprovante de residencia', 'comprovante residencia', 'comprovante endereco', 'conta de luz', 'conta agua'] },
  { tipo: 'Certidao', aliases: ['certidao', 'certidao nascimento', 'certidao casamento', 'certidao obito'] },
  { tipo: 'Procuracao', aliases: ['procuracao', 'procuração'] },
  { tipo: 'Contrato de Honorarios', aliases: ['contrato honorarios', 'honorarios', 'contrato advocaticio'] },
  { tipo: 'Declaracao de Hipossuficiencia', aliases: ['hipossuficiencia', 'declaracao pobreza', 'declaracao hipossuficiencia'] },
  { tipo: 'CTPS', aliases: ['ctps', 'carteira de trabalho', 'carteira trabalho'] },
  { tipo: 'Contracheque', aliases: ['contracheque', 'holerite', 'folha pagamento'] },
  { tipo: 'Contrato de Trabalho', aliases: ['contrato trabalho', 'contrato emprego'] },
  { tipo: 'Termo de Rescisao', aliases: ['rescisao', 'trct', 'termo rescisao'] }
];

// ===== BUSCAR MÍDIAS DO WHATSAPP VIA Z-API =====

// Buscar mensagens de uma conversa que contêm mídias (imagens, documentos, PDFs)
async function buscarMidiasWhatsApp(phone) {
  const tel = whatsapp.cleanPhone(phone);
  if (!tel) return [];

  try {
    // Z-API: buscar mensagens do chat
    const res = await fetch(`${config.ZAPI_BASE}/chat-messages/${tel}?amount=100`, {
      headers: { 'Client-Token': config.ZAPI_CLIENT_TOKEN }
    });

    if (!res.ok) {
      console.error(`[DOCS-NPL] Erro ao buscar mensagens: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const messages = data.messages || data || [];

    // Filtrar apenas mensagens com mídia (imagem, documento, PDF)
    const midias = [];
    for (const msg of messages) {
      // Mensagem é do cliente (não do bot)
      if (msg.fromMe) continue;

      const mediaUrl = msg.image?.imageUrl || msg.document?.documentUrl ||
                       msg.image?.url || msg.document?.url ||
                       msg.mediaUrl || null;

      const mimeType = msg.image?.mimetype || msg.document?.mimetype ||
                       msg.mimetype || 'application/octet-stream';

      const fileName = msg.document?.fileName || msg.document?.title ||
                       msg.caption || null;

      if (mediaUrl) {
        midias.push({
          url: mediaUrl,
          mimeType,
          fileName,
          caption: msg.caption || msg.text?.message || '',
          timestamp: msg.timestamp || msg.momment || null,
          messageId: msg.messageId || msg.id?.id || null,
          isImage: !!msg.image,
          isDocument: !!msg.document
        });
      }
    }

    console.log(`[DOCS-NPL] ${midias.length} mídia(s) encontrada(s) para ${tel}`);
    return midias;
  } catch (e) {
    console.error('[DOCS-NPL] Erro ao buscar mídias:', e.message);
    return [];
  }
}

// ===== DOWNLOAD DE MÍDIA =====

async function downloadMidia(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log(`[DOCS-NPL] Download: ${(buffer.length / 1024).toFixed(0)}KB`);
    return buffer;
  } catch (e) {
    console.error('[DOCS-NPL] Erro no download:', e.message);
    return null;
  }
}

// ===== IDENTIFICAÇÃO VIA CLAUDE VISION =====

async function identificarDocumento(buffer, mimeType, caption = '') {
  try {
    // Se é PDF ou tipo não-imagem, tentar identificar pelo caption/nome
    const isImage = mimeType.startsWith('image/');

    if (!isImage) {
      // Para PDFs e outros, identificar pelo nome/caption
      return identificarPorTexto(caption || 'documento');
    }

    // Usar Claude Vision para imagens
    const base64 = buffer.toString('base64');
    const mediaType = mimeType.includes('png') ? 'image/png'
      : mimeType.includes('webp') ? 'image/webp'
      : 'image/jpeg';

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `Identifique este documento brasileiro. Responda APENAS com o tipo, usando uma destas opções exatas:
RG, CPF, Comprovante de Residencia, Certidao, Procuracao, Contrato de Honorarios, Declaracao de Hipossuficiencia, CTPS, Contracheque, Contrato de Trabalho, Termo de Rescisao, Outro

Se houver caption do cliente: "${caption}"

Responda SOMENTE o tipo, nada mais.`
          }
        ]
      }]
    });

    const tipo = response.content[0].text.trim();
    console.log(`[DOCS-NPL] IA identificou: ${tipo}`);

    // Validar se é um tipo conhecido
    const tipoValido = DOCUMENTOS_OBRIGATORIOS.find(d => d.tipo === tipo);
    return tipoValido ? tipo : 'Outro';
  } catch (e) {
    console.error('[DOCS-NPL] Erro na identificação IA:', e.message);
    return identificarPorTexto(caption);
  }
}

// Fallback: identificar por texto/caption
function identificarPorTexto(texto) {
  if (!texto) return 'Outro';
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const doc of DOCUMENTOS_OBRIGATORIOS) {
    for (const alias of doc.aliases) {
      const aliasNorm = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(aliasNorm)) {
        return doc.tipo;
      }
    }
  }
  return 'Outro';
}

// ===== GERAR NOME DO ARQUIVO =====

function gerarNomeArquivo(tipo, nomeCliente, index, extensao) {
  const nomeClean = nomeCliente
    .replace(/[^a-zA-ZÀ-ú\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  const ext = extensao || '.jpg';
  const sufixo = index > 0 ? ` (${index + 1})` : '';

  return `${tipo} - ${nomeClean}${sufixo}${ext}`;
}

// Extrair extensão do mimeType
function extensaoDoMime(mimeType) {
  const map = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/octet-stream': '.bin'
  };
  return map[mimeType] || '.bin';
}

// ===== ORGANIZAR DOCUMENTOS DE UM CLIENTE =====

async function organizarDocumentos(phone, nomeCliente, teseInteresse = null) {
  const resultado = {
    cliente: nomeCliente,
    telefone: phone,
    totalMidias: 0,
    identificados: [],
    naoIdentificados: [],
    enviados: [],
    erros: [],
    auditoria: {},
    linkPasta: null,
    status: 'em_andamento'
  };

  try {
    // 1. Buscar mídias do WhatsApp
    console.log(`[DOCS-NPL] Iniciando organização para ${nomeCliente} (${phone})`);
    const midias = await buscarMidiasWhatsApp(phone);
    resultado.totalMidias = midias.length;

    if (midias.length === 0) {
      resultado.status = 'sem_midias';
      resultado.auditoria = gerarAuditoria([]);
      return resultado;
    }

    // 2. Criar estrutura no Google Drive (Matéria → Cliente)
    const pastas = await drive.criarEstruturaPastas(nomeCliente, teseInteresse);
    if (!pastas) {
      resultado.status = 'erro_drive';
      resultado.erros.push('Não foi possível criar pastas no Google Drive');
      return resultado;
    }

    // 3. Processar cada mídia
    const tiposContagem = {}; // Para numerar duplicatas

    for (let i = 0; i < midias.length; i++) {
      const midia = midias[i];
      console.log(`[DOCS-NPL] Processando ${i + 1}/${midias.length}: ${midia.fileName || 'mídia'}`);

      try {
        // Download
        const buffer = await downloadMidia(midia.url);
        if (!buffer) {
          resultado.erros.push(`Falha no download: ${midia.fileName || midia.url}`);
          continue;
        }

        // Identificar tipo
        const tipo = await identificarDocumento(buffer, midia.mimeType, midia.caption);
        const extensao = extensaoDoMime(midia.mimeType);

        // Contagem para evitar sobrescrita
        if (!tiposContagem[tipo]) tiposContagem[tipo] = 0;
        const index = tiposContagem[tipo];
        tiposContagem[tipo]++;

        // Gerar nome
        const nomeArquivo = gerarNomeArquivo(tipo, nomeCliente, index, extensao);

        // Verificar duplicata
        const jaExiste = await drive.fileExists(nomeArquivo, pastas.cliente.id);
        if (jaExiste) {
          console.log(`[DOCS-NPL] Arquivo já existe: ${nomeArquivo}`);
          resultado.identificados.push({ tipo, arquivo: nomeArquivo, status: 'ja_existia' });
          continue;
        }

        // Upload
        const uploaded = await drive.uploadFile(nomeArquivo, buffer, midia.mimeType, pastas.cliente.id);

        if (uploaded) {
          resultado.enviados.push({
            tipo,
            arquivo: nomeArquivo,
            link: uploaded.webViewLink,
            driveId: uploaded.id
          });
          resultado.identificados.push({ tipo, arquivo: nomeArquivo, status: 'enviado' });
        } else {
          resultado.erros.push(`Falha ao enviar: ${nomeArquivo}`);
        }

        if (tipo === 'Outro') {
          resultado.naoIdentificados.push({
            arquivo: midia.fileName || `midia_${i + 1}`,
            caption: midia.caption
          });
        }
      } catch (e) {
        resultado.erros.push(`Erro na mídia ${i + 1}: ${e.message}`);
      }
    }

    // 4. Gerar auditoria
    const tiposEncontrados = resultado.identificados.map(d => d.tipo);
    resultado.auditoria = gerarAuditoria(tiposEncontrados);
    resultado.linkPasta = `https://drive.google.com/drive/folders/${pastas.cliente.id}`;
    resultado.status = 'concluido';

    console.log(`[DOCS-NPL] Organização concluída: ${resultado.enviados.length} enviados, ${resultado.erros.length} erros`);
    return resultado;
  } catch (e) {
    console.error('[DOCS-NPL] Erro geral:', e.message);
    resultado.status = 'erro';
    resultado.erros.push(e.message);
    return resultado;
  }
}

// ===== AUDITORIA =====

function gerarAuditoria(tiposEncontrados) {
  const auditoria = {};

  for (const doc of DOCUMENTOS_OBRIGATORIOS) {
    auditoria[doc.tipo] = tiposEncontrados.includes(doc.tipo) ? 'OK' : 'FALTA';
  }

  const total = DOCUMENTOS_OBRIGATORIOS.length;
  const presentes = Object.values(auditoria).filter(v => v === 'OK').length;
  const faltando = total - presentes;

  return {
    documentos: auditoria,
    resumo: { total, presentes, faltando },
    completo: faltando === 0
  };
}

// ===== GERAR RELATÓRIO WHATSAPP =====

function gerarRelatorioWhatsApp(resultado) {
  let msg = `DOCUMENTOS - ${resultado.cliente}\n\n`;

  // Status
  if (resultado.status === 'sem_midias') {
    msg += `Nenhum documento encontrado na conversa.\n`;
  } else {
    msg += `Midias encontradas: ${resultado.totalMidias}\n`;
    msg += `Documentos enviados ao Drive: ${resultado.enviados.length}\n`;
  }

  // Auditoria
  msg += `\n--- AUDITORIA ---\n`;
  const aud = resultado.auditoria;

  if (aud.documentos) {
    for (const [tipo, status] of Object.entries(aud.documentos)) {
      const icon = status === 'OK' ? 'V' : 'X';
      msg += `${icon} ${tipo}\n`;
    }

    msg += `\nPresentes: ${aud.resumo.presentes}/${aud.resumo.total}`;
    if (aud.resumo.faltando > 0) {
      msg += ` | Faltando: ${aud.resumo.faltando}`;
    }
    if (aud.completo) {
      msg += `\n\nDocumentacao COMPLETA!`;
    }
  }

  // Link da pasta
  if (resultado.linkPasta) {
    msg += `\n\nPasta no Drive:\n${resultado.linkPasta}`;
  }

  // Erros
  if (resultado.erros.length > 0) {
    msg += `\n\nErros (${resultado.erros.length}): ${resultado.erros[0]}`;
  }

  return msg;
}

// ===== COBRAR DOCUMENTOS FALTANTES DO CLIENTE =====

function gerarCobrancaDocumentos(auditoria, nomeCliente) {
  if (!auditoria.documentos) return null;

  const faltando = Object.entries(auditoria.documentos)
    .filter(([_, status]) => status === 'FALTA')
    .map(([tipo]) => tipo);

  if (faltando.length === 0) return null;

  const nome = nomeCliente.split(' ')[0]; // Primeiro nome
  let msg = `${nome}, para dar andamento ao seu caso, ainda precisamos dos seguintes documentos:\n\n`;

  faltando.forEach((doc, i) => {
    msg += `${i + 1}. ${doc}\n`;
  });

  msg += `\nPode enviar por aqui mesmo, por foto ou PDF. Qualquer duvida estou a disposicao.`;

  return msg;
}

// ===== ANÁLISE DETALHADA DE DOCUMENTO (Claude Vision + extração) =====

async function analisarDocumento(mediaUrl, mediaType, clienteNome = '', clienteCpf = '') {
  try {
    // Download da mídia
    const buffer = await downloadMidia(mediaUrl);
    if (!buffer) {
      return { ok: false, error: 'Falha ao baixar a midia' };
    }

    const isImage = (mediaType || '').startsWith('image/') || mediaType === 'image';
    const isPdf = (mediaType || '').includes('pdf') || mediaType === 'document';

    // Só processa imagens (Claude Vision não aceita PDF diretamente)
    if (!isImage && !isPdf) {
      return { ok: false, error: 'Tipo de mídia não suportado para análise' };
    }

    // Se for PDF, por enquanto retornar nome genérico baseado no caption
    if (isPdf && !isImage) {
      return {
        ok: true,
        tipo: 'outro',
        nome_sugerido: `Documento - ${clienteNome || 'Cliente'}.pdf`,
        dados_extraidos: { observacao: 'PDF — análise detalhada não disponível' }
      };
    }

    const base64 = buffer.toString('base64');
    const mime = (mediaType || '').startsWith('image/') ? mediaType
      : mediaType === 'image' ? 'image/jpeg'
      : 'image/jpeg';
    const mediaTypeClaude = mime.includes('png') ? 'image/png'
      : mime.includes('webp') ? 'image/webp'
      : 'image/jpeg';

    const prompt = `Voce e um analista de documentos juridicos trabalhistas brasileiros. Analise a imagem e retorne APENAS um JSON valido (sem markdown, sem crases) com esta estrutura:

{
  "tipo": "rg" | "cpf" | "ctps" | "holerite" | "contracheque" | "laudo_medico" | "cid" | "contrato_honorarios" | "procuracao" | "comprovante_residencia" | "certidao" | "contrato_trabalho" | "termo_rescisao" | "hipossuficiencia" | "outro",
  "nome_sugerido": "nome descritivo do arquivo sem extensao",
  "dados_extraidos": {
    "nome": "nome da pessoa se identificavel",
    "cpf": "CPF se visivel",
    "rg": "RG se visivel",
    "data_emissao": "se visivel (formato DD/MM/AAAA)",
    "data_nascimento": "se visivel",
    "empresa": "nome da empresa empregadora se aplicavel",
    "cargo": "se aplicavel",
    "valor": "valor em R$ se aplicavel (holerite, rescisao)",
    "periodo": "mes/ano ou periodo se aplicavel",
    "observacoes": "detalhes relevantes do documento"
  }
}

Cliente esperado: ${clienteNome || 'nao informado'}${clienteCpf ? ' (CPF: ' + clienteCpf + ')' : ''}

Regras:
- Se um campo nao estiver visivel, omita-o do JSON (nao coloque null ou string vazia)
- nome_sugerido deve ser descritivo (ex: "RG - Joao Silva", "Holerite Janeiro 2024 - Joao Silva", "CTPS Folha 15 - Joao Silva")
- Use nome do cliente esperado no nome_sugerido quando fizer sentido
- Valores monetarios no formato "R$ 1.234,56"
- Retorne SOMENTE o JSON, nada mais`;

    const response = await claude.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeClaude, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    const texto = response.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(texto);
    } catch {
      const match = texto.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch { return { ok: false, error: 'Resposta da IA nao e JSON valido' }; }
      } else {
        return { ok: false, error: 'Resposta da IA nao e JSON valido' };
      }
    }

    return {
      ok: true,
      tipo: parsed.tipo || 'outro',
      nome_sugerido: parsed.nome_sugerido || `Documento - ${clienteNome || 'Cliente'}`,
      dados_extraidos: parsed.dados_extraidos || {}
    };
  } catch (e) {
    console.error('[DOCS-NPL] Erro na análise:', e.message);
    return { ok: false, error: e.message };
  }
}

// ===== EXTRAIR CONTEÚDO DE MÍDIA (usado no fluxo principal da Laura) =====
// Usa Haiku 4.5 (mais barato) para extrair informação de imagens/PDFs
async function extrairConteudoMidia(mediaUrl, mediaType, caption = '') {
  try {
    const buffer = await downloadMidia(mediaUrl);
    if (!buffer) return null;

    const isImage = (mediaType || '').startsWith('image/') || mediaType === 'image';
    const isPdf = (mediaType || '').includes('pdf') || mediaType === 'document' || mediaType === 'application/pdf';

    if (!isImage && !isPdf) return null;

    const base64 = buffer.toString('base64');
    const prompt = `Extraia todas as informacoes relevantes deste documento/imagem que um advogado trabalhista precisaria saber. Seja objetivo, use topicos curtos. Se for documento trabalhista (CTPS, contracheque, contrato), extraia: nome, CPF, empresa, cargo, datas, valores. Se for foto (cracha, print, etc), descreva o que ve. Se nao for relevante, responda "Sem informacao relevante para o caso trabalhista".

${caption ? `Caption do lead: ${caption}` : ''}

Responda em portugues, maximo 10 linhas.`;

    let content;
    if (isImage) {
      const mediaTypeClaude = (mediaType || '').includes('png') ? 'image/png'
        : (mediaType || '').includes('webp') ? 'image/webp'
        : 'image/jpeg';
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaTypeClaude, data: base64 } },
        { type: 'text', text: prompt }
      ];
    } else {
      // PDF
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt }
      ];
    }

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content }]
    });

    const texto = response.content[0].text.trim();
    console.log(`[MEDIA-EXTRACT] Extraido (${mediaType}): ${texto.slice(0, 80)}...`);
    return texto;
  } catch (e) {
    console.error('[MEDIA-EXTRACT] Erro:', e.message);
    return null;
  }
}

module.exports = {
  DOCUMENTOS_OBRIGATORIOS,
  buscarMidiasWhatsApp,
  identificarDocumento,
  organizarDocumentos,
  gerarAuditoria,
  gerarRelatorioWhatsApp,

  gerarCobrancaDocumentos,
  analisarDocumento,
  identificarPorTexto,
  extrairConteudoMidia
};
