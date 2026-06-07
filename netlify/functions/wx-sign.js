const crypto = require('crypto');

let tokenCache = { token: '', expires: 0 };
let ticketCache = { ticket: '', expires: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;
  const appId = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(data.errmsg);
  tokenCache = { token: data.access_token, expires: Date.now() + 6000000 };
  return data.access_token;
}

async function getJsapiTicket() {
  if (ticketCache.ticket && Date.now() < ticketCache.expires) return ticketCache.ticket;
  const token = await getAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(data.errmsg);
  ticketCache = { ticket: data.ticket, expires: Date.now() + 6000000 };
  return data.ticket;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing url' }) };

  try {
    const ticket = await getJsapiTicket();
    const nonceStr = Math.random().toString(36).substring(2, 15);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const str = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = crypto.createHash('sha1').update(str).digest('hex');
    return { statusCode: 200, headers, body: JSON.stringify({ nonceStr, timestamp, signature }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
