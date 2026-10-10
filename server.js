const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { spawn, execSync } = require('child_process');
const db = require('./db');

// ============================================================
//  CONFIG
// ============================================================
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const MAX_HISTORY = 100;
// Studio HQ Remastering Filter: Sub-bass mud cut, vocal presence boost, crystal treble air sparkle, EBU R128 broadcast loudness normalization, and 48kHz studio resampling
const STUDIO_AUDIO_FILTER = 'highpass=f=35,equalizer=f=3200:t=q:w=1.5:g=2.8,equalizer=f=11000:t=q:w=1.8:g=3.2,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000:resampler=soxr';

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

// ============================================================
//  HELPERS
// ============================================================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function checkBinary(name) {
  try {
    const flag = name === 'ffmpeg' ? '-version' : '--version';
    execSync(`${name} ${flag}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Color console helpers
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
};

function log(msg, color = 'cyan') {
  const t = new Date().toLocaleTimeString();
  console.log(`${C.bright}${C[color]}[${t}]${C.reset} ${msg}`);
}

// Dynamic bypass & acceleration configuration
let bypassConfig = {
  client: 'android,web', // android,web | ios,web | tv,web | mweb,web | web
  browserCookies: 'none', // none | chrome | edge | firefox | brave
  autoFallback: true,     // Automatically rotate client profiles on error
  smartDelay: true,       // Natural human delay for playlists
  geoBypass: true,
  retries: 5,
  retrySleep: 5,
  sleepInterval: 0.2,
  maxSleepInterval: 1,
  turboMode: true,           // Multi-threaded 8x downloads & multi-core FFmpeg
  concurrentFragments: 8,   // 8 parallel fragment download threads
  bufferSize: '128K',       // High-speed I/O buffer
  httpChunkSize: '10M',     // 10MB chunking prevents YouTube speed throttling
  ffmpegThreads: 4,         // 4 CPU core utilization
};

const CLIENT_PROFILES = ['android,web', 'ios,web', 'tv,web', 'mweb,web', 'web'];

function getNextClientProfile(current) {
  const idx = CLIENT_PROFILES.indexOf(current);
  if (idx === -1 || idx === CLIENT_PROFILES.length - 1) return CLIENT_PROFILES[0];
  return CLIENT_PROFILES[idx + 1];
}

function isBotBlockedError(err) {
  const msg = ((err && err.message) || '').toLowerCase();
  return msg.includes('403') || msg.includes('bot') || msg.includes('sign in') || msg.includes('confirm you') || msg.includes('throttled') || msg.includes('too many requests');
}

// Build yt-dlp args to bypass restrictions & maximize speed
function getBypassArgs(url = '') {
  const isYoutube = !url || url.includes('youtube.com') || url.includes('youtu.be');
  const args = [
    '--no-warnings',
    '--no-check-certificates',
    '--prefer-insecure',
    '--extractor-retries', String(bypassConfig.retries || 5),
    '--retry-sleep', `extractor:${bypassConfig.retrySleep || 5}`,
  ];

  if (bypassConfig.geoBypass) {
    args.push('--geo-bypass');
  }

  if (isYoutube && bypassConfig.client) {
    args.push('--extractor-args', `youtube:player_client=${bypassConfig.client}`);
  }

  // Browser Cookies (Chrome/Edge/Firefox)
  if (isYoutube && bypassConfig.browserCookies && bypassConfig.browserCookies !== 'none') {
    args.push('--cookies-from-browser', bypassConfig.browserCookies);
  }

  // Turbo Mode: Maximum Download & Conversion Speed
  if (bypassConfig.turboMode) {
    args.push(
      '-N', String(bypassConfig.concurrentFragments || 8),
      '--buffer-size', bypassConfig.bufferSize || '128K',
      '--http-chunk-size', bypassConfig.httpChunkSize || '10M',
      '--postprocessor-args', `ffmpeg:-threads ${bypassConfig.ffmpegThreads || 4}`
    );
  }

  if (isYoutube && bypassConfig.smartDelay) {
    args.push('--sleep-requests', '0.5');
    args.push('--sleep-interval', '1.0');
    args.push('--max-sleep-interval', '2.5');
  } else if (isYoutube && bypassConfig.sleepInterval) {
    args.push('--sleep-requests', String(bypassConfig.sleepInterval));
    args.push('--sleep-interval', '0.2');
    args.push('--max-sleep-interval', String(bypassConfig.maxSleepInterval || 1));
  }

  return args;
}

// Get current yt-dlp version
function getYtDlpVersion() {
  try {
    return execSync('yt-dlp --version').toString().trim();
  } catch {
    return 'Unknown';
  }
}

// Run yt-dlp and return promise with stdout
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Run yt-dlp with progress callback (for downloads)
function runYtDlpWithProgress(args, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match && onProgress) {
          onProgress(parseFloat(match[1]));
        }
      }
    });

    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// ============================================================
//  APP SETUP
// ============================================================
const app = express();
const conversionHistory = [];
const activeJobs = new Map(); // jobId -> { progress, status, ... }

ensureDir(DOWNLOADS_DIR);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  ROUTES
// ============================================================

// --- Health & System Status check ---
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    ytdlp: checkBinary('yt-dlp'),
    ffmpeg: checkBinary('ffmpeg'),
    database: 'SQLite (Connected)',
    version: getYtDlpVersion(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system-status', (_req, res) => {
  res.json({
    status: 'ok',
    version: getYtDlpVersion(),
    ytdlp: checkBinary('yt-dlp'),
    ffmpeg: checkBinary('ffmpeg'),
    database: 'SQLite (Active WAL)',
    config: bypassConfig,
    profiles: [
      { id: 'android,web', name: 'Android + Web (Direkomendasikan)', desc: 'Paling ampuh menembus HTTP 403 Forbidden & blokir Google' },
      { id: 'ios,web', name: 'iOS + Web Client', desc: 'Alternatif cepat, sangat baik untuk ekstraksi audio/MP3' },
      { id: 'tv,web', name: 'TV Embedded Client', desc: 'Ampuh untuk bypass video dengan batasan umur/login' },
      { id: 'mweb,web', name: 'Mobile Web Client', desc: 'Alternatif ringan jika IP terkena batasan cooldown' },
      { id: 'web', name: 'Web Standard Only', desc: 'Client standar browser YouTube' }
    ],
    browserOptions: [
      { id: 'none', name: 'Tanpa Cookies (Default / Standar)', desc: 'Menggunakan penyamaran client Android/iOS tanpa login' },
      { id: 'chrome', name: 'Google Chrome', desc: 'Gunakan sesi login resmi YouTube dari browser Chrome di PC' },
      { id: 'edge', name: 'Microsoft Edge', desc: 'Gunakan sesi login resmi YouTube dari browser Edge di PC' },
      { id: 'firefox', name: 'Mozilla Firefox', desc: 'Gunakan sesi login resmi YouTube dari browser Firefox di PC' },
      { id: 'brave', name: 'Brave Browser', desc: 'Gunakan sesi login resmi YouTube dari browser Brave di PC' }
    ]
  });
});

// --- Update Bypass Configuration ---
app.post('/api/bypass-config', (req, res) => {
  try {
    const { client, geoBypass, retries, sleepInterval, turboMode, concurrentFragments, browserCookies, autoFallback, smartDelay } = req.body;
    if (client !== undefined) bypassConfig.client = client;
    if (geoBypass !== undefined) bypassConfig.geoBypass = !!geoBypass;
    if (retries !== undefined) bypassConfig.retries = parseInt(retries, 10) || 5;
    if (sleepInterval !== undefined) bypassConfig.sleepInterval = parseFloat(sleepInterval) || 0.2;
    if (turboMode !== undefined) bypassConfig.turboMode = !!turboMode;
    if (concurrentFragments !== undefined) bypassConfig.concurrentFragments = parseInt(concurrentFragments, 10) || 8;
    if (browserCookies !== undefined) bypassConfig.browserCookies = browserCookies;
    if (autoFallback !== undefined) bypassConfig.autoFallback = !!autoFallback;
    if (smartDelay !== undefined) bypassConfig.smartDelay = !!smartDelay;

    log(`Bypass & Protection config updated: client=${bypassConfig.client} cookies=${bypassConfig.browserCookies} autoFallback=${bypassConfig.autoFallback} smartDelay=${bypassConfig.smartDelay}`, 'green');
    res.json({ status: 'success', message: 'Bypass config updated', config: bypassConfig });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bypass config', details: err.message });
  }
});

// --- 1-Click Update yt-dlp Engine ---
app.post('/api/update-engine', async (_req, res) => {
  const currentVer = getYtDlpVersion();
  log(`Starting 1-Click engine update from v${currentVer}...`, 'magenta');

  try {
    let output = '';
    // Try pip update first as standard for python environment
    try {
      output = execSync('python -m pip install --upgrade yt-dlp 2>&1', { timeout: 60000 }).toString();
    } catch {
      // Fallback to yt-dlp -U
      try {
        output = execSync('yt-dlp -U 2>&1', { timeout: 60000 }).toString();
      } catch (e2) {
        output = e2.stdout ? e2.stdout.toString() : e2.message;
      }
    }

    const newVer = getYtDlpVersion();
    log(`Update completed: ${currentVer} -> ${newVer}`, 'green');

    res.json({
      status: 'success',
      oldVersion: currentVer,
      newVersion: newVer,
      isUpdated: currentVer !== newVer,
      message: currentVer !== newVer 
        ? `Berhasil diperbarui ke versi ${newVer}!` 
        : `Sudah menggunakan versi terbaru (${newVer}).`,
      output: output.substring(0, 500)
    });
  } catch (err) {
    log(`Update error: ${err.message}`, 'red');
    res.status(500).json({
      status: 'error',
      error: 'Gagal memperbarui engine',
      details: err.message
    });
  }
});

// --- Test Bypass Connection ---
app.get('/api/test-bypass', async (_req, res) => {
  const testUrl = 'https://www.youtube.com/watch?v=SSCU0xmBJCM';
  log(`Testing bypass connection using client: ${bypassConfig.client}...`, 'blue');
  const startTime = Date.now();

  try {
    const args = [
      ...getBypassArgs(),
      '--dump-json',
      '--no-download',
      testUrl
    ];
    await runYtDlp(args);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log(`Bypass test PASSED in ${duration}s`, 'green');
    res.json({
      status: 'success',
      latency: `${duration}s`,
      client: bypassConfig.client,
      message: 'Koneksi ke YouTube dan bypass Google berfungsi 100% normal!'
    });
  } catch (err) {
    log(`Bypass test FAILED: ${err.message}`, 'red');
    res.status(500).json({
      status: 'failed',
      client: bypassConfig.client,
      error: err.message,
      suggestion: 'Coba ganti profil client ke opsi lain (misal: iOS atau TV Embedded) atau klik Update Engine.'
    });
  }
});

// --- In-App YouTube Search ---
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'Kata kunci pencarian tidak boleh kosong' });

    log(`Searching YouTube: "${query}"`, 'blue');
    const searchTarget = `ytsearch8:${query}`;
    const args = [
      ...getBypassArgs('https://www.youtube.com'),
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      searchTarget
    ];

    let output;
    try {
      output = await runYtDlp(args);
    } catch (err) {
      if (bypassConfig.autoFallback && isBotBlockedError(err)) {
        bypassConfig.client = getNextClientProfile(bypassConfig.client);
        log(`Auto-fallback triggered for search: switching to ${bypassConfig.client}`, 'yellow');
        const retryArgs = [
          ...getBypassArgs('https://www.youtube.com'),
          '--dump-json',
          '--no-download',
          '--flat-playlist',
          searchTarget
        ];
        output = await runYtDlp(retryArgs);
      } else {
        throw err;
      }
    }

    const lines = output.split('\n').filter(Boolean);
    const results = lines.map(line => {
      try {
        const item = JSON.parse(line);
        return {
          id: item.id,
          title: item.title,
          url: item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : ''),
          thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url ||
                     item.thumbnails?.[0]?.url ||
                     `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          duration: item.duration || 0,
          durationFormatted: item.duration_string || formatDuration(item.duration || 0),
          channel: item.uploader || item.channel || 'YouTube Creator',
          views: item.view_count ? parseInt(item.view_count).toLocaleString() : null
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.json({ success: true, query, results });
  } catch (err) {
    log(`Search error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal melakukan pencarian YouTube', details: err.message });
  }
});

// --- Live Audio Stream (Zero-Disk / Zero-Download Live Audio Player) ---
const liveStreamCache = new Map();

app.get('/api/stream-live', async (req, res) => {
  try {
    const rawUrl = (req.query.url || req.query.v || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'URL atau ID video diperlukan' });
    const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.youtube.com/watch?v=${rawUrl}`;

    if (liveStreamCache.has(targetUrl)) {
      const cached = liveStreamCache.get(targetUrl);
      if (Date.now() - cached.time < 3 * 60 * 60 * 1000) {
        return res.json({ success: true, streamUrl: cached.streamUrl });
      }
    }

    log(`Extracting live audio stream: ${targetUrl}`, 'magenta');
    const args = [
      ...getBypassArgs(targetUrl),
      '-f', 'ba/b',
      '-g',
      targetUrl
    ];

    const stdout = await runYtDlp(args);
    const streamUrl = stdout.trim().split('\n')[0];
    if (!streamUrl || !streamUrl.startsWith('http')) {
      return res.status(500).json({ error: 'Gagal mengekstrak URL audio langsung' });
    }

    liveStreamCache.set(targetUrl, { streamUrl, time: Date.now() });
    res.json({ success: true, streamUrl });
  } catch (err) {
    log(`Stream live error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal memutar audio live', details: err.message });
  }
});

app.get('/api/stream-live-play', async (req, res) => {
  try {
    const rawUrl = (req.query.url || req.query.v || '').trim();
    const isHq = req.query.raw !== 'true'; // Default is HQ Audio Real-Time Stabilizer!
    const seekTime = parseFloat(req.query.t || req.query.ss || 0);
    const isKaraoke = req.query.karaoke === '1'; // Real-time vocal removal mode

    if (!rawUrl) return res.status(400).send('URL required');
    const targetUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.youtube.com/watch?v=${rawUrl}`;

    let streamUrl = '';
    if (liveStreamCache.has(targetUrl)) {
      const cached = liveStreamCache.get(targetUrl);
      if (Date.now() - cached.time < 3 * 60 * 60 * 1000) {
        streamUrl = cached.streamUrl;
      }
    }

    if (!streamUrl) {
      const args = [...getBypassArgs(targetUrl), '-f', 'ba/b', '-g', targetUrl];
      const stdout = await runYtDlp(args);
      streamUrl = stdout.trim().split('\n')[0];
      if (streamUrl && streamUrl.startsWith('http')) {
        liveStreamCache.set(targetUrl, { streamUrl, time: Date.now() });
      } else {
        return res.status(500).send('Audio stream tidak ditemukan');
      }
    }

    // Direct redirect if explicitly requested raw
    if (!isHq && !isKaraoke) {
      return res.redirect(streamUrl);
    }

    // Build audio filter chain
    let audioFilter = '';

    if (isKaraoke) {
      // ===== REAL-TIME VOCAL REMOVAL ENGINE (Karaoke Mode) =====
      // Technique: Multi-stage center-channel cancellation + spectral isolation
      //
      // Step 1: Stereo phase-inversion center-channel cancellation
      //   pan=stereo|c0=c0-c1|c1=c1-c0
      //   → Vocals are almost always mixed dead-center (equal L=R).
      //   → Subtracting R from L (and L from R) cancels the center signal (vocals)
      //     while preserving stereo-panned instruments.
      //
      // Step 2: Bass preservation lowpass crossfeed (bass is also center-panned)
      //   Since bass guitar/kick drum are also center-panned, the subtraction
      //   kills bass too. We split the original audio, lowpass at 180Hz,
      //   and mix it back in to restore the low-end.
      //
      // Step 3: Deep vocal formant notch (1kHz to 3.5kHz)
      //   Suppresses residual vocal reverberation and stereo formant bleed.
      log(`[Live Audio Stream] 🎤 KARAOKE MODE (Vocal Removal): ${targetUrl}`, 'magenta');
      audioFilter = [
        // Split into two streams: one for center-cancel, one for bass rescue
        '[0:a]asplit=2[vocal_src][bass_src]',
        // Center-channel cancellation: L-R / R-L kills center-panned vocals + deep vocal notch
        '[vocal_src]pan=stereo|c0=c0-c1|c1=c1-c0,highpass=f=180,equalizer=f=1500:t=q:w=1.5:g=-10,equalizer=f=2800:t=q:w=1.8:g=-14,equalizer=f=10000:t=q:w=1.8:g=2.5[no_vocal]',
        // Bass rescue: extract sub-180Hz from original to preserve kick/bass
        '[bass_src]lowpass=f=180,volume=0.9[bass]',
        // Mix vocal-removed + bass back together, then normalize
        '[no_vocal][bass]amix=inputs=2:duration=longest:dropout_transition=0,highpass=f=30,compand=attacks=0.02:decays=0.25:points=-80/-80|-45/-28|-20/-14|0/-6:gain=4.5'
      ].join(';');
    } else {
      // Normal HQ Audio Stabilizer & Normalizer
      log(`[Live Audio Stream] Streaming with real-time loudness normalization: ${targetUrl}`, 'cyan');
      audioFilter = 'highpass=f=35,equalizer=f=3200:t=q:w=1.5:g=2.8,equalizer=f=10000:t=q:w=1.8:g=3.0,compand=attacks=0.02:decays=0.25:points=-80/-80|-45/-28|-20/-14|0/-6:gain=3.5';
    }

    const ffmpegArgs = [
      '-loglevel', 'error',
      ...(seekTime > 0 ? ['-ss', seekTime.toString()] : []),
      '-i', streamUrl,
      ...(isKaraoke
        ? ['-filter_complex', audioFilter]
        : ['-af', audioFilter]),
      '-f', 'mp3',
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      'pipe:1'
    ];

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store',
      'Accept-Ranges': 'none',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });

    ffmpegProc.stdout.pipe(res);

    req.on('close', () => {
      try {
        ffmpegProc.kill('SIGKILL');
      } catch {}
    });

    ffmpegProc.on('error', (err) => {
      log(`Live stream FFmpeg error: ${err.message}`, 'red');
      if (!res.headersSent) res.status(500).send('Stream error');
    });

    ffmpegProc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) log(`[FFmpeg stderr] ${msg}`, 'yellow');
    });
  } catch (err) {
    log(`Live stream error: ${err.message}`, 'red');
    if (!res.headersSent) res.status(500).send(err.message);
  }
});

