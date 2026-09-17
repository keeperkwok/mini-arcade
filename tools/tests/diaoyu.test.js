'use strict';
/* 钓鱼佬：鱼情数据 → 加权抽签 → 咬钩时序 → 搏鱼逐帧数值 → 断线/脱钩/起鱼 → 天光结算
   重点核对：① 每层只出本层的鱼，夜钓明显更出大货 ② gainFor 与每帧张力/线长都能按参数手算
   ③ 断线扣一副线、线用完判负；脱钩不扣线；天光归零收竿 ④ 快捷键/鼠标按住/打窝/换层各自生效 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = "window.__g = { st: () => ({ phase: phase, diff: diff, score: score, lines: lines, time: time, combo: combo, catchN: catchN,   totalW: totalW, layer: layer, chum: chum, tension: tension, dist: dist, depth: depth, fstate: fstate,   fsTimer: fsTimer, stamina: stamina, bursts: bursts, fightT: fightT, reeling: reeling, waitT: waitT, biteT: biteT,   bigOne: bigOne, fish: fish ? { n: fish.n, e: fish.e, L: fish.L, pw: fish.pw, price: fish.price, weight: fish.weight, score: fish.score } : null }), pin: (o) => { if (o.phase !== undefined) phase = o.phase; if (o.diff !== undefined) diff = o.diff;   if (o.score !== undefined) score = o.score; if (o.lines !== undefined) lines = o.lines; if (o.time !== undefined) time = o.time;   if (o.combo !== undefined) combo = o.combo; if (o.chum !== undefined) chum = o.chum; if (o.tension !== undefined) tension = o.tension;   if (o.dist !== undefined) dist = o.dist; if (o.depth !== undefined) depth = o.depth; if (o.layer !== undefined) layer = o.layer;   if (o.fstate !== undefined) fstate = o.fstate; if (o.fsTimer !== undefined) fsTimer = o.fsTimer;   if (o.stamina !== undefined) stamina = o.stamina; if (o.fightT !== undefined) fightT = o.fightT;   if (o.reeling !== undefined) reeling = o.reeling; if (o.waitT !== undefined) waitT = o.waitT;   if (o.biteT !== undefined) biteT = o.biteT; if (o.fish) fish = o.fish; if (o.catchN !== undefined) catchN = o.catchN; render(); hud(); }, cast: cast, strike: strike, miss: miss, snap: snap, letgo: letgo, land: land, tick: tick, frame: frame, biteNow: biteNow, setReel: setReel, chumOnce: chumOnce, pickFish: pickFish, makeFish: makeFish, gain: gainFor, wgt: weightOf, newRun: newRun, gameOver: gameOver, showStats: showStats, showIntro: showIntro, species: speciesAt, setL: setLayer, F: () => F, SPECIES: () => SPECIES, DIFFS: () => DIFFS, LAYERS: () => LAYERS, D: D, fmt: fmtW, pow: powerNow, msg: () => msgEl.innerHTML, ov: () => ovContent.innerHTML, hud: () => ({ score: elScore.textContent, lines: elLines.textContent, clock: elClock.textContent, ten: elTen.textContent,   dist: elDist.textContent, combo: elCombo.textContent, chum: byId(\"chumN\").textContent, lay: byId(\"layN\").textContent,   state: stateEl.textContent, fill: fillEl.style.width, fillCls: String(fillEl.className) }), layers: () => byId(\"water\").querySelectorAll(\"button\").map((b) => ({ cls: b.className, off: !!b.disabled, fa: String(b.textContent) })), btns: () => ({ cast: !!byId(\"btnCast\").disabled, reel: !!byId(\"btnReel\").disabled, chum: !!byId(\"btnChum\").disabled }), diffActive: () => byId(\"diff\").querySelectorAll(\"button\").filter((b) => b._cls.indexOf(\"active\") >= 0).map((b) => b.dataset.diff).join(\",\"), ovShown: () => overlayEl._cls.indexOf(\"show\") >= 0, log: () => logList.slice(),}\n";
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('钓鱼佬源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const near = (a, b) => Math.abs(a - b) < 1e-9;
function boot(storage) {
  const g = loadGame('diaoyu', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  return g;
}
// 只点遮罩里那个按钮：g.act() 会把整页所有 click 处理器都点一遍（连静音按钮一起点）
const clickAct = (g, name) => {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.2);
  return g;
};
const fr = (g, n) => { for (let i = 0; i < (n || 1); i++) g.tick(40); };   // 一帧 40ms
// 抛竿后把等口时间钉死，再推进一帧到黑漂
function toBite(g, lv) {
  const G = D(g);
  G.setL(lv == null ? 0 : lv);
  G.cast();
  G.pin({ waitT: 0.02 });
  fr(g);
  return G;
}
const FISH = (o) => Object.assign({ n: '测试鱼', e: '🐟', L: 1, pw: 1, price: 20, weight: 1000 }, o || {});
// 钉死一个「正在搏鱼」的局面，方便逐帧推算
const fight = (g, o) => D(g).pin(Object.assign({
  phase: 'fight', fish: FISH(), fstate: 'rest', reeling: false, tension: 20,
  dist: 10, depth: 15, stamina: 1, fsTimer: 9, fightT: 1,
}, o));

/* ==================== 一、鱼情数据自洽 ==================== */
{
  const g = boot();
  const G = D(g), SP = G.SPECIES(), L = G.LAYERS(), DF = G.DIFFS(), F = G.F();
  chk(SP.length === 9, '一共九种鱼');
  chk(L.length === 3 && L[0].depth < L[1].depth && L[1].depth < L[2].depth, '三个水层，深度一层比一层深');
  chk(SP.every((s) => s.lo > 0 && s.hi > s.lo && s.price > 0 && s.pw > 0 && s.w > 0 && [0, 1, 2].indexOf(s.L) >= 0 && s.n && s.e),
    '每种鱼的重量区间/价格/力量/权重都合法');
  chk(new Set(SP.map((s) => s.n)).size === 9, '九种鱼名字不重复');
  const cnt = [0, 1, 2].map((lv) => SP.filter((s) => s.L === lv).length);
  chk(cnt[0] === 3 && cnt[1] === 3 && cnt[2] === 3, '每层三种鱼');
  chk(SP.filter((s) => s.L === 2).every((s) => s.pw > 1), '深潭全是劲鱼');
  chk(Object.keys(DF).length === 3 && ['dawn', 'noon', 'night'].every((k) => DF[k]), '清晨/正午/夜钓三个时段');
  chk(DF.dawn.time > DF.noon.time && DF.noon.time > DF.night.time, '天光：清晨最长、夜钓最短');
  chk(DF.dawn.lines > DF.noon.lines && DF.noon.lines > DF.night.lines, '鱼线：清晨最多、夜钓最少');
  chk(DF.night.mult > DF.noon.mult && DF.noon.mult > DF.dawn.mult, '夜钓单价最贵');
  chk(DF.night.bite < DF.noon.bite && DF.noon.bite < DF.dawn.bite, '夜钓口最快（提竿窗口最短）');
  chk(DF.night.big > DF.noon.big && DF.noon.big > DF.dawn.big, '越晚越出大货');
  chk(DF.dawn.chum > DF.night.chum, '清晨窝料比夜钓多');
  chk(F.tenBurst > F.tenPw && F.tenBurst > F.tenUp, '猛窜时的追加张力比什么人都狠');
  chk(F.tenDown > 0 && F.fightMax > 0 && F.fatigue > 0 && F.reel > F.reelPw, '搏鱼参数齐全且收线速度不会被力量吃光');
  chk(G.fmt(500) === '500 克' && G.fmt(1500) === '1.5 公斤' && G.fmt(12000) === '12 公斤', '重量格式化：克 / 一公斤 / 十二公斤');
}

