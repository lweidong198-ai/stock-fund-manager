const https=require('https');
function fetchSina(code){
  return new Promise((resolve,reject)=>{
    const url='https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20kcbtest=/CN_MarketData.getKLineData?symbol='+code+'&scale=240&ma=5&datalen=5000&_=1';
    https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},r=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>resolve(d));
    }).on('error',reject);
  });
}
function pricePct(kl,years){
  if(!kl||kl.length<2) return null;
  const n=Math.min(Math.max(1,Math.floor(years*252)),kl.length-1);
  const recent=kl.slice(kl.length-n);
  const closes=recent.map(x=>x.close);
  const cur=kl[kl.length-1].close;
  const below=closes.filter(c=>c<cur).length;
  return +(below/closes.length*100).toFixed(1);
}
(async()=>{
  for(const code of ['sh515050','sh515880']){
    try{
      const txt=await fetchSina(code);
      const m=txt.match(/=\s*\(?\s*(\[[\s\S]*\])\s*;?\s*$/);
      if(!m){console.log(code,'解析失败');continue;}
      const arr=JSON.parse(m[1]).map(x=>({date:x.day,close:+x.close})).filter(x=>x.close>0);
      const cur=arr[arr.length-1].close;
      console.log(code, '当前价', cur, '| 数据条数', arr.length,
                  '| 3年分位', pricePct(arr,3)+'%', '| 5年分位', pricePct(arr,5)+'%');
    }catch(e){console.log(code,'ERR',e.message);}
  }
})();
