#!/usr/bin/env node
/* 无浏览器冒烟测试：node tools/smoketest.js
   用 DOM/Canvas/WebAudio 桩启动每一个游戏，跑若干帧并模拟点击，确保能开局、不抛异常。
   也可作为库使用：const { loadGame } = require('./tools/smoketest.js') */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['shared', 'tools', 'node_modules', '.git', '.github', '.codex', '.agents']);

/* ==================== DOM 桩 ==================== */
function makeClassList(el) {
  return {
    add: (...c) => c.forEach((x) => x && !el._cls.includes(x) && el._cls.push(x)),
    remove: (...c) => { el._cls = el._cls.filter((x) => !c.includes(x)); },
    toggle: (c, force) => {
      const has = el._cls.includes(c);
      const want = force == null ? !has : !!force;
      if (want) { if (!has) el._cls.push(c); } else { el._cls = el._cls.filter((x) => x !== c); }
      return want;
    },
    contains: (c) => el._cls.includes(c),
  };
}

function parseHTML(parent, html) {
  const doc = parent.ownerDocument || _doc;
  parent.children.length = 0;
  const stack = [parent];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text != null) {
      if (text.trim()) stack[stack.length - 1]._text += text;
      continue;
    }
    if (close) { if (stack.length > 1) stack.pop(); continue; }
    const el = new Node(tag, doc);
    const attrRe = /([\w-]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(attrs))) {
      const [, k, v] = a;
      if (k === 'id') el.id = v;
      else if (k === 'class') el._cls = v.split(/\s+/).filter(Boolean);
      else if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      else el.attrs[k] = v;
    }
    el._html = '';
    stack[stack.length - 1].children.push(el);
    if (selfClose) { /* 自闭合不入栈 */ }
    else if (/^(br|img|input|meta|link|source|area|hr)$/i.test(tag)) { /* 空元素 */ }
    else stack.push(el);
  }
}

let _doc = null;
function docOf(node) { return _doc; }

