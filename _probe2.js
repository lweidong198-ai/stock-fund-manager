const puppeteer = require('C:/Users/Mloong/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || 'https://lweidong198-ai.github.io/stock-fund-manager/';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push('['+m.type()+'] '+m.text()));
  page.on('pageerror', e => logs.push('[pageerror] '+e.message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 }).catch(e=>logs.push('goto err '+e.message));
  // 全新清空
  await page.evaluate(()=>{ localStorage.clear(); });
  await page.reload({ waitUntil:'networkidle2', timeout:30000 }).catch(e=>logs.push('reload err '+e.message));

  // 模拟用户：在“加持仓/加自选”输入框输入 012863，点添加
  await page.waitForSelector('#addInput', { timeout: 5000 });
  await page.evaluate(()=>{ document.getElementById('addInput').value='012863'; });
  await page.evaluate(()=>{ document.getElementById('btnAdd').click(); });
  // 等识别 + 基金加载
  await new Promise(r=>setTimeout(r, 10000));

  const res = await page.evaluate(()=>{
    let out={};
    try { out.stateFund = (typeof state!=='undefined' && state.fundData) ? JSON.stringify(Object.keys(state.fundData).reduce((o,k)=>{const f=state.fundData[k];o[k]={latest:f&&f.latest,navLen:f&&f.nav&&f.nav.length};return o;},{})) : 'NO_STATE'; } catch(e){ out.stateFund='ERR '+e.message; }
    try { out.holdLen = (typeof state!=='undefined') ? state.hold.length : '?'; } catch(e){ out.holdLen='?'; }
    try { out.holdSummary = document.getElementById('holdSummary') ? document.getElementById('holdSummary').innerText : 'NO_holdSummary'; } catch(e){ out.holdSummary='ERR'; }
    try { out.holdBox = document.getElementById('holdBox') ? document.getElementById('holdBox').innerText.slice(0,400) : 'NO_holdBox'; } catch(e){ out.holdBox='ERR'; }
    try { out.addInputVal = document.getElementById('addInput') ? document.getElementById('addInput').value : '?'; } catch(e){ out.addInputVal='?'; }
    return out;
  });
  console.log('=== 全新+手动加012863 后 ===');
  console.log('stateFund:', res.stateFund);
  console.log('holdLen:', res.holdLen);
  console.log('holdSummary:', res.holdSummary);
  console.log('holdBox:', res.holdBox);
  console.log('addInputVal:', res.addInputVal);
  console.log('=== console (tail) ==='); console.log(logs.slice(-15).join('\n'));
  await browser.close();
})();
