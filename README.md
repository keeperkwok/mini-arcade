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
│   ├── selfcheck.js  # 零依赖静态自检：node tools/selfcheck.js
│   ├── smoketest.js  # 无浏览器冒烟测试：node tools/smoketest.js（DOM/Canvas/WebAudio 桩）
│   └── tests/        # 行为回归测试：node tools/tests/run.js
│       ├── run.js        # 总入口（--all 连自检+冒烟一起跑，-v 打印每条断言）
│       ├── _assert.js    # 断言与汇总小工具
│       ├── _home.js      # 首页 home.js 的 DOM 桩
│       ├── portal.test.js
│       ├── kenken.test.js / kenken-gen.test.js
│       ├── sonar.test.js / plinko.test.js
│       ├── nonogram.test.js / zuma.test.js
│       ├── fanpai.test.js / cube.test.js / baozhiqi.test.js
│       ├── wuziqi.test.js / xiangqi.test.js / reversi.test.js / siziqi.test.js
│       └── …             # 一个游戏一个 *.test.js，新增后 run.js 自动发现
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
├── sonar/            # 声纳扫雷
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
├── kenken/           # 算独
│   ├── index.html
│   ├── style.css
│   └── game.js
├── xigua/            # 合成大西瓜
│   ├── index.html
│   ├── style.css
│   └── game.js
├── plinko/           # 幸运弹珠台
│   ├── index.html
│   ├── style.css
│   └── game.js
├── luosi/            # 拧螺丝
│   ├── index.html
│   ├── style.css
│   └── game.js
├── fanpai/           # 翻牌堆
│   ├── index.html
│   ├── style.css
│   └── game.js
├── zuma/             # 祖玛珠链
│   ├── index.html
│   ├── style.css
│   └── game.js
├── nonogram/         # 数织
│   ├── index.html
│   ├── style.css
│   └── game.js
├── cube/             # 魔方（手写 3D）
│   ├── index.html
│   ├── style.css
│   └── game.js
├── wuziqi/           # 五子棋
│   ├── index.html
│   ├── style.css
│   └── game.js
├── xiangqi/          # 中国象棋
│   ├── index.html
│   ├── style.css
│   └── game.js
├── reversi/          # 黑白棋
│   ├── index.html
│   ├── style.css
│   └── game.js
├── siziqi/           # 四子棋
│   ├── index.html
│   ├── style.css
│   └── game.js
└── baozhiqi/         # 保质期（原创玩法）
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
- ✅ 声纳扫雷 —— 反扫雷:全黑海域靠声纳波纹听位(亮 1.5 秒即散)，确认才能永久点亮，连锁清海翻倍、标记全部水雷另算通关
- ✅ 蜘蛛纸牌 —— 104 张两副牌 10 列:同花色降序连牌整体搬动、凑齐 K→A 自动收组、空列禁止发牌、单/双/四花色三档难度
- ✅ 水果消消乐 —— 关卡目标制三消:4 连十字宝石、5 连炸弹宝石、连锁引爆、粒子与连锁提示、死局自动洗牌、星级评价
- ✅ 数独 —— 回溯生成 + 唯一解校验、五档难度、铅笔笔记、冲突高亮、提示与无限撤销、断点续玩、分难度最佳用时
- ✅ 算独 —— KenKen 四则运算填数:随机笼盘 + 唯一解校验、四/五/六宫四档难度、单格笼即已知数(入门档必给)、笔记与断点续玩
- ✅ 合成大西瓜 —— 手写圆形刚体物理(重力/冲量/位置修正)、11 级水果、连锁爆分、双瓜互爆、越线倒计时判负
- ✅ 幸运弹珠台 —— Plinko + Roguelike:拖拽瞄准、五种功能钉攒分、边缘槽翻倍，每轮达标三选一强化滚雪球，看能撑到第几轮
- ✅ 拧螺丝 —— 多层板材遮挡拆解:构造式生成保证关关可解、同色三消销毁、7 格收纳槽、撤销与提示、无限关卡
- ✅ 翻牌堆 —— 牌墙半格错位一张压一张:被压住的看不见图案也点不动、掀开才自动翻牌,侧边牌墙 + 7 格槽位同图三消、暂存台、三种道具,连消加成;发牌按"合法取牌顺序"构造，保证照着拿必定通关
- ✅ 祖玛珠链 —— 珠子沿轨道往洞口爬:转炮台瞄准吐珠、同色 3 连即爆、4/5 连与连锁爆破、把链条顶回去，黑珠是炸弹、一次消 6 颗冻结轨道,关卡越来越快
- ✅ 数织 —— 行首列首的数字就是那一行连续涂黑的长度:5/10/15/20 四档、生成时优先挑纯逻辑能推到底的图案、铅笔叉标记、错涂当场提醒、3 次提示与无限撤销、断点续玩、分档最佳用时
- ✅ 魔方 —— 不引任何 3D 库:贴纸逐块投影 + 背面剔除 + 远近排序 + Lambert 光照,二/三/四阶,空白处拖转视角、按住贴纸拖转层(按真实屏幕速度判定，斜视角也不拧反),公式键盘、2D 展开图、撤销与分阶最佳用时
- ✅ 五子棋 —— 15×15 木盘 + 棋形表评估:三档 AI(新手会放水 / 棋友攻防合一 / 高手多算两步)、双人对战、点坐标落子、悔棋、提示、认输,获胜五连金色高亮,断点续玩
- ✅ 中国象棋 —— 完整规则引擎:蹩马腿、塞象眼、炮隔山打、兵过河横走、士将限九宫、白脸将不能照面,每步都校验应将,绝杀/困毙判负、120 半着无吃子判和;中文记谱(炮二平五)、落子滑动、三档 AI(negamax + 吃子静态搜索)、可换边执黑
- ✅ 黑白棋 —— 8×8 夹子翻色:位置权重 + 机动性 + 残局子数插值评估,negamax 带弃权分支,三档最深 7 层;无处可走自动弃权并提示,见分比子数,断点续玩
- ✅ 保质期 —— 原创机制:整仓货和你自己都在倒计时,每动一次全场 -1 鲜度;🍎 烂了变成永久路障、🪵 烂了塌成洞、🥬 烂开反而多一条路,🫗 还能把自己 1 点鲜度倒给相邻一格让它"时间停下"。8 关手写地图,每关都由测试里的独立求解器证明有解
- ✅ 四子棋 —— 7×6 重力落子:横竖斜先连四子者胜,AI 先做「我能赢 / 他要赢 / 别送赢点」三步战术再跑 alpha-beta;落子带下坠回弹动画、列悬停预览、连线打光,支持数字键与 ←→ 落子

