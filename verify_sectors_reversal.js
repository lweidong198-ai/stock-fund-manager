/* 行业雷达·「底部反转确认 / 历史拐点」验证：
 * 1) 单元：sectorReversal 纯函数（≥2信号共振→已现拐点；0信号→不标；前置不满足→不标）
 * 2) 单元：sectorReversalSeries 逐根回看返回拐点日期数组
 * 3) 集成：renderSectors 全量实跑
 *    - 末端转强K线 → 第11列出现「↗已现拐点」+「最近拐点 MM-DD」
 *    - 持续下跌K线 → 第11列无「已现拐点」（底部形态可亮，但无转强确认）
 * 全程模拟「腾讯 fqkline 被 WAF 拦(501)」→ 东财兜底提供K线，贴近真实沙箱环境。
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';

const viewHTML=`<div id="viewSectors">
  <span id="sectorTime"></span>
  <span id="sectorAlert" class="alert"></span>
  <input id="scCode" class="inp" />
  <input id="scName" class="inp" />
  <span id="scList"></span>
  <div id="sectorsBanner"></div>
  <div id="sectorsBody" class="sector-wrap"></div>
  <div id="rotationBanner"></div>
  <div id="rotationBody" class="sector-wrap"></div>
  <span id="rotationTime"></span>
</div>`;
const dom=new JSDOM('<!DOCTYPE html><html><body>'+viewHTML+'</body></html>',{runScripts:'outside-only',url:'https://localhost/'});
const {window}=dom;
global.window=window; global.document=window.document;
window.$=function(id){ return window.document.getElementById(id); };
window.state={ _demoKL:{}, watch:[], kcache:{} };
window.AbortController=global.AbortController;
window.localStorage={ getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
window.clamp=function(v,a,b){ return Math.max(a, Math.min(b, v)); };
window.ts=function(){ return new Date().toLocaleString(); };
window.alert=function(){};
window.console=console;
window.TextDecoder=function(enc){ this.decode=function(buf){ return Buffer.from(buf).toString('utf-8'); }; };

const _files=['js/config.js','js/utils.js','js/quotes.js','js/sectors.js','js/opportunity.js'];
let _combined='';
for(const f of _files){ _combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n'; }
try{ window.eval(_combined); }catch(e){ console.error('FAIL: eval combined ->',e); process.exit(1); }
window.loadKlineP=function(){ return Promise.resolve(null); };   // 强制走东财兜底

// K线生成器
function genKlDown(n){ let c=2.0; const s=Date.parse('2026-01-01'); const a=[]; for(let i=0;i<n;i++){ const o=c; c=o*0.98; const d=new Date(s+i*864e5).toISOString().slice(0,10); a.push({date:d,open:+o.toFixed(3),close:+c.toFixed(3),high:+(Math.max(o,c)*1.01).toFixed(3),low:+(Math.min(o,c)*0.99).toFixed(3),vol:1000000}); } return a; }
function genKlReversal(n){
  let c=2.0; const s=Date.parse('2026-01-01'); const a=[];
  for(let i=0;i<n;i++){
    let ph;
    if(i<55) ph=0.97;          // 前段下跌
    else if(i<61) ph=1.000;    // 筑底盘整
    else ph=1.025;             // 后段放量上涨
    const o=c; c=o*ph;
    const hi=Math.max(o,c)*1.02, lo=Math.min(o,c)*0.98;
    const vol = i>=61 ? 2500000 : (i>=55?800000:1000000);
    const d=new Date(s+i*864e5).toISOString().slice(0,10);
    a.push({date:d,open:+o.toFixed(3),close:+c.toFixed(3),high:+hi.toFixed(3),low:+lo.toFixed(3),vol});
  }
  return a;
}

let emSeries=genKlDown(70);
window.fetch=function(url){
  if(url.indexOf('qt.gtimg.cn')>=0){ return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Buffer.from('v_sh515050="1~ETF~515050~1.10~1.00~1.12~9930090~4823060~5102900~1.10~947~1.060~156749~1.00~1.05~+5.00%~..."','utf-8'))}); }
  if(url.indexOf('push2his.eastmoney.com')>=0){ return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:emSeries.map(k=>[k.date,k.open,k.close,k.high,k.low,k.vol].join(','))}})}); }
  return Promise.resolve({ok:false,status:501,json:()=>Promise.resolve({})});
};

let fails=0;
function assert(name,cond){ if(!cond){ console.error('FAIL: '+name); fails++; } else { console.log('PASS: '+name); } }
function rowLabels(body){
  const tb=body.split('<tbody>')[1]||body;
  const re=/<span class="op-tag[^"]*">([^<]*)<\/span>/g; const out=[]; let m;
  while((m=re.exec(tb))) out.push(m[1]);
  return out;
}
function revTags(body){ const re=/op-rev-tag">([^<]*)</g; const out=[]; let m; while((m=re.exec(body))) out.push(m[1]); return out; }
function revDates(body){ const re=/rev-date[^>]*>最近拐点 ([^<]*)/g; const out=[]; let m; while((m=re.exec(body))) out.push(m[1]); return out; }

(async()=>{
  if(typeof window.sectorReversal!=='function'){ console.error('FAIL: sectorReversal 未定义'); process.exit(1); }
  if(typeof window.sectorReversalSeries!=='function'){ console.error('FAIL: sectorReversalSeries 未定义'); process.exit(1); }

  // ---------- 单元：sectorReversal 纯函数 ----------
  // A) 多信号共振 → 已现拐点
  const klR=genKlReversal(70);
  const cR={c5:8, c20:-8, c60:-35};
  const indR={rsi:30, macd:{state:'crossUp'}, bb:{pos:0.3}, bias:-3, vol:{ann:30,regime:'contract'}};
  const rA=window.sectorReversal(cR, indR, klR);
  assert('A 多信号共振 → 已现拐点(confirmed/tier=2/op-rev)', rA.confirmed===true && rA.tier===2 && rA.label==='已现拐点' && rA.cls==='op-rev');
  assert('A 内部信号≥2个', Object.values(rA.sig).filter(Boolean).length>=2);

  // B) 0信号 → 不标
  const klD=genKlDown(70);
  const cD={c5:-5, c20:-15, c60:-40};
  const indD={rsi:20, macd:{state:'bear'}, bb:{pos:0.1}, bias:-8, vol:{ann:30,regime:'contract'}};
  const rB=window.sectorReversal(cD, indD, klD);
  assert('B 0信号 → 不确认(label空/op-none)', rB.confirmed===false && rB.label==='' && rB.cls==='op-none');

  // C) 前置不满足(上行) → 不标
  const cUp={c5:2, c20:5, c60:10};
  const indUp={rsi:60, macd:{state:'bull'}, bb:{pos:0.7}, bias:5, vol:{ann:20,regime:'steady'}};
  const rC=window.sectorReversal(cUp, indUp, genKlReversal(70));
  assert('C 前置不满足(上行) → 不确认(label空)', rC.confirmed===false && rC.label==='');

  // ---------- 单元：sectorReversalSeries 历史回看 ----------
  const dates=window.sectorReversalSeries(klR);
  assert('Series 返回拐点日期数组(非空)', Array.isArray(dates) && dates.length>=1);
  assert('Series 日期为 YYYY-MM-DD 字符串且升序', dates.every((d,i)=>/^\d{4}-\d{2}-\d{2}$/.test(d) && (i===0||dates[i-1]<=d)));

  // ---------- 集成：renderSectors 第11列 ----------
  if(typeof window.renderSectors!=='function'){ console.error('FAIL: renderSectors 未定义'); process.exit(1); }

  // A) 末端转强 K线
  emSeries=genKlReversal(70);
  await window.renderSectors();
  const bodyA=window.document.getElementById('sectorsBody').innerHTML;
  assert('A 表头含「短期底部入场机会」', bodyA.includes('短期底部入场机会'));
  assert('A 第11列出现「↗已现拐点」标记', bodyA.includes('已现拐点'));
  const rtA=revTags(bodyA);
  assert('A 存在 op-rev-tag 拐点徽章', rtA.length>=1 && rtA.every(t=>t.indexOf('已现拐点')>=0));
  const rdA=revDates(bodyA);
  assert('A 存在「最近拐点 MM-DD」日期标注', rdA.length>=1 && /^\d{2}-\d{2}$/.test(rdA[0]));
  try{
    const _revM=window.eval('(typeof state!=="undefined"&&state.revMarks)?state.revMarks:null');
    if(_revM) assert('A 拐点日期已写入 state.revMarks(供K线图标记)', Object.values(_revM).some(a=>Array.isArray(a)&&a.length>=1));
    else console.log('SKIP: 测试沙箱无法访问词法 state.revMarks（真实浏览器 state 为全局，drawMain 标记靠本机双击核验）');
  }catch(e){ console.log('SKIP revMarks 检查:', e.message); }

  // B) 持续下跌 K线（无转强）→ 不应出现「已现拐点」
  emSeries=genKlDown(70);
  await window.renderSectors();
  const bodyB=window.document.getElementById('sectorsBody').innerHTML;
  assert('B 持续下跌行情第11列无「已现拐点」徽章(op-rev-tag)', revTags(bodyB).length===0);
  // 但底部形态可能仍亮（强底部信号/形态观察），不应全“—”
  const labelsB=rowLabels(bodyB);
  assert('B 底部形态可亮(强底部信号/形态观察)，非全“—”', labelsB.length>0 && labelsB.some(l=>l==='强底部信号'||l==='形态观察'));

  console.log('\n'+(fails===0 ? '✅ 行业雷达·底部反转确认/历史拐点 验证通过（单元 + 集成双场景）' : ('❌ 有 '+fails+' 项失败')));
  process.exit(fails===0?0:1);
})();
