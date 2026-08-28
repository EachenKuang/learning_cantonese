/* ============================================================
   粵學堂 · 应用逻辑
   ============================================================ */
'use strict';

/* ================= 工具 ================= */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const modalRoot = $('#modalRoot');
const audioEl = new Audio();

/* ===== 通用模态框：焦点陷阱 / Esc 关闭 / 背景 inert（控件优化清单 P0-1） ===== */
let modalPrevFocus = null, modalCloseCb = null;
function modalFocusables(root){
  const els = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', root || document);
  return els.filter(el => !el.disabled);
}
function setModalInert(on){
  const skip = new Set(['modalRoot','toast']);
  [...document.body.children].forEach(el => {
    if(skip.has(el.id)) return;
    try{ el.inert = on; }catch(e){}
  });
}
function openModal(html, opts){
  opts = opts || {};
  if(!opts.label){
    const m = String(html).match(/<h3[^>]*>([^<]{1,40})/);
    if(m) opts.label = m[1].replace(/<[^>]+>/g,'').trim();
  }
  if(!modalRoot.children.length) modalPrevFocus = document.activeElement;
  modalRoot.innerHTML = '<div class="modal-mask"><div class="modal' + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true"' +
    (opts.label ? ' aria-label="' + opts.label + '"' : '') + '>' + html + '</div></div>';
  modalCloseCb = opts.onClose || null;
  setModalInert(true);
  const f = modalFocusables($('.modal', modalRoot));
  (f[0] || $('.modal', modalRoot) || modalRoot).focus();
  return closeModal;
}
function closeModal(){
  if(!modalRoot.children.length) return;
  modalRoot.innerHTML = '';
  setModalInert(false);
  if(modalPrevFocus && modalPrevFocus.focus){ try{ modalPrevFocus.focus(); }catch(e){} }
  modalPrevFocus = null;
  const cb = modalCloseCb; modalCloseCb = null;
  if(cb) cb();
}
/* 全局委托：Esc 关闭 + Tab 焦点陷阱 + 点击遮罩关闭（弹层内容重建也生效） */
document.addEventListener('keydown', e => {
  if(!modalRoot.children.length) return;
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeModal(); return; }
  if(e.key === 'Tab'){
    const dlg = $('.modal', modalRoot); if(!dlg) return;
    const f = modalFocusables(dlg);
    if(!f.length){ e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    let ni;
    if(i < 0) ni = e.shiftKey ? f.length - 1 : 0;
    else ni = (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
    e.preventDefault();
    f[ni].focus();
  }
});
document.addEventListener('click', e => {
  if(!modalRoot.children.length) return;
  if(e.target && e.target.classList && e.target.classList.contains('modal-mask')) closeModal();
});
/* 按钮防重入（TTS 加载中禁用，控件优化清单 P2-9） */
function guardBtn(btn){
  if(!btn || btn.dataset.pending === '1') return false;
  btn.dataset.pending = '1';
  const oldT = btn.textContent, oldDis = btn.disabled;
  btn.disabled = true; btn.textContent = '⏳ 加载中…';
  setTimeout(() => { btn.disabled = oldDis; btn.textContent = oldT; btn.dataset.pending = ''; }, 3200);
  return true;
}
/* 粤拼去掉调号数字，仅作显示用（如 baa1 → baa） */
const jq = s => String(s).replace(/[0-9]/g,'').trim();

let toastTimer;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
/* ================= 本地存储 ================= */
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const PROFILE_KEY = 'canto_profile_v2';
const LEGACY_SESSION_KEY = 'canto_session';
const CLOUD_META_KEY = 'canto_cloud_meta_v1';
const CLOUD_BASE = '/api/account';
let cloudState = {checked:false, authenticated:false, user:null, version:0, status:'本机档案', updatedAt:null, error:null};
let cloudSyncTimer = null;
let cloudPushChain = Promise.resolve();
function freshProgress(){
  return {
    favorites:[], learned:[], practices:[], quiz:[], dialogues:[],
    checkins:{}, lastCheckin:null, streak:0,
    goalCount:10, goalDate:null, goalToday:0, goalWords:[],
    reminder:false, reminderSentDate:null, activities:[], lastStudyDate:null, reviews:{},
    modifiedAt:0
  };
}
function cleanStringList(v){ return Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string').slice(0,500))] : []; }
function normalizeProgress(raw){
  const d = freshProgress();
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const checkins = {};
  if(raw.checkins && typeof raw.checkins === 'object'){
    Object.entries(raw.checkins).slice(0,1500).forEach(([k,v]) => { if(/^\d{4}-\d{2}-\d{2}$/.test(k) && v) checkins[k] = true; });
  }
  return {
    favorites:cleanStringList(raw.favorites), learned:cleanStringList(raw.learned),
    practices:Array.isArray(raw.practices) ? raw.practices.slice(0,60).map(x => ({ico:String(x?.ico||'🎤').slice(0,12),label:String(x?.label||'练习').slice(0,80),score:Math.max(0,Math.min(100,Number(x?.score)||0)),time:Number(x?.time)||Date.now()})) : [],
    quiz:Array.isArray(raw.quiz) ? raw.quiz.slice(0,100) : [], dialogues:cleanStringList(raw.dialogues),
    checkins, lastCheckin:typeof raw.lastCheckin === 'string' ? raw.lastCheckin : null,
    streak:Math.max(0,Math.min(3650,Number(raw.streak)||0)),
    goalCount:Math.max(1,Math.min(100,Number(raw.goalCount)||10)),
    goalDate:typeof raw.goalDate === 'string' ? raw.goalDate : null,
    goalToday:Math.max(0,Math.min(100,Number(raw.goalToday)||0)), goalWords:cleanStringList(raw.goalWords),
    reminder:!!raw.reminder, reminderSentDate:typeof raw.reminderSentDate === 'string' ? raw.reminderSentDate : null,
    activities:Array.isArray(raw.activities) ? raw.activities.slice(0,6).map(x => ({icon:String(x?.icon||'📖').slice(0,12),title:String(x?.title||'学习记录').slice(0,80),sub:String(x?.sub||'').slice(0,120),route:ROUTES[x?.route] ? x.route : 'home',time:Number(x?.time)||Date.now()})) : [],
    lastStudyDate:typeof raw.lastStudyDate === 'string' ? raw.lastStudyDate : null,
    modifiedAt:Math.max(0, Number(raw.modifiedAt)||0),
    reviews:(() => {
      const rv = {};
      if(raw.reviews && typeof raw.reviews === 'object'){
        Object.entries(raw.reviews).slice(0,1000).forEach(([k,v]) => {
          if(typeof k !== 'string' || !k) return;
          rv[k] = { box: Math.max(0, Math.min(5, Number(v?.box)||1)), due: typeof v?.due === 'string' ? v.due : new Date().toISOString().slice(0,10) };
        });
      }
      return rv;
    })()
  };
}
function migrateLegacyProgress(){
  if(LS.get(PROFILE_KEY, null)) return;
  const legacyUser = LS.get(LEGACY_SESSION_KEY, null);
  const legacy = legacyUser ? LS.get('canto_progress_' + legacyUser, null) : null;
  if(legacy) LS.set(PROFILE_KEY, normalizeProgress(legacy));
}
function getProgress(){
  return normalizeProgress(LS.get(PROFILE_KEY, freshProgress()));
}
function storeProgress(p, {touch=false, sync=false}={}){
  const normalized = normalizeProgress(p);
  if(touch) normalized.modifiedAt = Date.now();
  LS.set(PROFILE_KEY, normalized);
  if(sync) scheduleCloudSync();
  return normalized;
}
function saveProgress(p){ return storeProgress(p, {touch:true, sync:true}); }

function profileEqual(a,b){ return JSON.stringify(normalizeProgress(a)) === JSON.stringify(normalizeProgress(b)); }
function mergeUnique(items, keyFn, limit){
  const seen = new Set();
  return items.filter(item => { const key=keyFn(item); if(seen.has(key)) return false; seen.add(key); return true; })
    .sort((a,b)=>(Number(b?.time)||0)-(Number(a?.time)||0)).slice(0,limit);
}
function mergeFirstCloud(localRaw, remoteRaw){
  const local=normalizeProgress(localRaw), remote=normalizeProgress(remoteRaw);
  if(!remoteRaw) return local;
  const newer = local.modifiedAt >= remote.modifiedAt ? local : remote;
  const out = {...newer};
  ['favorites','learned','dialogues','goalWords'].forEach(key => { out[key]=[...new Set([...(local[key]||[]),...(remote[key]||[])])]; });
  out.checkins = {...remote.checkins,...local.checkins};
  out.practices = mergeUnique([...local.practices,...remote.practices], x=>`${x.time}|${x.label}|${x.score}`, 60);
  out.activities = mergeUnique([...local.activities,...remote.activities], x=>`${x.time}|${x.title}|${x.route}`, 6);
  out.streak = Math.max(local.streak,remote.streak);
  out.modifiedAt = Math.max(local.modifiedAt,remote.modifiedAt);
  return normalizeProgress(out);
}
function mergeSet3(base,local,remote){
  const b=new Set(base||[]), l=new Set(local||[]), r=new Set(remote||[]);
  const out=new Set([...b,...l,...r]);
  for(const item of b){ if(!l.has(item)||!r.has(item)) out.delete(item); }
  return [...out];
}
function mergeCloud3(baseRaw, localRaw, remoteRaw){
  const base=normalizeProgress(baseRaw), local=normalizeProgress(localRaw), remote=normalizeProgress(remoteRaw);
  const out={...local};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const setKeys=new Set(['favorites','learned','dialogues','goalWords']);
  const appendKeys=new Set(['practices','activities']);
  for(const key of Object.keys(base)){
    if(same(local[key],base[key])) out[key]=remote[key];
    else if(same(remote[key],base[key])||same(local[key],remote[key])) out[key]=local[key];
    else if(setKeys.has(key)) out[key]=mergeSet3(base[key],local[key],remote[key]);
    else if(appendKeys.has(key)) out[key]=mergeUnique([...(local[key]||[]),...(remote[key]||[])], x=>key==='practices'?`${x.time}|${x.label}|${x.score}`:`${x.time}|${x.title}|${x.route}`, key==='practices'?60:6);
    else if(key==='checkins') out[key]={...remote[key],...local[key]};
    else out[key]=local.modifiedAt>=remote.modifiedAt?local[key]:remote[key];
  }
  out.modifiedAt=Math.max(local.modifiedAt,remote.modifiedAt);
  return normalizeProgress(out);
}

async function cloudFetch(path, options={}){
  const {headers={},...rest}=options;
  const res = await fetch(CLOUD_BASE+path, {credentials:'same-origin',cache:'no-store',...rest,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...headers}});
  let data={}; try{ data=await res.json(); }catch(_){}
  return {res,data};
}
function setCloudState(patch){
  cloudState={...cloudState,...patch};
  if(currentRoute==='profile') renderProfile();
}
function saveCloudBase(profile){
  LS.set(CLOUD_META_KEY,{userId:cloudState.user?.id,version:cloudState.version,base:normalizeProgress(profile),updatedAt:cloudState.updatedAt});
}
async function pushCloudProfile(){
  if(!cloudState.authenticated) return false;
  const local=getProgress();
  setCloudState({status:'同步中…',error:null});
  const {res,data}=await cloudFetch('/profile',{method:'PUT',body:JSON.stringify({version:cloudState.version,profile:local})});
  if(res.status===401){ setCloudState({authenticated:false,user:null,status:'登录已失效',error:'请重新登录'}); return false; }
  if(res.status===409){
    const meta=LS.get(CLOUD_META_KEY,null);
    const merged=meta?.userId===cloudState.user?.id&&meta?.base ? mergeCloud3(meta.base,local,data.profile) : mergeFirstCloud(local,data.profile);
    storeProgress(merged);
    cloudState.version=Number(data.version)||0;
    const retry=await cloudFetch('/profile',{method:'PUT',body:JSON.stringify({version:cloudState.version,profile:merged})});
    if(!retry.res.ok){ setCloudState({status:'同步待重试',error:'云端版本冲突'}); return false; }
    cloudState.version=retry.data.version; cloudState.updatedAt=retry.data.updatedAt; saveCloudBase(merged);
    setCloudState({status:'已同步',error:null}); return true;
  }
  if(!res.ok){ setCloudState({status:'同步待重试',error:res.status===429?'操作太频繁，请稍后再试':'网络暂不可用'}); return false; }
  cloudState.version=data.version; cloudState.updatedAt=data.updatedAt; saveCloudBase(local);
  setCloudState({status:'已同步',error:null}); return true;
}
function queueCloudPush(){
  cloudPushChain=cloudPushChain.catch(()=>false).then(()=>pushCloudProfile());
  return cloudPushChain;
}
function scheduleCloudSync(){
  if(!cloudState.authenticated) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(queueCloudPush,900);
}
async function initCloudSync(){
  try{
    const session=await cloudFetch('/session');
    if(!session.res.ok||!session.data.authenticated){ setCloudState({checked:true,authenticated:false,user:null,status:'本机档案'}); return; }
    cloudState={...cloudState,checked:true,authenticated:true,user:session.data.user,status:'正在合并…'};
    const remote=await cloudFetch('/profile');
    if(!remote.res.ok) throw new Error('profile_load');
    cloudState.version=Number(remote.data.version)||0; cloudState.updatedAt=remote.data.updatedAt||null;
    const local=getProgress(), meta=LS.get(CLOUD_META_KEY,null);
    let merged;
    if(meta?.userId&&meta.userId!==cloudState.user.id) merged=normalizeProgress(remote.data.profile||freshProgress());
    else if(meta?.userId===cloudState.user.id&&meta?.base) merged=mergeCloud3(meta.base,local,remote.data.profile);
    else merged=mergeFirstCloud(local,remote.data.profile);
    storeProgress(merged);
    if(profileEqual(merged,remote.data.profile)){ saveCloudBase(merged); setCloudState({status:'已同步',error:null}); }
    else await queueCloudPush();
    if(currentRoute==='home') renderHome();
  }catch(_){ setCloudState({checked:true,status:cloudState.authenticated?'同步待重试':'本机档案',error:cloudState.authenticated?'暂时无法连接云端':null}); }
}
function markStudyToday(){
  const p = getProgress();
  if(p.lastStudyDate !== todayKey()){ p.lastStudyDate = todayKey(); saveProgress(p); }
}

/* 全局朗读语速（TTS） */
let speechRate = LS.get('canto_speech_rate', 0.75);
/* 朗读排程代际：stopSpeak 递增使其失效（修复「全部朗读停不下来」） */
let speakSeq = 0;

/* ================= 语音（TTS）================= */
let CLOUD_TTS_URL = LS.get('canto_cloud_tts_url', '/api/tts');
let CLOUD_TTS_HEALTH_URL = CLOUD_TTS_URL.replace(/\/+$/,'') + '/health';
function updateCloudUrls(){
  CLOUD_TTS_URL = LS.get('canto_cloud_tts_url', '/api/tts');
  CLOUD_TTS_HEALTH_URL = CLOUD_TTS_URL.replace(/\/+$/,'') + '/health';
}
const cloudAudio = new Audio();
let localYueVoice = null;
let cloudTTS = {checked:false, ready:false, name:'晓佳（zh-HK-HiuGaaiNeural）'};
let voiceInfo = {status:'detecting', name:''};
let voiceUnavailAt = 0;
/* 语音不可用提示：8 秒节流一次，避免听力小测每题都弹 */
function notifyVoiceUnavailable(){
  const now = Date.now();
  if(now - voiceUnavailAt < 8000) return;
  voiceUnavailAt = now;
  toast('🔇 粤语语音暂不可用：设备无粤语语音包或云端未连接，可展开「🔧 语音诊断」处理');
}

function refreshVoices(){
  if(!('speechSynthesis' in window)){ localYueVoice = null; updateVoiceState(); return; }
  const vs = speechSynthesis.getVoices();
  const nameKey = v => ((v.name || '') + ' ' + (v.lang || '')).toLowerCase();
  /* 只接受明确的粤语语音；普通话不再作为教学发音兜底。 */
  localYueVoice =
    vs.find(v => /^(zh[-_]?hk|zh[-_]?mo|yue)/i.test(v.lang || '')) ||
    vs.find(v => /(zh[-_]?hk|zh[-_]?mo|yue)/i.test(nameKey(v))) ||
    vs.find(v => /粤|cantonese|hong.?kong|香港/i.test(nameKey(v))) || null;
  updateVoiceState();
}
async function checkCloudTTS(){
  try{
    const res = await fetch(CLOUD_TTS_HEALTH_URL, {cache:'no-store', headers:{Accept:'application/json'}});
    if(!res.ok) throw new Error('health ' + res.status);
    const data = await res.json();
    cloudTTS = {checked:true, ready:data.status === 'ok', name:data.voiceLabel || cloudTTS.name};
  }catch(_){
    cloudTTS = {...cloudTTS, checked:true, ready:false};
  }
  updateVoiceState();
}
function updateVoiceState(){
  if(cloudTTS.ready) voiceInfo = {status:'cloud', name:cloudTTS.name};
  else if(localYueVoice) voiceInfo = {status:'ok', name:localYueVoice.name + '（' + localYueVoice.lang + '）', voice:localYueVoice};
  else if(!cloudTTS.checked) voiceInfo = {status:'detecting', name:''};
  else voiceInfo = {status:'error', name:'云端与设备均未找到可用粤语语音'};
  renderVoiceDiag();
  updateVoiceUI();
}
if('speechSynthesis' in window){
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}
checkCloudTTS();
function updateVoiceUI(){
  let txt;
  if(voiceInfo.status === 'cloud') txt = '云端粤语：' + voiceInfo.name;
  else if(voiceInfo.status === 'ok') txt = '设备粤语：' + voiceInfo.name + '（离线兜底）';
  else if(voiceInfo.status === 'error') txt = '粤语语音暂不可用，点「语音诊断」';
  else txt = '检测粤语语音…';
  const el = $('#voiceBadgeTxt'), badge = $('#voiceBadge');
  if(el) el.textContent = txt;
  if(badge){
    badge.className = 'voice-badge' + (voiceInfo.status==='ok'||voiceInfo.status==='cloud'?' ok':voiceInfo.status==='error'?' warn':'');
  }
  const side = $('#sideVoiceStatus');
  if(side) side.textContent = '🔊 ' + txt;
}
/* 语音诊断面板：列出设备上所有中文/粤语语音，帮助用户排查 */
function renderVoiceDiag(){
  const box = $('#voiceDiagList');
  if(!box) return;
  const cloudLine = `<div class="diag-line ${cloudTTS.ready?'diag-yue':''}">
    <span class="diag-dot ${cloudTTS.ready?'diag-cur':''}"></span>
    ☁️ 云端粤语 · ${esc(cloudTTS.name)} · ${cloudTTS.ready?'当前可用':'暂不可用'}
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input id="cloudUrlInput" value="${esc(CLOUD_TTS_URL)}" placeholder="/api/tts" aria-label="云端 TTS 地址" style="flex:1;min-width:150px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:12px">
      <button type="button" class="btn btn-ghost sm" id="cloudUrlSave">保存地址</button>
      <button type="button" class="btn btn-ghost sm" id="voiceRetry">🔄 重新检测</button>
    </div>
  </div>`;
  let list;
  if(!('speechSynthesis' in window)){
    list = '<p class="diag-line">当前浏览器不支持设备语音，仍可使用云端粤语。</p>';
  } else {
    const vs = speechSynthesis.getVoices();
    const zh = vs.filter(v => /zh|yue/i.test((v.lang||'') + ' ' + (v.name||'')));
    if(!zh.length) list = '<p class="diag-line">设备上没有本地粤语语音；联网时使用云端粤语。</p>';
    else list = zh.map(v => {
      const isYue = /^(zh[-_]?hk|zh[-_]?mo|yue)/i.test(v.lang||'') || /粤|cantonese|hong.?kong|香港/i.test((v.name||'')+' '+(v.lang||''));
      const isCur = !cloudTTS.ready && localYueVoice === v;
      return `<div class="diag-line ${isYue?'diag-yue':''}">
        <span class="diag-dot ${isCur?'diag-cur':''}"></span>
        ${isYue?'🇭🇰 设备粤语':'🗣 非粤语（不用于教学）'} · ${v.name} · <code>${v.lang}</code>${isCur?' ← 离线兜底':''}
      </div>`;
    }).join('');
  }
  box.innerHTML = cloudLine + list;
  /* 保存云端地址 / 重新检测 */
  const save = $('#cloudUrlSave');
  if(save) save.onclick = () => {
    const v = ($('#cloudUrlInput').value || '').trim();
    if(!v){ toast('请输入云端 TTS 地址'); return; }
    LS.set('canto_cloud_tts_url', v);
    updateCloudUrls();
    toast('云端地址已保存，重新检测中…');
    checkCloudTTS();
  };
  const retry = $('#voiceRetry');
  if(retry) retry.onclick = () => {
    refreshVoices();
    checkCloudTTS();
    toast('正在重新检测设备与云端语音…');
  };
}
/* 只保留汉字用于朗读（去掉括号备注等） */
function cleanForSpeech(t){
  return String(t).replace(/[（(].*?[)）]/g,'').replace(/[^\u4e00-\u9fff\u3400-\u4dbf\uF900-\uFAFF]/g,'');
}
let currentUtterance = null;
let cloudQueue = [], cloudPlaying = false, cloudGeneration = 0;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function speakLocal(text, opts={}){
  if(!('speechSynthesis' in window) || !localYueVoice) return false;
  if(!opts.queue) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
  u.voice = localYueVoice;
  u.lang = localYueVoice.lang || 'zh-HK';
  if(isIOS){
    u.lang = 'zh-HK';
  }
  u.rate = opts.rate ?? speechRate;
  u.pitch = opts.pitch ?? 1.0;
  currentUtterance = u;
  speechSynthesis.speak(u);
  return true;
}
function playNextCloud(){
  if(cloudPlaying || !cloudQueue.length) return;
  const item = cloudQueue.shift();
  const generation = cloudGeneration;
  cloudPlaying = true;
  const url = new URL(CLOUD_TTS_URL, window.location.origin);
  url.searchParams.set('text', cleanForSpeech(item.text));
  url.searchParams.set('rate', String(item.opts.rate ?? speechRate));
  cloudAudio.src = url.toString();
  let settled = false;
  const finish = () => {
    if(settled || generation !== cloudGeneration) return;
    settled = true;
    cloudPlaying = false;
    playNextCloud();
  };
  const fallback = () => {
    if(settled || generation !== cloudGeneration) return;
    settled = true;
    cloudPlaying = false;
    if(!speakLocal(item.text, item.opts)) notifyVoiceUnavailable();
    playNextCloud();
  };
  cloudAudio.onended = finish;
  cloudAudio.onerror = fallback;
  cloudAudio.play().catch(fallback);
}
function splitChunks(t, max){
  const segs = t.split(/(?<=[，。！？、；：,.!?;:\s])/).filter(Boolean);
  const out = []; let cur = '';
  for(const p of segs){
    if((cur + p).length > max && cur){ out.push(cur.trim()); cur = p; }
    else cur += p;
  }
  if(cur.trim()) out.push(cur.trim());
  return out;
}
function speak(text, opts={}){
  const cleaned = cleanForSpeech(text);
  if(!cleaned) return;
  markStudyToday();
  /* 长文本分块：避免 iOS 长句截断，超 16 字按标点切块顺序朗读 */
  const MAX = 16;
  if(cleaned.length > MAX && !opts.noSplit){
    const chunks = splitChunks(cleaned, MAX);
    chunks.forEach((c, i) => speak(c, i === 0 ? {...opts, noSplit:true} : {...opts, noSplit:true, queue:true}));
    return;
  }
  if(cloudTTS.ready){
    if(!opts.queue) stopSpeak();
    cloudQueue.push({text:cleaned, opts});
    playNextCloud();
    return;
  }
  if(!speakLocal(cleaned, opts)) notifyVoiceUnavailable();
}
function stopSpeak(){
  cloudGeneration++;
  speakSeq++; /* 使所有已排程的 setTimeout 朗读失效 */
  cloudQueue = [];
  cloudPlaying = false;
  cloudAudio.pause();
  cloudAudio.removeAttribute('src');
  cloudAudio.load();
  if('speechSynthesis' in window) speechSynthesis.cancel();
}

/* ================= 录音与发音评估 ================= */
let mediaRecorder = null, chunks = [], recordedBlob = null, recording = false, recordedUrl = null;
let audioCtx = null, analyser = null, vuRaf = 0;
function vuLoop(){
  if(!analyser || !recording){ return; }
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for(let i = 0; i < data.length; i++){ const v = (data[i] - 128) / 128; sum += v * v; }
  const rms = Math.sqrt(sum / data.length);
  const bar = document.getElementById('vuBar');
  if(bar) bar.style.width = Math.min(100, Math.round(rms * 420)) + '%';
  vuRaf = requestAnimationFrame(vuLoop);
}
async function initRecorder(){
  if(mediaRecorder) return true;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      recordedBlob = new Blob(chunks, {type: chunks[0]?.type || 'audio/webm'});
      chunks = [];
      if(recordedUrl) URL.revokeObjectURL(recordedUrl);
      recordedUrl = URL.createObjectURL(recordedBlob);
      if(audioEl){ audioEl.src = recordedUrl; }
      const pb = $('#ptPlayback');
      if(pb) pb.disabled = false;
      /* 自动评估 */
      if(practiceTarget){
        try{
          const ana = await analyzeBlob(recordedBlob);
          const res = evalRecord(practiceTarget, ana);
          renderFeedback(res, practiceTarget);
          $('#practiceStatus').textContent = '✅ 练习反馈已生成：' + practiceTarget.text;
        }catch(e){
          toast('音频分析失败，请重试');
        }
      }
    };
    return true;
  }catch(e){
    toast('无法访问麦克风，请检查浏览器权限');
    return false;
  }
}
function startRecord(){
  if(recording) return;
  initRecorder().then(ok => {
    if(!ok) return;
    recording = true;
    chunks = [];
    mediaRecorder.start();
    const btn = $('#ptRecord');
    if(btn){ btn.textContent = '⏹ 停止录音'; btn.classList.add('recording'); btn.setAttribute('aria-pressed','true'); btn.setAttribute('aria-label','正在录音，点击停止'); }
    $('#practiceStatus').textContent = '🔴 录音中，请跟着念…';
    if(vuRaf) cancelAnimationFrame(vuRaf);
    vuRaf = requestAnimationFrame(vuLoop);
  });
}
function stopRecord(){
  if(!recording) return;
  recording = false;
  mediaRecorder.stop();
  if(vuRaf){ cancelAnimationFrame(vuRaf); vuRaf = 0; }
  const bar = document.getElementById('vuBar'); if(bar) bar.style.width = '0%';
  const btn = $('#ptRecord');
  if(btn){ btn.textContent = '● 重新录音'; btn.classList.remove('recording'); btn.setAttribute('aria-pressed','false'); btn.setAttribute('aria-label','重新录音'); }
}
/* 音频分析：时长 + 响度 */
async function analyzeBlob(blob){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const data = buf.getChannelData(0);
  let sum = 0;
  for(let i=0;i<data.length;i+=4) sum += data[i]*data[i];
  const rms = Math.sqrt(sum / Math.max(1, Math.ceil(data.length/4)));
  ctx.close();
  return {duration: buf.duration, rms};
}
/* 练习反馈：只比较时长与响度，声调由用户自查；不判断发音准确性。 */
let practiceTarget = null; // {text, jp, tonenum}
function evalRecord(target, analysis){
  const hanLen = cleanForSpeech(target.text).length || 1;
  const expected = Math.max(0.6, hanLen * 0.34 + 0.35);
  const ratio = analysis.duration / expected;
  let durScore;
  if(ratio >= 0.75 && ratio <= 1.35) durScore = 100 - Math.abs(ratio-1)*70;
  else if(ratio >= 0.45 && ratio <= 1.8) durScore = 62 - Math.abs(ratio-1)*25;
  else durScore = 40;
  durScore = Math.max(30, Math.min(100, Math.round(durScore)));

  let loudScore = Math.round(Math.min(100, analysis.rms / 0.05 * 100));
  loudScore = Math.max(20, loudScore);

  return {durScore, loudScore, expected};
}
function finalScore(res, toneOK){
  const t = toneOK === true ? 100 : toneOK === false ? 40 : 75;
  return Math.round(res.durScore*0.5 + res.loudScore*0.3 + t*0.2);
}
function renderFeedback(res, target, container){
  const fb = container || $('#ptFeedback');
  const openModal = !!container;
  let toneSel = null; /* true=准 false=不准 */
  const draw = () => {
    const final = finalScore(res, toneSel);
    const cls = final>=80?'good':final>=60?'mid':'low';
    const tips = [];
    if(res.durScore < 75) tips.push('时长偏差较大：标准示范约 ' + res.expected.toFixed(1) + ' 秒，注意节奏');
    if(res.loudScore < 70) tips.push('音量偏小：读大声一点，放开来练');
    if(toneSel === false) tips.push('自查声调不准：重点对比' + (target.tonenum ? '第 ' + target.tonenum + ' 声' : '声调') + '的升降起伏，多听标准音');
    if(!tips.length) tips.push('时长、音量都不错！继续对比声调细节，保持练习节奏');
    fb.innerHTML = `
      <div class="fb-box">
        <div class="fb-score ${cls}">${final}<small style="font-size:12px;display:block">节奏参考</small></div>
        <div class="fb-detail">
          <div class="fb-meter"><i style="width:${final}%;background:${final>=80?'var(--green)':final>=60?'var(--gold)':'var(--red)'}"></i></div>
          <div class="fb-row">
            <div class="fb-item">⏱ 时长 <b>${res.durScore}</b></div>
            <div class="fb-item">🔊 音量 <b>${res.loudScore}</b></div>
            <div class="fb-item">🎚 声调自查 <b>${toneSel===true?'✓ 准':toneSel===false?'✗ 不准':'待自查'}</b></div>
          </div>
        </div>
        <div style="width:100%">
          <div style="font-size:13px;font-weight:700;margin-bottom:7px">🎧 我的录音 vs 标准音</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost sm" id="fbPlay">▶ 播放我的录音</button>
            <button type="button" class="btn btn-ghost sm" id="fbDemo">🔊 再听标准音</button>
          </div>
          <div style="margin-top:12px;font-size:12.5px;color:var(--ink-2)">听对比后自查声调：</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button type="button" class="btn btn-soft sm ${toneSel===true?'chip-red':''}" id="fbToneOk">✓ 我读啱咗</button>
            <button type="button" class="btn btn-ghost sm ${toneSel===false?'chip-red':''}" id="fbToneBad">✗ 声调唔啱</button>
          </div>
        </div>
        <div style="width:100%">💡 ${esc(tips.join('；'))}</div>
        <div class="feedback-boundary">此结果只反映录音时长、音量与自查反馈，不识别粤语发音是否准确。</div>
      </div>`;
    $('#fbPlay').onclick = () => { if(audioEl && recordedUrl) audioEl.play(); };
    $('#fbDemo').onclick = () => speak(target.text);
    const okBtn = $('#fbToneOk'), badBtn = $('#fbToneBad');
    if(toneSel === true){ okBtn.style.background='var(--red)'; okBtn.style.color='#fff'; }
    else if(toneSel === false){ badBtn.style.background='var(--red)'; badBtn.style.color='#fff'; }
    $('#fbToneOk').onclick = () => { toneSel = true; draw(); };
    $('#fbToneBad').onclick = () => { toneSel = false; draw(); };
  };
  draw();
  logPractice('跟读', target.text, finalScore(res, null));
}

