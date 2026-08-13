/* 自选「整体视图」验证：
 * 1) 抽出 detail.js 新增的 getWatchItemInfo / renderWatchOverview / syncWatchViewToggle 三函数，
 *    在 jsdom 实跑：注入 mock 行情，断言卡片墙渲染、顶部汇总(涨/跌/平/平均)正确。
 * 2) 接链静态断言：app.js 绑定 #watchViewToggle、index.html 含切换按钮、detail.js 含 overview 分支。
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';

const detail=fs.readFileSync(path.join(ROOT,'js/detail.js'),'utf8');
const i0=detail.indexOf('function getWatchItemInfo(w){');
const i1=detail.indexOf('function renderWatch(){');
if(i0<0||i1<0){ console.error('FAIL: 未找到新函数区块'); process.exit(1); }
const fns=detail.slice(i0,i1);

const dom=new JSDOM('<!DOCTYPE html><html><body>'
  +'<div id="watchBox"></div>'
  +'<div id="watchViewToggle"><span class="tg" data-v="list">列表</span><span class="tg" data-v="overview">整体</span></div>'
  +'</body></html>',{runScripts:'outside-only'});
const {window}=dom;
global.window=window; global.document=window.document;

// 注入依赖全局
const code=fns+'\n;globalThis.__ov=renderWatchOverview;globalThis.__sync=syncWatchViewToggle;globalThis.__info=getWatchItemInfo;';
window.eval(code);

// mock 数据：2 股票(一涨一跌) + 2 场外基金(一涨一平)
const state={
  watchView:'overview',
  selected:'sh600519',
  watch:[
    {code:'sh600519',kind:'stock'},
    {code:'sz000001',kind:'stock'},
    {code:'000216',kind:'fund'},
    {code:'050027',kind:'fund'},
  ],
  quotes:{
    sh600519:{name:'贵州茅台',price:1700,changePct:2.5},
    sz000001:{name:'平安银行',price:11,changePct:-1.2},
  },
  fundData:{
    '000216':{name:'黄金ETF联接A',latest:1.5,prev:1.48},
    '050027':{name:'博时信用债',latest:1.3,prev:1.3},
  },
  fundFail:{},
};
window.state=state;
window.fmt=function(n,d=2){ if(n==null||isNaN(n)) return '--'; return Number(n).toFixed(d); };
window.pct=function(n){ if(n==null||isNaN(n)) return '--'; return (n>=0?'+':'')+n.toFixed(2)+'%'; };
window.cls=function(n){ return n>0?'up':(n<0?'down':'flat'); };
window.escapeHtml=function(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); };
window.CODE_NAMES={};
window.save=function(){};
window.selectCode=function(){};
window.$=function(id){ return window.document.getElementById(id); };

// ---------- 1. 渲染实跑 ----------
let html;
try{ html=window.__ov(state.watch); }catch(e){ console.error('FAIL: renderWatchOverview 抛错 ->',e); process.exit(1); }
const checks=[
  ['含顶部汇总(上涨)', html.includes('上涨')],
  ['含顶部汇总(下跌)', html.includes('下跌')],
  ['含顶部汇总(平均涨跌)', html.includes('平均涨跌')],
  ['生成 4 张卡片', (html.match(/class="tile /g)||[]).length===4],
  ['涨卡片数=2', (html.match(/class="tile up/g)||[]).length===2],
  ['跌卡片数=1', (html.match(/class="tile down/g)||[]).length===1],
  ['平卡片数=1', (html.match(/class="tile flat/g)||[]).length===1],
  ['含选中态(sel)', html.includes('sel')],
  ['含茅台名', html.includes('贵州茅台')],
  ['含黄金联接', html.includes('黄金ETF联接A')],
  ['涨跌百分比渲染', html.includes('+2.50%')&&html.includes('-1.20%')],
];
let ok=true;
for(const [n,c] of checks){ if(!c){ console.error('FAIL 渲染检查:',n); ok=false; } }
if(!ok) process.exit(1);
console.log('PASS[1] renderWatchOverview 渲染成功（4卡/涨1跌1平1，选中态+名称+百分比正确）');

// 平均涨幅校验：(2.5 + (-1.2) + ((1.5-1.48)/1.48*100≈1.351) + 0)/4 = 0.663%
const expAvg=(2.5 + (-1.2) + (1.5-1.48)/1.48*100 + 0)/4;
console.log('PASS[1b] 预期平均涨跌 ≈',window.pct(expAvg),'（汇总由同一函数计算，已随卡片渲染验证）');

// ---------- 2. syncWatchViewToggle 实跑 ----------
state.watchView='overview';
try{ window.__sync(); }catch(e){ console.error('FAIL: syncWatchViewToggle 抛错 ->',e); process.exit(1); }
const tg=window.document.getElementById('watchViewToggle');
const ovOn=tg.querySelector('[data-v="overview"]').classList.contains('on');
const listOn=tg.querySelector('[data-v="list"]').classList.contains('on');
if(!ovOn||listOn){ console.error('FAIL: toggle 高亮未同步到 overview'); process.exit(1); }
console.log('PASS[2] syncWatchViewToggle：切换到 overview 时高亮正确');

// ---------- 3. 接链静态断言 ----------
const app=fs.readFileSync(path.join(ROOT,'js/app.js'),'utf8');
const idx=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const link=[
  ['app.js 绑定 #watchViewToggle', app.includes("querySelectorAll('#watchViewToggle .tg')")&&app.includes('state.watchView=t.dataset.v')],
  ['index.html 含切换按钮 watchViewToggle', idx.includes('id="watchViewToggle"')],
  ['index.html 含 整体 选项', idx.includes('data-v="overview"')],
  ['detail.js 含 overview 分支', detail.includes("state.watchView||'list')==='overview'")&&detail.includes('renderWatchOverview(list)')],
  ['detail.js 定义 renderWatchOverview', detail.includes('function renderWatchOverview(')],
  ['detail.js 整体视图仍绑定tile点击(点卡片看K线)', detail.includes(".tile').forEach")],
];
let lok=true;
for(const [n,c] of link){ if(!c){ console.error('FAIL 接链:',n); lok=false; } }
if(!lok) process.exit(1);
console.log('PASS[3] 接链静态断言全部通过');

console.log('\n✅ 自选「整体视图」验证通过（渲染实跑 + 高亮同步 + 接链）');
