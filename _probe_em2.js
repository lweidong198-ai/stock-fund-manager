// 解析东财 fflow kline 历史主力净流入结构
(async()=>{
  const url='https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=800&klt=101&secid=1.515050&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65';
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://quote.eastmoney.com/'}});
  const j=await r.json();
  console.log('rc=',j.rc,' data keys=', j.data?Object.keys(j.data):'null');
  if(j.data){
    console.log('name=',j.data.name,' code=',j.data.code);
    if(j.data.klines){ console.log('klines len=',j.data.klines.length); console.log('first=',j.data.klines[0]); console.log('last=',j.data.klines[j.data.klines.length-1]); }
    else console.log('no klines, sample=', JSON.stringify(j.data).slice(0,500));
  }
})().catch(e=>console.log('ERR',e.message));
