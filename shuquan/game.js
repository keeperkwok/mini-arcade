/* 数圈 —— 一版「Loop the Loop」：只画一条闭合回路，还得对上所有数字
   机制：① 每格三态循环：空 → 圈上 → ✕（确定不在圈上）→ 空。右键反着切。
      ② 赢的判定完全按规则当场算：圈上的格必须连成「一条」回路 —— 每格恰好 2 个
         上下左右的圈邻居（不多不少，于是不能断、不能分叉、不能画成两坨），
         且每个数字都等于它周围 8 格里的圈格数。差一格都不算过。
      ③ 出题是自己造题自己验：先随机造一条结构上必定合法的环（矩形框的 L 边 + 楼梯边），
         翻几次角打散，再从答案数出数字、随机放约四成，删到不能再删（每删一个都跑一遍
         回溯求解器确认「只有这一个解」）。求解器同时用于提示：答案唯一，揭示的格才不会骗人。
      ④ 每关单独限时，按「拍」走（1 拍 = 0.1 秒）；圈画对得越早、越少用提示，分越高。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 规则常量 ==================== */
var STEP_MS = 100;          // 一拍 = 0.1 秒
var HINT_COST = 55;         // 揭一格真状态扣 5.5 秒
var GEN_WORK = 260000;      // 出题预算：累计允许烧掉多少求解节点（不用墙钟，同种子必出同盘）
var MIN_CLUES = 4;          // 数字最少给几个
var SIZES = [[4, 4], [5, 4], [5, 5], [6, 5], [6, 6], [7, 6], [7, 7], [8, 8]];
var LEVELS = SIZES.length;
var DIFFS = {
  easy: { key: 'easy', label: '佛系画', mult: 0.8, hints: 6, frac: 0.5, base: 60, per: 4.2, flips: 3 },
  std: { key: 'std', label: '标准局', mult: 1, hints: 3, frac: 0.42, base: 30, per: 2.6, flips: 6 },
  rush: { key: 'rush', label: '限时挑战', mult: 1.7, hints: 1, frac: 0.36, base: 22, per: 1.8, flips: 9 },
};

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能钉住同一串关卡（同事之间比谁画得快）
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;

/* ==================== 数圈 纯规则 ==================== */
/* 圈 = 一组格子：每块圈格恰好有 2 个上下左右相邻的圈格，且整体连通（一条不自交的闭合回路）。
   格上数字 = 周围 8 格里有几格在圈上。 */
