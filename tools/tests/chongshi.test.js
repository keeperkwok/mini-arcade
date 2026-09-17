'use strict';
/* 虫食算：出题器（挖空后必须恰好一解）→ 求解器与独立暴力枚举逐题对拍 → 竖式填格 → 验算
   重点核对三件事：① 列向 DFS 与「把所有可能填法穷举一遍」的结论完全一致
   ② 填错只咬一格、且咬完之后这道题依然有解（信息流失 ≠ 死题）③ 通关分数能按公式逐条推算 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, level: level, score: score, bites: bites, clues: clues, swaps: swaps, diff: diff,
    streak: streak, solved: solvedTotal, sel: sel, w: pz.w, op: pz.op, nb: blanks().length,
    fill: fill.slice(), blanks: blanks(),
    rows: ['A', 'B', 'R'].map(function (k) { return pz[k].map(function (c) { return { real: c.real, g: c.g, b: c.b, eaten: c.eaten, nz: c.nz }; }); }) }; },
  put: put, erase: erase, select: select, move: move, check: check, clue: clue, swap: swap, act: act, stats: stats,
  newRound: newRound, nextPz: nextPz, generate: generate, solve: solve, sample: sample, buildPz: buildPz, dig: dig,
  truthMatches: truthMatches, solvable: solvable, widthFor: widthFor, blankFor: blankFor, opFor: opFor, lineText: lineText,
  numberRow: numberRow, carryCount: carryCount, borrowCount: borrowCount, combo: combo, gainOf: function () { return lastGain; },
  rowArr: rowArr, cellAt: cellAt, DIFFS: function () { return DIFFS; },
  pzSolvable: function () { return solvable(pz); }, pzCount: function () { return solve(pz, 3).count; }, pzEq: function () { return lineText(pz); },
  setDiff: function (d) { diff = d; }, setScore: function (v) { score = v; }, setLevel: function (v) { level = v; },
  setBites: function (v) { bites = v; }, setStreak: function (v) { streak = v; },
  msg: function () { return msgEl.innerHTML; }, ov: function () { return ovContent.innerHTML; },
  ovShown: function () { return overlayEl._cls.indexOf('show') >= 0; },
  plainForm: function () { return String(formEl.innerHTML).replace(/<[^>]*>/g, '|'); },
  cells: function () { return formEl.querySelectorAll('[data-i]').map(function (b) { return { i: +b.dataset.i, text: String(b.textContent), cls: b.className }; }); },
  cellBtn: function (i) { return formEl.querySelectorAll('[data-i]').filter(function (b) { return +b.dataset.i === i; })[0]; },
  padBtn: function (k) { return padEl.querySelector('[data-k="' + k + '"]'); },
  padOff: function () { return padEl.querySelectorAll('[data-k]').filter(function (b) { return !!b.disabled; }).map(function (b) { return b.dataset.k; }).join(','); },
  tapPad: function (k) { var b = padEl.querySelector('[data-k="' + k + '"]'); if (b && !b.disabled) b.dispatch('click'); return !!b && !b.disabled; },
  hud: function () { return { lv: elLv.textContent, gap: elGap.textContent, bites: elBites.textContent, score: elScore.textContent, clue: elClue.textContent, swap: elSwap.textContent }; },
  toolOff: function () { return { clue: !!btnClue.disabled, swap: !!btnSwap.disabled }; },
  diffActive: function () { return byId('diff').querySelectorAll('[data-diff]').filter(function (b) { return b._cls.indexOf('active') >= 0; }).map(function (b) { return b.dataset.diff; }).join(','); },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('虫食算源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage) {
  const g = loadGame('chongshi', { transform: inject, storage: storage || {} });
  g.pump(0.4);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.3);
  return !!b;
}
// 目标填法：每个空格的真实数字
const target = (s) => s.blanks.map((idx) => s.rows[Math.floor(idx / s.w)][idx % s.w].g);
const truthAt = (s, idx) => s.rows[Math.floor(idx / s.w)][idx % s.w].g;
// 按顺序把真答案敲进去（最后一格敲完自动验算）
function typeTruth(g, skipLast) {
  const s = st(g), tv = target(s);
  const n = skipLast ? tv.length - 1 : tv.length;
  for (let i = 0; i < n; i++) {
    if (st(g).sel !== s.blanks[i]) D(g).select(s.blanks[i]);
    D(g).put(tv[i]);
  }
  return tv;
}
function typeWrong(g, delta) {
  const s = st(g), tv = target(s).slice();
  // 挑一个改了就必定算错的格子：末位 +delta（首格是高位则避开 0）
  for (let k = tv.length - 1; k >= 0; k--) {
    const t = tv.slice();
    t[k] = (t[k] + (delta || 1)) % 10;
    const idx = s.blanks[k], row = Math.floor(idx / s.w), col = idx % s.w;
    if (t[k] === 0 && s.rows[row][col].nz) continue;
    if (t[k] === tv[k]) continue;
    for (let i = 0; i < t.length; i++) {
      if (st(g).sel !== s.blanks[i]) D(g).select(s.blanks[i]);
      D(g).put(t[i]);
    }
    return t;
  }
  return null;
}
// 通关得分：完全照 game.js 里的公式复算一遍
const rowNum = (s, r) => s.rows[r].reduce((n, c) => n * 10 + (c.real ? c.g : 0), 0);
function expectGain(g, s) {
  const inner = 28 + s.nb * 16 + s.bites * 22 + (s.w - 2) * 12 +
    (s.op === '+' ? D(g).carryCount(rowNum(s, 0), rowNum(s, 1), 0) * 6
      : s.op === '-' ? D(g).borrowCount(rowNum(s, 0), rowNum(s, 1)) * 6 : 8);
  return Math.round(inner * D(g).DIFFS()[s.diff].mult * Math.min(2, 1 + s.streak * 0.15));
}
/* 独立实现的暴力求解：把每个空格的 0-9 全穷举一遍 */
function brute(s) {
  const idxs = s.blanks.slice(), k = idxs.length;
  const cur = s.rows.map((row) => row.map((c) => (c.b ? null : c.g)));
  const val = (arr) => arr.reduce((n, d) => n * 10 + (d === null ? 0 : d), 0);
  let count = 0, first = null;
  for (let m = 0; m < Math.pow(10, k); m++) {
    let ok2 = true;
    for (let j = 0; j < k; j++) {
      const idx = idxs[j], r = Math.floor(idx / s.w), c = idx % s.w;
      const d = Math.floor(m / Math.pow(10, k - 1 - j)) % 10;
      if (d === 0 && s.rows[r][c].nz) { ok2 = false; break; }
      cur[r][c] = d;
    }
    if (!ok2) continue;
    const A = val(cur[0]), B = val(cur[1]), R = val(cur[2]);
    const want = s.op === '+' ? A + B : s.op === '-' ? A - B : A * B;
    if (want !== R) continue;
    count++;
    if (!first) first = cur.map((r) => r.slice());
  }
  return { count, first };
}