/* ================= 路由 ================= */
const ROUTES = {home:'首页', phonetics:'语音学习', vocab:'场景词汇', dialogues:'对话实战', sing:'学唱粤语歌', grammar:'语法专栏', culture:'文化趣知', profile:'学习档案'};
let currentRoute = 'home';
function routeFromLocation(){
  const route = location.hash.replace(/^#\/?/, '');
  return ROUTES[route] ? route : 'home';
}
function navigate(route, options={}){
  if(!ROUTES[route]) route = 'home';
  const hash = '#/' + route;
  if(!options.fromHistory && location.hash !== hash){
    if(options.replace) history.replaceState({route}, '', hash);
    else history.pushState({route}, '', hash);
  }
  currentRoute = route;
  document.title = route === 'home' ? '粤学堂 · 学粤语' : `${ROUTES[route]} · 粵學堂`;
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = $('#page-' + route);
  if(page) page.classList.add('active');
  $$('.nav-item').forEach(n => { const on = n.dataset.nav === route; n.classList.toggle('active', on); if(on) n.setAttribute('aria-current','page'); else n.removeAttribute('aria-current'); });
  $$('.m-nav-item').forEach(n => { const on = n.dataset.nav === route; n.classList.toggle('active', on); if(on) n.setAttribute('aria-current','page'); else n.removeAttribute('aria-current'); });
  const more = $('#mMore');
  if(more) more.classList.toggle('active', ['sing','grammar','culture'].includes(route));
  window.scrollTo({top:0});
  if(route === 'home') renderHome();
  if(route === 'phonetics') renderPhonetics();
  if(route === 'vocab') renderVocab();
  if(route === 'dialogues') renderDialogues();
  if(route === 'sing') renderSing();
  if(route === 'grammar') renderGrammar();
  if(route === 'culture') renderCulture();
  if(route === 'profile') renderProfile();
  // 关闭子视图
  if(route !== 'dialogues'){ $('#dlgDetail').classList.add('hidden'); $('#dlgCards').classList.remove('hidden'); }
  if(route !== 'sing'){ $('#singStage').classList.add('hidden'); $('#songCards').classList.remove('hidden'); }
  if(route !== 'grammar'){ $('#grammarArticle').classList.add('hidden'); }
}
function logActivity(icon, title, sub, route){
  const p = getProgress();
  p.lastStudyDate = todayKey();
  p.activities = p.activities || [];
  p.activities.unshift({icon, title, sub, route, time:Date.now()});
  p.activities = p.activities.slice(0,6);
  saveProgress(p);
}

/* ================= 首页 ================= */
function renderHome(){
  const totalWords = DATA.vocabCategories.reduce((n,c)=>n+c.words.length,0);
  $('#statWords').textContent = totalWords;
  $('#statDialogues').textContent = DATA.dialogues.length;
  $('#statArticles').textContent = DATA.grammar.length;
  $('#statCulture').textContent = Object.values(DATA.culture).reduce((n,a)=>n+a.length,0);

  const p = getProgress();
  {
    const today = todayKey();
    if(p.goalDate !== today){ p.goalDate = today; p.goalToday = 0; p.goalWords = []; saveProgress(p); }
    const pct = p.goalCount ? Math.min(100, Math.round(p.goalToday / p.goalCount * 100)) : 0;
    $('#goalNum').textContent = p.goalToday;
    $('#goalChip').textContent = p.goalCount ? `每日 ${p.goalCount} 词` : '未设定';
    $('#goalLine').textContent = p.goalToday >= p.goalCount && p.goalCount ? '🎉 今日目标达成，犀利！' : `今日已听 ${p.goalToday} / ${p.goalCount} 个词汇`;
    const ring = $('#goalRing');
    ring.style.strokeDashoffset = 326.7 * (1 - pct/100);
    /* 连续打卡 */
    const days = last7();
    $('#streakWeek').innerHTML = days.map(d => {
      const on = !!p.checkins[d.key];
      return `<div class="streak-day ${on?'on':''} ${d.isToday?'today':''}"><span class="sd-ico">${on?'✅':d.isToday?'📌':'·'}</span>${d.label}</div>`;
    }).join('');
    $('#streakChip').textContent = p.streak + ' 天';
    /* 继续学习 */
    const acts = (p.activities||[]).slice(0,3);
    const dueN = reviewDueCount();
    const reviewEntry = dueN > 0 ? `<div class="cont-review" id="reviewEntry"><span>📅</span><b>待复习 ${dueN} 个词</b><span style="margin-left:auto">去复习 →</span></div>` : '';
    const re = $('#reviewEntry');
    if(re) re.onclick = () => { vocabReviewOnly = true; navigate('vocab'); };
    $('#continueList').innerHTML = reviewEntry + (acts.length ? acts.map(a => `
      <button type="button" class="cont-item" data-nav="${a.route}">
        <span class="ci-ico">${esc(a.icon)}</span>
        <div><div class="ci-title">${esc(a.title)}</div><div class="ci-sub">${esc(a.sub)}</div></div>
        <span class="ci-arrow">→</span>
      </button>`).join('') : `<div class="history-empty" style="border:none;padding:14px">还没有学习记录，先从发音或场景词汇开始吧～</div>`);
    $$('#continueList .cont-item').forEach(el => el.onclick = () => navigate(el.dataset.nav));
  }
  /* 模块入口 */
  const mods = [
    {ico:'🎙️', t:'语音学习', d:'粤拼声母 · 韵母 · 声调，录音对比发音', nav:'phonetics'},
    {ico:'📖', t:'场景词汇', d:`11 大场景 ${totalWords} 词，点卡即读 + 听力小测`, nav:'vocab'},
    {ico:'💬', t:'对话实战', d:'茶楼点餐、街市买菜，跟读 + 角色扮演', nav:'dialogues'},
    {ico:'🎵', t:'学唱粤语歌', d:'11 首经典金曲全曲歌词，逐句跟唱练咬字', nav:'sing'},
    {ico:'🧩', t:'语法专栏', d:'量词 · 语气词 · 体貌助词，十讲吃透', nav:'grammar'},
    {ico:'🏮', t:'文化趣知', d:'俗语·歇后语·节庆·小食·TVB金句', nav:'culture'},
    {ico:'📊', t:'学习档案', d:'目标 · 打卡 · 收藏 · 练习历史 · 本机备份', nav:'profile'},
  ];
  $('#moduleGrid').innerHTML = mods.map(m => `
    <button type="button" class="mod-card" data-nav="${m.nav}">
      <div class="mc-ico">${m.ico}</div>
      <h3>${m.t}</h3><p>${m.d}</p><span class="mc-go">进入 →</span>
    </button>`).join('');
  $$('#moduleGrid .mod-card').forEach(el => el.onclick = () => navigate(el.dataset.nav));
}
function last7(){
  const out = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    out.push({key, label:['日','一','二','三','四','五','六'][d.getDay()], isToday:i===0});
  }
  return out;
}
function checkin(){
  const p = getProgress();
  const today = todayKey();
  if(p.lastStudyDate !== today){ toast('先完成一次听读或练习，再来打卡吧'); return; }
  if(p.checkins[today]){ toast('今日已经打过卡啦 ✅'); return; }
  p.checkins[today] = true;
  p.lastCheckin = today;
  /* 计算连续天数 */
  let streak = 1, d = new Date();
  for(let i=1;i<730;i++){
    d.setDate(d.getDate()-1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(p.checkins[k]) streak++;
    else break;
  }
  p.streak = streak;
  saveProgress(p);
  toast('打卡成功！连续 ' + streak + ' 天 🔥');
  renderHome();
}

/* ================= 语音系统 ================= */
let phTab = 'initials', phSel = null;

/* ================= 声调听辨训练 ================= */
let td = {on:false, i:0, correct:0, streak:0, best:0, total:10, answer:null, opts:[]};
function renderToneDrill(){
  const body = $('#tdBody'), stat = $('#tdStat');
  if(!body) return;
  if(!td.on){
    body.innerHTML = '<p class="tip" style="margin:0 0 12px">粤语最难的一关——听发音猜声调。播放一个音节，从 4 个调值里选出正确的一个。声调选对了，粤语就学会了一半。</p>' +
      '<button type="button" class="btn btn-primary" id="tdStart">🎯 开始训练（10 题）</button>';
    const st = $('#tdStart'); if(st) st.onclick = () => { td = {on:true, i:0, correct:0, streak:0, best:0, total:10, answer:null, opts:[]}; tdNext(); };
    if(stat) stat.textContent = '未开始';
    return;
  }
  if(td.i >= td.total){
    const pct = Math.round(td.correct / td.total * 100);
    body.innerHTML = '<div class="td-done"><b>' + (pct >= 80 ? '🏆 犀利！' : pct >= 60 ? '👍 唔错！' : '💪 继续努力！') + '</b>' +
      '<p>答对 ' + td.correct + ' / ' + td.total + ' 题 · 最高连击 ' + td.best + '</p>' +
      '<button type="button" class="btn btn-primary" id="tdRestart">🔄 再来一轮</button></div>';
    const rt = $('#tdRestart'); if(rt) rt.onclick = () => { td = {on:true, i:0, correct:0, streak:0, best:0, total:10, answer:null, opts:[]}; tdNext(); };
    if(stat) stat.textContent = '完成 ' + pct + '%';
    return;
  }
  const all = DATA.tones;
  const ans = all[Math.floor(Math.random() * all.length)];
  const others = all.filter(t => t.num !== ans.num).sort(() => Math.random() - 0.5).slice(0, 3);
  const opts = [...others, ans].sort(() => Math.random() - 0.5);
  td.answer = ans; td.opts = opts;
  body.innerHTML = '<div class="td-q">第 ' + (td.i + 1) + ' / ' + td.total + ' 题</div>' +
    '<button type="button" class="btn btn-primary td-play" id="tdPlay">🔊 听发音</button>' +
    '<div class="td-opts">' + opts.map(o => '<button type="button" class="td-opt" data-num="' + o.num + '"><b>' + o.num + '</b><span>' + o.name + ' ' + o.contour + '</span></button>').join('') + '</div>' +
    '<div class="td-fb" id="tdFb"></div>';
  const pl = $('#tdPlay'); if(pl) pl.onclick = () => speak(ans.ex, {rate:0.65});
  $$('#tdBody .td-opt').forEach(b => b.onclick = () => tdPick(b));
  setTimeout(() => speak(ans.ex, {rate:0.65}), 350);
  if(stat) stat.textContent = '已答 ' + td.i + '/' + td.total + ' · 对 ' + td.correct + (td.streak > 1 ? ' · 🔥' + td.streak : '');
}
function tdPick(btn){
  const ok = btn.dataset.num === td.answer.num;
  const fb = $('#tdFb');
  const label = td.answer.num + ' ' + td.answer.name + ' ' + td.answer.contour + '（' + td.answer.ex + '）';
  if(ok){ td.correct++; td.streak++; td.best = Math.max(td.best, td.streak); if(fb) fb.innerHTML = '<span class="td-ok">✅ 啱！' + label + '</span>'; }
  else { td.streak = 0; if(fb) fb.innerHTML = '<span class="td-no">❌ 唔啱！正确答案是 ' + label + '</span>'; }
  $$('#tdBody .td-opt').forEach(x => x.disabled = true);
  td.i++;
  setTimeout(() => { td.i >= td.total ? renderToneDrill() : tdNext(); }, 1100);
}
function tdNext(){ renderToneDrill(); }

function renderPhonetics(){
  /* 更新计数 */
  $$('.ph-tab span')[0].textContent = DATA.initials.length;
  $$('.ph-tab span')[1].textContent = DATA.finals.length;
  $$('.ph-tab span')[2].textContent = DATA.tones.length;
  renderPhGrid();
  renderToneDrill();
}
function renderPhGrid(){
  const q = ($('#phSearch').value || '').trim().toLowerCase();
  let items;
  if(phTab === 'initials') items = DATA.initials.map(i => ({sym:i.sym, sub:jq(i.exjp), ex:i.ex, exjp:i.exjp}));
  else if(phTab === 'finals') items = DATA.finals.map(f => ({sym:f.sym, sub:jq(f.exjp), ex:f.ex, exjp:f.exjp, grp:f.grp}));
  else items = DATA.tones.map(t => ({sym:t.num, sub:t.contour, ex:t.ex, exjp:t.exjp, tone:t}));
  if(q) items = items.filter(i => (i.sym+qString(i)).toLowerCase().includes(q));
  $('#phGrid').innerHTML = items.map((it,idx) => `
    <button type="button" class="ph-card ${phSel && phSel.sym===it.sym && phSel.tab===phTab?'sel':''}" data-idx="${idx}" style="animation:pageIn .4s ${idx*0.015}s backwards" aria-label="播放 ${esc(it.sym)}，例字 ${esc(it.ex)}">
      <span class="pc-vol">🔊</span>
      <div class="pc-sym">${it.sym}</div>
      <div class="pc-jp">${it.sub}</div>
      <div class="pc-ex">${it.ex}</div>
    </button>`).join('') || '<div class="history-empty" style="grid-column:1/-1">没有匹配的音标</div>';
  $$('#phGrid .ph-card').forEach(card => {
    card.onclick = () => {
      const it = items[+card.dataset.idx];
      phSel = {tab:phTab, sym:it.sym, item:it};
      renderPhGrid();
      speakPhItem(it);
      setPracticeTarget(it);
    };
  });
}
function qString(it){ return (it.ex||'') + (it.sub||''); }
function speakPhItem(it, opts={}){
  const ex = String(it.ex || '').split(/[\/\s、]+/)[0] || it.sym;
  speak(ex, {...opts});
}
function setPracticeTarget(it){
  const ex = String(it.ex || '').split(/[\/\s、]+/)[0] || it.sym;
  const toneNum = it.tone ? it.tone.num : null;
  practiceTarget = {text: ex, jp: it.sub || it.sym, tonenum: toneNum};
  $('#practiceTarget').innerHTML = `
    <div class="pt-symbol">${ex}</div>
    <div class="pt-word">${it.sym} · ${it.sub}</div>`;
  $('#practiceStatus').textContent = '就绪：跟读「' + ex + '」';
  $('#ptFeedback').innerHTML = '';
  if(audioEl) audioEl.pause();
}

/* ================= 词汇 ================= */
let vocabCat = DATA.vocabCategories[0].id, vocabFavOnly = false, vocabReviewOnly = false;
function renderVocab(){
  updateReviewBtn();
  const pills = DATA.vocabCategories.map(c => `
    <button type="button" class="cat-pill ${c.id===vocabCat?'active':''}" data-cat="${c.id}" aria-pressed="${c.id===vocabCat?'true':'false'}">${c.icon} ${c.name} <small style="opacity:.7">${c.words.length}</small></button>`).join('');
  $('#catPills').innerHTML = pills;
  $$('#catPills .cat-pill').forEach(b => b.onclick = () => { vocabCat = b.dataset.cat; $$('#catPills .cat-pill').forEach(x=>x.setAttribute('aria-pressed', x.dataset.cat===vocabCat?'true':'false')); renderVocabGrid(); renderVocab(); });
  renderVocabGrid();
}
function renderVocabGrid(){
  const cat = DATA.vocabCategories.find(c => c.id === vocabCat);
  const q = ($('#vocabSearch').value || '').trim().toLowerCase();
  const p = getProgress();
  let words = cat.words;
  if(q) words = words.filter(w => (w.han + ' ' + w.jp + ' ' + w.mand + ' ' + w.ex).toLowerCase().includes(q));
  if(vocabFavOnly) words = words.filter(w => p && p.favorites.includes(cat.id + ':' + w.han));
  if(vocabReviewOnly){
    const due = reviewDueKeys().map(reviewWord).filter(Boolean);
    words = due.map(x => ({...x.w, _cat:x.cat.id}));
    if(!words.length){
      $('#vocabGrid').innerHTML = '<div class="review-empty">🎉 待复习的词都清完啦！去学几个新词，明天再来。</div>';
      updateReviewBtn();
      return;
    }
  }
  const reviewReveal = window.__reviewReveal || (window.__reviewReveal = {});
  $('#vocabGrid').innerHTML = words.map((w,idx) => {
    const favKey = (w._cat || cat.id) + ':' + w.han;
    if(vocabReviewOnly){
      const revealed = !!reviewReveal[favKey];
      return `<div class="word-card review-card" data-key="${favKey}">
      <div class="wc-top">
        <div>
          <div class="wc-han ${revealed?'':'quizzed'}">${revealed ? w.han : '❓'}</div>
          <div class="wc-jp">${revealed ? w.jp : ''}</div>
        </div>
        <span class="chip chip-gold" style="font-size:10px">复习</span>
      </div>
      <div class="wc-mand">${revealed ? esc(w.mand) : '点击揭晓 · 回忆一下这个词'}</div>
      <div class="wc-ex" style="${revealed?'':'display:none'}">
        ${esc(w.ex)}
        <div class="wx-jp">${w.exjp}</div>
        <div class="wx-mand">${esc(w.exmand)}</div>
      </div>
      <div class="review-actions" style="${revealed?'':'display:none'}">
        <button type="button" class="btn btn-red sm" data-remember="0">❌ 忘了</button>
        <button type="button" class="btn btn-primary sm" data-remember="1">✅ 记得</button>
      </div>
    </div>`;
    }
    const fav = p && p.favorites.includes(favKey);
    return `
    <div class="word-card" style="animation:pageIn .4s ${idx*0.02}s backwards">
      <div class="wc-top">
        <div>
          <div class="wc-han" lang="yue-Hant-HK">${w.han}</div>
          <div class="wc-jp">${w.jp}</div>
        </div>
        <button type="button" class="wc-fav ${fav?'on':''}" title="收藏">${fav?'★':'☆'}</button>
      </div>
      <div class="wc-mand">${esc(w.mand)}</div>
      <div class="wc-ex">
        ${esc(w.ex)}
        <button type="button" class="wc-explay" title="朗读例句">🔊</button>
        <div class="wx-jp">${w.exjp}</div>
        <div class="wx-mand">${esc(w.exmand)}</div>
      </div>
      <div class="wc-bottom"><span class="wc-cat">${cat.icon} ${cat.name}</span></div>
      <button type="button" class="wc-play" title="听发音">▶</button>
    </div>`;
  }).join('') || '<div class="history-empty" style="grid-column:1/-1">没有匹配的词汇</div>';

  if(vocabReviewOnly){
    $$('#vocabGrid .word-card').forEach(card => {
      const key = card.dataset.key;
      card.onclick = () => {
        const rv = window.__reviewReveal;
        if(!rv[key]){ rv[key] = true; renderVocabGrid(); }
      };
      $$('.review-actions button', card).forEach(b => b.onclick = e => {
        e.stopPropagation();
        reviewAnswer(key, b.dataset.remember === '1');
        const rv = window.__reviewReveal; delete rv[key];
        renderVocabGrid();
        toast(b.dataset.remember === '1' ? '记得！' + reviewBoxGap(key) + ' 天后再复习' : '忘了也没关系，明天再复习');
      });
    });
    updateReviewBtn();
    return;
  }
  $$('#vocabGrid .word-card').forEach((card, i) => {
    const w = words[i];
    const playBtn = $('.wc-play', card);
    /* 点击卡片 = 朗读该词 */
    card.onclick = () => {
      speak(w.han);
      markWordLearned(cat.id, w);
    };
    playBtn.onclick = e => {
      e.stopPropagation();
      speak(w.han);
      markWordLearned(cat.id, w);
    };
    const exPlay = $('.wc-explay', card);
    if(exPlay) exPlay.onclick = e => {
      e.stopPropagation();
      speak(w.ex);
    };
    $('.wc-fav', card).onclick = e => {
      e.stopPropagation();
      toggleFav(cat.id, w, card);
    };
  });
}

/* ================= SRS 间隔复习（轻量 SM-2 五盒） ================= */
function reviewDueKeys(){
  const p = getProgress(); if(!p || !p.reviews) return [];
  const today = todayKey();
  return Object.keys(p.reviews).filter(k => p.reviews[k].due <= today);
}
function reviewDueCount(){ return reviewDueKeys().length; }
function reviewWord(key){
  /* key = 'catId:han'，解析回词汇对象 */
  const idx = key.indexOf(':');
  const catId = key.slice(0, idx), han = key.slice(idx + 1);
  const cat = DATA.vocabCategories.find(c => c.id === catId);
  if(!cat) return null;
  const w = cat.words.find(x => x.han === han);
  return w ? {cat, w} : null;
}
function reviewBoxGap(key){
  const p = getProgress(); if(!p || !p.reviews || !p.reviews[key]) return 1;
  const box = p.reviews[key].box || 1;
  return box === 5 ? SRS_MAX_GAP : (SRS_GAPS[box] ?? 1);
}
function updateReviewBtn(){
  const n = reviewDueCount();
  const btn = $('#reviewBtn');
  if(btn) btn.textContent = n > 0 ? '📅 待复习 (' + n + ')' : '📅 待复习';
}
/* SRS 轻量节奏：box1 当天回忆(0) → box2 1天 → box3 3天 → box4 7天 → box5 14天 → 封顶 30 天 */
const SRS_GAPS = [0, 0, 1, 3, 7, 14];
const SRS_MAX_GAP = 30;
function reviewAnswer(key, remembered){
  const p = getProgress(); if(!p) return;
  p.reviews = p.reviews || {};
  const today = todayKey();
  const r = p.reviews[key] || {box:1, due:today};
  if(remembered){
    const prevBox = r.box || 1;
    r.box = Math.min(prevBox + 1, 5);
    const gap = (r.box === 5 && prevBox === 5) ? SRS_MAX_GAP : SRS_GAPS[r.box];
    const due = new Date(); due.setDate(due.getDate() + gap);
    r.due = due.toISOString().slice(0,10);
  } else {
    r.box = 1;
    const due = new Date(); due.setDate(due.getDate() + 1);
    r.due = due.toISOString().slice(0,10);
  }
  r.updatedAt = Date.now(); /* 多设备合并裁决依据 */
  p.reviews[key] = r;
  saveProgress(p);
}

function markWordLearned(catId, w){
  const p = getProgress(); if(!p) return;
  const key = catId + ':' + w.han;
  if(!p.learned.includes(key)) p.learned.push(key);
  p.reviews = p.reviews || {};
  if(!p.reviews[key]) p.reviews[key] = {box:1, due:todayKey(), updatedAt: Date.now()};
  const today = todayKey();
  if(p.goalDate !== today){ p.goalDate = today; p.goalToday = 0; p.goalWords = []; }
  p.goalWords = p.goalWords || [];
  /* 每日目标只统计当天不重复的词汇 */
  if(!p.goalWords.includes(key)){
    p.goalWords.push(key);
    p.goalToday = (p.goalToday||0) + 1;
  }
  saveProgress(p);
}
function toggleFav(catId, w, card){
  const p = getProgress();
  const key = catId + ':' + w.han;
  const i = p.favorites.indexOf(key);
  if(i >= 0){ p.favorites.splice(i,1); $('.wc-fav', card).textContent = '☆'; $('.wc-fav', card).classList.remove('on'); toast('已取消收藏'); }
  else { p.favorites.push(key); $('.wc-fav', card).textContent = '★'; $('.wc-fav', card).classList.add('on'); toast('已收藏生词 ★'); }
  saveProgress(p);
}

/* 听力小测 */
/* 最小对立词集：同音节不同调，练声调听辨 */
const MINIMAL_PAIRS = [
  {group:[{han:'詩',jp:'si1'},{han:'史',jp:'si2'},{han:'試',jp:'si3'},{han:'時',jp:'si4'}], mand:'诗/史/试/时'},
  {group:[{han:'夫',jp:'fu1'},{han:'苦',jp:'fu2'},{han:'富',jp:'fu3'},{han:'婦',jp:'fu5'}], mand:'夫/苦/富/妇'},
  {group:[{han:'衣',jp:'ji1'},{han:'椅',jp:'ji2'},{han:'意',jp:'ji3'}], mand:'衣/椅/意'},
  {group:[{han:'家',jp:'gaa1'},{han:'假',jp:'gaa2'},{han:'嫁',jp:'gaa3'}], mand:'家/假/嫁'},
  {group:[{han:'包',jp:'baau1'},{han:'飽',jp:'baau2'},{han:'豹',jp:'baau3'}], mand:'包/饱/豹'},
  {group:[{han:'色',jp:'sik1'},{han:'錫',jp:'sik3'},{han:'食',jp:'sik6'}], mand:'色/锡/食（入声）'},
];

/* ================= 今日 5 词（学 5 个 → 回忆 → 小测 → 入复习计划） ================= */
let d5 = {words:[], step:0, qIdx:0, score:0, order:[]};
function daily5Start(){
  const p = getProgress(); if(!p) return;
  const learnedSet = new Set(p.learned || []);
  const all = DATA.vocabCategories.flatMap(c => c.words.map(w => ({...w, cat:c.id})));
  const fresh = all.filter(w => !learnedSet.has(w.cat + ':' + w.han));
  const pick = fresh.slice(0, 5);
  while(pick.length < 5 && all.length){
    const w = all[Math.floor(Math.random() * all.length)];
    if(!pick.includes(w)) pick.push(w);
  }
  d5 = {words: pick.slice(0,5), step:0, qIdx:0, score:0, order: pick.map((_,i)=>i)};
  d5Render();
}
function d5Render(){
  const c = d5;
  if(c.step === 0){
    const w = c.words[c.qIdx];
    openModal('<h3>🎯 今日 5 词 <span class="chip chip-gold" style="margin-left:auto">学习 ' + (c.qIdx+1) + ' / ' + c.words.length + '</span></h3>' +
      '<div style="text-align:center;padding:18px 0 6px">' +
        '<div style="font-size:36px;font-weight:900;color:var(--red)">' + esc(w.han) + '</div>' +
        '<div style="color:var(--ink-2);margin-top:6px;font-size:15px">' + w.jp + '</div>' +
        '<div style="color:var(--ink-3);font-size:13px;margin-top:6px">' + esc(w.mand) + '</div>' +
        '<button type="button" class="btn btn-primary sm" id="d5Play" style="margin-top:14px">🔊 听发音</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:12px">' +
        '<button type="button" class="btn btn-primary" id="d5Next">' + (c.qIdx===c.words.length-1 ? '开始回忆 →' : '下一个') + '</button>' +
      '</div>');
    $('#d5Play').onclick = () => speak(w.han);
    $('#d5Next').onclick = () => {
      if(c.qIdx < c.words.length-1){ c.qIdx++; d5Render(); }
      else { c.step=1; c.qIdx=0; c.order = c.words.map((_,i)=>i).sort(()=>Math.random()-0.5); d5Render(); }
    };
  } else if(c.step === 1){
    const w = c.words[c.order[c.qIdx]];
    openModal('<h3>🎯 今日 5 词 <span class="chip chip-gold" style="margin-left:auto">回忆 ' + (c.qIdx+1) + ' / ' + c.words.length + '</span></h3>' +
      '<div style="text-align:center;padding:18px 0 6px">' +
        '<div id="d5RecallHan" style="font-size:24px;font-weight:900;color:var(--ink-3)">❓ 想到这个字怎么写？</div>' +
        '<div style="color:var(--ink-2);margin-top:10px;font-size:15px">' + w.jp + '</div>' +
        '<div style="color:var(--ink-3);font-size:13px;margin-top:6px">' + esc(w.mand) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
        '<button type="button" class="btn btn-ghost" id="d5Reveal">👀 显示汉字</button>' +
        '<button type="button" class="btn btn-primary" id="d5Next2">' + (c.qIdx===c.words.length-1 ? '开始小测 →' : '下一个') + '</button>' +
      '</div>');
    $('#d5Reveal').onclick = () => { const el = $('#d5RecallHan'); el.textContent = w.han; el.style.color = 'var(--red)'; };
    $('#d5Next2').onclick = () => {
      if(c.qIdx < c.words.length-1){ c.qIdx++; d5Render(); }
      else { c.step=2; c.qIdx=0; c.order = c.words.map((_,i)=>i).sort(()=>Math.random()-0.5); d5Render(); }
    };
  } else if(c.step === 2){
    const w = c.words[c.order[c.qIdx]];
    const pool = DATA.vocabCategories.flatMap(x => x.words);
    const opts = shuffleOpts(w, pool);
    openModal('<h3>🎯 今日 5 词 <span class="chip chip-gold" style="margin-left:auto">小测 ' + (c.qIdx+1) + ' / ' + c.words.length + '</span></h3>' +
      '<div style="text-align:center;margin:8px 0 12px;font-weight:700;color:var(--ink-2)">🔊 听发音，选正确释义</div>' +
      '<div style="text-align:center;margin-bottom:14px;font-size:20px;color:var(--red);font-weight:900">' + esc(w.han) + '</div>' +
      opts.map((o,i) => '<button type="button" class="quiz-opt" data-opt="' + i + '">' + (i+1) + '. ' + esc(o.mand) + '</button>').join('') +
      '<div class="quiz-progress">答对 ' + c.score + ' / ' + c.qIdx + ' 题</div>');
    speak(w.han);
    $$('#modalRoot .quiz-opt').forEach(b => b.onclick = () => {
      const picked = opts[+b.dataset.opt];
      $$('#modalRoot .quiz-opt').forEach(x => { x.disabled = true; if(x === b) x.classList.add(picked.mand===w.mand ? 'correct' : 'wrong'); });
      if(picked.mand === w.mand) c.score++;
      toast(picked.mand===w.mand ? '答啱咗 👍' : '正确答案：' + w.mand);
      setTimeout(() => { if(c.qIdx < c.words.length-1){ c.qIdx++; d5Render(); } else d5Finish(); }, 1300);
    });
  }
}
function d5Finish(){
  const c = d5, p = getProgress();
  c.words.forEach(w => markWordLearned(w.cat, w));
  openModal('<h3>🎯 今日 5 词完成 🎉</h3>' +
    '<div style="text-align:center;padding:16px 0">' +
      '<div style="font-size:44px">' + (c.score>=4?'🏆' : c.score>=2?'💪':'📚') + '</div>' +
      '<div style="font-size:24px;font-weight:900;margin-top:8px;color:var(--red)">' + c.score + ' / ' + c.words.length + '</div>' +
      '<p style="color:var(--ink-3);margin-top:8px">' + (c.score>=4?'犀利！今日目标 +5 词' : c.score>=2?'唔错！明早再复习一次':'慢慢嚟，多听几次～') + '</p>' +
      '<p style="color:var(--ink-3);font-size:12.5px;margin-top:4px">已加入复习计划，明天开始按遗忘曲线提醒你</p>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" id="d5Done">完成</button></div>');
  $('#d5Done').onclick = () => { closeModal(); renderVocab(); };
}
let quizVoiceWarned = false;
function openQuiz(){
  /* 无可用语音时先引导（听力小测依赖发音），检测完成且全部不可用时弹一次 */
  if(!cloudTTS.ready && !localYueVoice && cloudTTS.checked && !quizVoiceWarned){
    quizVoiceWarned = true;
    openModal('<h3>🔇 未检测到粤语语音</h3>' +
      '<p style="color:var(--ink-2);line-height:1.7;margin:10px 0 4px">听力小测需要播放粤语发音。当前设备没有粤语语音包，云端粤语也未连接（地址：<code>' + esc(CLOUD_TTS_URL) + '</code>）。</p>' +
      '<p style="color:var(--ink-3);font-size:12.5px;line-height:1.7">安卓可安装「粤语（香港）」语音包；或在「🔧 语音诊断」中配置云端 TTS 地址后点重新检测。</p>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">' +
        '<button type="button" class="btn btn-ghost" id="qvSkip">仍然进入</button>' +
        '<button type="button" class="btn btn-primary" id="qvDiag">🔧 语音诊断</button>' +
      '</div>');
    $('#qvDiag').onclick = () => { closeModal(); navigate('phonetics'); requestAnimationFrame(() => { const sm = document.querySelector('.voice-diag summary'); if(sm){ sm.closest('details').open = true; sm.scrollIntoView({behavior:'smooth'}); } }); };
    $('#qvSkip').onclick = () => { closeModal(); doOpenQuiz(); };
    return;
  }
  doOpenQuiz();
}
function doOpenQuiz(){
  const p = getProgress();
  const all = DATA.vocabCategories.flatMap(c => c.words.map(w => ({...w, cat:c.name})));
  /* 混合题型：4 听词选义 + 3 最小对立 + 3 声调听辨 */
  const qs = [];
  const meaningPool = [...all].sort(() => Math.random() - 0.5);
  for(let i = 0; i < 4 && meaningPool.length; i++){
    const w = meaningPool.pop();
    qs.push({type:'meaning', opts: shuffleOpts(w, all), answer: w, label: w.mand + '（' + w.han + '）', play: () => speak(w.han)});
  }
  const pairs = [...MINIMAL_PAIRS].sort(() => Math.random() - 0.5);
  for(let i = 0; i < 3 && pairs.length; i++){
    const g = pairs.pop();
    const target = g.group[Math.floor(Math.random() * g.group.length)];
    qs.push({type:'pair', opts: [...g.group].sort(() => Math.random() - 0.5), answer: target, label: target.han + ' ' + target.jp + '（' + g.mand + '）', play: () => speak(target.han, {rate:0.7})});
  }
  const tones = [...DATA.tones].sort(() => Math.random() - 0.5);
  for(let i = 0; i < 3 && tones.length; i++){
    const t = tones.pop();
    const others = DATA.tones.filter(x => x.num !== t.num).sort(() => Math.random() - 0.5).slice(0, 3);
    qs.push({type:'tone', opts: [...others, t].sort(() => Math.random() - 0.5), answer: t, label: t.num + ' ' + t.name + ' ' + t.contour + '（' + t.ex + '）', play: () => speak(t.ex, {rate:0.7})});
  }
  const pool = qs.sort(() => Math.random() - 0.5);
  let qi = 0, score = 0;
  const isRight = (q, picked) => q.type==='meaning' ? picked.mand===q.answer.mand : q.type==='pair' ? picked.han===q.answer.han : picked.num===q.answer.num;
  const isAnswerOpt = (q, picked) => q.type==='meaning' ? picked.mand===q.answer.mand : q.type==='pair' ? picked.han===q.answer.han : picked.num===q.answer.num;
  const renderQ = () => {
    if(qi >= pool.length) return renderEnd();
    const q = pool[qi];
    const typeTag = q.type==='meaning' ? '听词选义' : q.type==='pair' ? '最小对立' : '声调听辨';
    const hint = q.type==='meaning' ? '（猜猜是哪个意思）' : q.type==='pair' ? '（听清声调，选出听到的字）' : '（听发音，猜是哪个调）';
    const optsHtml = q.type==='meaning'
      ? q.opts.map((o,i) => '<button type="button" class="quiz-opt" data-opt="' + i + '">' + (i+1) + '. ' + esc(o.mand) + '</button>').join('')
      : q.type==='pair'
        ? q.opts.map((o,i) => '<button type="button" class="quiz-opt" data-opt="' + i + '"><b style="font-size:24px">' + o.han + '</b><span style="color:var(--ink-3);font-size:12px">' + o.jp + '</span></button>').join('')
        : q.opts.map((o,i) => '<button type="button" class="quiz-opt" data-opt="' + i + '"><b>' + o.num + '</b> · ' + o.name + ' ' + o.contour + '</button>').join('');
    openModal(
      '<h3>📝 听力小测 <span class="chip chip-gold" style="margin-left:auto">' + typeTag + '</span><span class="chip" style="margin-left:6px">' + (qi+1) + ' / ' + pool.length + '</span><button type="button" id="qCloseX" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--ink-3);padding:2px 6px" title="关闭">✕</button></h3>' +
      '<div class="quiz-q">🔊 听发音</div>' +
      '<div class="quiz-jp">' + hint + '</div>' +
      '<div style="text-align:center;margin:6px 0 18px">' +
        '<button type="button" class="btn btn-primary" id="qPlay">🔊 播放</button>' +
        '<button type="button" class="btn btn-ghost" id="qReplay">↻ 重听</button>' +
      '</div>' +
      optsHtml +
      '<div class="quiz-progress">答对 ' + score + ' 题 · 已过 ' + qi + ' 题</div>');
    $('#qCloseX').onclick = closeModal;
    $('#qPlay').onclick = q.play;
    $('#qReplay').onclick = q.play;
    q.play();
    $$('#modalRoot .quiz-opt').forEach(b => b.onclick = () => {
      const picked = q.opts[+b.dataset.opt];
      const correct = isRight(q, picked);
      $$('#modalRoot .quiz-opt').forEach(x => {
        x.disabled = true;
        const px = q.opts[+x.dataset.opt];
        if(isAnswerOpt(q, px)) x.classList.add('correct');
        else x.classList.add('wrong');
      });
      if(correct){ score++; toast('答啱咗！犀利 👍'); }
      else toast('正确答案：' + q.label);
      setTimeout(() => { qi++; renderQ(); }, 1400);
    });
  };
  const renderEnd = () => {
    const pct = Math.round(score/pool.length*100);
    logPractice('听力小测', '混合题型', pct);
    openModal(
      '<div class="quiz-end">' +
        '<div style="font-size:40px">' + (pct>=80?'🏆':pct>=60?'💪':'📚') + '</div>' +
        '<div class="qe-score">' + score + ' / ' + pool.length + '</div>' +
        '<p class="qe-txt">' + (pct>=80?'好犀利！粤语听力达人！':pct>=60?'唔错！继续加油！':'再听多几次，慢慢来～') + '</p>' +
        '<button type="button" class="btn btn-primary" id="qAgain">🔁 再来一轮</button>' +
        '<button type="button" class="btn btn-ghost" id="qClose" style="margin-left:8px">关闭</button>' +
      '</div>', {label:'听力小测结果'});
    $('#qAgain').onclick = () => openQuiz();
    $('#qClose').onclick = closeModal;
  };
  renderQ();
}
function shuffleOpts(w, all){
  const wrong = all.filter(x => x.mand !== w.mand).sort(() => Math.random() - 0.5).slice(0,3).map(x => ({mand: x.mand}));
  return [{mand:w.mand}, ...wrong].sort(() => Math.random() - 0.5);
}
function vocabCatName(){ const c = DATA.vocabCategories.find(c => c.id===vocabCat); return c ? c.name : '词汇'; }

/* ================= 对话 ================= */
let curDlg = null, dlgRole = null, dlgMode = 'follow', dlgRevealed = false;
function renderDialogues(){
  $('#dlgDetail').classList.add('hidden');
  $('#dlgCards').classList.remove('hidden');
  const p = getProgress();
  $('#dlgCards').innerHTML = DATA.dialogues.map(d => {
    const done = p && p.dialogues.includes(d.id);
    return `
    <button type="button" class="dlg-card" data-id="${d.id}" style="animation:pageIn .4s ${DATA.dialogues.indexOf(d)*0.05}s backwards">
      <span class="dc-emoji">${d.emoji}</span>
      <h3>${d.title}</h3>
      <p>${esc(d.desc)}</p>
      <div class="dc-lines">共 ${d.lines.length} 句台词</div>
      <div class="dc-tags">
        <span class="dc-tag">${d.level}</span>
        ${d.tags.map(t=>`<span class="dc-tag">${t}</span>`).join('')}
      </div>
      ${done ? '<div class="dc-progress" style="width:100%"></div>' : ''}
    </button>`;
  }).join('');
  $$('#dlgCards .dlg-card').forEach(c => c.onclick = () => openDlg(c.dataset.id));
}
function openDlg(id){
  curDlg = DATA.dialogues.find(d => d.id === id);
  dlgRole = null; dlgMode = 'follow'; dlgRevealed = false;
  $('#dlgCards').classList.add('hidden');
  $('#dlgDetail').classList.remove('hidden');
  logActivity(curDlg.emoji, curDlg.title, '进入对话场景', 'dialogues');
  renderDlg();
}
function renderDlg(){
  if(!curDlg) return;
  const d = curDlg;
  const roles = [...new Set(d.lines.map(l => l.speaker))];
  $('#dlgStage').innerHTML = `
    <div class="dlg-title"><span class="dt-emoji">${d.emoji}</span>
      <div><h3>${d.title}</h3><div class="page-desc" style="margin-top:2px">${esc(d.desc)}</div></div>
    </div>
    <div class="dlg-mode-bar">
      <button type="button" class="ph-tab ${dlgMode==='follow'?'active':''}" id="modeFollow">📖 逐句跟读</button>
      <button type="button" class="ph-tab ${dlgMode==='role'?'active':''}" id="modeRole">🎭 角色扮演</button>
      ${dlgMode==='follow' ? '<button type="button" class="btn btn-ghost sm" id="dlgPlayAll">▶ 整段朗读</button>' : ''}
      ${dlgMode==='role' ? `
        <span style="font-size:13px;color:var(--ink-2);margin-left:6px">扮演：</span>
        ${roles.map(r => `<button type="button" class="ph-tab ${dlgRole===r?'active':''}" data-role="${esc(r)}">${esc(r)}</button>`).join('')}
      ` : ''}
      ${dlgMode==='role' && dlgRole ? `
        <button type="button" class="btn btn-primary sm" id="roleStart">▶ 开始对话</button>
        <button type="button" class="btn btn-ghost sm" id="roleShow" style="display:none">👀 查看答案</button>
        <button type="button" class="btn btn-ghost sm" id="roleReset">↻ 重置</button>
      ` : ''}
    </div>
    <div class="dlg-lines" id="dlgLines">
      ${d.lines.map((l,i) => `
        <div class="dlg-line ${dlgMode==='role' && dlgRole===l.speaker && !dlgRevealed ? 'hidden-line' : ''}" data-i="${i}">
          <div class="dl-speaker">${l.speaker==='侍应'?'🧑‍🍳':l.speaker==='食客'?'🧔':l.speaker==='档主'?'👩‍🌾':l.speaker==='顾客'?'🛍️':l.speaker==='乘客'?'🧳':l.speaker==='司机'?'🚌':l.speaker==='游客'?'🧢':l.speaker==='路人'?'🚶':l.speaker==='护士'?'👩‍⚕️':l.speaker==='病人'?'🤒':'💬'}</div>
          <div class="dl-body">
            <div class="dl-name">${esc(l.speaker)}</div>
            <div class="dl-text" lang="yue-Hant-HK">${esc(l.han)}</div>
            <div class="dl-jp">${l.jp}</div>
            <div class="dl-mand">${esc(l.mand)}</div>
            ${dlgMode==='follow' ? `
              <div class="dl-tools">
                <button type="button" class="dl-btn" data-act="play" data-i="${i}">🔊 听</button>
                <button type="button" class="dl-btn rec" data-act="rec" data-i="${i}">🎤 跟读</button>
              </div>` : dlgRole===l.speaker ? `
              <div class="dl-tools">
                <button type="button" class="dl-btn" data-act="play" data-i="${i}">🔊 听答案</button>
                <button type="button" class="dl-btn rec" data-act="next" data-i="${i}">✅ 读好了</button>
              </div>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
  /* 事件 */
  $('#modeFollow').onclick = () => { dlgMode='follow'; dlgRole=null; dlgRevealed=false; renderDlg(); };
  $('#modeRole').onclick = () => { dlgMode='role'; dlgRole=roles[0]; dlgRevealed=false; renderDlg(); };
  $$('[data-role]').forEach(b => b.onclick = () => { dlgRole = b.dataset.role; dlgRevealed=false; renderDlg(); });
  const dlpa = $('#dlgPlayAll'); if(dlpa) dlpa.onclick = () => { if(!curDlg) return; if(!guardBtn(dlpa)) return; curDlg.lines.forEach(l => speak(l.han, {queue:true})); };
  const rs = $('#roleStart'); if(rs) rs.onclick = roleStart;
  const rsh = $('#roleShow'); if(rsh) rsh.onclick = roleShow;
  const rrst = $('#roleReset'); if(rrst) rrst.onclick = () => { roleReset(); renderDlg(); };
  $$('#dlgLines .dl-btn').forEach(b => {
    const i = +b.dataset.i;
    if(b.dataset.act === 'play'){
      b.onclick = () => {
        const l = curDlg.lines[i];
        speak(l.han);
        highlightLine(i);
      };
    } else if(b.dataset.act === 'rec'){
      b.onclick = () => followRecord(i, b);
    } else if(b.dataset.act === 'next'){
      b.onclick = () => {
        if(!roleRun.running){ toast('先点「▶ 开始对话」再逐句练习'); return; }
        if(roleRun.step !== i){ toast('请按顺序读当前句'); return; }
        roleNext();
      };
    }
  });
}
function highlightLine(i){
  $$('#dlgLines .dlg-line').forEach((el,idx) => el.classList.toggle('current', idx===i));
}
let followRec = {rec:false, mr:null, chunks:[]};
async function followRecord(i, btn){
  if(followRec.rec){ followRec.rec = false; followRec.mr && followRec.mr.stop(); btn.textContent='🎤 跟读'; btn.classList.remove('recording'); return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const mr = new MediaRecorder(stream);
    const ch = [];
    mr.ondataavailable = e => ch.push(e.data);
    mr.onstop = async () => {
      const blob = new Blob(ch, {type:ch[0]?.type||'audio/webm'});
      const ana = await analyzeBlob(blob);
      const l = curDlg.lines[i];
      const res = evalRecord({text:l.han}, ana);
      openModal(`<h3>🎤 跟读练习反馈 <span class="chip chip-green" style="margin-left:auto">第 ${i+1} 句</span></h3><div id="ptFeedback"></div><div style="text-align:center;margin-top:16px"><button type="button" class="btn btn-ghost sm" id="evalClose">关闭</button></div>`);
      renderFeedback(res, {text:l.han, jp:l.jp}, $('#ptFeedback'));
      $('#evalClose').onclick = closeModal;
      stream.getTracks().forEach(t=>t.stop());
    };
    followRec.mr = mr; followRec.rec = true;
    mr.start();
    btn.textContent = '⏹ 停止'; btn.classList.add('recording');
    speak(curDlg.lines[i].han); // 先示范
    toast('先听示范，然后跟读这句');
  }catch(e){ toast('无法访问麦克风'); }
}
/* 角色扮演：一问一答状态机（对方台词自动播放 → 轮到用户暂停 → 读好推进下一轮） */
let roleRun = {step:0, running:false};
function roleStart(){
  if(!dlgRole || !curDlg) return;
  if(roleRun.running){
    stopSpeak();
    roleRun.running = false;
    const b = $('#roleStart'); if(b) b.textContent = '▶ 开始对话';
    toast('已暂停角色扮演');
    return;
  }
  roleRun.running = true; roleRun.step = 0;
  const b = $('#roleStart'); if(b) b.textContent = '⏸ 暂停';
  roleStep();
}
function roleStep(){
  const d = curDlg;
  if(!roleRun.running || !d) return;
  if(roleRun.step >= d.lines.length) return roleFinish();
  const l = d.lines[roleRun.step];
  highlightLine(roleRun.step);
  if(l.speaker === dlgRole){
    const lineEl = $$('#dlgLines .dlg-line')[roleRun.step];
    if(lineEl) lineEl.classList.remove('hidden-line');
    toast('🎤 轮到你啦：读「' + l.han + '」，读好点「✅ 读好了」');
    return;
  }
  speak(l.han);
  roleRun.step++;
  setTimeout(() => { if(roleRun.running) roleStep(); }, 900 + cleanForSpeech(l.han).length * 380);
}
function roleNext(){
  if(!roleRun.running) return;
  roleRun.step++;
  roleStep();
}
function roleFinish(){
  roleRun.running = false;
  const b = $('#roleStart'); if(b) b.textContent = '▶ 开始对话';
  $$('#dlgLines .dlg-line').forEach(el => el.classList.remove('hidden-line'));
  const d = curDlg, p = getProgress();
  if(p && d && !p.dialogues.includes(d.id)){
    p.dialogues.push(d.id);
    logActivity(d.emoji, d.title, '完成角色扮演练习', 'dialogues');
    saveProgress(p);
    toast('完成练习！已记入进度 🎉');
  }
  dlgRevealed = true;
}
function roleReset(){
  stopSpeak();
  roleRun.running = false; roleRun.step = 0;
  const b = $('#roleStart'); if(b) b.textContent = '▶ 开始对话';
  dlgRevealed = false;
  highlightLine(-1);
}
function roleShow(){
  const d = curDlg;
  stopSpeak();
  const mine = d.lines.filter(l => l.speaker === dlgRole);
  const seq = ++speakSeq;
  mine.forEach((l,idx) => setTimeout(() => { if(seq !== speakSeq) return; speak(l.han, {queue:true}); }, idx * 1800));
  $$('#dlgLines .dlg-line').forEach(el => el.classList.remove('hidden-line'));
  const p = getProgress();
  if(p && !p.dialogues.includes(d.id)){
    p.dialogues.push(d.id);
    logActivity(d.emoji, d.title, '完成角色扮演练习', 'dialogues');
    saveProgress(p);
    toast('完成练习！已记入进度 🎉');
  }
  dlgRevealed = true; /* 揭示后不再重新隐藏台词 */
  renderDlg(); /* 显示所有台词 */
  const show = $('#roleShow'); if(show) show.style.display='none';
}

/* ================= 语法 ================= */
let curGrammar = null, lastGrammarLog = null;
function renderGrammar(){
  $('#grammarList').innerHTML = DATA.grammar.map(g => `
    <button type="button" class="grammar-item ${curGrammar && curGrammar.id===g.id?'active':''}" data-gid="${g.id}">
      <div class="gi-num">LESSON ${g.num}</div>
      <h4>${esc(g.title)}</h4>
      <p>${esc(g.intro.slice(0,34))}…</p>
    </button>`).join('');
  $$('#grammarList .grammar-item').forEach(b => b.onclick = () => { curGrammar = DATA.grammar.find(g=>g.id===b.dataset.gid); renderGrammar(); renderGrammarArticle(); });
  renderGrammarArticle();
}
function renderGrammarArticle(){
  const g = curGrammar || DATA.grammar[0];
  if(!g) return;
  if(!curGrammar) curGrammar = g;
  $('#grammarArticle').classList.remove('hidden');
  $('#grammarArticle').innerHTML = `
    <div class="ga-head">
      <div class="gi-num" style="color:var(--gold);font-weight:700;letter-spacing:2px">LESSON ${g.num}</div>
      <h2>${esc(g.title)}</h2>
      <p class="ga-intro">${esc(g.intro)}</p>
    </div>
    ${g.sections.map(s => s.type==='table' ? `
      <div class="ga-block">
        <h4>${esc(s.h)}</h4>
        <div style="overflow-x:auto"><table class="ga-table">
          <tr>${s.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr>
          ${s.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
        </table></div>
      </div>` : s.type==='note' ? `
      <div class="ga-note">💡 ${esc(s.body)}</div>` : `
      <div class="ga-block"><h4>${esc(s.h)}</h4><p style="font-size:14.5px;color:var(--ink-2)">${esc(s.body)}</p></div>`).join('')}
    <div class="ga-block">
      <h4>例句练习</h4>
      ${g.examples.map(ex => `
        <button type="button" class="ga-example" data-ex="${esc(ex.han)}" aria-label="播放例句 ${esc(ex.han)}">
          <span class="ge-play">🔊</span>
          <div class="ge-han">${esc(ex.han)}</div>
          <div class="ge-jp">${ex.jp}</div>
          <div class="ge-mand">${esc(ex.mand)}</div>
        </button>`).join('')}
    </div>`;
  if(lastGrammarLog !== g.id){ lastGrammarLog = g.id; logActivity('🧩', g.title, '阅读语法专栏', 'grammar'); }
  $$('#grammarArticle .ga-example').forEach(el => el.onclick = () => speak(el.dataset.ex));
}

/* ================= 文化 ================= */
let culTab = 'sayings';
function renderCulture(){
  const d = DATA.culture;
  const tabNames = {sayings:'粤语俗语', xiehou:'歇后语', life:'港式文化', festival:'节庆习俗', food:'港式小食', tvb:'TVB金句'};
  Object.keys(tabNames).forEach(k => { const b = document.querySelector(`[data-cul-tab="${k}"]`); if(b && d[k]) b.textContent = tabNames[k] + ' ' + d[k].length; });
  const conf = {
    sayings:{arr:d.sayings, badge:'俗语', life:false, play:it=>it.han},
    xiehou:{arr:d.xiehou, badge:'歇后语', life:false, play:it=>it.front + '——' + it.back},
    life:{arr:d.life, badge:it=>it.tag, life:true, play:it=>it.title},
    festival:{arr:d.festival, badge:'节庆习俗', life:false, play:it=>it.han},
    food:{arr:d.food, badge:it=>it.tag, life:true, play:it=>it.title},
    tvb:{arr:d.tvb, badge:'TVB金句', life:false, play:it=>it.han},
  };
  const c = conf[culTab] || conf.sayings;
  const items = c.arr.map(it => ({...it, badge: typeof c.badge === 'function' ? c.badge(it) : c.badge, cls:'', play:c.play(it)}));
  $('#cultureGrid').innerHTML = items.map((it,i) => {
    const badge = '<span class="cc-badge">' + esc(it.badge) + '</span>';
    const head = c.life
      ? '<h3>' + esc(it.title) + '</h3>'
      : culTab === 'xiehou'
        ? '<h3>' + esc(it.front) + ' <span style="color:var(--ink-3);font-size:14px">—— ' + esc(it.back) + '</span></h3><div class="cc-jp">' + esc(it.jp||'') + '</div>'
        : '<h3>' + esc(it.han) + '</h3><div class="cc-jp">' + esc(it.jp||'') + '</div>';
    const body = c.life
      ? '<div class="cc-meaning" style="margin-top:8px">' + esc(it.desc) + '</div>'
      : '<div class="cc-han">' + (culTab === 'xiehou' ? esc(it.front) + ' —— ' + esc(it.back) : esc(it.meaning)) + '</div>';
    const story = '<div class="cc-story">📖 ' + esc(it.story) + '</div>';
    const btn = '<button type="button" class="cc-play" title="朗读">▶</button>';
    return '<div class="cul-card ' + (c.life?'cul-life':'') + '" style="animation:pageIn .4s ' + (i*0.05) + 's backwards">' + badge + head + body + story + btn + '</div>';
  }).join('');
  $$('#cultureGrid .cc-play').forEach((b,i) => b.onclick = () => {
    const it = items[i];
    speak(it.play);
  });
}

/* ================= 学习档案 ================= */
function exportProfile(){
  const payload = {app:'jyut-cantonese', version:2, exportedAt:new Date().toISOString(), progress:getProgress()};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `jyut-learning-${todayKey()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('学习档案已导出，请妥善保存');
}
async function importProfile(file){
  try{
    const parsed = JSON.parse(await file.text());
    const raw = parsed && parsed.progress ? parsed.progress : parsed;
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid');
    if(!confirm(cloudState.authenticated?'导入会覆盖本机档案，并同步到你的云端账户。确定继续吗？':'导入会覆盖当前设备上的学习档案，确定继续吗？')) return;
    saveProgress(normalizeProgress(raw));
    toast('学习档案已恢复');
    renderProfile(); renderHome();
  }catch(_){ toast('无法读取这份学习档案，请确认文件格式'); }
}
function resetProfile(){
  if(cloudState.authenticated){ toast('为避免误删云端进度，请先退出云端再清除本机档案'); return; }
  if(!confirm('确定清除当前设备上的进度、收藏、打卡和练习历史吗？此操作无法撤销。')) return;
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(CLOUD_META_KEY);
  toast('本机学习档案已清除');
  renderProfile(); renderHome();
}
async function loginCloud(){
  const userId=$('#cloudUser')?.value.trim(), password=$('#cloudPassword')?.value||'';
  if(!userId||!password){ toast('请输入账户和密码'); return; }
  const button=$('#cloudLogin'); if(button){ button.disabled=true; button.textContent='登录中…'; }
  try{
    const {res,data}=await cloudFetch('/login',{method:'POST',body:JSON.stringify({userId,password})});
    if(!res.ok){ toast(res.status===429?'尝试次数过多，请稍后再试':'账户或密码不正确'); return; }
    cloudState={checked:true,authenticated:true,user:data.user,version:0,status:'正在合并…',updatedAt:null,error:null};
    await initCloudSync();
    toast('已登录，手机和网页进度会自动同步');
  }catch(_){ toast('暂时无法连接云端，请稍后再试'); }
  finally{ const field=$('#cloudPassword'); if(field) field.value=''; if(button){button.disabled=false;button.textContent='登录并同步';} }
}
async function logoutCloud(){
  try{ await cloudFetch('/logout',{method:'POST',body:'{}'}); }catch(_){}
  clearTimeout(cloudSyncTimer);
  setCloudState({checked:true,authenticated:false,user:null,version:0,status:'本机档案',updatedAt:null,error:null});
  toast('已退出云端；本机档案仍保留');
}
function cloudPanelHtml(){
  if(!cloudState.checked) return `<div class="cloud-status"><span class="cloud-dot busy"></span><div><b>正在检查云端账户…</b><small>不影响本机学习</small></div></div>`;
  if(cloudState.authenticated){
    const when=cloudState.updatedAt?new Date(cloudState.updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'首次同步中';
    return `<div class="cloud-status"><span class="cloud-dot online"></span><div><b>${esc(cloudState.user.displayName||cloudState.user.id)} · ${esc(cloudState.status)}</b><small>账户 ${esc(cloudState.user.id)} · 最近云端更新 ${esc(when)}</small>${cloudState.error?`<small class="cloud-error">${esc(cloudState.error)}</small>`:''}</div></div>
      <div class="profile-actions"><button type="button" class="btn btn-primary sm" id="cloudSyncNow">↻ 立即同步</button><button type="button" class="btn btn-ghost sm" id="cloudLogout">退出云端</button></div>`;
  }
  return `<p>需要跨手机和电脑使用时，可登录受邀账户。网站不开放公开注册，也不会把本机录音上传到云端。</p>
    <div class="cloud-login">
      <label>账户<input id="cloudUser" autocomplete="username" value="eachen" maxlength="40" spellcheck="false"></label>
      <label>密码<input id="cloudPassword" type="password" autocomplete="current-password" maxlength="256"></label>
      <button type="button" class="btn btn-primary sm" id="cloudLogin">登录并同步</button>
    </div>
    <div class="profile-cloud-note">云端仅同步进度、目标、收藏、打卡和练习摘要；每个账户的数据独立存放。新账户由站点管理员邀请创建。</div>`;
}
function renderProfile(){
  const body = $('#profileBody');
  const p = getProgress();
  const favItems = p.favorites.map(k => {
    const [cid, han] = k.split(':');
    const cat = DATA.vocabCategories.find(c => c.id===cid);
    const w = cat && cat.words.find(x => x.han===han);
    return w ? {cat, w} : null;
  }).filter(Boolean);
  const today = todayKey();
  if(p.goalDate !== today){ p.goalDate = today; p.goalToday = 0; p.goalWords = []; saveProgress(p); }

  body.innerHTML = `
    <div class="profile-grid">
      <div class="stat-card"><div class="sc-ico">🔊</div><b>${p.learned.length}</b><span>听过的词汇</span></div>
      <div class="stat-card"><div class="sc-ico">⭐</div><b>${p.favorites.length}</b><span>收藏生词</span></div>
      <div class="stat-card"><div class="sc-ico">🎤</div><b>${p.practices.length}</b><span>练习次数</span></div>
      <div class="stat-card"><div class="sc-ico">💬</div><b>${p.dialogues.length}/${DATA.dialogues.length}</b><span>体验过的对话</span></div>
      <div class="stat-card"><div class="sc-ico">🔥</div><b>${p.streak}</b><span>连续打卡（天）</span></div>
      <div class="stat-card"><div class="sc-ico">🎯</div><b>${p.goalToday}/${p.goalCount}</b><span>今日目标</span></div>
    </div>
    <div class="profile-cols">
      <div class="profile-col">
        <h3>🎯 每日目标</h3>
        <div class="setting-row">
          <div><div class="sr-label">每日学习目标</div><div class="sr-sub">每天要学多少个词汇</div></div>
          <div class="num-stepper">
            <button type="button" id="goalMinus" aria-label="减少每日目标">−</button><b id="goalVal">${p.goalCount}</b><button type="button" id="goalPlus" aria-label="增加每日目标">+</button>
          </div>
        </div>
        <div class="setting-row">
          <div><div class="sr-label">打开网站时提醒</div><div class="sr-sub">当天目标未达成时，在本站内提示一次</div></div>
          <button type="button" class="switch ${p.reminder?'on':''}" id="remindSwitch" aria-label="打开网站时提醒" aria-pressed="${p.reminder}"></button>
        </div>
        <div class="setting-row">
          <div><div class="sr-label">今日打卡</div><div class="sr-sub">${p.checkins[today] ? '今日已打卡 ✅' : '还没打卡，记得点一下'}</div></div>
          <button type="button" class="btn btn-soft sm" id="checkinBtn2">${p.checkins[today]?'✓ 已打卡':'✍️ 打卡'}</button>
        </div>
      </div>
      <div class="profile-col">
        <h3>⭐ 收藏生词</h3>
        ${favItems.length ? `<div class="fav-list">${favItems.map(f => `
          <div class="fav-item" data-cat="${f.cat.id}" role="button" tabindex="0" aria-label="打开 ${esc(f.w.han)} 所在词汇分类">
            <span class="fi-han">${f.w.han}</span>
            <span class="fi-jp">${f.w.jp} · ${esc(f.w.mand)}</span>
            <button type="button" class="fi-del" title="删除">✕</button>
          </div>`).join('')}</div>` : '<div class="history-empty">还没有收藏，去词汇页点 ☆ 收藏吧</div>'}
      </div>
      <div class="profile-col" style="grid-column:1/-1">
        <h3>📋 练习历史</h3>
        ${p.practices.length ? p.practices.slice(0,12).map(h => `
          <div class="history-item">
            <span class="hi-ico">${esc(h.ico)}</span>
            <span class="hi-what">${esc(h.label)}</span>
            <span class="hi-time">${new Date(h.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            <span class="hi-score">${scoreTag(h)} ${h.score}</span>
          </div>`).join('') : '<div class="history-empty">还没有练习记录，去语音页录一段试试吧</div>'}
      </div>
      <div class="profile-col profile-backup" style="grid-column:1/-1">
        <h3>💾 本机档案与备份</h3>
        <p>无需注册，进度会自动保存在当前设备。清理浏览器数据或换设备前，请先导出档案；录音不会写入档案。</p>
        <div class="profile-actions">
          <button type="button" class="btn btn-primary sm" id="profileExport">⬇️ 导出档案</button>
          <button type="button" class="btn btn-ghost sm" id="profileImport">⬆️ 导入档案</button>
          <button type="button" class="btn btn-ghost sm danger" id="profileReset">清除本机档案</button>
          <input id="profileFile" class="hidden" type="file" accept="application/json,.json">
        </div>
      </div>
      <div class="profile-col profile-cloud" style="grid-column:1/-1">
        <h3>☁️ 可选云端账户</h3>
        ${cloudPanelHtml()}
      </div>
    </div>`;
  /* 事件 */
  $('#goalMinus').onclick = () => { p.goalCount = Math.max(1, p.goalCount-1); saveProgress(p); $('#goalVal').textContent = p.goalCount; };
  $('#goalPlus').onclick = () => { p.goalCount = Math.min(100, p.goalCount+1); saveProgress(p); $('#goalVal').textContent = p.goalCount; };
  $('#remindSwitch').onclick = () => {
    p.reminder = !p.reminder;
    toast(p.reminder ? '打开网站时提醒已开启' : '提醒已关闭');
    saveProgress(p); renderProfile();
  };
  const c2 = $('#checkinBtn2'); if(c2) c2.onclick = checkin;
  $('#profileExport').onclick = exportProfile;
  $('#profileImport').onclick = () => $('#profileFile').click();
  $('#profileFile').onchange = e => { const f = e.target.files[0]; if(f) importProfile(f); e.target.value=''; };
  $('#profileReset').onclick = resetProfile;
  const cloudLogin=$('#cloudLogin'); if(cloudLogin) cloudLogin.onclick=loginCloud;
  const cloudPassword=$('#cloudPassword'); if(cloudPassword) cloudPassword.onkeydown=e=>{if(e.key==='Enter') loginCloud();};
  const cloudSyncNow=$('#cloudSyncNow'); if(cloudSyncNow) cloudSyncNow.onclick=async()=>{ await queueCloudPush(); toast(cloudState.error?'同步尚未完成':'云端已是最新'); };
  const cloudLogout=$('#cloudLogout'); if(cloudLogout) cloudLogout.onclick=logoutCloud;
  $$('#profileBody .fav-item').forEach(el => {
    el.querySelector('.fi-del').onclick = e => {
      e.stopPropagation();
      const cat = el.dataset.cat;
      const han = el.querySelector('.fi-han').textContent;
      const key = cat + ':' + han;
      p.favorites = p.favorites.filter(k => k !== key);
      saveProgress(p); renderProfile();
    };
    el.onclick = () => { vocabCat = el.dataset.cat; navigate('vocab'); };
    el.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); vocabCat = el.dataset.cat; navigate('vocab'); } };
  });
}

/* 练习历史记录 */
/* 练习历史成绩标签：按类型显示「正确率 / 节奏分 / 完成 / 得分」 */
function scoreTag(h){
  const t = (h.ico || '') + ' ' + (h.label || '');
  if(/听力|小测|quiz/i.test(t)) return '正确率';
  if(/跟读|跟唱|🎵|第\d+句/.test(t)) return '节奏分';
  if(/对话|打卡|复习|完成/i.test(t)) return '完成';
  return '得分';
}
function logPractice(ico, label, score){
  const p = getProgress();
  p.lastStudyDate = todayKey();
  p.practices.unshift({ico, label, score, time: Date.now()});
  p.practices = p.practices.slice(0, 60);
  saveProgress(p);
}

/* ================= 打开网站时提醒 ================= */
function maybeRemind(){
  const p = getProgress(); if(!p.reminder) return;
  const today = todayKey();
  if(p.reminderSentDate === today) return;
  if(p.goalDate === today && p.goalToday >= p.goalCount) return; /* 已达标 */
  setTimeout(() => toast(`今日已听 ${p.goalToday}/${p.goalCount} 个词汇，继续加油！`), 700);
  p.reminderSentDate = today;
  saveProgress(p);
}

/* ================= 全局事件 ================= */
function showMobileMore(){
  openModal(`
    <h3 id="moreTitle">更多学习内容 <button type="button" class="modal-x" id="moreClose" aria-label="关闭">✕</button></h3>
    <div class="mobile-more-grid">
      <button type="button" data-more-nav="sing"><span>🎵</span><b>学唱粤语歌</b><small>逐句听唱与跟读</small></button>
      <button type="button" data-more-nav="grammar"><span>🧩</span><b>语法专栏</b><small>十讲掌握常用结构</small></button>
      <button type="button" data-more-nav="culture"><span>🏮</span><b>文化趣知</b><small>俗语与港式生活</small></button>
    </div>
  </div>`, {cls:'mobile-more'});
  $('#moreClose').onclick = closeModal;
  $$('[data-more-nav]', modalRoot).forEach(b => b.onclick = () => { const route = b.dataset.moreNav; closeModal(); navigate(route); });
}
function bindGlobal(){
  /* 导航 */
  $$('[data-nav]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));
  window.addEventListener('popstate', () => navigate(routeFromLocation(), {fromHistory:true}));
  const more = $('#mMore'); if(more) more.onclick = showMobileMore;
  $('#dlgBack').onclick = () => { curDlg = null; renderDialogues(); };
  /* 主题 */
  const setTheme = t => {
    document.documentElement.setAttribute('data-theme', t);
    $('#themeToggle').textContent = t === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
    $('#themeToggle').setAttribute('aria-pressed', t==='dark'?'true':'false');
    $('#themeToggle').setAttribute('aria-label', t==='dark'?'切换明暗主题，当前暗色':'切换明暗主题，当前亮色');
    $('#mThemeToggle').setAttribute('aria-pressed', t==='dark'?'true':'false');
    $('#mThemeToggle').textContent = t === 'dark' ? '☀️' : '🌙';
    LS.set('canto_theme', t);
  };
  $('#themeToggle').onclick = () => setTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
  $('#mThemeToggle').onclick = () => setTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
  const savedTheme = LS.get('canto_theme', null);
  if(savedTheme) setTheme(savedTheme);
  /* 语音页 */
  $$('.ph-tab').forEach(b => b.onclick = () => {
    if(b.dataset.phtab){ phTab = b.dataset.phtab; phSel = null; practiceTarget = null;
      $$('.ph-tab').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-selected','false'); });
      b.classList.add('active'); b.setAttribute('aria-selected','true'); renderPhGrid(); }
  });
  /* 语音页 tablist 方向键（←/→ 切换） */
  const phTablist = document.getElementById('phTablist');
  if(phTablist) phTablist.addEventListener('keydown', e => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = $$('[data-phtab]', phTablist).filter(t => !t.disabled);
    if(!tabs.length) return;
    const i = tabs.indexOf(document.activeElement);
    const ni = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault();
    tabs[ni].focus(); tabs[ni].click();
  });
  $$('[data-cul-tab]').forEach(b => b.onclick = () => {
    culTab = b.dataset.culTab;
    $$('[data-cul-tab]').forEach(x=>{ x.classList.remove('active'); x.setAttribute('aria-pressed','false'); });
    b.classList.add('active'); b.setAttribute('aria-pressed','true'); renderCulture();
  });
  $('#phSearch').addEventListener('input', renderPhGrid);
  $('#phPlayAll').onclick = () => { if(!guardBtn($('#phPlayAll'))) return;
    const q = ($('#phSearch').value||'').trim();
    let items;
    if(phTab==='initials') items = DATA.initials;
    else if(phTab==='finals') items = DATA.finals;
    else items = DATA.tones;
    if(q) items = items.filter(i => (i.sym+(i.ex||'')).toLowerCase().includes(q.toLowerCase()));
    if(!items.length) return;
    speakPhItem({ex:items[0].ex, sym:items[0].sym});
    const seq = ++speakSeq;
    items.forEach((it,i) => setTimeout(() => { if(seq !== speakSeq) return; speakPhItem({ex:it.ex, sym:it.sym}, {queue:true}); }, i * 1500));
    toast('正在朗读本组音标（' + items.length + ' 个）');
  };
  $('#phStopAll').onclick = stopSpeak;
  /* 发音练习台 */
  $('#ptDemo').onclick = () => { if(!practiceTarget){ toast('先点选一张音标卡片'); return; } if(!guardBtn($('#ptDemo'))) return; speak(practiceTarget.text); };
  $('#ptRecord').onclick = () => {
    if(!practiceTarget){ toast('先点选一张音标卡片再录音'); return; }
    if(recording) stopRecord();
    else startRecord();
  };
  $('#ptPlayback').onclick = () => { if(audioEl && recordedUrl) audioEl.play(); };
  /* 词汇页 */
  $('#vocabSearch').addEventListener('input', renderVocabGrid);
  const d5b = $('#daily5Btn'); if(d5b) d5b.onclick = daily5Start;
  $('#favFilter').onclick = () => { vocabFavOnly = !vocabFavOnly; vocabReviewOnly = false; $('#favFilter').classList.toggle('chip-red', vocabFavOnly); $('#favFilter').setAttribute('aria-pressed', vocabFavOnly?'true':'false'); $('#reviewBtn').classList.remove('active'); $('#reviewBtn').setAttribute('aria-pressed','false'); renderVocabGrid(); };
  $('#reviewBtn').onclick = () => { vocabReviewOnly = !vocabReviewOnly; vocabFavOnly = false; $('#reviewBtn').classList.toggle('active', vocabReviewOnly); $('#reviewBtn').setAttribute('aria-pressed', vocabReviewOnly?'true':'false'); $('#favFilter').classList.remove('chip-red'); $('#favFilter').setAttribute('aria-pressed','false'); renderVocab(); updateReviewBtn(); };
  $('#favPlayAll').onclick = () => {
    const cat = DATA.vocabCategories.find(c=>c.id===vocabCat);
    const seq = ++speakSeq;
    cat.words.forEach((w,i) => setTimeout(() => { if(seq !== speakSeq) return; speak(w.han, {queue:true}); }, i * 1400));
    toast('正在朗读「' + cat.name + '」全部词汇');
  };
  $('#quizOpenBtn').onclick = openQuiz;
  /* 打卡 */
  $('#checkinBtn').onclick = checkin;
}

/* ================= PWA Service Worker 注册 ================= */
function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.info('[粵學堂] SW 已注册, scope:', reg.scope);
    }).catch(err => {
      console.warn('[粵學堂] SW 注册失败:', err.message);
    });
  });
}

