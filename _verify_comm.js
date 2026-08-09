const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
function pricePct(kl,years){if(!kl||kl.length<60)return null;const arr=kl.slice(-Math.min(years*252,kl.length)).map(b=>Number(b.close));const cur=arr[arr.length-1];const below=arr.filter(v=>v<cur).length;return below/arr.length;}
(async()=>{
  const sym='sh515880';
  const txt=await get('https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20kcbtest=/CN_MarketData.getKLineData?symbol='+sym+'&scale=240&ma=5&datalen=5000&_=1');
  const m=txt.indexOf('['); const e=txt.lastIndexOf(']');
  if(m<0||e<0){console.log('解析失败');process.exit(1);}
  const arr=JSON.parse(txt.slice(m,e+1));
  const kl=arr.map(x=>({date:x.day,close:+x.close})).filter(x=>x.close>0);
  console.log('通信ETF(515880) 真实K线根数=',kl.length,' 起=',kl[0].date,' 最新=',kl[kl.length-1].date,' 最新价=',kl[kl.length-1].close);
  console.log('真实计算: 3年分位=',(pricePct(kl,3)*100).toFixed(1)+'%',' 5年分位=',(pricePct(kl,5)*100).toFixed(1)+'%');
  // 样例对比：沪深300ETF 510300 也应走同逻辑
  const txt2=await get('https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20kcbtest=/CN_MarketData.getKLineData?symbol=sh510300&scale=240&ma=5&datalen=5000&_=1');
  const m2=txt2.indexOf('['); const e2=txt2.lastIndexOf(']');
  const kl2=JSON.parse(txt2.slice(m2,e2+1)).map(x=>({date:x.day,close:+x.close})).filter(x=>x.close>0);
  console.log('沪深300ETF(510300) 真实: 3年分位=',(pricePct(kl2,3)*100).toFixed(1)+'%',' 5年分位=',(pricePct(kl2,5)*100).toFixed(1)+'%');
})().catch(e=>{console.error(e);process.exit(1);});
