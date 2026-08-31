/* ============================================================
   粵學堂 · 数据完整性校验（零依赖，供 GitHub Actions CI 使用）
   ------------------------------------------------------------
   校验内容：
   0. 发布缓存版本（sw.js / index.html 对核心资源 ?v=N 一致）
   1. 顶层板块结构完整（语音/词汇/对话/语法/文化）
   2. 词汇词条必备字段、首尾空格、词头与例句粤拼对齐
   3. 歌曲练习数据锁定——歌曲 ID、句数和内容指纹不得意外变化；
      每句 han 汉字数必须等于 jp 音节数
   4. 主题课引用完整性（catId/words/dlgId/artId/lifeTitle 都能查到）
   5. 故事完整性（newWords 必须在词库中、逐句对齐、理解题答案合法）
   6. 简繁一致性：面向学习者的粤语文本用繁体
      —— 词汇/对话/故事/课程为强校验；语法与文化标题仅为警告（待人工校对）

   用法：node scripts/verify-data.mjs
   通过退出码 0，失败退出码 1 并打印问题列表。
   ============================================================ */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ERRORS = [];
const WARNINGS = [];

function check(cond, msg) {
  if (!cond) ERRORS.push(msg);
}
function warn(cond, msg) {
  if (!cond) WARNINGS.push(msg);
}
function load(file, globalName) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8') + `\n;globalThis.__D = ${globalName};`, ctx);
  return ctx.__D;
}

const DATA = load(path.join(ROOT, 'js/data.js'), 'DATA');
const SONGS = load(path.join(ROOT, 'js/songs.js'), 'SONGS');
const LESSONS = load(path.join(ROOT, 'js/lessons.js'), 'LESSONS');
const STORIES = load(path.join(ROOT, 'js/stories.js'), 'STORIES');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NGINX_CONF_SOURCE = fs.readFileSync(path.join(ROOT, 'deploy/jyut.kuangyichen.com.conf'), 'utf8');

/* ---- 通用工具 ---- */
/* 剥离括号注释：数字类词条会把「（量詞前多説"兩"）」这类说明写进 ex */
const stripNotes = s => String(s || '').replace(/[（(][^）)]*[）)]/g, '');
/* 可发音单位数 = 汉字数 + 拉丁字母串数（「唱K」的 K 读 kei1，要计入） */
const countUnits = s => {
  const t = stripNotes(s);
  return (t.match(/[\u3400-\u9fff]/g) || []).length + (t.match(/[A-Za-z]+/g) || []).length;
};
const syllables = s => String(s || '').split(/\s+/).filter(Boolean);
const SYLL_RE = /^[a-z]+[0-6]$/;

/* 常见简体字 → 繁体：用于检测粤语文本里的简体混入 */
const S2T = {
  楼:'樓', 饮:'飲', 点:'點', 虾:'蝦', 饺:'餃', 烧:'燒', 卖:'賣', 应:'應', 问:'問',
  话:'話', 单:'單', 几:'幾', 两:'兩', 铁:'鐵', 观:'觀', 厅:'廳', 边:'邊', 个:'個',
  讲:'講', 来:'來', 说:'說', 们:'們', 这:'這', 时:'時', 间:'間', 车:'車', 马:'馬',
  鸟:'鳥', 鱼:'魚', 鸡:'雞', 饭:'飯', 馆:'館', 汤:'湯', 药:'藥', 觉:'覺', 学:'學',
  国:'國', 电:'電', 机:'機', 号:'號', 钱:'錢', 买:'買', 长:'長', 门:'門', 开:'開',
  关:'關', 东:'東', 业:'業', 会:'會', 发:'發', 经:'經', 过:'過', 还:'還', 对:'對',
  实:'實', 岁:'歲', 华:'華', 书:'書', 让:'讓', 样:'樣', 给:'給', 结:'結', 网:'網',
  级:'級', 线:'線', 红:'紅', 绿:'綠', 蓝:'藍', 语:'語', 读:'讀', 课:'課', 题:'題',
  谢:'謝', 吗:'嗎', 么:'麼', 听:'聽', 见:'見', 头:'頭', 脑:'腦', 员:'員', 务:'務',
  复:'復', 习:'習', 练:'練', 验:'驗', 桥:'橋', 远:'遠', 园:'園', 团:'團', 场:'場',
  块:'塊', 币:'幣', 价:'價', 钟:'鐘', 声:'聲', 调:'調', 词:'詞', 从:'從', 与:'與',
  叹:'嘆', 帐:'帳', 账:'賬', 挞:'撻', 龙:'龍', 凤:'鳳', 龟:'龜', 号:'號', 汉:'漢'
};
const simplifiedIn = s => [...new Set([...String(s || '')].filter(ch => S2T[ch]))];

