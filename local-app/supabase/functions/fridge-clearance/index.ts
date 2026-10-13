import { corsHeaders } from "../_shared/cors.ts";

const PRIMARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-zYkZz8qovQ1L-gateway.miaoda.online/v2/chat/completions";
const SECONDARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-Aa2PqMJnJGwL-gateway.miaoda.online/v1/text/chatcompletion_v2";

interface FridgeRequest {
  expiring_ingredients: string[];
  regular_ingredients: string[];
  seasonings: string[];
  cook_minutes_limit: number;
  tools: string[];
  servings: number;
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

function createFallbackClearance(body: FridgeRequest): any {
  const allIng = [...(body.expiring_ingredients || []), ...(body.regular_ingredients || [])];
  const primary = allIng[0] || "鸡蛋";
  const secondary = allIng[1] || "剩米饭/蔬菜";
  const limitTime = body.cook_minutes_limit || 15;

  return {
    tip: "优先将临期生鲜一次性消灭，不仅环保节约，更锁住最大营养！",
    recipes: [
      {
        title: `10分钟极速【${primary}】鲜蔬热炒`,
        clearance_rate: "100%",
        cook_time_minutes: Math.min(10, limitTime),
        difficulty: 1,
        calories: 320,
        protein: 22,
        carbs: 18,
        fat: 12,
        ingredients: [
          { name: primary, amount: "120g (临期优先)", is_expiring: true },
          { name: secondary, amount: "80g", is_expiring: false },
          { name: "蒜末/葱花", amount: "适量", is_expiring: false },
        ],
        steps: [
          "所有食材洗净，切丁/切片沥干水份备用（耗时2分钟）。",
          "平底锅喷少量植物油，小火爆香葱蒜，倒入主料快速翻炒至八成熟（耗时3分钟）。",
          "倒入配菜与调料大火翻炒1分钟入味，关火装盘即刻享用（耗时2分钟）。",
        ],
        zero_waste_hack: "利用急火快炒彻底锁住脆嫩，边角料与主料一同入菜，真正零厨余零损耗。",
      },
      {
        title: `温暖一锅出【${primary}】浓鲜暖胃烩`,
        clearance_rate: "100%",
        cook_time_minutes: Math.min(15, limitTime),
        difficulty: 1,
        calories: 280,
        protein: 26,
        carbs: 15,
        fat: 9,
        ingredients: [
          { name: primary, amount: "150g (全量消耗)", is_expiring: true },
          { name: secondary, amount: "100g", is_expiring: false },
          { name: "温水/高汤", amount: "300ml", is_expiring: false },
        ],
        steps: [
          "主料切小块，锅中少许油略微煎出香气（耗时3分钟）。",
          "注入温水煮沸，倒入配料小火滚煨6分钟，至食材软烂（耗时6分钟）。",
          "加少许海盐、白胡椒调味，撒上葱花出锅（耗时1分钟）。",
        ],
        zero_waste_hack: "一锅端省时省力，汤底融合食材本味，连汤带菜营养全吸收，无需繁复清洗厨具。",
      },
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body: FridgeRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify(createFallbackClearance(body)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiring = (body.expiring_ingredients || []).join("、") || "鸡蛋、青菜";
    const regulars = (body.regular_ingredients || []).join("、") || "暂无";
    const seasonings = (body.seasonings || []).join("、") || "生抽、盐、黑胡椒、食用油";
    const tools = (body.tools || []).join("、") || "炒锅";

    const prompt = `你是一位倡导零浪费（Zero Waste）的可持续米其林星级营养大厨。
用户现在正在打开冰箱进行「盲盒清库极速出餐」，现有食材条件如下：
- 【重点临期食材（必须优先全部消耗完毕）】：${expiring}
- 【常规库备食材】：${regulars}
- 【现有调味料】：${seasonings}
- 【烹饪时间上限】：不超过 ${body.cook_minutes_limit || 15} 分钟
- 【可用厨具】：${tools}
- 【用餐人数】：${body.servings || 1} 人

请根据现有食材量身打造 2-3 个烹饪时间极短、步骤不超过4步、把临期食材 100% 变废为宝的创意健康食谱方案。

严格输出标准 JSON 格式，以 { 开头，不要任何多余文字或思考过程：
{
  "tip": "一句话专业大厨零浪费清库建议",
  "recipes": [
    {
      "title": "极速菜谱名称",
      "clearance_rate": "100%",
      "cook_time_minutes": 烹饪耗时整数分钟,
      "difficulty": 难度星级(1-3整数),
      "calories": 单份热量千卡(整数),
      "protein": 蛋白质克(数字),
      "carbs": 碳水克(数字),
      "fat": 脂肪克(数字),
      "ingredients": [
        {"name": "食材名称", "amount": "精准用量", "is_expiring": true或false}
      ],
      "steps": ["步骤1（标明预计耗时）", "步骤2", "步骤3"],
      "zero_waste_hack": "一句话说明为什么零浪费与美味秘诀"
    }
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
              content: "你是零浪费大厨与极速健康食谱引擎。严格只输出纯JSON，以{开头并以}结尾，不要任何思考分析或markdown标记。",
            },
            { role: "user", content: prompt },
          ],
          enable_thinking: false,
          temperature: 0.3,
        }),
      });

      if (resp1.ok) {
        const data1 = await resp1.json();
        const content1 = data1?.choices?.[0]?.message?.content || "";
        parsedResult = extractJson(content1);
      }
    } catch (e) {
      console.warn("Fridge clearance primary gateway error:", e);
    }

    if (!parsedResult || !Array.isArray(parsedResult?.recipes) || parsedResult.recipes.length === 0) {
      try {
        const resp2 = await fetch(SECONDARY_GATEWAY, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Gateway-Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "MiniMax-M2.5",
            temperature: 0.3,
            max_tokens: 3000,
            messages: [
              {
                role: "system",
                content: "你是零浪费大厨与极速健康食谱引擎。严格只输出纯JSON，不要任何思考前言。",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (resp2.ok) {
          const data2 = await resp2.json();
          const content2 = data2?.choices?.[0]?.message?.content || "";
          parsedResult = extractJson(content2);
          if (!parsedResult) {
            const reasoning = data2?.choices?.[0]?.message?.reasoning_content || "";
            parsedResult = extractJson(reasoning);
          }
        }
      } catch (e) {
        console.warn("Fridge clearance secondary gateway error:", e);
      }
    }

    if (!parsedResult || !Array.isArray(parsedResult?.recipes) || parsedResult.recipes.length === 0) {
      parsedResult = createFallbackClearance(body);
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    const fallback = createFallbackClearance({} as any);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});