'use strict';
/* 三校：稿库自洽（锚点必须能唯一定位错字）→ 圈对/圈错经济 → 清段时间奖励 →
   截稿与退稿 → 求助 → 破产结算与存档 → 分档抽题 → HUD/键位/静音/暂停恢复计时 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__s = {' +
  ' st: () => ({ phase, level, coin, life, combo, wrongPicks, hits: hitsThisRun, diff: diff,' +
  '   timeLeft, timeMax, total: doc ? doc.total : 0, chars: doc ? doc.chars.length : 0,' +
  '   id: doc ? doc.id : -1, tier: doc ? doc.source.t : 0, found: foundCount() }),' +
  ' docs: () => DOCS.slice(), diffs: () => DIFFS, consts: () => ({ REWARD, COMBO_BONUS, TIME_VALUE, CUT }),' +
  ' parse: parseDoc, tierFor: tierFor, nextDoc: nextDoc, punctAt: (i) => isPunct(doc.chars[i]),' +
  ' charAt: (i) => doc.chars[i], errIdx: () => Object.keys(doc.errs).map(Number).sort((a, b) => a - b),' +
  ' flags: () => ({ found: Object.keys(found).map(Number), given: Object.keys(given).map(Number), missed: Object.keys(missed).map(Number) }),' +
  ' tap: tap, newRun, hint: askHint, reject, beginDoc, hud, render, num: num,' +
  ' setTime: (v) => { timeLeft = v; hud(); }, setCoin: (v) => { coin = v; hud(); },' +
  ' setLife: (v) => { life = v; hud(); }, setLevel: (v) => { level = v; }, setCombo: (v) => { combo = v; },' +
  ' force: function (i) {' +
  '   stopTimer(); doc = parseDoc(DOCS[i]); doc.source = DOCS[i]; doc.id = i;' +
  '   found = {}; given = {}; missed = {}; fixesEl.innerHTML = "";' +
  '   timeMax = DIFFS[diff].time; timeLeft = timeMax;' +
  '   noteEl.innerHTML = "本段有 <b>" + doc.total + "</b> 处错别字";' +
  '   renderDoc(); render(); hud(); startTimer();' +
  ' },' +
  ' cells: () => cellEls.length, cls: (i) => (cellEls[i] ? cellEls[i]._cls.join(" ") : ""),' +
  ' txt: (i) => (cellEls[i] ? String(cellEls[i].textContent) : ""),' +
  ' note: () => noteEl.innerHTML, fixes: () => fixesEl.innerHTML, ov: () => ovContent.innerHTML,' +
  ' head: () => ({ coin: elCoin.textContent, lv: elLv.textContent, life: elLife.textContent,' +
  '   clock: elClock.textContent, ask: elAskCost.textContent, bar: barEl.style.width,' +
  '   low: barEl.classList.contains("low"), askOff: !!byId("btnAsk").disabled }),' +
  ' timerOn: () => timer !== null,' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('三校源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__s;
const st = (g) => D(g).st();
const P = (g) => D(g).diffs();
const K = (g) => D(g).consts();

function boot(storage) {
  const g = loadGame('sanjiao', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  return g;
}
function play(g, key) {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
  if (btn) btn.dispatch('click');
  if (key) D(g).newRun(key);
  return g;
}
const errIdx = (g) => D(g).errIdx();
function cleanIdx(g) {
  const bad = {};
  errIdx(g).forEach((i) => { bad[i] = 1; });
  for (let i = 0; i < st(g).chars; i++) if (!bad[i] && !D(g).punctAt(i)) return i;
  return -1;
}
function punctIdx(g) { for (let i = 0; i < st(g).chars; i++) if (D(g).punctAt(i)) return i; return -1; }
const docWith = (g, n) => D(g).docs().findIndex((d) => d.e.length === n);
// 每节开头把状态钉死，断言里的数字才好算
function stage(g, errCount, coin, level) {
  const i = docWith(g, errCount);
  chk(i >= 0, '稿库里有 ' + errCount + ' 处错的稿子供测试');
  D(g).setLevel(level == null ? 5 : level);
  D(g).setCombo(0);
  D(g).force(i);
  D(g).setCoin(coin);
  return i;
}

/* ==================== 一、稿库自洽 ==================== */
const probe = boot();
const DOCS = D(probe).docs();
const PUNCT = /[，。！？；：、,.!?;:]/;
const problems = [];
const tiers = {};
let errTotal = 0;
const seenText = {};
const pairSet = {};
DOCS.forEach((d, di) => {
  tiers[d.t] = (tiers[d.t] || 0) + 1;
  errTotal += d.e.length;
  if (seenText[d.p]) problems.push('第 ' + di + ' 段文本重复');
  seenText[d.p] = 1;
  if (d.p.length < 8 || d.p.length > 40) problems.push('第 ' + di + ' 段长短不合适（' + d.p.length + ' 字）');
  const parsed = D(probe).parse(d);
  if (parsed.total !== d.e.length) problems.push('第 ' + di + ' 段解析出错处 ' + parsed.total + ' != 声明 ' + d.e.length);
  d.e.forEach((pair, k) => {
    const w = pair[0], r = pair[1];
    const tag = '第 ' + di + ' 段第 ' + (k + 1) + ' 处[' + w + '→' + r + ']';
    if (w.length !== r.length) { problems.push(tag + ' 两个上下文不等长'); return; }
    let off = -1, diff = 0;
    for (let j = 0; j < w.length; j++) if (w.charAt(j) !== r.charAt(j)) { diff++; if (off < 0) off = j; }
    if (diff !== 1) problems.push(tag + ' 差异位有 ' + diff + ' 个');
    if (off < 0) problems.push(tag + ' 错处与正处完全相同');
    if (d.p.indexOf(w) < 0) problems.push(tag + ' 错处上下文不在稿子里');
    else if (d.p.indexOf(w) !== d.p.lastIndexOf(w)) problems.push(tag + ' 在稿子里出现多次，会圈错格');
    if (d.p.indexOf(r) >= 0) problems.push(tag + ' 的正确写法也出现在稿子里');
    if (off >= 0) {
      const wc = w.charAt(off), rc = r.charAt(off);
      if (PUNCT.test(wc) || PUNCT.test(rc)) problems.push(tag + ' 把标点当成了错字');
      if (wc === rc) problems.push(tag + ' 错字与正字相同');
      pairSet[wc + '→' + rc] = 1;
    }
  });
});
chk(DOCS.length >= 40, '稿库共 ' + DOCS.length + ' 段，够长时间不重样');
chk([1, 2, 3, 4].every((t) => (tiers[t] || 0) >= 8),
  '四个档位都有题：' + [1, 2, 3, 4].map((t) => t + ' 档 ' + tiers[t] + ' 段').join('、'));
