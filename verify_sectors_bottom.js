/* 行业雷达·「短期底部入场机会」新列 验证：
 * 1) 单元：sectorBottom 纯函数各类输入（强底部/高波动降级/无回调/缺数据/上行）输出正确。
 * 2) 集成：renderSectors 全量实跑
 *    - 用「下跌后止跌」K线 → 新列应出现 op-strong/op-mid/op-weak 真实标签（非全“—”）
 *    - 用「上涨趋势」K线 → 新列应全“—”（无回调前置不满足）
 *    - 表头含「短期底部入场机会」、表下含描述性免责说明 div
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
function genKlUp(n){ let c=1.0; const s=Date.parse('2026-01-01'); const a=[]; for(let i=0;i<n;i++){ const o=c; c=c*1.004; const d=new Date(s+i*864e5).toISOString().slice(0,10); a.push(d+','+o.toFixed(3)+','+c.toFixed(3)+','+(c*1.02).toFixed(3)+','+(o*0.98).toFixed(3)+',1000000'); } return a; }
function genKlBottom(n){ let c=2.0; const s=Date.parse('2026-01-01'); const a=[]; const ph=i=> i<45?0.985 : (i<65?0.995:1.02); for(let i=0;i<n;i++){ const o=c; c=o*ph(i); const hi=Math.max(o,c)*1.01, lo=Math.min(o,c)*0.99; const d=new Date(s+i*864e5).toISOString().slice(0,10); a.push(d+','+o.toFixed(3)+','+c.toFixed(3)+','+hi.toFixed(3)+','+lo.toFixed(3)+',1000000'); } return a; }

let emSeries=genKlUp(70);
window.fetch=function(url){
  if(url.indexOf('qt.gtimg.cn')>=0){ return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Buffer.from('v_sh515050="1~ETF~515050~1.10~1.00~1.12~9930090~4823060~5102900~1.10~947~1.060~156749~1.00~1.05~+5.00%~..."','utf-8'))}); }
  if(url.indexOf('push2his.eastmoney.com')>=0){ return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:emSeries}})}); }
  return Promise.resolve({ok:false,status:501,json:()=>Promise.resolve({})});
};

let fails=0;
function assert(name,cond){ if(!cond){ console.error('FAIL: '+name); fails++; } else { console.log('PASS: '+name); } }

(async()=>{
  if(typeof window.sectorBottom!=='function'){ console.error('FAIL: sectorBottom 未定义'); process.exit(1); }

  // ---------- 单元：sectorBottom 纯函数 ----------
  const indAll={rsi:20, macd:{state:'crossUp'}, bb:{pos:0.1}, bias:-8, vol:{ann:30,regime:'contract'}};
  const cAll={c5:-1, c20:-12, c60:-30};
  const r3=window.sectorBottom(cAll, indAll);
  assert('强底部信号: tier=3/label=强底部信号', r3.tier===3 && r3.label==='强底部信号' && r3.cls==='op-strong');

  // 高波动下行途中 → 封顶关注(tier<=1)
  const indHV={rsi:20, macd:{state:'crossUp'}, bb:{pos:0.1}, bias:-8, vol:{ann:70,regime:'expand'}};
  const rHV=window.sectorBottom(cAll, indHV);
  assert('高波动下行封顶: tier<=1', rHV.tier<=1);

  // 无回调前置 → “—”
  const rNo=window.sectorBottom({c5:2,c20:5,c60:10}, indAll);
  assert('无回调(上行) → “—”', rNo.label==='—' && rNo.cls==='op-none');

  // 缺数据 → “—”
  assert('缺 ind → “—”', window.sectorBottom(cAll,null).label==='—');

  // 温和回调但仅1信号 → 关注(tier=1)
  const ind1={rsi:50, macd:{state:'bear'}, bb:{pos:0.5}, bias:1, vol:{ann:20,regime:'steady'}};
  const r1=window.sectorBottom({c5:-3, c20:-8, c60:-12}, ind1);
  assert('单一止跌信号 → 关注(tier=1)', r1.tier===1 && r1.label==='关注');

  // ---------- 集成：renderSectors 新列渲染 ----------
  if(typeof window.renderSectors!=='function'){ console.error('FAIL: renderSectors 未定义'); process.exit(1); }

  // A) 下跌后止跌 K线
  emSeries=genKlBottom(70);
  await window.renderSectors();
  const bodyA=window.document.getElementById('sectorsBody').innerHTML;
  assert('A 表头含「短期底部入场机会」', bodyA.includes('短期底部入场机会'));
  assert('A 表下含描述性免责说明(sectors-note)', bodyA.includes('sectors-note') && bodyA.includes('不预测未来涨跌'));
  const opTagsA=(bodyA.match(/op-tag/g)||[]).length;
  const realBottomA=/op-strong|op-mid|op-weak/.test(bodyA);
  assert('A 新列出现真实底部标签(op-strong/mid/weak) 且不为空', opTagsA>=1 && realBottomA);

  // B) 上涨趋势 K线（无回调）→ 新列应全“—”
  emSeries=genKlUp(70);
  await window.renderSectors();
  const bodyB=window.document.getElementById('sectorsBody').innerHTML;
  assert('B 上行行情新列无“强底部信号”', !bodyB.includes('强底部信号'));
  assert('B 新列显示“—”(op-none 存在)', bodyB.includes('op-none'));

  console.log('\n'+(fails===0 ? '✅ 行业雷达·短期底部入场机会 新列验证通过（单元 + 集成双场景）' : ('❌ 有 '+fails+' 项失败')));
  process.exit(fails===0?0:1);
})();
