/**
 * AURIX Blue Agent Security Patch
 * Vulnerability: spawn-shell-true (CWE-78: OS Command Injection)
 * Severity: HIGH | CVSS: 8.0
 */

const { spawn } = require('child_process');

function executeWorkerTask(command, args = []) {
    // SECURE: shell:false prevents OS command injection
    return spawn(command, args, { shell: false, stdio: 'pipe' });
}

module.exports = { executeWorkerTask };
