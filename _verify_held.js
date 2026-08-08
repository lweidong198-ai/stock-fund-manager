const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 找 Chrome 路径
function findChrome(){
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for(const c of candidates){ if(fs.existsSync(c)) return c; }
  return null;
}

(async () => {
  const chrome = findChrome();
  if(!chrome){ console.log('NO_CHROME'); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR: '+e.message));
  page.on('console', m => { if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });

  const htmlPath = path.join(__dirname,'index.html');
  // 每次新文档创建前注入种子：模拟历史残留数据（515050空占位 + 000858真持仓）
  const seed = `
    try{
      const demo = [
        {code:'sh600519', kind:'stock'},
        {code:'515050', kind:'fund'},
        {code:'sz000858', kind:'stock'}
      ];
      localStorage.setItem('sfm_watch_v2', JSON.stringify(demo));
      localStorage.setItem('sfm_hold_v2', JSON.stringify([
        {code:'sh515050', kind:'fund', shares:0, cost:0},
        {code:'sz000858', kind:'stock', shares:100, cost:50}
      ]));
    }catch(e){}
  `;
  await page.evaluateOnNewDocument(seed);
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
  await new Promise(r=>setTimeout(r,300));

  // 点「行情看板」导航进入自选卡（初始视图是 home）
  await page.click('.navitem[data-view="market"]');
  await new Promise(r=>setTimeout(r,300));

  const res = await page.evaluate(()=>{
    const rows = [...document.querySelectorAll('#watchBox tr.wl-row')];
    const get = (code)=>{
      const tr = rows.find(r=>r.dataset.code===code);
      if(!tr) return null;
      return { hasHeld: !!tr.querySelector('.wl-held'), name: tr.querySelector('.wl-name')?.childNodes[0]?.textContent };
    };
    return {
      total: rows.length,
      codes: rows.map(r=>r.dataset.code),
      m5050: get('sh515050'),
      w858: get('sz000858'),
      m519: get('sh600519')
    };
  });

  await browser.close();

  console.log('rows:', res.total);
  console.log('codes:', JSON.stringify(res.codes));
  console.log('sh515050(旧空占位):', JSON.stringify(res.m5050));
  console.log('sz000858(真持仓):', JSON.stringify(res.w858));
  console.log('sh600519(无持仓):', JSON.stringify(res.m519));
  console.log('JS errors:', errors.length, errors.slice(0,5));

  // 判定：旧空占位(sh515050)不应显示持有中；真持仓(sz000858)应显示；无持仓(sh600519)不显示
  const ok = res.total===3
    && res.m5050 && res.m5050.hasHeld===false
    && res.w858 && res.w858.hasHeld===true
    && res.m519 && res.m519.hasHeld===false
    && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ 自选卡"持有中"仅真实持仓显示, 旧空占位不再误显' : 'FAIL ✗');
  process.exit(ok?0:1);
})().catch(e=>{ console.error(e); process.exit(3); });
