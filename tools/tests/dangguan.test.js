'use strict';
/* 一夫当关：路障会当场改写路线（且必须留通路）→ 经济与塔规则 → 波次编成可复现 →
   减伤/破甲/溅射打不到飞行/冰井减速/撞墙兵砸墙 → 清波入档与续档 → 城破结算。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__d = {' +
  ' st: () => ({ phase, wave, gold, lives, bricks, kills, score, smashes, tool, diff: diff.id, routeCells,' +
  '   enemies: enemies.map(e => ({ k: e.kind, hp: Math.round(e.hp), x: Math.round(e.x), y: Math.round(e.y),' +
  '     fly: !!e.fly, ram: !!e.ram, slowT: Math.round(e.slowT * 100) / 100, stun: Math.round(e.stun * 10) / 10 })),' +
  '   towers: towers.map(t => t.type + \'@\' + t.c + \',\' + t.r + \' L\' + t.lv),' +
  '   walls: walls.map(w => w.c + \',\' + w.r + \':\' + Math.round(w.hp)), queue: queue.slice() }),' +
  ' place, setTool, startWave, newRun, spawn, wavePlan, findPathFrom, loadSave, readSave,' +
  ' at: () => (enemies.length ? cellOf(enemies[0].x, enemies[0].y) : null), ' +
  ' live: (c, r) => towerAt(c, r) ? { c, r } : null, stats: (c, r) => towerStats(towerAt(c, r)),' +
  ' occList: () => [...occ.keys()].sort().join(\' \'), bricks0: MAX_BRICKS, wallHp: WALL_HP,' +
  ' addGold: (n) => { gold += n; hud(); }, addBricks: (n) => { bricks = Math.min(MAX_BRICKS, bricks + n); hud(); },' +
  ' setLives: (v) => { lives = v; hud(); }, panelHTML: () => panelEl.innerHTML,' +
  ' clickPanel: (a) => { const b = panelEl.querySelectorAll(\'button\').find((x) => x.dataset.act === a);' +
  '   if (!b) return false; b.dispatch(\'click\'); return true; },' +
  ' probe: (kind, dmg, opts) => { enemies.length = 0; spawn(kind); const e = enemies[0];' +
  '   const d = hurt(e, dmg, opts || {}); const out = { dealt: Math.round(d * 10) / 10, hp: Math.round(e.hp), dead: e.dead };' +
  '   enemies.length = 0; return out; },' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('一夫当关源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__d;
const st = (g) => D(g).st();
const actBtn = (g, act) => g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === act);

function boot(storage) {
  const g = loadGame('dangguan', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  actBtn(g, 'start').dispatch('click');
  g.pump(0.2);
  return g;
}
const toolTo = (g, k) => { if (st(g).tool !== k) D(g).setTool(k); };
const build = (g, k, c, r) => { toolTo(g, k); const ok2 = D(g).place(c, r); toolTo(g, null); return ok2; };
const killWave = (g, secs) => {
  D(g).startWave();
  for (let k = 0; k < Math.ceil(secs * 60) && st(g).phase === 'fight'; k++) g.tick(16);
};

/* ==================== 一、寻路：机制的命根子 ==================== */
let g = boot();
chk(st(g).routeCells === 11, '空场最短路 = 11 格（入口到城门的直线）');
chk(build(g, 'brick', 5, 4), '在直线上砌一面墙');
chk(st(g).routeCells === 13, '墙成了路障 → 路线变 13 格（绕行要多走 2 步）：' + st(g).routeCells);
chk(build(g, 'bolt', 5, 5), '往下侧的绕行格建一座连弩：长度不变（往上绕一样是 13 格）');
chk(st(g).routeCells === 13, '只堵一侧时它换边绕，路线仍是 13 格：' + st(g).routeCells);
chk(build(g, 'bolt', 5, 3), '把上下两条绕行道都堵上');
chk(st(g).routeCells > 13, '两侧都堵 → 只能绕更远，路线第三次被改写成 ' + st(g).routeCells + ' 格');
g = boot();
D(g).addBricks(40);
for (let r = 0; r < 8; r++) build(g, 'brick', 4, r);
chk(st(g).walls.length === 7, '一整列 8 格只砌得起 7 面（第 8 面会彻底封死，必须被拒）：' + st(g).walls.join(' '));
chk(st(g).routeCells >= 17, '只留一个缺口的竖墙把路绕得很长：' + st(g).routeCells + ' 格');
// 围城门：三面堵完就封死了，第三面必须拒绝
g = boot();
D(g).addBricks(40);
chk(build(g, 'brick', 9, 4) && build(g, 'brick', 10, 3), '可以先堵住城门的左面与上面');
chk(!build(g, 'brick', 10, 5), '再堵最后一面会被拒绝（等于彻底封死）');
chk(!!D(g).findPathFrom(0, 4) && st(g).routeCells > 0, '被拒后仍然有通路');
chk(!build(g, 'bolt', 0, 4) && !build(g, 'bolt', 10, 4), '入口格与城门格不能建造');
chk(st(g).towers.length === 0, '两次违规建造都没留下建筑');
g = boot();
D(g).spawn('grunt');
for (let k = 0; k < 900 && (!st(g).enemies.length || st(g).enemies[0].x < 210); k++) g.tick(16);
const here = D(g).at();                       // 用游戏自己的取格，别拿四舍五入后的坐标反推
chk(here && here.c >= 2 && here.c <= 8, '让走卒先走到场中间再测（当前格子 ' + here.c + ',' + here.r + '）');
const atC = here.c, atR = here.r;
toolTo(g, 'bolt');
chk(!D(g).place(atC, atR), '敌人正站着的这一格放不下塔');
chk(D(g).place(atC, atR === 0 ? 1 : atR - 1), '旁边空着的格子照建不误');
toolTo(g, null);

