import { corsHeaders } from "../_shared/cors.ts";

const PRIMARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-zYkZz8qovQ1L-gateway.miaoda.online/v2/chat/completions";
const SECONDARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-Aa2PqMJnJGwL-gateway.miaoda.online/v1/text/chatcompletion_v2";

interface GlycemicRequest {
  meal_name: string;
  items: { name: string; carbs: number; amount?: string }[];
  total_carbs: number;
  total_protein?: number;
  total_fat?: number;
}

function extractJson(text: string): any {
  if (!text) return null;
  const content = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(content.slice(firstBrace, lastBrace + 1));
      } catch {
        // pass
      }
    }
    return null;
  }
}

function calculateDefaultGL(carbs: number): { gl: number; level: "low" | "medium" | "high" } {
  // 简易科学估算：常规混合中餐平均GI约55-65
  const estimatedGL = Math.round((carbs * 55) / 100);
  let level: "low" | "medium" | "high" = "low";
  if (estimatedGL >= 20) level = "high";
  else if (estimatedGL >= 11) level = "medium";
  return { gl: estimatedGL, level };
}

function createFallbackGlycemic(body: GlycemicRequest): any {
  const carbs = body.total_carbs || 50;
  const { gl, level } = calculateDefaultGL(carbs);

  const isHigh = level === "high";
  const isMed = level === "medium";

  return {
    gl_value: gl,
    gl_level: level,
    gl_label: isHigh ? "高GL负荷 (血糖骤升)" : isMed ? "中度GL (轻度波动)" : "低GL平稳 (精力充沛)",
    coma_risk_percent: isHigh ? 85 : isMed ? 45 : 15,
    coma_peak_time: isHigh ? "餐后35~55分钟" : isMed ? "餐后45~60分钟" : "平稳无困倦",
    coma_symptom: isHigh
      ? "大脑供血被消化道占用，胰岛素大量分泌致血糖骤降，易产生严重眼皮沉重、大脑昏沉感"
      : "血糖平缓上升平缓代谢，注意力保持稳定",
    optimal_order: [
      { step: 1, type: "fiber", label: "第1步 · 膳食纤维铺底（蔬菜/菌菇）", reason: "胃黏膜形成物理凝胶层，物理延缓50%淀粉吸收", duration: "慢慢咀嚼前5分钟" },
      { step: 2, type: "protein", label: "第2步 · 优质蛋白与脂肪（肉蛋奶豆）", reason: "刺激胆囊收缩素与GLP-1分泌，增强持久饱腹感", duration: "中间持续享用" },
      { step: 3, type: "carbs", label: "第3步 · 碳水主食收尾（米面薯）", reason: "置于最后食用，峰值升糖速率可削减35%以上", duration: "最后配合剩余菜品适量进食" },
    ],
    rescue_actions: [
      "【餐后15分钟轻步走】：走动10~15分钟，激活骨骼肌GLUT-4转运蛋白，无需过多胰岛素即可直接摄取葡萄糖。",
      "【大杯温开水稀释】：餐后30分钟内补充300ml温开水或无糖淡茶，促进血液循环，加速代谢多余糖负荷。",
      "【补充苹果醋或黑咖啡】：含多酚与绿原酸，可抑制α-淀粉酶活性，有效削平血糖毛刺峰值。",
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body: GlycemicRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify(createFallbackGlycemic(body)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemsDesc = (body.items || []).map((i) => `${i.name} (碳水${i.carbs}g)`).join("、") || "综合餐食";

    const prompt = `你是一位专门研究胰岛素动力学、升糖负荷（GL）与餐后困倦综合征（Food Coma）的临床营养医学专家。
请对以下用户本餐摄入进行精准动态 GL 评估与困倦风险推演：
- 【餐食名称】：${body.meal_name || "今日正餐"}
- 【包含食材/主食】：${itemsDesc}
- 【总碳水】：${body.total_carbs || 45}g
- 【总蛋白】：${body.total_protein || 20}g
- 【总脂肪】：${body.total_fat || 12}g

医学标准：
- 单餐GL = 各碳水成分(GI × 碳水克数 / 100)综合加权之和
- GL ≤ 10 为低GL（极度平稳，提神）
- 11 ≤ GL ≤ 19 为中度GL
- GL ≥ 20 为高GL（极易触发餐后胰岛素大分泌与重度犯困）

请计算评估其GL值、预估困倦概率、给出教科书级进食顺序黄金法则与餐后补救措施。

严格输出标准 JSON 格式，以 { 开头，不要多余文字或思考过程：
{
  "gl_value": 综合计算出的单餐GL值整数(如8、16、24),
  "gl_level": "low" 或 "medium" 或 "high",
  "gl_label": "标签如'低GL平稳 / 中度GL波动 / 高GL预警'",
  "coma_risk_percent": 困倦概率百分比(0-100整数),
  "coma_peak_time": "预计最困倦发生时间(如'餐后40~60分钟')",
  "coma_symptom": "身体生理反应机理分析(1-2句话)",
  "optimal_order": [
    {"step": 1, "type": "fiber", "label": "先吃步骤", "reason": "科学原理", "duration": "建议吃法"},
    {"step": 2, "type": "protein", "label": "次吃步骤", "reason": "科学原理", "duration": "建议吃法"},
    {"step": 3, "type": "carbs", "label": "最后吃步骤", "reason": "科学原理", "duration": "建议吃法"}
  ],
  "rescue_actions": [
    "若已吃完，可执行的针对性补救措施1",
    "针对性补救措施2",
    "针对性补救措施3"
  ]
}`;

    let parsedResult: any = null;

    try {
      const resp1 = await fetch(PRIMARY_GATEWAY, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "你是生理营养与GL动力学专家，严格只返回标准纯JSON对象，以{开头并以}结尾，不要任何思考前言或markdown标记。",
            },
            { role: "user", content: prompt },
          ],
          enable_thinking: false,
          temperature: 0.2,
        }),
      });

      if (resp1.ok) {
        const data1 = await resp1.json();
        const content1 = data1?.choices?.[0]?.message?.content || "";
        parsedResult = extractJson(content1);
      }
    } catch (e) {
      console.warn("Glycemic advisor primary gateway error:", e);
    }

    if (!parsedResult || typeof parsedResult?.gl_value !== "number") {
      parsedResult = createFallbackGlycemic(body);
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    const fallback = createFallbackGlycemic({} as any);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});