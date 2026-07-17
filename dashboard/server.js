import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import * as queue from '../queue/queue.js';
import * as config from '../config/config.js';
import db from '../database/db.js';
import { C, gradient } from '../cli/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, 'public/index.html');
const workerPath = path.resolve(__dirname, '../worker/worker.js');

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', err => reject(err));
  });
}

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

function checkAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Basic') return false;
  
  const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

export function startServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    // Basic Auth Check
    if (!checkAuth(req)) {
      res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="QueueCTL Dashboard"'
      });
      res.end('Unauthorized');
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Set CORS headers for debugging/flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ── HTML Dashboard Page ──
      if (pathname === '/' && req.method === 'GET') {
        fs.readFile(htmlPath, 'utf8', (err, html) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Internal Server Error: ${err.message}`);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        });
        return;
      }

      // ── REST API: Get Queue Status Summary ──
      if (pathname === '/api/status' && req.method === 'GET') {
        const stats = queue.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
        return;
      }

      // ── REST API: Get All Queue Jobs ──
      if (pathname === '/api/jobs' && req.method === 'GET') {
        const jobs = queue.listJobs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jobs));
        return;
      }

      // ── REST API: Get Job Execution Log History ──
      if (pathname === '/api/logs' && req.method === 'GET') {
        const jobId = parsedUrl.searchParams.get('id');
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing required "id" parameter');
          return;
        }
        const logs = queue.getJobLogs(jobId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
        return;
      }

      // ── REST API: Resurrect Job from DLQ ──
      if (pathname === '/api/retry' && req.method === 'POST') {
        const jobId = parsedUrl.searchParams.get('id');
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing required "id" parameter');
          return;
        }
        queue.retryDlq(jobId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ── REST API: Get System Performance Metrics ──
      if (pathname === '/api/metrics' && req.method === 'GET') {
        const metrics = queue.getMetrics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics));
        return;
      }

      // ── REST API: Get Workers List ──
      if (pathname === '/api/workers' && req.method === 'GET') {
        const workers = queue.listWorkers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workers));
        return;
      }

      // ── REST API: Enqueue Job ──
      if (pathname === '/api/enqueue' && req.method === 'POST') {
        const body = await readRequestBody(req);
        queue.enqueue(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: body.id }));
        return;
      }

      // ── REST API: Delete Job ──
      if (pathname === '/api/delete' && req.method === 'POST') {
        const jobId = parsedUrl.searchParams.get('id');
        if (!jobId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing required "id" parameter');
          return;
        }
        queue.deleteJob(jobId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ── REST API: Purge Jobs ──
      if (pathname === '/api/purge' && req.method === 'POST') {
        const category = parsedUrl.searchParams.get('category') || 'completed';
        queue.purgeJobs(category);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ── REST API: Spawn Background Worker ──
      if (pathname === '/api/workers/spawn' && req.method === 'POST') {
        const child = fork(workerPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pid: child.pid }));
        return;
      }

      // ── REST API: Stop Worker Gracefully ──
      if (pathname === '/api/workers/stop' && req.method === 'POST') {
        const pid = parseInt(parsedUrl.searchParams.get('pid'), 10);
        if (!pid) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing required "pid" parameter');
          return;
        }
        db.prepare("UPDATE workers SET status = 'stopping' WHERE pid = ?").run(pid);
        try { process.kill(pid, 'SIGINT'); } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }

      // ── REST API: Get All Configs ──
      if (pathname === '/api/config' && req.method === 'GET') {
        const configs = config.getAll();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(configs));
        return;
      }

      // ── REST API: Set Config Key ──
      if (pathname === '/api/config/set' && req.method === 'POST') {
        const body = await readRequestBody(req);
        if (!body.key || body.value === undefined) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing required "key" or "value" parameter');
          return;
        }
        config.set(body.key, body.value);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ── Route Not Found ──
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  });

  server.listen(port, () => {
    console.log('\n  ╭──────────────────────────────────────────────────╮');
    console.log(`  │ ${gradient('  WEB MONITORING DASHBOARD ONLINE                 ')} │`);
    console.log('  ├──────────────────────────────────────────────────┤');
    console.log(`  │  Address : ${C.accent(`http://localhost:${port}`)}               │`);
    console.log(`  │  Status  : ${C.success('Listening on HTTP Port')}                  │`);
    console.log('  ╰──────────────────────────────────────────────────╯\n');
  });

  return server;
}
