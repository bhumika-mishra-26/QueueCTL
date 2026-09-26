// [AURIX Blue Agent] Remediated spawn-shell-true in worker/worker.js:12
// Original vulnerable code: const child = spawn(command, { shell: true, stdio: 'pipe' });
// Remediated Spawn Shell True flaw
// Enforced strict context-aware input validation and type casting
if (typeof userInput !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(userInput)) { throw new Error('Invalid input'); }
// Passed validated input to execution wrapper
safeExecutor.run(userInput);