function nb4List(rows, cols) {
  var out = [], r, c, list;
  for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
    list = [];
    if (r > 0) list.push((r - 1) * cols + c);
    if (c + 1 < cols) list.push(r * cols + c + 1);
    if (r + 1 < rows) list.push((r + 1) * cols + c);
    if (c > 0) list.push(r * cols + c - 1);
    out[r * cols + c] = list;
  }
  return out;
}
function nb8List(rows, cols) {
  var out = [], r, c, i, j, list;
  for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
    list = [];
    for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      if (r + i < 0 || c + j < 0 || r + i >= rows || c + j >= cols) continue;
      list.push((r + i) * cols + c + j);
    }
    out[r * cols + c] = list;
  }
  return out;
}
function loopOK(on, adj4, n) {
  var i, k, cnt = 0, seen = [], stack = [];
  for (i = 0; i < n; i++) if (on[i]) cnt++;
  if (cnt < 4) return false;
  for (i = 0; i < n; i++) {
    if (!on[i]) continue;
    k = 0;
    for (var q = 0; q < adj4[i].length; q++) if (on[adj4[i][q]]) k++;
    if (k !== 2) return false;
  }
  for (i = 0; i < n; i++) if (on[i]) break;
  stack.push(i); seen[i] = 1;
  var got = 1;
  while (stack.length) {
    var cur = stack.pop(), list = adj4[cur];
    for (q = 0; q < list.length; q++) {
      var m = list[q];
      if (!on[m] || seen[m]) continue;
      seen[m] = 1; got++; stack.push(m);
    }
  }
  return got === cnt;
}
function cluesOf(on, adj8, n) {
  var cl = [], i, k;
  for (i = 0; i < n; i++) {
    var c = 0;
    for (k = 0; k < adj8[i].length; k++) if (on[adj8[i][k]]) c++;
    cl.push(c);
  }
  return cl;
}
/* 造一个必定合法的圈：矩形框的「L 边」+「楼梯边」，两条路径只在两端相接 */
function makeLoop(rnd, rows, cols, adj4, minLen) {
  for (var attempt = 0; attempt < 40; attempt++) {
    var on = stairLoop(rnd, rows, cols, minLen);
    if (on && loopOK(on, adj4, rows * cols)) return on;
  }
  return null;
}
function stairLoop(rnd, rows, cols, minLen) {
  /* 两条路径要围得出一个「洞」才成得了环：dx、dy 至少各 2 —— 只有一格厚的话就是两行实心，
     中间那些格会多出 3~4 个正交邻居，loopOK 当场拒掉。这里先把范围卡住，少白费重试验证。 */
  if (rows < 3 || cols < 3) return null;
  var dx = 2 + Math.floor(rnd() * (cols - 2));
  var dy = 2 + Math.floor(rnd() * (rows - 2));
  if (minLen && dx + dy < Math.ceil(minLen / 2)) {          // 环太短 = 一盘只画一个小方块，挑一条更长的大边
    var need = Math.ceil(minLen / 2);
    dx = Math.min(cols - 1, Math.max(2, need - 2 + Math.floor(rnd() * 3)));
    dy = Math.min(rows - 1, Math.max(2, need - dx));
    if (2 * (dx + dy) < minLen) return null;
  }
  var ox = Math.floor(rnd() * (cols - dx));
  var oy = Math.floor(rnd() * (rows - dy));
  var on = new Uint8Array(rows * cols), i;
  function put(x, y) { on[(oy + y) * cols + ox + x] = 1; }
  put(0, 0);
  for (i = 1; i <= dx; i++) put(i, 0);
  for (i = 1; i <= dy; i++) put(dx, i);
  var mid = [];
  for (i = 1; i < dx; i++) mid.push(0);
  for (i = 1; i < dy; i++) mid.push(1);
  for (i = mid.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = mid[i]; mid[i] = mid[j]; mid[j] = t; }
  var x = 0, y = 0;
  y++; put(x, y);                     // 楼梯第一步必定向下
  for (i = 0; i < mid.length; i++) { if (mid[i] === 0) x++; else y++; put(x, y); }
  x++; put(x, y);                     // 最后一步必定往右收尾
  return on;
}
/* 翻角：把环上一个拐角挪到它对面那格，验证过才收下 */
function flipLoop(on, rnd, rows, cols, adj4) {
  var n = rows * cols, list = [], i, tries;
  for (i = 0; i < n; i++) if (on[i]) list.push(i);
  for (tries = 0; tries < 30; tries++) {
    var p = list[Math.floor(rnd() * list.length)];
    var px = p % cols, py = (p - px) / cols;
    var ons = [];
    for (i = 0; i < adj4[p].length; i++) if (on[adj4[p][i]]) ons.push(adj4[p][i]);
    if (ons.length !== 2) continue;
    var a = ons[0], b = ons[1];
    var ax = a % cols, ay = (a - ax) / cols, bx = b % cols, by = (b - bx) / cols;
    if (ax === bx || ay === by) continue;
    var nx = ax + bx - px, ny = ay + by - py;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    var q = ny * cols + nx;
    if (on[q]) continue;
    on[p] = 0; on[q] = 1;
    if (loopOK(on, adj4, n)) return true;
    on[p] = 1; on[q] = 0;
  }
  return false;
}
/* 回溯求解：clue[p] < 0 = 这格没数字。cap = 要几个解（判唯一用 2）
   剪枝三件套：① 圈格的正交邻居数必须正好 2（deg 已定 / free 待定）
              ② 数字的 8 邻居「已定圈格 ≤ 数字 ≤ 已定 + 待定」
              ③ 一旦出现闭合环，其余格只能全空（否则就是第二个环 = 非法） */
