const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'https://lweidong198-ai.github.io/stock-fund-manager/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs=[]; page.on('console',m=>logs.push('['+m.type()+'] '+m.text())); page.on('pageerror',e=>logs.push('[pageerror] '+e.message));
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('goto '+e.message));
  await page.waitForSelector('#holdCode',{timeout:15000});
  // 模拟老板真实数据：一笔股票(sh600519, kind stock) + 一笔旧版错存基金(sz012863, kind stock)
  await page.evaluate(()=>{
    localStorage.clear();
    localStorage.setItem('sfm_hold_v2', JSON.stringify([
      {code:'sh600519', kind:'stock', shares:21, cost:12.08},
      {code:'sz012863', kind:'stock', shares:1000, cost:1.50}
    ]));
    localStorage.setItem('sfm_watch_v2', JSON.stringify([
      {code:'sh600519', kind:'stock'},
      {code:'sz012863', kind:'stock'}
    ]));
  });
  await page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(e=>logs.push('reload '+e.message));
  await page.waitForSelector('#holdSummary',{timeout:15000});
  // 等清洗+行情+基金加载
  await new Promise(r=>setTimeout(r,11000));
  const res = await page.evaluate(()=>({
    holdLen: (typeof state!=='undefined')?state.hold.length:'?',
    quote519: (state.quotes['sh600519'])?state.quotes['sh600519'].price:'NO',
    fund863: (state.fundData['012863'])?state.fundData['012863'].latest:'NO',
    holdSummary: document.getElementById('holdSummary')?document.getElementById('holdSummary').innerText:'NO',
    holdBox: document.getElementById('holdBox')?document.getElementById('holdBox').innerText.slice(0,500):'NO',
    // 关键断言：600519 必须按股票现价(≠演示基金1.x)，012863 必须按基金净值
    verdict: (function(){
      const q=state.quotes['sh600519'];
      const f=state.fundData['012863'];
      if(!q) return 'FAIL: 600519 无股票行情';
      if(q.price<100) return 'FAIL: 600519 现价被错算成基金演示值('+q.price+')';
      if(!f||!f.latest) return 'FAIL: 012863 基金净值未加载';
      return 'PASS: 600519现价='+q.price+' 012863净值='+f.latest;
    })()
  }));
  console.log('holdLen:',res.holdLen);
  console.log('quote[sh600519].price:',res.quote519);
  console.log('fundData[012863].latest:',res.fund863);
  console.log('VERDICT:',res.verdict);
  console.log('holdSummary:',res.holdSummary);
  console.log('holdBox:',res.holdBox);
  console.log('--- console tail ---'); console.log(logs.slice(-10).join('\n'));
  await browser.close();
})();
