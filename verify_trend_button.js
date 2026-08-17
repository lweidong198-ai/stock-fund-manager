/* verify_trend_button.js —— 走势按钮位置回归
 * 断言：① 自选列表(中栏)列表/整体两种视图都不再有 wl-trend 按钮
 *       ② 右侧 K线详情头部「名称后」有 #dTrendBtn，点击→openTrendModal(当前code)
 *       ③ 右侧基金工作区头部也有 #mFTrendBtn，点击→openTrendModal(当前code)
 */
const {JSDOM}=require('jsdom');
const fs=require('fs'); const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
window.save=()=>{}; window.toast=()=>{};
window.needsFund=()=>false; window.loadFund=()=>{}; window.refreshQuotes=()=>{};

const _files=['js/config.js','js/utils.js','js/quotes.js','js/indicators.js','js/sectors.js','js/trend.js','js/detail.js'];
let _combined='';
for(const f of _files){ _combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n'; }
_combined+='\n;window.__state=state;\n';
try{ window.eval(_combined); }catch(e){ console.error('FAIL eval combined ->',e); process.exit(1); }
const S=window.__state;
S.fundData=S.fundData||{}; S.fundFail=S.fundFail||{};

// 以下为 canvas/DOM 副作用桩：必须在 eval 之后设置，否则被函数声明覆盖
window.renderQuoteBoard=()=>{};
window.paintCanvasMsg=()=>{}; window.drawNav=()=>{}; window.chartStat=()=>{};
// 桩 openTrendModal 为 spy（覆盖 trend.js 原实现，避免真实 fetch）
window.openTrendModal=(c)=>{ (window.__otm=window.__otm||[]).push(c); };

let fails=0;
function assert(n,c){ if(!c){ console.error('FAIL: '+n); fails++; } else console.log('PASS: '+n); }
if(typeof window.renderWatch!=='function'){ console.error('FAIL: renderWatch 未定义'); process.exit(1); }
if(typeof window.renderDetailHead!=='function'){ console.error('FAIL: renderDetailHead 未定义'); process.exit(1); }

// ============ A：自选列表(中栏)移除走势按钮 ============
S.watch=[{code:'sh600519',kind:'stock',cat:'def'},{code:'003304',kind:'fund',cat:'def'}];
S.watchView='list'; window.renderWatch();
let h=window.document.getElementById('watchBox').innerHTML;
assert('列表视图：自选不含 wl-trend', h.indexOf('wl-trend')<0);
S.watchView='overview'; window.renderWatch();
h=window.document.getElementById('watchBox').innerHTML;
assert('整体视图：自选不含 wl-trend', h.indexOf('wl-trend')<0);

// ============ B：右侧 K线详情头部「名称后」有按钮 ============
S.selected='sh600519'; S.watch=[{code:'sh600519',kind:'stock',cat:'def'}];
window.renderDetailHead();
const tb=window.document.getElementById('dTrendBtn');
assert('右侧详情头部存在 #dTrendBtn', !!tb);
window.__otm=[];
tb.click();
assert('点击详情走势按钮→openTrendModal(sh600519)', (window.__otm||[])[0]==='sh600519');

// ============ C：右侧基金工作区头部也有按钮 ============
S.selected='003304'; S.watch=[{code:'003304',kind:'fund',cat:'def'}];
window.showMarketFund('003304');
const ftb=window.document.getElementById('mFTrendBtn');
assert('基金工作区头部存在 #mFTrendBtn', !!ftb);
window.__otm=[];
ftb.click();
assert('点击基金走势按钮→openTrendModal(003304)', (window.__otm||[])[0]==='003304');

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (走势按钮：中栏移除·右侧名称后新增·点击生效)');
process.exit(fails?1:0);
