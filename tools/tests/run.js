#!/usr/bin/env node
'use strict';
/* 行为回归测试总入口
   node tools/tests/run.js            跑全部行为测试
   node tools/tests/run.js sonar      只跑名字里含 sonar 的测试
   node tools/tests/run.js --all      先跑静态自检 + 15 款冒烟，再跑行为测试
   node tools/tests/run.js -v         打印每条断言（默认只打印失败项与汇总） */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const DIR = __dirname;
const ROOT = path.resolve(DIR, '../..');
const args = process.argv.slice(2);
const verbose = args.includes('-v') || args.includes('--verbose');
const all = args.includes('--all');
const filters = args.filter((a) => !a.startsWith('-'));

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !filters.length || filters.some((x) => f.indexOf(x) >= 0))
  .sort();

if (!files.length) {
  console.log('没有匹配的测试文件（tools/tests/*.test.js）');
  process.exit(1);
}

function run(script, label) {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [script], { encoding: 'utf8' });
  const ms = Date.now() - t0;
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter((l) => l.length);
  const summary = lines.filter((l) => /^[✓✗]/.test(l)).pop() || lines[lines.length - 1] || '(无输出)';
  const bad = r.status !== 0;
  console.log((bad ? '  ✗ ' : '  ✓ ') + label.padEnd(18) + summary.replace(/^[✓✗]\s*/, '') + '  (' + ms + 'ms)');
  if (bad || verbose) {
    for (const l of lines) {
      if (!/^[✓✗]/.test(l) && !verbose && /^\s+✓/.test(l)) continue;
      console.log('    ' + l);
    }
  }
  const n = lines.filter((l) => /^\s+[✓✗]/.test(l)).length;
  return { bad, asserts: n };
}

console.log('');
let failed = 0;
let asserts = 0;

if (all) {
  const s1 = run(path.join(ROOT, 'tools/selfcheck.js'), 'selfcheck');
  const s2 = run(path.join(ROOT, 'tools/smoketest.js'), 'smoketest');
  failed += (s1.bad ? 1 : 0) + (s2.bad ? 1 : 0);
  if (s1.bad || s2.bad) console.log('    （静态自检或冒烟测试失败，行为测试仍会继续）');
}

for (const f of files) {
  const r = run(path.join(DIR, f), f.replace(/\.test\.js$/, ''));
  if (r.bad) failed++;
  asserts += r.asserts;
}

console.log('\n' + (failed
  ? '✗ ' + (files.length + (all ? 2 : 0)) + ' 项检查，' + failed + ' 项失败'
  : '✓ ' + (files.length + (all ? 2 : 0)) + ' 项检查全部通过，共 ' + asserts + ' 条断言') + '\n');
process.exit(failed ? 1 : 0);
