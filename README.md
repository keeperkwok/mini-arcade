# 🕹️ 网页小游戏 (Mini Arcade)

纯前端网页小游戏合集 —— 无需安装、无需服务器,双击 `index.html` 即开即玩,支持键盘与触屏。

## 目录结构

```
.
├── index.html        # 门户首页(游戏列表)
├── home.css / home.js# 首页样式与游戏注册表
├── shared/           # 共享层(只给新游戏用，老游戏保留各自副本)
│   ├── base.css      # 设计变量 + 页面骨架 + 遮罩/按钮/统计条等通用组件
│   └── sfx.js        # WebAudio 音效封装 Sfx.create()
├── tools/
│   └── selfcheck.js  # 零依赖自检：node tools/selfcheck.js
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
├── match3/           # 水果消消乐
│   ├── index.html
│   ├── style.css
│   └── game.js
├── sudoku/           # 数独
│   ├── index.html
│   ├── style.css
│   └── game.js
├── xigua/            # 合成大西瓜
│   ├── index.html
│   ├── style.css
│   └── game.js
└── luosi/            # 拧螺丝
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
- ✅ 数独 —— 回溯生成 + 唯一解校验、五档难度、铅笔笔记、冲突高亮、提示与无限撤销、断点续玩、分难度最佳用时
- ✅ 合成大西瓜 —— 手写圆形刚体物理(重力/冲量/位置修正)、11 级水果、连锁爆分、双瓜互爆、越线倒计时判负
- ✅ 拧螺丝 —— 多层板材遮挡拆解:构造式生成保证关关可解、同色三消销毁、7 格收纳槽、撤销与提示、无限关卡

## 首页进度中心

首页会自动读取各游戏写在 `localStorage` 里的纪录,不需要任何后端:

- **统计条** —— 玩过 N/12、累计最高分、纪录条数;蜘蛛纸牌已扣除 500 起步分,只有真正超过起步分才计入
- **筛选** —— 全部 / 已玩 / 没玩过 + 标签(经典、益智、射击、纸牌、消除、休闲、物理、解压、数字),带数量角标;筛选栏滚动时吸顶
- **多列卡片** —— 竖排紧凑卡片,桌面 4 列 / 平板 2-3 列 / 手机 2 列,12 个游戏三屏内看完
- **卡片纪录** —— 每张小卡片上直接显示最高分 / 最佳用时 / 已通关卡,玩过的游戏打上 ✓ 标记
- **继续未完局** —— 数独存在未通关存档时,顶部出现一枚「继续未完局 · 难度 · 已填 30/81 · 用时」快捷入口
- **清空纪录** —— 一键清掉本机所有纪录与设置(会二次确认),只删 `localStorage`,不动任何游戏文件

> 纪录跟着**来源**走:`file://` 本地打开与 GitHub Pages 域名是两个不同的 origin,数据互不相通;换浏览器、换设备或开无痕窗口同样看不到旧纪录。

## 新增一个游戏

1. 在项目根目录新建文件夹（如 `dino/`），放 `index.html` + `style.css` + `game.js`；
2. `index.html` 里先引 `../shared/base.css`，再引自己的 `style.css`（只写差异），音效用 `../shared/sfx.js`：
   ```html
   <link rel="stylesheet" href="../shared/base.css">
   <link rel="stylesheet" href="style.css">
   <script src="../shared/sfx.js"></script>
   <script src="game.js"></script>
   ```
   可用主题变量：`--accent` / `--accent-2`（渐变主色）、`--app-width`（正文宽度）、`--board-ratio`（画布宽高比）；
3. 在 `home.js` 的 `GAMES` 数组中登记一条（`id`/`emoji`/`name`/`desc`/`tags`/`href`），首页卡片即自动出现；
4. 补上 `prefix`（该游戏的 `localStorage` 键前缀）与 `records()`（卡片上展示的纪录），`totals()` 可选，否则首页统计与「已玩」识别会漏掉它；
5. 跑一遍 `node tools/selfcheck.js`，全绿再提交。

每个游戏完全自包含（不依赖外部库、不联网），保持“双击即玩”。`shared/` 只是仓库内的本地文件，同样零构建。

## 自检

```
node tools/selfcheck.js
```

85 项检查，覆盖六类：JS 语法、游戏目录结构与离线可用、`GAMES` 注册表与 `localStorage` 键是否对得上（键名打错会直接报错）、首页在 DOM 桩里能否正常渲染（空纪录 / 有纪录 / 存储被禁三种状态 + 筛选交互）、共享层可用性、以及仓库体积概览。纯静态分析 + `vm` 沙箱执行，不需要浏览器。

## 本地运行

- 直接双击根目录 `index.html`；或
- `python3 -m http.server` 后访问 `http://localhost:8000`。
- 推到 GitHub 并开启 Pages 后，访问 `https://<user>.github.io/mini-arcade/` 即可，无需构建步骤。
