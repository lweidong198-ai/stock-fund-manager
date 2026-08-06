const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'https://lweidong198-ai.github.io/stock-fund-manager/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs=[]; page.on('console',m=>logs.push('['+m.type()+'] '+m.text())); page.on('pageerror',e=>logs.push('[pageerror] '+e.message));
  page.on('response', r=>{ const u=r.url(); if(/qt\.gtimg/.test(u)) logs.push('RESP '+r.status()+' '+u.slice(0,110)); });
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('goto '+e.message));
  await page.waitForSelector('#holdCode',{timeout:15000});
  await page.evaluate(()=>{ localStorage.clear(); localStorage.setItem('sfm_hold_v2', JSON.stringify([{code:'sh600519',kind:'stock',shares:21,cost:12.08}])); localStorage.setItem('sfm_watch_v2', JSON.stringify([{code:'sh600519',kind:'stock'}])); });
  await page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('reload '+e.message));
  await page.waitForSelector('#holdSummary',{timeout:15000});
  await new Promise(r=>setTimeout(r,7000));
  const res = await page.evaluate(()=>({
    quote: (typeof state!=='undefined'&&state.quotes&&state.quotes['sh600519'])? JSON.stringify({price:state.quotes['sh600519'].price, changePct:state.quotes['sh600519'].changePct, name:state.quotes['sh600519'].name}) : 'NO_QUOTE',
    holdSummary: document.getElementById('holdSummary')?document.getElementById('holdSummary').innerText:'NO',
    holdBox: document.getElementById('holdBox')?document.getElementById('holdBox').innerText.slice(0,300):'NO'
  }));
  console.log('quote[sh600519]:', res.quote);
  console.log('holdSummary:', res.holdSummary);
  console.log('holdBox:', res.holdBox);
  console.log('--- gtimg responses ---'); console.log(logs.filter(l=>l.includes('RESP')||l.includes('error')).slice(-12).join('\n'));
  await browser.close();
})();
