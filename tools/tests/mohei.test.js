'use strict';
/* 摸黑：换岗时间表 / 光锥视野 / 无声路线 BFS 三块地基，全部拿一套独立写的模型对拍
   重点核对：① 巡逻表确实来回往返、永不穿墙 ② 光锥的角度、距离、挡墙三者都和独立几何一致
   ③ par 等于独立 BFS 的最短步数（每关每档都验）④ 第一个守卫（下标 0）也必须能报警
   ⑤ 被发现 = 警报 -1 + 本关重播，石子/提示不归还 ⑥ 通关分数能按公式逐条推算 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  distracted: distracted, offPatrol: function (i) { return offPatrol(i); }, guardsRaw: function () { return guards; },
  refresh: function () { hud(); }, rescue: rescue, setGems: function (v) { gemsGot = v; }, frame: function () { draw(); }, seen: function () { return D().see; },
  st: function () { return { phase: phase, lv: lv, turn: turn, px: px, py: py, carry: carry, alarms: alarms,
    stones: stones, hints: hints, score: score, par: par, diff: diff, aim: aim, lastGain: lastGain, gems: gemsGot,
    guards: guards.map(function (g) { return { x: g.x, y: g.y, face: g.face, alert: g.alert, tx: g.tx, ty: g.ty }; }) }; },
  LEVELS: function () { return LEVELS; }, DIFFS: function () { return DIFFS; }, W: function () { return W; }, H: function () { return H; },
  solveSilent: function (i, see, mt) { return solveSilent(parseMap(LEVELS[i]), LEVELS[i], see, mt || 200); },
  schedules: function (i, n) { var o = LEVELS[i]; return schedules(parseMap(o), o, n); },
  seenSet: function (x, y, f, see) { return seenSet(md, x, y, f, see); },
  danger: function (i, t, see) { var o = LEVELS[i]; return dangerAt(parseMap(o), o, schedules(parseMap(o), o, t), see, t); },
  parseMap: parseMap, wall: function (x, y) { return wallOf(md, x, y); }, stoneLanding: function (x, y) { return stoneLanding(md, px, py, x, y, 7); },
  tryMove: tryMove, act: act, stats: stats, useHint: useHint, toggleAim: toggleAim, throwAt: throwAt, retry: retry,
  silentFrom: silentFrom, startLevel: startLevel, isSeen: function (x, y) { return isSeen(x, y); }, cells: function () { return md.gems; },
  setDiff: function (d) { diff = d; }, setScore: function (v) { score = v; }, setAlarms: function (v) { alarms = v; },
  setTurn: function (v) { turn = v; }, setStones: function (v) { stones = v; }, setHints: function (v) { hints = v; },
  setXY: function (x, y) { px = x; py = y; }, setCarry: function (v) { carry = v; },
  msg: function () { var el = byId('subline'); return el ? el.innerHTML : ''; },
  ov: function () { return ovContent.innerHTML; },
  ovShown: function () { return overlayEl._cls.indexOf('show') >= 0; },
  hud: function () { return { lv: elLv.textContent, turn: elTurn.textContent, alarm: elAlarm.textContent, carry: elCarry.textContent, steps: elSteps.textContent, score: elScore.textContent, stone: elStone.textContent, hint: elHint.textContent }; },
  toolOff: function () { return { stone: !!btnStone.disabled, hint: !!btnHint.disabled, wait: !!byId('btnWait').disabled }; },
  armed: function () { return btnStone._cls.indexOf('armed') >= 0; },
  diffActive: function () { return byId('diff').querySelectorAll('[data-diff]').filter(function (b) { return b._cls.indexOf('active') >= 0; }).map(function (b) { return b.dataset.diff; }).join(','); },
  rec: function () { return cv && cv._ctx ? cv._ctx.__rec : null; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('摸黑源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage) {
  const g = loadGame('mohei', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.2);
  return !!b;
}
const DIRKEY = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
// 只按键盘走：把一步解回放成真实输入
function walkPath(g, path) {
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx > 0) g.key('ArrowRight'); else if (dx < 0) g.key('ArrowLeft');
    else if (dy > 0) g.key('ArrowDown'); else if (dy < 0) g.key('ArrowUp');
    else g.key('.');
    if (st(g).phase !== 'play') return false;
  }
  return true;
}

/* ==================== 独立模型：不借用游戏里的任何函数 ==================== */
const parse = (lv) => {
  const grid = lv.map.map((row) => row.split('').map((c) => (c === '#' ? 1 : 0)));
  let s = null, e = null, h = null; const gems = [];
  lv.map.forEach((row, y) => row.split('').forEach((c, x) => {
    if (c === 'S') s = [x, y]; else if (c === 'E') e = [x, y]; else if (c === 'H') h = [x, y]; else if (c === '*') gems.push([x, y]);
  }));
  return { grid, s, e, h, gems, w: lv.map[0].length, hh: lv.map.length };
};
const wallAt = (md, x, y) => x < 0 || y < 0 || x >= md.w || y >= md.hh || md.grid[y][x] === 1;
// 独立巡逻表：位置自己走，朝向取「走进这一格的方向」，第 0 回合朝向第一个路径点
const DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function mySched(lv, upto) {
  const md = parse(lv);
  return lv.guards.map((gd) => {
    const pos = [];
    let x = gd.path[0][0], y = gd.path[0][1], wi = 1 % gd.path.length;
    for (let t = 0; t <= upto; t++) {
      pos.push([x, y]);
      if (t === upto) break;
      const tgt = gd.path[wi];
      const dx = tgt[0] - x, dy = tgt[1] - y;
      const order = Math.abs(dx) >= Math.abs(dy) ? [0, 1] : [1, 0];
      let moved = null;
      for (const axis of order) {
        const d = axis === 0 ? (dx > 0 ? 0 : dx < 0 ? 2 : -1) : (dy > 0 ? 1 : dy < 0 ? 3 : -1);
        if (d < 0) continue;
        if (!wallAt(md, x + DIRV[d][0], y + DIRV[d][1])) { moved = d; break; }
      }
      if (moved != null) { x += DIRV[moved][0]; y += DIRV[moved][1]; }
      if (x === tgt[0] && y === tgt[1]) wi = (wi + 1) % gd.path.length;
    }
    return pos.map((p, t) => {
      let d;
      if (t === 0) {
        const tgt = gd.path[1 % gd.path.length];
        d = tgt[0] > p[0] ? 0 : tgt[1] > p[1] ? 1 : tgt[0] < p[0] ? 2 : 3;
      } else {
        const q = pos[t - 1];
        d = p[0] > q[0] ? 0 : p[1] > q[1] ? 1 : p[0] < q[0] ? 2 : 3;
      }
      return { x: p[0], y: p[1], face: d };
    });
  });
}
function md2(lv) { return parse(lv); }
// 独立几何：夹角 + 距离 + 视线。视线用纯整数运算取每一步落在哪一格
const FOV = 0.785; // 与游戏同一常量：略小于 π/4，所以正对角线算「擦边没照到」
function shot(md, px, py, x, y) {
  const dx = x - px, dy = y - py, n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let t = 1; t < n; t++) {
    // floor(px + dx*t/n + 0.5)，全程整数，不碰浮点
    const cx = Math.floor((2 * px * n + 2 * dx * t + n) / (2 * n));
    const cy = Math.floor((2 * py * n + 2 * dy * t + n) / (2 * n));
    if (wallAt(md, cx, cy)) return false;
  }
  return true;
}
function mySeen(lv, x, y, face, see) {
  const md = parse(lv), out = {};
  const fa = [0, Math.PI / 2, Math.PI, -Math.PI / 2][face];
  out[x + ',' + y] = 1;
  for (let yy = 0; yy < md.hh; yy++) {
    for (let xx = 0; xx < md.w; xx++) {
      if (wallAt(md, xx, yy)) continue;
      const dx = xx - x, dy = yy - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5 || d > see) continue;
      let ang = Math.atan2(dy, dx) - fa;
      while (ang > Math.PI) ang -= 2 * Math.PI;
      while (ang < -Math.PI) ang += 2 * Math.PI;
      if (Math.abs(ang) > FOV) continue;
      if (shot(md, x, y, xx, yy)) out[xx + ',' + yy] = 1;
    }
  }
  return out;
}
// 独立无声 BFS：不扔石子，从起点到「背人踩出口」的最短回合数
function myBfs(lv, see, maxT) {
  maxT = maxT || 200;
  const md = md2(lv), sched = mySched(lv, maxT);
  const dan = [];
  for (let t = 0; t <= maxT; t++) {
    const set = {};
    sched.forEach((arr) => { const p = arr[t]; Object.assign(set, mySeen(lv, p.x, p.y, p.face, see)); });
    dan.push(set);
  }
  const q = [{ x: md.s[0], y: md.s[1], c: 0, t: 0 }];
  const seen = { [md.s[0] + ',' + md.s[1] + ',0,0']: 1 };
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    if (cur.t >= maxT) continue;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (wallAt(md, nx, ny)) continue;
      const nt = cur.t + 1;
      if (dan[nt][nx + ',' + ny]) continue;
      const nc = cur.c || (nx === md.h[0] && ny === md.h[1]) ? 1 : 0;
      if (nc && nx === md.e[0] && ny === md.e[1]) return nt;
      const key = nx + ',' + ny + ',' + nc + ',' + nt;
      if (seen[key]) continue;
      seen[key] = 1;
      q.push({ x: nx, y: ny, c: nc, t: nt });
    }
  }
  return null;
}

