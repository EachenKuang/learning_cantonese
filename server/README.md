# 粤学堂 · 云端粤语 TTS 代理（自建服务器版）

把微软 Edge TTS（免费、免 key、粤语神经网络音质）封装成 HTTP 接口。
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
GET /tts?text=原諒我這一生不羈放縱愛自由&voice=hiuGaai&rate=0.75
```

| 参数 | 说明 | 默认 |
|------|------|------|
| `text` | 要朗读的文字（必填） | — |
| `voice` | `hiuGaai`(女) / `hiuMaan`(女) / `wanLung`(男) | hiuGaai |
| `rate` | `0.5 / 0.75 / 1 / 1.25 / 1.5 / 2`（与网站朗读语速档位一致） | 0.75 |

返回：`audio/mpeg`（MP3 流），已带 CORS 头，任意网页可直接调用。

## 特性

- **磁盘缓存**：同一句话只合成一次，之后秒回（`tts-cache/` 目录，可定期清理）
- **合成失败保护**：不产生空缓存文件
- **免费无限量**：微软 Edge 朗读服务无 key、无配额限制（非官方接口，介意可用 Azure 官方替换）

## 前端接入（下一步）

网站已规划双通道：设备有粤语语音包 → 用本地（零延迟）；没有 → 自动请求本代理。接入时需要把 `server/tts-proxy.mjs` 部署后的公网地址填入网站配置即可。

## 注意

- Edge TTS 是非官方接口，微软可能调整；若追求长期稳定，可平滑替换为 Azure 认知服务（代码结构不变，只换合成引擎）。
- 请给代理加上访问控制（如 nginx IP 白名单或简单 token），避免被他人白嫖合成服务。
