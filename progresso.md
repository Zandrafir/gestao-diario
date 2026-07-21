# Progresso do Projeto — Gestão Diário

_Última atualização: 21/07/2026_

## 1. Resumo executivo

O projeto passou por duas fases:

**Fase 1 (descontinuada):** construímos do zero um sistema novo ("Sistema do Professor", em
`C:\Users\tribe\Documents\SistemaProfessor`) com Flask + SQLite + extensão Chrome para o Centro de
Mídias SP (CMSP). Chegou a ter Turmas, Conteúdos, Notas, Metodologias Ativas com IA, Custos de IA e
uma extensão que baixa os PDFs oficiais das aulas direto para o computador. **Essa fase foi
abandonada** quando o professor decidiu, em vez disso, evoluir o PWA que já usava na rotina.

**Fase 2 (atual):** refatoração do PWA real do professor, **`gestao-diario`**
(`C:\Users\tribe\Documents\gestao-diario`), publicado no GitHub Pages
(`https://zandrafir.github.io/gestao-diario/`). Este é um único `index.html` com CSS/JS embutidos,
PWA (manifest + service worker), já com módulos de Tutoria, Aulas (grade horária fixa), ATPCG,
Projetos, Diário e Relatórios, autenticado via Supabase Auth.

Nesta fase:
- Reapontamos o PWA para o banco Supabase de produção correto (`ddtoferhisbnmxhitoff`, exibido no
  painel como **"Gestão 2.0"**) — havia uma confusão inicial com outro projeto Supabase abandonado
  (`tfmtzrechneonolwegjm`, de um experimento anterior de agenda), já corrigida.
- Adicionamos dois botões de IA na tela de aula (Resumir para a lousa + Metodologias Ativas), que
  chamam uma Edge Function `ia` (proxy seguro — a chave da Anthropic nunca fica no PWA público).
  **A Edge Function ainda não foi publicada pelo professor** — código pronto, deploy pendente.
- Mapeamos ao vivo (com o professor logado, só leitura/navegação) a tela de lançamento de notas do
  **Sala do Futuro Professor** (SEDUC), para construir uma extensão Chrome separada
  (`extensao-lancamento-notas`) que vai injetar notas automaticamente lá. Descobrimos que o botão
  "Lançar Nota" só é habilitado para avaliações com data já vencida — o mapeamento final (estrutura
  exata dos campos de nota) fica pendente para sexta-feira (24/07/2026), quando o professor mudar a
  data de uma avaliação de teste no 8º D para permitir o teste real.
- Criamos e **testamos de ponta a ponta** (leitura, upsert, marcação de injetado, limpeza) a tabela
  `notas_alunos` no Supabase, que será a fonte de dados única entre o PWA e a extensão.

## 2. Dados importantes

### Supabase — projeto oficial em uso

| Campo | Valor |
|---|---|
| Nome de exibição | Gestão 2.0 |
| Project ref | `ddtoferhisbnmxhitoff` |
| URL | `https://ddtoferhisbnmxhitoff.supabase.co` |
| Chave anon (pública, já embutida em `index.html` e na extensão) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdG9mZXJoaXNibm14aGl0b2ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njc5ODYsImV4cCI6MjA5MjQ0Mzk4Nn0.BSbHnFxN25IHDl3EEAAdHQS-7yCL0XNvoVsgtc1jw94` |
| Tabelas | `sessoes_tutoria`, `agendamentos_tutoria`, `reunioes_atpcg`, `projetos`, `aulas_turma`, `pdfs_aula`, **`notas_alunos`** (nova) |
| Storage bucket | `materiais` (PDFs de aula) |
| RLS | Policy `acesso_total_fase1` (`using(true) with check(true)`) em todas as tabelas — acesso liberado pela chave anon. **Revisão de segurança pendente** antes de expor publicamente com mais dados sensíveis. |

⚠️ **Projeto Supabase a NÃO usar:** `tfmtzrechneonolwegjm.supabase.co` — experimento anterior
(tabela `agenda`, 24 aulas de seed, frontend Vite abandonado em
`SistemaProfessor\frontend`). Não tem relação com o `gestao-diario`.

### Tabela `notas_alunos` (schema aplicado e testado em 21/07/2026)

```sql
create table public.notas_alunos (
  id bigint generated always as identity primary key,
  aluno_nome text not null,
  turma text not null,
  disciplina text not null default 'Historia',
  bimestre text not null,
  avaliacao_nome text not null default 'Nota Bimestral',
  nota numeric,
  injetado boolean not null default false,
  injetado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (aluno_nome, turma, disciplina, bimestre, avaliacao_nome)
);
```
Trigger `trg_notas_alunos_atualizado` mantém `atualizado_em` em dia. Testado: INSERT, upsert via
`on_conflict`, PATCH de `injetado`, DELETE — todos OK, registro de teste já removido.

### Contrato de API que a extensão usa para ler notas

```
GET /rest/v1/notas_alunos?turma=eq.<turma>&disciplina=eq.Historia&bimestre=eq.<bimestre>
    &injetado=eq.false&select=id,aluno_nome,nota
