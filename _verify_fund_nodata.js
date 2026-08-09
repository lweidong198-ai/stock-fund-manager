const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const EXEC = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function failPath(page){
  return page.evaluate(() => {
    goView('market');                                   // 真实用户是从行情看板点基金的
    state.watch.push({code:'000001', kind:'fund'}); save(); renderWatch(); selectCode('000001');
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXEC, headless: 'new', args:['--no-sandbox','--disable-setuid-sandbox'] });

  // ===== 场景A：拦截东方财富（模拟沙箱不可达）=====
  const pa = await browser.newPage();
  const errsA = [];
  pa.on('pageerror', e => errsA.push(''+e));
  pa.on('console', m => { if (m.type()==='error') errsA.push('console:'+m.text()); });
  await pa.setRequestInterception(true);
  pa.on('request', req => { if (/fund\.eastmoney\.com/.test(req.url())) req.abort(); else req.continue(); });
  await pa.setContent(HTML, { waitUntil: 'networkidle0', timeout: 60000 }).catch(()=>{});
  await failPath(pa);
  await new Promise(r => setTimeout(r, 9500)); // 等 8s 超时 + fundFail 接管
  const a = await pa.evaluate(() => ({
    visible: getComputedStyle(document.getElementById('marketFundDetail')).display !== 'none',
    stat: document.getElementById('mFStat').textContent,
    hint: document.getElementById('mFHint').innerHTML,
  }));
  await pa.close();

  // ===== 场景B：不拦截（本机东财可达，应画真实净值）=====
  const pb = await browser.newPage();
  const errsB = [];
  pb.on('pageerror', e => errsB.push(''+e));
  pb.on('console', m => { if (m.type()==='error') errsB.push('console:'+m.text()); });
  await pb.setContent(HTML, { waitUntil: 'networkidle0', timeout: 60000 }).catch(()=>{});
  await failPath(pb);
  await new Promise(r => setTimeout(r, 11000)); // 等东财真实返回
  const b = await pb.evaluate(() => ({
    stat: document.getElementById('mFStat').textContent,
    hint: document.getElementById('mFHint').innerHTML,
    fail: !!(state.fundFail && state.fundFail['000001']),
    hasNav: !!(state.fundData['000001'] && state.fundData['000001'].nav && state.fundData['000001'].nav.length),
  }));
  await pb.close();

  await browser.close();

  console.log('=== 场景A（沙箱/预览：东方财富不可达）===');
  console.log('详情区可见 :', a.visible);
  console.log('mFStat     :', a.stat);
  console.log('mFHint     :', a.hint.replace(/<[^>]+>/g,''));
  console.log('JS errors  :', errsA.length, errsA.slice(0,3));
  console.log('=== 场景B（本机：东方财富可达）===');
  console.log('mFStat     :', b.stat);
  console.log('fundFail   :', b.fail, '| hasNav:', b.hasNav);
  console.log('JS errors  :', errsB.length, errsB.slice(0,3));

  const realErrA = errsA.filter(e => !/net::ERR_FAILED|Failed to load resource/.test(e)); // 过滤测试主动拦截的东财请求产生的资源错误
  const realErrB = errsB.filter(e => !/net::ERR_FAILED|Failed to load resource/.test(e));
  const okA = a.visible && /不可达/.test(a.stat) && realErrA.length===0;
  const okB = (b.hasNav || !b.fail) && realErrB.length===0; // 可达时应有真实净值或至少未误标失败
  console.log('\nPASS_A(fail-msg):', okA, '| PASS_B(happy):', okB, '| OVERALL:', okA && okB);
  process.exit(okA && okB ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
