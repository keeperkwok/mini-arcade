'use strict';
/* 分拣工厂：出图不变式 → 找路算法 → 一格一扳手的转动经济 → 包裹沿箭头走的四种结局
   重点核对：① 生成的图一定能让每个货架都到得了 ② planRoute 的代价 = 需要转的格数
   ③ 入库/送错/掉出/撞墙的分数与信誉 ④ 收工奖金、超时欠单、信誉清零判负都能推算 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__g = {' +
  ' st: () => ({ phase: phase, diff: diff, level: level, score: score, lives: lives, wrench: wrench, hints: hints,' +
  '   streak: streak, runSort: runSort, steps: steps, left: left, cur: cur, inlet: inlet, nextSpawn: nextSpawn,' +
  '   todo: queue.length + boxes.length }),' +
  ' board: () => ({ kind: kind.slice(), dir: dir.slice(), shel: shel.slice(), mark: mark.slice(), shelves: shelves.slice() }),' +
  ' pin: (o) => { var i; for (i = 0; i < N; i++) { if (o.kind) kind[i] = o.kind[i]; if (o.dir) dir[i] = o.dir[i]; if (o.shel) shel[i] = o.shel[i]; }' +
  '   if (o.inlet !== undefined) inlet = o.inlet; if (o.shelves) shelves = o.shelves.slice(); if (o.cur !== undefined) cur = o.cur; render(); hud(); },' +
  ' setBoxes: (a) => { seq = 0; boxes = a.map(function (o, k) { return { id: o.id || (k + 1), type: o.type, rush: !!o.rush, x: o.x, y: o.y, moves: o.moves || 0, bump: 0, done: false }; }); render(); },' +
  ' setQueue: (a) => { queue = a.map(function (o) { return { type: o.type, rush: !!o.rush }; }); render(); hud(); },' +
  ' setWrench: (v) => { wrench = v; hud(); }, setLives: (v) => { lives = v; hud(); }, setHints: (v) => { hints = v; hud(); },' +
  ' setStreak: (v) => { streak = v; }, setScore: (v) => { score = v; }, setLevel: (v) => { level = v; hud(); }, setLeft: (v) => { left = v; hud(); },' +
  ' boxes: () => boxes.map(function (b) { return { id: b.id, type: b.type, rush: b.rush, x: b.x, y: b.y, moves: b.moves, bump: b.bump, done: b.done }; }),' +
  ' queue: () => queue.map(function (o) { return { type: o.type, rush: o.rush }; }),' +
  ' rotate: rotate, hint: hint, showNext: showNext, front: frontBox, plan: planRoute, fixList: fixList, reachable: reachable,' +
  ' gen: (lv) => genBoard(lv), fallback: (lv) => fallbackBoard(lv), beltStep: beltStep, frame: frame,' +
  ' newRun: newRun, beginLevel: beginLevel, showStats: showStats, gameOver: gameOver, endLevel: endLevel, timeUp: timeout,' +
  ' TYPES: () => TYPES, DIFFS: () => DIFFS, ARROW: () => ARROW, DIM: () => [W, H, N], DX: () => DX, DY: () => DY,' +
  ' FL: () => [FLOOR, WALL, SHELF, CHUTE],' +
  ' spd: speed, spw: spawnEvery, boxesFor: boxesFor, typeCnt: typeCount, wallCnt: wallCount, chuteCnt: chuteCount, limSec: limitSec,' +
  ' kindOf: (i) => kind[i], dirOf: (i) => dir[i], idx: (x, y) => idx(x, y), xy: (i) => [cx(i), cy(i)],' +
  ' msg: () => msgEl.innerHTML, ov: () => ovContent.innerHTML,' +
  ' cells: () => beltEl.querySelectorAll(".fj-c").map((c) => ({ i: Number(c.dataset.i), cls: c.className, text: String(c.textContent) })),' +
  ' hud: () => ({ lv: elLv.textContent, todo: elTodo.textContent, score: elScore.textContent, wr: elWr.textContent,' +
  '   lives: elLives.textContent, clock: elClock.textContent, hn: byId("hintN").textContent }),' +
  ' qchips: () => queueEl.querySelectorAll(".q").map((c) => ({ text: String(c.textContent), rush: c.className.indexOf("rj") >= 0 })),' +
  ' btns: () => ({ hint: byId("btnHint").disabled }), ovShown: () => overlayEl._cls.indexOf("show") >= 0,' +
  ' diffActive: () => byId("diff").querySelectorAll("button").filter((b) => b._cls.indexOf("active") >= 0).map((b) => b.dataset.diff).join(","),' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('分拣工厂源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage) {
  const g = loadGame('fenjian', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  return g;
}
// 只点遮罩里那个按钮：g.act() 会把整页所有 click 处理器都点一遍（连静音按钮一起点）
const clickAct = (g, name) => {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.2);
  return g;
};
const start = (g) => clickAct(g, 'start');
const P = (g, sec) => g.pump(sec || 0.04, 40);
let W = 9, H = 6, N = 54;
const ID = (x, y) => y * W + x;
const IN = (v, a) => a.indexOf(v) >= 0;

// 用一张 ASCII 图钉死局面：.=地板 #=货架腿 1-4=四种货架 x=碎包机 i=入口
// 字母 e/s/w/n 表示那格地板的箭头朝向；opts.row = [[第几行, 朝向], ...] 整行铺箭头
function map(rows, opts) {
  const kind = new Array(N).fill(0), shel = new Array(N).fill(-1), dir = new Array(N).fill(0);
  const shelves = [];
  const DIRS = { e: 0, s: 1, w: 2, n: 3 };
  let inlet = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const i = ID(x, y), ch = row[x] || '.';
      if (ch === '#') kind[i] = 1;
      else if (ch === 'x') kind[i] = 3;
      else if (/[1-4]/.test(ch)) { kind[i] = 2; shel[i] = Number(ch) - 1; shelves.push(i); }
      if (ch === 'i') inlet = i;
      if (DIRS[ch] !== undefined) dir[i] = DIRS[ch];
    }
  });
  const o = { kind, shel, dir, inlet, shelves };
  ((opts && opts.row) || []).forEach(([y, d]) => {
    for (let x = 0; x < W; x++) if (kind[ID(x, y)] === 0) dir[ID(x, y)] = d;
  });
  ((opts && opts.cell) || []).forEach(([x, y, d]) => { dir[ID(x, y)] = d; });
  if (opts && opts.inlet !== undefined) o.inlet = opts.inlet;
  return o;
}

/* ==================== 一、工厂数据与关卡曲线 ==================== */
const g0 = start(boot());
const G = D(g0);
const TY = G.TYPES(), DF = G.DIFFS();
const [FLOOR, WALL, SHELF, CHUTE] = G.FL();
const [DX, DY] = [G.DX(), G.DY()];
chk(G.DIM().join(',') === '9,6,54', '车间是 9×6 = 54 格，正好一屏');
chk(TY.length === 4 && TY.every((t) => t.name && t.box && t.into && /[\uD800-\uDBFF]/.test(t.box)),
  '四种货：名字、包裹图案、货架名一个不缺');