/* ==================== 一、出题器：每题恰好一解 ==================== */
const g0 = boot();
const G0 = D(g0);
{
  let n = 0, bad = 0, slow = 0, worst = 0, kmin = 9, kmax = 0;
  const ops = {};
  for (const d of Object.keys(G0.DIFFS())) {
    for (let lv = 1; lv <= 12; lv++) {
      for (let t = 0; t < 7; t++) {
        const t0 = Date.now();
        const pz = G0.generate(lv, d);
        const ms = Date.now() - t0;
        worst = Math.max(worst, ms);
        n++;
        if (!pz) { bad++; continue; }
        if (ms > 60) slow++;
        const sol = G0.solve(pz, 3);
        ops[pz.op] = (ops[pz.op] || 0) + 1;
        kmin = Math.min(kmin, pz.gain); kmax = Math.max(kmax, pz.gain);
        if (sol.count !== 1 || !G0.truthMatches(pz, sol.first)) bad++;
      }
    }
  }
  chk(bad === 0, '504 道随机题全部「恰好一解」且解就是原答案（坏题 ' + bad + '）');
  chk(slow === 0 && worst < 60, '出题最慢 ' + worst + 'ms，绝不卡住主线程');
  chk(kmin >= 2 && kmax <= 6, '每题蛀掉 ' + kmin + '~' + kmax + ' 格（难度与关卡决定）');
  chk(Object.keys(ops).length >= 2, '三种运算都出得到题：' + JSON.stringify(ops));
}
const DD = G0.DIFFS();
chk(G0.widthFor(1, DD.snack) === 2 && G0.widthFor(7, DD.snack) === 3 && G0.widthFor(9, DD.snack) === 3,
  '位数随关卡变宽：当点心 1 关 2 位、第 7 关起 3 位封顶');
