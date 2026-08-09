const puppeteer = require('puppeteer-core');
const path = 'C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 400));

  // 注入自选：含股票与基金
  await page.evaluate(() => {
    state.watch = [{ code: 'sh600519', kind: 'stock' }, { code: 'sz300750', kind: 'stock' }, { code: '000001', kind: 'fund' }];
    state.selected = 'sh600519';
    save();
  });

  const r = {};

  // 1) 点基金行 → 应在行情看板原地显示净值，不切视图
  await page.evaluate(() => { goView('market'); selectCode('000001'); });
  await new Promise(r => setTimeout(r, 200));
  r.fundView = await page.evaluate(() => ({
    view: state.view,
    mfd: document.getElementById('marketFundDetail').style.display,
    detail: document.getElementById('detail').style.display,
    viewFund: document.getElementById('viewFund').style.display,
    sel: state.selected
  }));

  // 2) 模拟基金数据加载完成后自动重绘（走 applyFundData 同路径）
  await page.evaluate(() => {
    state.fundData['000001'] = demoFund('000001');
    if (state.view === 'market') showMarketFund('000001'); else renderFund();
  });
  await new Promise(r => setTimeout(r, 200));
  r.fundDrawn = await page.evaluate(() => {
    const cv = document.getElementById('mFundNav');
    return { hasFd: !!(cv && cv._fd && cv._fd.nav && cv._fd.nav.length), name: document.getElementById('mFName').textContent, price: document.getElementById('mFPrice').textContent, hint: document.getElementById('mFHint').textContent };
  });

  // 3) 点股票行 → 应显示K线(detail)，隐藏净值(marketFundDetail)
  await page.evaluate(() => { selectCode('sh600519'); });
  await new Promise(r => setTimeout(r, 200));
  r.stockView = await page.evaluate(() => ({
    view: state.view,
    detail: document.getElementById('detail').style.display,
    mfd: document.getElementById('marketFundDetail').style.display,
    sel: state.selected
  }));

  // 4) goView('market') 选中基金不丢、原地显示净值（验证放开"基金必改股票"）
  await page.evaluate(() => { state.selected = '000001'; goView('market'); });
  await new Promise(r => setTimeout(r, 200));
  r.goMarketFund = await page.evaluate(() => ({
    view: state.view,
    sel: state.selected,
    mfd: document.getElementById('marketFundDetail').style.display
  }));

  console.log('fundView     :', JSON.stringify(r.fundView));
  console.log('fundDrawn    :', JSON.stringify(r.fundDrawn));
  console.log('stockView    :', JSON.stringify(r.stockView));
  console.log('goMarketFund :', JSON.stringify(r.goMarketFund));
  console.log('JS errors    :', errors.length, errors.slice(0, 5));

  const ok =
    r.fundView.view === 'market' && r.fundView.mfd === 'block' && r.fundView.detail === 'none' && r.fundView.viewFund === 'none' && r.fundView.sel === '000001' &&
    r.fundDrawn.hasFd === true && r.fundDrawn.name && r.fundDrawn.name !== '--' && /累计净值/.test(r.fundDrawn.hint) &&
    r.stockView.view === 'market' && r.stockView.detail !== 'none' && r.stockView.mfd === 'none' && r.stockView.sel === 'sh600519' &&
    r.goMarketFund.view === 'market' && r.goMarketFund.sel === '000001' && r.goMarketFund.mfd === 'block' &&
    errors.length === 0;

  console.log('\nRESULT:', ok ? 'PASS ✓' : 'FAIL ✗');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