chk(new Set(TY.map((t) => t.box)).size === 4 && new Set(TY.map((t) => t.into)).size === 4, '四种货图案与货架都不重样');
chk(G.ARROW().join('') === '→↓←↑' && DX.join(',') === '1,0,-1,0' && DY.join(',') === '0,1,0,-1',
  '四个方向与箭头一一对应（0 东 1 南 2 西 3 北）');
['calm', 'daily', 'promo'].forEach((k) => {
  const d = DF[k];
  chk(d.wrench > 0 && d.regen > 0 && d.lives > 0 && d.hints >= 0 && d.base > 0 && d.types >= 3 && d.types <= 4,
    d.label + ' 参数齐全：' + d.wrench + ' 扳手 / ' + d.regen + ' 秒补一把 / ' + d.lives + ' 信誉');
});
chk(DF.calm.wrench > DF.daily.wrench && DF.daily.wrench > DF.promo.wrench, '扳手依次收紧：' + [DF.calm.wrench, DF.daily.wrench, DF.promo.wrench]);
chk(DF.calm.lives > DF.daily.lives && DF.daily.lives > DF.promo.lives, '信誉依次收紧：' + [DF.calm.lives, DF.daily.lives, DF.promo.lives]);
chk(DF.calm.speed > DF.daily.speed && DF.daily.speed > DF.promo.speed && DF.promo.speed > 220, '传送带越忙越快：' + [DF.calm.speed, DF.daily.speed, DF.promo.speed] + ' 毫秒一格');
chk(DF.calm.mult < 1 && DF.promo.mult > 1 && DF.calm.rush === false && DF.promo.rush === true,
  '闲时 0.8 倍不催命，大促 1.7 倍还上加大件');
const curve = [1, 3, 5, 8, 12, 20, 40].map((lv) => lv + '班' + G.wallCnt(lv) + '腿');
chk(G.wallCnt(2) > G.wallCnt(1) && G.wallCnt(40) === 10, '货架腿随班次增多但有上限：' + curve.join(' '));
chk(G.boxesFor(2) === G.boxesFor(1) + 1 && G.boxesFor(99) === 26, '每班多一件，封顶 26 件：' + [1, 2, 99].map((l) => G.boxesFor(l)).join('/'));
chk(G.typeCnt(1) === 4 && G.typeCnt(9) === 4, '白班第 1 班就四种货全开（封顶四种）');
let mono = true, shortest = 999;
for (let lv = 2; lv < 40; lv++) if (G.spd(lv) > G.spd(lv - 1)) mono = false;
for (let lv = 1; lv < 40; lv++) shortest = Math.min(shortest, G.limSec(lv));
chk(mono && G.spd(30) === 220 && G.spd(1) === 520, '带速只增快不倒退，封底 220ms：' + [1, 10, 21, 30].map((l) => G.spd(l)).join('/'));
chk(G.limSec(3) > G.limSec(1) && shortest >= 18, '时限跟着单量与带速走，再忙也留 ' + shortest + ' 秒收尾（1 班 ' + G.limSec(1) + 's / 3 班 ' + G.limSec(3) + 's）');

