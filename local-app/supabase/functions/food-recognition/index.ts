import { corsHeaders } from "../_shared/cors.ts";

// MiniMax-M3 多模态大模型网关（同步，支持图片理解）
const GATEWAY_URL =
  "https://app-ejgfa726qvi9-api-rLobPAn0n7m9-gateway.miaoda.online/v1/chat/completions";

interface RecogRequest {
  image: string; // 纯 base64
}

function extractJson(text: string): any {
  let content = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RecogRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const b64 = String(body.image || "").replace(/^data:image\/\w+;base64,/, "");
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const prompt = `你是一位中国注册营养师，精通《中国食物成分表》。请仔细分析这张食物照片，完成以下任务：
1. 识别图中所有可分辨的食物或菜品。
2. 对每种食物，结合餐具大小、碗盘容量、食物堆叠程度，估算其净重（克）。
3. 推断烹饪方式（清蒸/水煮/煎炒/油炸/凉拌/烘焙/生食等），煎炒油炸会增加油脂。
4. 依据《中国食物成分表》标准数据，按估算净重精确计算热量(千卡)、蛋白质(克)、碳水(克)、脂肪(克)。

严格以 JSON 格式返回，不要任何多余文字或 markdown 代码块：
{
  "items": [
    {
      "name": "食物中文名称",
      "weight_g": 估算净重克数(整数),
      "portion": "分量描述(如 约1碗 / 约150g)",
      "cooking_method": "烹饪方式",
      "calories": 热量千卡(整数),
      "protein": 蛋白质克(整数或一位小数),
      "carbs": 碳水克(整数或一位小数),
      "fat": 脂肪克(整数或一位小数)
    }
  ]
}
若图片中没有食物，返回 {"items": []}。`;

    const upstream = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M3",
        thinking: { type: "disabled" },
        temperature: 0.2,
        max_completion_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });

    if (upstream.status === 429 || upstream.status === 402) {
      const errText = await upstream.text();
      return new Response(JSON.stringify({ error: `识别服务繁忙或额度不足: ${upstream.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(JSON.stringify({ error: `识别服务错误: ${upstream.status} ${errText.slice(0, 120)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    let items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];

    items = items
      .map((it: any) => ({
        name: String(it.name || "").trim(),
        weight_g: Math.max(0, Math.round(Number(it.weight_g) || 0)),
        portion: String(it.portion || "").trim(),
        cooking_method: String(it.cooking_method || "").trim(),
        calories: Math.round(Number(it.calories) || 0),
        protein: Math.round(Number(it.protein) || 0),
        carbs: Math.round(Number(it.carbs) || 0),
        fat: Math.round(Number(it.fat) || 0),
        verified: true,
      }))
      .filter((it: any) => it.name);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});