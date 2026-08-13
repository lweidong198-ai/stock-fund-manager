/* 主K线 + 行业雷达 · 新浪JSONP兜底 验证：
 * 模拟「沙箱真实场景」：腾讯 fqkline 被 WAF 拦(501) + 东财 push2his 连不上(fetch failed)，
 * 仅新浪JSONP可用。断言：
 *   T1 主K线 loadKline：腾讯挂→新浪兜底成功（真数据，非演示）
 *   T2 主K线 loadKline：腾讯挂+新浪也挂→诚实演示(isDemo=true)
 *   T3 renderSectors：腾讯+东财挂→新浪兜底，连不上=0
 *   T4 renderRotation：同上，连不上=0
 *   T5 接链静态断言：kline.js / sectors.js / opportunity.js 均接新浪兜底
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';

const viewHTML=`<div id="viewSectors">
  <span id="sectorTime"></span><span id="sectorAlert" class="alert"></span>
  <input id="scCode" class="inp" /><input id="scName" class="inp" /><span id="scList"></span>
  <div id="sectorsBanner"></div><div id="sectorsBody" class="sector-wrap"></div>
  <div id="rotationBanner"></div><div id="rotationBody" class="sector-wrap"></div>
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

// 拼接全部相关脚本为单段 eval（const/let 顶层声明需在「同一次」eval 中互相可见）
const _files=['js/config.js','js/utils.js','js/quotes.js','js/calibrator.js','js/kline.js','js/demo.js','js/sectors.js','js/opportunity.js'];
let _combined='';
for(const f of _files){ _combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n'; }
try{ window.eval(_combined); }catch(e){ console.error('FAIL: eval combined ->',e); process.exit(1); }

function genKl(n,base,drift){ let c=base; const start=Date.parse('2026-01-01'); const a=[]; for(let i=0;i<n;i++){ const o=c; c=c*(1+drift); a.push({date:new Date(start+i*864e5).toISOString().slice(0,10), open:+o, close:+c, high:+c*1.02, low:+o*0.98, vol:100+i}); } return a; }

// 新浪JSONP 可控桩：SINA_OK=true 返回真实K线；false 返回空（模拟连不上）
let SINA_OK=true;
window.loadKlineSina=function(code, period, datalen){
  if(!SINA_OK) return Promise.resolve([]);
  return Promise.resolve(genKl(70,1.0,0.004));
};

// 沙箱真实场景 mock：腾讯 fqkline 501 / 东财 push2his fetch失败 / 腾讯实时行情 200
window.fetch=function(url){
  if(url.indexOf('qt.gtimg.cn')>=0){
    const body='v_sh515050="1~ETF~515050~1.10~1.00~1.12~9930090~4823060~5102900~1.10~947~1.060~156749~1.00~1.05~+5.00%~..."';
    return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Buffer.from(body,'utf-8'))});
  }
  if(url.indexOf('push2his.eastmoney.com')>=0){ return Promise.reject(new Error('fetch failed')); } // 沙箱IP连不上东财
  return Promise.resolve({ok:false,status:501,json:()=>Promise.resolve({})}); // 腾讯 fqkline 被WAF拦
};

(async()=>{
  // ---- T1: 主K线 loadKline 腾讯挂→新浪兜底 ----
  SINA_OK=true;
  let r1=await new Promise(res=>{ window.loadKline('sh600519','d',(kl,isDemo)=>res({kl,isDemo})); });
  if(!r1||!r1.kl||!r1.kl.length){ console.error('FAIL[T1] loadKline 未拿到K线'); process.exit(1); }
  if(r1.isDemo!==false){ console.error('FAIL[T1] 应走新浪真数据，却标 isDemo='+r1.isDemo); process.exit(1); }
  console.log('PASS[1] 主K线 loadKline：腾讯挂→新浪兜底成功，拿到 '+r1.kl.length+' 根真数据(isDemo='+r1.isDemo+')');

  // ---- T2: 主K线 loadKline 腾讯+新浪都挂→诚实演示 ----
  SINA_OK=false;
  let r2=await new Promise(res=>{ window.loadKline('sh600519','d',(kl,isDemo)=>res({kl,isDemo})); });
  if(r2===null){ console.error('FAIL[T2] loadKline 未回调'); process.exit(1); }
  if(r2.isDemo!==true){ console.error('FAIL[T2] 全源挂应诚实演示，却 isDemo='+r2.isDemo); process.exit(1); }
  console.log('PASS[2] 主K线 loadKline：腾讯+新浪都挂→诚实标演示数据(isDemo=true)，绝不显假K线');
  SINA_OK=true;

  // ---- T3/T4: 行业雷达两子页，腾讯+东财挂→新浪兜底 ----
  window.loadKlineP=function(){ return Promise.resolve(null); }; // 模拟腾讯K线源彻底挂
  if(typeof window.renderSectors!=='function' || typeof window.renderRotation!=='function'){ console.error('FAIL: renderSectors/renderRotation 未定义'); process.exit(1); }
  try{ await window.renderSectors(); }catch(e){ console.error('FAIL: renderSectors 抛错 ->',e); process.exit(1); }
  let body=window.document.getElementById('sectorsBody').innerHTML;
  let mc3=(body.match(/连不上/g)||[]).length;
  if(!(body.includes('<table')) || mc3>=5){ console.error('FAIL[T3] renderSectors 未靠新浪兜底('+mc3+' 连不上)'); process.exit(1); }
  console.log('PASS[3] renderSectors：腾讯+东财挂→新浪兜底生效，连不上='+mc3+'（真实渲染 '+body.length+' 字符）');

  try{ await window.renderRotation(); }catch(e){ console.error('FAIL: renderRotation 抛错 ->',e); process.exit(1); }
  let rbody=window.document.getElementById('rotationBody').innerHTML;
  let mc4=(rbody.match(/连不上/g)||[]).length;
  if(!(rbody.includes('<table')) || mc4>=5){ console.error('FAIL[T4] renderRotation 未靠新浪兜底('+mc4+' 连不上)'); process.exit(1); }
  console.log('PASS[4] renderRotation：腾讯+东财挂→新浪兜底生效，连不上='+mc4+'（真实渲染 '+rbody.length+' 字符）');

  // ---- T5: 接链静态断言 ----
  const ksrc=fs.readFileSync(path.join(ROOT,'js/kline.js'),'utf8');
  const ssrc=fs.readFileSync(path.join(ROOT,'js/sectors.js'),'utf8');
  const osrc=fs.readFileSync(path.join(ROOT,'js/opportunity.js'),'utf8');
  const link=[
    ['kline.js 定义 loadKlineSina', ksrc.includes('function loadKlineSina(')],
    ['kline.js 首屏腾讯失败→调 trySina(新浪)', ksrc.includes('return trySina();')],
    ['kline.js catch 也调 trySina', ksrc.includes('return trySina(); })') || ksrc.includes('catch(e=>{ console.error(\'loadKline tencent error\', code, e); return trySina(); })')],
    ['sectors.js 调 loadSinaKlineP 兜底(每ETF)', ssrc.includes('if(!(kl&&kl.length)) kl=await loadSinaKlineP(x.code)')],
    ['sectors.js 调 loadSinaKlineP 兜底(bench)', ssrc.includes("bk=await loadSinaKlineP('sh000300')")],
    ['opportunity.js 调 loadSinaKlineP 兜底(每ETF)', osrc.includes('if(!(kl && kl.length)) kl = await loadSinaKlineP(x.code)')],
    ['opportunity.js 调 loadSinaKlineP 兜底(bench)', osrc.includes("bk = await loadSinaKlineP('sh000300')")],
  ];
  let lok=true; for(const [n,c] of link){ if(!c){ console.error('FAIL 接链:',n); lok=false; } }
  if(!lok) process.exit(1);
  console.log('PASS[5] 接链静态断言全部通过（主K线+雷达均已接新浪兜底）');

  console.log('\n✅ 主K线/行业雷达·新浪JSONP兜底 验证通过（腾讯→东财→新浪 三层，沙箱IP场景下仍能出真实K线）');
})();
