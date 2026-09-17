'use strict';
/* 多米诺：骨牌连锁模型 → 关卡数据自洽 → 九关三档都有解 → 连锁时间与分叉可推算
   → 摆放/拆除/撤销/拖动连摆 → 断链原因 → 结算分数逐条可推算 → 快捷键与加速播放
   重点核对：① 一张牌能拍到的距离完全由牌高与命中高度决定 ② 参考摆法真的能全倒并拍到皇冠
   ③ 通关分数按「连锁 + 省牌 + 钻石 + 全倒 + 倍率」能手算，重复通关不再给分 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = "window.__g = { st: () => ({ phase: phase, diff: diff, level: level, score: score, cap: cap, hints: hints, cleared: cleared,   fallTotal: fallTotal, lastGain: lastGain, simT: simT, ghostOn: ghostOn, crownAng: crownAng, done: JSON.stringify(done),   cursor: { x: cursor.x, y: cursor.y, d: cursor.d }, n: tiles.length }), tl: () => tiles.map(function (t, i) { return { i: i, x: t.x, y: t.y, d: t.d, lock: !!t.lock, boost: !!t.boost, ang: t.ang, t: t.t }; }), pin: (o) => { if (o.phase !== undefined) phase = o.phase; if (o.diff !== undefined) diff = o.diff;   if (o.level !== undefined) level = o.level; if (o.score !== undefined) score = o.score; if (o.cap !== undefined) cap = o.cap;   if (o.hints !== undefined) hints = o.hints; if (o.cleared !== undefined) cleared = o.cleared;   if (o.simT !== undefined) simT = o.simT; if (o.ghostOn !== undefined) ghostOn = o.ghostOn;   if (o.crownAng !== undefined) crownAng = o.crownAng; if (o.lastGain !== undefined) lastGain = o.lastGain;   if (o.done) done = JSON.parse(o.done); if (o.cursor) cursor = { x: o.cursor.x, y: o.cursor.y, d: o.cursor.d || 0 };   if (o.tiles) { tiles = o.tiles.map(function (t) { return { x: t.x, y: t.y, d: t.d || 0, lock: !!t.lock, boost: !!boostAt(t.x, t.y), ang: 0 }; }); sim = simulate(); }   hud(); render2(); }, simOf: simulate, plan: plan, gain: gainOf, link: linkOf, linkMax: linkMax, reach: reachOf, sweep: sweepHit,   rock: rockBetween, can: canPlace, near: nearestTile, aim: autoAim, inZone: inZone, endAt: endAt, hudTxt: hud, add: addTile, del: removeAt, undo: undo, fall: startFall, hint: useHint, frame: frame, reset: resetLevel, newRun: newRun, nextLevel: nextLevel, retry: retryLevel, gameOver: gameOver, showStats: showStats, showIntro: showIntro, reStand: reStand, afterChange: afterChange, finish: finishFall, LV: LV, LEVELS: () => LEVELS, DIFFS: () => DIFFS, RULE: () => RULE, VW: () => [VW, VH, TW, TT], D: D, degF: deg, msg: () => msgEl.innerHTML, ov: () => ovContent.innerHTML, hud: () => ({ lv: elLv.textContent, used: elUsed.textContent, cap: elCap.textContent, score: elScore.textContent,   fell: elFell.textContent, best: elBest.textContent, hint: byId(\"hintN\").textContent, state: stateEl.textContent }), btns: () => ({ fall: !!byId(\"btnFall\").disabled, undo: !!byId(\"btnUndo\").disabled, clear: !!byId(\"btnClear\").disabled, hint: !!byId(\"btnHint\").disabled }), diffActive: () => byId(\"diff\").querySelectorAll(\"button\").filter((b) => b._cls.indexOf(\"active\") >= 0).map((b) => b.dataset.diff).join(\",\"), ovShown: () => overlayEl._cls.indexOf(\"show\") >= 0,}\n";
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('多米诺源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const near = (a, b) => Math.abs(a - b) < 1e-6;
function boot(storage) {
  const g = loadGame('domino', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  return g;
}
const clickAct = (g, name) => {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.2);
  return g;
};
const T = (x, y, d) => ({ x: x, y: y, d: d || 0 });
// 摆好参考摆法并推倒，返回模拟结果
function lay(g, li, dk) {
  const G = D(g);
  G.newRun(dk || 'std');
  G.pin({ level: li });
  G.reset();
  const p = G.plan();
  p.pts.forEach((q) => G.add(q[0], q[1], q[2]));
  return { p: p, res: G.simOf() };
}

/* ==================== 一、单张推单张的几何 ==================== */
{
  const g = boot();
  const G = D(g), R = G.RULE(), h = 40, hv = h, mx = G.linkMax(h);
  chk(mx > 30 && mx < h, '标准牌最远能拍 ' + mx.toFixed(1) + '（比牌高略小）');
  chk(near(mx, Math.sqrt(h * h - Math.pow(R.hitMin * 5, 2))), '最远距离 = √(牌高²-(1.35×牌厚)²)');
  chk(G.linkMax(50) > G.linkMax(40) && G.linkMax(40) > G.linkMax(32), '牌越高拍得越远');
  chk(G.link(T(100, 200, 0), T(130, 200, 0), hv).ok === true, '正对 30 距离：接得上');
  const far = G.link(T(100, 200, 0), T(100 + hv + 1, 200, 0), hv);
  chk(far.ok === false && far.why.indexOf('够不着') >= 0, '超过牌高：够不着');
  const graze = G.link(T(100, 200, 0), T(100 + (mx + hv) / 2, 200, 0), hv);
  chk(graze.ok === false && graze.why.indexOf('擦到牌尖') >= 0, '够得着但只擦到牌尖：推不动');
  const side = G.link(T(100, 200, 0), T(130, 200 + 12 + 1, 0), hv);
  chk(side.ok === false && side.why.indexOf('打偏') >= 0, '横偏超过一个牌宽：打偏');
  chk(G.link(T(100, 200, 0), T(130, 200 + 12, 0), hv).ok === true, '横偏正好一个牌宽：还能拍到');
  const back = G.link(T(100, 200, 0), T(80, 200, Math.PI), hv);
  chk(back.ok === false && back.why.indexOf('别处倒') >= 0, '牌后面的那张接不到');
  chk(G.link(T(100, 200, 0), T(130, 200, 0), hv).ok === true, '下一张顺着被推的方向：接得上');
  const twist = G.link(T(100, 200, 0), T(130, 200, Math.PI / 2), hv);
  chk(twist.ok === false && twist.why.indexOf('方向拧了') >= 0, '下一张 sideways 转 90°：转角太大接不过去');
  chk(G.link(T(100, 200, 0), T(130, 200, 1.1), hv).ok === true, '转角 63°（余弦 0.45）还在容差内');
  const rr = G.link(T(100, 200, 0), T(130, 200, 0), hv);
  chk(near(rr.s, 30) && near(rr.o, 0) && near(rr.hh, Math.sqrt(h * h - 900)), '接触距离/横偏/命中高度都报得出来');
  chk(G.reach(T(10, 10, 0)) === 40 && near(G.reach({ x: 1, y: 1, d: 0, boost: true }), 40 * G.RULE().boostK),
    '⚡ 弹板上的牌 reach ×1.35');
  const gap = mx + 3;
  chk(G.link(T(100, 200, 0), { x: 100 + gap, y: 200, d: 0, boost: false }, hv).ok === false,
    '普通牌跨不过这个距离');
  chk(G.link({ x: 100, y: 200, d: 0, boost: true }, T(100 + gap, 200, 0), 40 * G.RULE().boostK).ok === true,
    '站上弹板就跨得过去');
}

