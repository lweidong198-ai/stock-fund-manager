/* =========================================================================
 * verify_radar_demo.js —— 行业雷达「连不上不显示假数据」验收
 * 模拟腾讯接口连不上（loadKline 回调 isDemo=true），验证：
 *   趋势扫描 / 温度计 两张表都不显示演示假数据，而是弹醒目红横幅 + 标灰「连不上」行。
 * 用法：node verify_radar_demo.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const ORDER = ['config.js','utils.js','storage.js','demo.js','quotes.js','calibrator.js','kline.js','fund.js','indicators.js','analysis.js','canvas.js','charts.js','moneyflow.js','sectors.js','opportunity.js','detail.js','datacenter.js','fundanalysis.js','app.js'];

let pass = true; const log = [];
function check(name, cond, detail){ if(cond) log.push('✅ '+name+(detail!==undefined&&detail!==''?' · '+detail:'')); else { pass=false; log.push('❌ '+name+(detail!==undefined&&detail!==''?' · '+detail:'')); } }

function ctxMock(){
  const noop=()=>{};
  return new Proxy({}, { get(t,p){ if(p==='canvas') return {width:300,height:150}; if(p==='measureText') return ()=>({width:0}); if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern') return ()=>({addColorStop:noop}); if(p==='getImageData') return ()=>({data:new Uint8ClampedArray(4)}); return noop; }, set(){ return true; } });
}

(async()=>{
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: '+(e.detail&&e.detail.message||e.message||e)));
  const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\s*<script src="js\//.test(l)).join('\n');
  const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'file://'+ROOT+'/' });
  const { window } = dom;

  // 模拟「腾讯连不上」：loadKline 回调 (null, true) 表示 demo/失败
  window.loadKline = function(code, period, cb){ cb(null, true); };
  // 让真实 fetch 也失败（qt 行情连不上）
  window.fetch = () => Promise.reject(new Error('network blocked (simulated)'));
  if(window.HTMLCanvasElement) window.HTMLCanvasElement.prototype.getContext = function(){ return ctxMock(); };

  for(const f of ORDER){ const s=window.document.createElement('script'); s.textContent=fs.readFileSync(path.join(ROOT,'js',f),'utf8'); window.document.body.appendChild(s); }
  const ev = (code) => window.eval(code);

  // 构造最小运行态
  ev('state.kcache={}; state._demoKL={}; state.watch=[]; state.view="radar"; if(!window.THERMO) window.THERMO={rows:null,regime:null,bench:null,pos1y:null,sort:"c20",demoWarn:""};');
  if(typeof window.markKlineDate!=='function') ev('markKlineDate=function(){};');
  if(typeof window.save!=='function') ev('save=function(){};');

  // ===== 趋势扫描：连不上 =====
  let e1; try{ await ev('renderSectors()'); }catch(e){ e1=e; }
  if(e1) log.push('  (renderSectors 异常: '+e1.message+')');
  const secBody = window.document.getElementById('sectorsBody');
  const secBanner = window.document.getElementById('sectorsBanner');
  const secHtml = secBody ? secBody.innerHTML : '';
  const secBannerHtml = secBanner ? secBanner.innerHTML : '';
  check('趋势扫描-表已渲染', !!secBody && secHtml.includes('<table'));
  check('趋势扫描-弹醒目横幅.demo-warn', secBannerHtml.includes('demo-warn'));
  check('趋势扫描-横幅说明已隐藏假数据', secBannerHtml.includes('已隐藏其假数据'));
  check('趋势扫描-存在标灰.row-miss连不上行', secBody && secBody.querySelectorAll('tr.row-miss').length>0);
  check('趋势扫描-连不上行显示「连不上」', secHtml.includes('连不上'));
  // 关键：表内不应出现任何「假百分比」（排除 -- 占位后不应有 +xx.xx% 或 xx.xx% 形态，因为全是连不上）
  const pctLike = (secHtml.replace(/--/g,'')).match(/\+?\d+\.\d+%/);
  check('趋势扫描-无假百分比数据(未显示 demo 数值)', !pctLike);

  // ===== 温度计：连不上 =====
  let e2; try{ await ev('renderRotation()'); }catch(e){ e2=e; }
  if(e2) log.push('  (renderRotation 异常: '+e2.message+')');
  const rotBody = window.document.getElementById('rotationBody');
  const rotBanner = window.document.getElementById('rotationBanner');
  const rotHtml = rotBody ? rotBody.innerHTML : '';
  const rotBannerHtml = rotBanner ? rotBanner.innerHTML : '';
  check('温度计-表已渲染', !!rotBody && rotHtml.includes('<table'));
  check('温度计-弹醒目横幅.demo-warn', rotBannerHtml.includes('demo-warn'));
  check('温度计-横幅说明已隐藏假数据', rotBannerHtml.includes('已隐藏其假数据'));
  check('温度计-存在标灰.row-miss连不上行', rotBody && rotBody.querySelectorAll('tr.row-miss').length>0);
  check('温度计-连不上行显示「连不上」', rotHtml.includes('连不上'));
  const pctLike2 = (rotHtml.replace(/--/g,'')).match(/\+?\d+\.\d+%/);
  check('温度计-无假百分比数据', !pctLike2);

  // ===== 正常连通(非demo)场景：不应弹横幅 =====
  ev('state._demoKL={};');
  window.loadKline = function(code, period, cb){ cb([], false); }; // 空 kl 但非 demo
  let e3; try{ await ev('renderSectors()'); }catch(e){ e3=e; }
  if(e3) log.push('  (renderSectors 正常场景异常: '+e3.message+')');
  const banner2 = window.document.getElementById('sectorsBanner').innerHTML;
  check('正常(非demo)-不弹.demo-warn横幅', !banner2.includes('demo-warn'));

  console.log(log.join('\n'));
  console.log('\n加载/运行期 jsdomError 数: '+errors.length + (errors.length?('\n'+errors.slice(0,5).join('\n')):''));
  console.log(pass ? '\n✅ 行业雷达「连不上不显示假数据」验收全部通过' : '\n❌ 存在失败项');
  process.exit(pass?0:1);
})();
