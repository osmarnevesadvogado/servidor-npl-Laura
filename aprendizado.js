// ===== MÓDULO DE APRENDIZADO - NPLADVS (Laura) =====
// Laura aprende com cada conversa e melhora ao longo do tempo
// Usa Claude para analisar conversas finalizadas e extrair lições

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

// ===== ANALISAR CONVERSA E EXTRAIR LIÇÕES =====
// Chamado quando uma conversa resulta em agendamento ou perda
async function analisarConversa(historico, lead, resultado) {
  if (!historico || historico.length < 4) return; // conversa muito curta

  const nome = lead?.nome || 'Lead';
  const msgs = historico.map(m => `${m.role === 'user' ? 'Lead' : 'Laura'}: ${m.content}`).join('\n');

  const prompt = `Voce e um analista de vendas do escritorio NPLADVS (trabalhista, Belem/PA).
Analise esta conversa entre a Laura (assistente IA) e o lead "${nome}".
O resultado da conversa foi: ${resultado} (agendou consulta / lead perdido / lead esfriou)

CONVERSA:
${msgs.slice(-3000)}

Extraia LICOES PRATICAS que a Laura pode usar em conversas futuras. Para cada licao, classifique:

TIPOS:
- objecao: como lidar com uma objecao especifica do lead
- abordagem: tecnica de abordagem que funcionou (ou nao)
- padrao: padrao de comportamento do lead que indica algo
- erro: algo que a Laura fez errado e deve evitar

Responda em JSON PURO (sem markdown, sem crases), com este formato:
[
  {
    "tipo": "objecao|abordagem|padrao|erro",
    "categoria": "descricao curta da situacao",
    "licao": "a licao pratica em 1-2 frases",
    "contexto": "o que o lead disse ou fez que gerou essa licao"
  }
]

Regras:
- Maximo 3 licoes por conversa (so as mais importantes)
- Licoes devem ser GENERALIZAVEIS (aplicaveis a outros leads, nao especificas deste)
- Se a conversa foi normal e sem nada especial, retorne []
- Foque no que pode melhorar o desempenho da Laura`;

  try {
    const response = await anthropic.messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const texto = response.content[0].text.trim();
    let licoes;
    try {
      licoes = JSON.parse(texto);
    } catch {
      // Tentar extrair JSON de dentro do texto
      const match = texto.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          licoes = JSON.parse(match[0]);
        } catch (parseError) {
          console.log('[APRENDIZADO-NPL] Falha ao parsear JSON extraido');
          return;
        }
      } else {
        console.log('[APRENDIZADO-NPL] Resposta nao e JSON valido');
        return;
      }
    }

    if (!Array.isArray(licoes) || licoes.length === 0) {
      console.log('[APRENDIZADO-NPL] Nenhuma licao extraida desta conversa');
      return;
    }

    // Verificar duplicatas antes de salvar
    for (const licao of licoes.slice(0, 3)) {
      const duplicada = await verificarDuplicata(licao);
      if (duplicada) {
        // Atualizar efetividade da lição existente
        await incrementarUso(duplicada.id, resultado === 'agendou');
        console.log(`[APRENDIZADO-NPL] Licao existente atualizada: "${licao.categoria}"`);
      } else {
        // Salvar nova lição
        await salvarLicao(licao, resultado);
        console.log(`[APRENDIZADO-NPL] Nova licao salva: "${licao.categoria}"`);
      }
    }

    console.log(`[APRENDIZADO-NPL] ${licoes.length} licao(es) processadas de conversa com ${nome} (${resultado})`);
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro ao analisar conversa:', e.message);
  }
}

// ===== VERIFICAR SE JÁ EXISTE LIÇÃO SIMILAR =====
async function verificarDuplicata(licao) {
  try {
    const { data } = await supabase
      .from('aprendizados')
      .select('id, categoria, vezes_usado')
      .eq('tipo', licao.tipo)
      .eq('escritorio', 'npl')
      .eq('ativo', true);

    if (!data || data.length === 0) return null;

    // Comparar por categoria similar
    const catLower = (licao.categoria || '').toLowerCase();
    for (const existente of data) {
      const existLower = (existente.categoria || '').toLowerCase();
      // Se 60%+ das palavras batem, é duplicata
      const palavrasNova = catLower.split(/\s+/);
      const palavrasExist = existLower.split(/\s+/);
      const comuns = palavrasNova.filter(p => palavrasExist.includes(p));
      if (comuns.length >= Math.min(palavrasNova.length, palavrasExist.length) * 0.6) {
        return existente;
      }
    }
    return null;
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro ao verificar duplicata:', e.message);
    return null;
  }
}