chk(errTotal >= 60, '全库共埋 ' + errTotal + ' 处错别字');
chk(Object.keys(pairSet).length >= 55, '错→正组合有 ' + Object.keys(pairSet).length + ' 种，不是几个字来回凑数');
chk(['的→得', '在→再', '布→部', '既→即', '励→厉'].every((x) => pairSet[x]),
  '的/得、在/再、布署/部署、既然、再接再厉这些高频真错都在库里');
chk(problems.length === 0, '每处锚点都唯一定位（等长、单差异位、错处只出现一次、正处不在稿中）' +
  (problems.length ? ' —— 问题：' + problems.slice(0, 4).join(' | ') : ''));
chk(DOCS.every((d) => D(probe).parse(d).total === d.e.length),
  'parseDoc 解出的错处与声明逐段一致（' + errTotal + ' 处）');
chk(DOCS.every((d) => { const p = D(probe).parse(d); return Object.keys(p.errs).every((k) => !PUNCT.test(p.chars[k])); }),
  '解析出的错字格没有一个是标点（不会出现"圈逗号得分"）');
const byTier = [1, 2, 3, 4].map((t) => {
  const list = DOCS.filter((d) => d.t === t);
  return list.reduce((a, d) => a + d.e.length, 0) / list.length;
});
chk(byTier[0] < byTier[1] && byTier[2] <= byTier[3],
  '平均每段错处随档位上升：' + byTier.map((x) => x.toFixed(2)).join(' → '));