/* ==================== 二、经济与塔 ==================== */
g = boot();
chk(st(g).gold === 210 && st(g).lives === 20 && st(g).bricks === 10, '标准难度开局：金 210 / 城防 20 / 砖 10');
chk(build(g, 'bolt', 3, 2), '建一座连弩');
chk(st(g).gold === 160, '连弩 50 金（剩 ' + st(g).gold + '）');
chk(st(g).towers[0] === 'bolt@3,2 L1', '塔落在 (3,2) 且是 Lv1');
chk(build(g, 'bomb', 8, 5) && st(g).gold === 50, '再建投石 → 只剩 50 金');
chk(!build(g, 'frost', 6, 6) && st(g).gold === 50, '冰井要 80 金，买不起就建不出来（不给赊账）');
D(g).addGold(5000);
chk(build(g, 'frost', 6, 6), '补了钱就能建冰井');
chk(st(g).towers.length === 3, '场上三座塔：' + st(g).towers.join(' '));
toolTo(g, null);
D(g).place(3, 2);                                   // 点已有塔 = 选中
chk(/连弩 Lv1/.test(D(g).panelHTML()) && /升级 45/.test(D(g).panelHTML()) && /卖掉 \+30/.test(D(g).panelHTML()),
  '面板给出属性、升级价与出售价：' + D(g).panelHTML().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 46));
chk(D(g).clickPanel('up') && st(g).towers[0] === 'bolt@3,2 L2', '升级 → Lv2');
chk(D(g).clickPanel('up') && st(g).towers[0] === 'bolt@3,2 L3', '再升级 → Lv3');
chk(!D(g).clickPanel('up'), 'Lv3 封顶，面板不再给升级按钮');
const s3 = D(g).stats(3, 2);
chk(s3.dmg > 27 && s3.cd < 0.5 && s3.shots === 2, '满级连弩：伤害 ' + Math.round(s3.dmg) + '、间隔 ' + s3.cd.toFixed(2) + 's、一息双发');
const goldBefore = st(g).gold;
chk(D(g).clickPanel('sell'), '点出售能成交');
chk(st(g).towers.length === 2 && st(g).gold === goldBefore + 111,
  '卖掉满级连弩返还 60%（投入 185 → 回收 ' + (st(g).gold - goldBefore) + '）');
