/* 行业雷达·东财兜底 验证：
 * 1) 全量实跑 renderSectors：模拟「腾讯 fqkline 被 WAF 拦(501)，东财正常」，
 *    断言雷达靠东财兜底渲染出行业数据（而非全标灰「连不上」）。
 * 2) 单元：fetchEMKline 正确解析东财 klines；loadEMKline 推导沪/深 secid；adjustSplits 平滑 1拆2 断崖。
 * 3) 接链静态断言：renderSectors 调 loadEMKline 兜底、bench60 调 fetchEMKline。
 */
const {JSDOM}=require('jsdom');
const fs=require('fs');
const path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';

// 贴近真实的 viewSectors 关键 DOM
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

// 基础全局桩
window.$=function(id){ return window.document.getElementById(id); };
window.state={ _demoKL:{}, watch:[], kcache:{} };
window.AbortController=global.AbortController;
window.localStorage={ getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
window.clamp=function(v,a,b){ return Math.max(a, Math.min(b, v)); };
window.ts=function(){ return new Date().toLocaleString(); };
window.alert=function(){};
window.console=console;
// 测试用 TextDecoder 垫片：Node 不支持 gb18030，mock 数据是 ASCII 用 utf-8 等价解码（真实浏览器原生支持 gb18030）
window.TextDecoder=function(enc){ this.decode=function(buf){ return Buffer.from(buf).toString('utf-8'); }; };

// 按顺序拼接依赖脚本为一段 eval（真实顺序子集）：const/let 顶层声明在「同一次」eval 中才能跨文件互相可见
// （分别 eval 时 const 声明随各自 eval 作用域被丢弃，导致 renderRotation 找不到 sectors.js 的 INDUSTRY_POOL）。
const _files=['js/config.js','js/utils.js','js/quotes.js','js/sectors.js','js/opportunity.js'];
let _combined='';
for(const f of _files){ _combined+=fs.readFileSync(path.join(ROOT,f),'utf8')+'\n;\n'; }
try{ window.eval(_combined); }catch(e){ console.error('FAIL: eval combined ->',e); process.exit(1); }
// 桩：模拟「腾讯 fqkline 彻底挂」，renderSectors 里 loadKlineP 必返 null → 触发东财兜底
window.loadKlineP=function(){ return Promise.resolve(null); };

// ---- mock fetch：腾讯实时行情(qt.gtimg.cn)正常；东财K线(push2his)正常；腾讯fqkline(web.ifzq)501 ----
function genKl(n,base,drift){ let c=base; const start=Date.parse('2026-01-01'); const a=[]; for(let i=0;i<n;i++){ const o=c; c=c*(1+drift); a.push([new Date(start+i*864e5).toISOString().slice(0,10), (+o).toFixed(3), (+c).toFixed(3), (+c*1.02).toFixed(3), (+o*0.98).toFixed(3), String(100+i)]); } return a; }
const LONG=genKl(70,1.0,0.004);   // 模拟一只上涨的 ETF（约+32%/60日），让趋势逻辑真实跑出「强趋势」
const SPLIT=[['2026-08-06',2.0,2.0,2.0,2.0,100],['2026-08-07',1.0,1.0,1.0,1.0,200],['2026-08-08',1.0,1.05,1.1,0.98,100]];
let emMode='long';
window.fetch=function(url){
  if(url.indexOf('qt.gtimg.cn')>=0){
    const body='v_sh515050="1~ETF~515050~1.10~1.00~1.12~9930090~4823060~5102900~1.10~947~1.060~156749~1.00~1.05~+5.00%~..."';
    return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Buffer.from(body,'utf-8'))});
  }
  if(url.indexOf('push2his.eastmoney.com')>=0){
    const k=(emMode==='split'?SPLIT:LONG).map(p=>p.join(','));
    return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:k}})});
  }
  return Promise.resolve({ok:false,status:501,json:()=>Promise.resolve({})}); // 腾讯 fqkline 被WAF拦
};

