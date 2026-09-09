#!/usr/bin/env node
/* 零依赖自检：node tools/selfcheck.js
   覆盖 语法 / 游戏目录结构 / 首页注册表 / 存储键 / 首页渲染 / 共享层 六类检查。
   加新游戏或改首页后跑一遍，全绿再提交。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['shared', 'tools', 'node_modules', '.git', '.github', '.codex', '.agents']);
const IGNORE_ASSET = /^(https?:|data:|mailto:|\/\/)/;

let failures = 0;
let checks = 0;
const groups = [];
let current = null;

function group(name) { current = { name, lines: [] }; groups.push(current); }
function ok(msg) { checks++; current.lines.push('  ✓ ' + msg); }
function fail(msg) { checks++; failures++; current.lines.push('  ✗ ' + msg); current.failed = true; }
function expect(cond, passMsg, failMsg) { cond ? ok(passMsg) : fail(failMsg); return cond; }

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const rel = (p) => path.relative(ROOT, p);
const gameDirs = () => fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
  .map((e) => e.name)
  .filter((d) => exists(d + '/index.html'))
  .sort();

/* ==================== 1. 语法 ==================== */
function checkSyntax() {
  group('语法 · 所有 .js 可编译');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(path.join(dir, e.name)); }
      else if (e.name.endsWith('.js')) files.push(path.join(dir, e.name));
    }
  })(ROOT);
  let bad = 0;
  for (const f of files) {
    try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: rel(f) }); }
    catch (e) { fail(rel(f) + ' → ' + e.message); bad++; }
  }
  if (!bad) ok(files.length + ' 个 JS 文件语法通过');
}

/* ==================== 2. 游戏目录结构 ==================== */
function checkStructure() {
  group('结构 · 每个游戏自包含且可离线打开');
  const dirs = gameDirs();
  let remote = 0; let missing = 0;
  for (const d of dirs) {
    const html = read(d + '/index.html');
    const htmlDir = path.join(ROOT, d);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const a of assets) {
      if (/^data:|^#|^mailto:/i.test(a)) continue; // 内联 favicon 等，无需联网
      if (/^https?:\/\/|^\/\//i.test(a)) { fail(d + '/index.html 引用了远程资源 ' + a.slice(0, 60)); remote++; continue; }
      const target = path.resolve(htmlDir, a.split('#')[0].split('?')[0]);
      if (!fs.existsSync(target)) { fail(d + '/index.html 引用的本地文件不存在: ' + a); missing++; }
    }
    const jsCount = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.js')).length;
    const cssCount = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.css')).length;
    if (!jsCount) { fail(d + ' 没有 .js 文件'); missing++; }
    if (!cssCount) { fail(d + ' 没有 .css 文件'); missing++; }
    expect(/<meta[^>]+viewport/.test(html), d + ' 有 viewport', d + ' 缺少 viewport(移动端会缩放错乱)');
    expect(/<title>[^<]+<\/title>/.test(html), d + ' 有 <title>', d + ' 缺少 <title>');
    expect(/<html lang=/.test(html), d + ' 声明 lang', d + ' 缺少 lang 属性');
  }
  if (!remote) ok('无远程依赖 · 全部可离线运行');
  if (!missing) ok(dirs.length + ' 个游戏目录结构完整');
  expect(exists('index.html') && exists('home.css') && exists('home.js'), '首页三件套齐全', '首页文件缺失');
}

/* ==================== 3. 首页注册表 + 存储键 ==================== */
function evalGames() {
  const src = read('home.js');
  const start = src.indexOf('const GAMES = [');
  if (start < 0) throw new Error('home.js 里找不到 "const GAMES = ["');
  let i = src.indexOf('[', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) { i++; break; } }
  }
  const literal = src.slice(src.indexOf('[', start), i);
  // records()/totals() 都是闭包，求值数组字面量时不会执行，安全
  return vm.runInNewContext('(' + literal + ')', { console });
}

