import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://app-ejgfa726qvi9-api-wLNdpny6ZpVa-gateway.miaoda.online";

interface NutritionRequest {
  query: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: NutritionRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(`${GATEWAY_URL}/baidu-ai-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `${body.query} 每100克 热量 蛋白质 碳水 脂肪 营养成分`,
        enable_smart_mode: true,
      }),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `搜索服务错误: ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const results = data?.result || data?.results || [];

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});