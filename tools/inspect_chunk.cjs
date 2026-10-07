/* Print a chunk from the frozen library as a side view.
 *
 * Quality curation is easier to trust when you can look at the layout instead of
 * reading coordinates. Rows are world y (200 at the top, the ground line at
 * 600), columns are world x across the chunk's declared length.
 *
 *   '#' obstacle      '=' platform      '.' rice      '*' risk rice
 *   '_' ground        ' ' pit           '^' drift
 *
 * Usage: node tools/inspect_chunk.cjs [id|base | --list] [--band N]
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/chunks-data.js'), 'utf8'), sandbox, { filename: 'chunks-data.js' });
const data = sandbox.window.DSChunksData;
const S = data.strings;

const args = process.argv.slice(2);
const wantBand = args.includes('--band') ? Number(args[args.indexOf('--band') + 1]) : null;
const query = args.find(a => !a.startsWith('--') && a !== String(wantBand));

if (!query || query === '--list') {
  const byBase = {};
  for (const c of data.chunks) {
    const key = S[c.base];
    byBase[key] = byBase[key] || [];
    byBase[key].push(c.speed);
  }
  console.log('base'.padEnd(26), 'bands', 'count');
  for (const [base, speeds] of Object.entries(byBase)) {
    console.log(base.padEnd(26), [...new Set(speeds)].join('/'), String(speeds.length));
  }
  console.log(`\n${data.chunks.length} chunks, tolerance ${data.tolerance}`);
  process.exit(0);
}

const picked = data.chunks.filter(c =>
  (c.id === query || S[c.base] === query) && (wantBand === null || c.speed === wantBand));

if (!picked.length) { console.error('no chunk matches: ' + query); process.exit(1); }

const W = 108, TOP = 180, BOT = 620;
const rows = 22, stepY = (BOT - TOP) / rows;

function plot(chunk) {
  const len = chunk.len;
  const grid = Array.from({ length: rows }, () => Array(W).fill(' '));
  const col = x => Math.max(0, Math.min(W - 1, Math.round(x / len * (W - 1))));
  const row = y => Math.max(0, Math.min(rows - 1, Math.round((y - TOP) / stepY)));

  // ground with pits cut out
  for (let c = 0; c < W; c++) grid[row(600)][c] = '_';
  for (const [gx, gw] of chunk.g) for (let c = col(gx); c <= col(gx + gw); c++) grid[row(600)][c] = ' ';

  for (const [px, py, pw] of chunk.p) for (let c = col(px); c <= col(px + pw); c++) grid[row(py)][c] = '=';
  for (const [rx, ry, ri] of chunk.r) grid[row(ry)][col(rx)] = S[ri] === 'bigrice' ? 'O' : '.';
  for (const [rx, ry, n, dx] of chunk.k) for (let i = 0; i < n; i++) grid[row(ry)][col(rx + i * dx)] = '*';
  for (const [kindIdx, ox, opts] of chunk.o) {
    const kind = S[kindIdx];
    const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')).obstacle[kind];
    const top = 600 - (opts.float || 0) - art.h, bottom = 600 - (opts.float || 0);
    for (let r = row(top); r <= row(bottom); r++) for (let c = col(ox); c <= col(ox + art.w); c++) grid[r][c] = '#';
  }
  return grid.map(r => r.join('').replace(/\s+$/, '')).join('\n');
}

for (const chunk of picked) {
  const kinds = chunk.o.map(o => S[o[0]] + (o[2] && o[2].float ? '(float)' : '')).join(', ') || '-';
  console.log(`\n${chunk.id}  family=${S[chunk.family]}  band=${chunk.speed}  len=${chunk.len}  score=${chunk.score}`);
  console.log(`entities: ${chunk.o.length} obstacles (${kinds}), ${chunk.p.length} platforms, ${chunk.g.length} pits, ` +
    `${chunk.r.length} rice, ${chunk.k.reduce((a, k) => a + k[2], 0)} risk rice`);
  console.log('+' + '-'.repeat(W) + '+');
  console.log(plot(chunk).split('\n').map(l => '|' + l.padEnd(W) + '|').join('\n'));
  console.log('+' + '-'.repeat(W) + '+');
}
