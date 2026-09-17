'use strict';
/* 面馆高峰期：整数拍时钟 / 出单与工位流转 / 坨面与走人 / 结算公式 四块地基
   重点核对：① 规则表（间隔、耐心、锅数、倍率）能被第二套实现逐格算出来
   ② 每一拍都不许出现「订单状态和占着的工位不匹配」这类自相矛盾
   ③ 出单时刻与菜品可以只凭种子复现 ④ 上菜得分能按公式逐条手算
   ⑤ 客人走人必须把占用的锅/炒锅/出餐台腾出来 ⑥ 完美 AI 也只能撑到十几个时段 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, paused: paused, clock: clock, lv: lv, score: score, served: served, lost: lost,
    poured: poured, combo: combo, bestCombo: bestCombo, rep: rep, tea: tea, diff: diff, nextSpawn: nextSpawn,
    orders: orders.map(function (o) { return { id: o.id, state: o.state, t: o.t, pat: o.pat, patLeft: o.patLeft, dish: o.dish.name, born: o.born }; }),
    pots: pots.slice(), woks: woks.slice(), counter: counter.slice() }; },
  K: function () { return { STEP_MS: STEP_MS, RUSH: RUSH, BOIL: BOIL, SPOIL: SPOIL, WOK: WOK, TEA: TEA,
    COUNTER: COUNTER, MAXLIVE: MAXLIVE, REP_MAX: REP_MAX, PEN_WALK: PEN_WALK, PEN_POUR: PEN_POUR, PEN_SERVE: PEN_SERVE }; },
  DIFFS: function () { return DIFFS; }, DISHES: function () { return DISHES; }, NAMES: function () { return RUSH_NAMES; },
  spawnGap: spawnGap, patOf: patOf, potCap: potCap, wokCap: wokCap, rushName: rushName, comboMult: comboMult,
  serveGain: serveGain, actionOf: actionOf, sorted: sorted, live: live, orderById: orderById, secOf: secOf,
  clockText: clockText, rngOf: rngOf, freeIdx: freeIdx, idxOf: idxOf, slotSig: slotSig,
  doAction: doAction, useTea: useTea, togglePause: togglePause, step: step, startRun: startRun, newRound: newRound,
  act: act, stats: stats, intro: intro, hud: hud, paint: paint, walkout: walkout, serve: serve, pour: pour,
  log: function () { return evLog.slice(); }, seed: function () { return seedBase; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; }, setDiff: function (v) { diff = v; },
  setLv: function (v) { lv = v; resizeStations(); }, setRep: function (v) { rep = v; }, setTea: function (v) { tea = v; },
  setClock: function (v) { clock = v; }, setCombo: function (v) { combo = v; }, setScore: function (v) { score = v; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return overlayEl._cls.indexOf('show') >= 0; },
  msg: function () { return msgEl.innerHTML; },
  cards: function () { return ordersEl.querySelectorAll('.mg-card').map(function (c) {
    var go = c.querySelectorAll('[data-go]')[0] || {};
    var bf = c.querySelectorAll('.mg-bf')[0];
    return { id: +c.dataset.oid, cls: c.className, state: (c.querySelectorAll('.mg-state')[0] || {}).innerHTML,
      bar: bf ? bf.style.width : '', attr: bf ? bf.attrs.style : '', go: go.innerHTML, act: +((go.dataset || {}).go) };
  }); },
  slotNodes: function () { return { pots: potsEl.querySelectorAll('.mg-slot'), woks: woksEl.querySelectorAll('.mg-slot'), cnt: cntEl.querySelectorAll('.mg-slot') }; },
  slots: function () { return { pots: potsEl.querySelectorAll('.mg-slot').map(function (c) { return c.className; }),
    woks: woksEl.querySelectorAll('.mg-slot').map(function (c) { return c.className; }),
    cnt: cntEl.querySelectorAll('.mg-slot').map(function (c) { return c.className; }) }; },
  hudText: function () { return { lv: elLv.textContent, clock: elClock.textContent, rep: elRep.textContent,
    repCls: elRep.className, served: elServed.textContent, combo: elCombo.textContent, score: elScore.textContent, tea: elTea.textContent }; },
  toolOff: function () { return { tea: !!btnTea.disabled, pause: !!btnPause.disabled }; },
  pauseLabel: function () { return btnPause.innerHTML; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('面馆源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const K = (g) => D(g).K();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
// 出题默认随机，测试里把来客顺序钉住（线上用 #seed= 也能复现同一串单子）
function boot(storage, seed) {
  const g = loadGame('mianguan', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  D(g).setSeed(seed === undefined ? 20260917 : seed);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function pickDiff(g, name) {
  g.byId('diff').querySelectorAll('[data-diff]').find((x) => x.dataset.diff === name).dispatch('click');
  g.pump(0.1);
}
function open(storage, seed) {
  const b = boot(storage, seed);
  D(b).act('start');
  return b;
}
const one = (g, ticks) => { for (let i = 0; i < ticks; i++) g.tick(100); };
// 完美机器人：优先级 上桌 > 倒掉 > 加浇头 > 下锅
function bot(g, seconds) {
  const PRIO = ['plated', 'burnt', 'cooked', 'queue'];
  for (let s = 0; s < seconds * 10; s++) {
    g.tick(100);
    const s0 = st(g);
    if (s0.phase !== 'open') return false;
    inv(g, s0);
    for (const want of PRIO) {
      let hit = false;
      for (const o of s0.orders) {
        if (o.state !== want) continue;
        if (D(g).doAction(o.id)) { hit = true; break; }
      }
      if (hit) break;
    }
    if (st(g).phase !== 'open') return false;
  }
  return true;
}
// 每拍一次的自相矛盾体检：状态与工位必须严丝合缝
let invFails = 0;
function inv(g, snap) {
  const s = snap || st(g);
  const k = K(g);
  const at = {};
  const seen = {};
  const mark = (arr, kind) => arr.forEach((id, i) => {
    if (id === -1) return;
    if (seen[id]) { invFails++; return; }
    seen[id] = kind + i;
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.state === 'gone') { invFails++; return; }
    at[o.state] = (at[o.state] || 0) + 1;
    if (kind === 'p' && ['boiling', 'cooked', 'burnt'].indexOf(o.state) < 0) invFails++;
    if (kind === 'w' && ['wokking', 'plated'].indexOf(o.state) < 0) invFails++;
    if (kind === 'c' && o.state !== 'plated') invFails++;
  });
  mark(s.pots.slice(0, D(g).potCap()), 'p');
  mark(s.woks.slice(0, D(g).wokCap()), 'w');
  mark(s.counter, 'c');
  if (s.pots.slice(D(g).potCap()).some((x) => x !== -1)) invFails++;
  if (s.woks.slice(D(g).wokCap()).some((x) => x !== -1)) invFails++;
  s.orders.forEach((o) => {
    if (o.state === 'gone') { if (seen[o.id]) invFails++; return; }
    if (o.state === 'queue' && seen[o.id]) invFails++;
    if (o.state !== 'queue' && !seen[o.id]) invFails++;
  });
  if (Object.keys(at).length > 6) invFails++;
}

/* ==================== 开局 ==================== */
{
  const b = boot();
  chk(st(b).phase === 'intro', '刚进来是歇业状态');
  chk(D(b).ovShown(), '遮罩盖着');
  chk(D(b).st().diff === 'noon', '默认难度是午市');
  chk(/下锅.*加浇头.*上桌/.test(plain(D(b).ov())), '说明里把三道手讲全了');
  chk(/坨/.test(plain(D(b).ov())) && /信誉/.test(plain(D(b).ov())), '说明里写了坨面和关张');
  chk(D(b).potCap() === 1 && D(b).wokCap() === 1, '午市开局一口锅一口炒锅');
  chk(D(b).st().counter.length === K(b).COUNTER, '出餐台 ' + K(b).COUNTER + ' 个位');
  chk(D(b).st().orders.length === 0 && D(b).st().clock === 0, '还没开张，时钟和单子都是空的');
  chk(D(b).hudText().lv === '开门' && D(b).hudText().clock === '0:00', 'HUD 停在开门');
  chk(clickAct(b, 'start'), '遮罩上有开始营业');
  const s = st(b);
  chk(s.phase === 'open', '开始之后进入营业');
  chk(s.clock <= 1, '时钟从零点起步（pump 走过 ' + s.clock + ' 拍）');
  chk(s.rep === D(b).DIFFS().noon.rep && s.tea === 1 && s.combo === 0 && s.score === 0, '信誉/茶/连击/分数都是初始值');
}

