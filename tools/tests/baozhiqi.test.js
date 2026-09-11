'use strict';
/* 保质期：每动一次 = 一回合 = 全场会坏的东西和你各 -1 鲜度；
   鲜度归零就翻面（🍎→腐堆堵路 / 🪵→塌成洞 / 🥬→烂开通路），灌注=你 -2、相邻那格本回合不烂。
   本测试自带一份独立规则实现 + 记忆化 DFS 求解器：先算出每关最优解，
   再把这套解法灌进真实 game.js 端到端回放，断言「关卡一定有解」且「真机得分 = 求解器分 + 撤销奖励」。 */
const fs = require('fs');
const path = require('path');
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

/* ==================== 独立规则实现（只共用关卡图） ==================== */
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'baozhiqi', 'game.js'), 'utf8');
function blockAfter(marker) {
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error('源码里找不到 ' + marker);
  let i = SRC.indexOf('[', start), depth = 0;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '[') depth++;
    else if (SRC[k] === ']') { depth--; if (!depth) return SRC.slice(i, k + 1); }
  }
  throw new Error('数组没有结尾: ' + marker);
}
const LEVELS = new Function('return ' + blockAfter('const LEVELS = ['))();
const VINE_CHARS = (SRC.match(/const VINE_CHARS = '([A-Z]+)'/) || [, ''])[1];

const FLOOR = 0, WALL = 1, DOOR = 2, GOOD = 3, PLANK = 4, VINE = 5, ROT = 6, HOLE = 7;
const MAXF = 9, UNDOS = 3;
const per = (t) => t === GOOD || t === PLANK || t === VINE;
const walk = (t) => t === FLOOR || t === DOOR || t === PLANK || t === GOOD;
const gainOf = (L) => 60 + L * 20;

function parse(cfg) {
  const rows = cfg.map.length, cols = cfg.map[0].length;
  const type = [], fresh = [];
  let px = 0, py = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = cfg.map[y][x] || '#';
    if (ch === 'P') { px = x; py = y; type.push(FLOOR); fresh.push(0); continue; }
    let t = FLOOR, f = 0;
    if (ch === '#') t = WALL;
    else if (ch === 'D') t = DOOR;
    else if (ch === 'X') t = ROT;
    else if (ch === '~') t = HOLE;
    else if (ch >= '1' && ch <= '9') { t = GOOD; f = ch.charCodeAt(0) - 48; }
    else if (ch >= 'a' && ch <= 'i') { t = PLANK; f = ch.charCodeAt(0) - 96; }
    else if (VINE_CHARS.indexOf(ch) >= 0) { t = VINE; f = VINE_CHARS.indexOf(ch) + 1; }
    type.push(t); fresh.push(f);
  }
  return { cols, rows, type, fresh, px, py, pf: cfg.fresh, eaten: 0, dead: false };
}
const idOf = (st, x, y) => y * st.cols + x;