/* ==================== 二、出图不变式 ==================== */
const gb = start(boot());
const bad = [];
for (let lv = 1; lv <= 14; lv++) {
  for (let rep = 0; rep < 14; rep++) {
    if (!D(gb).gen(lv)) { bad.push('第 ' + lv + ' 班 300 次都没凑出合法图'); continue; }
    const b = D(gb).board(), inl = D(gb).st().inlet, iy = (inl / W) | 0, ix = inl % W;
    for (let i = 0; i < N; i++) if (!IN(b.kind[i], [0, 1, 2, 3])) bad.push('未知格子类型 ' + b.kind[i]);
    if (b.kind[inl] !== 0) bad.push('入口那格不是地板');
    if (ix !== 0 || iy === 0 || iy === H - 1) bad.push('入口必须在最左列且不贴上下班界');
    if (b.dir[inl] !== 0) bad.push('入口那格默认没朝右');
    const want = G.typeCnt(lv);
    if (b.shelves.length !== want) bad.push('货架数 ' + b.shelves.length + ' ≠ ' + want);
    const ts = b.shelves.map((s) => b.shel[s]).join(',');
    if (ts !== b.shelves.map((s, k) => k).join(',')) bad.push('货架类型不连续：' + ts);
    b.shelves.forEach((s) => { if ((s % W) !== W - 1 && ((s / W) | 0) !== H - 1) bad.push('货架被放在了车间中间'); });
    for (let a = 0; a < b.shelves.length; a++) {
      for (let c = a + 1; c < b.shelves.length; c++) {
        const A = b.shelves[a], B = b.shelves[c];
        if (Math.abs((A % W) - (B % W)) + Math.abs(((A / W) | 0) - ((B / W) | 0)) <= 1) bad.push('两座货架贴在一起');
      }
    }
    const walls = b.kind.filter((k) => k === 1).length, chutes = b.kind.filter((k) => k === 3).length;
    if (walls !== G.wallCnt(lv)) bad.push('腿数 ' + walls + ' ≠ ' + G.wallCnt(lv));
    if (chutes !== G.chuteCnt(lv)) bad.push('碎包机 ' + chutes + ' ≠ ' + G.chuteCnt(lv));
    b.kind.forEach((k, i) => {
      if (k === 3 && (i % W) < 3) bad.push('碎包机离入口太近');
      if ((k === 1 || k === 3) && (i % W) === 0) bad.push('最左列被堵住了');
    });
    if (!D(gb).reachable()) bad.push('有货架到不了或有地板成了孤岛');
    if (b.dir.some((v) => !(v >= 0 && v <= 3))) bad.push('方向值越界');
  }
}
chk(bad.length === 0, '14 个班次 × 14 次随机出图：货架都在边上且互不贴、腿数与碎包机刚好、地板全连通、入口不贴角还朝右' +
  (bad.length ? ' —— 问题：' + [...new Set(bad)].slice(0, 4).join(' | ') : ''));
let chutesByLv = [1, 3, 8, 20, 40].map((l) => l + '班' + G.chuteCnt(l) + '台');
chk(G.chuteCnt(1) === 1 && G.chuteCnt(40) === 3, '碎包机 1 → 3 台封顶：' + chutesByLv.join(' '));

/* ==================== 三、找路：代价 = 要转的格数 ==================== */
const pbad = [];
let psample = 0, pcost = 0, psteps = 0, pmax = 0;
for (let t = 0; t < 70; t++) {
  const lv = 1 + (t % 14);
  D(gb).gen(lv);
  const b = D(gb).board(), floors = [];
  for (let i = 0; i < N; i++) if (b.kind[i] === 0) floors.push(i);
  const from = floors[(Math.random() * floors.length) | 0];
  const ty = (Math.random() * 4) | 0;
  D(gb).setBoxes([{ type: ty, x: from % W, y: (from / W) | 0 }]);
  const box = D(gb).boxes()[0];
  const r = D(gb).plan(box);
  psample++;
  if (!r) { pbad.push('明明连通却找不到路：' + from + ' → 货架 ' + ty); continue; }
  if (r.cells[0] !== from) pbad.push('路线不是从包裹脚下开始的');
  const last = r.cells[r.cells.length - 1];
  if (b.kind[last] !== 2 || b.shel[last] !== ty) pbad.push('路线终点不是它该去的那座货架');
  if (r.cost !== D(gb).fixList(r).length) pbad.push('代价与要转的格数不一致：' + r.cost + ' vs ' + D(gb).fixList(r).length);
  if (r.cost > r.cells.length - 1) pbad.push('代价超过步数');
  pmax = Math.max(pmax, r.cost);
  pcost += r.cost; psteps += r.cells.length - 1;
  for (let i = 1; i < r.cells.length; i++) {
    const A = r.cells[i - 1], B = r.cells[i];
    const dx = (B % W) - (A % W), dy = ((B / W) | 0) - ((A / W) | 0);
    const dr = r.dirs[i];
    if (G.DX()[dr] !== dx || G.DY()[dr] !== dy) pbad.push('方向与实际走的一步不符：' + dr + ' 走了 ' + dx + ',' + dy);
    if (Math.abs(dx) + Math.abs(dy) !== 1) pbad.push('路线出现瞬移');
    if (i < r.cells.length - 1 && b.kind[B] !== 0) pbad.push('中途踩进了墙/货架/碎包机');
  }
  // 照着 fixList 转一遍，路线就该分文不花
  D(gb).fixList(r).forEach((f) => D(gb).pin({ dir: (() => { const d2 = D(gb).board().dir; d2[f.cell] = f.to; return d2; })() }));
  const r2 = D(gb).plan(D(gb).boxes()[0]);
  if (!r2 || r2.cost !== 0) pbad.push('转完之后还得再转（cost ' + (r2 && r2.cost) + '）');
}
chk(pbad.length === 0, psample + ' 次随机取样：路线每步都是四邻接、不穿墙不穿碎包机、终点正是该去的货架、代价就是扳手数' +
  (pbad.length ? ' —— 问题：' + [...new Set(pbad)].slice(0, 4).join(' | ') : ''));