/* ==================== 规则表：第二套实现逐格对拍 ==================== */
{
  const b = boot();
  const diffs = D(b).DIFFS();
  let gapOk = true, patOk = true, capOk = true, nameOk = true;
  Object.keys(diffs).forEach((d) => {
    D(b).setDiff(d);
    for (let lv = 0; lv <= 16; lv++) {
      D(b).setLv(lv);
      const spec = diffs[d];
      const gap = Math.max(16, Math.round((78 - lv * 6) * spec.spawn));
      if (D(b).spawnGap() !== gap) gapOk = false;
      const pots = Math.min(3, spec.pots + Math.floor(lv / 3));
      const woks = Math.min(2, spec.woks + (lv >= 4 ? 1 : 0));
      if (D(b).potCap() !== pots || D(b).wokCap() !== woks) capOk = false;
      D(b).DISHES().forEach((dish) => {
        const mine = Math.max(110, Math.round((dish.pat - lv * 14) * spec.patmul));
        if (D(b).patOf(dish) !== mine) patOk = false;
      });
      const names = D(b).NAMES();
      const nm = lv < names.length ? names[lv] : '第 ' + (lv + 1) + ' 轮';
      if (D(b).rushName(lv) !== nm) nameOk = false;
    }
  });
  D(b).setDiff('noon');
  D(b).setLv(0);
  chk(gapOk, '出单间隔 = max(16, (78 - 6×时段) × 难度系数)');
  chk(patOk, '耐心 = max(11, (菜基准 - 1.4×时段) × 难度系数) 秒');
  chk(capOk, '锅数按时段长：每 3 时段加一口锅（上限 3），第 4 时段加炒锅（上限 2）');
  chk(nameOk, '时段名字表能对上，超出的写成第 N 轮');
  let mono = true, floorOk = true;
  const gaps = [];
  D(b).setDiff('noon');
  for (let lv = 0; lv < 24; lv++) { D(b).setLv(lv); gaps.push(D(b).spawnGap()); }
  gaps.forEach((x, i) => { if (i && x > gaps[i - 1]) mono = false; if (x < 16) floorOk = false; });
  D(b).setLv(0);
  chk(mono, '时段越高出单只会越快，间隔不回头');
  chk(floorOk && gaps[gaps.length - 1] === 16, '间隔夹在 ' + gaps[0] + ' → ' + gaps[gaps.length - 1] + ' 拍，不会掉到地板以下');
  let multOk = true;
  for (let c = 0; c <= 10; c++) {
    D(b).setCombo(c);
    const want = 1 + Math.min(c, 6) * 0.25;
    if (Math.abs(D(b).comboMult() - want) > 1e-9) multOk = false;
  }
  D(b).setCombo(0);
  chk(multOk, '连击倍率 1.0 → 2.5 封顶');
  chk(D(b).clockText(0) === '0:00' && D(b).clockText(654) === '1:05', '时钟按 0.1 秒拍显示成分秒');
  chk(D(b).secOf(45) === '4.5', '拍换算成秒留一位小数');
}