/* ================= 唱粤语歌 ================= */
let curSong = null, sgIdx = 0, sgLoop = false, sgAuto = false, sgAutoTimer = null;
let songFilter = 'all', songQuery = '';
let sgAudio = null, sgFileUrl = null;
let sgRecState = {rec:false, mr:null, chunks:[]};

/* 逐字注音：把整句粤拼按音节逐个标到汉字正上方（ruby） */
function annotateRuby(han, jp){
  const syls = jp.trim().split(/\s+/);
  let si = 0, out = '';
  for(const ch of han){
    if(ch === ' '){ out += ' '; }
    else if(/[，。！？、；：,.!?;:·—…《》()（）“”‘’]/.test(ch)){ out += ch; }
    else if(/[a-zA-Z0-9]/.test(ch)){ out += ch; }
    else { out += '<ruby>' + ch + '<rt>' + (syls[si] || '') + '</rt></ruby>'; si++; }
  }
  return out;
}

function renderSing(){
  const list = SONGS.filter(s => (songFilter==='all' || s.level===songFilter) && (!songQuery || (s.title + s.artist).toLowerCase().includes(songQuery)));
  $('#songCards').innerHTML = list.map((s,i) => `
    <button type="button" class="song-card" data-sid="${s.id}" style="background:linear-gradient(135deg,${s.colors[0]},${s.colors[1]});animation:pageIn .4s ${i*0.08}s backwards">
      <span class="sc-emoji">${s.emoji}</span>
      <span class="sc-dots"><i></i><i></i><i></i></span>
      <h3>${s.title}</h3>
      <div class="sc-meta">${s.artist} · ${s.year} · ${s.lyric.length} 句</div>
      <div class="sc-tags">${s.tags.map(t=>`<span class="sc-tag">${t}</span>`).join('')}<span class="sc-tag">${s.level}</span></div>
    </button>`).join('');
  $$('#songCards .song-card').forEach(c => c.onclick = () => openSong(c.dataset.sid));
  /* 歌词字词小词典 */
  $('#swGrid').innerHTML = LYRIC_WORDS.map(w => `
    <button type="button" class="sw-item" title="点击朗读" aria-label="播放 ${esc(w.char)}">
      <div class="sw-top"><span class="sw-char">${w.char}</span><span class="sw-jp">${w.jp}</span></div>
      <div class="sw-mand">${w.mand}</div>
      <div class="sw-ex">${w.ex}</div>
    </button>`).join('');
  $$('#swGrid .sw-item').forEach(el => el.onclick = () => speak(el.querySelector('.sw-char').textContent, {}));
  $('#singStage').classList.add('hidden');
}
function openSong(id){
  curSong = SONGS.find(s => s.id === id);
  if(!curSong) return;
  sgIdx = 0; sgLoop = false; sgAuto = false;
  clearTimeout(sgAutoTimer);
  logActivity(curSong.emoji, curSong.title, '进入学唱模式', 'sing');
  $('#songCards').classList.add('hidden');
  $('#singStage').classList.remove('hidden');
  renderSong();
}
function renderSong(){
  const s = curSong; if(!s) return;
  $('#singHead').innerHTML = `
    <span class="sh-emoji">${s.emoji}</span>
    <div>
      <h3>${s.title}</h3>
      <div class="sh-meta">${s.artist} · ${s.year} · 难度：${s.level}</div>
      <div class="sh-intro">${s.intro}</div>
    </div>`;
  $('#singHead').style.background = 'linear-gradient(135deg,' + s.colors[0] + ',' + s.colors[1] + ')';
  $('#lyricPanel').innerHTML = s.lyric.map((l,i) => `
    <div class="lyric-line ${i===sgIdx?'current':''}" data-i="${i}" role="group" tabindex="0" aria-label="第 ${i+1} 句，${esc(l.han)}">
      <span class="ll-no">${i+1}</span>
      <div class="ll-body">
        <div class="ll-han" lang="yue-Hant-HK">${annotateRuby(l.han, l.jp)}</div>
        <div class="ll-jp">${l.jp}</div>
        <div class="ll-mand">${l.mand}</div>
        <div class="ll-tools">
          <button type="button" class="ll-btn" data-act="demo" data-i="${i}">🔊 示范</button>
          <button type="button" class="ll-btn rec" data-act="rec" data-i="${i}">🎤 跟唱</button>
        </div>
      </div>
      <span class="ll-badge">NOW ▶</span>
    </div>`).join('');
  $('#songNotes').innerHTML = `<div class="ga-block" style="margin:0 0 8px"><h4 style="margin-bottom:8px">发音难点</h4></div>` + s.notes.map(n => `
    <div class="sn-item"><b>${n.target}</b> · <span>${n.tip}</span></div>`).join('');
  $$('#lyricPanel .lyric-line').forEach(el => {
    const i = +el.dataset.i;
    el.onclick = () => gotoLine(i, true);
    el.onkeydown = e => { if((e.key === 'Enter' || e.key === ' ') && e.target === el){ e.preventDefault(); gotoLine(i, true); } };
    const demo = el.querySelector('[data-act=demo]');
    if(demo) demo.onclick = e => { e.stopPropagation(); gotoLine(i, true); };
    const rec = el.querySelector('[data-act=rec]');
    if(rec) rec.onclick = e => { e.stopPropagation(); singRec(i, rec); };
  });
  updateSingStatus();
  const cur = $('#lyricPanel .lyric-line.current');
  if(cur) cur.scrollIntoView({behavior:'smooth', block:'center'});
}
function gotoLine(i, play){
  if(!curSong) return;
  sgIdx = Math.max(0, Math.min(curSong.lyric.length - 1, i));
  renderSong();
  if(play) speak(curSong.lyric[sgIdx].han);
}
function sgPrev(){ gotoLine(sgIdx - 1, true); }
function sgNext(){ if(sgLoop){ gotoLine(sgIdx, true); toast('🔁 单句循环中：重练本句'); } else { gotoLine(sgIdx + 1, true); } }
function sgAutoPlay(){
  if(!curSong || !sgAuto) return;
  const l = curSong.lyric[sgIdx];
  speak(l.han);
  updateSingStatus('⚡ 自动跟唱：示范第 ' + (sgIdx+1) + ' 句 → 轮到你唱 → 自动下一句');
  clearTimeout(sgAutoTimer);
  sgAutoTimer = setTimeout(() => {
    if(!sgAuto || sgRecState.rec) return;
    if(sgLoop || sgIdx >= curSong.lyric.length - 1){
      if(sgIdx >= curSong.lyric.length - 1 && !sgLoop){ sgAuto = false; $('#sgAuto').classList.remove('active'); updateSingStatus('🎉 整首歌跟唱完啦！犀利！'); return; }
      sgAutoPlay();
    } else {
      sgIdx++; renderSong(); sgAutoPlay();
    }
  }, l.d * 1000 * (0.75 / Math.max(0.5, speechRate)) + 1200); /* 等待时长随语速缩放 */
}
async function singRec(i, btn){
  if(sgRecState.rec){
    sgRecState.rec = false; sgRecState.mr && sgRecState.mr.stop();
    btn.textContent = '🎤 跟唱'; btn.classList.remove('recording');
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const mr = new MediaRecorder(stream);
    const ch = [];
    mr.ondataavailable = e => ch.push(e.data);
    mr.onstop = async () => {
      const blob = new Blob(ch, {type:ch[0]?.type || 'audio/webm'});
      const ana = await analyzeBlob(blob);
      const l = curSong.lyric[i];
      const res = evalRecord({text:l.han}, ana);
      openModal(`<h3>🎤 跟唱练习反馈 <span class="chip chip-green" style="margin-left:auto">${curSong.title} · 第 ${i+1} 句</span></h3><div id="ptFeedback"></div><div style="text-align:center;margin-top:16px"><button type="button" class="btn btn-ghost sm" id="evalClose">关闭</button></div>`);
      renderFeedback(res, {text:l.han, jp:l.jp}, $('#ptFeedback'));
      $('#evalClose').onclick = closeModal;
      logPractice('🎵', curSong.title + ' 第' + (i+1) + '句', finalScore(res, null));
      stream.getTracks().forEach(t => t.stop());
    };
    sgRecState.mr = mr; sgRecState.rec = true;
    mr.start();
    btn.textContent = '⏹ 停止'; btn.classList.add('recording');
    speak(curSong.lyric[i].han);
    toast('先听示范，然后跟着唱这一句');
  }catch(e){ toast('无法访问麦克风，请检查权限'); }
}
function fmtT(t){
  if(!isFinite(t) || t == null) return '00:00';
  const m = Math.floor(t/60), s = Math.floor(t%60);
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
/* 全文注音视图：整首歌词逐字注音，一排排通读 */
function showFullLyric(){
  if(!curSong) return;
  const s = curSong;
  openModal(`
    <h3>📄 ${s.title} <span class="chip chip-gold" style="font-size:11px">全文注音</span><button type="button" id="flClose" style="margin-left:auto;border:none;background:none;font-size:18px;color:var(--ink-3);cursor:pointer;padding:2px 6px" title="关闭">✕</button></h3>
    <div class="lyric-full">
      ${s.lyric.map((l,i) => `
        <div class="lf-line" data-i="${i}">
          <span class="lf-no">${i+1}</span>
          <span class="lf-ruby" lang="yue-Hant-HK">${annotateRuby(l.han, l.jp)}</span>
          <span class="lf-mand">${esc(l.mand)}</span>
        </div>`).join('')}
    </div>
      <p class="tip" style="text-align:center;margin-top:14px">点击任意句朗读 · 歌词仅供学习，版权归原作者所有</p>
  `, {cls:'lyric-full-modal', label:`${s.title} 全文注音`});
  $('#flClose').onclick = closeModal;
  $$('#modalRoot .lf-line').forEach(el => el.onclick = () => {
    speak(s.lyric[+el.dataset.i].han);
    $$('#modalRoot .lf-line').forEach(x => x.classList.remove('playing'));
    el.classList.add('playing');
  });
}
function updateSingStatus(txt){
  const el = $('#singStatus');
  if(!el) return;
  if(txt) el.textContent = txt;
  else if(curSong) el.textContent = '当前：第 ' + (sgIdx+1) + ' / ' + curSong.lyric.length + ' 句 · ' + curSong.lyric[sgIdx].mand;
}
function bindSing(){
  $('#singBack').onclick = () => {
    curSong = null; sgAuto = false; clearTimeout(sgAutoTimer);
    $('#singStage').classList.add('hidden');
    $('#songCards').classList.remove('hidden');
  };
  $('#sgPrev').onclick = sgPrev;
  $('#sgNext').onclick = sgNext;
  $('#sgDemo').onclick = () => { if(!curSong) return; if(!guardBtn($('#sgDemo'))) return; gotoLine(sgIdx, true); };
  $('#sgRec').onclick = () => { if(curSong) singRec(sgIdx, $('#sgRec')); };
  $('#sgLoop').onclick = () => {
    sgLoop = !sgLoop;
    $('#sgLoop').classList.toggle('active', sgLoop);
    $('#sgLoop').setAttribute('aria-pressed', sgLoop?'true':'false');
    toast(sgLoop ? '🔁 单句循环已开启：反复练当前句' : '单句循环已关闭');
  };
  $('#sgAuto').onclick = () => {
    sgAuto = !sgAuto;
    $('#sgAuto').classList.toggle('active', sgAuto);
    $('#sgAuto').setAttribute('aria-pressed', sgAuto?'true':'false');
    if(sgAuto){ updateSingStatus('⚡ 自动跟唱：示范 → 你唱 → 下一句'); sgAutoPlay(); }
    else { clearTimeout(sgAutoTimer); updateSingStatus('已停止自动跟唱'); }
  };
  $('#sgFull').onclick = showFullLyric;
  bindRatePickers();
  /* 全局悬浮朗读语速 */
  function bindRatePickers(){
    const panel = $('#rfPanel'), toggle = $('#rfToggle'), label = $('#rfLabel');
    if(!toggle) return;
    toggle.onclick = e => {
      e.stopPropagation();
      const nowHidden = panel.classList.toggle('hidden');
      toggle.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
      if(!nowHidden){
        const f0 = $$('#rfRate button')[0]; if(f0) f0.focus();
        const esc = ev => { if(ev.key === 'Escape'){ panel.classList.add('hidden'); toggle.setAttribute('aria-expanded','false'); document.removeEventListener('keydown', esc); } };
        document.addEventListener('keydown', esc);
      }
    };
    $$('#rfRate button').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        speechRate = parseFloat(b.dataset.r);
        LS.set('canto_speech_rate', speechRate);
        updateRateUI();
        toast('朗读语速：' + speechRate + '×');
        panel.classList.add('hidden');
      };
    });
    document.addEventListener('click', e => {
      const box = document.getElementById('rateFloat');
      if(box && !box.contains(e.target)) panel.classList.add('hidden');
    });
    updateRateUI();
  }
  function updateRateUI(){
    $$('#rfRate button').forEach(b => b.classList.toggle('active', parseFloat(b.dataset.r) === speechRate));
    const label = $('#rfLabel');
    if(label) label.textContent = speechRate + '×';
  }