class Node {
  constructor(tag, doc) {
    _doc = _doc || doc;
    this.tagName = String(tag || 'div').toUpperCase();
    this.ownerDocument = doc || _doc;
    this.children = [];
    this._cls = [];
    this.dataset = {};
    this.attrs = {};
    this._text = '';
    this._html = '';
    this.hidden = false;
    this.disabled = false;
    this._l = {};
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    this.classList = makeClassList(this);
    this.parentNode = null;
    this._w = 460; this._h = 460;
  }
  get className() { return this._cls.join(' '); }
  set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children.length = 0; }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this._text = '';
    parseHTML(this, this._html);
    const doc = this.ownerDocument;
    (function index(n) {
      for (const c of n.children) {
        c.parentNode = n;
        if (c.tagName === 'CANVAS') c.getContext = doc._makeCtx;
        if (c.id && !doc._ids.has(c.id)) doc._ids.set(c.id, c);
        index(c);
      }
    })(this);
  }
  get outerHTML() { return this._html || this.textContent; }
  appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) this.ownerDocument._ids.set(c.id, c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  insertBefore(c) { return this.appendChild(c); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get childNodes() { return this.children; }
  get offsetWidth() { return this._w; }
  get offsetHeight() { return this._h; }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); }
  dispatch(type, ev) {
    const e = Object.assign({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }, ev);
    e.target = ev && ev.target ? ev.target : this;
    let n = this, stopped = false;
    e.stopPropagation = () => { stopped = true; };
    while (n) {
      e.currentTarget = n;
      for (const fn of [...((n._l && n._l[type]) || [])]) { fn(e); if (stopped) return; }
      n = n.parentNode;
    }
    const w = this.ownerDocument && this.ownerDocument._win;
    if (w && !stopped) w.dispatch(type, e);
  }
  click(ev) { this.dispatch('click', ev); }
  focus() {} blur() {} scrollIntoView() {} setPointerCapture() {} releasePointerCapture() {}
  closest(sel) {
    let n = this;
    while (n) {
      if (matches(n, sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    (function walk(n) { for (const c of n.children) { if (matches(c, sel)) out.push(c); walk(c); } })(this);
    return out;
  }
  getBoundingClientRect() {
    return { width: this._w, height: this._h, top: 0, left: 0, right: this._w, bottom: this._h, x: 0, y: 0 };
  }
}

function matches(el, sel) {
  for (const part of String(sel).split(',').map((s) => s.trim())) {
    if (!part) continue;
    const m = part.match(/^(\w+)?([.#][\w-]+)?(\[[^\]=]+(?:="[^"]*")?\])?$/);
    if (!m) continue;
    const [, tag, cls, attr] = m;
    if (tag && el.tagName !== tag.toUpperCase()) continue;
    if (cls && cls[0] === '.' && !el._cls.includes(cls.slice(1))) continue;
    if (cls && cls[0] === '#' && el.id !== cls.slice(1)) continue;
    if (attr) {
      const a = attr.slice(1, -1);
      const eq = a.indexOf('=');
      if (eq < 0) {
        const key = a.replace(/^data-/, '');
        if (!(key in el.dataset) && !(a in el.attrs)) continue;
      } else {
        const k = a.slice(0, eq).replace(/^data-/, '');
        const v = a.slice(eq + 1).replace(/^"|"$/g, '');
        if (String(el.dataset[k] ?? el.attrs[a.slice(0, eq)]) !== v) continue;
      }
    }
    return true;
  }
  return false;
}

/* ==================== Canvas 2D 桩 ==================== */
function makeDoc() {
  const doc = {
    _ids: new Map(),
    createElement(tag) { const el = new Node(tag, doc); if (String(tag).toLowerCase() === 'canvas') el.getContext = doc._makeCtx; return el; },
    createDocumentFragment() { return new Node('fragment', doc); },
    body: null,
    documentElement: null,
    _drawCalls: 0,
    _makeCtx() {
      if (this._ctx) return this._ctx;
      const rec = { calls: 0, fill: 0, stroke: 0, text: 0, arc: 0, img: 0 };
      this._ctx = new Proxy({}, {
        get(_, k) {
          if (k === '__rec') return rec;
          if (k === 'canvas') return this._canvas || null;
          if (k === 'measureText') return () => ({ width: 8 });
          if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
            return () => ({ addColorStop() {} });
          }
          if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
          if (k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
          if (typeof k === 'symbol') return undefined;
          if (k in state) return state[k];
          return (...args) => {
            rec.calls++;
            if (k === 'fillRect' || k === 'fill') rec.fill++;
            if (k === 'stroke' || k === 'strokeRect') rec.stroke++;
            if (k === 'fillText' || k === 'strokeText') rec.text++;
            if (k === 'arc' || k === 'ellipse') rec.arc++;
            if (k === 'drawImage') rec.img++;
            return undefined;
          };
        },
        set(_, k, v) { state[k] = v; return true; },
      });
      const state = { lineWidth: 1, font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1 };
      return this._ctx;
    },
  };
  doc.body = new Node('body', doc);
  doc.documentElement = new Node('html', doc);
  doc.getElementById = (id) => doc._ids.get(id) || null;
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  return doc;
}

/* ==================== 游戏加载器 ==================== */
function loadGame(dir, opts) {
  const opts_ = opts || {};
  const dirPath = path.join(ROOT, dir);
  const html = fs.readFileSync(path.join(dirPath, 'index.html'), 'utf8');
  const doc = makeDoc();
  doc.body.innerHTML = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];

  // 假时钟
  let now = opts_.startClock || 0;
  const timers = [];
  let timerSeq = 1;
  const rafQueue = [];
  const storage = makeStorage(opts_.storage || {});
  const log = [];
  const audio = makeAudio();

  const winL = {};
  const win = {
    devicePixelRatio: 2, innerWidth: 480, innerHeight: 900,
    _l: winL,
    addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); },
    removeEventListener: (t, fn) => { winL[t] = (winL[t] || []).filter((f) => f !== fn); },
    dispatch(type, ev) {
      const e = Object.assign({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }, ev);
      for (const fn of [...(winL[type] || [])]) fn(e);
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: (fn, ms) => { const t = { id: timerSeq++, at: now + (ms || 0), fn, every: 0 }; timers.push(t); return t.id; },
    setInterval: (fn, ms) => { const t = { id: timerSeq++, at: now + (ms || 0), fn, every: Math.max(1, ms || 1) }; timers.push(t); return t.id; },
    clearTimeout: (id) => { for (let i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) timers.splice(i, 1); },
    clearInterval: (id) => win.clearTimeout(id),
    AudioContext: audio.AC, webkitAudioContext: audio.AC,
    localStorage: storage, document: doc, location: { href: 'file:///', protocol: 'file:', hostname: '' },
    navigator: { maxTouchPoints: 1, userAgent: 'node' },
    alert: (m) => log.push('alert:' + m), confirm: () => true,
    performance: { now: () => now },
    Image: function () { return { set src(_) {}, addEventListener() {} }; },
    ResizeObserver: function () { this.observe = () => {}; this.unobserve = () => {}; this.disconnect = () => {}; },
    IntersectionObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {}, media: '' }),
  };
  win.window = win; win.self = win; win.globalThis = win; win.top = win;

  doc._win = win;
  const ctxObj = vm.createContext(win);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    const p = path.join(dirPath, s); // 与浏览器一致：相对 index.html 解析（含 ../shared/）
    let src = fs.readFileSync(p, 'utf8');
    if (opts_.transform) src = opts_.transform(src, s);
    new vm.Script(src, { filename: s }).runInContext(ctxObj);
  }

  const api = {
    win, doc, storage, log, audio, ctx: ctxObj,
    byId: (id) => doc.getElementById(id),
    now: () => now,
    tick(ms) {
      now += ms;
      for (const t of [...timers]) if (t.at <= now) {
        const i = timers.indexOf(t); if (i < 0) continue;
        if (t.every) t.at = now + t.every; else timers.splice(i, 1);
        t.fn();
      }
      const fns = rafQueue.splice(0, rafQueue.length);
      for (const fn of fns) fn(now);
    },
    pump(seconds, step) {
      step = step || 16;
      let n = 0;
      while (n++ < Math.ceil((seconds * 1000) / step) + 1) api.tick(step);
    },
    canvas() {
      const c = doc.querySelectorAll('canvas')[0];
      if (c && !c.getContext.__bound) { c.getContext.__bound = true; }
      return c || null;
    },
    draws() { const c = api.canvas(); return c && c._ctx ? c._ctx.__rec.calls : 0; },
    fire(el, type, extra) { if (el) el.dispatch(type, extra); },
    key(k, extra) { doc.body.dispatch('keydown', Object.assign({ key: k }, extra)); },
    act(name) {
      // 触发遮罩层里的按钮（[data-act]）
      const target = { closest: (sel) => (/data-act/.test(sel) ? { dataset: { act: name } } : null) };
      for (const el of [doc.body, ...collect(doc.body)]) {
        if (el._l && el._l.click) el.dispatch('click', { target });
      }
    },
    clickAt(x, y) {
      const c = api.canvas();
      if (!c) return;
      c.dispatch('pointerdown', { pointerId: 1, clientX: x, clientY: y, offsetX: x, offsetY: y, isPrimary: true });
      c.dispatch('pointerup', { pointerId: 1, clientX: x, clientY: y, offsetX: x, offsetY: y, isPrimary: true });
      c.dispatch('click', { clientX: x, clientY: y, offsetX: x, offsetY: y });
    },
  };
  return api;
}