/* ==================== 二、关卡数据自洽 ==================== */
{
  const g = boot();
  const G = D(g), LS = G.LEVELS();
  chk(LS.length === 9, '九关');
  chk(LS.filter((L) => L.free).length === 1 && LS[8].free === true, '最后一关是自由场');
  let struct = true, inside = true, zones = true, ends = true, caps = true;
  const size = G.VW();
  LS.forEach((L) => {
    if (!L.name || !(L.cap > 0) || !(L.hints >= 0) || !L.start || !L.crown || !L.route || L.route.length < 2) struct = false;
    if (L.start.x < 8 || L.start.y < 8 || L.start.x > size[0] - 8 || L.start.y > size[1] - 8) inside = false;
    if (L.crown.x < 20 || L.crown.y < 20 || L.crown.x > size[0] - 20 || L.crown.y > size[1] - 20) inside = false;
    if (L.rocks.concat(L.ponds).concat(L.boosts).some((z) => z.r <= 0 || z.x < 0 || z.y < 0 || z.x > size[0] || z.y > size[1])) zones = false;
    if (L.route[0][0] !== L.start.x || L.route[0][1] !== L.start.y) ends = false;
    const tail = L.route[L.route.length - 1];
    if (tail[0] !== L.crown.x || tail[1] !== L.crown.y) ends = false;
    if (!(L.crown.r >= 12 && L.crown.r <= 30)) caps = false;
  });
  chk(struct, '每关都有名字/上限/提示数/起点/皇冠/路线');
  chk(inside, '起点与皇冠都在桌面内');
  chk(zones, '石头/水坑/弹板坐标合法');
  chk(ends, '路线首点就是起点牌、末点就是皇冠');
  chk(caps, '皇冠半径在 12~30 之间');
  chk(LS.every((L) => L.gems.every((q) => !G.inZone(L.rocks, q.x, q.y, 0) && !G.inZone(L.ponds, q.x, q.y, 0))),
    '钻石不会掉进石头或水坑');
  let mono = true;
  for (let i = 1; i < LS.length; i++) if (LS[i].cap < LS[0].cap) mono = false;
  chk(mono, '后面每关的牌数上限都不小于第一关');
}

