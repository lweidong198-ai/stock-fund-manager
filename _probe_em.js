// 探测东财外部因子接口在沙箱可达性
async function tryFetch(url,label){
  try{
    const ctrl=new AbortController(); const to=setTimeout(()=>{try{ctrl.abort();}catch(_){}},12000);
    const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0','Referer':'https://quote.eastmoney.com/'}});
    clearTimeout(to);
    const txt=await r.text();
    console.log('\n=== '+label+' HTTP='+r.status+' len='+txt.length+' ===');
    console.log(txt.slice(0,260));
    return txt.length;
  }catch(e){ console.log('\n=== '+label+' FAIL '+e.message+' ==='); return -1; }
}
(async()=>{
  // 1) ETF 主力资金流历史 kline (secid 1.515050=沪)
  await tryFetch('https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=101&secid=1.515050&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65','ETF资金流515050');
  // 2) 北向资金每日净买入历史
  await tryFetch('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_HOLD_STA&columns=ALL&pageSize=5&sortColumns=DATE&sortTypes=-1','北向资金');
  // 3) 全市场宽度(涨跌家数) 当日
  await tryFetch('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1&po=1&np=1&fltt=2&invt=2&fields=f12,f14&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23','全市场宽度');
})();
