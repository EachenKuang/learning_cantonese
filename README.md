# 粵學堂 · 粤语学习工坊

从零到进阶的粤语学习网站：粤拼音标、场景词汇、对话实战、学唱粤语歌、语法专栏、文化趣知、进度追踪。
**識聽識講，港味十足。**

> 在线体验：https://jyut.kuangyichen.com
> （纯前端静态站，手机扫码即可使用；支持安装为 PWA 应用）

---

## ✨ 功能特性

| 模块 | 说明 |
|------|------|
| 🎙️ 语音学习 | 19 声母 / 56 韵母 / 6 个基本声调（入声沿用其中 3 个调值），点卡片听标准音，麦克风录音做节奏反馈（时长+音量+声调自查，不识别发音准确性）；**六档朗读语速**（0.5×~2×，全局生效并记忆） |
| 📖 场景词汇 | 10 大场景 153 个高频词（含身体部位/校园学习），逐词粤拼+例句+普通话对照；点卡片即读、例句朗读、搜索、收藏、听力小测 |
| 💬 对话实战 | 6 个场景（茶楼/街市/巴士/茶餐厅/问路/睇医生），逐句跟读录音 + 角色扮演（自动播对方台词→你读→看答案） |
| 🎵 学唱粤语歌 | **11 首经典全曲歌词**（138 句逐字 ruby 注音，汉字上方标粤拼），TTS 示范/录音跟唱/单句循环/自动跟唱/**全文注音视图**；支持导入本地 mp3 整曲播放（KTV 模式）；歌词常用字词小词典 |
| 🧩 语法专栏 | 10 讲：量词、语气词、动词体貌、系字、虚词、比较句、否定、疑问词、程度副词、叠字 |
| 🏮 文化趣知 | 6 大栏目 58 条：俗语 12 / 歇后语 10 / 港式文化 14 / 节庆习俗 8 / 港式小食 8 / TVB金句 6 |
| 📊 学习档案 | 无需注册、本机自动保存；连续打卡、每日目标、收藏、练习历史、JSON 备份，以及受邀账户跨设备同步（可选） |

**平台能力**：PWA（可安装、离线可用）、响应式（桌面侧边栏 / 移动端底部导航）、明暗双主题、语音诊断面板（排查设备粤语语音包）。

---

## 🏗️ 架构

### 当前架构（已上线）：静态学习站 + 本机优先档案 + 可选云端同步 + 同源粤语 TTS

```
Nginx 静态托管（HTTPS · PWA · Service Worker 缓存）
        │  下发 HTML/CSS/JS
        ▼
浏览器 ── 前端应用（7 大模块，单页应用）
        ├── /api/tts → 晓佳粤语神经音色（主通道）
        ├── Web Speech API → 设备粤语语音（离线兜底；不回退普通话）
        ├── MediaRecorder → 录音对比评估
        ├── 浏览器本地存储 → 本机学习档案 / 进度 / 收藏 / 打卡
        ├── /api/account → 受邀账户登录与学习档案同步（可选）
        └── 导入 mp3 → 整曲播放（本机、不上传）
```

特点：无需注册即可学习，本机档案和 JSON 备份继续保留。登录受邀账户后，进度、目标、收藏、打卡和练习摘要会自动同步；录音、导入歌曲和密码不会进入云端档案。公开注册默认关闭。

### 云端账户边界

- 每个账户有独立档案，接口只按登录会话读写当前用户，前端不能指定其他用户 ID。
- 密码使用随机盐的 `scrypt` 哈希保存；会话使用随机令牌，浏览器 Cookie 为 `HttpOnly + Secure + SameSite=Strict`。
- 写入使用版本号做乐观并发控制；前端保留最近同步基线，在多设备冲突时做三方合并。
- 账户由管理员命令行创建或停用，没有公开注册接口。数据目录应只允许服务账户读取。

### 语音架构：云端粤语 TTS + 设备粤语兜底

```
浏览器 speak()
 ├─ 联网可用 → 请求本站 TTS 代理（server/tts-proxy.mjs）         ← 主通道
 └─ 云端不可用且设备有粤语 → 本地 Web Speech                    ← 离线兜底
              │  /tts?text=…&voice=…&rate=…
              ▼
      你的服务器 · tts-proxy（Node 单文件）
       ├── 引擎层：Microsoft Edge Read Aloud（晓佳粤语神经音色）
       ├── 磁盘缓存 tts-cache：同一句只合成一次（命中 0.002s）
       └── API Key 只存服务器
              │  返回 mp3
              ▼
       浏览器播放；服务端磁盘缓存重复文本
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
    ├── sync-server.mjs        # 邀请制学习档案同步 API
    ├── sync-store.mjs         # 用户、会话与档案存储（原子写入）
    ├── manage-user.mjs        # 创建/停用账户与交互式设置密码
    ├── package.json
    └── README.md              # 后端服务部署与运维文档
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

- **现状**：`jyut.kuangyichen.com` 由 Nginx 的版本化静态目录提供（HTTPS）
- **可选**：GitHub Pages / Vercel / Netlify（仓库根目录即站点根目录）

### 2. 云端 TTS 代理（当前线上主通道）

部署 `server/` 到任意 Node 服务器，详见 [server/README.md](server/README.md)。

### 3. 邀请制档案同步（可选）

同步服务默认监听 `127.0.0.1:8788`，由 Nginx 暴露 `/api/account/`。账户密码必须由账户本人在服务器终端交互式设置，不写入命令历史。部署和邀请账户命令见 [server/README.md](server/README.md)。

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
2. **同步递增缓存版本**：更新 `sw.js` 顶部 `canto-shell-vX`，以及 `index.html` / `sw.js` 中静态资源的 `?v=X`（否则老用户第一次打开可能出现新旧资源混用）
3. 提交推送：

```bash
git add -A && git commit -m "描述" && git push
```

4. 将静态文件发布到新的版本目录，切换 `/var/www/jyut-live`，再完成 Nginx 与公网验收。

### 前端技术约定

- 数据驱动：所有内容在 `js/data.js` / `js/songs.js`，改数据即改内容
- 朗读：统一走 `speak(text)`（`js/app.js`），全局语速 `speechRate`（0.5~2 六档，localStorage 记忆）；新增朗读调用**不要写死 rate**
- 逐字注音：`annotateRuby(han, jp)` 生成 `<ruby>字<rt>粤拼</rt></ruby>`
- 练习反馈：`evalRecord()` + `renderFeedback()`（时长 50% + 音量 30% + 声调自查 20%）；必须明确它不识别发音准确性

---

## 📄 版权与许可

- 歌词（`js/songs.js`）版权归原作者所有，**仅供学习使用**；粤拼与普通话释义为本项目整理，如有出入以官方原版为准
- 项目代码采用仓库内 [LICENSE](LICENSE) 许可