## 首页进度中心

首页会自动读取各游戏写在 `localStorage` 里的纪录,不需要任何后端:

- **统计条** —— 玩过 N/24、累计最高分、纪录条数;蜘蛛纸牌已扣除 500 起步分,只有真正超过起步分才计入
- **筛选** —— 全部 / 已玩 / 没玩过 + 标签(经典、益智、射击、纸牌、消除、休闲、物理、解压、数字、记忆、构筑、图形、空间、对战、棋类、策略),带数量角标;筛选栏滚动时吸顶
- **多列卡片** —— 竖排紧凑卡片,桌面 4 列 / 平板 2-3 列 / 手机 2 列,24 个游戏四五屏看完
- **卡片纪录** —— 每张小卡片上直接显示最高分 / 最佳用时 / 已通关卡 / 最远轮次,对战游戏显示胜场与最长连胜,玩过的游戏打上 ✓ 标记
- **继续未完局** —— 数独 / 算独 / 数织 / 魔方 / 四款棋类留有未完局存档时,顶部出现一枚「继续未完局 · 已下 12 手 · 轮到白」之类的快捷入口(按注册表顺序取第一枚,数独优先)
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
5. 跑一遍 `node tools/selfcheck.js`（结构/键名/首页渲染）与 `node tools/smoketest.js`（能不能真跑起来），全绿再提交；
6. 想留住玩法细节，就在 `tools/tests/` 加一个 `<游戏目录>.test.js`：`require('../smoketest.js')` 拿到 `loadGame`，用桩模拟点格子/发射/落子，再用 `_assert.js` 的 `ok()` 断言，`report('名字')` 收尾 —— `run.js` 会自动发现它。

每个游戏完全自包含（不依赖外部库、不联网），保持“双击即玩”。`shared/` 只是仓库内的本地文件，同样零构建。

## 质量检查（全部零依赖、不需要浏览器）

```
node tools/tests/run.js --all   # 一次跑完下面三层
```

### 1. 静态自检 `node tools/selfcheck.js`

120 余项检查，覆盖六类：JS 语法、游戏目录结构与离线可用、`GAMES` 注册表与 `localStorage` 键是否对得上（键名打错会直接报错）、首页在 DOM 桩里能否正常渲染（空纪录 / 静音 / 有纪录 / 存储被禁四种状态 + 筛选交互）、共享层可用性、以及仓库体积概览。纯静态分析 + `vm` 沙箱执行。