/* ==================== 二、抽签与分数公式 ==================== */
{
  const g = boot();
  const G = D(g);
  let pure = true;
  for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 200; i++) if (G.pickFish(lv).L !== lv) pure = false;
  chk(pure, '600 次抽签：只出本层的鱼');
  let inRange = true, five = true;
  for (let i = 0; i < 300; i++) {
    const f = G.makeFish(i % 3);
    if (!(f.weight >= f.lo && f.weight <= f.hi)) inRange = false;
    if (f.weight % 5 !== 0) five = false;
  }
  chk(inRange, 'makeFish 的重量落在该种的 lo~hi 之间');
  chk(five, '重量取整到 5 克');
  G.pin({ diff: 'noon' });
  const base = 20 + 20 * Math.pow(1000 / 500, 0.7);
  chk(G.gain(FISH({ price: 20, weight: 1000 }), 0) === Math.round(base), '一公斤鲤鱼正午 = ' + Math.round(base) + ' 分（公式可手算）');
  chk(G.gain(FISH({ price: 20, weight: 1000 }), 3) === Math.round(base * 1.45), '连竿 3 → 加成 ×1.45');
  chk(G.gain(FISH({ price: 20, weight: 1000 }), 9) === G.gain(FISH({ price: 20, weight: 1000 }), 5), '连竿加成封顶在 5');
  G.pin({ diff: 'night' });
  chk(G.gain(FISH({ price: 20, weight: 1000 }), 0) === Math.round(base * 1.8), '同样一条鱼夜钓 ×1.8');
  const small = G.gain(FISH({ price: 9, weight: 60 }), 0), big = G.gain(FISH({ price: 46, weight: 20000 }), 0);
  chk(big > small * 8, '二十公斤大货的分量远超小鱼');
  chk(G.wgt(FISH({ pw: 1.58, L: 2, nw: 4.5, w: 1.5 }), 2) > G.wgt(FISH({ pw: 1.58, L: 2, w: 1.5 }), 2), '夜性权重 nw 会抬高中签权重');
  chk(G.species(0) === '麦穗 / 白条 / 鲫鱼', '浅滩鱼种提示');
}

