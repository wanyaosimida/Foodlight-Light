import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://app-ejgfa726qvi9-api-wLNdpny6ZpVa-gateway.miaoda.online";

interface EditRequest {
  prompt: string;
  images: { b64_json: string }[];
  size?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: EditRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(`${GATEWAY_URL}/image2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: body.prompt,
        images: body.images,
        size: body.size || "1024x1024",
        n: 1,
        response_format: "b64",
      }),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `图片编辑失败: ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});