/* 持仓·手动加仓 核心计算验证：
 * 单元测试 computeAddCash 纯函数：股票 100股/手取整、基金小数份额、
 * 金额不足失败、无现价失败、加权均价正确、剩余现金正确。
 * 仅 eval js/utils.js（无 DOM 顶层依赖），用 jsdom 桩跑断言。
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const dom=new JSDOM('<!DOCTYPE html><html><body></body></html>',{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
window.$=function(id){ return window.document.getElementById(id); };
window.localStorage={ getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
window.console=console;

const _combined=fs.readFileSync(path.join(ROOT,'js/utils.js'),'utf8')+'\n;\n';
try{ window.eval(_combined); }catch(e){ console.error('FAIL: eval utils ->',e); process.exit(1); }

let fails=0;
function assert(name,cond){ if(!cond){ console.error('FAIL: '+name); fails++; } else { console.log('PASS: '+name); } }
if(typeof window.computeAddCash!=='function'){ console.error('FAIL: computeAddCash 未定义'); process.exit(1); }
const C=window.computeAddCash;

// 1) 股票：100股/手取整 + 加权均价（旧1000股@10，现价12，买1200元→100股）
let r=C('stock',1200,12,1000,10);
assert('股票加仓成功', r.ok===true);
assert('股票取整到100股', r.addShares===100);
assert('股票新数量=1100', r.newShares===1100);
assert('股票加权均价≈10.1818', Math.abs(r.newCost-10.1818)<0.001);

// 2) 股票金额不足 1 手（现价12，买100元 → <100股 → 失败）
r=C('stock',100,12,1000,10);
assert('股票不足1手失败', r.ok===false && /1 手/.test(r.msg));

// 3) 基金：小数份额（无旧仓，净值1.5，买100元→66.66份）
r=C('fund',100,1.5,0,0);
assert('基金加仓成功', r.ok===true);
assert('基金份额≈66.66', Math.abs(r.addShares-66.66)<0.001);
assert('基金无旧仓新均价=1.5', Math.abs(r.newCost-1.5)<0.001);

// 4) 基金：加权均价（旧500份@2.0，净值2.5，买250→100份）
r=C('fund',250,2.5,500,2.0);
assert('基金份额=100', Math.abs(r.addShares-100)<0.001);
assert('基金加权均价≈2.0833', Math.abs(r.newCost-2.08333)<0.001);

// 5) 无现价 → 失败
r=C('stock',1000,0,100,10);
assert('无现价失败', r.ok===false && /现价/.test(r.msg));

// 6) 金额非正 → 失败
r=C('stock',0,12,100,10);
assert('金额0失败', r.ok===false && /买入金额/.test(r.msg));

// 7) 剩余现金（股票买1300@12→100股=1200，剩100）
r=C('stock',1300,12,0,0);
assert('股票剩余现金=100', Math.abs(r.leftover-100)<0.001);

// 8) 旧仓带成本、加仓后均价（旧100@5，现价10，买1000→100股，均价7.5）
r=C('stock',1000,10,100,5);
assert('均价=7.5', Math.abs(r.newCost-7.5)<0.001);

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (8 组用例 · 股票/基金/边界)');
process.exit(fails?1:0);