/* ==================== 三、夜钓真的更出大货 ==================== */
{
  const g = boot();
  const G = D(g);
  const rate = (dk) => {
    G.pin({ diff: dk });
    let big = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (G.pickFish(2).pw >= 1.38) big++;
    return big / n;
  };
  const a = rate('dawn'), b = rate('night');
  chk(b > a + 0.05, '夜钓深潭巨物率明显高于清晨：' + (a * 100).toFixed(0) + '% → ' + (b * 100).toFixed(0) + '%');
  G.pin({ diff: 'noon' });
  chk(G.species(2) === '黑鱼 / 鲢鳙 / 青鱼王', '深潭鱼种提示');
}

/* ==================== 四、开局、时段与换层 ==================== */
{
  const g = boot({ 'dy.diff': 'night' });
  const G = D(g);
  chk(st(g).phase === 'intro' && G.ovShown(), '启动先弹介绍页');
  chk(plain(G.ov()).indexOf('钓鱼佬') >= 0, '介绍页有标题');
  chk(st(g).diff === 'night', '沿用上次的时段');
  chk(st(g).lines === 2 && st(g).time === 140 && st(g).chum === 2, '夜钓：2 副线 / 140 秒天光 / 2 把窝料');
  chk(G.hud().lines === '2' && G.hud().clock === '140s', 'HUD 同步夜钓初始值');
  clickAct(g, 'start');
  chk(st(g).phase === 'pick', '点「下竿」开始选层');
  chk(!G.ovShown(), '遮罩收起');
  chk(G.diffActive() === 'night', '时段按钮高亮跟着存档');
  fr(g, 25);
  chk(st(g).time === 140, '选层阶段不扣天光');
  g.key('3');
  chk(st(g).layer === 2 && st(g).depth === 21 && G.hud().lay === '深', '按 3 → 深潭 21 米');
  chk(g.byId('fa2').textContent === '🎯', '深潭那行挂上 🎯');
  g.key('1');
  chk(st(g).layer === 0 && st(g).depth === 9, '按 1 → 浅滩 9 米');
  g.byId('water').querySelectorAll('button')[1].dispatch('click');
  chk(st(g).layer === 1 && st(g).depth === 15, '点「中层」也能换层');
  chk(plain(G.msg()).indexOf('翘嘴') >= 0, '换层提示这一层有什么鱼');
  g.key('9');
  chk(st(g).layer === 1, '乱按数字键不越界');
  // 换时段
  g.byId('diff').querySelectorAll('button')[0].dispatch('click');
  chk(st(g).diff === 'dawn' && st(g).lines === 5 && st(g).time === 200 && st(g).score === 0, '点「清晨」立刻重开一天');
  chk(g.storage._data['dy.diff'] === 'dawn', '时段写进 dy.diff');
}