chk(pmax >= 3 && pcost > 0 && pcost < psteps,
  psample + ' 次取样共 ' + psteps + ' 步、平均一趟要转 ' + (pcost / psample).toFixed(1) + ' 把（最狠一趟 ' + pmax + ' 把）—— 顺流的格子多，但绝不会有哪趟白送');

/* ==================== 四、开局与界面 ==================== */
const gi = boot();
chk(st(gi).phase === 'intro' && D(gi).ovShown(), '开机先开班前说明');
chk(/改不了路/.test(D(gi).ov()) && /一把扳手一次/.test(D(gi).ov()) && /信誉/.test(D(gi).ov()),
  '说明页把「只改方向 + 一格一扳手 + 信誉清零」讲完');
chk(D(gi).diffActive() === 'daily', '默认上白班');
const gs = start(boot());
const S1 = st(gs);
chk(S1.phase === 'play' && S1.wrench === 9 && S1.lives === 4 && S1.hints === 3, '白班：9 扳手 4 信誉 3 支画线笔');
chk(S1.todo === G.boxesFor(1) && Math.abs(S1.left - G.limSec(1)) < 0.5, '第 1 班 ' + S1.todo + ' 件货 / 时限 ' + S1.left.toFixed(0) + ' 秒');
chk(S1.steps === 0 && st(gs).nextSpawn === 1, '刚开班：一格还没走');
chk(D(gs).qchips().length === Math.min(12, S1.todo), '队列条显示待上线的 ' + D(gs).qchips().length + ' 件');
chk(D(gs).cells().length === N, '屏幕上是整张 54 格车间');
const cIn = D(gs).cells()[st(gs).inlet];
chk(/inl/.test(cIn.cls) && /→/.test(cIn.text), '入口那格标出来了且箭头朝右');
chk(D(gs).cells().filter((c) => /sf[0-3]/.test(c.cls)).length === 4, '看得见四座货架');
chk(D(gs).hud().wr === '9' && D(gs).hud().lives === '4' && D(gs).hud().hn === '3', 'HUD 与局面数字一致');
chk(D(gs).board().shelves.length === 4, '四座货架确实各管一种货');

/* ==================== 五、一格一扳手 ==================== */
const M5 = map(['.........', '..2......', 'i........', '.........', '.....1...', 'x........']);
const g5 = start(boot());
D(g5).pin(M5);
D(g5).setQueue([]);
const i5 = ID(3, 3);
chk(D(g5).dirOf(i5) === 0, '这一格初始朝东');
D(g5).rotate(i5, 1);
chk(D(g5).dirOf(i5) === 1 && st(g5).wrench === 8, '顺转 90° 花一把扳手（→ 变 ↓）');
D(g5).rotate(i5, 1); D(g5).rotate(i5, 1);
chk(D(g5).dirOf(i5) === 3 && st(g5).wrench === 6, '连转两下朝北，三把扳手说没就没');
D(g5).rotate(i5, -1);
chk(D(g5).dirOf(i5) === 2 && st(g5).wrench === 5, '逆转回来到 ←');
D(g5).rotate(ID(2, 1), 1);
chk(D(g5).kindOf(ID(2, 1)) === 2 && /转不动/.test(D(g5).msg()) && st(g5).wrench === 5, '货架转不动也不扣扳手');
D(g5).rotate(ID(0, 5), 1);
chk(/转不动/.test(D(g5).msg()) && st(g5).wrench === 5, '碎包机也转不动');
D(g5).setWrench(0);
D(g5).rotate(i5, 1);
chk(st(g5).wrench === 0 && D(g5).dirOf(i5) === 2 && /扳手用完了/.test(D(g5).msg()), '没扳手就一格也别想动');

// 压舱件：永远撞在货架腿上，替测试挡住「清空即收工」
const PARK = { type: 3, x: 0, y: 2 };
const LANE = ['.........', '..2......', 'i#.......', '.........', '.....1...', '.........'];
function scene(g, rows, extra, opts) {
  const m = map(rows, opts);
  D(g).pin(m);
  D(g).setQueue([]);
  D(g).setBoxes((opts && opts.park === false ? [] : [PARK]).concat(extra || []));
  D(g).setStreak(0);
  return m;
}

/* ==================== 六、包裹的四种结局 ==================== */
const g6 = start(boot());
scene(g6, LANE, [{ type: 0, x: 2, y: 4 }]);
D(g6).setLives(3);
D(g6).beltStep(); D(g6).beltStep();
chk(st(g6).score === 0 && D(g6).boxes()[1].x === 4, '两步走到 (4,4)，还没进架');
D(g6).beltStep();
chk(st(g6).score === 68 && st(g6).streak === 1 && st(g6).runSort === 1 && st(g6).lives === 3,
  '第三步撞进冷藏柜：入库 +68 分（60 + 8×1 班），信誉不动');