function solveRows(rows, cols, clue, cap, adj4, adj8, budgetNodes) {
  var n = rows * cols, sols = [], i;
  var state = new Int8Array(n);
  for (i = 0; i < n; i++) state[i] = -1;
  var deg = new Int16Array(n), free4 = new Int16Array(n), free8 = new Int16Array(n), on8 = new Int16Array(n);
  for (i = 0; i < n; i++) { free4[i] = adj4[i].length; free8[i] = adj8[i].length; }
  var und = n, closed = 0, nodes = 0, stop = false;
  var budget = budgetNodes || 60000;
  var trail = [];

  function consistent(p) {
    var list = adj4[p], q, m;
    for (q = 0; q < list.length; q++) {
      m = list[q];
      if (state[m] !== 1) continue;
      if (deg[m] > 2 || deg[m] + free4[m] < 2) return false;
    }
    if (state[p] === 1 && (deg[p] > 2 || deg[p] + free4[p] < 2)) return false;
    list = adj8[p];
    for (q = 0; q < list.length; q++) {
      m = list[q];
      if (clue[m] < 0) continue;
      if (on8[m] > clue[m] || on8[m] + free8[m] < clue[m]) return false;
    }
    if (clue[p] >= 0 && (on8[p] > clue[p] || on8[p] + free8[p] < clue[p])) return false;
    return true;
  }
  function componentClosed(p) {
    var stack = [p], seen = {}, cnt = 0;
    seen[p] = 1;
    while (stack.length) {
      var cur = stack.pop(), list = adj4[cur], q;
      if (deg[cur] !== 2) return false;
      cnt++;
      for (q = 0; q < list.length; q++) {
        var m = list[q];
        if (state[m] !== 1 || seen[m]) continue;
        seen[m] = 1; stack.push(m);
      }
    }
    return cnt >= 4;
  }
  function assign(p, v) {
    var q, m;
    state[p] = v; und--;
    if (v === 1) {
      for (q = 0; q < adj4[p].length; q++) deg[adj4[p][q]]++;
      for (q = 0; q < adj8[p].length; q++) { m = adj8[p][q]; if (state[m] < 0) free8[m]--; on8[m]++; }
    } else {
      for (q = 0; q < adj8[p].length; q++) { m = adj8[p][q]; if (state[m] < 0) free8[m]--; }
    }
    for (q = 0; q < adj4[p].length; q++) { m = adj4[p][q]; if (state[m] < 0) free4[m]--; }
    var wasClosed = 0;
    if (v === 1 && deg[p] === 2 && closed === 0 && componentClosed(p)) { closed++; wasClosed = 1; }
    trail.push(p * 2 + v + (wasClosed ? 2 * n : 0));
    return consistent(p);
  }
  function unassign() {
    var rec = trail.pop(), p, v, q, m;
    var wasClosed = 0;
    if (rec >= 2 * n) { wasClosed = 1; rec -= 2 * n; }
    v = rec % 2; p = (rec - v) / 2;
    if (wasClosed) closed--;
    for (q = 0; q < adj4[p].length; q++) { m = adj4[p][q]; if (state[m] < 0) free4[m]++; }
    if (v === 1) {
      for (q = 0; q < adj8[p].length; q++) { m = adj8[p][q]; on8[m]--; if (state[m] < 0) free8[m]++; }
      for (q = 0; q < adj4[p].length; q++) deg[adj4[p][q]]--;
    } else {
      for (q = 0; q < adj8[p].length; q++) { m = adj8[p][q]; if (state[m] < 0) free8[m]++; }
    }
    state[p] = -1; und++;
  }
  function rollback(mark) { while (trail.length > mark) unassign(); }
  function propagate(mark) {
    var again = true, p, q, m, must1, must0, list;
    while (again) {
      again = false;
      if (closed > 0) {
        for (p = 0; p < n; p++) {
          if (state[p] >= 0) continue;
          if (!assign(p, 0)) { rollback(mark); return false; }
          again = true;
        }
        return true;
      }
      for (p = 0; p < n; p++) {
        if (state[p] >= 0) continue;
        must1 = 0; must0 = 0;
        list = adj4[p];
        for (q = 0; q < list.length; q++) {
          m = list[q];
          if (state[m] !== 1) continue;
          if (deg[m] === 2) must0 = 1;
          else if (deg[m] + free4[m] === 2) must1 = 1;
        }
        list = adj8[p];
        for (q = 0; q < list.length; q++) {
          m = list[q];
          if (clue[m] < 0) continue;
          if (on8[m] === clue[m]) must0 = 1;
          else if (on8[m] + free8[m] === clue[m]) must1 = 1;
        }
        if (must1 && must0) { rollback(mark); return false; }
        if (must1 || must0) {
          if (!assign(p, must1 ? 1 : 0)) { rollback(mark); return false; }
          again = true;
        }
      }
    }
    return true;
  }
  /* 分支格：行优先，挑「第一个贴着已定圈格的空格」，其次贴着数字的，最后第一个空格 */
  function nextCell() {
    var p, q, hitOn = -1, hitClue = -1;
    for (p = 0; p < n; p++) {
      if (state[p] !== -1) continue;
      if (hitOn < 0) {
        for (q = 0; q < adj4[p].length; q++) if (state[adj4[p][q]] === 1) { hitOn = p; break; }
      }
      if (hitOn >= 0) return hitOn;
      if (hitClue < 0) {
        if (clue[p] >= 0) hitClue = p;
        else for (q = 0; q < adj8[p].length; q++) if (clue[adj8[p][q]] >= 0) { hitClue = p; break; }
      }
    }
    if (hitClue >= 0) return hitClue;
    for (p = 0; p < n; p++) if (state[p] === -1) return p;
    return -1;
  }
  function leaf() {
    var p, ok = closed === 1;
    if (ok) for (p = 0; p < n; p++) if (clue[p] >= 0 && on8[p] !== clue[p]) { ok = false; break; }
    if (!ok) return false;
    var on = new Uint8Array(n);
    for (p = 0; p < n; p++) on[p] = state[p];
    if (!loopOK(on, adj4, n)) return false;
    sols.push(on);
    return sols.length >= cap;
  }
  function dfs() {
    if (++nodes > budget) { stop = true; return true; }
    var mark = trail.length;
    if (!propagate(mark)) return false;
    if (und === 0) { var done = leaf(); rollback(mark); return done; }
    var p = nextCell();
    if (p < 0) { rollback(mark); return false; }
    var order = closed > 0 ? [0] : [1, 0];
    for (var t = 0; t < order.length; t++) {
      var m2 = trail.length;
      if (assign(p, order[t])) { if (dfs()) { rollback(m2); return true; } }
      rollback(m2);
      if (stop) { rollback(mark); return true; }
    }
    rollback(mark);
    return false;
  }
  dfs();
  return { sols: sols, nodes: nodes, timeout: stop };
}

/* ==================== 出题：造环 → 数字 → 删到唯一 ==================== */
/* 从随机环开始铺数字，先给 frac 比例，再「试删」：删掉某个数字后求解器还能算出唯一解才真删。
   删不动/验不过就补数字重来；全程按「求解节点数」限预算（不用墙钟，同一种子必出同一盘）。
   兜底盘 = 沿边框画一圈 + 每格都带数字（必定合法，只是难看，基本走不到）。 */