/* ==================== 五、抛竿 → 黑漂 → 提竿 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  G.setL(1);
  G.cast();
  chk(st(g).phase === 'wait', '抛竿 → 等口');
  chk(st(g).dist === 15 && st(g).depth === 15, '线长 = 本层水深');
  chk(st(g).tension === 0 && st(g).fish === null, '等口时没有鱼');
  chk(st(g).waitT >= 0.9 && st(g).waitT <= 3.4, '正午等口 0.9~3.4 秒');
  const w0 = st(g).waitT;
  G.strike();
  chk(st(g).phase === 'wait' && near(st(g).waitT, w0 + 0.7), '提前抽竿：惊窝，多等 0.7 秒');
  chk(plain(G.msg()).indexOf('提早了') >= 0, '提示「提早了」');
  G.pin({ waitT: 3 });
  G.chumOnce();
  chk(st(g).waitT === 0.3, '一把窝料把等口压到 0.3 秒');
  chk(st(g).chum === 2 && G.hud().chum === '2', '正午三把窝料用掉一把');
  chk(D(g).btns().chum === false, '还有窝料 → 打窝按钮亮着');
  G.pin({ phase: 'pick' });
  const c0 = st(g).chum;
  G.chumOnce();
  chk(st(g).chum === c0 && plain(G.msg()).indexOf('等口的时候打') >= 0, '不等口时打窝无效');
  G.pin({ phase: 'wait', waitT: 5, chum: 0 });
  G.chumOnce();
  chk(st(g).waitT === 5, '窝料用光不再压时间');
  chk(D(g).btns().chum === true, '没窝料 → 打窝按钮变灰');
  G.pin({ chum: 3, waitT: 0.02 });
  fr(g);
  chk(st(g).phase === 'bite' && st(g).biteT === 0.8, '到点黑漂：正午窗口 0.8 秒');
  chk(g.byId('bob')._cls.indexOf('nod') >= 0, '浮子开始点头');
  chk(D(g).hud().state.indexOf('黑漂') >= 0, '状态栏写着黑漂');
  fr(g);
  chk(near(st(g).biteT, 0.8 - 0.04), '窗口每帧减 0.04 秒');
  G.strike();
  const s1 = st(g);
  chk(s1.phase === 'fight' && s1.fish && s1.fish.L === 1, '提竿 → 进入搏鱼，鱼来自本层');
  chk(s1.tension === 18 && s1.dist === 15, '中鱼瞬间：张力 18、线长回到水深');
  chk(s1.fstate === 'swim' && s1.stamina === 1 && s1.fightT === 0 && s1.reeling === false, '开局游动、体力满格、没在收线');
  chk(g.byId('bob')._cls.indexOf('nod') < 0, '提竿后停止点头');
  chk(plain(G.msg()).indexOf('中了') >= 0, '提示「中了」');
  // 过窗跑鱼
  G.pin({ phase: 'pick', combo: 3 });
  G.cast();
  G.pin({ waitT: 0.02 });
  fr(g);
  chk(st(g).phase === 'bite', '再次黑漂');
  G.pin({ biteT: 0.02 });
  fr(g);
  chk(st(g).phase === 'wait' && st(g).combo === 0, '手慢了：退回等口、连竿清零');
  chk(st(g).waitT >= 1.1 && st(g).waitT <= 3.2, '跑鱼后重新等口 1.1~3.2 秒');
  chk(plain(G.msg()).indexOf('手慢了') >= 0, '提示「手慢了」');
  // 等口时抛竿无效
  G.cast();
  chk(st(g).phase === 'wait' && plain(G.msg()).indexOf('竿已经在水里') >= 0, '竿在水里再按抛竿只提示');
}

/* ==================== 六、搏鱼数值可逐帧推算 ==================== */
{
  const g = boot();
  const G = D(g), F = G.F();
  clickAct(g, 'start');
  fight(g, { reeling: true, tension: 30, dist: 10 });
  fr(g);
  chk(near(st(g).tension, 30 + (F.tenUp + F.tenPw) * 0.04), '收线一帧：张力涨 (30+14×力量)/秒');
  chk(near(st(g).dist, 10 - (F.reel - F.reelPw) * 0.04), '收线一帧：线长缩 (3.4-0.9×力量)/秒');
  fight(g, { reeling: false, tension: 60, dist: 10, fstate: 'rest' });
  fr(g);
  chk(near(st(g).tension, 60 - F.tenDown * 0.04), '松手一帧：张力掉 62/秒');
  chk(near(st(g).dist, 10), '停口时松手线长不动');
  fight(g, { fstate: 'swim', tension: 20, dist: 10 });
  fr(g);
  chk(near(st(g).dist, 10 + F.outSwim * 1.5 * 0.04), '鱼游动时松手会被拖出 0.2×(0.5+力量)/秒');
  fight(g, { fstate: 'burst', reeling: true, tension: 40, dist: 10 });
  fr(g);
  chk(near(st(g).tension, 40 + (F.tenUp + F.tenPw + F.tenBurst) * 0.04), '窜的时候硬拉：张力一帧 +4.56');
  chk(near(st(g).dist, 10 - (F.reel - F.reelPw) * 0.04 * F.reelBurst), '窜的时候收线只有四成速');
  fight(g, { fstate: 'burst', reeling: false, tension: 60, dist: 10 });
  fr(g);
  chk(near(st(g).tension, 60 - F.tenDown * F.tenHold * 0.04), '窜的时候松手掉压也慢');
  chk(near(st(g).dist, 10 + (F.outBurst + F.outPw) * 0.04), '窜的时候松手被拖 1.35/秒');
  // 力量随体力衰减
  fight(g, { stamina: 0.5 });
  chk(near(G.pow(), 1 * (0.4 + 0.6 * 0.5)), '力量 = 鱼种力量 ×(0.4+0.6×体力)');
  // 状态机：游动 → 停口 → 猛窜 → 游动，且窜完掉劲
  fight(g, { fstate: 'swim', fsTimer: 0.01, reeling: false, tension: 10, dist: 10 });
  fr(g);
  chk(st(g).fstate === 'rest' && st(g).fsTimer > 0, '游动到点转停口');
  fight(g, { fstate: 'rest', fsTimer: 0.01, tension: 10, dist: 10 });
  fr(g);
  chk(st(g).fstate === 'burst', '停口到点转猛窜');
  const b0 = st(g).bursts, s0 = st(g).stamina;
  fight(g, { fstate: 'burst', fsTimer: 0.01, tension: 10, dist: 10, stamina: s0 });
  fr(g);
  chk(st(g).fstate === 'swim', '窜完回到游动');
  chk(near(st(g).stamina, Math.max(0.15, s0 - F.fatigue)) && st(g).bursts === b0 + 1, '每窜一次自己掉一层劲');
  fight(g, { fstate: 'burst', fsTimer: 0.01, stamina: 0.1, tension: 10, dist: 10 });
  fr(g);
  chk(st(g).stamina === 0.15, '体力有下限，不会归零变成死鱼');
  // 线长上限：拖出 1.5 倍水深就顶住
  fight(g, { fstate: 'burst', reeling: false, tension: 10, dist: 30, depth: 15 });
  fr(g, 12);
  chk(st(g).dist <= 22.5 + 1e-9, '鱼最远只能拖到 1.5 倍水深');
}

