const puppeteer=require('puppeteer-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox','--disable-setuid-sandbox']});
  const page=await browser.newPage();
  page.on('pageerror',e=>console.log('PAGEERR',e.message));
  await page.goto('http://localhost:8788/', {waitUntil:'networkidle2', timeout:60000}).catch(()=>{});
  await sleep(1200);
  await page.evaluate(()=>{ try{ goView('fund'); renderOpportunities(); }catch(e){} });
  let ready=false;
  for(let i=0;i<45;i++){ await sleep(2000); const ok=await page.evaluate(()=> !!(OPP_CACHE && (OPP_CACHE.rows||[]).length)); if(ok){ ready=true; break; } }
  const info=await page.evaluate(()=>{
    const rows=(OPP_CACHE&&OPP_CACHE.rows)||[];
    return rows.slice(0,6).map(r=>({
      name:r.name, code:r.code, len:r._kl?r._kl.length:0,
      first:r._kl&&r._kl.length?r._kl[0].date:null,
      last:r._kl&&r._kl.length?r._kl[r._kl.length-1].date:null,
      lastClose:r._kl&&r._kl.length?r._kl[r._kl.length-1].close:null,
      livePrice:r.price
    }));
  });
  console.log('TODAY', new Date().toISOString().slice(0,10));
  console.log(JSON.stringify(info,null,1));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
