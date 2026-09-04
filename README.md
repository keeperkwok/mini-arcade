# 🕹️ 网页小游戏 (Mini Arcade)

纯前端网页小游戏合集 —— 无需安装、无需服务器,双击 `index.html` 即开即玩,支持键盘与触屏。

## 目录结构

```
.
├── index.html        # 门户首页(游戏列表)
├── home.css / home.js# 首页样式与游戏注册表
├── README.md
├── snake/            # 贪吃蛇
│   ├── index.html
│   ├── style.css
│   └── game.js
├── bingfeng/         # 兵蜂大作战
│   ├── index.html
│   ├── style.css
│   └── core.js / battle.js / render.js
├── contra/           # 魂斗罗
│   ├── index.html
│   ├── style.css
│   └── game.js
├── 2048/             # 2048
│   ├── index.html
│   ├── style.css
│   └── game.js
├── tetris/           # 俄罗斯方块
│   ├── index.html
│   ├── style.css
│   └── game.js
├── minesweeper/      # 扫雷
│   ├── index.html
│   ├── style.css
│   └── game.js
├── solitaire/        # 纸牌接龙
│   ├── index.html
│   ├── style.css
│   └── game.js
├── spider/           # 蜘蛛纸牌
│   ├── index.html
│   ├── style.css
│   └── game.js
└── match3/           # 水果消消乐
    ├── index.html
    ├── style.css
    └── game.js
```

## 已上线

- ✅ 贪吃蛇 —— 平滑动画、粒子特效、限时金星、本地最高分
- ✅ 兵蜂大作战 —— TwinBee 风格纵版射击:铃铛道具变色强化、连击加分、关卡 BOSS 战、昼夜三套天空
- ✅ 魂斗罗 —— 横版突击:八方向射击、四种武器道具、要塞 BOSS 战、↑↑↓↓←→←→BA 秘籍
- ✅ 2048 —— 滑动合并、顺滑动画过渡、胜利后可继续挑战、本地最高分
- ✅ 俄罗斯方块 —— SRS 旋转与墙踢、幽灵投影、暂存方块、连击加分、触屏拖动操作
- ✅ 扫雷 —— 三档难度、首点必安全、长按/右键插旗、数字快速翻开、分难度最佳时间
- ✅ 纸牌接龙 —— Klondike 全规则:拖拽/点选双交互、双击自动上顶牌、提示、无限撤销、自动收牌、翻 1 张与翻 3 张两套计分与纪录
- ✅ 蜘蛛纸牌 —— 104 张两副牌 10 列:同花色降序连牌整体搬动、凑齐 K→A 自动收组、空列禁止发牌、单/双/四花色三档难度
- ✅ 水果消消乐 —— 关卡目标制三消:4 连十字宝石、5 连炸弹宝石、连锁引爆、粒子与连锁提示、死局自动洗牌、星级评价

## 新增一个游戏

1. 在项目根目录新建文件夹（如 `2048/`），放入该游戏的 `index.html` 等文件；
2. 在 `home.js` 的 `GAMES` 数组中添加一条记录（`href` 指向新文件夹），首页卡片即自动出现。

每个游戏完全自包含（不依赖外部库），保持“双击即玩”。

## 本地运行

- 直接双击根目录 `index.html`；或
- `python3 -m http.server` 后访问 `http://localhost:8000`。
