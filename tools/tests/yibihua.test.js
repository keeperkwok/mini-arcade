'use strict';
/* 一笔画：生成器必须每关都可一笔画完（欧拉定理）→ 描线判定 → 死笔洗墨 → 墨尽判负
   重点核对三件事：① 随机生成的图奇数度点恰好 0 或 2 个，且生成时那条游走真是解
   ② 桥不能乱过（过桥判死的时机）③ 存档键 yi.* 与首页卡片对得上 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__b = {' +
  ' st: () => ({ phase: phase, level: level, score: score, ink: ink, hints: hints, diff: diff, runLines: runLines,' +
  '   N: N, edges: edges.length, remain: remain(), pen: pen, startNodes: startNodes.slice(), trail: trail.slice(),' +
  '   solution: solution.map((e) => [e[0], e[1]]), deg: Object.assign({}, deg), locked: locked, fatal: fatalEdge,' +
  '   hintMark: hintMark ? { node: hintMark.node, edge: hintMark.edge } : null }),' +
  ' reqList: () => { var o = [], k; for (k in req) o.push({ k: k, a: req[k][0], b: req[k][1], drawn: !!drawn[k] }); return o; },' +
  ' adjN: () => Object.keys(adj).length, tap: tap, hint: hint, wash: wash, newRun: newRun, beginLevel: beginLevel,' +
  ' canFinish: canFinish, liveNow: liveNow, ek: ek, gen: gen, buildAdj: buildAdj, boardFor: boardFor, targetFor: targetFor,' +
  ' gen2: (n, t) => { N = n; adj = buildAdj(n); gen(n, t); pickStarts(); },' +
  ' DIFFS: () => DIFFS, px: px, nodeAt: nodeAt, gap: gap, msg: () => msgEl.innerHTML, ov: () => ovContent.innerHTML,' +
  ' hud: () => ({ lv: elLv.textContent, lines: elLines.textContent, ink: elInk.textContent, score: elScore.textContent, hint: elHintN.textContent }),' +
  ' btns: () => ({ hint: byId("btnHint").disabled, wash: byId("btnWash").disabled }),' +
  ' ovShown: () => overlayEl._cls.indexOf("show") >= 0, draws: () => (ctx ? ctx.__rec.calls : 0),' +
  ' diffActive: () => byId("diff").querySelectorAll("button").filter((b) => b._cls.indexOf("active") >= 0).map((b) => b.dataset.diff).join(","),' +
  ' showStats: showStats, showIntro: showIntro, gameOver: gameOver,' +
  // 手工造一个关卡，让死笔、提示这些分支都能被钉住来验证
  ' setPuzzle: (list) => { N = 3; adj = buildAdj(3); req = {}; deg = {}; edges = []; solution = [];' +
  '   for (var i = 0; i < list.length; i++) { var a = list[i][0], b = list[i][1], k = ek(a, b);' +
  '     if (req[k]) continue; req[k] = [a, b]; edges.push(req[k]); solution.push([a, b]);' +
  '     deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }' +
  '   drawn = {}; trail = []; pen = -1; fatalEdge = null; hintMark = null; locked = false; pickStarts(); hud(); },' +
  ' setInk: (v) => { ink = v; hud(); }, setHints: (v) => { hints = v; hud(); }, setScore: (v) => { score = v; },' +
  ' setLevel: (v) => { level = v; },' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('一笔画源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__b;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const live = (list) => { const m = {}; list.forEach(([a, b]) => { m[a < b ? a + '-' + b : b + '-' + a] = [a, b]; }); return m; };

function boot(storage) {
  const g = loadGame('yibihua', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  return g;
}
const start = (g) => {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
  if (btn) btn.dispatch('click');
  g.pump(0.3);
  return g;
};
// 用定理自己走出一条解：每步都挑一条「走完后仍然描得完」的线（Fleury 式贪心）
function drawSolution(g) {
  const B = D(g);
  B.tap(st(g).startNodes[0]);
  for (let step = 0; step < 400 && st(g).remain > 0; step++) {
    const s = st(g);
    const cand = B.reqList().filter((e) => !e.drawn && (e.a === s.pen || e.b === s.pen));
    let moved = false;
    for (const e of cand) {
      const to = e.a === s.pen ? e.b : e.a;
      const tryLive = Object.assign({}, B.liveNow());
      delete tryLive[e.k];
      if (!B.canFinish(to, tryLive)) continue;
      B.tap(to);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return g;
}
// 三角形 + 一条尾巴：奇数度点是 2 和 3，先走尾巴就把自己堵死
const TRI_TAIL = [[0, 1], [1, 2], [2, 0], [2, 3]];

/* ==================== 一、生成器与图论不变式 ==================== */
const g0 = start(boot());
const B0 = D(g0);
const bad = [];
let minStarts = 99, maxEdgeShort = 0;
for (const [n, top] of [[3, 10], [4, 18], [5, 28]]) {
  for (let t = 5; t <= top; t++) {
    B0.newRun('normal');
    B0.gen2(n, t);
    const s = st(g0);
    if (s.edges < Math.min(t, maxEdgeShort || t)) maxEdgeShort = Math.max(maxEdgeShort, 0);
    if (s.edges !== t) bad.push(n + '×' + n + ' 目标 ' + t + ' 只生成 ' + s.edges);
    const odd = Object.keys(s.deg).filter((k) => s.deg[k] % 2).length;
    if (odd !== 0 && odd !== 2) bad.push('奇数度点 ' + odd + ' 个');
    if (s.startNodes.length < 1) bad.push('没有合法起点');
    minStarts = Math.min(minStarts, s.startNodes.length);
    // 生成时那条游走必须真是解：逐条边都在关卡里、首尾相接、不重复
    const seen = {};
    let prev = -1;
    s.solution.forEach(([a, b]) => {
      const k = a < b ? a + '-' + b : b + '-' + a;
      if (!B0.reqList().some((e) => e.k === k)) bad.push('解里出现关卡外的线 ' + k);
      if (seen[k]) bad.push('解里重复描 ' + k);
      seen[k] = 1;
      if (prev >= 0 && prev !== a) bad.push('解不连续 ' + prev + '→' + a);
      prev = b;
    });
    if (Object.keys(seen).length !== s.edges) bad.push('解没覆盖全部 ' + s.edges + ' 条线');
    if (B0.adjN() !== n * n) bad.push('邻接表节点数不对（' + B0.adjN() + '）');
  }
}
chk(bad.length === 0, '216 组随机生成全部可一笔画完：边数达标、奇数度点 0 或 2、那条游走确实是一条完整解' +
  (bad.length ? ' —— 问题 ' + bad.length + ' 处：' + bad.slice(0, 4).join(' | ') : ''));