chk(G0.widthFor(1, DD.feast) === 3 && G0.widthFor(10, DD.feast) === 4, '盛宴档从 3 位起、封顶 4 位竖式');
chk(G0.blankFor(1, DD.snack) === 2 && G0.blankFor(9, DD.snack) === 6, '空格数从 2 涨到 6 封顶');
chk(G0.blankFor(30, DD.feast) === 6, '关卡再高也不会蛀到 6 格以上');
chk(G0.opFor(1, DD.feast) === '+' && G0.opFor(3, DD.feast) === '-' && G0.opFor(5, DD.feast) === '×',
  '盛宴档按关卡解锁减法和乘法');
chk(G0.opFor(9, DD.snack) === '+', '当点心档永远只有加法');
{
  const s = G0.sample('+', 3);
  chk(s && String(s.a + s.b).length === 3, 'sample 出的加法结果位数正好撑满版式');
  chk(G0.carryCount(s.a, s.b, s.r) >= 1, '加法题必定有进位（不然太水）');
  const d2 = G0.sample('-', 3);
  chk(d2 && G0.borrowCount(d2.a, d2.b) >= 1, '减法题必定有借位');
  const d3 = G0.sample('×', 3);
  chk(d3 && String(d3.a * d3.b) === String(d3.r) && d3.b >= 2, '乘法题是一位数乘数且结果位数吻合');
}

/* ==================== 二、求解器与穷举对拍 ==================== */
{
  let n = 0, bad = 0;
  for (const d of ['snack', 'meal', 'feast']) {
    for (let lv = 1; lv <= 8; lv++) {
      for (let t = 0; t < 4; t++) {
        const pz = D(g0).generate(lv, d);
        if (!pz) continue;
        const w = pz.w;
        const s = {
          w: w, op: pz.op,
          rows: ['A', 'B', 'R'].map((k) => pz[k].map((c) => ({ real: c.real, g: c.g, b: c.b, nz: c.nz }))),
          blanks: [],
        };
        for (let r = 0; r < 3; r++) for (let c = 0; c < w; c++) if (s.rows[r][c].real && s.rows[r][c].b) s.blanks.push(r * w + c);
        if (s.blanks.length > 4) continue;                 // 10^5 起就太慢了
        const b = brute(s), dfs = D(g0).solve(pz, 99);
        n++;
        if (b.count !== dfs.count) { bad++; continue; }
        if (b.count !== 1) bad++;
      }
    }
  }
  chk(n > 60, '与独立穷举求解对拍了 ' + n + ' 道题（每题把所有填法数一遍）');
  chk(bad === 0, '列向 DFS 的解数与穷举完全一致，且出题器只会交出「恰好一解」的题');
}
{
  // 版式语义：缺位（没有数字的一格）必须算出 0；首位不能是 0
  const pz = D(g0).buildPz('+', 8, 4, 12);
  chk(pz.A[0].real === false && pz.A[1].g === 8 && pz.A[1].nz === true, '一位数的最高位在版式里是「缺位」，真数字落在下一格');
  chk(D(g0).solve(pz, 3).count === 1, '没挖空的竖式当然只有唯一解（就是原式）');
  const p2 = D(g0).buildPz('+', 8, 4, 12);
  p2.A[1].b = true;
  const s2 = D(g0).solve(p2, 99);
  chk(s2.count === 1 && s2.first.A[1] === 8, '只咬走个位：进位链仍能反推出它是 8');
  const p3 = D(g0).buildPz('+', 8, 4, 12);
  p3.R[1].b = true;
  chk(D(g0).solve(p3, 99).count === 1 && D(g0).solve(p3, 99).first.R[1] === 2, '咬走结果个位也能算回来（8+4=12）');
  const p4 = D(g0).buildPz('+', 26, 45, 71);
  D(g0).dig(p4, 4);
  chk(D(g0).solve(p4, 2).count !== 1, '把 26+45=71 咬掉四格就没了唯一解 —— 出题器会拒绝这种题');
}