/* ==================== 开局面板 ==================== */
const g = boot();
chk(st(g).phase === 'intro', '刚进来站在门口看说明');
chk(D(g).ovShown(), '说明遮罩是展开的');
chk(D(g).diffActive() === 'dark', '默认难度是「摸黑」');
chk(D(g).W() === 14 && D(g).H() === 9, '地图是 14×9 的俯视格子');
chk(D(g).LEVELS().length === 8, '一共八关');
chk(/你走一步，守卫才走一步/.test(plain(D(g).ov())), '遮罩里第一句话就讲清回合制');
chk(/石子/.test(plain(D(g).ov())), '说明里教了石子怎么用');
chk(clickAct(g, 'start'), '遮罩上有「开始摸」');
g.key('Enter');
chk(st(g).phase === 'play' && st(g).lv === 0, '回车开局，站在第一关门口');
const a0 = st(g);
chk(a0.turn === 0 && a0.score === 0 && !a0.carry, '开局：零回合、零分、空着手');
chk(a0.alarms === 2 && a0.stones === 3 && a0.hints === 2, '摸黑档给 2 次警报 / 3 颗石子 / 2 次看路线');
chk(a0.par > 5 && a0.par < 90, '第一关的 par 步数是个合理数字');
chk(a0.guards.length === 1, '第一关只有一个守卫');
chk(D(g).hud().steps === '0/' + a0.par, 'HUD 写着「已走/表上最短」');
chk(g.draws() > 10, 'rAF 一直在重画');

