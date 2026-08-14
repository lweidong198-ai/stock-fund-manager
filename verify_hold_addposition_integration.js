/* 持仓·手动加仓 集成测试（真实链路）：
 * 用完整 index.html 作 DOM，eval 真实 config+utils+quotes+sectors+detail，
 * 注入一只持仓 + 现价，渲染持仓表，模拟点击「加仓」按钮（填入金额），
 * 断言 state.hold 的数量与加权均价被真实改写。
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
// jsdom 自带 localStorage / console / alert；只需补 TextDecoder（detectKind 用到）与存根 save/toast
if(!window.TextDecoder && global.TextDecoder) window.TextDecoder=global.TextDecoder;
window.save=()=>{}; window.toast=(m)=>{ window.__toast=String(m); };
// renderHold 内引用的自由变量打桩（避免引入整棵 fund.js 依赖树）
window.needsFund=()=>false; window.loadFund=()=>{};
window.refreshQuotes=()=>{}; window.renderWatch=()=>{}; window.renderDetail=()=>{};
window.ensureStockQuote=()=>Promise.resolve(); window.detectKind=()=>Promise.resolve({code:'',kind:'stock'});

const _files=['js/config.js','js/utils.js','js/quotes.js','js/indicators.js','js/sectors.js','js/detail.js'];
let _combined='';
for(const f of _files){ _combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n'; }
_combined+='\n;window.__state=state;\n';   // 导出词法 state 供测试直接改（同对象引用）
try{ window.eval(_combined); }catch(e){ console.error('FAIL: eval combined ->',e); process.exit(1); }
const S=window.__state;

let fails=0;
function assert(name,cond){ if(!cond){ console.error('FAIL: '+name); fails++; } else { console.log('PASS: '+name); } }
if(typeof window.renderHold!=='function'){ console.error('FAIL: renderHold 未定义'); process.exit(1); }
if(typeof window.addPositionCash!=='function'){ console.error('FAIL: addPositionCash 未定义'); process.exit(1); }

// 注入一只股票持仓 + 现价
S.hold=[{code:'sh600519',kind:'stock',shares:1000,cost:10}];
S.quotes={'sh600519':{price:12,changePct:1.5,name:'测试股'}};
S.selected=null;
window.renderHold();

// 找到该持仓行的「加仓」按钮与金额输入框
const code='sh600519';
const btn=window.document.querySelector('button[data-hadd="'+code+'"]');
const inp=window.document.querySelector('input[data-ac="cash"][data-code="'+code+'"]');
assert('渲染出加仓按钮', !!btn);
assert('渲染出买入金额输入框', !!inp);

// 填入“今天买入 1200 元”并点击
inp.value='1200';
btn.click();

const h=S.hold[0];
assert('点击后数量 1000→1100', h.shares===1100);
assert('点击后加权均价≈10.1818', Math.abs(h.cost-10.1818)<0.001);
assert('toast 提示加仓成功', /加仓成功/.test(window.__toast||''));

// 再测一次基金：无旧仓、净值1.5、买100元 → 66.66 份，均价1.5
S.hold=[{code:'003304',kind:'fund',shares:0,cost:0}];
S.fundData={'003304':{name:'基金X',latest:1.5,prev:1.4,nav:[],cum:[]}};
window.renderHold();
const btn2=window.document.querySelector('button[data-hadd="003304"]');
const inp2=window.document.querySelector('input[data-ac="cash"][data-code="003304"]');
inp2.value='100'; btn2.click();
const hf=S.hold[0];
assert('基金加仓份额≈66.66', Math.abs(hf.shares-66.66)<0.001);
assert('基金无旧仓均价=1.5', Math.abs(hf.cost-1.5)<0.001);

// 金额不足 1 手：股票现价12、买100元 → 失败、数量不变
S.hold=[{code:'sh600519',kind:'stock',shares:1000,cost:10}];
S.quotes={'sh600519':{price:12,changePct:1.5,name:'测试股'}};
window.renderHold();
const btn3=window.document.querySelector('button[data-hadd="sh600519"]');
const inp3=window.document.querySelector('input[data-ac="cash"][data-code="sh600519"]');
inp3.value='100'; btn3.click();
const h3=S.hold[0];
assert('金额不足时数量不变(仍1000)', h3.shares===1000);
assert('金额不足时 toast 给出失败提示', /不足|⚠/.test(window.__toast||''));

// ============ 减仓（减仓按钮真实点击） ============
// 股票持仓1000股@10，现价12，减仓输入1200元 → 卖100股、余900、成本不变、实现盈亏200
S.hold=[{code:'sh600519',kind:'stock',shares:1000,cost:10}];
S.quotes={'sh600519':{price:12,changePct:1.5,name:'测试股'}};
window.renderHold();
const rbtn=window.document.querySelector('button[data-hred="sh600519"]');
const rinp=window.document.querySelector('input[data-rc="cash"][data-code="sh600519"]');
assert('渲染出减仓按钮', !!rbtn);
assert('渲染出卖出金额输入框', !!rinp);
rinp.value='1200'; rbtn.click();
const hr=S.hold[0];
assert('减仓后数量 1000→900', hr.shares===900);
assert('减仓后成本价不变(=10)', Math.abs(hr.cost-10)<1e-9);
assert('减仓 toast 提示成功', /减仓成功/.test(window.__toast||''));

// 减仓卖超拦截：持仓100股，填100000 → 失败、数量不变
S.hold=[{code:'sh600519',kind:'stock',shares:100,cost:10}];
S.quotes={'sh600519':{price:12,changePct:1.5,name:'测试股'}};
window.renderHold();
const rbtn2=window.document.querySelector('button[data-hred="sh600519"]');
const rinp2=window.document.querySelector('input[data-rc="cash"][data-code="sh600519"]');
rinp2.value='100000'; rbtn2.click();
const hr2=S.hold[0];
assert('减仓卖超时数量不变(仍100)', hr2.shares===100);
assert('减仓卖超 toast 提示失败', /超过持仓|⚠/.test(window.__toast||''));

// 减仓清仓：持仓100股@10，现价12，减仓1200元 → 余0、成本0
S.hold=[{code:'sh600519',kind:'stock',shares:100,cost:10}];
S.quotes={'sh600519':{price:12,changePct:1.5,name:'测试股'}};
window.renderHold();
const rbtn3=window.document.querySelector('button[data-hred="sh600519"]');
const rinp3=window.document.querySelector('input[data-rc="cash"][data-code="sh600519"]');
rinp3.value='1200'; rbtn3.click();
const hr3=S.hold[0];
assert('减仓清仓后数量=0', hr3.shares===0);
assert('减仓清仓后成本=0', hr3.cost===0);

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (集成·真实点击链路：加仓/减仓/边界)');
process.exit(fails?1:0);