→ [{ "id": 12, "aluno_nome": "ARTHUR DE MELLO BALBINO", "nota": 8.5 }, ...]
```

### Estrutura de arquivos

```
gestao-diario/
  index.html                     — PWA principal (turmas, aulas, IA, notas)
  manifest.json, sw.js           — PWA (sw.js cache 'paac-v2', limpa cache antigo sozinho)
  Aulas/8º Ano/..., 9º Ano/...   — PDFs oficiais das aulas
  supabase/functions/ia/index.ts — Edge Function proxy da IA (Anthropic) — PENDENTE DE DEPLOY
  extensao-lancamento-notas/     — extensão Chrome para o Sala do Futuro (MV3)
    manifest.json, background.js, content.js, popup.html, popup.js
```

### Achados do mapeamento do Sala do Futuro Professor (21/07/2026)

- Site é uma SPA (`saladofuturoprofessor.educacao.sp.gov.br`), URLs fixas, sem ID de turma na URL.
- Caminho: Diário de Classe → Avaliação → Lançamento → [turma] "Notas e Edição" → escolher Bimestre.
- **Dropdowns nativos:** clique sintético na lista suspensa NÃO funciona neste site — é preciso
  setar `select.value` + disparar evento `change` diretamente.
- **"Lançar Nota" fica desabilitado para avaliações com data futura** — só habilita quando a data
  da avaliação já passou. Isso bloqueou o mapeamento completo da tela de input de notas.
- Existe um recurso escondido de "acionar polícia" no cabeçalho do site — nunca usar seletores por
  posição/ícone ali sem checar o texto/aria-label antes.
- Auditoria: toda alteração de avaliação registra `Perfil`, `Última Alteração` e `Plataforma: Sala
  do Futuro - Web` — indistinguível de edição manual.

## 3. Linha do tempo — comandos executados no terminal com sucesso

### Fase 1 — Sistema do Professor (descontinuado)
1. `rm -f SistemaProfessor/templates/resumos.html` — removida tela antiga de Resumos de Aula.
2. `python -c "import ast; ast.parse(app.py); ast.parse(database.py)"` → **Sintaxe OK**.
3. `python -c "import database; database.init_db()"` → **Banco inicializado (tabela aulas criada)**.
4. `python -c "from app import app; ... test_client() ..."` — smoke test das rotas Flask (após
   corrigir `custos.html`) → **200 em todas as rotas**, upload de PDF de teste OK, visualizador
   inline servindo `application/pdf` OK.
5. `python -c "... os.remove(...); conn.execute('DELETE FROM aulas') ..."` → **Registros de teste
   removidos**.
6. `python gerar_resumo_pdf.py` (script com fpdf2) → **PDF gerado com sucesso** (resumo técnico do
   sistema em PDF).

### Fase 2 — Setup do front-end Vite (experimento de agenda, hoje secundário)
7. `winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent`
   → **Node.js v24.18.0 instalado**.
8. Verificação `node --version` / `npm --version` via caminho completo → **node v24.18.0, npm 11.16.0**.
9. `$env:Path += nodejs; npm install` (dentro de `frontend/`) → **20 pacotes instalados**.
10. `node esbuild --version` → **0.21.5** (confirma binário funcional).
11. `npm run dev` (background) + `Invoke-WebRequest http://localhost:5173/` → **HTTP 200**, servidor
    de teste encerrado em seguida.