/* ==================== 七、三条出口：断线 / 脱钩 / 起鱼 ==================== */
{
  const g = boot({ 'dy.best': '500' });
  const G = D(g);
  clickAct(g, 'start');
  // 断线
  fight(g, { fstate: 'burst', reeling: true, tension: 99, dist: 8, lines: 3, combo: 2 });
  fr(g);
  chk(st(g).phase === 'pick' && st(g).lines === 2, '张力满 → 断线，扣一副线');
  chk(st(g).combo === 0, '断线清连竿');
  chk(plain(G.msg()).indexOf('断线') >= 0 && plain(G.msg()).indexOf('还剩 2') >= 0, '提示断线并报剩余线数');
  chk(st(g).score === 0 && st(g).catchN === 0, '断线不得分');
  // 断完判负
  fight(g, { fstate: 'burst', reeling: true, tension: 99, dist: 8, lines: 1 });
  fr(g);
  chk(st(g).phase === 'over' && st(g).lines === 0, '最后一副线断了 → 收竿');
  chk(G.ovShown() && plain(G.ov()).indexOf('鱼线用完了') >= 0, '结算页写明原因');
  chk(g.storage._data['dy.best'] === '500', '零分不会覆盖旧纪录');
  // 脱钩（不扣线）
  clickAct(g, 'again');
  const L0 = st(g).lines;
  chk(st(g).phase === 'pick' && st(g).score === 0 && st(g).time === 160 && st(g).lines === 3, '「再战一天」重置成完整一天');
  fight(g, { fightT: 39.99, lines: L0, combo: 2, dist: 12, tension: 10 });
  fr(g);
  chk(st(g).phase === 'pick' && st(g).lines === L0, '超过 40 秒没遛上来 → 脱钩，不扣线');
  chk(st(g).combo === 0 && plain(G.msg()).indexOf('把钩吐了') >= 0, '脱钩断连竿并提示');
  // 起鱼
  G.pin({ phase: 'pick', score: 100, combo: 1, catchN: 0, totalW: 0 });
  toBite(g, 1);
  fight(g, { fish: FISH(), reeling: true, tension: 20, dist: 0.02 });
  fr(g);
  const gain = Math.round((20 + 20 * Math.pow(2, 0.7)) * 1.0 * 1.15);
  chk(st(g).phase === 'pick' && st(g).score === 100 + gain, '起鱼得分 = 公式值（正午 × 连竿 1.15）= ' + gain);
  chk(st(g).combo === 2 && st(g).catchN === 1 && near(st(g).totalW, 1000), '连竿 +1、起鱼数与总重累计');
  chk(near(st(g).dist, 0), '线长收到 0');
  chk(g.storage._data['dy.catch'] === '1' && g.storage._data['dy.big'] === '1000', '累计条数与最重单条落盘');
  chk(g.storage._data['dy.best'] === '500', '160 分不超过旧纪录 500 → 纪录保持');
  chk(plain(G.msg()).indexOf('起鱼') >= 0 && plain(G.msg()).indexOf('测试鱼') >= 0, '提示「起鱼！某鱼 1 公斤」');
  chk(D(g).log().length === 1 && D(g).log()[0].s === gain, '渔获清单记下这一条的分');
  // 收线过程中断线也算在同一帧里判掉
  G.pin({ phase: 'pick' });
  toBite(g, 0);
  G.strike();
  chk(st(g).phase === 'fight' && st(g).fish.L === 0, '浅滩只会中浅滩的鱼');
  chk(st(g).dist === 9, '浅滩搏鱼从 9 米线长开始');
}

