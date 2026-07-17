import readline from 'readline';
import chalk from 'chalk';
import { banner, C, gradient, info, success, error, table, sectionHeader } from './ui.js';

// Simple argument parser that respects double and single quotes
function parseCommandString(str) {
  const args = [];
  let current = '';
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === ' ' && !inDoubleQuote && !inSingleQuote) {
      if (current.trim().length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    args.push(current);
  }
  return args;
}

export function startRepl(program) {
  // Override exit behavior so Commander doesn't exit the shell on help/errors
  program.exitOverride();

  banner();
  console.log(gradient('  ✨ Interactive Console Session Initiated.'));
  console.log(`  Type ${C.accent('help')} to list commands or ${C.warning('exit')} to quit.`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold.hex('#6C63FF')('queuectl ➜  '),
    completer: (line) => {
      const completions = [
        'status', 'list', 'enqueue', 'worker start', 'worker stop', 
        'metrics', 'logs', 'dlq list', 'dlq retry', 'config list', 'config set', 'dashboard', 'exit', 'help'
      ];
      const hits = completions.filter((c) => c.startsWith(line.trim()));
      return [hits.length ? hits : completions, line];
    }
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(chalk.yellow('\n  Goodbye!'));
      rl.close();
      process.exit(0);
    }

    if (trimmed === 'clear') {
      console.clear();
      rl.prompt();
      return;
    }

    if (trimmed === 'help') {
      sectionHeader('AVAILABLE COMMANDS', '💡');
      table(
        [
          { key: 'command',     label: 'COMMAND' },
          { key: 'description', label: 'DESCRIPTION' }
        ],
        [
          { command: C.accent('status'),          description: 'Show summary of all job states & active workers' },
          { command: C.accent('list'),            description: 'List jobs (filter with --state <state>)' },
          { command: C.accent('enqueue'),         description: 'Add a new job (options: --id, --command, --retries, --priority, --timeout)' },
          { command: C.accent('worker start'),    description: 'Start workers (options: --count, --drain)' },
          { command: C.accent('worker stop'),     description: 'Stop all active workers gracefully' },
          { command: C.accent('dashboard'),       description: 'Start the web monitoring dashboard (options: --port)' },
          { command: C.accent('metrics'),         description: 'Show execution statistics and performance metrics' },
          { command: C.accent('logs <job_id>'),   description: 'Show execution history, exit code and stdout/stderr for a job' },
          { command: C.accent('dlq list'),        description: 'List all jobs in the Dead Letter Queue (DLQ)' },
          { command: C.accent('dlq retry <id>'),  description: 'Resurrect a job from DLQ back to pending' },
          { command: C.accent('config list'),     description: 'List all configuration settings' },
          { command: C.accent('config set <k> <v>'), description: 'Update a configuration value (max-retries, backoff-base)' },
          { command: C.accent('clear'),           description: 'Clear the terminal screen' },
          { command: C.accent('exit / quit'),     description: 'Close the interactive console session' }
        ]
      );
      console.log('');
      rl.prompt();
      return;
    }

    const args = parseCommandString(trimmed);

    try {
      // Pass the parsed array to Commander program
      // We prepend dummy node and bin arguments since Commander expects them
      await program.parseAsync(['node', 'queuectl', ...args]);
    } catch (err) {
      if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.help') {
        if (err.message && !err.message.includes('execute binary')) {
          error(err.message);
        }
      }
    }

    console.log('');
    rl.prompt();
  }).on('close', () => {
    process.exit(0);
  });
}
