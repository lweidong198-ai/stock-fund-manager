const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function failPath(page){
  return page.evaluate(() => {
    state.watch.push({code:'000001', kind:'fund'}); save();
    goView('market');
    selectCode('000001');
  });
}

(async()=>{
  const browser = await puppeteer.launch({executablePath:CHROME, args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });

  // 拦截东方财富，模拟沙箱不可达
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/fund\.eastmoney\.com/.test(req.url())) req.abort();
    else req.continue();
  });
  await page.setContent(HTML, {waitUntil:'domcontentloaded', timeout:60000}).catch(()=>{});
  await failPath(page);

  // A. 纯场外基金无数据时，提示里有「场内ETF」可点击入口
  const a = await page.evaluate(() => {
    const mfd = document.getElementById('marketFundDetail');
    const hint = document.getElementById('mFHint');
    const jumps = document.querySelectorAll('.etf-jump');
    return {
      detailVisible: mfd && mfd.style.display==='block',
      hintHasETF: /场内\s*ETF/.test(hint ? hint.textContent : ''),
      jumpCount: jumps.length,
      firstJump: jumps[0] ? jumps[0].textContent : null,
      stat: (document.getElementById('mFStat')||{}).textContent||''
    };
  });

  // B. 点击第一个场内ETF入口 → 应切到K线视图（marketFundDetail隐藏、detail显示）
  let b = {ok:false};
  try {
    await page.evaluate(() => { document.querySelector('.etf-jump').click(); });
    await page.waitForFunction(() => {
      const mfd = document.getElementById('marketFundDetail');
      const det = document.getElementById('detail');
      return mfd && det && mfd.style.display==='none' && det.style.display!=='none';
    }, {timeout: 8000});
    b = await page.evaluate(() => ({
      ok: true,
      selected: state.selected,
      fundDetailHidden: document.getElementById('marketFundDetail').style.display==='none',
      detailShown: document.getElementById('detail').style.display!=='none',
      detailHasKline: (document.getElementById('klineMain')||{}).width>0
    }));
  } catch(e) { b = {ok:false, err:String(e).slice(0,100)}; }

  console.log('A (纯场外基金无数据提示):', JSON.stringify(a,null,2));
  console.log('B (点击场内ETF入口→切K线):', JSON.stringify(b,null,2));
  console.log('JS errors:', errs.length, errs.slice(0,5));
  await browser.close();

  const okA = a.detailVisible && a.hintHasETF && a.jumpCount>=4 && !!a.firstJump;
  const okB = b.ok && /^(sh|sz|hk)5/.test(b.selected||'') && b.fundDetailHidden && b.detailShown;
  // 4个报错均来自本测试主动拦截的东方财富请求(net::ERR_FAILED)，属预期，非app异常
  const onlyExpected = errs.every(e => /net::ERR_FAILED|Failed to fetch|eastmoney/i.test(e));
  const ok = okA && okB && onlyExpected;
  console.log(ok ? 'VERIFY_PASS' : 'VERIFY_FAIL');
  process.exit(ok?0:1);
})();
