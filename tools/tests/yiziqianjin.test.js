'use strict';
/* 一字千金：五轴（声母/韵母/声调/部首/结构）字库自洽 → 猜字扣金与锁定坐标 →
   候选集永不排除答案（核心不变式，随机多轮验证）→ 买线索 → 千金花光判负 → 连胜与存档 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__z = {' +
  ' st: () => ({ phase, coin, tries, streak, diff: diff, answer: answer ? answer.ch : "",' +
  '   known: Object.keys(known).sort().join(","), bought: Object.keys(bought).sort().join(","),' +
  '   hist: hist.slice(), cand: candidates().length,' +
  '   hits: last ? AXES.filter((a) => last.hits[a.key]).map((a) => a.key).join(",") : "" }),' +
  ' hans: () => HANS.slice(), table: () => TABLE.slice(), axes: () => AXES.slice(), diffs: () => DIFFS, easy: () => EASY_CHARS.slice(),' +
  ' guess: guess, buy: buy, newPuzzle: newPuzzle, candidates: candidates, poolChars: poolChars, renderAll: renderAll,' +
  ' by: (ch) => (BY[ch] ? { ch: ch, init: BY[ch].init, fin: BY[ch].fin, tone: BY[ch].tone, rad: BY[ch].rad, str: BY[ch].str } : null),' +
  ' setAnswer: (ch) => { answer = BY[ch]; }, setCoin: (v) => { coin = v; }, setPhase: (v) => { phase = v; },' +
  ' setStreak: (v) => { streak = v; },' +
  ' clean: (ch) => { answer = BY[ch]; known = {}; bought = {}; hist = []; last = null; tries = 0; phase = "play"; coin = DIFFS[diff].budget; renderAll(); },' +
  ' head: () => headEl.innerHTML, ov: () => ovContent.innerHTML, logHTML: () => logEl.innerHTML, axesHTML: () => axesEl.innerHTML,' +
  ' chipNames: () => chipsEl.querySelectorAll("[data-ch]").map((b) => b.dataset.ch),' +
  ' chipCls: (n) => { var b = chipsEl.querySelectorAll("[data-ch]").filter((x) => x.dataset.ch === n)[0]; return b ? b._cls.join(" ") : ""; },' +
  ' buyBtn: (ax) => { var b = buyEl.querySelectorAll("button").filter((x) => x.dataset.axis === ax)[0]; return b ? { disabled: !!b.disabled, text: String(b.textContent) } : null; },' +
  ' hud: () => ({ coin: elCoin.textContent, tries: elTries.textContent, streak: elStreak.textContent, cand: elCand.textContent }),' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('一字千金源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__z;
const st = (g) => D(g).st();
const AX = ['init', 'fin', 'tone', 'rad', 'str'];

function boot(storage) {
  const g = loadGame('yiziqianjin', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  return g;
}
function play(g) {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
  if (btn) btn.dispatch('click');
  return g;
}
// 把答案钉成某个字、清干净局面，这样下面的分数才是可推算的
const rig = (g, ch) => { D(g).clean(ch); return g; };
const allChars = D(boot()).table().map((e) => e.ch);
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ==================== 一、字库自洽 ==================== */
const g0 = boot();
const HANS = D(g0).hans();
const TABLE = D(g0).table();
const INITS = 'b p m f d t n l g k h j q x zh ch sh r z c s y w'.split(' ');
const STRS = ['左右', '上下', '包围', '独体'];
const bad = [];
if (HANS.length !== TABLE.length) bad.push('有 ' + (HANS.length - TABLE.length) + ' 条格式不合格被丢掉');
TABLE.forEach((e) => {
  if ([...e.ch].length !== 1) bad.push('字不是单个字符：' + e.ch);
  if (INITS.indexOf(e.init) < 0) bad.push('声母不在表内 ' + e.ch + ':' + e.init);
  if (!/^[1-4]$/.test(e.tone)) bad.push('声调非法 ' + e.ch + ':' + e.tone);
  if (STRS.indexOf(e.str) < 0) bad.push('结构非法 ' + e.ch + ':' + e.str);
  if (!e.fin || /\s|\d|\|/.test(e.fin)) bad.push('韵母非法 ' + e.ch + ':' + e.fin);
  if ([...e.rad].length < 1 || [...e.rad].length > 3) bad.push('部首长度可疑 ' + e.ch + ':' + e.rad);
  if ('jqxy'.indexOf(e.init) >= 0 && /^u/.test(e.fin)) bad.push('j/q/x/y 后面该写 ü 却写了 u：' + e.ch + ':' + e.fin);
  if ('jqxnly'.indexOf(e.init) < 0 && /ü/.test(e.fin)) bad.push('n/l 以外的声母不该配 ü：' + e.ch + ':' + e.fin);
});
chk(HANS.length >= 280 && bad.length === 0,
  '字库 ' + TABLE.length + ' 条，声母白名单/四声/四种结构/ü 变写规则全部合法' +
  (bad.length ? ' —— 问题：' + bad.slice(0, 5).join(' | ') : ''));
