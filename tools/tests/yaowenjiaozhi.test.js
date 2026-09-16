'use strict';
/* 咬文嚼字：无标点原句 + 从标点版反推的断点集合 → 一句多种读法全找出来才算过
   重点验证三件事：① 语料自洽（剥掉标点必须等于原串，读法之间断点不得重复，绝不死题）
   ② 口粮经济（试读吃粮，空读与重复读不吃粮）③ 存档键 yao.dex 用 | 分隔能原样回读 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__y = {' +
  ' st: () => ({ phase: phase, level: level, score: score, bites: bites, combo: combo, hints: hints, diff: diff,' +
  '   runFound: runFound, gaps: gaps.slice(), found: found.slice(),' +
  '   item: item ? { id: item.id, s: item.s, lv: item.lv, t: item.t, r: item.r.map((r) => ({ x: r.x, q: r.q, sig: r.sig, cuts: r.cuts.slice() })) } : null }),' +
  ' POOL: () => POOL, ITEMS: () => ITEMS, READ_TOTAL: () => READ_TOTAL,' +
  ' PTS: () => PTS, DIFFS: () => DIFFS, KIND: () => KIND, cutsOf: cutsOf, tierFor: tierFor,' +
  ' dexReadings: dexReadings, saveDex: saveDex, cutList: cutList, unfoundIdx: unfoundIdx, num: num,' +
  ' submit: submit, hint: hint, clearGaps: clearGaps, newRun: newRun, toggleGap: toggleGap,' +
  ' showStats: showStats, msg: () => msgEl.innerHTML, marks: () => marksEl.innerHTML, ov: () => ovContent.innerHTML,' +
  ' lineTxt: () => lineEl.textContent, gapN: () => lineEl.querySelectorAll("button").length,' +
  ' gapTxt: (i) => (lineEl.children[i * 2 + 1] ? lineEl.children[i * 2 + 1].textContent : ""),' +
  ' ziCls: (i) => (lineEl.children[i * 2] ? lineEl.children[i * 2]._cls.join(" ") : ""),' +
  ' src: () => srcEl.textContent, sound: () => soundBtn.textContent,' +
  ' hud: () => ({ lv: elLv.textContent, prog: elProg.textContent, bites: elBites.textContent, score: elScore.textContent, hint: elHintN.textContent }),' +
  ' btns: () => ({ read: byId("btnRead").disabled, hint: byId("btnHint").disabled }),' +
  ' diffActive: () => byId("diff").querySelectorAll("button").filter((b) => b._cls.indexOf("active") >= 0).map((b) => b.dataset.diff).join(","),' +
  ' ovShown: () => overlayEl._cls.indexOf("show") >= 0,' +
  ' rig: (id) => { queue = [id]; beginItem(); },' +
  ' setCombo: (v) => { combo = v; }, setBites: (v) => { bites = v; hud(); }, setScore: (v) => { score = v; },' +
  ' setHints: (v) => { hints = v; hud(); }, setPhase: (v) => { phase = v; }, setLevel: (v) => { level = v; },' +
  ' setGaps: (a) => { for (var i = 0; i < gaps.length; i++) gaps[i] = a.indexOf(i + 1) >= 0 ? 1 : 0; render(); },' +
  ' dexKeys: () => Object.keys(dex),' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('咬文嚼字源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__y;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const HAN = /[㐀-䶿一-鿿]/;
const strip = (q) => q.split('').filter((c) => HAN.test(c)).join('');
const hanLen = (q) => strip(q).length;

function boot(storage) {
  const g = loadGame('yaowenjiaozhi', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  return g;
}
const start = (g) => {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
  if (btn) btn.dispatch('click');
  g.pump(0.2);
  return g;
};
// 钉死当前句，别让随机队列影响后面的数字
const rig = (g, id) => { D(g).rig(id); return g; };
const clickGap = (g, i) => g.byId('line').querySelectorAll('button')[i].dispatch('click');
// 语料里好用的几把标尺
const TWO = 2;    // 我要炒米饭：main[2] / alt[3]
const THREE = 9;  // 下雨天留客天留人不留：三种读法
const MIS = 3;    // 今齐地方千里：main[3] / mis[2]

/* ==================== 一、语料自洽 ==================== */
const Y0 = D(boot());
const POOL = Y0.POOL(), ITEMS = Y0.ITEMS();
const bad = [];
const seenS = {};
POOL.forEach((p, i) => {
  if (!p.s || !p.t || !p.r) bad.push('第 ' + i + ' 句结构不完整');
  const n = hanLen(p.s);
  if (n < 5 || n > 18) bad.push('句子长度可疑：' + p.s + '（' + n + ' 字）');
  if (seenS[p.s]) bad.push('原串重复：' + p.s);
  seenS[p.s] = 1;
  if (strip(p.s) !== p.s) bad.push('原串里混进了标点：' + p.s);
  if (p.r.length < 2) bad.push('读法不足两种：' + p.s);
  let mains = 0;
  p.r.forEach((r) => {
    if (['main', 'alt', 'mis'].indexOf(r.x) < 0) bad.push('读法类型非法：' + p.s + ':' + r.x);
    if (r.x === 'main') mains++;
    if (strip(r.q) !== p.s) bad.push('标点版剥掉标点后对不上原串：' + p.s + ' ≠ ' + r.q);
    if (!r.g) bad.push('读法缺解释：' + p.s + ':' + r.q);
    const cuts = Y0.cutsOf(r.q, p.s);
    if (!cuts) bad.push('断点反推失败：' + r.q);
    else if (!cuts.length) bad.push('这种读法一刀没落：' + r.q);
    else cuts.forEach((c) => { if (c < 1 || c >= p.s.length) bad.push('断点越界：' + r.q + ' → ' + c); });
  });
  if (mains !== 1) bad.push('第 ' + i + ' 句有 ' + mains + ' 个本意（应当恰好 1 个）：' + p.s);
});
chk(bad.length === 0, '语料 ' + POOL.length + ' 句全部自洽：原串无标点、剥标点对得上、断点不越界、每句恰好一个本意' +
  (bad.length ? ' —— 问题：' + bad.slice(0, 5).join(' | ') : ''));