/* ==================== 八、天光与结算 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  G.cast();
  G.pin({ time: 0.03 });
  fr(g);
  chk(st(g).phase === 'over' && st(g).time === 0, '天光耗尽 → 收竿');
  chk(plain(G.ov()).indexOf('天黑了') >= 0, '结算原因：天黑了');
  chk(plain(G.ov()).indexOf('空军一条') >= 0, '一条没中 → 「空军一条」');
  chk(plain(G.ov()).indexOf('0') >= 0, '结算页有分数');
  G.showIntro();
  chk(st(g).phase === 'intro' && G.ovShown(), '介绍页可以重新弹出');
  clickAct(g, 'start');
  // 有一条渔获时的结算清单
  toBite(g, 1);
  fight(g, { reeling: true, tension: 20, dist: 0.02, fish: FISH({ n: '大物', e: '🐋', weight: 5000, price: 30 }) });
  fr(g);
  const gain2 = Math.round((20 + 30 * Math.pow(10, 0.7)) * 1.0);
  chk(st(g).score === gain2, '五条五公斤鱼的分：' + gain2);
  G.pin({ time: 0.02, phase: 'wait', waitT: 5 });
  fr(g);
  chk(st(g).phase === 'over' && plain(G.ov()).indexOf('大物') >= 0, '结算页列出这一天的渔获');
  chk(plain(G.ov()).indexOf('起鱼 1 条') >= 0, '结算页汇总条数');
  chk(g.storage._data['dy.best'] === String(gain2), '收竿时写入最高分');
  g.key('Escape');
  chk(!G.ovShown() && st(g).phase === 'over', '结算页按 Esc 只关遮罩，不重开');
  g.key('n');
  chk(st(g).phase === 'pick' && st(g).score === 0, 'N 重开一天');
  // 战绩页
  g.key('t');
  const ov = plain(G.ov());
  chk(ov.indexOf('本机战绩') >= 0 && ov.indexOf(String(gain2)) >= 0, 'T 打开本机战绩');
  chk(ov.indexOf('5.0 公斤') >= 0, '战绩里的单条最重格式化正确');
  clickAct(g, 'close');
  chk(!G.ovShown(), '战绩页「继续」关掉遮罩');
  g.byId('btnStats').dispatch('click');
  chk(plain(G.ov()).indexOf('本机战绩') >= 0, '点 📊 也能看战绩');
  g.byId('btnNew').dispatch('click');
  chk(st(g).phase === 'pick' && !G.ovShown(), '点 ↻ 直接重开');
}

/* ==================== 九、渲染与按钮状态 ==================== */
{
  const g = boot();
  const G = D(g);
  clickAct(g, 'start');
  chk(D(g).btns().cast === false && D(g).btns().reel === true, '选层时：抛竿亮、收线灰');
  chk(D(g).layers().every((b) => b.off === false), '选层时三层都能点');
  fight(g, { tension: 64, dist: 10.5, depth: 21, fish: FISH({ e: '🐍' }), fstate: 'burst', stamina: 1 });
  chk(g.byId('fill').style.width === '64%', '张力条宽度 = 张力百分比');
  chk(g.byId('fill')._cls.indexOf('hot') < 0, '64% 还不烫手');
  G.pin({ tension: 80 });
  chk(g.byId('fill')._cls.indexOf('hot') >= 0, '≥78% 变烫手');
  chk(near(Number(g.byId('string').style.height.replace('px', '')), 34 + (10.5 / 31.5) * 150), '钓线长度按线长比例画');
  chk(g.byId('shadow')._cls.indexOf('burst') >= 0, '猛窜时水下游影发亮');
  chk(String(g.byId('shadow').textContent).indexOf('🐍') >= 0, '水下游影就是这条鱼');
  const h = G.hud();
  chk(h.ten === '80%' && h.dist === '10.5' && h.clock === '160s', 'HUD：张力/线长/天光');
  chk(h.state.indexOf('猛窜') >= 0 && h.state.indexOf('劲 100%') >= 0, '状态栏：鱼在猛窜、体力百分比');
  chk(D(g).btns().cast === true && D(g).btns().reel === false && D(g).layers().every((b) => b.off), '搏鱼时：抛竿灰、收线亮、三层都锁');
  G.pin({ phase: 'wait', tension: 0, dist: 15 });
  chk(D(g).hud().state.indexOf('等口') >= 0, '等口状态文案');
  G.pin({ phase: 'pick' });
  chk(D(g).hud().state.indexOf('先选一层水') >= 0, '选层状态文案');
  chk(g.byId('fa' + st(g).layer).textContent === '🎯', '只有当前层挂 🎯');
}

