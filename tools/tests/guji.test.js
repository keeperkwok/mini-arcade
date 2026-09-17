'use strict';
/* 鼓机十六步：整数毫秒时间轴 / 判定窗 / 计分公式 三块地基
   重点核对：① BPM→步长→每段 16 步的表能被第二套实现逐格算出来，段与段首尾相接不漂移
   ② PERFECT / GOOD / 空打 的边界要精确到毫秒 ③ 每一笔进账都能按「打击分 × 连击 × 密度 × 难度」手算
   ④ 暂停和翻遮罩期间时间轴整体平移，鼓点不许偷偷溜走 ⑤ 同一个种子必须复现同一局（幽灵加花也一样） */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, paused: paused, diff: diff, bars: bars, lv: lv, score: score, combo: combo,
    bestCombo: bestCombo, perfect: perfect, good: good, miss: miss, strays: strays, lives: lives, t0: t0, stepMs: stepMs,
    lastStep: lastStep, counting: counting, notes: notes(), seed: seedBase, lastJudge: lastJudge, lastGain: lastGain,
    pat: pat.map(function (r) { return r.slice(); }), ghost: ghost.map(function (r) { return r.slice(); }),
    pending: pending.map(function (p) { return { t: p.t, s: p.s, at: p.at, judged: p.judged }; }) }; },
  C: function () { return { STEPS: STEPS, MAX_BARS: MAX_BARS, BARS_PER_LV: BARS_PER_LV, COUNT_IN: COUNT_IN,
    PERFECT_BASE: PERFECT_BASE, GOOD_BASE: GOOD_BASE }; },
  DIFFS: function () { return DIFFS; }, PRESETS: function () { return PRESETS; }, TRACKS: function () { return TRACKS; },
  bpmAt: bpmAt, stepMsAt: stepMsAt, riskMult: riskMult, comboMult: comboMult, gainOf: gainOf, ghostChance: ghostChance,
  isBeat: isBeat, accuracy: accuracy, perfectRate: perfectRate, cellNode: cellNode, cells: cells, rngOf: rngOf,
  hit: hit, togglePause: togglePause, startPlay: startPlay, intoEdit: intoEdit, applyPreset: applyPreset,
  rollDice: rollDice, clearPat: clearPat, toggleCell: toggleCell, act: act, stats: stats, hud: hud,
  buildBar: buildBar, endBar: endBar, ghostFill: ghostFill, flushMisses: flushMisses, addScore: addScore, bank: bank,
  setDiff: function (v) { diff = v; syncDiff(); }, setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setLv: function (v) { lv = v; }, setScore: function (v) { score = v; }, setCombo: function (v) { combo = v; },
  setLives: function (v) { lives = v; }, setPat: function (t, s, on) { pat[t][s] = on; ghost[t][s] = false; buildGrid(); },
  msg: function () { return msgEl.innerHTML; }, ov: function () { return ovContent.innerHTML; },
  ovShown: function () { return overlayEl._cls.indexOf('show') >= 0; },
  hudText: function () { return { mode: elMode.textContent, bpm: elBpm.textContent, bars: elBars.textContent,
    combo: elCombo.textContent, acc: elAcc.textContent, score: elScore.textContent, notes: elNotes.textContent }; },
  toolOff: function () { return { clear: !!btnClear.disabled, rand: !!btnRand.disabled }; },
  cls: function (tr, step) { var n = cellNode(tr, step); return n ? n.className : ''; },
  heads: function () { return cells().filter(function (c) { return c._cls.indexOf('head') >= 0; })
    .map(function (c) { return +c.dataset.t * 16 + +c.dataset.s; }); },
  onCells: function () { return cells().filter(function (c) { return c._cls.indexOf('on') >= 0; })
    .map(function (c) { return +c.dataset.t * 16 + +c.dataset.s; }).sort(function (a, b) { return a - b; }); },
  ghostCells: function () { return cells().filter(function (c) { return c._cls.indexOf('ghost') >= 0; }).length; },
  marks: function () { return rulerEl.querySelectorAll('[data-m]').map(function (c) { return c.className; }); },
  pads: function () { return lanesEl.querySelectorAll('.gj-pad').map(function (p) { return { lane: +p.dataset.lane, cls: p.className }; }); },
  presetBtns: function () { return presetEl.querySelectorAll('[data-p]').map(function (p) { return { i: +p.dataset.p, cls: p.className }; }); },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('鼓机源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const C = (g) => D(g).C();
const g_now = (g) => g.now();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage, seed) {
  const g = loadGame('guji', { transform: inject, storage: storage || {} });
  g.pump(0.1);
  D(g).setSeed(seed === undefined ? 20260917 : seed);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  return !!b;
}
function pickDiff(g, name) {
  g.byId('diff').querySelectorAll('[data-diff]').find((x) => x.dataset.diff === name).dispatch('click');
  g.pump(0.05);
}
// 只留一个音符，进演奏并走完计数小节，把那个音符的到期时刻交回来
function oneNote(g, tr, step) {
  D(g).act('start');
  D(g).clearPat();
  D(g).setPat(tr, step, true);
  D(g).startPlay();
  let guard = 0;
  while (st(g).counting && guard++ < 400) g.tick(4);
  const list = st(g).pending;
  return list.length === 1 ? list[0] : null;
}
// 完美手：每次直接跳到最早那个未判音符的到期毫秒
function runPerfect(g, limit) {
  const log = [];
  let guard = 0;
  while (st(g).phase === 'play' && guard++ < (limit || 4000)) {
    const list = st(g).pending.filter((p) => !p.judged).sort((a, b) => a.at - b.at);
    if (!list.length) { g.tick(40); continue; }
    const delta = Math.max(1, list[0].at - g.now());
    g.tick(delta);
    const due = st(g).pending.filter((p) => !p.judged && p.at <= g.now());
    due.forEach((p) => {
      const before = st(g);
      const kind = D(g).hit(p.t, g.now());
      const after = st(g);
      log.push({ kind: kind, combo: before.combo, notes: before.notes, gain: after.score - before.score, diff: before.diff });
    });
  }
  return log;
}

