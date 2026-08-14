/* 阶段5(继续尝试)：周线降噪 + 极端事件长持 —— 冲高命中率
 * 思路：日线噪音是命中率低根因。改周线(每5日聚合)降噪；只在"极端超卖事件"
 *       (周RSI<20 + 估值历史最低10% + 单周暴跌>5%) 亮信号，持有120/250日看修复。
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
function toWeeks(kl){ const w=[]; for(let i=0;i+4<kl.length;i+=5){ const seg=kl.slice(i,i+5); w.push({date:seg[seg.length-1].date, close:seg[seg.length-1].close, open:seg[0].open, high:Math.max(...seg.map(x=>x.high)), low:Math.min(...seg.map(x=>x.low)), volume:seg.reduce((s,x)=>s+x.volume,0)}); } return w; }

async function main(){
  console.log('加载ETF日K线(聚合周线)...');
  const kls={};
  for(const [c,n] of POOL){ const kl=await fetchKL(c); if(kl&&kl.length>250){ kls[c]={name:n,kl,dayClose:kl.map(x=>x.close)}; } await new Promise(r=>setTimeout(r,100)); }
  const codes=Object.keys(kls);
  const hs300=await fetchKL('sh000300'); const c300=hs300.map(x=>x.close);

  const rows=[];
  for(const code of codes){
    const {kl,dayClose}=kls[code]; const L=kl.length;
    const wk=toWeeks(kl); const wl=wk.length;
    const wclose=wk.map(x=>x.close); const wrsi=rsiArr(wclose,14);
    for(let i=60;i<wl;i++){
      const ma20=sma(wclose,i,20), ma60=sma(wclose,i,60);
      const c20=(ma20!=null)?(wclose[i]/ma20-1)*100:0, c60=(ma60!=null)?(wclose[i]/ma60-1)*100:0;
      if(!(c20<=0||c60<=0)) continue; // 弱市
      // 估值分位(周,250周窗口)
      const win=wclose.slice(Math.max(0,i-249),i+1);
      const frac=win.length>=2?pctRank(win,wclose[i]):1;
      const wkDrop=(i>=1)?(wclose[i]/wclose[i-1]-1)*100:0; // 单周跌幅
      // 极端事件：周RSI<20 且 估值最低10% 且 单周暴跌>5%
      const extreme = wrsi[i]<20 && frac<0.10 && wkDrop<-5;
      if(!extreme) continue;
      const dayIdx=i*5+4; if(dayIdx>=L) continue;
      const rec={code,name:kls[code].name,date:wk[i].date, wrsi:wrsi[i], frac, wkDrop, dayIdx};
      // 未来持有收益(绝对+相对300)
      for(const N of [120,250]){
        const t=dayIdx+N; if(t>=L){ rec['a'+N]=null; rec['r'+N]=null; continue; }
        let dirty=false; for(let k=dayIdx+1;k<=t;k++){ if(Math.abs(dayClose[k]/dayClose[k-1]-1)>0.25){dirty=true;break;} }
        rec['a'+N]= dirty?null:(dayClose[t]/dayClose[dayIdx]-1)*100;
        rec['r'+N]= dirty?null:((dayClose[t]/dayClose[dayIdx]-1)-(c300[t]/c300[dayIdx]-1))*100;
      }
      rows.push(rec);
    }
  }
  console.log('极端事件信号样本 n='+rows.length);
  if(!rows.length){ console.log('无样本'); return; }
  function rep(N,key){
    const v=rows.filter(r=>r[key]!=null);
    if(!v.length){ console.log('  n=0'); return; }
    const up=v.filter(r=>r[key]>0).length;
    const mean=v.reduce((s,r)=>s+r[key],0)/v.length;
    console.log('  N='+N+'  命中率='+(up/v.length*100).toFixed(1)+'%  n='+v.length+'  平均='+(mean>=0?'+':'')+mean.toFixed(2)+'%');
  }
  console.log('\n=== 绝对上涨命中率 ===');
  rep(120,'a120'); rep(250,'a250');
  console.log('\n=== 跑赢沪深300命中率 ===');
  rep(120,'r120'); rep(250,'r250');
  // 案例
  console.log('\n=== 极端事件案例(前15) ===');
  rows.slice(0,15).forEach(r=>console.log('  '+r.code+' '+r.name+' '+r.date+' wRSI='+r.wrsi.toFixed(0)+' frac='+(r.frac*100).toFixed(0)+'% drop='+r.wkDrop.toFixed(1)+'%  a250='+(r.a250==null?'脏':(r.a250>=0?'+':'')+r.a250.toFixed(0)+'%')));
}
main().catch(e=>{console.error(e);process.exit(1);});