chk(ITEMS.length === POOL.length, '没有一句因为数据错误被 build 悄悄丢掉（' + ITEMS.length + '/' + POOL.length + '）');
chk(ITEMS.every((it) => it.r.length >= 2), '每句至少两种读法，最少的一种是 ' + Math.min.apply(null, ITEMS.map((it) => it.r.length)) + ' 种');
chk(ITEMS.every((it) => new Set(it.r.map((r) => r.sig)).size === it.r.length), '同句之内几种读法的断点集合两两不同（不会有一种永远咬不出来）');
chk(ITEMS.every((it) => it.r.every((r) => r.cuts.length >= 1)), '每种读法都至少落一刀，空提交不算读法');
chk(Y0.READ_TOTAL() >= 28, '读法总数 ' + Y0.READ_TOTAL() + ' 种（' + ITEMS.length + ' 句）');
const lvN = (t) => ITEMS.filter((it) => it.lv === t).length;
chk(lvN(1) >= 5 && lvN(2) >= 5 && lvN(3) >= 3, '三档题量 lv1=' + lvN(1) + ' / lv2=' + lvN(2) + ' / lv3=' + lvN(3) + '，都不会出现空档');
chk(Y0.PTS().alt > Y0.PTS().main && Y0.PTS().mis < Y0.PTS().main, '别解比本意值钱、课文点名的误读最不值钱：' + JSON.stringify(Y0.PTS()));
chk(Y0.KIND().main === '本意' && Y0.KIND().alt === '别解' && Y0.KIND().mis === '误读', '三种读法都有中文名');
chk('解缙春联 断句笑话 请客帖子'.split(' ').every((t) => POOL.some((p) => p.t === t)) &&
  POOL.filter((p) => /^《/.test(p.t)).length >= 6, '语料出处覆盖对联、断句笑话与 ' + POOL.filter((p) => /^《/.test(p.t)).length + ' 篇课文');

