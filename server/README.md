# 粤学堂 · 自建后端服务

本目录包含同源粤语 TTS 和轻量邀请制学习档案同步服务。
**网站前端在没有本地粤语语音包的设备（尤其是安卓）上，可调用本服务合成粤语朗读。**

## 部署（任选一种）

### 方式一：直接跑 Node（最简单）

```bash
# 1. 进入本目录
cd server

# 2. 安装依赖（需要 Node.js 18+）
npm install

# 3. 启动（默认端口 8787，可 PORT 环境变量修改）
node tts-proxy.mjs
# 或用 pm2 守护：pm2 start tts-proxy.mjs --name canto-tts

# 4.（推荐）nginx 反代 + HTTPS：
#    location /tts { proxy_pass http://127.0.0.1:8787; }
```

### 方式二：Docker（有 Docker 环境时）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json tts-proxy.mjs ./
RUN npm install --omit=dev
EXPOSE 8787
CMD ["node", "tts-proxy.mjs"]
```

## 接口

```
GET /api/tts?text=原諒我這一生不羈放縱愛自由&voice=hiuGaai&rate=0.75
```

| 参数 | 说明 | 默认 |
|------|------|------|
| `text` | 要朗读的文字（必填） | — |
| `voice` | `hiuGaai`(女) / `hiuMaan`(女) / `wanLung`(男) | hiuGaai |
| `rate` | `0.5 / 0.75 / 1 / 1.25 / 1.5 / 2`（与网站朗读语速档位一致） | 0.75 |

返回：`audio/mpeg`（MP3）；服务默认只接受本站同源请求，并限制文本长度和并发。

## 特性

- **磁盘缓存**：同一句话只合成一次，之后秒回（`tts-cache/` 目录，可定期清理）
- **合成失败保护**：不产生空缓存文件
- **无需 API Key**：当前使用 Edge Read Aloud 接口；它没有可承诺的 SLA，服务异常时前端回退到设备粤语语音

## 前端接入（下一步）

网站已规划双通道：设备有粤语语音包 → 用本地（零延迟）；没有 → 自动请求本代理。接入时需要把 `server/tts-proxy.mjs` 部署后的公网地址填入网站配置即可。

## 注意

- Edge TTS 是非官方接口，微软可能调整；若追求长期稳定，可平滑替换为 Azure 认知服务（代码结构不变，只换合成引擎）。
- 生产环境应只监听 `127.0.0.1`，由 Nginx 暴露 `/api/tts` 并配置限流。

## 邀请制学习档案同步

`sync-server.mjs` 默认监听 `127.0.0.1:8788`，提供：

- `POST /login`、`POST /logout`、`GET /session`
- 登录后 `GET /profile`、`PUT /profile`
- 没有注册、用户列表或跨用户读取接口

生产环境使用 `deploy/jyut-sync.service`，数据文件为 `/var/lib/jyut-sync/store.json`。目录归 `jyut-sync` 服务账户所有并设为 `0700`，文件由程序以 `0600` 原子写入。

首次预留账户（尚不能登录，以下名称仅为示例）：

```bash
sudo -u jyut-sync env JYUT_SYNC_DATA_FILE=/var/lib/jyut-sync/store.json \
  /usr/local/bin/node /opt/jyut-sync-live/manage-user.mjs ensure demo-user '示例用户'
sudo systemctl reload jyut-sync
```

由账户本人交互式设置密码（至少 12 个字符，输入不回显）：

```bash
sudo -u jyut-sync env JYUT_SYNC_DATA_FILE=/var/lib/jyut-sync/store.json \
  /usr/local/bin/node /opt/jyut-sync-live/manage-user.mjs set-password demo-user '示例用户'
sudo systemctl reload jyut-sync
```

邀请后续用户时，把 `demo-user` 和显示名换成新的用户 ID/名称即可。停用账户会阻止现有会话继续访问：

```bash
sudo -u jyut-sync env JYUT_SYNC_DATA_FILE=/var/lib/jyut-sync/store.json \
  /usr/local/bin/node /opt/jyut-sync-live/manage-user.mjs disable USER_ID
sudo systemctl reload jyut-sync
```

注意：账户管理工具直接更新数据文件，服务运行时每次修改后都必须执行 `systemctl reload jyut-sync`。不要把密码作为命令行参数或环境变量传入。

## 自动发布

生产服务器使用定时巡检模式：GitHub CI 在 `main` 通过语法和数据校验后滚动更新 `ci-ok` 标签；`check-deploy-jyut.sh` 每 5 分钟只读取 `refs/tags/ci-ok`。发现新的已验证提交后调用 `deploy-jyut-clean.sh`，从该精确 commit 创建版本目录并原子切换软链。CI 未通过时标签不会前移，线上继续保留旧版本。

发布脚本只更新静态站和发生变化的后端服务代码，不会覆盖 `/var/lib/jyut-sync/store.json`，也不会自动安装仓库里的 Nginx/systemd 配置。上线前会检查 JavaScript 语法、Service Worker 缓存版本和 Nginx 配置；上线后检查首页、账户 API 与 TTS，失败则切回旧版本。

运维位置：

- 巡检脚本：`/opt/scripts/check-deploy-jyut.sh`
- 发布脚本：`/opt/scripts/deploy-jyut-clean.sh`
- 发布状态：`/var/lib/jyut-deploy/release.json`
- 巡检日志：`/var/log/jyut-deploy-check.log`
- 定时任务：root crontab 每 5 分钟执行