/* ==================== 关卡数据合法性 ==================== */
const LV = D(g).LEVELS();
const DIFFS = D(g).DIFFS();
LV.forEach((lv, i) => {
  const md = parse(lv);
  const ok2 = lv.map.length === 9 && lv.map.every((r) => r.length === 14);
  chk(ok2, `第${i + 1}关地图是完整的 14×9`);
  chk(md.s && md.e && md.h, `第${i + 1}关门口/出口/人质三件套齐全`);
  chk(md.gems.length === 2, `第${i + 1}关埋了两颗 💎`);
  chk(lv.guards.length >= 1 && lv.guards.length <= 3, `第${i + 1}关守卫 1~3 个`);
  chk(lv.guards.every((gd) => gd.path.length === 2 && !wallAt(md, gd.path[0][0], gd.path[0][1]) && !wallAt(md, gd.path[1][0], gd.path[1][1])), `第${i + 1}关巡逻端点都不在墙里`);
  // 三档都得有解，而且视野越远越难走
  const pars = ['sneak', 'dark', 'ghost'].map((k) => {
    const s = D(g).solveSilent(i, DIFFS[k].see, 200);
    return s ? s.steps : null;
  });
  chk(pars.every((p) => p > 0), `第${i + 1}关三档都不用扔石子走得通（${pars.join('/')}）`);
  chk(pars[0] <= pars[1] && pars[1] <= pars[2], `第${i + 1}关视野越远越难走`);
  // 每颗 💎 至少存在某一回合是安全的，否则就是死物
  const fair = md.gems.every(([gx, gy]) => {
    for (let t = 0; t <= 60; t++) if (!D(g).danger(i, t, DIFFS.dark.see)[gx + ',' + gy]) return true;
    return false;
  });
  chk(fair, `第${i + 1}关的 💎 不是永远拿不到的摆设`);
});