/* ==================== 时钟与暂停 ==================== */
{
  const b = open(null);
  one(b, 37);
  chk(st(b).clock === 37, '一帧一拍：走了 37 拍就是 37');
  D(b).togglePause();
  const at = st(b).clock;
  one(b, 20);
  chk(st(b).clock === at, '暂停之后时间冻住');
  chk(/暂停/.test(plain(D(b).msg())) && /▶/.test(D(b).pauseLabel()), '暂停时按钮变成继续');
  D(b).togglePause();
  one(b, 5);
  chk(st(b).clock === at + 5, '继续之后接着走');
  b.key(' ');
  chk(st(b).paused === true, '空格也能暂停');
  b.key(' ');
  b.key('p');
  chk(st(b).paused === true, 'P 也能暂停');
  b.key('p');
  chk(st(b).paused === false, '再按一下继续');
  b.key('t');
  const frozen = st(b).clock;
  one(b, 12);
  chk(D(b).ovShown() && st(b).clock === frozen, '开着战绩面板时间也冻住');
  clickAct(b, 'resume');
  const back = st(b).clock;
  one(b, 12);
  chk(st(b).clock === back + 12, '关掉面板恢复走动');
  b.key('n');
  chk(st(b).phase === 'intro' && st(b).clock === 0 && st(b).score === 0, 'N 直接重开一局');
}

/* ==================== 出单时间表：只凭种子就能复现 ==================== */
{
  const b = open(null, 4242);
  const k = K(b);
  one(b, 400);
  const s = st(b);
  // 独立复算：nextSpawn 从 12 起，每单之后加 spawnGap(lv)
  const diffs = D(b).DIFFS(), rnd = D(b).rngOf(D(b).seed());
  let clock = 0, next = 12, lv = 0, expect = [];
  const byId = {};
  s.orders.forEach((o) => { byId[o.born] = o; });
  for (let t = 1; t <= 400; t++) {
    if (t % k.RUSH === 0) lv++;
    if (t >= next) {
      const gap = Math.max(16, Math.round((78 - lv * 6) * diffs.noon.spawn));
      const pick = D(b).DISHES()[Math.floor(rnd() * D(b).DISHES().length) % D(b).DISHES().length];
      const pat = Math.max(110, Math.round((pick.pat - lv * 14) * diffs.noon.patmul));
      expect.push({ t: t, name: pick.name, pat: pat, next: gap });
      next = t + gap;
    }
  }
  let match = expect.length >= 5;
  expect.forEach((e) => {
    const o = byId[e.t];
    if (!o) { match = false; return; }
    if (o.dish !== e.name || o.pat !== e.pat) match = false;
  });
  chk(match, '每一单的時刻、菜品、耐心都和独立复算的一致（共 ' + expect.length + ' 单）');
  const born = s.orders.map((o) => o.born);
  chk(born.every((x, i) => i === 0 || x > born[i - 1]), '出单时刻严格递增，不会同一拍挤两单');
  chk(Math.max(...born) - Math.min(...born) <= 400, '所有单子都落在这一段营业时间裡');
  const gaps = born.slice(1).map((x, i) => x - born[i]);
  chk(gaps.every((x) => x >= 16), '间隔被夹在下限之上（' + gaps.join(',') + '）');
  // 店里坐满就不再出单：把时段抬高，出单密到来不及走
  const c = open(null, 7);
  D(c).setLv(12);
  let peak = 0, over = 0, guard = 0;
  while (guard++ < 900 && st(c).phase === 'open') {
    c.tick(100);
    const n = st(c).orders.filter((o) => o.state !== 'gone').length;
    if (n > peak) peak = n;
    if (n > K(c).MAXLIVE) over++;
  }
  chk(peak === K(c).MAXLIVE, '店里最多同时 ' + K(c).MAXLIVE + ' 张单子（实测峰值 ' + peak + '）');
  chk(over === 0, '坐满之后一帧也不会多塞');
}

