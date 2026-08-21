/* 指标词典回归测试（jsdom 实跑，零网络）
 * 覆盖：词典完整性（字段/分类/大白话长度）/ 分类筛选 / 搜索 / 渲染卡片
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body>'
  + '<div id="dictBody"></div><input id="dictSearch" value="" /><select id="dictCat"></select></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {};

const files = ['js/utils.js', 'js/dict.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }

console.log('— 词典完整性 —');
A(window.INDICATOR_DICT.length >= 10, '至少10个词条（当前 ' + window.INDICATOR_DICT.length + '）');
let bad = [];
window.INDICATOR_DICT.forEach(d => {
  ['cat','name','plain','how','caution','icon'].forEach(k => { if (!d[k]) bad.push(d.name + ' 缺 ' + k); });
  if (d.plain.length < 20) bad.push(d.name + ' plain 太短');
  if (d.how.length < 8 || d.caution.length < 8) bad.push(d.name + ' how/caution 太短');
});
A(bad.length === 0, '所有词条字段完整且内容够长' + (bad.length ? '：' + bad.join('、') : ''));
const cats = window.dictCats();
A(cats.length >= 4 && cats.indexOf('技术') >= 0 && cats.indexOf('估值') >= 0 && cats.indexOf('风险') >= 0 && cats.indexOf('资金') >= 0, '四大分类齐全：' + cats.join('/'));

console.log('— 分类筛选 —');
window.renderDictCatSel();
A(window.document.getElementById('dictCat').innerHTML.indexOf('全部分类') >= 0, '分类下拉含「全部分类」');
window.document.getElementById('dictCat').value = '风险';
window.renderDict();
let body = window.document.getElementById('dictBody').innerHTML;
A(body.indexOf('最大回撤') >= 0 && body.indexOf('夏普比率') >= 0 && body.indexOf('KDJ') < 0, '筛选「风险」→ 只显示风险类');
window.document.getElementById('dictCat').value = 'all';

console.log('— 搜索 —');
window.document.getElementById('dictSearch').value = '回撤';
window.renderDict();
body = window.document.getElementById('dictBody').innerHTML;
A(body.indexOf('最大回撤') >= 0 && body.indexOf('夏普') < 0, '搜「回撤」→ 命中最大回撤');
window.document.getElementById('dictSearch').value = '不存在的词xyz';
window.renderDict();
body = window.document.getElementById('dictBody').innerHTML;
A(body.indexOf('没找到') >= 0, '搜索无结果 → 诚实提示');

console.log('— 卡片渲染 —');
window.document.getElementById('dictSearch').value = '';
window.renderDict();
body = window.document.getElementById('dictBody').innerHTML;
A(body.indexOf('dict-grid') >= 0 && body.indexOf('dict-card') >= 0, '渲染卡片网格');
A(body.indexOf('怎么用') >= 0 && body.indexOf('别踩坑') >= 0, '每卡含「怎么用/别踩坑」');
A(body.indexOf('KDJ') >= 0 && body.indexOf('布林带') >= 0 && body.indexOf('市盈率') >= 0, '技术/估值词条都渲染');
A((body.match(/dict-card/g) || []).length === window.INDICATOR_DICT.length, '无筛选时渲染全部 ' + window.INDICATOR_DICT.length + ' 张卡');

console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 指标词典 全部通过');
process.exit(fails ? 1 : 0);
