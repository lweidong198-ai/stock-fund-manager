/* =========================================================================
 * verify_kline_trunc.js —— K线历史截断（"最远只到某近期日期"）修复验收
 * 根因：补全历史的请求无重试，腾讯同IP突发多次请求偶发限流/空段 → onHistory 永不触发 → 卡首屏 640 根。
 * 修复：fetchSegR 加重试；pullHistory 补全；klineTruncWarn 每次加载自检并告警/自愈。
 * 验证用 mock fetch 模拟 4 场景，无需真实网络。
 * 用法：node verify_kline_trunc.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
// 仅加载 loadKline 必需的模块，避免 app.js 初始化自触发 loadKline 干扰断言
const ORDER = ['config.js', 'utils.js', 'demo.js', 'calibrator.js', 'kline.js'];

let pass = true; const log = [];
function check(name, cond, detail){ if(cond) log.push('✅ '+name+(detail?' · '+detail:'')); else { pass=false; log.push('❌ '+name+(detail?' · '+detail:'')); } }

let SCENARIO = 'ok';
let segInvokes = 0;
const callCount = {};
let TODAY = new Date().toISOString().slice(0,10);
function bizDatesEnding(endDate, count){
  const out=[]; let t=new Date(endDate+'T00:00:00');
  while(out.length<count){ const d=t.getDay(); if(d!==0&&d!==6) out.unshift(t.toISOString().slice(0,10)); t.setDate(t.getDate()-1); }
  return out;
}
function buildSeg(code, ptype, endDate, count){
  const dates = bizDatesEnding(endDate, count);
  const rows = dates.map((dt,i)=>{
    let lo=10, hi=12, cl=11, op=10;
    if(i===0 && endDate!==TODAY){ lo=-186; hi=-100; cl=-150; op=-160; }   // 早期脏负价，验证补全后会被清洗
    return [dt, String(op), String(cl), String(hi), String(lo), '100'];
  });
  return { data:{ [code]:{ qfqday:rows, day:rows } } };
}

async function runScenario(name, scenario){
  SCENARIO = scenario; segInvokes = 0; for(const k in callCount) delete callCount[k];
  const captured = { first:null, full:null };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: '+(e.detail||e.message||e)));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\s*<script src="js\//.test(l)).join('\n'),
    { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'file://'+ROOT+'/' });
  const { window } = dom;
  window.fetch = function(url){
    callCount[url]=(callCount[url]||0)+1; const n=callCount[url];
    const m = url.match(/param=([^,]+),(\w+),1990-01-01,([\d-]+),640,qfq/);
    if(!m) return Promise.resolve({ json:()=>Promise.resolve({ data:{} }) });
    const code=m[1], ptype=m[2], endDate=m[3]; segInvokes++;
    const thr = (SCENARIO==='throttle' && segInvokes===2 && n===1);
    if(process.env.DBG) console.log('  FETCH#'+segInvokes+' n='+n+' end='+endDate+' thr='+thr);
    if(SCENARIO==='empty'){
      if(endDate===TODAY) return Promise.resolve({ json:()=>Promise.resolve(buildSeg(code,ptype,endDate,640)) });
      return Promise.resolve({ json:()=>Promise.resolve({ data:{ [code]:{ qfqday:[], day:[] } } }) });
    }
    if(SCENARIO==='short'){
      if(endDate===TODAY) return Promise.resolve({ json:()=>Promise.resolve(buildSeg(code,ptype,endDate,100)) });
      return Promise.resolve({ json:()=>Promise.resolve({ data:{ [code]:{ qfqday:[], day:[] } } }) });
    }
    // ok / throttle：返回 640 根；throttle 时首个历史段(segInvokes===2)的首次尝试返回空，重试才给数据
    if(SCENARIO==='throttle' && segInvokes===2 && n===1) return Promise.resolve({ json:()=>Promise.resolve({ data:{ [code]:{ qfqday:[], day:[] } } }) });
    return Promise.resolve({ json:()=>Promise.resolve(buildSeg(code,ptype,endDate,640)) });
  };
  for(const f of ORDER){ const s=window.document.createElement('script'); s.textContent=fs.readFileSync(path.join(ROOT,'js',f),'utf8'); window.document.body.appendChild(s); }
  if(errors.length){ check('['+name+'] 模块加载无错', false, errors.slice(0,2).join(';')); return { skip:true, window }; }
  await new Promise(res=>{
    window.loadKline('sh600519','d',(data,isDemo)=>{ captured.first=data; }, { onHistory:(full)=>{ if(process.env.DBG) console.log('  [onHistory] full='+full.length); captured.full=full; res(); } });
    setTimeout(res, 11000);   // 空段场景含重试退避，最长约 8s，留足余量
  });
  const rep = (window.DataCalibrator && window.DataCalibrator._report().kline['sh600519']) || [];
  return { captured, rep, errors, window };
}

(async()=>{
  const A = await runScenario('A 正常翻页','ok');
  if(!A.skip){
    const fl = A.captured.full ? A.captured.full.length : 0;
    check('A1 历史补全生效(onHistory 拿到 >640 根)', fl>640, 'full='+fl);
    check('A2 补全后数据已清洗(无负价残留)', A.captured.full ? A.captured.full.every(b=>+b.low>0) : false, '含负价='+(A.captured.full? A.captured.full.filter(b=>+b.low<=0).length:'?'));
    check('A3 正常补全不误告警', A.rep.length===0, '告警='+(A.rep[0]||'无'));
  }
  const B = await runScenario('B 限流重试','throttle');
  if(!B.skip){
    const fl = B.captured.full ? B.captured.full.length : 0;
    check('B1 限流重试后仍能补全(>640)', fl>640, 'full='+fl);
    check('B2 限流重试不误告警', B.rep.length===0, '告警='+(B.rep[0]||'无'));
  }
  const C = await runScenario('C 全程空段','empty');
  if(!C.skip){
    check('C1 补不全时必须告警"可能未拉全"', C.rep.length>0 && /未拉全/.test(C.rep[0]||''), '告警='+(C.rep[0]||'无'));
  }
  const D = await runScenario('D 次新股','short');
  if(!D.skip){
    check('D1 次新股(短历史)不误告警', D.rep.length===0, '告警='+(D.rep[0]||'无'));
  }
  // 纯函数单测 klineTruncWarn（取任一 window 的全局函数，新签名含 stopped）
  const kw = D.window.klineTruncWarn;
  if(typeof kw==='function'){
    check('E1 卡上限+空段中止+未扩展→告警', !!kw(640,640,'d','empty'), 'kw(640,640,empty)');
    check('E2 已正常扩展(>640)→不告警', !kw(640,1920,'d','empty'), 'kw(640,1920,empty)');
    check('E3 次新股短历史→不告警', !kw(100,100,'d','empty'), 'kw(100,100,empty)');
    check('E4 空段中止但确到真实尽头(noearlier)→不告警', !kw(640,640,'d','noearlier'), 'kw(640,640,noearlier)');
    check('E5 命中上限且一分未增→告警', !!kw(637,637,'d','empty'), 'kw(637,637,empty)');
  } else check('E0 取到 klineTruncWarn 函数', false, '未定义');

  console.log('\n==== K线历史截断验收 ====');
  log.forEach(l=>console.log(l));
  console.log('\n'+(pass?'🎉 全部通过':'⛔ 存在 FAIL'));
  process.exit(pass?0:1);
})();
