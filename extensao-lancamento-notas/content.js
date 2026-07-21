// Content script injetado em saladofuturoprofessor.educacao.sp.gov.br
//
// O site e uma SPA sem ids/classes estaveis confirmados (so mapeamos via
// texto visivel e screenshots - ver relatorio de 21/07/2026). Por isso os
// helpers abaixo localizam elementos por TEXTO, nao por seletor CSS.
// Se voce inspecionar o HTML real (F12) e achar classes/ids mais estaveis,
// atualize estas funcoes.
//
// CUIDADO: existe um recurso escondido de "acionar policia" no cabecalho
// (perto do icone/logo). NUNCA clique em icones do cabecalho por posicao/
// indice sem antes confirmar o texto/aria-label do elemento.

function buscarPorTexto(texto, seletores = ["a", "button", "div", "span", "li"]) {
  const alvo = texto.trim().toLowerCase();
  for (const seletor of seletores) {
    for (const el of document.querySelectorAll(seletor)) {
      const conteudo = (el.textContent || "").trim().toLowerCase();
      if (conteudo === alvo) return el;
    }
  }
  return null;
}

function clicar(el) {
  if (!el) return false;
  el.click();
  return true;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Define o valor de um <select> nativo e dispara o evento 'change'.
// IMPORTANTE: cliques sinteticos na lista suspensa nao funcionam neste site
// (testado em 21/07/2026) - sempre usar esta funcao para selects.
function selecionarOpcaoPorTexto(select, texto) {
  const opcao = Array.from(select.options).find(
    (o) => o.text.trim().toLowerCase() === texto.trim().toLowerCase(),
  );
  if (!opcao) return false;
  select.value = opcao.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// Navega: Home -> Diario de Classe -> (card Avaliacao) Lancamento
window.__gestaoDiarioNavegarParaLancamento = async () => {
  const linkDiario = buscarPorTexto("Diário de Classe", ["a"]);
  if (!linkDiario) return { ok: false, motivo: "Link 'Diário de Classe' não encontrado no menu lateral." };
  clicar(linkDiario);
  await esperar(1500);

  const linkLancamento = buscarPorTexto("Lançamento", ["a"]);
  // ATENCAO: existem varios links "Lançamento" na home do Diario de Classe
  // (Frequencia, Registro de Aulas, Avaliacao, Fechamento). Este helper pega
  // o PRIMEIRO que encontrar - ainda precisa filtrar pelo card certo
  // ("Avaliação"). TODO: subir ate o card pai e confirmar o titulo antes de
  // clicar, em vez de pegar o primeiro match.
  if (!linkLancamento) return { ok: false, motivo: "Link 'Lançamento' não encontrado em Diário de Classe." };
  clicar(linkLancamento);
  await esperar(1500);

  return { ok: true };
};

// Seleciona uma turma pelo nome exato do card e clica em "Notas e Edição".
window.__gestaoDiarioAbrirTurma = async (nomeTurma) => {
  const cabecalhoCard = buscarPorTexto(nomeTurma, ["div", "span", "h3", "h4"]);
  if (!cabecalhoCard) return { ok: false, motivo: `Turma "${nomeTurma}" não encontrada na tela de lançamento.` };

  // Sobe ate o container do card (heuristica: 4 niveis acima) e procura o
  // botao "Notas e Edição" dentro dele.
  let container = cabecalhoCard;
  for (let i = 0; i < 4 && container.parentElement; i++) container = container.parentElement;

  const botao = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim().toLowerCase().includes("notas e edição"),
  );
  if (!botao) return { ok: false, motivo: "Botão 'Notas e Edição' não encontrado perto do card da turma." };
  clicar(botao);
  await esperar(1500);
  return { ok: true };
};

// Seleciona o bimestre na tela de detalhes (usa o helper de select acima).
window.__gestaoDiarioSelecionarBimestre = async (textoBimestre) => {
  const select = document.querySelector("select");
  if (!select) return { ok: false, motivo: "Dropdown de Bimestre não encontrado." };
  const ok = selecionarOpcaoPorTexto(select, textoBimestre);
  await esperar(1500);
  return { ok, motivo: ok ? null : `Opção "${textoBimestre}" não encontrada no dropdown.` };
};

// TODO (retomar sexta-feira 24/07/2026): implementar apos mapear a tela que
// abre em "Lançar Nota". Hoje esse botao fica desabilitado para avaliacoes
// com data futura - so testamos com avaliacoes ainda nao vencidas.
window.__gestaoDiarioPreencherNotas = async (_notasPorAluno) => {
  return { ok: false, motivo: "Ainda não implementado - pendente do mapeamento da tela 'Lançar Nota'." };
};

console.log("[Gestão Diário] content.js da extensão de Lançamento de Notas carregado.");
