const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const https = require('https');
const fs = require('fs');

const URL = 'http://localhost:8099/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CODE = 'sh600519';

function fetchSina(scale, datalen){
  return new Promise((res, rej)=>{
    const name = 'kcb'+Math.random().toString(36).slice(2);
    const url = `https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20${name}=/CN_MarketData.getKLineData?symbol=${CODE}&scale=${scale}&ma=5&datalen=${datalen}&_=${Date.now()}`;
    https.get(url, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{ const body=d.replace(/^var\s+\w+\s*=\s*/,'').trim(); const arr=JSON.parse(body); res(arr.map(x=>({day:x.day,open:+x.open,high:+x.high,low:+x.low,close:+x.close,vol:+x.volume}))); }catch(e){ rej(e);} }); }).on('error',rej);
  });
}

(async ()=>{
  const logs=[];
  const browser = await puppeteer.launch({executablePath:CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900});
  page.on('console', m=>logs.push('PAGE:'+m.text()));
  page.on('pageerror', e=>logs.push('PAGEERR:'+e.message));

  // 1) 打开页面，注入自选（贵州茅台=股票）
  await page.goto(URL, {waitUntil:'networkidle2', timeout:30000});
  await page.evaluate(c=>{ localStorage.setItem('sfm_watch_v2', JSON.stringify([{code:c, kind:'stock', name:'贵州茅台'}])); }, CODE);
  await page.reload({waitUntil:'networkidle2', timeout:30000});
  await page.evaluate(c=>{ if(typeof selectCode==='function') selectCode(c); }, CODE);

  // 2) 等 K 线加载进 state.kcache
  let kl=null, demo=false;
  for(let i=0;i<40;i++){
    const r = await page.evaluate(c=>{
      const k = (window.state && state.kcache) ? state.kcache[c+'d'] : null;
      if(k && k.length){ return {len:k.length, demo: !!k._demo, last:k[k.length-1], first:k[0]}; }
      return null;
    }, CODE);
    if(r){ kl=r; demo=r.demo; break; }
    await new Promise(r=>setTimeout(r,400));
  }

  // 3) 读图上最后一根 + MA + 像素颜色 + 浏览器内抓新浪原数据交叉比对
  const onPage = await page.evaluate(async ()=>{
    const k = state.kcache['sh600519d'];
    const closes = k.map(x=>x.close);
    function sma(a,n){ const o=[]; for(let i=0;i<a.length;i++){ if(i<n-1){o.push(null);continue;} let s=0; for(let j=i-n+1;j<=i;j++)s+=a[j]; o.push(s/n);} return o; }
    const last = k[k.length-1];
    const ma5 = sma(closes,5)[k.length-1], ma10 = sma(closes,10)[k.length-1], ma20 = sma(closes,20)[k.length-1];
    // 像素颜色统计：红涨(#e01f22≈224,31,34) / 绿跌(#0f9d58≈15,157,88)
    const cv = document.getElementById('klineMain');
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0,0,cv.width,cv.height).data;
    let red=0, green=0;
    for(let p=0;p<img.length;p+=4){
      const r=img[p],g=img[p+1],b=img[p+2];
      if(r>150 && g<80 && b<80) red++;
      else if(g>120 && r<80 && b<120) green++;
    }
    // 浏览器上下文抓新浪原数据做交叉比对（页面本身能通新浪）
    const sina = await new Promise(res=>{
      const name='kcbx'+Math.random().toString(36).slice(2);
      const s=document.createElement('script');
      s.onload=()=>{ try{ const arr=window[name].map(x=>({day:x.day,open:+x.open,high:+x.high,low:+x.low,close:+x.close,vol:+x.volume})); res(arr); }catch(e){ res(null); } };
      s.onerror=()=>res(null);
      s.src='https://money.finance.sina.com.cn/quotes_service/api/jsonp_v2.php/var%20'+name+'=/CN_MarketData.getKLineData?symbol=sh600519&scale=240&ma=5&datalen=5000&_='+Date.now();
      document.body.appendChild(s);
    });
    const sLast = sina && sina.length ? sina[sina.length-1] : null;
    return { len:k.length, firstDate:k[0].date, lastDate:k[k.length-1].date,
      lastOHLC:{o:last.open,h:last.high,l:last.low,c:last.close,v:last.vol},
      ma5, ma10, ma20, redPx:red, greenPx:green, demo:!!k._demo, sinaLast:sLast };
  });

  await page.screenshot({path:'C:/Users/Mloong/stock-fund-manager/_kline_shot.png'});

  // 4) 交叉比对（新浪原数据已在浏览器上下文抓取，存于 onPage.sinaLast）
  await browser.close();

  console.log('=== 页面渲染结果 ===');
  console.log(JSON.stringify(onPage, null, 2));
  console.log('demo(演示数据)=', demo);
  console.log('=== 新浪原数据交叉比对 ===');
  if(onPage.sinaLast){
    const sLast = onPage.sinaLast;
    console.log('新浪末K=', JSON.stringify({day:sLast.day,o:sLast.open,h:sLast.high,l:sLast.low,c:sLast.close,v:sLast.vol}));
    const match = Math.abs(sLast.close - onPage.lastOHLC.c) < 0.02 && sLast.day === onPage.lastDate;
    console.log('交叉比对(末K日期+收盘一致)=', match ? 'PASS ✅' : 'FAIL ❌');
  } else {
    console.log('新浪抓取失败，跳过交叉比对');
  }

  // 5) 判定
  const orderOK = onPage.firstDate <= onPage.lastDate;
  const colorOK = onPage.redPx > 50 && onPage.greenPx > 50;
  const maOK = onPage.ma5>0 && onPage.ma10>0 && onPage.ma20>0 && onPage.ma5>=onPage.ma20*0.5 && onPage.ma5<=onPage.ma20*2;
  const realOK = !onPage.demo;
  console.log('=== 判定 ===');
  console.log('时间轴方向(旧→新)=', orderOK ? 'PASS ✅' : 'FAIL ❌', `(${onPage.firstDate} → ${onPage.lastDate})`);
  console.log('红涨绿跌(两种颜色都存在)=', colorOK ? 'PASS ✅' : 'FAIL ❌', `(红像素=${onPage.redPx}, 绿像素=${onPage.greenPx})`);
  console.log('MA线有值且合理=', maOK ? 'PASS ✅' : 'FAIL ❌', `(MA5=${onPage.ma5?.toFixed(2)}, MA20=${onPage.ma20?.toFixed(2)})`);
  console.log('使用真实数据(非演示)=', realOK ? 'PASS ✅' : 'FAIL ❌');
  console.log('VERDICT:', (orderOK&&colorOK&&maOK&&realOK) ? 'KLINE_OK ✅' : 'KLINE_PROBLEM ❌');

  fs.writeFileSync('C:/Users/Mloong/stock-fund-manager/_kline_log.txt', logs.join('\n'));
})().catch(e=>{ console.error('PROBE CRASH:', e); process.exit(1); });
