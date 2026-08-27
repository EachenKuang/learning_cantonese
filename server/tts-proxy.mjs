/**
 * 粵學堂 · 同源粤语 TTS 服务
 *
 * 仅监听回环地址，由 Nginx 暴露 /api/tts；默认使用微软晓佳粤语神经音色。
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), 'tts-cache');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://jyut.kuangyichen.com';
const MAX_TEXT_LENGTH = Number(process.env.MAX_TEXT_LENGTH || 160);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);

const VOICES = {
  hiuGaai: { id: 'zh-HK-HiuGaaiNeural', label: '晓佳（zh-HK-HiuGaaiNeural）' },
  hiuMaan: { id: 'zh-HK-HiuMaanNeural', label: '晓曼（zh-HK-HiuMaanNeural）' },
  wanLung: { id: 'zh-HK-WanLungNeural', label: '云龙（zh-HK-WanLungNeural）' },
};
const RATES = new Set(['0.5', '0.75', '1', '1.25', '1.5', '2']);
let activeJobs = 0;

await mkdir(CACHE_DIR, { recursive: true });

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(payload);
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

function normalizeText(value) {
  return value.normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || origin === ALLOWED_ORIGIN;
}

async function synthesize(text, voice, rate) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice.id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(escapeXml(text), { rate: Number(rate) });
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
  const audio = Buffer.concat(chunks);
  if (audio.length < 256) throw new Error('empty audio response');
  return audio;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/tts/health') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    return sendJson(res, 200, {
      status: 'ok',
      engine: 'Microsoft Edge Read Aloud',
      voice: VOICES.hiuGaai.id,
      voiceLabel: VOICES.hiuGaai.label,
    }, { 'Cache-Control': 'no-store' });
  }

  if (url.pathname !== '/api/tts') {
    return sendJson(res, 404, { error: 'not_found' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  if (!originAllowed(req)) return sendJson(res, 403, { error: 'origin_not_allowed' });

  const text = normalizeText(url.searchParams.get('text') || '');
  const voiceKey = url.searchParams.get('voice') || 'hiuGaai';
  const rate = url.searchParams.get('rate') || '0.75';
  const voice = VOICES[voiceKey];
  if (!text) return sendJson(res, 400, { error: 'text_required' });
  if (text.length > MAX_TEXT_LENGTH) return sendJson(res, 413, { error: 'text_too_long' });
  if (!voice || !RATES.has(rate)) return sendJson(res, 400, { error: 'invalid_voice_or_rate' });

  const key = createHash('sha256').update(`${text}|${voice.id}|${rate}`).digest('hex');
  const cacheFile = path.join(CACHE_DIR, `${key}.mp3`);
  const tmpFile = `${cacheFile}.${process.pid}.tmp`;
  const audioHeaders = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  try {
    const cached = await readFile(cacheFile);
    res.writeHead(200, { ...audioHeaders, 'Content-Length': cached.length, 'X-TTS-Cache': 'HIT' });
    if (req.method === 'HEAD') return res.end();
    return res.end(cached);
  } catch (error) {
    if (error.code !== 'ENOENT') return sendJson(res, 500, { error: 'cache_read_failed' });
  }

  if (req.method === 'HEAD') { res.writeHead(404, audioHeaders); return res.end(); }
  if (activeJobs >= MAX_CONCURRENT) {
    return sendJson(res, 503, { error: 'busy' }, { 'Retry-After': '2' });
  }

  activeJobs++;
  try {
    const audio = await synthesize(text, voice, rate);
    await writeFile(tmpFile, audio, { flag: 'wx' });
    await rename(tmpFile, cacheFile);
    res.writeHead(200, { ...audioHeaders, 'Content-Length': audio.length, 'X-TTS-Cache': 'MISS' });
    res.end(audio);
  } catch (error) {
    console.error('[tts] synthesis failed:', error.message);
    await rm(tmpFile, { force: true }).catch(() => {});
    if (!res.headersSent) sendJson(res, 502, { error: 'synthesis_failed' });
    else res.destroy();
  } finally {
    activeJobs--;
  }
});

server.keepAliveTimeout = 10_000;
server.headersTimeout = 15_000;
server.requestTimeout = 20_000;
server.listen(PORT, HOST, () => {
  console.log(`[粵學堂 TTS] listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`[粵學堂 TTS] ${signal}, shutting down`);
  server.close(error => process.exit(error ? 1 : 0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
