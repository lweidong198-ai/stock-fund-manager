/* 阶段2a：相对基准命中率（未来N日跑赢沪深300）walk-forward 探索
 * 动机：阶段1证明"绝对上涨"方向命中率卡在50-53%。本阶段测"相对拐点"——
 *   信号后N日 ETF收益 - 沪深300收益 > 0 的比例。这是规律更可能存在的定义。
 */
const fs=require('fs'), path=require('path');
const ROOT='C:/Users/Mloong/stock-fund-manager';
const CACHE=path.join(ROOT,'.cache_reversal'); fs.mkdirSync(CACHE,{recursive:true});
const POOL=[
  ['159992','医药/医疗'],['512690','白酒/消费'],['515030','新能源车'],['515790','光伏'],
  ['512760','芯片/半导体'],['512660','军工'],['512800','银行'],['512880','证券'],
  ['512400','有色金属'],['515210','钢铁'],['515220','煤炭'],['159870','化工'],
  ['512200','房地产'],['516110','汽车'],['159996','家电'],['159825','农业'],
  ['512980','传媒'],['515880','通信'],['159998','计算机'],['159611','电力'],
  ['159745','建材'],['516780','稀土'],['159755','电池'],['515980','人工智能'],
  ['512070','保险'],['515050','5G通信'],['562500','机器人'],['159869','游戏'],
  ['562510','旅游'],['159865','养殖'],['518880','黄金'],['159861','环保'],
  ['513360','教育'],['159647','中药'],['516670','风电'],['159736','食品饮料'],
  ['561790','石油'],['516510','云计算'],['159667','工业母机'],['159892','医美']
];
async function fetchKL(code){
  const f=path.join(CACHE, code+'.json');
  if(fs.existsSync(f)) return JSON.parse(fs.readFileSync(f,'utf8'));
  const isFull=/^sh|sz/.test(code);
  const sym = isFull ? code : ((code[0]==='6'||code[0]==='5')?'sh':'sz')+code;
  const url='https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol='+sym+'&scale=240&ma=5&datalen=1300';
  for(let attempt=0;attempt<8;attempt++){
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>{try{ctrl.abort();}catch(_){}}, 9000);
      const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0','Referer':'https://finance.sina.com.cn/'}});
      clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const d=await r.json(); if(!Array.isArray(d)||!d.length) throw new Error('empty');
      const kl=d.map(x=>({date:x.day,open:+x.open,close:+x.close,high:+x.high,low:+x.low,volume:+x.volume}));
      fs.writeFileSync(f, JSON.stringify(kl));
      return kl;
    }catch(e){ if(attempt<7) await new Promise(r=>setTimeout(r,600*(attempt+1))); else console.warn('拉取失败',code,e.message); }
  }
  return null;
}
function sma(arr,i,w){ if(i<w-1) return null; let s=0; for(let k=i-w+1;k<=i;k++) s+=arr[k]; return s/w; }
function emaArr(arr,n){ const k=2/(n+1); const out=[]; let prev=arr[0]; out[0]=prev; for(let i=1;i<arr.length;i++){ prev=arr[i]*k+prev*(1-k); out[i]=prev; } return out; }
function rsiArr(arr,n){ const out=[]; for(let i=0;i<arr.length;i++){ if(i<n){out.push(50);continue;} let g=0,l=0; for(let k=i-n+1;k<=i;k++){ const d=arr[k]-arr[k-1]; if(d>=0)g+=d; else l-=d; } const rs=g+l>0?g/l:0; out.push(100-100/(1+rs)); } return out; }
function macdArr(arr){ const e12=emaArr(arr,12), e26=emaArr(arr,26); const macd=arr.map((_,i)=>e12[i]-e26[i]); const sig=emaArr(macd,9); const hist=macd.map((m,i)=>m-sig[i]); return {macd,sig,hist}; }
function quantile(sorted,q){ if(!sorted.length) return 0; const pos=(sorted.length-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos); return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo); }
function pctRank(arr,x){ if(arr.length===0) return 0.5; let lo=0,hi=0; for(const v of arr){ if(v<x) lo++; else if(v<=x) hi++; } return (lo + hi/2)/arr.length; }