/* ==================== 三、九关 × 三档都有解 ==================== */
{
  const g = boot();
  const G = D(g);
  ['kid', 'std', 'pro'].forEach((dk) => {
    let allOk = true, fitCap = true, allDown = true, h = G.DIFFS()[dk].h;
    const counts = [];
    for (let li = 0; li < G.LEVELS().length; li++) {
      const r = lay(g, li, dk);
      const res = r.res, s = st(g);
      counts.push(r.p.n);
      if (!r.p.ok || res.goalAt < 0) allOk = false;
      if (r.p.n + 1 > s.cap) fitCap = false;
      if (res.order.length !== s.n) allDown = false;
    }
    chk(allOk, dk + '（牌高 ' + h + '）：九关参考摆法都能拍到皇冠 [' + counts.join(',') + ']');
    chk(fitCap, dk + '：参考摆法的张数都在牌数上限内');
    chk(allDown, dk + '：参考摆法一张不漏，全部倒下');
  });
}

/* ==================== 四、连锁时间、分叉与阻挡 ==================== */
{
  const g = boot();
  const G = D(g), R = G.RULE();
  G.newRun('std');
  G.pin({ level: 0 });
  G.reset();
  G.pin({ tiles: [T(100, 200, 0), T(130, 200, 0)] });
  let r = G.simOf();
  chk(r.order.length === 2 && near(r.t[0], 0), '第一张在 0 秒开始倒');
  chk(near(r.t[1], (R.hitLead + (1 - R.hitLead) * (30 / 40)) * R.fall), '第二张的接触时刻 = (0.25+0.75×距离/reach)×0.4 秒');
  G.pin({ tiles: [T(100, 200, 0), T(115, 200, 0), T(130, 200, 0)] });
  r = G.simOf();
  chk(r.order.length === 3 && r.t[2] > r.t[1], '摆密一点：三张依次倒下，时间递增');
  G.pin({ tiles: [T(100, 200, 0), T(130, 190, 0), T(130, 210, 0)] });
  r = G.simOf();
  chk(r.order.length === 3 && near(r.t[1], r.t[2]), '一张牌同时拍倒两张：链会分叉');
  G.pin({ tiles: [T(100, 200, 0), T(130, 200, 0), T(160, 260, 0)] });
  r = G.simOf();
  chk(r.order.length === 2 && r.standing === 1 && r.why.indexOf('打偏') >= 0, '第三张歪出条带：断链并说明原因');
  G.pin({ level: 7 });
  G.reset();
  G.pin({ tiles: [T(190, 175, -Math.PI / 2), T(190, 140, -Math.PI / 2)] });
  r = G.simOf();
  chk(r.order.length === 1 && G.rock(190, 175, 190, 140), '几何上接得上但石头挡在中间：链条砸在石头上');
  chk(G.rock(56, 380, 80, 380) === null, '不穿石头的连线放行');
  G.pin({ level: 4 });
  G.reset();
  const lv4 = G.LV();
  G.pin({ tiles: [T(lv4.gems[0].x - 30, lv4.gems[0].y, 0)] });
  chk(G.simOf().gems.length === 1, '正对钻石倒下：扫到一颗');
  G.pin({ tiles: [T(lv4.gems[0].x - 30, lv4.gems[0].y + 20, 0)] });
  chk(G.simOf().gems.length === 0, '歪出二十米就扫不到钻石');
}

