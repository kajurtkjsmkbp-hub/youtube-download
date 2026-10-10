/**
 * Database Module - Khanza.NET YT Downloader Pro
 * Pure JavaScript High-Performance Storage (Zero-Crash, Zero-Segfault Architecture)
 * 100% Compatible with Linux LXC, Proxmox, Docker, Windows & macOS.
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.json');
const TMP_PATH = path.join(__dirname, 'database.json.tmp');

let data = {
  jobs: {},
  files: [],
  fileIdSeq: 1
};

// Load database from file
function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.jobs === 'object') {
        data.jobs = parsed.jobs || {};
        data.files = Array.isArray(parsed.files) ? parsed.files : [];
        data.fileIdSeq = typeof parsed.fileIdSeq === 'number' ? parsed.fileIdSeq : (data.files.length + 1);
      }
    }
  } catch (err) {
    console.error('[DB] Warning loading database.json, initializing fresh store:', err.message);
  }
}

// Atomic save to disk (safe against sudden power loss)
let saveTimeout = null;
function persist() {
  try {
    const serialized = JSON.stringify(data, null, 2);
    fs.writeFileSync(TMP_PATH, serialized, 'utf8');
    fs.renameSync(TMP_PATH, DB_PATH);
  } catch (err) {
    // If rename fails (e.g. cross-device link), fallback to direct write
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e2) {
      console.error('[DB] Persist error:', e2.message);
    }
  }
}

function scheduleSave(immediate = false) {
  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = null;
    persist();
    return;
  }
  if (!saveTimeout) {
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      persist();
    }, 200);
  }
}

// Initial load
loadDb();

// Clean up stale generic titles
try {
  for (const id in data.jobs) {
    const j = data.jobs[id];
    if (j.title === 'Single Video' || !j.title || j.title === 'Untitled') {
      const firstFile = data.files.find(f => f.job_id === id);
      if (firstFile && firstFile.filename) {
        j.title = firstFile.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      }
    }
  }
} catch (_) {}

module.exports = {
  // Compatibility db handle
  db: {
    pragma: () => 'WAL',
    exec: () => {},
    prepare: () => ({ all: () => [], get: () => null, run: () => {} })
  },

  createJob(job) {
    const now = new Date().toISOString();
    data.jobs[job.id] = {
      id: job.id,
      url: job.url || '',
      title: job.title || 'Untitled',
      type: job.type || 'single',
      format: (job.format || 'MP3').toUpperCase(),
      quality: String(job.quality || '192'),
      status: job.status || 'downloading',
      progress: 0,
      total_items: Number(job.total || 0),
      completed_items: 0,
      zip_path: null,
      error_message: null,
      created_at: now,
      updated_at: now
    };
    scheduleSave(true);
  },

  updateProgress(id, { progress = 0, completed = 0, total = 0, status = 'downloading' } = {}) {
    const j = data.jobs[id];
    if (!j) return;
    j.progress = Math.min(Math.max(Number(progress) || 0, 0), 100);
    j.completed_items = Number(completed) || j.completed_items || 0;
    if (Number(total) > 0) j.total_items = Number(total);
    j.status = status;
    j.updated_at = new Date().toISOString();
    scheduleSave(false);
  },

  setCompleted(id, { zip_path = null } = {}) {
    const j = data.jobs[id];
    if (!j) return;
    j.status = 'completed';
    j.progress = 100;
    if (zip_path) j.zip_path = zip_path;
    j.updated_at = new Date().toISOString();
    scheduleSave(true);
  },

  updateTitle(id, title) {
    if (!id || !title) return;
    const j = data.jobs[id];
    if (j) {
      j.title = title;
      j.updated_at = new Date().toISOString();
      scheduleSave(true);
    }
  },

  setError(id, error_message) {
    const j = data.jobs[id];
    if (!j) return;
    j.status = 'error';
    j.error_message = String(error_message || 'Unknown error');
    j.updated_at = new Date().toISOString();
    scheduleSave(true);
  },

  getJob(id) {
    const j = data.jobs[id];
    if (!j) return null;
    return {
      id: j.id,
      jobId: j.id,
      url: j.url,
      title: j.title,
      type: j.type,
      format: j.format,
      quality: j.quality,
      status: j.status,
      progress: j.progress,
      total: j.total_items,
      completed: j.completed_items,
      zip_path: j.zip_path,
      error: j.error_message,
      isBatch: j.type === 'playlist',
      created_at: j.created_at
    };
  },

  getActiveJobs() {
    return Object.values(data.jobs).filter(j => j.status === 'downloading' || j.status === 'pending');
  },

  addFile(file) {
    const id = data.fileIdSeq++;
    const now = new Date().toISOString();
    data.files.push({
      id,
      job_id: file.job_id,
      filename: file.filename,
      filepath: file.filepath || null,
      size_bytes: file.size_bytes || 0,
      size_formatted: file.size_formatted || '0 B',
      created_at: now
    });
    scheduleSave(true);
  },

  getJobFiles(jobId) {
    return data.files
      .filter(f => f.job_id === jobId)
      .map(f => ({
        filename: f.filename,
        filepath: f.filepath,
        sizeBytes: f.size_bytes,
        size: f.size_formatted,
        date: f.created_at
      }));
  },

  getHistory(limit = 50) {
    const eligible = Object.values(data.jobs).filter(j => j.status === 'completed' || (j.completed_items && j.completed_items > 0));
    eligible.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return eligible.slice(0, limit).map(j => {
      const jobFiles = data.files.filter(f => f.job_id === j.id);
      const firstFile = jobFiles[0] || {};
      let title = j.title;
      if (title === 'Single Video' || title === 'Untitled' || !title) {
        title = firstFile.filename ? firstFile.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ') : (j.title || 'Untitled');
      }
      return {
        jobId: j.id,
        id: j.id,
        title: title || 'Untitled',
        url: j.url,
        type: j.type,
        format: j.format,
        quality: j.quality,
        status: j.status,
        fileCount: j.completed_items || 0,
        isBatch: j.type === 'playlist' ? 1 : 0,
        filename: firstFile.filename || '',
        size: firstFile.size_formatted || '0 B',
        date: j.created_at
      };
    });
  },

  clearHistory() {
    data.jobs = {};
    data.files = [];
    data.fileIdSeq = 1;
    scheduleSave(true);
  },

  deleteOldJobs() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let changed = false;
    for (const id in data.jobs) {
      if (new Date(data.jobs[id].created_at).getTime() < cutoff) {
        delete data.jobs[id];
        changed = true;
      }
    }
    const beforeCount = data.files.length;
    data.files = data.files.filter(f => data.jobs[f.job_id] || new Date(f.created_at).getTime() >= cutoff);
    if (data.files.length !== beforeCount) changed = true;
    if (changed) scheduleSave(true);
  }
};