/* ==================== 巡逻表 / 光锥：与独立模型逐格对拍 ==================== */
LV.forEach((lv, i) => {
  const A = D(g).schedules(i, 60), B = mySched(lv, 60);
  let same = true;
  const md = parse(lv);
  for (let t = 0; t <= 60; t++) A.forEach((arr, k) => {
    if (arr[t].x !== B[k][t].x || arr[t].y !== B[k][t].y || arr[t].face !== B[k][t].face) same = false;
    if (wallAt(md, arr[t].x, arr[t].y)) same = false;
  });
  chk(same, `第${i + 1}关的换岗表和独立推的巡逻逐回合一致，且从不穿墙`);
  const visits = A.map((arr) => {
    const p = new Set(arr.map((q) => q.x + ',' + q.y));
    return lv.guards.every((_, k) => true) && p.has(lv.guards[A.indexOf(arr)].path[0].join(',')) && p.has(lv.guards[A.indexOf(arr)].path[1].join(','));
  });
  chk(visits.every(Boolean), `第${i + 1}关每名守卫 60 回合内都会走到自己两个端点`);
});
LV.forEach((lv, i) => {
  D(g).startLevel(i);
  const md = parse(lv);
  let diff = 0;
  [4.6, 5.6, 6.6].forEach((see) => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 14; x++) {
      if (wallAt(md, x, y)) continue;
      for (let f = 0; f < 4; f++) {
        const P = D(g).seenSet(x, y, f, see), Q = mySeen(lv, x, y, f, see);
        new Set([...Object.keys(P), ...Object.keys(Q)]).forEach((k) => { if (!!P[k] !== !!Q[k]) diff++; });
      }
    }
  });
  chk(diff === 0, `第${i + 1}关的光锥（角度/距离/挡墙）和独立几何完全吻合`);
});

/* 光锥的四条性质（拿第一关行 6 那条直走廊验） */
D(g).startLevel(0);
const C = D(g).seenSet(3, 6, 0, 5.6);
chk(C['3,6'] === 1, '守卫脚下那一格永远算「照到」');
chk(C['4,6'] === 1 && C['6,6'] === 1, '正前方五格以内都照得到');
chk(!C['9,6'], '超出视野距离的格子照不到（(3,6) 往东第六格在锥外）');
chk(!C['2,6'], '背后的格子照不到');
chk(!C['3,5'], '正侧面（90°）在 45° 半角之外');
chk(D(g).seenSet(3, 6, 0, 5.6)['2,5'] === undefined, '正对角线刚好擦边：0.785 弧度略小于 45°，算没照到');
for (let fdx = 0; fdx < 4; fdx++) {
  const fwd = D(g).seenSet(3, 6, fdx, 5.6);
  const fx = 3 + [1, 0, -1, 0][fdx], fy = 6 + [0, 1, 0, -1][fdx];
  const bx = 3 - [1, 0, -1, 0][fdx], by = 6 - [0, 1, 0, -1][fdx];
  chk(fwd[fx + ',' + fy] === 1 && !fwd[bx + ',' + by], '朝' + ['东', '南', '西', '北'][fdx] + '：正前方一格亮、正后方一格暗');
}
chk(Object.keys(D(g).seenSet(1, 6, 0, 1.2)).length <= 3, '视野缩到 1.2 格就只剩身边那几格');
const blocked = D(g).seenSet(7, 1, 1, 5.6);
chk(blocked['7,2'] === 1, '从 (7,1) 朝南看得见眼前那格');
chk(blocked['7,4'] === undefined && blocked['7,5'] === undefined, '但 (7,3) 是墙：墙后面两格虽然在射程内也照样看不见');
chk(D(g).seenSet(7, 1, 0, 5.6)['9,1'] === 1, '同一格朝东看，走廊里三格外依然亮着');
chk(!D(g).danger(0, 0, 5.6)['7,1'], '开局那一格本身必须是安全的，否则这关没法玩');
chk(!!D(g).danger(0, 0, 5.6)['1,6'], '但守卫脚下当然在他的光里');

/* isSeen 必须返回布尔 —— 下标 0 是 falsy，曾经让第一个守卫变成瞎子 */
chk(D(g).isSeen(1, 6) === true, '踩到守卫脚下：isSeen 返回 true 而不是下标');
chk(D(g).isSeen(10, 1) === false, '远处摸黑：isSeen 返回 false');
function coneTrap(g2, lvIdx) {
  const s = st(g2), see = DIFFS[s.diff].see;
  const sch = D(g2).schedules(lvIdx, s.turn + 1);
  const cone = {};
  sch.forEach((arr) => Object.assign(cone, D(g2).seenSet(arr[s.turn + 1].x, arr[s.turn + 1].y, arr[s.turn + 1].face, see)));
  for (let y = 1; y < 8; y++) for (let x = 1; x < 13; x++) {
    if (D(g2).wall(x, y) || cone[x + ',' + y]) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], ny = y + [0, 1, 0, -1][d];
      if (!D(g2).wall(nx, ny) && cone[nx + ',' + ny]) return { x, y, nx, ny, d };
    }
  }
  return null;
}
{
  const t = coneTrap(g, 0);
  chk(!!t, '第一关总有「亮着的格子紧贴着暗格子」的位置');
  D(g).setXY(t.x, t.y);
  const before = st(g);
  D(g).tryMove(t.d);
  const after = st(g);
  chk(after.alarms === before.alarms - 1, '走进第一个守卫的光里 —— 警报确实响了（回归：下标 0 曾是 falsy）');
  chk(after.phase === 'caught', '响了警报就把你摁住，进入「被发现了」');
  chk(/被发现了/.test(plain(D(g).ov())), '遮罩写明被抓');
  chk(!!g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'retry'), '被抓后有「摸回去」按钮');
}