chk(minStarts >= 1, '每关至少一个合法起点（最少时 ' + minStarts + ' 个：两个奇数度点）');
chk(B0.boardFor(1) === 3 && B0.boardFor(4) === 4 && B0.boardFor(9) === 5, '关卡尺寸三档：1-3 关 3×3、4-8 关 4×4、9 关起 5×5');
chk(B0.targetFor(1) === 5 && B0.targetFor(18) === 22 && B0.targetFor(40) === 28, '线段数随关卡线性涨：5 → 22，5×5 封顶 28');
/* 定理单测 */
chk(B0.canFinish(0, live([[0, 1], [1, 2]])) === true, '一条链从端点起步当然描得完');
chk(B0.canFinish(1, live([[0, 1], [1, 2]])) === false, '从中间那个点（度 2）起步，两头各剩半条 → 描不完');
chk(B0.canFinish(0, live([[0, 1], [1, 2], [2, 3], [3, 0]])) === true, '一个圈随便从哪儿起步都是回路');
chk(B0.canFinish(0, live([[1, 2], [3, 4]])) === false, '笔尖碰不到的孤立线段直接判死');
chk(B0.canFinish(0, live([])) === true, '没有线剩下就不叫死，叫画完了');
chk(B0.canFinish(0, live([[0, 1], [0, 2], [0, 3]])) === false, '三叉星有 4 个奇数度点，本来就不该出现这种关卡');

/* ==================== 二、开局界面 ==================== */
const gi = boot();
chk(st(gi).phase === 'intro', '开机先讲规则');
chk(D(gi).ovShown() && /欧拉/.test(D(gi).ov()), '介绍页把「奇数度才能起步」这条诀窍讲给玩家');
chk(/下笔/.test(D(gi).ov()), '介绍页有「下笔」按钮');
chk(D(gi).diffActive() === 'normal', '默认难度一笔到底');
chk(D(gi).draws() > 50, 'canvas 真的在画（启动后已描 ' + D(gi).draws() + ' 次）');
const gs = start(boot());
const s1 = st(gs);
chk(s1.phase === 'play' && s1.level === 1 && s1.score === 0, '点「下笔」开局');
chk(s1.ink === 4 && s1.hints === 3, '一笔到底：4 滴墨、3 次提示');
chk(s1.edges >= 5 && s1.remain === s1.edges, '第 1 关 ' + s1.edges + ' 条线，一条都没描');
chk(s1.pen === -1 && s1.startNodes.length >= 1, '笔还没下，合法起点 ' + s1.startNodes.length + ' 个');
chk(s1.trail.length === 0, '笔迹是空的');
chk(/第 1 关/.test(D(gs).msg()) && /一笔画完/.test(D(gs).msg()), '提示语报出本关线数');
chk(D(gs).hud().lines === '0/' + s1.edges, 'HUD 显示 0/N');