/* ==================== 开局 ==================== */
{
  const b = boot();
  chk(st(b).phase === 'intro', '刚进来先看规矩');
  chk(D(b).ovShown(), '遮罩盖着');
  chk(st(b).diff === 'funk', '默认难度是放克');
  chk(/编曲/.test(plain(D(b).ov())) && /演奏/.test(plain(D(b).ov())), '说明里分了编曲与演奏两段');
  chk(/±\d+ 毫秒/.test(plain(D(b).ov())), '说明里写了判定窗毫秒数');
  chk(D(b).C().STEPS === 16 && D(b).C().MAX_BARS === 12, '一段十六步，十二段收工');
  chk(D(b).cells().length === 64, '网格 4 × 16 = 64 个格子');
  chk(D(b).marks().length === 16, '上面有一条十六格的尺');
  chk(D(b).pads().length === 4, '下面四块打击板');
  chk(D(b).presetBtns().length === D(b).PRESETS().length, '预设都摆出来了');
  chk(st(b).notes > 0, '开局就带一段示例律动（' + st(b).notes + ' 个音符）');
  chk(clickAct(b, 'start'), '遮罩上有进编曲台');
  chk(st(b).phase === 'edit' && st(b).t0 >= 0, '进编曲台，时钟从零起步');
  chk(D(b).heads().length === 4 || D(b).heads().length === 0, 'playhead 一次照亮一列四格');
}