// --- Smart Multi-Band Radio Mix & Anti-Duplikat Engine ---
app.get('/api/radio-mix', async (req, res) => {
  try {
    const rawUrl = (req.query.url || req.query.v || req.query.id || '').trim();
    const query = (req.query.q || '').trim();

    if (!rawUrl && !query) {
      return res.status(400).json({ error: 'URL atau kata kunci diperlukan' });
    }

    let seedVid = '';
    let seedTitle = '';
    let seedChannel = '';
    let seedDuration = '--:--';

    // 1. Resolve Seed Video & Video ID
    if (rawUrl) {
      const match = rawUrl.match(/(?:v=|youtu\.be\/|embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
      seedVid = match ? match[1] : (rawUrl.length === 11 ? rawUrl : null);
      if (!seedVid && rawUrl.startsWith('http')) {
        try {
          const infoArgs = [...getBypassArgs(rawUrl), '--dump-json', '--no-download', '--flat-playlist', rawUrl];
          const infoOut = await runYtDlp(infoArgs);
          const firstObj = JSON.parse(infoOut.split('\n').filter(Boolean)[0]);
          seedVid = firstObj.id;
          seedTitle = firstObj.title;
        } catch {}
      }
    } else if (query) {
      log(`Resolving seed video for query: "${query}"`, 'blue');
      const seedArgs = [
        ...getBypassArgs('https://www.youtube.com'),
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        `ytsearch1:${query}`
      ];
      try {
        const seedOut = await runYtDlp(seedArgs);
        const firstLine = seedOut.split('\n').filter(Boolean)[0];
        if (firstLine) {
          const firstObj = JSON.parse(firstLine);
          seedVid = firstObj.id;
          seedTitle = firstObj.title;
          seedChannel = firstObj.uploader || firstObj.channel || 'YouTube';
          seedDuration = firstObj.duration_string || formatDuration(firstObj.duration || 0);
        }
      } catch (e) {
        log(`Failed resolving seed video: ${e.message}`, 'yellow');
      }
    }

    // 2. Build Radio Mix URL (list=RD<seedVid>)
    let targetUrl = '';
    if (seedVid) {
      targetUrl = `https://www.youtube.com/watch?v=${seedVid}&list=RD${seedVid}`;
    } else if (query) {
      targetUrl = `ytsearch15:${query} lagu hits terbaik mix`;
    }

    log(`Generating Smart Multi-Band Radio Mix: "${targetUrl}"`, 'magenta');
    const args = [
      ...getBypassArgs('https://www.youtube.com'),
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      '--playlist-end', '20',
      targetUrl
    ];

    const output = await runYtDlp(args);
    const lines = output.split('\n').filter(Boolean);

    // 3. Strict Keyword Deduplication & Multi-Band Artist Balancing
    const stopWords = new Set(['lagu', 'dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'pada', 'official', 'video', 'music', 'lirik', 'lyrics', 'audio', 'clip', 'cover', 'remix', 'slow', 'dj', 'full', 'album']);
    const refWords = (query || seedTitle).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

    const artistCount = {};
    const seenTitles = new Set();
    const results = [];

    // Always ensure the premier seed song is first if we found it
    if (seedVid && seedTitle) {
      const normSeedTitle = seedTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      seenTitles.add(normSeedTitle);
      results.push({
        id: seedVid,
        title: seedTitle,
        url: `https://www.youtube.com/watch?v=${seedVid}`,
        thumbnail: `https://i.ytimg.com/vi/${seedVid}/hqdefault.jpg`,
        durationFormatted: seedDuration,
        channel: seedChannel
      });
      const normChannel = seedChannel.toLowerCase();
      artistCount[normChannel] = (artistCount[normChannel] || 0) + 1;
    }

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (!item.id || item.id === seedVid) continue;

        const title = item.title || '';
        const lowerTitle = title.toLowerCase();
        const normTitle = lowerTitle.replace(/[^a-z0-9]/g, '');
        if (seenTitles.has(normTitle)) continue;

        // Anti-Judul Kembar (Reject duplicate versions/covers/DJ remixes of the seed song)
        if (refWords.length > 0) {
          const matchedKeywords = refWords.filter(w => lowerTitle.includes(w)).length;
          const isDuplicateTitle = matchedKeywords >= Math.min(refWords.length, 2);
          if (isDuplicateTitle) {
            // Skip duplicate versions of seed title!
            continue;
          }
        }

        // Artist frequency balancing (Max 1 song per artist to keep playlist diverse!)
        const channel = (item.uploader || item.channel || 'YouTube').toLowerCase().trim();
        if (artistCount[channel] && artistCount[channel] >= 1) {
          continue;
        }

        artistCount[channel] = (artistCount[channel] || 0) + 1;
        seenTitles.add(normTitle);

        results.push({
          id: item.id,
          title: item.title,
          url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
          thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          durationFormatted: item.duration_string || formatDuration(item.duration || 0),
          channel: item.uploader || item.channel || 'YouTube'
        });

        if (results.length >= 10) break;
      } catch {}
    }

    // 4. Inject legendary bands (Peterpan, Boomerang, Dewa 19) if missing from Indonesian pop/rock queries
    const isIndoContext = /(cinta|sempurna|peterpan|boomerang|kangen|dewa|ungu|st12|radja|armada|sheila|slank|padi|jamrud|bernadya|ebiet)/i.test((query || seedTitle));
    if (isIndoContext) {
      const titlesJoined = results.map(r => r.title.toLowerCase()).join(' ');

      // Inject Boomerang if missing
      if (!titlesJoined.includes('boomerang') && results.length < 12) {
        try {
          const boomOut = await runYtDlp([...getBypassArgs('https://www.youtube.com'), '--dump-json', '--no-download', '--flat-playlist', 'ytsearch1:boomerang pelangi original audio']);
          const boomObj = JSON.parse(boomOut.split('\n').filter(Boolean)[0]);
          if (boomObj && boomObj.id) {
            results.splice(Math.min(2, results.length), 0, {
              id: boomObj.id,
              title: boomObj.title,
              url: `https://www.youtube.com/watch?v=${boomObj.id}`,
              thumbnail: `https://i.ytimg.com/vi/${boomObj.id}/hqdefault.jpg`,
              durationFormatted: boomObj.duration_string || formatDuration(boomObj.duration || 0),
              channel: boomObj.uploader || boomObj.channel || 'Logiss Records'
            });
          }
        } catch {}
      }

      // Inject Peterpan / NOAH if missing
      if (!titlesJoined.includes('peterpan') && !titlesJoined.includes('noah') && results.length < 12) {
        try {
          const petOut = await runYtDlp([...getBypassArgs('https://www.youtube.com'), '--dump-json', '--no-download', '--flat-playlist', 'ytsearch1:peterpan yang terdalam official video']);
          const petObj = JSON.parse(petOut.split('\n').filter(Boolean)[0]);
          if (petObj && petObj.id) {
            results.splice(Math.min(1, results.length), 0, {
              id: petObj.id,
              title: petObj.title,
              url: `https://www.youtube.com/watch?v=${petObj.id}`,
              thumbnail: `https://i.ytimg.com/vi/${petObj.id}/hqdefault.jpg`,
              durationFormatted: petObj.duration_string || formatDuration(petObj.duration || 0),
              channel: petObj.uploader || petObj.channel || 'Musica Studios'
            });
          }
        } catch {}
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    log(`Radio mix error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal membuat Smart Radio Mix', details: err.message });
  }
});

// --- Taste / History-Based Music Mix Engine ---
app.get('/api/taste-mix', async (req, res) => {
  try {
    const rawUrl = (req.query.url || '').trim();

    // If user provided their YouTube History, Liked, or Playlist URL
    if (rawUrl && rawUrl.startsWith('http')) {
      log(`Generating Taste Mix from user provided YouTube URL: "${rawUrl}"`, 'magenta');
      const args = [
        ...getBypassArgs(rawUrl),
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        '--playlist-end', '15',
        rawUrl
      ];
      const output = await runYtDlp(args);
      const lines = output.split('\n').filter(Boolean);
      const results = [];
      const seen = new Set();
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          const norm = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            results.push({
              id: item.id,
              title: item.title,
              url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
              thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
              durationFormatted: item.duration_string || formatDuration(item.duration || 0),
              channel: item.uploader || item.channel || 'YouTube'
            });
          }
        } catch {}
      }
      return res.json({ success: true, source: 'youtube-url', count: results.length, results });
    }

    // Otherwise, generate from local app history (SQLite) + favorite Indonesian music tastes
    log('Generating Taste Mix from user history & preferences...', 'magenta');
    let pastJobs = [];
    try {
      pastJobs = db.getHistory(30);
    } catch {}

    const artistQueries = [];
    if (pastJobs && pastJobs.length > 0) {
      pastJobs.forEach(j => {
        if (j.title) {
          const match = j.title.match(/^([^-(]+)/);
          if (match && match[1]) {
            const a = match[1].trim();
            if (a.length >= 3 && !artistQueries.includes(a)) {
              artistQueries.push(a);
            }
          }
        }
      });
    }

    const defaultFavorites = ['Peterpan', 'Boomerang', 'Ebiet G. Ade', 'Dewa 19', 'Sheila On 7', 'Iwan Fals', 'Jamrud'];
    defaultFavorites.forEach(df => {
      if (!artistQueries.some(aq => aq.toLowerCase().includes(df.toLowerCase()))) {
        artistQueries.push(df);
      }
    });

    const selectedArtists = artistQueries.slice(0, 8);
    const results = [];
    const seen = new Set();

    const fetchPromises = selectedArtists.map(artist => {
      const qTerm = artist.toLowerCase() === 'boomerang' ? 'Boomerang band indonesia pelangi official' : `${artist} lagu hits official audio`;
      return runYtDlp([
        ...getBypassArgs('https://www.youtube.com'),
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        `ytsearch1:${qTerm}`
      ]).then(out => {
        try {
          return JSON.parse(out.split('\n').filter(Boolean)[0]);
        } catch { return null; }
      }).catch(() => null);
    });

    const items = await Promise.all(fetchPromises);
    for (const item of items) {
      if (item && item.id) {
        const norm = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seen.has(norm)) {
          seen.add(norm);
          results.push({
            id: item.id,
            title: item.title,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            durationFormatted: item.duration_string || formatDuration(item.duration || 0),
            channel: item.uploader || item.channel || 'YouTube'
          });
        }
      }
    }

    res.json({ success: true, source: 'taste-engine', count: results.length, results });
  } catch (err) {
    log(`Taste mix error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal membuat aliran selera musik', details: err.message });
  }
});

// --- Robust In-Memory Lyrics Cache ---
const lyricsCache = new Map();

// --- Robust Synchronized Lyrics Engine (Multi-Query LRCLIB + YouTube Desc/Subs Fallback) ---
app.get('/api/lyrics', async (req, res) => {
  try {
    const rawTitle = (req.query.title || '').trim();
    const rawArtist = (req.query.artist || '').trim();
    const rawUrl = (req.query.url || '').trim();
    const duration = parseFloat(req.query.duration || 0);

    if (!rawTitle && !rawUrl) {
      return res.status(400).json({ error: 'Judul lagu atau URL diperlukan' });
    }

    // Cache check
    const cacheKey = (rawUrl || rawTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lyricsCache.has(cacheKey)) {
      return res.json(lyricsCache.get(cacheKey));
    }

    // 1. Intelligent YouTube Noise Cleaning
    let text = rawTitle;
    const noisePattern = /[\(\[\{][^\(\)\[\]\{\}]*(?:official|video|lirik|lyric|audio|clip|remaster|cover|live|version|hq|hd|karaoke|acoustic|akustik|ost|atsl|setia\s*band)[^\(\)\[\]\{\}]*[\)\]\}]/gi;
    text = text.replace(noisePattern, ' ');
    text = text.replace(/#[\w\d_]+/g, ' ');
    text = text.replace(/\|\|.*$/g, ' ');
    text = text.replace(/\|\s*.*$/g, ' ');
    text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, ' ');
    text = text.replace(/^(?:dj\s*slow|dj\s*remix|dj|viral\s*tiktok!*|viral!*|full\s*album(?:\s*viral)?(?:\s*\d{4})?|lagu\s*viral|terbaru\s*\d{4}|romansa\s*nyess|shaka\s*music)\s*[:-]*\s*/gi, ' ');
    text = text.replace(/\s*(?:cover\s*by|cover|by)\s+.*$/gi, ' ');
    text = text.replace(/-\s*(?:lirik(?:\s*lagu)?|lyrics?|official|video|audio|siska|rudi|shaka).*$/gi, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    let extractedArtist = '';
    let extractedTrack = text;

    if (text.includes(' - ')) {
      const parts = text.split(' - ').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        extractedArtist = parts[0];
        extractedTrack = parts.slice(1).join(' - ');
      }
    } else if (text.includes('-')) {
      const parts = text.split('-').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        extractedArtist = parts[0];
        extractedTrack = parts.slice(1).join(' - ');
      }
    }

    const cleanChannel = rawArtist.replace(/(?:official|vevo|music|records|production|indonesia|channel)/gi, '').trim();

    log(`[Lyrics] Searching lyrics for: "${extractedArtist || cleanChannel} - ${extractedTrack}"`, 'cyan');

    const https = require('https');
    const fetchLrclib = (q) => {
      return new Promise((resolve) => {
        const u = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
        const reqOpts = {
          headers: { 'User-Agent': 'Khanza-YTDownloaderPro/1.0 (https://khanza.net)' },
          timeout: 4000
        };
        const r = https.get(u, reqOpts, (hRes) => {
          let buf = '';
          hRes.on('data', chunk => buf += chunk);
          hRes.on('end', () => {
            try {
              const list = JSON.parse(buf);
              resolve(Array.isArray(list) ? list : []);
            } catch { resolve([]); }
          });
        });
        r.on('error', () => resolve([]));
        r.on('timeout', () => { r.destroy(); resolve([]); });
      });
    };

    function parseLrc(lrcText) {
      if (!lrcText) return [];
      const lines = lrcText.split('\n');
      const parsed = [];
      const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

      for (const line of lines) {
        let match;
        const times = [];
        timeRegex.lastIndex = 0;
        while ((match = timeRegex.exec(line)) !== null) {
          const min = parseInt(match[1], 10);
          const sec = parseInt(match[2], 10);
          const ms = match[3] ? parseFloat('0.' + match[3]) : 0;
          times.push(min * 60 + sec + ms);
        }
        const cleanLine = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
        if (cleanLine) {
          for (const t of times) {
            parsed.push({ time: parseFloat(t.toFixed(2)), text: cleanLine });
          }
        }
      }
      return parsed.sort((a, b) => a.time - b.time);
    }

    // Build multi-permutation search queries
    const searchQueries = [];
    if (extractedArtist && extractedTrack) {
      searchQueries.push(`${extractedArtist} ${extractedTrack}`);
      searchQueries.push(`${extractedTrack} ${extractedArtist}`);
    }
    if (cleanChannel && extractedTrack && cleanChannel !== extractedArtist) {
      searchQueries.push(`${cleanChannel} ${extractedTrack}`);
    }
    if (extractedTrack && extractedTrack.length >= 3) {
      searchQueries.push(extractedTrack);
    }
    if (text && text !== extractedTrack) {
      searchQueries.push(text);
    }

    // Try queries on LRCLIB
    let syncedMatch = null;
    let plainMatch = null;

    for (const q of searchQueries) {
      const candidates = await fetchLrclib(q);
      if (candidates && candidates.length > 0) {
        if (!syncedMatch) {
          syncedMatch = candidates.find(c => c.syncedLyrics);
        }
        if (!plainMatch) {
          plainMatch = candidates.find(c => c.plainLyrics);
        }
        if (syncedMatch) break;
      }
    }

    if (syncedMatch && syncedMatch.syncedLyrics) {
      const parsedLines = parseLrc(syncedMatch.syncedLyrics);
      let autoOffset = 0;
      if (duration > 30 && syncedMatch.duration > 30) {
        const diff = duration - syncedMatch.duration;
        if (diff >= 1.5 && diff <= 25) {
          autoOffset = parseFloat(diff.toFixed(2));
        }
      }
      const result = {
        success: true,
        synced: true,
        source: 'lrclib',
        artist: syncedMatch.artistName,
        track: syncedMatch.trackName,
        lines: parsedLines,
        count: parsedLines.length,
        albumDuration: syncedMatch.duration || 0,
        autoOffset
      };
      lyricsCache.set(cacheKey, result);
      return res.json(result);
    }

    if (plainMatch && plainMatch.plainLyrics) {
      const plainLines = plainMatch.plainLyrics.split('\n').map(l => l.trim()).filter(Boolean);
      const pseudoLines = [];
      const dur = duration > 30 ? duration : (plainLines.length * 4.5);
      const startOffset = 10;
      const step = Math.max(2, (dur - startOffset - 10) / plainLines.length);

      plainLines.forEach((t, idx) => {
        pseudoLines.push({
          time: parseFloat((startOffset + (idx * step)).toFixed(2)),
          text: t
        });
      });

      const result = {
        success: true,
        synced: false,
        source: 'lrclib-plain',
        artist: plainMatch.artistName,
        track: plainMatch.trackName,
        lines: pseudoLines,
        plainLyrics: plainMatch.plainLyrics
      };
      lyricsCache.set(cacheKey, result);
      return res.json(result);
    }

    // Fallback: YouTube Metadata (Subtitles & Description) via yt-dlp
    if (rawUrl) {
      try {
        const subArgs = [
          ...getBypassArgs(rawUrl),
          '--dump-json',
          '--skip-download',
          rawUrl
        ];
        const out = await runYtDlp(subArgs);
        const obj = JSON.parse(out.split('\n').filter(Boolean)[0]);

        // 1. Try subtitles / automatic captions
        const subs = obj.subtitles || obj.automatic_captions;
        const subLang = subs?.id || subs?.en || subs?.['id-orig'] || Object.values(subs || {})[0];

        if (subLang && Array.isArray(subLang)) {
          const vttFormat = subLang.find(f => f.ext === 'vtt' || f.ext === 'json3') || subLang[0];
          if (vttFormat && vttFormat.url) {
            const subRes = await fetch(vttFormat.url);
            const subText = await subRes.text();
            const vttLines = [];
            const vttRegex = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*\n([^\n]+)/g;
            let vm;
            while ((vm = vttRegex.exec(subText)) !== null) {
              const h = parseInt(vm[1], 10);
              const m = parseInt(vm[2], 10);
              const s = parseInt(vm[3], 10);
              const ms = parseInt(vm[4], 10) / 1000;
              const time = h * 3600 + m * 60 + s + ms;
              const lineText = vm[9].replace(/<[^>]+>/g, '').trim();
              if (lineText && !vttLines.some(vl => vl.text === lineText && Math.abs(vl.time - time) < 2)) {
                vttLines.push({ time: parseFloat(time.toFixed(2)), text: lineText });
              }
            }
            if (vttLines.length > 0) {
              const result = {
                success: true,
                synced: true,
                source: 'youtube-captions',
                artist: extractedArtist || cleanChannel,
                track: extractedTrack,
                lines: vttLines,
                count: vttLines.length
              };
              lyricsCache.set(cacheKey, result);
              return res.json(result);
            }
          }
        }

        // 2. Try extracting lyrics from YouTube Description
        if (obj.description) {
          const match = obj.description.match(/(?:lirik(?:\s*lagu)?|lyrics?)\s*[:\-]\s*([\s\S]+?)(?=\n\s*(?:#|https?:\/\/|prod|produced|music\s*video|subscribe|follow|copyright|\(c\)|part\s*\d|$))/i);
          if (match && match[1]) {
            const descLines = match[1]
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('http') && !l.toLowerCase().includes('subscribe'));

            if (descLines.length >= 4) {
              const videoDur = obj.duration || duration || (descLines.length * 4.5);
              const startOffset = 10;
              const step = Math.max(2, (videoDur - startOffset - 10) / descLines.length);
              const descTimedLines = descLines.map((l, idx) => ({
                time: parseFloat((startOffset + (idx * step)).toFixed(2)),
                text: l
              }));

              const result = {
                success: true,
                synced: false,
                source: 'youtube-description',
                artist: extractedArtist || cleanChannel,
                track: extractedTrack,
                lines: descTimedLines,
                plainLyrics: descLines.join('\n')
              };
              lyricsCache.set(cacheKey, result);
              return res.json(result);
            }
          }
        }
      } catch (subErr) {
        log(`[Lyrics] YouTube metadata extraction error: ${subErr.message}`, 'yellow');
      }
    }

    res.json({
      success: false,
      message: 'Lirik lagu belum tersedia untuk trek ini',
      artist: extractedArtist || cleanChannel,
      track: extractedTrack
    });
  } catch (err) {
    log(`Lyrics error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal mengambil lirik', details: err.message });
  }
});

// --- Get video/channel info ---
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    log(`Fetching info: ${url}`, 'blue');

    const args = [
      ...getBypassArgs(url),
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      url,
    ];

    let output;
    try {
      output = await runYtDlp(args);
    } catch (err) {
      if (bypassConfig.autoFallback && isBotBlockedError(err)) {
        const nextClient = getNextClientProfile(bypassConfig.client);
        log(`Auto-fallback triggered for info: switching ${bypassConfig.client} -> ${nextClient}`, 'yellow');
        bypassConfig.client = nextClient;
        const retryArgs = [
          ...getBypassArgs(url),
          '--dump-json',
          '--no-download',
          '--flat-playlist',
          url,
        ];
        output = await runYtDlp(retryArgs);
      } else {
        throw err;
      }
    }
    const lines = output.split('\n').filter(Boolean);
    const entries = lines.map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    if (entries.length === 0) {
      return res.status(400).json({ error: 'Could not fetch video information' });
    }

    // Determine if it's a single video or playlist/channel
    if (entries.length === 1) {
      const info = entries[0];
      const result = {
        type: 'single',
        title: info.title || info.fulltitle || 'Unknown',
        thumbnail: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '',
        duration: info.duration || 0,
        durationFormatted: info.duration_string || formatDuration(info.duration || 0),
        author: info.uploader || info.channel || 'Unknown',
        views: info.view_count ? parseInt(info.view_count).toLocaleString() : '0',
        videoId: info.id,
        url,
        description: (info.description || '').substring(0, 200),
      };
      log(`Single video: "${result.title}"`, 'green');
      res.json(result);
    } else {
      // Playlist or channel
      const result = {
        type: 'playlist',
        title: entries[0].playlist_title || entries[0].playlist || `Playlist (${entries.length} videos)`,
        author: entries[0].playlist_uploader || entries[0].uploader || entries[0].channel || 'Unknown',
        thumbnail: entries[0].thumbnails?.[entries[0].thumbnails.length - 1]?.url ||
                   entries[0].thumbnail ||
                   `https://i.ytimg.com/vi/${entries[0].id}/hqdefault.jpg`,
        count: entries.length,
        url,
        videos: entries.slice(0, 200).map((e, i) => ({
          index: i + 1,
          id: e.id || e.url,
          title: e.title || `Video ${i + 1}`,
          duration: e.duration || 0,
          durationFormatted: e.duration_string || formatDuration(e.duration || 0),
          thumbnail: e.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${e.id}/default.jpg`,
          url: e.url || e.webpage_url || `https://www.youtube.com/watch?v=${e.id}`,
        })),
      };
      log(`Playlist: "${result.title}" — ${result.count} videos`, 'green');
      res.json(result);
    }
  } catch (err) {
    log(`Info error: ${err.message}`, 'red');
    res.status(500).json({
      error: 'Failed to fetch video info. Please check the URL.',
      details: err.message,
    });
  }
});

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- Convert single video ---
app.post('/api/convert', async (req, res) => {
  try {
    const {
      url,
      format = 'mp3',
      quality = '192',
      title: reqTitle,
      trimStart,
      trimEnd,
      customTitle,
      customArtist,
      loudnorm,
      subtitles,
      subLang = 'id,en'
    } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const jobId = uuidv4().slice(0, 12);
    const jobDir = path.join(DOWNLOADS_DIR, jobId);
    ensureDir(jobDir);

    const initialTitle = customTitle || reqTitle || 'Single Video';

    log(`[${jobId}] Converting: ${url} -> ${format} @ ${quality} [Title: "${initialTitle}", Loudnorm: ${Boolean(loudnorm)}, Subs: ${Boolean(subtitles)}]`, 'magenta');

    // Set active job & store in DB
    activeJobs.set(jobId, { progress: 0, status: 'downloading', format, url, title: initialTitle });
    try {
      db.createJob({
        id: jobId,
        url,
        title: initialTitle,
        type: 'single',
        format,
        quality,
        status: 'downloading',
        total: 1
      });
    } catch (e) {
      log(`DB createJob error: ${e.message}`, 'yellow');
    }

    // Build yt-dlp arguments
    let args = [...getBypassArgs(url)];

    if (format === 'srt') {
      // Standalone subtitle download only
      args.push(
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', `${subLang}.*`,
        '--convert-subs', 'srt'
      );
    } else if (format === 'mp3') {
      args.push(
        '-x', '--audio-format', 'mp3',
        '--audio-quality', quality === '320' ? '0' : quality === '256' ? '1' : quality === '192' ? '2' : quality === '128' ? '5' : '9',
        '--embed-thumbnail',
        '--embed-metadata',
        '--add-metadata',
      );
      if (loudnorm === true || loudnorm === 'true') {
        args.push('--postprocessor-args', `ExtractAudio+ffmpeg:-threads 0 -af ${STUDIO_AUDIO_FILTER}`);
        log(`[${jobId}] Studio Remaster & Audio Enhancer (Clarity EQ + EBU R128 Loudnorm) enabled (multi-core)`, 'cyan');
      }
      if (subtitles === true || subtitles === 'true') {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', `${subLang}.*`, '--convert-subs', 'srt');
      }
    } else if (format === 'mp4') {
      if (quality === '2160' || quality === '4k') {
        args.push('-f', 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160]');
      } else if (quality === '1080' || quality === 'fullhd') {
        args.push('-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]');
      } else if (quality === '720' || quality === 'hd') {
        args.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]');
      } else if (quality === '480') {
        args.push('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]');
      } else if (quality === '360') {
        args.push('-f', 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]');
      } else {
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best');
      }
      args.push('--merge-output-format', 'mp4', '--embed-thumbnail', '--embed-metadata', '--add-metadata');
      if (loudnorm === true || loudnorm === 'true') {
        args.push('--postprocessor-args', `ffmpeg:-threads 0 -af ${STUDIO_AUDIO_FILTER}`);
        log(`[${jobId}] Video Studio Audio Remaster (Clarity EQ + EBU R128 Loudnorm) enabled (multi-core)`, 'cyan');
      }
      if (subtitles === true || subtitles === 'true') {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', `${subLang}.*`, '--convert-subs', 'srt', '--embed-subs');
        log(`[${jobId}] Subtitles (ID/EN) embedding enabled`, 'cyan');
      }
    }

    // Optional Trim (Cut) section
    if ((trimStart && trimStart.trim()) || (trimEnd && trimEnd.trim())) {
      const s = (trimStart || '0').trim();
      const e = (trimEnd || 'inf').trim();
      args.push('--download-sections', `*${s}-${e}`, '--force-keyframes-at-cuts');
      log(`[${jobId}] Trimming section: ${s} -> ${e}`, 'yellow');
    }

    // Optional Custom Metadata
    if (customTitle && customTitle.trim()) {
      args.push('--parse-metadata', `:${customTitle.trim()}:%(title)s`);
    }
    if (customArtist && customArtist.trim()) {
      args.push('--parse-metadata', `:${customArtist.trim()}:%(artist)s`);
    }

    args.push(
      '--no-playlist',
      '-o', path.join(jobDir, '%(title)s.%(ext)s'),
      '--print', 'after_move:filepath',
      url,
    );

    // Send immediate response so frontend can poll progress percentage in real time
    res.json({ jobId, status: 'started', message: 'Conversion started' });

    // Run yt-dlp in background with real-time percentage
    let outputPath = '';
    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      const lines = text.split('\n');
      for (const line of lines) {
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match) {
          const prog = parseFloat(match[1]);
          const speedMatch = line.match(/at\s+([^\s]+)/);
          const etaMatch = line.match(/ETA\s+([^\s]+)/);
          const speed = speedMatch ? speedMatch[1] : '';
          const eta = etaMatch ? etaMatch[1] : '';
          activeJobs.set(jobId, {
            ...activeJobs.get(jobId),
            progress: prog,
            speed,
            eta,
            status: 'downloading',
            phase: `Mengunduh stream: ${prog.toFixed(1)}% ${speed ? `(${speed})` : ''} ${eta ? `• Sisa waktu: ${eta}` : ''}`
          });
          try {
            db.updateProgress(jobId, { progress: prog, completed: 0, total: 1, status: 'downloading' });
          } catch (e) {}
        } else if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]') || line.includes('Post-process file')) {
          activeJobs.set(jobId, {
            ...activeJobs.get(jobId),
            progress: 98,
            status: 'converting',
            phase: 'Sedang memproses audio FFmpeg & menyematkan cover album...'
          });
        }
      }
    });

    proc.stderr.on('data', (d) => (stderrData += d.toString()));

    proc.on('close', (code) => {
      if (code === 0) {
        const printedPath = stdoutData.split('\n').filter(Boolean).pop();
        if (printedPath && fs.existsSync(printedPath)) {
          outputPath = printedPath;
        } else {
          const files = fs.readdirSync(jobDir);
          if (files.length > 0) outputPath = path.join(jobDir, files[0]);
        }

        if (outputPath && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const filename = path.basename(outputPath);
          let title = customTitle || reqTitle || filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

          const historyItem = {
            id: jobId,
            title,
            filename,
            jobId,
            format: format.toUpperCase(),
            quality,
            size: formatBytes(stats.size),
            sizeBytes: stats.size,
            date: new Date().toISOString(),
          };
          conversionHistory.unshift(historyItem);
          if (conversionHistory.length > MAX_HISTORY) conversionHistory.pop();

          try {
            db.updateTitle(jobId, title);
            db.addFile({
              job_id: jobId,
              filename,
              filepath: outputPath,
              size_bytes: stats.size,
              size_formatted: formatBytes(stats.size),
            });
            db.setCompleted(jobId);
          } catch (e) {
            log(`DB addFile error: ${e.message}`, 'yellow');
          }

          activeJobs.set(jobId, {
            status: 'completed',
            progress: 100,
            phase: 'Selesai!',
            jobId,
            filename,
            title,
            format: format.toUpperCase(),
            quality,
            size: formatBytes(stats.size),
            sizeBytes: stats.size
          });

          // Clean up from memory after 10 minutes
          setTimeout(() => activeJobs.delete(jobId), 10 * 60 * 1000);

          log(`[${jobId}] Done: ${filename} (${formatBytes(stats.size)})`, 'green');
          return;
        }
      }

      // If failed
      activeJobs.set(jobId, {
        status: 'error',
        error: stderrData || 'Conversion failed'
      });
      try { db.setError(jobId, stderrData || 'Conversion failed'); } catch (e) {}
      log(`[${jobId}] Convert failed`, 'red');
    });

    proc.on('error', (err) => {
      activeJobs.set(jobId, { status: 'error', error: err.message });
      try { db.setError(jobId, err.message); } catch (e) {}
    });

  } catch (err) {
    try { db.setError(jobId, err.message); } catch (e) {}
    log(`Convert error: ${err.message}`, 'red');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Conversion failed', details: err.message });
    }
  }
});

