'use strict';
/* 跳一跳：距离公式 / 台子可达性 / 站桩计时 三块地基
   重点核对：① 落点距离是蓄力 ms 的纯函数，chargeFor 能反解，飞行时长也是它的函数
   ② 生成的每一段台子都必须「有一档 16ms 的蓄力能落上去」，且相邻台子的落差永远跳得上去、
        间距永远飞得过 —— 三档难度 × 20 关 × 40 段全都要成立，否则就是发死图
   ③ 正中/稳/踩边/扑空四种落点判定要和公式对得上；原地蹦一下不许刷分
   ④ 站着不动超时判负；蓄力与飞行不吃这个时间，暂停与遮罩必须冻住一切
   ⑤ 同种子同走法的机器人分数必须一字不差 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, state: state, level: level, score: score, jumps: jumps,
    combo: combo, bestCombo: bestCombo, perfects: perfects, chargeMs: chargeMs, idleMs: idleMs, capped: capped,
    px: px, py: py, cur: cur, camX: camX, camTo: camTo, clock: clock, landing: landing, flyT: flyT, flyDur: flyDur,
    ex: ex, ey: ey, arcH: arcH, lastGain: lastGain, seed: seedBase, plats: plats.length, paused: paused, fallT: fallT }; },
  K: function () { return { W: W, H: H, EDGE: EDGE, TOL_HIT: TOL_HIT, TOL_PERFECT: TOL_PERFECT, MAX_UP: MAX_UP,
    JUMPS_PER_LEVEL: JUMPS_PER_LEVEL, MAX_LEVEL: MAX_LEVEL, COMBO_CAP: COMBO_CAP, CAM_X: CAM_X, FALL_MS: FALL_MS,
    GROUND: GROUND, SKY: SKY, DIST_A: DIST_A, DIST_B: DIST_B, DIST_C: DIST_C, FRAME_MS: FRAME_MS }; },
  DIFFS: function () { return DIFFS; },
  distOf: distOf, airOf: airOf, chargeFor: chargeFor, levelOf: levelOf, gapRange: gapRange, widthRange: widthRange,
  dyRange: dyRange, levelMult: levelMult, comboMult: comboMult, bonusOf: bonusOf, gainOf: gainOf, platAt: platAt,
  chargeCap: chargeCap, idleLimit: idleLimit, curPlat: curPlat, arcY: arcY, clamp: clamp, rngOf: rngOf,
  startCharge: startCharge, release: release, stepFrame: stepFrame, newRound: newRound, act: act, stats: stats,
  intro: intro, hud: hud, genMore: genMore, ensurePlats: ensurePlats, gameOver: gameOver, saveRecords: saveRecords,
  togglePause: togglePause, winHint: winHint, land: land, platList: function () { return plats; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; }, setDiff: function (v) { diff = v; },
  setPlats: function (a) { plats = a.map(function (q) { return { x: q.x, y: q.y, w: q.w }; }); },
  setStand: function (i) { cur = i; px = plats[i].x + plats[i].w / 2; py = plats[i].y; camTo = Math.max(0, px - CAM_X); camX = camTo; },
  setVars: function (k, v) { if (k === 'level') level = v; else if (k === 'score') score = v;
    else if (k === 'idleMs') idleMs = v; else if (k === 'chargeMs') chargeMs = v; else if (k === 'paused') paused = v;
    else if (k === 'phase') phase = v; else if (k === 'state') state = v; else if (k === 'jumps') jumps = v;
    else if (k === 'combo') combo = v; else if (k === 'camTo') camTo = v; else if (k === 'camX') camX = v;
    else if (k === 'clock') clock = v; else if (k === 'cur') cur = v; else if (k === 'px') px = v;
    else if (k === 'perfects') perfects = v; else if (k === 'bestCombo') bestCombo = v; },
  hudText: function () { return { lv: elLv.textContent, combo: elCombo.textContent, idle: elIdle.textContent,
    jumps: elJumps.textContent, score: elScore.textContent, bar: barEl.style.width, barT: barTEl.textContent,
    idleCls: elIdle.className, jump: btnJump.innerHTML, sound: soundBtn ? soundBtn.textContent : '' }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('跳一跳源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-6 : eps);
function boot(storage, seed) {
  const g = loadGame('tiaoyi', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  if (seed !== undefined) G(g).setSeed(seed);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function pickDiff(g, name) {
  const b = g.byId('diff').querySelectorAll('[data-diff]').find((x) => x.dataset.diff === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function open(seed, storage) {
  const g = boot(storage, seed);
  clickAct(g, 'start');
  return g;
}
function hold(g, ms) { let f = 0; while (st(g).chargeMs < ms && f++ < 300) G(g).stepFrame(16); return st(g).chargeMs; }
function fly(g) { let f = 0; while (st(g).state === 'fly' && f++ < 400) G(g).stepFrame(16); return f; }
/* 完美机器人：在 16ms 的格点上挑最接近白心的那一档 */
function botJump(g) {
  const ps = G(g).platList();
  const tgt = ps[st(g).cur + 1];
  if (!tgt) return false;
  const from = st(g).px, cap = G(g).chargeCap();
  let best = 0, bestOff = Infinity;
  for (let t = 0; t <= cap; t += 16) {
    const off = Math.abs(from + G(g).distOf(t) - (tgt.x + tgt.w / 2));
    if (off < bestOff) { bestOff = off; best = t; }
  }
  G(g).startCharge();
  hold(g, best);
  G(g).release();
  fly(g);
  return true;
}
const mkPlat = (x, y, w) => ({ x, y, w });