/* ==================== 五、摆放与拆除 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  G.newRun('std');
  G.pin({ level: 0 });
  G.reset();
  chk(st(g).n === 1 && st(g).phase === 'build', '开局只有一张起点牌');
  chk(G.tl()[0].lock === true, '起点牌带锁');
  chk(G.can(300, 200).ok === true, '空桌面可以摆牌');
  chk(G.can(2, 200).ok === false, '桌面外不能摆');
  chk(G.can(G.tl()[0].x, G.tl()[0].y).ok === false, '牌挤在一起不能摆');
  const cap0 = st(g).cap;
  let i = 1, filled = 0;
  while (st(g).n < cap0 && i < 40) { if (G.add(140 + i * 20, 380, 0)) filled++; i++; }
  chk(st(g).n === cap0 && filled === cap0 - 1, '一张一张摆到上限 ' + cap0 + ' 张');
  const nxt = 140 + i * 20;
  chk(G.can(nxt, 380).ok === false && G.can(nxt, 380).why.indexOf('上限') >= 0, '再多摆就撞牌数上限');
  const nFull = st(g).n;
  chk(G.add(nxt, 380, 0) === false && st(g).n === nFull, '到上限后 add 被拒绝');
  chk(plain(G.msg()).indexOf('上限') >= 0, '提示写明「牌数到上限」');
  G.pin({ level: 1 });
  G.reset();
  const L1 = G.LV();
  chk(G.can(L1.rocks[0].x, L1.rocks[0].y).why.indexOf('石头') >= 0, '石头上放不住牌');
  chk(G.can(L1.crown.x, L1.crown.y).why.indexOf('皇冠') >= 0, '皇冠上不放牌');
  G.pin({ level: 2 });
  G.reset();
  const L2 = G.LV();
  chk(G.can(L2.ponds[0].x, L2.ponds[0].y).why.indexOf('水坑') >= 0, '水坑里泡不住牌');
  G.pin({ level: 3 });
  G.reset();
  const bs = G.LV().boosts[0];
  chk(G.add(bs.x, bs.y, 0) === true && G.tl()[1].boost === true, '摆到 ⚡ 弹板上会标记 boost');
  G.pin({ level: 0 });
  G.reset();
  G.add(120, 200, 0);
  G.add(150, 200, 0);
  chk(st(g).n === 3, '连摆两张');
  G.undo();
  chk(st(g).n === 2, 'Z 撤销回上一步');
  G.undo();
  chk(st(g).n === 1, '再撤销回到只剩起点牌');
  G.undo();
  chk(st(g).n === 1 && plain(G.msg()).indexOf('没有可撤销') >= 0, '没有历史时撤销给出提示');
  chk(G.del(100, 100) === false && plain(G.msg()).indexOf('没有牌可拆') >= 0, '空处拆不到牌');
  G.add(120, 200, 0);
  chk(G.del(G.tl()[0].x, G.tl()[0].y) === false, '起点牌拆不掉');
  chk(G.del(120, 200) === true && st(g).n === 1, '点在自己的牌上能拆掉');
  G.add(200, 200, 0);
  chk(G.aim(240, 200) !== null && Math.abs(G.aim(240, 200)) < 0.2, '点放自动对准：接在链条前方');
}

/* ==================== 六、鼠标拖动连摆 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  G.newRun('std');
  G.pin({ level: 0 });
  G.reset();
  const cv = g.byId('cv');
  const W = G.VW();
  const px = (x, y) => ({ clientX: x / W[0] * 460, clientY: y / W[1] * 460 });
  const gap = G.linkMax(40) * G.RULE().dragK;
  cv.dispatch('pointerdown', px(150, 100));
  cv.dispatch('pointermove', px(150 + gap * 2.6, 100));
  cv.dispatch('pointermove', px(150 + gap * 3.2, 100));
  cv.dispatch('pointerup', px(150 + gap * 3.2, 100));
  chk(st(g).n === 1 + 4, '按住拖一条线：等距铺出 ' + (st(g).n - 1) + ' 张牌');
  const T2 = G.tl();
  chk(near(T2[2].x - T2[1].x, gap) && near(T2[3].x - T2[2].x, gap), '牌间距 = 最远拍摄距离 × 0.86');
  let chained = true;
  for (let k = 1; k + 1 < T2.length; k++) if (!G.link(T2[k], T2[k + 1], 40).ok) chained = false;
  chk(chained, '拖出来的一条直线彼此都接得上');
  chk(G.simOf().standing === st(g).n - 1, '这条线还在另一头，起点牌没拍到它');
  G.reset();
  cv.dispatch('pointerdown', px(150, 100));
  cv.dispatch('pointerup', px(150, 100));
  chk(st(g).n === 2, '点一下也能放一张');
  G.pin({ level: 1 });
  G.reset();
  const rk = G.LV().rocks[0];
  cv.dispatch('pointerdown', px(rk.x, rk.y));
  cv.dispatch('pointermove', px(rk.x + 100, rk.y));
  cv.dispatch('pointerup', px(rk.x + 100, rk.y));
  chk(st(g).n === 1, '起点落在石头上：整条拖动都不摆牌');
  chk(plain(G.msg()).indexOf('石头') >= 0, '提示为什么摆不下');
  cv.dispatch('pointerdown', px(300, 60));
  cv.dispatch('pointermove', px(400, 60));
  cv.dispatch('pointerup', px(400, 60));
  chk(st(g).n > 1, '换到空地上照样连摆了 ' + (st(g).n - 1) + ' 张');
}

/* ==================== 七、推倒、结算与再摆 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  const laid = lay(g, 0, 'std');
  const n0 = st(g).n;
  G.fall();
  chk(st(g).phase === 'play', '按「推倒」进入播放');
  g.tick(40);
  chk(G.tl().some((t) => t.ang > 0), '骨牌开始一张一张倒下');
  let f = 0;
  while (st(g).phase === 'play' && f < 600) { g.tick(40); f++; }
  chk(st(g).phase === 'result', '倒完自动结算（' + f + ' 帧）');
  const res = laid.res;
  const rows = G.gain(res);
  const base = 30, chainPt = res.order.length * 8, left = Math.max(0, st(g).cap - n0) * 18;
  const allPt = res.order.length === n0 ? 60 : 0;
  const gemPt = res.gems.length * 40;
  const want = Math.round((base + chainPt + left + allPt + 120 + gemPt) * 1.0);
  chk(rows.rows.length >= 4 && rows.sum === base + chainPt + left + allPt + 120 + gemPt, '分数明细逐条相加 = ' + rows.sum);
  chk(rows.total === want && st(g).lastGain === want && st(g).score === want, '标准牌 1 倍率：这一关 +' + want);
  chk(plain(G.ov()).indexOf('皇冠落地') >= 0 && plain(G.ov()).indexOf('连锁') >= 0, '结算页写明每一笔');
  chk(g.storage._data['dm.best'] === String(want) && g.storage._data['dm.lv'] === '1', '写入 dm.best / dm.lv');
  chk(Number(g.storage._data['dm.fall']) === res.order.length, '累计倒牌 dm.fall 加上这一次');
  clickAct(g, 'stay');
  chk(st(g).phase === 'build' && G.tl().every((t) => t.ang === 0), '「再摆摆」把牌子重新立起来');
  G.fall();
  f = 0;
  while (st(g).phase === 'play' && f < 600) { g.tick(40); f++; }
  chk(st(g).phase === 'result' && st(g).lastGain === 0 && st(g).score === want, '同一关重复通关不再给分');
  chk(plain(G.ov()).indexOf('早拿过') >= 0, '结算页说明这一关已经拿过分');
  clickAct(g, 'next');
  chk(st(g).level === 1 && st(g).phase === 'build' && st(g).cap === G.LEVELS()[1].cap, '下一关：关卡与牌数上限都跟着换');
  chk(st(g).hints === G.LEVELS()[1].hints, '每关的提示次数重新给');
  // 断链不加分
  G.pin({ level: 0 });
  G.reset();
  G.add(120, 200, 0);
  G.add(300, 60, 1.5);
  G.fall();
  f = 0;
  while (st(g).phase === 'play' && f < 600) { g.tick(40); f++; }
  chk(st(g).phase === 'build', '没拍到皇冠：回到摆牌状态，不弹结算');
  chk(st(g).score === want, '断链不加分');
  chk(plain(G.msg()).indexOf('链断') >= 0, '提示写明断在第几张后面');
  // 杀青
  const G2 = D(g);
  G2.gameOver('全部杀青');
  chk(st(g).phase === 'over' && G2.ovShown(), '杀青页弹出');
  chk(plain(G2.ov()).indexOf('全部杀青') >= 0 && plain(G2.ov()).indexOf(String(want)) >= 0, '杀青页汇总总分');
  g.key('Escape');
  chk(!G2.ovShown() && st(g).phase === 'over', '结算页 Esc 只关遮罩');
}

/* ==================== 八、提示与加速 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  G.newRun('pro');
  G.pin({ level: 4 });
  G.reset();
  chk(st(g).hints === 2 && G.hud().hint === '2', '这一关有两次参考摆法');
  G.hint();
  chk(st(g).hints === 1 && st(g).ghostOn > 0, '用掉一次：桌面浮出虚线参考');
  G.hint();
  chk(st(g).hints === 0 && D(g).btns().hint === true, '提示用完，按钮变灰');
  G.hint();
  chk(st(g).hints === 0 && plain(G.msg()).indexOf('用完') >= 0, '再用只提示用完');
  let f = 0;
  while (st(g).ghostOn > 0 && f < 400) { g.tick(40); f++; }
  chk(st(g).ghostOn <= 0, '虚线几秒后自己淡掉（' + f + ' 帧）');
  const laid = lay(g, 0, 'std');
  G.fall();
  chk(st(g).phase === 'play', '开始播放');
  g.key('enter');
  chk(st(g).phase === 'play' && D(g).hudTxt && G.hud().state.indexOf('2.5') >= 0, '播放中按 Enter 切到 2.5 倍速');
  const before = st(g).simT;
  g.tick(40);
  chk(near(st(g).simT - before, 0.1), '倍速下每帧推进 0.1 秒');
  g.key('enter');
  chk(G.hud().state.indexOf('按 Enter') >= 0, '再按 Enter 切回原速');
  g.byId('cv').dispatch('pointerdown', { clientX: 10, clientY: 10 });
  chk(G.hud().state.indexOf('2.5') >= 0, '点桌面也能切速度');
  let n = 0;
  while (st(g).phase === 'play' && n < 400) { g.tick(40); n++; }
  chk(st(g).phase === 'result' && n < 70, '加速后 ' + n + ' 帧就放完（原速要 90 帧）');
}

/* ==================== 九、快捷键、HUD 与外壳 ==================== */
{
  const g = boot({ 'dm.best': '9999', 'dm.fall': '1234' });
  const G = D(g);
  chk(g.byId('btnSound').textContent === '🔊', '默认有声');
  g.key('m');
  chk(g.byId('btnSound').textContent === '🔇', 'M 静音');
  chk(g.storage._data['dm.muted'] != null, '静音写进 dm.muted');
  g.key('m');
  chk(g.byId('btnSound').textContent === '🔊', '再按恢复');
  chk(st(g).phase === 'intro' && G.ovShown(), '启动先弹说明');
  clickAct(g, 'start');
  chk(st(g).phase === 'build', '点「开始摆牌」进入搭建');
  chk(G.diffActive() === 'std', '默认高亮标准牌');
  g.key('2');
  chk(st(g).diff === 'std' && st(g).score === 0, '按 2 选标准牌并重开');
  g.key('3');
  chk(st(g).diff === 'pro' && G.hud().state.indexOf('32') >= 0, '按 3 换竞技牌：状态栏写着牌高 32');
  chk(g.storage._data['dm.diff'] === 'pro', '规格写进 dm.diff');
  g.key('1');
  chk(st(g).diff === 'kid', '按 1 换儿童牌');
  g.byId('diff').querySelectorAll('button')[2].dispatch('click');
  chk(st(g).diff === 'pro' && G.diffActive() === 'pro', '点时段按钮同样换规格');
  g.key('r');
  chk(st(g).phase === 'build' && st(g).n === 1, 'R 本关重来');
  const cur0 = st(g).cursor;
  g.key('ArrowRight'); g.key('ArrowDown');
  chk(st(g).cursor.x === cur0.x + 10 && st(g).cursor.y === cur0.y + 10, '方向键移动笔架 10 单位');
  g.key('ArrowRight', { shiftKey: true });
  chk(st(g).cursor.x === cur0.x + 34, '按住 Shift 一次挪 24');
  const d0 = st(g).cursor.d;
  g.key('.');
  chk(near(st(g).cursor.d - d0, Math.PI / 12), '句号键把笔向转 15°');
  g.key(',');
  chk(near(st(g).cursor.d, d0), '逗号键转回来');
  g.key(' ');
  chk(st(g).n === 2, '空格在笔架处放一张');
  chk(G.tl()[1].x === st(g).cursor.x && G.tl()[1].y === st(g).cursor.y, '空格放牌的位置就是笔架');
  g.key('x');
  chk(st(g).n === 1, 'X 拆掉笔架附近的牌');
  g.key('h');
  chk(st(g).hints === 1, 'H 用掉一次提示');
  g.key('z');
  chk(st(g).n === 2 && plain(G.msg()).indexOf('撤销') >= 0, 'Z 撤销：刚拆掉的牌又回来了');
  g.key('t');
  chk(plain(G.ov()).indexOf('本机战绩') >= 0 && plain(G.ov()).indexOf('9999') >= 0, 'T 打开本机战绩');
  chk(plain(G.ov()).indexOf('1234') >= 0, '战绩里的累计倒牌来自 dm.fall');
  clickAct(g, 'close');
  chk(!G.ovShown() && st(g).phase === 'build', '「继续摆」关掉遮罩');
  g.byId('btnStats').dispatch('click');
  chk(plain(G.ov()).indexOf('本机战绩') >= 0, '点 📊 同样看战绩');
  g.byId('btnNew').dispatch('click');
  chk(st(g).phase === 'build' && st(g).level === 0 && st(g).score === 0, '点 ↻ 从第一关重来');
  const h = G.hud();
  chk(h.lv === '1/9' && h.used === '1' && h.cap === String(G.LEVELS()[0].cap) && h.best === '9999', 'HUD：关卡/已摆/上限/最佳分');
  chk(h.fell === '1' && h.state.indexOf('直巷') >= 0, 'HUD：当前能接上几张 + 关卡名');
  chk(D(g).btns().fall === false && D(g).btns().clear === false && D(g).btns().undo === true, '摆牌中：推倒/拆牌亮，撤销灰');
  // 最后一关的结账按钮
  G.pin({ level: 8 });
  G.reset();
  const last = lay(g, 8, 'std');
  G.fall();
  let k = 0;
  while (st(g).phase === 'play' && k < 900) { g.tick(40); k++; }
  chk(st(g).phase === 'result', '自由场也能通关');
  const fin = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'fin');
  chk(!!fin, '最后一关的结算按钮是「杀青结账」');
  clickAct(g, 'fin');
  chk(st(g).phase === 'over' && Number(g.storage._data['dm.lv']) === 9, '结账后写入最高通关 9/9');
}

summary('多米诺', fails);
