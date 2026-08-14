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

// ============ 减仓 computeReduceCash ============
if(typeof window.computeReduceCash!=='function'){ console.error('FAIL: computeReduceCash 未定义'); process.exit(1); }
const D=window.computeReduceCash;

// 9) 股票减仓：持仓1000股@10，现价12，卖1200元→卖100股、余900、成本不变、实现盈亏=(12-10)*100=200
let rr=D('stock',1200,12,1000,10);
assert('股票减仓成功', rr.ok===true);
assert('股票减仓卖出100股', rr.sellShares===100);
assert('股票减仓后余900', rr.newShares===900);
assert('股票减仓成本价不变(=10)', Math.abs(rr.newCost-10)<1e-9);
assert('股票减仓实现盈亏=+200', Math.abs(rr.realizedPnl-200)<1e-9);

// 10) 基金减仓：持仓100份@2，净值1.5，卖75元→卖50份、余50、成本2、实现盈亏=(1.5-2)*50=-25
rr=D('fund',75,1.5,100,2);
assert('基金减仓卖出50份', Math.abs(rr.sellShares-50)<1e-9);
assert('基金减仓后余50', Math.abs(rr.newShares-50)<1e-9);
assert('基金减仓成本价不变(=2)', Math.abs(rr.newCost-2)<1e-9);
assert('基金减仓实现盈亏=-25', Math.abs(rr.realizedPnl+25)<1e-9);

// 11) 股票金额不足1手：现价12，卖100元→失败
rr=D('stock',100,12,1000,10);
assert('股票减仓不足1手失败', rr.ok===false && /1 手/.test(rr.msg));

// 12) 卖超拦截：持仓100股，卖100000元→失败(超过持仓)
rr=D('stock',100000,12,100,10);
assert('股票减仓卖超拦截', rr.ok===false && /超过持仓/.test(rr.msg));

// 13) 清仓：持仓100股@10，现价12，卖正好1200元→卖光、数量0、成本0、实现盈亏200
rr=D('stock',1200,12,100,10);
assert('股票清仓成功', rr.ok===true);
assert('股票清仓余0', rr.newShares===0);
assert('股票清仓成本归0', rr.newCost===0);
assert('股票清仓实现盈亏=200', Math.abs(rr.realizedPnl-200)<1e-9);

// 14) 无持仓/现价为0：减仓失败
assert('无持仓减仓失败', D('stock',100,12,0,10).ok===false);
assert('无现价减仓失败', D('stock',100,0,100,10).ok===false && /现价/.test(D('stock',100,0,100,10).msg));

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (加仓8组 + 减仓10组 · 股票/基金/边界)');
process.exit(fails?1:0);
