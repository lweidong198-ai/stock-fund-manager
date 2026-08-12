// 验证两个国内场外基金版单文件HTML：jsdom实跑 + mock东财净值(script注入)，确认信号能渲染
const fs=require('fs');
const { JSDOM } = require('jsdom');

// 生成伪净值：[ [timestampMs, nav], ... ]，n根日频，start->end 线性
function genNav(start,end,n){
  const arr=[]; const base=Date.parse('2025-07-01');
  for(let i=0;i<n;i++){ const t=base+i*864e5; arr.push([t, +(start+(end-start)*i/(n-1)).toFixed(4)]); }
  return arr;
}
// 场景：黄金强(涨50%) > 可转债(涨4%) > 纯债(涨2%)
const NDATA={
  '000216':genNav(1.0,1.50,400),
  '340001':genNav(1.0,1.04,400),
  '050027':genNav(1.0,1.02,400),
};

function makeDom(path){
  const html=fs.readFileSync(path,'utf8');
  return new JSDOM(html,{
    runScripts:'dangerously',
    beforeParse(window){
      window.AbortController=global.AbortController;
      const proto=window.Element.prototype;
      const origAppend=proto.appendChild;
      proto.appendChild=function(node){
        if(node && node.tagName==='SCRIPT' && node.src && node.src.indexOf('pingzhongdata')>=0){
          const m=node.src.match(/pingzhongdata\/(.+?)\.js/);
          const code=m?m[1]:null;
          window.Data_ACWorthTrend=(NDATA[code]||[]).map(x=>[x[0],x[1]]);
          if(node.onload) setTimeout(()=>node.onload(),0);
          return node;
        }
        return origAppend.call(this,node);
      };
    }
  });
}

async function testFile(path, label){
  const dom=makeDom(path);
  const w=dom.window, doc=w.document;
  for(let i=0;i<60;i++){
    const t=doc.getElementById('sigName');
    if(t && t.textContent!=='计算中…' && t.textContent!=='数据不足') break;
    await new Promise(r=>setTimeout(r,40));
  }
  const name=doc.getElementById('sigName').textContent;
  const code=doc.getElementById('sigCode').textContent;
  const reason=doc.getElementById('sigReason').textContent;
  const grid=doc.getElementById('mGrid');
  const cards=grid?grid.querySelectorAll('.mcard').length:0;
  const pass = /黄金/.test(name) && (grid? cards===3 : true);
  console.log(`\n[${label}] ${pass?'PASS':'FAIL'}`);
  console.log('  信号:', name, '|', code);
  console.log('  理由:', reason.slice(0,80));
  console.log('  动量卡片数:', cards);
  if(!pass) process.exitCode=1;
  return pass;
}

(async()=>{
  console.log('jsdom 实跑验证：国内场外基金版单文件HTML（mock东财净值）');
  await testFile('cb-equity-switch.html','独立看板(场外版)');
  await testFile('国内轮动实操清单.html','大白话实操清单(场外版)');
  console.log('\n全部完成。');
})();
