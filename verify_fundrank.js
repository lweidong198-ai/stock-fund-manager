/* 基金排行回归测试（jsdom 实跑，零网络）
 * 覆盖：parseRank 纯解析 / script 注入读取 rankData / renderFundRank 表格渲染 / 源失败诚实提示
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><div id="rankBody"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {}; window.addWatch = () => {};

/* 拦截 script：rankhandler → 写 window.rankData 并触发 onload */
let mode = 'ok'; // 'ok' | 'fail'
const origCreate = window.document.createElement.bind(window.document);
window.document.createElement = function (tag) {
  const el = origCreate(tag);
  if (String(tag).toLowerCase() === 'script') {
    setTimeout(() => {
      if ((el.src || '').indexOf('rankhandler') >= 0) {
        if (mode === 'fail') { el.onerror && el.onerror(); return; }
        window.rankData = {
          allRecords: 12000,
          datas: [
            '000001,华夏成长混合,2026-08-20,1.2345,0.55,1.10,2.30,5.10,12.00,25.50',
            '161725,招商中证白酒指数A,2026-08-20,0.9500,-1.20,-2.00,3.00,8.00,15.00,30.00',
            '012863,汇添富中证电池ETF联接C,2026-08-20,0.7066,0.48,1.00,2.50,6.00,-8.00,-18.00'
          ]
        };
        el.onload && el.onload();
      } else { el.onerror && el.onerror(); }
    }, 0);
  }
  return el;
};

const files = ['js/utils.js', 'js/fundrank.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— parseRank 纯解析 —');
  const list = window.parseRank([
    '000001,华夏成长混合,2026-08-20,1.2345,0.55,1.10,2.30,5.10,12.00,25.50',
    '012863,汇添富中证电池ETF联接C,2026-08-20,0.7066,0.48,1.00,2.50,6.00,-8.00,-18.00',
    '缺字段'
  ]);
  A(list.length === 2, '有效行2条，坏行过滤');
  A(list[0].code === '000001' && list[0].name === '华夏成长混合', '代码/名称解析');
  A(list[0].nav === 1.2345 && list[0].y1 === 25.5, '净值/近1年数值解析');
  A(list[1].m6 === -8.0 && list[1].y1 === -18.0, '负值解析');
  A(window.parseRank('not-array') === undefined || Array.isArray(window.parseRank('not-array')) && window.parseRank('not-array').length === 0, '非数组输入安全');

  console.log('— renderFundRank 表格渲染 —');
  mode = 'ok';
  await window.renderFundRank();
  await wait(60);
  let body = window.document.getElementById('rankBody').innerHTML;
  A(body.indexOf('rank-table') >= 0, '渲染排行表格');
  A(body.indexOf('华夏成长混合') >= 0 && body.indexOf('招商中证白酒') >= 0 && body.indexOf('电池ETF联接C') >= 0, '三只基金都在表里');
  A(body.indexOf('25.50') >= 0 || body.indexOf('+25.50') >= 0, '近1年涨幅显示');
  A(body.indexOf('近1年') >= 0 && body.indexOf('单位净值') >= 0, '表头完整');
  A(body.indexOf('加自选') >= 0, '每行有加自选');
  A(body.indexOf('12000') >= 0, '总数提示（12000 条）');

  console.log('— 源失败 → 诚实提示 —');
  mode = 'fail';
  await window.renderFundRank();
  await wait(60);
  body = window.document.getElementById('rankBody').innerHTML;
  A(body.indexOf('连不上') >= 0 && body.indexOf('双击 index.html') >= 0, '源被拦 → 诚实提示+解法（不显示假排行）');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 基金排行 全部通过');
  process.exit(fails ? 1 : 0);
})();