async function main(){
  console.log('加载 ETF + 沪深300 日K线...');
  const kls={};
  for(const [code,name] of POOL){ const kl=await fetchKL(code); if(kl&&kl.length>250){ kls[code]={name,kl}; } await new Promise(r=>setTimeout(r,120)); }
  const hs300=await fetchKL('sh000300'); // 沪深300指数
  if(!hs300){ console.error('沪深300拉取失败'); process.exit(1); }
  const codes=Object.keys(kls);
  console.log('成功 '+codes.length+' 只ETF');
  const c300=hs300.map(x=>x.close);

  const allRsi=[], allVolr=[], allFrac=[], allDev=[], allC20=[], allC60=[], allVol20=[], allMom=[];
  const rows=[];
  for(const code of codes){
    const {name,kl}=kls[code]; const L=kl.length;
    const close=kl.map(x=>x.close), vol=kl.map(x=>x.volume);
    const rsi=rsiArr(close,14), {hist}=macdArr(close);
    const snaps=new Array(L);
    for(let i=0;i<L;i++){
      const ma20=sma(close,i,20), ma60=sma(close,i,60);
      const c20=(ma20!=null&&i>=21)?(close[i]/ma20-1)*100:null;
      const c60=(ma60!=null&&i>=61)?(close[i]/ma60-1)*100:null;
      const v20=sma(vol,i,20);
      const volr=(v20&&v20>0)?vol[i]/v20:null;
      const win=close.slice(Math.max(0,i-249),i+1);
      const fracPct=win.length>=2?pctRank(win,close[i]):null;
      let m=-1; for(let j=Math.max(0,i-30);j<=i-1;j++){ if(m<0||close[j]<close[m]) m=j; }
      const divAmt=(m>=0&&close[i]<=close[m])?(hist[i]-hist[m]):0;
      const dev=(ma20!=null)?(close[i]/ma20-1)*100:null;
      let vr=[]; for(let k=i-19;k<=i;k++){ if(k>0) vr.push((close[k]/close[k-1]-1)*100); }
      const vol20=vr.length>=5?Math.sqrt(vr.reduce((s,x)=>s+x*x,0)/vr.length):null;
      const mom=(i>=20)?(close[i]/close[i-20]-1)*100:null;
      snaps[i]={i,rsi:rsi[i],volr,fracPct,divAmt,dev,c20,c60,vol20,mom,close:close[i]};
      if(c20!=null) allC20.push(c20);
      if(c60!=null) allC60.push(c60);
      if(rsi[i]!=null) allRsi.push(rsi[i]);
      if(volr!=null) allVolr.push(volr);
      if(fracPct!=null) allFrac.push(fracPct);
      if(dev!=null) allDev.push(dev);
      if(vol20!=null) allVol20.push(vol20);
      if(mom!=null) allMom.push(mom);
    }
    for(let i=120;i<L;i++){
      const s=snaps[i]; if(s==null) continue;
      if(!(s.c20!=null&&s.c60!=null&&(s.c20<=0||s.c60<=0))) continue;
      const ret={}; // 相对沪深300
      for(const N of [60,120,250]){
        const t=i+N; if(t>=L){ ret[N]=null; continue; }
        let dirty=false;
        for(let k=i+1;k<=t;k++){ const d=(close[k]/close[k-1]-1); if(Math.abs(d)>0.25){ dirty=true; break; } }
        const d2=(c300[t]/c300[i]-1);
        ret[N]= dirty? null : (close[t]/close[i]-1) - d2; // 相对收益
      }
      rows.push(Object.assign({code,name,date:kl[i].date},s,{ret}));
    }
  }
  function scoreOf(r){ let s=0;
    s+=(1-pctRank(allRsi,r.rsi)); s+=(1-pctRank(allVolr,r.volr)); s+=(1-pctRank(allFrac,r.fracPct));
    s+=(r.divAmt>0?1:0); s+=(1-pctRank(allDev,r.dev)); s+=(1-pctRank(allC20,r.c20));
    s+=(1-pctRank(allC60,r.c60)); s+=(1-pctRank(allVol20,r.vol20)); s+=(1-pctRank(allMom,r.mom)); return s; }
  rows.forEach(r=>r.score=scoreOf(r));
  function hit(list,N){ const v=list.filter(r=>r.ret[N]!=null); if(!v.length) return {n:0,h:0,m:0};
    const up=v.filter(r=>r.ret[N]>0).length; const m=v.reduce((s,r)=>s+r.ret[N],0)/v.length; return {n:v.length,h:up/v.length*100,m}; }

  console.log('\n========== 相对基准(跑赢沪深300)命中率 ==========');
  const sorted=[...rows].sort((a,b)=>b.score-a.score);
  for(const k of [0.05,0.10,0.20,0.50]){
    const top=sorted.slice(0,Math.floor(sorted.length*k));
    console.log('\n--- top '+(k*100)+'% 超卖 (n='+top.length+') ---');
    for(const N of [60,120,250]){ const h=hit(top,N); console.log('  N='+N+'日  跑赢300命中率='+h.h.toFixed(1)+'%  n='+h.n+'  平均相对='+(h.m>=0?'+':'')+h.m.toFixed(2)+'%'); }
  }
  console.log('\n========== 递进 AND (N=120 跑赢300) ==========');
  const combos=[
    {n:'① 偏弱基线', f:r=>true},
    {n:'② +score≥2', f:r=>r.score>=2},
    {n:'③ +RSI<20', f:r=>r.score>=2&&r.rsi<20},
    {n:'④ +估值<10%', f:r=>r.score>=2&&r.rsi<20&&r.fracPct<0.10},
    {n:'⑤ +底背离', f:r=>r.score>=2&&r.rsi<20&&r.fracPct<0.10&&r.divAmt>0},
  ];
  for(const c of combos){ const h=hit(rows.filter(c.f),120); console.log('  '+c.n.padEnd(12)+' 命中='+h.h.toFixed(1)+'%  n='+h.n+'  平均相对='+(h.m>=0?'+':'')+h.m.toFixed(2)+'%'); }
}
main().catch(e=>{ console.error(e); process.exit(1); });
