const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
function findChrome(){
  const roots = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'];
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
    state.watch=[]; state.hold=[]; state.selected=null;
    window.detectKind = function(raw){ return Promise.resolve({code:'sh515880', kind:'stock', name:'通信ETF'}); };
    if(typeof renderWatch==='function') renderWatch();
  });
  const before = await page.evaluate(()=>({watch:state.watch.length, hold:state.hold.length}));
  await page.evaluate(()=>{ goView('market'); document.getElementById('addInput').value='515880'; document.getElementById('btnAdd').click(); });
  await new Promise(r=>setTimeout(r,300));
  const after = await page.evaluate(()=>({
    watch:state.watch.length, hold:state.hold.length,
    watchHasCode: state.watch.some(w=>w.code==='sh515880'),
    holdHasCode: state.hold.some(h=>h.code==='sh515880')
  }));
  await page.evaluate(()=>renderWatch());
  await new Promise(r=>setTimeout(r,100));
  const hasHeld = await page.evaluate(()=>{
    const nameEls=[...document.querySelectorAll('.wl-name')];
    const commRow = nameEls.find(e=>e.innerText.includes('515880')||e.innerText.includes('通信'));
    return commRow ? commRow.querySelector('.wl-held')!==null : false;
  });
  console.log('before', JSON.stringify(before));
  console.log('after ', JSON.stringify(after));
  console.log('通信行显示"持仓中"标签 =', hasHeld);
  const ok = errors.length===0 && after.watch===1 && after.hold===0 && after.watchHasCode && !after.holdHasCode && hasHeld===false;
  console.log('\nVERDICT:', ok?'PASS ✓ 加自选仅进自选, 不再建持仓占位, 不显示"持仓中"':'FAIL ✗');
  await browser.close();
  process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