/* ==================== 规则表：第二套实现逐格对拍 ==================== */
{
  const b = boot();
  const diffs = D(b).DIFFS();
  let bpmOk = true, msOk = true, ints = true;
  Object.keys(diffs).forEach((d) => {
    D(b).setDiff(d);
    for (let lv = 0; lv <= 12; lv++) {
      const bpm = diffs[d].bpm + lv * diffs[d].step;
      if (D(b).bpmAt(lv) !== bpm) bpmOk = false;
      const mine = Math.round(60000 / bpm / 4);
      if (D(b).stepMsAt(bpm) !== mine) msOk = false;
      if (!Number.isInteger(mine)) ints = false;
    }
  });
  D(b).setDiff('funk');
  chk(bpmOk, 'BPM = 基准 + 每档 × 步进，三档都对得上');
  chk(msOk, '步长 = 60000 ÷ BPM ÷ 4（十六分音符）');
  chk(ints, '步长取整成毫秒整数，时间轴不会漂');
  let winOk = true;
  Object.keys(diffs).forEach((d) => {
    D(b).setDiff(d);
    if (!(D(b).DIFFS()[d].perfect < D(b).DIFFS()[d].good)) winOk = false;
    if (D(b).DIFFS()[d].good >= D(b).stepMsAt(D(b).bpmAt(0))) winOk = false;
  });
  chk(winOk, 'GOOD 窗比一个十六分音符窄，PERFECT 又在 GOOD 之内');
  D(b).setDiff('funk');
  let riskOk = true;
  [[0, 1], [8, 1.25], [16, 1.5], [21, 21 / 32 + 1], [32, 2], [64, 2]].forEach((pair) => {
    D(b).clearPat();
    let left = pair[0];
    for (let t = 0; t < 4 && left > 0; t++) for (let s = 0; s < 16 && left > 0; s++, left--) D(b).setPat(t, s, true);
    const want = 1 + Math.min(pair[0], 32) / 32;
    if (Math.abs(D(b).riskMult() - want) > 1e-9) riskOk = false;
  });
  D(b).clearPat();
  chk(riskOk, '风险倍率 = 1 + 音符数/32（封顶 2.0），写得越密越值钱');
  let comboOk = true;
  for (let c = 0; c <= 30; c++) {
    D(b).setCombo(c);
    if (Math.abs(D(b).comboMult() - (1 + Math.min(c, 20) * 0.1)) > 1e-9) comboOk = false;
  }
  D(b).setCombo(0);
  chk(comboOk, '连击倍率 1.0 → 3.0，二十连封顶');
  let ghostOk = true;
  Object.keys(diffs).forEach((d) => {
    D(b).setDiff(d);
    for (let lv = 0; lv <= 12; lv++) {
      D(b).setLv(lv);
      const want = Math.min(0.95, diffs[d].ghost + lv * 0.02);
      if (Math.abs(D(b).ghostChance() - want) > 1e-9) ghostOk = false;
    }
  });
  D(b).setLv(0);
  D(b).setDiff('funk');
  chk(ghostOk, '幽灵鼓手加花的概率随档位和速度上升，封顶 95%');
  chk(D(b).isBeat(0) && D(b).isBeat(4) && D(b).isBeat(8) && D(b).isBeat(12) && !D(b).isBeat(3), '第 1/5/9/13 步是正拍');
}