const dupCh = TABLE.filter((e, i) => TABLE.findIndex((x) => x.ch === e.ch) !== i).map((e) => e.ch);
chk(dupCh.length === 0, '没有重复的字（同一个字出现两次会让玩家怀疑人生）' + (dupCh.length ? '：' + dupCh.join('') : ''));
const sig = {};
TABLE.forEach((e) => { const k = AX.map((a) => e[a]).join('|'); (sig[k] = sig[k] || []).push(e.ch); });
const twins = Object.keys(sig).filter((k) => sig[k].length > 1).map((k) => sig[k].sort().join('/'));
chk(twins.length === 1 && twins[0] === '进近'.split('').sort().join('/'),
  '全库只有 1 组五轴完全相同的字：' + twins.join('、') + ' —— 恰好用来验证"五轴全中也不是答案"');
const toneN = [1, 2, 3, 4].map((t) => TABLE.filter((e) => e.tone === String(t)).length);
const strN = STRS.map((s) => TABLE.filter((e) => e.str === s).length);
chk(toneN.every((n) => n >= 50) && strN.every((n) => n >= 20),
  '四个声调各 ' + toneN.join('/') + ' 字、四种结构各 ' + strN.join('/') + ' 字，没有哪一轴形同虚设');
chk(new Set(TABLE.map((e) => e.rad)).size >= 60, '部首有 ' + new Set(TABLE.map((e) => e.rad)).size + ' 种，猜部首不会大面积撞车');
chk(new Set(TABLE.map((e) => e.fin)).size >= 25, '韵母有 ' + new Set(TABLE.map((e) => e.fin)).size + ' 种');
const EASY = D(g0).easy();
chk(EASY.length >= 60 && EASY.every((c) => !!D(g0).by(c)),
  '新手档答案池 ' + EASY.length + ' 个常用字，全部都在字库里查得到');

/* ==================== 二、开局与候选面板 ==================== */
let g = boot();
chk(/一字千金/.test(D(g).ov()) && /开始猜/.test(D(g).ov()), '开场讲清"五个坐标锁一个字"并有开始按钮');
play(g);
let s = st(g);
chk(s.phase === 'play' && s.coin === D(g).diffs().normal.budget && s.tries === 0,
  '开局 ' + s.coin + ' 金，还没猜过');
chk(s.cand === TABLE.length && D(g).chipNames().length === s.cand,
  '全字库档候选 ' + s.cand + ' 字，字海里的按钮数量与之一致');
chk(D(g).chipNames().indexOf(s.answer) >= 0, '答案一定在候选列表里（开局：' + s.answer + '）');
chk(D(g).hud().cand === String(s.cand) && D(g).hud().coin === String(s.coin), '顶部四个数字与状态同步');
rig(g, '山');
chk(st(g).cand === TABLE.length, '换题后候选重新数');
const buyBtns = g.byId('buy').querySelectorAll('button');
chk(buyBtns.length === 5 && buyBtns.every((b) => AX.indexOf(b.dataset.axis) >= 0),
  '五个买线索按钮的 data-axis 与代码里的轴名一一对应（写错一个就白扣钱）');