/* ==================== 1. 距离、时长与关卡公式 ==================== */
const g = open(20260918);
const K = G(g).K();
const DIFFS = G(g).DIFFS();
chk(K.W === 480 && K.H === 420, '逻辑场地 480×420，横版一条道');
chk(G(g).distOf(0) === K.DIST_A, '零蓄力也有一步基础距离 26px');
chk(near(G(g).distOf(500), 26 + 0.58 * 500 + 0.00012 * 500 * 500), '距离 = 26 + 0.58t + 0.00012t²');
let mono = true;
for (let t = 16; t <= DIFFS.norm.charge; t += 16) if (G(g).distOf(t) <= G(g).distOf(t - 16)) mono = false;
chk(mono, '蓄力越久一定跳得越远（严格单调）');
chk(G(g).distOf(99999) === G(g).distOf(DIFFS.norm.charge), '超过满力就不再给距离');
chk(G(g).distOf(-5) === K.DIST_A, '负蓄力不会倒着跳');
chk(G(g).chargeCap() === 1500 && near(G(g).distOf(1500), 26 + 870 + 270), '标准手感满力 = 1166px');
chk(near(G(g).airOf(0), 280) && near(G(g).airOf(500), 340), '飞行时长 = 280 + 0.12×蓄力');
let rt = true;
for (let d = 40; d <= 1100; d += 40) {
  const t = G(g).chargeFor(d);
  if (!near(G(g).distOf(t), d, 0.6)) rt = false;
}
chk(rt, 'chargeFor 是 distOf 的反函数：想跳多远就知道蓄多久');
chk(G(g).chargeFor(99999) === G(g).chargeCap(), '够不着的距离就告诉你「满力」');
chk(G(g).levelOf(0) === 1 && G(g).levelOf(8) === 2 && G(g).levelOf(16) === 3, '每 8 台升一关');
chk(G(g).levelOf(8 * (K.MAX_LEVEL - 1)) === K.MAX_LEVEL && G(g).levelOf(99999) === K.MAX_LEVEL, '关卡封顶 20');
chk(near(G(g).levelMult(1), 1) && near(G(g).levelMult(9), 1.4), '关卡加成每关 +5%');
chk(G(g).comboMult(0) === 1 && G(g).comboMult(2) === 1.5 && G(g).comboMult(99) === 1 + K.COMBO_CAP * 0.25, '连击倍率最多 3×');
chk(G(g).bonusOf(5) === 20 && G(g).bonusOf(11) === 20 && G(g).bonusOf(12) === 6 && G(g).bonusOf(26) === 6 && G(g).bonusOf(27) === 0, '白心 11px 内 20 分，26px 内 6 分，再偏就没奖');

/* ==================== 2. 三档手感与「永远跳得到」的下限 ==================== */
chk(DIFFS.easy.charge > DIFFS.norm.charge && DIFFS.norm.charge > DIFFS.hard.charge, '满力时长：慢慢跳 > 标准 > 极限');
chk(DIFFS.easy.idle > DIFFS.norm.idle && DIFFS.norm.idle > DIFFS.hard.idle, '站桩宽限量同理递减');
chk(DIFFS.easy.mult < DIFFS.norm.mult && DIFFS.norm.mult < DIFFS.hard.mult, '越难的分值倍率越高');
chk(DIFFS.hard.gapK > 1 && DIFFS.hard.wideK < 1, '极限难度：缝更宽、台子更窄');
chk(G(g).gapRange(1)[0] < G(g).gapRange(9)[0], '关卡越高，最近的缝也被拉远');
chk(G(g).widthRange(9)[1] < G(g).widthRange(1)[1], '关卡越高台子越窄');
chk(G(g).widthRange(99)[0] >= 26 && G(g).widthRange(99)[1] >= 48, '台子再窄也有下限，不会变成针尖');
let reach = true, climb = true;
for (const d of ['easy', 'norm', 'hard']) {
  G(g).setDiff(d);
  for (let lv = 1; lv <= K.MAX_LEVEL; lv++) {
    const gr = G(g).gapRange(lv);
    if (gr[1] > G(g).distOf(G(g).chargeCap())) reach = false;
    if (G(g).dyRange(lv)[0] < -K.MAX_UP) climb = false;
  }
}
chk(reach, '每一档每一关的缝宽上限都小于满力距离：不存在跳不过去的沟');
chk(climb, '高度落差上限 64px 永远小于能跳上去的 72px：不存在爬不上去的台子');
G(g).setDiff('norm');

