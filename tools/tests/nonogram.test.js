'use strict';
/* 数织回归：
   A. 出题器压测 —— 每档随机出题，从存档答案独立反推，必须「唯一解 + 纯逻辑可推」
   B. 交互流程 —— 用一道固定题(手工验证过唯一解的心形)跑涂错/撤销/打叉/提示/自动打叉/通关
   C. 断点续玩与换难度 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

/* ==================== 独立求解器（与游戏内实现无共享代码） ==================== */
function cluesOf(line) {
  const out = []; let run = 0;
  for (const v of line) { if (v) run++; else if (run) { out.push(run); run = 0; } }
  if (run) out.push(run);
  return out.length ? out : [0];
}
function cluesOfSolution(sol, n) {
  const rows = [], cols = [];
  for (let r = 0; r < n; r++) rows.push(cluesOf(sol.slice(r * n, r * n + n)));
  for (let c = 0; c < n; c++) cols.push(cluesOf(Array.from({ length: n }, (_, r) => sol[r * n + c])));
  return { rows, cols };
}
// 单行约束反复传播：null = 矛盾；结果里还有 0 = 光靠逻辑推不满(意味着要多解或需要猜)
function logicSolve(rows, cols, n) {
  const enumLine = (len, clues, assign) => {
    const occ = new Uint8Array(len);
    const out = { tot: 0, cnt: new Int32Array(len) };
    const suf = new Int32Array(clues.length + 1);
    for (let i = clues.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + clues[i] + (i === clues.length - 1 ? 0 : 1);
    (function rec(pos, ci) {
      if (ci === clues.length) {
        for (let i = 0; i < len; i++) {
          if (assign[i] === 1 && !occ[i]) return;
          if (assign[i] === 2 && occ[i]) return;
        }
        out.tot++;
        for (let i = 0; i < len; i++) if (occ[i]) out.cnt[i]++;
        return;
      }
      const w = clues[ci], last = len - suf[ci];
      for (let s = pos; s <= last; s++) {
        let bad = false;
        for (let k = s; k < s + w; k++) if (assign[k] === 2) { bad = true; break; }
        if (bad) continue;
        for (let k = s; k < s + w; k++) occ[k] = 1;
        rec(s + w + 1, ci + 1);
        for (let k = s; k < s + w; k++) occ[k] = 0;
      }
    })(0, 0);
    return out;
  };
  const a = new Uint8Array(n * n);
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        const line = new Uint8Array(n);
        for (let j = 0; j < n; j++) line[j] = k ? a[j * n + i] : a[i * n + j];
        const out = enumLine(n, (k ? cols : rows)[i], line);
        if (!out.tot) return null;
        for (let j = 0; j < n; j++) {
          const forced = out.cnt[j] === out.tot ? 1 : out.cnt[j] === 0 ? 2 : 0;
          const idx = k ? j * n + i : i * n + j;
          if (line[j] === 0 && forced) { a[idx] = forced; changed = true; }
        }
      }
    }
  }
  return a;
}
const savedSol = (g) => Array.from(JSON.parse(g.storage.getItem('nonogram.save')).sol).map(Number);

/* ==================== 固定题：5×5 心形(已验证唯一解) ==================== */
const HEART = '0110111111111110111000100';
const HEART_SAVE = JSON.stringify({ diff: 'easy', seconds: 0, mistakes: 0, hintsLeft: 3, sol: HEART, cell: '0'.repeat(25) });
const N = 5;
const answer = Array.from(HEART).map(Number);

/* ==================== DOM 小工具 ==================== */
const cellEls = (g) => g.byId('ngBoard').querySelectorAll('.c');
const stateOf = (el) => (el._cls.includes('f') ? 1 : el._cls.includes('x') ? 2 : 0);
// DOM 桩不支持 .c.f 复合选择器，自己按 class 筛
const filledEls = (g) => cellEls(g).filter((el) => el._cls.includes('f'));
const clueLines = (el) => Array.from(el.children).map((c) => c.children.map((i) => Number(i.textContent)));