/* ==================== 三、下笔与描线 ==================== */
const g3 = start(boot());
D(g3).setPuzzle(TRI_TAIL);
chk(String(st(g3).startNodes) === '2,3', '三角形 + 尾巴：只有接尾巴的两个端点能起步（奇数度）');
D(g3).tap(0);
chk(st(g3).pen === -1 && /下不了笔/.test(D(g3).msg()), '从度为 2 的点下笔被挡下');
chk(/空心圈/.test(D(g3).msg()), '顺手告诉玩家合法起点画在哪儿');
D(g3).tap(1);
chk(st(g3).ink === 4 && st(g3).remain === 4, '被挡下的操作不费墨也不描线');
D(g3).tap(2);
chk(st(g3).pen === 2 && st(g3).trail.join(',') === '2', '在合法起点下笔，笔尖落在 2');
D(g3).tap(2);
chk(st(g3).pen === 2 && /停在这个点/.test(D(g3).msg()), '点自己等于没点');
D(g3).tap(4);
chk(st(g3).pen === 2 && /没有线/.test(D(g3).msg()), '两个点之间没有线 —— 白点');
D(g3).tap(0);
chk(st(g3).remain === 3 && st(g3).trail.join(',') === '2,0', '描掉一条线');
chk(/还剩 3 条/.test(D(g3).msg()), '每描一条就报进度');
D(g3).tap(2);
chk(st(g3).remain === 3 && /描过了/.test(D(g3).msg()), '回头描刚走过那条 —— 一笔不能重描');
chk(st(g3).ink === 4, '被挡下的三种操作都不费墨');

/* ==================== 四、死笔与洗墨 ==================== */
const g4 = start(boot());
D(g4).setPuzzle(TRI_TAIL);
D(g4).tap(2);
D(g4).tap(3);
const d4 = st(g4);
chk(d4.fatal === '2-3' && d4.locked === true, '先走过桥去尾巴那头 —— 当场判死');
chk(d4.ink === 3 && d4.pen === 3, '死笔费一滴墨，笔尖还留在原地给玩家看');
chk(/第 <b>1<\/b> 笔之后/.test(D(g4).msg()), '指明是第几笔走死的：' + plain(D(g4).msg()));
g4.pump(2);
const r4 = st(g4);
chk(r4.remain === 4 && r4.pen === -1 && r4.trail.length === 0 && r4.locked === false, '动画过后自动洗笔，本关线全清空');
chk(r4.ink === 3, '洗笔只在那一次死笔时扣墨，不重复扣');
chk(/重新下笔/.test(D(g4).msg()), '洗完后提示重新下笔');
D(g4).setInk(0);
D(g4).tap(2);
D(g4).tap(3);
chk(st(g4).phase === 'over', '墨瓶见底再走死 —— 判负');
chk(D(g4).ovShown() && /还剩 <b>3<\/b> 条线/.test(D(g4).ov()), '结算写明还剩几条没描');
chk(/奇数度/.test(D(g4).ov()), '结算页把诀窍再讲一遍');
chk(D(g4).btns().hint === true && D(g4).btns().wash === true, '判负后提示与洗笔都禁用');
const g4b = start(boot());
D(g4b).setPuzzle(TRI_TAIL);
D(g4b).tap(2);
D(g4b).tap(0);
D(g4b).wash();
chk(st(g4b).ink === 3 && st(g4b).pen === -1, '主动洗笔也算一滴墨');
D(g4b).wash();
chk(st(g4b).ink === 3 && /笔还没下/.test(D(g4b).msg()), '笔没下就不许洗');
D(g4b).setInk(0);
D(g4b).tap(2);
D(g4b).tap(0);
D(g4b).wash();
chk(st(g4b).ink === 0 && st(g4b).pen === 0, '墨空了洗不了笔，只能硬着头皮描完');
chk(/墨瓶空了/.test(D(g4b).msg()), '并且告诉你为什么');

