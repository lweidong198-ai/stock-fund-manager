/* 调仓频率实验室模块回归验证：
 * 1) 实跑 renderRebalance：jsdom 加载 rebalance.js，调用渲染，断言内容正确填充、无异常
 * 2) 接链断言：app.js 的 goView 分支 + showView 列表 + index.html 导航/视图/脚本引入 齐全
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';

// ---------- 1. 渲染实跑 ----------
const dom=new JSDOM('<!DOCTYPE html><html><body><div id="rebalBody"></div></body></html>',{runScripts:'outside-only'});
const {window}=dom;
global.window=window; global.document=window.document;
const code=fs.readFileSync(path.join(ROOT,'js/rebalance.js'),'utf8');
try{ window.eval(code); }catch(e){ console.error('FAIL: rebalance.js eval error ->',e); process.exit(1); }
if(typeof window.renderRebalance!=='function'){ console.error('FAIL: renderRebalance 未定义'); process.exit(1); }
try{ window.renderRebalance(); }catch(e){ console.error('FAIL: renderRebalance 抛错 ->',e); process.exit(1); }
const html=window.document.getElementById('rebalBody').innerHTML;
const checks=[
  ['含月频卡片', html.includes('月频')],
  ['含日频卡片', html.includes('日频')],
  ['含实测年化数字', html.includes('15.8%')],
  ['含结论(少赚3.56)', html.includes('少赚 3.56')],
  ['含验证按钮', html.includes('btnRebalVerify')],
  ['含实时结果容器', html.includes('rebalLive')],
  ['含对比条形图', html.includes('barRow')||html.includes('background')],
];
let ok=true;
for(const [n,c] of checks){ if(!c){ console.error('FAIL 渲染检查:',n); ok=false; } }
if(!ok) process.exit(1);
console.log('PASS[1] renderRebalance 渲染成功，内容长度',html.length);

// backtest 逻辑单元校验：构造 300 交易日有效序列，确认函数实跑返回完整有限指标（方向性结论由真实1389天回测背书）
function gen(n,start,step){
  const arr=[]; let v=start; const base=Date.parse('2020-01-01');
  for(let i=0;i<n;i++){ arr.push({date:new Date(base+i*864e5).toISOString().slice(0,10), close:v}); v*=step*(1+0.004*Math.sin(i*0.5)); }
  return arr;
}
const series={'sh511380':gen(300,1,1.002),'sh513100':gen(300,1,1.003),'sh513500':gen(300,1,1.0025)};
const m=window.__rebalBacktest(series,['sh511380','sh513100','sh513500'],'monthly',252);
const d=window.__rebalBacktest(series,['sh511380','sh513100','sh513500'],'daily',252);
if(!m||!d||![m.cagr,m.dd,m.sharpe,d.cagr,d.dd,d.sharpe].every(Number.isFinite)){ console.error('FAIL: backtest 返回异常',m,d); process.exit(1); }
console.log('PASS[1b] backtest 单元：月频年化',(m.cagr*100).toFixed(1)+'% / 日频年化',(d.cagr*100).toFixed(1)+'% / 切换 月频',m.switchPerYr.toFixed(1),'日频',d.switchPerYr.toFixed(1));

// ---------- 2. 接链静态断言 ----------
const app=fs.readFileSync(path.join(ROOT,'js/app.js'),'utf8');
const idx=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const link=[
  ['app.js goView 含 rebalance 分支', app.includes("if(v==='rebalance'){ showView('rebalance'); renderRebalance(); return; }")],
  ['app.js showView 列表含 rebalance', app.includes("'datacenter','rebalance'")||app.includes(",'rebalance']")],
  ['index.html 导航 data-view=rebalance', idx.includes('data-view="rebalance"')],
  ['index.html 视图 viewRebalance', idx.includes('id="viewRebalance"')],
  ['index.html 引入 rebalance.js', idx.includes('js/rebalance.js')],
];
let lok=true;
for(const [n,c] of link){ if(!c){ console.error('FAIL 接链:',n); lok=false; } }
if(!lok) process.exit(1);
console.log('PASS[2] 接链静态断言全部通过');
console.log('\n✅ 调仓频率实验室模块 验证通过（渲染实跑 + 接链）');