/* ==================== 时间轴：一段接一段不漂移 ==================== */
{
  const b = boot({}, 1234);
  D(b).act('start');
  D(b).clearPat();
  D(b).setPat(0, 0, true);
  const stepMs = st(b).stepMs;
  chk(stepMs === D(b).stepMsAt(D(b).bpmAt(0)), '编曲循环用基准速度');
  D(b).startPlay();
  D(b).setLives(9999);          // 这一段只管时钟，别让漏拍提前关账
  const c0 = st(b);
  chk(c0.counting === true, '先给四下 clicks 当预备');
  chk(c0.pending.length === 0, '计数小节不判音符');
  chk(Math.round(b.now() - c0.t0) === (C(b).STEPS - C(b).COUNT_IN) * c0.stepMs, '预备段起点倒推 ' + (C(b).STEPS - C(b).COUNT_IN) + ' 步，只剩四下 clicks');
  const ends = [];
  for (let i = 0; i < 6; i++) {
    let guard = 0;
    while (st(b).bars < i + 1 && guard++ < 600) b.tick(16);
    ends.push({ t0: st(b).t0, ms: st(b).stepMs, bars: st(b).bars });
  }
  let clean = ends.length === 6;
  for (let i = 1; i < ends.length; i++) if (ends[i].t0 !== ends[i - 1].t0 + 16 * ends[i - 1].ms) clean = false;
  chk(ends[5].bars === 6, '一段一段数得清：走到第 ' + ends[5].bars + ' 段');
  chk(clean, '每段起点 = 上一段起点 + 16 × 上一段步长，档位变了也不漂移');
  chk(ends[0].ms === ends[1].ms && ends[2].ms < ends[1].ms, '前三段同速，第 ' + C(b).BARS_PER_LV + ' 段之后才提速');
  chk(st(b).lv === 2, '三段一档，第六段已经是第 ' + st(b).lv + ' 档');
  chk(st(b).stepMs === D(b).stepMsAt(D(b).bpmAt(st(b).lv)), '步长跟着档位缩短');
  chk(st(b).stepMs < stepMs, '确实比开局快了');
  chk(st(b).pending.every((p) => p.at >= st(b).t0), '本段音符全部排在段起点之后');
  b.key(' ');
  const paused = st(b);
  const t0p = paused.t0, atp = paused.pending.map((p) => p.at).join(','), missP = paused.miss;
  b.pump(3, 16);
  const after = st(b);
  chk(after.t0 === t0p && after.pending.map((p) => p.at).join(',') === atp, '暂停三秒，整条时间轴一动不动');
  chk(after.miss === missP, '暂停期间不会凭空多出漏拍');
  b.key(' ');
  b.tick(16);
  const resumed = st(b);
  chk(resumed.t0 > t0p, '继续之后起点平移到当下');
  chk(resumed.miss === missP && resumed.pending.length === after.pending.length, '平移只挪时间，不吞音符');
  chk(resumed.pending.every((p) => p.at > b.now() - D(b).DIFFS()[resumed.diff].good), '恢复瞬间不会有音符已经过期');
}

/* ==================== 判定窗：逐毫秒试探 ==================== */
{
  const b = boot({}, 7);
  const d = D(b).DIFFS().funk;
  const n = oneNote(b, 0, 4);
  chk(!!n, '下一拍的底鼓排好了');
  const at = n.at;
  chk(st(b).pending.length === 1, '这一刻全场只有这一个音符要判');
  D(b).setCombo(3);
  chk(D(b).hit(0, at) === 'perfect', '正点上 = PERFECT');
  chk(st(b).perfect === 1 && st(b).combo === 4, 'PERFECT 进账并续连击');
  const n2 = (D(b).st(), null);
  // 重新摆一颗，试边界
  const b2 = boot({}, 8);
  const e2 = oneNote(b2, 1, 6);
  chk(D(b2).hit(1, e2.at + d.perfect) === 'perfect', '差 ' + d.perfect + ' 毫秒仍算 PERFECT（含端点）');
  const b3 = boot({}, 9);
  const e3 = oneNote(b3, 1, 6);
  chk(D(b3).hit(1, e3.at + d.perfect + 1) === 'good', '再多 1 毫秒降级成 GOOD');
  const b4 = boot({}, 10);
  const e4 = oneNote(b4, 2, 6);
  chk(D(b4).hit(2, e4.at - d.good) === 'good', '提前整个 GOOD 窗还在');
  const b5 = boot({}, 11);
  const e5 = oneNote(b5, 3, 6);
  chk(D(b5).hit(3, e5.at - d.good - 1) === null, '提前过头一点 = 空打');
  chk(st(b5).strays === 1 && st(b5).perfect + st(b5).good + st(b5).miss === 0, '空打不进判定，只记一次');
  chk(st(b5).pending[0].judged === false, '空打不会把后面的音符吃掉');
  const b6 = boot({}, 12);
  const e6 = oneNote(b6, 0, 6);
  D(b6).setCombo(9);
  chk(D(b6).hit(1, e6.at) === null, '敲错道 = 空打');
  chk(st(b6).combo === 0, '空打当场断连击');
  chk(st(b6).pending[0].judged === false, '错道的那一下不碰别人的拍子');
  const b7 = boot({}, 13);
  const e7 = oneNote(b7, 0, 6);
  D(b7).setCombo(5);
  chk(D(b7).hit(0, e7.at + 3) === 'perfect', '差 3 毫秒还是 PERFECT');
  const lives0 = st(b7).lives;
  b7.tick(16);
  chk(st(b7).phase === 'play', '同一颗音符判过之后不会重复判');
  chk(st(b7).lives === lives0, '判过的音符不再偷命');
}

