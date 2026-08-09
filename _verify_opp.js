const puppeteer = require('puppeteer-core');
const path = require('path');
const fileUrl = 'file://' + path.resolve('index.html');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));

  // 进入「机会精选」
  await page.evaluate(() => {
    const nav = [...document.querySelectorAll('.navitem')].find(n => n.dataset.view === 'fund');
    nav && nav.click();
  });
  await new Promise(r => setTimeout(r, 600));

  const hasList = await page.$('#oppList') !== null;
  const hasSort = await page.$('#oppSort') !== null;
  const hasRescan = await page.$('#oppRescan') !== null;

  // 等扫描（最多 ~12s）：出现 .opp-row 或 任何非加载文本
  let rowsCount = 0, scanState = '';
  for (let i = 0; i < 24; i++) {
    const st = await page.evaluate(() => {
      const box = document.querySelector('#oppList');
      if (!box) return { rows: 0, txt: 'no-box' };
      const rows = box.querySelectorAll('.opp-row').length;
      return { rows, txt: rows ? 'rows' : (box.textContent || '').slice(0, 30) };
    });
    rowsCount = st.rows; scanState = st.txt;
    if (rowsCount > 0) break;
    await new Promise(r => setTimeout(r, 500));
  }

  let detailOk = false, cards = 0, canvasNonBlank = false, reasonOk = false;
  if (rowsCount > 0) {
    // 点第一行
    await page.evaluate(() => document.querySelector('.opp-row').click());
    await new Promise(r => setTimeout(r, 700));
    const det = await page.evaluate(() => {
      const d = document.querySelector('#oppDetail');
      const visible = d && d.style.display !== 'none';
      const cv = document.querySelector('#oppKline');
      let nonBlank = false;
      try { const ctx = cv.getContext('2d'); const px = ctx.getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < px.length; i += 4) { if (px[i] !== 0) { nonBlank = true; break; } } } catch (e) {}
      return {
        visible: visible,
        cards: document.querySelectorAll('#oppCards .opp-card').length,
        reason: (document.querySelector('.opp-reason') || {}).textContent || '',
        nonBlank
      };
    });
    detailOk = det.visible;
    cards = det.cards;
    canvasNonBlank = det.nonBlank;
    reasonOk = det.reason.length > 3;
  }

  console.log('hasList:', hasList, '| hasSort:', hasSort, '| hasRescan:', hasRescan);
  console.log('scanState:', scanState, '| rowsCount:', rowsCount);
  console.log('detailOk:', detailOk, '| cards:', cards, '| canvasNonBlank:', canvasNonBlank, '| reasonOk:', reasonOk);
  console.log('JS errors:', errors.length, errors.slice(0, 8));

  const ok = hasList && hasSort && hasRescan && errors.length === 0 && rowsCount > 0 && detailOk && cards === 6 && canvasNonBlank && reasonOk;
  console.log(ok ? 'VERIFY_PASS' : 'VERIFY_FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
