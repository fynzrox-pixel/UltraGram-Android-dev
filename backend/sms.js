// SMS provider abstraction. Configure via env.
// SMS_PROVIDER: 'console' (dev) | 'http' (generic HTTP) | 'twilio'
// For 'http': SMS_HTTP_URL, SMS_HTTP_METHOD (POST/GET), SMS_HTTP_BODY (JSON template with {phone},{code}), SMS_HTTP_HEADERS (JSON)
// For 'twilio': TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

async function sendSms(phone, code) {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
  if (provider === 'console' || process.env.NODE_ENV !== 'production') {
    console.log(`[SMS-DEV] To ${phone}: your UltraGram code is ${code}`);
    return { ok: true, dev: true };
  }
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: from, Body: `UltraGram code: ${code}` });
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!r.ok) throw new Error('twilio failed: ' + (await r.text()));
    return { ok: true };
  }
  if (provider === 'http') {
    const url = process.env.SMS_HTTP_URL;
    const method = process.env.SMS_HTTP_METHOD || 'POST';
    let headers = {};
    try { headers = JSON.parse(process.env.SMS_HTTP_HEADERS || '{}'); } catch (e) {}
    const template = process.env.SMS_HTTP_BODY || '{"phone":"{phone}","code":"{code}"}';
    const bodyStr = template.replace('{phone}', phone).replace('{code}', code);
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : bodyStr });
    if (!r.ok) throw new Error('sms http failed: ' + (await r.text()));
    return { ok: true };
  }
  throw new Error('unknown SMS provider: ' + provider);
}

function normalizePhone(raw) {
  // strip spaces, dashes, parens; ensure leading +
  let p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

function isValidPhone(p) {
  return /^\+[1-9]\d{6,14}$/.test(p);
}

module.exports = { sendSms, normalizePhone, isValidPhone };
