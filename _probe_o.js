const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:8099/index.html';
const logs = [];
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => logs.push('ERR:'+e.message));
  await page.goto(URL, { waitUntil:'networkidle2', timeout:30000 });
  await page.waitForSelector('#btnAddHold', { timeout:8000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil:'networkidle2', timeout:30000 });
  await page.waitForSelector('#btnAddHold', { timeout:8000 });
  // 存储可用时警告应隐藏
  const warnHidden = await page.evaluate(() => getComputedStyle(document.getElementById('storageWarn')).display === 'none');
  logs.push('启动后存储警告隐藏=' + warnHidden);
  // 切到持仓管理并加一笔
  await page.evaluate(() => { const n=document.querySelector('.nav-asset'); if(n) n.click(); });
  await new Promise(r => setTimeout(r, 400));
  await page.type('#holdCode', '600519');
  await page.type('#holdShares', '100');
  await page.type('#holdCost', '1300');
  await page.click('#btnAddHold');
  await new Promise(r => setTimeout(r, 2000));
  const toastShown = await page.evaluate(() => { const t=document.getElementById('toast'); return { text:t.textContent, show:t.classList.contains('show') }; });
  logs.push('加持仓后toast=' + JSON.stringify(toastShown));
  // 刷新验证持久化
  await page.reload({ waitUntil:'networkidle2', timeout:30000 });
  await page.waitForSelector('#btnAddHold', { timeout:8000 });
  await new Promise(r => setTimeout(r, 1200));
  const after = await page.evaluate(() => { const h=JSON.parse(localStorage.getItem('sfm_hold_v2')||'[]'); return { len:h.length, code:h[0]&&h[0].code }; });
  logs.push('刷新后持仓=' + JSON.stringify(after));
  await browser.close();
  console.log(logs.join('\n'));
  const parts = {
    warnHidden: warnHidden,
    toastShow: toastShown.show,
    toastTextHasSaved: /已保存/.test(toastShown.text),
    afterLen1: after.len===1,
    afterCode: after.code,
    afterCodeMatch: after.code==='sh600519'
  };
  console.log('PARTS: ' + JSON.stringify(parts));
  const ok = warnHidden && toastShown.show && /已保存/.test(toastShown.text) && after.len===1 && after.code==='sh600519';
  console.log('VERDICT: ' + (ok ? 'O_PASS' : 'O_FAIL'));
})().catch(e => { console.log('FATAL '+e.message+'\n'+logs.join('\n')); process.exit(1); });