/* ==================== 二、断点由标点反推 ==================== */
const cuts = (q) => Y0.cutsOf(q, strip(q));
chk(String(cuts('下雨天留客，天留，人不留。')) === '5,7', '「下雨天留客，天留，人不留。」→ [' + cuts('下雨天留客，天留，人不留。') + ']');
chk(String(cuts('下雨，天留客；天留，人不留。')) === '2,5,7', '分号一样算刀口');
chk(String(cuts('下雨天，留客天，留人不？留！')) === '3,6,9', '问号算刀口，句尾的叹号不算');
chk(String(cuts('明日逢春好，不晦气。')) === '5', '句尾句号不会产生一个多余的断点');
chk(String(cuts('枯藤、老树、昏鸦、小桥、流水、人家。')) === '2,4,6,8,10', '顿号也是刀口（六个名词各立一幅画）');
chk(String(Y0.cutsOf('床前明月光，疑是地上霜。', '床前明月光疑似地上霜')) === 'null', '标点版与原串差一个字直接判死，绝不让玩家撞上死题');
chk(Y0.cutsOf('。明日逢春好不晦气', '明日逢春好不晦气').length === 0, '开头的标点不会造出 0 号断点');
const q2s = (s) => ITEMS.filter((it) => it.s === s)[0];
chk(String(q2s('无鸡鸭亦可无鱼肉亦可青菜一碟足矣').r.map((r) => r.cuts.join(',')).join(' / ')) === '5,10 / 2,5,7,10,14',
  '请客帖子：主人念 [5,10]，客人念 [2,5,7,10,14]');
chk(String(q2s('今齐地方千里').r.map((r) => r.x + ':' + r.cuts.join(',')).join(' / ')) === 'main:3 / mis:2',
  '《邹忌》考点：正解「今齐地，方千里」，误读「今齐，地方千里」');

/* ==================== 三、开局界面 ==================== */
const gi = boot();
chk(st(gi).phase === 'intro', '开机先讲规则，不直接开局');
chk(D(gi).ovShown() && /开咬/.test(D(gi).ov()), '遮罩里有「开咬」按钮');
chk(D(gi).diffActive() === 'normal', '默认难度是自己咬');
const gs = start(boot());
chk(st(gs).phase === 'play' && st(gs).level === 1, '点「开咬」进局');
chk(!D(gs).ovShown(), '开局后遮罩收起');
const it0 = st(gs).item;
chk(D(gs).lineTxt() === it0.s, '屏幕上就是那串没有标点的字：' + it0.s);
chk(D(gs).gapN() === it0.s.length - 1, it0.s.length + ' 个字下面有 ' + D(gs).gapN() + ' 道字缝');
chk(st(gs).bites === it0.r.length + 3, '口粮 = 读法数 ' + it0.r.length + ' + 宽裕 3 = ' + st(gs).bites);
chk(st(gs).hints === 3 && D(gs).hud().hint === '3', '默认难度三次提示');
chk((D(gs).marks().match(/？/g) || []).length === it0.r.length, '进度条上是 ' + it0.r.length + ' 个问号，咬出来才揭面纱');
chk(/这一句共 <b>\d+<\/b> 种读法/.test(D(gs).msg()), '提示语先告诉你这句有几种读法');
chk(/·.*·/.test(D(gs).src()), '出处显示在句子上方：' + D(gs).src());
chk(D(gs).btns().read === false && D(gs).btns().hint === false, '「这样读」与「提示」都点得动');

/* ==================== 四、字缝三态 ==================== */
const g4 = rig(start(boot()), TWO);
const s4 = st(g4).item;
chk(s4.s === '我要炒米饭' && s4.r.length === 2 && st(g4).bites === 5, '钉住「我要炒米饭」：两种读法、五口粮');
chk(D(g4).gapTxt(0) === '' && D(g4).ziCls(0).indexOf('lit') < 0, '没下刀的缝是空的');
g4.key('1');
chk(st(g4).gaps[0] === 1 && D(g4).gapTxt(0) === '。', '数字键 1 在第一道缝下刀，显示句号');
chk(D(g4).ziCls(0).indexOf('lit') >= 0, '下过刀的字被点亮');
g4.key('1');
chk(st(g4).gaps[0] === 2 && D(g4).gapTxt(0) === '、', '再点换成顿号（同一道缝，另一种语气）');
g4.key('1');
chk(st(g4).gaps[0] === 0 && D(g4).gapTxt(0) === '', '第三点把刀收起来，三态循环回到空');
clickGap(g4, 1);
chk(st(g4).gaps[1] === 1, '鼠标点缝一样能下刀');
chk(String(D(g4).cutList()) === '2', 'cutList 报的是「第几个字后面」，从 1 开始数');
D(g4).setGaps([2]);
chk(String(D(g4).cutList()) === '2' && st(g4).gaps[1] === 1, '直接铺断点');
g4.key('3');
D(g4).clearGaps();
chk(st(g4).gaps.every((v) => v === 0), '一键擦净所有断点');