/* ==================== 3. 生成器压力测试：每一段都必须跳得上去 ==================== */
const gs = open(202609181);
let genBad = '';
for (const d of ['easy', 'norm', 'hard']) {
  for (let lv = 1; lv <= K.MAX_LEVEL; lv++) {
    G(gs).setDiff(d);
    G(gs).setVars('level', lv);
    for (let i = 0; i < 30; i++) G(gs).genMore();
    const ps = G(gs).platList();
    const cap = G(gs).chargeCap();
    const tag = d + '/lv' + lv + ' ';
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i], b = ps[i + 1];
      const from = a.x + a.w / 2;
      if (b.x <= a.x + a.w) { genBad += tag + '台子重叠 '; break; }
      if (b.y < K.SKY || b.y > K.GROUND) { genBad += tag + 'y 出界 '; break; }
      if (b.x - (a.x + a.w) > G(gs).distOf(cap)) { genBad += tag + '缝宽超过满力 '; break; }
      if (b.y < a.y - K.MAX_UP) { genBad += tag + '落差爬不上去 '; break; }
      let hits = 0;
      for (let t = 0; t <= cap; t += 16) {
        const land = from + G(gs).distOf(t);
        if (land >= b.x - K.EDGE && land <= b.x + b.w + K.EDGE) hits++;
      }
      if (hits < 1) { genBad += tag + '16ms 格点上无落点 '; break; }
    }
  }
}
chk(genBad === '', '600 段台子（3 档 × 20 关 × 30 段）全部「有一档蓄力能落上去」' + (genBad ? '：' + genBad.slice(0, 110) : ''));
G(gs).setDiff('norm');
G(gs).setVars('level', 1);
const beforeN = G(gs).platList().length;
G(gs).setVars('camTo', G(gs).platList()[beforeN - 1].x);
G(gs).ensurePlats();
chk(G(gs).platList().length > beforeN, '相机往前推就自动补台子（无限关卡不用预生成）');
const gseed = boot({}, 5150);
clickAct(gseed, 'start');
const mapA = G(gseed).platList().map((p) => Math.round(p.x) + '/' + Math.round(p.y) + '/' + p.w).join(',');
const gseed2 = boot({}, 5150);
clickAct(gseed2, 'start');
chk(mapA === G(gseed2).platList().map((p) => Math.round(p.x) + '/' + Math.round(p.y) + '/' + p.w).join(','), '#seed 相同 → 同一串台子（可以拿去考朋友）');
const gseed3 = boot({}, 5151);
clickAct(gseed3, 'start');
chk(mapA !== G(gseed3).platList().map((p) => p.x + '/' + p.y + '/' + p.w).join(','), '换种子就是另一串台子');
chk(st(gseed).cur === 0 && st(gseed).px === G(gseed).platList()[0].x + G(gseed).platList()[0].w / 2, '起手站在第一个台子正中');