chk(build(g, 'brick', 2, 0) && st(g).bricks === 8, '砌一面墙耗 2 砖（剩 ' + st(g).bricks + '）');
toolTo(g, 'wipe');
D(g).place(2, 0);
chk(st(g).walls.length === 0 && st(g).bricks === 10, '拆除墙 → 砖全额回收（回到 ' + st(g).bricks + '）');

/* ==================== 三、波次编成（种子固定，可复现） ==================== */
g = boot();
const p1 = D(g).wavePlan(1);
chk(JSON.stringify(p1) === JSON.stringify(D(g).wavePlan(1)), '同一波两次生成的编成完全一致（可复现才好测）');
chk(p1.every((k) => k === 'grunt'), '第 1 波只有走卒：' + p1.join(''));
chk(D(g).wavePlan(2).includes('fast'), '第 2 波出现轻燕');
chk(D(g).wavePlan(3).includes('armor'), '第 3 波出现重甲');
chk([4, 5, 6, 7, 8].some((w) => D(g).wavePlan(w).includes('ghost')), '幽灵从第 4 波起会刷出来');
chk([5, 6, 7, 8].some((w) => D(g).wavePlan(w).includes('ram')), '撞墙兵从第 5 波起会刷出来');
chk(D(g).wavePlan(3).every((k) => k !== 'ghost' && k !== 'ram'), '前三波还不能出现幽灵与撞墙兵（先教会玩家走路障）');
chk(D(g).wavePlan(5)[D(g).wavePlan(5).length - 1] === 'boss', '第 5 波末尾压轴首领');
let grow = 0;
for (let w = 1; w <= 20; w++) grow = Math.max(grow, D(g).wavePlan(w).length);
chk(D(g).wavePlan(12).length > D(g).wavePlan(3).length, '编成随波次变长：第 3 波 ' + D(g).wavePlan(3).length + ' 只 → 第 12 波 ' + D(g).wavePlan(12).length + ' 只');
chk(st(g).phase === 'build' && st(g).queue.length === 0, '备战期不出兵（要玩家自己按「开打」）');

/* ==================== 四、战斗规则 ==================== */
g = boot();
const arm = D(g).probe('armor', 9);
const grunt = D(g).probe('grunt', 9);
chk(grunt.dealt === 9 && arm.dealt === 4, '重甲把连弩的 9 点削到 4（走卒吃满 9）：' + arm.dealt + ' / ' + grunt.dealt);
const armP = D(g).probe('armor', 20, { pierce: true });
chk(armP.dealt === 17.5, '投石破甲减半：20 点只扣 2.5 → 实伤 ' + armP.dealt);
const bossP = D(g).probe('boss', 400);
chk(!bossP.dead && bossP.hp > 0, '首领满血 509，一发 400 的投石砸不死（剩 ' + bossP.hp + '）');
const boss2 = D(g).probe('boss', 600);
chk(boss2.dead, '同样破甲规则下 600 点能带走首领');
const fastP = D(g).probe('fast', 20);
chk(fastP.dead, '同样 20 点能秒掉轻燕');

g = boot();
D(g).addGold(9000);
build(g, 'bolt', 5, 4);
g = boot();
D(g).addGold(9000);
build(g, 'frost', 5, 4);
const withFrost = (() => {
  D(g).spawn('grunt');
  for (let k = 0; k < 150; k++) g.tick(16);
  return st(g).enemies[0];
})();
g = boot();
D(g).spawn('grunt');
for (let k = 0; k < 150; k++) g.tick(16);
const plain = st(g).enemies[0];
chk(withFrost.slowT > 0, '冰井命中后带减速（slowT ' + withFrost.slowT + 's）');
chk(withFrost.x < plain.x, '同样 2.4 秒，被减速的走卒只走到 ' + withFrost.x + 'px，没减速的走到 ' + plain.x + 'px');

