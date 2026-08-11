/* =========================================================================
 * verify_nav_restructure.js —— 导航整合（方案A）验收
 * 把红框 7 个入口压成 3 个决策入口：
 *   机会发现(discovery) = fund(本期精选) + fundAnalysis(基金体检)
 *   行业雷达(radar)     = sectors(趋势方向) + rotation(冷热排行)
 *   择时建仓(timing)    = analysis(建仓打分) + flow(资金流向)
 *   可靠数据中心收进页脚链接（导航移除入口，view 仍在）
 * 验证：导航入口正确、subtabbar 占位存在、分组切换 display/导航高亮/
 *       子视图 Tab 高亮/state.view 记忆/anaMode 默认 single 均正确。
 * 用法：node verify_nav_restructure.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const ORDER = ['config.js','utils.js','storage.js','demo.js','quotes.js','calibrator.js','kline.js','fund.js','indicators.js','analysis.js','canvas.js','charts.js','moneyflow.js','sectors.js','opportunity.js','detail.js','datacenter.js','fundanalysis.js','app.js'];

let pass = true; const log = [];
function check(name, cond, detail){ if(cond) log.push('✅ '+name+(detail!==undefined&&detail!==''?' · '+detail:'')); else { pass=false; log.push('❌ '+name+(detail!==undefined&&detail!==''?' · '+detail:'')); } }

// canvas 2d 上下文 mock（jsdom 无原生 canvas）
function ctxMock(){
  const noop=()=>{};
  return new Proxy({}, {
    get(t,p){
      if(p==='canvas') return {width:300,height:150};
      if(p==='measureText') return ()=>({width:0});
      if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern') return ()=>({addColorStop:noop});
      if(p==='getImageData') return ()=>({data:new Uint8ClampedArray(4)});
      return noop;
    },
    set(){ return true; }
  });
}

(async()=>{
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: '+(e.detail&&e.detail.message||e.message||e)));
  const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\s*<script src="js\//.test(l)).join('\n');
  const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'file://'+ROOT+'/' });
  const { window } = dom;

  // mock 网络与 canvas，避免启动/渲染触发真实请求或原生画布报错
  window.fetch = async()=>({ ok:true, status:200, json:async()=>({data:[],code:0,msg:''}), text:async()=>'' });
  if(window.HTMLCanvasElement) window.HTMLCanvasElement.prototype.getContext = function(){ return ctxMock(); };

  for(const f of ORDER){ const s=window.document.createElement('script'); s.textContent=fs.readFileSync(path.join(ROOT,'js',f),'utf8'); window.document.body.appendChild(s); }
  const ev = (code) => window.eval(code);

  const $ = window.$;
  check('app.js 全局函数已定义(goView/showSub)', typeof window.goView==='function' && typeof window.showSub==='function');

  // —— 断言1：导航入口结构 ——
  const navs = [...window.document.querySelectorAll('.navitem')].map(n=>n.dataset.view);
  check('导航含 discovery/radar/timing', ['discovery','radar','timing'].every(v=>navs.includes(v)), navs.join(','));
  check('导航已移除单视图入口(fund/analysis/fundAnalysis/sectors/rotation/flow)', !['fund','analysis','fundAnalysis','sectors','rotation','flow'].some(v=>navs.includes(v)));
  check('datacenter 仍保留为导航入口(页脚同源)', navs.includes('datacenter'));

  // —— 断言2：subtabbar 占位 ——
  check('6 个 subtabbar 占位存在', window.document.querySelectorAll('[data-stb]').length===6, '实际 '+window.document.querySelectorAll('[data-stb]').length);

  // —— 断言3：进入 discovery（默认本期精选=fund） ——
  let e1; try{ window.goView('discovery'); }catch(e){ e1=e; }
  if(e1) log.push('  (goView discovery 渲染副作用被忽略: '+e1.message+')');
  check('discovery: viewFund 显示 grid', window.document.getElementById('viewFund').style.display==='grid');
  check('discovery: viewFundAnalysis 隐藏', window.document.getElementById('viewFundAnalysis').style.display==='none');
  check('discovery: 导航高亮 discovery', window.document.querySelector('.navitem[data-view="discovery"]').classList.contains('on'));
  const stbD = window.document.querySelector('[data-stb="discovery"]');
  check('discovery: subtabbar 含 2 个 tab', stbD.querySelectorAll('.stab').length===2, '实际 '+stbD.querySelectorAll('.stab').length);
  const stabD0 = stbD.querySelector('.stab');
  check('discovery: 第1个tab高亮且文案=本期精选', stabD0.classList.contains('on') && stabD0.textContent==='本期精选', stabD0.textContent);
  check('discovery: state.view=fund', ev('state.view')==='fund');

  // —— 断言4：切到基金体检(fundAnalysis) ——
  let e2; try{ window.showSub('discovery','fundAnalysis'); }catch(e){ e2=e; }
  if(e2) log.push('  (showSub fundAnalysis 渲染副作用被忽略: '+e2.message+')');
  check('切 fundAnalysis: viewFundAnalysis 显示 grid', window.document.getElementById('viewFundAnalysis').style.display==='grid');
  check('切 fundAnalysis: viewFund 隐藏', window.document.getElementById('viewFund').style.display==='none');
  check('切 fundAnalysis: 第2个tab高亮', stbD.querySelectorAll('.stab')[1].classList.contains('on'));
  check('切 fundAnalysis: state.view=fundAnalysis', ev('state.view')==='fundAnalysis');
  check('切 fundAnalysis: 导航仍高亮 discovery', window.document.querySelector('.navitem[data-view="discovery"]').classList.contains('on'));

  // —— 断言5：进入 radar（默认趋势方向=sectors） ——
  let e3; try{ window.goView('radar'); }catch(e){ e3=e; }
  if(e3) log.push('  (goView radar 渲染副作用被忽略: '+e3.message+')');
  check('radar: viewSectors 显示 block', window.document.getElementById('viewSectors').style.display==='block');
  check('radar: viewRotation 隐藏', window.document.getElementById('viewRotation').style.display==='none');
  check('radar: state.view=sectors', ev('state.view')==='sectors');
  const stbR = window.document.querySelector('[data-stb="radar"]');
  check('radar: 第1个tab文案=趋势方向', stbR.querySelector('.stab').textContent==='趋势方向');

  // —— 断言6：进入 timing（默认建仓打分=analysis） ——
  let e4; try{ window.goView('timing'); }catch(e){ e4=e; }
  if(e4) log.push('  (goView timing 渲染副作用被忽略: '+e4.message+')');
  check('timing: viewAnalysis 显示 block', window.document.getElementById('viewAnalysis').style.display==='block');
  check('timing: viewFlow 隐藏', window.document.getElementById('viewFlow').style.display==='none');
  check('timing: state.anaMode=single', ev('state.anaMode')==='single');
  check('timing: state.view=analysis', ev('state.view')==='analysis');
  const stbT = window.document.querySelector('[data-stb="timing"]');
  check('timing: 第1个tab文案=建仓打分', stbT.querySelector('.stab').textContent==='建仓打分');

  // —— 断言7：回 home 后所有组视图隐藏 ——
  let e5; try{ window.goView('home'); }catch(e){ e5=e; }
  if(e5) log.push('  (goView home 渲染副作用被忽略: '+e5.message+')');
  check('home: viewFund 已隐藏', window.document.getElementById('viewFund').style.display==='none');
  check('home: viewSectors 已隐藏', window.document.getElementById('viewSectors').style.display==='none');
  check('home: viewAnalysis 已隐藏', window.document.getElementById('viewAnalysis').style.display==='none');

  console.log(log.join('\n'));
  console.log('\n加载期 jsdomError 数: '+errors.length + (errors.length?('\n'+errors.slice(0,5).join('\n')):''));
  console.log(pass ? '\n✅ 导航整合验收全部通过' : '\n❌ 存在失败项');
  process.exit(pass?0:1);
})();
