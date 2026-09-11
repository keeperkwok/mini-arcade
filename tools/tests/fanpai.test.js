'use strict';
/* 翻牌堆：被压住的牌看不见图案也点不动 → 拿走上层它才翻开 →
   三张同图案自动消除并加分 → 撤回/洗牌/移出三个道具各管一摊 →
   槽位塞满或无路可走判负，照发牌顺序走必定通关。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

// 只在测试构建里注入观测/操作口，正式文件不含这段
const hook = 'window.__f = {' +
  ' st: () => ({ phase, level, score, best, maxLevel, n: tiles.length, left: onTable(),' +
  '   slot: slot.length, buf: buf.length, undos: undosLeft, shufs: shufLeft, pops: popLeft,' +
  '   cleared, combo, kinds: levelCfg(level).kinds, free: tiles.filter((t) => t.state === "board" && !t.cover).length }),' +
  ' tiles: () => tiles, slotArr: () => slot, bufArr: () => buf,' +
  ' startLevel, onTap, hitTile, useUndo, useShuffle, usePopOut, isDeadlocked, afterChange, countCover, layout, overlaps,' +
  ' take: (id) => { const t = tiles[id];' +
  '   if (t.state === "board" && !t.cover) flyToSlot(t, "board");' +
  '   else if (t.state === "buf") flyToSlot(t, "buf"); },' +
  ' setProps: (u, s, p) => { undosLeft = u; shufLeft = s; popLeft = p; hud(); },' +
  ' setKind: (i, k) => { tiles[i].k = k; },' +
  ' kill: (i) => { tiles[i].state = "gone"; countCover(); revealFlips(); },' +
  ' pushSlot: (i) => { const t = tiles[i]; t.state = "slot"; t.flip = 1; slot.push(t); countCover(); layout(); hud(); },' +
  '};\n';
const inj = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('翻牌堆源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const f = (g) => g.ctx.__f;
const st = (g) => g.ctx.__f.st();
const open = (storage) => {
  const g = loadGame('fanpai', { transform: inj, storage: storage || {} });
  g.pump(0.3);
  return g;
};
const begin = (g, L) => { f(g).startLevel(L); g.pump(0.2); };
// 点一张牌并等它落进槽位：优先走真实命中测试，位置被邻居挡住时退到直接取牌
const tap = (g, t) => {
  const hit = f(g).hitTile(t.rx, t.ry);
  if (hit && hit.t === t && hit.free) f(g).onTap(t.rx, t.ry);
  else f(g).take(t.id);
  g.pump(0.3);
};
const pressAct = (g, act) => {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === act);
  if (btn) btn.dispatch('click');
  g.pump(0.5);
  return !!btn;
};
const freeTiles = (g) => f(g).tiles().filter((t) => t.state === 'board' && t.cover === 0);
const kindsOf = (list) => {
  const m = {};
  for (const t of list) m[t.k] = (m[t.k] || 0) + 1;
  return m;
};
// 现场消掉一组：找一个"露顶就有三张"的图案，连着点掉
const clearTrio = (g) => {
  const cnt = kindsOf(freeTiles(g));
  const k = Number(Object.keys(cnt).find((x) => cnt[x] >= 3));
  if (!Number.isFinite(k)) return false;
  for (const t of freeTiles(g).filter((x) => x.k === k).slice(0, 3)) tap(g, t);
  return st(g).cleared > 0;
};

/* 独立复核发牌结果：按 order 一张张取，取的时候必须已经露顶，
   同图案归位后槽位永远不满 7 格 —— 这条路径就是这一关的解法。 */
function verifyOrder(tiles, overlaps) {
  const alive = {};
  for (const t of tiles) alive[t.id] = true;
  const seq = tiles.slice().sort((a, b) => a.order - b.order);
  const tray = [];
  let peak = 0;
  for (const t of seq) {
    for (const u of tiles) {
      if (u.id !== t.id && alive[u.id] && u.z > t.z && overlaps(u, t)) return { bad: '取第 ' + t.order + ' 张时它还被压着' };
    }
    alive[t.id] = false;
    let at = tray.length;
    for (let i = tray.length - 1; i >= 0; i--) if (tray[i] === t.k) { at = i + 1; break; }
    tray.splice(at, 0, t.k);
    if (tray.filter((v) => v === t.k).length >= 3) {
      for (let i = tray.length - 1, d = 0; i >= 0 && d < 3; i--) if (tray[i] === t.k) { tray.splice(i, 1); d++; }
    }
    if (tray.length > peak) peak = tray.length;
    if (tray.length >= 7) return { bad: '槽位撑到 ' + tray.length + ' 格' };
  }
  return tray.length === 0 ? { peak } : { bad: '走完顺序槽位还剩 ' + tray.length + ' 张' };
}

