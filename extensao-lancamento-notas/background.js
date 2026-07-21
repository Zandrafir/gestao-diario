// Service worker da extensao "Lancamento de Notas SEDUC".
//
// Fluxo pretendido (ver relatorio de mapeamento de 21/07/2026):
//   1. Popup pede as notas pendentes de uma turma+disciplina+bimestre no
//      Supabase do Gestao Diario (mesmo banco do PWA: ddtoferhisbnmxhitoff).
//   2. Popup manda a extensao abrir a aba do Sala do Futuro Professor,
//      navegar ate Diario de Classe > Avaliacao > Lancamento > [turma] >
//      Notas e Edicao, selecionar o bimestre certo (via content.js).
//   3. Para cada avaliacao ja vencida (Lancar Nota habilitado), preencher
//      a nota de cada aluno e confirmar.
//
// PENDENCIA (retomar sexta-feira, 24/07/2026): ainda nao sabemos a estrutura
// exata da tela que abre ao clicar em "Lancar Nota" (tipo de campo, mascara,
// botao de salvar por linha vs turma toda, modal de confirmacao). Até lá,
// so implementamos leitura/navegacao ate esse ponto; preencherNotas() abaixo
// e um stub.
//
// Fonte de dados: tabela public.notas_alunos no mesmo Supabase do PWA
// (ddtoferhisbnmxhitoff). Contrato de leitura (BUSCAR_NOTAS_PENDENTES):
//   GET /rest/v1/notas_alunos?turma=eq.<turma>&disciplina=eq.<disciplina>
//       &bimestre=eq.<bimestre>&avaliacao_nome=eq.<avaliacao>&injetado=eq.false
//       &select=id,aluno_nome,nota
//   -> [{ id: 12, aluno_nome: "ARTHUR DE MELLO BALBINO", nota: 8.5 }, ...]
// Depois de preencher com sucesso na tela do Sala do Futuro, chamar
// MARCAR_NOTAS_INJETADAS com os ids para nao reenviar a mesma nota depois.

const SUPABASE_URL = "https://ddtoferhisbnmxhitoff.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdG9mZXJoaXNibm14aGl0b2ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njc5ODYsImV4cCI6MjA5MjQ0Mzk4Nn0.BSbHnFxN25IHDl3EEAAdHQS-7yCL0XNvoVsgtc1jw94";

const URL_SALA_DO_FUTURO = "https://saladofuturoprofessor.educacao.sp.gov.br";

async function supabaseApi(tabela, filtro = "", opcoes = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${tabela}${filtro ? "?" + filtro : ""}`;
  const resposta = await fetch(url, {
    ...opcoes,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!resposta.ok) throw new Error(`Erro ${resposta.status} ao acessar ${tabela}: ${await resposta.text()}`);
  return resposta.status === 204 ? null : resposta.json();
}

// Busca as notas ainda nao injetadas de uma turma+disciplina+bimestre
// (e, opcionalmente, de uma avaliacao especifica). Ver contrato no topo do arquivo.
async function buscarNotasPendentes({ turma, disciplina = "Historia", bimestre, avaliacaoNome }) {
  const params = new URLSearchParams({
    turma: `eq.${turma}`,
    disciplina: `eq.${disciplina}`,
    bimestre: `eq.${bimestre}`,
    injetado: "eq.false",
    select: "id,aluno_nome,nota",
  });
  if (avaliacaoNome) params.set("avaliacao_nome", `eq.${avaliacaoNome}`);
  return supabaseApi("notas_alunos", params.toString());
}

async function marcarNotasInjetadas(ids) {
  if (!ids?.length) return;
  return supabaseApi(`notas_alunos?id=in.(${ids.join(",")})`, "", {
    method: "PATCH",
    body: JSON.stringify({ injetado: true, injetado_em: new Date().toISOString() }),
  });
}

async function encontrarAbaSalaDoFuturo() {
  const abas = await chrome.tabs.query({ url: `${URL_SALA_DO_FUTURO}/*` });
  return abas[0]?.id || null;
}

chrome.runtime.onMessage.addListener((mensagem, sender, sendResponse) => {
  if (mensagem.tipo === "GET_STATUS") {
    encontrarAbaSalaDoFuturo().then((tabId) => {
      sendResponse({ abaAberta: Boolean(tabId), tabId });
    });
    return true;
  }

  if (mensagem.tipo === "BUSCAR_NOTAS_PENDENTES") {
    buscarNotasPendentes(mensagem)
      .then((dados) => sendResponse({ status: "ok", dados }))
      .catch((erro) => sendResponse({ status: "erro", mensagem: String(erro) }));
    return true;
  }

  if (mensagem.tipo === "MARCAR_NOTAS_INJETADAS") {
    marcarNotasInjetadas(mensagem.ids)
      .then(() => sendResponse({ status: "ok" }))
      .catch((erro) => sendResponse({ status: "erro", mensagem: String(erro) }));
    return true;
  }

  if (mensagem.tipo === "IR_PARA_LANCAMENTO") {
    encontrarAbaSalaDoFuturo().then(async (tabId) => {
      if (!tabId) {
        sendResponse({
          status: "erro",
          mensagem: "Abra o Sala do Futuro Professor (saladofuturoprofessor.educacao.sp.gov.br) em uma aba primeiro.",
        });
        return;
      }
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.__gestaoDiarioNavegarParaLancamento?.() ?? { ok: false, motivo: "content.js nao carregado nesta aba (recarregue a pagina)." },
        });
        sendResponse(result?.ok ? { status: "ok" } : { status: "erro", mensagem: result?.motivo });
      } catch (erro) {
        sendResponse({ status: "erro", mensagem: String(erro) });
      }
    });
    return true;
  }

  if (mensagem.tipo === "LANCAR_NOTAS_TURMA") {
    // A fonte de dados (notas_alunos) ja esta pronta e funcionando - falta so
    // o preenchimento na tela do Sala do Futuro (window.__gestaoDiarioPreencherNotas
    // em content.js), pendente do mapeamento de sexta-feira (24/07/2026).
    sendResponse({
      status: "erro",
      mensagem: "Preenchimento na tela do Sala do Futuro ainda nao implementado - aguardando mapeamento da tela 'Lancar Nota' (sexta-feira). A leitura de notas do Supabase ja funciona (BUSCAR_NOTAS_PENDENTES).",
    });
    return true;
  }
});
