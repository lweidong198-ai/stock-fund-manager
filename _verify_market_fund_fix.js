const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async()=>{
  const browser = await puppeteer.launch({executablePath:CHROME, args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });

  // 拦截东方财富，模拟沙箱返回空壳 JS（onload 触发但无数据）
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (/fund\.eastmoney\.com/.test(req.url())) {
      req.respond({status: 200, contentType: 'application/javascript', body: '// empty'});
    } else req.continue();
  });
  await page.setContent(HTML, {waitUntil:'domcontentloaded', timeout:60000}).catch(()=>{});

  // 添加一只场外基金并点选
  await page.evaluate(() => {
    state.watch.push({code:'000001', kind:'fund'}); save();
    goView('market');
    selectCode('000001');
  });

  // 等待 fundFail 标记和 fallback 渲染
  await page.waitForFunction(() => {
    const mfd = document.getElementById('marketFundDetail');
    return mfd && mfd.style.display==='block' && document.querySelectorAll('.etf-jump').length >= 4;
  }, {timeout: 15000});

  const a = await page.evaluate(() => ({
    detailVisible: document.getElementById('marketFundDetail').style.display==='block',
    detailHidden: document.getElementById('detail').style.display==='none',
    emptyHidden: document.getElementById('detailEmpty').style.display==='none',
    fundFail: !!(state.fundFail && state.fundFail['000001']),
    hintText: (document.getElementById('mFHint')||{}).textContent||'',
    jumpCount: document.querySelectorAll('.etf-jump').length,
    stat: (document.getElementById('mFStat')||{}).textContent||''
  }));

  console.log('A (空壳JS → 基金fallback显示):', JSON.stringify(a,null,2));
  console.log('JS errors:', errs.length, errs.slice(0,5));
  await browser.close();

  const ok = a.detailVisible && a.detailHidden && a.emptyHidden && a.fundFail && /场内\s*ETF/.test(a.hintText) && a.jumpCount>=4;
  console.log(ok ? 'VERIFY_PASS' : 'VERIFY_FAIL');
  process.exit(ok?0:1);
})();
