/**
 * 粵學堂 · 云端粤语 TTS 代理（自建服务器版）
 * ---------------------------------------------------------
 * 把 Edge TTS（微软在线朗读，免费、免 key）包成一个 HTTP 接口，
 * 前端没有本地粤语语音包时，可调用本服务合成粤语朗读。
 *
 * 部署：node 环境即可（无需 python）
 *   npm install msedge-tts
 *   node tts-proxy.mjs            # 默认端口 8787
 *
 * 接口：GET /tts?text=你好&voice=hiuGaai&rate=0.75
 *   voice: hiuGaai(女) | hiuMaan(女) | wanLung(男)，默认 hiuGaai
 *   rate : 0.5|0.75|1|1.25|1.5|2 （与网站朗读语速档位一致），默认 0.75
 *   返回 : audio/mpeg（已合成/已缓存的 mp3）
 *
 * 特性：磁盘缓存（tts-cache/ 目录，同一句话不重复合成）；
 *       CORS 已放开，可被任意网页直接调用。
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createServer } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8787;
const CACHE_DIR = path.join(process.cwd(), 'tts-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const VOICES = {
  hiuGaai: 'zh-HK-HiuGaaiNeural',
  hiuMaan: 'zh-HK-HiuMaanNeural',
  wanLung: 'zh-HK-WanLungNeural',
};
/* 网站语速档位 → msedge-tts 倍速参数（数字倍数） */
const RATE = { 0.5: 0.5, 0.75: 0.75, 1: 1, 1.25: 1.25, 1.5: 1.5, 2: 2 };

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/tts') { res.writeHead(404); res.end('not found'); return; }

  const text = (u.searchParams.get('text') || '').trim();
  const voice = VOICES[u.searchParams.get('voice')] || VOICES.hiuGaai;
  const rate = RATE[+u.searchParams.get('rate')] ?? 0.75;
  if (!text) { res.writeHead(400); res.end('text required'); return; }

  const key = crypto.createHash('md5').update(text + '|' + voice + '|' + rate).digest('hex') + '.mp3';
  const cacheFile = path.join(CACHE_DIR, key);
  const tmpFile = cacheFile + '.tmp';
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  /* 命中缓存：直接返回 */
  if (fs.existsSync(cacheFile)) {
    fs.createReadStream(cacheFile).pipe(res);
    return;
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text, { rate });
    /* 先落临时文件，合成成功才 rename 为缓存（失败不污染缓存） */
    const ws = fs.createWriteStream(tmpFile);
    let bytes = 0;
    audioStream.on('data', d => { bytes += d.length; ws.write(d); });
    audioStream.on('end', () => {
      ws.end();
      if (bytes > 0) fs.renameSync(tmpFile, cacheFile);
      else fs.unlinkSync(tmpFile);
    });
    audioStream.on('error', e => {
      console.error('[tts] 流错误:', e.message);
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    });
    audioStream.pipe(res);
  } catch (e) {
    console.error('[tts] 合成失败:', e.message);
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (!res.headersSent) { res.writeHead(500); res.end('synthesis failed'); }
  }
});

server.listen(PORT, () => console.log('[粤學堂 TTS 代理] 运行中 http://localhost:' + PORT));