chk(/冷藏柜/.test(D(g6).msg()) && /走了 3 格/.test(D(g6).msg()), '结算说清送去了哪儿：' + plain(D(g6).msg()).slice(0, 26) + '…');
chk(g6.storage.getItem('fj.sort') === '1' && g6.storage.getItem('fj.best') === '68', '入库件数与最高分当场落盘');
D(g6).setBoxes([PARK, { type: 0, x: 4, y: 4 }]);
D(g6).setStreak(1);
D(g6).beltStep();
chk(st(g6).score === 68 + 82 && st(g6).streak === 2, '连送第二件吃 ×1.2：68 + round(68×1.2) = 150');
chk(/连送 ×1\.2/.test(D(g6).msg()), '结算语标出连送倍率');
D(g6).setScore(0);
scene(g6, LANE, [{ type: 1, x: 2, y: 4 }]);
D(g6).setLives(3);
for (let k = 0; k < 3; k++) D(g6).beltStep();
chk(st(g6).lives === 2 && st(g6).score === 0 && st(g6).streak === 0, '易碎件塞进冷藏柜 = 送错架：信誉 -1、连送清零、一分钱不给');
chk(/送错架：易碎 塞进了 冷藏柜/.test(D(g6).msg()), '还把毛病说清楚：' + plain(D(g6).msg()));
D(g6).setScore(0);
scene(g6, LANE, [{ type: 0, x: 2, y: 0 }]);
D(g6).setLives(3);
for (let k = 0; k < 6; k++) D(g6).beltStep();
chk(st(g6).score === 0 && st(g6).lives === 3 && D(g6).boxes()[1].x === 8, '顺着最上一行跑到边 (8,0) 还不算丢');
const q6 = D(g6).queue().length;
D(g6).beltStep();
chk(st(g6).lives === 3 && st(g6).streak === 0 && D(g6).queue().length === q6 + 1 && /重新排队/.test(D(g6).msg()),
  '掉出车间不扣信誉，只是回炉重排：' + plain(D(g6).msg()).slice(0, 30) + '…');
chk(D(g6).boxes().length === 1 && D(g6).queue().length === 1, '它从传送带上消失了，只在队列里等着再上一次');
scene(g6, ['.........', '.........', 'i#.......', '....x....', '.........', '.........'], [{ type: 0, x: 2, y: 3 }]);
D(g6).setLives(3);
for (let k = 0; k < 3; k++) D(g6).beltStep();
chk(st(g6).lives === 2 && /碎包机/.test(D(g6).msg()), '箭头指到碎包机，货就直接没了');
scene(g6, LANE, [{ type: 0, x: 0, y: 2 }]);
D(g6).setLives(3);
for (let k = 0; k < 5; k++) D(g6).beltStep();
chk(D(g6).boxes().length === 2 && st(g6).lives === 3 && st(g6).score === 0,
  '撞在货架腿上就原地等：不扣分也不消失，等你转开那一格');
chk(D(g6).boxes().every((b) => b.bump >= 5), '撞墙次数被记着（两件各 ' + D(g6).boxes()[0].bump + ' 次）');
D(g6).rotate(ID(1, 2), 1);
D(g6).setWrench(9);
chk(D(g6).kindOf(ID(1, 2)) === 1 && /转不动/.test(D(g6).msg()) && st(g6).wrench === 9, '想转货架腿？转不动也不扣扳手');
D(g6).setScore(0);
scene(g6, ['.........', '.........', 'i#.......', '.........', '.........', '.......1.'], [{ type: 0, x: 6, y: 5 }]);
D(g6).setLives(3);
D(g6).beltStep();
chk(st(g6).score === 68 && D(g6).boxes().length === 1 && st(g6).lives === 3, '进架发生在「走上去」那一步，之后包裹就从线上消失了');

/* ==================== 七、上线节奏与加急件 ==================== */
const g7 = start(boot());
scene(g7, LANE, []);
for (let k = 0; k < 9; k++) D(g7).beltStep();
chk(st(g7).steps === 9 && D(g7).queue().length === 0, '队列空的时候一格也不上（走了 9 步，线上还是 1 件压舱货）');
D(g7).setQueue([{ type: 0 }, { type: 1 }, { type: 2 }, { type: 3 }]);
D(g7).setBoxes([PARK]);
D(g7).beltStep();
chk(D(g7).queue().length === 3 && D(g7).boxes().length === 2, '第 10 步立刻上第一件，下一件排到第 ' + (10 + G.spw(1)) + ' 步');
for (let k = 0; k < 8; k++) D(g7).beltStep();
chk(D(g7).queue().length === 2 && D(g7).boxes().length === 3, '隔 ' + G.spw(1) + ' 步准点再上一件（白班第 1 班节奏）');
const g7b = start(boot({ 'fj.diff': 'promo' }));
const G7 = D(g7b);
chk(st(g7b).wrench === 7 && st(g7b).lives === 3 && st(g7b).hints === 1, '大促：7 扳手 3 信誉 1 支画线笔');
chk(st(g7b).diff === 'promo' && G7.spd(1) === 380 && G7.spw(1) === 4, '大促带速 380ms 一格、每 4 步上一件');
const q7 = G7.queue();
chk(q7.length === G7.boxesFor(1) && q7.filter((o) => o.rush).length === 3,
  '大促第 1 班 ' + q7.length + ' 件里 3 件加急（每三件一张加急单）');
chk(q7.map((o) => (o.rush ? 1 : 0)).join('') === '001001001', '加急单位置固定：' + q7.map((o) => (o.rush ? '急' : '普')).join(''));
scene(g7b, LANE, [{ type: 0, x: 2, y: 4, rush: true }]);
G7.setLives(3); G7.setScore(0);
G7.beltStep();
chk(G7.boxes()[1].x === 4 && G7.st().score === 0, '加急件一步跨两格：(2,4) → (4,4)');
G7.beltStep();
chk(G7.st().score === 167 && G7.st().runSort === 1, '进架那一步不再多跳：round((90 + 8) × 1.7) = 167');
chk(/加急件/.test(G7.msg()), '结算里点明这是加急件');
scene(g7b, LANE, [{ type: 0, x: 2, y: 4 }]);
G7.setLives(3); G7.setScore(0);
G7.beltStep();
chk(G7.boxes()[1].x === 3, '普通件一步一格');

