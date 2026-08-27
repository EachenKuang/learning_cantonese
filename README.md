# 粵學堂 · 粤语学习工坊

从零到进阶的粤语学习网站：粤拼音标、场景词汇、对话实战、学唱粤语歌、语法专栏、文化趣知、进度追踪。
**識聽識講，港味十足。**

> 在线体验：https://8ebeb2eab42748df95b6c0d1a7df308c.app.workbuddy.link
> （纯前端静态站，手机扫码即可使用；支持安装为 PWA 应用）

---

## ✨ 功能特性

| 模块 | 说明 |
|------|------|
| 🎙️ 语音学习 | 19 声母 / 55 韵母 / 9 声调（含入声），点卡片听标准音，麦克风录音对比评估（时长+音量+声调自查）；**六档朗读语速**（0.5×~2×，全局生效并记忆） |
| 📖 场景词汇 | 8 大生活场景 94 个高频词，逐词粤拼+例句+普通话对照；搜索、收藏、听力小测（8 题听音选义） |
| 💬 对话实战 | 6 个场景（茶楼/街市/巴士/茶餐厅/问路/睇医生），逐句跟读录音 + 角色扮演（自动播对方台词→你读→看答案） |
| 🎵 学唱粤语歌 | **11 首经典全曲歌词**（138 句逐字 ruby 注音，汉字上方标粤拼），TTS 示范/录音跟唱/单句循环/自动跟唱/**全文注音视图**；支持导入本地 mp3 整曲播放（KTV 模式）；歌词常用字词小词典 |
| 🧩 语法专栏 | 10 讲：量词、语气词、动词体貌、系字、虚词、比较句、否定、疑问词、程度副词、叠字 |
| 🏮 文化趣知 | 6 俗语 + 5 歇后语 + 8 港式文化（茶餐厅/叮叮车/大排档/打小人…） |
| 📊 学习进度 | 本地账号（浏览器存储）、连续打卡、每日目标环、收藏管理、练习历史、通知提醒 |

**平台能力**：PWA（可安装、离线可用）、响应式（桌面侧边栏 / 移动端底部导航）、明暗双主题、语音诊断面板（排查设备粤语语音包）。

---

## 🏗️ 架构

### 当前架构（已上线）：纯静态 + 浏览器本地能力

```
CloudStudio 静态托管（HTTPS · PWA · Service Worker 缓存）
        │  下发 HTML/CSS/JS
        ▼
浏览器 ── 前端应用（7 大模块，单页应用）
        ├── Web Speech API → 粤语朗读（依赖设备语音包；无粤语时回退普通话并提示）
        ├── MediaRecorder → 录音对比评估
        ├── 浏览器本地存储 → 账号 / 进度 / 收藏 / 打卡
        └── 导入 mp3 → 整曲播放（本机、不上传）
```

特点：部署极简、零服务器成本、数据全在用户浏览器。短板：安卓设备需手动安装粤语语音包。

### 演进架构：云端粤语 TTS（双通道，代码已备好待部署）

```
浏览器 speak()
 ├─ 检测到本地粤语语音包 → 本地 Web Speech（零延迟、离线）       ← 通道 A
 └─ 没有 → 请求你的服务器 TTS 代理（server/tts-proxy.mjs）      ← 通道 B
              │  /tts?text=…&voice=…&rate=…
              ▼
      你的服务器 · tts-proxy（Node 单文件）
       ├── 引擎层：Edge TTS（免注册，默认）/ MiMo TTS（官方粤语音色）
       ├── 磁盘缓存 tts-cache：同一句只合成一次（命中 0.002s）
       └── API Key 只存服务器
              │  返回 mp3
              ▼
       浏览器播放 + IndexedDB 音频缓存（离线可重播）
```

详见 [server/README.md](server/README.md)。

---

## 📁 目录结构

```
.
├── index.html                 # 单页应用骨架（7 个页面）
├── css/style.css              # 「纸墨霓虹」港式设计系统 + 响应式
├── js/
│   ├── app.js                 # 应用逻辑：路由/语音/录音评估/各模块/进度系统
│   ├── data.js                # 学习内容：音标/词汇/对话/语法/文化
│   └── songs.js               # 粤语歌数据：11 首全曲歌词 + 发音难点 + 歌词词典
├── icons/                     # PWA 图标（SVG 源文件 + 多尺寸 PNG）
├── manifest.webmanifest       # PWA 清单
├── sw.js                      # Service Worker（导航网络优先 + 静态缓存后台刷新）
└── server/
    ├── tts-proxy.mjs          # 自建云端粤语 TTS 代理（Edge TTS 引擎）
    ├── package.json
    └── README.md              # TTS 代理部署文档
```

---

## 🚀 快速开始（本地开发）

纯静态项目，**无需构建、无需安装依赖**：

```bash
# 方式一：任意静态服务器
cd learning_cantonese
python3 -m http.server 4173
# 打开 http://localhost:4173

# 方式二：Node 单行
npx serve .
```

> 提示：直接用 `file://` 打开 index.html 也可，但**录音功能需要 localhost 或 HTTPS** 才可用。

## 📦 部署

### 1. 静态站托管（网站本身）

- **现状**：CloudStudio 静态托管（HTTPS，即线上地址）
- **可选**：GitHub Pages / Vercel / Netlify（仓库根目录即站点根目录）

### 2. 云端 TTS 代理（可选，解决安卓粤语语音）

部署 `server/` 到任意 Node 服务器，详见 [server/README.md](server/README.md)。

---

## 🛠️ 开发指南

### 添加一个新词汇

在 `js/data.js` 对应场景分类的 `words` 数组追加：

```js
{ han:'食饭', jp:'sik6 faan6', mand:'吃饭',
  ex:'食咗饭未呀？', exjp:'sik6 zo2 faan6 mei6 aa3', exmand:'吃饭了吗？' }
```

### 添加一首新歌

1. 在 `js/songs.js` 的 `SONGS` 数组追加歌曲对象：`{ id, title, artist, year, emoji, level, tags, colors:[c1,c2], intro, lyric:[...], notes:[...] }`
2. `lyric` 每句格式：`{ han:'粤语歌词', jp:'jat1 zeon6 zi2', mand:'普通话释义', d:5.5 }`（`d` 为建议演唱时长秒）
3. **必须跑对齐校验**（逐字注音正确性的生命线——汉字数必须等于粤拼音节数）：

```bash
node -e "
const fs=require('fs');
fs.writeFileSync('/tmp/sc.cjs', fs.readFileSync('js/songs.js','utf8')+'\nmodule.exports={SONGS};');
const {SONGS}=require('/tmp/sc.cjs');
const hc=s=>(s.match(/[\u4e00-\u9fff]/g)||[]).length, jc=s=>(s.trim().match(/[a-z0-9]+/gi)||[]).length;
let bad=[];
SONGS.forEach(song=>song.lyric.forEach((l,i)=>{ if(hc(l.han)!==jc(l.jp)) bad.push(song.title+' 第'+(i+1)+'句: '+l.han+' | '+l.jp); }));
console.log(bad.length? '❌ '+bad.join('\n') : '✅ 全部对齐');
"
```

### 修改内容后的发布流程（重要约定）

1. 修改代码/数据
2. **把 `sw.js` 顶部 `canto-shell-vX` 版本号 +1**（否则老用户浏览器会命中旧缓存，看不到更新）
3. 提交推送：

```bash
git add -A && git commit -m "描述" && git push
```

4.（如托管在 CloudStudio）重新部署。

### 前端技术约定

- 数据驱动：所有内容在 `js/data.js` / `js/songs.js`，改数据即改内容
- 朗读：统一走 `speak(text)`（`js/app.js`），全局语速 `speechRate`（0.5~2 六档，localStorage 记忆）；新增朗读调用**不要写死 rate**
- 逐字注音：`annotateRuby(han, jp)` 生成 `<ruby>字<rt>粤拼</rt></ruby>`
- 录音评估：`evalRecord()` + `renderFeedback()`（时长 50% + 音量 30% + 声调自查 20%）

---

## 📄 版权与许可

- 歌词（`js/songs.js`）版权归原作者所有，**仅供学习使用**；粤拼与普通话释义为本项目整理，如有出入以官方原版为准
- 项目代码采用仓库内 [LICENSE](LICENSE) 许可
