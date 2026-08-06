const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'https://lweidong198-ai.github.io/stock-fund-manager/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs=[]; page.on('console',m=>logs.push('['+m.type()+'] '+m.text())); page.on('pageerror',e=>logs.push('[pageerror] '+e.message));
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('goto '+e.message));
  await page.waitForSelector('#holdCode',{timeout:15000});
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('reload '+e.message));
  await page.waitForSelector('#btnAddHold',{timeout:15000});
  await page.evaluate(()=>{ document.getElementById('holdCode').value='012863'; document.getElementById('holdShares').value='1000'; document.getElementById('holdCost').value='1.50'; });
  await page.evaluate(()=>document.getElementById('btnAddHold').click());
  await new Promise(r=>setTimeout(r,9000));
  const res = await page.evaluate(()=>({
    holdLen: (typeof state!=='undefined')?state.hold.length:'?',
    holdSummary: document.getElementById('holdSummary')?document.getElementById('holdSummary').innerText:'NO',
    holdBox: document.getElementById('holdBox')?document.getElementById('holdBox').innerText.slice(0,300):'NO'
  }));
  console.log('holdLen:',res.holdLen);
  console.log('holdSummary:',res.holdSummary);
  console.log('holdBox:',res.holdBox);
  console.log('--- tail logs ---'); console.log(logs.slice(-8).join('\n'));
  await browser.close();
})();
