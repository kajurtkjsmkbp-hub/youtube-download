const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency & performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    type TEXT DEFAULT 'single',
    format TEXT DEFAULT 'MP3',
    quality TEXT DEFAULT '192',
    status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    zip_path TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS downloaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT,
    size_bytes INTEGER DEFAULT 0,
    size_formatted TEXT DEFAULT '0 B',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
  CREATE INDEX IF NOT EXISTS idx_files_job ON downloaded_files(job_id);
`);

// Auto-clean any legacy jobs with generic 'Single Video' / 'Untitled' titles
try {
  const staleJobs = db.prepare(`
    SELECT j.id, f.filename 
    FROM jobs j 
    JOIN downloaded_files f ON j.id = f.job_id 
    WHERE j.title = 'Single Video' OR j.title IS NULL OR j.title = 'Untitled'
  `).all();
  for (const row of staleJobs) {
    if (row.filename) {
      const cleanTitle = row.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      db.prepare('UPDATE jobs SET title = ? WHERE id = ?').run(cleanTitle, row.id);
    }
  }
} catch (e) {}

const statements = {
  createJob: db.prepare(`
    INSERT INTO jobs (id, url, title, type, format, quality, status, total_items, created_at, updated_at)
    VALUES (@id, @url, @title, @type, @format, @quality, @status, @total_items, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `),

  updateProgress: db.prepare(`
    UPDATE jobs
    SET progress = @progress,
        completed_items = @completed_items,
        total_items = CASE WHEN @total_items > 0 THEN @total_items ELSE total_items END,
        status = @status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

  setCompleted: db.prepare(`
    UPDATE jobs
    SET status = 'completed',
        progress = 100,
        zip_path = @zip_path,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

  setError: db.prepare(`
    UPDATE jobs
    SET status = 'error',
        error_message = @error_message,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `),

  updateTitle: db.prepare(`
    UPDATE jobs
    SET title = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  getJob: db.prepare(`
    SELECT * FROM jobs WHERE id = ?
  `),

  getActiveJobs: db.prepare(`
    SELECT * FROM jobs WHERE status = 'downloading' OR status = 'pending'
  `),

  addFile: db.prepare(`
    INSERT INTO downloaded_files (job_id, filename, filepath, size_bytes, size_formatted, created_at)
    VALUES (@job_id, @filename, @filepath, @size_bytes, @size_formatted, CURRENT_TIMESTAMP)
  `),

  getFilesByJob: db.prepare(`
    SELECT filename, filepath, size_bytes AS sizeBytes, size_formatted AS size, created_at AS date
    FROM downloaded_files
    WHERE job_id = ?
    ORDER BY id ASC
  `),

  getHistory: db.prepare(`
    SELECT 
      j.id AS jobId,
      j.id,
      COALESCE(
        NULLIF(NULLIF(j.title, 'Single Video'), 'Untitled'),
        (SELECT filename FROM downloaded_files WHERE job_id = j.id ORDER BY id ASC LIMIT 1),
        j.title
      ) AS title,
      j.url,
      j.type,
      j.format,
      j.quality,
      j.status,
      j.completed_items AS fileCount,
      (j.type = 'playlist') AS isBatch,
      (SELECT filename FROM downloaded_files WHERE job_id = j.id ORDER BY id ASC LIMIT 1) AS filename,
      (SELECT size_formatted FROM downloaded_files WHERE job_id = j.id ORDER BY id ASC LIMIT 1) AS size,
      j.created_at AS date
    FROM jobs j
    WHERE j.status = 'completed' OR j.completed_items > 0
    ORDER BY j.created_at DESC
    LIMIT ?
  `),

  clearHistory: db.prepare(`
    DELETE FROM jobs;
  `),
  
  deleteOldJobs: db.prepare(`
    DELETE FROM jobs WHERE datetime(created_at) < datetime('now', '-24 hours');
  `)
};

module.exports = {
  db,
  createJob(job) {
    statements.createJob.run({
      id: job.id,
      url: job.url,
      title: job.title || 'Untitled',
      type: job.type || 'single',
      format: (job.format || 'MP3').toUpperCase(),
      quality: job.quality || '192',
      status: job.status || 'downloading',
      total_items: job.total || 0,
    });
  },

  updateProgress(id, { progress = 0, completed = 0, total = 0, status = 'downloading' }) {
    statements.updateProgress.run({
      id,
      progress: Math.min(Math.max(progress, 0), 100),
      completed_items: completed,
      total_items: total,
      status,
    });
  },

  setCompleted(id, { zip_path = null } = {}) {
    statements.setCompleted.run({ id, zip_path });
  },

  updateTitle(id, title) {
    if (id && title) {
      statements.updateTitle.run(title, id);
    }
  },

  setError(id, error_message) {
    statements.setError.run({ id, error_message });
  },

  getJob(id) {
    const job = statements.getJob.get(id);
    if (!job) return null;
    return {
      id: job.id,
      jobId: job.id,
      url: job.url,
      title: job.title,
      type: job.type,
      format: job.format,
      quality: job.quality,
      status: job.status,
      progress: job.progress,
      total: job.total_items,
      completed: job.completed_items,
      zip_path: job.zip_path,
      error: job.error_message,
      isBatch: job.type === 'playlist',
      created_at: job.created_at,
    };
  },

  addFile(file) {
    statements.addFile.run({
      job_id: file.job_id,
      filename: file.filename,
      filepath: file.filepath || null,
      size_bytes: file.size_bytes || 0,
      size_formatted: file.size_formatted || '0 B',
    });
  },

  getJobFiles(jobId) {
    return statements.getFilesByJob.all(jobId);
  },

  getHistory(limit = 50) {
    return statements.getHistory.all(limit);
  },

  clearHistory() {
    statements.clearHistory.run();
  },

  deleteOldJobs() {
    statements.deleteOldJobs.run();
  }
};