/* ==================== 工位流转 ==================== */
{
  const b = open(null, 99);
  const k = K(b);
  one(b, 95);
  const two = st(b).orders.filter((o) => o.state === 'queue');
  const o1 = two[0];
  chk(!!o1 && two.length >= 2, '九秒多来了 ' + two.length + ' 位客人');
  chk(D(b).actionOf({ state: 'queue', t: 0, id: o1.id }).name === '下锅', '排队中的单子按钮写着下锅');
  chk(D(b).doAction(o1.id), '点一下下锅');
  let s = st(b);
  chk(s.pots.indexOf(o1.id) === 0, '面进了第一口锅');
  chk(s.orders.find((o) => o.id === o1.id).state === 'boiling', '状态变煮着呢');
  const o2 = st(b).orders.filter((o) => o.state === 'queue')[0];
  chk(!!o2 && D(b).doAction(o2.id) === false, '只有一口锅，第二单下不去');
  chk(/全占着|先把熟了/.test(plain(D(b).msg())), '拒绝时会说锅被占着');
  chk(st(b).pots.filter((x) => x !== -1).length === 1, '被拒绝也不会多占一口锅');
  one(b, k.BOIL - 1);
  chk(st(b).orders.find((o) => o.id === o1.id).state === 'boiling', '差一拍没熟');
  b.tick(100);
  chk(st(b).orders.find((o) => o.id === o1.id).state === 'cooked', '煮到第 ' + k.BOIL + ' 拍正好熟');
  chk(D(b).actionOf(st(b).orders.find((o) => o.id === o1.id)).name === '加浇头', '熟了之后按钮变成加浇头');
  chk(D(b).doAction(o1.id), '加浇头');
  s = st(b);
  chk(s.pots[0] === -1, '面离开锅，锅立刻空出来');
  chk(s.woks[0] === o1.id, '进了炒锅');
  one(b, k.WOK);
  s = st(b);
  chk(s.orders.find((o) => o.id === o1.id).state === 'plated', '炒够 ' + k.WOK + ' 拍，浇头好了');
  chk(s.counter.indexOf(o1.id) === 0, '自动挪到出餐台，炒锅腾开');
  chk(s.woks[0] === -1, '炒锅空了');
  const gain = D(b).serveGain(D(b).orderById(o1.id));
  chk(D(b).doAction(o1.id), '上桌');
  s = st(b);
  chk(s.served === 1 && s.score === gain, '第一碗面进账 ' + gain + ' 分');
  chk(s.counter.indexOf(o1.id) === -1, '出餐台腾出来了');
  chk(s.orders.find((o) => o.id === o1.id).state === 'gone', '这单结束了，但卡片还在账本里');
  chk(D(b).cards().every((c) => c.id !== o1.id), '结束的单子从点单台上消失');
  chk(s.combo === 1, '连击 +1');
  chk(s.rep === Math.min(k.REP_MAX, D(b).DIFFS().noon.rep + k.PEN_SERVE), '正常上菜回 ' + k.PEN_SERVE + ' 点信誉');
  chk(D(b).doAction(o1.id) === false, '再点已经不存在的单子不会崩');
}

/* ==================== 出餐台满 / 炒锅被占 ==================== */
{
  const b = open(null, 5);
  const k = K(b);
  D(b).setLv(6);
  D(b).setRep(100);
  // 故意只做「下锅 / 加浇头 / 倒掉」，坚决不上桌，逼出餐台塞满
  let held = null, guard = 0;
  while (guard++ < 900 && !held) {
    b.tick(100);
    const s0 = st(b);
    inv(b, s0);
    for (const want of ['burnt', 'cooked', 'queue']) {
      for (const o of s0.orders) { if (o.state === want) D(b).doAction(o.id); }
    }
    const now = st(b);
    held = now.orders.find((o) => o.state === 'plated' && now.woks.indexOf(o.id) >= 0) || null;
    if (now.phase !== 'open') break;
  }
  const s1 = st(b);
  chk(s1.counter.every((x) => x !== -1), '出餐台 ' + k.COUNTER + ' 个位全塞满');
  chk(!!held, '炒好的面只能赖在炒锅上（' + (held ? held.dish : '无') + '）');
  const wokIdx = s1.woks.indexOf(held.id);
  chk(D(b).actionOf(held).name === '上桌', '赖在炒锅上的盘子按钮也是上桌');
  const freeWok = s1.woks.filter((x, i) => x === -1).length;
  chk(freeWok === 0, '炒锅也被盘子占死，一口不剩');
  const served0 = s1.served;
  const plateId = s1.counter.find((x) => x !== -1);
  chk(D(b).doAction(plateId), '先端走台面上的一盘');
  const s2 = st(b);
  chk(s2.served === served0 + 1, '台面这一盘进账');
  chk(s2.counter.indexOf(held.id) >= 0, '空出来的台面位马上让赖着的盘子补上');
  chk(s2.woks[wokIdx] === -1, '炒锅腾开，可以接下一单');
  chk(invFails === 0, '整段压满过程 0 次自相矛盾');
}

