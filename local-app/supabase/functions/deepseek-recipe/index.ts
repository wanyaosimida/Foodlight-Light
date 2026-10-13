import { corsHeaders } from "../_shared/cors.ts";

// 文心大模型（ERNIE 4.5 Turbo）文本生成网关
const GATEWAY_URL =
  "https://app-ejgfa726qvi9-api-zYkZz8qovQ1L-gateway.miaoda.online/v2/chat/completions";

interface RecipeRequest {
  goal: string;
  gender: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: string;
  allergies: string;
  tdee: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RecipeRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "服务未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const goalMap: Record<string, string> = {
      lose_fat: "减脂",
      gain_muscle: "增肌",
      balance: "均衡饮食",
      control_sugar: "控糖",
    };
    const activityMap: Record<string, string> = {
      low: "久坐少动",
      medium: "中等活动量",
      high: "高强度运动",
    };

    const prompt = `你是一位资深营养师。请为以下用户生成一份个性化的一日三餐食谱（含加餐），严格以 JSON 格式返回，不要任何多余文字或 markdown 代码块。

用户信息：
- 目标：${goalMap[body.goal] || body.goal}
- 性别：${body.gender === "male" ? "男" : "女"}
- 年龄：${body.age}岁
- 身高：${body.height_cm}cm
- 体重：${body.weight_kg}kg
- 活动量：${activityMap[body.activity_level] || body.activity_level}
- 每日推荐摄入热量：${body.tdee}千卡
- 忌口/过敏：${body.allergies || "无"}

要求：
1. 严格避开忌口/过敏食材。
2. 每餐包含：菜品名称、食材清单（含分量）、烹饪步骤（数组）、营养估算（热量千卡、蛋白质克、碳水克、脂肪克）。
3. 三大营养素分配：减脂(碳水40%/蛋白35%/脂肪25%)、增肌(碳水50%/蛋白30%/脂肪20%)、均衡(碳水50%/蛋白20%/脂肪30%)、控糖(碳水35%/蛋白35%/脂肪30%)。
4. 提供一段营养师点评文案（80字内，温暖鼓励风格）。

返回 JSON 结构：
{
  "breakfast": { "title": "", "ingredients": [{"name":"","amount":""}], "steps": [""], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "lunch": { "title": "", "ingredients": [{"name":"","amount":""}], "steps": [""], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "dinner": { "title": "", "ingredients": [{"name":"","amount":""}], "steps": [""], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "snack": { "title": "", "ingredients": [{"name":"","amount":""}], "steps": [""], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "comment": "营养师点评"
}`;

    const upstream = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "你是专业营养师，只返回纯JSON，不带markdown代码块。" },
          { role: "user", content: prompt },
        ],
        enable_thinking: false,
      }),
    });

    if (upstream.status === 429 || upstream.status === 402) {
      const errText = await upstream.text();
      return new Response(JSON.stringify({ error: `模型服务繁忙或额度不足: ${upstream.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      return new Response(JSON.stringify({ error: `模型服务错误: ${upstream.status} ${errText.slice(0, 120)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 解析 SSE 流，累积 choices[0].delta.content
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          full += parsed.choices?.[0]?.delta?.content ?? "";
        } catch {
          // 跳过无法解析的帧
        }
      }
    }

    // 去除可能的 markdown 代码块包裹
    let content = full.replace(/```json/gi, "").replace(/```/g, "").trim();

    let recipe;
    try {
      recipe = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        recipe = JSON.parse(match[0]);
      } else {
        throw new Error("模型返回格式异常");
      }
    }

    return new Response(JSON.stringify({ recipe }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});