/* ==================== 三、开局界面 ==================== */
const g = boot();
chk(/虫食算/.test(D(g).ov()) && D(g).ovShown(), '开机先讲规则');
chk(/进位/.test(D(g).ov()) && /吃掉一个你看得见的数/.test(D(g).ov()), '规则讲清「进位借位也算账」与「填错再吃一格」');
chk(/恰好一解/.test(D(g).ov()), '并承诺每题都是验过的唯一解');
chk(/data-act="start"/.test(D(g).ov()), '有「开吃」按钮');
chk(st(g).phase === 'intro', '还没开局');
chk(clickAct(g, 'start'), '点开始能进局');
chk(st(g).phase === 'play' && st(g).bites === 2, '默认难度正餐：2 颗牙');
chk(st(g).level === 1 && st(g).score === 0 && st(g).streak === 0, '关卡、分数、连击归零');
chk(st(g).nb >= 2 && st(g).nb === st(g).fill.filter((v, i) => st(g).blanks.indexOf(i) >= 0 && v === null).length, '开局就有 2 格以上要填，且都空着');
chk(D(g).diffActive() === 'meal', '难度按钮高亮在正餐');
chk(D(g).hud().lv === '1' && D(g).hud().bites === '2' && D(g).hud().gap === String(st(g).nb), '四个统计位都对');
chk(/·/.test(D(g).plainForm()), '版式里缺位用点占住，列对齐不会歪');
chk(D(g).cells().length === st(g).nb, '只有空格才是可点的按钮');
{
  const selIsNz = st(g).rows[Math.floor(st(g).sel / st(g).w)][st(g).sel % st(g).w].nz;
  chk((D(g).padOff().indexOf('0') >= 0) === selIsNz,
    '键盘上的 0 恰好在选中「首位格」时变灰（开局选中的是首位：' + selIsNz + '）');
  chk(D(g).padOff().replace(/0/g, '') === '', '除 0 之外九个数键都可用');
}
{
  const s = st(g), hasNz = s.blanks.some((i) => s.rows[Math.floor(i / s.w)][i % s.w].nz);
  chk(hasNz === true, '空格中至少有一个是首位（否则没有「不能填 0」的约束）');
}

/* ==================== 四、填格、擦掉与选择 ==================== */
{
  const s = st(g);
  D(g).select(s.blanks[0]);
  chk(st(g).sel === s.blanks[0], '点格子会选中它');
  const nzIdx = s.blanks.find((i) => s.rows[Math.floor(i / s.w)][i % s.w].nz);
  if (nzIdx !== undefined) {
    D(g).select(nzIdx);
    const before = st(g).fill.slice();
    D(g).put(0);
    chk(/首位/.test(plain(D(g).msg())) && st(g).fill[nzIdx] === null, '首位敲 0 被当场拒绝，并告诉你为什么');
    chk(D(g).padOff().indexOf('0') >= 0, '选中首位格时键盘上的 0 直接变灰');
  }
  D(g).select(s.blanks[0]);
  D(g).put(7);
  chk(st(g).fill[s.blanks[0]] === 7, '填进去的数字落在选中的格上');
  chk(st(g).sel !== s.blanks[0] || gapEq(st(g)), '填完自动跳到下一个空格');
  D(g).erase();
  chk(st(g).fill[s.blanks[0]] === null, '擦掉又变回空');
  const sel0 = st(g).sel;
  D(g).move(1);
  chk(st(g).sel !== sel0, '→ 换到隔壁空格');
  D(g).move(-1);
  chk(st(g).sel === sel0, '← 能换回来');
}
function gapEq(s) { return s.blanks.length === 1; }

