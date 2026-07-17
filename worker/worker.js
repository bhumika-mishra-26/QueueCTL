import { spawn } from 'child_process';
import db from '../database/db.js';
import * as config from '../config/config.js';
import { workerLog, C } from '../cli/ui.js';

// ─────────────────────────────────────────────────────────────────
// COMMAND EXECUTION
// ─────────────────────────────────────────────────────────────────
function executeCommand(command, timeoutSecs) {
  return new Promise((resolve, reject) => {
    let timer;
    const child = spawn(command, { shell: true, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    if (timeoutSecs) {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Timeout exceeded (${timeoutSecs}s limit)`));
      }, timeoutSecs * 1000);
    }

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Exit code ${code}: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// SELF-HEALING: RECLAIM DEAD WORKERS
// ─────────────────────────────────────────────────────────────────
function reclaimDeadWorkers(currentPid) {
  const transaction = db.transaction(() => {
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    // Find workers that are marked active but haven't sent a heartbeat for 10 seconds
    const inactiveWorkers = db.prepare(`
      SELECT pid FROM workers 
      WHERE status = 'active' AND last_heartbeat < ? AND pid != ?
    `).all(tenSecondsAgo, currentPid);

    for (const w of inactiveWorkers) {
      // Check if process is actually dead using process.kill(pid, 0)
      let isAlive = false;
      try {
        process.kill(w.pid, 0);
        isAlive = true;
      } catch (err) {
        // If err.code is 'EPERM', it means we don't have permission but it is alive
        if (err.code === 'EPERM') {
          isAlive = true;
        }
      }

      if (!isAlive) {
        // Mark worker as dead
        db.prepare("UPDATE workers SET status = 'dead' WHERE pid = ?").run(w.pid);
        // Find jobs locked by this worker and reset them to pending
        const reclaimed = db.prepare(`
          UPDATE jobs 
          SET state = 'pending', locked_by = NULL, updated_at = ? 
          WHERE state = 'processing' AND locked_by = ?
        `).run(new Date().toISOString(), w.pid);
        
        if (reclaimed.changes > 0) {
          workerLog(currentPid, '🩹', C.warning, `Reclaimed ${reclaimed.changes} job(s) from dead worker PID ${w.pid}`);
        }
      }
    }
  });
  
  try {
    transaction();
  } catch (err) {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────
// ATOMIC JOB CLAIM WITH PID LOCKING (prevents race conditions)
// ─────────────────────────────────────────────────────────────────
function claimNextJob(workerPid) {
  const transaction = db.transaction(() => {
    const now = new Date().toISOString();
    const job = db.prepare(`
      SELECT * FROM jobs 
      WHERE (state = 'pending' OR state = 'failed')
        AND (run_at IS NULL OR run_at <= ?)
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(now);

    if (!job) return null;

    db.prepare(`
      UPDATE jobs SET state = 'processing', locked_by = ?, updated_at = ? WHERE id = ?
    `).run(workerPid, now, job.id);

    return job;
  });

  return transaction();
}

// ─────────────────────────────────────────────────────────────────
// WORKER ENGINE
// ─────────────────────────────────────────────────────────────────
export async function startWorker(pid, options = {}) {
  const { drain = false } = options;

  if (drain) {
    workerLog(pid, '▶', C.success, 'Engine started in DRAIN mode. Polling...');
  } else {
    workerLog(pid, '▶', C.success, 'Engine started. Polling for jobs...');
  }

  // Register in DB
  db.prepare(`
    INSERT INTO workers (pid, status, last_heartbeat)
    VALUES (?, 'active', ?)
    ON CONFLICT(pid) DO UPDATE SET status = 'active', last_heartbeat = excluded.last_heartbeat
  `).run(pid, new Date().toISOString());

  // Heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      db.prepare('UPDATE workers SET last_heartbeat = ? WHERE pid = ?')
        .run(new Date().toISOString(), pid);
    } catch (e) {}
  }, 3000);

  let isStopping = false;

  const shutdown = () => {
    if (isStopping) return;
    isStopping = true;
    workerLog(pid, '■', C.warning, 'Graceful shutdown initiated.');
    clearInterval(heartbeatInterval);
    try {
      db.prepare("UPDATE workers SET status = 'dead' WHERE pid = ?").run(pid);
      // Unlock any jobs locked by this worker
      db.prepare("UPDATE jobs SET state = 'pending', locked_by = NULL WHERE state = 'processing' AND locked_by = ?").run(pid);
    } catch (e) {}
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ── Main loop ──
  while (!isStopping) {
    // Check DB for stop signal
    try {
      const ws = db.prepare('SELECT status FROM workers WHERE pid = ?').get(pid);
      if (!ws || ws.status === 'stopping') { shutdown(); break; }
    } catch (e) {}

    // Self-healing check of other worker processes
    reclaimDeadWorkers(pid);

    let job = null;
    try {
      job = claimNextJob(pid);
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    if (!job) {
      if (drain) {
        // If drain mode is enabled, check if there are any remaining tasks
        const now = new Date().toISOString();
        const pendingCount = db.prepare(`
          SELECT COUNT(*) as count FROM jobs 
          WHERE (state = 'pending' OR state = 'failed')
            AND (run_at IS NULL OR run_at <= ?)
        `).get(now).count;

        if (pendingCount === 0) {
          workerLog(pid, '🛑', C.success, 'Queue drained. Exiting worker gracefully.');
          shutdown();
          break;
        }
      }

      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const shortCmd = job.command.length > 40 ? job.command.slice(0, 37) + '...' : job.command;
    workerLog(pid, '⏵', C.accent, `${C.accent(job.id)} → ${C.dim(shortCmd)}`);

    const startTime = Date.now();
    db.prepare(`UPDATE jobs SET started_at = ? WHERE id = ?`).run(new Date().toISOString(), job.id);

    try {
      const { stdout, stderr } = await executeCommand(job.command, job.timeout);
      const durationMs = Date.now() - startTime;

      workerLog(pid, '✔', C.success, `${C.accent(job.id)} completed ${C.dim(`(${durationMs}ms)`)}`);

      // Log output
      db.prepare(`
        INSERT INTO job_logs (job_id, attempt, stdout, stderr, exit_code, duration_ms, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(job.id, job.attempts + 1, stdout || null, stderr || null, durationMs, new Date().toISOString());

      db.prepare(`
        UPDATE jobs SET state = 'completed', locked_by = NULL, output = ?, duration_ms = ?, updated_at = ? WHERE id = ?
      `).run(stdout || null, durationMs, new Date().toISOString(), job.id);

    } catch (err) {
      const durationMs = Date.now() - startTime;
      const newAttempts = job.attempts + 1;
      const now = new Date();
      const errMsg = err.message.trim().slice(0, 60);

      workerLog(pid, '✖', C.error, `${C.accent(job.id)} failed ${C.dim(`(${durationMs}ms)`)}: ${C.error(errMsg)}`);

      // Log failed attempt
      db.prepare(`
        INSERT INTO job_logs (job_id, attempt, stdout, stderr, exit_code, duration_ms, created_at)
        VALUES (?, ?, NULL, ?, -1, ?, ?)
      `).run(job.id, newAttempts, err.message, durationMs, now.toISOString());

      if (newAttempts >= job.max_retries) {
        workerLog(pid, '💀', C.dead, `${C.accent(job.id)} → DLQ (${newAttempts}/${job.max_retries} retries exhausted)`);
        db.prepare(`
          UPDATE jobs SET state = 'dead', locked_by = NULL, attempts = ?, error_message = ?, duration_ms = ?, updated_at = ? WHERE id = ?
        `).run(newAttempts, err.message, durationMs, now.toISOString(), job.id);
      } else {
        const backoffBase = parseFloat(config.get('backoff-base') || '2');
        const delaySecs = Math.pow(backoffBase, newAttempts);
        const runAt = new Date(now.getTime() + delaySecs * 1000).toISOString();

        workerLog(pid, '🔁', C.warning, `${C.accent(job.id)} retry #${newAttempts} in ${delaySecs}s`);
        db.prepare(`
          UPDATE jobs SET state = 'failed', locked_by = NULL, attempts = ?, run_at = ?, error_message = ?, duration_ms = ?, updated_at = ? WHERE id = ?
        `).run(newAttempts, runAt, err.message, durationMs, now.toISOString(), job.id);
      }
    }
  }
}

// Direct invocation support
if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
  const drain = process.argv.includes('--drain');
  startWorker(process.pid, { drain }).then(() => process.exit(0));
}