/* ==================== 五、试读经济 ==================== */
const g5 = rig(start(boot()), TWO);
D(g5).submit();
chk(st(g5).bites === 5 && /先下刀/.test(D(g5).msg()), '一刀没落就提交：不吃粮，只提醒');
D(g5).setGaps([2]);
D(g5).submit();
chk(st(g5).found[0] === 1 && st(g5).score === 60, '咬中本意「我要，炒米饭。」+60 分');
chk(st(g5).bites === 4 && st(g5).combo === 1, '这一次试读吃掉一口粮，连击起头');
chk(D(g5).hud().prog === '1/2' && /class="mk got flash">本意</.test(D(g5).marks()), '进度 1/2，问号变成高亮的「本意」');
chk(/我要，炒米饭。/.test(D(g5).msg()) && /饭馆点菜/.test(D(g5).msg()), '咬对了立刻给白话解释');
const bites5 = st(g5).bites;
D(g5).submit();
chk(st(g5).bites === bites5 && /早咬出来了/.test(D(g5).msg()), '重复提交同一种读法不吃粮');
D(g5).toggleGap(1);
chk(st(g5).gaps[1] === 2, '把句号缝改成顿号');
D(g5).submit();
chk(st(g5).bites === bites5 && /早咬出来了/.test(D(g5).msg()), '只看落刀位置不看符号：换种标点糊弄不了先生');
D(g5).setGaps([1]);
D(g5).submit();
chk(st(g5).bites === bites5 - 1 && st(g5).combo === 0, '读不通也吃粮，连击断掉');
chk(/差 <b>1<\/b> 刀没切，另有 <b>1<\/b> 刀落错了地方/.test(D(g5).msg()), '读不通给方向：' + plain(D(g5).msg()));
D(g5).setGaps([2, 3]);
D(g5).submit();
chk(/多切 <b>1<\/b> 刀/.test(D(g5).msg()), '一刀切到底反而碎：提示多切了几刀');
D(g5).setGaps([4]);
D(g5).submit();
chk(/差 <b>1<\/b> 刀没切，另有 <b>1<\/b> 刀落错了地方/.test(D(g5).msg()), '错位一刀同样有反馈');

/* ==================== 六、清句 / 换句 ==================== */
const g6 = rig(start(boot()), TWO);
D(g6).setGaps([2]); D(g6).submit();
D(g6).setGaps([3]); D(g6).submit();
const f6 = st(g6);
chk(f6.found.join(',') === '1,1', '本意 + 别解全部咬通');
chk(f6.score === 258, '分数可推算：60 + 80×1.25(连击) + 58(清句，剩 3 口粮兑 40+3×6) + 40(首通) = 258，实际 ' + f6.score);
chk(/全咬通了/.test(D(g6).msg()) && /首通 \+40/.test(D(g6).msg()) && /兑 <b>58<\/b>/.test(D(g6).msg()), '结算语说清奖励来源');
chk(g6.storage.getItem('yao.best') === '258' && g6.storage.getItem('yao.level') === '1', '最高分与进度当场落盘');
const bites6 = st(g6).bites;
D(g6).submit();
chk(st(g6).bites === bites6 && /这一句已经咬完/.test(D(g6).msg()), '清句瞬间提交被挡：不白吃粮也不双倍加分');
chk(st(g6).level === 1, '换句要等一下');
g6.pump(2);
const n6 = st(g6);
chk(n6.phase === 'play' && n6.level === 2, '稍等片刻自动读到第二句');
chk(n6.item.lv === 1, '第 2 句仍在第一档（lv<5 不升档）');
chk(n6.found.every((v) => v === 0) && n6.bites === n6.item.r.length + 3, '新句重新发粮：' + n6.bites + ' 口');
chk(n6.gaps.every((v) => v === 0) && D(g6).lineTxt() === n6.item.s, '断点擦干净，字换成新的');
chk(n6.score === 258, '换句不掉分');
D(g6).rig(TWO);
D(g6).setGaps([2]); D(g6).submit();
D(g6).setGaps([3]); D(g6).submit();
chk(!/首通/.test(D(g6).msg()), '同一句第二次通关不再发首通奖');
chk(D(g6).dexReadings() === 2 && D(g6).dexKeys().join('|') === '2:2|2:3|done2', '图鉴只记 2 种读法外加一个整句首通标记');
const g6b = rig(start(boot()), MIS);
D(g6b).setGaps([2]);
D(g6b).submit();
chk(/<b>今齐，地方千里。<\/b> 误读 \+30/.test(D(g6b).msg()), '「今齐，地方千里」被判为课文点名的误读');
chk(/class="mk got flash wrong">误读</.test(D(g6b).marks()), '误读虽然给分，图鉴上标成 wrong');
chk(st(g6b).score === 30 && st(g6b).phase === 'play', '误读只值 30 分，比本意还低');
chk(/<span class="mk">？<\/span>/.test(D(g6b).marks()), '本意还挂在问号上，误读不能顶本意的位');

