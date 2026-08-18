/* 行业全景作战图 v2 回归测试（jsdom 实跑，零网络） */
const {JSDOM}=require('jsdom');
const fs=require('fs'); const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const html='<!doctype html><html><body>'
 +'<div id="panGlobal"></div><div id="panHeat"></div><div id="panFund"></div><div id="panOpps"></div><div id="panNews"></div>'
 +'<div id="homePanorama"></div></body></html>';
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom; global.window=window; global.document=window.document;
window.save=()=>{}; window.toast=()=>{};
window.needsFund=()=>false; window.loadFund=()=>{}; window.refreshQuotes=()=>{};
window.showMarketFund=()=>{}; window.renderQuoteBoard=()=>{};
window.paintCanvasMsg=()=>{}; window.drawNav=()=>{}; window.chartStat=()=>{};
window.selectCode=()=>{}; window.showView=()=>{};
// 注入小规模行业池（避免加载 sectors.js 的 DOM 依赖），让 buildIndustryKW 用真实结构
window.INDUSTRY_POOL=[
  {name:'芯片/半导体',code:'512760',etf:'芯片ETF'},
  {name:'新能源车',code:'515030',etf:'新能源车ETF'},
  {name:'医药/医疗',code:'159992',etf:'创新药ETF'},
];
const files=['js/utils.js','js/moneyflow.js','js/industry-panorama.js'];
let combined=''; for(const f of files) combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n';
try{ window.eval(combined); }catch(e){ console.error('eval fail',e); process.exit(1); }
const P=window.__pan;
let fails=0; const A=(c,m)=>{ if(!c){ console.log('  ✗ '+m); fails++; } else console.log('  ✓ '+m); };

console.log('— 纯函数 —');
A(P.contPos([1,2,3,4,5])===5,'contPos 全正=5');
A(P.contPos([-1,-2])===0,'contPos 全负=0');
A(P.contPos([1,-1,2])===1,'contPos 末段中断=1(仅最后一天流入)');
A(P.heatColor(0.04)==='#c0152f','heatColor 大涨深红');
A(P.heatColor(0.02)==='#e23b3b','heatColor 涨红');
A(P.heatColor(-0.04)==='#0c7a47','heatColor 大跌深绿');
A(P.heatColor(-0.02)==='#1aa260','heatColor 跌绿');
A(P.heatColor(null)==='#e9edf3','heatColor 缺数据灰');

console.log('— 新闻方向匹配 —');
const titles=['半导体板块迎来利好大涨','新能源车销量超预期增长','医药集采利空大跌','足球比赛报道无关'];
const dir=P.matchNewsToIndustry(titles);
A(dir['512760']&&dir['512760'].count===1&&dir['512760'].dir==='up','芯片/半导体命中1条·利好');
A(dir['515030']&&dir['515030'].count===1&&dir['515030'].dir==='up','新能源车命中1条·利好');
A(dir['159992']&&dir['159992'].count===1&&dir['159992'].dir==='down','医药/医疗命中1条·利空');
A(!dir['512760']||dir['512760'].count===1,'无关新闻不污染(足球不计)');

console.log('— DOM 渲染 —');
const rows=[
  {name:'芯片/半导体',code:'512760',etf:'',day:2.3,_st:{state:'bull',label:'强上升',tip:'均线多头排列，量价配合'},_flowDays:{err:null,days:[1e8,2e8,3e8,4e8,5e8],last:5e8,cont:5},_pct3y:0.6},
  {name:'新能源车',code:'515030',etf:'',day:-1.2,_st:{state:'down',label:'下跌中',tip:'空头主导'},_flowDays:{err:null,days:[-1e8,-2e8,-3e8,-4e8,-5e8],last:-5e8,cont:0},_pct3y:0.3},
  {name:'医药/医疗',code:'159992',etf:'',day:null,klMiss:true,_st:null,_flowDays:{err:'net'},_pct3y:null},
];
P.renderHeatmap(rows);
const heat=window.document.getElementById('panHeat');
A(heat.querySelectorAll('.heat-cell').length===3,'热力图渲染 3 个色块');
A(heat.querySelector('.heat-cell').getAttribute('style').indexOf('#')>=0,'色块带背景色');

P.renderFundTrend(rows);
const fund=window.document.getElementById('panFund');
A(fund.querySelectorAll('.fl-row').length>=2,'资金走向渲染行(流入/流出Top)');
A(fund.innerHTML.indexOf('芯片/半导体')>=0&&fund.innerHTML.indexOf('新能源车')>=0,'资金行含两个行业');

P.renderOpps(rows);
const opps=window.document.getElementById('panOpps');
A(opps.querySelectorAll('.opp-row').length===1,'机会清单仅含强上升(1条, 下跌/缺数据不进)');
A(opps.innerHTML.indexOf('芯片/半导体')>=0,'机会清单含芯片');

P.renderNewsDir({512760:{name:'芯片/半导体',count:3,bull:2,bear:0,dir:'up'},159992:{name:'医药/医疗',count:2,bull:0,bear:2,dir:'down'}},null);
const news=window.document.getElementById('panNews');
A(news.querySelectorAll('.nd-row').length===2,'新闻方向渲染 2 行');
A(news.innerHTML.indexOf('▲利好')>=0&&news.innerHTML.indexOf('▼利空')>=0,'新闻方向含利好/利空箭头');

console.log('— 降级 —');
P.renderNewsDir(null,true);
A(window.document.getElementById('panNews').innerHTML.indexOf('新闻源暂不可用')>=0,'新闻源失败→诚实降级文案');
P.renderFundTrend([]);
A(window.document.getElementById('panFund').innerHTML.indexOf('加载中或暂不可用')>=0,'资金无数据→降级文案');
P.renderGlobalBar(rows,true,true,2);
A(window.document.getElementById('panGlobal').querySelectorAll('.gb-item').length>=4,'全局状态条渲染>=4项');

console.log(fails? ('\n❌ '+fails+' 项失败') : '\n✅ 全部通过 (行业全景作战图 v2 回归)');
process.exit(fails?1:0);
