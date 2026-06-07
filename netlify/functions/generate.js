exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'POST only' };

  const { userText, emotionVector } = JSON.parse(event.body || '{}');
  if (!userText) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing userText' }) };

  const API_KEY = process.env.DEEPSEEK_API_KEY;
  const BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com';
  const MODEL = process.env.AI_MODEL || 'deepseek-chat';

  const dims = ['愤怒', '悲伤', '希望', '爱', '困惑', '反抗'];
  const ev = emotionVector || [0,0,0,0,0.5,0];
  const dominant = dims[ev.indexOf(Math.max(...ev))];

  const systemPrompt = `你是"回声洞穴"的叙事者。根据用户困惑，讲一个真实女性历史人物的故事。

输出严格JSON（不要代码块）：
{"protagonist":"姓名","year":"年份","region":"地区","quote":"金句20字内","opening":"对用户说一句共鸣的话25字内","story":"故事150-250字","backToYou":"回应用户40字内","keywords":["词1","词2"]}

规则：人物真实存在，故事基于真实事件，情感真挚不说教，中文输出。`;

  const userPrompt = `用户困惑："${userText}"\n主要情感：${dominant}\n请生成一个能回应她困惑的女性历史人物故事。`;

  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 600,
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err }) };
    }

    const data = await response.json();
    const fullContent = data.choices?.[0]?.message?.content || '';

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fullContent })
    };
  } catch (e) {
    return { statusCode: 500, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};