/* 被抓 = 本关重播 */
{
  D(g).setStones(1);
  D(g).setHints(1);
  D(g).setScore(500);
  D(g).retry();
  const s = st(g);
  chk(s.phase === 'play' && s.turn === 0, '摸回去：回合清零，换岗表从头重播');
  chk(s.px === 7 && s.py === 1 && !s.carry, '人退回门口，手里的人质也放下了');
  chk(s.alarms === 1 && s.score === 500, '警报次数扣掉了，分数一分不丢');
  chk(s.stones === 1 && s.hints === 1, '石子与提示不会因为「摸回去」而退还');
  chk(s.guards[0].x === 1 && s.guards[0].y === 6, '守卫也回到表上的第 0 回合');
  chk(!D(g).ovShown(), '遮罩收起来了');
}

/* 走子：键盘、方向键、等待、撞墙 */
{
  const b = boot();
  clickAct(b, 'start');
  const p0 = st(b);
  chk(p0.px === 7 && p0.py === 1, '第一关门口在 (7,1)');
  b.key('ArrowRight');
  chk(st(b).px === 8 && st(b).turn === 1, '→ 往东一格，回合 +1');
  b.key('d');
  chk(st(b).px === 9 && st(b).py === 1, 'WASD 的 d 也能走');
  b.key('ArrowUp');
  chk(st(b).py === 1 && st(b).px === 9, '往上撞墙：位置不变');
  b.key('.');
  chk(st(b).turn === 3, '原地等一回合也算一步（撞墙那次不算）');
  b.key('ArrowLeft');
  const back = st(b);
  chk(back.px === 8, '← 往西一格');
  chk(back.guards[0].x !== p0.guards[0].x, '你走一步守卫才走一步');
  b.key('Escape');
  chk(!D(b).ovShown() && st(b).phase === 'play', 'Esc 只是收起说明，局面还在');
  const cv = b.canvas();
  const before2 = st(b);
  cv.dispatch('pointerdown', { clientX: (before2.px + 0.5) / 14 * 460, clientY: (before2.py + 1.5) / 9 * 460, pointerId: 1 });
  chk(st(b).py === before2.py + 1 || st(b).phase !== 'play', '点相邻的格子也会走一步');
  const before3 = st(b);
  cv.dispatch('pointerdown', { clientX: 0.5 / 14 * 460, clientY: 0.5 / 9 * 460, pointerId: 1 });
  chk(st(b).px === before3.px && st(b).py === before3.py && st(b).turn === before3.turn, '点远处的格子只会被拒绝，一步都不走');
  chk(/一次只能走一格/.test(plain(D(b).msg())), '拒绝的时候话里说明了原因');
}