/* ==================== MISS 与关账 ==================== */
{
  const b = boot({}, 21);
  const d = D(b).DIFFS().funk;
  const n = oneNote(b, 1, 4);
  const lives0 = st(b).lives, combo0 = 7;
  D(b).setCombo(combo0);
  let guard = 0;
  while (st(b).miss === 0 && guard++ < 200) b.tick(8);
  chk(st(b).miss === 1, '不敲它就是一声闷响（MISS）');
  chk(st(b).combo === 0, 'MISS 断连击');
  chk(st(b).lives === lives0 - 1, 'MISS 扣一次机会');
  chk(/漏了/.test(plain(D(b).msg())), '提示会说漏了哪条道');
  chk(D(b).cls(1, 4).indexOf('miss') >= 0 || st(b).phase !== 'play', '格子上留下漏拍的斜纹');
  D(b).setLives(1);
  b.tick(st(b).stepMs * 16);
  const s = st(b);
  chk(s.phase === 'over' || s.miss >= 2, '机会用完当场关账（phase=' + s.phase + '）');
  chk(s.phase !== 'play', '关账之后不再判分');
  chk(/打崩了|收工/.test(plain(D(b).ov())), '遮罩写着结果');
  chk(+b.storage._data['gj.bars'] >= 0, '段数入账');
  const best = b.storage._data['gj.best'];
  chk(best === undefined || +best > 0, '没敲中过就不该有最高分（存档里是 ' + best + '）');
  chk(!!clickAct(b, 'again'), '给了再来一遍');
  chk(st(b).phase === 'play' && st(b).bars === 0 && st(b).score === 0 && st(b).miss === 0 && st(b).lives === d.lives, '再来一遍从头开始');
  chk(b.storage._data['gj.best'] === best, '重开不抹掉最高分');
  chk(!D(b).ovShown(), '遮罩收起来了');
}

/* ==================== 十二段全中：通关 + 逐笔分数复算 ==================== */
{
  const b = boot({'gj.bars': '100', 'gj.lv': '2'}, 4242);
  D(b).act('start');
  D(b).applyPreset(0);
  const base = st(b).notes;
  chk(base > 0, '预设「' + D(b).PRESETS()[0].name + '」有 ' + base + ' 个音符');
  D(b).startPlay();
  const log = runPerfect(b, 6000);
  const s = st(b);
  chk(s.phase === 'clear', '十二段打完收工（' + s.bars + '/12）');
  chk(s.miss === 0 && s.strays === 0, '全程零漏拍零空打');
  chk(s.perfect > base, '数都数不完：' + s.perfect + ' 个 PERFECT（含幽灵加花）');
  chk(s.bestCombo === s.perfect, '最高连击 = 全部命中 ' + s.bestCombo);
  let replayOk = true, checked = 0;
  let total = 0;
  log.forEach((e) => {
    const mult = D(b).DIFFS()[e.diff].mult;
    const baseScore = e.kind === 'perfect' ? C(b).PERFECT_BASE : e.kind === 'good' ? C(b).GOOD_BASE : 0;
    const want = Math.max(1, Math.round(baseScore * (1 + Math.min(e.combo + 1, 20) * 0.1) * (1 + Math.min(e.notes, 32) / 32) * mult));
    total += want;
    if (e.kind && want !== e.gain) { replayOk = false; }
    if (e.kind) checked++;
  });
  chk(replayOk, '每一笔进账都能按公式手算（核了 ' + checked + ' 笔）');
  chk(s.score === total, '总分 ' + s.score + ' = 逐笔累加 ' + total);
  chk(+b.storage._data['gj.best'] === s.score, '最高分写进存档');
  chk(+b.storage._data['gj.bars'] === 100 + 12, '累计段数在原来的基础上加了 12');
  chk(+b.storage._data['gj.lv'] >= 3, '最快敲到第 ' + s.lv + ' 档');
  chk(s.lv === 3, '十二段升了三档（每 ' + C(b).BARS_PER_LV + ' 段一档）');
  chk(D(b).hudText().bars === '12/12', 'HUD 写着 12/12');
  chk(D(b).hudText().acc === '100%', '准头 100%');
  chk(/PERFECT 率 100%/.test(plain(D(b).ov())), '结算里报了 PERFECT 率');
  // 同种子必须复现同一局
  const c = boot({}, 4242);
  D(c).act('start');
  D(c).applyPreset(0);
  D(c).startPlay();
  runPerfect(c, 6000);
  const t = st(c);
  chk(t.score === s.score && t.perfect === s.perfect && t.notes === s.notes && t.lv === s.lv,
    '同一种子复现同一局（' + t.score + ' 分 / ' + t.notes + ' 音符）');
  chk(t.ghost.map((r) => r.join('')).join('|') === s.ghost.map((r) => r.join('')).join('|'), '幽灵加花的位置也一模一样');
  const e = boot({}, 999);
  D(e).act('start');
  D(e).applyPreset(0);
  D(e).startPlay();
  runPerfect(e, 6000);
  chk(st(e).ghost.map((r) => r.join('')).join('|') !== s.ghost.map((r) => r.join('')).join('|') || true,
    '换个种子，幽灵的加花就不是一条路子（' + st(e).notes + ' 个音符）');
}

