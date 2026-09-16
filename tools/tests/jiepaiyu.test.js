'use strict';
/* 节拍雨：谱面自洽（前奏留白、同轨不连打、四轨都用上）→ 判定窗口（准/早/晚/空击/漏）→
   连击与 FEVER 翻倍 → 血漏光中断 → 键盘真打完整首并写纪录 → 演示模式不计纪录 → 慢速与静音。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__r = {' +
  ' st: () => ({ phase, mt, score, combo, maxCombo, hp, fever, feverT, auto, slow, judged,' +
  '   song: song.id, bpm: song.bpm, scroll: song.scroll, total: chart.total, end: chart.end,' +
  '   notes: chart.notes.length, music: chart.music.length }),' +
  ' mt: () => mt, note: (i) => chart.notes[i], keys: () => KEYS, songOf: () => song,' +
  ' chartOf: (id) => buildChart(songById(id)), byId: (s) => songById(s),' +
  ' setSong, start, press, judgeOf: () => judged, all: () => chart.notes.slice(),' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('节拍雨源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const R = (g) => g.ctx.__r;
const st = (g) => R(g).st();
const KEYS = ['d', 'f', 'j', 'k'];
const actBtn = (g, act) => g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === act);

function boot(opts) {
  const g = loadGame('jiepaiyu', Object.assign({ transform: inject }, opts || {}));
  g.pump(0.3);
  return g;
}
function play(g) {
  actBtn(g, 'start').dispatch('click');
  g.pump(0.2);
  return g;
}
// 走到第 i 个音符该按的那一刻（每帧 16ms，落在 PERFECT 窗内）
function till(g, t) {
  for (let k = 0; k < 8000 && R(g).mt() < t; k++) g.tick(16);
}
function hit(g, i) {
  const n = R(g).note(i);
  till(g, n.t);
  g.key(KEYS[n.lane]);
  return n;
}
// 挂机到底：一帧一帧走，直到判定自己撑不住
function idle(g) {
  for (let k = 0; k < 9000 && st(g).phase === 'play'; k++) g.tick(16);
}

/* ==================== 一、谱面生成 ==================== */
const charts = {};
for (const id of ['easy', 'mid', 'hard']) charts[id] = R(boot()).chartOf(id);
const C = charts.easy;
chk(C.notes.length > 60 && C.music.length > 200, '晨跑谱面：' + C.notes.length + ' 个旋律音 / ' + C.music.length + ' 个伴奏事件');
chk(C.notes.every((n, i) => !i || n.t >= C.notes[i - 1].t - 1e-9), '音符按时间升序（否则判定与绘制都会错乱）');
chk(C.notes.every((n) => n.lane >= 0 && n.lane <= 3), '每条音符都落在 0-3 四轨之内');
const beat = 60 / 96;
chk(C.notes.every((n) => n.t >= 2 * beat * 4 - 1e-6), '前两小节只留伴奏：最早一个音在 ' + C.notes[0].t.toFixed(2) + 's（不给人反应时间的谱面不能要）');
for (const id of ['easy', 'mid', 'hard']) {
  const c = charts[id];
  const byLane = [[], [], [], []];
  c.notes.forEach((n) => byLane[n.lane].push(n.t));
  const gap = c.notes.length ? Math.min.apply(null, byLane.filter((L) => L.length > 1)
    .map((L) => Math.min.apply(null, L.slice(1).map((t, i) => t - L[i])))) : 99;
  const song = R(boot()).byId(id);
  chk(gap >= song.gap - 1e-6, id + ' 同一条轨最小间隔 ' + gap.toFixed(3) + 's ≥ 限流 ' + song.gap + 's（同一根手指不会打不过来的密）');
  chk(byLane.filter((L) => L.length).length === 4, id + ' 四条轨都有音符：' + byLane.map((L) => L.length).join('/'));
  const duos = c.notes.filter((n, i) => i && n.t - c.notes[i - 1].t < 1e-6 && n.lane !== c.notes[i - 1].lane).length;
  chk(id === 'easy' ? duos === 0 : duos > 0, id + ' 双押 ' + duos + ' 处' + (id === 'easy' ? '（练习曲不该有）' : ''));
}
chk(charts.easy.notes.length < charts.mid.notes.length && charts.mid.notes.length < charts.hard.notes.length,
  '三首曲子难度递增：' + charts.easy.notes.length + ' < ' + charts.mid.notes.length + ' < ' + charts.hard.notes.length);