/* ==================== 三、猜字与扣金 ==================== */
rig(g, '山');
const cost = D(g).diffs().normal.cost;
let r = D(g).guess('＃');
chk(r === false && st(g).coin === 1000 && st(g).tries === 0, '猜不存在的字符不扣钱');
chk(/不在字库/.test(D(g).head()), '并且告诉你为什么：' + D(g).head());
r = D(g).guess('');
chk(r === false && st(g).coin === 1000, '空输入也不扣钱');
r = D(g).guess('水');
chk(r === true && st(g).coin === 1000 - cost && st(g).tries === 1, '猜一次花 ' + cost + ' 金');
r = D(g).guess('水');
chk(r === false && st(g).coin === 1000 - cost && st(g).tries === 1, '同一个字不能猜两次');
chk(/已经猜过/.test(D(g).head()), '重复猜会提醒：' + D(g).head());
chk(st(g).hits === 'init,str', '水(sh/ui/3/水/独体) 猜 山(sh/an/1/山/独体) → 只中声母与结构：' + st(g).hits);
chk(/结构/.test(D(g).axesHTML()) && /独体/.test(D(g).axesHTML()), '五轴面板显示出来');
chk(/<div class="row/.test(D(g).logHTML()) && /水/.test(D(g).logHTML()), '猜过的字进记录区');
rig(g, '山');
D(g).guess('水'); D(g).guess('火'); D(g).guess('田');
chk(st(g).coin === 1000 - 3 * cost && st(g).tries === 3, '连猜三次扣 ' + 3 * cost + ' 金');
chk(st(g).hist.join('') === '水火田', '记录顺序保留：' + st(g).hist.join(''));
chk(D(g).chipCls('水').indexOf('used') >= 0, '猜过的字在字海里标成已用');
const before = st(g).coin;
D(g).setCoin(50);
r = D(g).guess('木');
chk(r === false && st(g).coin === 50 && /金不够/.test(D(g).head()), '金不够时猜不动（剩 ' + st(g).coin + '）');
D(g).setCoin(0);
r = D(g).guess('山');
chk(r === false && st(g).phase === 'play', '身无分文时连答案也猜不了 —— 只能靠界面提示');

/* ==================== 四、命中与收窄（核心不变式） ==================== */
rig(g, '明');
r = D(g).guess('明');
chk(r === true && st(g).phase === 'won', '猜中即胜');
chk(st(g).coin === 1000 - cost, '剩下的金就是得分：' + st(g).coin);
chk(st(g).streak === 1 && Number(g.storage.getItem('han.solved')) === 1, '连胜 +1、累计猜中写进 han.solved');
chk(Number(g.storage.getItem('han.best')) === 1000 - cost, 'han.best 记下这一局的余金');
chk(/猜中了/.test(D(g).ov()) && D(g).ov().indexOf('hz-answer">明<') >= 0, '胜利遮罩亮出这个字：' + (D(g).ov().match(/<h2>[^<]+/) || [''])[0]);
chk(/左右/.test(D(g).ov()) && /日/.test(D(g).ov()), '胜利页复盘：明 = 声母/韵母/声调/部首/结构');
// 五轴全中但不是答案
g = boot();
play(g);
rig(g, '近');
r = D(g).guess('进');
chk(r === true && st(g).phase === 'play', '猜「进」中五轴但不是答案，游戏继续');
chk(st(g).hits === AX.join(','), '五轴全中：' + st(g).hits);
chk(/五轴全中/.test(D(g).head()), '界面明确告诉你"同音同部首还有别的字"：' + D(g).head());
chk(st(g).cand === 2 && D(g).chipNames().sort().join('') === '进近'.split('').sort().join(''),
  '锁定五条坐标后候选正好剩 近/进 两个');
r = D(g).guess('近');
chk(st(g).phase === 'won' && r === true, '再猜一步就是答案');
// 随机多轮：答案永远不被误排除
let invBad = [];
let monoBad = 0;
for (let round = 0; round < 120; round++) {
  const an = rnd(allChars);
  rig(g, an);
  let prev = st(g).cand;
  const pool = allChars.slice();
  for (let k = 0; k < 6; k++) {
    const pick = rnd(pool);
    D(g).guess(pick);
    const c = D(g).candidates();
    if (c.indexOf(an) < 0) invBad.push(an + ' 被排除（猜了 ' + pick + '）');
    const kn = st(g).known.split(',').filter(Boolean);
    for (const ax of kn) if (!c.every((ch) => D(g).by(ch)[ax] === D(g).by(an)[ax])) invBad.push(ax + ' 轴没锁住：' + an);
    if (c.length > prev) monoBad++;
    prev = c.length;
    if (st(g).phase !== 'play') break;
  }
  if (round % 3 === 0) { const ax = rnd(AX); D(g).buy(ax); if (D(g).candidates().indexOf(an) < 0) invBad.push('买 ' + ax + ' 之后排除了答案'); }
}
chk(invBad.length === 0, '随机 120 题 × 6 猜 + 买线索：候选集始终包含答案，锁定的轴不会漏' +
  (invBad.length ? ' —— 例：' + invBad.slice(0, 3).join(' | ') : ''));
chk(monoBad === 0, '候选数只会越猜越少，不会莫名变多');
// 只剩一个候选
g = boot();
play(g);
rig(g, '山');
D(g).setCoin(1000);
AX.forEach((ax) => D(g).buy(ax));
chk(st(g).cand === 1 && /只剩一个候选/.test(D(g).head()), '五条坐标全买下 → 候选唯一并提示：' + D(g).head());
chk(D(g).chipNames().join('') === '山' && D(g).chipCls('山').indexOf('sole') >= 0, '字海只剩那一颗，并高亮为唯一候选');

/* ==================== 五、买线索 ==================== */
g = boot();
play(g);
const buyPrice = D(g).diffs().normal.buy;
rig(g, '格');
D(g).setCoin(1000);
D(g).setStreak(0);
let coin0 = st(g).coin;
D(g).buy('rad');
chk(st(g).coin === coin0 - buyPrice, '买「部首」花 ' + buyPrice + ' 金');
chk(st(g).known === 'rad' && st(g).bought === 'rad', 'known/bought 都记下 rad');
chk(D(g).by('格').rad === '木' && D(g).candidates().every((c) => D(g).by(c).rad === '木'),
  '买来的部首真的是答案的部首（木），候选全部收窄成木字旁');
chk(/买下「部首」/.test(D(g).head()), '提示写明买到了什么：' + D(g).head());
coin0 = st(g).coin;
D(g).buy('rad');
chk(st(g).coin === coin0 && /已经知道/.test(D(g).head()), '已知坐标不能重复买');
chk(D(g).buyBtn('rad').disabled, '买过的按钮变成禁用');
D(g).guess('机');
chk(st(g).known.split(',').indexOf('rad') >= 0, '猜字命中的轴也算知道，无需再花钱');
coin0 = st(g).coin;
D(g).setCoin(10);
D(g).buy('tone');
chk(st(g).coin === 10 && /金不够买线索/.test(D(g).head()), '金不够时买不了线索');
// 五个按钮点一遍，逐个验证轴名与真值（防止 HTML 与代码轴名不一致）
g = boot();
play(g);
rig(g, '想');
D(g).setCoin(2000);
const gotAxis = [];
g.byId('buy').querySelectorAll('button').forEach((b) => {
  const ax = b.dataset.axis;
  b.click();
  if (st(g).known.split(',').indexOf(ax) >= 0 && D(g).by('想')[ax] && D(g).candidates().every((c) => D(g).by(c)[ax] === D(g).by('想')[ax])) gotAxis.push(ax);
});
chk(gotAxis.join(',') === AX.join(','), '五个购买按钮逐个点：声母/韵母/声调/部首/结构都能买到真值（' + gotAxis.join(' ') + '）');
chk(st(g).cand === 1, '五条都买到 → 候选唯一');
g = boot();
play(g);
rig(g, '想');
D(g).setCoin(1000);
g.key('1');
chk(st(g).known === 'init' && st(g).coin === 1000 - buyPrice, '按 1 买声母，与点按钮等价');
g.key('5');
chk(st(g).known.split(',').join(',') === 'init,str', '按 5 买结构');

/* ==================== 六、判负、连胜与存档 ==================== */
g = boot({ 'han.streak': '4' });
play(g);
rig(g, '雪');
D(g).setStreak(4);
const costN = D(g).diffs().normal.cost;
D(g).setCoin(costN);
D(g).guess('水');
chk(st(g).phase === 'over' && st(g).coin === 0, '最后一金猜错 → 千金花完判负');
chk(/答案是/.test(D(g).head()) || /雪/.test(D(g).ov()), '判负即揭示答案');
chk(/雪/.test(D(g).ov()) && /你猜了/.test(D(g).ov()), '结算页交代答案与过程');
chk(st(g).streak === 0, '连胜清零');
chk(Number(g.storage.getItem('han.streak')) === 4, 'han.streak 保留历史最长 4');
chk(g.storage.getItem('han.solved') === null || Number(g.storage.getItem('han.solved')) === 0, '输掉不增加 han.solved');
const ovHTML = D(g).ov();
D(g).guess('花');
chk(st(g).coin === 0 && D(g).ov() === ovHTML, '判负后猜字不再有任何效果');
g = boot({ 'han.best': '900', 'han.streak': '6', 'han.solved': '12', 'han.diff': 'easy' });
chk(st(g).diff === 'easy', '开局读回上次难度');
play(g);
rig(g, '明');
chk(st(g).cand === EASY.length && D(g).chipNames().length === EASY.length,
  '新手档字海只放 ' + EASY.length + ' 个常用字（候选集按答案池算，不是全库 305）');
chk(EASY.every((c) => D(g).chipNames().indexOf(c) >= 0), '答案池里的字颗颗可点');
D(g).setCoin(700);
D(g).guess('明');
chk(Number(g.storage.getItem('han.best')) === 900, '赢的时候只剩 620，不覆盖 900 的旧纪录');
chk(Number(g.storage.getItem('han.solved')) === 13, 'han.solved 累计 +1 → ' + g.storage.getItem('han.solved'));
chk(Number(g.storage.getItem('han.streak')) === 6, 'han.streak 取最大值：' + g.storage.getItem('han.streak'));
g = boot();
play(g);
const hardP = D(g).diffs().hard;
g.byId('diff').querySelectorAll('button')[2].click();
chk(st(g).diff === 'hard' && st(g).coin === hardP.budget && hardP.cost === 80 && hardP.buy === 130,
  '最难档只有 ' + hardP.budget + ' 金，猜 ' + hardP.cost + ' / 买 ' + hardP.buy);
chk(g.storage.getItem('han.diff') === 'hard', '换难度写回 han.diff');
const easyP = D(g).diffs().easy;
g.byId('diff').querySelectorAll('button')[0].click();
chk(st(g).coin === easyP.budget && easyP.cost === 80 && easyP.buy === 120, '新手档金更宽裕');
chk(/新字已就位/.test(D(g).head()) && st(g).tries === 0 && st(g).hist.length === 0, '换难度即换题并清空过程');

/* ==================== 七、输入框、字海与静音 ==================== */
g = boot();
play(g);
rig(g, '湖');
const typeEl = g.byId('type');
typeEl.value = '湖';
g.byId('btnGuess').click();
chk(st(g).phase === 'won' && st(g).tries === 1, '打字 → 点「猜」也能赢');
rig(g, '湖');
typeEl.value = '湖';
typeEl.dispatch('keydown', { key: 'Enter' });
chk(st(g).phase === 'won', '输入框回车直接猜');
chk(typeEl.value === '', '猜完清空输入框');
rig(g, '明');
typeEl.value = '木';
typeEl.dispatch('keydown', { key: 'n' });
chk(st(g).tries === 0 && st(g).answer === '明' && typeEl.value === '木', '在输入框里打字母 n 不会被当成"换一字"快捷键');
g.key('n');
chk(st(g).phase === 'play' && st(g).tries === 0 && st(g).coin === 1000, '焦点不在输入框时按 N 才换题');
rig(g, '湖');
const name0 = st(g).answer;
g.key('Escape');
chk(st(g).phase === 'over' && /放弃/.test(D(g).ov()), '按 Esc 放弃本字并揭示答案');
g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'next').dispatch('click');
chk(st(g).phase === 'play' && st(g).tries === 0 && st(g).coin === 1000 && st(g).answer !== name0, '「再来一字」换新题');
chk(/<i class="y">/.test(D(g).logHTML()) === false, '新题的记录区是空的');
const gm = boot({ 'han.muted': '1' });
play(gm);
rig(gm, '明');
const osc = gm.audio.created.osc;
D(gm).guess('水');
chk(gm.audio.created.osc === osc, '静音档下猜字不发声');
chk(gm.byId('btnSound').textContent === '🔇', '静音状态显示在按钮上');
gm.key('m');
D(gm).guess('林');
chk(gm.audio.created.osc > osc && gm.byId('btnSound').textContent === '🔊', '按 M 恢复发声并记住');
chk(gm.storage.getItem('han.muted') === '0', 'han.muted 写回');

summary('一字千金', fails);
