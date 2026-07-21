// Edge Function "ia" — proxy seguro para a API da Anthropic (Claude).
// A chave NUNCA vai para o PWA: fica só aqui no servidor, lida de Deno.env.
// O PWA chama:  POST {SUPABASE_URL}/functions/v1/ia
//   body: { tipo: 'metodologias', tema, serie }

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Modelo padrão equilibrado (custo x qualidade). Troque para "claude-opus-4-8"
// se quiser o mais avançado, definindo o secret ANTHROPIC_MODEL na função.
const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function promptMetodologias(tema: string, serie: string): string {
  return `Você é especialista em metodologias ativas de aprendizagem para a educação básica da rede
pública estadual de São Paulo.

Tema da aula: ${tema}
Série: ${serie}
Componente: História

Sugira de 2 a 3 metodologias ativas adequadas a esse tema e série (ex: sala de aula invertida,
aprendizagem baseada em problemas, rotação por estações, gamificação). Para cada uma, traga:
1) Nome da metodologia
2) Passo a passo resumido para uma aula de 50 minutos
3) Conexão com as habilidades cobradas na Prova Paulista

Seja objetivo e prático, pensando numa sala real com poucos recursos.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ erro: "ANTHROPIC_API_KEY não configurada na Edge Function." }, 500);
    }

    const { tipo, tema, serie } = await req.json();

    let content: unknown;
    if (tipo === "metodologias") {
      if (!tema) return json({ erro: "tema é obrigatório para 'metodologias'." }, 400);
      content = [{ type: "text", text: promptMetodologias(tema, serie ?? "") }];
    } else {
      return json({ erro: "tipo inválido (use 'metodologias')." }, 400);
    }

    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await resposta.json();
    if (!resposta.ok) {
      return json({ erro: data?.error?.message || `Erro ${resposta.status} na API da IA` }, resposta.status);
    }

    const texto = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();

    return json({ texto, uso: data.usage ?? null });
  } catch (e) {
    return json({ erro: String((e as Error)?.message || e) }, 400);
  }
});