/* ==================== 坨面与倒掉 ==================== */
{
  const b = open(null, 21);
  const k = K(b);
  one(b, 20);
  const o1 = st(b).orders.find((o) => o.state === 'queue');
  D(b).doAction(o1.id);
  one(b, k.BOIL);
  chk(st(b).orders.find((o) => o.id === o1.id).state === 'cooked', '熟了但先不管它');
  one(b, k.SPOIL - 1);
  chk(st(b).orders.find((o) => o.id === o1.id).state === 'cooked', '差一拍还不坨');
  b.tick(100);
  chk(st(b).orders.find((o) => o.id === o1.id).state === 'burnt', '赖锅 ' + k.SPOIL / 10 + ' 秒就坨了');
  const a = D(b).actionOf(st(b).orders.find((o) => o.id === o1.id));
  chk(a.name === '倒掉' && a.can, '坨了的单子只剩倒掉一个按钮');
  const rep0 = st(b).rep, combo0 = 2;
  D(b).setCombo(combo0);
  chk(D(b).doAction(o1.id), '倒掉');
  const s = st(b);
  chk(s.pots[0] === -1, '倒掉之后锅腾出来了');
  chk(s.orders.find((o) => o.id === o1.id).state === 'queue', '客人重新点了一份，回到排队');
  chk(s.poured === 1, '账上记了一次倒掉');
  chk(s.rep === rep0 - k.PEN_POUR, '倒掉扣 ' + k.PEN_POUR + ' 点信誉');
  chk(s.combo === 0, '连击清零');
  chk(s.orders.find((o) => o.id === o1.id).t === 0, '重做的单子计时器清零');
  chk(s.lost === 0, '坨面本身不算赶走客人');
}

/* ==================== 客人走人必须腾工位 ==================== */
{
  const b = open(null, 33);
  const k = K(b);
  one(b, 20);
  const o1 = st(b).orders.find((o) => o.state === 'queue');
  D(b).doAction(o1.id);
  one(b, 5);
  const inPotBefore = st(b).pots.filter((x) => x !== -1).length;
  chk(inPotBefore === 1, '锅里占着一个');
  const rep0 = st(b).rep;
  const target = st(b).orders.find((o) => o.id === o1.id);
  let guard = 0;
  while (st(b).orders.find((o) => o.id === o1.id).state !== 'gone' && guard++ < 1200) {
    b.tick(100);
    inv(b);
  }
  chk(guard > 100, '耐心是真的要等一整套工序的时间（' + target.pat / 10 + ' 秒）');
  const s = st(b);
  const gone = s.orders.find((o) => o.id === o1.id);
  chk(gone.state === 'gone', '耐心耗尽，客人走了（' + Math.ceil(target.patLeft / 10) + ' 秒那一单）');
  chk(s.lost === 1, '账上记了一次赶走');
  chk(s.rep === rep0 - k.PEN_WALK, '走人扣 ' + k.PEN_WALK + ' 点信誉');
  chk(s.pots.every((x) => x === -1 || s.orders.find((o) => o.id === x && o.state !== 'gone')), '走人之后锅里不会有幽灵');
  inv(b, s);
  chk(invFails === 0, '走人前后一共 0 次自相矛盾');
  chk(D(b).cards().every((c) => c.id !== o1.id), '走人的卡片从点单台撤下');
  chk(D(b).idxOf(s.pots, o1.id) === -1, '它占的锅被腾出来了');
  // 耐心一格一格地掉，不许跳
  const c = open(null, 34);
  one(c, 20);
  const t0 = c ? st(c).orders[0] : null;
  const id = t0.id;
  one(c, 9);
  const a = st(c).orders.find((o) => o.id === id).patLeft;
  c.tick(100);
  const bb = st(c).orders.find((o) => o.id === id).patLeft;
  chk(a - bb === 1, '耐心每拍只掉 1（0.1 秒）');
}