// --- Batch convert (playlist/channel) ---
app.post('/api/convert-batch', async (req, res) => {
  try {
    const {
      url,
      title: reqTitle,
      format = 'mp3',
      quality = '192',
      limit,
      selectedIndices,
      loudnorm,
      subtitles,
      subLang = 'id,en'
    } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const jobId = uuidv4().slice(0, 12);
    const jobDir = path.join(DOWNLOADS_DIR, jobId);
    ensureDir(jobDir);

    const batchTitle = reqTitle || 'Batch Playlist / Channel';
    log(`[${jobId}] Batch converting: ${url} -> ${format} [Title: "${batchTitle}", Loudnorm: ${Boolean(loudnorm)}, Subs: ${Boolean(subtitles)}]`, 'magenta');

    activeJobs.set(jobId, {
      progress: 0,
      status: 'downloading',
      format,
      url,
      title: batchTitle,
      total: 0,
      completed: 0,
      isBatch: true,
    });

    try {
      db.createJob({
        id: jobId,
        url,
        title: batchTitle,
        type: 'playlist',
        format,
        quality,
        status: 'downloading',
        total: 0
      });
    } catch (e) {
      log(`DB batch createJob error: ${e.message}`, 'yellow');
    }

    let args = [...getBypassArgs(url)];

    if (format === 'mp3') {
      args.push(
        '-x', '--audio-format', 'mp3',
        '--audio-quality', quality === '320' ? '0' : quality === '256' ? '1' : quality === '192' ? '2' : quality === '128' ? '5' : '9',
        '--embed-thumbnail',
        '--embed-metadata',
        '--add-metadata',
      );
      if (loudnorm === true || loudnorm === 'true') {
        args.push('--postprocessor-args', `ExtractAudio+ffmpeg:-threads 0 -af ${STUDIO_AUDIO_FILTER}`);
      }
      if (subtitles === true || subtitles === 'true') {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', `${subLang}.*`, '--convert-subs', 'srt');
      }
    } else {
      if (quality === '1080') {
        args.push('-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]');
      } else if (quality === '720') {
        args.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]');
      } else if (quality === '480') {
        args.push('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]');
      } else {
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best');
      }
      args.push('--merge-output-format', 'mp4', '--embed-thumbnail', '--embed-metadata', '--add-metadata');
      if (loudnorm === true || loudnorm === 'true') {
        args.push('--postprocessor-args', `ffmpeg:-threads 0 -af ${STUDIO_AUDIO_FILTER}`);
      }
      if (subtitles === true || subtitles === 'true') {
        args.push('--write-subs', '--write-auto-subs', '--sub-langs', `${subLang}.*`, '--convert-subs', 'srt', '--embed-subs');
      }
    }

    args.push(
      '--yes-playlist',
      '--ignore-errors',
    );

    if (selectedIndices) {
      const indicesStr = Array.isArray(selectedIndices) ? selectedIndices.join(',') : String(selectedIndices);
      if (indicesStr.trim()) {
        args.push('--playlist-items', indicesStr.trim());
        log(`[${jobId}] Selected playlist items: ${indicesStr.trim()}`, 'cyan');
      }
    } else if (limit && parseInt(limit, 10) > 0) {
      args.push('--playlist-end', String(parseInt(limit, 10)));
    }

    args.push(
      '-o', path.join(jobDir, '%(playlist_index)s_%(title)s.%(ext)s'),
      url,
    );

    // Send initial response immediately (batch runs in background)
    res.json({ jobId, status: 'started', message: 'Batch conversion started' });

    // Run in background
    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let downloadCount = 0;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      const dlMatch = text.match(/\[download\] Downloading item (\d+) of (\d+)/);
      if (dlMatch) {
        const current = parseInt(dlMatch[1]);
        const total = parseInt(dlMatch[2]);
        const prog = Math.round(((current - 1) / total) * 100);
        activeJobs.set(jobId, {
          ...activeJobs.get(jobId),
          completed: current - 1,
          total,
          progress: prog,
          status: 'downloading',
        });
        try {
          db.updateProgress(jobId, {
            progress: prog,
            completed: current - 1,
            total,
            status: 'downloading'
          });
        } catch (e) {}
      }
      const progressMatch = text.match(/\[download\]\s+([\d.]+)%/);
      if (progressMatch) {
        const job = activeJobs.get(jobId);
        if (job) {
          const videoProgress = parseFloat(progressMatch[1]);
          const totalProgress = job.total > 0
            ? Math.round(((job.completed + videoProgress / 100) / job.total) * 100)
            : videoProgress;
          activeJobs.set(jobId, { ...job, progress: totalProgress });
          try {
            db.updateProgress(jobId, {
              progress: totalProgress,
              completed: job.completed,
              total: job.total,
              status: 'downloading'
            });
          } catch (e) {}
        }
      }
    });

    proc.on('close', (code) => {
      const files = fs.readdirSync(jobDir).filter(f => !f.startsWith('.'));
      const job = activeJobs.get(jobId);

      if (code === 0 || files.length > 0) {
        activeJobs.set(jobId, {
          ...(job || {}),
          status: 'completed',
          progress: 100,
          completed: files.length,
          total: files.length,
          files: files,
        });

        // Add to history
        const historyItem = {
          id: jobId,
          title: `Batch: ${files.length} files`,
          jobId,
          format: format.toUpperCase(),
          quality,
          fileCount: files.length,
          isBatch: true,
          date: new Date().toISOString(),
        };
        conversionHistory.unshift(historyItem);
        if (conversionHistory.length > MAX_HISTORY) conversionHistory.pop();

        try {
          for (const f of files) {
            const fPath = path.join(jobDir, f);
            let fSize = 0;
            try { fSize = fs.statSync(fPath).size; } catch {}
            db.addFile({
              job_id: jobId,
              filename: f,
              filepath: fPath,
              size_bytes: fSize,
              size_formatted: formatBytes(fSize)
            });
          }
          db.setCompleted(jobId);
        } catch (e) {
          log(`DB batch complete error: ${e.message}`, 'yellow');
        }

        log(`[${jobId}] Batch done: ${files.length} files`, 'green');
      } else {
        activeJobs.set(jobId, {
          ...(job || {}),
          status: 'error',
          error: 'Batch conversion failed',
        });
        try {
          db.setError(jobId, 'Batch conversion failed');
        } catch (e) {}
        log(`[${jobId}] Batch failed`, 'red');
      }
    });

  } catch (err) {
    try { db.setError(jobId, err.message); } catch (e) {}
    log(`Batch error: ${err.message}`, 'red');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Batch conversion failed', details: err.message });
    }
  }
});