/* ==================== 石子：瞄准 / 落点 / 调虎离山 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  chk(st(b).stones === 3, '摸黑档开局三颗石子');
  chk(!D(b).armed(), '刚进来没在瞄准');
  b.key('q');
  chk(D(b).armed(), '按 Q 进入瞄准，格子上出现准星');
  chk(D(b).hud().carry === '瞄准中', 'HUD 提示正在瞄准');
  chk(D(b).stoneLanding(6, 1) === null, '正前方贴着墙：这颗石子扔不出去');
  chk(D(b).stoneLanding(7, 1) === null, '往自己脚下扔不算数');
  const landFar = D(b).stoneLanding(12, 1);
  chk(landFar && landFar[0] === 11 && landFar[1] === 1, '射程内遇到墙就落在墙前那一格');
  D(b).setXY(1, 6);
  const landRange = D(b).stoneLanding(11, 6);
  chk(landRange && landRange[0] === 8, '再远也只能扔七格');
  D(b).startLevel(0);
  b.key('q');
  D(b).throwAt(5, 4);
  const t1 = st(b);
  chk(t1.stones === 2 && !D(b).armed(), '扔出去：石子 -1，准星收起来');
  chk(t1.guards[0].alert === 2, '查探占三回合，扔石子这一格也算在内，还剩 2');
  chk(t1.guards[0].tx === 5 && t1.guards[0].ty === 4, '他的目标点就是落点');
  chk(/石子落在 <b>5,4<\/b>，1 名守卫/.test(D(b).msg()), '播报了落点和被引开的守卫数');
  chk(D(b).distracted(), '阵型被打乱');
  const hb = t1.hints;
  D(b).useHint();
  chk(st(b).hints === hb && /不作数/.test(plain(D(b).msg())), '乱阵时看路线被拒，而且不扣次数');
  D(b).setXY(10, 1);
  b.key('.');
  b.key('.');
  chk(st(b).phase === 'play', '躲在远处等，不会被逮住');
  chk(st(b).guards[0].alert === 0, '三回合之后他归岗了');
  chk(!D(b).distracted(), '归岗之后换岗表重新作数');
  D(b).setStones(0);
  D(b).refresh();
  chk(D(b).toolOff().stone === true, '石子用完，「扔石子」按钮变灰');
  D(b).setStones(2);
  D(b).refresh();
  chk(D(b).toolOff().stone === false, '还有石子时按钮又是活的');
  D(b).toggleAim();
  chk(D(b).armed(), '有石子才瞄得准');
}
/* 洗衣房：同一颗石子，一个叫得动、一个叫不动 */
{
  const b = boot();
  clickAct(b, 'start');
  D(b).startLevel(3);
  const s0 = st(b);
  chk(s0.px === 6 && s0.py === 1, '洗衣房门口在 (6,1)');
  chk(s0.guards.length === 2, '这一关两个守卫');
  const land = D(b).stoneLanding(4, 6);
  chk(land && land[0] === 4 && land[1] === 6, '沿射线一格一格试，能落到 (4,6)');
  D(b).throwAt(4, 6);
  const s1 = st(b);
  chk(/，2 名守卫/.test(plain(D(b).msg())), '两个都听见了（曼哈顿半径 8）');
  chk(D(b).offPatrol(1) && !D(b).offPatrol(0), '一个被叫离了岗位，另一个恰好还在表上');
  const sc = D(b).schedules(3, s1.turn)[0][s1.turn];
  chk(s1.guards[0].x === sc.x && s1.guards[0].y === sc.y, '没挪窝的那个按原表走');
  const sc1 = D(b).schedules(3, s1.turn)[1][s1.turn];
  chk(s1.guards[1].x + ',' + s1.guards[1].y !== sc1.x + ',' + sc1.y, '被叫走的那个已经不在表上的位置');
}