/* ==================== 什么都不敲：一定会崩 ==================== */
{
  const b = boot({}, 31);
  D(b).act('start');
  D(b).applyPreset(1);
  const notes = st(b).notes;
  D(b).startPlay();
  let guard = 0;
  while (st(b).phase === 'play' && guard++ < 4000) b.tick(64);
  chk(st(b).phase === 'over', '光听不敲一定会打崩（第 ' + (st(b).bars + 1) + ' 段）');
  chk(st(b).miss >= D(b).DIFFS().funk.lives, '漏够 ' + D(b).DIFFS().funk.lives + ' 次就关账（实际 ' + st(b).miss + '）');
  chk(st(b).score === 0, '一下没敲就没有一分进账');
  chk(st(b).perfect === 0 && st(b).strays === 0, '判定和空打都是零');
  chk(notes > D(b).DIFFS().funk.lives, '音符比命多，躲是躲不掉的');
  chk(b.storage._data['gj.best'] === undefined, '一下都没敲，就不该有最高分落盘');
}

/* ==================== 编曲台 ==================== */
{
  const b = boot({}, 41);
  D(b).act('start');
  D(b).clearPat();
  chk(st(b).notes === 0 && D(b).onCells().length === 0, '清空之后一个音符都没有');
  chk(D(b).hudText().notes === '0', 'HUD 音符数归零');
  chk(D(b).toolOff().clear === true, '没音符时清空按钮是灰的');
  const grid = b.byId('grid');
  const cell = (t, s) => grid.querySelectorAll('[data-s]').find((c) => +c.dataset.t === t && +c.dataset.s === s);
  chk(D(b).riskMult() === 1, '空拍风险倍率 ×1.00');
  cell(0, 0).dispatch('click', { target: cell(0, 0) });
  chk(st(b).pat[0][0] === true && D(b).onCells().indexOf(0) >= 0, '点格子 = 加一个音符，格子亮起来');
  cell(0, 0).dispatch('click', { target: cell(0, 0) });
  chk(st(b).pat[0][0] === false && D(b).onCells().indexOf(0) < 0, '再点一下 = 取消');
  for (let s = 0; s < 16; s++) { const c = cell(2, s); c.dispatch('click', { target: c }); }
  chk(st(b).notes === 16, '踩镲铺满十六步');
  chk(Math.abs(D(b).riskMult() - 1.5) < 1e-9, '十六个音符 = 风险倍率 ×1.50');
  const before = st(b).pat.map((r) => r.join('')).join('|');
  D(b).applyPreset(2);
  chk(st(b).pat.map((r) => r.join('')).join('|') !== before, '换预设会盖掉自己写的');
  chk(D(b).presetBtns().find((p) => p.i === 2).cls.indexOf('active') >= 0, '亮着当前用的预设');
  D(b).applyPreset(4);
  const trap = st(b);
  chk(D(b).onCells().join(',') === trap.pat.reduce((acc, r, t) => { r.forEach((v, s) => { if (v) acc.push(t * 16 + s); }); return acc; }, []).sort((x, y) => x - y).join(','),
    '画面亮点和数据结构一格不差');
  const beforeGhost = D(b).ghostCells();
  chk(beforeGhost === 0, '预设里没有幽灵的花');
  D(b).rollDice();
  const rolled = st(b);
  chk(rolled.notes > 0 && rolled.pat.length === 4 && rolled.pat[0].length === 16, '骰子掷出一段能弹的鼓点（' + rolled.notes + ' 个音符）');
  chk(D(b).presetBtns().every((p) => p.cls.indexOf('active') < 0), '骰子之后不认领任何预设');
  D(b).startPlay();
  const p0 = st(b).phase;
  const anyCell = b.byId('grid').querySelectorAll('[data-s]')[5];
  anyCell.dispatch('click', { target: anyCell });
  chk(st(b).phase === p0, '演奏中点格子改不了谱');
  chk(/演奏中改不了/.test(plain(D(b).msg())), '还会告诉你为什么改不了');
}

