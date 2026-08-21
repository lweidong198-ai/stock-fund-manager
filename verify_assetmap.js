/* 大类资产全景回归测试（jsdom 实跑，零网络）
 * 覆盖：6卡片渲染 / 涨跌颜色 / K线近5日20日补全 / 行情源连不上诚实提示
 */
const { JSDOM } = require('jsdom');
const fs = require('fs'); const path = require('path');
const ROOT = 'C:/Users/Mloong/stock-fund-manager';
const html = '<!doctype html><html><body><div id="assetBody"></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://localhost/' });
const { window } = dom; global.window = window; global.document = window.document;
window.toast = () => {}; window.goView = () => {};

/* fetch 桩：返回腾讯风格文本（parseTencent 由下面 stub 接管） */
window.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode('v_sh518880="1"' + ';'.repeat(80))) });
window.parseTencent = (txt) => ({
  'sh518880': { name: '黄金ETF', price: 5.55, changePct: 1.2 },
  'sh511260': { name: '十年国债ETF', price: 130.5, changePct: -0.15 },
  'sh513100': { name: '纳指ETF', price: 1.88, changePct: 2.3 },
  'sz159920': { name: '恒生ETF', price: 1.02, changePct: 0.8 },
  'sh501018': { name: '南方原油LOF', price: 0.98, changePct: -1.1 },
  'sh512400': { name: '有色金属ETF', price: 1.32, changePct: 0.5 }
});
window.loadKlineP = async (code) => [{ date: '2026-08-01', close: 100 }, { date: '2026-08-20', close: 106 }];
window.klinePct = (kl, n) => 6.0;

const files = ['js/utils.js', 'js/assetmap.js'];
let combined = ''; for (const f of files) combined += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';
try { window.eval(combined); } catch (e) { console.error('eval fail', e); process.exit(1); }

let fails = 0;
function A(cond, name) { if (cond) console.log('  ✅ ' + name); else { fails++; console.log('  ❌ ' + name); } }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('— 六卡渲染 —');
  await window.renderAssetMap();
  await wait(30);
  let body = window.document.getElementById('assetBody').innerHTML;
  A(body.indexOf('am-grid') >= 0, '渲染卡片网格');
  ['黄金', '十年国债', '纳指', '恒生', '原油', '有色'].forEach(n => { if (body.indexOf(n) < 0) console.log('  缺 ' + n); });
  A(['黄金','十年国债','纳指','恒生','原油','有色'].every(n => body.indexOf(n) >= 0), '六类资产卡片齐全');
  A(body.indexOf('5.55') >= 0 && body.indexOf('130.5') >= 0, '价格显示');
  A(body.indexOf('+1.20%') >= 0 && body.indexOf('-0.15%') >= 0, '涨跌幅显示');
  A(body.indexOf('cls-up') >= 0 && body.indexOf('cls-dn') >= 0, '红涨绿跌颜色类');

  console.log('— K线近5日/20日补全 —');
  await wait(40);
  body = window.document.getElementById('assetBody').innerHTML;
  A(body.indexOf('近5日') >= 0 && body.indexOf('近20日') >= 0, 'K线标签渲染近5日/20日');
  A(body.indexOf('近5日 +6.0%') >= 0, '近5日涨幅来自 klinePct');
  A(body.indexOf('避险') >= 0 && body.indexOf('钱在躲风险') >= 0, '白话提示文案');

  console.log('— 行情源连不上 —');
  window.fetch = () => Promise.reject(new Error('net'));
  await window.renderAssetMap();
  await wait(30);
  body = window.document.getElementById('assetBody').innerHTML;
  A(body.indexOf('暂时连不上') >= 0, '源挂 → 诚实提示不假数据');

  console.log(fails ? '\n❌ ' + fails + ' 项失败' : '\n✅ 大类资产全景 全部通过');
  process.exit(fails ? 1 : 0);
})();
