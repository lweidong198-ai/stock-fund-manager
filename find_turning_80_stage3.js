/* 阶段3：机器学习 walk-forward 样本外验证（逻辑回归 + L2 正则）
 * 防作弊：严格时间序列切分——用历史窗口训练，仅在"未来未见段"预测，报告测试段命中率。
 * 特征：9个量价因子；标签：未来N日上涨(close_t/N > close_t) 为1。
 * 对照基线：弱市整体上涨概率(~47-55%)。
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
function emaArr(a,n){ const k=2/(n+1); const o=[]; let p=a[0]; o[0]=p; for(let i=1;i<a.length;i++){p=a[i]*k+p*(1-k);o[i]=p;} return o; }
function rsiArr(a,n){ const o=[]; for(let i=0;i<a.length;i++){ if(i<n){o.push(50);continue;} let g=0,l=0; for(let k=i-n+1;k<=i;k++){const d=a[k]-a[k-1]; if(d>=0)g+=d; else l-=d;} const rs=g+l>0?g/l:0; o.push(100-100/(1+rs)); } return o; }
function macdArr(a){ const e12=emaArr(a,12),e26=emaArr(a,26); const m=a.map((_,i)=>e12[i]-e26[i]); const s=emaArr(m,9); return {hist:m.map((x,i)=>x-s[i])}; }
function pctRank(a,x){ let lo=0,hi=0; for(const v of a){ if(v<x)lo++; else if(v<=x)hi++; } return (lo+hi/2)/(a.length||1); }
function z(a){ const m=a.reduce((s,x)=>s+x,0)/a.length; const sd=Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length)||1; return a.map(x=>(x-m)/sd); }

async function main(){
  console.log('加载ETF日K线...');
  const kls={};
  for(const [c,n] of POOL){ const kl=await fetchKL(c); if(kl&&kl.length>250) kls[c]={name:n,kl}; await new Promise(r=>setTimeout(r,100)); }
  const codes=Object.keys(kls);
  const N=60; // 持有期
  // 构造样本：每(标的,偏弱日) -> {date, f:[9], y}
  const samples=[];
  for(const code of codes){
    const {kl}=kls[code]; const L=kl.length; const close=kl.map(x=>x.close), vol=kl.map(x=>x.volume);
    const rsi=rsiArr(close,14), {hist}=macdArr(close);
    const snaps=new Array(L);
    for(let i=0;i<L;i++){
      const ma20=sma(close,i,20),ma60=sma(close,i,60);
      const c20=(ma20!=null&&i>=21)?(close[i]/ma20-1)*100:null;
      const c60=(ma60!=null&&i>=61)?(close[i]/ma60-1)*100:null;
      const v20=sma(vol,i,20); const volr=(v20&&v20>0)?vol[i]/v20:null;
      const win=close.slice(Math.max(0,i-249),i+1); const fp=win.length>=2?pctRank(win,close[i]):null;
      let m=-1; for(let j=Math.max(0,i-30);j<=i-1;j++){ if(m<0||close[j]<close[m])m=j; }
      const div=(m>=0&&close[i]<=close[m])?(hist[i]-hist[m]):0;
      const dev=(ma20!=null)?(close[i]/ma20-1)*100:null;
      let vr=[]; for(let k=i-19;k<=i;k++){ if(k>0)vr.push((close[k]/close[k-1]-1)*100); }
      const vol20=vr.length>=5?Math.sqrt(vr.reduce((s,x)=>s+x*x,0)/vr.length):null;
      const mom=(i>=20)?(close[i]/close[i-20]-1)*100:null;
      snaps[i]={c20,c60,volr,fp,div,dev,vol20,mom,rsi:rsi[i],close:close[i],date:kl[i].date};
    }
    for(let i=120;i<L;i++){
      const s=snaps[i]; if(s==null||s.c20==null||s.c60==null||!(s.c20<=0||s.c60<=0)) continue;
      const t=i+N; if(t>=L) break;
      let dirty=false; for(let k=i+1;k<=t;k++){ if(Math.abs(close[k]/close[k-1]-1)>0.25){dirty=true;break;} }
      if(dirty) continue;
      const y=(close[t]/close[i]-1)>0?1:0;
      const f=[ s.rsi, s.volr, s.fp, s.div>0?1:0, s.dev, s.c20, s.c60, s.vol20, s.mom ];
      if(f.some(v=>v==null||!isFinite(v))) continue;
      samples.push({date:s.date, f, y});
    }
  }
  samples.sort((a,b)=>a.date<b.date?-1:1);
  console.log('有效样本 n='+samples.length+'  整体上涨基线='+(samples.reduce((s,x)=>s+x.y,0)/samples.length*100).toFixed(1)+'%');

  // 逻辑回归 L2
  function train(X,y,lambda=0.1,lr=0.1,iters=800){
    const D=X[0].length; let w=new Array(D).fill(0), b=0;
    for(let it=0;it<iters;it++){
      let gw=new Array(D).fill(0), gb=0;
      for(let i=0;i<X.length;i++){
        let zz=b; for(let d=0;d<D;d++) zz+=w[d]*X[i][d];
        const p=1/(1+Math.exp(-zz)), err=p-y[i];
        gb+=err; for(let d=0;d<D;d++) gw[d]+=err*X[i][d];
      }
      for(let d=0;d<D;d++) w[d]-=lr*(gw[d]/X.length+lambda*w[d]);
      b-=lr*(gb/X.length);
    }
    return {w,b};
  }
  function predict(m,X){ return X.map(r=>{ let zz=m.b; for(let d=0;d<r.length;d++) zz+=m.w[d]*r[d]; return 1/(1+Math.exp(-zz)); }); }

  // walk-forward：按年滚动切分。切分点 2023/2024/2025-01-01
  const cuts=['2023-01-01','2024-01-01','2025-01-01','2026-01-01'];
  let oofP=[], oofY=[]; // 累积样本外预测概率+真实标签
  for(let c=0;c<cuts.length;c++){
    const trainS=samples.filter(s=>s.date<cuts[c]);
    const testS=samples.filter(s=>s.date>=cuts[c] && (c+1>=cuts.length || s.date<cuts[c+1]));
    if(trainS.length<500||testS.length<50){ console.log('  切分'+cuts[c]+' 样本不足，跳过'); continue; }
    const feats=trainS.map(s=>s.f);
    // 标准化用训练集
    const D=feats[0].length; const mean=[],sd=[];
    for(let d=0;d<D;d++){ const col=feats.map(r=>r[d]); mean[d]=col.reduce((s,x)=>s+x,0)/col.length; sd[d]=Math.sqrt(col.reduce((s,x)=>s+(x-mean[d])**2,0)/col.length)||1; }
    const stdize=(f)=>f.map((v,d)=>(v-mean[d])/sd[d]);
    const Xtr=trainS.map(s=>stdize(s.f)), ytr=trainS.map(s=>s.y);
    const m=train((Xtr.length>20000?Xtr.slice(-20000):Xtr), (Xtr.length>20000?ytr.slice(-20000):ytr)); // 防过拟合用近2万
    const Xte=testS.map(s=>stdize(s.f));
    const p=predict(m,Xte);
    // 训练段命中(参考,不计入结论)
    const ptr=predict(m,Xtr); const accTr=ptr.filter((v,i)=>(v>0.5?1:0)===ytr[i]).length/ytr.length;
    const accTe=p.filter((v,i)=>(v>0.5?1:0)===testS[i].y).length/testS.length;
    oofP=oofP.concat(p); oofY=oofY.concat(testS.map(s=>s.y));
    console.log('  切'+cuts[c]+' 训练'+trainS.length+'/测试'+testS.length+'  训练命中='+(accTr*100).toFixed(1)+'%  样本外命中='+(accTe*100).toFixed(1)+'%');
  }
  // 样本外总体
  const accOOF=oofP.filter((v,i)=>(v>0.5?1:0)===oofY[i]).length/oofP.length;
  // AUC
  function auc(p,y){ const ps=p.map((v,i)=>({v,y:y[i]})).sort((a,b)=>b.v-a.v); const pos=y.reduce((s,x)=>s+x,0); const neg=y.length-pos; let rank=0; for(const x of ps){ if(x.y===1) rank+= (ps.filter(q=>q.v<x.v).length + (ps.filter(q=>q.v===x.v).length)/2); } return rank/(pos*neg); }
  const a=auc(oofP,oofY);
  console.log('\n===== 样本外(OOF)汇总 N='+N+'日 =====');
  console.log('样本外总命中率='+(accOOF*100).toFixed(1)+'%   AUC='+a.toFixed(3)+'   基线(弱市上涨概率)=约47-55%');
  // 模型最有信心的 top decile 命中率
  const idx=oofP.map((v,i)=>i).sort((i,j)=>oofP[j]-oofP[i]);
  const topN=Math.floor(idx.length*0.1); const topY=idx.slice(0,topN).map(i=>oofY[i]);
  console.log('模型最自信 top 10% 样本 命中率='+(topY.reduce((s,x)=>s+x,0)/topY.length*100).toFixed(1)+'%  (n='+topN+')');
  const botN=Math.floor(idx.length*0.1); const botY=idx.slice(idx.length-botN).map(i=>oofY[i]);
  console.log('模型最不自信 bottom 10% 命中率='+(botY.reduce((s,x)=>s+x,0)/botY.length*100).toFixed(1)+'%');
}
main().catch(e=>{console.error(e);process.exit(1);});
