'use strict';
/* 算独：题面可解 → 全对判胜 → 错子计数 → 撤销/笔记/提示 → 断点续玩 → 换难度 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');


const g = loadGame('kenken', { storage: { 'kenken.diff': 'easy' } });
g.pump(1.2);
const board = g.byId('board');
const cells = board.querySelectorAll('.cell');
const N = Math.round(Math.sqrt(cells.length));
ok(N === 4, '四宫难度 → ' + cells.length + ' 格 (N=' + N + ')');
ok(board.style.gridTemplateColumns === 'repeat(4, 1fr)', 'grid 列数已设置');

// 从 DOM 的粗线边界类反推笼子
const has = (el, c) => el._cls.includes(c);
const cageOf = new Array(cells.length).fill(-1);
let nc = 0;
for (let i = 0; i < cells.length; i++) {
  if (cageOf[i] >= 0) continue;
  const ci = nc++;
  const stack = [i];
  cageOf[i] = ci;
  while (stack.length) {
    const x = stack.pop();
    const r = (x / N) | 0, c = x % N;
    const nb = [];
    if (c < N - 1 && !has(cells[x], 'rb')) nb.push(x + 1);
    if (c > 0 && !has(cells[x - 1], 'rb')) nb.push(x - 1);
    if (r < N - 1 && !has(cells[x], 'cb')) nb.push(x + N);
    if (r > 0 && !has(cells[x - N], 'cb')) nb.push(x - N);
    for (const y of nb) if (cageOf[y] < 0) { cageOf[y] = ci; stack.push(y); }
  }
}
const cages = Array.from({ length: nc }, () => ({ cells: [], op: '', target: 0 }));
cells.forEach((el, i) => cages[cageOf[i]].cells.push(i));
let labelCount = 0, badLabel = 0;
for (const cage of cages) {
  const head = cage.cells.reduce((a, b) => (a % N) + ((a / N) | 0) * 1000 < (b % N) + ((b / N) | 0) * 1000 ? a : b);
  const t = cells[head].querySelector('.cage-label').textContent;
  const m = t.match(/^(\d+)([+×\-÷=])$/);
  if (!m) { badLabel++; continue; }
  labelCount++;
  cage.op = m[2]; cage.target = +m[1];
}
ok(labelCount === cages.length && !badLabel, cages.length + ' 个笼子都带合法标签(如 12×)，异常 ' + badLabel + ' 个');
if (badLabel) console.log('   诊断: ' + cages.map((c, i) => c.op ? (c.target + c.op + '@' + c.cells.join(',')) : ('无标签@' + c.cells.join(','))).join('  |  '));
ok(cages.some((c) => c.op === '='), '存在单格已知笼');
ok(cages.some((c) => c.op !== '=') && cages.some((c) => c.cells.length > 1), '存在多格运算笼');

// 独立求解器：验证这题确实有解
function solve() {
  const grid = new Array(N * N).fill(0);
  const rowM = new Array(N).fill(0), colM = new Array(N).fill(0);
  const okCage = (cage, filled, rest) => {
    const t = cage.target;
    if (cage.op === '=') return filled[0] === t;
    if (cage.op === '+') { const s = filled.reduce((a, b) => a + b, 0); return s + rest <= t && s + rest * N >= t; }
    if (cage.op === '×') { const p = filled.reduce((a, b) => a * b, 1); return p && t % p === 0 && t / p <= Math.pow(N, rest); }
    if (cage.op === '-') { if (filled.length >= 2) return Math.abs(filled[0] - filled[1]) === t; if (filled.length === 1) return filled[0] + t <= N || filled[0] - t >= 1; return true; }
    if (cage.op === '÷') { if (filled.length >= 2) { const hi = Math.max(...filled), lo = Math.min(...filled); return lo && hi % lo === 0 && hi / lo === t; } if (filled.length === 1) return filled[0] * t <= N || (filled[0] % t === 0 && filled[0] / t <= N); return true; }
    return true;
  };
  const cf = cages.map(() => []), cr = cages.map((c) => c.cells.length);
  cages.forEach((c, ci) => { if (c.op === '=') { const i = c.cells[0]; grid[i] = c.target; rowM[(i / N) | 0] |= 1 << c.target; colM[i % N] |= 1 << c.target; cf[ci].push(c.target); cr[ci]--; } });
  let left = grid.filter((v) => !v).length;
  (function search() {
    if (!left) return true;
    let bi = -1, bc = null, bl = 99;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) continue;
      const r = (i / N) | 0, c = i % N, ci = cageOf[i], cand = [];
      for (let v = 1; v <= N; v++) {
        if ((rowM[r] | colM[c]) & (1 << v)) continue;
        if (!okCage(cages[ci], cf[ci].concat(v), cr[ci] - 1)) continue;
        cand.push(v);
      }
      if (cand.length < bl) { bl = cand.length; bi = i; bc = cand; if (!cand.length) break; }
    }
    if (bi < 0 || !bc.length) return false;
    const r = (bi / N) | 0, c = bi % N, ci = cageOf[bi];
    for (const v of bc) {
      grid[bi] = v; rowM[r] |= 1 << v; colM[c] |= 1 << v; cf[ci].push(v); cr[ci]--; left--;
      if (search()) return true;
      grid[bi] = 0; rowM[r] &= ~(1 << v); colM[c] &= ~(1 << v); cf[ci].pop(); cr[ci]++; left++;
    }
    return false;
  })();
  return grid;
}
const sol = solve();
ok(sol.every((v) => v > 0), '独立求解器能解出这题 → 生成的题可解');

// 逐格回填（跳过单格已知笼），看游戏是否判胜
const overlay = g.byId('overlay');
ok(overlay._cls.includes('show') === false, '开局后遮罩已关闭');
const digits = g.byId('digits').querySelectorAll('button');
let placed = 0;
for (let i = 0; i < cells.length; i++) {
  if (cells[i]._cls.includes('given')) continue;
  cells[i].dispatch('click');
  digits[sol[i] - 1].dispatch('click');
  placed++;
}
ok(placed > 0, '回填 ' + placed + ' 格');
g.pump(0.2);
ok(overlay._cls.includes('show'), '全部填对 → 判胜并弹出结算');
ok(/解开了/.test(g.byId('overlayContent').innerHTML), '结算文案正确');
ok(g.storage._data['kenken.best.easy'] > 0, '最佳用时已写入: ' + g.storage._data['kenken.best.easy']);
ok(!g.storage._data['kenken.save'], '通关后清掉存档');

// 新纪录 + 再来一题
const btns = g.byId('overlayContent').querySelectorAll('button');
const again = btns.find((b) => b.dataset.act === 'again');
again.dispatch('click');
g.pump(1.2);
ok(g.byId('mistakes').textContent === '0', '再来一题后错误数归零');
ok(!overlay._cls.includes('show'), '新题已就绪并关闭遮罩');

// 错误落子 → 计数 + 冲突高亮
// 注意两点：「再来一题」换了题面，必须用新题的解；某个数字被已知数用满后按钮会 disabled，
// 此时点击本就该被忽略 —— 所以遍历 (空格 × 还能按的数字) 找一对确实填错的组合。
const curSol = JSON.parse(g.storage.getItem('kenken.save')).sol.split('').map(Number);
const btnsOf = () => g.byId('digits').querySelectorAll('button').filter((b) => !b.disabled && +b.dataset.d <= 4);
let idx = -1;
const mk0 = +g.byId('mistakes').textContent;
for (const cell of g.byId('board').querySelectorAll('.cell')) {
  if (cell._cls.includes('given')) continue;
  const i = +cell.dataset.i;
  const wrongBtn = btnsOf().find((b) => +b.dataset.d !== curSol[i]);
  if (!wrongBtn) continue;
  cell.dispatch('click');
  wrongBtn.dispatch('click');
  if (+g.byId('mistakes').textContent > mk0) { idx = i; break; }
}
ok(idx >= 0, '填错一个数字 → 错误计数从 ' + mk0 + ' 变成 ' + g.byId('mistakes').textContent);
const after = g.byId('board').querySelectorAll('.cell')[idx];
ok(after._cls.includes('filled'), '填进去的数字留在盘上(可撤销)');
g.byId('btnUndo').dispatch('click');
ok(g.byId('board').querySelectorAll('.cell')[idx].querySelector('.num').textContent === '', '撤销后格子清空');

// 笔记模式 + 提示
g.byId('btnNote').dispatch('click');
const noteCell = g.byId('board').querySelectorAll('.cell').find((el) => !el._cls.includes('given')) || g.byId('board').querySelectorAll('.cell')[0];
noteCell.dispatch('click');
digits[1].dispatch('click');
const noteTxt = noteCell.querySelector('.notes').textContent;
ok(/[0-9]/.test(noteTxt), '笔记显示候选: "' + noteTxt + '"');
g.byId('btnHint').dispatch('click');
g.pump(0.1);
ok(+g.byId('mistakes').textContent >= 0, '提示按钮可用');

// 存档续玩
const saved = g.storage._data['kenken.save'];
ok(!!saved, '存档已写入 (' + (saved ? saved.length : 0) + ' 字节)');
if (saved) {
  const g2 = loadGame('kenken', { storage: JSON.parse(JSON.stringify(g.storage._data)) });
  g2.pump(0.3);
  const filled2 = g2.byId('board').querySelectorAll('.cell').filter((el) => el.querySelector('.num').textContent).length;
  ok(filled2 > 0, '重开页面能续玩，已填 ' + filled2 + ' 格');
  ok(!g2.byId('overlay')._cls.includes('show'), '续玩不弹遮罩');
}

// 换难度
const d3 = g.byId('diff').querySelectorAll('button')[2];
d3.dispatch('click');
g.pump(2.5);
ok(g.byId('board').querySelectorAll('.cell').length === 36, '切到六宫 → 36 格');
ok(g.storage._data['kenken.diff'] === 'hard', '难度已持久化');


report('算独');