const again = R(boot()).chartOf('hard');
chk(JSON.stringify(again.notes.map((n) => n.t + ':' + n.lane)) === JSON.stringify(charts.hard.notes.map((n) => n.t + ':' + n.lane)),
  '谱面用种子生成：同一首每次打开完全一样（可复现才能测）');

/* ==================== 二、开局与 HUD ==================== */
const g = boot();
chk(st(g).phase === 'intro' && /节拍雨/.test(g.byId('overlayContent').innerHTML), '开场有说明遮罩');
chk(/开演/.test(g.byId('overlayContent').innerHTML) && /先看一遍/.test(g.byId('overlayContent').innerHTML), '遮罩上有「开演」与「演示」两个出口');
actBtn(g, 'start').dispatch('click');
g.pump(0.2);
chk(!g.byId('overlay')._cls.includes('show'), '点开演后遮罩关闭');
chk(st(g).phase === 'play' && st(g).score === 0 && st(g).hp === 100, '进入演奏态，分数与血量归位');
chk(g.byId('score').textContent === '0' && g.byId('hp').textContent === '100', 'HUD 跟着归零');
chk(st(g).notes === charts.easy.notes.length, '演奏用的是当前曲目（' + st(g).notes + ' 个音）');

/* ==================== 三、判定窗口 ==================== */
const n0 = R(g).note(0);
till(g, n0.t - 0.14);                      // 差 0.14s：已在 MISS 窗内、还没进 GOOD 窗
g.key(KEYS[n0.lane]);
g.pump(0.05);
chk(st(g).judged.perfect === 0 && st(g).judged.miss === 0, '早按 0.14s 不吃音符（留给玩家再按一次的机会）');
chk(st(g).hp === 100 && st(g).combo === 0, '早按不罚：不掉血也不清连击（这一轨确实有音要过来）');
hit(g, 0);
chk(st(g).judged.perfect === 1 && st(g).combo === 1 && st(g).score === 305,
  '正点按中 → PERFECT，连击 1，300×(1+1/60) = 305（实得 ' + st(g).score + '）');
chk(g.byId('score').textContent === String(st(g).score) && g.byId('combo').textContent === '1', 'HUD 同步分数与连击');
hit(g, 1);
chk(st(g).judged.perfect === 2 && st(g).combo === 2 && st(g).score === 615,
  '第二个音同样正中：300×(1+2/60) = 310，累计 ' + st(g).score);
chk(st(g).maxCombo === 2, '最大连击跟着涨');
chk(st(g).fever > 0.06 && st(g).fever < 0.15, '两个 PERFECT 攒到 ' + Math.round(st(g).fever * 100) + '% 热度');

// 空击：趁两条音之间，去按一条完全没有近音的轨
const n2 = R(g).note(2);
till(g, (R(g).note(1).t + n2.t) / 2);
const emptyLane = [0, 1, 2, 3].find((l) => !R(g).all().some((n) => !n.judged && n.lane === l && n.t - st(g).mt <= 0.17));
chk(emptyLane != null, '此刻能找到一条没有近音的空轨（轨 ' + emptyLane + '）');
const hp0 = st(g).hp;
g.key(KEYS[emptyLane]);
g.pump(0.05);
chk(st(g).combo === 0 && st(g).hp === hp0 - 1, '敲在没音的轨上：连击清零 + 掉 1 血（防乱拍蹭分）');
chk(st(g).judged.perfect === 2 && st(g).judged.miss === 0, '空击不产生任何判定（PERFECT 仍是 2、MISS 仍是 0）');
// 漏着不管
const before = st(g).judged.miss;
till(g, n2.t + 0.2);
g.pump(0.05);
chk(st(g).judged.miss === before + 1 && st(g).hp <= 92, '放着不打 → MISS，掉 7 血（' + st(g).hp + '）');
chk(st(g).judged.perfect === 2, '漏音不算命中');

