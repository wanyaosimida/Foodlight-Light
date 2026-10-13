import { corsHeaders } from "../_shared/cors.ts";

const PRIMARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-zYkZz8qovQ1L-gateway.miaoda.online/v2/chat/completions";
const SECONDARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-Aa2PqMJnJGwL-gateway.miaoda.online/v1/text/chatcompletion_v2";

interface TakeoutRequest {
  scene: "takeout" | "dining_out" | "banquet";
  target_cuisine: string;
  menu_text?: string;
  calorie_budget: number;
  dietary_goal: "lose_fat" | "gain_muscle" | "low_carb" | "low_sodium" | "balance";
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

function createFallbackAdvisor(body: TakeoutRequest): any {
  const cuisine = body.target_cuisine || "家常中餐/快餐";
  const budget = body.calorie_budget || 550;

  return {
    analysis: `针对【${cuisine}】场景，关键在于避开油炸、浓油赤酱勾芡，优选清蒸、白灼与水煮菜品。`,
    recommended_combos: [
      {
        name: "【黄金控卡组合】白灼/清蒸肉类 + 蒜蓉时蔬 + 杂粮/半份米饭",
        estimated_calories: Math.min(budget, 480),
        protein: 32,
        carbs: 45,
        fat: 10,
        items: ["白灼虾/手撕鸡/清蒸鱼（约150g）", "白灼生菜/菜心（免油免蚝油）", "五谷饭或米饭减半"],
        reason: "优质蛋白质含量充足，避免多余油脂渗透，饱腹感强达4小时。",
      },
      {
        name: "【低碳极简方案】双份优质蛋白主菜 + 拌黄瓜/大份绿叶菜",
        estimated_calories: Math.min(budget, 420),
        protein: 38,
        carbs: 18,
        fat: 12,
        items: ["香煎/水煮去皮鸡腿排", "西蓝花/木耳炒蛋", "无糖乌龙茶/原味柠檬水"],
        reason: "超低碳水搭配，彻底告别餐后血糖骤升与下午困倦。",
      },
    ],
    red_dishes: [
      { name: "地三鲜 / 拔丝类 / 炸猪排", risk: "重度油炸裹糖裹淀粉，吸油率高达30%以上，热量炸弹" },
      { name: "浓稠鱼香肉丝 / 水煮肉片（红油底）", risk: "隐藏极高精制糖与厚重浮油，一盘超1000大卡" },
      { name: "干煸豆角 / 虎皮青椒", risk: "虽然是蔬菜，但经过反复高温油炸，比纯肉热量还高" },
    ],
    takeout_note: "老板您好！请务必少油少盐！所有调味酱汁、红油请单独打包，菜里不放味精和勾芡，主食帮我减半，万分感谢！🙏",
    dining_hacks: [
      "餐前先喝一杯温开水或无糖淡茶，填补胃容积，降低进食冲动。",
      "桌前备一碗温开水或清茶，过油菜品在水里涮一下再吃，可轻松过滤50%以上多余油脂！",
      "严格遵循进食顺序：先夹两大口绿叶青菜，再吃瘦肉鱼虾，最后根据饥饱吃少许米饭。",
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body: TakeoutRequest = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify(createFallbackAdvisor(body)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const goalMap: Record<string, string> = {
      lose_fat: "减脂控卡（低油低热量）",
      gain_muscle: "增肌塑形（高蛋白优质碳水）",
      low_carb: "低碳控糖（稳糖防困）",
      low_sodium: "清淡低钠（控水肿降血压）",
      balance: "均衡营养健康维持",
    };

    const prompt = `你是一位精通中国餐饮外卖与聚餐潜规则的顶级营养师。
用户正面临外卖点餐或外出聚餐场景，请为其制定最明智的点餐避坑策略：
- 【场景类型】：${body.scene === "takeout" ? "外卖平台点餐" : body.scene === "dining_out" ? "餐厅堂食聚餐" : "大型社交宴席"}
- 【餐厅菜系/店铺】：${body.target_cuisine}
- 【用户当前健康目标】：${goalMap[body.dietary_goal] || "减脂控卡"}
- 【单餐卡路里预算】：约 ${body.calorie_budget || 550} 千卡
${body.menu_text ? `- 【菜单/备选菜品】：${body.menu_text}` : ""}

请解析该餐厅或菜系的高油高糖雷区，给出最优搭配、红黑榜与一键复制的外卖神备注。

严格输出标准 JSON 格式，以 { 开头，不要任何多余文字或思考过程：
{
  "analysis": "对该餐厅/菜系烹饪特性的简要分析（1-2句话）",
  "recommended_combos": [
    {
      "name": "推荐组合方案名称",
      "estimated_calories": 估算热量千卡(整数),
      "protein": 蛋白质克(数字),
      "carbs": 碳水克(数字),
      "fat": 脂肪克(数字),
      "items": ["菜品1及分量建议", "菜品2", "主食或饮品建议"],
      "reason": "为什么推荐此组合的科学理由"
    }
  ],
  "red_dishes": [
    {"name": "高危菜品名称", "risk": "隐藏高油高糖高盐的避坑揭秘"}
  ],
  "takeout_note": "一键复制的外卖点单备注密语（礼貌但精准要求控油控糖，适合直接粘贴）",
  "dining_hacks": ["聚餐现场实操避坑妙招1", "避坑妙招2", "避坑妙招3"]
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
              content: "你是外卖与聚餐避坑点单军师，严格只返回标准纯JSON对象，以{开头并以}结尾，不要任何思考分析或markdown标记。",
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
      console.warn("Takeout advisor primary gateway error:", e);
    }

    if (!parsedResult || !Array.isArray(parsedResult?.recommended_combos)) {
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
                content: "你是外卖点单避坑军师，严格只输出纯JSON，不要输出思考文字。",
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
        console.warn("Takeout advisor secondary gateway error:", e);
      }
    }

    if (!parsedResult || !Array.isArray(parsedResult?.recommended_combos)) {
      parsedResult = createFallbackAdvisor(body);
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    const fallback = createFallbackAdvisor({} as any);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});