/* ==================== 看路线 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const md = parse(D(g).LEVELS()[0]);
  chk(D(b).silentFrom(st(b).px, st(b).py, 0, 0) !== null, '第 0 回合就能算出干净路线');
  b.key('h');
  chk(st(b).hints === 1, '看一次路线扣一次');
  chk(/还需要/.test(plain(D(b).msg())), '播报「还需要几步」');
  const sol = D(b).silentFrom(7, 1, 0, 0);
  chk(sol.steps === st(b).par, '提示用的是同一张表：从起点算 = par 步');
  chk(sol.path[0][0] === 7 && sol.path[0][1] === 1, '路线第一步就是脚下这格');
  chk(sol.path[sol.path.length - 1][0] === md.e[0] && sol.path[sol.path.length - 1][1] === md.e[1], '路线终点是 🚪');
  // 路线本身必须全程在暗处
  const dan = [];
  for (let t = 0; t <= 60; t++) dan.push(D(b).danger(0, t, 5.6));
  const clean = sol.path.every((p) => p[2] === 0 || !dan[p[2]][p[0] + ',' + p[1]]);
  chk(clean, '提示给出的每一步都落在当回合的暗格里');
  b.key('h');
  chk(st(b).hints === 0, '提示用完了');
  D(b).useHint();
  chk(st(b).hints === 0, '没有提示次数时按 H 不会变成负数');
  D(b).refresh();
  chk(D(b).toolOff().hint === true, '「看路线」按钮变灰');
}

/* ==================== 目标：💎 / 💛 / 🚪 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const md = parse(D(g).LEVELS()[0]);
  D(b).setCarry(false);
  D(b).setXY(md.e[0] - 1, md.e[1]);
  const s0 = st(b);
  D(b).tryMove(0);
  chk(st(b).phase !== 'clear', '没背到人质，踩到 🚪 也不算通关');
  D(b).setCarry(true);
  D(b).setXY(md.h[0], md.h[1]);
  chk(st(b).phase === 'play' || st(b).phase === 'caught', '站在 💛 上本身不会自动通关');
}

/* ==================== 分数公式 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  D(b).startLevel(0);
  const p = st(b).par;
  const gain = (turn, gems, alarms, stones) => {
    D(b).setTurn(turn); D(b).setGems(gems); D(b).setAlarms(alarms); D(b).setStones(stones);
    D(b).rescue();
    return st(b).lastGain;
  };
  const base = gain(p, 0, 2, 3);
  chk(base === Math.round((70 + 26 + 0 + 80 + 36) * 1), '基准分 = 底分 + 关卡 + 警报 + 剩下的石子');
  chk(gain(p, 2, 2, 3) === base + 90, '每颗 💎 值 45 分');
  chk(gain(p, 0, 2, 0) === base - 36, '石子没舍得用就少一点零头');
  chk(gain(p, 0, 1, 3) === base - 40, '少一次警报扣 40 分');
  chk(gain(p + 3, 0, 2, 3) === base - 21, '超出表上最短，一步扣 7 分');
  chk(gain(p + 400, 0, 0, 0) === 12, '再狼狈也有 12 分保底');
  D(b).setDiff('ghost');
  D(b).startLevel(0);
  const pg = st(b).par;
  chk(pg >= p + 4, '鬼影档同一关要绕得更远（' + p + ' → ' + pg + '）');
  chk(gain(pg, 0, 1, 2) === Math.round((70 + 26 + 40 + 24) * 1.8), '鬼影档 1.8 倍率');
  D(b).setDiff('dark');
}

/* ==================== 一局摸到底 ==================== */
const expectGain = (s) => {
  const d = DIFFS[s.diff];
  const over = Math.max(0, s.turn - s.par);
  return Math.max(12, Math.round((70 + 26 * (s.lv + 1) + s.gems * 45 + s.alarms * 40 + s.stones * 12 - over * 7) * d.mult));
};
{
  const b = boot();
  clickAct(b, 'start');
  let total = 0, cleared = 0, spins = 0;
  while (spins++ < 20 && st(b).phase === 'play') {
    const before = st(b), md = parse(LV[before.lv]);
    const sol = D(b).silentFrom(before.px, before.py, before.carry ? 1 : 0, before.turn);
    chk(!!sol, `第${before.lv + 1}关第 ${before.turn} 回合：不扔石子依然有路`);
    if (!sol) break;
    const snaps = [];
    for (let k = 1; k < sol.path.length; k++) {
      const pa = sol.path[k - 1], pb = sol.path[k];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (dx > 0) b.key('ArrowRight'); else if (dx < 0) b.key('ArrowLeft');
      else if (dy > 0) b.key('ArrowDown'); else if (dy < 0) b.key('ArrowUp');
      else b.key('.');
      snaps.push(st(b));
      if (st(b).phase !== 'play') break;
    }
    const after = st(b);
    const steppedOn = {};
    snaps.forEach((sp) => md.gems.forEach((q) => { if (sp.px === q[0] && sp.py === q[1]) steppedOn[q[0] + ',' + q[1]] = 1; }));
    chk(after.gems === Object.keys(steppedOn).length, `第${before.lv + 1}关的 💎 数 = 真的踩过的宝石格数`);
    chk(after.carry === snaps.some((sp) => sp.px === md.h[0] && sp.py === md.h[1]), `第${before.lv + 1}关：背人只在踩过 💛 之后成立`);
    if (after.phase !== 'clear') { chk(false, `第${before.lv + 1}关没能走出去`); break; }
    chk(after.turn === before.turn + sol.path.length - 1, `第${before.lv + 1}关步数和路线长度一致`);
    chk(after.turn === after.par, `第${before.lv + 1}关正好走完表上的 ${after.par} 步`);
    chk(after.lastGain === expectGain(after), `第${before.lv + 1}关得分 ${after.lastGain} 可按公式复算`);
    chk(after.score === total + after.lastGain, `第${before.lv + 1}关累计 ${after.score} 分`);
    total = after.score;
    cleared++;
    if (after.lv + 1 >= LV.length) break;
    clickAct(b, 'next');
  }
  chk(cleared === 8, '八关全部靠背表摸出去，一颗石子都没扔');
  chk(D(b).ovShown() && /出来了/.test(plain(D(b).ov())), '最后一关的通关遮罩');
  chk(!!b.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'again'), '打穿之后按钮变成再来一局');
  chk(b.storage._data['mh.best'] === String(total), `最高分 ${total} 落盘`);
  chk(b.storage._data['mh.save'] === '8', '累计救出 8 人');
  chk(b.storage._data['mh.lv'] === '7', '最远进度存到第八关');
  chk(b.storage._data['mh.diff'] === 'dark', '难度也记着');
  clickAct(b, 'again');
  chk(st(b).score === 0 && st(b).lv === 0 && st(b).alarms === 2, '再来一局：分数与关卡清零');
  chk(b.storage._data['mh.best'] === String(total), '重开不会抹掉最高分');
}

