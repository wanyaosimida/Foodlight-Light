import { corsHeaders } from "../_shared/cors.ts";

// 独立AI模型：MiniMax-M3（多模态视觉能力强）—— 食品包装营养成分表解读
const GATEWAY_URL =
  "https://app-ejgfa726qvi9-api-rLobPAn0n7m9-gateway.miaoda.online/v1/chat/completions";

interface ScanRequest {
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
    const body: ScanRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const b64 = String(body.image || "").replace(/^data:image\/\w+;base64,/, "");
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const prompt = `你是食品营养专家。请仔细识别这张食品包装图片上的营养成分表与配料表，完成以下任务：
1. 识别产品名称、品牌、净含量。
2. 识别营养成分表（每100g 或 每份 的能量、蛋白质、脂肪、饱和脂肪、碳水化合物、糖、膳食纤维、钠等数值）。能量若为千焦(kJ)请换算为千卡(kcal)（1kcal=4.184kJ）。
3. 分析配料表前5位，标注风险点（如白砂糖排前列、含植脂末/反式脂肪、含人工色素等）。
4. 综合判定购买建议等级：推荐购买/适量购买/不推荐购买，并给出一句理由。
5. 将专业数值翻译为通俗语言（如"糖15g≈3.5块方糖"）。

严格以 JSON 格式返回，不要任何多余文字或 markdown 代码块：
{
  "product_name": "产品名称",
  "brand": "品牌(识别不到则为空字符串)",
  "net_content": "净含量描述",
  "nutrition": {
    "calories": 每100g热量千卡(数字),
    "protein": 蛋白质克数(数字),
    "fat": 脂肪克数(数字),
    "carbs": 碳水克数(数字),
    "sugar": 糖克数(数字),
    "sodium": 钠毫克数(数字),
    "fiber": 膳食纤维克数(数字)
  },
  "ingredients": "配料表原文摘要",
  "risk_points": ["风险点1", "风险点2"],
  "level": "推荐购买/适量购买/不推荐购买",
  "advice": "购买建议一句话理由",
  "translations": ["通俗解读1如：糖15g≈3.5块方糖", "通俗解读2"],
  "alternatives": [{"name": "更健康替代品名", "calories": 替代品每100g热量(数字)}]
}`;

    const upstream = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M3",
        thinking: { type: "adaptive" },
        temperature: 0.4,
        max_completion_tokens: 2048,
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

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `模型服务异常: ${upstream.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    if (!parsed || !parsed.nutrition) {
      return new Response(JSON.stringify({ error: "未能识别营养成分表，请重新拍摄清晰的包装背面" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});