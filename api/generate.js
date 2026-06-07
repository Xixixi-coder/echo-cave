module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { userText, emotionVector } = req.body;
  if (!userText) return res.status(400).json({ error: 'missing userText' });

  const API_KEY = process.env.DEEPSEEK_API_KEY;
  const BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const MODEL = process.env.AI_MODEL || 'deepseek-chat';

  const dims = ['愤怒', '悲伤', '希望', '爱', '困惑', '反抗'];
  const dominant = dims[(emotionVector || []).indexOf(Math.max(...(emotionVector || [0,0,0,0,0.5,0])))];

  const systemPrompt = `你是"回声洞穴"中的"她"——一位跨越时空的女性叙事者。
你的任务是根据用户的困惑，讲述一个真实女性历史人物的故事，建立情感共鸣。

## 输出格式（严格JSON，不要用markdown代码块包裹）
{"protagonist":"人物姓名","year":"年份","region":"国家/地区","quote":"一句金句（20字以内）","opening":"用第二人称对用户说一句话，点出共鸣（30字以内）","story":"故事正文（200-350字，富有情感的叙述）","backToYou":"回到用户，给出温柔有力的回应（50字以内）","keywords":["关键词1","关键词2"]}

## 规则
1. 人物必须是真实存在过的女性历史人物
2. 故事要基于真实历史事件，但可以文学化叙述
3. 情感要真挚，避免说教，用细节打动人
4. 金句要简洁有力，能引发共鸣
5. 故事长度控制在200-350字
6. 使用中文输出
7. 直接输出JSON，不要任何其他文字`;

  const userPrompt = `用户困惑："${userText}"
主要情感：${dominant}
请生成一个能回应她困惑的女性历史人物故事。`;

  try {
    // 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 1000,
        stream: true
      })
    });

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          break;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {}
      }
    }

    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
};