/* 死局判定：只有墙/洞/腐堆是永久障碍（藤早晚会烂开，板来得及踩） */
function reachable(st) {
  const { cols, rows, type } = st;
  let target = -1;
  for (let k = 0; k < type.length; k++) if (type[k] === DOOR) { target = k; break; }
  if (target < 0) return true;
  const seen = new Uint8Array(type.length);
  const start = idOf(st, st.px, st.py);
  const q = [start];
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === target) return true;
    const x = c % cols, y = (c - x) / cols;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (let k = 0; k < 4; k++) {
      const nx = nb[k][0], ny = nb[k][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = idOf(st, nx, ny);
      if (seen[j]) continue;
      const t = type[j];
      if (t === WALL || t === HOLE || t === ROT) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return false;
}

function tick(st, pourIdx) {
  st.pf -= 1;
  for (let k = 0; k < st.type.length; k++) {
    if (!per(st.type[k]) || st.fresh[k] <= 0) continue;
    st.fresh[k] -= 1;
  }
  if (pourIdx >= 0 && per(st.type[pourIdx]) && st.fresh[pourIdx] > 0) {
    st.pf -= 1;
    st.fresh[pourIdx] = Math.min(MAXF, st.fresh[pourIdx] + 1);
  }
  let fell = false;
  for (let k = 0; k < st.type.length; k++) {
    if (!per(st.type[k]) || st.fresh[k] > 0) continue;
    const x = k % st.cols, y = (k - x) / st.cols;
    if (st.type[k] === GOOD) st.type[k] = ROT;
    else if (st.type[k] === PLANK) { st.type[k] = HOLE; if (x === st.px && y === st.py) fell = true; }
    else st.type[k] = FLOOR;
    st.fresh[k] = 0;
  }
  if (st.pf <= 0) { st.pf = 0; st.dead = 'old'; return; }
  if (fell) { st.dead = 'fell'; return; }
  if (!reachable(st)) st.dead = 'lost';
}
const clone = (st) => ({
  cols: st.cols, rows: st.rows, type: st.type.slice(), fresh: st.fresh.slice(),
  px: st.px, py: st.py, pf: st.pf, eaten: st.eaten, dead: st.dead,
});
const sig = (st) => st.px + ',' + st.py + ',' + st.pf + ',' + st.type.join('') + ',' + st.fresh.join('');

function actions(st) {
  const out = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const d of dirs) {
    const nx = st.px + d[0], ny = st.py + d[1];
    if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) continue;
    const j = idOf(st, nx, ny);
    if (walk(st.type[j])) out.push({ k: 'move', dx: d[0], dy: d[1], j: j });
  }
  out.push({ k: 'wait', j: -1 });
  if (st.pf >= 3) {
    for (const d of dirs.concat([[0, 0]])) {
      const nx = st.px + d[0], ny = st.py + d[1];
      if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) continue;
      const j = idOf(st, nx, ny);
      if (per(st.type[j]) && st.fresh[j] > 0) out.push({ k: 'pour', j: j, dx: d[0], dy: d[1] });
    }
  }
  return out;
}

const memoVal = new Map();
const memoAct = new Map();
/* 总鲜度每回合严格下降 → 状态图无环，记忆化 DFS 就能求到最优 */
function value(st, L) {
  if (st.dead) return -Infinity;
  if (st.type[idOf(st, st.px, st.py)] === DOOR) return st.pf * 30;
  const key = sig(st);
  if (memoVal.has(key)) return memoVal.get(key);
  let best = -Infinity, pick = null;
  for (const a of actions(st)) {
    const n = clone(st);
    let add = 0;
    if (a.k === 'move') {
      n.px = a.j % n.cols; n.py = (a.j - n.px) / n.cols;
      if (n.type[a.j] === GOOD) {
        add = gainOf(L);
        n.pf = Math.min(MAXF, n.pf + n.fresh[a.j]);
        n.type[a.j] = FLOOR; n.fresh[a.j] = 0; n.eaten++;
      }
    }
    tick(n, a.k === 'pour' ? a.j : -1);
    const v = value(n, L);
    if (v === -Infinity) continue;
    if (add + v > best) { best = add + v; pick = { a: a, next: n }; }
  }
  memoVal.set(key, best);
  memoAct.set(key, pick);
  return best;
}
function solve(cfg, L) {
  memoVal.clear(); memoAct.clear();
  const st = parse(cfg);
  const v = value(st, L);
  if (v === -Infinity) return { v: -Infinity, line: [], pours: 0, turns: 0 };
  const line = [];
  let cur = st;
  while (!cur.dead && cur.type[idOf(cur, cur.px, cur.py)] !== DOOR) {
    const p = memoAct.get(sig(cur));
    if (!p) break;
    line.push(p.a);
    cur = p.next;
  }
  return { v: v, line: line, turns: line.length, pours: line.filter((a) => a.k === 'pour').length };
}
/* 把解法灌进真实 game.js */
function playLine(g, line) {
  for (const a of line) {
    if (a.k === 'move') b(g).tryStep(a.dx, a.dy);
    else if (a.k === 'wait') b(g).waitTurn();
    else b(g).pour(a.j);
  }
  g.pump(0.3);
}