/* ================= 整曲播放（唱歌页） ================= */
  const songInput = $('#songSearch');
  if(songInput) songInput.oninput = e => { songQuery = e.target.value.trim().toLowerCase(); renderSing(); };
  const sfAll = $('#songFilterAll');
  if(sfAll) sfAll.onclick = () => { songFilter='all'; updateSongFilterUI(); renderSing(); };
  $$('[data-sf]').forEach(b => b.onclick = () => { songFilter = b.dataset.sf; updateSongFilterUI(); renderSing(); });
  function updateSongFilterUI(){
    const a = $('#songFilterAll'); if(a){ a.classList.toggle('active', songFilter==='all'); a.setAttribute('aria-pressed', songFilter==='all'?'true':'false'); }
    $$('[data-sf]').forEach(b => { const on = b.dataset.sf===songFilter; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on?'true':'false'); });
  }
  $('#spImport').onclick = () => $('#spFile').click();
  $('#spFile').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    if(sgFileUrl) URL.revokeObjectURL(sgFileUrl);
    sgFileUrl = URL.createObjectURL(f);
    if(sgAudio) sgAudio.pause();
    sgAudio = new Audio(sgFileUrl);
    sgAudio.addEventListener('timeupdate', () => {
      $('#spSeek').value = sgAudio.duration ? sgAudio.currentTime / sgAudio.duration * 100 : 0;
      $('#spSeek').setAttribute('aria-valuetext', fmtT(sgAudio.currentTime) + ' / ' + fmtT(sgAudio.duration));
      $('#spTime').textContent = fmtT(sgAudio.currentTime) + ' / ' + fmtT(sgAudio.duration);
    });
    sgAudio.addEventListener('ended', () => { $('#spPlay').textContent = '▶ 播放'; });
    $('#spPlay').textContent = '▶ 播放';
    $('#spTime').textContent = '00:00 / 00:00';
    toast('已导入：' + f.name + '（仅本机播放，不上传）');
  };
  $('#spPlay').onclick = () => {
    if(!sgAudio){ toast('先点「⬆️ 导入音频」选择本地歌曲文件'); return; }
    if(sgAudio.paused){ sgAudio.play(); $('#spPlay').textContent = '⏸ 暂停'; }
    else { sgAudio.pause(); $('#spPlay').textContent = '▶ 播放'; }
  };
  $('#spSeek').addEventListener('input', e => {
    if(sgAudio && sgAudio.duration){ sgAudio.currentTime = e.target.value / 100 * sgAudio.duration; $('#spSeek').setAttribute('aria-valuetext', fmtT(sgAudio.currentTime) + ' / ' + fmtT(sgAudio.duration)); }
  });
  $('#spRate').onchange = e => { if(sgAudio) sgAudio.playbackRate = +e.target.value; };
}

/* ================= 启动 ================= */
function init(){
  migrateLegacyProgress();
  bindGlobal();
  bindSing();
  registerSW();
  const p = getProgress();
  if(p){
    const today = todayKey();
    if(p.goalDate !== today){ p.goalDate = today; p.goalToday = 0; p.goalWords = []; saveProgress(p); }
  }
  navigate(routeFromLocation(), {replace:true});
  initCloudSync();
  updateVoiceUI();
  maybeRemind();
  setTimeout(updateVoiceUI, 800);
}
document.addEventListener('DOMContentLoaded', init);
