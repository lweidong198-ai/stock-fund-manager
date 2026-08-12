// 验证两个国内版单文件HTML：jsdom实跑 + mock腾讯K线，确认信号能渲染
const fs=require('fs');
const { JSDOM } = require('jsdom');

// 生成伪K线：start->end 线性，700根，date递增
function genKL(code, start, end){
  const n=700; const arr=[]; const base=Date.parse('2024-01-01');
  for(let i=0;i<n;i++){
    const t=base+i*864e5; const d=new Date(t).toISOString().slice(0,10);
    const c=start+(end-start)*i/(n-1);
    arr.push([d, c.toFixed(4), c.toFixed(4), c.toFixed(4), c.toFixed(4), '100']);
  }
  return arr;
}
// 场景：黄金强(涨30%) > 可转债(涨6%) > 国债(涨3%)
const KDATA={
  sh518880:genKL('sh518880',1.0,1.30),
  sh511380:genKL('sh511380',1.0,1.06),
  sh511010:genKL('sh511010',1.0,1.03),
};

function makeFetch(){
  return async (url)=>{
    const m=url.match(/param=(sh\d+|sz\d+)/);
    const code=m?m[1]:null;
    const arr=KDATA[code];
    if(!arr) return {ok:false,json:async()=>({})};
    return {ok:true, json:async()=>({data:{[code]:{qfqday:arr}}})};
  };
}

async function testFile(path, label){
  const html=fs.readFileSync(path,'utf8');
  const dom=new JSDOM(html,{
    runScripts:'dangerously',
    beforeParse(window){ window.fetch=makeFetch(); window.AbortController=global.AbortController; }
  });
  const w=dom.window, doc=w.document;
  // 等异步loadAll完成
  for(let i=0;i<50;i++){
    const t=doc.getElementById('sigName');
    if(t && t.textContent!=='计算中…' && t.textContent!=='数据不足') break;
    await new Promise(r=>setTimeout(r,40));
  }
  const name=doc.getElementById('sigName').textContent;
  const code=doc.getElementById('sigCode').textContent;
  const reason=doc.getElementById('sigReason').textContent;
  const grid=doc.getElementById('mGrid');
  const cards=grid?grid.querySelectorAll('.mcard').length:0;
  // 看板有动量小卡片(mGrid)需3张；清单版无mGrid，只验证信号渲染即可
  const pass = /黄金ETF/.test(name) && (grid? cards===3 : true);
  console.log(`\n[${label}] ${pass?'PASS':'FAIL'}`);
  console.log('  信号:', name, '|', code);
  console.log('  理由:', reason.slice(0,80));
  console.log('  动量卡片数:', cards);
  if(!pass) process.exitCode=1;
  return pass;
}

(async()=>{
  console.log('jsdom 实跑验证：国内版单文件HTML');
  await testFile('cb-equity-switch.html','独立看板(国内版)');
  await testFile('国内轮动实操清单.html','大白话实操清单');
  console.log('\n全部完成。');
})();