/* ==================== 八、收工、升关与工具车 ==================== */
const g8 = start(boot());
scene(g8, LANE, [{ type: 0, x: 4, y: 4 }], { park: false });
D(g8).setLives(3); D(g8).setWrench(3); D(g8).setScore(0);
D(g8).beltStep();
chk(st(g8).phase === 'rest' && st(g8).level === 2 && D(g8).st().runSort === 1,
  '最后一件入库 → 本班收工：货单清空的那一刻进结算（phase 变 rest、班号 +1）');
chk(st(g8).score === 68 + 99, '收工奖金可推算：50 + 25×1 班 + 8×结余 3 把 = 99，总分 ' + st(g8).score);
chk(/收工/.test(D(g8).msg()) && /结余 3 把扳手/.test(D(g8).msg()) && /奖金 \+99 分/.test(D(g8).msg()), '结算语：' + plain(D(g8).msg()));
chk(g8.storage.getItem('fj.best') === '167' && g8.storage.getItem('fj.level') === '2', '最高分与最远班号落盘');
D(g8).setLives(1);
P(g8, 1.7);
chk(st(g8).phase === 'play' && st(g8).level === 2, '歇 1.6 秒自动开下一班');
chk(st(g8).wrench === G.DIFFS().daily.wrench && st(g8).todo === G.boxesFor(2), '新的一班重新发满扳手：' + st(g8).todo + ' 件货');
chk(Math.abs(st(g8).left - G.limSec(2)) < 0.5, '时限按第 2 班重算：' + st(g8).left.toFixed(0) + ' 秒');
chk(st(g8).lives === 1, '信誉跨班不清零 —— 攒着的那点底裤还在');
chk(st(g8).streak === 1, '连送倍率跨班不断线：现在 ' + st(g8).streak + ' 连，下一件吃 ×1.2');
const g8b = start(boot());
scene(g8b, LANE, [{ type: 0, x: 0, y: 2 }]);
D(g8b).setQueue([]); D(g8b).setLives(6); D(g8b).setLeft(30); D(g8b).setWrench(0);
P(g8b, G.DIFFS().daily.regen + 0.1);
chk(st(g8b).wrench === 1 && st(g8b).lives === 6, '工具车每 ' + G.DIFFS().daily.regen + ' 秒补一把：' + (G.DIFFS().daily.regen + 0.1) + ' 秒后 0 → 1 把');
P(g8b, 30);
chk(st(g8b).wrench === G.DIFFS().daily.wrench, '补到 ' + G.DIFFS().daily.wrench + ' 把封顶，溢出作废');
chk(st(g8b).left > 0, '还在班上（剩 ' + st(g8b).left.toFixed(0) + ' 秒），线上货一件没丢');
const g8c = start(boot());
scene(g8c, LANE, [{ type: 0, x: 0, y: 2 }], { park: false });
D(g8c).setQueue([{ type: 0 }, { type: 1 }]);
D(g8c).setLives(6); D(g8c).setLeft(0.05);
P(g8c, 0.1);
chk(st(g8c).lives === 3 && st(g8c).phase === 'rest', '时限到：压着 3 单（2 单没上线 + 线上 1 件）就欠 3 单信誉');
chk(/时限到了，3 单没送完/.test(D(g8c).msg()), '欠单要说数：' + plain(D(g8c).msg()));
chk(st(g8c).todo === 0, '超时后压的货全部清走');
P(g8c, 2.1);
chk(st(g8c).phase === 'play' && st(g8c).level === 2, '欠单没扣死就接着上第二班');
scene(g8c, LANE, [{ type: 0, x: 0, y: 2 }], { park: false });
D(g8c).setQueue([]);
D(g8c).setLives(1); D(g8c).setLeft(0.05);
P(g8c, 0.1);
chk(st(g8c).phase === 'over' && /时限到，还压着 1 单/.test(D(g8c).ov()), '只剩 1 点信誉时，一单欠不出货就停工');

/* ==================== 九、信誉清零 ==================== */
const g9 = start(boot());
scene(g9, LANE, [{ type: 1, x: 4, y: 4 }], { park: false });
D(g9).setLives(1); D(g9).setScore(120);
D(g9).beltStep();
chk(st(g9).lives === 0 && st(g9).phase === 'over', '最后一点信誉上也压着一件送错的货 —— 破产停工');
chk(D(g9).ovShown() && /送错架/.test(D(g9).ov()) && /信誉清零/.test(D(g9).ov()), '停工页写清是怎么没的：' + plain(D(g9).ov()).slice(0, 30) + '…');
chk(/120/.test(D(g9).ov()) && /上到第 1 班/.test(D(g9).ov()) && /本班送出 0 件/.test(D(g9).ov()), '停工页给出分数、班号与本局入库件数');
chk(g9.storage.getItem('fj.best') === '120' && g9.storage.getItem('fj.level') === '1', '分数与班号留档');
chk(D(g9).btns().hint === true, '停工后画线笔按钮禁用');
P(g9, 2.6);
chk(st(g9).phase === 'over' && st(g9).level === 1, '停工了就不会自动开班');
clickAct(g9, 'again');
chk(st(g9).phase === 'play' && st(g9).level === 1 && st(g9).lives === G.DIFFS().daily.lives && st(g9).score === 0, '「再来一班」从头开始');
scene(g9, LANE, [{ type: 1, x: 4, y: 4 }], { park: false });
D(g9).setLives(1);
D(g9).beltStep();
chk(st(g9).phase === 'over' && g9.storage.getItem('fj.best') === '120', '第二局 0 分也不覆盖旧的更高分');
clickAct(g9, 'stats');
chk(/本机战绩/.test(D(g9).ov()) && /120/.test(D(g9).ov()), '停工页的「看战绩」也接得上');