// --- Job progress ---
app.get('/api/progress/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (job) {
    return res.json(job);
  }

  // Check database
  try {
    const dbJob = db.getJob(req.params.jobId);
    if (dbJob) {
      const dbFiles = db.getJobFiles(req.params.jobId);
      return res.json({
        ...dbJob,
        files: dbFiles.map(f => f.filename)
      });
    }
  } catch (e) {
    log(`DB getJob error: ${e.message}`, 'yellow');
  }

  // Check if job completed (files exist in downloads dir)
  const jobDir = path.join(DOWNLOADS_DIR, req.params.jobId);
  if (fs.existsSync(jobDir)) {
    const files = fs.readdirSync(jobDir).filter(f => !f.startsWith('.'));
    return res.json({ status: 'completed', progress: 100, files, completed: files.length, total: files.length });
  }
  return res.status(404).json({ error: 'Job not found' });
});

// --- List batch files ---
app.get('/api/batch-files/:jobId', (req, res) => {
  const jobDir = path.join(DOWNLOADS_DIR, req.params.jobId);
  if (!fs.existsSync(jobDir)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const files = fs.readdirSync(jobDir).filter(f => !f.startsWith('.')).map(f => {
    const filePath = path.join(jobDir, f);
    const stats = fs.statSync(filePath);
    return { filename: f, size: formatBytes(stats.size), sizeBytes: stats.size };
  });
  res.json({ jobId: req.params.jobId, files });
});

// --- Download file ---
app.get('/api/download/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;

  // Security: prevent directory traversal
  if (filename.includes('..') || jobId.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const filePath = path.join(DOWNLOADS_DIR, jobId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  log(`Downloading: ${jobId}/${filename}`, 'cyan');
  res.download(filePath, filename);
});

// --- Stream file for In-Browser Audio/Video Player (HTTP 206 Seeking Support) ---
app.get('/api/stream/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  if (filename.includes('..') || jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const filePath = path.join(DOWNLOADS_DIR, jobId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

// --- Open downloads folder in Windows Explorer ---
app.post('/api/open-folder', (req, res) => {
  const { jobId } = req.body || {};
  let targetDir = DOWNLOADS_DIR;

  if (jobId && !jobId.includes('..') && !jobId.includes('/') && !jobId.includes('\\')) {
    const specificDir = path.join(DOWNLOADS_DIR, jobId);
    if (fs.existsSync(specificDir)) {
      targetDir = specificDir;
    }
  }

  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${targetDir}"`, { shell: 'cmd.exe', windowsHide: true });
    } else if (process.platform === 'darwin') {
      execSync(`open "${targetDir}"`);
    } else {
      // Linux / LXC headless or desktop
      try {
        execSync(`xdg-open "${targetDir}"`, { stdio: 'ignore' });
      } catch (_) {
        // Headless server fallback
      }
    }
    log(`Opened folder in Explorer/File Manager: ${targetDir}`, 'green');
    res.json({ status: 'success', path: targetDir });
  } catch (err) {
    log(`Open folder error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Failed to open folder', details: err.message });
  }
});

// --- Download all as ZIP bundle ---
app.get('/api/download-zip/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Security check: prevent directory traversal
  if (jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
    return res.status(400).json({ error: 'Invalid jobId' });
  }

  const jobDir = path.join(DOWNLOADS_DIR, jobId);

  if (!fs.existsSync(jobDir)) {
    return res.status(404).json({ error: 'Job not found or expired' });
  }

  const files = fs.readdirSync(jobDir).filter(f => !f.startsWith('.') && !f.endsWith('.zip'));
  if (files.length === 0) {
    return res.status(404).json({ error: 'Tidak ada file untuk diunduh' });
  }

  const zipFilename = `YT_Download_Bundle_${jobId}.zip`;
  const zipPath = path.join(jobDir, zipFilename);

  // If zip already exists, serve directly
  if (fs.existsSync(zipPath)) {
    log(`Serving cached ZIP: ${zipFilename}`, 'cyan');
    return res.download(zipPath, zipFilename);
  }

  log(`Creating ZIP bundle for job [${jobId}] with ${files.length} files...`, 'magenta');

  try {
    if (process.platform === 'win32') {
      // Use native Windows tar tool for fast zip archive creation
      execSync(`tar -a -c -f "${zipFilename}" --exclude="*.zip" .`, {
        cwd: jobDir,
        timeout: 180000,
        windowsHide: true,
      });
    } else {
      // Linux / Proxmox / macOS: try zip first, fallback to python3 zipfile module
      try {
        execSync(`zip -r "${zipFilename}" . -x "*.zip"`, {
          cwd: jobDir,
          timeout: 180000,
          stdio: 'ignore'
        });
      } catch {
        execSync(`python3 -m zipfile -c "${zipFilename}" *`, {
          cwd: jobDir,
          timeout: 180000,
          shell: '/bin/bash'
        });
      }
    }

    if (fs.existsSync(zipPath)) {
      log(`ZIP ready: ${zipFilename}`, 'green');
      return res.download(zipPath, zipFilename);
    } else {
      throw new Error('ZIP file creation failed');
    }
  } catch (err) {
    log(`ZIP error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal membuat file ZIP', details: err.message });
  }
});

// --- History ---
app.get('/api/history', (_req, res) => {
  try {
    const dbHistory = db.getHistory(50);
    if (dbHistory && dbHistory.length > 0) {
      return res.json(dbHistory);
    }
  } catch (e) {
    log(`DB getHistory error: ${e.message}`, 'yellow');
  }
  res.json(conversionHistory);
});

// --- Clear History ---
app.post('/api/clear-history', (_req, res) => {
  try {
    db.clearHistory();
    conversionHistory.length = 0;
    res.json({ status: 'success', message: 'History cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history', details: err.message });
  }
});

// --- Rename History Item ---
app.post('/api/history/rename', (req, res) => {
  try {
    const { jobId, title } = req.body;
    if (!jobId || !title) return res.status(400).json({ error: 'jobId and title are required' });
    const cleanTitle = title.trim();
    db.updateTitle(jobId, cleanTitle);
    const memItem = conversionHistory.find(h => (h.jobId === jobId || h.id === jobId));
    if (memItem) memItem.title = cleanTitle;
    res.json({ status: 'success', message: 'Judul berhasil diperbarui', title: cleanTitle });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui judul', details: err.message });
  }
});

// --- QR Code Local Wi-Fi Mobile Share ---
app.get('/api/qr-share', async (req, res) => {
  try {
    const { jobId, filename } = req.query;
    const localIp = getLocalIpAddress();
    let targetUrl = `http://${localIp}:${PORT}`;

    if (jobId && filename) {
      targetUrl += `/api/download/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`;
    } else if (jobId) {
      targetUrl += `/api/download-zip/${encodeURIComponent(jobId)}`;
    }

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0a0a1a',
        light: '#ffffff'
      }
    });

    log(`Generated QR code for local mobile share: ${targetUrl}`, 'cyan');

    res.json({
      success: true,
      qrDataUrl,
      targetUrl,
      localIp,
      port: PORT,
      jobId,
      filename: filename || 'Bundle ZIP'
    });
  } catch (err) {
    log(`QR error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal membuat QR Code', details: err.message });
  }
});

// --- Export Download History to .M3U Playlist (VLC / Car Player) ---
app.get('/api/export-m3u', (req, res) => {
  try {
    const history = db.getHistory(200);
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';

    let m3uContent = '#EXTM3U\n#PLAYLIST: Khanza.NET YT Downloader Pro Playlist\n\n';
    let count = 0;

    for (const item of history) {
      if (!item.files || item.files.length === 0) continue;
      for (const file of item.files) {
        const isAudio = /\.(mp3|m4a|flac|wav|aac)$/i.test(file.filename);
        if (isAudio) {
          const title = file.filename.replace(/\.[^.]+$/, '');
          m3uContent += `#EXTINF:180,${title}\n`;
          m3uContent += `${protocol}://${host}/api/stream/${encodeURIComponent(item.id)}/${encodeURIComponent(file.filename)}\n\n`;
          count++;
        }
      }
    }

    if (count === 0) {
      m3uContent += '# Belum ada file audio yang selesai diunduh\n';
    }

    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Khanza_Audio_Playlist.m3u"');
    res.send(m3uContent);
    log(`Exported M3U playlist with ${count} tracks`, 'green');
  } catch (err) {
    log(`Export M3U error: ${err.message}`, 'red');
    res.status(500).json({ error: 'Gagal mengekspor playlist M3U', details: err.message });
  }
});

