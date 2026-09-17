'use strict';
/* 绝对音感：音乐数据自洽 → 出题器造出的题目与乐理一致 → 三种轮次判定 → 耳力经济
   重点核对：① 音程题的答案半音数真的等于两个音的距离 ② 和弦题的音真的按和弦结构排
   ③ 旋律题只在音阶里、相邻不重复、跨度受控 ④ 答错扣耳力但退还一次回放、听对回一口血 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__g = {' +
  ' st: () => ({ phase: phase, level: level, score: score, ears: ears, streak: streak, runRight: runRight, hints: hints,' +
  '   diff: diff, replays: replays, attempt: attempt.slice(), locked: false, missed: missed, lit: [litFrom, litTo],' +
  '   q: q ? { mode: q.mode, tier: q.tier, ans: Array.isArray(q.ans) ? q.ans.slice() : q.ans, notes: q.notes.slice(), opts: q.opts.slice() } : null }),' +
  ' setQ: (o) => { q = { mode: o.mode, tier: o.tier || 0, ans: o.ans, semi: o.ans, notes: o.notes, opts: o.opts };' +
  '   replays = DIFFS[diff].replays; attempt = []; missed = false; locked = false; render(); hud(); },' +
  ' setEars: (v) => { ears = v; hud(); }, setHints: (v) => { hints = v; hud(); }, setLevel: (v) => { level = v; },' +
  ' setStreak: (v) => { streak = v; }, setScore: (v) => { score = v; }, setLocked: (v) => { locked = v; },' +
  ' answer: answer, keyTap: keyTap, replay: replay, hint: hint, newRun: newRun, beginLevel: beginLevel,' +
  ' build: (lv, d) => build(lv, DIFFS[d || diff]), INTERVALS: () => INTERVALS, CHORDS: () => CHORDS, RATIOS: () => RATIOS,' +
  ' SCALE: () => SCALE, SOLFEGE: () => SOLFEGE, LETTERS: () => LETTERS, INT_POOL: () => INT_POOL, OPTN: () => OPTN,' +
  ' DIFFS: () => DIFFS, hz: hz, noteName: noteName, modeFor: modeFor, tierFor: tierFor, melodyLen: melodyLen, answerText: answerText,' +
  ' msg: () => msgEl.innerHTML, ov: () => ovContent.innerHTML, notesHTML: () => notesEl.innerHTML,' +
  ' optBtns: () => ansEl.querySelectorAll("[data-v]").map((b) => ({ v: b.dataset.v, text: String(b.textContent), off: !!b.disabled })),' +
  ' keyBtns: () => keysEl.querySelectorAll("[data-k]").map((b) => ({ k: b.dataset.k, text: String(b.textContent), off: !!b.disabled })),' +
  ' pillN: () => notesEl.querySelectorAll(".np").length, litPills: () => notesEl.querySelectorAll(".on").length,' +
  ' hud: () => ({ lv: elLv.textContent, mode: elMode.textContent, ears: elEars.textContent, score: elScore.textContent, re: elReN.textContent, hint: elHintN.textContent }),' +
  ' btns: () => ({ replay: byId("btnReplay").disabled, hint: byId("btnHint").disabled }),' +
  ' ovShown: () => overlayEl._cls.indexOf("show") >= 0,' +
  ' diffActive: () => byId("diff").querySelectorAll("button").filter((b) => b._cls.indexOf("active") >= 0).map((b) => b.dataset.diff).join(","),' +
  ' showStats: showStats, gameOver: gameOver, keysCls: () => keysEl.className,' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('绝对音感源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage) {
  const g = loadGame('yingan', { transform: inject, storage: storage || {} });
  g.pump(0.5);
  return g;
}
const start = (g) => {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'start');
  if (b) b.dispatch('click');
  g.pump(0.5);
  return g;
};
// 钉住一道题，下面的分数才是可推算的
const setInt = (g, semi, up) => {
  const hi = 55 + semi;
  D(g).setQ({ mode: 'int', tier: 2, ans: semi, notes: up === false ? [hi, 55] : [55, hi], opts: [0, 3, 4, 7, semi].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b) });
  return g;
};
const clickOpt = (g, v) => {
  const b = g.byId('answers').querySelectorAll('[data-v]').find((x) => x.dataset.v === String(v));
  if (b) b.dispatch('click');
  g.pump(0.2);
  return !!b;
};
const tapKey = (g, i) => g.byId('keys').querySelectorAll('[data-k]')[i].dispatch('click');

/* ==================== 一、音乐数据自洽 ==================== */
const g0 = start(boot());
const G0 = D(g0);
const IV = G0.INTERVALS(), CH = G0.CHORDS(), SC = G0.SCALE();
const bad = [];
chk(Object.keys(IV).length === 13, '音程表 0-12 半音一个不缺（纯一度到纯八度）');
[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((n) => { if (!IV[n] || /undefined/.test(IV[n])) bad.push('音程 ' + n + ' 没名字'); });
const CH_SIG = { maj: '0,4,7', min: '0,3,7', dim: '0,3,6', aug: '0,4,8', sus4: '0,5,7', dom7: '0,4,7,10', maj7: '0,4,7,11', min7: '0,3,7,10' };
chk(Object.keys(CH).length === 8 && Object.keys(CH).every((k) => CH_SIG[k]), '和弦表 8 种性质，每一种都有乐理签名可对照');
Object.keys(CH).forEach((k) => {
  const c = CH[k], s = c.steps;
  if (!c.name || !c.tip) bad.push(k + ' 缺名字或讲解');
  if (String(s) !== CH_SIG[k]) bad.push(k + ' 结构与签名表不符：' + s + '，应为 ' + CH_SIG[k]);
  if (s.length < 3 || s.length > 4) bad.push(k + ' 音数可疑 ' + s.length);
  for (let i = 1; i < s.length; i++) {
    if (s[i] <= s[i - 1]) bad.push(k + ' 的音没往上叠');
    if (s[i] - s[i - 1] > 5) bad.push(k + ' 相邻两音超过纯四度，不像三度叠出来的');
  }
  if (s[s.length - 1] > 12) bad.push(k + ' 跨度出了八度');
});
chk(bad.length === 0, '8 个和弦逐音对照签名表：根音为 0、往上叠、不跨八度（挂四 0-5-7 也在表里）' + (bad.length ? ' —— 问题：' + bad.slice(0, 4).join(' | ') : ''));
Object.keys(G0.RATIOS()).forEach((k) => { if (!IV[k]) bad.push('频率比表出现没名的音程 ' + k); });
chk(G0.INT_POOL().every((p) => p.every((v, i) => i === 0 || v > p[i - 1]) && p.every((v) => v >= 0 && v <= 12)), '三档音程候选池递增且都在一个八度内');
chk(SC.length === 8 && SC[7] - SC[0] === 12 && SC.every((m, i) => i === 0 || m > SC[i - 1]), '琴键是音阶 8 个音，正好一个八度（do 到高 do）');
chk(G0.SOLFEGE().length === 8 && G0.LETTERS().length === 8, '每个键都有唱名和键盘字母');
chk(G0.OPTN().join(',') === '4,5,6', '选项数三档 4 / 5 / 6 个');
chk(Math.abs(G0.hz(69) - 440) < 1e-9 && Math.abs(G0.hz(81) - 880) < 1e-9, 'MIDI 转频率：A4 = 440Hz，高八度正好翻倍');
chk(G0.hz(69 + 1) / G0.hz(69) > G0.hz(69 + 2) / G0.hz(69 + 1) - 1e-9, '半音之间的比值是常数（十二平均律）');
chk(G0.noteName(60) === 'C4' && G0.noteName(69) === 'A4' && G0.noteName(61) === 'C#4', '音名拼法正确：C4 / A4 / C#4');
chk(G0.modeFor(1) === 'int' && G0.modeFor(2) === 'melody' && G0.modeFor(3) === 'chord' && G0.modeFor(4) === 'int', '三种轮次按 音程→旋律→和弦 轮换');
chk(G0.tierFor(1) === 0 && G0.tierFor(5) === 1 && G0.tierFor(10) === 2, '难度档随关号上升：1-4 / 5-9 / 10+');
chk(G0.melodyLen(1) === 2 && G0.melodyLen(6) === 3 && G0.melodyLen(30) === 6, '旋律长度 2 → 6 封顶');
const dd = G0.DIFFS();
chk(dd.warm.ears > dd.pro.ears && dd.pro.ears > dd.hall.ears && dd.warm.replays > dd.hall.replays, '耳力与回放次数依次收紧：' + [dd.warm.ears, dd.pro.ears, dd.hall.ears] + ' 耳 / ' + [dd.warm.replays, dd.pro.replays, dd.hall.replays] + ' 次');
chk(dd.hall.mult > 1 && dd.warm.mult < 1 && dd.hall.down === true, '演奏厅 1.6 倍分且允许下行音程');

/* ==================== 二、出题器与乐理一致 ==================== */
const seen = { int: 0, melody: 0, chord: 0 };
const qbad = [];
const varSet = new Set();   // 出题器一共见过多少种不同的题
for (let lv = 1; lv <= 30; lv++) {
  for (let rep = 0; rep < 12; rep++) {
    const p = G0.build(lv, 'pro'), w = G0.build(lv, 'warm'), h = G0.build(lv, 'hall');
    seen[p.mode]++;
    [p, w, h].forEach((x) => {
      if (x.mode === 'melody') {
        if (String(x.opts) !== String(SC)) qbad.push('旋律题的选项就该是整排音阶');
      } else if (x.opts.indexOf(x.ans) < 0) qbad.push(x.mode + ' 正解不在选项里');
      if (new Set(x.opts).size !== x.opts.length) qbad.push(x.mode + ' 选项重复');
      if (x.mode === 'int') {
        if (Math.abs(x.notes[1] - x.notes[0]) !== x.ans) qbad.push('音程答案 ' + x.ans + ' 与实际距离不符');
        if (x.notes.some((n) => n < 40 || n > 80)) qbad.push('音程题的音跑出了舒适音区');
        if (x.opts.length > Math.min(G0.OPTN()[x.tier], G0.INT_POOL()[x.tier].length)) qbad.push('选项超量');
      }
      if (x.mode === 'chord') {
        const steps = x.notes.map((n) => n - x.notes[0]);
        if (String(steps) !== String(CH[x.ans].steps)) qbad.push('和弦音与性质不符：' + x.ans + ' ' + steps);
      }
      if (x.mode === 'melody') {
        if (x.notes.length !== G0.melodyLen(lv)) qbad.push('旋律长度不对');
        if (x.notes.some((n) => SC.indexOf(n) < 0)) qbad.push('旋律出现音阶外的音');
        for (let i = 1; i < x.notes.length; i++) if (x.notes[i] === x.notes[i - 1]) qbad.push('旋律相邻两音重复');
        const degs = x.notes.map((n) => SC.indexOf(n));
        if (Math.max.apply(null, degs) - Math.min.apply(null, degs) > 6) qbad.push('旋律跨度失控');
      }
    });
    if (h.mode === 'int' && h.tier > 0) { /* 演奏厅允许下行，下面单独统计 */ }
    [p, w, h].forEach((x) => varSet.add(x.mode + '#' + lv + '#' + x.notes.join(',') + '#' + String(x.ans)));
  }
}
chk(qbad.length === 0, '30 关 × 12 次 × 三档难度出题：正解必在选项里、音程距离与答案一致、和弦音按结构叠、旋律只在音阶内游走' +
  (qbad.length ? ' —— 问题：' + [...new Set(qbad)].slice(0, 4).join(' | ') : ''));
chk(seen.int === seen.melody && seen.melody === seen.chord, '三种轮次出题次数相同（各 ' + seen.int + ' 次），轮换没偏心');
chk(varSet.size > 200, '30 关 × 12 次 × 三档共造出 ' + varSet.size + ' 道不同的题，出题器不是在背题');
let downs = 0;
for (let i = 0; i < 300; i++) { const x = G0.build(13, 'hall'); if (x.mode === 'int' && x.notes[1] < x.notes[0]) downs++; }
chk(downs > 0 && downs < 300, '演奏厅敢出下行音程（300 次抽样里 ' + downs + ' 次），并不是一路向上');
let downsEasy = 0;
for (let i = 0; i < 300; i++) { const x = G0.build(13, 'pro'); if (x.mode === 'int' && x.notes[1] < x.notes[0]) downsEasy++; }
chk(downsEasy === 0, '琴房不下行：初学者不需要处理反向的耳朵');

/* ==================== 三、开局界面 ==================== */
const gi = boot();
chk(st(gi).phase === 'intro' && D(gi).ovShown(), '开机先讲规则');
chk(/耳力/.test(D(gi).ov()) && /退还一次回放/.test(D(gi).ov()), '介绍页讲清耳力与回放的置换关系');
chk(/演奏厅档只许听一遍/.test(D(gi).ov()), '并且预告最狠的那一档');
chk(D(gi).optBtns().length === 0 || D(gi).diffActive() === 'pro', '默认难度是琴房');
const gs = start(boot());
chk(st(gs).phase === 'play' && st(gs).ears === 4 && st(gs).hints === 3, '琴房 4 分耳力 3 次提示');
chk(st(gs).replays === 3 && st(gs).q.mode === 'int', '第 1 关是音程题，3 次回放');
chk(D(gs).hud().mode === '辨音程', 'HUD 上写明本轮是哪种轮次');
chk(D(gs).pillN() === 2, '音程题两个音符块');
chk(D(gs).litPills() >= 1, '播放时音符块会跟着亮（不写音名，只能靠耳朵）');
chk(/<i class="np/.test(D(gs).notesHTML()) && !/C4|A3/.test(D(gs).notesHTML()), '屏幕上看不见音名');
chk(D(gs).keyBtns().length === 8, '琴键一排 8 枚');
chk(D(gs).keyBtns().every((b) => b.off), '音程题里琴键是禁用的');
chk(D(gs).optBtns().length === st(gs).q.opts.length && D(gs).optBtns().every((b) => !b.off), '选项按钮数量与题目一致且可点');
chk(D(gs).optBtns().map((b) => b.text).join('|').indexOf(IV[st(gs).q.opts[0]]) >= 0, '选项文字就是音程名');
chk(g0.storage.getItem('yin.muted') === null, '没碰静音就不该写静音键');

/* ==================== 四、辨音程 ==================== */
const g4 = start(boot());
setInt(g4, 7);
chk(st(g4).q.opts.join(',') === '0,3,4,7', '钉住一道纯五度题，选项 0/3/4/7');
D(g4).answer(3);
chk(st(g4).ears === 3 && st(g4).replays === 3, '答错扣一分耳力并退还一次回放');
chk(/宽 4/.test(D(g4).msg()), '并且告诉你答案比它宽几个半音：' + plain(D(g4).msg()));
chk(st(g4).streak === 0, '连击断了');
setInt(g4, 4);
D(g4).answer(7);
chk(/窄 3/.test(D(g4).msg()), '选大了也说「窄几个半音」');
const g4b = start(boot());
setInt(g4b, 7);
D(g4b).answer(9);
chk(st(g4b).ears === 4 && st(g4b).score === 0 && /选项里没有/.test(D(g4b).msg()), '选项外的答案不接（也不白扣耳力）');
D(g4b).answer(7);
chk(st(g4b).score === 60 && st(g4b).streak === 1 && st(g4b).runRight === 1, '答对纯五度 +60 分（无连击）');
chk(st(g4b).locked === false && /纯五度/.test(D(g4b).msg()) && /3:2/.test(D(g4b).msg()), '结算顺带讲一句频率比');
chk(g4b.storage.getItem('yin.right') === '1' && g4b.storage.getItem('yin.best') === '60', '听对题数与最高分当场落盘');
const s4 = st(g4b);
D(g4b).answer(7);
chk(st(g4b).score === s4.score, '本关已结算期间再点不加分（在下一关之前）');
g4b.pump(2.5);
setInt(g4b, 4);
D(g4b).answer(4);
chk(st(g4b).score === 60 + 72, '连对第二题吃 ×1.2：60 + round(60×1.2) = 132');
chk(/连对 ×1\.2/.test(D(g4b).msg()), '结算语标出倍率');
for (let i = 0; i < 6; i++) { g4b.pump(2.5); D(g4b).setLevel(i + 3); setInt(g4b, 3); D(g4b).answer(3); }
chk(/连对 ×2\.0/.test(D(g4b).msg()), '连击倍率 5 关封顶 ×2.0');
const g4c = start(boot());
setInt(g4c, 0);
D(g4c).answer(0);
chk(/= /.test(D(g4c).msg()), '纯一度用等号而不是上下箭头');
setInt(g4c, 5, false);
D(g4c).answer(5);
chk(/↓/.test(D(g4c).msg()), '下行音程照样判对，讲解里画个箭头');

/* ==================== 五、跟弹旋律 ==================== */
const g5 = start(boot());
g5.pump(2.5);
D(g5).setLevel(2);
D(g5).beginLevel();
g5.pump(0.5);
chk(st(g5).q.mode === 'melody', '第 2 关换成跟弹旋律');
chk(D(g5).hud().mode === '跟弹旋律', 'HUD 跟着换');
chk(D(g5).keyBtns().every((b) => !b.off), '旋律题里琴键解锁');
chk(D(g5).optBtns().length === 0, '旋律题没有选项');
chk(D(g5).keysCls().indexOf('hot') >= 0, '琴键高亮成可点状态');
const mel = st(g5).q.notes.slice();
const degs = mel.map((n) => SC.indexOf(n));
tapKey(g5, (degs[0] + 1) % 8 === degs[0] ? 0 : degs[0] === 0 ? 1 : degs[0] - 1);
chk(st(g5).ears === 3 && /第 1 个音/.test(D(g5).msg()), '第一个音就弹错：当场说清错在第几个');
chk(/更高|更低/.test(D(g5).msg()), '还给方向：' + plain(D(g5).msg()));
chk(st(g5).attempt.length === 0, '弹错后整段作废，从头再来');
D(g5).setEars(4);
degs.forEach((dg) => tapKey(g5, dg));
chk(st(g5).score === 90 && st(g5).streak === 1, '两个音弹对 +90 分（40 + 25×2）');
chk(/旋律/.test(D(g5).msg()) && /do|re|mi|fa|sol|la|si/.test(D(g5).msg()), '结算用唱名报出这段旋律');
g5.pump(2.5);
D(g5).setLevel(23);
D(g5).beginLevel();
g5.pump(0.5);
chk(st(g5).q.notes.length === 6, '第 23 关旋律涨到 6 个音');
const mel2 = st(g5).q.notes.map((n) => SC.indexOf(n));
for (let i = 0; i < 5; i++) tapKey(g5, mel2[i]);
chk(st(g5).attempt.length === 5 && /对了 5\/6/.test(D(g5).msg()), '弹对了 5 个音会报进度');
D(g5).keyTap(mel2[5] === 7 ? 6 : mel2[5] + 1);
chk(st(g5).attempt.length === 0 && /第 6 个音/.test(D(g5).msg()), '最后一个音弹错照样整段作废');
const e5 = st(g5).ears, s5 = st(g5).score;
D(g5).answer(4);
chk(st(g5).score === s5 && st(g5).ears === e5, '旋律题里点选项什么都不发生（不扣分也不加分）');
const g5b = start(boot());
D(g5b).setQ({ mode: 'melody', tier: 0, ans: [60, 64, 67], notes: [60, 64, 67], opts: SC.slice() });
D(g5b).keyTap(0); D(g5b).keyTap(2); D(g5b).keyTap(4);
chk(st(g5b).score === 115 && st(g5b).runRight === 1, '三个音 +115（40+25×3=115）');
g5b.pump(2.5);
D(g5b).setQ({ mode: 'melody', tier: 0, ans: [60, 62], notes: [60, 62], opts: SC.slice() });
D(g5b).setStreak(0);
tapKey(g5b, 0); tapKey(g5b, 1);
chk(st(g5b).score === 115 + 90 && st(g5b).runRight === 2, '连击归零后两个音只拿基础分 +90（不吃倍率）');

/* ==================== 六、听和弦 ==================== */
const g6 = start(boot());
D(g6).setLevel(3);
D(g6).setQ({ mode: 'chord', tier: 1, ans: 'maj', notes: [55, 59, 62], opts: ['maj', 'min', 'dim', 'aug'] });
D(g6).answer('aug');
chk(/三度性质听对了/.test(D(g6).msg()), '增三和弦听错但三度性质对 —— 说清毛病在上面那个音：' + plain(D(g6).msg()));
D(g6).answer('min');
chk(/偏亮/.test(D(g6).msg()), '小三度听成大三度时告诉你它是偏亮那一类');
D(g6).answer('maj');
chk(st(g6).score === 80, '大三和弦 +80 分');
D(g6).setLevel(12);
D(g6).setQ({ mode: 'chord', tier: 2, ans: 'dom7', notes: [55, 59, 62, 65], opts: ['maj', 'min', 'dim', 'dom7', 'maj7', 'min7'] });
D(g6).answer('maj7');
chk(/不是「大七和弦」/.test(D(g6).msg()), '属七听成大七也有讲评：' + plain(D(g6).msg()).slice(0, 20) + '…');
D(g6).answer('dom7');
chk(st(g6).score === 80 + 100, '七和弦 100 分打底（上一题答错，连击已断）');
chk(/属七和弦/.test(D(g6).msg()) && /G3 B3 D4 F4/.test(D(g6).msg()) && /急着解决/.test(D(g6).msg()), '结算报出和弦名、构成音和一句性格');
g6.pump(2.5);
D(g6).setLevel(12);
D(g6).setQ({ mode: 'chord', tier: 2, ans: 'min7', notes: [55, 58, 62, 65], opts: ['maj', 'min', 'dim', 'min7', 'maj7', 'dom7'] });
D(g6).answer('min7');
chk(st(g6).score === 80 + 100 + 120, '连对第二题吃 ×1.2：七和弦 100 → 120');
chk(/小七和弦/.test(D(g6).msg()) && /G3 A#3 D4 F4/.test(D(g6).msg()), '小七和弦的构成音也照实报出来');
D(g6).setLevel(15);
D(g6).beginLevel();
g6.pump(0.4);
chk(st(g6).q.mode === 'chord' && st(g6).q.tier === 2, '第 15 关仍是和弦轮且已经是最难档');
chk(st(g6).q.opts.length <= 6 && st(g6).q.notes.length >= 3, '最难档选项 6 个以内、和弦至少三个音');

/* ==================== 七、耳力回血与判负 ==================== */
const g7 = start(boot());
setInt(g7, 7);
D(g7).answer(3);
chk(st(g7).ears === 3 && st(g7).missed === true, '答错一次，本关就记为「不干净」');
D(g7).setEars(3);
D(g7).answer(7);
g7.pump(2.5);
chk(st(g7).ears === 3, '不干净的那关即使答对也不回血');
const g7b = start(boot());
D(g7b).setEars(2);
setInt(g7b, 7);
D(g7b).answer(7);
chk(st(g7b).ears === 3 && /耳力回一口/.test(D(g7b).msg()), '一次听对回一口耳力（2 → 3）');
D(g7b).setEars(4);
g7b.pump(2.5);
setInt(g7b, 4);
D(g7b).answer(4);
chk(st(g7b).ears === 4, '耳力满员就不再回，也不会溢出');
const g7c = start(boot());
D(g7c).setEars(1);
setInt(g7c, 7);
D(g7c).answer(3);
chk(st(g7c).phase === 'over' && st(g7c).ears === 0, '耳力见底再答错 —— 判负');
chk(D(g7c).ovShown() && /纯五度/.test(D(g7c).ov()) && /G3 ↑ D4/.test(D(g7c).ov()), '判负页直接公布正解与音名');
chk(/听到第 1 关/.test(D(g7c).ov()) && /本局听对 0 题/.test(D(g7c).ov()), '判负页给出进度');
chk(D(g7c).btns().replay === true && D(g7c).btns().hint === true, '判负后按钮全禁用');
chk(g7c.storage.getItem('yin.round') === '1', '最远听到第 1 关写盘');
const g7d = start(boot());
D(g7d).setEars(1);
D(g7d).setLevel(9);
setInt(g7d, 7);
D(g7d).answer(3);
chk(g7d.storage.getItem('yin.round') === '9', '第 9 关判负也要把最远纪录留住');

/* ==================== 八、回放 ==================== */
const g8 = start(boot());
setInt(g8, 7);
const osc8 = g8.audio.created.osc;
D(g8).replay();
chk(st(g8).replays === 2 && g8.audio.created.osc > osc8, '再听一遍扣一次回放并发声');
D(g8).replay(); D(g8).replay();
chk(st(g8).replays === 0, '三次回放用完');
const osc8b = g8.audio.created.osc;
D(g8).replay();
chk(st(g8).replays === 0 && g8.audio.created.osc === osc8b && /用完了/.test(D(g8).msg()), '用完就不许再放（也不发出一点声音）');
chk(D(g8).hud().re === '0', 'HUD 上次数为 0');
D(g8).answer(3);
chk(st(g8).replays === 1, '答错退还一次回放 —— 耳朵又回来了');
D(g8).answer(7);
chk(st(g8).score === 60 && st(g8).missed === true, '回放用完也答得对，但本关已经脏了');
g8.pump(2.6);
chk(st(g8).replays === 3 && st(g8).q.mode === 'melody', '新关按当前难度重发回放（且轮换到旋律）');

/* ==================== 九、先生透口气 ==================== */
const g9 = start(boot());
setInt(g9, 7);
D(g9).hint();
const o9 = st(g9).q.opts;
chk(st(g9).hints === 2 && o9.length === 2, '提示划掉两个干扰项：4 选 → 2 选（实际剩 ' + o9.length + '）');
chk(o9.indexOf(7) >= 0, '正解绝不会被划掉');
chk(D(g9).optBtns().length === 2, '屏幕上的选项跟着少掉');
D(g9).hint();
chk(st(g9).hints === 1 && st(g9).q.opts.length >= 1 && st(g9).q.opts.indexOf(7) >= 0, '再提示还能划（正解仍在）');
D(g9).setHints(0);
const o9b = st(g9).q.opts.join(',');
D(g9).hint();
chk(st(g9).hints === 0 && st(g9).q.opts.join(',') === o9b && /用完了/.test(D(g9).msg()), '提示用完只动嘴');
const g9c = start(boot());
g9c.pump(2.5);
D(g9c).setLevel(2);
D(g9c).beginLevel();
g9c.pump(0.5);
D(g9c).keyTap(SC.indexOf(st(g9c).q.notes[0]));
D(g9c).hint();
chk(st(g9c).hints === 2 && st(g9c).lit[0] === 1 && st(g9c).lit[1] === 2, '旋律题的提示是让下一个键亮起来');
chk(D(g9c).keyBtns().every((b) => !b.off), '旋律轮的琴键随时可点（提示只是发光，不替玩家按）');

/* ==================== 十、难度、快捷键与声音 ==================== */
const gd = start(boot({ 'yin.diff': 'hall' }));
chk(st(gd).diff === 'hall' && st(gd).ears === 1 && st(gd).replays === 1 && st(gd).hints === 1, '演奏厅：1 耳 1 放 1 提示');
setInt(gd, 7);
D(gd).answer(7);
chk(st(gd).score === 96, '演奏厅 1.6 倍：round(60×1.6) = 96');
const gw = start(boot());
gw.byId('diff').querySelectorAll('button').find((b) => b.dataset.diff === 'warm').dispatch('click');
gw.pump(0.4);
chk(st(gw).diff === 'warm' && gw.storage.getItem('yin.diff') === 'warm', '点难度条即重开并写盘');
chk(st(gw).ears === 8 && st(gw).replays === 5 && st(gw).hints === 5, '热身房 8 耳 5 放 5 提示');
const gx = start(boot({ 'yin.diff': 'stadium' }));
chk(st(gx).diff === 'pro', '存档里出现没见过的难度就退回琴房');
const gk = start(boot());
setInt(gk, 7);
gk.key('1');
chk(st(gk).ears === 3 && st(gk).score === 0, '数字键选第 1 项：答错照样罚耳力');
const optN = st(gk).q.opts.length;
gk.key(String(optN + 1));
chk(st(gk).ears === 3 && st(gk).score === 0, '超出选项数的数字键什么都不做');
gk.key(String(st(gk).q.opts.indexOf(7) + 1));
chk(st(gk).score === 60, '数字键也能答对');
gk.pump(2.5);
chk(st(gk).q.mode === 'melody' && st(gk).hints === 3, '第 2 关轮到旋律');
D(gk).setQ({ mode: 'melody', tier: 0, ans: [60, 64], notes: [60, 64], opts: SC.slice() });
gk.key('h');
chk(st(gk).hints === 3, '旋律轮里 h 是第 6 枚琴键，不会被当成提示');
setInt(gk, 7);
gk.key('h');
chk(st(gk).hints === 2, '换回辨音程轮，H 才是提示');
gk.key('t');
chk(/本机战绩/.test(D(gk).ov()) && /历代累计听对/.test(D(gk).ov()), 'T 键战绩页能看到累计听对');
gk.key('escape');
chk(!D(gk).ovShown(), 'Esc 收遮罩');
gk.key('n');
chk(st(gk).phase === 'play' && st(gk).level === 1 && st(gk).score === 0, 'N 重开一局');
gk.key('m');
chk(gk.byId('btnSound').textContent === '🔇' && gk.storage.getItem('yin.muted') === '1', 'M 静音并记住');
const oscK = gk.audio.created.osc;
setInt(gk, 7);
D(gk).replay();
chk(gk.audio.created.osc === oscK, '静音档回放不发声（但次数照样扣）');
gk.key(' ');
chk(st(gk).replays === 1, '空格键也能回放（3 → 2 → 1）');
const gm = start(boot({ 'yin.muted': '1' }));
chk(gm.byId('btnSound').textContent === '🔇', '开机即静音');
gm.byId('btnReplay').dispatch('click');
gm.byId('btnHint').dispatch('click');
gm.byId('btnStats').dispatch('click');
gm.pump(0.3);
chk(/本机战绩/.test(D(gm).ov()), '三个按钮都接得上');
gm.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again').dispatch('click');
gm.pump(0.4);
chk(st(gm).phase === 'play' && st(gm).ears === 4, '「再听一遍」重开');
const gt = boot();
D(gt).newRun('pro');
gt.pump(0.4);
setInt(gt, 7);
D(gt).setEars(1);
D(gt).answer(3);
chk(st(gt).phase === 'over', '造好败局');
const again = gt.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again');
again.dispatch('click');
gt.pump(0.4);
chk(st(gt).phase === 'play' && st(gt).ears === 4, '败局页「再听一遍」补满耳力');

summary('绝对音感', fails);