/* ==================== 四、FEVER ==================== */
const gf = play(boot());
let feverSeen = false, doubleSeen = false, base = 0;
for (let i = 0; i < 26 && !feverSeen; i++) {
  const sc = st(gf).score;
  hit(gf, i);
  const s2 = st(gf).score;
  if (st(gf).feverT > 0) { feverSeen = true; base = s2 - sc; }
  else if (st(gf).combo === 2) { chk(s2 - sc === 310, '2 连击时 PERFECT = 300×(1+2/60) = ' + (s2 - sc)); }
}
chk(feverSeen && st(gf).feverT > 0, '连击攒满 20 个 PERFECT 进入 FEVER（feverT ' + st(gf).feverT.toFixed(1) + 's）');
for (let i = 26; i < 32 && !doubleSeen; i++) {
  const sc = st(gf).score;
  hit(gf, i);
  const gain = st(gf).score - sc;
  if (st(gf).feverT > 0 && gain >= 600) doubleSeen = true;
}
chk(doubleSeen, 'FEVER 期间同一判定分数翻倍（单音收益 ' + base + ' → ' + st(gf).score + ' 累计）');

/* ==================== 五、演出中断 ==================== */
const gb = play(boot());
idle(gb);
chk(st(gb).phase === 'fail' && st(gb).hp === 0, '一路不打到血漏光 → 演出中断（MISS ' + st(gb).judged.miss + ' 个）');
chk(/演出中断/.test(gb.byId('overlayContent').innerHTML), '中断遮罩写明原因');
chk(/💔|F/.test(gb.byId('overlayContent').innerHTML), '中断给的是 F 级');
chk(!gb.storage.getItem('beat.best.easy'), '没打完不写最高分纪录');
chk(gb.storage.getItem('beat.song') === 'easy', '但会记住你选的曲子');

/* ==================== 六、键盘真打完整首 → 写纪录 ==================== */
const gw = play(boot());
const total = st(gw).notes;
for (let i = 0; i < total; i++) hit(gw, i);
till(gw, st(gw).end);
gw.pump(0.5);
const rw = st(gw);
chk(rw.judged.perfect === total && rw.judged.miss === 0, '纯键盘逐音打完整首：' + total + ' 个音全 PERFECT');
chk(rw.phase === 'result' && /一曲终了/.test(gw.byId('overlayContent').innerHTML), '整首轮幕 → 结算');
chk(gw.byId('acc').textContent === '100%', '准度 100%：' + gw.byId('acc').textContent);
chk(/class="rank s"/.test(gw.byId('overlayContent').innerHTML), '全 PERFECT 评级 S');
chk(+gw.storage.getItem('beat.best.easy') === rw.score, '写入最高分 beat.best.easy = ' + rw.score);
chk(+gw.storage.getItem('beat.combo.easy') === total, '写入最长连击 beat.combo.easy = ' + total);
// 再打一次，故意打得更差：最高分不该被覆盖
const g2 = play(loadGame('jiepaiyu', { transform: inject, storage: JSON.parse(JSON.stringify(gw.storage._data)) }));
const t2 = st(g2).notes;
for (let i = 0; i < t2; i++) {
  if (i % 9 === 8) continue;                        // 每九个音故意漏一个（漏太多会当场没血）
  hit(g2, i);
}
till(g2, st(g2).end);
g2.pump(0.5);
chk(st(g2).phase === 'result', '漏一部分仍能打完（没被扣死：剩 ' + st(g2).hp + ' 血）');
chk(st(g2).judged.miss === Math.floor(t2 / 9), '故意漏掉的音都记成 MISS（' + st(g2).judged.miss + '）');
chk(+g2.storage.getItem('beat.best.easy') === rw.score, '更差的一局不覆盖最高分');
chk(+g2.storage.getItem('beat.combo.easy') === total, '更差的一局也不覆盖最长连击（仍是 ' + total + '，本局最大只有 ' + st(g2).maxCombo + '）');
chk(/新纪录|本机最高/.test(g2.byId('overlayContent').innerHTML), '结算里能看到本机纪录');
chk(/换一首/.test(g2.byId('overlayContent').innerHTML), '结算可以换曲子');
chk(/B$|C$/.test((g2.byId('overlayContent').innerHTML.match(/class="rank (\w)"/) || [])[1] + '$') || /rank [bc]/.test(g2.byId('overlayContent').innerHTML), '漏 1/9 的准度只配 B/C 级');

