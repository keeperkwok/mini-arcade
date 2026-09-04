(() => {
'use strict';

// 新增游戏:1) 在本目录新建文件夹(如 2048/)放入 index.html 等文件
//          2) 在下面的 GAMES 数组中添加一条记录即可
const GAMES = [
  {
    id: 'snake',
    emoji: '🐍',
    name: '贪吃蛇',
    desc: '经典街机复刻,平滑动画、粒子特效与限时金星挑战。',
    tags: ['经典', '反应'],
    href: 'snake/index.html',
  },
  {
    id: 'bingfeng',
    emoji: '🐝',
    name: '兵蜂大作战',
    desc: 'TwinBee 风格云端射击:打云掉铃铛、变色强化、连击加分、BOSS 大战。',
    tags: ['经典', '射击'],
    href: 'bingfeng/index.html',
  },
  {
    id: 'contra',
    emoji: '🪖',
    name: '魂斗罗',
    desc: '经典横版突击:八方向射击、机枪/散射/激光强化、摧毁要塞 BOSS。',
    tags: ['经典', '射击'],
    href: 'contra/index.html',
  },
  {
    id: '2048',
    emoji: '🔢',
    name: '2048',
    desc: '滑动合并数字、动画顺滑过渡,合成 2048 还能继续冲击更高分。',
    tags: ['益智'],
    href: '2048/index.html',
  },
  {
    id: 'tetris',
    emoji: '🧱',
    name: '俄罗斯方块',
    desc: 'SRS 旋转、幽灵投影、暂存方块与连击加分,永恒的街机传奇。',
    tags: ['经典', '益智'],
    href: 'tetris/index.html',
  },
  {
    id: 'minesweeper',
    emoji: '💣',
    name: '扫雷',
    desc: '三档难度、首点必安全、长按插旗:步步惊心的逻辑博弈。',
    tags: ['益智'],
    href: 'minesweeper/index.html',
  },
  {
    id: 'solitaire',
    emoji: '🃏',
    name: '纸牌接龙',
    desc: '经典 Klondike:拖拽或点选移动、双击上顶牌、提示与无限撤销,翻 1 张/翻 3 张两种难度。',
    tags: ['经典', '纸牌'],
    href: 'solitaire/index.html',
  },
  {
    id: 'spider',
    emoji: '🕷️',
    name: '蜘蛛纸牌',
    desc: '两副牌 104 张、10 列大场面:凑齐 8 组同花色 K→A 即通关,单/双/四花色三档难度。',
    tags: ['经典', '纸牌'],
    href: 'spider/index.html',
  },
  {
    id: 'match3',
    emoji: '🍉',
    name: '水果消消乐',
    desc: '关卡目标制三消:4 连出十字宝石、5 连出炸弹,连锁引爆、死局自动洗牌。',
    tags: ['益智', '消除'],
    href: 'match3/index.html',
  },
  {
    id: 'sudoku',
    emoji: '🧮',
    name: '数独',
    desc: '五档难度、题题唯一解:铅笔笔记、提示、无限撤销,还能关掉页面接着下。',
    tags: ['益智', '数字'],
    href: 'sudoku/index.html',
  },
  {
    id: 'xigua',
    emoji: '🍈',
    name: '合成大西瓜',
    desc: '手写圆形物理:同果相碰合成更大一颗,连锁爆分,堆过危险线就输。',
    tags: ['休闲', '物理'],
    href: 'xigua/index.html',
  },
  {
    id: 'luosi',
    emoji: '🔩',
    name: '拧螺丝',
    desc: '多层板材拆解:被上层压住的螺丝拧不动,同色凑满 3 颗销毁,7 格塞满即败。',
    tags: ['益智', '解压'],
    href: 'luosi/index.html',
  },
];

const grid = document.getElementById('games');

grid.innerHTML = GAMES.map((g) => {
  const tags = g.tags.map((t) => '<span>' + t + '</span>').join('');
  if (g.soon) {
    return (
      '<div class="card soon" aria-disabled="true">' +
      '<span class="badge">即将上线</span>' +
      '<div class="card-emoji">' + g.emoji + '</div>' +
      '<div class="card-body"><h3>' + g.name + '</h3><p>' + g.desc + '</p>' +
      '<div class="tags">' + tags + '</div></div>' +
      '</div>'
    );
  }
  return (
    '<a class="card" href="' + g.href + '">' +
    '<div class="card-emoji">' + g.emoji + '</div>' +
    '<div class="card-body"><h3>' + g.name + '</h3><p>' + g.desc + '</p>' +
    '<div class="tags">' + tags + '</div></div>' +
    '<div class="card-cta">▶</div>' +
    '</a>'
  );
}).join('');

})();