function borderLoop(rows, cols) {
  var on = new Uint8Array(rows * cols), r, c;
  for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
    if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) on[r * cols + c] = 1;
  }
  return on;
}
function genPuzzle(rnd, rows, cols, adj4, adj8, frac, flips, workBudget) {
  var n = rows * cols, tries, i, f, q;
  var minLen = rows + cols;
  var used = 0;                                   // 已烧掉的求解节点
  function probe(cl) {
    var rr = solveRows(rows, cols, cl, 2, adj4, adj8, 60000);
    used += rr.nodes;
    return rr;
  }
  var spare = null;            // 预算用完时的备胎：环与数字都是真的，只是没验成「唯一解」
  for (tries = 0; tries < 40; tries++) {
    if (used > workBudget) break;
    var on = makeLoop(rnd, rows, cols, adj4, minLen);
    if (!on) continue;
    for (f = 0; f < flips; f++) flipLoop(on, rnd, rows, cols, adj4);
    if (!loopOK(on, adj4, n)) continue;
    var full = cluesOf(on, adj8, n);
    var clue = [], idx = [];
    for (i = 0; i < n; i++) { clue.push(-1); idx.push(i); }
    for (i = n - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    var target = Math.max(MIN_CLUES, Math.round(n * frac));
    for (i = 0; i < target; i++) clue[idx[i]] = full[idx[i]];
    var r = probe(clue);
    var guard = 0;
    while ((!r.sols.length || r.sols.length > 1 || r.timeout) && guard++ < 50) {
      if (used > workBudget) break;
      var pick = -1;
      if (r.timeout || !r.sols.length) {
        /* 无解 / 超时：随机补一个还没数字的格（超时说明这儿确实难判，多给点信息） */
        var free = [];
        for (i = 0; i < n; i++) if (clue[i] < 0) free.push(i);
        if (free.length) pick = free[Math.floor(rnd() * free.length)];
      } else {
        /* 两个解：在它们「画得不一样」的格里挑一个补数字，一刀切开 */
        var a = r.sols[0], b = r.sols[1], diff = [];
        for (i = 0; i < n; i++) if (a[i] !== b[i] && clue[i] < 0) diff.push(i);
        if (!diff.length) for (i = 0; i < n; i++) if (a[i] !== b[i]) diff.push(i);
        if (diff.length) pick = diff[Math.floor(rnd() * diff.length)];
      }
      if (pick < 0) break;
      clue[pick] = full[pick];
      r = probe(clue);
    }
    if (r.timeout || r.sols.length !== 1) {
      if (!spare && r.sols.length) {
        var cp = new Uint8Array(n);
        for (i = 0; i < n; i++) cp[i] = on[i];
        var nn = 0;
        for (i = 0; i < n; i++) if (clue[i] >= 0) nn++;
        if (nn) spare = { on: cp, clue: clue.slice(), clues: nn, tries: tries + 1, unproven: true };
      }
      continue;
    }
    /* 最小化：随机顺序试删，删完还能唯一解才真删；删到 floor 就收手（太少数字 = 太烧脑） */
    var floor = Math.max(MIN_CLUES, Math.round(n * frac * 0.62)), have = target;
    var order = [];
    for (i = 0; i < n; i++) if (clue[i] >= 0) order.push(i);
    for (i = order.length - 1; i > 0; i--) { var j2 = Math.floor(rnd() * (i + 1)); var t2 = order[i]; order[i] = order[j2]; order[j2] = t2; }
    for (q = 0; q < order.length && have > floor; q++) {
      if (used > workBudget) break;
      var ci = order[q], keep = clue[ci];
      clue[ci] = -1; have--;
      var r2 = probe(clue);
      if (r2.timeout || r2.sols.length !== 1) { clue[ci] = keep; have++; }
    }
    var cnt = 0, okClue = true;
    for (i = 0; i < n; i++) {
      if (clue[i] < 0) continue;
      cnt++;
      if (clue[i] !== full[i]) okClue = false;      // 保险：数字必须与这盘答案对得上
    }
    if (!cnt || !okClue) continue;
    return { on: on, clue: clue, clues: cnt, tries: tries + 1 };
  }
  if (spare) return spare;          // 验不成唯一解也得给玩家一盘真圈，别退回边框兜底
  var fb = borderLoop(rows, cols);
  return { on: fb, clue: cluesOf(fb, adj8, n), clues: n, tries: tries, fallback: true };
}



/* ==================== 本机存储 / 声音 ==================== */
var store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} },
};
function byId(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }
function num(k) { var v = parseInt(store.get(k, '0'), 10); return isNaN(v) ? 0 : v; }
var SILENT = {
  resume: function () {}, toggle: function () { return false; }, setMuted: function () { return false; },
  isMuted: function () { return true; }, tone: function () {}, noise: function () {}, melody: function () {},
};
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'sq.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var boardEl = byId('board'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elDim = byId('dim'), elOn = byId('onN'), elKnot = byId('knotN');
var elClock = byId('clock'), elScore = byId('score'), elHint = byId('hintN');
var btnHint = byId('btnHint'), btnClear = byId('btnClear'), btnFix = byId('btnFix');
var btnPause = byId('btnPause'), btnStats = byId('btnStats'), btnNew = byId('btnNew');
var cellEls = [];

