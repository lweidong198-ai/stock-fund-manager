/* verify_industry_panorama.js —— 行业全景面板离线回归（jsdom 实跑，不依赖网络）
 * 断言：
 *  A. pricePercentile：最低→0、最高→1、中位→0.5
 *  B. sortIndustryRows：七态强弱排序（bull 在 down 前；缺数据排末）
 *  C. paintIndustryPanorama：表头7列齐全；每行含七态徽章/涨跌/冷热/强弱分；点行调用 selectCode+showView
 *  D. 降级：klMiss 行显示为「连不上」、资金流不崩溃
 */
const {JSDOM}=require('jsdom');
const fs=require('fs'); const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const html='<!doctype html><html><body><div id="homePanoramaBody"></div></body></html>';
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom; global.window=window; global.document=window.document;
let fails=0;
function assert(n,c){ if(!c){ console.error('FAIL: '+n); fails++; } else console.log('PASS: '+n); }

// 加载所需模块（仅函数定义，无顶层网络/DOM副作用）
for(const f of ['js/utils.js','js/moneyflow.js','js/industry-panorama.js']){
  try{ window.eval(fs.readFileSync(path.join(ROOT,f),'utf8')); }
  catch(e){ console.error('FAIL eval '+f+' ->',e); process.exit(1); }
}
const P=window.__pan; if(!P||!P.sortIndustryRows||!P.paintIndustryPanorama){ console.error('FAIL: __pan 未导出'); process.exit(1); }

// ===== A: pricePercentile =====
const mkKl=(arr)=>arr.map((c,i)=>({date:'2026-01-'+(i+1),close:c,open:c,high:c,low:c,vol:1}));
assert('pct最低=0', Math.abs(P.pricePercentile(mkKl([50,40,30,20,10]),5)-0)<1e-9);
assert('pct最高=1', Math.abs(P.pricePercentile(mkKl([10,20,30,40,50]),5)-1)<1e-9);
assert('pct中位=0.5', Math.abs(P.pricePercentile(mkKl([0,100,50]),3)-0.5)<1e-9);
assert('pct数据不足→null', P.pricePercentile(mkKl([10]),5)===null);

// ===== B: sortIndustryRows（七态强弱） =====
const stOf=(s)=>({state:s,label:s,tip:'',lean:''});
const rows=[
  {name:'下跌',code:'a',klMiss:false,_st:stOf('down'),c20:-5},
  {name:'强上',code:'b',klMiss:false,_st:stOf('bull'),c20:8},
  {name:'震荡',code:'c',klMiss:false,_st:stOf('flat'),c20:1},
  {name:'连不上',code:'d',klMiss:true,_st:null,c20:null},
  {name:'拐转',code:'e',klMiss:false,_st:stOf('reversal'),c20:3},
];
const sorted=P.sortIndustryRows(rows);
assert('排序首位是强上升(bull)', sorted[0].name==='强上');
assert('排序末位是连不上(klMiss)', sorted[sorted.length-1].name==='连不上');
const idxBull=sorted.findIndex(r=>r.name==='强上'), idxDown=sorted.findIndex(r=>r.name==='下跌');
assert('bull 排在 down 之前', idxBull<idxDown);

// ===== C: paintIndustryPanorama（渲染+点击） =====
window.selectCode=(c)=>{ (window.__sel=window.__sel||[]).push(c); };
window.showView=(v)=>{ window.__view=v; };
const paintRows=[
  {name:'半导体',etf:'芯片ETF',code:'512760',klMiss:false,day:2.31,c20:11.2,_st:stOf('bull'),_pct3y:0.82,_flow:{main:123456789},_F:{score:6.4}},
  {name:'煤炭',etf:'煤炭ETF',code:'515220',klMiss:false,day:-1.02,c20:-3.4,_st:stOf('down'),_pct3y:0.21,_flow:null,_F:{score:-2.1}},
  {name:'掉线',etf:'X',code:'999999',klMiss:true,day:null,c20:null,_st:null,_pct3y:null,_flow:null,_F:null},
];
P.paintIndustryPanorama(paintRows);
const body=window.document.getElementById('homePanoramaBody');
const htmlTxt=body.innerHTML;
assert('渲染出 7 列表头', (htmlTxt.match(/<th[ >]/g)||[]).length===7);
assert('行数=3', (htmlTxt.match(/<tr data-code=/g)||[]).length===3);
assert('七态徽章 st-bull 存在', htmlTxt.indexOf('st-bull')>=0);
assert('七态徽章 st-down 存在', htmlTxt.indexOf('st-down')>=0);
assert('连不行显示 st-miss', htmlTxt.indexOf('st-miss')>=0);
assert('冷热分位显示 82%', htmlTxt.indexOf('82%')>=0);
assert('资金流主力净流入渲染(亿)', htmlTxt.indexOf('亿')>=0);
assert('强弱分 6.4 渲染', htmlTxt.indexOf('6.4')>=0);
// 点击首行 → selectCode + showView('market')
const firstRow=body.querySelector('tr[data-code]');
firstRow.dispatchEvent(new window.Event('click',{bubbles:true}));
assert('点击行→selectCode(512760)', (window.__sel||[])[0]==='512760');
assert('点击行→showView("market")', window.__view==='market');

// ===== D: 降级不崩溃 =====
P.paintIndustryPanorama([{name:'X',etf:'',code:'x1',klMiss:true,day:null,c20:null,_st:null,_pct3y:null,_flow:null,_F:null}]);
assert('连不行行不抛错且渲染', window.document.getElementById('homePanoramaBody').innerHTML.indexOf('st-miss')>=0);

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (行业全景：冷热分位/七态排序/渲染/点击/降级)');
process.exit(fails?1:0);
