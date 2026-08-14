/* 阶段5b：极端事件参数稳健性扫描 —— 检验75%是否小样本侥幸，找最优参数
 * 扫描 (周RSI阈, 估值分位阈, 单周跌幅阈) 组合，报告 n / 绝对上涨命中率(N=120,250) / 平均收益
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
  const sym=isFull?code:((code[0]==='6'||code[0]==='5')?'sh':'sz')+code;
  const url='https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol='+sym+'&scale=240&ma=5&datalen=1300';
  for(let a=0;a<8;a++){ try{
    const ctrl=new AbortController(); const to=setTimeout(()=>{try{ctrl.abort();}catch(_){}},9000);
    const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0','Referer':'https://finance.sina.com.cn/'}});
    clearTimeout(to); if(!r.ok) throw 0; const d=await r.json(); if(!Array.isArray(d)||!d.length) throw 0;
    const kl=d.map(x=>({date:x.day,open:+x.open,close:+x.close,high:+x.high,low:+x.low,volume:+x.volume}));
    fs.writeFileSync(f,JSON.stringify(kl)); return kl;
  }catch(e){ if(a<7) await new Promise(r=>setTimeout(r,600*(a+1))); else console.warn('fail',code); } }
  return null;
}
function sma(a,i,w){ if(i<w-1)return null; let s=0; for(let k=i-w+1;k<=i;k++)s+=a[k]; return s/w; }
function rsiArr(a,n){ const o=[]; for(let i=0;i<a.length;i++){ if(i<n){o.push(50);continue;} let g=0,l=0; for(let k=i-n+1;k<=i;k++){const d=a[k]-a[k-1]; if(d>=0)g+=d; else l-=d;} const rs=g+l>0?g/l:0; o.push(100-100/(1+rs)); } return o; }
function pctRank(a,x){ let lo=0,hi=0; for(const v of a){ if(v<x)lo++; else if(v<=x)hi++; } return (lo+hi/2)/(a.length||1); }
function toWeeks(kl){ const w=[]; for(let i=0;i+4<kl.length;i+=5){ const seg=kl.slice(i,i+5); w.push({date:seg[seg.length-1].date, close:seg[seg.length-1].close, volume:seg.reduce((s,x)=>s+x.volume,0)}); } return w; }

// 预计算每只ETF的周线序列+因子，供扫描复用
async function buildAll(){
  const out={};
  for(const [c,n] of POOL){ const kl=await fetchKL(c); if(!kl||kl.length<250) continue;
    const L=kl.length, dayClose=kl.map(x=>x.close);
    const wk=toWeeks(kl), wl=wk.length, wclose=wk.map(x=>x.close), wrsi=rsiArr(wclose,14);
    const recs=[];
    for(let i=60;i<wl;i++){
      const ma20=sma(wclose,i,20),ma60=sma(wclose,i,60);
      const c20=(ma20!=null)?(wclose[i]/ma20-1)*100:0, c60=(ma60!=null)?(wclose[i]/ma60-1)*100:0;
      if(!(c20<=0||c60<=0)) continue;
      const win=wclose.slice(Math.max(0,i-249),i+1); const frac=win.length>=2?pctRank(win,wclose[i]):1;
      const wkDrop=(i>=1)?(wclose[i]/wclose[i-1]-1)*100:0;
      const dayIdx=i*5+4; if(dayIdx>=L) continue;
      recs.push({date:wk[i].date, wrsi:wrsi[i], frac, wkDrop, dayIdx, dayClose, L});
    }
    out[c]={name:n, recs};
    await new Promise(r=>setTimeout(r,80));
  }
  return out;
}
function evalParam(all, rsiThr, fracThr, dropThr){
  const rows=[];
  for(const code in all){ for(const r of all[code].recs){
    if(!(r.wrsi<rsiThr && r.frac<fracThr && r.wkDrop < -dropThr)) continue;
    const dc=r.dayClose, L=r.L, di=r.dayIdx;
    const o={code,date:r.date};
    for(const N of [120,250]){ const t=di+N; if(t>=L){ o['a'+N]=null; continue; }
      let dirty=false; for(let k=di+1;k<=t;k++){ if(Math.abs(dc[k]/dc[k-1]-1)>0.25){dirty=true;break;} }
      o['a'+N]= dirty?null:(dc[t]/dc[di]-1)*100; }
    rows.push(o);
  } }
  function hit(N){ const v=rows.filter(r=>r['a'+N]!=null); if(!v.length) return {n:0,h:0,m:0};
    const up=v.filter(r=>r['a'+N]>0).length, m=v.reduce((s,r)=>s+r['a'+N],0)/v.length; return {n:v.length,h:up/v.length*100,m}; }
  return {n:rows.length, h120:hit(120), h250:hit(250)};
}
(async()=>{
  console.log('构建周线因子...');
  const all=await buildAll();
  console.log('扫描参数组合 (周RSI<, 估值分位<, 单周跌幅>)...');
  const grid=[];
  for(const rsi of [18,20,22,25]) for(const frac of [0.05,0.08,0.10,0.15]) for(const drop of [3,4,5,6]) grid.push([rsi,frac,drop]);
  const results=[];
  for(const [rsi,frac,drop] of grid){ const r=evalParam(all,rsi,frac,drop); results.push({rsi,frac,drop,...r}); }
  results.sort((a,b)=> (b.h250.h) - (a.h250.h));
  console.log('\n=== 按 N=250 绝对上涨命中率排序(仅列 n>=15) ===');
  for(const r of results){ if(r.n<15) continue;
    console.log('  RSI<'+r.rsi+' 估值<'+ (r.frac*100).toFixed(0)+'% 周跌>'+r.drop+'%  n='+r.n+'  120命中='+r.h120.h.toFixed(0)+'%('+(r.h120.m>=0?'+':'')+r.h120.m.toFixed(0)+'%)  250命中='+r.h250.h.toFixed(0)+'%('+(r.h250.m>=0?'+':'')+r.h250.m.toFixed(0)+'%)'); }
  console.log('\n=== 最高命中率组合(不限n) Top5 ===');
  for(const r of results.slice(0,5)){ console.log('  RSI<'+r.rsi+' 估值<'+ (r.frac*100).toFixed(0)+'% 周跌>'+r.drop+'%  n='+r.n+'  250命中='+r.h250.h.toFixed(0)+'%'); }
})().catch(e=>{console.error(e);process.exit(1);});