/* OFF = 0 / ON = 1 / 打叉 = 2 */
var OFF = 0, ON = 1, MK = 2;

/* ==================== 对局状态 ==================== */
var phase = 'intro';        // intro | play | clear | over
var diff = store.get('sq.diff', 'std');
if (!DIFFS[diff]) diff = 'std';
var rows = 4, cols = 4, cells = 16;
var adj4 = [], adj8 = [];
var clue = [];              // 每格数字，-1 = 没数字
var answer = null;          // 唯一解（Uint8Array），提示与收官展示用
var cell = null;            // 玩家画的：0 空 / 1 圈上 / 2 打叉
var rev = null;             // 提示揭示过的格
var knotFlag = null, errFlag = null;
var level = 0, score = 0, hints = 0, hinted = false, clock = 0, timeTicks = 0;
var onCount = 0, knots = 0, errs = 0, solved = false, lastGain = 0, totalLoop = 0;
var cur = 0, paused = false, winUntil = 0;

function D() { return DIFFS[diff]; }
function sizeOf(i) { var s = SIZES[Math.max(0, Math.min(LEVELS - 1, i))]; return { rows: s[0], cols: s[1] }; }
function limitTicks() { var s = sizeOf(level); return Math.round((D().base + s.rows * s.cols * D().per) * 10); }
function secLeft() { return Math.max(0, Math.round(timeTicks / 10)); }
function gainOf() { return Math.round((28 + cells * 3 + secLeft() * 1.1 + (hinted ? 0 : 22)) * D().mult); }
function fmtTime(ticks) {
  var s = Math.max(0, Math.ceil(ticks / 10));
  return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}