/* ==================== A. 发牌：图案守恒 + 保证有解 ==================== */
for (const L of [1, 2, 4, 6, 9, 12]) {
  const g = open();
  begin(g, L);
  const s = st(g);
  const all = f(g).tiles();
  const cnt = kindsOf(all);
  const bad = Object.keys(cnt).filter((k) => cnt[k] % 3);
  const order = all.map((t) => t.order).sort((a, b) => a - b).join(',');
  const v = verifyOrder(all, f(g).overlaps);
  chk(s.n % 3 === 0 && all.length === s.n, 'L' + L + ' 牌数 ' + s.n + ' 是 3 的倍数');
  chk(bad.length === 0, 'L' + L + ' 每种图案都凑成整三张（' + Object.keys(cnt).length + ' 种图案）');
  chk(s.free >= 3, 'L' + L + ' 开局就有 ' + s.free + ' 张露顶能点');
  chk(all.every((t) => (t.cover === 0) === (t.flip === 1)), 'L' + L + ' 只有露顶的牌是正面，压着的还是背面');
  chk(order === Array.from({ length: s.n }, (_, i) => i).join(','), 'L' + L + ' 取牌顺序是 0..n-1 的一条完整序列');
  chk(!v.bad, 'L' + L + ' 这局一定有解：照顺序走槽位峰值 ' + v.peak + (v.bad ? '（' + v.bad + '）' : ''));
  chk(all.every((t) => t.under.every((u) => u.z < t.z)), 'L' + L + ' 遮挡只会朝下，不会出现环形压牌');
  const vals = Object.keys(cnt).map((k) => cnt[k]);
  chk(vals.length === s.kinds, 'L' + L + ' ' + vals.length + ' 种图案全都用上了（关卡配置 ' + s.kinds + ' 种）');
  chk(Math.max.apply(null, vals) - Math.min.apply(null, vals) <= 6, 'L' + L + ' 图案张数够均匀（最多 ' + Math.max.apply(null, vals) + ' / 最少 ' + Math.min.apply(null, vals) + '）');
}

/* ==================== B. 遮挡与翻牌 ==================== */
const g = open();
begin(g, 1);
let s = st(g);
chk(s.phase === 'play', '开局进入牌局');
chk(s.n === 24 && s.level === 1, '第 1 关 24 张牌（新手量）');
chk(s.undos === 3 && s.shufs === 1 && s.pops === 1, '每关道具：撤回 3 次 + 洗牌 1 次 + 移出 1 次');

const pressed = f(g).tiles().find((t) => t.cover === 1);
const top = f(g).tiles().find((t) => t.cover === 0 && t.under.indexOf(pressed) >= 0);
chk(!!pressed && !!top, '牌堆里有正好被压一层的牌，也找得到压着它的那张');
chk(pressed.flip === 0 && pressed.up === false, '被压住的牌是背面，还没翻开');
tap(g, pressed);
chk(st(g).slot === 0 && pressed.state === 'board', '点被压住的牌点不动，不会进槽位');
tap(g, top);
chk(st(g).slot === 1, '露顶的牌点一下就飞进槽位');
chk(pressed.cover === 0, '拿走压着它的那张后，遮挡层数重算归零');
g.pump(0.6);
chk(pressed.up === true && pressed.flip === 1, '露顶的牌自己翻成正面（翻牌动画走完）');
chk(st(g).left === 23 && g.byId('left').textContent === '23', '桌上剩余数同步到状态栏');

/* ==================== C. 三消与槽位归位 ==================== */
begin(g, 1);
const cnt0 = kindsOf(freeTiles(g));
const rich = Number(Object.keys(cnt0).find((k) => cnt0[k] >= 3));
chk(Number.isFinite(rich), '开局露顶的牌里能找到某个图案的三张');
const trio = freeTiles(g).filter((t) => t.k === rich).slice(0, 3);
tap(g, trio[0]);
tap(g, trio[1]);
chk(st(g).slot === 2 && st(g).cleared === 0, '两张同图案先进槽位排好，还不消除');
chk(f(g).slotArr().slice(0, 2).every((t) => t.k === rich), '这两张在槽位里紧挨着');
tap(g, trio[2]);
chk(st(g).cleared === 1, '第三张一到，三张同图案立刻消除');
chk(st(g).slot === 0, '消除把这三张一起带走，槽位腾空');
chk(st(g).score === 30, '第 1 关一组 30 分（当前 ' + st(g).score + '）');
chk(st(g).combo === 1, '记上一次连消');
chk(g.byId('score').textContent === '30', '分数同步到状态栏');

