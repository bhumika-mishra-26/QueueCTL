import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────
// GRADIENT & COLOR PALETTE
// ─────────────────────────────────────────────────────────────────
const C = {
  brand:    chalk.hex('#6C63FF'),       // Purple accent
  brandBg:  chalk.bgHex('#6C63FF').white.bold,
  accent:   chalk.hex('#00D9FF'),       // Cyan accent
  success:  chalk.hex('#00E676'),       // Mint green
  warning:  chalk.hex('#FFD740'),       // Amber
  error:    chalk.hex('#FF5252'),       // Coral red
  dead:     chalk.hex('#FF1744').bold,   // Hot red
  dim:      chalk.hex('#757575'),       // Muted gray
  muted:    chalk.hex('#9E9E9E'),
  white:    chalk.hex('#FAFAFA'),
  header:   chalk.hex('#B388FF').bold,   // Light purple
  border:   chalk.hex('#424242'),       // Dark gray borders
  highlight:chalk.hex('#E040FB'),       // Magenta highlight
};

// ─────────────────────────────────────────────────────────────────
// GRADIENT TEXT (simulated multi-color)
// ─────────────────────────────────────────────────────────────────
const gradientColors = ['#6C63FF', '#7C4DFF', '#B388FF', '#E040FB', '#FF80AB', '#FF5252'];

export function gradient(text) {
  const chars = [...text];
  return chars.map((ch, i) => {
    const color = gradientColors[i % gradientColors.length];
    return chalk.hex(color)(ch);
  }).join('');
}

// ─────────────────────────────────────────────────────────────────
// BRAND BANNER
// ─────────────────────────────────────────────────────────────────
export function banner() {
  const art = [
    '  ╔═══════════════════════════════════════════════════════════╗',
    '  ║                                                           ║',
    '  ║    ██████╗ ██╗   ██╗███████╗██╗   ██╗███████╗             ║',
    '  ║   ██╔═══██╗██║   ██║██╔════╝██║   ██║██╔════╝             ║',
    '  ║   ██║   ██║██║   ██║█████╗  ██║   ██║█████╗               ║',
    '  ║   ██║▄▄ ██║██║   ██║██╔══╝  ██║   ██║██╔══╝               ║',
    '  ║   ╚██████╔╝╚██████╔╝███████╗╚██████╔╝███████╗             ║',
    '  ║    ╚════▀▀╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝             ║',
    '  ║                                                           ║',
    '  ║              ██████╗████████╗██╗                           ║',
    '  ║             ██╔════╝╚══██╔══╝██║                           ║',
    '  ║             ██║        ██║   ██║                           ║',
    '  ║             ██║        ██║   ██║                           ║',
    '  ║             ╚██████╗   ██║   ███████╗                      ║',
    '  ║              ╚═════╝   ╚═╝   ╚══════╝                      ║',
    '  ║                                                           ║',
    '  ╚═══════════════════════════════════════════════════════════╝',
  ];
  const sub = '     Background Job Queue Engine • v1.0.0';

  console.log('');
  art.forEach((line, i) => {
    const color = gradientColors[Math.floor(i / art.length * gradientColors.length)];
    console.log(chalk.hex(color)(line));
  });
  console.log(gradient(sub));
  console.log('');
}

// ─────────────────────────────────────────────────────────────────
// CUSTOM BOX-DRAWING TABLE
// ─────────────────────────────────────────────────────────────────
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  tj: '┬', bj: '┴', lj: '├', rj: '┤', cross: '┼',
};

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

function visibleLength(str) {
  return stripAnsi(String(str)).length;
}

function padRight(str, len) {
  const diff = len - visibleLength(str);
  return str + ' '.repeat(Math.max(0, diff));
}