/* ==================== 十、画路线与下一件 ==================== */
const gh = start(boot());
scene(gh, LANE, [{ type: 0, x: 0, y: 2 }], { park: false });
D(gh).setHints(3); D(gh).setWrench(7); D(gh).setLives(3); D(gh).setScore(0);
const hb = D(gh).board(), hbox = D(gh).boxes()[0];
const hr = D(gh).plan(hbox);
chk(hr && hr.cost === 2, '整行朝东、只有两处要转弯：从入口到冷藏柜要转 2 下（' + (hr && hr.cost) + '）');
D(gh).hint();
chk(st(gh).hints === 2 && /照虚线补 2 下扳手/.test(D(gh).msg()), '画一次路线吃掉一支画线笔：' + plain(D(gh).msg()));
const marked = D(gh).board().mark.filter((v) => v === 1).length;
chk(marked === hr.cells.length, '虚线沿路标出 ' + marked + ' 格（含终点货架）');
chk(D(gh).cells().filter((c) => /\bpl\b/.test(c.cls)).length === marked, '屏幕上确实有这么多格亮起虚线');
hr.cells.forEach((c) => chk(D(gh).board().mark[c] === 1, '第 ' + c + ' 格在路线上'));
D(gh).setWrench(9);
D(gh).fixList(hr).forEach((f) => { const d2 = D(gh).board().dir; d2[f.cell] = f.to; D(gh).pin({ dir: d2 }); });
for (let k = 0; k < 6; k++) D(gh).beltStep();
for (let k = 0; k < 6 && st(gh).phase === 'play'; k++) D(gh).beltStep();
chk(st(gh).runSort === 1 && st(gh).phase === 'rest', '照着虚线转完，包裹自己一路走到了冷藏柜 —— 顺势收工');
P(gh, 4.6);
chk(D(gh).board().mark.every((v) => v === 0), '虚线亮 4.5 秒自己灭掉，不赖在地上');
scene(gh, LANE, [{ type: 2, x: 0, y: 2 }], { park: false });
D(gh).setQueue([{ type: 2 }]);
D(gh).setHints(2);
D(gh).hint();
chk(/这一件眼下绕不过去/.test(D(gh).msg()) && st(gh).hints === 2, '这座货架压根不在车间里：如实说，且不烧画线笔');
D(gh).setHints(0);
scene(gh, LANE, [{ type: 0, x: 0, y: 2 }], { park: false });
D(gh).setQueue([{ type: 1 }]);
D(gh).hint();
chk(/画线笔用完了/.test(D(gh).msg()) && st(gh).hints === 0, '笔用完了只动嘴');
scene(gh, LANE, [{ type: 0, x: 4, y: 4 }], { park: false });
D(gh).pin({ dir: (() => { const d2 = D(gh).board().dir; d2[ID(4, 4)] = 2; return d2; })() });
D(gh).setHints(2);
const hr2 = D(gh).plan(D(gh).boxes()[0]);
chk(hr2 && hr2.cost >= 1 && hr2.cost <= 3, '箭头指反了也能绕过去：这一趟要 ' + (hr2 && hr2.cost) + ' 把');
D(gh).hint();
const fix0 = D(gh).fixList(hr2)[0];
chk(fix0 && D(gh).board().mark[fix0.cell] === 1, '第一处该转的就是 ' + fix0.cell + ' 格');
D(gh).setWrench(5);
D(gh).rotate(fix0.cell, 1);
chk(D(gh).board().mark[fix0.cell] === 0 && D(gh).dirOf(fix0.cell) === (fix0.from + 1) % 4, '顺转一下就把那格从虚线上摘掉（还差 ' + ((fix0.to - fix0.from + 3) % 4) + ' 下才指对）');
const hn0 = st(gh).hints;
D(gh).showNext();
chk(st(gh).hints === hn0 && /下一件/.test(D(gh).msg()), '「下一件」是免费的：只告诉你这单归哪座架');
const gtCells = D(gh).cells().filter((c) => /\bgt\b/.test(c.cls));
chk(gtCells.length === 1 && D(gh).board().shel[gtCells[0].i] === D(gh).boxes()[0].type, '高亮的正是要去的那座货架');
D(gh).pin({ cur: ID(4, 4) });
scene(gh, LANE, [], { park: false });
D(gh).setQueue([]); D(gh).setBoxes([]);
D(gh).hint();
chk(/线上没货/.test(D(gh).msg()) && st(gh).hints === hn0, '线上空着时画线笔不背锅');