g = boot();
D(g).addGold(9000);
build(g, 'bomb', 5, 3);
D(g).spawn('grunt');
D(g).spawn('grunt');
for (let k = 0; k < 260 && st(g).enemies.length; k++) g.tick(16);
chk(st(g).kills >= 2 || st(g).enemies.every((e) => e.hp < 26), '投石一发溅射能同时削到挤在一起的走卒（击杀 ' + st(g).kills + '）');
g = boot();
D(g).addGold(9000);
build(g, 'bomb', 5, 4);
D(g).spawn('ghost');
const ghostHp = st(g).enemies[0].hp;
for (let k = 0; k < 500 && st(g).enemies.length; k++) g.tick(16);
chk(st(g).kills === 0, '场上只有投石时，幽灵一只都打不死（击杀 ' + st(g).kills + '）');
chk(st(g).lives < 20, '幽灵直接飞进城门：城防掉到 ' + st(g).lives + '（这就是纯堆迷宫的代价）');
chk(ghostHp > 0, '幽灵满血起始 ' + ghostHp);
g = boot();
D(g).addGold(9000);
build(g, 'bolt', 5, 4);
D(g).spawn('ghost');
for (let k = 0; k < 400 && st(g).enemies.length; k++) g.tick(16);
chk(st(g).kills >= 1, '连弩能打幽灵（击杀 ' + st(g).kills + '）');

/* 泄漏与城破 */
g = boot();
D(g).spawn('grunt');
for (let k = 0; k < 600 && st(g).phase !== 'over'; k++) g.tick(16);
chk(st(g).lives === 19, '一只走卒溜进城门：城防 20 → 19');
D(g).spawn('boss');
for (let k = 0; k < 900 && st(g).phase !== 'over'; k++) g.tick(16);
chk(st(g).lives === 15, '首领撞门一次扣 4（→ ' + st(g).lives + '）');
g = boot();
D(g).setLives(1);
D(g).spawn('grunt');
for (let k = 0; k < 900 && st(g).phase !== 'over'; k++) g.tick(16);
chk(st(g).phase === 'over' && st(g).lives === 0, '城防归零当场判负（phase ' + st(g).phase + '）');
chk(/城门失守/.test(g.byId('overlayContent').innerHTML), '结算遮罩写明城门失守');
chk(g.storage.getItem('dangguan.kills') !== null, '城破会把本局击杀并进累计');
chk(g.storage.getItem('dangguan.save') === null, '城破后清掉续档（不能接着打一局已经输的）');
chk(+g.storage.getItem('dangguan.best') === st(g).score || g.storage.getItem('dangguan.best') === null,
  '城破时也把分数入档：' + g.storage.getItem('dangguan.best'));

/* 撞墙兵 */
g = boot();
D(g).addBricks(20);
build(g, 'brick', 5, 4);
const routeWithWall = st(g).routeCells;
D(g).spawn('ram');
for (let k = 0; k < 300 && st(g).walls.length; k++) g.tick(16);
chk(st(g).walls.length === 1 && +st(g).walls[0].split(':')[1] < D(g).wallHp, '撞墙兵在砸墙（墙 HP 掉到 ' + st(g).walls[0] + '）');
for (let k = 0; k < 400 && st(g).walls.length; k++) g.tick(16);
chk(st(g).walls.length === 0 && st(g).smashes === 1, '墙被砸塌，计入「被砸墙」1 面');
chk(st(g).routeCells < routeWithWall, '墙塌了 → 路线重算回 ' + st(g).routeCells + ' 格（原来 ' + routeWithWall + '）');
for (let k = 0; k < 900 && st(g).lives === 20; k++) g.tick(16);
chk(st(g).lives < 20, '砸穿之后它照样能摸到城门（城防 ' + st(g).lives + '）');

/* ==================== 五、清波、入档、续档 ==================== */
g = boot();
D(g).addGold(600);
build(g, 'bolt', 2, 3);
build(g, 'bolt', 3, 5);
build(g, 'bolt', 8, 3);
killWave(g, 40);
chk(st(g).phase === 'build' && st(g).wave === 2, '第 1 波守住了 → 进入第 2 波的备战期');
chk(st(g).kills === 3 && st(g).score === 150, '三只走卒全灭：击杀 3、分数 3×10+120 = 150');
chk(st(g).bricks >= 13, '清波奖励 +3 砖（10 → ' + st(g).bricks + '，多出来的是走卒掉的材料）');
const replayA = st(g);
const gR = boot();
D(gR).addGold(600);
build(gR, 'bolt', 2, 3);
build(gR, 'bolt', 3, 5);
build(gR, 'bolt', 8, 3);
killWave(gR, 40);
const replayB = st(gR);
chk(replayA.kills === replayB.kills && replayA.bricks === replayB.bricks && replayA.gold === replayB.gold && replayA.score === replayB.score,
  '同样的三座塔守第 1 波：两次跑出的击杀/砖/金币/分数完全一致（掉落走本局种子，不是 Math.random）');