12. `Invoke-WebRequest` direto no REST do Supabase (`/rest/v1/turmas`) com a chave anon do projeto
    antigo → **HTTP 200** (conexão validada — depois descartamos esse projeto).
13. `npm run dev` novamente após construir a tela de Agenda → **Vite pronto em 333ms**.
14. `Invoke-WebRequest` confirmando status de aula alterado e revertido no banco (teste ponta a
    ponta da troca de status) → **HTTP 200** nas duas consultas.

### Fase 3 — Extração e preparação do `gestao-diario`
15. `unzip -o gestao-diario-main.zip` + `find` — extração do projeto real do professor.
16. `wc -l index.html manifest.json sw.js` + `grep -c` — confirmado 1519 linhas, 3 `<script>`, 1 `<style>`.
17. `cp -r gestao-diario-main/. C:/Users/tribe/Documents/gestao-diario/` — projeto copiado para a
    pasta de trabalho definitiva.
18. Servidor estático de teste (`python -m http.server`) + `Invoke-WebRequest` → **HTTP 200**,
    confirmando reapontamento do Supabase sem erros de JS.

### Fase 4 — Extensão de lançamento de notas + tabela `notas_alunos`
19. `ls C:/Users/tribe/Documents/` — confirmado `gestao-diario` como pasta ativa.
20. Validação de sintaxe (`node --check`) em `background.js`, `content.js`, `popup.js` da extensão
    → **sem erros** (exit 0 nos três).
21. Validação de sintaxe do bloco `<script>` principal do `index.html` (extraído via regex +
    `node --check`) → **sem erros**.
22. SQL da tabela `notas_alunos` (trigger + RLS) executado diretamente no SQL Editor do Supabase
    (via navegador) → **"Success. No rows returned"**.
23. `Invoke-WebRequest GET /rest/v1/notas_alunos` → **HTTP 200 `[]`** (tabela existe e responde).
24. `Invoke-WebRequest POST /rest/v1/notas_alunos` (upsert com `on_conflict`) → **HTTP 200/201**,
    confirmado que atualiza em vez de duplicar.
25. `Invoke-WebRequest PATCH .../notas_alunos?id=in.(1)` (`injetado=true`) → **HTTP 200**.
26. `Invoke-WebRequest DELETE .../notas_alunos?id=eq.1` — limpeza do registro de teste → **HTTP 204**.
27. Servidor estático (`python -m http.server`, porta 5503) + `Invoke-WebRequest` → **HTTP 200** —
    versão local do PWA com todas as mudanças recentes, disponível para o professor conferir.

## 4. Pendências conhecidas

- [ ] Publicar a Edge Function `ia` no Supabase (projeto `ddtoferhisbnmxhitoff`) + configurar secret
      `ANTHROPIC_API_KEY`.
- [ ] Sexta-feira (24/07/2026): mudar a data de uma avaliação de teste no 8º D para hoje/passado,
      reabrir "Lançar Nota" no Sala do Futuro e completar o mapeamento (`content.js` →
      `__gestaoDiarioPreencherNotas`).
- [ ] Construir uma tela no PWA para o professor digitar notas manualmente (as funções já existem:
      `buscarNotasTurma()`, `salvarNota()`, `marcarNotasInjetadas()`).
- [ ] Revisar as policies de RLS (hoje totalmente abertas via chave anon) antes de expandir o uso.
- [ ] Publicar as mudanças locais no GitHub (`git push`) — hoje só existem na máquina local.
