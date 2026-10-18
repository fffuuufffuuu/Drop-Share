// Local, interactive provider acceptance check. No application database is used.
// Run after npm run build: node scripts/verify-cloudbase-auth.cjs <environment-id>
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const envId = process.argv[2];
if (!envId || !/^[a-z][a-z0-9-]+$/.test(envId)) throw new Error("Pass the CloudBase environment ID");
process.env.CLOUDBASE_ENV_ID = envId;
const { AuthError, cloudbasePhone, cloudbaseRequest } = require("../dist/cloudbase");
const { verifyCloudbaseAcceptance } = require("../dist/cloudbase-acceptance");
const origin = "http://127.0.0.1:4051";
let challenge;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CloudBase 认证验收</title>
<style>body{font:16px system-ui;background:#f6f7fa;color:#242936;padding:32px}main{max-width:520px;margin:30px auto;background:white;padding:30px;border-radius:18px}label{display:block;margin:18px 0}input,select,button{font:inherit;padding:10px;border:1px solid #ccd0da;border-radius:8px}input{display:block;width:90%;margin-top:8px}button{cursor:pointer;margin:8px 8px 8px 0}p{line-height:1.7}#result{white-space:pre-wrap}</style>
<main><h1>CloudBase 认证验收</h1><p>验证新环境能否真实发送验证码、注册或登录，并撤销测试会话。此页不读取或修改网站数据库。</p>
<label>验证方式<select id="method"><option value="sms">手机短信</option><option value="email">邮箱</option></select></label>
<label>手机号或邮箱<input id="identity" autocomplete="off" placeholder="中国大陆手机号或邮箱"></label>
<p>点击发送会将所填号码或邮箱提交给腾讯云。短信按当前价格消耗约 50 资源点/条；不在此页购买套餐。</p>
<div id="captcha-box" hidden><img id="captcha-image" alt="请识别图中的验证码"><label>图形验证码<input id="captcha-answer" autocomplete="off" maxlength="32"></label></div>
<button id="send">发送验证码</button><label>验证码<input id="code" autocomplete="one-time-code" inputmode="numeric" maxlength="6"></label><button id="verify" disabled>验证并结束测试会话</button><p id="result" role="status"></p></main>
<script>
let proof='';let captcha=null;let sending=false;let counter=0;const byId=id=>document.getElementById(id);const send=byId('send');const verify=byId('verify');
function clearCaptcha(){captcha=null;byId('captcha-box').hidden=true;byId('captcha-image').removeAttribute('src');byId('captcha-answer').value='';}
function reset(){proof='';verify.disabled=true;byId('code').value='';}
byId('identity').oninput=()=>{reset();clearCaptcha();};byId('method').onchange=()=>{reset();clearCaptcha();};
async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.message),{captchaRequired:d.captchaRequired});return d;}
send.onclick=async()=>{if(sending)return;sending=true;send.disabled=true;reset();byId('result').textContent='正在发送…';try{let captchaToken;if(captcha){captchaToken=(await call('/captcha/verify',{token:captcha.token,key:byId('captcha-answer').value})).captchaToken;}const d=await call('/code',{method:byId('method').value,identity:byId('identity').value,captchaToken});clearCaptcha();proof=d.proof;verify.disabled=false;byId('result').textContent='验证码已发送，请输入收到的验证码。';counter=60;const timer=setInterval(()=>{send.textContent=(--counter)+' 秒后重发';if(counter<=0){clearInterval(timer);send.textContent='发送验证码';send.disabled=false;}},1000);}catch(e){byId('result').textContent=e.message;if(e.captchaRequired||captcha){try{captcha=await call('/captcha',{});byId('captcha-image').src=captcha.data;byId('captcha-box').hidden=false;byId('captcha-answer').value='';}catch{byId('result').textContent+='\\n图形验证码加载失败，请稍后重试。';}}send.disabled=false;}finally{sending=false;}};
verify.onclick=async()=>{verify.disabled=true;try{await call('/verify',{proof,code:byId('code').value});byId('result').textContent='验证成功：身份一致、令牌刷新通过，退出后访问和刷新令牌均已失效。网站账号和数据库尚未切换。';reset();}catch(e){byId('result').textContent=e.message;verify.disabled=false;}};
</script></html>`;

http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html;charset=utf-8");res.end(html);return;
  }
  res.setHeader("Content-Type", "application/json;charset=utf-8");
  if (req.method !== "POST" || req.headers.origin !== origin) {res.writeHead(403).end('{"message":"Forbidden"}');return;}
  let phase = req.url === "/code" ? "send_code" : "input";
  try {
    let raw = "";
    for await (const part of req) {raw += part;if (raw.length > 8192) throw new Error("请求过大");}
    const input = JSON.parse(raw);
    if (req.url === "/captcha") {
      phase = "captcha";
      const data = z.object({data:z.string().max(500000).regex(/^data:image\/(gif|png|jpeg);base64,[A-Za-z0-9+/=]+$/),token:z.string().min(1).max(8192)}).parse(await cloudbaseRequest("/captcha/data", {}));
      res.end(JSON.stringify(data));return;
    }
    if (req.url === "/captcha/verify") {
      phase = "captcha_verify";
      const value = z.object({token:z.string().min(1).max(8192),key:z.string().min(1).max(32)}).parse(input);
      const data = z.object({captcha_token:z.string().min(1).max(8192)}).parse(await cloudbaseRequest("/captcha/data/verify", value));
      res.end(JSON.stringify({captchaToken:data.captcha_token}));return;
    }
    if (req.url === "/code") {
      if (challenge && Date.now() < challenge.sentAt + 60000) throw new Error("请等待 60 秒再发送");
      const sms = input.method === "sms";
      const identity = String(input.identity || "").trim().toLowerCase().replace(/\s/g, "");
      const normalized = sms ? identity.replace(/^(1\d{10})$/, "+86$1") : identity;
      if (sms ? !/^\+861[3-9]\d{9}$/.test(normalized) : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("请输入有效手机号或邮箱");
      const captchaToken = z.string().min(1).max(8192).optional().parse(input.captchaToken);
      const data = await cloudbaseRequest("/verification", {target:"ANY", ...(sms ? {phone_number:cloudbasePhone(normalized)} : {email:normalized})}, undefined, captchaToken);
      if (!data.verification_id) throw new Error("未收到验证码请求 ID");
      challenge = {proof:randomUUID(),sms,identity:normalized,id:data.verification_id,isUser:data.is_user===true,sentAt:Date.now()};
      res.end(JSON.stringify({proof:challenge.proof}));
      console.log(JSON.stringify({stage:"code_sent",channel:sms?"sms":"email"}));return;
    }
    if (req.url === "/verify") {
      const proof = challenge;
      if (!proof || proof.proof !== input.proof || Date.now() - proof.sentAt > 600000 || !/^\d{6}$/.test(input.code)) throw new Error("验证码请求无效或已过期");
      const result = await verifyCloudbaseAcceptance(proof, input.code, stage => { phase = stage; });
      challenge = undefined;
      console.log(JSON.stringify({stage:"verified_and_signed_out",channel:proof.sms?"sms":"email",...result}));
      res.end('{"ok":true}');return;
    }
    res.writeHead(404).end('{"message":"Not found"}');
  } catch (error) {
    const diagnostic = {phase, ...(error instanceof AuthError ? { code:error.code, ...error.diagnostic } : {})};
    console.log(JSON.stringify({stage:"acceptance_error", ...diagnostic}));
    const details = `\n诊断信息：${JSON.stringify(diagnostic)}`;
    res.writeHead(400).end(JSON.stringify({message:(error instanceof Error?error.message:"验证失败") + details,captchaRequired:error instanceof AuthError&&error.code==="captcha_required"}));
  }
}).listen(4051, "127.0.0.1", () => console.log(`CloudBase acceptance check: ${origin}`));
