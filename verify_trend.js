/* verify_trend.js —— 走势分析「📈走势」按钮后端逻辑回归
 * 纯函数(七态判定/指标/drawChart) + 基金净值路径 + 股票K线路径( mock fetch )
 */
const fs=require('fs'); const path=require('path');
const {JSDOM}=require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const ROOT='C:/Users/Mloong/stock-fund-manager';

let fails=0;
function assert(name,cond){ if(cond){ console.log('  ✓ '+name); } else { console.log('  ✗ FAIL: '+name); fails++; } }

const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
window.escapeHtml=function(s){ return String(s==null?'':s); };

// 加载 trend.js（纯全局函数，无 DOM 顶层绑定）
const code=fs.readFileSync(path.join(ROOT,'js/trend.js'),'utf8');
window.eval(code);
const W=window;

console.log('\n== 1) 七态判定(纯函数 t_classify) ==');
// 构造序列工具
function lin(n,a,b){ const r=[]; for(let i=0;i<n;i++) r.push(a+(b-a)*i/(n-1)); return r; }
function dropThenFlat(n,dropTo,flat){ const r=[]; for(let i=0;i<n;i++){ r.push(i<n*0.7? 2-(2-dropTo)*i/(n*0.7-1) : dropTo); } return r; }

// bull：持续上涨
let s=lin(100,1,2); let A=W.t_classify(s,null,{}); assert('持续上涨→强上升(bull)', A.state==='bull');

// down：温和下跌（不在超卖区，不触发短期底部）
s=lin(100,1.0,0.97); A=W.t_classify(s,null,{}); assert('温和下跌→下跌中(down)', A.state==='down');

// downrebound：先大跌后小反弹（c20>0,c60<0）
s=dropThenFlat(100,0.5,0.5); for(let i=80;i<100;i++) s[i]=0.5+0.4*(i-80)/19; A=W.t_classify(s,null,{}); assert('大跌后小反弹→下跌反弹·诱多(downrebound)', A.state==='downrebound');

// flat：长期微升、近20日微跌（c20<=0,c60>0）
s=lin(80,0.95,1.05).concat(lin(20,1.05,1.03)); A=W.t_classify(s,null,{}); assert('横盘震荡(flat)', A.state==='flat');

// shortbottom：急跌末端超卖（末14日急挫 → RSI<35 + 布林贴近下轨 + ≥3底部信号）
s=lin(86,1.0,1.0); for(let i=86;i<100;i++) s[i]=1.0-(i-85)*0.03; A=W.t_classify(s,null,{}); assert('急跌超卖→短期底部(shortbottom)', A.state==='shortbottom' && A.bottomTier>=3);

// reversal：下跌后温和回升（c20<5% 满足近期偏弱 + MACD金叉等≥2拐点信号）
s=lin(60,2,1).concat(lin(40,1,1.04)); A=W.t_classify(s,null,{}); assert('温和回升→已现拐点·转强(reversal)', A.state==='reversal');

// c5/c20/c60 计算正确性
s=lin(100,1,2); A=W.t_classify(s,null,{});
assert('c60 正值(约+44%)', A.c60>40 && A.c60<50);
assert('RSI 接近100(强涨)', A.r>95);

console.log('\n== 2) drawChart 返回 SVG ==');
const svg=W.t_drawChart(lin(120,1,2),{},{state:'bull',label:'强上升趋势'});
assert('SVG 含 <svg', svg.indexOf('<svg')===0);
assert('SVG 标注状态文字', svg.indexOf('强上升趋势')>=0);
assert('SVG 含 MA 折线', svg.indexOf('polyline')>=0);

console.log('\n== 3) 基金净值路径(analyzeTrend·fund) ==');
window.state={ fundData:{ '003304':{ name:'某基金', cum: Array.from({length:120},(_,i)=>({t:Date.now()-i*864e5, nav:1+0.005*i})) } } };
W.analyzeTrend('003304').then(res=>{
  assert('基金路径返回 kind=fund', res.kind==='fund');
  assert('基金报告含净值字样', res.html.indexOf('基金净值')>=0);
  assert('基金报告含状态标签', /op-state st-/.test(res.html));
  return W.analyzeTrend('999999'); // 无数据基金
}).then(()=>{ assert('无净值数据应抛 FUND_NO_DATA(不应到达)', false); })
  .catch(e=>{ assert('无净值数据→抛 FUND_NO_DATA', e&&e.code==='FUND_NO_DATA'); })

  // 股票K线路径（mock fetch 腾讯）
  .then(()=>{
    console.log('\n== 4) 股票K线路径(analyzeTrend·stock, mock fetch) ==');
    const rows=[]; for(let i=0;i<700;i++){ const d=new Date(2020,0,1+i); const ds=d.toISOString().slice(0,10); const p=1+0.5*Math.sin(i/20)+i*0.002; rows.push([ds, p.toFixed(3), p.toFixed(3), (p*1.01).toFixed(3), (p*0.99).toFixed(3), 1000000]); }
    const week=[]; for(let i=0;i<200;i++){ const d=new Date(2020,0,1+i*5); const ds=d.toISOString().slice(0,10); const p=1+i*0.002; week.push([ds, p.toFixed(3), p.toFixed(3), (p*1.01).toFixed(3), (p*0.99).toFixed(3), 1000000]); }
    const payload={ code:0, data:{ MOCK:{ qfqday:rows, qfqweek:week } } };
    window.fetch=(url)=> Promise.resolve({ text:()=>Promise.resolve(JSON.stringify(payload)) });
    return W.analyzeTrend('sz159796');
  }).then(res=>{
    assert('股票路径返回 kind=stock', res.kind==='stock');
    assert('股票报告含 K线 字样', res.html.indexOf('K线')>=0);
    assert('股票报告含 SVG 走势图', res.html.indexOf('<svg')>=0);
    assert('股票报告含七态状态', /op-state st-/.test(res.html));
    finish();
  }).catch(e=>{ console.log('  ✗ stock path error: '+e.message); fails++; finish(); });

function finish(){
  console.log('\n'+(fails? ('❌ '+fails+' 项失败') : '✅ 全部通过 (走势分析·7态+基金+股票路径)'));
  process.exit(fails?1:0);
}
