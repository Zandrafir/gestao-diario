// Edge Function "push-chamada" — o DISPARADOR das notificações de chamada.
//
// Como funciona:
//   - Acionada por um cron do Supabase (pg_cron) a cada minuto — ver o SQL de
//     agendamento no fim deste arquivo (comentado) e nas instruções.
//   - Calcula a hora atual no fuso de São Paulo (UTC-3 fixo; o Brasil não usa
//     mais horário de verão desde 2019).
//   - Procura na tabela `grade_horaria` os blocos de aula do dia da semana cujo
//     início foi há exatamente 20 minutos.
//   - Para cada bloco encontrado, registra um log (dedup por dia+hora+turma) e
//     envia um push para TODAS as inscrições em `push_subscriptions`.
//   - Inscrições expiradas (404/410) são removidas automaticamente.
//
// Secrets necessários (Project Settings > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (o par gerado para este projeto)
//   VAPID_SUBJECT  (ex: mailto:seu-email) — opcional, tem padrão abaixo
//   CRON_SECRET    (opcional) — se definido, o cron precisa mandar no header
//                   x-cron-secret; protege a função de chamadas externas.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:tribeiro.tr33@gmail.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET"); // opcional

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

// "Agora" em horário de São Paulo, lendo os campos via getUTC* (deslocamos o
// timestamp -3h para que os campos UTC representem a hora local de SP).
function agoraSaoPaulo(): Date {
  return new Date(Date.now() - 3 * 3600 * 1000);
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

Deno.serve(async (req: Request) => {
  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

  try {
    if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ erro: "não autorizado" }, 401);
    }

    const sp = agoraSaoPaulo();
    const diaSemana = sp.getUTCDay(); // 0=dom ... 6=sab
    if (diaSemana < 1 || diaSemana > 5) {
      return json({ ok: true, skip: "fim de semana", dia: DIAS[diaSemana] });
    }

    const minutosAgora = sp.getUTCHours() * 60 + sp.getUTCMinutes();
    const alvoMin = minutosAgora - 20; // aula que começou há 20 min
    if (alvoMin < 0) return json({ ok: true, skip: "fora do horário escolar" });
    const horaAlvo = hhmm(alvoMin); // "HH:MM"

    // Blocos do dia cujo início bate com a janela (grade_horaria.hora_inicio é
    // um time; comparamos pelos 5 primeiros chars "HH:MM").
    const { data: blocos, error: errGrade } = await sb
      .from("grade_horaria")
      .select("hora_inicio, turma")
      .eq("dia_semana", diaSemana);
    if (errGrade) throw errGrade;

    const doMomento = (blocos ?? []).filter(
      (b: { hora_inicio: string }) => String(b.hora_inicio).slice(0, 5) === horaAlvo,
    );
    if (!doMomento.length) {
      return json({ ok: true, skip: "nenhuma aula nesta janela", horaAlvo, dia: DIAS[diaSemana] });
    }

    const dataHoje = sp.toISOString().slice(0, 10); // YYYY-MM-DD (em SP)
    const { data: subs, error: errSubs } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    if (errSubs) throw errSubs;

    let enviados = 0, removidos = 0, pulados = 0;

    for (const bloco of doMomento) {
      // Dedup: só dispara uma vez por (dia, hora, turma). Se o insert falhar por
      // conflito, outro tick já cuidou deste bloco.
      const { error: errLog } = await sb
        .from("push_log")
        .insert({ data: dataHoje, hora_inicio: bloco.hora_inicio, turma: bloco.turma });
      if (errLog) { pulados++; continue; }

      const payload = JSON.stringify({
        title: "📋 Hora da Chamada",
        body: `Turma ${bloco.turma} — aula das ${horaAlvo}. Não esqueça de fazer a chamada!`,
        tag: `chamada-${bloco.turma}-${horaAlvo}`,
        url: "https://saladofuturoprofessor.educacao.sp.gov.br",
      });

      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          enviados++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            removidos++;
          }
        }
      }
    }

    return json({ ok: true, horaAlvo, turmas: doMomento.map((b: { turma: string }) => b.turma), enviados, removidos, pulados });
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 500);
  }
});

/*  ── AGENDAMENTO (cron) ──────────────────────────────────────────────────────
Rodar UMA vez no SQL Editor (precisa das extensões pg_cron e pg_net):

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- A cada minuto nas janelas de aula (10h–17h UTC = 07h–14h em São Paulo),
  -- de segunda a sexta. Ajuste se seu horário mudar.
  select cron.schedule(
    'push-chamada',
    '* 10-17 * * 1-5',
    $$
    select net.http_post(
      url     := 'https://ddtoferhisbnmxhitoff.supabase.co/functions/v1/push-chamada',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
      ),
      body    := '{}'::jsonb
    );
    $$
  );

Para remover depois:  select cron.unschedule('push-chamada');
─────────────────────────────────────────────────────────────────────────────── */