/* ---- 0. 发布缓存版本 ---- */
const cacheMatch = SW_SOURCE.match(/^const CACHE = 'canto-shell-v([0-9]+)';$/m);
check(cacheMatch, '无法解析 Service Worker 缓存版本');
const CORE_ASSETS = ['manifest.webmanifest', 'css/style.css', 'js/data.js', 'js/songs.js', 'js/lessons.js', 'js/stories.js', 'js/app.js'];
if (cacheMatch) {
  const cacheVersion = cacheMatch[1];
  for (const asset of CORE_ASSETS) {
    check(SW_SOURCE.includes(`${asset}?v=${cacheVersion}`), `sw.js 缓存版本不一致 / 缺少核心资源: ${asset}`);
    check(INDEX_SOURCE.includes(`${asset}?v=${cacheVersion}`), `index.html 缓存版本不一致 / 缺少核心资源: ${asset}`);
  }
}

/* ---- 0.5 Ackee 统计一致性（tracker、CSP、CORS 白名单三处必须对齐） ---- */
const ACKEE_ORIGIN = 'https://ackee.kuangyichen.com';
/* Ackee 3.x 的 tracker 读 data-ackee-domain-id（v2 才是 data-ackee-domain，写错会静默不上报） */
const ackeeTracker = INDEX_SOURCE.match(/data-ackee-domain-id="([0-9a-f-]{36})"/);
if (ackeeTracker) {
  check(!/data-ackee-domain="/.test(INDEX_SOURCE),
    'index.html 仍在用 v2 写法 data-ackee-domain；Ackee 3.x 只认 data-ackee-domain-id，否则静默不统计');
  check(INDEX_SOURCE.includes(`data-ackee-server="${ACKEE_ORIGIN}"`),
    `Ackee tracker 的 data-ackee-server 与预期不符（应为 ${ACKEE_ORIGIN}）`);
  check(/script-src[^;]*ackee\.kuangyichen\.com/.test(NGINX_CONF_SOURCE),
    'nginx conf 的 CSP script-src 未放行 Ackee 域，tracker.js 会被浏览器拦截');
  check(/connect-src[^;]*ackee\.kuangyichen\.com/.test(NGINX_CONF_SOURCE),
    'nginx conf 的 CSP connect-src 未放行 Ackee 域，统计 beacon 会被拦截');
  check(NGINX_CONF_SOURCE.includes('map $http_origin $ackee_cors_origin'),
    'nginx conf 缺少 $ackee_cors_origin map（Ackee 的 CORS 白名单）');
} else {
  WARNINGS.push('index.html 未检测到 Ackee tracker（如为有意移除请忽略）');
}

/* ---- 1. 板块结构 ---- */
const want = { initials: 19, finals: 55, tones: 9, vocabCategories: 11, dialogues: 9, grammar: 10 };
for (const [k, n] of Object.entries(want)) {
  const got = Array.isArray(DATA[k]) ? DATA[k].length : Object.keys(DATA[k] || {}).length;
  check(got === n, `板块 ${k} 数量 ${got} != 预期 ${n}`);
}
for (const k of ['sayings', 'xiehou', 'life', 'festival', 'food', 'tvb']) {
  check(Array.isArray(DATA.culture?.[k]), `culture.${k} 缺失或不是数组`);
}
check(DATA.vocabCategories.every(c => c.id && c.name && Array.isArray(c.words) && c.words.length), '存在空的词汇分类');
check(DATA.dialogues.every(d => d.id && d.title && d.emoji && d.level && d.desc
  && Array.isArray(d.tags) && d.tags.length
  && Array.isArray(d.lines) && d.lines.length), '存在结构不完整的对话场景');