function paint(g, el) {
  el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 });
  g.fire(g.doc.body, 'pointerup', { pointerType: 'mouse' });
  g.pump(0.1);
}
// 点一下是「空 → 涂 → 叉 → 空」循环，要涂满就点到为止
function fill(g, el) { for (let k = 0; k < 3 && stateOf(el) !== 1; k++) paint(g, el); }
function markX(g, el) {
  el.dispatch('pointerdown', { pointerType: 'mouse', button: 2, clientX: 5, clientY: 5 });
  g.fire(g.doc.body, 'pointerup', { pointerType: 'mouse' });
  g.pump(0.1);
}
function dismiss(g) {
  const btns = g.byId('overlayContent').querySelectorAll('button');
  const go = btns.find((b) => b.dataset.act === 'resume') || btns.find((b) => b.dataset.act === 'start');
  if (go) go.dispatch('click');
  g.pump(0.2);
  return !!go;
}
function boot(diff, storage) {
  const g = loadGame('nonogram', { storage: Object.assign({ 'nonogram.diff': diff }, storage || {}) });
  g.pump(0.4);
  dismiss(g);
  return g;
}

/* ==================== A. 出题器质量 ==================== */
const SIZES = { easy: 5, medium: 10, hard: 15, expert: 20 };
for (const [d, n] of Object.entries(SIZES)) {
  let bad = 0;
  let thin = 0;
  for (let round = 0; round < 6; round++) {
    const g = boot(d);
    const sol = savedSol(g);
    if (sol.length !== n * n) { bad++; continue; }
    const { rows, cols } = cluesOfSolution(sol, n);
    const derived = logicSolve(rows, cols, n);
    if (!derived || Array.from(derived).some((v) => v === 0)) bad++;
    const need = sol.filter(Boolean).length;
    if (need < n * n * 0.3 || need > n * n * 0.66) thin++;
    if (round === 0) {
      chk(cellEls(g).length === n * n, d + ' 盘面 ' + n + '×' + n + '（实际 ' + cellEls(g).length + ' 格）');
      chk(JSON.stringify(clueLines(g.byId('ngSide'))) === JSON.stringify(rows),
        d + ' 行首线索与答案对得上');
      chk(JSON.stringify(clueLines(g.byId('ngTop'))) === JSON.stringify(cols),
        d + ' 列首线索与答案对得上');
    }
  }
  chk(bad === 0, d + ' 6 道题全部唯一解、纯逻辑可推（异常 ' + bad + '）');
  chk(thin === 0, d + ' 涂格比例都在 30%~66% 之间，不糊成一片（异常 ' + thin + '）');
}

/* ==================== B. 固定题交互 ==================== */
/* 心形盘面(索引 = r*5+c)：
   . # # . #      行线索 [3] [5] [5] [3] [1]
   # # # # #     列线索 [2] [4] [5] [3] [3]
   # # # # #     共 17 个要涂的格子，没有任何一行/列是 [0]
   . # # # .
   . . # . . */
const g = boot('easy', { 'nonogram.save': HEART_SAVE });
const cells = cellEls(g);
chk(cells.length === 25, '续上固定题，盘面 25 格');
chk(filledEls(g).length === 0, '开局没有涂黑的格子');
chk(cells.every((el) => stateOf(el) === 0), '开局也没有自动打的叉（这题没有 [0] 行/列）');
chk(g.byId('made').textContent === '0/17', '完成度显示 ' + g.byId('made').textContent);
chk(g.byId('mistakes').textContent === '0', '错误数从 0 开始');

/* --- 涂错立刻反馈 --- */
paint(g, cells[0]);                                   // (0,0) 是空的，不该涂
chk(g.byId('mistakes').textContent === '1', '涂错计 1 次错误（实际 ' + g.byId('mistakes').textContent + '）');
chk(stateOf(cells[0]) === 2, '涂错的格子自动变成叉号');
chk(filledEls(g).length === 0, '错格不会留下涂黑状态');
chk(g.byId('made').textContent === '0/17', '涂错不计入完成度');
chk(JSON.parse(g.storage.getItem('nonogram.save')).mistakes === 1, '错误数写进断点存档');