/* ==================== 4. 落点判定 ==================== */
const gl = open(202609182);
function place(g2, list, i) {
  G(g2).setPlats(list);
  G(g2).setStand(i === undefined ? 0 : i);
}
place(gl, [mkPlat(0, 300, 100), mkPlat(200, 300, 60)]);
chk(G(gl).platAt(10) === 0 && G(gl).platAt(99) === 0, '台子范围内算命中');
chk(G(gl).platAt(110) === -1 && G(gl).platAt(190) === -1, '缝里就是扑空');
chk(G(gl).platAt(103) === 0 && G(gl).platAt(197) === 1, '压着边缘 3px 容差也能上台');
chk(G(gl).platAt(-1) === 0 && G(gl).platAt(261) === 1, '起跳点左边与终点右边同样有容差');
chk(G(gl).platAt(300) === -1, '飞过头 beyond 就是掉下去');
chk(G(gl).st().cur === 0 && G(gl).platAt(G(gl).st().px) === 0, '玩家当前站的那格当然算命中');
const ga = open(202609183);
place(ga, [mkPlat(0, 300, 120), mkPlat(230, 300, 60)]);
G(ga).setVars('px', 60);
G(ga).startCharge();
hold(ga, 320);
const chargeWas = st(ga).chargeMs;
chk(near(chargeWas / 16, Math.round(chargeWas / 16)), '蓄力按整帧累积，永远是 16 的倍数');
G(ga).release();
chk(st(ga).state === 'fly' && st(ga).capped === false, '松手进入飞行');
chk(near(st(ga).ex, 60 + G(ga).distOf(chargeWas), 1e-9), '落点 = 起跳点 + distOf(蓄力)');
chk(near(st(ga).flyDur, G(ga).airOf(chargeWas), 1e-9), '飞行时长 = airOf(蓄力)');
chk(near(st(ga).arcH, 42 + G(ga).distOf(chargeWas) * 0.10, 1e-9), '拱高随距离长，跳得远才跳得高');
chk(st(ga).landing === 1, '这一炮算命中下一个台子');
G(ga).stepFrame(Math.ceil(st(ga).flyDur));
chk(st(ga).state === 'aim' && st(ga).jumps === 1 && st(ga).cur === 1, '飞满时长正好落地，跳数 +1');
chk(st(ga).py === 300 && near(st(ga).px, st(ga).ex, 1e-9), '落地后脚底贴住台面，横坐标就是算好的落点');

/* ==================== 5. 蓄力、满力与四种落点 ==================== */
const gc2 = open(202609184);
place(gc2, [mkPlat(0, 300, 120), mkPlat(260, 300, 80)]);
G(gc2).setStand(0);
chk(G(gc2).startCharge() === true, '站着的时候可以蓄力');
chk(G(gc2).startCharge() === false, '已经在蓄力就不会重新起势');
G(gc2).stepFrame(16);
chk(st(gc2).state === 'charge' && st(gc2).chargeMs === 16, '一帧蓄 16ms');
chk(G(gc2).release() === true && st(gc2).state === 'fly', '松手就飞');
chk(G(gc2).release() === false, '飞行中再松手不管事');
fly(gc2);
chk(st(gc2).state === 'aim' && st(gc2).jumps === 0 && st(gc2).cur === 0, '这一炮只往前蹦了 35px，还在原台子上（跳数不涨）');
chk(st(gc2).score === Math.round(2 * DIFFS.norm.mult * G(gc2).levelMult(1)), '原地蹦一下只给 2 分意思意思，刷不了分');
chk(plain(G(gc2).msgText()).indexOf('原地蹦') >= 0, '原地蹦会告诉你');
const gover = open(2026091841);
place(gover, [mkPlat(0, 300, 120), mkPlat(260, 300, 80)]);
G(gover).setStand(0);
G(gover).startCharge();
hold(gover, DIFFS.norm.charge + 400);
chk(st(gover).chargeMs === DIFFS.norm.charge, '蓄力封顶满力，不会无限涨');
chk(st(gover).capped === true, '满力会亮红并提醒');
G(gover).stepFrame(16);
chk(st(gover).chargeMs === DIFFS.norm.charge, '满力之后力度停在那儿不再涨');
G(gover).release();
chk(st(gover).landing === -1, '满力 1166px 直接飞过所有台子：落点谁也没命中');
chk(near(st(gover).ex, 60 + G(gover).distOf(DIFFS.norm.charge), 1e-9), '落点横坐标严格按公式');
fly(gover);
chk(st(gover).state === 'fall', '没命中就进入下坠动画');
const fallSnap = st(gover).py;
G(gover).stepFrame(16);
chk(st(gover).py > fallSnap, '下坠期间一直往下掉');
let fellFrames = 1;
while (st(gover).phase === 'play' && fellFrames++ < 200) G(gover).stepFrame(16);
chk(st(gover).phase === 'over' && fellFrames >= Math.round(K.FALL_MS / 16), '下坠动画放完（' + K.FALL_MS + 'ms）才判负');
chk(plain(G(gover).ov()).indexOf('掉下去') >= 0, '遮罩写明了原因');
const gedge = open(2026091842);
const dEdge = G(gedge).distOf(208);                     // 13 帧整的蓄力，落点完全可预测
place(gedge, [mkPlat(0, 300, 120), mkPlat(60 + dEdge + 1, 300, 80)]);
G(gedge).setStand(0);
G(gedge).startCharge();
hold(gedge, 208);
chk(st(gedge).chargeMs === 208, '蓄力停在整帧格点上');
G(gedge).release();
chk(near(st(gedge).ex, 60 + dEdge, 1e-9), '落点就是公式算出来的那一处');
fly(gedge);
chk(st(gedge).cur === 1 && st(gedge).jumps === 1, '压着台子左边缘 3px 容差也算上台');
chk(st(gedge).combo === 0 && plain(G(gedge).msgText()).indexOf('踩边') >= 0, '踩边只算过，连击清零');
chk(st(gedge).lastGain === G(gedge).gainOf(Math.abs(st(gedge).px - (60 + dEdge + 41)), 1, 0) && st(gedge).lastGain === 10, '踩边这一下按公式给分（无正中奖励）');
const gp = open(202609185);
place(gp, [mkPlat(0, 300, 120), mkPlat(200, 300, 80)]);
G(gp).setStand(0);
const center = 240, from0 = st(gp).px;
G(gp).startCharge();
hold(gp, Math.floor(G(gp).chargeFor(center - from0) / 16) * 16);
const cWas = st(gp).chargeMs;
G(gp).release();
fly(gp);
const offReal = Math.abs(st(gp).px - center);
chk(st(gp).cur === 1 && st(gp).jumps === 1, '按公式反解出来的蓄力（' + cWas + 'ms）稳稳落在第二个台子上');
chk(offReal <= K.TOL_PERFECT, '落点离白心 ' + offReal.toFixed(1) + 'px，正中判定成立');
chk(st(gp).combo === 1 && st(gp).perfects === 1, '连击 +1，正中计数 +1');
chk(plain(G(gp).msgText()).indexOf('正中白心') >= 0, '正中会给一句表扬');
chk(st(gp).lastGain === G(gp).gainOf(offReal, 1, 1), '这一板的分跟公式对得上');
chk(st(gp).lastGain > st(gedge).lastGain && st(gp).lastGain === 38 && st(gedge).lastGain === 10, '同样上台，正中 38 分对踩边 10 分，贵得多');
const gchain = open(2026091851);
const dChain = G(gchain).distOf(352);
place(gchain, [mkPlat(0, 300, 120), mkPlat(200, 300, 60), mkPlat(60 + dChain - 70, 300, 80)]);
G(gchain).setStand(0);
G(gchain).startCharge();
hold(gchain, 352);
G(gchain).release();
fly(gchain);
chk(st(gchain).cur === 2 && st(gchain).jumps === 2, '一口气串到第三个台子，跳数按串过的台子数算');
chk(st(gchain).lastGain > 0 && st(gchain).perfects === 0, '串跳不给正中计数');
chk(st(gchain).combo === 0, '串跳给分但连击要断（不是白心）');
chk(st(gchain).lastGain === G(gchain).gainOf(Math.abs(st(gchain).px - (60 + dChain - 30)), 2, 0) &&
  G(gchain).gainOf(30, 2, 0) === G(gchain).gainOf(30, 1, 0) + 15, '串一台多给 15 分');
