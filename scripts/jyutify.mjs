/* ============================================================
   粵學堂 · 内容粤语正字化工具（简 → 港繁）
   ------------------------------------------------------------
   作用：把 data.js 中「粤语文本」字段（han / ex / ex2 /
   front / back / culture.food.title）从简体字形转为香港
   繁体正字；普通话对照（mand/exmand）、教学说明（meaning/
   story/desc/intro/语法讲解）与界面文案保留简体不动。

   用法：
     cd Cantonese && npm i opencc-js
     node scripts/jyutify.mjs            # 预览差异（dry-run）
     node scripts/jyutify.mjs --apply    # 写回 data.js
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'js/data.js');

let mod;
for (const base of [ROOT, '/Users/eachen/.workbuddy/binaries/node/workspace']) {
  try {
    mod = await import(path.join(base, 'node_modules/opencc-js/dist/umd/full.js'));
    break;
  } catch { /* try next */ }
}
if (!mod) {
  console.error('缺少 opencc-js，请先执行：cd Cantonese && npm i opencc-js');
  process.exit(1);
}
const { Converter } = mod.default ?? mod;
const hk = Converter({ from: 'cn', to: 'hk' });

/* ---- 字段级转换 ---- */
const TEXT_KEYS = 'han|ex|ex2|front|back';
const KEY_RE = new RegExp(`(\\b(?:${TEXT_KEYS})\\s*:\\s*')((?:[^'\\\\]|\\\\.)*)(')`, 'g');

function convertFields(text) {
  return text.replace(KEY_RE, (m, p1, p2, p3) => p1 + hk(p2) + p3);
}

/* ---- 顶层区块与各区块转换的字段（culture 内按子块细分） ---- */
const BLOCKS = [
  { start: 'initials: [',  end: 'finals: [',          keys: true },
  { start: 'finals: [',    end: 'tones: [',           keys: true },
  { start: 'tones: [',     end: 'vocabCategories: [', keys: true },
  { start: 'vocabCategories: [', end: 'dialogues: [', keys: true },
  { start: 'dialogues: [', end: 'grammar: [',         keys: true },
  { start: 'grammar: [',   end: 'culture: {',         keys: true },
  { start: 'culture: {',   end: 'sayings: [',         keys: false },
  { start: 'sayings: [',   end: 'xiehou: [',          keys: true },
  { start: 'xiehou: [',    end: 'life: [',            keys: true },
  { start: 'life: [',      end: 'festival: [',        keys: false },
  { start: 'festival: [',  end: 'food: [',            keys: true },
  { start: 'food: [',      end: 'tvb: [',             keys: 'title' },
  { start: 'tvb: [',       end: null,                 keys: true },
];

const src = fs.readFileSync(FILE, 'utf8');
let pos = 0;
let out = '';
for (const b of BLOCKS) {
  const i = src.indexOf(b.start, pos);
  if (i < 0) throw new Error('missing marker: ' + b.start);
  const segStart = i + b.start.length;
  let segEnd;
  if (b.end) {
    const j = src.indexOf(b.end, segStart);
    if (j < 0) throw new Error('missing end marker: ' + b.end);
    segEnd = j;
  } else {
    segEnd = src.length;
  }
  out += src.slice(pos, segStart);
  let seg = src.slice(segStart, segEnd);
  if (b.keys === true) seg = convertFields(seg);
  else if (b.keys === 'title') {
    seg = seg.replace(/(\btitle\s*:\s*')((?:[^'\\]|\\.)*)(')/g, (m, p1, p2, p3) => p1 + hk(p2) + p3);
  }
  out += seg;
  pos = segEnd;
}
out += src.slice(pos);

/* ---- 香港通行写法词级修正（opencc 机械转换的常见坑） ---- */
const FIXES = [
  [/麪/g, '麵'],            /* 香港通行「麵」 */
  [/缽/g, '砵'],            /* 砵仔糕、盆滿砵滿 */
  [/曬/g, '晒'],            /* 粤语语气词「晒」（唔該晒/食唔晒） */
  [/嚇/g, '吓'],            /* 粤语语气词「吓」（諗吓/咁上吓） */
  [/系/g, '係'],            /* 粤语表「是」的系（仅在文本字段内生效） */
];

/* FIXES 需在文本字段内应用：按 KEY_RE 捕获再修正，避免误伤注释/讲解 */
function applyFixes(text) {
  return text.replace(KEY_RE, (m, p1, p2, p3) => {
    for (const [re, rep] of FIXES) p2 = p2.replace(re, rep);
    return p1 + p2 + p3;
  });
}

/* FIXES 里的「系→係」只在文本字段内做（见 applyFixes），
   因此需先 convertFields 再 applyFixes。但上面 out 已含 convertFields，
   这里对文本字段再应用 fixes 即可： */
out = applyFixes(out);

if (process.argv.includes('--apply')) {
  fs.writeFileSync(FILE, out, 'utf8');
  console.log('已写回', FILE);
} else {
  const diffs = src.split('\n').filter((l, i) => out.split('\n')[i] !== l).length;
  console.log('dry-run：约', diffs, '行会变化。加 --apply 生效。');
}
