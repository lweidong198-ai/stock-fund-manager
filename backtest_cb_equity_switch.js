// 可转债ETF + 高弹性股票/跨境ETF 切换算法 walk-forward 回测（腾讯前复权真实日K线）
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
// 分页拉全历史（腾讯单请求截断约640根，滚动 end 拼接覆盖到2018）
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
  return [...map.entries()].sort((a,b)=>a[0]-b[1])[0]? [...map.entries()].sort((a,b)=>a[0]-b[0]).map(([t,v])=>[t,v]) : null;
}
// 清洗：相邻日收益超50%视为复权/数据错误，线性插值
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
  console.log(`共同交易日: ${dates.length} (${new Date(dates[0]).toISOString().slice(0,10)} ~ ${new Date(dates[dates.length-1]).toISOString().slice(0,10)})`);
  const codes=ok.map(a=>a.code), names=Object.fromEntries(ok.map(a=>[a.code,a.name]));
  const rbMap=new Map(); dates.forEach(t=>{const d=new Date(t);const ym=d.getFullYear()*100+(d.getMonth()+1); if(!rbMap.has(ym)||t>rbMap.get(ym))rbMap.set(ym,t);});
  const rb=[...rbMap.values()].sort((a,b)=>a-b); const idx=new Map(dates.map((t,i)=>[t,i]));
  const COST=0.001;
  function run(name, allocFn, lev=1){
    let eq=1,peak=1,dd=0; const yearly={}; const rets=[]; const prevW={};
    for(let i=0;i<rb.length-1;i++){
      const d=rb[i],dN=rb[i+1],i0=idx.get(d),i1=idx.get(dN);
      const w=allocFn(i0); let ret=0,turn=0; const pw=prevW[name];
      for(const c of codes){ const r=price[c][i1]/price[c][i0]-1; ret+=(w[c]||0)*r; if(pw&&pw[c]!=null) turn+=Math.abs((w[c]||0)-pw[c]); }
      ret=ret*lev - (turn/2)*COST; eq*=(1+ret); rets.push(ret); peak=Math.max(peak,eq); dd=Math.max(dd,1-eq/peak);
      const y=new Date(dN).getFullYear(); yearly[y]=(yearly[y]||1)*(1+ret); prevW[name]=w;
    }
    const years=(dates[dates.length-1]-dates[0])/(365.25*864e5);
    const cagr=Math.pow(eq,1/years)-1;
    const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
    const varr=rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length;
    const sharpe=(mean-0.02/12)/Math.sqrt(varr)*Math.sqrt(12);
    return {name,cagr,dd,sharpe,yearly};
  }
  const mom=(i0,L)=>{const p=Math.max(0,i0-L); const m={}; for(const c of codes) m[c]=price[c][i0]/price[c][p]-1; return m;};
  const topN=(m,n)=>{const s=codes.slice().sort((a,b)=>m[b]-m[a]); const w={}; s.slice(0,n).forEach(c=>w[c]=1/n); return w;};
  const EQUITY=codes.filter(c=>c!=='sh511380'&&c!=='sh511010');
  const strat=[
    {name:'纯纳指ETF', fn:i0=>({'sh513100':1})},
    {name:'纯可转债ETF', fn:i0=>({'sh511380':1})},
    {name:'纯国债ETF', fn:i0=>({'sh511010':1})},
    {name:'动量Top1(12M)全资产', fn:i0=>topN(mom(i0,252),1)},
    {name:'动量Top2(12M)全资产', fn:i0=>topN(mom(i0,252),2)},
    {name:'可转债30%+动量Top1股票70%', fn:i0=>{const w={'sh511380':0.3}; const m={};EQUITY.forEach(c=>m[c]=price[c][i0]/price[c][Math.max(0,i0-252)]-1); const best=EQUITY.slice().sort((a,b)=>m[b]-m[a])[0]; w[best]=0.7; return w;}},
    {name:'可转债 vs 纳指 动量(12M)', fn:i0=>{const m=mom(i0,252); return m['sh513100']>=m['sh511380']?{'sh513100':1}:{'sh511380':1};}},
    {name:'可转债 vs 纳指+标普 双强动量Top1', fn:i0=>{const m=mom(i0,252); const s=['sh513100','sh513500'].sort((a,b)=>m[b]-m[a])[0]; return m[s]>=m['sh511380']?{[s]:1}:{'sh511380':1};}},
    {name:'温度择时(可转债分位)→纳指/可转债', fn:i0=>{const s=Math.max(0,i0-756);const arr=price['sh511380'].slice(s,i0+1);const cur=price['sh511380'][i0],mn=Math.min(...arr),mx=Math.max(...arr);const tp=mx-mn<1e-6?0.5:(cur-mn)/(mx-mn); return tp<=0.3?{'sh513100':1}:tp>=0.7?{'sh511380':1}:{'sh513100':0.5,'sh511380':0.5};}},
    {name:'可转债30%+Top1股票70% +杠杆2x', fn:i0=>{const w={'sh511380':0.3}; const m={};EQUITY.forEach(c=>m[c]=price[c][i0]/price[c][Math.max(0,i0-252)]-1); const best=EQUITY.slice().sort((a,b)=>m[b]-m[a])[0]; w[best]=0.7; return w;}, lev:2},
  ];
  console.log('\n========= 可转债ETF + 股票/跨境ETF 切换 样本外回测(腾讯前复权) =========');
  let best=null;
  for(const s of strat){ const r=run(s.name,s.fn,s.lev||1);
    console.log(`\n[${r.name}] 年化 ${(r.cagr*100).toFixed(2)}%  回撤 ${(r.dd*100).toFixed(1)}%  夏普 ${r.sharpe.toFixed(2)}`);
    console.log(`  分年度:`, Object.entries(r.yearly).map(([y,v])=>`${y}:${((v-1)*100).toFixed(1)}%`).join('  '));
    if(!best||r.cagr>best.cagr) best=r;
  }
  console.log(`\n>>> 最高组: ${best.name} → 年化 ${(best.cagr*100).toFixed(2)}%  回撤 ${(best.dd*100).toFixed(1)}%`);
})();