/* ==================== 难度 / 警报耗尽 / 存储 / 声音 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const db = b.byId('diff').querySelectorAll('[data-diff]');
  const pars = {};
  chk(db.length === 3, '三档难度');
  db.find((x) => x.dataset.diff === 'sneak').dispatch('click');
  chk(D(b).diffActive() === 'sneak', '点卡片就换档');
  chk(st(b).alarms === 3 && st(b).stones === 4 && st(b).hints === 3, '潜行档：3 次警报 4 颗石子 3 次提示');
  chk(st(b).phase === 'intro' && st(b).lv === 0 && st(b).turn === 0, '换档从第一关卡重来讲');
  pars.sneak = st(b).par;
  db.find((x) => x.dataset.diff === 'ghost').dispatch('click');
  chk(st(b).alarms === 1 && st(b).stones === 2 && st(b).hints === 1, '鬼影档：一次都不能错');
  chk(st(b).par >= pars.sneak, '同一关，视野更远只会更难走');
  chk(b.storage._data['mh.diff'] === 'ghost', '选过的难度存下来');
  clickAct(b, 'start');
  chk(st(b).diff === 'ghost' && st(b).alarms === 1, '重开一局还是鬼影档');
  const t = coneTrap(b, 0);
  D(b).setXY(t.x, t.y);
  D(b).tryMove(t.d);
  chk(st(b).phase === 'over', '鬼影档一次警报就用完，直接结束');
  chk(/灯全亮了/.test(plain(D(b).ov())), '遮罩写明白输了');
  chk(/救到第 1 关/.test(plain(D(b).ov())), '结算里说清摸到了第几关');
  chk(!b.storage._data['mh.best'], '零分不会污染最高分');
  chk(b.storage._data['mh.save'] === undefined, '没救出人就不给累计救出');
  clickAct(b, 'again');
  chk(st(b).phase === 'play' && st(b).lv === 0 && st(b).alarms === 1, '再来一局回到第一关');
  const sb = b.byId('btnSound');
  chk(sb.textContent === '🔊', '默认是开声的');
  sb.dispatch('click');
  chk(sb.textContent === '🔇' && b.storage._data['mh.muted'] === '1', '点一下静音，状态写进存储');
  b.key('m');
  chk(sb.textContent === '🔊' && b.storage._data['mh.muted'] === '0', '按 M 也能开关');
  const back = boot({ 'mh.muted': '1', 'mh.best': '999', 'mh.save': '5' });
  chk(back.byId('btnSound').textContent === '🔇', '下次进来记得我关过声音');
  clickAct(back, 'start');
  back.key('t');
  chk(/本机战绩/.test(plain(D(back).ov())) && /999/.test(plain(D(back).ov())), 'T 键看战绩，纪录是从存档里读的');
  chk(/已救 5 人/.test(plain(D(back).ov())), '累计救出也在战绩里');
  clickAct(back, 'resume');
  chk(st(back).phase === 'play', '战绩面板可以收回牌桌');
  back.byId('btnNew').dispatch('click');
  chk(st(back).phase === 'intro' && st(back).lv === 0, '↻ 重开一局回到说明');
}

/* ==================== 免费重播 / 杂项 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const al = st(b).alarms;
  b.key('ArrowRight');
  b.key('.');
  chk(st(b).turn === 2, '走了两步');
  b.key('r');
  chk(st(b).turn === 0 && st(b).alarms === al, 'R 键白送一次重播，不掉警报');
  chk(/重播换岗表/.test(plain(D(b).msg())), 'R 键有播报');
  D(b).setXY(7, 1);
  const before = st(b);
  D(b).tryMove(3);
  chk(st(b).px === before.px && st(b).turn === before.turn, '往墙里走不消耗回合');
  b.key('n');
  chk(st(b).phase === 'intro', 'N 键回到说明');
  b.key('Enter');
  chk(st(b).phase === 'play', '说明页回车继续');
  const html = require('fs').readFileSync(__dirname + '/../../mohei/game.js', 'utf8');
  chk((html.match(/'mh\.best'/g) || []).length >= 3 && /store\.set\('mh\.best'/.test(html), '最高分只认 mh.best 这一个字面量键');
  chk(/function num\(k\)/.test(html) && /var store = \{/.test(html), '存储读取走统一的 store/num 封装');
  chk(html.lastIndexOf('})();') === html.trimEnd().length - 5, 'game.js 仍然是单个 IIFE');
}

summary('摸黑', fails);