const gbk = open(202609186);
place(gbk, [mkPlat(0, 300, 120), mkPlat(260, 150, 80)]);
G(gbk).setStand(0);
G(gbk).startCharge();
hold(gbk, G(gbk).chargeFor(300 - 60));
G(gbk).release();
chk(st(gbk).landing === -1, '对面台子高出 150px，超过起跳上限：算撞沿不许直拔');
fly(gbk);
chk(st(gbk).state === 'fall', '撞沿之后就是掉下去');
const ghop = open(2026091861);
place(ghop, [mkPlat(0, 300, 400), mkPlat(600, 300, 80)]);
G(ghop).setStand(0);
G(ghop).startCharge();
hold(ghop, 200);
G(ghop).release();
fly(ghop);
chk(st(ghop).cur === 0 && st(ghop).jumps === 0 && st(ghop).score === 2, '超长台子上原地蹦：不算跳数、只给 2 分');
chk(st(ghop).idleMs === 0, '落地会重置站桩计时器');

/* ==================== 6. 站桩判负与暂停冻结 ==================== */
const gi = open(202609187);
chk(st(gi).idleMs > 0 && st(gi).idleMs < 400, '站着就开始计时');
G(gi).setVars('idleMs', G(gi).idleLimit() - 80);
for (let i = 0; i < 8 && st(gi).phase === 'play'; i++) G(gi).stepFrame(16);
chk(st(gi).phase === 'over' && plain(G(gi).ov()).indexOf('站着不动') >= 0, '站桩超过 ' + (DIFFS.norm.idle / 1000) + ' 秒直接判负');
chk(gi.storage._data['ty.best'] === undefined, '零分散场不会污染最高分键');
const gi2 = open(202609188);
G(gi2).setVars('idleMs', 100);
G(gi2).startCharge();
chk(st(gi2).idleMs === 0, '开始蓄力就把站桩计时清零');
for (let i = 0; i < 20; i++) G(gi2).stepFrame(16);
chk(st(gi2).idleMs === 0, '蓄力期间站桩计时不再累加（按住不放不会输）');
G(gi2).release();
const idleFly0 = st(gi2).idleMs;
G(gi2).stepFrame(16);
G(gi2).stepFrame(16);
chk(st(gi2).state === 'fly' && st(gi2).idleMs === idleFly0, '飞行中也不吃站桩时间');
const gi3 = open(202609189);
G(gi3).setVars('idleMs', 0);
G(gi3).togglePause();
const snap = [st(gi3).clock, st(gi3).idleMs, st(gi3).px];
for (let i = 0; i < 60; i++) G(gi3).stepFrame(16);
chk(st(gi3).clock === snap[0] && st(gi3).idleMs === snap[1] && st(gi3).px === snap[2], '暂停时一切静止');
G(gi3).togglePause();
G(gi3).stepFrame(16);
chk(st(gi3).clock === snap[0] + 16, '解除暂停继续走表');
G(gi3).startCharge();
G(gi3).stepFrame(16);
chk(st(gi3).chargeMs === 16, '一帧一帧蓄力');
G(gi3).togglePause();
for (let i = 0; i < 30; i++) G(gi3).stepFrame(16);
chk(st(gi3).chargeMs === 16, '蓄力中途暂停，力度条也不会偷偷涨');
G(gi3).togglePause();
G(gi3).stepFrame(16);
chk(st(gi3).chargeMs === 32, '解除暂停接着蓄');
const gid = open(202609190);
gid.pump(0.1);
G(gid).gameOver('测试');
const afterOver = [st(gid).clock, st(gid).px];
for (let i = 0; i < 30; i++) G(gid).stepFrame(16);
chk(st(gid).clock === afterOver[0] && st(gid).px === afterOver[1], '遮罩弹着的时候物理彻底停住');
chk(G(gid).ovShown() === true && clickAct(gid, 'again'), '散场页给一个再来一局');
chk(st(gid).phase === 'play' && st(gid).jumps === 0 && st(gid).score === 0 && st(gid).combo === 0 && st(gid).cur === 0, '再来一局一切归零');
chk(st(gid).idleMs < 200 && st(gid).camX === st(gid).camTo && st(gid).camX === 0, '重开后回到第一个台子、相机归位');