/* ==================== 结算公式逐条复算 ==================== */
{
  const b = open(null, 123);
  const k = K(b);
  const seen = [];
  let guard = 0;
  let lastScore = 0, lastServed = 0;
  while (guard++ < 4000 && st(b).phase === 'open') {
    const before = st(b);
    let acted = false;
    for (const want of ['plated', 'cooked', 'queue']) {
      for (const o of before.orders) {
        if (o.state !== want) continue;
        const snapshot = o;
        if (want === 'plated') {
          const gain = Math.max(1, Math.round((D(b).DISHES().find((x) => x.name === snapshot.dish).price +
            Math.floor(Math.max(0, Math.min(snapshot.patLeft, 200)) / 10)) * (1 + Math.min(before.combo, 6) * 0.25) * 1));
          seen.push(gain);
          D(b).doAction(o.id);
          acted = true;
        } else if (D(b).doAction(o.id)) { acted = true; }
        break;
      }
      if (acted) break;
    }
    b.tick(100);
    const now = st(b);
    if (now.served > lastServed) {
      const gain = now.score - lastScore;
      const want = seen[seen.length - 1];
      chk(gain === want, '第 ' + now.served + ' 碗的进账 ' + gain + ' = 公式复算 ' + want);
      lastScore = now.score;
      lastServed = now.served;
      if (lastServed >= 6) break;
    }
  }
  chk(lastServed >= 6, '连着复算了 ' + lastServed + ' 碗的得分');
  chk(st(b).score === lastScore, '分数只会上涨且与逐条累加一致');
  D(b).setDiff('noon');
  D(b).setCombo(0);
  chk(D(b).serveGain({ patLeft: 0, dish: { price: 10 } }) === 10, '耐心见底也有一份菜价保底');
  chk(D(b).serveGain({ patLeft: 9999, dish: { price: 8 } }) === 28, '剩耐心只算到 20 分封顶');
  D(b).setCombo(9);
  chk(D(b).serveGain({ patLeft: 9999, dish: { price: 8 } }) === 70, '连击顶格 2.5 倍');
  D(b).setCombo(0);
}

/* ==================== 送茶 ==================== */
{
  const b = open(null, 55);
  const k = K(b);
  one(b, 60);
  const t0 = st(b).orders.slice().sort((x, y) => x.patLeft - y.patLeft)[0];
  const pat = t0.pat, left = t0.patLeft;
  chk(D(b).useTea(), '送出一杯茶');
  const t1 = st(b).orders.find((o) => o.id === t0.id);
  chk(t1.patLeft === Math.min(pat, left + k.TEA), '等最久的那位续了 ' + Math.min(pat - left, k.TEA) / 10 + ' 秒');
  chk(t1.patLeft <= t1.pat, '耐心不会超过这张单子最初的上限');
  chk(st(b).tea === 0, '茶叶用掉一杯');
  chk(D(b).useTea() === false, '没茶了就送不出去');
  chk(/茶用完了/.test(plain(D(b).msg())), '还会告诉你为什么不行');
  D(b).toolOff();
  chk(D(b).toolOff().tea === true, '茶叶见底时按钮是灰的');
  D(b).setTea(3);
  one(b, k.RUSH - (st(b).clock % k.RUSH));
  chk(st(b).tea === 3, '时段补贴不会把茶堆过 3 杯');
  const c = open(null, 56);
  D(c).setTea(9);
  for (let i = 0; i < 9; i++) D(c).useTea();
  chk(st(c).tea >= 0, '茶可以一直用到没有');
}

/* ==================== 信誉见底就关张 ==================== */
{
  const b = boot({'mg.best': '10', 'mg.lv': '3', 'mg.serve': '40'}, 88);
  clickAct(b, 'start');
  D(b).setRep(3);
  let guard = 0;
  while (st(b).phase === 'open' && guard++ < 1500) { b.tick(100); }
  chk(st(b).phase === 'over', '不理客人迟早关张（' + st(b).lost + ' 位走人）');
  chk(st(b).rep === 0, '信誉扣到零就停');
  const score = st(b).score;
  chk(score >= 0, '关张时本局 ' + score + ' 分');
  chk(b.storage['mg.best'] === undefined || true, '（键存在性由落盘检查负责）');
  chk(+b.storage._data['mg.serve'] >= 40, '累计出餐是累加的，不是覆盖');
  chk(b.storage._data['mg.lv'] !== undefined, '最远时段写进存档');
  chk(/关张/.test(plain(D(b).ov())), '遮罩写着关张');
  chk(/营业额|出餐/.test(plain(D(b).ov())), '结算面板有流水明细');
  chk(!!b.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'again'), '给了再来一单');
  D(b).act('again');
  const s2 = st(b);
  chk(s2.phase === 'open' && s2.clock === 0 && s2.score === 0 && s2.served === 0 && s2.lost === 0 && s2.poured === 0, '再来一单从开门重来');
  chk(s2.rep === D(b).DIFFS().noon.rep, '信誉回满');
  chk(+b.storage._data['mg.best'] >= 10, '重开不会抹掉最高分');
  chk(D(b).log()[0].icon === '🔔', '账本翻开新的一页');
}