### 2. 冒烟测试 `node tools/smoketest.js`

自带 DOM / Canvas / WebAudio 桩，把每个游戏目录的 `game.js` 真的加载起来、启动主循环、模拟点击与按键，检查有没有运行期异常，并顺带打印每款的绘制与发声次数，用来确认「画面真的在动」。新增游戏只要走 `shared/` 通用结构，通常无需额外配置即可被覆盖到。也可以当库用：`const { loadGame } = require('./tools/smoketest.js')`。

### 3. 行为回归 `node tools/tests/run.js`

冒烟只保证「不崩」，`tools/tests/` 保证「玩法是对的」——目前 15 个文件 1000 余条断言（`run.js` 每次会报准确数字）：

- `portal.test.js` —— 首页卡片 / 统计条 / 筛选 / 清空纪录 / 存储被禁降级 / 续玩药丸文案，外加 `home.css` 类名覆盖
- `kenken.test.js` + `kenken-gen.test.js` —— 从粗线边界反推笼子、独立求解器验证唯一解、判胜、错误计数、撤销、笔记、断点续玩、换难度
- `sonar.test.js` —— 声纳波纹会消散、确认永久点亮、踩雷判负、连锁翻倍、插旗通关与纪录写入
- `plinko.test.js` —— 发射与落槽、撞钉攒分 × 槽位倍率、达标三选一、未达标结束
- `nonogram.test.js` —— 出题器压测（每档随机出题都必须「唯一解 + 纯逻辑可推」）、涂错判错、铅笔叉、提示与自动叉、通关、断点续玩与换难度
- `zuma.test.js` —— 珠链沿轨道前进、爬进洞口判负、吐珠插入、三连爆破、缺口两侧连锁、炸弹清一片、打光过关奖励与最高分写入
- `fanpai.test.js` —— 遮挡判定与掀开自动翻牌、牌墙取牌、槽位三消与塞满判负、撤回/洗牌/移出三道具、连消倍率，以及「照发牌顺序走必定通关」
- `cube.test.js` —— 12 种记法各转四次回原状、整数旋转与动画 Rodrigues 一致、六个面都是「看着这个面顺时针」、真实 pointer 拖动的结果与置换一致、4.5 万次全视角手势不拧反、轮廓与光照合理、脏档拒绝与分阶最佳用时
- `savefile.test.js` —— 存档契约：把魔方/数织**真写出来**的 `localStorage` 灌进首页，`resume()` 必须读得懂（字段一边改动就会在这里暴露）
- `wuziqi.test.js` —— 独立引擎逐手对照：活三/冲四/成五判定、AI 必堵必赢、双人对战、悔棋、提示、认输二次确认、战绩与断点续玩
- `xiangqi.test.js` —— 规则探针：蹩马腿、塞象眼、炮翻山、过河兵、士将限宫、白脸将、应将过滤、绝杀/困毙判负；中文记谱、换边、悔棋、续玩
- `reversi.test.js` —— 自带独立黑白棋引擎，整盘 60 手逐手对照子数与弃权判定、AI 每一手合法、悔棋退两轮、认输二次确认、断点续玩
- `baozhiqi.test.js` —— 自带一份独立规则实现 + 记忆化 DFS 求解器:先算出 8 个关卡各自的最优解,再把解法灌进真实 `game.js` 端到端回放,断言「关关有解」且「真机得分 = 求解器分 + 撤销奖励」;另覆盖回合账(走一步全场总鲜度恰好 -1-N)、灌注守恒与不超上限、三种翻面、吃货截断溢出、过期/塌桥/死局三种判负、撤销回溯、存档键前缀
- `siziqi.test.js` —— 竖 / 横 / 斜三种连线都在正确的第几手判胜（顺带验证重力）、整盘逐手对照、AI 必堵三连与有眼必吃、满列不可落、键盘与数字键落子、续玩

```
node tools/tests/run.js          # 跑全部
node tools/tests/run.js sonar    # 只跑匹配的
node tools/tests/run.js --all -v # 连自检冒烟一起跑，并打印每条断言
```

这三层都是在 CI 之外随手能跑的：仓库不装任何依赖，`node` 版本 16+ 即可。

## 本地运行

- 直接双击根目录 `index.html`；或
- `python3 -m http.server` 后访问 `http://localhost:8000`。
- 推到 GitHub 并开启 Pages 后，访问 `https://<user>.github.io/mini-arcade/` 即可，无需构建步骤。
