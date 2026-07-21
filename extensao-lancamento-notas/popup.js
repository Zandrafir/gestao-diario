const statusEl = document.getElementById("status");
const turmaEl = document.getElementById("turma");
const bimestreEl = document.getElementById("bimestre");
const botaoNavegar = document.getElementById("btn-navegar");
const botaoLancar = document.getElementById("btn-lancar");

async function atualizarStatus() {
  chrome.runtime.sendMessage({ tipo: "GET_STATUS" }, (resposta) => {
    if (resposta?.abaAberta) {
      statusEl.className = "ok";
      statusEl.textContent = "Aba do Sala do Futuro Professor encontrada.";
    } else {
      statusEl.className = "pendente";
      statusEl.textContent = "Abra o Sala do Futuro Professor (saladofuturoprofessor.educacao.sp.gov.br) em uma aba.";
    }
  });
}

botaoNavegar.addEventListener("click", () => {
  botaoNavegar.disabled = true;
  botaoNavegar.textContent = "Navegando...";
  chrome.runtime.sendMessage({ tipo: "IR_PARA_LANCAMENTO" }, (resposta) => {
    botaoNavegar.disabled = false;
    botaoNavegar.textContent = "Ir para tela de lançamento";
    if (resposta?.status !== "ok") {
      alert("Erro: " + (resposta?.mensagem || "desconhecido"));
    }
  });
});

// Deixado desabilitado de propósito - ver aviso na popup.html.
botaoLancar.addEventListener("click", () => {
  chrome.runtime.sendMessage({ tipo: "LANCAR_NOTAS_TURMA" }, (resposta) => {
    alert(resposta?.mensagem || "Ainda não implementado.");
  });
});

atualizarStatus();
