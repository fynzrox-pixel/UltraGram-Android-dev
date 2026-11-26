const http = require('http');
function req(path, method='GET', body=null, token=null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname:'127.0.0.1', port:8787, path, method, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) { opts.headers['Content-Type']='application/json'; opts.headers['Content-Length']=Buffer.byteLength(data); }
    const r = http.request(opts, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(b)});}catch{resolve({status:res.statusCode,body:b});} }); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
(async () => {
  let pass=0, fail=0;
  const check = (name, cond) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };
  const h = await req('/api/health');
  check('health', h.status===200 && h.body.ok);
  const reg = await req('/api/auth/register','POST',{email:'smoke'+Date.now()+'@ug.com',password:'Smoke123!',display_name:'Smoke'});
  check('register', reg.status===200);
  const token = reg.body.token;
  const me = await req('/api/auth/me','GET',null,token);
  check('me', me.status===200 && me.body.id);
  const gifts = await req('/api/gifts','GET',null,token);
  check('gifts count 100', Array.isArray(gifts.body) && gifts.body.length===100);
  const w = await req('/api/wallet','GET',null,token);
  check('wallet', w.status===200);
  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail>0?1:0);
})();
