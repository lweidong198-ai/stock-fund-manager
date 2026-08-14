// 真实验证：从 index.html 取出“已现拐点”悬停浮层的内联脚本，在 jsdom 里实跑并模拟事件
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
// 取所有裸 <script>...</script> 块，挑出含 revTip 的那段（即我们加的 tooltip 逻辑）
const re = /<script>([\s\S]*?)<\/script>/g;
let m, code = null;
while ((m = re.exec(html))) { if (m[1].includes('revTip')) { code = m[1]; break; } }
if (!code) { console.error('FAIL: 未在 index.html 找到 tooltip 脚本'); process.exit(1); }

const dom = new JSDOM('<!DOCTYPE html><body><div id="toast"></div></body>', { runScripts: 'outside-only' });
const { window } = dom;
window.eval(code); // 在真实 window 上下文执行页面里的 tooltip 代码

const { document } = window;
const span = document.createElement('span');
span.setAttribute('data-tip', '已现拐点 = 之前跌，现在转强\n不是预测，是已发生\n胜率约12%');
span.textContent = '↗已现拐点';
document.body.appendChild(span);

// 1) 悬停 → 浮层应出现且换行成 <br>
span.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
const tip = document.getElementById('revTip');
const shown = tip && tip.style.display === 'block';
const hasBr = tip && tip.innerHTML.indexOf('<br>') >= 0;
console.log('[hover] display =', tip && tip.style.display, '| has<br> =', hasBr);

// 2) 移出到页面其它元素 → 浮层应隐藏
span.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
const hidden = tip.style.display === 'none';
console.log('[leave] display =', tip.style.display);

let pass = true;
if (!shown) { console.error('FAIL: 悬停未显示浮层'); pass = false; }
if (!hasBr) { console.error('FAIL: 多行说明未换行 (<br>)'); pass = false; }
if (!hidden) { console.error('FAIL: 移出后浮层未隐藏'); pass = false; }
console.log(pass ? 'TOOLTIP PASS' : 'TOOLTIP FAIL');
process.exit(pass ? 0 : 1);
