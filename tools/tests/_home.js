'use strict';
/* 首页进度中心的 DOM 桩：在 vm 沙箱里真的跑一遍 home.js，再把渲染出的
   HTML 交给断言。每次调用 = 重新打开一次页面，互不污染。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let CUR = null; // 本次渲染的 registry，供 innerHTML 的副作用登记新 id

class El {
  constructor(id) {
    this.id = id;
    this._html = '';
    this.hidden = false;
    this.dataset = {};
    this._listeners = {};
  }
  set innerHTML(v) { this._html = v; indexHTML(v); }
  get innerHTML() { return this._html; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  click(ev) { for (const fn of [...(this._listeners.click || [])]) fn(ev); }
}

// 渲染出的 HTML 里带 id 的节点（如 #btnClearRecs）之后也要能被 getElementById 找到
function indexHTML(html) {
  for (const m of html.matchAll(/id="([^"]+)"/g)) if (CUR && !CUR.has(m[1])) CUR.set(m[1], new El(m[1]));
}

function makeStorage(seed, blocked) {
  const data = Object.assign({}, seed);
  if (blocked) return new Proxy({}, { get() { throw new Error('SecurityError: storage disabled'); } });
  return {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

function mountHome(opts) {
  const o = opts || {};
  const html = read('index.html');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const reg = new Map();
  CUR = reg;
  for (const id of ids) reg.set(id, new El(id));
  const storage = makeStorage(o.seed || {}, o.storageBlocked);
  const log = [];
  const state = { confirmAnswer: o.confirmAnswer !== false };
  try {
    const ctx = vm.createContext({
      document: { getElementById: (id) => reg.get(id) || null },
      localStorage: storage,
      location: { protocol: o.protocol || 'file:', hostname: o.hostname || '' },
      confirm: (m) => { log.push(m); return state.confirmAnswer; },
      console: { log: (...a) => log.push(a.join(' ')), warn() {}, error() {} },
    });
    vm.runInContext(read('home.js'), ctx, { filename: 'home.js' });
  } finally { CUR = null; }
  return {
    reg, storage, log, setConfirm: (v) => { state.confirmAnswer = !!v; },
    grid: reg.get('games'),
    hud: reg.get('hud'),
    filters: reg.get('filters'),
    empty: reg.get('empty'),
  };
}

/* ---- 查询渲染结果 ---- */
const CARD_RE = /<a class="card[^"]*"[^>]*href="([a-z0-9]+)\/index\.html"[\s\S]*?(?=<a class="card|$)/g;

function cardHTML(gridEl, id) {
  const hit = [...gridEl.innerHTML.matchAll(CARD_RE)].find((m) => m[1] === id);
  return hit ? hit[0] : '';
}
function cardIds(gridEl) {
  return [...gridEl.innerHTML.matchAll(/href="([a-z0-9]+)\/index\.html"/g)].map((m) => m[1]);
}
function chipNames(filtersEl) {
  return [...filtersEl.innerHTML.matchAll(/data-f="([^"]+)" aria-pressed="(true|false)"/g)].map((m) => m[1]);
}
function clickChip(filtersEl, f) {
  filtersEl.click({ target: { closest: () => ({ dataset: { f } }) } });
}

module.exports = { ROOT, read, mountHome, cardHTML, cardIds, chipNames, clickChip };