/* ==================== 十、快捷键与鼠标 ==================== */
{
  const g = boot();
  const G = D(g);
  chk(g.byId('btnSound').textContent === '🔊', '默认有声');
  g.key('m');
  chk(g.byId('btnSound').textContent === '🔇', 'M 静音');
  chk(g.storage._data['dy.muted'] != null, '静音状态写进 dy.muted');
  g.key('m');
  chk(g.byId('btnSound').textContent === '🔊', '再按 M 恢复');
  clickAct(g, 'start');
  g.key('c');
  chk(st(g).phase === 'wait', 'C 抛竿');
  G.pin({ waitT: 0.02 });
  fr(g);
  chk(st(g).phase === 'bite', '推进到黑漂');
  g.key(' ');
  chk(st(g).phase === 'fight', '空格提竿');
  G.pin({ reeling: false, dist: 10, tension: 20 });
  g.key(' ');
  chk(st(g).reeling === true, '搏鱼时空格 = 按住收线');
  g.doc.body.dispatch('keyup', { key: ' ' });
  chk(st(g).reeling === false, '抬空格松手');
  g.key('2');
  chk(st(g).phase === 'fight' && st(g).layer === 0 && st(g).depth === 9, '搏鱼中按 2 换层无效：层号和水深都不变');
  g.byId('btnReel').dispatch('pointerdown');
  chk(st(g).reeling === true, '按住收线按钮开始收线');
  g.byId('btnReel').dispatch('pointerup');
  chk(st(g).reeling === false, '按钮松手停止收线');
  g.byId('btnReel').dispatch('pointerdown');
  g.byId('btnReel').dispatch('pointerleave');
  chk(st(g).reeling === false, '鼠标滑出按钮自动松手');
  g.byId('scene').dispatch('pointerdown');
  chk(st(g).reeling === true, '按住水面空白也能收线');
  g.byId('scene').dispatch('pointerup');
  chk(st(g).reeling === false, '水面松手');
  const lay = g.byId('water').querySelectorAll('button')[2];
  g.byId('scene').dispatch('pointerdown', { target: lay });
  chk(st(g).reeling === false, '点在水层按钮上不触发收线');
  // 黑漂时点水面 = 提竿
  G.pin({ phase: 'pick' });
  G.cast();
  G.pin({ waitT: 0.02 });
  fr(g);
  g.byId('scene').dispatch('pointerdown');
  chk(st(g).phase === 'fight', '黑漂时点水面提竿');
  g.key('n');
  chk(st(g).phase === 'pick' && st(g).time === 160, 'N 重开回正午 160 秒');
}

