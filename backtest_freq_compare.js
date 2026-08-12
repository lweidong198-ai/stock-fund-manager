// 调仓频率对比：月频 vs 日频 vs 日频短动量（同一套双强动量逻辑，腾讯前复权真实日K线）
// 回答 boss 的问题：为什么定月末调仓、不能每日看随时调？
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ASSETS = [
  { code:'sh511380', name:'可转债ETF' },
  { code:'sh513100', name:'纳指ETF' },
  { code:'sh513500', name:'标普500ETF' },
  { code:'sh510300', name:'沪深300ETF' },
  { code:'sh510500', name:'中证500ETF' },
  { code:'sz159915', name:'创业板ETF' },
  { code:'sh588000', name:'科创50ETF' },
  { code:'sh511010', name:'国债ETF' },
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchOne(code,end){
  const url=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,2000-01-01,${end},2000,qfq`;
  for(let i=0;i<4;i++){
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),12000);
      const r=await fetch(url,{headers:{'User-Agent':UA,'Referer':'https://gu.qq.com/'},signal:ctrl.signal});
      clearTimeout(t); const j=await r.json();
      const node=j.data&&j.data[code]; const arr=node&&(node.qfqday||node.day);
      if(arr&&arr.length){ return arr.map(r=>[Date.parse(r[0]),parseFloat(r[2])]); }
    }catch(e){}
    await sleep(400*(i+1));
  }
  return null;
}
async function fetchKline(code){
  const segs=[]; let end='2026-12-31';
  for(let pass=0; pass<12; pass++){
    const seg=await fetchOne(code,end);
    if(!seg||!seg.length) break;
    segs.push(seg);
    const firstTs=seg[0][0];
    if(firstTs<=Date.parse('2018-01-01')) break;
    end=new Date(firstTs-864e5).toISOString().slice(0,10);
    await sleep(200);
  }
  if(!segs.length) return null;
  const map=new Map(); segs.forEach(s=>s.forEach(r=>map.set(r[0],r[1])));
  return [...map.entries()].sort((a,b)=>a[0]-b[0]).map(([t,v])=>[t,v]);
}
function clean(series){
  const out=series.slice();
  for(let i=1;i<out.length;i++){
    const prev=out[i-1][1]; const cur=out[i][1];
    if(prev>0 && Math.abs(cur/prev-1)>0.5){
      const next = i+1<out.length?out[i+1][1]:prev;
      out[i][1]=(prev+next)/2;
    }
  }
  return out;
}
(async()=>{
  console.log('拉取 '+ASSETS.length+' 只ETF腾讯前复权日K线...');
  const raw={};
  for(const a of ASSETS){ const k=await fetchKline(a.code); raw[a.code]=k?clean(k):null; console.log(`  ${a.name}(${a.code}): ${k?k.length+'根':'失败'}`); }
  const ok=ASSETS.filter(a=>raw[a.code]);
  if(ok.length<3){ console.log('数据不足'); return; }
  const setMap={}; ok.forEach(a=>setMap[a.code]=new Map(raw[a.code]));
  const allDates=[]; ok.forEach(a=>raw[a.code].forEach(x=>allDates.push(x[0])));
  const dates=[...new Set(allDates)].sort((x,y)=>x-y).filter(t=>ok.every(a=>setMap[a.code].has(t)));
  const price={}; ok.forEach(a=>price[a.code]=dates.map(t=>setMap[a.code].get(t)));
  const codes=ok.map(a=>a.code);
  const idx=new Map(dates.map((t,i)=>[t,i]));
  // 月末 rebalance 点
  const rbMap=new Map(); dates.forEach(t=>{const d=new Date(t);const ym=d.getFullYear()*100+(d.getMonth()+1); if(!rbMap.has(ym)||t>rbMap.get(ym))rbMap.set(ym,t);});
  const monthEnd=[...rbMap.values()].sort((a,b)=>a-b);
  const allDays=dates;

  const COST=0.001; // 每次调仓（全仓切换 turn=2）实际扣 0.1%
  function run(name, allocFn, rebalDates, lev=1){
    let eq=1,peak=1,dd=0; const rets=[]; let prevW=null; let switches=0; let totalCost=0;
    for(let k=0;k<rebalDates.length-1;k++){
      const d=rebalDates[k], dN=rebalDates[k+1];
      const i0=idx.get(d), i1=idx.get(dN);
      const w=allocFn(i0);
      let ret=0;
      for(const c of codes){ let r=1; for(let i=i0;i<i1;i++){ r*= price[c][i+1]/price[c][i]; } ret+=(w[c]||0)*(r-1); }
      let turn=0; if(prevW){ for(const c of codes) turn+=Math.abs((w[c]||0)-(prevW[c]||0)); }
      const cost=(turn/2)*COST;
      if(prevW && turn>0) switches++;
      ret=ret*lev - cost; totalCost+=cost;
      eq*=(1+ret); rets.push(ret);
      peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak);
      prevW=w;
    }
    const years=(dates[dates.length-1]-dates[0])/(365.25*864e5);
    const cagr=Math.pow(eq,1/years)-1;
    const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
    const varr=rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
    const sharpe=(mean-0.02/12)/Math.sqrt(varr)*Math.sqrt(12);
    return {name,cagr,dd,sharpe,switches,totalCost,years};
  }
  const mom=(i0,L)=>{const p=Math.max(0,i0-L); const m={}; for(const c of codes) m[c]=price[c][i0]/price[c][p]-1; return m;};
  const dualTop1 = i0=>{const m=mom(i0,252); const s=['sh513100','sh513500'].sort((a,b)=>m[b]-m[a])[0]; return m[s]>=m['sh511380']?{[s]:1}:{'sh511380':1};};
  const mom20Top1 = i0=>{const m=mom(i0,20); const s=codes.slice().sort((a,b)=>m[b]-m[a])[0]; const w={}; w[s]=1; return w;};
  const pureNasdaq = i0=>({'sh513100':1});

  console.log(`\n数据区间: ${new Date(dates[0]).toISOString().slice(0,10)} ~ ${new Date(dates[dates.length-1]).toISOString().slice(0,10)}  共 ${dates.length} 交易日 (~${(dates.length/252).toFixed(1)}年)`);
  console.log('每次调仓扣费 0.1%（全仓切换）。\n');

  const cases=[
    {label:'双强Top1(12M动量)', fn:dualTop1, freq:'月频', rb:monthEnd},
    {label:'双强Top1(12M动量)', fn:dualTop1, freq:'日频', rb:allDays},
    {label:'纯纳指(基准·无切换)', fn:pureNasdaq, freq:'月频', rb:monthEnd},
    {label:'纯纳指(基准·无切换)', fn:pureNasdaq, freq:'日频', rb:allDays},
    {label:'日频20日动量追涨', fn:mom20Top1, freq:'日频', rb:allDays},
  ];
  console.log('======== 调仓频率对比（同一套逻辑，仅频率/窗口不同） ========');
  const results=[];
  for(const c of cases){
    const r=run(c.label+' ['+c.freq+']', c.fn, c.rb);
    results.push({...c,...r});
    console.log(`\n[${c.label} · ${c.freq}]  年化 ${(r.cagr*100).toFixed(2)}%  回撤 ${(r.dd*100).toFixed(1)}%  夏普 ${r.sharpe.toFixed(2)}`);
    console.log(`   切换次数 ${r.switches} 次 (约每年 ${(r.switches/r.years).toFixed(1)} 次)  累计摩擦成本 ${(r.totalCost*100).toFixed(2)}% (占年化约 ${(r.totalCost/r.years*100).toFixed(2)}%/年)`);
  }
  // 关键对比
  const m=results.find(x=>x.label.startsWith('双强')&&x.freq==='月频');
  const d=results.find(x=>x.label.startsWith('双强')&&x.freq==='日频');
  console.log('\n======== 核心结论 ========');
  console.log(`双强Top1：月频年化 ${(m.cagr*100).toFixed(2)}% / 切换 ${(m.switches)}次 vs 日频年化 ${(d.cagr*100).toFixed(2)}% / 切换 ${(d.switches)}次`);
  const diff=(d.cagr-m.cagr)*100;
  console.log(`日频相对月频年化差异：${diff>=0?'+':''}${diff.toFixed(2)}个百分点；切换次数比 ${(d.switches/m.switches).toFixed(1)}x`);
  if(Math.abs(diff)<0.5) console.log('→ 差异极小：12月长窗口动量天天盯几乎无增益，徒增盯盘负担。');
})();
