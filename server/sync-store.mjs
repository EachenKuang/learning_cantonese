import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const DATA_FILE = process.env.JYUT_SYNC_DATA_FILE || path.join(process.cwd(), 'sync-data', 'store.json');
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let state;
let writeChain = Promise.resolve();

function emptyStore(){ return {schemaVersion:1, users:{}, sessions:{}}; }

export async function initStore(){
  await mkdir(path.dirname(DATA_FILE), {recursive:true, mode:0o700});
  try{
    state = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  }catch(error){
    if(error.code !== 'ENOENT') throw error;
    state = emptyStore();
    await persist();
  }
  if(!state.users) state.users = {};
  if(!state.sessions) state.sessions = {};
  return state;
}

async function persist(){
  const serialized = JSON.stringify(state, null, 2) + '\n';
  const tmp = `${DATA_FILE}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeChain = writeChain.then(async () => {
    await writeFile(tmp, serialized, {mode:0o600});
    await rename(tmp, DATA_FILE);
  });
  return writeChain;
}

export function getState(){ if(!state) throw new Error('store_not_initialized'); return state; }

export async function reloadStore(){
  await writeChain;
  state = null;
  return initStore();
}

export async function mutate(mutator){
  const result = mutator(getState());
  await persist();
  return result;
}

export function normalizeUserId(value){
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,39}$/.test(id) ? id : null;
}

export async function hashPassword(password){
  if(typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('password_length');
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return {algorithm:'scrypt', salt:salt.toString('base64'), hash:Buffer.from(hash).toString('base64'), params:{N:SCRYPT.N,r:SCRYPT.r,p:SCRYPT.p}};
}

export async function verifyPassword(password, record){
  if(!record || record.algorithm !== 'scrypt' || typeof password !== 'string') return false;
  try{
    const salt = Buffer.from(record.salt, 'base64');
    const expected = Buffer.from(record.hash, 'base64');
    const params = record.params || SCRYPT;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, {...params, maxmem:SCRYPT.maxmem}));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }catch(_){ return false; }
}

export function tokenHash(token){ return createHash('sha256').update(token).digest('hex'); }
export function newSessionToken(){ return randomBytes(32).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }

export function sanitizeProfile(raw){
  const strList = (value, max=500) => Array.isArray(value) ? [...new Set(value.filter(x=>typeof x==='string').map(x=>x.slice(0,160)).slice(0,max))] : [];
  const checkins = {};
  if(raw?.checkins && typeof raw.checkins === 'object'){
    Object.entries(raw.checkins).slice(0,1500).forEach(([key,value])=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(key) && value) checkins[key]=true; });
  }
  const practices = Array.isArray(raw?.practices) ? raw.practices.slice(0,60).map(x=>({
    ico:String(x?.ico||'🎤').slice(0,12), label:String(x?.label||'练习').slice(0,80),
    score:Math.max(0,Math.min(100,Number(x?.score)||0)), time:Number(x?.time)||Date.now()
  })) : [];
  const activities = Array.isArray(raw?.activities) ? raw.activities.slice(0,6).map(x=>({
    icon:String(x?.icon||'📖').slice(0,12), title:String(x?.title||'学习记录').slice(0,80),
    sub:String(x?.sub||'').slice(0,120), route:String(x?.route||'home').slice(0,24), time:Number(x?.time)||Date.now()
  })) : [];
  /* SRS 复习计划：box 1-5 / due 日期 / updatedAt 时间戳（多设备合并靠它裁决） */
  const reviews = {};
  if(raw?.reviews && typeof raw.reviews === 'object'){
    Object.entries(raw.reviews).slice(0,2000).forEach(([key, value])=>{
      if(typeof key !== 'string' || !key || key.length > 200) return;
      const box = Math.max(0, Math.min(5, Number(value?.box) || 1));
      const due = typeof value?.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? value.due : null;
      if(!due) return;
      reviews[key] = {
        box,
        due,
        updatedAt: Math.max(0, Number(value?.updatedAt) || 0)
      };
    });
  }
  /* 主题课进度：{ lessonId: {step, done} } —— 跨设备续学依赖它 */
  const lessonProgress = {};
  if(raw?.lessonProgress && typeof raw.lessonProgress === 'object'){
    Object.entries(raw.lessonProgress).slice(0,100).forEach(([key, value])=>{
      /* 课程 id 是 slug（如 tea-house），非法 key 直接丢弃，避免脏数据占位 */
      if(typeof key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) return;
      lessonProgress[key] = {
        step: Math.max(0, Math.min(50, Number(value?.step) || 0)),
        done: !!value?.done
      };
    });
  }
  return {
    favorites:strList(raw?.favorites), learned:strList(raw?.learned), practices,
    quiz:Array.isArray(raw?.quiz) ? raw.quiz.slice(0,100) : [], dialogues:strList(raw?.dialogues,100),
    checkins, lastCheckin:typeof raw?.lastCheckin==='string'?raw.lastCheckin:null,
    streak:Math.max(0,Math.min(3650,Number(raw?.streak)||0)),
    goalCount:Math.max(1,Math.min(100,Number(raw?.goalCount)||10)),
    goalDate:typeof raw?.goalDate==='string'?raw.goalDate:null,
    goalToday:Math.max(0,Math.min(100,Number(raw?.goalToday)||0)), goalWords:strList(raw?.goalWords,100),
    reminder:!!raw?.reminder, reminderSentDate:typeof raw?.reminderSentDate==='string'?raw.reminderSentDate:null,
    reviews, activities, lastStudyDate:typeof raw?.lastStudyDate==='string'?raw.lastStudyDate:null,
    lessonProgress, stories:strList(raw?.stories, 50),
    modifiedAt:Math.max(0,Number(raw?.modifiedAt)||0)
  };
}

/* 按词合并多设备复习记录：同 key 取 updatedAt 较新者（防旧设备整包覆盖新计划） */
export function mergeReviews(base = {}, incoming = {}){
  if(!base || typeof base !== 'object') base = {};
  if(!incoming || typeof incoming !== 'object') return base;
  const out = { ...base };
  for(const [key, value] of Object.entries(incoming)){
    if(typeof key !== 'string' || !key || !value || typeof value !== 'object') continue;
    const current = out[key];
    if(!current || (Number(value.updatedAt) || 0) >= (Number(current.updatedAt) || 0)) out[key] = value;
  }
  return out;
}

/* 按课合并主题课进度：同 lessonId 取进度较后者（防旧设备把已完成的课打回第 1 步） */
export function mergeLessonProgress(base = {}, incoming = {}){
  if(!base || typeof base !== 'object') base = {};
  if(!incoming || typeof incoming !== 'object') return base;
  const out = { ...base };
  for(const [key, value] of Object.entries(incoming)){
    if(typeof key !== 'string' || !key || !value || typeof value !== 'object') continue;
    const current = out[key];
    if(!current){ out[key] = value; continue; }
    const inDone = !!value.done, curDone = !!current.done;
    if(inDone !== curDone) out[key] = inDone ? value : current;   /* 已完成优先保留 */
    else out[key] = (Number(value.step) || 0) >= (Number(current.step) || 0) ? value : current;
  }
  return out;
}

/* 已读故事取并集（读完就是读完，不应被另一台设备抹掉） */
export function mergeStories(base = [], incoming = []){
  const merged = new Set([...(Array.isArray(base) ? base : []), ...(Array.isArray(incoming) ? incoming : [])]
    .filter(x => typeof x === 'string' && x));
  return [...merged].slice(0, 50);
}