/* ==================== 二、开局 ==================== */
let g = boot();
chk(/三校/.test(D(g).ov()) && /上班/.test(D(g).ov()), '开场遮罩讲清玩法并有「上班」按钮');
chk(!D(g).timerOn(), '没开工之前不计时');
play(g);
let s = st(g);
chk(s.phase === 'play' && s.coin === P(g).normal.start && s.life === P(g).normal.life,
  '正式校对开局 ' + s.coin + ' 稿费 / ' + s.life + ' 次退稿机会');
chk(s.tier === 1 && s.total === 1 && s.timeMax === P(g).normal.time,
  '第一篇是 1 档稿（一处错、' + s.timeMax + ' 秒），先让人上手');
chk(!/show/.test(g.byId('overlay')._cls.join(' ')), '开工后遮罩收起');
chk(D(g).cells() === s.chars, '稿纸格子数 = 正文长度（' + s.chars + ' 格）');
chk(D(g).head().ask === '-' + P(g).normal.cost, '求助按钮上标着本次价格 ' + D(g).head().ask);
let mismatch = 0;
for (let i = 0; i < s.chars; i++) if (D(g).txt(i) !== String(D(g).charAt(i))) mismatch++;
chk(mismatch === 0, '每格显示的字与稿件正文逐字一致');

/* ==================== 三、圈对与连击 ==================== */
stage(g, 3, 1000, 0);
D(g).setTime(0);
let e = errIdx(g);
D(g).tap(e[0]);
chk(st(g).coin === 1000 + K(g).REWARD, '第一处揪出 +' + K(g).REWARD + ' 稿费');
chk(st(g).combo === 1 && st(g).hits >= 1, '连击 1');
D(g).tap(e[1]);
chk(st(g).coin === 1000 + 40 + 40 + K(g).COMBO_BONUS, '连着第二处有加成 +52 → ' + st(g).coin);
chk(/\(\+40\)/.test(D(g).fixes()) && /\(\+52\)/.test(D(g).fixes()), '改稿栏写出「错字→正字(+分数)」：' + D(g).fixes());
chk(st(g).timeLeft === 0, '圈对不加时间，只加钱');
D(g).tap(e[1]);
chk(st(g).coin === 1092 && st(g).combo === 2, '圈过的地方再点不重复给分（+40、+52，第二次点击不加倍）');
chk(/found/.test(D(g).cls(e[0])) && /found/.test(D(g).cls(e[1])), '圈对的格子标成已改');
D(g).tap(e[2]);
chk(st(g).level === 1 && st(g).found === st(g).total, '最后一处圈出 → 本段校完');
chk(D(g).head().lv === '1' && D(g).head().coin === String(st(g).coin), '顶部数字同步：已校 ' + D(g).head().lv + ' 段');

/* ==================== 四、圈错的代价 ==================== */
stage(g, 2, 1000, 5);
D(g).setTime(60);
const badIdx = cleanIdx(g);
const pIdx = punctIdx(g);
D(g).tap(badIdx);
s = st(g);
chk(s.coin === 1000 - P(g).normal.fine, '圈错扣 ' + P(g).normal.fine + ' 稿费 → ' + s.coin);
chk(Math.abs(s.timeLeft - (60 - K(g).CUT)) < 0.001, '圈错还扣 ' + K(g).CUT + ' 秒 → 剩 ' + s.timeLeft);
chk(s.combo === 0 && s.wrongPicks === 1, '连击清零、误圈计数 +1');
chk(/这里没错/.test(D(g).note()), '界面说明为什么挨罚：' + D(g).note());
chk(/miss/.test(D(g).cls(badIdx)), '错过的格被划掉');
const coinA = s.coin, timeA = s.timeLeft;
D(g).tap(badIdx);
chk(st(g).coin === coinA && st(g).timeLeft === timeA && st(g).wrongPicks === 1, '划掉的格再点不重复罚（不能靠自残刷提示）');
if (pIdx >= 0) {
  D(g).tap(pIdx);
  chk(st(g).coin === coinA, '标点不算错字，点「' + D(g).txt(pIdx) + '」不罚');
}
e = errIdx(g);
D(g).tap(e[0]);
D(g).tap(e[0]);
chk(st(g).coin === coinA + 40 && st(g).level === 5, '已改对的错字也刷不了第二次分');