(async()=>{
  if(typeof window.renderSectors!=='function'){ console.error('FAIL: renderSectors 未定义'); process.exit(1); }
  try{ await window.renderSectors(); }catch(e){ console.error('FAIL: renderSectors 抛错 ->',e); process.exit(1); }
  const body=window.document.getElementById('sectorsBody').innerHTML;
  const checks=[
    ['渲染出表格', body.includes('<table')],
    ['含行业名', /通信|券商|医药|消费|银行|半导体|军工|光伏|新能源|化工|煤炭|有色|农业|传媒|计算机|食品|证券|保险|地产|电力|汽车|机械|钢铁|建材|石油|运输|环保|军工|国防/.test(body)],
    ['含当日%列', body.includes('当日%')],
    ['含趋势标记(强趋势/反弹/横盘/下跌)', /强趋势|反弹|横盘|下跌/.test(body)],
    ['非大面积“连不上”(东财兜底生效)', (body.match(/连不上/g)||[]).length < 5],
  ];
  let ok=true;
  for(const [n,c] of checks){ if(!c){ console.error('FAIL 渲染检查:',n); ok=false; } }
  if(!ok) process.exit(1);
  console.log('PASS[1] renderSectors 实跑：腾讯挂→东财兜底生效，渲染出行业数据（'+body.length+' 字符，连不上≤'+(body.match(/连不上/g)||[]).length+'）');

  // 单元：fetchEMKline 解析 + secid 推导
  let lastSecid=null;
  window.fetch=function(url){ const m=url.match(/secid=([^&]+)/); if(m) lastSecid=m[1]; const k=LONG.map(p=>p.join(',')); return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:k}})}); };
  const kl=await window.fetchEMKline('1.515050');
  if(!kl||!kl.length||isNaN(kl[0].close)){ console.error('FAIL: fetchEMKline 解析错',kl); process.exit(1); }
  console.log('PASS[2] fetchEMKline 解析东财返回 ->',kl.length,'根，首根',kl[0].date,kl[0].close);
  lastSecid=null; await window.loadEMKline('515050');
  if(lastSecid!=='1.515050'){ console.error('FAIL: 沪市secid错',lastSecid); process.exit(1); }
  lastSecid=null; await window.loadEMKline('159992');
  if(lastSecid!=='0.159992'){ console.error('FAIL: 深市secid错',lastSecid); process.exit(1); }
  console.log('PASS[3] loadEMKline secid 推导正确（沪 1.515050 / 深 0.159992）');

  // 单元：adjustSplits 平滑 1拆2 断崖
  emMode='split';
  window.fetch=function(url){ const k=SPLIT.map(p=>p.join(',')); return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:k}})}); };
  const klS=await window.fetchEMKline('1.515050');
  const r=klS[1].close/klS[0].close;
  if(r<0.65){ console.error('FAIL: adjustSplits 未平滑拆分断崖，比例',r); process.exit(1); }
  console.log('PASS[4] adjustSplits 平滑 1拆2 断崖（相邻比例 '+r.toFixed(2)+'，无假暴跌）');

  // 接链静态断言
  const src=fs.readFileSync(path.join(ROOT,'js/sectors.js'),'utf8');
  const link=[
    ['renderSectors 调 loadEMKline 兜底', src.includes('if(!(kl&&kl.length)) kl=await loadEMKline(x.code)')],
    ['bench60 调 fetchEMKline 兜底', src.includes("bk=await fetchEMKline('1.000300')")],
    ['fetchEMKline 用东财接口', src.includes('push2his.eastmoney.com/api/qt/stock/kline/get')],
    ['fetchEMKline 支持前复权 fqt=1', src.includes('fqt=1')],
  ];
  let lok=true;
  for(const [n,c] of link){ if(!c){ console.error('FAIL 接链:',n); lok=false; } }
  if(!lok) process.exit(1);
  console.log('PASS[5] 接链静态断言全部通过');

  // ---- 扩展：全量实跑 renderRotation（冷热排行），同样腾讯挂→东财兜底 ----
  // 复位综合 mock：实时行情正常、东财K线正常、腾讯fqkline 501
  window.fetch=function(url){
    if(url.indexOf('qt.gtimg.cn')>=0){ return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(Buffer.from('v_sh515050="1~ETF~515050~1.10~1.00~1.12~9930090~4823060~5102900~1.10~947~1.060~156749~1.00~1.05~+5.00%~..."','utf-8'))}); }
    if(url.indexOf('push2his.eastmoney.com')>=0){ const k=LONG.map(p=>p.join(',')); return Promise.resolve({ok:true,json:()=>Promise.resolve({rc:0,data:{klines:k}})}); }
    return Promise.resolve({ok:false,status:501,json:()=>Promise.resolve({})});
  };
  if(typeof window.renderRotation!=='function'){ console.error('FAIL: renderRotation 未定义'); process.exit(1); }
  try{ await window.renderRotation(); }catch(e){ console.error('FAIL: renderRotation 抛错 ->',e); process.exit(1); }
  const rbody=window.document.getElementById('rotationBody').innerHTML;
  const rchecks=[
    ['冷热排行渲染出表格', rbody.includes('<table')],
    ['含行业名', /通信|券商|医药|消费|银行|半导体|军工|光伏|新能源|化工|煤炭|有色|农业|传媒|计算机|食品|证券|保险|地产|电力|汽车|机械|钢铁|建材|石油|运输|环保|国防/.test(rbody)],
    ['含冷热标签(很热/偏热/一般/偏冷/很冷/连不上)', /很热|偏热|一般|偏冷|很冷|连不上/.test(rbody)],
    ['东财兜底生效(连不上极少)', (rbody.match(/连不上/g)||[]).length < 5],
  ];
  let rok=true; for(const [n,c] of rchecks){ if(!c){ console.error('FAIL 冷热排行检查:',n); rok=false; } }
  if(!rok) process.exit(1);
  console.log('PASS[6] renderRotation 实跑：腾讯挂→东财兜底生效，渲染出冷热排行（'+rbody.length+' 字符，连不上≤'+(rbody.match(/连不上/g)||[]).length+'）');

  // 接链静态断言：opportunity.js 同样接了东财兜底
  const osrc=fs.readFileSync(path.join(ROOT,'js/opportunity.js'),'utf8');
  const olink=[
    ['renderRotation 调 loadEMKline 兜底', osrc.includes('if(!(kl && kl.length)) kl = await loadEMKline(x.code)')],
    ['bench 调 fetchEMKline 兜底', osrc.includes("bk = await fetchEMKline('1.000300')")],
  ];
  let olok=true; for(const [n,c] of olink){ if(!c){ console.error('FAIL 接链(opportunity):',n); olok=false; } }
  if(!olok) process.exit(1);
  console.log('PASS[7] opportunity.js 接链静态断言通过（冷热排行同样东财兜底）');

  console.log('\n✅ 行业雷达·东财兜底 验证通过（renderSectors + renderRotation 全量实跑 + 单元 + 接链）');
})();