chk(g.storage.getItem('dangguan.wave') === '1', '清波当场入档：最高守住 1 波');
chk(g.storage.getItem('dangguan.wave.mid') === '1', '同时记进本难度键 dangguan.wave.mid');
chk(g.storage.getItem('dangguan.best') === '150', '分数纪录也当场入档（不用等城破）');
const sv = D(g).readSave();
chk(sv && sv.wave === 2 && sv.towers.length === 3, '写出续档：' + JSON.stringify(sv && { w: sv.wave, g: sv.gold, t: sv.towers.length }));
killWave(g, 90);
chk(st(g).wave === 3, '第 2 波也守住（wave ' + st(g).wave + '，城防 ' + st(g).lives + '）');
chk(g.storage.getItem('dangguan.wave') === '2', '纪录推进到 2 波');
const keep = Object.assign({}, g.storage._data);
const g2 = boot(keep);
chk(!!actBtn(g2, 'resume') && /继续第 3 波/.test(g2.byId('overlayContent').innerHTML), '带档启动会问「继续第 3 波」');
actBtn(g2, 'resume').dispatch('click');
g2.pump(0.3);
chk(st(g2).wave === 3 && st(g2).phase === 'build', '续档回到第 3 波的备战期');
chk(st(g2).towers.length === 3 && st(g2).towers.join(' ') === 'bolt@2,3 L1 bolt@3,5 L1 bolt@8,3 L1',
  '三座塔原样回来：' + st(g2).towers.join(' '));
chk(+JSON.parse(keep['dangguan.save']).gold === st(g2).gold && st(g2).kills === 7,
  '金币与击杀都和存档一致（金 ' + st(g2).gold + ' · 击杀 ' + st(g2).kills + '）');
chk(st(g2).routeCells === 11 && st(g2).phase === 'build', '续档后路线重新算好，直接进入备战');
/* 脏存档一律不认 */
for (const bad of [
  ['wave 1', JSON.stringify({ diff: 'mid', wave: 1, gold: 1, lives: 1, towers: [], walls: [] })],
  ['未知塔型', JSON.stringify({ diff: 'mid', wave: 4, gold: 1, lives: 1, towers: [['laser', 1, 1, 1]], walls: [] })],
  ['塔字段缺了', JSON.stringify({ diff: 'mid', wave: 4, gold: 1, lives: 1, towers: [['bolt', 1, 1]], walls: [] })],
  ['walls 不是数组', JSON.stringify({ diff: 'mid', wave: 4, gold: 1, lives: 1, towers: [], walls: 3 })],
  ['不是 JSON', '1234'],
]) {
  const gd = boot({ 'dangguan.save': bad[1] });
  chk(!actBtn(gd, 'resume'), '脏存档（' + bad[0] + '）不会给出「继续」入口');
}

/* ==================== 六、难度 ==================== */
const ge = boot({ 'dangguan.diff': 'easy' });
ge.pump(0.2);
actBtn(ge, 'start').dispatch('click');
ge.pump(0.2);
chk(st(ge).diff === 'easy' && st(ge).lives === 30 && st(ge).gold === 250, '新手难度：城防 30、金 250');
const gh2 = boot({ 'dangguan.diff': 'hard' });
gh2.pump(0.2);
actBtn(gh2, 'start').dispatch('click');
gh2.pump(0.2);
chk(st(gh2).lives === 15, '死守难度只有 15 城防');
chk(D(gh2).wavePlan(6).length > D(ge).wavePlan(6).length, '同一波次下死守的编成更大：' + D(gh2).wavePlan(6).length + ' vs ' + D(ge).wavePlan(6).length);
chk(Object.keys(ge.storage._data).every((k) => k.indexOf('dangguan.') === 0), '一夫当关只写 dangguan.* 键');

summary('一夫当关', fails);
