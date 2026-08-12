// 验证 cb-equity-switch.html 的信号逻辑（jsdom 实跑 + mock 腾讯接口）
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, 'cb-equity-switch.html'), 'utf8');

// 构造某只ETF的假K线：首根(past)价=p0，末根(last)价=p1，中间填充 p0，保证 length>=60
function fakeKL(p0, p1) {
  const arr = [];
  let d = new Date('2025-01-02');
  // 造 ~110 根，每 5 天一根，覆盖到 2026-08
  for (let i = 0; i < 110; i++) {
    const ds = d.toISOString().slice(0, 10);
    let price = p0;
    if (i === 0) price = p0;
    else if (i === 109) price = p1;
    // 标准腾讯 qfqday 格式：[日期, 开, 收, 高, 低, 量] → 收盘价在 r[2]
    arr.push([ds, price, price, price, price, 1000]);
    d = new Date(d.getTime() + 5 * 86400000);
  }
  return arr;
}

function mocksFor(scenario) {
  // scenario: { cb, nx, sp } = 各标的 末根价（首根均1.00 → 动量=末根-1）
  const map = {
    'sh511380': fakeKL(1.00, scenario.cb),
    'sh513100': fakeKL(1.00, scenario.nx),
    'sh513500': fakeKL(1.00, scenario.sp),
  };
  return (url) => {
    const m = url.match(/param=(sh\d+),/);
    const code = m ? m[1] : 'sh511380';
    const kl = map[code] || map['sh511380'];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: { [code]: { qfqday: kl } } })
    });
  };
}

async function runScenario(name, scenario, expect) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(e.detail ? e.detail.message : e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'file://' + __dirname + '/',
    beforeParse(window) {
      window.fetch = (url) => mocksFor(scenario)(url);
      window.AbortController = global.AbortController;
    }
  });
  const { window } = dom;
  // 等 loadAll 异步完成
  await new Promise(r => setTimeout(r, 400));

  const sigName = window.document.getElementById('sigName').textContent.trim();
  const sigCode = window.document.getElementById('sigCode').textContent.trim();
  const mGrid = window.document.getElementById('mGrid').textContent;
  const status = window.document.getElementById('statusLine').textContent.trim();

  let pass = true;
  const log = [];
  function check(cond, label, got) {
    if (cond) log.push('  ✅ ' + label);
    else { pass = false; log.push('  ❌ ' + label + ' （实际: ' + got + '）'); }
  }
  check(errors.length === 0, '无 jsdomError', errors.join('|'));
  check(sigName.includes(expect.name), '信号名=' + expect.name, sigName);
  check(sigCode.includes(expect.code), '信号代码含' + expect.code, sigCode);
  check(mGrid.includes(expect.cbPct) && mGrid.includes(expect.nxPct) && mGrid.includes(expect.spPct),
        '三只动量显示正确', mGrid.replace(/\s+/g, ' ').slice(0, 120));
  check(status.includes('实时数据'), '状态=实时数据', status);

  console.log('【' + name + '】' + (pass ? '通过' : '失败'));
  log.forEach(l => console.log(l));
  return pass;
}

(async () => {
  // 场景1：纳指最强(+20%) > 可转债(+5%) → 进攻纳指
  const ok1 = await runScenario('进攻场景', { cb: 1.05, nx: 1.20, sp: 1.15 },
    { name: '纳指ETF', code: '513100', cbPct: '+5.00%', nxPct: '+20.00%', spPct: '+15.00%' });
  // 场景2：可转债最强(+20%) > 纳指(+5%)/标普(+3%) → 守底可转债
  const ok2 = await runScenario('守底场景', { cb: 1.20, nx: 1.05, sp: 1.03 },
    { name: '可转债ETF', code: '511380', cbPct: '+20.00%', nxPct: '+5.00%', spPct: '+3.00%' });

  console.log('\n=== 总结: ' + ((ok1 && ok2) ? '全部通过 ✅' : '存在失败 ❌') + ' ===');
  process.exit(ok1 && ok2 ? 0 : 1);
})();
