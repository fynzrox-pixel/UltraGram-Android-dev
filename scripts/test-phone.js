const http = require('http');
function req(path, method, body) {
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname:'127.0.0.1', port:8787, path, method, headers:{} };
    if (data) { opts.headers['Content-Type']='application/json'; opts.headers['Content-Length']=Buffer.byteLength(data); }
    const r = http.request(opts, res=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(b)});}catch{resolve({status:res.statusCode,body:b});} }); });
    r.on('error',reject); if (data) r.write(data); r.end();
  });
}
(async()=>{
  const phone = '+380991234567';
  const rc = await req('/api/auth/phone/request-code','POST',{phone, purpose:'register'});
  console.log('request-code:', rc.status, rc.body);
  // read code from db? Instead, brute not possible. Let's fetch from server console? We logged. Use a known approach: query db.
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('database/ultragram.db'));
  await new Promise(r=>setTimeout(r,500));
  const rows = db.exec("SELECT code FROM phone_verifications WHERE phone='"+phone+"' ORDER BY created_at DESC LIMIT 1");
  if (!rows.length || !rows[0].values.length) { console.log('no rows'); process.exit(1); }
  const code = rows[0].values[0][0];
  console.log('code from db:', code);
  const reg = await req('/api/auth/phone/register','POST',{phone, code, password:'Phone123!', password2:'Phone123!', display_name:'PhoneUser'});
  console.log('register:', reg.status, reg.body);
  const login = await req('/api/auth/phone/login','POST',{phone, password:'Phone123!'});
  console.log('login:', login.status, !!login.body.token);
  // reset flow
  await req('/api/auth/phone/request-code','POST',{phone, purpose:'reset'});
  await new Promise(r=>setTimeout(r,500));
  const rows2 = db.exec("SELECT code FROM phone_verifications WHERE phone='"+phone+"' AND purpose='reset' ORDER BY created_at DESC LIMIT 1");
  const code2 = rows2[0].values[0][0];
  const reset = await req('/api/auth/phone/reset-confirm','POST',{phone, code:code2, new_password:'NewPhone1!'});
  console.log('reset:', reset.status, reset.body);
})();
