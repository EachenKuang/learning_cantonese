/* ============================================================
   粵學堂 · 云端档案自动备份
   ------------------------------------------------------------
   - 每日备份 store.json → backups/store-YYYY-MM-DD.json
   - 每周日额外生成 weekly-YYYY-MM-DD.json 周备份
   - 保留最近 7 个日备份 + 4 个周备份，自动清理过期
   - 备份前后均校验 JSON 可读取（损坏即失败退出，不静默）
   - 文件权限 0600（含密码哈希与会话令牌）
   - 异地保存加密：设置环境变量 JYUT_BACKUP_KEY（32 字节 hex）后
     备份改用 AES-256-GCM 加密，落盘为 .enc 后缀（此时不再落明文副本）

   运行：node server/backup-store.mjs
   systemd：deploy/jyut-backup.service + jyut-backup.timer（每日 03:17）
   ============================================================ */
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCipheriv, randomBytes } from 'node:crypto';
import { DATA_FILE } from './sync-store.mjs';

const BACKUP_DIR = process.env.JYUT_BACKUP_DIR || path.join(path.dirname(DATA_FILE), 'backups');
const DAILY_KEEP = 7;
const WEEKLY_KEEP = 4;
const ENCRYPT_KEY = process.env.JYUT_BACKUP_KEY || '';

function dayKey(d = new Date()){ return d.toISOString().slice(0, 10); }
function isSunday(d = new Date()){ return d.getDay() === 0; }
function validateJson(file){
  try { JSON.parse(readFileSync(file, 'utf8')); return true; } catch (_) { return false; }
}

/* 加密（可选）：AES-256-GCM，输出 base64(iv|tag|ciphertext) */
function encryptText(text){
  if(!ENCRYPT_KEY) return { text, encrypted: false };
  if(!/^[0-9a-f]{64}$/i.test(ENCRYPT_KEY)) throw new Error('JYUT_BACKUP_KEY 必须是 32 字节 hex（64 位十六进制）');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPT_KEY, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { text: Buffer.concat([iv, tag, enc]).toString('base64'), encrypted: true };
}

const raw = await readFile(DATA_FILE, 'utf8');
/* 备份前校验源文件 JSON 可读 */
JSON.parse(raw);

await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });

const today = dayKey();
const dailyName = `store-${today}.json`;
const encrypted = encryptText(raw);
const dailyPath = path.join(BACKUP_DIR, encrypted.encrypted ? dailyName + '.enc' : dailyName);
await writeFile(dailyPath, encrypted.text, { mode: 0o600 });
if(!encrypted.encrypted){
  /* 明文备份校验副本可读 */
  JSON.parse(await readFile(dailyPath, 'utf8'));
}

let weeklyWritten = false;
if(isSunday()){
  const weeklyName = `weekly-${today}.json`;
  const weeklyPath = path.join(BACKUP_DIR, encrypted.encrypted ? weeklyName + '.enc' : weeklyName);
  await writeFile(weeklyPath, encrypted.text, { mode: 0o600 });
  weeklyWritten = true;
}

/* 清理过期备份（明文 .json 与加密 .json.enc 都要清理，否则启用加密后旧文件会无限堆积） */
const files = await readdir(BACKUP_DIR);
const isBackupFile = f => f.endsWith('.json') || f.endsWith('.json.enc');
const prune = (prefix, keep) => {
  const list = files.filter(f => f.startsWith(prefix) && isBackupFile(f)).sort();
  while(list.length > keep){
    const gone = path.join(BACKUP_DIR, list.shift());
    unlink(gone).catch(() => {});
  }
};
prune('store-', DAILY_KEEP);
prune('weekly-', WEEKLY_KEEP);

console.log(`[backup] ${today} 完成：${encrypted.encrypted ? '加密' : '明文'}日备份${weeklyWritten ? ' + 周备份' : ''} → ${BACKUP_DIR}（保留 ${DAILY_KEEP} 日 / ${WEEKLY_KEEP} 周）`);
