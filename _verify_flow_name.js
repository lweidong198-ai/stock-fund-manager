const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function findChrome(){
  const roots = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for(const p of roots){ if(fs.existsSync(p)) return p; }
  return null;
}
const CHROME = findChrome();
const FILE = 'file://' + path.resolve('index.html');

(async()=>{
  const errors=[];
  const browser = await puppeteer.launch({ executablePath:CHROME, headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e=>errors.push('PAGEERR: '+e.message));
  page.on('console', m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
  await page.goto(FILE, {waitUntil:'networkidle2'});

  await page.evaluate(()=>{
    // 模拟 name 缺失：watch 没有 name、quotes 也没有 name、hold 也没有 name
    state.watch = [
      {code:'sh600519', kind:'stock'}, // 无 name
      {code:'sz000001', kind:'stock', name:'平安银行'} // 有 name
    ];
    state.hold = [{code:'sh600519', shares:100, cost:1700}]; // hold 无 name
    state.selected = 'sh600519';
    state.quotes['sh600519'] = { code:'sh600519', price:1480, changePct:-1.2, outer:350000, inner:520000 };
    state.quotes['sz000001'] = { code:'sz000001', name:'平安银行', price:11.5, changePct:0.3, outer:800000, inner:600000 };
    window.loadFundFlow = function(code, cb){ cb({main:0, mainPct:0, raw:[]}); };
    goView('flow');
  });
  await new Promise(r=>setTimeout(r,400));

  const res = await page.evaluate(()=>{
    const sel = document.getElementById('flowSel');
    const list = document.getElementById('flowList');
    const rows = list ? Array.from(list.querySelectorAll('tbody tr')).map(tr => tr.innerText) : [];
    return {
      selHead: sel ? sel.innerText.slice(0,80) : '',
      rows,
      listHasUndefined: list ? list.innerText.includes('undefined') : false
    };
  });

  console.log('选中卡头部:', JSON.stringify(res.selHead));
  console.log('列表行:', res.rows);
  console.log('列表含 undefined:', res.listHasUndefined);
  console.log('JS errors:', errors.length, errors.slice(0,3));

  const ok = !res.listHasUndefined && res.rows.length>=2 && res.rows.some(r=>r.includes('平安银行')) && errors.length===0;
  console.log('\nVERDICT:', ok ? 'PASS ✓ name缺失时正确回退，无undefined' : 'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{ console.error('FATAL', e); process.exit(2); });