export function table(columns, rows, maxTotalWidth = 78) {
  if (rows.length === 0) return;

  // Initial column widths calculation
  const colWidths = columns.map((col) => {
    const headerLen = visibleLength(col.label);
    const maxDataLen = rows.reduce((max, row) => {
      return Math.max(max, visibleLength(String(row[col.key] ?? '')));
    }, 0);
    return Math.max(headerLen, maxDataLen);
  });

  // Total width of margins & borders: 1 leading/trailing border, (numCols - 1) separators, 2 spaces padding per column
  const baseOverhead = 2 + (columns.length - 1) + (columns.length * 2);
  let totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + baseOverhead;

  // If table exceeds maxTotalWidth, compress columns iteratively
  while (totalWidth > maxTotalWidth) {
    // Find columns we can shrink (width > 10)
    let widestIdx = -1;
    let maxW = 10;
    colWidths.forEach((w, idx) => {
      // Don't shrink ID too much (keep it at least 8 chars)
      const minLimit = columns[idx].key === 'id' ? 8 : 10;
      if (w > maxW && w > minLimit) {
        maxW = w;
        widestIdx = idx;
      }
    });

    if (widestIdx === -1) {
      break; // cannot shrink any columns further
    }

    colWidths[widestIdx]--;
    totalWidth--;
  }

  const borderColor = C.border;

  const buildLine = (left, mid, right, fill) => {
    return borderColor(left) + colWidths.map(w => borderColor(fill.repeat(w + 2))).join(borderColor(mid)) + borderColor(right);
  };

  console.log(buildLine(BOX.tl, BOX.tj, BOX.tr, BOX.h));

  // Header row
  const headerRow = borderColor(BOX.v) + columns.map((col, i) => {
    const lbl = col.label.slice(0, colWidths[i]);
    return ' ' + C.header(padRight(lbl, colWidths[i])) + ' ';
  }).join(borderColor(BOX.v)) + borderColor(BOX.v);
  console.log(headerRow);

  // Header separator
  console.log(buildLine(BOX.lj, BOX.cross, BOX.rj, BOX.h));

  // Data rows
  rows.forEach((row) => {
    const dataRow = borderColor(BOX.v) + columns.map((col, i) => {
      let val = String(row[col.key] ?? '');
      const plainVal = stripAnsi(val);
      const isColored = plainVal.length !== val.length;

      if (plainVal.length > colWidths[i]) {
        if (isColored) {
          val = plainVal.slice(0, colWidths[i] - 3) + '...';
        } else {
          val = val.slice(0, colWidths[i] - 3) + '...';
        }
      }
      return ' ' + padRight(val, colWidths[i]) + ' ';
    }).join(borderColor(BOX.v)) + borderColor(BOX.v);
    console.log(dataRow);
  });

  // Bottom border
  console.log(buildLine(BOX.bl, BOX.bj, BOX.br, BOX.h));
}

// ─────────────────────────────────────────────────────────────────
// STATE BADGES (colored pill-style labels)
// ─────────────────────────────────────────────────────────────────
export function stateBadge(state) {
  switch (state) {
    case 'pending':    return C.warning('● pending   ');
    case 'processing': return C.accent('◉ processing');
    case 'completed':  return C.success('✔ completed ');
    case 'failed':     return C.error('⚠ failed    ');
    case 'dead':       return C.dead('✖ dead      ');
    default:           return C.dim(state);
  }
}

// ─────────────────────────────────────────────────────────────────
// PROGRESS BAR (for stats visualization)
// ─────────────────────────────────────────────────────────────────
export function progressBar(current, total, width = 20) {
  if (total === 0) return C.dim('░'.repeat(width)) + C.dim(' 0/0');
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = C.success('█'.repeat(filled)) + C.dim('░'.repeat(empty));
  return bar + C.muted(` ${current}/${total}`);
}

// ─────────────────────────────────────────────────────────────────
// SECTION HEADERS
// ─────────────────────────────────────────────────────────────────
export function sectionHeader(title, icon = '◆') {
  const line = C.border('─'.repeat(50));
  console.log(`\n  ${C.brand(icon)} ${C.header(title)}`);
  console.log(`  ${line}`);
}

