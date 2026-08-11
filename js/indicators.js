/* =========================================================================
 * indicators.js
 * 模块来源小节：指标计算（纯函数）
 * 说明：本文件由单文件 index.html 按原小节注释机械拆分而来，
 *       代码逐字保留，函数仍为全局（经典 script 加载，双击 file 可用）。
 * ========================================================================= */

/* ============ 指标计算（纯函数） ============ */
function ema(arr,n){ const k=2/(n+1); let p=arr[0]; const o=[p]; for(let i=1;i<arr.length;i++){ p=arr[i]*k+p*(1-k); o.push(p);} return o; }
function sma(arr,n){ const o=[]; let s=0; for(let i=0;i<arr.length;i++){ s+=arr[i]; if(i>=n) s-=arr[i-n]; o.push(i>=n-1?s/n:null);} return o; }
function macd(close, p){ p=p||{fast:12,slow:26,signal:9}; const dif=ema(close,p.fast).map((v,i)=>v-ema(close,p.slow)[i]); const dea=ema(dif,p.signal); const bar=dif.map((v,i)=>(v-dea[i])*2); return {dif,dea,bar}; }
// MACD 参数预设（副图/速览卡用，大师评级仍用标准 12/26/9 不受影响）
const MACD_PRESETS = {
  std:   {fast:12, slow:26, signal:9, label:'标准 12/26/9'},
  short: {fast:6,  slow:12, signal:5, label:'短线 6/12/5'},
  long:  {fast:19, slow:39, signal:9, label:'长线 19/39/9'},
  band:  {fast:8,  slow:21, signal:5, label:'波段 8/21/5'}
};
function kdj(high,low,close,n=9){ const k=[],d=[],j=[]; let pk=50,pd=50;
  for(let i=0;i<close.length;i++){ const s=Math.max(0,i-n+1); let hh=-Infinity,ll=Infinity;
    for(let t=s;t<=i;t++){ if(high[t]>hh)hh=high[t]; if(low[t]<ll)ll=low[t]; }
    const rsv = hh===ll?50:(close[i]-ll)/(hh-ll)*100; pk=2/3*pk+1/3*rsv; pd=2/3*pd+1/3*pk;
    k.push(pk); d.push(pd); j.push(3*pk-2*pd);
  } return {k,d,j};
}
function rsi(closes,p){ const o=[]; let ag=0,al=0;
  for(let i=0;i<closes.length;i++){
    if(i===0){o.push(null);continue;}
    const ch=closes[i]-closes[i-1], g=Math.max(0,ch), l=Math.max(0,-ch);
    if(i<p){ag+=g;al+=l;o.push(null);}
    else if(i===p){ag+=g;al+=l;const rs=al===0?100:ag/al;o.push(100-100/(1+rs));}
    else{ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;const rs=al===0?100:ag/al;o.push(100-100/(1+rs));}
  } return o;
}
function boll(closes,n=20,k=2){ const mid=sma(closes,n),up=[],low=[];
  for(let i=0;i<closes.length;i++){ if(mid[i]==null){up.push(null);low.push(null);continue;}
    let s=0; for(let t=i-n+1;t<=i;t++){const dd=closes[t]-mid[i];s+=dd*dd;} const sd=Math.sqrt(s/n);
    up.push(mid[i]+k*sd); low.push(mid[i]-k*sd);
  } return {mid,up,low};
}