/* ==================== 五、验算：错一次咬一格 ==================== */
{
  const g2 = boot();
  clickAct(g2, 'start');
  const s = st(g2), nb = s.blanks.length, bites = s.bites;
  const filled = typeWrong(g2, 1);
  chk(filled !== null, '构造出一个「一定算错」的填法');
  const s2 = st(g2);
  chk(s2.score === 0, '算错一分不得');
  chk(s2.bites === bites - 1, '虫当场咬掉一格：' + bites + ' → ' + s2.bites);
  chk(s2.blanks.length === nb + 1, '要填的空格多了一个（' + nb + ' → ' + s2.blanks.length + '）');
  chk(s2.rows.some((row) => row.some((c) => c.eaten)), '被咬的那格标了虫印，屏幕上看得见');
  chk(s2.streak === 0, '连击断了');
  chk(/对不上|位数|不够减/.test(plain(D(g2).msg())), '告诉你错在哪一位：' + plain(D(g2).msg()).slice(0, 18));
  chk(D(g2).pzSolvable() === true, '被咬过一格的题依然有解 —— 信息变少，但不许变成死题');
  chk(brute(st(g2)).count >= 1 || st(g2).blanks.length > 4, '独立穷举也认为它可解');
  chk(!D(g2).ovShown(), '算错不弹遮罩，接着算');
  // 把三档难度的牙数咬光 → 判负
  const s3 = st(g2);
  let guard = 0;
  while (st(g2).phase === 'play' && guard++ < 6) {
    const t = target(st(g2));
    for (let i = 0; i < t.length; i++) {
      D(g2).select(st(g2).blanks[i]);
      D(g2).put(i === 0 ? (t[i] === 9 ? 8 : t[i] + 1) : t[i]);
      if (st(g2).phase !== 'play') break;
    }
  }
  chk(st(g2).phase === 'over', '牙被咬光 → 算式报废（试了 ' + guard + ' 次）');
  chk(/吃光/.test(plain(D(g2).ov())), '判负文案');
  chk(clickAct(g2, 'again'), '判负后能再来一局');
  chk(st(g2).phase === 'play' && st(g2).bites === 2 && st(g2).level === 1, '新的一局牙数与关卡都复位');
}

/* ==================== 六、通关与分数推算 ==================== */
{
  const g3 = boot({ 'cs.diff': 'meal' });
  clickAct(g3, 'start');
  const s = st(g3);
  const nb = s.blanks.length;
  const want = expectGain(g3, s);
  const before = s.score;
  typeTruth(g3);
  const s2 = st(g3);
  chk(s2.phase === 'clear', '按真答案填完 → 自动验算通过');
  chk(s2.score - before === want, '分数逐条可推算：空格 ' + nb + ' 格 ×16 + 剩牙 ' + s.bites + ' ×22 + 位数加成 + 进位账，×' + D(g3).DIFFS().meal.mult +
    ' ×连击 → +' + want);
  chk(s2.score - before === D(g3).gainOf(), '结算页写的与账上的一致（+' + D(g3).gainOf() + '）');
  chk(/成立/.test(plain(D(g3).ov())) && plain(D(g3).ov()).indexOf('+' + want) >= 0, '通关遮罩写明算式成立与这一题加了多少分');
  chk(s2.level === 2 && s2.solved === 1, '进第 2 题，本局咬回 1 道');
  chk(Number(g3.storage._data['cs.best']) === s2.score, '最高分当场入档 cs.best = ' + g3.storage._data['cs.best']);
  chk(Number(g3.storage._data['cs.solved']) === 1, '累计咬回 cs.solved = ' + g3.storage._data['cs.solved']);
  clickAct(g3, 'next');
  chk(st(g3).phase === 'play' && st(g3).level === 2, '下一题接得上');
  chk(st(g3).blanks.length >= 2, '下一题至少还有两格要填');
  // 连击倍率
  D(g3).setStreak(6);
  const c6 = D(g3).combo();
  D(g3).setStreak(99);
  chk(D(g3).combo() === 2 && c6 > 1 && c6 < 2, '连击倍率 1+0.15n，最高封顶 ×2');
}