for (const d of DATA.dialogues) {
  for (const [i, line] of d.lines.entries()) {
    for (const f of ['speaker', 'han', 'jp', 'mand']) {
      check(typeof line[f] === 'string' && line[f].length > 0,
        `对话台词缺 ${f}: ${d.title}/第 ${i + 1} 句`);
    }
    check(simplifiedIn(line.han).length === 0,
      `对话台词混入简体: ${d.title}/第 ${i + 1} 句「${line.han}」→ ${simplifiedIn(line.han).join('')}`);
  }
}

/* ---- 2. 词汇字段完整性 / 首尾空格 / 粤拼对齐 ---- */
let wordCount = 0;
for (const cat of DATA.vocabCategories) {
  for (const w of cat.words) {
    wordCount++;
    for (const f of ['han', 'jp', 'mand', 'ex', 'exjp', 'exmand']) {
      check(typeof w[f] === 'string' && w[f].length > 0, `词条缺 ${f}: ${cat.name}/${w.han || '?'}`);
    }
    check(/^[a-z0-9 ]+$/.test(w.jp), `jp 含非法字符: ${w.han} → ${w.jp}`);
    /* 首尾空格：会污染 TTS 文本与显示（曾出现 jp:' ngan4 zi2'） */
    for (const f of ['han', 'jp', 'ex', 'exjp']) {
      check(w[f] === w[f].trim(), `字段首尾有空格: ${cat.name}/${w.han} [${f}] → ${JSON.stringify(w[f])}`);
    }
    /* 词头对齐：han 可发音单位数 == jp 音节数 */
    const headUnits = countUnits(w.han), headSyl = syllables(w.jp).length;
    check(headUnits === headSyl,
      `词头注音不对齐 ${cat.name}/${w.han}：${headUnits} 字 != ${headSyl} 音节 (${w.jp})`);
    /* 例句对齐 */
    const exUnits = countUnits(w.ex), exSyl = syllables(w.exjp).length;
    check(exUnits === exSyl,
      `例句注音不对齐 ${cat.name}/${w.han}：「${w.ex}」${exUnits} 字 != ${exSyl} 音节 (${w.exjp})`);
    /* 音节格式 */
    for (const s of syllables(w.jp).concat(syllables(w.exjp))) {
      const t = s.replace(/[.,!?;:。，！？；：]/g, '');
      if (t) check(SYLL_RE.test(t), `粤拼音节格式可疑: ${cat.name}/${w.han} → ${s}`);
    }
    check(simplifiedIn(w.han).length === 0,
      `词头混入简体: ${cat.name}/${w.han} → ${simplifiedIn(w.han).join('')}`);
    check(simplifiedIn(w.ex).length === 0,
      `例句混入简体: ${cat.name}/${w.han}「${w.ex}」→ ${simplifiedIn(w.ex).join('')}`);
  }
}