// ===== SALVAR NOVA LIÇÃO =====
async function salvarLicao(licao, resultado) {
  try {
    await supabase.from('aprendizados').insert({
      tipo: licao.tipo,
      categoria: licao.categoria,
      licao: licao.licao,
      contexto: licao.contexto,
      resultado: resultado,
      vezes_usado: 1,
      efetividade: resultado === 'agendou' ? 1.0 : 0.0,
      escritorio: 'npl',
      ativo: true
    });
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro ao salvar licao:', e.message);
  }
}

// ===== INCREMENTAR USO DE LIÇÃO EXISTENTE =====
async function incrementarUso(id, sucesso) {
  try {
    const { data } = await supabase
      .from('aprendizados')
      .select('vezes_usado, efetividade')
      .eq('id', id)
      .single();

    if (data) {
      const novosUsos = (data.vezes_usado || 0) + 1;
      // Média ponderada: efetividade vai convergindo
      const novaEfetividade = ((data.efetividade || 0) * (data.vezes_usado || 1) + (sucesso ? 1 : 0)) / novosUsos;

      await supabase
        .from('aprendizados')
        .update({
          vezes_usado: novosUsos,
          efetividade: Math.round(novaEfetividade * 100) / 100,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', id);
    }
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro ao incrementar uso:', e.message);
  }
}

// ===== BUSCAR LIÇÕES RELEVANTES PARA O PROMPT =====
// Retorna as melhores lições para incluir no contexto da Laura
async function buscarLicoesRelevantes(tipoContexto, limite = 5) {
  try {
    let query = supabase
      .from('aprendizados')
      .select('tipo, categoria, licao, efetividade, vezes_usado')
      .eq('escritorio', 'npl')
      .eq('ativo', true)
      .order('efetividade', { ascending: false })
      .order('vezes_usado', { ascending: false })
      .limit(limite);

    // Se é triagem, priorizar abordagens e objeções
    // Se é follow-up, priorizar padrões
    if (tipoContexto === 'triagem') {
      query = query.in('tipo', ['objecao', 'abordagem', 'erro']);
    } else if (tipoContexto === 'followup') {
      query = query.in('tipo', ['padrao', 'abordagem']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[APRENDIZADO-NPL] Erro ao buscar licoes:', error.message);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro:', e.message);
    return [];
  }
}

// ===== FORMATAR LIÇÕES PARA O PROMPT =====
function formatarLicoesParaPrompt(licoes) {
  if (!licoes || licoes.length === 0) return '';

  const linhas = ['\nLICOES APRENDIDAS (use como guia, baseadas em conversas anteriores):'];
  for (const l of licoes) {
    const estrelas = l.efetividade >= 0.7 ? '★★★' : l.efetividade >= 0.4 ? '★★' : '★';
    linhas.push(`- [${l.tipo.toUpperCase()}] ${l.licao} (${estrelas} efetividade, usado ${l.vezes_usado}x)`);
  }
  return linhas.join('\n');
}

// ===== DESATIVAR LIÇÕES RUINS =====
// Roda periodicamente para desativar lições com efetividade muito baixa
async function limparLicoesRuins() {
  try {
    const { data, error } = await supabase
      .from('aprendizados')
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq('escritorio', 'npl')
      .eq('ativo', true)
      .gte('vezes_usado', 5) // só desativa depois de 5+ usos
      .lte('efetividade', 0.15) // efetividade menor que 15%
      .select('id');

    if (data && data.length > 0) {
      console.log(`[APRENDIZADO-NPL] ${data.length} licao(es) com baixa efetividade desativadas`);
    }
  } catch (e) {
    console.error('[APRENDIZADO-NPL] Erro na limpeza:', e.message);
  }
}

module.exports = {
  analisarConversa,
  buscarLicoesRelevantes,
  formatarLicoesParaPrompt,
  limparLicoesRuins
};