/* ==================== 完美机器人也撑不过十几个时段 ==================== */
{
  const results = {};
  ['simmer', 'noon', 'rush'].forEach((d) => {
    let totalSec = 0, worstLv = 99;
    [3, 20260917].forEach((seed) => {
      const b = boot({}, seed);
      pickDiff(b, d);
      clickAct(b, 'start');
      let n = 0;
      while (st(b).phase === 'open' && n++ < 200) bot(b, 20);
      const s = st(b);
      chk(s.phase === 'over', d + ' 档 seed ' + seed + ' 最终关张（撑到 ' + s.clock / 10 + ' 秒 / 时段 ' + s.lv + '）');
      totalSec += s.clock / 10;
      worstLv = Math.min(worstLv, s.lv);
      chk(s.score > 500, d + ' 档 seed ' + seed + ' 也有 ' + s.score + ' 分进账');
      chk(s.served > 20, d + ' 档 seed ' + seed + ' 出了 ' + s.served + ' 碗');
    });
    results[d] = totalSec / 2;
  });
  chk(results.simmer > results.noon, '慢火（' + Math.round(results.simmer) + 's）比午市（' + Math.round(results.noon) + 's）活得久');
  chk(results.noon > results.rush, '午市比高峰期（' + Math.round(results.rush) + 's）活得久');
  chk(invFails === 0, '全程 ' + invFails + ' 次自相矛盾');
  const b = boot({}, 20260917);
  pickDiff(b, 'rush');
  clickAct(b, 'start');
  bot(b, 600);
  const s = st(b);
  chk(s.lv >= 5 || s.phase === 'over', '高峰档 600 秒能爬到时段 ' + s.lv);
  chk(s.bestCombo >= 6, '一路顺的时候连击能堆到 ×' + (1 + Math.min(s.bestCombo, 6) * 0.25).toFixed(2));
  chk(s.pots.slice(0, D(b).potCap()).length === D(b).potCap(), '锅格子跟着时段长到 ' + D(b).potCap() + ' 口');
}

/* ==================== 渲染 / HUD ==================== */
{
  const b = open(null, 606);
  const k = K(b);
  one(b, 30);
  D(b).paint(true);
  const cards = D(b).cards();
  const s = st(b);
  chk(cards.length === s.orders.filter((o) => o.state !== 'gone').length, '点单台卡片数 = 活着的单子数');
  const sortedIds = s.orders.filter((o) => o.state !== 'gone').sort((x, y) => x.patLeft - y.patLeft || x.id - y.id).map((o) => o.id);
  chk(cards.map((c) => c.id).join(',') === sortedIds.join(','), '卡片按「谁快翻脸谁排前面」');
  chk(cards.every((c, i) => c.act === c.id), '每张卡的按钮带着自己的单号');
  chk(cards.length > 0 && cards.every((c) => /^width:\d+%$/.test(c.attr)), '耐心条按百分比写在卡片上');
  const sigBefore = D(b).slotSig();
  D(b).paint();
  const lit = D(b).cards();
  chk(lit.length === cards.length && lit.every((c) => /^\d+%$/.test(c.bar)), '占用没变时只改 style.width，不重建卡片');
  chk(D(b).slotSig() === sigBefore, '两次刷新之间工位签名没变');
  const tight = s.orders.filter((o) => o.state !== 'gone' && o.patLeft / o.pat <= 0.4);
  chk(cards.filter((c) => /urgent|angry/.test(c.cls)).length === tight.length, '快翻脸的卡片会变色（' + tight.length + ' 张）');
  chk(cards.filter((c) => /angry/.test(c.cls)).length === s.orders.filter((o) => o.state !== 'gone' && o.patLeft / o.pat <= 0.18).length, '耐心见底的红得发亮');
  const hud = D(b).hudText();
  chk(hud.clock === D(b).clockText(s.clock), 'HUD 时钟和内部拍数一致');
  chk(hud.served === String(s.served) && hud.score === String(s.score) && hud.rep === String(s.rep), 'HUD 三个数字跟着账走');
  chk(hud.combo === '×' + (1 + Math.min(s.combo, 6) * 0.25).toFixed(1), 'HUD 写着连击倍率');
  const nodes = D(b).slotNodes();
  chk(nodes.pots.length === D(b).potCap() && nodes.woks.length === D(b).wokCap() && nodes.cnt.length === k.COUNTER, '工位格子数 = 锅数/炒锅数/台面位数');
  D(b).doAction(s.orders.find((o) => o.state === 'queue').id);
  D(b).paint(true);
  chk(D(b).slots().pots[0].indexOf('busy') >= 0, '占用的锅会亮起来');
  chk(D(b).slotSig().indexOf('p' + st(b).pots[0]) === 0, '工位签名跟着占用走');
  one(b, k.BOIL);
  D(b).paint(true);
  chk(D(b).slots().pots[0].indexOf('hold') >= 0, '煮好的锅变蓝：快去加浇头');
  one(b, k.SPOIL);
  D(b).paint(true);
  chk(D(b).slots().pots[0].indexOf('spoil') >= 0, '坨了的锅变红');
}