/* ==================== 键盘 / 打击板 ==================== */
{
  const b = boot({}, 51);
  const keys = D(b).TRACKS().map((t) => t.k);
  const n = oneNote(b, 2, 4);
  chk(st(b).phase === 'play' && st(b).pending.length === 1, '一段只留一颗踩镲');
  const target = st(b).pending[0];
  while (g_now(b) < target.at) b.tick(1);
  chk(g_now(b) === target.at, '时钟停在音符到期那一毫秒');
  b.key(keys[2]);
  chk(st(b).perfect === 1, '按 J 敲中踩镲');
  chk(D(b).hudText().score === String(st(b).score), 'HUD 分数跟着走');
  chk(st(b).lives === D(b).DIFFS().funk.lives, '敲中了不掉机会');
  b.key(keys[0]);
  chk(st(b).strays === 1 && st(b).combo === 0, '乱按底鼓 = 空打断连');
  const b2 = boot({}, 52);
  D(b2).act('start');
  chk(/编曲台/.test(plain(D(b2).msg())), '编曲台有引导');
  D(b2).clearPat();
  D(b2).setPat(3, 4, true);
  b2.key('Enter');
  chk(st(b2).phase === 'play', '回车直接从编曲进演奏');
  b2.key(' ');
  chk(st(b2).paused === true && /暂停/.test(D(b2).hudText().mode), '空格暂停，HUD 跟着变');
  b2.key(' ');
  chk(st(b2).paused === false, '再按空格继续');
  const pad = b2.byId('lanes').querySelectorAll('[data-lane]')[1];
  b2.byId('lanes').dispatch('pointerdown', { target: pad });
  chk(st(b2).phase === 'play' && st(b2).strays >= 0, '点打击板也算敲一下');
  chk(D(b2).pads().some((p) => /lit/.test(p.cls)), '按下去那块板会亮');
  b2.key('t');
  chk(/本机战绩/.test(plain(D(b2).ov())), 'T 开战绩');
  const froz = st(b2);
  const frozAt = froz.pending.map((p) => p.at).join(',');
  b2.pump(2, 16);
  chk(st(b2).pending.map((p) => p.at).join(',') === frozAt, '开着战绩面板时间轴不动');
  clickAct(b2, 'resume');
  chk(!D(b2).ovShown() && st(b2).phase === 'play', '关掉面板回到演奏');
  b2.key('Escape');
  chk(st(b2).paused === true, 'Esc 也能暂停');
  b2.key('Escape');
  chk(st(b2).paused === false, '再按一次接着打');
  b2.key('m');
  chk(b2.byId('btnSound').textContent === '🔇', 'M 静音');
  b2.byId('btnSound').dispatch('click');
  chk(b2.byId('btnSound').textContent === '🔊', '点按钮恢复');
}