/* ==================== 7. 连击、关卡与算分 ==================== */
const gsc = open(202609191);
G(gsc).setVars('level', 1);
chk(G(gsc).gainOf(5, 1, 0) === 30, '标准手感：正中 10+20 = 30 分');
chk(G(gsc).gainOf(5, 1, 4) === Math.round(30 * 2), '连击 ×4 → 2 倍');
chk(G(gsc).gainOf(200, 1, 0) === 10, '偏得离谱也有 10 分保底');
chk(G(gsc).gainOf(5, 3, 0) === 60, '串两台 = 正中 30 + 15×2 = 60');
G(gsc).setVars('level', 11);
chk(G(gsc).gainOf(5, 1, 0) === Math.round(30 * 1.5), '第 11 关有 ×1.5 关卡加成');
G(gsc).setVars('level', 1);
G(gsc).setDiff('hard');
chk(G(gsc).gainOf(5, 1, 0) === Math.round(30 * 1.6), '极限距离 ×1.6');
G(gsc).setDiff('easy');
chk(G(gsc).gainOf(5, 1, 0) === Math.round(30 * 0.8), '慢慢跳 ×0.8，只够热身');
G(gsc).setDiff('norm');
G(gsc).setVars('combo', 1);
chk(G(gsc).comboMult(99) === 3 && G(gsc).gainOf(5, 1, 99) === 90, '连击再高也只到 ×3 封顶');
/* ==================== 8. 相机、HUD、键盘与落盘 ==================== */
const gh = open(202609192);
const h0 = G(gh).hudText();
chk(String(h0.lv) === '1' && String(h0.jumps) === '0' && String(h0.score) === '0', '顶栏开局：第 1 关 0 台 0 分');
chk(h0.combo === '—', '零连击显示成破折号');
chk(h0.idle === (DIFFS.norm.idle / 1000).toFixed(1) + 's' || parseFloat(h0.idle) > 5.2, '还能站 6.0s 起步');
chk(String(h0.bar) === '0%', '力度条开局是空的');
G(gh).startCharge();
for (let i = 0; i < 20; i++) G(gh).stepFrame(16);
const h1 = G(gh).hudText();
chk(h1.bar === Math.round(100 * 320 / DIFFS.norm.charge) + '%', '力度条按蓄力百分比涨');
chk(h1.barT.indexOf('力度') === 0 && h1.barT.indexOf('满') < 0, '没满力不写「满」');
chk(h1.jump.indexOf('松手跳') >= 0, '蓄力时按钮提示松手');
hold(gh, DIFFS.norm.charge);
chk(G(gh).hudText().barT.indexOf('满') >= 0, '满力时文案提醒');
chk(st(gh).camX === st(gh).camTo && st(gh).camTo === 0, '第一个台子上相机不用挪');
G(gh).release();
fly(gh);
chk(st(gh).camTo === st(gh).px - K.CAM_X, '相机目标就是「玩家钉在画面 150px 处」');
for (let i = 0; i < 40; i++) G(gh).stepFrame(16);
chk(Math.abs(st(gh).camX - st(gh).camTo) < 2, '相机平滑跟到位');
G(gh).hud();
chk(parseFloat(G(gh).hudText().idle) < DIFFS.norm.idle / 1000, '站桩倒计时在往下走');
G(gh).setVars('idleMs', DIFFS.norm.idle - 1200);
G(gh).hud();
chk(G(gh).hudText().idleCls.indexOf('bad') >= 0, '还剩 1.2 秒时倒计时变红');
const gaud = boot({}, 202609195);
clickAct(gaud, 'start');
gaud.byId('cv').dispatch('pointerdown', { pointerId: 1, isPrimary: true });
chk(st(gaud).state === 'charge', '按住画面开始蓄力');
gaud.byId('cv').dispatch('pointerup', { pointerId: 1, isPrimary: true });
chk(st(gaud).state === 'fly', '松手立刻起跳');
const oscJump = gaud.audio.created.osc;
for (let i = 0; i < 60; i++) G(gaud).stepFrame(16);
chk(gaud.audio.created.osc > oscJump, '起跳与落地都有音效');
chk(st(gaud).state !== 'charge', 'keyup 之后绝不留在蓄力态');
G(gaud).startCharge();
for (let i = 0; i < 12; i++) G(gaud).stepFrame(16);
gaud.win.dispatch('keydown', { key: ' ' });
chk(st(gaud).paused === false && st(gaud).state === 'charge', '空格按下去 = 接着蓄力（不是暂停）');
gaud.win.dispatch('keyup', { key: ' ' });
chk(st(gaud).state === 'fly', '松开空格就跳出去');
fly(gaud);
chk(st(gaud).phase === 'play' || st(gaud).state === 'fall', '跳完落到台上或者扑空，绝不会卡在半路');
G(gaud).gameOver('收尾');
G(gaud).act('again');
chk(st(gaud).phase === 'play' && st(gaud).state === 'aim', '散场后再来一局回到站位');
gaud.win.dispatch('keydown', { key: 'm' });
chk(gaud.storage._data['ty.muted'] === '1' && G(gaud).hudText().sound === '🔇', 'M 键静音并落盘');
const oscMuted = gaud.audio.created.osc + gaud.audio.created.gain;
G(gaud).setStand(0);
G(gaud).startCharge();
for (let i = 0; i < 30; i++) G(gaud).stepFrame(16);
G(gaud).release();
for (let i = 0; i < 60; i++) G(gaud).stepFrame(16);
chk(gaud.audio.created.osc + gaud.audio.created.gain === oscMuted, '静音之后一声不出');
chk(st(gaud).state === 'aim' || st(gaud).state === 'fall', '静音不影响玩法推进');
gaud.win.dispatch('keydown', { key: 'm' });
chk(gaud.storage._data['ty.muted'] === '0' && G(gaud).hudText().sound === '🔊', '再按一次取消静音');

