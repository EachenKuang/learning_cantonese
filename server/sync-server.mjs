/** 粵學堂 · 轻量邀请制云端学习档案 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { initStore, reloadStore, getState, mutate, normalizeUserId, hashPassword, verifyPassword, tokenHash, newSessionToken, sanitizeProfile, mergeReviews } from './sync-store.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8788);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://jyut.kuangyichen.com';
const SESSION_DAYS = Math.max(1,Math.min(90,Number(process.env.SESSION_DAYS||30)));
const MAX_BODY = 256 * 1024;
const loginAttempts = new Map();
await initStore();
const DUMMY_PASSWORD = await hashPassword(randomBytes(24).toString('hex'));

function sendJson(res,status,body,headers={}){
  const payload=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':payload.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(payload);
}
function allowedOrigin(req){ const origin=req.headers.origin; return origin===ALLOWED_ORIGIN; }
function cookies(req){
  return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));
}
async function readJson(req){
  const declared=Number(req.headers['content-length']||0); if(declared>MAX_BODY) throw Object.assign(new Error('too_large'),{status:413});
  const chunks=[]; let size=0;
  for await(const chunk of req){ size+=chunk.length; if(size>MAX_BODY) throw Object.assign(new Error('too_large'),{status:413}); chunks.push(chunk); }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch(_){throw Object.assign(new Error('invalid_json'),{status:400});}
}
function clientIp(req){ return String(req.headers['x-real-ip']||req.socket.remoteAddress||'unknown').slice(0,80); }
function rateLimited(key){
  const now=Date.now(), windowMs=15*60*1000, max=8; let item=loginAttempts.get(key);
  if(loginAttempts.size>5000){ for(const [candidate,value] of loginAttempts){ if(now-value.start>windowMs) loginAttempts.delete(candidate); } }
  if(!item||now-item.start>windowMs){item={start:now,count:0};loginAttempts.set(key,item);}
  item.count++; return item.count>max;
}
function sessionUser(req){
  const token=cookies(req).jyut_session; if(!token) return null;
  const key=tokenHash(token), session=getState().sessions[key];
  if(!session||session.expiresAt<=Date.now()) return null;
  const user=getState().users[session.userId];
  return user&&!user.disabled ? {user,key,session} : null;
}
function cookieHeader(token,maxAge){ return `jyut_session=${encodeURIComponent(token)}; Path=/api/account; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
function profileResponse(user){ const p=user.profile||{version:0,updatedAt:null,data:null}; return {version:p.version||0,updatedAt:p.updatedAt||null,profile:p.data||null}; }

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/health'&&(req.method==='GET'||req.method==='HEAD')) return sendJson(res,200,{status:'ok',service:'jyut-sync',schemaVersion:1});
    if(['POST','PUT','PATCH','DELETE'].includes(req.method||'')&&!allowedOrigin(req)) return sendJson(res,403,{error:'origin_not_allowed'});

    if(url.pathname==='/session'&&req.method==='GET'){
      const auth=sessionUser(req); return sendJson(res,200,auth?{authenticated:true,user:{id:auth.user.id,displayName:auth.user.displayName}}:{authenticated:false});
    }
    if(url.pathname==='/login'&&req.method==='POST'){
      const body=await readJson(req), id=normalizeUserId(body.userId), key=`${clientIp(req)}:${id||'invalid'}`;
      if(rateLimited(key)) return sendJson(res,429,{error:'too_many_attempts'},{'Retry-After':'900'});
      const user=id?getState().users[id]:null;
      const candidate=user&&!user.disabled&&user.password?user.password:DUMMY_PASSWORD;
      const passwordValid=await verifyPassword(String(body.password||''),candidate);
      const valid=!!(user&&!user.disabled&&user.password&&passwordValid);
      if(!valid){ await new Promise(r=>setTimeout(r,250+Math.floor(Math.random()*250))); return sendJson(res,401,{error:'invalid_credentials'}); }
      const token=newSessionToken(), expiresAt=Date.now()+SESSION_DAYS*86400000;
      await mutate(store=>{
        for(const [sessionKey,session] of Object.entries(store.sessions)){ if(session.expiresAt<=Date.now()) delete store.sessions[sessionKey]; }
        store.sessions[tokenHash(token)]={userId:user.id,createdAt:Date.now(),expiresAt};
      });
      loginAttempts.delete(key);
      return sendJson(res,200,{authenticated:true,user:{id:user.id,displayName:user.displayName}},{'Set-Cookie':cookieHeader(token,SESSION_DAYS*86400)});
    }
    if(url.pathname==='/logout'&&req.method==='POST'){
      const auth=sessionUser(req); if(auth) await mutate(store=>{delete store.sessions[auth.key];});
      return sendJson(res,200,{ok:true},{'Set-Cookie':cookieHeader('',0)});
    }

    const auth=sessionUser(req); if(!auth) return sendJson(res,401,{error:'authentication_required'});
    if(url.pathname==='/profile'&&req.method==='GET') return sendJson(res,200,profileResponse(auth.user));
    if(url.pathname==='/profile'&&req.method==='PUT'){
      const body=await readJson(req), expected=Number(body.version);
      const current=auth.user.profile||{version:0,updatedAt:null,data:null};
      if(!Number.isInteger(expected)||expected!==current.version) return sendJson(res,409,{error:'version_conflict',...profileResponse(auth.user)});
      const profile=sanitizeProfile(body.profile), updatedAt=new Date().toISOString();
      /* SRS 复习记录按词合并：服务端已存 vs 客户端提交，同 key 取 updatedAt 较新者，避免旧设备整包覆盖新计划 */
      const existing = current.data?.reviews;
      if(existing && Object.keys(existing).length > 0 && profile.reviews){
        profile.reviews = mergeReviews(existing, profile.reviews);
      }
      await mutate(store=>{ const record=store.users[auth.user.id]; record.profile={version:current.version+1,updatedAt,data:profile}; });
      return sendJson(res,200,profileResponse(getState().users[auth.user.id]));
    }
    return sendJson(res,404,{error:'not_found'});
  }catch(error){
    console.error('[sync]',error.message);
    if(!res.headersSent) sendJson(res,error.status||500,{error:error.status?'bad_request':'internal_error',requestId:randomBytes(4).toString('hex')});
    else res.destroy();
  }
});
server.keepAliveTimeout=10_000; server.headersTimeout=15_000; server.requestTimeout=20_000;
server.listen(PORT,HOST,()=>console.log(`[粵學堂 Sync] listening on http://${HOST}:${PORT}`));
function shutdown(signal){console.log(`[粵學堂 Sync] ${signal}, shutting down`);server.close(error=>process.exit(error?1:0));}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGHUP',()=>reloadStore().then(()=>console.log('[粵學堂 Sync] account store reloaded')).catch(error=>console.error('[sync] reload failed',error.message)));
