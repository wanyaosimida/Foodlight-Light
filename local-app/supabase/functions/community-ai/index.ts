import { corsHeaders } from "../_shared/cors.ts";

// 双网关通道（文心 ERNIE 4.5 Turbo 稳定无思考截断通道 + MiniMax 备选通道）
const PRIMARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-zYkZz8qovQ1L-gateway.miaoda.online/v2/chat/completions";
const SECONDARY_GATEWAY =
  "https://app-ejgfa726qvi9-api-Aa2PqMJnJGwL-gateway.miaoda.online/v1/text/chatcompletion_v2";

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
        // 继续兜底
      }
    }
    const firstBracket = content.indexOf("[");
    const lastBracket = content.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(content.slice(firstBracket, lastBracket + 1));
      } catch {
        // 继续兜底
      }
    }
    return null;
  }
}

function getFallbackCommunity(action: string): any {
  if (action === "moderate") {
    return { passed: true, reason: "" };
  }
  if (action === "comment") {
    return {
      comments: [
        "搭配看起来好健康！👍",
        "太自律了，向你学习！💪",
        "看着很有食欲，求做法！✨",
      ],
    };
  }
  return {
    caption: "今日健康饮食打卡！营养均衡，每一餐都用心对待自己~ 🌱✨",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
    const action: string = body.action || "caption";

    if (!apiKey) {
      return new Response(JSON.stringify(getFallbackCommunity(action)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let prompt = "";
    if (action === "caption") {
      const ctx = JSON.stringify(body.context || {});
      prompt = `你是一位健康生活方式博主。请根据以下结构化健康数据，为用户生成一条适合发布到美食健康社区的分享配文。要求语气积极、口语化、30-60字，可适当加emoji。
数据：${ctx}
严格以 JSON 格式返回，不要多余文字或思考过程，以 { 开头：
{"caption": "配文内容"}`;
    } else if (action === "moderate") {
      const text = String(body.text || "");
      prompt = `你是社区内容审核员。请审核以下用户发布内容是否合规。违规标准：极端节食言论（如声称日摄入低于800千卡）、虚假宣传、不当/低俗内容、个人隐私信息。
待审核内容：${text}
严格以 JSON 格式返回，不要多余文字：
{"passed": true或false, "reason": "若不通过，给出具体违规原因，否则为空字符串"}`;
    } else if (action === "comment") {
      const postType = body.post_type || "talk";
      const summary = String(body.summary || "");
      prompt = `请为一条健康社区动态生成 3 条简短友好的快捷评论（每条不超过15字），符合动态类型「${postType}」与内容「${summary}」的语境。
严格以 JSON 格式返回，不要多余文字：
{"comments": ["评论1", "评论2", "评论3"]}`;
    } else {
      return new Response(JSON.stringify({ error: "未知操作" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedResult: any = null;

    // 通道 1：文心大模型 ERNIE 4.5 Turbo
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
              content: "你是社区助手引擎，只返回纯JSON数据，以{开头并以}结尾，不要输出任何思考过程或解释。",
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
      console.warn("Community AI primary gateway error:", e);
    }

    // 通道 2：MiniMax 备选通道
    if (!parsedResult) {
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
            max_tokens: 2048,
            max_completion_tokens: 2048,
            messages: [
              {
                role: "system",
                content: "你是社区助手，严格只输出标准JSON，以{开头以}结尾，无思考无解释。",
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
        console.warn("Community AI secondary gateway error:", e);
      }
    }

    if (!parsedResult) {
      parsedResult = getFallbackCommunity(action);
    }

    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    const fallback = getFallbackCommunity("caption");
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});