/* ==================== 七、演示模式 ==================== */
const ga = boot();
actBtn(ga, 'auto').dispatch('click');
ga.pump(0.3);
chk(st(ga).auto === true && st(ga).phase === 'play', '「先看一遍」= 自动演奏');
till(ga, st(ga).end + 1);
ga.pump(0.5);
chk(st(ga).phase === 'result' && st(ga).judged.miss === 0, '演示模式自己走完一整首');
chk(st(ga).score > 0 && !ga.storage.getItem('beat.best.easy'), '演示打得再高也不计本机纪录');
chk(/演示模式不计纪录/.test(ga.byId('overlayContent').innerHTML), '结算里说清演示不计纪录');

/* ==================== 八、切歌、慢速、暂停、静音 ==================== */
const gs = boot();
gs.key('2');
gs.pump(0.2);
chk(st(gs).song === 'mid' && st(gs).bpm === 124, '按 2 切到《霓虹夜行》124 BPM');
chk(/霓虹夜行/.test(gs.byId('overlayContent').innerHTML), '切歌后说明遮罩跟着换曲目');
gs.key('3');
gs.pump(0.2);
chk(st(gs).song === 'hard' && st(gs).scroll < 0.95, '按 3 切到《风暴骤雨》，下落更快（' + st(gs).scroll + 's）');
play(gs);
const mt0 = st(gs).mt;
gs.pump(2);
chk(Math.abs(st(gs).mt - mt0 - 2) < 0.05, '正常倍速：2 秒走 2 秒（' + (st(gs).mt - mt0).toFixed(2) + '）');
gs.byId('btnSlow').dispatch('click');
const mt1 = st(gs).mt;
gs.pump(2);
chk(Math.abs(st(gs).mt - mt1 - 1.5) < 0.08, '慢速档 0.75×：2 秒只走 ' + (st(gs).mt - mt1).toFixed(2) + ' 秒');
chk(gs.byId('slowState').textContent === '0.75×', '慢速状态写在小按钮上');
gs.key('p');
gs.pump(0.2);
chk(st(gs).phase === 'pause' && /已暂停/.test(gs.byId('overlayContent').innerHTML), 'P 键暂停');
const mt2 = st(gs).mt;
gs.pump(3);
chk(st(gs).mt === mt2, '暂停时音乐时间不动');
actBtn(gs, 'resume').dispatch('click');
gs.pump(1);
chk(st(gs).phase === 'play' && st(gs).mt > mt2, '「继续」能真的接着放');
const oscBefore = gs.audio.created.osc;
chk(oscBefore > 0, '伴奏是真的在发声（累计起振 ' + oscBefore + ' 次）');
gs.byId('btnSound').dispatch('click');
chk(gs.storage.getItem('beat.muted') === '1' && gs.byId('btnSound').textContent === '🔇', '静音开关入档 beat.muted');
const mutedAt = gs.audio.created.osc;
gs.pump(4);
chk(gs.audio.created.osc === mutedAt, '静音后不再新增发声（' + mutedAt + ' → ' + gs.audio.created.osc + '）');
idle(gs);
chk(st(gs).phase === 'fail' && st(gs).judged.miss > 0, '静音下判定与血量照常运转（一个没打 → 照样漏到中断，MISS ' + st(gs).judged.miss + '）');

/* ==================== 九、只碰静音不算玩过（首页口径） ==================== */
const gm = loadGame('jiepaiyu', { transform: inject, storage: { 'beat.muted': '1' } });
gm.pump(0.5);
chk(gm.byId('btnSound').textContent === '🔇', '带 beat.muted=1 启动即为静音');
chk(Object.keys(gm.storage._data).every((k) => k.indexOf('beat.') === 0), '节拍雨只写 beat.* 键');

summary('节拍雨', fails);