/* ==================== 七、口粮尽判负 ==================== */
const g7 = rig(start(boot()), THREE);
chk(st(g7).item.r.length === 3 && st(g7).bites === 6, '「下雨天留客天留人不留」三种读法，六口粮');
D(g7).setBites(1);
D(g7).setGaps([1]);
D(g7).submit();
chk(st(g7).phase === 'over' && st(g7).bites === 0, '最后一口粮咬空 → 判负');
chk(D(g7).ovShown(), '判负弹出结算');
chk((D(g7).ov().match(/yw-ans/g) || []).length === 3, '结算里把三种读法全摊开');
chk(/下雨天留客，天留，人不留。/.test(D(g7).ov()), '未找到的读法带标点直接示范');
chk(/还剩 3 种读法/.test(D(g7).ov()), '写明还剩几种');
chk(D(g7).btns().read === true && D(g7).btns().hint === true, '判负后按钮全禁用');
const g7b = rig(start(boot()), THREE);
D(g7b).setBites(1);
D(g7b).setGaps([5, 7]);
D(g7b).submit();
chk(st(g7b).found[0] === 1 && st(g7b).score === 60, '最后一口粮正好咬中本意，分照样给');
chk(st(g7b).phase === 'over' && /还剩 2 种读法/.test(D(g7b).ov()), '咬中也要吃饭：粮尽当场判负，只摊没咬到的那两种');
chk(!/下雨天留客，天留，人不留。/.test(D(g7b).ov()), '已经咬出来的那种不再重复剧透');
const g7c = rig(start(boot()), THREE);
[[5, 7], [2, 5, 7], [3, 6, 9]].forEach((cs) => { D(g7c).clearGaps(); D(g7c).setGaps(cs); D(g7c).submit(); });
chk(st(g7c).phase === 'play' && st(g7c).bites === 3 && /全咬通了/.test(D(g7c).msg()), '正常口粮下三种读法各咬一口，还剩 3 口就够兑清句奖');
chk(st(g7c).score === 378, '三读齐全分数可推算：60 + 100 + 120 + 58 + 40 = 378，实际 ' + st(g7c).score);
g7c.pump(2);
chk(st(g7c).level === 2, '三读齐全自动进下一句');

/* ==================== 八、先生的提示 ==================== */
const g8 = rig(start(boot()), TWO);
D(g8).hint();
chk(st(g8).hints === 2 && String(D(g8).cutList()) === '2', '提示先补一刀：第 2 个字后面该断');
chk(/先生补一刀/.test(D(g8).msg()), '补刀有明说：' + plain(D(g8).msg()));
D(g8).hint();
chk(st(g8).hints === 1 && String(D(g8).cutList()) === '2,3', '再提示又补一刀，此时两种读法各差对方那一刀');
D(g8).hint();
chk(st(g8).hints === 0 && String(D(g8).cutList()) === '2', '多出来的刀会被先生擦掉');
chk(/先生擦一刀/.test(D(g8).msg()), '擦刀也讲清楚擦在哪：' + plain(D(g8).msg()));
const marks8 = D(g8).marks();
D(g8).hint();
chk(st(g8).hints === 0 && D(g8).marks() === marks8, '提示次数用完就只动嘴不动手');
chk(/用完了/.test(D(g8).msg()), '告知提示已用尽');
D(g8).setHints(1);
D(g8).setGaps([2, 3, 4]);
D(g8).hint();
chk(st(g8).hints === 0 && String(D(g8).cutList()) === '2,4' && /先生擦一刀/.test(D(g8).msg()),
  '该断的都在手上时，先擦掉谁都不需要的第四刀');
