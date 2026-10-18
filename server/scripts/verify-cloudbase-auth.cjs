// Local, interactive provider acceptance check. No application database is used.
// Run after npm run build: node scripts/verify-cloudbase-auth.cjs <environment-id>
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const envId = process.argv[2];
if (!envId || !/^[a-z][a-z0-9-]+$/.test(envId)) throw new Error("Pass the CloudBase environment ID");
process.env.CLOUDBASE_ENV_ID = envId;
const { AuthError, cloudbasePhone, cloudbaseRequest, getCloudbaseUser, cloudbaseSessionSchema } = require("../dist/cloudbase");
const origin = "http://127.0.0.1:4051";
let challenge;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CloudBase 认证验收</title>
<style>body{font:16px system-ui;background:#f6f7fa;color:#242936;padding:32px}main{max-width:520px;margin:30px auto;background:white;padding:30px;border-radius:18px}label{display:block;margin:18px 0}input,select,button{font:inherit;padding:10px;border:1px solid #ccd0da;border-radius:8px}input{display:block;width:90%;margin-top:8px}button{cursor:pointer;margin:8px 8px 8px 0}p{line-height:1.7}#result{white-space:pre-wrap}</style>
<main><h1>CloudBase 认证验收</h1><p>验证新环境能否真实发送验证码、注册或登录，并撤销测试会话。此页不读取或修改网站数据库。</p>
<label>验证方式<select id="method"><option value="sms">手机短信</option><option value="email">邮箱</option></select></label>
<label>手机号或邮箱<input id="identity" autocomplete="off" placeholder="中国大陆手机号或邮箱"></label>
<p>点击发送会将所填号码或邮箱提交给腾讯云。短信按当前价格消耗约 50 资源点/条；不在此页购买套餐。</p>
<button id="send">发送验证码</button><label>验证码<input id="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6"></label><button id="verify" disabled>验证并结束测试会话</button><p id="result" role="status"></p></main>
<script>
let proof='';let sending=false;let counter=0;const byId=id=>document.getElementById(id);const send=byId('send');const verify=byId('verify');
function reset(){proof='';verify.disabled=true;byId('code').value='';}
byId('identity').oninput=reset;byId('method').onchange=reset;
async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message);return d;}
send.onclick=async()=>{if(sending)return;sending=true;send.disabled=true;reset();byId('result').textContent='正在发送…';try{const d=await call('/code',{method:byId('method').value,identity:byId('identity').value});proof=d.proof;verify.disabled=false;byId('result').textContent='验证码已发送，请输入收到的验证码。';counter=60;const timer=setInterval(()=>{send.textContent=(--counter)+' 秒后重发';if(counter<=0){clearInterval(timer);send.textContent='发送验证码';send.disabled=false;}},1000);}catch(e){byId('result').textContent=e.message;send.disabled=false;}finally{sending=false;}};
verify.onclick=async()=>{verify.disabled=true;try{await call('/verify',{proof,code:byId('code').value});byId('result').textContent='验证成功：身份状态 ACTIVE，测试会话已退出。网站账号和数据库尚未切换。';reset();}catch(e){byId('result').textContent=e.message;verify.disabled=false;}};
</script></html>`;

http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html;charset=utf-8");res.end(html);return;
  }
  res.setHeader("Content-Type", "application/json;charset=utf-8");
  if (req.method !== "POST" || req.headers.origin !== origin) {res.writeHead(403).end('{"message":"Forbidden"}');return;}
  try {
    let raw = "";
    for await (const part of req) {raw += part;if (raw.length > 8192) throw new Error("请求过大");}
    const input = JSON.parse(raw);
    if (req.url === "/code") {
      if (challenge && Date.now() < challenge.sentAt + 60000) throw new Error("请等待 60 秒再发送");
      const sms = input.method === "sms";
      const identity = String(input.identity || "").trim().toLowerCase().replace(/\s/g, "");
      const normalized = sms ? identity.replace(/^(1\d{10})$/, "+86$1") : identity;
      if (sms ? !/^\+861[3-9]\d{9}$/.test(normalized) : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("请输入有效手机号或邮箱");
      const data = await cloudbaseRequest("/verification", {target:"ANY", ...(sms ? {phone_number:cloudbasePhone(normalized)} : {email:normalized})});
      if (!data.verification_id) throw new Error("未收到验证码请求 ID");
      challenge = {proof:randomUUID(),sms,identity:normalized,id:data.verification_id,isUser:data.is_user===true,sentAt:Date.now()};
      res.end(JSON.stringify({proof:challenge.proof}));
      console.log(JSON.stringify({stage:"code_sent",channel:sms?"sms":"email"}));return;
    }
    if (req.url === "/verify") {
      const proof = challenge;
      if (!proof || proof.proof !== input.proof || Date.now() - proof.sentAt > 600000 || !/^\d{6}$/.test(input.code)) throw new Error("验证码请求无效或已过期");
      const verification = await cloudbaseRequest("/verification/verify", {verification_id:proof.id,verification_code:input.code});
      const session = cloudbaseSessionSchema.parse(await cloudbaseRequest(proof.isUser?"/signin":"/signup", {verification_token:verification.verification_token, ...(proof.isUser?{}:proof.sms?{phone_number:cloudbasePhone(proof.identity)}:{email:proof.identity})}));
      let latestToken = session.access_token;
      try {
        const refreshed = cloudbaseSessionSchema.parse(await cloudbaseRequest("/token", {grant_type:"refresh_token",refresh_token:session.refresh_token}));
        latestToken = refreshed.access_token;
        if (refreshed.sub !== session.sub || refreshed.refresh_token === session.refresh_token) throw new Error("刷新身份或刷新令牌轮换不符合预期");
        const user = await getCloudbaseUser(latestToken);
        const identity = proof.sms ? user.phone_number?.replace(/\s/g, "") : user.email?.toLowerCase();
        if (user.sub !== session.sub || identity !== proof.identity) throw new Error("认证身份不匹配");
      } finally {await cloudbaseRequest("/user/signout", {}, latestToken);}
      let revoked = false;
      try {await getCloudbaseUser(latestToken);} catch(error) {if ([400,401,403].includes(error.status)) revoked = true;else throw error;}
      if (!revoked) throw new Error("退出后访问令牌仍可用，需要检查 CloudBase 会话撤销行为");
      challenge = undefined;
      console.log(JSON.stringify({stage:"verified_and_signed_out",channel:proof.sms?"sms":"email",status:"ACTIVE",refreshRotated:true,revoked:true}));
      res.end('{"ok":true}');return;
    }
    res.writeHead(404).end('{"message":"Not found"}');
  } catch (error) {
    const diagnostic = error instanceof AuthError ? { code:error.code, ...error.diagnostic } : undefined;
    if (diagnostic) console.log(JSON.stringify({stage:"provider_error", ...diagnostic}));
    const details = diagnostic ? `\n诊断信息：${JSON.stringify(diagnostic)}` : "";
    res.writeHead(400).end(JSON.stringify({message:(error instanceof Error?error.message:"验证失败") + details}));
  }
}).listen(4051, "127.0.0.1", () => console.log(`CloudBase acceptance check: ${origin}`));
