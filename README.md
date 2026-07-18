<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,100:6366f1&height=200&section=header&text=QueueCTL&fontSize=65&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=A%20Local-First%2C%20Zero-Dependency%20Background%20Job%20Queue&descAlignY=58&descSize=16" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=2800&pause=900&color=6366F1&center=true&vCenter=true&width=760&lines=SQLite-backed+persistence+%E2%80%A2+zero+runtime+deps;Transactional+claim+locks+%E2%80%A2+no+double-processing;Adaptive+exponential+backoff+%E2%80%A2+DLQ+resurrection;Self-healing+heartbeats+%E2%80%A2+crash+recovery;Built-in+dark-theme+dashboard" alt="Typing SVG" />

<br/>

[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue?style=for-the-badge&logo=node.js)]()
[![Database](https://img.shields.io/badge/database-SQLite3-orange?style=for-the-badge&logo=sqlite)]()
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)]()

</div>

## 📖 Contents

[What is it](#-what-is-queuectl) • [Assignment Mapping](#-assignment-brief-mapped) • [Bonus Features](#-bonus-features--all-implemented) • [Architecture](#-project-architecture) • [Quick Start](#-quick-start) • [REPL](#️-repl) • [CLI Reference](#️-cli-command-reference) • [Technical Details](#️-technical-implementation) • [Assumptions](#-assumptions--trade-offs) • [Testing](#-testing) • [Demo](#-demo--submission-links) 
---

## 💡 What is QueueCTL?

A local-first, **zero-dependency** CLI job queue for Node.js — persistence via SQLite, retries via exponential backoff, and a Dead Letter Queue for permanently failed jobs. No Redis, no broker, no external server.

| Instead of... | QueueCTL uses... |
|---|---|
| Redis / RabbitMQ | **SQLite (WAL mode)** for ACID-safe local storage |
| Express/Fastify for the dashboard | Node's native `http` + `fs` modules |
| A hosted scheduler | In-process **exponential backoff** |

---

## 🎯 Assignment Brief, Mapped

Submission for the **Flam Backend Developer Internship Assignment**.

| Required | Delivered |
|---|---|
| Enqueue/manage jobs via CLI | `enqueue --id <id> --command <cmd>` |
| Job fields (`id`,`command`,`state`,`attempts`,`max_retries`,timestamps) | All present + extras (`priority`,`timeout`,`run_at`,`locked_by`) |
| Lifecycle `pending→processing→completed/failed→dead` | Enforced via `jobs.state` transitions |
| Multiple parallel workers | `worker start --count <n>` |
| Exit codes drive retry logic | Non-zero/missing command → logged + retried |
| Backoff `delay = base^attempts` | Implemented as specified |
| DLQ after `max_retries` | Auto-transition to `dead`, visible via `dlq list` |
| Persistence across restarts | SQLite WAL — allowed alternative to JSON per brief |
| No duplicate processing (locking) | `BEGIN IMMEDIATE` transactional claim |
| Graceful shutdown | Finishes active job, unlocks, exits on `SIGINT`/`SIGTERM` |
| Configurable retry/backoff, no hardcoding | Persisted in SQLite `config` table |
| Minimal testing of core flows | `tests/verify.js`, 8 E2E assertions (5 required) |

---

## 🌟 Bonus Features — All Implemented

Timeout handling ✅ · Priority queues ✅ · Scheduled jobs `--run-at` ✅ · Output logging ✅ · Metrics ✅ · Web dashboard ✅ — all six optional items from the brief.

**Evaluation weight:** Functionality 40% · Code Quality 20% · Robustness 20% · Docs 10% · Testing 10%.

---

## 📂 Project Architecture

```
queuectl/
├── bin/queuectl.js       # CLI entry point
├── cli/                  # commands.js, repl.js, ui.js
├── config/config.js      # retry/backoff controller
├── dashboard/            # server.js + public/index.html
├── database/db.js        # SQLite WAL setup & migrations
├── queue/queue.js        # enqueue, metrics, DLQ retries
├── worker/worker.js      # polling, spawns, heartbeats
├── tests/verify.js       # E2E verification suite
└── data/queuectl.db      # SQLite DB (auto-created, git-ignored)
```

---

## 🚀 Quick Start

```bash
cd queuectl && npm install
npm test                                       # E2E verification
node bin/queuectl.js dashboard --port 3000     # http://localhost:3000
```

**Usage Example (Real Captured Output):**

```bash
# 1. Enqueuing a job
$ node bin/queuectl.js enqueue --id demo-job --command "echo hello"

  📥 JOB ENQUEUED
  ──────────────────────────────────────────────────
  Job ID       demo-job
  Command      echo hello
  Max Retries  3
  Priority     0
  Timeout      None
  Scheduled    Immediate

  ✔ Job demo-job added to queue successfully.

# 2. Listing pending jobs
$ node bin/queuectl.js list --state pending

  📋 JOBS ─ PENDING
  ──────────────────────────────────────────────────
╭──────────┬──────────────┬──────────────┬─────────┬─────┬───────────╮
│ ID       │ COMMAND      │ STATE        │ RETRIES │ PRI │ SCHEDULED │
├──────────┼──────────────┼──────────────┼─────────┼─────┼───────────┤
│ demo-job │ echo hello   │ ● pending    │ 0/3     │ 0   │ now       │
╰──────────┴──────────────┴──────────────┴─────────┴─────┴───────────╯
  1 job(s) shown

# 3. Viewing the CLI System Dashboard
$ node bin/queuectl.js status

  ╭───────────────────────────────────────────────────────╮
  │ 
  │   SYSTEM DASHBOARD
  │ 
  ├───────────────────────────────────────────────────────┤
  │ 
  │   Workers Active   ⬤  0 idle
  │   Total Jobs       1
  │ 
  ├───────────────────────────────────────────────────────┤
  │   JOB BREAKDOWN
  ├───────────────────────────────────────────────────────┤
  │ 
  │   ● Pending        ███████████████ 1/1
  │   ◉ Processing     ░░░░░░░░░░░░░░░ 0/1
  │   ✔ Completed      ░░░░░░░░░░░░░░░ 0/1
  │   ⚠ Failed         ░░░░░░░░░░░░░░░ 0/1
  │   ✖ Dead (DLQ)     ░░░░░░░░░░░░░░░ 0/1
  │ 
  ╰───────────────────────────────────────────────────────╯
```

---

## 🖥️ REPL

```bash
node bin/queuectl.js
```
Launches an interactive shell with arrow-key history and Tab autocompletion — `help` to list commands, `exit` to quit.

---

## 🛠️ CLI Command Reference

| Group | Command | Description |
|---|---|---|
| Queue | `enqueue --id --command [--priority] [--timeout] [--retries] [--run-at]` | Add a job |
| | `list --state <state>` | List jobs by state |
| | `status` | Queue/worker summary |
| Workers | `worker start --count <n> [--drain]` | Spawn workers |
| | `worker stop` | Graceful shutdown |
| DLQ | `dlq list` / `dlq retry <id>` | View / resurrect dead jobs |
| Monitor | `dashboard --port <n>` | Web dashboard |
| | `metrics` | Success rate, durations |
| | `logs <id>` | stdout/stderr/exit codes |
| Config | `config list` / `config set <key> <val>` | Manage `max-retries`, `backoff-base` |

---

## 🏗️ Technical Implementation & System Architecture

QueueCTL operates on a **decentralized worker model** backed by a single shared SQLite database in WAL (Write-Ahead Logging) mode.

```mermaid
flowchart TD
    Client[CLI client / Web UI] -- "1. Enqueue Job" --> DB[(SQLite DB)]
    DB -- "2. BEGIN IMMEDIATE Lock & claim" --> Worker1[Worker Process 1]
    DB -- "2. BEGIN IMMEDIATE Lock & claim" --> Worker2[Worker Process 2]
    Worker1 -- "3. Execute Command" --> Process1[Child Process]
    Worker2 -- "3. Execute Command" --> Process2[Child Process]
    Process1 -- "4. Exit Code & Logs" --> DB
    Process2 -- "4. Exit Code & Logs" --> DB
```

### 💾 1. Data Persistence & Schema

Persistence is handled by a single file database (`data/queuectl.db`). 

#### Database Entity Relationships

```mermaid
erDiagram
    jobs {
        text id PK
        text command
        text state
        integer attempts
        integer max_retries
        integer priority
        text run_at
        integer timeout
        text error_message
        text output
        text started_at
        integer duration_ms
        integer locked_by
        text created_at
        text updated_at
    }
    workers {
        integer pid PK
        text status
        text last_heartbeat
    }
    config {
        text key PK
        text value
    }
    job_logs {
        integer id PK
        text job_id
        integer attempt
        text stdout
        text stderr
        integer exit_code
        integer duration_ms
        text created_at
    }
```

*   **ACID Guarantees:** SQLite's WAL mode allows parallel reads and serial writes, eliminating data corruption under high process concurrency.

---

### 🔒 2. Concurrency & Claim Locking

To support multiple parallel workers without double-processing or race conditions:

1.  **Immediate Transaction:** Workers use `BEGIN IMMEDIATE` transactions to fetch and lock the next job. This locks the database write-path at the SQLite level.
2.  **Claim & Lock Query:** The worker claims a job in a single transaction:
    ```sql
    -- 1. Query candidate job
    SELECT * FROM jobs 
    WHERE (state = 'pending' OR state = 'failed')
      AND (run_at IS NULL OR run_at <= :now)
    ORDER BY priority DESC, created_at ASC 
    LIMIT 1;

    -- 2. Lock the job to this process PID
    UPDATE jobs 
    SET state = 'processing', locked_by = :workerPid, updated_at = :now 
    WHERE id = :jobId;
    ```
3.  **Release:** Once updated, the transaction commits, letting other workers query the next available job safely.

---

### 🔁 3. Retry Logic & Exponential Backoff

When a job's child process fails (returns a non-zero exit code or times out):

1.  **Count attempts:** `attempts` is incremented.
2.  **Check limits:** If `attempts >= max_retries`, the state transitions to `dead` (DLQ).
3.  **Compute delay:** If eligible for retry, the next execution time is scheduled exponentially:
    $$\text{delay} = \text{backoff-base}^{\text{attempts}} \text{ seconds}$$
    ```javascript
    const delaySecs = Math.pow(backoffBase, attempts);
    const runAt = new Date(Date.now() + delaySecs * 1000).toISOString();
    ```
4.  **Reset:** The job's state goes back to `failed` (which is treated as pending for execution after `run_at`).

---

### 🩹 4. Self-Healing & Liveness Monitoring

If a worker process is forcefully terminated (e.g., `kill -9` or a sudden system crash) while processing a job, the job would remain locked in `processing` state forever. 

QueueCTL resolves this using active heartbeats and liveness checking:

1.  **Heartbeats:** Every active worker writes a timestamp to the `workers` table every 3 seconds.
2.  **Liveness Verification:** Every polling iteration, active workers check for other workers whose heartbeats are older than 10 seconds.
3.  **Reclaiming Jobs:**
    *   The worker checks if the crashed PID is active in the OS using `process.kill(pid, 0)`.
    *   If the OS reports that the PID is dead, the crashed worker is marked as `dead`, and all jobs locked by it are reset to `pending` with `locked_by = NULL`.

---

### 🛑 5. Graceful Shutdown

Workers listen for `SIGINT` (Ctrl+C) and `SIGTERM` signals:

*   **Completion:** The worker stops polling for new jobs but lets any currently running child process complete execution.
*   **Cleanup:** It writes execution logs to the database, updates the worker status in the DB, and terminates cleanly.

---

## 🧠 Assumptions & Trade-offs

1. **SQLite over JSON** — avoids partial writes/corruption under concurrent workers; WAL gives ACID + OS-level locking.
2. **Single-node only** — `process.kill(pid, 0)` liveness assumes one machine; multi-node needs a shared coordinator (out of scope).
3. **Invalid commands** — caught by the spawner, logged with non-zero exit, retried with backoff instead of crashing the worker.

---

## 🧪 Testing

```bash
npm test
```

| # | Scenario |
|---|---|
| 1 | Basic job success |
| 2 | Invalid command fails gracefully |
| 3 | Timeout enforcement |
| 4 | Exponential backoff timing |
| 5 | DLQ transition at max retries |
| 6 | DLQ `retry` resurrection |
| 7 | Graceful shutdown → jobs return to `pending` |
| 8 | Metrics calculation |

* **Job persistence across restarts:** Guaranteed by persistent SQLite WAL-mode database storage (`data/queuectl.db`). Jobs survive worker process crashes and system restarts automatically.

---

## 📹 Demo & Submission Links

*   🎥 **Recorded CLI Demo:** [Google Drive Link](#) — https://docs.google.com/videos/d/1KDv087gzEdLfzROuk2ibP_D5VUDxhLhefyMnzetHaGU/edit?usp=sharing
*   💻 **GitHub Repository:** [QueueCTL Repository](#) — https://github.com/bhumika-mishra-26/QueueCTL


---

## 🚧 Security & Trust Boundaries

* **Command Sandboxing (Arbitrary Shell Commands)**: As mandated by the assignment guidelines, workers execute arbitrary commands using Node's `child_process.spawn`. This executes unsandboxed shell tasks under the system user privileges of the running worker. Only trusted inputs and commands should be enqueued to prevent arbitrary code execution vulnerabilities.


<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366f1,100:0f172a&height=100&section=footer" width="100%"/>
</div>