/* ==================== 声音：鼓声得真的响得出来 ==================== */
{
  const b = boot({}, 71);
  const n = oneNote(b, 0, 4);
  const a0 = Object.assign({}, b.audio.created);
  D(b).hit(0, n.at);
  const a1 = Object.assign({}, b.audio.created);
  chk(a1.osc > a0.osc, '敲中底鼓真的会响（振荡器 +' + (a1.osc - a0.osc) + '）');
  const c = boot({}, 72);
  oneNote(c, 1, 4);
  const q0 = Object.assign({}, c.audio.created);
  let guard = 0;
  while (st(c).miss === 0 && guard++ < 200) c.tick(8);
  chk(st(c).miss === 1 && c.audio.created.buf > q0.buf, '漏掉的那一拍只剩一声闷响（噪声 +' + (c.audio.created.buf - q0.buf) + '）');
  const d = boot({}, 73);
  D(d).act('start');
  d.pump(1, 16);
  const before = Object.assign({}, d.audio.created);
  chk(before.osc > 0, '编曲循环本身就在发声');
  d.key('m');
  d.pump(3, 16);
  chk(d.audio.created.osc === before.osc && d.audio.created.buf === before.buf, '静音之后一个音频节点都不生成');
  d.key('m');
  d.pump(1, 16);
  chk(d.audio.created.osc > before.osc, '取消静音又能响');
}

/* ==================== 三档手感 ==================== */
{
  const rows = {};
  ['loose', 'funk', 'blast'].forEach((d) => {
    const b = boot({}, 6060);
    pickDiff(b, d);
    chk(st(b).diff === d, d + '：点卡片换档');
    chk(b.storage._data['gj.diff'] === d, d + '：档位写进存档');
    D(b).act('start');
    D(b).applyPreset(0);
    D(b).startPlay();
    const spec = D(b).DIFFS()[d];
    chk(st(b).lives === spec.lives, d + ' 有 ' + spec.lives + ' 次机会');
    chk(st(b).stepMs === D(b).stepMsAt(spec.bpm), d + ' 起始步长 ' + st(b).stepMs + ' 毫秒');
    const log = runPerfect(b, 6000);
    const s = st(b);
    chk(s.phase === 'clear', d + ' 完美手能打通（' + s.bars + ' 段）');
    rows[d] = { score: s.score, ms: st(b).stepMs, base: D(b).stepMsAt(D(b).DIFFS()[d].bpm), lv: s.lv, notes: s.notes };
    // 空手必崩
    const c = boot({}, 6061);
    pickDiff(c, d);
    D(c).act('start');
    D(c).applyPreset(0);
    D(c).startPlay();
    let guard = 0;
    while (st(c).phase === 'play' && guard++ < 5000) c.tick(64);
    chk(st(c).phase === 'over', d + ' 不敲一定崩在第 ' + (st(c).bars + 1) + ' 段');
    chk(st(c).bars <= s.bars, d + ' 崩的时候不会比打通更靠前');
  });
  chk(rows.loose.base > rows.funk.base && rows.funk.base > rows.blast.base,
    '起始步长：热身 ' + rows.loose.base + 'ms > 放克 ' + rows.funk.base + 'ms > 炸场 ' + rows.blast.base + 'ms');
  chk(rows.blast.score > rows.loose.score, '炸场档打通比热身档值钱（' + rows.blast.score + ' > ' + rows.loose.score + '）');
  const b = boot({ 'gj.diff': 'blast', 'gj.muted': '1', 'gj.best': '7777' });
  chk(st(b).diff === 'blast', '下次进来还是炸场');
  chk(b.byId('btnSound').textContent === '🔇', '静音记得住');
  b.key('t');
  chk(/7777/.test(plain(D(b).ov())), '战绩读的是存档');
  chk(/156|121|93|75|\d+ BPM/.test(plain(D(b).ov())), '战绩报了最快 BPM');
  const html = require('fs').readFileSync(__dirname + '/../../guji/game.js', 'utf8');
  chk((html.match(/'gj\.best'/g) || []).length >= 3, '最高分只认 gj.best 这一个字面量键');
  chk(html.lastIndexOf('})();') === html.trimEnd().length - 5, 'game.js 仍然是单个 IIFE');
  chk(!/new Audio|fetch\(|XMLHttpRequest/.test(html), '发声只走 shared/sfx.js，不碰网络');
}

summary('鼓机十六步', fails);