function collect(root) {
  const out = [];
  (function walk(n) { for (const c of n.children) { out.push(c); walk(c); } })(root);
  return out;
}

function makeStorage(seed) {
  const data = Object.assign({}, seed);
  return {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    _data: data,
  };
}

function makeAudio() {
  const created = { osc: 0, gain: 0, buf: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 });
  function AC() {
    this.currentTime = 0; this.sampleRate = 44100; this.state = 'running';
    this.destination = {}; this.resume = () => {};
    this.createOscillator = () => { created.osc++; return { type: '', frequency: param(), connect() { return this._g || { connect() {} }; }, start() {}, stop() {} }; };
    this.createGain = () => { created.gain++; return { gain: param(), connect() { return { connect() {} }; } }; };
    this.createBuffer = (ch, len) => { created.buf++; return { getChannelData: () => new Float32Array(Math.max(1, len)) }; };
    this.createBufferSource = () => ({ buffer: null, connect() { return { connect() {} }; }, start() {}, stop() {} });
    this.createDelay = () => ({ delayTime: param(), connect() { return { connect() {} }; } });
    this.createBiquadFilter = () => ({ type: '', frequency: param(), Q: param(), gain: param(), connect() { return { connect() {} }; } });
    this.createDynamicsCompressor = () => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() { return { connect() {} }; } });
    this.createStereoPanner = () => ({ pan: param(), connect() { return { connect() {} }; } });
    this.createWaveShaper = () => ({ curve: null, oversample: '', connect() { return { connect() {} }; } });
  }
  return { AC, created };
}

/* ==================== 直接运行：全量冒烟 ==================== */
function gameDirs() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((d) => fs.existsSync(path.join(ROOT, d, 'index.html')))
    .sort();
}

function runSuite() {
  let failed = 0;
  const dirs = gameDirs();
  console.log('');
  for (const d of dirs) {
    const notes = [];
    try {
      const g = loadGame(d);
      g.pump(0.6);
      const canvas = g.canvas();
      // 开局：点掉遮罩主按钮（若有）
      g.act('start'); g.pump(0.4);
      g.act('again'); g.pump(0.4);
      // 点盘面中心，触发一次交互
      if (canvas) { g.clickAt(200, 200); g.pump(1.2); g.clickAt(90, 320); g.pump(1.2); }
      // 键盘
      const key = (k) => { for (const el of [g.doc.body, ...collect(g.doc.body)]) if (el._l.keydown) el.dispatch('keydown', { key: k }); };
      ['ArrowLeft', 'ArrowUp', ' ', 'n', 'u', 'h', '1', '2', '3'].forEach(key);
      g.pump(1.5);
      if (canvas) {
        const rec = g.canvas()._ctx.__rec;
        notes.push('绘制 ' + rec.calls + ' 次(填充' + rec.fill + '/描边' + rec.stroke + '/文字' + rec.text + ')');
        if (rec.calls === 0) throw new Error('canvas 一帧都没画');
      }
      const osc = g.audio.created.osc;
      if (osc) notes.push('发声 ' + osc + ' 次');
      console.log('  ✓ ' + pad(d, 14) + notes.join(' · '));
    } catch (e) {
      failed++;
      console.log('  ✗ ' + pad(d, 14) + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    }
  }
  console.log('\n' + (failed ? '✗ ' + failed + '/' + dirs.length + ' 个游戏冒烟失败' : '✓ ' + dirs.length + ' 个游戏全部能启动并运行') + '\n');
  process.exit(failed ? 1 : 0);
}

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

module.exports = { loadGame, gameDirs };
if (require.main === module) runSuite();
