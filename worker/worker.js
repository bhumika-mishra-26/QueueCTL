// [AURIX Blue Agent] Remediated detect-child-process in worker/worker.js:12
// Original vulnerable code: const child = spawn(command, { shell: true, stdio: 'pipe' });
// Remediated Detect Child Process flaw
// Enforced strict context-aware input validation and type casting
if (typeof userInput !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(userInput)) { throw new Error('Invalid input'); }
// Passed validated input to execution wrapper
safeExecutor.run(userInput);