/* --- 撤销 / 重做 --- */
g.fire(g.byId('btnUndo'), 'click');
chk(stateOf(cells[0]) === 0, '撤销后回到空格');
g.fire(g.byId('btnRedo'), 'click');
chk(stateOf(cells[0]) === 2, '重做把叉号放回来');
chk(g.byId('mistakes').textContent === '1', '重做不会绕过「错格回退」再计一次错');

/* --- 右键打叉 / 手动擦掉 --- */
markX(g, cells[16]);
chk(stateOf(cells[16]) === 2, '右键（备用打叉手势）打叉');
chk(g.byId('mistakes').textContent === '1', '打叉不算错误');
paint(g, cells[16]);
chk(stateOf(cells[16]) === 0, '再点一下把叉擦回空格');

/* --- 整行完成 → 自动打叉 + 线索变绿 --- */
fill(g, cells[1]);
fill(g, cells[2]);
chk(stateOf(cells[1]) === 1 && stateOf(cells[2]) === 1, '涂对第 1 行的两格');
chk(!g.byId('ngSide').children[0]._cls.includes('done'), '第 1 行线索 [3] 还差 1 格 → 不变绿');
chk(stateOf(cells[3]) === 0, '没满足的行不会被误自动打叉');
fill(g, cells[4]);
chk(g.byId('ngSide').children[0]._cls.includes('done'), '第 1 行涂够 [3] → 线索变绿');
chk(stateOf(cells[3]) === 2 && cells[3]._cls.includes('auto'), '该行剩下的空格自动打叉并带 auto 标记');
chk(stateOf(cells[0]) === 2 && !cells[0]._cls.includes('auto'), '玩家手动的叉不被 auto 覆盖（保留手工痕迹）');
chk(g.byId('made').textContent === '3/17', '完成度 ' + g.byId('made').textContent);
chk(g.byId('ngTop').children[2]._cls.includes('done') === false, '列 3 只涂了 1/5 → 列线索还没绿');

/* --- 清叉：只动叉，不动涂黑 --- */
markX(g, cells[21]);
g.fire(g.byId('btnMark'), 'click');
chk(stateOf(cells[21]) === 0, '「清叉」擦掉手动的叉');
chk(filledEls(g).length === 3, '「清叉」没碰已涂对的格子');

/* --- 提示 --- */
const hintBefore = Number(g.byId('hintN').textContent);
const filledBefore = filledEls(g).length;
g.fire(g.byId('btnHint'), 'click');
chk(Number(g.byId('hintN').textContent) === hintBefore - 1, '提示次数 3 → ' + g.byId('hintN').textContent);
const filledAfter = filledEls(g);
chk(filledAfter.length === filledBefore + 1, '提示正好涂对一格（' + filledBefore + ' → ' + filledAfter.length + '）');
chk(filledAfter.every((el) => answer[Number(el.dataset.i)] === 1), '盘面上每个涂黑格都是正解');
for (let k = 0; k < 4; k++) g.fire(g.byId('btnHint'), 'click');
chk(g.byId('btnHint').disabled === true, '提示用完置灰');