D(g8).setGaps([2]);
D(g8).submit();
chk(st(g8).found[0] === 1 && st(g8).hints === 0, '提示用完了照样自己咬');

/* ==================== 九、难度 ==================== */
const g9 = start(boot({ 'yao.diff': 'hard' }));
chk(st(g9).diff === 'hard' && D(g9).diffActive() === 'hard', '难度设置跨局记住');
D(g9).rig(TWO);
chk(st(g9).bites === 4 && st(g9).hints === 1, '刀刀见血：口粮 2+2、提示 1');
D(g9).setCombo(0);
D(g9).setGaps([2]);
D(g9).submit();
chk(st(g9).score === 84, '高倍率下本意 60×1.4 = 84');
D(g9).newRun('easy');
chk(st(g9).diff === 'easy' && g9.storage.getItem('yao.diff') === 'easy', '切难度当场写盘');
D(g9).rig(TWO);
chk(st(g9).bites === 7 && st(g9).hints === 5, '先生带读：口粮 5+2、提示 5');
D(g9).setCombo(0);
D(g9).setGaps([2]);
D(g9).submit();
chk(st(g9).score === 48, '带读打折 60×0.8 = 48');
chk(st(g9).phase === 'play' && st(g9).level === 1, '切难度等于重开一局');
const g9c = start(boot({ 'yao.diff': '地狱' }));
chk(st(g9c).diff === 'normal' && st(g9c).hints === 3, '存档里出现没见过的难度就退回默认，不会炸');
const g9d = boot();
g9d.byId('diff').querySelectorAll('button').find((b) => b.dataset.diff === 'hard').dispatch('click');
g9d.pump(0.2);
chk(st(g9d).phase === 'play' && st(g9d).diff === 'hard', '首页上直接点难度条就能开咬');

/* ==================== 十、图鉴存档序列化 ==================== */
const gA = boot({ 'yao.dex': '9:2,5,7|9:5,7|done9' });
chk(D(gA).dexKeys().join('|') === '9:2,5,7|9:5,7|done9', '断点串里本来就有逗号，靠 | 分隔才回读得回来');
chk(D(gA).dexReadings() === 2, '三种键里只有两个是读法，整句首通标记不计数');
D(gA).showStats();
chk(/历代累计咬出 <b>2<\/b> 种读法/.test(D(gA).ov()), '战绩页显示 2 种读法（曾经的 bug 是报成 3）');
chk(/语料共 15 句 \/ 31 种读法/.test(D(gA).ov()), '战绩页给出语料总量做分母');
chk(/最高分 <b>0<\/b>/.test(D(gA).ov()), '战绩页读数来自存档');
D(gA).submit();
const dump = gA.storage.getItem('yao.dex');
const gB = boot({ 'yao.dex': dump });
chk(D(gB).dexKeys().join('|') === '9:2,5,7|9:5,7|done9', 'saveDex 写出去的原样读得回来（不再被逗号撕碎）');
chk(D(gB).dexReadings() === 2, '反复读写不会把图鉴数越滚越大');
const gC = start(boot({ 'yao.dex': '9:2,5,7|9:5,7|done9' }));
D(gC).rig(THREE);
D(gC).setGaps([3, 6, 9]);
D(gC).submit();
chk(D(gC).dexReadings() === 3 && gC.storage.getItem('yao.found') === '3', '咬出新的第三种读法，累计从 2 变 3');
chk(yaoFoundMatches(gC), 'yao.found 与图鉴里的读法条数始终一致');
function yaoFoundMatches(g) {
  return String(g.storage.getItem('yao.found')) === String(D(g).dexReadings());
}