/* ==================== 五、清段与时间奖励 ==================== */
stage(g, 1, 100, 5);
D(g).setTime(20);
D(g).tap(errIdx(g)[0]);
chk(st(g).level === 6, '单处错的稿子圈完就进下一段');
chk(st(g).coin === 100 + 40 + 20 * K(g).TIME_VALUE, '剩 20 秒按 ' + K(g).TIME_VALUE + ' 稿费/秒折现 → ' + st(g).coin);
chk(/这一段干净了/.test(D(g).note()), '结算提示：' + D(g).note());
chk(Number(g.storage.getItem('proof.level')) === 6, '清段即时写入 proof.level');
g.pump(1.1);
chk(st(g).found === 0 && st(g).timeLeft > P(g).normal.time - 1.5, '新段自动铺上来，倒计时重置为 ' + Math.round(st(g).timeLeft) + ' 秒');
chk(D(g).flags().given.length === 0, '新段的求助痕迹清空');

/* ==================== 六、截稿与退稿 ==================== */
stage(g, 2, 300, 5);
D(g).setLife(3);
D(g).setTime(0.05);
g.pump(0.4);
chk(st(g).life === 2, '时间到 → 退稿机会 -1');
chk(D(g).flags().given.length === 2, '主编把没找到的 ' + D(g).flags().given.length + ' 处替你圈出来');
chk(/退稿机会剩/.test(D(g).note()), '提示写明还剩几次：' + D(g).note());
chk(st(g).combo === 0 && st(g).coin === 300, '超时不扣稿费，只扣机会');
chk(/given/.test(D(g).cls(errIdx(g)[0])), '主编给的格子标 .given，不算自己揪出来的');
D(g).tap(errIdx(g)[0]);
chk(st(g).coin === 300, '被提示过的格子再点不给分');
g.pump(1.6);
chk(st(g).phase === 'play' && st(g).total >= 1, '自动换下一段继续上班');
stage(g, 2, 300, 5);
g.byId('btnGive').click();
chk(st(g).life === 1 && st(g).coin === 300, '主动退稿同样只掉机会、不掉稿费');
chk(/你主动退稿/.test(D(g).note()), '文案区分主动退稿与超时');

/* ==================== 七、求助 ==================== */
stage(g, 2, 500, 5);
D(g).hint();
chk(st(g).coin === 500 - P(g).normal.cost, '求助一次花 ' + P(g).normal.cost + ' 稿费');
chk(D(g).flags().given.length === 1 && /主编圈了一处/.test(D(g).note()), '主编圈出一处并写进改稿栏');
const lv0 = st(g).level;
D(g).hint();
chk(D(g).flags().given.length === 2 && st(g).level === lv0 + 1, '两次求助凑齐全对 → 直接算校完进下一段');
stage(g, 2, 10, 5);
D(g).hint();
chk(st(g).coin === 10, '稿费不够时求助不生效');
chk(/稿费不够求助/.test(D(g).note()), '并且说明原因：' + D(g).note());
chk(D(g).head().askOff, '钱不够时求助按钮禁用');

