const crypto = require('crypto');

const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;

let tokenCache = { token: '', expires: 0 };
let ticketCache = { ticket: '', expires: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(data.errmsg || 'token failed');
  tokenCache = { token: data.access_token, expires: Date.now() + 6000 * 1000 };
  return data.access_token;
}

async function getJsapiTicket() {
  if (ticketCache.ticket && Date.now() < ticketCache.expires) return ticketCache.ticket;
  const token = await getAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(data.errmsg || 'ticket failed');
  ticketCache = { ticket: data.ticket, expires: Date.now() + 6000 * 1000 };
  return data.ticket;
}

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const pageUrl = req.query.url;
  if (!pageUrl) return res.status(400).json({ error: 'missing url' });

  try {
    const ticket = await getJsapiTicket();
    const nonceStr = Math.random().toString(36).substring(2, 15);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const str = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${pageUrl}`;
    const signature = sha1(str);
    res.json({ nonceStr, timestamp, signature });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
