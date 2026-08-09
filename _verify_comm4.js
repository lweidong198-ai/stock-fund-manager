const fs=require('fs');
function pricePct(kl,years){
  if(!kl||kl.length<2) return null;
  const n=Math.min(Math.max(1,Math.floor(years*252)),kl.length-1);
  const recent=kl.slice(kl.length-n);
  const closes=recent.map(x=>x.close);
  const cur=kl[kl.length-1].close;
  const below=closes.filter(c=>c<cur).length;
  return +(below/closes.length*100).toFixed(1);
}
const files={ '_c.json':'sh515050(5G通信ETF)', '_c2.json':'sh515880(通信设备ETF)' };
for(const f in files){
  const txt=fs.readFileSync(f,'utf8');
  const a=txt.indexOf('[{"');
  const b=txt.lastIndexOf('}]');
  if(a<0||b<0){ console.log(files[f],'>> 解析失败'); continue; }
  const arr=JSON.parse(txt.slice(a,b+2)).map(x=>({day:x.day,close:+x.close})).filter(x=>x.close>0);
  const cur=arr[arr.length-1].close;
  console.log(files[f], '| 当前价', cur, '| 条数', arr.length, '| 3年分位', pricePct(arr,3)+'%', '| 5年分位', pricePct(arr,5)+'%');
}