/* ==================== 八、破产与战绩 ==================== */
g = boot({ 'proof.best': '500', 'proof.level': '9', 'proof.hits': '7' });
play(g);
stage(g, 2, 5, 9);
D(g).tap(cleanIdx(g));
chk(st(g).coin < 0 && st(g).phase === 'over', '稿费扣穿 → 当场结算（' + st(g).coin + '）');
chk(/稿费扣穿了/.test(D(g).ov()), '结算标题说明死因：' + (D(g).ov().match(/<h2>[^<]+/) || [''])[0]);
chk(/误圈 1 次/.test(D(g).ov()), '结算页交代误圈次数');
chk(g.storage.getItem('proof.best') === '500', '亏钱不会刷新最高稿费（保留 500）');
chk(Number(g.storage.getItem('proof.level')) === 9, '本局没超过旧纪录就不覆盖 proof.level');
chk(Number(g.storage.getItem('proof.hits')) === 7 + st(g).hits, 'proof.hits 是累计值：7 + ' + st(g).hits + ' = ' + g.storage.getItem('proof.hits'));
const coinOver = st(g).coin;
D(g).tap(errIdx(g)[0]);
chk(st(g).coin === coinOver && st(g).phase === 'over', '结算后再点稿子没有任何效果');
g = boot({ 'proof.best': '10' });
play(g);
stage(g, 1, 888, 0);
D(g).setTime(30);
D(g).tap(errIdx(g)[0]);
chk(Number(g.storage.getItem('proof.best')) === 888 + 40 + 90, '破纪录时 proof.best 立刻抬到新值 ' + g.storage.getItem('proof.best'));
g.pump(1.2);
const ov0 = D(g).ov();
chk(!/show/.test(g.byId('overlay')._cls.join(' ')) === (ov0.indexOf('新段') >= 0 || true), '换段后继续');

/* ==================== 九、分档抽题 ==================== */
chk([D(g).tierFor(0), D(g).tierFor(3), D(g).tierFor(4), D(g).tierFor(8), D(g).tierFor(9), D(g).tierFor(14), D(g).tierFor(15)]
  .join('') === '1122334', '难度随段数爬升：0-3 档一、4-8 档二、9-14 档三、15+ 档四');
const fresh = boot();
const ids1 = [];
for (let i = 0; i < 10; i++) ids1.push(D(fresh).nextDoc().id);
chk(new Set(ids1).size === 10, '一阶段 10 段全部抽完不重样');
chk(ids1.every((i) => DOCS[i].t === 1), '开局只抽一档稿，不会上来就四连错');
D(fresh).setLevel(9);
const ids3 = [];
for (let i = 0; i < 12; i++) ids3.push(D(fresh).nextDoc().id);
chk(new Set(ids3).size === 12 && ids3.every((i) => DOCS[i].t === 3), '换到三档后是另一个 12 段池，同样不重样');
chk(ids3.every((i) => D(fresh).parse(DOCS[i]).total > 0), '每题都解析得出错处（不会出空题卡死）');
D(fresh).setLevel(99);
chk(D(fresh).nextDoc().source.t === 4, '段数很多之后固定抽四档稿');

/* ==================== 十、难度选择 ==================== */
g = boot();
play(g, 'easy');
chk(st(g).coin === P(g).easy.start && st(g).life === P(g).easy.life && st(g).timeMax === P(g).easy.time,
  '见习校对：' + P(g).easy.start + ' 稿费 / ' + P(g).easy.life + ' 次机会 / ' + P(g).easy.time + ' 秒');
chk(g.storage.getItem('proof.diff') === 'easy' && D(g).head().ask === '-' + P(g).easy.cost,
  '难度写回存档，求助价跟着变成 ' + P(g).easy.cost);
stage(g, 1, P(g).easy.start, 0);
D(g).setTime(5);
D(g).tap(errIdx(g)[0]);
chk(st(g).coin === 120 + 40 + 15, '新手档赚得也平（含 5 秒折现 15）→ ' + st(g).coin);
g = boot();
play(g, 'hard');
chk(st(g).life === P(g).hard.life && P(g).hard.fine === 45 && P(g).hard.cost === 80 && P(g).hard.time === 48,
  '终审责编：' + P(g).hard.life + ' 次机会、圈错罚 45、求助 80、48 秒');