begin(g, 1);
const ks = Object.keys(kindsOf(freeTiles(g))).map(Number);
const a1 = freeTiles(g).find((t) => t.k === ks[0]);
tap(g, a1);
const mid = freeTiles(g).find((t) => t.k !== ks[0]);
tap(g, mid);
const a2 = freeTiles(g).find((t) => t.k === ks[0]);
chk(!!a2, '还能找到同图案的第二张');
tap(g, a2);
const arr = f(g).slotArr();
chk(arr.length === 3 && arr[0].k === ks[0] && arr[1].k === ks[0], '后来那张插到了已有一张的旁边，不是排在末尾');

/* ==================== D. 三个道具 ==================== */
begin(g, 1);
const leftBefore = st(g).left;
const pair = freeTiles(g).slice(0, 2);
tap(g, pair[0]);
tap(g, pair[1]);
chk(st(g).slot === 2, '先往槽位塞两张牌');
f(g).useUndo();
g.pump(0.1);
chk(st(g).undos === 2, '撤回用掉一次');
chk(st(g).slot === 0, '撤回把最近拿的牌退回桌上');
chk(st(g).left === leftBefore, '退回的牌重新算在桌上');
chk(pair[0].state === 'board' && pair[1].state === 'board', '那两张牌回到了牌堆里');
chk(Math.round(pair[0].rx) === Math.round(pair[0].x), '回位后坐标就是原来的格位');
const kBefore = kindsOf(f(g).tiles().filter((t) => t.state === 'board'));
f(g).useShuffle();
g.pump(0.6);
const kAfter = kindsOf(f(g).tiles().filter((t) => t.state === 'board'));
chk(st(g).shufs === 0, '洗牌只有一次');
let same = true;
for (const key of new Set([...Object.keys(kBefore), ...Object.keys(kAfter)])) {
  if ((kBefore[key] || 0) !== (kAfter[key] || 0)) same = false;
}
chk(same, '洗牌只重新分配图案，每种张数一格不多一格不少');
chk(freeTiles(g).every((t) => t.flip >= 1), '洗牌动画过后露顶的牌仍然看得见图案');
chk(st(g).slot === 0, '洗牌不动槽位里的牌');
chk(g.byId('btnShuffle').disabled === true, '洗牌用完按钮置灰');

begin(g, 1);
const ks3 = Object.keys(kindsOf(freeTiles(g))).map(Number);
chk(ks3.length >= 3, '露顶的牌里至少看得见 3 种图案');
const spread = ks3.slice(0, 3).map((k) => freeTiles(g).find((t) => t.k === k));
for (const t of spread) tap(g, t);
chk(st(g).slot === 3 && st(g).cleared === 0, '三张不同图案都进了槽位（' + st(g).slot + ' 张）');
f(g).usePopOut();
g.pump(0.2);
chk(st(g).pops === 0, '移出只有一次');
chk(st(g).buf === 3 && st(g).slot === 0, '槽位最前面三张挪到暂存台');
chk(f(g).bufArr().length === 3, '暂存台一次最多搬三张');
const back = f(g).bufArr()[0];
tap(g, back);
chk(st(g).buf === 2 && st(g).slot === 1, '暂存台上的牌点一下收回槽位');
chk(g.byId('btnPop').disabled === true, '移出用过之后按钮置灰');

/* ==================== E. 通关：照着发牌顺序走必定赢 ==================== */
for (const L of [2, 5]) {
  const gc = open();
  begin(gc, L);
  let guard = 0;
  while (st(gc).phase === 'play' && guard++ < 300) {
    const seq = f(gc).tiles().filter((t) => t.state === 'board').sort((a, b) => a.order - b.order);
    if (!seq.length || seq[0].cover !== 0) break;
    tap(gc, seq[0]);
  }
  const s2 = st(gc);
  chk(s2.phase === 'cleared', '第 ' + L + ' 关照顺序走必定通关（走了 ' + guard + ' 步）');
  chk(s2.left === 0 && s2.slot === 0 && s2.buf === 0, '第 ' + L + ' 关通关时桌上和槽位都空了');
  chk(s2.cleared === f(gc).tiles().length / 3, '第 ' + L + ' 关消除组数 = 牌数 / 3');
}
const g2 = open();
begin(g2, 2);
let guard2 = 0;
while (st(g2).phase === 'play' && guard2++ < 300) {
  const seq = f(g2).tiles().filter((t) => t.state === 'board').sort((a, b) => a.order - b.order);
  if (!seq.length || seq[0].cover !== 0) break;
  tap(g2, seq[0]);
}
chk(st(g2).score > 1000, '第 2 关通关分 ' + st(g2).score + '（含过关奖励与道具结余）');
chk(g2.storage.getItem('fanpai.level') === '3', '最远关卡写进存档 fanpai.level = 3');
chk(Number(g2.storage.getItem('fanpai.best')) === st(g2).score, '最高分写进存档 fanpai.best');
chk(pressAct(g2, 'next'), '通关遮罩有「下一关」');
chk(st(g2).level === 3 && st(g2).phase === 'play', '点下一关进第 3 关');
chk(st(g2).n === 36, '第 3 关牌数涨到 36 张');
chk(st(g2).undos === 3 && st(g2).score === st(g2).score, '新一关道具重新发满，分数累计保留');

