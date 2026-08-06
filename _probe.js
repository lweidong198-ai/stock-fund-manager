const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'https://lweidong198-ai.github.io/stock-fund-manager/';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs = [], fails = [];
  page.on('console', m => logs.push('['+m.type()+'] '+m.text()));
  page.on('pageerror', e => logs.push('[pageerror] '+e.message));
  page.on('requestfailed', r => { const u=r.url(); if(/eastmoney|gtimg/.test(u)) fails.push('FAIL '+u+' :: '+(r.failure()&&r.failure().errorText)); });
  page.on('response', r => { const u=r.url(); if(/eastmoney|gtimg/.test(u)) logs.push('RESP '+r.status()+' '+u.slice(0,90)); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e=>logs.push('goto err '+e.message));

  // 注入用户真实那类持仓：旧版错存 sz012863 + kind:stock，外加一个干净基金 012863
  const hold = [
    { code:'sz012863', kind:'stock', shares:1000, cost:1.50 },
    { code:'012863', kind:'fund', shares:500, cost:0.80 }
  ];
  const watch = [
    { code:'sz012863', kind:'stock' },
    { code:'012863', kind:'fund' }
  ];
  await page.evaluate((h,w)=>{
    localStorage.setItem('sfm_hold_v2', JSON.stringify(h));
    localStorage.setItem('sfm_watch_v2', JSON.stringify(w));
  }, hold, watch);
  await page.reload({ waitUntil:'networkidle2', timeout:30000 }).catch(e=>logs.push('reload err '+e.message));

  // 等基金加载
  await new Promise(r=>setTimeout(r, 9000));

  const res = await page.evaluate(()=>{
    let out = {};
    try { out.stateFund = (typeof state!=='undefined' && state.fundData) ? JSON.stringify(Object.keys(state.fundData).reduce((o,k)=>{const f=state.fundData[k];o[k]={latest:f&&f.latest,navLen:f&&f.nav&&f.nav.length,name:f&&f.name};return o;},{})) : 'NO_STATE'; } catch(e){ out.stateFund='ERR '+e.message; }
    try { out.holdSummary = document.getElementById('holdSummary') ? document.getElementById('holdSummary').innerText : 'NO_holdSummary'; } catch(e){ out.holdSummary='ERR '+e.message; }
    try { out.holdBox = document.getElementById('holdBox') ? document.getElementById('holdBox').innerText.slice(0,600) : 'NO_holdBox'; } catch(e){ out.holdBox='ERR '+e.message; }
    return out;
  });

  console.log('=== FUND STATE ==='); console.log(res.stateFund);
  console.log('=== HOLD SUMMARY (用户可见总市值) ==='); console.log(res.holdSummary);
  console.log('=== HOLD BOX ==='); console.log(res.holdBox);
  console.log('=== NETWORK LOGS ==='); console.log(logs.slice(-25).join('\n'));
  console.log('=== FAILED EASTMONEY/GTIMG ==='); console.log(fails.join('\n')||'(none)');
  await browser.close();
})();