/* ==================== 关卡流程 ==================== */
function newRun() {
  score = 0; level = 0; totalLoop = 0; hints = D().hints;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  startLevel(0);
}
function startLevel(i) {
  level = Math.max(0, Math.min(LEVELS - 1, i));
  var s = sizeOf(level);
  rows = s.rows; cols = s.cols; cells = rows * cols;
  adj4 = nb4List(rows, cols); adj8 = nb8List(rows, cols);
  var rnd = rngOf((seedBase + level * 7919 + 13) >>> 0);
  var p = genPuzzle(rnd, rows, cols, adj4, adj8, D().frac, D().flips, GEN_WORK);
  answer = p.on; clue = p.clue;
  cell = new Uint8Array(cells);
  rev = new Uint8Array(cells);
  knotFlag = new Uint8Array(cells); errFlag = new Uint8Array(cells);
  cur = 0; hinted = false; solved = false; winUntil = 0;
  timeTicks = limitTicks();
  phase = 'play';
  if (level + 1 > num('sq.lv')) store.set('sq.lv', level + 1);
  buildBoard();
  hud(); paint();
  msg('第 ' + (level + 1) + '/' + LEVELS + ' 关 · ' + rows + '×' + cols + ' · ' + p.clues + ' 个数字 —— 点格子把它画进圈里');
}
/* 分析当前画法：圈格数 / 打结处 / 数字对不上的格 / 是不是已经赢了 */
function analyze() {
  if (!cell) return;
  var i, q, list, c;
  onCount = 0; knots = 0; errs = 0;
  for (i = 0; i < cells; i++) {
    knotFlag[i] = 0; errFlag[i] = 0;
    if (cell[i] !== ON) continue;
    onCount++;
    list = adj4[i]; c = 0;
    for (q = 0; q < list.length; q++) if (cell[list[q]] === ON) c++;
    if (c !== 2) { knotFlag[i] = 1; knots++; }
  }
  for (i = 0; i < cells; i++) {
    if (clue[i] < 0) continue;
    list = adj8[i]; c = 0;
    for (q = 0; q < list.length; q++) if (cell[list[q]] === ON) c++;
    if (c !== clue[i]) { errFlag[i] = 1; errs++; }
  }
  var on = new Uint8Array(cells);
  for (i = 0; i < cells; i++) on[i] = cell[i] === ON ? 1 : 0;
  solved = errs === 0 && loopOK(on, adj4, cells);
}
/* 下一关 / 收官 */
function levelWin() {
  var gain = gainOf();
  lastGain = gain; score += gain;
  totalLoop += onCount;
  store.set('sq.loop', num('sq.loop') + onCount);
  solved = true;
  if (boardEl) boardEl.classList.add('win');
  sfx.melody([[659, 0.09], [784, 0.09], [988, 0.14]]);
  if (level + 1 >= LEVELS) { runClear(); return; }
  phase = 'clear';
  hud(); paint();
  show('<div class="ov-emoji">⭕</div><h2>这一圈画对了</h2>' +
    '<p class="hint">' + rows + '×' + cols + ' 的盘，圈上 <b>' + onCount + '</b> 格，一条闭合回路，' +
    '数字全对上。<b>+' + gain + '</b> 分。</p>' +
    '<div class="sq-ov"><p>本关剩余 <b>' + fmtTime(timeTicks) + '</b> · 提示用过 ' +
    (hinted ? '<b class="sq-warn">不止一次</b>' : '<b>零次</b>（有奖励分）') + '</p>' +
    '<p>累计 <b>' + score + '</b> 分 · 下一关 ' + sizeOf(level + 1).rows + '×' + sizeOf(level + 1).cols + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="next">下一关</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function runClear() {
  phase = 'clear';
  if (score > num('sq.best')) store.set('sq.best', score);
  hud(); paint();
  show('<div class="ov-emoji">🏆</div><h2>八关全画完了</h2>' +
    '<p class="hint">从 4×4 一路画到 8×8，一共圈了 <b>' + totalLoop + '</b> 格。</p>' +
    '<div class="sq-ov"><p>本局 <b>' + score + '</b> 分 · 本机最高 <b>' +
    Math.max(num('sq.best'), score) + '</b> 分</p>' +
    '<p>难度 <b>' + D().label + '</b> · 提示用了 ' + (D().hints - hints) + '/' + D().hints + ' 次</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(reason) {
  phase = 'over';
  if (score > num('sq.best')) store.set('sq.best', score);
  sfx.tone(150, 0.2, 'sawtooth', 0.09);
  hud();
  show('<div class="ov-emoji">⌛</div><h2>' + reason + '</h2>' +
    '<div class="sq-ov"><p>这一局 <b>' + score + '</b> 分 · 画到第 ' + (level + 1) + '/' + LEVELS +
    ' 关（' + rows + '×' + cols + '）</p>' +
    '<p>现在圈上 <b>' + onCount + '</b> 格 · 打结 <b class="sq-bad">' + knots + '</b> 处 · 数字不符 ' + errs + ' 格</p>' +
    '<p>累计圈格 ' + num('sq.loop') + ' 格</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="reveal">看答案</button>' +
    '<button class="ghost" data-act="again">重开一局</button></div>');
}
/* 看答案：把唯一解直接铺到盘上（只看不加分） */
function revealAll() {
  hide();
  for (var i = 0; i < cells; i++) { cell[i] = answer[i] ? ON : MK; rev[i] = 1; }
  analyze(); paint(); hud();
  phase = 'over';
  show('<div class="ov-emoji">👀</div><h2>这就是那条圈</h2>' +
    '<p class="hint">圈上 <b>' + countAnswer() + '</b> 格，一条闭合回路 —— 每个数字都刚好数到 8 邻居里的圈格。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">重开一局</button>' +
    '<button class="ghost" data-act="next">接着画下一关</button></div>');
}
function countAnswer() {
  var c = 0;
  for (var i = 0; i < cells; i++) if (answer[i]) c++;
  return c;
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  if (btnPause) btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
  if (paused) show('<h2>暂停</h2><p class="hint">格子不动，计时的表也不走。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续画</button></div>');
  else hide();
  hud();
}

/* ==================== 操作 ==================== */
function afterEdit(i) {
  analyze();
  paint(); hud();
  if (solved) { winUntil = clock + 3; levelWin(); return; }
  if (knotFlag[i]) sfx.tone(200, 0.05, 'square', 0.05);
  if (knots) msg('<span class="sq-bad">打结 ' + knots + ' 处</span> · 圈上 ' + onCount + ' 格 · 数字不符 ' + errs + ' 格');
  else if (!onCount) msg('圈上一格都还没有 · ' + rows + '×' + cols + ' · 剩 ' + fmtTime(timeTicks));
  else if (errs) msg('圈没打结 · 但有 <span class="sq-warn">' + errs + ' 个数字</span> 没对上');
  else msg('圈上 ' + onCount + ' 格 · <span class="sq-good">数字全对上了</span>，只差把圈接起来');
}
function cycle(i, back) {
  if (phase !== 'play' || paused || !cell) return;
  if (i < 0 || i >= cells) return;
  cell[i] = (cell[i] + (back ? 2 : 1)) % 3;
  cur = i;
  sfx.tone(cell[i] === ON ? 700 : cell[i] === MK ? 320 : 460, 0.03, 'square', 0.05);
  afterEdit(i);
}
function setState(i, v) {
  if (phase !== 'play' || paused || !cell) return;
  if (i < 0 || i >= cells) return;
  cell[i] = v; cur = i;
  sfx.tone(v === ON ? 700 : v === MK ? 320 : 460, 0.03, 'square', 0.05);
  afterEdit(i);
}
function revSome() {
  var c = 0;
  for (var i = 0; i < cells; i++) if (rev[i]) c++;
  return c;
}
function clearBoard() {
  if (phase !== 'play' || paused) return;
  for (var i = 0; i < cells; i++) if (!rev[i]) cell[i] = OFF;
  analyze(); paint(); hud();
  sfx.noise(0.06);
  msg(revSome() ? '擦干净了（提示揭过的 ' + revSome() + ' 格留着）' : '擦干净了 · 从数字重新开始推');
}
/* 这个格是不是贴着某个「数字对不上」的格 —— 没有明显打结时，这些圈格最可疑 */
function nearBadClue(p) {
  for (var i = 0; i < cells; i++) {
    if (!errFlag[i]) continue;
    for (var q = 0; q < adj8[i].length; q++) if (adj8[i][q] === p) return true;
  }
  return false;
}
/* 擦错：把所有「打结的圈格」退回空格。擦掉一层可能露出新结，所以一轮一轮擦到没有结为止；
   全程不剩结但数字还是对不上时，就退掉贴着错数字的圈格。提示揭过的格永远不动。 */
function wipeWrong() {
  if (phase !== 'play' || paused) return;
  analyze();
  var n = 0, round = 0, i;
  while (knots && round++ < 12) {
    var wiped = 0;
    for (i = 0; i < cells; i++) {
      if (cell[i] !== ON || rev[i] || !knotFlag[i]) continue;
      cell[i] = OFF; n++; wiped++;
    }
    analyze();
    if (!wiped) break;
  }
  if (!n && errs) {
    for (i = 0; i < cells; i++) {
      if (cell[i] !== ON || rev[i] || !nearBadClue(i)) continue;
      cell[i] = OFF; n++;
    }
    analyze(); paint(); hud();
    msg('圈没打结，是把 ' + n + ' 格贴着错数字的擦掉了 —— 数字才是线索');
    return;
  }
  analyze(); paint(); hud();
  if (n) msg('擦掉 ' + n + ' 处打结（' + round + ' 轮），剩下的接着推');
  else msg('没有能擦的错格（提示揭过的格不动）');
}
function useHint() {
  if (phase !== 'play' || paused) return;
  if (hints <= 0) { msg('<span class="sq-bad">提示用完了</span>'); hud(); return; }
  analyze();
  /* 优先补「答案在圈上、玩家还没画对」的格，其次擦掉玩家画错的圈格 */
  var pick = -1, i;
  var cand = [];
  for (i = 0; i < cells; i++) if (answer[i] && cell[i] !== ON) cand.push(i);
  if (cand.length) pick = cand[0];        // 取最靠左上的缺口，别用随机：同一种子必须给同样的提示
  if (pick < 0) for (i = 0; i < cells; i++) if (!answer[i] && cell[i] === ON) { pick = i; break; }
  if (pick < 0) for (i = 0; i < cells; i++) if (!answer[i] && cell[i] !== MK) { pick = i; break; }
  if (pick < 0) { msg('这盘已经全对啦'); return; }
  cell[pick] = answer[pick] ? ON : MK;
  rev[pick] = 1;
  hints--; hinted = true;
  timeTicks = Math.max(1, timeTicks - HINT_COST);
  sfx.tone(880, 0.08, 'triangle', 0.07);
  var note = '💡 第 ' + (Math.floor(pick / cols) + 1) + ' 行第 ' + (pick % cols + 1) + ' 格' +
    (answer[pick] ? '在圈上' : '不在圈上') + ' · 扣 5.5 秒，本关奖励分没了';
  afterEdit(pick);
  msg(note);
}

/* ==================== 渲染 ==================== */
function buildBoard() {
  if (!boardEl) return;
  var html = '';
  for (var i = 0; i < cells; i++) {
    html += '<div class="sq-cell' + (clue[i] >= 0 ? ' clue' : '') + '" data-i="' + i + '">' +
      (clue[i] >= 0 ? '<b class="sq-num">' + clue[i] + '</b>' : '') + '</div>';
  }
  boardEl.innerHTML = html;
  cellEls = boardEl.querySelectorAll('.sq-cell');
  boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  boardEl.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
  boardEl.style.aspectRatio = cols + ' / ' + rows;
  boardEl.classList.remove('win');
}
function paint() {
  if (!cellEls || !cellEls.length) return;
  for (var i = 0; i < cells; i++) {
    var el = cellEls[i];
    if (!el) continue;
    var cls = 'sq-cell';
    if (clue[i] >= 0) cls += ' clue';
    if (cell[i] === ON) cls += ' on';
    else if (cell[i] === MK) cls += ' mk';
    if (knotFlag[i]) cls += ' knot';
    else if (errFlag[i]) cls += ' err';
    if (rev[i]) cls += ' rev';
    if (i === cur && phase === 'play') cls += ' cur';
    el.className = cls;
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = level + 1;
  elDim.textContent = rows + '×' + cols;
  elOn.textContent = onCount;
  elKnot.textContent = knots;
  elKnot.className = 'value ' + (knots ? 'bad warn' : 'warn');
  elClock.textContent = fmtTime(timeTicks);
  elClock.className = 'value ' + (timeTicks <= 100 ? 'bad warn' : 'warn');
  elScore.textContent = score;
  elHint.textContent = hints;
  var lock = phase !== 'play' || paused;
  if (btnHint) btnHint.disabled = lock || hints <= 0;
  if (btnClear) btnClear.disabled = lock;
  if (btnFix) btnFix.disabled = lock;
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return overlayEl && overlayEl._cls && overlayEl._cls.indexOf('show') >= 0; }
function intro() {
  phase = 'intro';
  hud();
  show('<div class="ov-emoji">⭕</div><h2>数圈</h2>' +
    '<p class="hint">盘上有些格写着数字：<b>它周围 8 格里，有几格在圈上</b>。<br>' +
    '把那条圈画出来 —— 圈上的格必须连成<b>一条</b>闭合回路（每格恰好 2 个上下左右的圈邻居），' +
    '每个数字都得对上。点一格切「空 → 圈上 → ✕ → 空」，右键反着切；✕ 是给自己做的记号。' +
    '<b>' + LEVELS + '</b> 关一路从 4×4 画到 8×8，每关单独限时。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开画</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="sq-ov">' +
    '<p>最高分 <b>' + Math.max(num('sq.best'), score) + '</b> 分 · 最远到第 <b>' + Math.max(num('sq.lv'), level + 1) + '</b> 关</p>' +
    '<p>累计圈格 <b>' + num('sq.loop') + '</b> 格</p>' +
    '<p>当前 ' + rows + '×' + cols + ' · 圈上 ' + onCount + ' 格 · 打结 ' + knots + ' 处 · 数字不符 ' + errs + ' 格</p>' +
    '<p>难度 <b>' + D().label + '</b> · 本局提示剩 ' + hints + ' 次</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">返回</button></div>');
}
function act(name) {
  if (name === 'start') { hide(); phase = 'play'; paused = false; hud(); paint(); return; }
  if (name === 'again') { hide(); newRun(); intro(); act('start'); return; }
  if (name === 'next') {
    hide();
    if (phase === 'over') { if (level + 1 < LEVELS) startLevel(level + 1); else newRun(); }
    else startLevel(level + 1);
    return;
  }
  if (name === 'reveal') { revealAll(); return; }
  if (name === 'resume') {
    hide();
    if (phase === 'play') { paused = false; if (btnPause) btnPause.innerHTML = '⏸<span>暂停</span>'; }
    hud(); paint();
    return;
  }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 输入 ==================== */
function moveCur(dr, dc) {
  var r = Math.floor(cur / cols) + dr, c = cur % cols + dc;
  if (r < 0) r = 0;
  if (c < 0) c = 0;
  if (r >= rows) r = rows - 1;
  if (c >= cols) c = cols - 1;
  cur = r * cols + c;
  paint();
}
if (boardEl) {
  boardEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sfx.resume();
    cycle(+t.dataset.i, false);
  });
  boardEl.addEventListener('contextmenu', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    if (ev.preventDefault) ev.preventDefault();
    sfx.resume();
    cycle(+t.dataset.i, true);
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRun(); intro(); return; }
  if (k === 'Escape') { if (phase === 'play' && ovShown()) hide(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear' || phase === 'over') {
    if (k === 'Enter') act(phase === 'clear' ? 'next' : 'again');
    return;
  }
  if (phase !== 'play') return;
  if (k === ' ') { ev.preventDefault && ev.preventDefault(); togglePause(); return; }
  var nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
  if (k in nav) { ev.preventDefault && ev.preventDefault(); moveCur(nav[k][0], nav[k][1]); return; }
  if (k === 'Enter') { cycle(cur, false); return; }
  if (k === 'x' || k === 'X') { setState(cur, cell[cur] === MK ? OFF : MK); return; }
  if (k === 'c' || k === 'C') { clearBoard(); return; }
  if (k === 'f' || k === 'F') { wipeWrong(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === '0') { setState(cur, OFF); return; }
  if (k === '1') { setState(cur, ON); return; }
});
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnClear) btnClear.addEventListener('click', function () { sfx.resume(); clearBoard(); });
if (btnFix) btnFix.addEventListener('click', function () { sfx.resume(); wipeWrong(); });
if (btnPause) btnPause.addEventListener('click', function () { sfx.resume(); togglePause(); });
if (btnStats) btnStats.addEventListener('click', function () { sfx.resume(); stats(); });
if (btnNew) btnNew.addEventListener('click', function () { newRun(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}
(function () {
  var wrap = byId('diff');
  if (!wrap) return;
  var btns = wrap.querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-diff]') : null;
      if (!b || !DIFFS[b.dataset.diff]) return;
      diff = b.dataset.diff;
      store.set('sq.diff', diff);
      syncDiff();
      newRun();
      intro();
    });
  }
})();
function syncDiff() {
  var wrap = byId('diff');
  if (!wrap) return;
  var btns = wrap.querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 主循环：整数拍 ==================== */
function running() { return phase === 'play' && !paused && !ovShown(); }
function step() {
  clock++;
  timeTicks--;
  if (timeTicks <= 0) { timeTicks = 0; hud(); gameOver('时间到了，这一关的圈没画完'); return; }
  if (timeTicks === 100) msg('<span class="sq-warn">只剩 10 秒了</span>');
  if (clock % 5 === 0) { analyze(); hud(); }
  if (clock === winUntil && boardEl) boardEl.classList.remove('win');
}
var prev = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
var acc = 0;
function frame(now) {
  rafId = window.requestAnimationFrame(frame);
  var dt = Math.min(now - prev, 2000);
  if (dt < 0) dt = 0;
  prev = now;
  if (!running()) { acc = 0; return; }
  acc += dt;
  var guard = 0;
  while (acc >= STEP_MS && guard++ < 20) { acc -= STEP_MS; step(); }
}
var rafId = 0;
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(frame);

/* ==================== 开局 ==================== */
syncSound();
syncDiff();
newRun();
intro();
})();
