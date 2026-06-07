/**
 * 微信 JS-SDK 签名服务 — Cloudflare Worker
 *
 * 部署步骤：
 * 1. 打开 https://dash.cloudflare.com → Workers & Pages → Create
 * 2. 粘贴此代码
 * 3. 设置环境变量：WX_APPID, WX_SECRET
 * 4. 部署后获得 URL，填入 echo-cave-v9.html 的 WX_CONFIG.signatureUrl
 *
 * 或者用 wrangler CLI：
 *   npx wrangler deploy wx-sign-worker.js --name wx-sign
 *   npx wrangler secret put WX_APPID
 *   npx wrangler secret put WX_SECRET
 */

const TOKEN_CACHE_KEY = 'wx_access_token';
const TICKET_CACHE_KEY = 'wx_jsapi_ticket';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname !== '/wx-sign') {
      return new Response('Not found', { status: 404 });
    }

    const pageUrl = url.searchParams.get('url');
    if (!pageUrl) {
      return Response.json({ error: 'missing url param' }, { status: 400, headers: corsHeaders });
    }

    try {
      const ticket = await getJsapiTicket(env);
      const nonceStr = Math.random().toString(36).substring(2, 15);
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const str = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${pageUrl}`;
      const signature = await sha1(str);

      return Response.json({ nonceStr, timestamp, signature }, { headers: corsHeaders });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
    }
  }
};

async function getJsapiTicket(env) {
  // 尝试从 KV 缓存读取
  let ticket = null;
  if (env.WX_CACHE) {
    ticket = await env.WX_CACHE.get(TICKET_CACHE_KEY);
    if (ticket) return ticket;
  }

  const token = await getAccessToken(env);
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(`ticket error: ${data.errmsg}`);

  ticket = data.ticket;
  if (env.WX_CACHE) {
    await env.WX_CACHE.put(TICKET_CACHE_KEY, ticket, { expirationTtl: 6000 });
  }
  return ticket;
}

async function getAccessToken(env) {
  if (env.WX_CACHE) {
    const cached = await env.WX_CACHE.get(TOKEN_CACHE_KEY);
    if (cached) return cached;
  }

  const appId = env.WX_APPID;
  const secret = env.WX_SECRET;
  if (!appId || !secret) throw new Error('WX_APPID or WX_SECRET not configured');

  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`token error: ${data.errmsg}`);

  if (env.WX_CACHE) {
    await env.WX_CACHE.put(TOKEN_CACHE_KEY, data.access_token, { expirationTtl: 6000 });
  }
  return data.access_token;
}

async function sha1(str) {
  const buffer = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
