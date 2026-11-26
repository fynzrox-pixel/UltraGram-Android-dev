const http = require('http');
const crypto = require('crypto');
function req(path, method, body, token) {
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname:'127.0.0.1', port:8787, path, method, headers:{} };
    if (token) opts.headers['Authorization']='Bearer '+token;
    if (data) { opts.headers['Content-Type']='application/json'; opts.headers['Content-Length']=Buffer.byteLength(data); }
    const r = http.request(opts, res=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(b)});}catch{resolve({status:res.statusCode,body:b});} }); });
    r.on('error',reject); if (data) r.write(data); r.end();
  });
}
function b32d(s){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,v=0,o=[];for(const ch of s.toUpperCase().replace(/=+$/,'')){const i=a.indexOf(ch);if(i<0)continue;v=(v<<5)|i;bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8;}}return Buffer.from(o);}
function totp(sec){const k=b32d(sec);const c=Math.floor(Date.now()/1000/30);const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(c));const h=crypto.createHmac('sha1',k).update(b).digest();const o=h[h.length-1]&0x0f;const code=((h[o]&0x7f)<<24|(h[o+1]&0xff)<<16|(h[o+2]&0xff)<<8|(h[o+3]&0xff))%1000000;return String(code).padStart(6,'0');}
(async()=>{
  const r = await req('/api/auth/register','POST',{email:'tfa2@ug.com',password:'Tfa12345!',display_name:'TFA2'});
  const token = r.body.token;
  const setup = await req('/api/2fa/setup','POST',{},token);
  const code = totp(setup.body.secret);
  const v = await req('/api/2fa/verify','POST',{code},token);
  console.log('verify:', v.status, v.body);
  const login = await req('/api/auth/login','POST',{email:'tfa2@ug.com',password:'Tfa12345!'});
  console.log('login requires_2fa:', login.body.requires_2fa);
  const code2 = totp(setup.body.secret);
  const login2 = await req('/api/auth/2fa-login','POST',{email:'tfa2@ug.com',password:'Tfa12345!',code:code2});
  console.log('2fa-login:', login2.status, !!login2.body.token);
})();
