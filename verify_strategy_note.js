// 验证「轮动不如等权持有」诚实提示框已写入机会精选视图
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html); // 仅解析 DOM，不执行脚本
const note = dom.window.document.querySelector('.strategy-note');
let pass = true;
const log = [];
function check(name, cond) { if (cond) log.push('✅ ' + name); else { pass = false; log.push('❌ ' + name); } }

check('机会精选视图含 .strategy-note 提示框', !!note);
if (note) {
  const t = note.textContent;
  check('提示框含「动量轮动 / 3-5 只来回切换」', t.includes('动量轮动'));
  check('提示框含实测年化区间 1.6%~7.9%', t.includes('1.6%') && t.includes('7.9%'));
  check('提示框含对比基准 9.6%', t.includes('9.6%'));
  check('提示框含「全部跑输」结论', t.includes('全部跑输'));
  check('提示框含「描述式参考」免责', t.includes('描述式参考'));
}
console.log(log.join('\n'));
console.log(pass ? '\nALL PASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