const gk = boot({}, 202609193);
chk(plain(G(gk).ov()).indexOf('跳一跳') >= 0 && plain(G(gk).ov()).indexOf('开始跳') >= 0, '遮罩有玩法说明和开始按钮');
chk(plain(G(gk).ov()).indexOf(String(DIFFS.norm.charge)) >= 0, '遮罩直接把满力时长告诉你');
gk.win.dispatch('keydown', { key: ' ' });
gk.pump(0.1);
chk(st(gk).phase === 'play' && !G(gk).ovShown(), '空格开局');
gk.win.dispatch('keydown', { key: 't' });
gk.pump(0.1);
chk(plain(G(gk).ov()).indexOf('本机战绩') >= 0 && plain(G(gk).ov()).indexOf('满力') >= 0, 'T 键看战绩，里面写着手感参数');
chk(G(gk).ov().indexOf('data-act="resume"') >= 0, '局内看战绩，按钮写着继续跳');
G(gk).act('resume');
chk(!G(gk).ovShown(), '战绩页可以回场');
gk.win.dispatch('keydown', { key: 'p' });
chk(st(gk).paused === true, 'P 键暂停');
gk.win.dispatch('keydown', { key: 'p' });
chk(st(gk).paused === false, '再按解除');
gk.win.dispatch('keydown', { key: 'Escape' });
chk(st(gk).paused === true, 'Esc 也暂停');
gk.win.dispatch('keydown', { key: 't' });
chk(G(gk).ov().indexOf('data-act="resume"') >= 0, '暂停中弹战绩');
G(gk).act('resume');
chk(st(gk).paused === false, '回场顺手解除暂停');
gk.win.dispatch('keydown', { key: 'n' });
gk.pump(0.1);
chk(st(gk).phase === 'intro' && st(gk).jumps === 0, 'N 键重开并回到遮罩');
gk.win.dispatch('keydown', { key: 'Enter' });
gk.pump(0.1);
chk(st(gk).phase === 'play', '遮罩上按空格/回车都能开局');
chk(pickDiff(gk, 'hard') && st(gk).diff === 'hard' && gk.storage._data['ty.diff'] === 'hard', '点难度按钮切换并落盘');
chk(st(gk).phase === 'intro' && G(gk).chargeCap() === DIFFS.hard.charge, '换难度重开，满力时长立刻变了');
chk(boot({ 'ty.diff': 'easy' }).ctx.__g.chargeCap() === DIFFS.easy.charge, '下次打开记得住难度');
chk(boot({ 'ty.diff': 'x' }).ctx.__g.st().diff === 'norm', '认不出的难度回落标准手感');
const grec = boot({ 'ty.best': '99999', 'ty.jump': '500', 'ty.lv': '12' });
G(grec).stats();
const recTxt = plain(G(grec).ov());
chk(recTxt.indexOf('99999') >= 0 && recTxt.indexOf('500') >= 0 && recTxt.indexOf('12') >= 0, '战绩页读得到最高分/累计跳数/最高关卡三个键');
chk(boot({ 'ty.muted': '1' }).ctx.__g.hudText().sound === '🔇', '下次打开还是静音');
const gold = boot({ 'ty.best': '99999' }, 5);
G(gold).act('start');
G(gold).gameOver('测试');
chk(gold.storage._data['ty.best'] === '99999', '破不了纪录就不许覆盖旧纪录');
chk(Number(gold.storage._data['ty.lv']) >= 1, '哪怕只跳了一关也会把最远关卡写进去');
/* ==================== 9. 机器人：一板一眼按公式跳 ==================== */
function botRun(seed, jumps) {
  const gg = open(seed);
  const seq = [];
  for (let i = 0; i < jumps; i++) {
    if (st(gg).phase !== 'play') break;
    if (!botJump(gg)) break;
    seq.push(st(gg).score + ':' + st(gg).combo + ':' + st(gg).level);
  }
  G(gg).gameOver('收尾');
  return { seq: seq, g: gg, s: st(gg), data: gg.storage._data };
}
const b1 = botRun(202609194, 40);
chk(b1.seq.length === 40 && b1.s.jumps >= 40, '机器人 40 跳全部落台（跳数 ' + b1.s.jumps + '）');
chk(b1.s.level === G(b1.g).levelOf(b1.s.jumps) && b1.s.level > 3, '跳数一多就升关（到了第 ' + b1.s.level + ' 关）');
chk(b1.s.combo > 20 && b1.s.bestCombo === b1.s.combo, '机器人几乎板板正中，连击一路涨');
chk(Number(b1.data['ty.jump']) >= 40 && b1.data['ty.lv'] === String(b1.s.level), '累计跳数与最高关卡落盘');
chk(b1.data['ty.best'] === String(b1.s.score), '散场把最高分写进去');
const b2 = botRun(202609194, 40);
chk(b2.seq.join('|') === b1.seq.join('|'), '同种子同走法 → 每一跳的分数序列一模一样');
const b3 = botRun(202609195, 24);
chk(b3.seq.length === 24 && b3.s.score > 1000, '换个种子也照样一路跳（' + b3.s.score + ' 分）');
const bhard = open(202609196);
pickDiff(bhard, 'hard');
clickAct(bhard, 'start');
let hardJumps = 0;
while (st(bhard).phase === 'play' && hardJumps < 20) { if (!botJump(bhard)) break; hardJumps++; }
chk(hardJumps === 20 && st(bhard).score > 2000, '极限距离也养得活机器人（' + hardJumps + ' 跳 ' + st(bhard).score + ' 分）');
const idleLose = open(202609197);
for (let i = 0; i < Math.ceil(DIFFS.norm.idle / 16) + 2; i++) G(idleLose).stepFrame(16);
chk(st(idleLose).phase === 'over', '开局干站着不跳，' + (DIFFS.norm.idle / 1000) + ' 秒后必然判负');
const draws0 = idleLose.draws();
idleLose.pump(0.2);
chk(idleLose.draws() > draws0, '散场后画面仍然在重绘（遮罩与场地不会糊掉）');

summary('跳一跳', fails);