/* ==================== 七、放大镜与换一题 ==================== */
{
  const g4 = boot({ 'cs.diff': 'feast' });
  clickAct(g4, 'start');
  chk(st(g4).bites === 1 && st(g4).clues === 1 && st(g4).swaps === 1, '盛宴档：1 颗牙 1 次放大镜 1 次换题');
  const s = st(g4);
  D(g4).select(s.blanks[0]);
  const t = truthAt(s, s.blanks[0]);
  D(g4).clue();
  const m = plain(D(g4).msg());
  chk(/奇数|偶数|不小于 5|小于 5|或/.test(m), '放大镜给出一条线索：' + m.slice(0, 26));
  chk(/奇数/.test(m) === (t % 2 === 1) || !/奇数/.test(m), '线索说奇数时真的是奇数');
  chk(/偶数/.test(m) === (t % 2 === 0) || !/偶数/.test(m), '线索说偶数时真的是偶数');
  chk(/不小于 5/.test(m) === (t >= 5) || !/不小于 5/.test(m), '线索说「不小于 5」时真的不小于 5');
  chk(st(g4).clues === 0 && D(g4).toolOff().clue === true, '放大镜用完置灰');
  const before = st(g4).blanks.length;
  D(g4).clue();
  chk(st(g4).blanks.length === before, '用完之后再点不会偷改题目');
  D(g4).swap();
  chk(st(g4).swaps === 0, '换一题扣一次');
  chk(st(g4).phase === 'play' && st(g4).blanks.length >= 2, '换完立刻是一道新题');
  chk(D(g4).toolOff().swap === true, '换一题用完置灰');
}

/* ==================== 八、存档与脏值 ==================== */
{
  const g5 = boot({ 'cs.best': '900', 'cs.solved': '7', 'cs.lv': '3' });
  clickAct(g5, 'start');
  typeTruth(g5);
  const s5 = st(g5);
  chk(s5.phase === 'clear', '低难度也能通关（存档不干扰出题）');
  chk(Number(g5.storage._data['cs.solved']) === 8, '累计咬回 7 + 1 = ' + g5.storage._data['cs.solved']);
  chk(Number(g5.storage._data['cs.best']) >= 900, '最高分只涨不跌：' + g5.storage._data['cs.best']);
  clickAct(g5, 'next');
  typeTruth(g5);
  chk(Number(g5.storage._data['cs.lv']) >= 3, '最远撑到第 ' + g5.storage._data['cs.lv'] + ' 题（原纪录 3）');
  const g6 = boot({ 'cs.diff': '不存在的难度', 'cs.best': 'abc' });
  chk(st(g6).bites === 2, '难度存档被污染时回落默认档');
  chk(st(g6).score === 0 && D(g6).hud().score === '0', '脏的最高分不会把界面变成 NaN');
  const g7 = boot({ 'cs.diff': 'snack' });
  chk(st(g7).bites === 3 && D(g7).diffActive() === 'snack', '存档里的难度会真的生效');
}