/* ==================== 五、一笔到底与换关 ==================== */
const g5 = start(boot());
D(g5).setPuzzle(TRI_TAIL);
drawSolution(g5);
const c5 = st(g5);
chk(c5.remain === 0 && c5.locked === true, '四条线描完（生成时那条迹本身就是解）');
chk(c5.score === 118, '分数可推算：40 + 4×12 = 88，一滴墨没费再 +30 = 118，实际 ' + c5.score);
chk(c5.runLines === 4, '本局描线累计 4 条');
chk(g5.storage.getItem('yi.lines') === '4' && g5.storage.getItem('yi.best') === '118', '累计线与最高分当场落盘');
chk(g5.storage.getItem('yi.level') === '2', '纪录取下一关的关号（最远画到第 2 关）');
chk(/一滴墨没费/.test(D(g5).msg()), '完美结算语');
D(g5).tap(0);
chk(st(g5).remain === 0 && st(g5).score === 118, '结算瞬间再点也不会有任何副作用');
g5.pump(2);
const n5 = st(g5);
chk(n5.level === 2 && n5.phase === 'play', '自动进下一关');
chk(n5.ink === 4 && n5.remain === n5.edges && n5.edges !== 0, '新关重新发墨、重新铺线');
chk(n5.score === 118 && n5.runLines === 4, '换关不掉分');
const g5b = start(boot());
D(g5b).setPuzzle(TRI_TAIL);
D(g5b).tap(2); D(g5b).tap(3);           // 先死一次
g5b.pump(2);
D(g5b).setPuzzle(TRI_TAIL);
drawSolution(g5b);
chk(st(g5b).score === 88, '费过墨就没有完美奖：40 + 4×12 = 88');

/* ==================== 六、先生指一笔 ==================== */
const g6 = start(boot());
D(g6).setPuzzle(TRI_TAIL);
D(g6).hint();
const h6 = st(g6);
chk(h6.hints === 2 && h6.hintMark && h6.pen === -1, '笔还没下时，提示给的是下笔处');
chk(h6.startNodes.indexOf(h6.hintMark.node) >= 0, '先生指的起点确实合法：' + h6.hintMark.node);
chk(/先生替你下笔/.test(D(g6).msg()), '提示语说清指了什么');
D(g6).tap(h6.hintMark.node);
D(g6).hint();
const h6b = st(g6);
chk(h6b.hints === 1 && h6b.hintMark && h6b.hintMark.edge, '笔已下则指下一笔该走哪条线');
const edge = h6b.hintMark.edge;
const nb = h6b.pen === Number(edge.split('-')[0]) ? Number(edge.split('-')[1]) : Number(edge.split('-')[0]);
D(g6).tap(nb);
chk(st(g6).remain === 3 && st(g6).pen === nb, '照先生说的走必定不堵自己');
D(g6).setHints(0);
const markBefore = JSON.stringify(st(g6).hintMark);
D(g6).hint();
chk(st(g6).hints === 0 && JSON.stringify(st(g6).hintMark) === markBefore, '提示用完只动嘴不动手');
chk(/用完了/.test(D(g6).msg()), '并且告诉你用完了');

/* ==================== 七、难度与存档 ==================== */
const g7 = start(boot({ 'yibihua.diff': 'x' }));
chk(st(g7).diff === 'normal', '难度键写错也不炸');
const g7b = start(boot({ 'yi.diff': 'master' }));
chk(st(g7b).diff === 'master' && st(g7b).ink === 1 && st(g7b).hints === 1, '「不许洗笔」只有 1 滴墨 1 次提示');
D(g7b).setPuzzle(TRI_TAIL);
D(g7b).setLevel(1);
drawSolution(g7b);
chk(st(g7b).score === 189, '大师倍率：round((40+48)×1.6) + round(30×1.6) = 141 + 48 = 189，实际 ' + st(g7b).score);
const g7c = start(boot());
g7c.byId('diff').querySelectorAll('button').find((b) => b.dataset.diff === 'doodle').dispatch('click');
g7c.pump(0.3);
chk(st(g7c).diff === 'doodle' && g7c.storage.getItem('yi.diff') === 'doodle', '点难度条即重开并写盘');
chk(st(g7c).ink === 8 && st(g7c).hints === 6, '随便涂涂 8 滴墨 6 次提示');
D(g7c).setPuzzle(TRI_TAIL);
drawSolution(g7c);
chk(st(g7c).score === 94, '涂涂档打折：round(88×0.8) + round(30×0.8) = 70 + 24 = 94');