// --- Cleanup old downloads (older than 1 hour) ---
function cleanupOldDownloads() {
  try {
    db.deleteOldJobs();
  } catch (e) {}

  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const items = fs.readdirSync(DOWNLOADS_DIR);
    for (const item of items) {
      const fullPath = path.join(DOWNLOADS_DIR, item);
      const stats = fs.statSync(fullPath);
      if (stats.mtime.getTime() < cutoff) {
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        log(`Cleaned up: ${item}`, 'yellow');
      }
    }
  } catch (e) {
    log(`Cleanup error: ${e.message}`, 'red');
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldDownloads, 30 * 60 * 1000);

// --- Catch-all: serve index.html ---
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Error handling ---
app.use((err, _req, res, _next) => {
  log(`Server error: ${err.message}`, 'red');
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log(`${C.bright}${C.magenta}╔════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bright}${C.magenta}║${C.reset}   ${C.bright}${C.cyan}🎵 Khanza.NET - YT Downloader Pro${C.reset}                ${C.bright}${C.magenta}║${C.reset}`);
  console.log(`${C.bright}${C.magenta}╠════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.bright}${C.magenta}║${C.reset}   ${C.green}Server  :${C.reset} http://localhost:${PORT}                  ${C.bright}${C.magenta}║${C.reset}`);
  console.log(`${C.bright}${C.magenta}║${C.reset}   ${C.green}yt-dlp  :${C.reset} ${checkBinary('yt-dlp') ? '✅ Installed' : '❌ Missing'}                        ${C.bright}${C.magenta}║${C.reset}`);
  console.log(`${C.bright}${C.magenta}║${C.reset}   ${C.green}FFmpeg  :${C.reset} ${checkBinary('ffmpeg') ? '✅ Installed' : '❌ Missing'}                        ${C.bright}${C.magenta}║${C.reset}`);
  console.log(`${C.bright}${C.magenta}╚════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');
  log('Server is running! Open http://localhost:' + PORT, 'green');
});