/* ---- 3. 歌曲数据锁定 + 歌词逐字对齐（汉字数 == 音节数）---- */
const SONG_LYRIC_BASELINE = {
  ocean:       {lines:13, sha256:'6495facbc987be38899eba958a38b5afdc6edad50c5cb0efeddf3daa97924dc3'},
  qianqian:    {lines:20, sha256:'60365f6563e9fe18dc9b7292755da5b7983cd5c3926b0c94874b00fcdf860472'},
  redsun:      {lines:16, sha256:'120d5e8d4c6454179260915c666bc1b6f611a6c564ee503cafc4fbb7f9f02783'},
  lihuanxi:    {lines:11, sha256:'e8ee6bfca975edf4f1b546073178271d79109a22c87610029aa8fc81a2a95aac'},
  zhenai:      {lines:11, sha256:'c86e671b9d508511c5909a32199ed878bca2e48ddb603037ada58b4304d4b940'},
  glory:       {lines:15, sha256:'d69d311ddd8703d7f5aac50cb1409728f6f3bd284924a53700d1ee49bd6a6a5b'},
  shanghai:    {lines:9,  sha256:'7669a176c711644f86f9ceabf96dec10218dcd6df84742f36d859f062e7feb51'},
  lion:        {lines:9,  sha256:'c9f84aafd529df080442b77fb86f9e8e097ae6f8a5caf4697d14c47a80ad5f03'},
  manbu:       {lines:11, sha256:'5f3f065c6b6d20ca7ff9ea0cc097f6cca70ebaf7c2736325104751d0de2e070e'},
  pianpian:    {lines:14, sha256:'b2a549edda0972e745e3898a6ed123893431aaf67b5527ac2e8d3295a123c0b0'},
  fenfenzhong: {lines:9,  sha256:'1c142cb446ba8cc8075140a27d2de2bc48e9362e72bc62aa3b55656d708e23bd'},
};
let lineCount = 0;
for (const s of SONGS) {
  check(s.id && s.title && Array.isArray(s.lyric), `歌曲结构缺失: ${s.title || s.id || '?'}`);
  const baseline = SONG_LYRIC_BASELINE[s.id];
  check(!!baseline, `歌曲不在锁定清单中: ${s.id || s.title || '?'}`);
  if (baseline) {
    check(s.lyric.length === baseline.lines,
      `歌曲句数发生变化 ${s.title}: ${s.lyric.length} != ${baseline.lines}`);
    const payload = JSON.stringify(s.lyric.map(({han, jp, mand, d}) => ({han, jp, mand, d})));
    const digest = createHash('sha256').update(payload).digest('hex');
    check(digest === baseline.sha256,
      `歌曲内容指纹发生变化 ${s.title}；请人工核对后再更新基线`);
  }
  for (const l of s.lyric) {
    lineCount++;
    const hanChars = countUnits(l.han);
    const syl = syllables(l.jp).length;
    check(hanChars === syl,
      `歌词对齐失败 ${s.title}:「${l.han}」汉字 ${hanChars} != 音节 ${syl} (${l.jp})`);
  }
}
for (const id of Object.keys(SONG_LYRIC_BASELINE)) {
  check(SONGS.some(s => s.id === id), `锁定歌曲缺失: ${id}`);
}

/* ---- 4. 主题课引用完整性 ---- */
const lessonIds = new Set();
for (const L of LESSONS) {
  check(L.id && L.title && Array.isArray(L.steps) && L.steps.length, `主题课结构缺失: ${L.id || '?'}`);
  check(!lessonIds.has(L.id), `主题课 id 重复: ${L.id}`);
  lessonIds.add(L.id);
  for (const st of L.steps) {
    if (st.type === 'vocab') {
      const cat = DATA.vocabCategories.find(c => c.id === st.catId);
      check(!!cat, `主题课「${L.title}」catId 不存在: ${st.catId}`);
      if (cat) {
        for (const han of st.words || []) {
          check(cat.words.some(x => x.han === han),
            `主题课「${L.title}」引用词不存在: ${st.catId}/${han}`);
        }
      }
    }
    if (st.type === 'dialogue') {
      check(DATA.dialogues.some(d => d.id === st.dlgId),
        `主题课「${L.title}」dlgId 不存在: ${st.dlgId}`);
    }
    if (st.type === 'grammar') {
      check(DATA.grammar.some(g => g.id === st.artId),
        `主题课「${L.title}」artId 不存在: ${st.artId}`);
    }
    if (st.type === 'culture') {
      /* lifeTitle 是查表键，必须与 DATA.culture.life[].title 完全一致 */
      check(DATA.culture.life.some(x => x.title === st.lifeTitle),
        `主题课「${L.title}」lifeTitle 在 culture.life 中不存在: ${st.lifeTitle}（不匹配会静默回退到第一条）`);
    }
    if (st.type === 'tones') {
      for (const p of st.pairs || []) {
        check(p.a?.han && p.a?.jp && p.b?.han && p.b?.jp && ['a', 'b'].includes(p.ans),
          `主题课「${L.title}」声调题结构不完整: ${JSON.stringify(p)}`);
      }
    }
    if (st.type === 'quiz') {
      for (const q of st.questions || []) {
        check(Array.isArray(q.opts) && q.opts.length >= 2 && Number.isInteger(q.ans)
          && q.ans >= 0 && q.ans < q.opts.length,
          `主题课「${L.title}」理解题答案越界: ${q.q}`);
      }
    }
  }
  /* 面向学习者的展示文本用繁体（lifeTitle 是查表键，不在此列） */
  for (const f of ['title', 'desc']) {
    check(simplifiedIn(L[f]).length === 0,
      `主题课 ${f} 混入简体: ${L[f]} → ${simplifiedIn(L[f]).join('')}`);
  }
  for (const st of L.steps) {
    check(simplifiedIn(st.title).length === 0,
      `主题课步骤标题混入简体: ${L.title}/${st.title} → ${simplifiedIn(st.title).join('')}`);
    for (const p of st.pairs || []) check(simplifiedIn(p.ask).length === 0, `主题课题干混入简体: ${p.ask}`);
    for (const q of st.questions || []) {
      check(simplifiedIn(q.q).length === 0, `主题课理解题题干混入简体: ${q.q}`);
      for (const o of q.opts || []) check(simplifiedIn(o).length === 0, `主题课选项混入简体: ${o}`);
    }
  }
}