// ─────────────────────────────────────────────────────────────────
// STATUS CARDS
// ─────────────────────────────────────────────────────────────────
export function statusCard(stats, activeWorkers) {
  const total = stats.pending + stats.processing + stats.completed + stats.failed + stats.dead;

  const W = 55; // inner width
  const edge = (content) => `  ${C.border('│')} ${content}`;

  console.log('');
  console.log(`  ${C.border('╭' + '─'.repeat(W) + '╮')}`);
  console.log(edge(''));
  console.log(edge(`${C.header('  SYSTEM DASHBOARD')}`));
  console.log(edge(''));
  console.log(`  ${C.border('├' + '─'.repeat(W) + '┤')}`);
  console.log(edge(''));
  console.log(edge(`  ${C.white('Workers Active')}   ${activeWorkers > 0 ? C.success('⬤  ' + activeWorkers + ' running') : C.dim('⬤  0 idle')}`));
  console.log(edge(`  ${C.white('Total Jobs')}       ${C.accent(String(total))}`));
  console.log(edge(''));
  console.log(`  ${C.border('├' + '─'.repeat(W) + '┤')}`);
  console.log(edge(`${C.header('  JOB BREAKDOWN')}`));
  console.log(`  ${C.border('├' + '─'.repeat(W) + '┤')}`);
  console.log(edge(''));

  const row = (icon, colorFn, label, count) => {
    console.log(edge(`  ${colorFn(icon)} ${padRight(label, 14)} ${progressBar(count, total, 15)}`));
  };

  row('●', C.warning, 'Pending',      stats.pending);
  row('◉', C.accent,  'Processing',   stats.processing);
  row('✔', C.success, 'Completed',    stats.completed);
  row('⚠', C.error,   'Failed',       stats.failed);
  row('✖', C.dead,    'Dead (DLQ)',    stats.dead);

  console.log(edge(''));
  console.log(`  ${C.border('╰' + '─'.repeat(W) + '╯')}`);
  console.log('');
}

// ─────────────────────────────────────────────────────────────────
// MESSAGE HELPERS
// ─────────────────────────────────────────────────────────────────
export function success(msg) {
  console.log(`\n  ${C.success('✔')} ${C.white(msg)}`);
}

// ─────────────────────────────────────────────────────────────────
// ERROR MESSAGES
// ─────────────────────────────────────────────────────────────────
export function error(msg) {
  console.log(`\n  ${C.error('✖')} ${C.error(msg)}`);
}

// ─────────────────────────────────────────────────────────────────
// INFO MESSAGES
// ─────────────────────────────────────────────────────────────────
export function info(msg) {
  console.log(`\n  ${C.accent('ℹ')} ${C.muted(msg)}`);
}

// ─────────────────────────────────────────────────────────────────
// WARNING MESSAGES
// ─────────────────────────────────────────────────────────────────
export function warn(msg) {
  console.log(`\n  ${C.warning('⚠')} ${C.warning(msg)}`);
}

// ─────────────────────────────────────────────────────────────────
// KEY-VALUE DISPLAY
// ─────────────────────────────────────────────────────────────────
export function keyValue(pairs) {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  pairs.forEach(([key, value]) => {
    console.log(`  ${C.muted(key.padEnd(maxKeyLen))}  ${C.accent(value)}`);
  });
}

// ─────────────────────────────────────────────────────────────────
// TIMESTAMP
// ─────────────────────────────────────────────────────────────────
export function timestamp() {
  return C.dim(new Date().toLocaleTimeString());
}

// ─────────────────────────────────────────────────────────────────
// WORKER LOG PREFIXES
// ─────────────────────────────────────────────────────────────────
export function workerPrefix(pid) {
  return C.dim('  ') + C.brand('▌') + C.dim(` worker:${pid} `) + C.dim('│');
}

export function workerLog(pid, icon, color, msg) {
  console.log(`${workerPrefix(pid)} ${color(icon)} ${C.white(msg)} ${timestamp()}`);
}

export { C };