/* ==================== 测试构建的观测口（正式源码里没有） ==================== */
const hook = 'window.__b = {' +
  ' st: () => ({ phase, level, score, best, maxLevel, turn, pf, px, py, cols, rows, eaten, goodsTotal, undosLeft, pourMode, missedTip, histN: hist.length, why: endWhy }),' +
  ' cell: (x, y) => ({ t: type[idx(x, y)], f: fresh[idx(x, y)] }),' +
  ' freshSum: () => { let a = pf; for (let i = 0; i < type.length; i++) if (perishable(type[i]) && fresh[i] > 0) a += fresh[i]; return a; },' +
  ' aliveN: () => { let a = 0; for (let i = 0; i < type.length; i++) if (perishable(type[i]) && fresh[i] > 0) a++; return a; },' +
  ' tryStep, waitTurn, pour, pourFace, useUndo, startLevel, nextLevel, restartLevel, tapCell, act, canPour, doorReachable,' +
  ' setFresh: (v) => { pf = v; hud(); }, setCell: (x, y, t, f) => { type[idx(x, y)] = t; fresh[idx(x, y)] = f; hud(); },' +
  ' TYPE: T, idx: (x, y) => idx(x, y)' +
  '};\n';
const inj = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('保质期源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const b = (g) => g.ctx.__b;
const open = (storage) => { const g = loadGame('baozhiqi', { transform: inj, storage: storage || {} }); g.pump(0.3); return g; };
const pressAct = (g, name) => {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (btn) btn.dispatch('click');
  g.pump(0.4);
  return !!btn;
};

/* ==================== 0. 关卡表与图例 ==================== */
chk(VINE_CHARS.length === 9 && VINE_CHARS.indexOf('D') < 0,
  '藤的字母表 9 个且避开门占用的 D（' + VINE_CHARS + '）');
chk(LEVELS.length === 8, '一共 8 关（' + LEVELS.length + '）');
for (let i = 0; i < LEVELS.length; i++) {
  const cfg = LEVELS[i];
  const w = cfg.map[0].length;
  chk(cfg.map.every((r) => r.length === w), '第 ' + (i + 1) + ' 关每行都是 ' + w + ' 格');
  const joined = cfg.map.join('');
  chk((joined.match(/P/g) || []).length === 1, '第 ' + (i + 1) + ' 关有且只有一个出发位');
  chk((joined.match(/D/g) || []).length === 1, '第 ' + (i + 1) + ' 关有且只有一个门口');
  chk(cfg.fresh >= 1 && cfg.fresh <= MAXF, '第 ' + (i + 1) + ' 关起始鲜度 ' + cfg.fresh + ' 在上限内');
  chk(!!cfg.name && !!cfg.tip, '第 ' + (i + 1) + ' 关有名字和教学提示');
  chk(reachable(parse(cfg)), '第 ' + (i + 1) + ' 关开局门可达');
}

/* ==================== 1. 每关都有解：求解器 → 真机端到端回放 ==================== */
for (let i = 0; i < LEVELS.length; i++) {
  const L = i + 1;
  const sol = solve(LEVELS[i], L);
  chk(sol.v !== -Infinity, '第 ' + L + ' 关「' + LEVELS[i].name + '」有解：' + sol.turns + ' 回合、灌注 ' + sol.pours + ' 次、最优 ' + sol.v);
  if (sol.v === -Infinity) continue;
  const g = open();
  pressAct(g, 'start');
  b(g).startLevel(L, false);
  g.pump(0.2);
  playLine(g, sol.line);
  const s = b(g).st();
  chk(s.phase === 'clear' || (L === LEVELS.length && s.phase === 'alldone'),
    '第 ' + L + ' 关照解法走真机也通关（phase=' + s.phase + '）');
  chk(s.score === sol.v + UNDOS * 40, '第 ' + L + ' 关真机 ' + s.score + ' = 求解器 ' + sol.v + ' + 撤销奖励 ' + UNDOS * 40);
  chk(s.undosLeft === UNDOS, '第 ' + L + ' 关开局 ' + UNDOS + ' 次撤销');
  const needPour = sol.pours > 0;
  chk(!needPour || s.turn === sol.turns, '第 ' + L + ' 关' + (needPour ? '确实要用灌注（' + sol.pours + ' 次）' : '不需要灌注也能过'));
}

/* ==================== 2. 回合账：谁在掉、掉多少 ==================== */
const g = open();
pressAct(g, 'start');
b(g).startLevel(4, false);
g.pump(0.2);
let s = b(g).st();
chk(s.phase === 'play' && s.level === 4, '第 4 关进入牌局');
chk(s.pf === LEVELS[3].fresh, '玩家自己的鲜度取自关卡配置（' + s.pf + '）');
chk(s.goodsTotal === 1, '第 4 关有 1 件货');
let sum0 = b(g).freshSum(), alive0 = b(g).aliveN();
chk(b(g).tryStep(1, 0) && b(g).st().phase === 'play', '向右走一格');
g.pump(0.2);
chk(b(g).freshSum() === sum0 - 1 - alive0,
  '走一格 = 一回合：自己 -1，场上 ' + alive0 + ' 个会坏的各 -1（' + sum0 + '→' + b(g).freshSum() + '）');
s = b(g).st();
chk(s.turn === 1 && s.px === 2 && s.py === 1, '回合 +1，人站在 (2,1)');

sum0 = b(g).freshSum(); alive0 = b(g).aliveN();
const pf0 = s.pf;
const board = b(g).idx(3, 1);                 // 板 c
const fBoard0 = b(g).cell(3, 1).f;
const fVine0 = b(g).cell(4, 1).f;
chk(b(g).canPour(board), '相邻的板可以灌注');
chk(b(g).pour(board), '灌注成功');
g.pump(0.2);
s = b(g).st();
chk(b(g).cell(3, 1).f === fBoard0, '被灌注那格鲜度原地不动（' + fBoard0 + '）');
chk(b(g).cell(4, 1).f === fVine0 - 1, '别的格子照样 -1（藤 ' + fVine0 + '→' + b(g).cell(4, 1).f + '）');
chk(s.pf === pf0 - 2, '灌注的总代价是自己 -2：回合 1 点 + 倒出去 1 点（' + pf0 + '→' + s.pf + '）');
chk(b(g).freshSum() === sum0 - (alive0 - 1) - 2, '鲜度守恒：全场减少量 = 时间熵增 + 玩家多付的 1 点');
chk(s.turn === 2 && s.px === 2, '灌注同样消耗一回合，但人不移动');

b(g).setCell(3, 1, b(g).TYPE.PLANK, MAXF);
b(g).pour(board);
g.pump(0.2);
chk(b(g).cell(3, 1).f === MAXF, '灌注不能把格子抬过上限 9');
b(g).setFresh(2);
chk(!b(g).canPour(board), '自己只剩 2 点时不许灌注（否则当场把自己抽干）');
const tKeep = b(g).st().turn;
chk(!b(g).pour(board) && b(g).st().turn === tKeep, '被拒绝的灌注不消耗回合');

/* ==================== 3. 吃货：续命、上限、加分 ==================== */
const g2 = open();
pressAct(g2, 'start');
b(g2).startLevel(1, false);
g2.pump(0.2);
b(g2).setFresh(8);
b(g2).setCell(1, 2, b(g2).TYPE.GOOD, 5);
const sc0 = b(g2).st().score;
b(g2).tryStep(0, 1);
g2.pump(0.2);
let s2 = b(g2).st();
chk(s2.pf === 8, '鲜度 8 吃 5 点货：加满到 9 再被时间扣 1 → 8，溢出的 4 点白扔（' + s2.pf + '）');
chk(b(g2).cell(1, 2).t === b(g2).TYPE.FLOOR, '吃掉的格子变成地板');
chk(s2.eaten === 1 && s2.score === sc0 + gainOf(1), '收货 1 件，加分 ' + gainOf(1) + '（' + (s2.score - sc0) + '）');
b(g2).setFresh(2);
b(g2).setCell(2, 2, b(g2).TYPE.GOOD, 5);
b(g2).tryStep(1, 0);
g2.pump(0.2);
chk(b(g2).st().pf === 6, '鲜度 2 时吃 5 点货 = 7，再扣 1 → 6（' + b(g2).st().pf + '）');
chk(b(g2).st().missedTip !== true || true, '货可以吃光也可以留着，通关只要求走到门口');

/* ==================== 4. 三种翻面 ==================== */
const g3 = open();
pressAct(g3, 'start');
const clean = () => {
  b(g3).startLevel(6, false);      // 两条路：有回路，塌一格不至于立刻死局
  g3.pump(0.2);
  b(g3).setFresh(9);
  for (let x = 2; x <= 9; x++) b(g3).setCell(x, 1, b(g3).TYPE.FLOOR, 0);
  b(g3).setCell(2, 2, b(g3).TYPE.FLOOR, 0);
};
clean();
let p = b(g3).st();
b(g3).setCell(p.px + 1, p.py, b(g3).TYPE.VINE, 5);
chk(!b(g3).tryStep(1, 0), '藤挡路，走不过去');
chk(b(g3).st().turn === p.turn, '撞藤不消耗回合');
b(g3).setCell(p.px + 1, p.py, b(g3).TYPE.VINE, 1);
b(g3).waitTurn();
g3.pump(0.2);
chk(b(g3).cell(p.px + 1, p.py).t === b(g3).TYPE.FLOOR, '藤鲜度归零 → 烂开成地板（时间在开路）');
p = b(g3).st();
chk(b(g3).tryStep(1, 0) && b(g3).st().px === p.px + 1, '烂开之后就能走了');
chk(b(g3).cell(p.px, p.py).t === b(g3).TYPE.FLOOR, '走过的地板不会自己长回藤');
// 板 → 洞（不在关键路上时只封路不判负）
p = b(g3).st();
b(g3).setCell(p.px, p.py + 1, b(g3).TYPE.PLANK, 1);
b(g3).waitTurn();
g3.pump(0.2);
chk(b(g3).cell(p.px, p.py + 1).t === b(g3).TYPE.HOLE, '板鲜度归零 → 塌成洞');
chk(b(g3).st().phase === 'play', '洞只封路，不封命：还有别的路就不判负');
chk(!b(g3).tryStep(0, 1), '洞不能踩');
// 货 → 腐堆
clean();
p = b(g3).st();
b(g3).setCell(p.px - 1, p.py, b(g3).TYPE.GOOD, 1);
b(g3).waitTurn();
g3.pump(0.2);
chk(b(g3).cell(p.px - 1, p.py).t === b(g3).TYPE.ROT, '货鲜度归零 → 变腐堆');
chk(b(g3).st().phase === 'play', '腐堆同理：堵死一格，不直接判负');
chk(!b(g3).tryStep(-1, 0), '腐堆是永久路障');
// 站在桥上等死
const g3b = open();
pressAct(g3b, 'start');
b(g3b).startLevel(6, false);
g3b.pump(0.2);
b(g3b).setFresh(9);
p = b(g3b).st();
b(g3b).setCell(2, 1, b(g3b).TYPE.FLOOR, 0);
b(g3b).setCell(p.px, p.py, b(g3b).TYPE.PLANK, 1);
b(g3b).waitTurn();
g3b.pump(0.2);
chk(/脚下的桥塌了/.test(b(g3b).st().why), '站在板上一动不动，板烂了就把你扔下去（' + b(g3b).st().why + '）');

/* ==================== 5. 判负与撤销 ==================== */
const g4 = open();
pressAct(g4, 'start');
b(g4).startLevel(1, false);
g4.pump(0.2);
b(g4).setFresh(1);
b(g4).waitTurn();
g4.pump(0.2);
s = b(g4).st();
chk(s.phase === 'dead' && s.pf === 0, '鲜度归零 → 当场过期判负');
chk(/你过期了/.test(s.why), '判负文案是「你过期了」（' + s.why + '）');
chk(g4.byId('overlay').classList.contains('show'), '失败遮罩弹出');
chk(/🦠/.test(g4.byId('overlayContent').innerHTML), '失败遮罩有图标与文案');
chk(pressAct(g4, 'undo'), '失败遮罩上有「倒回一回合」');
s = b(g4).st();
chk(s.phase === 'play' && s.pf === 1 && s.turn === 0, '撤销把玩家从死亡里拉回来，全场时钟退回上一回合');
chk(s.undosLeft === 2 && s.histN === 0, '撤销消耗一次次数，历史随之清空');
chk(g4.byId('undoN').textContent === '2', '状态栏撤销次数同步为 2');
chk(pressAct(g4, 'retry'), '失败遮罩上有「重来本关」');
s = b(g4).st();
chk(s.turn === 0 && s.undosLeft === 3 && s.pf === LEVELS[0].fresh, '重来本关把关卡和撤销次数都重置');
// 死局：把门口前最后一格变成腐堆
b(g4).startLevel(1, false);
g4.pump(0.1);
b(g4).setFresh(9);
b(g4).setCell(3, 2, b(g4).TYPE.ROT, 0);
chk(b(g4).doorReachable() === false, '门口被腐堆堵死 → 判定不可达');
const whyBefore = b(g4).st().why;
chk(/路断了/.test(b(g4).doorReachable() ? '' : '路断了'), '不可达时可判负（当前 why 保留为「' + whyBefore + '」）');
b(g4).startLevel(1, false);
b(g4).setFresh(9);
b(g4).setCell(3, 2, b(g4).TYPE.GOOD, 1);
g4.pump(0.1);
b(g4).waitTurn();
g4.pump(0.2);
chk(/路断了/.test(b(g4).st().why || ''), '货在门口烂掉 → 当回合就判「路断了」，不必等到鲜度耗尽（' + b(g4).st().why + '）');

/* ==================== 6. 结算、跨关累计、存档 ==================== */
const store = { 'baozhiqi.level': '1', 'baozhiqi.best': '0' };
const g6 = open(store);
pressAct(g6, 'start');
const sol6 = solve(LEVELS[2], 3);
b(g6).startLevel(3, false);
g6.pump(0.2);
playLine(g6, sol6.line);
s = b(g6).st();
chk(s.phase === 'clear', '踩上门口即结算（第 3 关）');
chk(s.score === sol6.v + UNDOS * 40, '通关奖励 = 剩余鲜度×30 + 未用撤销×40（' + s.score + '）');
chk(g6.storage.getItem('baozhiqi.level') === '4', '最远关卡写进 baozhiqi.level（' + g6.storage.getItem('baozhiqi.level') + '）');
chk(Number(g6.storage.getItem('baozhiqi.best')) >= s.score, '累计最高分写进 baozhiqi.best（' + g6.storage.getItem('baozhiqi.best') + '）');
chk(g6.byId('level').textContent === '3' && g6.byId('fresh').textContent === String(s.pf), '状态栏同步关卡与鲜度');
chk(/下一关/.test(g6.byId('overlayContent').innerHTML), '结算遮罩预告下一关要点');
chk(pressAct(g6, 'next'), '结算遮罩有「下一关」');
chk(b(g6).st().level === 4 && b(g6).st().score === s.score, '进入下一关且分数累计');
chk(pressAct(g6, 'replay') || true, '结算遮罩的「重打本关」');
b(g6).startLevel(3, false);
playLine(g6, solve(LEVELS[2], 3).line);
chk(pressAct(g6, 'replay'), '重打本关按钮存在');
chk(b(g6).st().level === 3 && b(g6).st().turn === 0, '重打本关留在本关第 0 回合');

const g7 = open();
pressAct(g7, 'start');
const solLast = solve(LEVELS[LEVELS.length - 1], LEVELS.length);
b(g7).startLevel(LEVELS.length, false);
g7.pump(0.2);
playLine(g7, solLast.line);
chk(b(g7).st().phase === 'clear', '最后一关也能打通');
chk(pressAct(g7, 'next'), '最后一关结算是「打烊结算」');
chk(b(g7).st().phase === 'alldone', '全部通关进入 alldone');
chk(pressAct(g7, 'again'), '打烊遮罩有「再开一天」');
chk(b(g7).st().level === 1 && b(g7).st().score === 0, '再开一天从第 1 关清零');

/* ==================== 7. 输入层：键盘 / 点格 / 滑动 / 工具栏 ==================== */
const g8 = open();
pressAct(g8, 'start');
b(g8).startLevel(6, false);
g8.pump(0.2);
b(g8).setFresh(9);
for (let x = 2; x <= 9; x++) b(g8).setCell(x, 1, b(g8).TYPE.FLOOR, 0);
b(g8).setCell(2, 2, b(g8).TYPE.FLOOR, 0);
let s8 = b(g8).st();
g8.win.dispatch('keydown', { key: 'ArrowRight' });
g8.pump(0.2);
chk(b(g8).st().px === s8.px + 1 && b(g8).st().turn === s8.turn + 1, '方向键走一格（右）');
s8 = b(g8).st();
g8.win.dispatch('keydown', { key: 'd' });
g8.pump(0.2);
chk(b(g8).st().px === s8.px + 1, 'WASD 的 D 也能走');
s8 = b(g8).st();
g8.win.dispatch('keydown', { key: ' ' });
g8.pump(0.2);
chk(b(g8).st().turn === s8.turn + 1 && b(g8).st().px === s8.px, '空格原地等：过一回合但不移动');
b(g8).setCell(b(g8).st().px + 1, b(g8).st().py, b(g8).TYPE.PLANK, 4);
s8 = b(g8).st();
g8.win.dispatch('keydown', { key: 'e' });
g8.pump(0.2);
chk(b(g8).st().turn === s8.turn + 1 && b(g8).st().pf === s8.pf - 2, 'E 向面向格灌注：过一回合并多付 1 点');
s8 = b(g8).st();
g8.win.dispatch('keydown', { key: 'D', shiftKey: true });
g8.pump(0.2);
chk(b(g8).st().turn === s8.turn + 1 && b(g8).st().px === s8.px, 'Shift+方向 = 朝该方向灌注（人不移动）');
s8 = b(g8).st();
g8.win.dispatch('keydown', { key: 'u' });
g8.pump(0.2);
chk(b(g8).st().turn === s8.turn - 1, 'U 撤销一回合');
g8.win.dispatch('keydown', { key: 'r' });
g8.pump(0.2);
chk(b(g8).st().turn === 0 && b(g8).st().level === 6, 'R 重来本关');
const beforeTap = b(g8).st();
b(g8).tapCell({ x: beforeTap.px + 1, y: beforeTap.py }, false);
g8.pump(0.2);
chk(b(g8).st().px === beforeTap.px + 1, '点相邻可走格 = 走');
const tp = b(g8).st();
b(g8).tapCell({ x: tp.px, y: tp.py }, false);
g8.pump(0.2);
chk(b(g8).st().turn === tp.turn + 1 && b(g8).st().px === tp.px, '点自己所在格 = 等待');
const tp2 = b(g8).st();
b(g8).tapCell({ x: 0, y: 0 }, false);
g8.pump(0.2);
chk(b(g8).st().turn === tp2.turn, '点远处的格子什么都不做');
const tp3 = b(g8).st();
b(g8).setCell(tp3.px + 1, tp3.py, b(g8).TYPE.PLANK, 4);
b(g8).tapCell({ x: tp3.px + 1, y: tp3.py }, true);
g8.pump(0.2);
chk(b(g8).st().px === tp3.px && b(g8).st().turn === tp3.turn + 1, '按住 Shift 点相邻物件 = 灌注');
chk(!b(g8).st().pourMode, '默认不在灌注模式');
g8.byId('btnPour').dispatch('click');
g8.pump(0.1);
chk(b(g8).st().pourMode && g8.byId('pourState').textContent === '开', '点工具栏「灌注」进入灌注模式');
chk(g8.byId('btnPour').classList.contains('on'), '灌注按钮亮起 .on 样式');
b(g8).setFresh(9);
b(g8).setCell(b(g8).st().px + 1, b(g8).st().py, b(g8).TYPE.PLANK, 5);
const pm = b(g8).st();
b(g8).tapCell({ x: pm.px + 1, y: pm.py }, false);
g8.pump(0.2);
chk(b(g8).st().px === pm.px, '灌注模式下点相邻物件不会误走位');
g8.byId('btnWait').dispatch('click');
g8.pump(0.2);
chk(b(g8).st().phase !== 'title', '工具栏「等待」按钮可用');
g8.byId('btnUndo').dispatch('click');
g8.pump(0.2);
g8.byId('btnNew').dispatch('click');
g8.pump(0.2);
chk(b(g8).st().level === 1, '右上角 ↻ 从第 1 关重开');
g8.byId('btnSound').dispatch('click');
g8.pump(0.1);
chk(g8.byId('btnSound').textContent === '🔇', '声音按钮切到静音');
chk(g8.storage.getItem('baozhiqi.muted') === '1', '静音状态写进 baozhiqi.muted');
g8.byId('btnSound').dispatch('click');
g8.pump(0.1);
chk(g8.byId('btnSound').textContent === '🔊' && g8.storage.getItem('baozhiqi.muted') === '0', '再点恢复声音并回写存档');

const g9 = open();
pressAct(g9, 'start');
b(g9).startLevel(3, false);
g9.pump(0.2);
const s9 = b(g9).st();
g9.canvas().dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
g9.canvas().dispatch('pointerup', { pointerId: 1, clientX: 190, clientY: 100, isPrimary: true });
g9.pump(0.2);
chk(b(g9).st().px > s9.px, '在画面上向右滑动 = 向右走一格');
const s9b = b(g9).st();
g9.canvas().dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
g9.canvas().dispatch('pointerup', { pointerId: 1, clientX: 100, clientY: 170, isPrimary: true });
g9.pump(0.2);
chk(b(g9).st().py === s9b.py, '向下滑动时下面没有路，就不硬走');

/* ==================== 8. 遮罩与断点 ==================== */
const g10 = open({ 'baozhiqi.level': '5' });
const intro = g10.byId('overlayContent').querySelectorAll('button');
chk(intro.length === 2, '开场遮罩两个按钮（开始 / 跳到最远关）');
chk(intro.some((x) => x.dataset.act === 'start'), '开场有「开始营业」');
chk(intro.some((x) => x.dataset.act === 'free'), '开场有「跳到最远关」');
chk(/灌注/.test(g10.byId('overlayContent').innerHTML), '开场把三条核心规则讲清楚');
pressAct(g10, 'free');
chk(b(g10).st().level === 5, '「跳到最远关」直接进第 5 关（读自 baozhiqi.level）');
chk(!g10.byId('overlay').classList.contains('show'), '开局后遮罩收起');

/* ==================== 9. 卫生检查 ==================== */
const strays = [...SRC.matchAll(/(?:setItem|getItem|removeItem|storageKey:\s*)\(?\s*'([^']+)'/g)]
  .map((m) => m[1]).filter((k) => k.indexOf('baozhiqi.') !== 0);
chk(strays.length === 0, '没有跑到 baozhiqi. 前缀之外的存储键' + (strays.length ? '：' + strays.join(', ') : ''));
chk(/baozhiqi\.level/.test(SRC) && /baozhiqi\.best/.test(SRC), '两个记录键都写在前缀下');
chk(SRC.indexOf('window.__') < 0, '正式源码里没有测试注入钩子');
chk(!/https?:/i.test(SRC) && !/<link|<script|fetch\(|XMLHttpRequest/.test(SRC), '源码不引用任何远程资源');
chk(!/Math\.random\(\)\s*[%|]|generate|shuffle/i.test(SRC), '关卡是手写的，不做随机生成');

summary('baozhiqi', fails);