/* ==================== 十一、班次、光标与快捷键 ==================== */
const gd = start(boot({ 'fj.diff': 'nowhere' }));
chk(st(gd).diff === 'daily', '存档里冒出没听过的班次就退回白班');
const gc = start(boot());
gc.byId('diff').querySelectorAll('button').find((b) => b.dataset.diff === 'calm').dispatch('click');
P(gc, 0.2);
chk(st(gc).diff === 'calm' && gc.storage.getItem('fj.diff') === 'calm', '点班次条立刻重开并写盘');
chk(st(gc).wrench === 12 && st(gc).lives === 6 && st(gc).hints === 5, '闲时夜班：12 扳手 6 信誉 5 支笔');
chk(D(gc).spd(1) === 700 && D(gc).chuteCnt(1) === 0, '闲时 700ms 一格慢慢来，前两班还没有碎包机');
scene(gc, LANE, [{ type: 0, x: 4, y: 4 }]);
D(gc).pin({ cur: ID(3, 3) });
D(gc).setWrench(4);
gc.key('arrowright');
chk(st(gc).cur === ID(4, 3), '方向键 → 光标右移一格');
gc.key('d');
chk(st(gc).cur === ID(5, 3), 'WASD 也能挪光标（d = 右）');
gc.key('arrowleft'); gc.key('arrowleft');
chk(st(gc).cur === ID(3, 3), '连按两下左键又回来了');
D(gc).pin({ cur: ID(0, 0) });
gc.key('arrowleft'); gc.key('arrowup');
chk(st(gc).cur === ID(0, 0), '顶到车间边角就不动了');
D(gc).pin({ cur: ID(3, 3) });
const dir0 = D(gc).dirOf(ID(3, 3));
gc.key(' ');
chk(D(gc).dirOf(ID(3, 3)) === (dir0 + 1) % 4 && st(gc).wrench === 3, '空格把光标那格顺转一格');
gc.key('x');
chk(D(gc).dirOf(ID(3, 3)) === dir0 && st(gc).wrench === 2, 'X 键逆转转回去（扳手照扣）');
D(gc).pin({ cur: ID(2, 1) });
gc.key(' ');
chk(D(gc).kindOf(ID(2, 1)) === 2 && st(gc).wrench === 2 && /转不动/.test(D(gc).msg()), '光标停在货架上按空格也白按');
const gcw = start(boot({ 'fj.diff': 'calm' }));
scene(gcw, LANE, [{ type: 0, x: 0, y: 2 }]);
D(gcw).setWrench(0);
for (let k = 0; k < 6; k++) D(gcw).beltStep();
chk(D(gcw).boxes()[1].x === 0 && st(gcw).lives === 6, '碎包机没造出来的闲时班，货撞腿就老实等着');
gc.key('t');
chk(/本机战绩/.test(D(gc).ov()) && /历代累计入库/.test(D(gc).ov()), 'T 键战绩页能看到累计入库');
gc.key('escape');
chk(!D(gc).ovShown(), 'Esc 收遮罩');
gc.key('p');
chk(/下一件/.test(D(gc).msg()), 'P 键看下一件去哪');
gc.key('n');
chk(st(gc).phase === 'play' && st(gc).level === 1 && st(gc).score === 0, 'N 重开一局');
gc.key('m');
chk(gc.byId('btnSound').textContent === '🔇' && gc.storage.getItem('fj.muted') === '1', 'M 静音并记住');
const oscM = gc.audio.created.osc;
scene(gc, LANE, [{ type: 0, x: 4, y: 4 }]);
D(gc).setWrench(3);
D(gc).rotate(ID(4, 4), 1);
D(gc).beltStep();
chk(gc.audio.created.osc === oscM, '静音档连扳手声和入库提示都不响');
gc.key('m');
scene(gc, LANE, [{ type: 0, x: 4, y: 4 }]);
D(gc).setWrench(3);
D(gc).rotate(ID(4, 4), 1);
chk(gc.audio.created.osc > oscM, '取消静音马上又有声音');
const gm = start(boot({ 'fj.muted': '1' }));
chk(gm.byId('btnSound').textContent === '🔇', '开机即静音');
gm.byId('btnHint').dispatch('click');
gm.byId('btnPlan').dispatch('click');
gm.byId('btnStats').dispatch('click');
P(gm, 0.3);
chk(/本机战绩/.test(D(gm).ov()), '画路线 / 下一件 / 战绩三个按钮都接得上');

/* ==================== 十二、鼠标点格与右键 ==================== */
const gp = start(boot());
scene(gp, LANE, [{ type: 0, x: 4, y: 4 }]);
D(gp).setWrench(5);
const cellBtn = (i) => gp.byId('belt').querySelectorAll('[data-i]')[i];
const d0 = D(gp).dirOf(ID(6, 3));
cellBtn(ID(6, 3)).dispatch('click');
chk(D(gp).dirOf(ID(6, 3)) === (d0 + 1) % 4 && st(gp).wrench === 4, '点一格顺转 90°，一把扳手');
cellBtn(ID(6, 3)).dispatch('click', { shiftKey: true });
chk(D(gp).dirOf(ID(6, 3)) === d0 && st(gp).wrench === 3, '按住 Shift 点 = 逆转');
cellBtn(ID(6, 3)).dispatch('contextmenu');
chk(D(gp).dirOf(ID(6, 3)) === (d0 + 3) % 4 && st(gp).wrench === 2, '右键直接逆转（也扣一把）');
chk(st(gp).cur === ID(6, 3), '点过的格子成为光标所在');
cellBtn(ID(2, 1)).dispatch('click');
chk(st(gp).wrench === 2 && /转不动/.test(D(gp).msg()), '点货架：不转也不扣');
cellBtn(ID(0, 0)).dispatch('pointerover');
chk(st(gp).cur === ID(0, 0) && st(gp).wrench === 2, '鼠标划过只是挪光标，不动扳手');

summary('分拣工厂', fails);
