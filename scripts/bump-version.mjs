/* ============================================================
   粵學堂 · 发布缓存版本一键升级
   ------------------------------------------------------------
   同步更新三处（防止 CI verify-data.mjs 报"缓存版本不一致"）：
   1. sw.js  CACHE 版本号（canto-shell-vN）
   2. sw.js  CORE 缓存数组里的资源 ?v=N
   3. index.html 资源引用 ?v=N

   用法：
     node scripts/bump-version.mjs          # 自动 +1
     node scripts/bump-version.mjs 18       # 指定版本号
   跑完建议立即：node scripts/verify-data.mjs 复核
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swPath = path.join(ROOT, 'sw.js');
const htmlPath = path.join(ROOT, 'index.html');

const sw = fs.readFileSync(swPath, 'utf8');
const m = sw.match(/^const CACHE = 'canto-shell-v([0-9]+)';$/m);
if (!m) { console.error('❌ 无法解析 sw.js 当前缓存版本'); process.exit(1); }

const cur = +m[1];
const next = process.argv[2] ? String(parseInt(process.argv[2], 10)) : String(cur + 1);
if (!/^[0-9]+$/.test(next)) { console.error('❌ 版本号必须是数字'); process.exit(1); }

/* sw.js：CACHE 版本 + CORE 数组资源版本 */
let s = sw.replace(/^const CACHE = 'canto-shell-v[0-9]+';$/m, `const CACHE = 'canto-shell-v${next}';`);
s = s.replace(/(\?v=)[0-9]+/g, `$1${next}`);
fs.writeFileSync(swPath, s);

/* index.html：资源引用版本 */
let h = fs.readFileSync(htmlPath, 'utf8');
h = h.replace(/(\?v=)[0-9]+/g, `$1${next}`);
fs.writeFileSync(htmlPath, h);

console.log(`✅ 缓存版本 ${cur} → ${next}（sw.js CACHE + CORE 数组 + index.html 引用已同步）`);
console.log('   复核：node scripts/verify-data.mjs');