/* --- 一路涂到通关 --- */
for (let i = 0; i < 25; i++) if (answer[i] && stateOf(cells[i]) !== 1) fill(g, cells[i]);
g.pump(0.3);
chk(g.byId('made').textContent === '17/17', '完成度 ' + g.byId('made').textContent);
chk(g.byId('overlay')._cls.includes('show'), '涂满全盘弹出结算遮罩');
chk(/图案完成|新纪录/.test(g.byId('overlayContent').innerHTML), '遮罩标题正常');
chk(g.byId('overlayContent').innerHTML.indexOf('再来一题') > 0, '遮罩有「再来一题」');
chk(Number(g.storage.getItem('nonogram.best.easy')) >= 0, '写入最佳用时 best.easy=' + g.storage.getItem('nonogram.best.easy'));
chk(g.storage.getItem('nonogram.save') === null, '通关后清掉断点存档');
chk(g.byId('best').textContent.indexOf(':') > 0, '最佳用时回填统计条：' + g.byId('best').textContent);
chk(g.byId('ngTop').children.every((el) => el._cls.includes('done')), '通关时 5 列线索全部变绿');
chk(g.byId('ngSide').children.every((el) => el._cls.includes('done')), '通关时 5 行线索全部变绿');
paint(g, cells[6]);
chk(stateOf(cells[6]) === 1 && g.byId('mistakes').textContent === '1', '通关后再点盘面不会再改局面、不再计错');

/* --- 通关后开新题 --- */
const again = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again');
again.dispatch('click');
g.pump(0.4);
chk(!g.byId('overlay')._cls.includes('show'), '点「再来一题」遮罩收起');
chk(cellEls(g).length === 25 && filledEls(g).length === 0, '新题盘面清空');
chk(g.byId('mistakes').textContent === '0' && g.byId('hintN').textContent === '3', '错误与提示次数重置');
chk(g.byId('best').textContent.indexOf(':') > 0, '上一题的最佳用时留在统计条：' + g.byId('best').textContent);

/* ==================== C. 断点续玩 ==================== */
const g4 = boot('easy', { 'nonogram.save': HEART_SAVE });
fill(g4, cellEls(g4)[1]);
fill(g4, cellEls(g4)[2]);
fill(g4, cellEls(g4)[5]);
const mid = g4.storage.getItem('nonogram.save');
const mids = JSON.parse(mid);
chk(mids.cell.split('').filter((v) => v === '1').length === 3, '中途存档记录了 3 个涂黑格');
chk(mids.sol === HEART, '存档带答案，刷新后还是同一题');
const g5 = boot('easy', { 'nonogram.save': mid });
chk(filledEls(g5).length === 3, '重开页面自动续上 3 个涂黑格（实际 ' + filledEls(g5).length + '）');
chk(g5.byId('made').textContent === '3/17', '续玩完成度 ' + g5.byId('made').textContent);
chk(!g5.byId('overlay')._cls.includes('show'), '续玩点开后遮罩收起');
const g6 = loadGame('nonogram', { storage: { 'nonogram.diff': 'easy', 'nonogram.save': mid } });
g6.pump(0.4);
chk(/继续上一题/.test(g6.byId('overlayContent').innerHTML), '有存档时首屏是「继续上一题」');
const pillText = g6.byId('overlayContent').innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
chk(/已经涂了 3\/17 格/.test(pillText), '首屏写清进度：' + pillText.slice(0, 46));
g6.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start').dispatch('click');
g6.pump(0.4);
chk(filledEls(g6).length === 0, '选「换一题」才重开新题');

/* ==================== D. 换难度 ==================== */
const btn10 = g.byId('diff').querySelectorAll('[data-diff]').find((b) => b.dataset.diff === 'medium');
btn10.dispatch('click');
g.pump(0.5);
chk(cellEls(g).length === 100, '切到 10×10 后盘面重建：' + cellEls(g).length + ' 格');
chk(g.storage.getItem('nonogram.diff') === 'medium', '记住难度选择');
const s10 = savedSol(g);
const c10 = cluesOfSolution(s10, 10);
const d10 = logicSolve(c10.rows, c10.cols, 10);
chk(!!d10 && Array.from(d10).every((v) => v !== 0), '换难度后的新题同样唯一解');
chk(g.byId('best').textContent === '--', '换难度后最佳用时切到该档（10×10 还没纪录）');
g.byId('diff').querySelectorAll('[data-diff]').find((b) => b.dataset.diff === 'easy').dispatch('click');
g.pump(0.4);
chk(g.byId('best').textContent.indexOf(':') > 0, '换回 5×5 又看到刚才的纪录 ' + g.byId('best').textContent);

summary('数织', fails);