/* ==================== F. 判负：无路可走 / 槽位塞满 ==================== */
const g3 = open();
begin(g3, 1);
chk(clearTrio(g3), '先消一组攒点分（' + st(g3).score + '）');
f(g3).setProps(0, 0, 0);
const all3 = f(g3).tiles();
for (let i = 0; i < all3.length; i++) if (all3[i].state === 'board') f(g3).kill(i);
const loose = all3.filter((t) => t.state === 'gone').slice(0, 2);
for (const t of loose) f(g3).pushSlot(t.id);
g3.pump(0.1);
chk(st(g3).left === 0 && st(g3).slot === 2, '残局：桌上清空，槽位两张凑不成一组');
chk(f(g3).isDeadlocked(), '没有露顶牌可消、道具也用尽 → 判定无路可走');
f(g3).afterChange();
g3.pump(0.3);
chk(st(g3).phase === 'over', '判负，不用玩家白点');
chk(Number(g3.storage.getItem('fanpai.best')) === 30, '失败也结算最高分');
chk(/无路可走/.test(g3.byId('overlayContent')._html), '遮罩写的是「无路可走」');
chk(pressAct(g3, 'retry'), '失败遮罩有「再来这关」');
chk(st(g3).phase === 'play' && st(g3).level === 1, '重来一后进第 1 关');
chk(st(g3).best === 30, '最高分保留');

const g4 = open();
begin(g4, 1);
f(g4).setProps(1, 0, 0);            // 留一次撤回，确保走的是"塞满"而不是"判死"
const all4 = f(g4).tiles();
const six = all4.filter((t) => t.state === 'board').slice(0, 6);
six.forEach((t, i) => { f(g4).setKind(t.id, (i / 2) | 0); f(g4).pushSlot(t.id); });
g4.pump(0.1);
chk(st(g4).slot === 6, '制造险情：槽位 6 张 = 三对，各差一张');
const doomed = freeTiles(g4)[0];
chk(!!doomed, '桌上还有露顶的牌');
f(g4).setKind(doomed.id, 9);        // 换成一个槽位里没有的新图案
tap(g4, doomed);
chk(st(g4).phase === 'over', '第七张一进去就爆槽判负');
chk(/塞满/.test(g4.byId('overlayContent')._html), '遮罩写的是「槽位塞满了」');
chk(g4.byId('overlayContent')._html.indexOf('倒在第 1 关') > 0, '遮罩报告倒在哪一关');

/* ==================== G. 界面与存档 ==================== */
const g5 = open({ 'fanpai.best': '4321', 'fanpai.level': '7', 'fanpai.muted': '1' });
g5.pump(0.2);
chk(g5.byId('best').textContent === '4321', '最高分从存档读回');
chk(g5.byId('btnSound').textContent === '🔇', '静音状态从存档读回');
chk(st(g5).maxLevel === 7, '最远关卡从存档读回');
chk(st(g5).phase === 'intro', '首屏是玩法遮罩');
chk(/被压住的看不见图案/.test(g5.byId('overlayContent')._html), '遮罩里写清了核心规则');
chk(pressAct(g5, 'start'), '遮罩有「开始第 1 关」');
chk(st(g5).phase === 'play', '进牌局');
chk(g5.byId('overlay')._cls.indexOf('show') < 0, '遮罩已收起');
g5.key('p');
g5.pump(0.1);
chk(st(g5).phase === 'paused', 'P 键暂停');
g5.key('p');
g5.pump(0.1);
chk(st(g5).phase === 'play', '再按 P 继续');
const drawsBefore = g5.draws();
g5.pump(0.4);
chk(g5.draws() > drawsBefore, '画面持续重绘（+' + (g5.draws() - drawsBefore) + ' 次绘制调用）');
const trayHit = f(g5).hitTile(230, 570);
chk(trayHit === null || trayHit.free, '槽位区域不会误触到桌上的牌');
g5.key('r');
g5.pump(0.3);
chk(st(g5).phase === 'play' && st(g5).left === 24, 'R 键重开本关，牌堆重新发满');

summary('翻牌堆', fails);
process.exit(fails ? 1 : 0);
