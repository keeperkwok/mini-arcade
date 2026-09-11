'use strict';
/* 断言小工具：每个 *.test.js 顶部 require 一次，结尾调用 report('名字')。
   进程内计数，退出码 0/1 供 run.js 汇总。 */
let passes = 0;
let fails = 0;

function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { fails++; console.log('  ✗ ' + msg); }
  return !!cond;
}

function fail(msg) { fails++; console.log('  ✗ ' + msg); }

function note(msg) { console.log('  · ' + msg); }

function report(label) { summary(label, 0); }

// 自带计数器的测试可以把外部失败数并进来一起汇总
function summary(label, extraFails) {
  const f = fails + (extraFails || 0);
  const total = passes + f;
  console.log(f ? '✗ ' + label + '：' + total + ' 项断言，' + f + ' 项失败'
                : '✓ ' + label + '：' + total + ' 项断言全部通过');
  process.exit(f ? 1 : 0);
}

module.exports = { ok, fail, note, report, summary };
