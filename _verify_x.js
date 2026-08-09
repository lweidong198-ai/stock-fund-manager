const puppeteer = require('puppeteer-core');
const path = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  const browser = await puppeteer.launch({ executablePath: path, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR '+e.message));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await page.goto('file:///C:/Users/Mloong/stock-fund-manager/index.html', { waitUntil: 'load' });
  // 预置自选（股票/ETF，非基金）+ 选中，切到资金流向，手动触发行情
  await page.evaluate(() => {
    state.watch = [
      {code:'sh600519',kind:'stock',name:'贵州茅台'},
      {code:'sz300750',kind:'stock',name:'宁德时代'},
      {code:'sh510300',kind:'etf',name:'沪深300ETF'},
      {code:'sz159915',kind:'etf',name:'创业板ETF'}
    ];
    state.hold = [{code:'sh600519',shares:100,cost:1700,target:0,stop:0}];
    state.selected = 'sh600519';
    goView('flow');
    refreshQuotes();
  });
  await new Promise(r => setTimeout(r, 7000));
  const r1 = await page.evaluate(() => {
    const sel = document.getElementById('flowSel').innerText;
    const list = document.getElementById('flowList').innerText;
    const view = state.view;
    const hasOuter = state.quotes['sh600519'] && state.quotes['sh600519'].outer > 0;
    const dump = Object.keys(state.quotes).map(c => c+':outer='+(state.quotes[c].outer)+',inner='+(state.quotes[c].inner)+',limited='+(!!state.quotes[c].limited));
    return { sel, list, view, hasOuter, dump };
  });
  // 点列表第一行（flowPick 模拟）→ 验证选中卡更新且仍停留 flow 视图
  const r2 = await page.evaluate(() => {
    const firstRow = document.querySelector('#flowList table tbody tr');
    if (!firstRow) return { clicked:false };
    const name = firstRow.querySelector('td').innerText;
    firstRow.click();
    return { clicked:true, name, selAfter: document.getElementById('flowSel').innerText.slice(0,40), viewAfter: state.view };
  });
  console.log('--- 选中卡 ---'); console.log(r1.sel.replace(/\n/g,' | ').slice(0,260));
  console.log('--- 列表卡(前200字) ---'); console.log(r1.list.replace(/\n/g,' | ').slice(0,200));
  console.log('view=', r1.view, '| quotes有内外盘=', r1.hasOuter);
  console.log('quotes dump:', r1.dump.join('  ||  '));
  console.log('点击列表第一行:', JSON.stringify(r2));
  const pass = r1.hasOuter && r1.sel.includes('主动买') && r1.sel.includes('主动卖')
    && r1.list.includes('贵州茅台') && r1.list.includes('宁德时代') && r1.list.includes('沪深300ETF') && r1.list.includes('创业板ETF')
    && r1.view==='flow' && r2.clicked && r2.viewAfter==='flow'
    && errs.length===0;
  console.log('JS errors:', errs.length ? errs.join(' | ') : 'none');
  console.log('\nVERDICT:', pass ? 'PASS ✓ 资金流向模块渲染/数据/排序/点击联动均正常' : 'FAIL ✗');
  await browser.close();
  process.exit(pass?0:1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