function storageKeys(dir) {
  const keys = new Set();
  const dirPath = path.join(ROOT, dir);
  for (const f of fs.readdirSync(dirPath).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dirPath, f), 'utf8');
    for (const m of src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*'([^']*)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*`([^'$]*)\$\{/g)) keys.add(m[1]);
    // 形如 function bestKey() { return 'klondike.best.' + drawCount; }
    for (const m of src.matchAll(/return\s+'([a-zA-Z0-9_.-]*\.)'\s*\+/g)) keys.add(m[1]);
  }
  return [...keys];
}

function checkRegistry() {
  group('注册表 · 首页 GAMES 与实际目录/存储键一致');
  let games;
  try { games = evalGames(); }
  catch (e) { fail('无法解析 GAMES：' + e.message); return []; }

  const dirs = gameDirs();
  const hrefIds = games.map((g) => g.href.split('/')[0]);
  const notRegistered = dirs.filter((d) => !hrefIds.includes(d));
  const ghostEntries = hrefIds.filter((h) => !dirs.includes(h));
  expect(notRegistered.length === 0, '每个游戏目录都已注册', '未注册到首页: ' + notRegistered.join(', '));
  expect(ghostEntries.length === 0, '首页没有指向空目录的条目', '首页条目指向不存在的目录: ' + ghostEntries.join(', '));
  expect(games.length === dirs.length, '首页条目数 = 游戏目录数 = ' + games.length, '条目数 ' + games.length + ' ≠ 目录数 ' + dirs.length);

  for (const g of games) {
    if (!g.id || !g.name || !g.emoji || !Array.isArray(g.tags) || !g.tags.length) {
      fail((g.id || '?') + ' 注册信息不完整(需要 id/name/emoji/tags/href)');
    }
    if (!exists(g.href)) fail(g.id + ' href 不存在: ' + g.href);
  }
  const prefixes = games.map((g) => g.prefix).filter(Boolean);
  const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
  expect(dup.length === 0, prefixes.length + ' 个存储前缀互不冲突', '前缀重复: ' + dup.join(', '));

  let keyProblems = 0; let totalKeys = 0;
  for (const g of games) {
    const dir = g.href.split('/')[0];
    const keys = storageKeys(dir);
    totalKeys += keys.length;
    if (!keys.length) { fail(dir + ' 未发现任何 localStorage 键'); keyProblems++; continue; }
    const stray = g.prefix ? keys.filter((k) => k.indexOf(g.prefix) !== 0) : keys;
    if (stray.length) { fail(dir + ' 有键不在登记前缀 ' + (g.prefix || '(未登记)') + ' 下: ' + stray.slice(0, 3).join(', ')); keyProblems++; }
    if (!g.prefix) { fail(dir + ' 未登记 prefix，首页统计会漏掉它'); keyProblems++; }
  }
  if (!keyProblems) ok(totalKeys + ' 个 localStorage 键全部归属正确的游戏前缀');

  // 动态键（以 . 结尾）补一个常见后缀，供渲染检查使用
  const suffixes = ['1', '2', '3', '4', 'easy', 'medium', 'hard', 'expert', 'master', 'beginner', 'intermediate'];
  const seed = {};
  for (const g of games) {
    if (!g.prefix) continue;
    for (const k of storageKeys(g.href.split('/')[0])) {
      if (k.endsWith('.')) { for (const s of suffixes) seed[k + s] = '1234'; }
      else if (k.slice(-7) !== '.muted') seed[k] = '1234';
    }
  }
  return [{ games, seed }];
}

/* ==================== 4. 首页渲染（DOM 桩） ==================== */
function makeDom(html) {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const registry = new Map();
  class El {
    constructor(id) { this.id = id; this._html = ''; this.hidden = false; this.dataset = {}; this._l = {}; }
    set innerHTML(v) {
      this._html = v;
      for (const m of v.matchAll(/id="([^"]+)"/g)) if (!registry.has(m[1])) registry.set(m[1], new El(m[1]));
    }
    get innerHTML() { return this._html; }
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
    click(ev) { for (const fn of [...(this._l.click || [])]) fn(ev); }
  }
  for (const id of ids) { const el = new El(id); registry.set(id, el); }
  return { El, ids, registry, document: { getElementById: (id) => registry.get(id) || null } };
}

function makeStorage(seed) {
  const data = Object.assign({}, seed);
  return {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

function runHome(dom, storage, protocol) {
  const ctx = vm.createContext({
    document: dom.document,
    localStorage: storage,
    location: { protocol: protocol || 'file:' },
    confirm: () => true,
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(read('home.js'), ctx, { filename: 'home.js' });
  return ctx;
}

function checkPortal(extra) {
  group('首页 · 进度中心渲染');
  const html = read('index.html');
  const css = read('home.css');
  const dom = makeDom(html);
  for (const need of ['games', 'hud', 'filters', 'empty']) {
    expect(dom.ids.has(need), 'index.html 有 #' + need, 'index.html 缺少 #' + need + '，home.js 会取到 null');
  }
  const count = (s) => (s.match(/href="/g) || []).length;

  // 空存储
  const games = extra && extra[0] ? extra[0].games : [];
  let ctx;
  try { ctx = runHome(dom, makeStorage({})); }
  catch (e) { fail('空存储时 home.js 抛异常: ' + e.message); return; }
  const grid = dom.registry.get('games');
  expect(count(grid.innerHTML) === games.length, '空存储渲染 ' + games.length + ' 张卡片', '空存储卡片数 ' + count(grid.innerHTML) + ' ≠ ' + games.length);
  expect(!/class="tick"/.test(grid.innerHTML), '空存储时没有已玩标记', '空存储却出现了已玩标记');
  expect(/还没玩过/.test(grid.innerHTML), '空存储显示未玩占位文案', '缺少未玩占位文案');

  // 有纪录
  const dom2 = makeDom(html);
  try { ctx = runHome(dom2, makeStorage((extra && extra[0] ? extra[0].seed : {}))); }
  catch (e) { fail('有纪录时 home.js 抛异常: ' + e.message); return; }
  const grid2 = dom2.registry.get('games');
  const hud2 = dom2.registry.get('hud');
  expect(/🏆|⏱|🚩/.test(grid2.innerHTML), '纪录标签正常显示', '有纪录却没有任何纪录标签');
  expect(/<b>0<small>\/12<\/small>|<b>\d+<small>\/\d+<\/small>/.test(hud2.innerHTML), '统计条渲染正常', '统计条缺失');
  // 逐张卡片核对：游戏名在位，且声明了 records() 的游戏在键存在时必须真的显示出一条纪录
  const blocks = grid2.innerHTML.split(/(?=<a class="card)/);
  const missingName = games.filter((g) => !blocks.some((b) => b.indexOf('<h3>' + g.name) >= 0));
  expect(missingName.length === 0, '每张卡片都带游戏名', '卡片缺少: ' + missingName.map((g) => g.name).join(', '));
  const silent = games.filter((g) => g.records && !/rec-item (gold|cyan|amber)/.test(
    blocks.find((b) => b.indexOf('<h3>' + g.name) >= 0) || ''));
  expect(silent.length === 0, silent.length ? '' : '所有纪录键都能被首页读出（' + games.filter((g) => g.records).length + ' 个游戏）',
    '这些游戏的纪录键没被首页读到，检查 records() 里的键名拼写: ' + silent.map((g) => g.name).join(', '));

  // 筛选交互
  const filters = dom2.registry.get('filters');
  const chips = [...filters.innerHTML.matchAll(/data-f="([^"]+)" aria-pressed="(true|false)"/g)].map((m) => m[1]);
  expect(chips.length >= 4 && new Set(chips).size === chips.length, chips.length + ' 个筛选项且无重复', '筛选项异常');
  expect(/aria-pressed="true"/.test(filters.innerHTML), '默认选中一个筛选项', '没有默认选中项');
  const clickChip = (f) => filters.click({ target: { closest: () => ({ dataset: { f } }) } });
  let emptyOk = true;
  for (const f of chips) {
    clickChip(f);
    const n = count(dom2.registry.get('games').innerHTML);
    const shown = dom2.registry.get('empty').hidden === false;
    if (n === 0 && !shown) { fail('筛选「' + f + '」结果为空却没有显示空提示'); emptyOk = false; }
    if (n > 0 && shown) { fail('筛选「' + f + '」有 ' + n + ' 张卡片却仍显示空提示'); emptyOk = false; }
  }
  if (emptyOk) ok('每个筛选项的卡片数与空提示状态一致');
  clickChip('all');
  expect(count(dom2.registry.get('games').innerHTML) === games.length, '筛选切换后能回到全部', '筛选后无法还原');

  // 存储被禁用
  const dom3 = makeDom(html);
  const boom = new Proxy({}, { get() { throw new Error('SecurityError'); } });
  try {
    vm.runInContext(read('home.js'), vm.createContext({
      document: dom3.document, localStorage: boom, location: { protocol: 'https:' }, confirm: () => true, console,
    }), { filename: 'home.js' });
    expect(count(dom3.registry.get('games').innerHTML) === games.length, '存储被禁用(无痕模式)时仍能渲染首页', '存储异常时首页白屏');
  } catch (e) { fail('存储被禁用时 home.js 抛异常: ' + e.message); }

  // 类名覆盖
  const used = new Set();
  for (const blob of [grid2.innerHTML, hud2.innerHTML, filters.innerHTML]) {
    for (const m of blob.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
  }
  const missingCls = [...used].filter((c) => !new RegExp('\\.' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(css));
  expect(missingCls.length === 0, 'home.css 覆盖全部 ' + used.size + ' 个类名', 'home.css 缺少类: ' + missingCls.join(', '));

  // CSS 变量必须已定义或带兜底值，否则颜色会静默失效
  for (const sheet of ['home.css', 'shared/base.css']) {
    const text = read(sheet);
    const defined = new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const bad = [...text.matchAll(/var\((--[a-z0-9-]+)([^)]*)\)/g)]
      .filter((m) => !defined.has(m[1]) && !m[2].trim())
      .map((m) => m[1]);
    expect(bad.length === 0, sheet + ' 的 CSS 变量全部有定义', sheet + ' 用了未定义且无兜底的变量: ' + [...new Set(bad)].join(', '));
  }
}

/* ==================== 5. 共享层 ==================== */
function checkShared() {
  group('共享层 · shared/base.css + shared/sfx.js');
  expect(exists('shared/base.css'), 'shared/base.css 存在', 'shared/base.css 缺失');
  expect(exists('shared/sfx.js'), 'shared/sfx.js 存在', 'shared/sfx.js 缺失');
  const css = read('shared/base.css');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  expect(open === close, 'base.css 括号配对 (' + open + ')', 'base.css 括号不配对: ' + open + ' vs ' + close);
  for (const cls of ['app', 'top', 'logo', 'icon-btn', 'chip', 'diff', 'board-wrap', 'tools', 'tool', 'overlay', 'primary', 'ghost', 'tips']) {
    expect(new RegExp('\\.' + cls + '(?![\\w-])').test(css), 'base.css 含 .' + cls, 'base.css 缺少 .' + cls);
  }

  // 在假 AudioContext 下跑一遍 sfx.js
  const nodes = [];
  class Param { constructor() { this.calls = []; } }
  Param.prototype.setValueAtTime = function (v, t) { this.calls.push(['set', v, t]); };
  Param.prototype.exponentialRampToValueAtTime = function (v, t) { this.calls.push(['ramp', v, t]); };
  const fakeCtx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: { name: 'dest' },
    resume() {},
    createOscillator() { const o = { type: '', frequency: new Param(), connect() { return this._g = null; }, start() {}, stop() {} };
      o.connect = (g) => { nodes.push(g); return { connect() {} }; }; nodes.push(o); return o; },
    createGain() { return { gain: new Param(), connect: () => ({ connect() {} }) }; },
    createBuffer() { return { getChannelData: () => new Float32Array(100) }; },
    createBufferSource() { return { buffer: null, connect: () => ({ connect() {} }), start() {} }; },
  };
  const store = makeStorage({ 'demo.muted': '1' });
  const dom = { window: {}, AudioContext: function () { return fakeCtx; } };
  const win = { AudioContext: dom.AudioContext };
  const ctx = vm.createContext({
    window: win, AudioContext: dom.AudioContext,
    localStorage: { getItem: (k) => store.getItem(k), setItem: (k, v) => store.setItem(k, v) },
    console,
  });
  ctx.window = ctx;
  vm.runInContext(read('shared/sfx.js'), ctx, { filename: 'shared/sfx.js' });
  try {
    const sfx = ctx.Sfx.create({ storageKey: 'demo.muted' });
    expect(sfx.isMuted() === true, 'sfx 从 localStorage 恢复静音状态', 'sfx 未恢复静音状态');
    sfx.toggle();
    expect(sfx.isMuted() === false && store.getItem('demo.muted') === '0', 'sfx.toggle() 会持久化', 'toggle 未持久化');
    sfx.tone(440, 0.1, 'square', 0.2, 0, 880);
    sfx.noise(0.1);
    sfx.melody([[523, 0.1], [659, 0.1]]);
    expect(nodes.length >= 5, 'tone/noise/melody 共产生 ' + nodes.length + ' 个音频节点', '音频节点数量异常: ' + nodes.length);
    sfx.setMuted(true);
    const before = nodes.length;
    sfx.tone(100, 0.1);
    expect(nodes.length === before, '静音后不再发声', '静音状态下仍在发声');
  } catch (e) { fail('sfx.js 运行异常: ' + e.message); }

  const users = gameDirs().filter((d) => /shared\/(base\.css|sfx\.js)/.test(read(d + '/index.html')));
  ok(users.length ? '已接入共享层的游戏: ' + users.join(', ') : '目前 0 个游戏接入共享层(老游戏保留副本，新游戏使用)');
}

/* ==================== 6. 体积概览（不判失败） ==================== */
function reportSizes() {
  group('概览');
  let total = 0;
  const rows = gameDirs().map((d) => {
    let size = 0;
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else size += fs.statSync(p).size;
      }
    })(path.join(ROOT, d));
    total += size;
    return d + ' ' + (size / 1024).toFixed(1) + ' KB';
  });
  current.lines.push('  · 合计 ' + (total / 1024).toFixed(1) + ' KB / ' + rows.length + ' 个游戏（Pages 限额 1 GB，余量充足）');
  current.lines.push('  · ' + rows.join(' · '));
}

/* ==================== main ==================== */
checkSyntax();
checkStructure();
const extra = checkRegistry();
checkPortal(extra);
checkShared();
reportSizes();

for (const g of groups) {
  console.log('\n' + (g.failed ? '✗ ' : '✓ ') + g.name);
  console.log(g.lines.join('\n'));
}
console.log('\n' + (failures ? '✗ ' + failures + ' / ' + checks + ' 项检查失败' : '✓ ' + checks + ' 项检查全部通过') + '\n');
process.exit(failures ? 1 : 0);
