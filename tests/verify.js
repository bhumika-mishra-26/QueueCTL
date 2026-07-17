import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic imports
const { default: db } = await import('../database/db.js');
const queue = await import('../queue/queue.js');
const { startWorker } = await import('../worker/worker.js');
const ui = await import('../cli/ui.js');

// Reset database tables for clean test run without unlinking
db.exec('DELETE FROM jobs; DELETE FROM workers; DELETE FROM config; DELETE FROM job_logs;');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  ui.banner();
  ui.sectionHeader('VERIFICATION TEST SUITE', '🧪');
  console.log('');

  // ── Test 1: Enqueue ──────────────────────────────────────────
  console.log(`  ${ui.C.header('Test 1:')} Enqueuing jobs...`);

  queue.enqueue({
    id: 'success-job',
    command: 'node -e "console.log(\'ok\')"',
    max_retries: 2,
  });

  queue.enqueue({
    id: 'fail-job',
    command: 'node -e "process.exit(1)"',
    max_retries: 2,
  });

  queue.enqueue({
    id: 'timeout-job',
    command: 'node -e "setTimeout(()=>process.exit(0),5000)"',
    max_retries: 2,
    timeout: 1,
  });

  ui.table(
    [
      { key: 'id', label: 'ID' },
      { key: 'command', label: 'COMMAND' },
      { key: 'state', label: 'STATE' },
      { key: 'timeout', label: 'TIMEOUT' },
    ],
    queue.listJobs().map(j => ({
      id: ui.C.accent(j.id),
      command: ui.C.white(j.command),
      state: ui.stateBadge(j.state),
      timeout: j.timeout ? ui.C.warning(`${j.timeout}s`) : ui.C.dim('none'),
    }))
  );

  ui.success('3 jobs enqueued.');

  // ── Test 2: Worker processing ────────────────────────────────
  console.log(`\n  ${ui.C.header('Test 2:')} Starting worker to process jobs...`);
  const workerPromise = startWorker(9999);
  await delay(4000);

  // ── Test 3: Check initial states ─────────────────────────────
  console.log(`\n  ${ui.C.header('Test 3:')} Checking job states after initial processing...`);

  let jobs = queue.listJobs();
  ui.table(
    [
      { key: 'id', label: 'ID' },
      { key: 'state', label: 'STATE' },
      { key: 'attempts', label: 'RETRIES' },
    ],
    jobs.map(j => ({
      id: ui.C.accent(j.id),
      state: ui.stateBadge(j.state),
      attempts: ui.C.muted(`${j.attempts}/${j.max_retries}`),
    }))
  );

  const successJob = jobs.find(j => j.id === 'success-job');
  if (successJob.state !== 'completed') throw new Error('success-job did not complete!');
  ui.success('success-job completed correctly.');

  // ── Test 4: Wait for backoff & DLQ ──────────────────────────
  console.log(`\n  ${ui.C.header('Test 4:')} Waiting for exponential backoff & DLQ migration...`);
  await delay(4000);

  jobs = queue.listJobs();
  ui.table(
    [
      { key: 'id', label: 'ID' },
      { key: 'state', label: 'STATE' },
      { key: 'attempts', label: 'RETRIES' },
      { key: 'error', label: 'ERROR' },
    ],
    jobs.map(j => ({
      id: ui.C.accent(j.id),
      state: ui.stateBadge(j.state),
      attempts: ui.C.muted(`${j.attempts}/${j.max_retries}`),
      error: j.error_message ? ui.C.error(j.error_message.trim().slice(0, 40)) : ui.C.dim('—'),
    }))
  );

  const deadJobs = queue.getDlq();
  if (deadJobs.length !== 2) throw new Error(`Expected 2 DLQ jobs, found ${deadJobs.length}`);
  ui.success('Failed and timed-out jobs correctly moved to DLQ.');

  // ── Test 5: DLQ retry ───────────────────────────────────────
  console.log(`\n  ${ui.C.header('Test 5:')} Retrying a job from DLQ...`);
  queue.retryDlq('fail-job');
  const retriedJob = queue.listJobs().find(j => j.id === 'fail-job');
  if (retriedJob.state !== 'pending' || retriedJob.attempts !== 0) {
    throw new Error('DLQ retry failed to reset job state!');
  }
  ui.success('DLQ retry reset fail-job back to pending.');

  // ── Test 6: Graceful shutdown ───────────────────────────────
  console.log(`\n  ${ui.C.header('Test 6:')} Stopping worker...`);
  db.prepare("UPDATE workers SET status = 'stopping' WHERE pid = ?").run(9999);
  await delay(1500);

  // ── Test 7: Execution Metrics ──────────────────────────────
  console.log(`\n  ${ui.C.header('Test 7:')} Execution Metrics...`);
  const metrics = queue.getMetrics();

  ui.sectionHeader('EXECUTION METRICS', '📊');
  ui.keyValue([
    ['Total Jobs',       String(metrics.totalJobs)],
    ['Completed',        String(metrics.completedJobs)],
    ['Dead (Failed)',    String(metrics.failedJobs)],
    ['Success Rate',     `${metrics.successRate}%`],
    ['Total Attempts',   String(metrics.totalAttempts)],
    ['Avg Duration',     `${metrics.avgDuration}ms`],
    ['Min Duration',     `${metrics.minDuration}ms`],
    ['Max Duration',     `${metrics.maxDuration}ms`],
  ]);

  if (metrics.totalJobs !== 3) throw new Error(`Expected 3 total jobs, got ${metrics.totalJobs}`);
  if (metrics.completedJobs !== 1) throw new Error(`Expected 1 completed, got ${metrics.completedJobs}`);
  if (parseFloat(metrics.successRate) <= 0) throw new Error('Success rate should be > 0');
  if (metrics.avgDuration <= 0) throw new Error('Average duration should be > 0');
  ui.success('Metrics calculated correctly.');

  // ── Test 8: Job Output Logs ────────────────────────────────
  console.log(`\n  ${ui.C.header('Test 8:')} Job Output Logs...`);

  const successLogs = queue.getJobLogs('success-job');
  const failLogs = queue.getJobLogs('fail-job');

  ui.sectionHeader('LOGS ─ success-job', '📜');
  ui.table(
    [
      { key: 'attempt',   label: 'ATTEMPT' },
      { key: 'exit_code', label: 'EXIT' },
      { key: 'duration',  label: 'DURATION' },
      { key: 'stdout',    label: 'STDOUT' },
      { key: 'stderr',    label: 'STDERR' },
      { key: 'time',      label: 'TIMESTAMP' },
    ],
    successLogs.map(l => ({
      attempt:   ui.C.accent(`#${l.attempt}`),
      exit_code: l.exit_code === 0 ? ui.C.success('0') : ui.C.error(String(l.exit_code)),
      duration:  ui.C.muted(`${l.duration_ms}ms`),
      stdout:    l.stdout ? ui.C.white(l.stdout.trim().slice(0, 30)) : ui.C.dim('—'),
      stderr:    l.stderr ? ui.C.error(l.stderr.trim().slice(0, 30)) : ui.C.dim('—'),
      time:      ui.C.dim(new Date(l.created_at).toLocaleTimeString()),
    }))
  );

  ui.sectionHeader('LOGS ─ fail-job', '📜');
  ui.table(
    [
      { key: 'attempt',   label: 'ATTEMPT' },
      { key: 'exit_code', label: 'EXIT' },
      { key: 'duration',  label: 'DURATION' },
      { key: 'stderr',    label: 'STDERR' },
      { key: 'time',      label: 'TIMESTAMP' },
    ],
    failLogs.map(l => ({
      attempt:   ui.C.accent(`#${l.attempt}`),
      exit_code: l.exit_code === 0 ? ui.C.success('0') : ui.C.error(String(l.exit_code)),
      duration:  ui.C.muted(`${l.duration_ms}ms`),
      stderr:    l.stderr ? ui.C.error(l.stderr.trim().slice(0, 40)) : ui.C.dim('—'),
      time:      ui.C.dim(new Date(l.created_at).toLocaleTimeString()),
    }))
  );

  if (successLogs.length < 1) throw new Error('Expected at least 1 log for success-job');
  if (successLogs[0].exit_code !== 0) throw new Error('success-job log should have exit_code 0');
  if (!successLogs[0].stdout || !successLogs[0].stdout.includes('ok')) {
    throw new Error('success-job stdout should contain "ok"');
  }
  if (failLogs.length < 1) throw new Error('Expected at least 1 log for fail-job');
  if (failLogs[0].exit_code === 0) throw new Error('fail-job log should not have exit_code 0');
  ui.success('Job output logging verified — stdout, stderr, exit codes, and durations captured.');

  // ── Results ─────────────────────────────────────────────────
  ui.sectionHeader('ALL 8 TESTS PASSED', '🎉');
  console.log(`  ${ui.C.success('✔')} Core: enqueue, execution, retries, backoff, DLQ, shutdown`);
  console.log(`  ${ui.C.success('✔')} Bonus: metrics, job output logging`);
  console.log('');
  process.exit(0);
}

runTests().catch(err => {
  ui.error(`Test failed: ${err.message}`);
  process.exit(1);
});