/* ==================== 八、指针输入 ==================== */
const g8 = start(boot());
D(g8).setPuzzle(TRI_TAIL);
const cvEl = g8.byId('cv');
const at = (i) => { const p = D(g8).px(i); return { clientX: p.x, clientY: p.y }; };
chk(D(g8).nodeAt(at(2).clientX, at(2).clientY) === 2, '像素坐标能反查最近的点');
const mid = { clientX: at(0).clientX + D(g8).gap() / 2, clientY: at(0).clientY + D(g8).gap() / 2 };
chk(D(g8).nodeAt(mid.clientX, mid.clientY) === -1, '落在两格正中就不算点任何点');
cvEl.dispatch('pointerdown', at(0));
chk(st(g8).pen === -1 && st(g8).locked === false, '非法起点按下也不会下笔');
cvEl.dispatch('pointerdown', at(2));
chk(st(g8).pen === 2, 'pointerdown 落在合法起点就下了笔');
cvEl.dispatch('pointerdown', mid);
chk(st(g8).remain === 4 && st(g8).ink === 4, '点到格子正中白点一次，不费墨');
cvEl.dispatch('pointermove', at(3));
chk(st(g8).remain === 3 && st(g8).ink === 3 && st(g8).locked === true, '拖过桥去尾巴那头 —— 当场判死，笔尖留在原地');
cvEl.dispatch('pointerup', {});
g8.pump(2);
chk(st(g8).remain === 4 && st(g8).pen === -1 && st(g8).locked === false, '抬手 + 动画结束后自动洗笔，线全部还原');
cvEl.dispatch('pointerdown', at(2));
cvEl.dispatch('pointermove', at(0));
chk(st(g8).remain === 3 && st(g8).trail.join(',') === '2,0', '按住拖过一条线就描上它');
cvEl.dispatch('pointercancel', {});
const r8 = st(g8).remain;
cvEl.dispatch('pointermove', at(1));
chk(st(g8).remain === r8, '抬手之后继续移动鼠标不该描线');
cvEl.dispatch('pointerdown', at(1));
chk(st(g8).remain === 2 && st(g8).trail.join(',') === '2,0,1', '抬手改成一下一点，同样能接着描');

/* ==================== 九、快捷键、遮罩与声音 ==================== */
const gk = start(boot());
D(gk).setPuzzle(TRI_TAIL);
gk.key('h');
chk(st(gk).hints === 2, 'H 键指一笔');
gk.key('r');
chk(/笔还没下/.test(D(gk).msg()) && st(gk).ink === 4, 'R 键洗笔（笔没下则无效）');
gk.key('t');
chk(/本机战绩/.test(D(gk).ov()) && D(gk).ovShown(), 'T 键看战绩');
gk.key('escape');
chk(!D(gk).ovShown() && st(gk).phase === 'play', 'Esc 收遮罩不回退局面');
gk.key('n');
chk(st(gk).phase === 'play' && st(gk).level === 1 && st(gk).remain === st(gk).edges, 'N 重开一局');
chk(/第 1 关/.test(D(gk).msg()), '重开后回到第一关的关卡提示');
gk.key('m');
chk(gk.byId('btnSound').textContent === '🔇' && gk.storage.getItem('yi.muted') === '1', 'M 静音并记住');
const osc0 = gk.audio.created.osc;
D(gk).tap(st(gk).startNodes[0]);
chk(gk.audio.created.osc === osc0, '静音档下笔不发声');
gk.key('m');
D(gk).wash();
chk(gk.byId('btnSound').textContent === '🔊', '再按 M 恢复发声');
const gm = start(boot({ 'yi.muted': '1' }));
chk(gm.byId('btnSound').textContent === '🔇', '开机就静音状态显示正确');
gm.byId('btnHint').dispatch('click');
gm.byId('btnWash').dispatch('click');
gm.byId('btnNew').dispatch('click');
gm.pump(0.3);
chk(st(gm).phase === 'play' && st(gm).level === 1, '三个按钮都接得上');
const go = start(boot());
D(go).setPuzzle(TRI_TAIL);
D(go).setInk(0);
D(go).tap(2);
D(go).tap(3);
chk(st(go).phase === 'over', '造好败局');
const act = (name) => {
  const b = go.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  chk(!!b, '结算页有按钮：' + name);
  if (b) { b.dispatch('click'); go.pump(0.3); }
};
act('stats');
chk(/本机战绩/.test(D(go).ov()) && /历代累计描线/.test(D(go).ov()), '败局里翻战绩能看到累计描线');
act('again');
chk(st(go).phase === 'play' && st(go).ink === 4, '「再来一笔」重开并补满墨');
const gi2 = boot();
D(gi2).showStats();
gi2.pump(0.2);
gi2.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'close').dispatch('click');
gi2.pump(0.2);
chk(/欧拉/.test(D(gi2).ov()), '没开局时「继续」退回介绍页');
chk(gi2.storage.getItem('yi.diff') === null || gi2.storage.getItem('yi.diff') === 'normal', '没开局不该乱写难度键');

summary('一笔画', fails);