/* ---- 5. 故事完整性 ---- */
const storyIds = new Set();
const vocabHans = new Set(DATA.vocabCategories.flatMap(c => c.words.map(w => w.han)));
for (const s of STORIES) {
  check(s.id && s.title && Array.isArray(s.lines) && s.lines.length, `故事结构缺失: ${s.id || '?'}`);
  check(!storyIds.has(s.id), `故事 id 重复: ${s.id}`);
  storyIds.add(s.id);
  for (const [i, l] of (s.lines || []).entries()) {
    const units = countUnits(l.han), syl = syllables(l.jp).length;
    check(units === syl,
      `故事逐句对齐失败 ${s.id}/第 ${i + 1} 句：「${l.han}」${units} 字 != ${syl} 音节 (${l.jp})`);
    check(simplifiedIn(l.han).length === 0,
      `故事正文混入简体 ${s.id}/第 ${i + 1} 句：「${l.han}」→ ${simplifiedIn(l.han).join('')}`);
  }
  /* 生词必须在词库中，否则读完无法入复习计划（曾出现 侍應 缺失） */
  for (const nw of s.newWords || []) {
    check(vocabHans.has(nw), `故事「${s.title}」生词不在词库中，读完无法入复习计划: ${nw}`);
  }
  for (const q of s.quiz || []) {
    check(Array.isArray(q.opts) && q.opts.length >= 2 && Number.isInteger(q.ans)
      && q.ans >= 0 && q.ans < q.opts.length, `故事理解题答案越界: ${s.id}/${q.q}`);
    check(simplifiedIn(q.q).length === 0, `故事题干混入简体: ${q.q} → ${simplifiedIn(q.q).join('')}`);
    for (const o of q.opts || []) check(simplifiedIn(o).length === 0, `故事选项混入简体: ${o}`);
  }
  check(simplifiedIn(s.intro).length === 0, `故事导语混入简体: ${s.intro} → ${simplifiedIn(s.intro).join('')}`);
}

/* ---- 6. 语法与文化标题：简体仅警告（存量内容，待人工校对） ---- */
let legacySimplified = 0;
for (const g of DATA.grammar) {
  const bad = simplifiedIn(g.title);
  if (bad.length) { legacySimplified++; warn(false, `语法标题为简体（待人工校对）: ${g.title}`); }
}
for (const x of DATA.culture.life) {
  const bad = simplifiedIn(x.title);
  if (bad.length) { legacySimplified++; warn(false, `文化标题为简体（待人工校对）: ${x.title}`); }
}

/* ---- 汇总 ---- */
console.log(`词汇 ${wordCount} 条 · 歌词 ${lineCount} 句 · 主题课 ${LESSONS.length} 节 · 故事 ${STORIES.length} 篇 · 校验完成`);
if (legacySimplified) console.log(`   （另有 ${legacySimplified} 处简体标题为存量内容，列入警告）`);
if (WARNINGS.length) console.warn(`⚠ ${WARNINGS.length} 条警告（不阻塞）:\n  - ${WARNINGS.slice(0, 10).join('\n  - ')}`);
if (ERRORS.length) {
  console.error(`❌ ${ERRORS.length} 个问题:`);
  console.error('  - ' + ERRORS.slice(0, 25).join('\n  - '));
  process.exit(1);
}
console.log('✅ 全部通过');