/* ==================== 十一、整天模拟：策略决定生死 ==================== */
function daySim(diffKey, lv, mode) {
  const g = boot({ 'dy.diff': diffKey });
  const G = D(g);
  clickAct(g, 'start');
  let lag = 0;
  for (let f = 0; f < 6000; f++) {
    const s = st(g);
    if (s.phase === 'over') break;
    if (s.phase === 'pick') { G.setL(lv); G.cast(); continue; }
    if (s.phase === 'bite') { G.strike(); continue; }
    if (s.phase === 'fight') {
      const burst = s.fstate === 'burst' && !(mode === 'shaky' && lag++ < 3);
      if (mode === 'shaky' && s.fstate !== 'burst') lag = 0;
      const want = mode === 'greedy' ? true : (!burst && s.tension < 72);
      if (want !== s.reeling) G.setReel(want);
    }
    g.tick(40);
  }
  return st(g);
}
{
  const good = daySim('dawn', 0, 'good');
  chk(good.phase === 'over' && good.catchN >= 15 && good.score >= 500,
    '老实遛鱼：清晨浅滩一天 ' + good.catchN + ' 条 / ' + good.score + ' 分');
  const deep = daySim('night', 2, 'good');
  chk(deep.catchN >= 1, '夜钓深潭也能天天开张：' + deep.catchN + ' 条 / ' + deep.score + ' 分');
  const greedy = daySim('dawn', 2, 'greedy');
  chk(greedy.lines === 0 && greedy.phase === 'over', '一路按死不放 → 五副线全断');
  chk(greedy.score < good.score, '硬拉的分数不如遛鱼（' + greedy.score + ' < ' + good.score + '）');
  const mid = daySim('noon', 1, 'good');
  chk(mid.catchN >= 6 && mid.score > 400, '正午中层一天 ' + mid.catchN + ' 条 / ' + mid.score + ' 分');
}

summary('钓鱼佬', fails);
