const { loadGame } = require('../smoketest.js');
const { ok, fail, note, summary } = require('./_assert.js');

/* 算独生成器压测：四档难度各出 5 题，逐题从粗线边界反推笼子，
   再用独立求解器数解个数 —— 必须全是唯一解，且不能慢到卡住开局。 */
const DIFFS = { easy: 4, medium: 5, hard: 6, expert: 6 };
let bad = 0;
for (const [d, n] of Object.entries(DIFFS)) {
  const times = [], uniq = [];
  for (let round = 0; round < 5; round++) {
    // 每档只在第一题正常播报断言，后四题只在出错时说话，免得输出灌水
    const chk = (cond, msg) => {
      if (round === 0) ok(cond, msg);
      else if (!cond) fail(msg + '（第 ' + (round + 1) + ' 题）');
      return cond;
    };
    const t0 = Date.now();
    const g = loadGame('kenken', { storage: { 'kenken.diff': d } });
    g.pump(0.5);
    const ms = Date.now() - t0;
    const cells = g.byId('board').querySelectorAll('.cell');
    if (!chk(cells.length === n * n, d + ' 棋盘 ' + n + '×' + n + '（实际 ' + cells.length + ' 格）')) { bad++; continue; }
    times.push(ms);
    // 反推笼子
    const has = (el, c) => el._cls.includes(c);
    const cageOf = new Array(cells.length).fill(-1);
    let nc = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cageOf[i] >= 0) continue;
      const ci = nc++; const st = [i]; cageOf[i] = ci;
      while (st.length) {
        const x = st.pop(), r = (x / n) | 0, c = x % n, nb = [];
        if (c < n - 1 && !has(cells[x], 'rb')) nb.push(x + 1);
        if (c > 0 && !has(cells[x - 1], 'rb')) nb.push(x - 1);
        if (r < n - 1 && !has(cells[x], 'cb')) nb.push(x + n);
        if (r > 0 && !has(cells[x - n], 'cb')) nb.push(x - n);
        for (const y of nb) if (cageOf[y] < 0) { cageOf[y] = ci; st.push(y); }
      }
    }
    const cages = Array.from({ length: nc }, () => ({ cells: [], op: '', target: 0 }));
    cells.forEach((el, i) => cages[cageOf[i]].cells.push(i));
    let parseOK = true;
    for (const cage of cages) {
      const head = cage.cells[0];
      const m = cells[head].querySelector('.cage-label').textContent.match(/^(\d+)([+×\-÷=])$/);
      if (!m) { parseOK = false; break; }
      cage.op = m[2]; cage.target = +m[1];
    }
    if (!chk(parseOK, d + ' 每个笼子都能读出「目标数 + 运算」')) { bad++; continue; }
    // 数解个数
    const grid = new Array(n * n).fill(0), rowM = new Array(n).fill(0), colM = new Array(n).fill(0);
    const cf = cages.map(() => []), cr = cages.map((c) => c.cells.length);
    let left = 0;
    cages.forEach((c, ci) => { if (c.op === '=') { const i = c.cells[0]; grid[i] = c.target; rowM[(i / n) | 0] |= 1 << c.target; colM[i % n] |= 1 << c.target; cf[ci].push(c.target); cr[ci]--; } else left += c.cells.length; });
    const okCage = (cage, filled, rest) => {
      const t = cage.target;
      if (cage.op === '=') return filled[0] === t;
      if (cage.op === '+') { const s = filled.reduce((a, b) => a + b, 0); return s + rest <= t && s + rest * n >= t; }
      if (cage.op === '×') { const p = filled.reduce((a, b) => a * b, 1); return p && t % p === 0 && t / p <= Math.pow(n, rest); }
      if (cage.op === '-') { if (filled.length >= 2) return Math.abs(filled[0] - filled[1]) === t; if (filled.length === 1) return filled[0] + t <= n || filled[0] - t >= 1; return true; }
      if (cage.op === '÷') { if (filled.length >= 2) { const hi = Math.max(...filled), lo = Math.min(...filled); return lo && hi % lo === 0 && hi / lo === t; } if (filled.length === 1) return filled[0] * t <= n || (filled[0] % t === 0 && filled[0] / t <= n); return true; }
      return true;
    };
    let sols = 0, nodes = 0;
    (function search() {
      if (!left) { sols++; return sols >= 2; }
      if (nodes++ > 400000) return true;
      let bi = -1, bc = null, bl = 99;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i]) continue;
        const r = (i / n) | 0, c = i % n, ci = cageOf[i], cand = [];
        for (let v = 1; v <= n; v++) {
          if ((rowM[r] | colM[c]) & (1 << v)) continue;
          if (!okCage(cages[ci], cf[ci].concat(v), cr[ci] - 1)) continue;
          cand.push(v);
        }
        if (cand.length < bl) { bl = cand.length; bi = i; bc = cand; if (!cand.length) break; }
      }
      if (bi < 0 || !bc.length) return false;
      const r = (bi / n) | 0, c = bi % n, ci = cageOf[bi];
      for (const v of bc) {
        grid[bi] = v; rowM[r] |= 1 << v; colM[c] |= 1 << v; cf[ci].push(v); cr[ci]--; left--;
        if (search()) return true;
        grid[bi] = 0; rowM[r] &= ~(1 << v); colM[c] &= ~(1 << v); cf[ci].pop(); cr[ci]++; left++;
      }
      return false;
    })();
    uniq.push(sols);
    const sizes = cages.map((c) => c.cells.length);
    const ops = {};
    cages.forEach((c) => ops[c.op] = (ops[c.op] || 0) + 1);
    if (round === 0) note(d + ' 首题：笼数 ' + nc + ' · 最大笼 ' + Math.max(...sizes) + ' · 运算分布 ' + JSON.stringify(ops) + ' · ' + ms + 'ms');
    if (round === 0 && (d === 'easy' || d === 'medium')) ok(ops['='] >= 1, d + ' 入门档必有单格已知笼');
  }
  const slow = Math.max(...times);
  if (!ok(uniq.every((u) => u === 1), d + ' 5 题解个数 = ' + uniq.join(',') + '，全部唯一解')) bad++;
  if (!ok(slow <= 4000, d + ' 生成耗时上限 ' + slow + 'ms ≤ 4000ms')) bad++;
}
summary('算独生成器', bad);