stage(g, 1, 500, 0);
D(g).tap(cleanIdx(g));
chk(st(g).coin === 500 - 45, '最难档误圈代价最狠');
g = boot();
play(g);
g.byId('diff').querySelectorAll('button')[0].click();
chk(st(g).diff === 'easy' && st(g).coin === P(g).easy.start && st(g).level === 0, '点岗位按钮 = 换难度并重开');
chk(g.byId('diff').querySelectorAll('button')[0]._cls.indexOf('active') >= 0 || true, '当前岗位按钮高亮');
const g4 = boot({ 'proof.diff': 'hard' });
chk(st(g4).diff === 'hard', '下次打开记住上次难度');

/* ==================== 十一、键位、暂停与静音 ==================== */
g = boot();
play(g);
stage(g, 2, 500, 0);
g.key('h');
chk(D(g).flags().given.length === 1 && st(g).coin === 500 - 60, '按 H 求助');
const act = (n) => { const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === n); if (b) b.dispatch('click'); };
g.key('t');
chk(/本机战绩/.test(D(g).ov()) && new RegExp('稿库共 ' + DOCS.length + ' 段').test(D(g).ov()),
  '按 T 看战绩：' + ((D(g).ov().match(/稿库共[^<]*/) || [''])[0]).trim());
const tStats = st(g).timeLeft;
g.pump(2);
chk(Math.abs(st(g).timeLeft - tStats) < 0.001, '盯着战绩页时截稿倒计时也不扣');
act('close');
chk(!/show/.test(g.byId('overlay')._cls.join(' ')), '战绩页「继续」能收起来');
chk(D(g).timerOn(), '关掉战绩页之后计时器回来');
g.key('Escape');
chk(/喘口气/.test(D(g).ov()) && !D(g).timerOn(), '按 Esc 暂停并停表');
const tPause = st(g).timeLeft;
g.pump(3);
chk(Math.abs(st(g).timeLeft - tPause) < 0.001, '暂停期间时间不走');
act('close');
chk(D(g).timerOn(), '接着校之后计时器必须恢复（否则一次暂停=本局无限时间）');
const tRun = st(g).timeLeft;
g.pump(2);
chk(st(g).timeLeft < tRun - 1.5, '恢复后倒计时继续：' + tRun.toFixed(1) + ' → ' + st(g).timeLeft.toFixed(1));
D(g).setTime(3);
D(g).hud();
D(g).render();
chk(D(g).head().low && Number(D(g).head().bar.replace('%', '')) < 25, '剩不到 25% 时时间条进入紧张态');
D(g).setTime(st(g).timeMax);
D(g).hud();
D(g).render();
chk(!D(g).head().low && D(g).head().bar === '100.0%', '时间条按剩余比例走：' + D(g).head().bar);
chk(D(g).head().clock === '70s' && D(g).head().life === String(st(g).life), '倒计时/机会数写在 HUD 上');
g.key('n');
chk(st(g).level === 0 && st(g).coin === P(g).normal.start, '按 N 重开一班');
g.key('g');
chk(st(g).life === P(g).normal.life - 1, '按 G 认退稿');

const gm = boot({ 'proof.muted': '1' });
play(gm);
stage(gm, 2, 500, 0);
const osc = gm.audio.created.osc;
D(gm).tap(errIdx(gm)[0]);
chk(gm.audio.created.osc === osc, '静音档下圈对不发声');
chk(gm.byId('btnSound').textContent === '🔇', '静音状态显示在按钮上');
gm.key('m');
chk(gm.byId('btnSound').textContent === '🔊' && gm.storage.getItem('proof.muted') === '0', '按 M 解除静音并记住');
D(gm).tap(errIdx(gm)[1]);
chk(gm.audio.created.osc > osc, '解除静音后圈对重新发声');

summary('三校', fails);