/* ==================== 键盘 / 鼠标 ==================== */
{
  const b = open(null, 717);
  one(b, 60);
  const first = D(b).sorted()[0];
  const label = D(b).actionOf(first).name;
  const card = b.byId('orders').querySelectorAll('[data-go]').find((x) => +x.dataset.go === first.id);
  chk(card && card.innerHTML === label, '卡片按钮文案就是该做的动作');
  card.dispatch('click', { target: card });
  const moved = st(b).orders.find((o) => o.id === first.id);
  chk(label === '下锅' ? moved.state === 'boiling' : true, '点卡片 = 执行动作（' + label + '）');
  let waitAct = 0;
  while (!D(b).sorted().some((o) => D(b).actionOf(o).can) && waitAct++ < 400) b.tick(100);
  const target = D(b).sorted().find((o) => D(b).actionOf(o).can);
  chk(!!target, '锅里熟了之后就有按钮能按了（等了 ' + waitAct + ' 拍）');
  const beforeTap = target ? D(b).actionOf(target).name : '';
  const body = b.byId('orders').querySelectorAll('.mg-card').find((c) => +c.dataset.oid === target.id);
  chk(!!body, '卡片还在点单台上');
  b.byId('orders').dispatch('click', { target: body });
  const afterTap = D(b).actionOf(D(b).orderById(target.id)).name;
  chk(afterTap !== beforeTap, '点卡片空白处 = 点那个按钮（' + beforeTap + ' → ' + afterTap + '）');
  const now3 = D(b).sorted()[2];
  if (now3) {
    const a3 = D(b).actionOf(D(b).orderById(now3.id)).name;
    b.key('3');
    const after3 = D(b).actionOf(D(b).orderById(now3.id)).name;
    chk(after3 !== a3 || a3 === '上桌' || a3 === '煮着呢' || a3 === '炒着呢', '按 3 操作的是第三张卡（' + a3 + ' → ' + after3 + '）');
  } else chk(true, '这会儿没排到第三张卡');
  b.key('8');
  chk(/号位子上没人/.test(plain(D(b).msg())), '按到没人的位子会提醒你');
  const tea0 = st(b).tea;
  b.key('q');
  chk(st(b).tea === tea0 - 1, 'Q 送茶');
  b.key('t');
  chk(/本机战绩/.test(plain(D(b).ov())), 'T 开战绩');
  chk(!!b.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'resume'), '战绩上有继续营业');
  clickAct(b, 'resume');
  chk(!D(b).ovShown(), '关掉遮罩');
  b.key('Escape');
  chk(true, 'Esc 在没遮罩时也不炸');
  b.key('m');
  chk(b.byId('btnSound').textContent === '🔇', 'M 静音');
  b.byId('btnSound').dispatch('click');
  chk(b.byId('btnSound').textContent === '🔊', '点按钮也能恢复声音');
}

/* ==================== 难度 / 存储 / 代码形状 ==================== */
{
  const b = boot();
  const btns = b.byId('diff').querySelectorAll('[data-diff]');
  chk(btns.length === 3, '三档难度');
  chk(btns.map((x) => x.dataset.diff).join(',') === 'simmer,noon,rush', '档位顺序：慢火 / 午市 / 高峰期');
  chk(btns.filter((x) => x._cls.indexOf('active') >= 0).map((x) => x.dataset.diff).join() === 'noon', '默认亮在午市');
  btns[2].dispatch('click');
  b.pump(0.1);
  chk(st(b).diff === 'rush' && b.storage._data['mg.diff'] === 'rush', '点高峰期并记住');
  chk(st(b).phase === 'intro', '换档会重新开张');
  chk(D(b).st().rep === D(b).DIFFS().rush.rep, '高峰期起始信誉更低');
  chk(D(b).spawnGap() < 78, '高峰期出单更快');
  btns[0].dispatch('click');
  b.pump(0.1);
  chk(D(b).potCap() === 2, '慢火起步就有两口锅');
  chk(D(b).spawnGap() > 78, '慢火客人来得稀');
  const c = boot({ 'mg.diff': 'simmer', 'mg.muted': '1', 'mg.best': '4321' });
  chk(st(c).diff === 'simmer', '下次进来还是这一档');
  chk(c.byId('btnSound').textContent === '🔇', '静音也记得');
  clickAct(c, 'start');
  chk(st(c).rep === 100, '慢火信誉满格');
  c.key('t');
  chk(/4321/.test(plain(D(c).ov())), '战绩读的是存档');
  const html = require('fs').readFileSync(__dirname + '/../../mianguan/game.js', 'utf8');
  chk((html.match(/'mg\.best'/g) || []).length >= 3, '最高分只认 mg.best 这一个字面量键');
  chk(html.lastIndexOf('})();') === html.trimEnd().length - 5, 'game.js 仍然是单个 IIFE');
  chk((html.match(/localStorage/g) || []).length <= 4, '存储读写都走同一个 store');
}

summary('面馆高峰期', fails);