/* ==================== 十一、快捷键与声音 ==================== */
const gk = rig(start(boot()), TWO);
D(gk).setGaps([2, 3]);
D(gk).clearGaps();
chk(st(gk).gaps.every((v) => v === 0), 'C 键擦净断点');
D(gk).setGaps([2]);
D(gk).setCombo(0);
gk.key('Enter');
chk(st(gk).found[0] === 1, 'Enter = 这样读');
D(gk).setGaps([3]);
gk.key(' ');
chk(st(gk).found.join(',') === '1,1' && st(gk).phase === 'play', '空格也能提交');
gk.pump(2);
chk(st(gk).level === 2, '自动读下一句');
gk.key('t');
chk(/本机战绩/.test(D(gk).ov()) && D(gk).ovShown(), 'T 键看战绩');
gk.key('Escape');
chk(!D(gk).ovShown() && st(gk).phase === 'play', 'Esc 收掉遮罩，局面还在');
gk.key('t');
D(gk).newRun();
gk.key('n');
chk(st(gk).phase === 'play' && st(gk).level === 1 && st(gk).score === 0, 'N 重开一局');
chk(D(gk).sound() === '🔊', '默认是开声的');
gk.key('m');
chk(D(gk).sound() === '🔇' && gk.storage.getItem('yao.muted') === '1', 'M 静音并记住');
const gm = start(boot({ 'yao.muted': '1' }));
chk(gm.byId('btnSound').textContent === '🔇', '静音状态开机就显示');
const osc0 = gm.audio.created.osc;
D(gm).rig(TWO);
D(gm).setGaps([2]);
D(gm).submit();
chk(gm.audio.created.osc === osc0, '静音档下咬对也不发声');
gm.key('m');
D(gm).setGaps([4]);
D(gm).submit();
chk(gm.audio.created.osc > osc0, '取消静音后立刻又有味');
gm.byId('btnSound').dispatch('click');
gm.byId('btnNew').dispatch('click');
gm.pump(0.2);
chk(st(gm).phase === 'play' && st(gm).level === 1, '顶栏两个图标按钮都好用');
chk(st(gm).bites === st(gm).item.r.length + 3, '重开之后口粮按当前难度重发');

/* ==================== 十二、遮罩按钮 ==================== */
function g_act(g, name) {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === name);
  chk(!!btn, '遮罩里有按钮：' + name);
  if (btn) btn.dispatch('click');
  g.pump(0.2);
  return !!btn;
}
const go = rig(start(boot()), THREE);
D(go).setBites(1);
D(go).setGaps([1]);
D(go).submit();
chk(st(go).phase === 'over', '先造一个败局');
g_act(go, 'again');
chk(st(go).phase === 'play' && st(go).level === 1 && st(go).score === 0 && !D(go).ovShown(), '「再咬一遍」立刻重开');
chk(st(go).bites === st(go).item.r.length + 3, '重开后按新句重新发粮');
const go2 = rig(start(boot()), THREE);
D(go2).setBites(1);
D(go2).setGaps([1]);
D(go2).submit();
g_act(go2, 'stats');
chk(/本机战绩/.test(D(go2).ov()) && st(go2).phase === 'over', '败局里先翻战绩也不影响判负');
g_act(go2, 'again');
chk(st(go2).phase === 'play', '战绩页里的「重新开始」也接得上');
const go3 = rig(start(boot()), THREE);
D(go3).setBites(1);
D(go3).setGaps([1]);
D(go3).submit();
chk(!/data-act="close"/.test(D(go3).ov()), '判负页没有「继续」可点，只能重来或看战绩');
g_act(go3, 'stats');
g_act(go3, 'close');
chk(st(go3).phase === 'intro' && /没有标点/.test(plain(D(go3).ov())), '从战绩页点「继续」退回规则介绍');
g_act(go3, 'start');
chk(st(go3).phase === 'play' && st(go3).level === 1, '介绍页「开咬」再开一局');
const gi2 = boot();
D(gi2).showStats();
chk(/本机战绩/.test(D(gi2).ov()), '开机介绍页也能先翻战绩');
g_act(gi2, 'close');
chk(/没有标点/.test(plain(D(gi2).ov())) && D(gi2).ovShown(), '还没开局，「继续」回介绍页而不是硬开');
chk(/语料 15 句、31 种读法/.test(D(gi2).ov()), '介绍页写明语料规模与来源');
chk(/主人念是逐客/.test(D(gi2).ov()), '介绍页举一个「同一句两种立场」的例子');
const gi3 = boot();
gi3.byId('btnStats').dispatch('click');
gi3.pump(0.2);
chk(/本机战绩/.test(D(gi3).ov()), '局外点战绩按钮走同一套委托');

summary('咬文嚼字', fails);
