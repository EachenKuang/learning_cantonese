/* ============================================================
   粵學堂 · 数据完整性校验（零依赖，供 GitHub Actions CI 使用）
   ------------------------------------------------------------
   校验内容：
   1. 顶层板块结构完整（语音/词汇/对话/语法/文化）
   2. 词汇词条必备字段（han/jp/mand/ex/exmand）
   3. 歌词逐字对齐——每句 han 汉字数必须等于 jp 音节数
      （逐字注音正确性的生命线，见 README 开发指南）
   4. 粤拼音节格式（小写字母+数字声调结尾）

   用法：node scripts/verify-data.mjs
   通过退出码 0，失败退出码 1 并打印问题列表。
   ============================================================ */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ERRORS = [];
const WARNINGS = [];

function check(cond, msg) {
  if (!cond) ERRORS.push(msg);
}
function load(file) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;globalThis.__D = (typeof DATA !== "undefined") ? DATA : SONGS;', ctx);
  return ctx.__D;
}

const DATA = load(path.join(ROOT, 'js/data.js'));
const SONGS = load(path.join(ROOT, 'js/songs.js'));

/* ---- 1. 板块结构 ---- */
const want = { initials: 19, finals: 55, tones: 9, vocabCategories: 10, dialogues: 6, grammar: 10 };
for (const [k, n] of Object.entries(want)) {
  const got = Array.isArray(DATA[k]) ? DATA[k].length : Object.keys(DATA[k] || {}).length;
  check(got === n, `板块 ${k} 数量 ${got} != 预期 ${n}`);
}
for (const k of ['sayings', 'xiehou', 'life', 'festival', 'food', 'tvb']) {
  check(Array.isArray(DATA.culture?.[k]), `culture.${k} 缺失或不是数组`);
}
check(DATA.vocabCategories.every(c => c.id && c.name && Array.isArray(c.words) && c.words.length), '存在空的词汇分类');

/* ---- 2. 词汇字段完整性 ---- */
let wordCount = 0;
for (const cat of DATA.vocabCategories) {
  for (const w of cat.words) {
    wordCount++;
    for (const f of ['han', 'jp', 'mand', 'ex', 'exjp', 'exmand']) {
      check(typeof w[f] === 'string' && w[f].length > 0, `词条缺 ${f}: ${cat.name}/${w.han || '?'}`);
    }
    check(/^[a-z0-9 ]+$/.test(w.jp), `jp 含非法字符: ${w.han} → ${w.jp}`);
  }
}

/* ---- 3. 歌词逐字对齐（汉字数 == 音节数）---- */
let lineCount = 0;
for (const s of SONGS) {
  check(s.id && s.title && Array.isArray(s.lyric), `歌曲结构缺失: ${s.title || s.id || '?'}`);
  for (const l of s.lyric) {
    lineCount++;
    const hanChars = (l.han || '').match(/[\u3400-\u9fff]/g) || [];
    const syllables = (l.jp || '').split(/\s+/).filter(Boolean);
    check(hanChars.length === syllables.length,
      `歌词对齐失败 ${s.title}:「${l.han}」汉字 ${hanChars.length} != 音节 ${syllables.length} (${l.jp})`);
  }
}

/* ---- 4. 粤拼音节格式（字母+数字声调结尾）---- */
const SYLL_RE = /^[a-z]+[0-6]$/;
let badSyll = 0;
for (const cat of DATA.vocabCategories) {
  for (const w of cat.words) {
    for (const s of w.jp.split(/\s+/).filter(Boolean)) {
      if (!SYLL_RE.test(s)) { badSyll++; if (badSyll <= 10) WARNINGS.push(`音节格式可疑: ${w.han} → ${s}`); }
    }
  }
}

/* ---- 汇总 ---- */
console.log(`词汇 ${wordCount} 条 · 歌词 ${lineCount} 句 · 校验完成`);
if (WARNINGS.length) console.warn(`⚠ ${WARNINGS.length} 条警告（不阻塞）:\n  - ${WARNINGS.slice(0, 10).join('\n  - ')}`);
if (ERRORS.length) {
  console.error(`❌ ${ERRORS.length} 个问题:`);
  console.error('  - ' + ERRORS.slice(0, 20).join('\n  - '));
  process.exit(1);
}
console.log('✅ 全部通过');