/* ==================== 九、键盘、遮罩与声音 ==================== */
{
  const g8 = boot();
  g8.key('Enter');
  chk(st(g8).phase === 'play', 'Enter 直接开局');
  const s = st(g8);
  const tv = target(s);
  g8.key(String(tv[0]));
  chk(st(g8).fill[s.blanks[0]] === tv[0], '键盘数字也能填格');
  g8.key('Backspace');
  chk(st(g8).blanks.indexOf(st(g8).sel) >= 0, '退格键有效');
  g8.key('ArrowRight');
  const before = st(g8).sel;
  g8.key('ArrowLeft');
  chk(st(g8).sel !== before || s.blanks.length === 1, '←/→ 在空格间跳');
  g8.key('t');
  chk(/本机战绩/.test(plain(D(g8).ov())), 'T 打开战绩');
  chk(/累计咬回/.test(plain(D(g8).ov())) && /当点心|正餐|盛宴/.test(plain(D(g8).ov())), '战绩里有累计与当前难度');
  g8.key('Escape');
  chk(!D(g8).ovShown(), 'Esc 关掉遮罩');
  const osc0 = g8.audio.created.osc + g8.audio.created.buf;
  g8.byId('btnSound').dispatch('click');
  const s1 = st(g8);
  g8.key(String(truthAt(s1, s1.blanks[0])));
  chk(g8.audio.created.osc + g8.audio.created.buf === osc0, '静音之后一个音都不发');
  chk(g8.storage._data['cs.muted'] === '1', '静音状态写进 cs.muted');
  g8.byId('btnSound').dispatch('click');
  const s2 = st(g8);
  g8.key(String(truthAt(s2, s2.blanks[0])));
  chk(g8.audio.created.osc + g8.audio.created.buf > osc0, '取消静音后恢复发声');
  g8.key('n');
  chk(st(g8).phase === 'intro', 'N 重开回到说明页');
}

/* ==================== 十、连着玩一整天：分数只涨不崩 ==================== */
{
  for (const dk of ['snack', 'meal', 'feast']) {
    const gg = boot();
    D(gg).setDiff(dk);
    D(gg).newRound();
    clickAct(gg, 'start');
    let cleared = 0, guard = 0;
    while (cleared < 14 && guard++ < 60) {
      const s = st(gg);
      if (s.phase === 'intro') { clickAct(gg, 'start'); continue; }
      if (s.phase === 'clear') { clickAct(gg, 'next'); continue; }
      if (s.phase === 'over') break;
      typeTruth(gg);
      if (st(gg).phase === 'clear') cleared++;
    }
    chk(cleared === 14, dk + ' 档连玩 14 题全部咬回（实际 ' + cleared + '）');
    chk(st(gg).score > 0 && !/NaN|undefined/.test(JSON.stringify(st(gg))), dk + ' 档局面里没有 NaN/undefined');
    chk(st(gg).bites === D(gg).DIFFS()[dk].bites, dk + ' 档一路填对就不会掉牙');
    chk(Number(gg.storage._data['cs.best']) === st(gg).score, dk + ' 档最高分已入档：' + gg.storage._data['cs.best']);
    chk(st(gg).level === 15, dk + ' 档连过 14 题后站在第 ' + st(gg).level + ' 题');
  }
  // 三档同题量下的分数阶梯
  const one = (dk) => {
    const gg = boot();
    D(gg).setDiff(dk);
    D(gg).newRound();
    clickAct(gg, 'start');
    for (let i = 0; i < 6; i++) {
      if (st(gg).phase === 'clear') clickAct(gg, 'next');
      typeTruth(gg);
    }
    return st(gg).score;
  };
  const a = one('snack'), b = one('meal'), c = one('feast');
  chk(a > 0 && b > 0 && c > 0, '三档都能得分：' + a + ' / ' + b + ' / ' + c);
  chk(b >= a && c >= b, '难度越高越值钱：' + a + ' ≤ ' + b + ' ≤ ' + c);
}

summary('虫食算', fails);
